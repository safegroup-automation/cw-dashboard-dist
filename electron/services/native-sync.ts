/**
 * Native Sync Service
 *
 * Fetches ATOM feeds using Electron's session.fetch (supports Windows Auth/NTLM)
 * and syncs data to SQLite using better-sqlite3.
 *
 * This replaces the PowerShell-based sync for better portability.
 */

import { session } from 'electron';
import { parseStringPromise } from 'xml2js';
import { getDatabase } from '../database/connection';
import { ProjectRow, OpportunityRow, ServiceTicketRow } from '../database/schema';
import { applyDynamicDates, createDetailFeedUrl, injectLocationFilter } from './atomsvc-parser';
import { getDateLookbackDays, isAdaptiveSyncEnabled, getSyncLocations } from './settings';
import { getDetailFeed } from './feeds';

export interface SyncResult {
  success: boolean;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  removed: number;
  error?: string;
}

interface AtomEntry {
  [key: string]: string;
}

/**
 * Fetch ATOM feed using Electron's session.fetch (supports Windows Integrated Auth/NTLM)
 */
export async function fetchAtomFeed(url: string, signal?: AbortSignal): Promise<string> {
  console.log(`[NativeSync] Fetching URL (length: ${url.length}):`);
  console.log(`[NativeSync] URL: ${url.substring(0, 500)}${url.length > 500 ? '...' : ''}`);

  try {
    // Use session.defaultSession.fetch which integrates with NTLM credentials
    const response = await session.defaultSession.fetch(url, {
      method: 'GET',
      credentials: 'include', // Include Windows credentials for NTLM
      signal, // Pass abort signal for cancellation
    });

    console.log(`[NativeSync] Response status: ${response.status}`);
    console.log(`[NativeSync] Response headers:`, Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[NativeSync] Full error response (${errorText.length} bytes):`);
      console.error(errorText);

      // Try to extract meaningful error from SSRS HTML response
      const errorMatch = errorText.match(/<div[^>]*class="[^"]*rsDetailedMessageDiv[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                         errorText.match(/<span[^>]*class="[^"]*rsErrorMessage[^"]*"[^>]*>([\s\S]*?)<\/span>/i) ||
                         errorText.match(/<b>Exception Details:<\/b>([\s\S]*?)<br\s*\/?>/i) ||
                         errorText.match(/<p>(rsProcessingAborted|rsErrorExecutingCommand|rsReportNotReady)[\s\S]*?<\/p>/i);

      let extractedError = errorMatch ? errorMatch[1].replace(/<[^>]*>/g, '').trim() : null;

      // If regex extraction failed, strip all HTML tags and show the text content
      if (!extractedError) {
        const textContent = errorText.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        extractedError = textContent.substring(0, 1000) || null;
      }

      throw new Error(`HTTP ${response.status}: ${extractedError || errorText.substring(0, 1000)}`);
    }

    const responseData = await response.text();
    console.log(`[NativeSync] Received ${responseData.length} bytes`);
    return responseData;
  } catch (error) {
    console.error(`[NativeSync] Request error:`, error);
    throw error;
  }
}

/**
 * Parse ATOM feed XML into array of entries
 */
export async function parseAtomFeed(xmlContent: string): Promise<AtomEntry[]> {
  // Strip BOM and clean XML
  const cleanedXml = xmlContent
    .replace(/^\uFEFF/, '')
    .replace(/^\uFFFE/, '')
    .trim();

  const result = await parseStringPromise(cleanedXml, {
    explicitArray: false,
    ignoreAttrs: false,
    tagNameProcessors: [(name) => name.replace(/^[a-z]:/, '')], // Remove namespace prefixes
  });

  const entries: AtomEntry[] = [];

  // Navigate to entries - handle both array and single entry cases
  const feed = result.feed;
  if (!feed?.entry) {
    console.log('[NativeSync] No entries found in feed');
    return entries;
  }

  const entryList = Array.isArray(feed.entry) ? feed.entry : [feed.entry];

  for (const entry of entryList) {
    // Extract properties from content/properties
    const props = entry.content?.properties;
    if (!props) continue;

    const record: AtomEntry = {};

    // Flatten all properties - ensure all values are strings
    // xml2js creates objects like { $: {attrs}, _: "text" } for elements with attributes
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined) {
        record[key] = '';
      } else if (Array.isArray(value)) {
        // Handle arrays (xml2js creates these for repeated elements)
        if (value.length === 0) {
          record[key] = '';
        } else {
          // Extract text from first element
          const first = value[0];
          if (typeof first === 'string') {
            record[key] = first;
          } else if (typeof first === 'number' || typeof first === 'boolean') {
            record[key] = String(first);
          } else if (first && typeof first === 'object') {
            const text = first._;
            if (typeof text === 'string') {
              record[key] = text;
            } else if (typeof text === 'number' || typeof text === 'boolean') {
              record[key] = String(text);
            } else {
              record[key] = JSON.stringify(first);
            }
          } else {
            record[key] = JSON.stringify(value);
          }
        }
      } else if (typeof value === 'object') {
        // Handle complex value with _ for text content
        const text = (value as Record<string, unknown>)._;
        if (typeof text === 'string') {
          record[key] = text;
        } else if (typeof text === 'number' || typeof text === 'boolean') {
          record[key] = String(text);
        } else if (text !== undefined) {
          // text exists but is an object - stringify it
          record[key] = JSON.stringify(text);
        } else {
          // No text content - stringify the whole object
          record[key] = JSON.stringify(value);
        }
      } else if (typeof value === 'string') {
        record[key] = value;
      } else {
        // number, boolean, etc.
        record[key] = String(value);
      }
    }

    entries.push(record);
  }

  console.log(`[NativeSync] Parsed ${entries.length} entries from feed`);
  return entries;
}

/**
 * Fetch and parse project detail for a single project
 * Returns ALL fields from the detail feed for storage
 */
// Tablixes to fetch for project detail data - each contains different sections from the SSRS report
const DETAIL_TABLIXES = [
  'Tablix1',   // Overview: Company, Name, Status, End_Date
  'Tablix2',   // Financial Summary: Quoted, Estimated_Cost, Actual_Cost, Billable, Invoiced, WIP, CIA
  'Tablix3',   // Financial Metrics (EVM): Total_Budget, Pct_Complete, PV, EV, AC, SV, SPI, CV, CPI, EAC, ETC, VAC, TCPI
  'Tablix4',   // Hours Summary: Estimated_Hours, Actual_Hours, Hours_Remaining, Pct_Used, Avg_Hr_Cost
  'Tablix5',   // Cost Summary: Estimated_Costs, Actual_Cost, Pct_Used
  'Tablix7',   // Products: Received, PO_Number, Item_Id, Quantity, Unit_Cost, Total_Cost, etc.
  'Tablix8',   // Time Entries (first row has totals): Total hours, Total labour cost
  'Tablix9',   // Expense: Status, Expense_Type, Date_Expense, Note, Expense_Cost, Billable_Amt
  'Tablix10',  // H/W + Expenses (first row has totals): Total cost
  'Tablix11',  // Invoices: Date_Invoice, Invoice_Number, Invoice_Amount, Due_Date, Paid_Flag
  'Tablix15',  // Hours Summary (alternate): Hours_Budget, Hours_Actual, Hours_Remaining, %Used
  'Tablix16',  // Hours by Role: Work_Role, Time
];

export async function fetchProjectDetail(
  detailFeedUrl: string,
  projectId: string
): Promise<{ allFields: Record<string, unknown>; status?: string } | null> {
  try {
    console.log(`[NativeSync] Fetching detail for project ${projectId} from ${DETAIL_TABLIXES.length} tablixes`);

    const allFields: Record<string, unknown> = {};
    let foundStatus: string | undefined;
    let tablixesWithData = 0;

    // Fetch each tablix and merge the data
    for (const tablix of DETAIL_TABLIXES) {
      try {
        // Create URL for this specific tablix
        const url = createDetailFeedUrlWithTablix(detailFeedUrl, projectId, tablix);

        // Fetch the tablix
        const xmlContent = await fetchAtomFeed(url);
        const entries = await parseAtomFeed(xmlContent);

        if (entries.length > 0) {
          tablixesWithData++;
          console.log(`[NativeSync] ${tablix}: ${entries.length} entries`);

          // Hours tablixes (Tablix4, Tablix15) may have multiple rows (one per phase/WBS).
          // Sum the hours fields across all rows to get project totals.
          const hoursFieldNames = ['Hours_Budget', 'HoursBudget', 'Hours_Actual', 'HoursActual',
            'Estimated_Hours', 'EstimatedHours', 'Actual_Hours', 'ActualHours',
            'Hours_Remaining', 'HoursRemaining', 'Remaining_Hours', 'RemainingHours'];
          const isHoursTablix = tablix === 'Tablix4' || tablix === 'Tablix15';

          if (isHoursTablix && entries.length > 1) {
            // Sum hours across all rows (phases/WBS codes)
            const hoursSums: Record<string, number> = {};
            for (const row of entries) {
              for (const [key, value] of Object.entries(row)) {
                if (hoursFieldNames.includes(key) && value) {
                  const num = parseFloat(String(value).replace(/[$,€£]/g, '').trim());
                  if (!isNaN(num)) {
                    hoursSums[key] = (hoursSums[key] || 0) + num;
                  }
                }
              }
            }
            console.log(`[NativeSync] ${tablix}: Summed hours across ${entries.length} phases:`, hoursSums);

            // Store summed hours as the values
            for (const [key, sum] of Object.entries(hoursSums)) {
              const sumStr = sum.toFixed(2);
              if (hoursFieldNames.includes(key)) {
                allFields[key] = sumStr;
              }
              allFields[`${tablix}_${key}`] = sumStr;
            }
          }

          // Use the first row for non-hours fields (or all fields if single row)
          const entry = entries[0];

          // Prefix fields with tablix name to avoid conflicts (except common fields)
          for (const [key, value] of Object.entries(entry)) {
            if (value !== null && value !== undefined && value !== '') {
              const cleanValue = typeof value === 'string' ? cleanHtmlEntities(value) : value;

              // Store both prefixed and unprefixed for common fields
              // Skip hours fields if we already summed them above
              const alreadySummed = isHoursTablix && entries.length > 1 && hoursFieldNames.includes(key);
              if (!alreadySummed && ['Company', 'Name', 'Status', 'End_Date', 'Quoted', 'Estimated_Cost', 'Actual_Cost',
                   'Billable', 'Invoiced', 'WIP21', 'CIA_Remaining', 'Hours_Budget', 'Hours_Actual',
                   'Estimated_Hours', 'Actual_Hours', 'Hours_Remaining',
                   'Work_Role', 'ReportTitle'].includes(key)) {
                allFields[key] = cleanValue;
              }
              // Always store with tablix prefix for traceability (skip if already summed)
              if (!alreadySummed) {
                allFields[`${tablix}_${key}`] = cleanValue;
              }
            }
          }

          // Store entry count for multi-row tablixes
          if (entries.length > 1) {
            allFields[`${tablix}_RowCount`] = entries.length;
          }

          // Look for Status field
          if (!foundStatus) {
            const status = entry.Status || entry.status || entry.ProjectStatus || entry.Project_Status;
            if (status) {
              foundStatus = cleanHtmlEntities(status);
            }
          }
        }
      } catch (tablixError) {
        // Some tablixes may not exist in all reports - that's OK
        console.log(`[NativeSync] ${tablix}: skipped (error or empty)`);
      }
    }

    if (tablixesWithData === 0) {
      console.log(`[NativeSync] No detail data found for project ${projectId}`);
      return null;
    }

    console.log(`[NativeSync] Found ${Object.keys(allFields).length} fields from ${tablixesWithData} tablixes for project ${projectId}`);
    if (foundStatus) {
      console.log(`[NativeSync] Status: "${foundStatus}"`);
    }

    return {
      allFields,
      status: foundStatus,
    };
  } catch (error) {
    console.error(`[NativeSync] Error fetching detail for project ${projectId}:`, error);
    return null;
  }
}

/**
 * Create detail feed URL with a specific tablix
 */
function createDetailFeedUrlWithTablix(detailFeedUrl: string, projectId: string, tablix: string): string {
  // First create the base URL with project ID substituted
  let url = createDetailFeedUrl(detailFeedUrl, projectId);

  // Now replace the ItemPath with our specific tablix
  // The createDetailFeedUrl function sets ItemPath=Tablix1, we need to change it
  url = url.replace(/rc%3AItemPath=[^&]+/i, `rc%3AItemPath=${tablix}`);
  url = url.replace(/rc:ItemPath=[^&]+/i, `rc:ItemPath=${tablix}`);

  return url;
}

/**
 * Sync projects from ATOM feed to SQLite
 * @param feedUrl The ATOM feed URL
 * @param syncHistoryId The sync history record ID
 * @param feedId Optional feed ID to look up linked detail feed for adaptive sync
 */
export async function syncProjects(
  feedUrl: string,
  syncHistoryId: number,
  feedId?: number,
  signal?: AbortSignal
): Promise<SyncResult> {
  const db = getDatabase();

  try {
    // Apply dynamic dates to URL before fetching
    const lookbackDays = getDateLookbackDays();
    let dynamicUrl = applyDynamicDates(feedUrl, lookbackDays);

    // Apply location filter if configured
    const syncLocations = getSyncLocations();
    if (syncLocations.length > 0) {
      console.log(`[NativeSync] Applying location filter: ${syncLocations.join(', ')}`);
      dynamicUrl = injectLocationFilter(dynamicUrl, syncLocations);
    }

    // Check for linked detail feed for adaptive sync
    let detailFeedUrl: string | null = null;
    const adaptiveSyncEnabled = isAdaptiveSyncEnabled();

    console.log(`[NativeSync] feedId=${feedId}, adaptiveSyncEnabled=${adaptiveSyncEnabled}`);

    if (feedId && adaptiveSyncEnabled) {
      const detailFeed = getDetailFeed(feedId);
      console.log(`[NativeSync] getDetailFeed result:`, detailFeed ? { id: detailFeed.id, name: detailFeed.name, isActive: detailFeed.isActive, feedUrl: detailFeed.feedUrl?.substring(0, 50) } : null);
      if (detailFeed && detailFeed.isActive) {
        detailFeedUrl = detailFeed.feedUrl;
        console.log(`[NativeSync] Adaptive sync enabled - will fetch details from: ${detailFeed.name}`);
      } else if (detailFeed && !detailFeed.isActive) {
        console.log(`[NativeSync] Detail feed found but not active`);
      } else {
        console.log(`[NativeSync] No detail feed linked to this projects feed`);
      }
    } else {
      console.log(`[NativeSync] Adaptive sync skipped: feedId=${feedId}, enabled=${adaptiveSyncEnabled}`);
    }

    // Fetch the feed
    const xmlContent = await fetchAtomFeed(dynamicUrl, signal);

    // Parse entries
    const entries = await parseAtomFeed(xmlContent);

    if (entries.length === 0) {
      return {
        success: true,
        total: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        removed: 0,
      };
    }

    // Log sample entry for debugging
    console.log('[NativeSync] Sample entry keys:', Object.keys(entries[0]));

    let created = 0;
    let updated = 0;
    let unchanged = 0;

    const insertStmt = db.prepare(`
      INSERT INTO projects (external_id, client_name, project_name, budget, spent, hours_estimate, hours_actual, hours_remaining, status, is_active, notes, raw_data, detail_raw_data, updated_at)
      VALUES (@external_id, @client_name, @project_name, @budget, @spent, @hours_estimate, @hours_actual, @hours_remaining, @status, @is_active, @notes, @raw_data, @detail_raw_data, datetime('now'))
    `);

    const updateStmt = db.prepare(`
      UPDATE projects SET
        client_name = @client_name,
        project_name = @project_name,
        budget = @budget,
        spent = @spent,
        hours_estimate = @hours_estimate,
        hours_actual = @hours_actual,
        hours_remaining = @hours_remaining,
        status = @status,
        is_active = @is_active,
        notes = @notes,
        raw_data = @raw_data,
        detail_raw_data = @detail_raw_data,
        updated_at = datetime('now')
      WHERE external_id = @external_id
    `);

    const selectStmt = db.prepare('SELECT * FROM projects WHERE external_id = ?');

    const insertChangeStmt = db.prepare(`
      INSERT INTO sync_changes (sync_history_id, entity_type, entity_id, external_id, change_type, field_name, old_value, new_value)
      VALUES (?, 'PROJECT', ?, ?, ?, ?, ?, ?)
    `);

    // Process each entry
    for (const entry of entries) {
      try {
        let mapped = mapProjectEntry(entry);

        // Adaptive sync: fetch detail data if available
        if (detailFeedUrl && mapped.external_id) {
          try {
            const detail = await fetchProjectDetail(detailFeedUrl, mapped.external_id as string);
            if (detail) {
              // Store ALL detail fields as JSON
              mapped.detail_raw_data = JSON.stringify(detail.allFields);

              // Use status from detail to update main status field
              if (detail.status) {
                mapped.status = detail.status;
                // Re-evaluate isActive based on new status
                // Be specific: "Completed - Ready to Invoice" is still active
                const lowerStatus = detail.status.toLowerCase();
                const isExactlyCompleted = lowerStatus === 'completed' ||
                                            lowerStatus === '6. completed' ||
                                            (lowerStatus.includes('completed') && !lowerStatus.includes('ready to invoice'));
                const isInactive = isExactlyCompleted || lowerStatus.includes('cancelled') ||
                                   lowerStatus.includes('closed');
                mapped.is_active = isInactive ? 0 : 1;
              }

              // Extract hours from detail feed (Tablix15 has Hours_Budget, Hours_Actual)
              const fields = detail.allFields as Record<string, string | number | undefined>;
              // Helper to convert value to string for parseNumber
              const toStr = (v: string | number | undefined): string | undefined =>
                v === undefined ? undefined : String(v);
              const detailHoursEstimate = parseNumber(toStr(fields.Hours_Budget ?? fields.HoursBudget ?? fields.Estimated_Hours ?? fields.EstimatedHours));
              const detailHoursActual = parseNumber(toStr(fields.Hours_Actual ?? fields.HoursActual ?? fields.Actual_Hours ?? fields.ActualHours));
              const detailHoursRemaining = parseNumber(toStr(fields.Textbox319 ?? fields.Hours_Remaining ?? fields.HoursRemaining ?? fields.Remaining_Hours ?? fields.RemainingHours));

              // Use detail hours if available (they're more accurate than budget-based calculation)
              if (detailHoursEstimate !== null) {
                mapped.hours_estimate = detailHoursEstimate;
                console.log(`[NativeSync] Project ${mapped.external_id}: Using detail Hours_Budget=${detailHoursEstimate}`);
              }
              if (detailHoursActual !== null) {
                mapped.hours_actual = detailHoursActual;
              }
              if (detailHoursRemaining !== null) {
                mapped.hours_remaining = detailHoursRemaining;
              } else if (detailHoursEstimate !== null && detailHoursActual !== null) {
                // Calculate remaining if not provided
                mapped.hours_remaining = Math.max(0, detailHoursEstimate - detailHoursActual);
              }

              // Log all hours-related fields from detail for debugging
              const hoursFields = Object.entries(detail.allFields)
                .filter(([k]) => {
                  const lk = k.toLowerCase();
                  return lk.includes('hour') || lk.includes('hrs') || lk.includes('estimated') || lk.includes('actual') || lk.includes('budget') || lk.includes('remaining');
                });
              console.log(`[NativeSync] Project ${mapped.external_id}: Status="${mapped.status}", isActive=${mapped.is_active}, hours=${mapped.hours_actual}/${mapped.hours_estimate}, detailFields=${Object.keys(detail.allFields).length}, hoursFields=${JSON.stringify(Object.fromEntries(hoursFields))}`);
            }
          } catch (detailError) {
            console.error(`[NativeSync] Failed to fetch detail for ${mapped.external_id}:`, detailError);
            // Continue with summary data only
          }
        }

        const existing = selectStmt.get(mapped.external_id) as ProjectRow | undefined;

        if (existing) {
          // Check for changes
          const changes = compareFields(existing, mapped, [
            'client_name',
            'project_name',
            'budget',
            'spent',
            'hours_estimate',
            'hours_actual',
            'hours_remaining',
            'status',
            'is_active',
            'notes',
            'detail_raw_data',
          ]);

          if (changes.length > 0) {
            updateStmt.run(mapped);

            // Record changes
            for (const change of changes) {
              insertChangeStmt.run(
                syncHistoryId,
                existing.id,
                mapped.external_id,
                'UPDATED',
                change.field,
                change.oldValue,
                change.newValue
              );
            }

            updated++;
          } else {
            unchanged++;
          }
        } else {
          // Insert new record
          const result = insertStmt.run(mapped);

          // Record creation
          insertChangeStmt.run(
            syncHistoryId,
            result.lastInsertRowid,
            mapped.external_id,
            'CREATED',
            null,
            null,
            null
          );

          created++;
        }
      } catch (err) {
        console.error(`[NativeSync] Error processing project entry:`, err);
      }
    }

    return {
      success: true,
      total: entries.length,
      created,
      updated,
      unchanged,
      removed: 0,
    };
  } catch (error) {
    console.error('[NativeSync] Project sync failed:', error);
    return {
      success: false,
      total: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      removed: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Sync opportunities from ATOM feed to SQLite
 */
export async function syncOpportunities(
  feedUrl: string,
  syncHistoryId: number,
  signal?: AbortSignal
): Promise<SyncResult> {
  const db = getDatabase();

  try {
    // Apply dynamic dates to URL before fetching
    const lookbackDays = getDateLookbackDays();
    let dynamicUrl = applyDynamicDates(feedUrl, lookbackDays);

    // Apply location filter if configured
    const syncLocations = getSyncLocations();
    if (syncLocations.length > 0) {
      console.log(`[NativeSync] Applying location filter to opportunities: ${syncLocations.join(', ')}`);
      dynamicUrl = injectLocationFilter(dynamicUrl, syncLocations);
    }

    // Auto-migrate Tablix3 → Tablix4 in the feed URL (Tablix3 returns summary data, Tablix4 has detail rows)
    if (dynamicUrl.includes('Tablix3') && dynamicUrl.includes('Opportunity')) {
      console.log('[NativeSync] Migrating opportunity feed URL from Tablix3 to Tablix4');
      dynamicUrl = dynamicUrl.replace('Tablix3', 'Tablix4');
    }

    console.log(`[NativeSync] Opportunity feed URL (first 500 chars): ${dynamicUrl.substring(0, 500)}`);

    // Fetch the feed
    const xmlContent = await fetchAtomFeed(dynamicUrl, signal);

    console.log(`[NativeSync] Opportunity feed XML size: ${xmlContent.length} bytes`);

    // Parse entries
    const entries = await parseAtomFeed(xmlContent);

    if (entries.length === 0) {
      console.warn('[NativeSync] Opportunity feed returned 0 entries!');
      return {
        success: true,
        total: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        removed: 0,
      };
    }

    // Log sample entry for debugging
    console.log('[NativeSync] Sample opportunity entry keys:', Object.keys(entries[0]));
    // Log first entry's ID-related fields to help debug mapping issues
    const sampleEntry = entries[0];
    const idFields = Object.entries(sampleEntry)
      .filter(([key]) => key.toLowerCase().includes('id') || key.toLowerCase().includes('rec'))
      .slice(0, 10);
    console.log('[NativeSync] Sample opportunity ID fields:', JSON.stringify(Object.fromEntries(idFields)));
    // Log status/stage related fields for debugging
    const statusFields = Object.entries(sampleEntry)
      .filter(([key]) => key.toLowerCase().includes('status') || key.toLowerCase().includes('stage') || key.toLowerCase().includes('sales'))
      .slice(0, 15);
    console.log('[NativeSync] Sample opportunity status/stage fields:', JSON.stringify(Object.fromEntries(statusFields)));

    console.log(`[NativeSync] Opportunity feed returned ${entries.length} entries`);

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let errors = 0;

    const insertStmt = db.prepare(`
      INSERT INTO opportunities (external_id, opportunity_name, company_name, sales_rep, stage, status, expected_revenue, close_date, probability, notes, raw_data, updated_at)
      VALUES (@external_id, @opportunity_name, @company_name, @sales_rep, @stage, @status, @expected_revenue, @close_date, @probability, @notes, @raw_data, datetime('now'))
    `);

    const updateStmt = db.prepare(`
      UPDATE opportunities SET
        opportunity_name = @opportunity_name,
        company_name = @company_name,
        sales_rep = @sales_rep,
        stage = @stage,
        status = @status,
        expected_revenue = @expected_revenue,
        close_date = @close_date,
        probability = @probability,
        notes = @notes,
        raw_data = @raw_data,
        updated_at = datetime('now')
      WHERE external_id = @external_id
    `);

    const selectStmt = db.prepare('SELECT * FROM opportunities WHERE external_id = ?');

    const insertChangeStmt = db.prepare(`
      INSERT INTO sync_changes (sync_history_id, entity_type, entity_id, external_id, change_type, field_name, old_value, new_value)
      VALUES (?, 'OPPORTUNITY', ?, ?, ?, ?, ?, ?)
    `);

    // Process each entry
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      try {
        const mapped = mapOpportunityEntry(entry, i);

        const existing = selectStmt.get(mapped.external_id) as OpportunityRow | undefined;

        if (existing) {
          // Check for changes (include raw_data to fix corrupted JSON from older versions)
          const changes = compareFields(existing, mapped, [
            'opportunity_name',
            'company_name',
            'sales_rep',
            'stage',
            'status',
            'expected_revenue',
            'close_date',
            'probability',
            'notes',
            'raw_data',
          ]);

          if (changes.length > 0) {
            updateStmt.run(mapped);

            // Record changes
            for (const change of changes) {
              insertChangeStmt.run(
                syncHistoryId,
                existing.id,
                mapped.external_id,
                'UPDATED',
                change.field,
                change.oldValue,
                change.newValue
              );
            }

            updated++;
          } else {
            unchanged++;
          }
        } else {
          // Insert new record
          const result = insertStmt.run(mapped);

          // Record creation
          insertChangeStmt.run(
            syncHistoryId,
            result.lastInsertRowid,
            mapped.external_id,
            'CREATED',
            null,
            null,
            null
          );

          created++;
        }
      } catch (err) {
        errors++;
        const mapped2 = mapOpportunityEntry(entry, i);
        console.error(`[NativeSync] Error processing opportunity entry ${i} (external_id=${mapped2.external_id}):`, err);
      }
    }

    // Remove stale opportunities that no longer appear in the feed
    const feedExternalIds = new Set<string>();
    for (const entry of entries) {
      const mapped = mapOpportunityEntry(entry, 0);
      if (mapped.external_id) {
        feedExternalIds.add(String(mapped.external_id));
      }
    }

    let removed = 0;
    const allLocalRows = db.prepare('SELECT id, external_id, opportunity_name FROM opportunities').all() as { id: number; external_id: string; opportunity_name: string | null }[];
    const deleteStmt = db.prepare('DELETE FROM opportunities WHERE id = ?');

    for (const row of allLocalRows) {
      if (!feedExternalIds.has(row.external_id)) {
        deleteStmt.run(row.id);

        // Record removal in change audit
        insertChangeStmt.run(
          syncHistoryId,
          row.id,
          row.external_id,
          'REMOVED',
          null,
          row.opportunity_name,
          null
        );

        console.log(`[NativeSync] Removed stale opportunity: ${row.opportunity_name} (external_id=${row.external_id})`);
        removed++;
      }
    }

    console.log(`[NativeSync] Opportunity sync results: ${entries.length} total, ${created} created, ${updated} updated, ${unchanged} unchanged, ${removed} removed, ${errors} errors`);

    return {
      success: true,
      total: entries.length,
      created,
      updated,
      unchanged,
      removed,
    };
  } catch (error) {
    console.error('[NativeSync] Opportunity sync failed:', error);
    return {
      success: false,
      total: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      removed: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Sync service tickets from ATOM feed to SQLite
 */
export async function syncServiceTickets(
  feedUrl: string,
  syncHistoryId: number,
  signal?: AbortSignal
): Promise<SyncResult> {
  const db = getDatabase();

  try {
    // Apply dynamic dates to URL before fetching
    const lookbackDays = getDateLookbackDays();
    let dynamicUrl = applyDynamicDates(feedUrl, lookbackDays);

    // Apply location filter if configured
    const syncLocations = getSyncLocations();
    if (syncLocations.length > 0) {
      console.log(`[NativeSync] Applying location filter to service tickets: ${syncLocations.join(', ')}`);
      dynamicUrl = injectLocationFilter(dynamicUrl, syncLocations);
    }

    // Fetch the feed
    const xmlContent = await fetchAtomFeed(dynamicUrl, signal);

    // Parse entries
    const entries = await parseAtomFeed(xmlContent);

    if (entries.length === 0) {
      return {
        success: true,
        total: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        removed: 0,
      };
    }

    // Log sample entry for debugging
    console.log('[NativeSync] Sample service ticket entry keys:', Object.keys(entries[0]));

    let created = 0;
    let updated = 0;
    let unchanged = 0;

    const insertStmt = db.prepare(`
      INSERT INTO service_tickets (external_id, summary, status, priority, assigned_to, company_name, board_name, created_date, last_updated, due_date, hours_estimate, hours_actual, hours_remaining, budget, notes, raw_data, updated_at)
      VALUES (@external_id, @summary, @status, @priority, @assigned_to, @company_name, @board_name, @created_date, @last_updated, @due_date, @hours_estimate, @hours_actual, @hours_remaining, @budget, @notes, @raw_data, datetime('now'))
    `);

    const updateStmt = db.prepare(`
      UPDATE service_tickets SET
        summary = @summary,
        status = @status,
        priority = @priority,
        assigned_to = @assigned_to,
        company_name = @company_name,
        board_name = @board_name,
        created_date = @created_date,
        last_updated = @last_updated,
        due_date = @due_date,
        hours_estimate = @hours_estimate,
        hours_actual = @hours_actual,
        hours_remaining = @hours_remaining,
        budget = @budget,
        notes = @notes,
        raw_data = @raw_data,
        updated_at = datetime('now')
      WHERE external_id = @external_id
    `);

    const selectStmt = db.prepare('SELECT * FROM service_tickets WHERE external_id = ?');

    const insertChangeStmt = db.prepare(`
      INSERT INTO sync_changes (sync_history_id, entity_type, entity_id, external_id, change_type, field_name, old_value, new_value)
      VALUES (?, 'SERVICE_TICKET', ?, ?, ?, ?, ?, ?)
    `);

    // Process each entry
    for (const entry of entries) {
      try {
        const mapped = mapServiceTicketEntry(entry);

        const existing = selectStmt.get(mapped.external_id) as ServiceTicketRow | undefined;

        if (existing) {
          // Check for changes (include raw_data to fix corrupted JSON from older versions)
          const changes = compareFields(existing, mapped, [
            'summary',
            'status',
            'priority',
            'assigned_to',
            'company_name',
            'board_name',
            'due_date',
            'hours_estimate',
            'hours_actual',
            'hours_remaining',
            'budget',
            'notes',
            'raw_data',
          ]);

          if (changes.length > 0) {
            updateStmt.run(mapped);

            // Record changes
            for (const change of changes) {
              insertChangeStmt.run(
                syncHistoryId,
                existing.id,
                mapped.external_id,
                'UPDATED',
                change.field,
                change.oldValue,
                change.newValue
              );
            }

            updated++;
          } else {
            unchanged++;
          }
        } else {
          // Insert new record
          const result = insertStmt.run(mapped);

          // Record creation
          insertChangeStmt.run(
            syncHistoryId,
            result.lastInsertRowid,
            mapped.external_id,
            'CREATED',
            null,
            null,
            null
          );

          created++;
        }
      } catch (err) {
        console.error(`[NativeSync] Error processing service ticket entry:`, err);
      }
    }

    return {
      success: true,
      total: entries.length,
      created,
      updated,
      unchanged,
      removed: 0,
    };
  } catch (error) {
    console.error('[NativeSync] Service ticket sync failed:', error);
    return {
      success: false,
      total: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      removed: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Map ATOM entry to project record
 * Field mappings based on SSRS Project Manager Summary report
 */
function mapProjectEntry(entry: AtomEntry): Record<string, unknown> {
  // Try common SSRS field names - these may vary based on your report
  const externalId = entry.ID || entry.ProjectID || entry.Project_ID || entry.Id || '';
  const projectName = cleanHtmlEntities(entry.Name1 || entry.ProjectName || entry.Project_Name || entry.Name || '');
  const clientName = cleanHtmlEntities(entry.Company2 || entry.CompanyName || entry.Company || entry.Client || '');
  // Project Manager field often contains "Project Manager: Name" - strip the prefix
  let projectManager = cleanHtmlEntities(entry.Project_Manager3 || entry.ProjectManager || entry.PM || '');
  if (projectManager.toLowerCase().startsWith('project manager:')) {
    projectManager = projectManager.substring('project manager:'.length).trim();
  }

  // Status field - try various field names
  const rawStatus = entry.Status || entry.ProjectStatus || entry.Project_Status ||
                    entry.status_description || entry.StatusName || entry.Status_Name ||
                    entry.Textbox37 || entry.Textbox38 || ''; // Textbox37/38 are common SSRS field names for status
  const status = cleanHtmlEntities(rawStatus);

  // Determine if active based on status
  // Active statuses: "1. New", "2. In Progress", "3. Completed - Ready to Invoice", "4. On-Hold", "5. Retention", "8. Re-Opened"
  // Inactive statuses: "6. Completed", "7. Cancelled"
  // Default to active if status is empty/unknown
  const lowerStatus = status.toLowerCase();
  // Be specific: "Completed - Ready to Invoice" is still active (invoicing work remains)
  // Only mark as inactive if it's specifically "6. Completed" or "cancelled" or "closed"
  const isExactlyCompleted = lowerStatus === 'completed' ||
                              lowerStatus === '6. completed' ||
                              (lowerStatus.includes('completed') && !lowerStatus.includes('ready to invoice'));
  const isInactive = isExactlyCompleted || lowerStatus.includes('cancelled') ||
                     lowerStatus.includes('closed');
  const isActive = !isInactive; // Default to active, only mark inactive for completed/cancelled/closed

  // Financial fields
  const budget = parseNumber(entry.Quoted3 || entry.Budget || entry.QuotedAmount);
  const spent = parseNumber(entry.Actual_Cost || entry.ActualCost || entry.Spent);
  const estimatedCost = parseNumber(entry.Estimated_Cost || entry.EstimatedCost);
  const actualCost = parseNumber(entry.Actual_Cost || entry.ActualCost);

  // Hours fields - try to find actual hours data from the report
  // Try many variations of field names that SSRS might use
  let hoursEstimate = parseNumber(
    entry.Estimated_Hours || entry.Estimated_Hours1 || entry.EstimatedHours ||
    entry.Hours_Budget || entry.HoursBudget || entry.Budget_Hours || entry.BudgetHours ||
    entry.Total_Hours || entry.TotalHours || entry.Hours_Estimate || entry.HoursEstimate ||
    entry.Est_Hours || entry.EstHours || entry.Est_Hrs || entry.EstHrs ||
    entry.Budgeted_Hours || entry.BudgetedHours || entry.Project_Hours || entry.ProjectHours ||
    entry.Scheduled_Hours || entry.ScheduledHours || entry.Planned_Hours || entry.PlannedHours
  );

  // Actual hours used - try various field names
  let hoursActual = parseNumber(
    entry.Actual_Hours || entry.Actual_Hours1 || entry.ActualHours ||
    entry.Hours_Actual || entry.HoursActual || entry.Hours_Used || entry.HoursUsed ||
    entry.Worked_Hours || entry.WorkedHours || entry.Used_Hours || entry.UsedHours ||
    entry.Logged_Hours || entry.LoggedHours || entry.Time_Actual || entry.TimeActual
  );

  // Hours remaining - try to find it directly or calculate it
  let hoursRemaining = parseNumber(
    entry.Hours_Remaining || entry.HoursRemaining || entry.Remaining_Hours || entry.RemainingHours ||
    entry.Hours_Left || entry.HoursLeft || entry.Left_Hours || entry.LeftHours
  );

  // Log hours fields for debugging
  if (externalId === '2399' || !hoursEstimate) {
    console.log(`[NativeSync] Project ${externalId} hours debug:`, {
      hoursEstimate,
      hoursActual,
      hoursRemaining,
      // Log any field that might contain hours
      possibleHoursFields: Object.entries(entry)
        .filter(([k, v]) => {
          const key = k.toLowerCase();
          const val = parseNumber(v);
          return (key.includes('hour') || key.includes('hrs') || key.includes('time')) && val !== null;
        })
        .map(([k, v]) => `${k}=${v}`)
    });
  }

  // NO FALLBACK CALCULATIONS - only use real data from the feed
  // If hours data is not available, it will be null and displayed as N/A in the UI

  // Build notes with WIP and completion percentage
  const wip = entry.WIP1 || entry.WIP || '';
  const pctComplete = entry.Textbox232 || entry.PercentComplete || '0';
  const pctValue = Math.round((parseNumber(pctComplete) || 0) * 100 * 10) / 10;
  const notes = `PM: ${projectManager} | WIP: ${wip} | % Complete: ${pctValue}%`;

  // Store raw data for debugging - use safe stringify to ensure valid JSON
  const rawData = safeStringifyEntry(entry);

  return {
    external_id: externalId,
    client_name: clientName || null,
    project_name: projectName || null,
    budget: budget || null,
    spent: spent || null,
    hours_estimate: hoursEstimate || null,
    hours_actual: hoursActual || null,
    hours_remaining: hoursRemaining || 0,
    status: status || 'Unknown',
    is_active: isActive ? 1 : 0,
    notes,
    raw_data: rawData,
    detail_raw_data: null,
  };
}

/**
 * Map ATOM entry to opportunity record
 * Field mappings based on SSRS Opportunity report
 */
function mapOpportunityEntry(entry: AtomEntry, index: number): Record<string, unknown> {
  // Try common field names - SSRS uses various naming conventions
  // ConnectWise typically uses Opp_RecID as the unique identifier
  // Also try numbered fields like ID1, Opp_RecID1, etc. which SSRS often generates
  let externalId = entry.Opp_RecID2 || // Tablix4 field
                   entry.Opp_RecID || entry.Opp_RecID1 || entry.OppRecID ||
                   entry.Opportunity_RecID || entry.OpportunityRecID ||
                   entry.ID || entry.ID1 || entry.OpportunityID || entry.Opportunity_ID ||
                   entry.Id || entry.Opp_ID || entry.OppID || entry.RecID || entry.RecId ||
                   entry.opp_recid || entry.opportunity_id || // lowercase variants
                   '';

  // Opportunity name - try various field names including numbered SSRS Tablix fields
  const opportunityName = cleanHtmlEntities(
    entry.Opportunity_Name2 ||  // Tablix4 field
    entry.Name || entry.Name1 || entry.Opp_Name || entry.OppName ||
    entry.OpportunityName || entry.Opportunity_Name || entry.Opportunity ||
    entry.Description || entry.Opp_Description || entry.Summary || ''
  );

  // Company name - SSRS Tablix4 uses Company2
  const companyName = cleanHtmlEntities(
    entry.Company2 ||           // Tablix4 field
    entry.Company_Name || entry.Company_Name1 || entry.Company || entry.Company1 ||
    entry.CompanyName || entry.Account || entry.Account_Name || entry.AccountName ||
    entry.Client || entry.ClientName || entry.Customer || ''
  );

  // Log all available fields for the first entry to help debug field mapping
  if (index === 0) {
    console.log('[NativeSync] Opportunity entry fields:', Object.keys(entry).join(', '));
    // Log short values (non-list fields) to help identify correct mappings
    const shortFields = Object.entries(entry)
      .filter(([, v]) => String(v).length < 100)
      .map(([k, v]) => `${k}="${String(v).substring(0, 50)}"`);
    console.log('[NativeSync] Sample values:', shortFields.slice(0, 15).join(', '));
  }

  // If no ID found, generate one from other unique fields
  if (!externalId) {
    if (index === 0) {
      console.warn('[NativeSync] Opportunity missing ID! Will generate fallback.');
    }

    // Generate unique ID from combination of fields
    // Use company + name + any numeric field that might be unique
    const numericFields = Object.entries(entry)
      .filter(([, v]) => /^\d+$/.test(String(v)))
      .map(([, v]) => v);
    const firstNumeric = numericFields[0] || '';

    externalId = `opp_${companyName}_${opportunityName}_${firstNumeric}`.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 100);

    if (index === 0) {
      console.log('[NativeSync] Generated fallback ID:', externalId);
    }
  }

  // Sales rep - various field names used
  // Be careful to check each field individually to avoid picking up a field with all employees
  // IMPORTANT: Sales_Rep_1 (with underscore) is the actual sales rep, Sales_Rep is a list of all employees
  let salesRep = '';
  const salesRepCandidates = [
    entry.Sales_Rep2,     // Tablix4 field
    entry.Sales_Rep_1,    // Primary field - actual sales rep (e.g., "Ben Jarman")
    entry.SalesRep1,      // Alternative without underscore
    entry.Primary_Sales_Rep,
    entry.Primary_Rep,
    entry.PrimarySalesRep,
    entry.PrimaryRep,
    entry.Rep,
    entry.Rep1,
    entry.Owner,
    entry.Owner1,
    entry.Assigned_To,
    entry.AssignedTo,
    entry.Member,
    entry.Member1,
    entry.Member_Name,
    entry.MemberName,
    entry.SalesPerson,
    entry.Sales_Person,
    entry.Salesperson,
    // Sales_Rep comes last as it often contains a list of all employees
    entry.Sales_Rep,
    entry.SalesRep,
  ];

  for (const candidate of salesRepCandidates) {
    if (candidate) {
      const cleaned = cleanHtmlEntities(String(candidate));
      // Sales rep should be a single name with no commas
      const commaCount = (cleaned.match(/,/g) || []).length;
      if (commaCount === 0 && cleaned.length < 100 && cleaned.length > 0) {
        salesRep = cleaned;
        break;
      }
    }
  }

  // Stage - ConnectWise pipeline stage
  // The SSRS field may be called "Sales_Stage", "Stage", or even "Status"
  // Apply same validation as sales rep to avoid picking up list fields
  let stage = '';
  const stageCandidates = [
    entry.Sales_Stage2,   // Tablix4 field
    entry.Sales_Stage,
    entry.SalesStage,
    entry.Stage,
    entry.Opp_Stage,
    entry.Status,         // SSRS often puts stage values in a "Status" field
    entry.Opp_Status,
    entry.Status_Description,
  ];

  for (const candidate of stageCandidates) {
    if (candidate) {
      const cleaned = cleanHtmlEntities(String(candidate));
      // Stage should be a short single value, not a list
      const commaCount = (cleaned.match(/,/g) || []).length;
      if (commaCount === 0 && cleaned.length < 100) {
        stage = cleaned;
        break;
      }
    }
  }

  // Status - separate from stage (e.g., "1. Open", "3. Won")
  // SSRS field is "Status1" (numbered suffix from Tablix rendering)
  let status = '';
  const statusCandidates = [
    entry.Status3,        // Tablix4 field (Status has suffix 3, not 2)
    entry.Status1,        // Tablix3 field (fallback)
    entry.Opp_Status,
    entry.OpportunityStatus,
    entry.Opportunity_Status,
    entry.Status_Description,
  ];

  for (const candidate of statusCandidates) {
    if (candidate) {
      const cleaned = cleanHtmlEntities(String(candidate));
      const commaCount = (cleaned.match(/,/g) || []).length;
      if (commaCount === 0 && cleaned.length < 100) {
        status = cleaned;
        break;
      }
    }
  }

  // Debug: log stage and status resolution for first few entries
  console.log(`[NativeSync] Opp "${opportunityName}": stage="${stage}", status="${status}", Status3="${entry.Status3 || 'N/A'}", Sales_Stage2="${entry.Sales_Stage2 || 'N/A'}"`);

  // Expected revenue - try various field names
  const expectedRevenue = parseNumber(
    entry.Value2 ||          // Tablix4 field
    entry.Expected_Revenue || entry.ExpectedRevenue || entry.Revenue ||
    entry.Amount || entry.Opp_Amount || entry.Total || entry.Value
  );

  // Close date - try many variations
  // Primary field is Expected_Close_Date from SSRS Opportunity List report
  const closeDate = entry.Expected_Close_Date2 || // Tablix4 field
                    entry.Expected_Close_Date || entry.ExpectedCloseDate ||
                    entry.Expected_Close || entry.Expected_Close1 || entry.ExpectedClose ||
                    entry.CloseDate || entry.Close_Date || entry.Close_Date1 ||
                    entry.Closed_Date || entry.ClosedDate || entry.Exp_Close || entry.ExpClose ||
                    entry.Est_Close || entry.EstClose || entry.Target_Close || entry.TargetClose ||
                    entry.Forecast_Close || entry.ForecastClose || entry.Due_Date || entry.DueDate ||
                    null;

  // Probability - try many variations including percentage fields
  const probability = parseNumber(
    entry.Probability2 ||    // Tablix4 field
    entry.Probability || entry.Probability1 || entry.Prob || entry.Prob1 ||
    entry.Win_Probability || entry.WinProbability || entry.Win_Prob || entry.WinProb ||
    entry.Opp_Probability || entry.OppProbability ||
    entry.Percent || entry.Pct || entry.Confidence || entry.Win_Rate || entry.WinRate
  );

  // Store raw data for debugging - use safe stringify to ensure valid JSON
  const rawData = safeStringifyEntry(entry);

  return {
    external_id: externalId,
    opportunity_name: opportunityName || null,
    company_name: companyName || null,
    sales_rep: salesRep || null,
    stage: stage || null,
    status: status || null,
    expected_revenue: expectedRevenue || null,
    close_date: closeDate || null,
    probability: probability !== null ? Math.round((probability > 1 ? probability : probability * 100)) : null,
    notes: null,
    raw_data: rawData,
  };
}

/**
 * Map ATOM entry to service ticket record
 * Field mappings based on SSRS Service Ticket report
 */
function mapServiceTicketEntry(entry: AtomEntry): Record<string, unknown> {
  // Log all available fields for debugging (first entry only shown in syncServiceTickets)

  // Try common field names for service tickets - matching PowerShell script field order
  const externalId = entry.TicketNbr || entry.Ticket_Number || entry.SR_RecID || entry.ID || entry.TicketID || entry.Ticket_ID || entry.Id || '';
  const summary = cleanHtmlEntities(entry.Summary || entry.Description || entry.Title || entry.Subject || '');
  // status_description is the field name from SSRS (lowercase)
  const status = entry.status_description || entry.Status_Description || entry.Status || entry.TicketStatus || entry.Ticket_Status || entry.StatusName || '';
  // Urgency is the priority field from SSRS
  const priority = entry.Urgency || entry.Priority_Description || entry.Priority || entry.PriorityName || entry.Priority_Name || '';
  // team_name is the assigned to field from SSRS
  const assignedTo = cleanHtmlEntities(entry.team_name || entry.Assigned_To || entry.AssignedTo || entry.Owner || entry.Resource || '');
  // Company_Name is the field from SSRS
  const companyName = cleanHtmlEntities(entry.Company_Name || entry.Company || entry.CompanyName || entry.Client || '');
  const boardName = entry.Board_Name || entry.Board || entry.BoardName || entry.Board_Name || entry.ServiceBoard || '';

  // Date fields - date_entered is the field from SSRS (lowercase)
  const createdDate = entry.date_entered || entry.Date_Entered || entry.Created_Date || entry.CreatedDate || entry.DateEntered || entry.OpenDate || null;
  const lastUpdated = entry.last_updated || entry.Last_Updated || entry.LastUpdated || entry.DateUpdated || entry.ModifiedDate || null;
  const dueDate = entry.DueDate || entry.Due_Date || entry.RequiredDate || entry.Deadline || null;

  // Hours/financial fields
  const hoursEstimate = parseNumber(entry.BudgetHours || entry.Budget_Hours || entry.EstimatedHours || entry.HoursEstimate);
  const hoursActual = parseNumber(entry.ActualHours || entry.Actual_Hours || entry.HoursActual || entry.WorkedHours);
  const hoursRemaining = parseNumber(entry.RemainingHours || entry.Remaining_Hours || entry.HoursRemaining);
  const budget = parseNumber(entry.Budget || entry.BudgetAmount || entry.Budget_Amount);

  // Notes
  const notes = cleanHtmlEntities(entry.Notes || entry.Comments || entry.InternalNotes || '');

  // Store raw data for debugging - use safe stringify to ensure valid JSON
  const rawData = safeStringifyEntry(entry);

  return {
    external_id: externalId,
    summary: summary || null,
    status: status || null,
    priority: priority || null,
    assigned_to: assignedTo || null,
    company_name: companyName || null,
    board_name: boardName || null,
    created_date: createdDate || null,
    last_updated: lastUpdated || null,
    due_date: dueDate || null,
    hours_estimate: hoursEstimate || null,
    hours_actual: hoursActual || null,
    hours_remaining: hoursRemaining || null,
    budget: budget || null,
    notes: notes || null,
    raw_data: rawData,
  };
}

/**
 * Clean HTML entities from string
 */
function cleanHtmlEntities(str: string): string {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Safely stringify an entry object for storage
 * Ensures all values are primitives before serialization
 */
function safeStringifyEntry(entry: AtomEntry): string {
  // Create a clean copy with only string values
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (value === null || value === undefined) {
      clean[key] = '';
    } else if (typeof value === 'string') {
      // Check for [object Object] which indicates a bug
      if (value === '[object Object]') {
        clean[key] = ''; // Replace corrupted value with empty string
      } else {
        clean[key] = value;
      }
    } else if (typeof value === 'object') {
      // This shouldn't happen if parseAtomFeed worked correctly, but safeguard anyway
      try {
        clean[key] = JSON.stringify(value);
      } catch {
        clean[key] = '';
      }
    } else {
      clean[key] = String(value);
    }
  }
  return JSON.stringify(clean);
}

/**
 * Parse number from string, handling various formats
 */
function parseNumber(value: string | undefined): number | null {
  if (!value) return null;

  // Remove currency symbols and commas
  const cleaned = value.replace(/[$,€£]/g, '').trim();
  const num = parseFloat(cleaned);

  return isNaN(num) ? null : num;
}

/**
 * Compare fields between existing and new record
 */
function compareFields(
  existing: object,
  newRecord: object,
  fields: string[]
): Array<{ field: string; oldValue: string | null; newValue: string | null }> {
  const existingRec = existing as Record<string, unknown>;
  const newRec = newRecord as Record<string, unknown>;
  const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];

  for (const field of fields) {
    const oldVal = existingRec[field];
    const newVal = newRec[field];

    // Normalize for comparison
    const oldStr = oldVal === null || oldVal === undefined ? '' : String(oldVal);
    const newStr = newVal === null || newVal === undefined ? '' : String(newVal);

    // For numeric fields, round for comparison
    if (typeof newVal === 'number' || typeof oldVal === 'number') {
      const oldNum = parseFloat(oldStr) || 0;
      const newNum = parseFloat(newStr) || 0;

      if (Math.abs(oldNum - newNum) > 0.01) {
        changes.push({
          field,
          oldValue: oldStr || null,
          newValue: newStr || null,
        });
      }
    } else if (oldStr !== newStr) {
      changes.push({
        field,
        oldValue: oldStr || null,
        newValue: newStr || null,
      });
    }
  }

  return changes;
}

/**
 * Test feed connectivity - actually fetches and parses the feed
 */
export async function testFeedConnection(feedUrl: string): Promise<{
  success: boolean;
  recordCount?: number;
  sampleFields?: string[];
  error?: string;
}> {
  try {
    // Apply dynamic dates to URL before testing
    const lookbackDays = getDateLookbackDays();
    const dynamicUrl = applyDynamicDates(feedUrl, lookbackDays);

    const xmlContent = await fetchAtomFeed(dynamicUrl);
    const entries = await parseAtomFeed(xmlContent);

    return {
      success: true,
      recordCount: entries.length,
      sampleFields: entries.length > 0 ? Object.keys(entries[0]) : [],
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

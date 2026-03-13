import { getDatabase } from '../database/connection';
import { ProjectRow } from '../database/schema';

export interface Project {
  id: number;
  externalId: string;
  clientName: string | null;
  projectName: string | null;
  budget: number | null;
  spent: number | null;
  hoursEstimate: number | null;
  hoursActual: number | null;
  hoursRemaining: number | null;
  hoursOverride: number | null;
  endDate: string | null;
  billable: number | null;
  invoiced: number | null;
  wip: number | null;
  status: string;
  isActive: boolean;
  notes: string | null;
  rawData: string | null;
  detailRawData: string | null;
  createdAt: string;
  updatedAt: string;
  // Computed fields
  budgetRemaining: number | null;
  budgetPercentUsed: number | null;
  hoursPercentUsed: number | null;
}

export interface ProjectQueryOptions {
  status?: string;
  includeInactive?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Transform database row to Project object
 */
function transformRow(row: ProjectRow): Project {
  const budget = row.budget;
  const spent = row.spent;
  const effectiveHoursEstimate = row.hours_override ?? row.hours_estimate;
  const hoursActual = row.hours_actual;

  return {
    id: row.id,
    externalId: row.external_id,
    clientName: row.client_name,
    projectName: row.project_name,
    budget: row.budget,
    spent: row.spent,
    hoursEstimate: row.hours_estimate,
    hoursActual: row.hours_actual,
    hoursRemaining: row.hours_remaining,
    hoursOverride: row.hours_override,
    endDate: row.end_date,
    billable: row.billable,
    invoiced: row.invoiced,
    wip: row.wip,
    status: row.status,
    isActive: row.is_active === 1,
    notes: row.notes,
    rawData: row.raw_data,
    detailRawData: row.detail_raw_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Computed fields
    budgetRemaining: budget !== null && spent !== null ? budget - spent : null,
    budgetPercentUsed: budget !== null && budget > 0 && spent !== null ? (spent / budget) * 100 : null,
    hoursPercentUsed: effectiveHoursEstimate !== null && effectiveHoursEstimate > 0 && hoursActual !== null
      ? (hoursActual / effectiveHoursEstimate) * 100
      : null,
  };
}

/**
 * Get all projects with optional filtering
 */
export function getAll(options: ProjectQueryOptions = {}): Project[] {
  const db = getDatabase();
  const { status, includeInactive = false, limit = 500, offset = 0 } = options;

  let sql = 'SELECT * FROM projects WHERE 1=1';
  const params: (string | number)[] = [];

  if (!includeInactive) {
    sql += ' AND is_active = 1';
  }

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = db.prepare(sql).all(...params) as ProjectRow[];
  return rows.map(transformRow);
}

/**
 * Get a project by ID
 */
export function getById(id: number): Project | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  return row ? transformRow(row) : null;
}

/**
 * Get a project by external ID
 */
export function getByExternalId(externalId: string): Project | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM projects WHERE external_id = ?').get(externalId) as ProjectRow | undefined;
  return row ? transformRow(row) : null;
}

/**
 * Create or update a project (upsert)
 */
export function upsert(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'budgetRemaining' | 'budgetPercentUsed'>): Project {
  const db = getDatabase();

  const existing = getByExternalId(project.externalId);

  if (existing) {
    // Update
    db.prepare(`
      UPDATE projects SET
        client_name = ?,
        project_name = ?,
        budget = ?,
        spent = ?,
        hours_estimate = ?,
        hours_remaining = ?,
        status = ?,
        is_active = ?,
        notes = ?,
        updated_at = datetime('now')
      WHERE external_id = ?
    `).run(
      project.clientName,
      project.projectName,
      project.budget,
      project.spent,
      project.hoursEstimate,
      project.hoursRemaining,
      project.status,
      project.isActive ? 1 : 0,
      project.notes,
      project.externalId
    );

    return getByExternalId(project.externalId)!;
  } else {
    // Insert
    const result = db.prepare(`
      INSERT INTO projects (
        external_id, client_name, project_name, budget, spent,
        hours_estimate, hours_remaining, status, is_active, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      project.externalId,
      project.clientName,
      project.projectName,
      project.budget,
      project.spent,
      project.hoursEstimate,
      project.hoursRemaining,
      project.status,
      project.isActive ? 1 : 0,
      project.notes
    );

    return getById(result.lastInsertRowid as number)!;
  }
}

/**
 * Update hours override for a project (persists across syncs)
 * Pass null to clear the override and use the synced value
 */
export function updateHoursOverride(id: number, hoursOverride: number | null): Project | null {
  const db = getDatabase();
  db.prepare("UPDATE projects SET hours_override = ?, updated_at = datetime('now') WHERE id = ?")
    .run(hoursOverride, id);
  return getById(id);
}

/**
 * Get distinct project statuses
 */
export function getStatuses(): string[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT DISTINCT status FROM projects WHERE status IS NOT NULL ORDER BY status').all() as { status: string }[];
  return rows.map((r) => r.status);
}

/**
 * Get project count
 */
export function getCount(includeInactive = false): number {
  const db = getDatabase();
  const sql = includeInactive
    ? 'SELECT COUNT(*) as count FROM projects'
    : 'SELECT COUNT(*) as count FROM projects WHERE is_active = 1';
  const row = db.prepare(sql).get() as { count: number };
  return row.count;
}

/**
 * Clear all projects from the database
 */
export function clearAll(): { deleted: number } {
  const db = getDatabase();
  const count = getCount(true);
  db.prepare('DELETE FROM projects').run();
  console.log(`[Projects] Cleared ${count} records`);
  return { deleted: count };
}

/**
 * Get available detail fields from projects that have detail data
 * Returns an array of field names found in the detail_raw_data JSON
 */
export function getAvailableDetailFields(): string[] {
  const db = getDatabase();

  // Find projects with detail_raw_data
  const rows = db
    .prepare('SELECT detail_raw_data FROM projects WHERE detail_raw_data IS NOT NULL LIMIT 10')
    .all() as { detail_raw_data: string }[];

  if (rows.length === 0) {
    return [];
  }

  // Collect all unique field names across projects
  const allFields = new Set<string>();

  for (const row of rows) {
    try {
      const detailData = JSON.parse(row.detail_raw_data);
      if (detailData && typeof detailData === 'object') {
        for (const key of Object.keys(detailData)) {
          allFields.add(key);
        }
      }
    } catch {
      // Skip invalid JSON
    }
  }

  // Return sorted array of field names
  return Array.from(allFields).sort();
}

/**
 * Diagnostic function to check detail sync configuration
 * Returns information about feeds, linking, and project data
 */
export function getDetailSyncDiagnostics(): {
  projectsWithDetailData: number;
  totalProjects: number;
  sampleExternalIds: string[];
  sampleDetailData: { externalId: string; fieldCount: number; fields: string[] } | null;
  sampleRawDataFields: { externalId: string; allFields: string[]; idFields: Record<string, string> } | null;
} {
  const db = getDatabase();

  // Count projects with detail data
  const withDetailCount = db
    .prepare('SELECT COUNT(*) as count FROM projects WHERE detail_raw_data IS NOT NULL')
    .get() as { count: number };

  const totalCount = db
    .prepare('SELECT COUNT(*) as count FROM projects')
    .get() as { count: number };

  // Get sample external IDs
  const sampleRows = db
    .prepare('SELECT external_id FROM projects LIMIT 5')
    .all() as { external_id: string }[];
  const sampleExternalIds = sampleRows.map(r => r.external_id);

  // Get sample detail data
  let sampleDetailData: { externalId: string; fieldCount: number; fields: string[] } | null = null;
  const detailRow = db
    .prepare('SELECT external_id, detail_raw_data FROM projects WHERE detail_raw_data IS NOT NULL LIMIT 1')
    .get() as { external_id: string; detail_raw_data: string } | undefined;

  if (detailRow) {
    try {
      const parsed = JSON.parse(detailRow.detail_raw_data);
      const fields = Object.keys(parsed);
      sampleDetailData = {
        externalId: detailRow.external_id,
        fieldCount: fields.length,
        fields: fields.slice(0, 20), // First 20 fields
      };
    } catch {
      // Invalid JSON
    }
  }

  // Get sample raw_data (from main feed) to show available ID fields
  let sampleRawDataFields: { externalId: string; allFields: string[]; idFields: Record<string, string> } | null = null;
  const rawRow = db
    .prepare('SELECT external_id, raw_data FROM projects WHERE raw_data IS NOT NULL LIMIT 1')
    .get() as { external_id: string; raw_data: string } | undefined;

  if (rawRow) {
    try {
      const parsed = JSON.parse(rawRow.raw_data);
      const allFields = Object.keys(parsed).sort();

      // Extract any ID-related fields
      const idFields: Record<string, string> = {};
      const idKeyPatterns = ['id', 'projectno', 'project_no', 'projectid', 'project_id', 'recid', 'rec_id', 'number', 'no'];

      for (const key of allFields) {
        const lowerKey = key.toLowerCase();
        if (idKeyPatterns.some(pattern => lowerKey.includes(pattern))) {
          idFields[key] = String(parsed[key] ?? '');
        }
      }

      sampleRawDataFields = {
        externalId: rawRow.external_id,
        allFields,
        idFields,
      };
    } catch {
      // Invalid JSON
    }
  }

  return {
    projectsWithDetailData: withDetailCount.count,
    totalProjects: totalCount.count,
    sampleExternalIds,
    sampleDetailData,
    sampleRawDataFields,
  };
}

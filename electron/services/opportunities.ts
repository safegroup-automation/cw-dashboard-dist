import { getDatabase } from '../database/connection';
import { OpportunityRow } from '../database/schema';

export interface Opportunity {
  id: number;
  externalId: string;
  opportunityName: string | null;
  companyName: string | null;
  salesRep: string | null;
  stage: string | null;
  status: string | null;
  expectedRevenue: number | null;
  closeDate: string | null;
  probability: number | null;
  notes: string | null;
  rawData: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  // Computed field
  weightedValue: number | null;
}

export interface OpportunityQueryOptions {
  stage?: string;
  salesRep?: string;
  limit?: number;
  offset?: number;
}

/**
 * Transform database row to Opportunity object
 */
function transformRow(row: OpportunityRow): Opportunity {
  const revenue = row.expected_revenue;
  const probability = row.probability;

  return {
    id: row.id,
    externalId: row.external_id,
    opportunityName: row.opportunity_name,
    companyName: row.company_name,
    salesRep: row.sales_rep,
    stage: row.stage,
    status: row.status,
    expectedRevenue: row.expected_revenue,
    closeDate: row.close_date,
    probability: row.probability,
    notes: row.notes,
    rawData: row.raw_data ? JSON.parse(row.raw_data) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Computed field
    weightedValue: revenue !== null && probability !== null ? revenue * (probability / 100) : null,
  };
}

/**
 * Get all opportunities with optional filtering
 */
export function getAll(options: OpportunityQueryOptions = {}): Opportunity[] {
  const db = getDatabase();
  const { stage, salesRep, limit = 500, offset = 0 } = options;

  let sql = 'SELECT * FROM opportunities WHERE 1=1';
  const params: (string | number)[] = [];

  if (stage) {
    sql += ' AND stage = ?';
    params.push(stage);
  }

  if (salesRep) {
    sql += ' AND sales_rep = ?';
    params.push(salesRep);
  }

  sql += ' ORDER BY stage, expected_revenue DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = db.prepare(sql).all(...params) as OpportunityRow[];
  return rows.map(transformRow);
}

/**
 * Get an opportunity by ID
 */
export function getById(id: number): Opportunity | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id) as OpportunityRow | undefined;
  return row ? transformRow(row) : null;
}

/**
 * Get an opportunity by external ID
 */
export function getByExternalId(externalId: string): Opportunity | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM opportunities WHERE external_id = ?').get(externalId) as OpportunityRow | undefined;
  return row ? transformRow(row) : null;
}

/**
 * Get all unique stages
 */
export function getStages(): string[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT DISTINCT stage FROM opportunities WHERE stage IS NOT NULL ORDER BY stage').all() as { stage: string }[];
  return rows.map((r) => r.stage);
}

/**
 * Get all unique statuses
 */
export function getStatuses(): string[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT DISTINCT status FROM opportunities WHERE status IS NOT NULL ORDER BY status').all() as { status: string }[];
  return rows.map((r) => r.status);
}

/**
 * Get all unique sales reps
 */
export function getSalesReps(): string[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT DISTINCT sales_rep FROM opportunities WHERE sales_rep IS NOT NULL ORDER BY sales_rep').all() as { sales_rep: string }[];
  return rows.map((r) => r.sales_rep);
}

/**
 * Create or update an opportunity (upsert)
 */
export function upsert(opportunity: Omit<Opportunity, 'id' | 'createdAt' | 'updatedAt' | 'weightedValue'>): Opportunity {
  const db = getDatabase();

  const existing = getByExternalId(opportunity.externalId);
  const rawDataJson = opportunity.rawData ? JSON.stringify(opportunity.rawData) : null;

  if (existing) {
    // Update
    db.prepare(`
      UPDATE opportunities SET
        opportunity_name = ?,
        company_name = ?,
        sales_rep = ?,
        stage = ?,
        status = ?,
        expected_revenue = ?,
        close_date = ?,
        probability = ?,
        notes = ?,
        raw_data = ?,
        updated_at = datetime('now')
      WHERE external_id = ?
    `).run(
      opportunity.opportunityName,
      opportunity.companyName,
      opportunity.salesRep,
      opportunity.stage,
      opportunity.status,
      opportunity.expectedRevenue,
      opportunity.closeDate,
      opportunity.probability,
      opportunity.notes,
      rawDataJson,
      opportunity.externalId
    );

    return getByExternalId(opportunity.externalId)!;
  } else {
    // Insert
    const result = db.prepare(`
      INSERT INTO opportunities (
        external_id, opportunity_name, company_name, sales_rep, stage, status,
        expected_revenue, close_date, probability, notes, raw_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      opportunity.externalId,
      opportunity.opportunityName,
      opportunity.companyName,
      opportunity.salesRep,
      opportunity.stage,
      opportunity.status,
      opportunity.expectedRevenue,
      opportunity.closeDate,
      opportunity.probability,
      opportunity.notes,
      rawDataJson
    );

    return getById(result.lastInsertRowid as number)!;
  }
}

/**
 * Get opportunity count
 */
export function getCount(): number {
  const db = getDatabase();
  const row = db.prepare('SELECT COUNT(*) as count FROM opportunities').get() as { count: number };
  return row.count;
}

/**
 * Clear all opportunities from the database
 */
export function clearAll(): { deleted: number } {
  const db = getDatabase();
  const count = getCount();
  db.prepare('DELETE FROM opportunities').run();
  const remaining = getCount();
  console.log(`[Opportunities] Cleared ${count} records, ${remaining} remaining`);
  if (remaining > 0) {
    console.warn(`[Opportunities] WARNING: ${remaining} records remain after clear! Retrying...`);
    db.prepare('DELETE FROM opportunities').run();
    console.log(`[Opportunities] After retry: ${getCount()} remaining`);
  }
  return { deleted: count };
}

import { getDatabase } from '../database/connection';
import { ServiceTicketRow } from '../database/schema';

export interface ServiceTicket {
  id: number;
  externalId: string;
  summary: string | null;
  status: string | null;
  priority: string | null;
  assignedTo: string | null;
  companyName: string | null;
  boardName: string | null;
  createdDate: string | null;
  lastUpdated: string | null;
  dueDate: string | null;
  hoursEstimate: number | null;
  hoursActual: number | null;
  hoursRemaining: number | null;
  budget: number | null;
  age: number | null;
  contactName: string | null;
  dateClosed: string | null;
  notes: string | null;
  rawData: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceTicketQueryOptions {
  status?: string;
  priority?: string;
  assignedTo?: string;
  companyName?: string;
  boardName?: string;
  limit?: number;
  offset?: number;
}

/**
 * Transform database row to ServiceTicket object
 */
function transformRow(row: ServiceTicketRow): ServiceTicket {
  return {
    id: row.id,
    externalId: row.external_id,
    summary: row.summary,
    status: row.status,
    priority: row.priority,
    assignedTo: row.assigned_to,
    companyName: row.company_name,
    boardName: row.board_name,
    createdDate: row.created_date,
    lastUpdated: row.last_updated,
    dueDate: row.due_date,
    hoursEstimate: row.hours_estimate,
    hoursActual: row.hours_actual,
    hoursRemaining: row.hours_remaining,
    budget: row.budget,
    age: row.age,
    contactName: row.contact_name,
    dateClosed: row.date_closed,
    notes: row.notes,
    rawData: row.raw_data ? JSON.parse(row.raw_data) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get all service tickets with optional filtering
 */
export function getAll(options: ServiceTicketQueryOptions = {}): ServiceTicket[] {
  const db = getDatabase();
  const { status, priority, assignedTo, companyName, boardName, limit = 500, offset = 0 } = options;

  let sql = 'SELECT * FROM service_tickets WHERE 1=1';
  const params: (string | number)[] = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  if (priority) {
    sql += ' AND priority = ?';
    params.push(priority);
  }

  if (assignedTo) {
    sql += ' AND assigned_to = ?';
    params.push(assignedTo);
  }

  if (companyName) {
    sql += ' AND company_name = ?';
    params.push(companyName);
  }

  if (boardName) {
    sql += ' AND board_name = ?';
    params.push(boardName);
  }

  sql += ' ORDER BY priority DESC, status, created_date DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = db.prepare(sql).all(...params) as ServiceTicketRow[];
  return rows.map(transformRow);
}

/**
 * Get a service ticket by ID
 */
export function getById(id: number): ServiceTicket | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM service_tickets WHERE id = ?').get(id) as ServiceTicketRow | undefined;
  return row ? transformRow(row) : null;
}

/**
 * Get a service ticket by external ID
 */
export function getByExternalId(externalId: string): ServiceTicket | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM service_tickets WHERE external_id = ?').get(externalId) as ServiceTicketRow | undefined;
  return row ? transformRow(row) : null;
}

/**
 * Get all unique statuses
 */
export function getStatuses(): string[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT DISTINCT status FROM service_tickets WHERE status IS NOT NULL ORDER BY status').all() as { status: string }[];
  return rows.map((r) => r.status);
}

/**
 * Get all unique priorities
 */
export function getPriorities(): string[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT DISTINCT priority FROM service_tickets WHERE priority IS NOT NULL ORDER BY priority').all() as { priority: string }[];
  return rows.map((r) => r.priority);
}

/**
 * Get all unique assignees
 */
export function getAssignees(): string[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT DISTINCT assigned_to FROM service_tickets WHERE assigned_to IS NOT NULL ORDER BY assigned_to').all() as { assigned_to: string }[];
  return rows.map((r) => r.assigned_to);
}

/**
 * Get all unique companies
 */
export function getCompanies(): string[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT DISTINCT company_name FROM service_tickets WHERE company_name IS NOT NULL ORDER BY company_name').all() as { company_name: string }[];
  return rows.map((r) => r.company_name);
}

/**
 * Get all unique boards
 */
export function getBoards(): string[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT DISTINCT board_name FROM service_tickets WHERE board_name IS NOT NULL ORDER BY board_name').all() as { board_name: string }[];
  return rows.map((r) => r.board_name);
}

/**
 * Create or update a service ticket (upsert)
 */
export function upsert(ticket: Omit<ServiceTicket, 'id' | 'createdAt' | 'updatedAt'>): ServiceTicket {
  const db = getDatabase();

  const existing = getByExternalId(ticket.externalId);
  const rawDataJson = ticket.rawData ? JSON.stringify(ticket.rawData) : null;

  if (existing) {
    // Update
    db.prepare(`
      UPDATE service_tickets SET
        summary = ?,
        status = ?,
        priority = ?,
        assigned_to = ?,
        company_name = ?,
        board_name = ?,
        created_date = ?,
        last_updated = ?,
        due_date = ?,
        hours_estimate = ?,
        hours_actual = ?,
        hours_remaining = ?,
        budget = ?,
        notes = ?,
        raw_data = ?,
        updated_at = datetime('now')
      WHERE external_id = ?
    `).run(
      ticket.summary,
      ticket.status,
      ticket.priority,
      ticket.assignedTo,
      ticket.companyName,
      ticket.boardName,
      ticket.createdDate,
      ticket.lastUpdated,
      ticket.dueDate,
      ticket.hoursEstimate,
      ticket.hoursActual,
      ticket.hoursRemaining,
      ticket.budget,
      ticket.notes,
      rawDataJson,
      ticket.externalId
    );

    return getByExternalId(ticket.externalId)!;
  } else {
    // Insert
    const result = db.prepare(`
      INSERT INTO service_tickets (
        external_id, summary, status, priority, assigned_to,
        company_name, board_name, created_date, last_updated, due_date,
        hours_estimate, hours_actual, hours_remaining, budget, notes, raw_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ticket.externalId,
      ticket.summary,
      ticket.status,
      ticket.priority,
      ticket.assignedTo,
      ticket.companyName,
      ticket.boardName,
      ticket.createdDate,
      ticket.lastUpdated,
      ticket.dueDate,
      ticket.hoursEstimate,
      ticket.hoursActual,
      ticket.hoursRemaining,
      ticket.budget,
      ticket.notes,
      rawDataJson
    );

    return getById(result.lastInsertRowid as number)!;
  }
}

/**
 * Get service ticket count
 */
export function getCount(): number {
  const db = getDatabase();
  const row = db.prepare('SELECT COUNT(*) as count FROM service_tickets').get() as { count: number };
  return row.count;
}

/**
 * Clear all service tickets from the database
 */
export function clearAll(): { deleted: number } {
  const db = getDatabase();
  const count = getCount();
  db.prepare('DELETE FROM service_tickets').run();
  console.log(`[ServiceTickets] Cleared ${count} records`);
  return { deleted: count };
}

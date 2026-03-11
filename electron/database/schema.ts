/**
 * SQLite database schema for CW Dashboard
 * Equivalent to the PostgreSQL schema from the original backend
 */

export const SCHEMA_VERSION = 7;

export const createTablesSQL = `
-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE NOT NULL,
    client_name TEXT,
    project_name TEXT,
    budget REAL,
    spent REAL,
    hours_estimate REAL,
    hours_actual REAL,
    hours_remaining REAL,
    status TEXT DEFAULT 'ACTIVE',
    is_active INTEGER DEFAULT 1,
    notes TEXT,
    raw_data TEXT,
    detail_raw_data TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_external_id ON projects(external_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_is_active ON projects(is_active);

-- Opportunities table
CREATE TABLE IF NOT EXISTS opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE NOT NULL,
    opportunity_name TEXT,
    company_name TEXT,
    sales_rep TEXT,
    stage TEXT,
    expected_revenue REAL,
    close_date TEXT,
    probability INTEGER,
    notes TEXT,
    raw_data TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_opportunities_external_id ON opportunities(external_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_company ON opportunities(company_name);
CREATE INDEX IF NOT EXISTS idx_opportunities_sales_rep ON opportunities(sales_rep);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);

-- Service tickets table
CREATE TABLE IF NOT EXISTS service_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE NOT NULL,
    summary TEXT,
    status TEXT,
    priority TEXT,
    assigned_to TEXT,
    company_name TEXT,
    board_name TEXT,
    created_date TEXT,
    last_updated TEXT,
    due_date TEXT,
    hours_estimate REAL,
    hours_actual REAL,
    hours_remaining REAL,
    budget REAL,
    notes TEXT,
    raw_data TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_service_tickets_external_id ON service_tickets(external_id);
CREATE INDEX IF NOT EXISTS idx_service_tickets_status ON service_tickets(status);
CREATE INDEX IF NOT EXISTS idx_service_tickets_priority ON service_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_service_tickets_assigned_to ON service_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_service_tickets_company ON service_tickets(company_name);
CREATE INDEX IF NOT EXISTS idx_service_tickets_board ON service_tickets(board_name);

-- Sync history table
CREATE TABLE IF NOT EXISTS sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    triggered_by TEXT,
    started_at TEXT,
    completed_at TEXT,
    records_processed INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_unchanged INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_history_status ON sync_history(status);
CREATE INDEX IF NOT EXISTS idx_sync_history_sync_type ON sync_history(sync_type);

-- Sync changes table (field-level audit trail)
CREATE TABLE IF NOT EXISTS sync_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_history_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    external_id TEXT,
    change_type TEXT NOT NULL,
    field_name TEXT,
    old_value TEXT,
    new_value TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (sync_history_id) REFERENCES sync_history(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_changes_sync_history_id ON sync_changes(sync_history_id);

-- ATOM feeds configuration (NEW for distributable app)
CREATE TABLE IF NOT EXISTS atom_feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    feed_type TEXT NOT NULL CHECK (feed_type IN ('PROJECTS', 'OPPORTUNITIES', 'SERVICE_TICKETS', 'PROJECT_DETAIL')),
    feed_url TEXT NOT NULL,
    detail_feed_id INTEGER,
    last_sync TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (detail_feed_id) REFERENCES atom_feeds(id) ON DELETE SET NULL
);

-- Application settings (key-value store)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
);
`;

export const defaultSettings: Record<string, string> = {
  'sync.intervalMinutes': '15',
  'sync.runOnStartup': 'true',
  'app.theme': 'dark',
};

export interface ProjectRow {
  id: number;
  external_id: string;
  client_name: string | null;
  project_name: string | null;
  budget: number | null;
  spent: number | null;
  hours_estimate: number | null;
  hours_actual: number | null;
  hours_remaining: number | null;
  status: string;
  is_active: number;
  notes: string | null;
  raw_data: string | null;
  detail_raw_data: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpportunityRow {
  id: number;
  external_id: string;
  opportunity_name: string | null;
  company_name: string | null;
  sales_rep: string | null;
  stage: string | null;
  expected_revenue: number | null;
  close_date: string | null;
  probability: number | null;
  notes: string | null;
  raw_data: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncHistoryRow {
  id: number;
  sync_type: string;
  status: string;
  triggered_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  records_processed: number;
  records_created: number;
  records_updated: number;
  records_unchanged: number;
  error_message: string | null;
  created_at: string;
}

export interface SyncChangeRow {
  id: number;
  sync_history_id: number;
  entity_type: string;
  entity_id: number;
  external_id: string | null;
  change_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface ServiceTicketRow {
  id: number;
  external_id: string;
  summary: string | null;
  status: string | null;
  priority: string | null;
  assigned_to: string | null;
  company_name: string | null;
  board_name: string | null;
  created_date: string | null;
  last_updated: string | null;
  due_date: string | null;
  hours_estimate: number | null;
  hours_actual: number | null;
  hours_remaining: number | null;
  budget: number | null;
  notes: string | null;
  raw_data: string | null;
  created_at: string;
  updated_at: string;
}

export interface AtomFeedRow {
  id: number;
  name: string;
  feed_type: 'PROJECTS' | 'OPPORTUNITIES' | 'SERVICE_TICKETS' | 'PROJECT_DETAIL';
  feed_url: string;
  detail_feed_id: number | null;
  last_sync: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

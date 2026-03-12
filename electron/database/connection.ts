import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { createTablesSQL, defaultSettings, SCHEMA_VERSION } from './schema';

const MAX_BACKUPS = 3; // Keep only the last 3 backups

let db: Database.Database | null = null;

/**
 * Get the database file path
 */
export function getDatabasePath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'cw-dashboard.db');
}

/**
 * Get the backup directory path
 */
function getBackupDir(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'backups');
}

/**
 * Create a backup of the database before migrations
 * Keeps only the last MAX_BACKUPS backups
 */
function createDatabaseBackup(): void {
  const dbPath = getDatabasePath();

  if (!fs.existsSync(dbPath)) {
    console.log('[Database] No existing database to backup');
    return;
  }

  const backupDir = getBackupDir();

  // Ensure backup directory exists
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Create timestamped backup filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `cw-dashboard-${timestamp}.db`);

  try {
    // Copy database file
    fs.copyFileSync(dbPath, backupPath);
    console.log(`[Database] Created backup: ${backupPath}`);

    // Clean up old backups (keep only MAX_BACKUPS)
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('cw-dashboard-') && f.endsWith('.db'))
      .sort()
      .reverse();

    if (backups.length > MAX_BACKUPS) {
      const toDelete = backups.slice(MAX_BACKUPS);
      for (const backup of toDelete) {
        const backupFile = path.join(backupDir, backup);
        fs.unlinkSync(backupFile);
        console.log(`[Database] Deleted old backup: ${backup}`);
      }
    }
  } catch (error) {
    console.error('[Database] Failed to create backup:', error);
    // Don't fail migration just because backup failed
  }
}

/**
 * Get the database instance (singleton)
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Initialize the database connection and schema
 */
export async function initDatabase(): Promise<void> {
  const dbPath = getDatabasePath();
  const dbDir = path.dirname(dbPath);

  // Ensure directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  console.log(`Initializing database at: ${dbPath}`);

  // Create database connection
  db = new Database(dbPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Use WAL mode for better performance
  db.pragma('journal_mode = WAL');

  // Run schema creation
  db.exec(createTablesSQL);

  // Check and run migrations
  await runMigrations();

  // Initialize default settings if not present
  initializeDefaultSettings();

  // Clean up stale syncs from previous sessions
  cleanupStaleSyncs();

  console.log('Database initialized successfully');
}

/**
 * Clean up any syncs that were left in PENDING or RUNNING state from a previous session
 */
function cleanupStaleSyncs(): void {
  if (!db) return;

  const stale = db.prepare("SELECT COUNT(*) as count FROM sync_history WHERE status IN ('PENDING', 'RUNNING')").get() as { count: number };

  if (stale.count > 0) {
    console.log(`[Database] Cleaning up ${stale.count} stale sync(s) from previous session`);
    db.prepare(`
      UPDATE sync_history
      SET status = 'FAILED',
          error_message = 'Sync interrupted by app restart',
          completed_at = datetime('now')
      WHERE status IN ('PENDING', 'RUNNING')
    `).run();
  }
}

/**
 * Run any pending migrations
 */
async function runMigrations(): Promise<void> {
  if (!db) return;

  // Get current schema version
  const versionRow = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as
    | { version: number }
    | undefined;

  const currentVersion = versionRow?.version ?? 0;

  if (currentVersion < SCHEMA_VERSION) {
    console.log(`Migrating database from version ${currentVersion} to ${SCHEMA_VERSION}`);

    // Create backup before migration
    createDatabaseBackup();

    // Run migrations for each version
    for (let v = currentVersion + 1; v <= SCHEMA_VERSION; v++) {
      await runMigration(v);
    }

    // Record new version
    db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  }
}

/**
 * Run a specific migration version
 */
async function runMigration(version: number): Promise<void> {
  console.log(`Running migration for version ${version}`);
  if (!db) return;

  // Add migration logic here as needed
  switch (version) {
    case 1:
      // Initial schema - already created by createTablesSQL
      break;
    case 2:
      // Add raw_data column to projects table
      console.log('Adding raw_data column to projects table');
      try {
        db.exec('ALTER TABLE projects ADD COLUMN raw_data TEXT');
      } catch (e) {
        // Column might already exist
        console.log('raw_data column may already exist:', e);
      }
      break;
    case 3:
      // Add detail_feed_id column for adaptive sync and update feed_type constraint
      console.log('Adding detail_feed_id column to atom_feeds table');
      try {
        db.exec('ALTER TABLE atom_feeds ADD COLUMN detail_feed_id INTEGER REFERENCES atom_feeds(id) ON DELETE SET NULL');
      } catch (e) {
        // Column might already exist
        console.log('detail_feed_id column may already exist:', e);
      }
      break;
    case 4:
      // Recreate atom_feeds table to update CHECK constraint to include PROJECT_DETAIL
      console.log('Updating atom_feeds table to support PROJECT_DETAIL feed type');
      try {
        db.exec(`
          -- Create new table with updated CHECK constraint
          CREATE TABLE IF NOT EXISTS atom_feeds_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            feed_type TEXT NOT NULL CHECK (feed_type IN ('PROJECTS', 'OPPORTUNITIES', 'SERVICE_TICKETS', 'PROJECT_DETAIL')),
            feed_url TEXT NOT NULL,
            detail_feed_id INTEGER,
            last_sync TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (detail_feed_id) REFERENCES atom_feeds_new(id) ON DELETE SET NULL
          );

          -- Copy existing data
          INSERT INTO atom_feeds_new (id, name, feed_type, feed_url, detail_feed_id, last_sync, is_active, created_at, updated_at)
          SELECT id, name, feed_type, feed_url, detail_feed_id, last_sync, is_active, created_at, updated_at
          FROM atom_feeds;

          -- Drop old table
          DROP TABLE atom_feeds;

          -- Rename new table
          ALTER TABLE atom_feeds_new RENAME TO atom_feeds;
        `);
        console.log('atom_feeds table updated successfully');
      } catch (e) {
        console.log('Error updating atom_feeds table:', e);
      }
      break;
    case 5:
      // Add detail_raw_data column for storing full detail feed data
      console.log('Adding detail_raw_data column to projects table');
      try {
        db.exec('ALTER TABLE projects ADD COLUMN detail_raw_data TEXT');
      } catch (e) {
        // Column might already exist
        console.log('detail_raw_data column may already exist:', e);
      }
      break;
    case 6:
      // Add hours_actual column to projects table
      console.log('Adding hours_actual column to projects table');
      try {
        db.exec('ALTER TABLE projects ADD COLUMN hours_actual REAL');
      } catch (e) {
        // Column might already exist
        console.log('hours_actual column may already exist:', e);
      }
      break;
    case 7:
      // Fix SSRS report paths after reports were moved to Project Reviews subfolder
      // (Migration preserved from v2.7.3)
      console.log('Updating feed URLs for moved SSRS reports');
      try {
        const oldPath = '%2FProject%20Management%2FProject%20Manager%20Summary%20Report';
        const newPath = '%2FProject%20Management%2FProject%20Reviews%2FProject%20Manager%20Summary%20Report';
        const oldPathDetail = '%2FProject%20Management%2FProject%20Summary%20Detailed%20Report';
        const newPathDetail = '%2FProject%20Management%2FProject%20Reviews%2FProject%20Summary%20Detailed%20Report';

        const updated1 = db.prepare(
          `UPDATE atom_feeds SET feed_url = REPLACE(feed_url, ?, ?), updated_at = datetime('now') WHERE feed_url LIKE '%' || ? || '%'`
        ).run(oldPath, newPath, oldPath);
        console.log(`Updated ${updated1.changes} project summary feed URL(s)`);

        const updated2 = db.prepare(
          `UPDATE atom_feeds SET feed_url = REPLACE(feed_url, ?, ?), updated_at = datetime('now') WHERE feed_url LIKE '%' || ? || '%'`
        ).run(oldPathDetail, newPathDetail, oldPathDetail);
        console.log(`Updated ${updated2.changes} project detail feed URL(s)`);
      } catch (e) {
        console.error('Error updating feed URLs:', e);
      }
      break;
    case 8:
      // Add hours_override column for user-overridden hours estimates
      console.log('Adding hours_override column to projects table');
      try {
        db.exec('ALTER TABLE projects ADD COLUMN hours_override REAL');
      } catch (e) {
        console.log('hours_override column may already exist:', e);
      }
      break;
    case 9:
      // Add status column to opportunities (separate from stage)
      console.log('Adding status column to opportunities table');
      try {
        db.exec('ALTER TABLE opportunities ADD COLUMN status TEXT');
        db.exec('CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status)');
      } catch (e) {
        console.log('status column may already exist:', e);
      }
      break;
    default:
      console.log(`No migration needed for version ${version}`);
  }
}

/**
 * Initialize default settings if they don't exist
 */
function initializeDefaultSettings(): void {
  if (!db) return;

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);

  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('Database connection closed');
  }
}

/**
 * Export the database type for use in services
 */
export type DatabaseInstance = Database.Database;

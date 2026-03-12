import { BrowserWindow } from 'electron';
import { getDatabase } from '../database/connection';
import { SyncHistoryRow, SyncChangeRow } from '../database/schema';
import { syncProjects, syncOpportunities, syncServiceTickets } from './native-sync';
import { getAllFeeds } from './feeds';

// Track active syncs for cancellation
const activeSyncs = new Map<number, AbortController>();

/**
 * Check if a sync has been cancelled
 */
export function isSyncCancelled(syncHistoryId: number): boolean {
  const controller = activeSyncs.get(syncHistoryId);
  return controller?.signal.aborted ?? false;
}

export interface SyncHistory {
  id: number;
  syncType: string;
  status: string;
  triggeredBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  errorMessage: string | null;
  createdAt: string;
}

export interface SyncStatus {
  projects: {
    lastSync: string | null;
    lastSyncId: number | null;
    recordsSynced: number;
  };
  opportunities: {
    lastSync: string | null;
    lastSyncId: number | null;
    recordsSynced: number;
  };
  serviceTickets: {
    lastSync: string | null;
    lastSyncId: number | null;
    recordsSynced: number;
  };
  pendingSyncs: Array<{ id: number; syncType: string; status: string }>;
}

export interface SyncHistoryOptions {
  syncType?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface EntityChangeSummary {
  entityType: string;
  entityId: number;
  externalId: string | null;
  changeType: string;
  fieldChanges: Array<{
    fieldName: string;
    oldValue: string | null;
    newValue: string | null;
  }>;
}

/**
 * Append 'Z' to UTC timestamps from SQLite so JavaScript parses them correctly.
 * SQLite datetime('now') stores UTC but without timezone indicator.
 */
function toUtcTimestamp(dateStr: string | null): string | null {
  if (!dateStr) return null;
  // SQLite format: "2026-01-15 11:00:00" -> "2026-01-15T11:00:00Z"
  return dateStr.replace(' ', 'T') + 'Z';
}

function transformSyncHistory(row: SyncHistoryRow): SyncHistory {
  return {
    id: row.id,
    syncType: row.sync_type,
    status: row.status,
    triggeredBy: row.triggered_by,
    startedAt: toUtcTimestamp(row.started_at),
    completedAt: toUtcTimestamp(row.completed_at),
    recordsProcessed: row.records_processed,
    recordsCreated: row.records_created,
    recordsUpdated: row.records_updated,
    recordsUnchanged: row.records_unchanged,
    errorMessage: row.error_message,
    createdAt: toUtcTimestamp(row.created_at) || row.created_at,
  };
}

/**
 * Request a sync operation
 */
export async function requestSync(
  syncType: 'PROJECTS' | 'OPPORTUNITIES' | 'SERVICE_TICKETS' | 'ALL',
  window: BrowserWindow | null
): Promise<{ ids: number[]; message: string }> {
  const db = getDatabase();
  const types = syncType === 'ALL' ? ['PROJECTS', 'OPPORTUNITIES', 'SERVICE_TICKETS'] : [syncType];
  const ids: number[] = [];

  for (const type of types) {
    // Check for existing pending/running sync
    const existing = db
      .prepare("SELECT id FROM sync_history WHERE sync_type = ? AND status IN ('PENDING', 'RUNNING')")
      .get(type) as { id: number } | undefined;

    if (existing) {
      throw new Error(`A ${type} sync is already pending or running (ID: ${existing.id})`);
    }

    // Create sync history record
    const result = db
      .prepare("INSERT INTO sync_history (sync_type, status, triggered_by) VALUES (?, 'PENDING', 'MANUAL')")
      .run(type);

    ids.push(result.lastInsertRowid as number);

    // Notify UI
    if (window) {
      window.webContents.send('sync:progress', {
        id: result.lastInsertRowid,
        syncType: type,
        status: 'PENDING',
      });
    }
  }

  // Start the actual sync in background
  for (let i = 0; i < types.length; i++) {
    executeSyncInBackground(types[i] as 'PROJECTS' | 'OPPORTUNITIES' | 'SERVICE_TICKETS', ids[i], window);
  }

  return { ids, message: `Sync requested for ${types.join(', ')}` };
}

/**
 * Execute sync in background using native Node.js fetch
 */
async function executeSyncInBackground(
  syncType: 'PROJECTS' | 'OPPORTUNITIES' | 'SERVICE_TICKETS',
  syncHistoryId: number,
  window: BrowserWindow | null
): Promise<void> {
  const db = getDatabase();

  // Create AbortController for this sync
  const abortController = new AbortController();
  activeSyncs.set(syncHistoryId, abortController);

  try {
    // Mark as running
    db.prepare("UPDATE sync_history SET status = 'RUNNING', started_at = datetime('now') WHERE id = ?").run(syncHistoryId);

    if (window) {
      window.webContents.send('sync:progress', { id: syncHistoryId, syncType, status: 'RUNNING' });
    }

    // Check if already cancelled
    if (abortController.signal.aborted) {
      throw new Error('Sync cancelled');
    }

    // Get the feed for this sync type
    const feeds = getAllFeeds().filter((f) => f.feedType === syncType && f.isActive);

    if (feeds.length === 0) {
      throw new Error(`No active ${syncType} feed configured. Please import an ATOMSVC file in Settings.`);
    }

    let totalProcessed = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalUnchanged = 0;

    // Run native sync for each feed
    for (const feed of feeds) {
      // Check for cancellation before each feed
      if (abortController.signal.aborted) {
        throw new Error('Sync cancelled');
      }

      console.log(`[Sync] Syncing ${syncType} from feed: ${feed.name}`);

      let result;
      if (syncType === 'PROJECTS') {
        // Pass feedId for adaptive sync (to look up linked detail feed)
        result = await syncProjects(feed.feedUrl, syncHistoryId, feed.id, abortController.signal);
      } else if (syncType === 'OPPORTUNITIES') {
        // Auto-migrate stored Tablix3 → Tablix4 URL (Tablix3 returns summary, Tablix4 has detail rows)
        if (feed.feedUrl.includes('Tablix3') && feed.feedUrl.includes('Opportunity')) {
          const newUrl = feed.feedUrl.replace('Tablix3', 'Tablix4');
          console.log('[Sync] Migrating stored opportunity feed URL from Tablix3 to Tablix4');
          db.prepare("UPDATE atom_feeds SET feed_url = ?, updated_at = datetime('now') WHERE id = ?").run(newUrl, feed.id);
          feed.feedUrl = newUrl;
        }
        result = await syncOpportunities(feed.feedUrl, syncHistoryId, abortController.signal);
      } else {
        result = await syncServiceTickets(feed.feedUrl, syncHistoryId, abortController.signal);
      }

      // Check for cancellation after sync
      if (abortController.signal.aborted) {
        throw new Error('Sync cancelled');
      }

      if (!result.success) {
        throw new Error(result.error || 'Sync failed');
      }

      totalProcessed += result.total;
      totalCreated += result.created;
      totalUpdated += result.updated;
      totalUnchanged += result.unchanged;

      // Update feed last sync time
      db.prepare("UPDATE atom_feeds SET last_sync = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(feed.id);
    }

    // Update sync history with results
    db.prepare(`
      UPDATE sync_history SET
        status = 'COMPLETED',
        completed_at = datetime('now'),
        records_processed = ?,
        records_created = ?,
        records_updated = ?,
        records_unchanged = ?
      WHERE id = ?
    `).run(totalProcessed, totalCreated, totalUpdated, totalUnchanged, syncHistoryId);

    if (window) {
      console.log('[Sync] Sending sync:completed event for', syncType);
      window.webContents.send('sync:completed', {
        id: syncHistoryId,
        syncType,
        status: 'COMPLETED',
        recordsProcessed: totalProcessed,
        recordsCreated: totalCreated,
        recordsUpdated: totalUpdated,
      });
    } else {
      console.warn('[Sync] No window reference, cannot send sync:completed event');
    }

    console.log(`[Sync] ${syncType} completed: ${totalProcessed} processed, ${totalCreated} created, ${totalUpdated} updated`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isCancelled = errorMessage === 'Sync cancelled' || abortController.signal.aborted;

    console.error(`[Sync] ${syncType} ${isCancelled ? 'cancelled' : 'failed'}:`, errorMessage);

    db.prepare("UPDATE sync_history SET status = 'FAILED', error_message = ?, completed_at = datetime('now') WHERE id = ?").run(
      isCancelled ? 'Cancelled by user' : errorMessage,
      syncHistoryId
    );

    if (window) {
      window.webContents.send('sync:failed', {
        id: syncHistoryId,
        syncType,
        status: 'FAILED',
        errorMessage: isCancelled ? 'Cancelled by user' : errorMessage,
      });
    }
  } finally {
    // Clean up the abort controller
    activeSyncs.delete(syncHistoryId);
  }
}

/**
 * Convert SQLite UTC datetime to ISO format with Z suffix
 * SQLite datetime('now') returns 'YYYY-MM-DD HH:MM:SS' in UTC but without timezone marker
 */
function toIsoUtc(sqliteDate: string | null | undefined): string | null {
  if (!sqliteDate) return null;
  // Replace space with T and add Z to mark as UTC
  return sqliteDate.replace(' ', 'T') + 'Z';
}

/**
 * Get sync status summary
 */
export function getStatus(): SyncStatus {
  const db = getDatabase();

  const lastProjects = db
    .prepare("SELECT id, completed_at, records_processed FROM sync_history WHERE sync_type = 'PROJECTS' AND status = 'COMPLETED' ORDER BY completed_at DESC LIMIT 1")
    .get() as { id: number; completed_at: string; records_processed: number } | undefined;

  const lastOpportunities = db
    .prepare("SELECT id, completed_at, records_processed FROM sync_history WHERE sync_type = 'OPPORTUNITIES' AND status = 'COMPLETED' ORDER BY completed_at DESC LIMIT 1")
    .get() as { id: number; completed_at: string; records_processed: number } | undefined;

  const lastServiceTickets = db
    .prepare("SELECT id, completed_at, records_processed FROM sync_history WHERE sync_type = 'SERVICE_TICKETS' AND status = 'COMPLETED' ORDER BY completed_at DESC LIMIT 1")
    .get() as { id: number; completed_at: string; records_processed: number } | undefined;

  // Debug logging
  console.log('[Sync] getStatus called:', {
    projects: lastProjects?.completed_at,
    opportunities: lastOpportunities?.completed_at,
    serviceTickets: lastServiceTickets?.completed_at,
  });

  const pendingSyncs = db
    .prepare("SELECT id, sync_type, status FROM sync_history WHERE status IN ('PENDING', 'RUNNING')")
    .all() as Array<{ id: number; sync_type: string; status: string }>;

  return {
    projects: {
      lastSync: toIsoUtc(lastProjects?.completed_at),
      lastSyncId: lastProjects?.id ?? null,
      recordsSynced: lastProjects?.records_processed ?? 0,
    },
    opportunities: {
      lastSync: toIsoUtc(lastOpportunities?.completed_at),
      lastSyncId: lastOpportunities?.id ?? null,
      recordsSynced: lastOpportunities?.records_processed ?? 0,
    },
    serviceTickets: {
      lastSync: toIsoUtc(lastServiceTickets?.completed_at),
      lastSyncId: lastServiceTickets?.id ?? null,
      recordsSynced: lastServiceTickets?.records_processed ?? 0,
    },
    pendingSyncs: pendingSyncs.map((s) => ({
      id: s.id,
      syncType: s.sync_type,
      status: s.status,
    })),
  };
}

/**
 * Get sync history
 */
export function getHistory(options: SyncHistoryOptions = {}): SyncHistory[] {
  const db = getDatabase();
  const { syncType, status, limit = 50, offset = 0 } = options;

  let sql = 'SELECT * FROM sync_history WHERE 1=1';
  const params: (string | number)[] = [];

  if (syncType) {
    sql += ' AND sync_type = ?';
    params.push(syncType);
  }

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = db.prepare(sql).all(...params) as SyncHistoryRow[];
  return rows.map(transformSyncHistory);
}

/**
 * Get changes for a sync
 */
export function getChanges(syncHistoryId: number): EntityChangeSummary[] {
  const db = getDatabase();

  const changes = db
    .prepare('SELECT * FROM sync_changes WHERE sync_history_id = ? ORDER BY entity_type, entity_id')
    .all(syncHistoryId) as SyncChangeRow[];

  // Group by entity
  const grouped = new Map<string, EntityChangeSummary>();

  for (const change of changes) {
    const key = `${change.entity_type}:${change.entity_id}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        entityType: change.entity_type,
        entityId: change.entity_id,
        externalId: change.external_id,
        changeType: change.change_type,
        fieldChanges: [],
      });
    }

    if (change.field_name) {
      grouped.get(key)!.fieldChanges.push({
        fieldName: change.field_name,
        oldValue: change.old_value,
        newValue: change.new_value,
      });
    }
  }

  return Array.from(grouped.values());
}

/**
 * Cancel a pending or running sync
 */
export function cancelSync(syncId: number): { message: string } {
  const db = getDatabase();

  const sync = db.prepare('SELECT status FROM sync_history WHERE id = ?').get(syncId) as { status: string } | undefined;

  if (!sync) {
    throw new Error('Sync not found');
  }

  if (!['PENDING', 'RUNNING'].includes(sync.status)) {
    throw new Error(`Cannot cancel sync with status ${sync.status}`);
  }

  // Abort the running sync if it exists
  const controller = activeSyncs.get(syncId);
  if (controller) {
    console.log(`[Sync] Aborting sync ${syncId}`);
    controller.abort();
  }

  // Update database status
  db.prepare("UPDATE sync_history SET status = 'FAILED', error_message = 'Cancelled by user', completed_at = datetime('now') WHERE id = ?").run(
    syncId
  );

  return { message: `Sync ${syncId} cancelled` };
}

/**
 * Clear all sync history
 */
export function clearHistory(): { message: string; deletedHistory: number; deletedChanges: number } {
  const db = getDatabase();

  // Check for pending/running syncs
  const pending = db.prepare("SELECT COUNT(*) as count FROM sync_history WHERE status IN ('PENDING', 'RUNNING')").get() as { count: number };

  if (pending.count > 0) {
    throw new Error(`Cannot clear history while ${pending.count} sync(s) are pending or running`);
  }

  // Delete changes first (foreign key)
  const deletedChanges = db.prepare('DELETE FROM sync_changes').run().changes;
  const deletedHistory = db.prepare('DELETE FROM sync_history').run().changes;

  return {
    message: 'Sync history cleared',
    deletedHistory,
    deletedChanges,
  };
}

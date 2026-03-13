import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Database,
  FolderKanban,
  TrendingUp,
  Ticket,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  X,
  Wifi,
  WifiOff,
  Trash2,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { sync as syncApi } from '../../api';
import { SyncHistory, SyncStatusSummary, SyncType, EntityChangeSummary } from '../../types';
import { isElectron } from '../../api/electron-api';

const formatRelativeTime = (dateStr: string | null): string => {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
};

const formatDateTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatElapsedTime = (dateStr: string): string => {
  const start = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const secs = diffSecs % 60;

  if (diffMins === 0) return `${secs}s`;
  return `${diffMins}m ${secs}s`;
};

const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case 'COMPLETED':
      return <CheckCircle size={14} className="text-green-500" />;
    case 'FAILED':
      return <XCircle size={14} className="text-red-500" />;
    case 'RUNNING':
      return <Loader2 size={14} className="text-blue-500 animate-spin" />;
    case 'PENDING':
      return <Clock size={14} className="text-yellow-500" />;
    default:
      return <Clock size={14} className="text-gray-500" />;
  }
};

const StatusBadge = ({ status }: { status: string }) => {
  const colors = {
    COMPLETED: 'bg-green-500/20 text-green-400',
    FAILED: 'bg-red-500/20 text-red-400',
    RUNNING: 'bg-blue-500/20 text-blue-400',
    PENDING: 'bg-yellow-500/20 text-yellow-400',
  };
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${colors[status as keyof typeof colors] || 'bg-gray-500/20 text-gray-400'}`}>
      {status}
    </span>
  );
};

interface SyncHistoryCardProps {
  sync: SyncHistory;
  onCancel: (syncId: number) => Promise<void>;
}

function SyncHistoryCard({ sync, onCancel }: SyncHistoryCardProps) {
  const [cancelling, setCancelling] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [changes, setChanges] = useState<EntityChangeSummary[]>([]);
  const [loadingChanges, setLoadingChanges] = useState(false);
  const [elapsed, setElapsed] = useState('');

  // Update elapsed time every second for pending/running syncs
  useEffect(() => {
    if (sync.status !== 'PENDING' && sync.status !== 'RUNNING') {
      setElapsed('');
      return;
    }

    const updateElapsed = () => {
      const startTime = sync.startedAt || sync.createdAt;
      setElapsed(formatElapsedTime(startTime));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [sync.status, sync.startedAt, sync.createdAt]);

  const handleToggle = async () => {
    if (!expanded && changes.length === 0 && (sync.recordsCreated > 0 || sync.recordsUpdated > 0 || sync.recordsRemoved > 0)) {
      setLoadingChanges(true);
      try {
        const data = await syncApi.getChanges(sync.id);
        setChanges(data);
      } catch (err) {
        console.error('Failed to load changes:', err);
      } finally {
        setLoadingChanges(false);
      }
    }
    setExpanded(!expanded);
  };

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cancelling) return;
    setCancelling(true);
    try {
      await onCancel(sync.id);
    } finally {
      setCancelling(false);
    }
  };

  const canCancel = sync.status === 'PENDING' || sync.status === 'RUNNING';
  const TypeIcon = sync.syncType === 'PROJECTS' ? FolderKanban : sync.syncType === 'SERVICE_TICKETS' ? Ticket : TrendingUp;

  return (
    <div className="bg-board-bg border border-board-border rounded">
      <div
        onClick={handleToggle}
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-board-border/30 transition-colors"
      >
        <StatusIcon status={sync.status} />
        <TypeIcon size={14} className="text-gray-400" />
        <span className="text-xs text-white flex-1">{sync.syncType}</span>
        {elapsed && (
          <span className="text-[10px] text-yellow-400 font-mono">{elapsed}</span>
        )}
        <span className="text-[10px] text-gray-500">{formatDateTime(sync.createdAt)}</span>
        <StatusBadge status={sync.status} />
        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="p-0.5 text-gray-500 hover:text-red-400 hover:bg-red-500/20 rounded transition-colors disabled:opacity-50"
            title="Cancel sync"
          >
            {cancelling ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
          </button>
        )}
        {(sync.recordsCreated > 0 || sync.recordsUpdated > 0 || sync.recordsRemoved > 0) && (
          <button className="text-gray-500 p-0.5">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {/* Summary row */}
      <div className="px-2 pb-1.5 flex items-center gap-3 text-[10px] text-gray-500">
        {sync.triggeredBy && <span>by {sync.triggeredBy}</span>}
        <span className="text-green-400">+{sync.recordsCreated} new</span>
        <span className="text-blue-400">{sync.recordsUpdated} updated</span>
        {sync.recordsRemoved > 0 && <span className="text-red-400">-{sync.recordsRemoved} removed</span>}
        <span>{sync.recordsUnchanged} unchanged</span>
        {sync.errorMessage && <span className="text-red-400 truncate">{sync.errorMessage}</span>}
      </div>

      {/* Expanded changes */}
      {expanded && (
        <div className="border-t border-board-border px-2 py-2 space-y-2">
          {loadingChanges && (
            <div className="flex items-center gap-2 text-gray-400 text-xs">
              <Loader2 size={12} className="animate-spin" />
              Loading changes...
            </div>
          )}
          {!loadingChanges && changes.length === 0 && (
            <div className="text-xs text-gray-500">No field-level changes recorded</div>
          )}
          {changes.map((entity, idx) => (
            <div key={idx} className="bg-board-panel/50 rounded p-2">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  entity.changeType === 'CREATED' ? 'bg-green-500/20 text-green-400' : entity.changeType === 'REMOVED' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {entity.changeType}
                </span>
                <span className="text-xs text-gray-400">{entity.entityType}</span>
                {entity.externalId && (
                  <span className="text-[10px] text-gray-500">#{entity.externalId}</span>
                )}
              </div>
              {entity.fieldChanges.length > 0 && (
                <div className="space-y-1">
                  {entity.fieldChanges.map((change, changeIdx) => (
                    <div key={changeIdx} className="flex items-center gap-2 text-[11px]">
                      <span className="text-gray-500 min-w-[80px]">{change.fieldName}</span>
                      <span className="text-red-400/70 line-through truncate max-w-[80px]" title={change.oldValue || ''}>
                        {change.oldValue || '(empty)'}
                      </span>
                      <ArrowRight size={10} className="text-gray-600 flex-shrink-0" />
                      <span className="text-green-400 truncate max-w-[80px]" title={change.newValue || ''}>
                        {change.newValue || '(empty)'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ListenerStatus {
  alive: boolean;
  message: string;
}

export default function SyncPanel() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<SyncStatusSummary | null>(null);
  const [history, setHistory] = useState<SyncHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<SyncType | 'ALL' | null>(null);
  const [listenerStatus, setListenerStatus] = useState<ListenerStatus | null>(null);
  const isElectronApp = isElectron();

  const fetchData = useCallback(async () => {
    try {
      const [statusData, historyData] = await Promise.all([
        syncApi.getStatus(),
        syncApi.getHistory({ limit: 20 }),
      ]);
      setStatus(statusData);
      setHistory(historyData);
    } catch (err) {
      console.error('Failed to fetch sync data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch listener status periodically (only in web mode, not Electron)
  useEffect(() => {
    if (isElectronApp) {
      // In Electron, we don't have a listener - syncs run directly
      setListenerStatus(null);
      return;
    }

    const fetchListenerStatus = async () => {
      try {
        const data = await syncApi.getListenerStatus();
        setListenerStatus({ alive: data.alive, message: data.message });
      } catch {
        setListenerStatus({ alive: false, message: 'Unable to check listener status' });
      }
    };

    fetchListenerStatus();
    const interval = setInterval(fetchListenerStatus, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [isElectronApp]);

  // Handle sync events (IPC in Electron, WebSocket in web mode)
  useEffect(() => {
    if (!isElectronApp) {
      // Web mode would use WebSocket - not implemented here since we're focusing on Electron
      return;
    }

    // Subscribe to Electron IPC events
    const api = (window as Window & { electronAPI?: { on: (channel: string, callback: (data: unknown) => void) => () => void } }).electronAPI;
    if (!api) return;

    const unsubCompleted = api.on('sync:completed', () => {
      fetchData();
      showToast('success', 'Sync completed successfully');
      setSyncing(null);
    });

    const unsubFailed = api.on('sync:failed', (data) => {
      fetchData();
      const errorData = data as { errorMessage?: string };
      showToast('error', errorData?.errorMessage || 'Sync failed');
      setSyncing(null);
    });

    const unsubProgress = api.on('sync:progress', () => {
      fetchData();
    });

    return () => {
      unsubCompleted();
      unsubFailed();
      unsubProgress();
    };
  }, [isElectronApp, fetchData, showToast]);

  const handleSync = async (syncType: SyncType | 'ALL') => {
    setSyncing(syncType);
    try {
      await syncApi.requestSync(syncType);
      showToast('info', `${syncType === 'ALL' ? 'Full' : syncType} sync requested`);
      fetchData();
      // Reset syncing state after short delay - actual status tracked via hasPending
      // This prevents button from being stuck if WebSocket is disconnected
      setTimeout(() => setSyncing(null), 1000);
    } catch (err) {
      console.error('Failed to request sync:', err);
      const message = err instanceof Error ? err.message : 'Failed to request sync';
      showToast('error', message);
      setSyncing(null);
    }
  };

  const handleCancelSync = async (syncId: number) => {
    try {
      await syncApi.cancelSync(syncId);
      showToast('info', 'Sync cancelled');
      fetchData();
    } catch (err) {
      console.error('Failed to cancel sync:', err);
      const message = err instanceof Error ? err.message : 'Failed to cancel sync';
      showToast('error', message);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm('Are you sure you want to clear all sync history?')) {
      return;
    }
    try {
      const result = await syncApi.clearHistory();
      showToast('success', `Cleared ${result.deleted_history} sync records`);
      fetchData();
    } catch (err) {
      console.error('Failed to clear history:', err);
      const message = err instanceof Error ? err.message : 'Failed to clear history';
      showToast('error', message);
    }
  };

  const hasPending = (status?.pendingSyncs?.length ?? 0) > 0;

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col p-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Database className="text-blue-500" size={24} />
          <h2 className="text-xl font-bold text-white">Data Sync</h2>
          {/* Listener Status Indicator */}
          {listenerStatus && (
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
                listenerStatus.alive
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
              title={listenerStatus.message}
            >
              {listenerStatus.alive ? (
                <Wifi size={12} />
              ) : (
                <WifiOff size={12} />
              )}
              <span>{listenerStatus.alive ? 'Listener Online' : 'Listener Offline'}</span>
            </div>
          )}
        </div>
        <button
          onClick={() => handleSync('ALL')}
          disabled={syncing !== null || hasPending}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
        >
          {syncing || hasPending ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw size={14} />
              Sync All
            </>
          )}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 size={24} className="text-gray-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* Status Cards */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            {/* Projects Status */}
            <div className="bg-board-panel border border-board-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FolderKanban size={16} className="text-blue-400" />
                  <span className="text-sm font-medium text-white">Projects</span>
                </div>
                <button
                  onClick={() => handleSync('PROJECTS')}
                  disabled={syncing !== null || hasPending}
                  className="p-1 text-gray-400 hover:text-white hover:bg-board-border rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Sync Projects"
                >
                  {syncing === 'PROJECTS' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                </button>
              </div>
              <div className="text-xs text-gray-400">
                <div className="flex items-center gap-1">
                  <Clock size={12} />
                  Last sync: <span className="text-white">{formatRelativeTime(status?.projects.lastSync ?? null)}</span>
                </div>
                <div className="mt-1">
                  Records: <span className="text-white">{status?.projects.recordsSynced ?? 0}</span>
                </div>
              </div>
            </div>

            {/* Opportunities Status */}
            <div className="bg-board-panel border border-board-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} className="text-green-400" />
                  <span className="text-sm font-medium text-white">Opportunities</span>
                </div>
                <button
                  onClick={() => handleSync('OPPORTUNITIES')}
                  disabled={syncing !== null || hasPending}
                  className="p-1 text-gray-400 hover:text-white hover:bg-board-border rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Sync Opportunities"
                >
                  {syncing === 'OPPORTUNITIES' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                </button>
              </div>
              <div className="text-xs text-gray-400">
                <div className="flex items-center gap-1">
                  <Clock size={12} />
                  Last sync: <span className="text-white">{formatRelativeTime(status?.opportunities.lastSync ?? null)}</span>
                </div>
                <div className="mt-1">
                  Records: <span className="text-white">{status?.opportunities.recordsSynced ?? 0}</span>
                </div>
              </div>
            </div>

            {/* Service Tickets Status */}
            <div className="bg-board-panel border border-board-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Ticket size={16} className="text-orange-400" />
                  <span className="text-sm font-medium text-white">Service Tickets</span>
                </div>
                <button
                  onClick={() => handleSync('SERVICE_TICKETS')}
                  disabled={syncing !== null || hasPending}
                  className="p-1 text-gray-400 hover:text-white hover:bg-board-border rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Sync Service Tickets"
                >
                  {syncing === 'SERVICE_TICKETS' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                </button>
              </div>
              <div className="text-xs text-gray-400">
                <div className="flex items-center gap-1">
                  <Clock size={12} />
                  Last sync: <span className="text-white">{formatRelativeTime(status?.serviceTickets?.lastSync ?? null)}</span>
                </div>
                <div className="mt-1">
                  Records: <span className="text-white">{status?.serviceTickets?.recordsSynced ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Pending Syncs Alert */}
          {hasPending && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2 mb-4 flex items-center gap-2">
              <Loader2 size={14} className="text-yellow-500 animate-spin" />
              <span className="text-xs text-yellow-400">
                {status?.pendingSyncs.length} sync(s) pending or running...
              </span>
            </div>
          )}

          {/* Sync History */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-400">Sync History</h3>
              {history.length > 0 && !hasPending && (
                <button
                  onClick={handleClearHistory}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                  title="Clear all sync history"
                >
                  <Trash2 size={12} />
                  Clear
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {history.length === 0 ? (
                <div className="text-center text-gray-500 text-sm py-8">
                  No sync history yet. Click "Sync All" to start.
                </div>
              ) : (
                history.map((sync) => <SyncHistoryCard key={sync.id} sync={sync} onCancel={handleCancelSync} />)
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Pin, FolderKanban, TrendingUp, Ticket, Clock, LayoutGrid, List, ChevronUp, ChevronDown, Search } from 'lucide-react';
import { Project, Opportunity, ServiceTicket } from '../../types';
import { projects as projectsApi, opportunities as opportunitiesApi, serviceTickets as serviceTicketsApi, isElectron, settings, sync, events } from '../../api';
import { formatLastSync } from './FullPageViewHeader';
import { useWebSocket } from '../../context/WebSocketContext';
import ProjectCard from '../Project/ProjectCard';
import OpportunityCard from '../Opportunity/OpportunityCard';
import ServiceTicketCard from '../ServiceTicket/ServiceTicketCard';
import { formatCurrency, formatHours, getProjectStatusColor, getTicketStatusColor, getPriorityColor, getStageColor, getOpportunityStatusColor } from '../../utils/formatting';

// Setting key for visible detail fields
const PROJECT_DETAIL_VISIBLE_FIELDS_KEY = 'project_detail_visible_fields';

type ItemType = 'projects' | 'opportunities' | 'service-tickets';

interface PinnedViewProps {
  pinnedProjects: number[];
  pinnedOpportunities: number[];
  pinnedServiceTickets: number[];
  togglePin: (type: ItemType, id: number) => void;
}

interface SyncStatusState {
  projects: string | null;
  opportunities: string | null;
  serviceTickets: string | null;
}

// ============================================
// Sort helpers
// ============================================
type SortDir = 'asc' | 'desc';

interface SortState<T extends string> {
  col: T;
  dir: SortDir;
}

function SortHeader<T extends string>({ label, col, sort, onSort, className }: {
  label: string;
  col: T;
  sort: SortState<T>;
  onSort: (col: T) => void;
  className?: string;
}) {
  const active = sort.col === col;
  return (
    <th
      className={`px-2 py-1.5 text-left text-[11px] font-medium text-gray-400 cursor-pointer select-none hover:text-gray-200 whitespace-nowrap ${className || ''}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active && (sort.dir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
      </span>
    </th>
  );
}

function toggleSort<T extends string>(prev: SortState<T>, col: T): SortState<T> {
  if (prev.col === col) return { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
  return { col, dir: 'asc' };
}

function cmp(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

// ============================================
// Project list table
// ============================================
type ProjectSortCol = 'name' | 'client' | 'status' | 'pct' | 'hours' | 'budget' | 'spent';

function ProjectListTable({ projects, togglePin, searchText }: { projects: Project[]; togglePin: (id: number) => void; searchText: string }) {
  const [sort, setSort] = useState<SortState<ProjectSortCol>>({ col: 'name', dir: 'asc' });

  const sorted = useMemo(() => {
    const filtered = searchText
      ? projects.filter(p => `${p.projectName} ${p.clientName} ${p.status}`.toLowerCase().includes(searchText.toLowerCase()))
      : projects;

    return [...filtered].sort((a, b) => {
      let v: number;
      const aEst = a.hoursOverride ?? a.hoursEstimate;
      const bEst = b.hoursOverride ?? b.hoursEstimate;
      const aPct = aEst && aEst > 0 && a.hoursActual != null ? a.hoursActual / aEst : null;
      const bPct = bEst && bEst > 0 && b.hoursActual != null ? b.hoursActual / bEst : null;

      switch (sort.col) {
        case 'name': v = cmp(a.projectName, b.projectName); break;
        case 'client': v = cmp(a.clientName, b.clientName); break;
        case 'status': v = cmp(a.status, b.status); break;
        case 'pct': v = cmp(aPct, bPct); break;
        case 'hours': v = cmp(a.hoursActual, b.hoursActual); break;
        case 'budget': v = cmp(a.budget, b.budget); break;
        case 'spent': v = cmp(a.spent, b.spent); break;
        default: v = 0;
      }
      return sort.dir === 'desc' ? -v : v;
    });
  }, [projects, sort, searchText]);

  const onSort = useCallback((col: ProjectSortCol) => setSort(prev => toggleSort(prev, col)), []);

  return (
    <div className="bg-board-bg border border-board-border rounded overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-board-panel border-b border-board-border">
          <tr>
            <th className="w-8 px-2 py-1.5"></th>
            <SortHeader label="Project" col="name" sort={sort} onSort={onSort} />
            <SortHeader label="Client" col="client" sort={sort} onSort={onSort} />
            <SortHeader label="Status" col="status" sort={sort} onSort={onSort} />
            <SortHeader label="Budget" col="budget" sort={sort} onSort={onSort} className="text-right" />
            <SortHeader label="Spent" col="spent" sort={sort} onSort={onSort} className="text-right" />
            <SortHeader label="%" col="pct" sort={sort} onSort={onSort} className="text-right" />
            <SortHeader label="Hours" col="hours" sort={sort} onSort={onSort} className="text-right" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(project => {
            const hoursEst = project.hoursOverride ?? project.hoursEstimate;
            const pct = hoursEst && hoursEst > 0 && project.hoursActual != null
              ? Math.round((project.hoursActual / hoursEst) * 100) : null;
            const pctColor = pct === null ? '' : pct >= 100 ? 'text-red-400' : pct >= 80 ? 'text-yellow-400' : 'text-green-400';
            const budgetPct = project.budget && project.budget > 0 && project.spent != null
              ? (project.spent / project.budget) * 100 : null;
            const budgetColor = budgetPct === null ? 'text-gray-500' : budgetPct >= 100 ? 'text-red-400' : budgetPct >= 80 ? 'text-yellow-400' : 'text-green-400';

            return (
              <tr key={project.id} className="border-b border-board-border/50 hover:bg-board-border/30">
                <td className="px-2 py-1.5">
                  <button onClick={() => togglePin(project.id)} className="text-blue-400 p-0.5"><Pin size={12} fill="currentColor" /></button>
                </td>
                <td className="px-2 py-1.5 text-white font-medium truncate max-w-[300px]">{project.projectName}</td>
                <td className="px-2 py-1.5 text-gray-400 text-xs truncate max-w-[200px]">{project.clientName}</td>
                <td className="px-2 py-1.5"><span className={`text-xs px-1.5 py-0.5 rounded ${getProjectStatusColor(project.status)}`}>{project.status}</span></td>
                <td className={`px-2 py-1.5 text-xs text-right ${budgetColor}`}>{project.budget != null ? formatCurrency(project.budget) : ''}</td>
                <td className={`px-2 py-1.5 text-xs text-right ${budgetColor}`}>{project.spent != null ? formatCurrency(project.spent) : ''}</td>
                <td className={`px-2 py-1.5 text-xs text-right ${pctColor}`}>{pct !== null ? `${pct}%` : ''}</td>
                <td className="px-2 py-1.5 text-xs text-gray-500 text-right whitespace-nowrap">{project.hoursActual != null ? `${formatHours(project.hoursActual)}/${formatHours(hoursEst)}` : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================
// Opportunity list table
// ============================================
type OpportunitySortCol = 'name' | 'company' | 'stage' | 'status' | 'revenue' | 'weighted' | 'rep' | 'probability' | 'closeDate';

function OpportunityListTable({ opportunities, togglePin, searchText }: { opportunities: Opportunity[]; togglePin: (id: number) => void; searchText: string }) {
  const [sort, setSort] = useState<SortState<OpportunitySortCol>>({ col: 'name', dir: 'asc' });

  const sorted = useMemo(() => {
    const filtered = searchText
      ? opportunities.filter(o => `${o.opportunityName} ${o.companyName} ${o.stage} ${o.status} ${o.salesRep}`.toLowerCase().includes(searchText.toLowerCase()))
      : opportunities;

    return [...filtered].sort((a, b) => {
      let v: number;
      switch (sort.col) {
        case 'name': v = cmp(a.opportunityName, b.opportunityName); break;
        case 'company': v = cmp(a.companyName, b.companyName); break;
        case 'stage': v = cmp(a.stage, b.stage); break;
        case 'status': v = cmp(a.status, b.status); break;
        case 'revenue': v = cmp(a.expectedRevenue, b.expectedRevenue); break;
        case 'weighted': v = cmp(a.weightedValue, b.weightedValue); break;
        case 'rep': v = cmp(a.salesRep, b.salesRep); break;
        case 'probability': v = cmp(a.probability, b.probability); break;
        case 'closeDate': v = cmp(a.closeDate, b.closeDate); break;
        default: v = 0;
      }
      return sort.dir === 'desc' ? -v : v;
    });
  }, [opportunities, sort, searchText]);

  const onSort = useCallback((col: OpportunitySortCol) => setSort(prev => toggleSort(prev, col)), []);

  return (
    <div className="bg-board-bg border border-board-border rounded overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-board-panel border-b border-board-border">
          <tr>
            <th className="w-8 px-2 py-1.5"></th>
            <SortHeader label="Opportunity" col="name" sort={sort} onSort={onSort} />
            <SortHeader label="Company" col="company" sort={sort} onSort={onSort} />
            <SortHeader label="Stage" col="stage" sort={sort} onSort={onSort} />
            <SortHeader label="Status" col="status" sort={sort} onSort={onSort} />
            <SortHeader label="Revenue" col="revenue" sort={sort} onSort={onSort} className="text-right" />
            <SortHeader label="Weighted" col="weighted" sort={sort} onSort={onSort} className="text-right" />
            <SortHeader label="Prob" col="probability" sort={sort} onSort={onSort} className="text-right" />
            <SortHeader label="Close Date" col="closeDate" sort={sort} onSort={onSort} />
            <SortHeader label="Rep" col="rep" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map(opp => (
            <tr key={opp.id} className="border-b border-board-border/50 hover:bg-board-border/30">
              <td className="px-2 py-1.5">
                <button onClick={() => togglePin(opp.id)} className="text-blue-400 p-0.5"><Pin size={12} fill="currentColor" /></button>
              </td>
              <td className="px-2 py-1.5 text-white font-medium truncate max-w-[300px]">{opp.opportunityName}</td>
              <td className="px-2 py-1.5 text-gray-400 text-xs truncate max-w-[200px]">{opp.companyName}</td>
              <td className="px-2 py-1.5">{opp.stage && <span className={`text-[10px] px-1.5 py-0.5 rounded ${getStageColor(opp.stage)} text-white`}>{opp.stage}</span>}</td>
              <td className="px-2 py-1.5">{opp.status && <span className={`text-xs ${getOpportunityStatusColor(opp.status)}`}>{opp.status}</span>}</td>
              <td className="px-2 py-1.5 text-xs font-semibold text-green-400 text-right whitespace-nowrap">{formatCurrency(opp.expectedRevenue)}</td>
              <td className="px-2 py-1.5 text-xs text-emerald-400/70 text-right whitespace-nowrap">{opp.weightedValue != null ? formatCurrency(opp.weightedValue) : ''}</td>
              <td className="px-2 py-1.5 text-xs text-gray-500 text-right">{opp.probability != null ? `${opp.probability}%` : ''}</td>
              <td className="px-2 py-1.5 text-xs text-gray-500 whitespace-nowrap">{opp.closeDate || ''}</td>
              <td className="px-2 py-1.5 text-xs text-gray-500 truncate max-w-[120px]">{opp.salesRep}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================
// Service ticket list table
// ============================================
type TicketSortCol = 'id' | 'summary' | 'company' | 'priority' | 'status' | 'assignee' | 'board' | 'hours' | 'budget';

function TicketListTable({ tickets, togglePin, searchText }: { tickets: ServiceTicket[]; togglePin: (id: number) => void; searchText: string }) {
  const [sort, setSort] = useState<SortState<TicketSortCol>>({ col: 'id', dir: 'desc' });

  const sorted = useMemo(() => {
    const filtered = searchText
      ? tickets.filter(t => `${t.summary} ${t.companyName} ${t.status} ${t.priority} ${t.assignedTo} ${t.externalId} ${t.boardName}`.toLowerCase().includes(searchText.toLowerCase()))
      : tickets;

    return [...filtered].sort((a, b) => {
      let v: number;
      switch (sort.col) {
        case 'id': v = cmp(Number(a.externalId) || 0, Number(b.externalId) || 0); break;
        case 'summary': v = cmp(a.summary, b.summary); break;
        case 'company': v = cmp(a.companyName, b.companyName); break;
        case 'priority': v = cmp(a.priority, b.priority); break;
        case 'status': v = cmp(a.status, b.status); break;
        case 'assignee': v = cmp(a.assignedTo, b.assignedTo); break;
        case 'board': v = cmp(a.boardName, b.boardName); break;
        case 'hours': v = cmp(a.hoursRemaining, b.hoursRemaining); break;
        case 'budget': v = cmp(a.budget, b.budget); break;
        default: v = 0;
      }
      return sort.dir === 'desc' ? -v : v;
    });
  }, [tickets, sort, searchText]);

  const onSort = useCallback((col: TicketSortCol) => setSort(prev => toggleSort(prev, col)), []);

  return (
    <div className="bg-board-bg border border-board-border rounded overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-board-panel border-b border-board-border">
          <tr>
            <th className="w-8 px-2 py-1.5"></th>
            <SortHeader label="#" col="id" sort={sort} onSort={onSort} />
            <SortHeader label="Summary" col="summary" sort={sort} onSort={onSort} />
            <SortHeader label="Company" col="company" sort={sort} onSort={onSort} />
            <SortHeader label="Board" col="board" sort={sort} onSort={onSort} />
            <SortHeader label="Priority" col="priority" sort={sort} onSort={onSort} />
            <SortHeader label="Status" col="status" sort={sort} onSort={onSort} />
            <SortHeader label="Assignee" col="assignee" sort={sort} onSort={onSort} />
            <SortHeader label="Hrs Rem" col="hours" sort={sort} onSort={onSort} className="text-right" />
            <SortHeader label="Budget" col="budget" sort={sort} onSort={onSort} className="text-right" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(ticket => {
            const statusColors = getTicketStatusColor(ticket.status);
            return (
              <tr key={ticket.id} className="border-b border-board-border/50 hover:bg-board-border/30">
                <td className="px-2 py-1.5">
                  <button onClick={() => togglePin(ticket.id)} className="text-blue-400 p-0.5"><Pin size={12} fill="currentColor" /></button>
                </td>
                <td className="px-2 py-1.5 text-[10px] font-mono text-gray-500">#{ticket.externalId}</td>
                <td className="px-2 py-1.5 text-white font-medium truncate max-w-[300px]">{ticket.summary || 'No summary'}</td>
                <td className="px-2 py-1.5 text-gray-400 text-xs truncate max-w-[200px]">{ticket.companyName}</td>
                <td className="px-2 py-1.5 text-xs text-gray-500 truncate max-w-[120px]">{ticket.boardName}</td>
                <td className="px-2 py-1.5">{ticket.priority && <span className={`text-[10px] px-1.5 py-0.5 rounded ${getPriorityColor(ticket.priority)}`}>{ticket.priority}</span>}</td>
                <td className="px-2 py-1.5"><span className={`text-xs ${statusColors.text}`}>{ticket.status}</span></td>
                <td className="px-2 py-1.5 text-xs text-gray-500 truncate max-w-[120px]">{ticket.assignedTo}</td>
                <td className="px-2 py-1.5 text-xs text-gray-400 text-right">{ticket.hoursRemaining != null ? formatHours(ticket.hoursRemaining) : ''}</td>
                <td className="px-2 py-1.5 text-xs text-gray-500 text-right whitespace-nowrap">{ticket.budget != null ? formatCurrency(ticket.budget) : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================
// Main PinnedView component
// ============================================
export default function PinnedView({ pinnedProjects, pinnedOpportunities, pinnedServiceTickets, togglePin }: PinnedViewProps) {
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    try { return (localStorage.getItem('cw-dashboard-pinned-view') as 'cards' | 'list') || 'cards'; } catch { return 'cards'; }
  });
  const [searchText, setSearchText] = useState('');

  const toggleViewMode = useCallback(() => {
    setViewMode(prev => {
      const next = prev === 'cards' ? 'list' : 'cards';
      try { localStorage.setItem('cw-dashboard-pinned-view', next); } catch {}
      return next;
    });
  }, []);

  const [projects, setProjects] = useState<Project[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [serviceTickets, setServiceTickets] = useState<ServiceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const { lastMessage } = useWebSocket();

  // Detail fields to display on project cards
  const [visibleDetailFields, setVisibleDetailFields] = useState<string[]>([]);

  // Sync status for all types
  const [syncStatus, setSyncStatus] = useState<SyncStatusState>({
    projects: null,
    opportunities: null,
    serviceTickets: null,
  });

  const isElectronApp = isElectron();

  // Fetch sync status
  const fetchSyncStatus = useCallback(async () => {
    try {
      const status = await sync.getStatus();
      setSyncStatus({
        projects: status.projects?.lastSync || null,
        opportunities: status.opportunities?.lastSync || null,
        serviceTickets: status.serviceTickets?.lastSync || null,
      });
    } catch {
      // Silently fail
    }
  }, []);

  // Fetch sync status on mount and listen for sync completed events
  useEffect(() => {
    fetchSyncStatus();
    const interval = setInterval(fetchSyncStatus, 60000);

    let unsubCompleted: (() => void) | undefined;
    if (isElectronApp && events) {
      unsubCompleted = events.on('sync:completed', () => {
        fetchSyncStatus();
      });
    }

    return () => {
      clearInterval(interval);
      if (unsubCompleted) unsubCompleted();
    };
  }, [fetchSyncStatus, isElectronApp]);

  // Fetch visible detail fields setting
  useEffect(() => {
    if (settings) {
      settings.get(PROJECT_DETAIL_VISIBLE_FIELDS_KEY).then(value => {
        if (value) {
          try {
            setVisibleDetailFields(JSON.parse(value));
          } catch {
            setVisibleDetailFields([]);
          }
        }
      }).catch(() => {});
    }
  }, []);

  // Fetch pinned items
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch all data and filter to pinned items
        const [allProjects, allOpportunities, allServiceTickets] = await Promise.all([
          projectsApi.getAll({ includeInactive: true }), // Include inactive for pinned
          opportunitiesApi.getAll({}),
          serviceTicketsApi.getAll({}),
        ]);

        setProjects(allProjects.filter(p => pinnedProjects.includes(p.id)));
        setOpportunities(allOpportunities.filter(o => pinnedOpportunities.includes(o.id)));
        setServiceTickets(allServiceTickets.filter(t => pinnedServiceTickets.includes(t.id)));
      } catch (error) {
        console.error('Failed to fetch pinned items:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [pinnedProjects, pinnedOpportunities, pinnedServiceTickets]);

  // Handle WebSocket updates (web mode only - Electron uses IPC events)
  useEffect(() => {
    if (isElectronApp || !lastMessage) return;
    const { type } = lastMessage;

    if (type.startsWith('project_')) {
      projectsApi.getAll({ includeInactive: true }).then(all => {
        setProjects(all.filter(p => pinnedProjects.includes(p.id)));
      }).catch(console.error);
    }
    if (type.startsWith('opportunity_')) {
      opportunitiesApi.getAll({}).then(all => {
        setOpportunities(all.filter(o => pinnedOpportunities.includes(o.id)));
      }).catch(console.error);
    }
    if (type.startsWith('service_ticket_')) {
      serviceTicketsApi.getAll({}).then(all => {
        setServiceTickets(all.filter(t => pinnedServiceTickets.includes(t.id)));
      }).catch(console.error);
    }
  }, [lastMessage, pinnedProjects, pinnedOpportunities, pinnedServiceTickets, isElectronApp]);

  const isEmpty = pinnedProjects.length === 0 && pinnedOpportunities.length === 0 && pinnedServiceTickets.length === 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)]">
        <div className="text-gray-400">Loading pinned items...</div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-56px)] text-gray-500">
        <Pin size={48} className="mb-4 opacity-50" />
        <p className="text-lg">No pinned items</p>
        <p className="text-sm mt-2">Click the pin icon on any project, opportunity, or ticket to pin it here</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-board-panel border-b border-board-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500">
            <Pin size={16} className="text-white" />
            <span className="text-white font-semibold">Pinned Items</span>
            <span className="text-white/80 text-sm">
              {projects.length + opportunities.length + serviceTickets.length}
            </span>
          </div>
          <button
            onClick={toggleViewMode}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-board-bg border border-board-border text-gray-300 hover:text-white hover:border-gray-500 transition-colors text-sm"
            title={viewMode === 'cards' ? 'Switch to list view' : 'Switch to card view'}
          >
            {viewMode === 'cards' ? <List size={14} /> : <LayoutGrid size={14} />}
            {viewMode === 'cards' ? 'List' : 'Cards'}
          </button>
          {viewMode === 'list' && (
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Filter..."
                className="pl-8 pr-3 py-1.5 text-sm bg-board-bg border border-board-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-48"
              />
            </div>
          )}
        </div>

        {/* Sync status for all types */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-gray-400">
            <FolderKanban size={12} className="text-purple-400" />
            <Clock size={10} />
            <span className="text-gray-300">{formatLastSync(syncStatus.projects)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <TrendingUp size={12} className="text-emerald-400" />
            <Clock size={10} />
            <span className="text-gray-300">{formatLastSync(syncStatus.opportunities)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <Ticket size={12} className="text-orange-400" />
            <Clock size={10} />
            <span className="text-gray-300">{formatLastSync(syncStatus.serviceTickets)}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Pinned Projects */}
        {projects.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <FolderKanban size={18} className="text-purple-400" />
              <h2 className="text-lg font-semibold text-white">Projects</h2>
              <span className="text-sm text-gray-500">({projects.length})</span>
            </div>
            {viewMode === 'cards' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-3">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    isPinned={true}
                    onTogglePin={() => togglePin('projects', project.id)}
                    visibleDetailFields={visibleDetailFields}
                    onProjectUpdated={(updated) => setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))}
                  />
                ))}
              </div>
            ) : (
              <ProjectListTable projects={projects} togglePin={(id) => togglePin('projects', id)} searchText={searchText} />
            )}
          </section>
        )}

        {/* Pinned Opportunities */}
        {opportunities.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={18} className="text-emerald-400" />
              <h2 className="text-lg font-semibold text-white">Opportunities</h2>
              <span className="text-sm text-gray-500">({opportunities.length})</span>
            </div>
            {viewMode === 'cards' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-3">
                {opportunities.map((opportunity) => (
                  <OpportunityCard
                    key={opportunity.id}
                    opportunity={opportunity}
                    isPinned={true}
                    onTogglePin={() => togglePin('opportunities', opportunity.id)}
                  />
                ))}
              </div>
            ) : (
              <OpportunityListTable opportunities={opportunities} togglePin={(id) => togglePin('opportunities', id)} searchText={searchText} />
            )}
          </section>
        )}

        {/* Pinned Service Tickets */}
        {serviceTickets.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Ticket size={18} className="text-orange-400" />
              <h2 className="text-lg font-semibold text-white">Service Tickets</h2>
              <span className="text-sm text-gray-500">({serviceTickets.length})</span>
            </div>
            {viewMode === 'cards' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-3">
                {serviceTickets.map((ticket) => (
                  <ServiceTicketCard
                    key={ticket.id}
                    ticket={ticket}
                    isPinned={true}
                    onTogglePin={() => togglePin('service-tickets', ticket.id)}
                  />
                ))}
              </div>
            ) : (
              <TicketListTable tickets={serviceTickets} togglePin={(id) => togglePin('service-tickets', id)} searchText={searchText} />
            )}
          </section>
        )}
      </div>
    </div>
  );
}

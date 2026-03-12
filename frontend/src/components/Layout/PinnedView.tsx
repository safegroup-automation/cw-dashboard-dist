import { useState, useEffect, useCallback } from 'react';
import { Pin, FolderKanban, TrendingUp, Ticket, Clock, LayoutGrid, List } from 'lucide-react';
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

function ProjectListRow({ project, onTogglePin }: { project: Project; onTogglePin: () => void }) {
  const hoursEst = project.hoursOverride ?? project.hoursEstimate;
  const pct = hoursEst && hoursEst > 0 && project.hoursActual != null
    ? Math.round((project.hoursActual / hoursEst) * 100) : null;
  const pctColor = pct === null ? '' : pct >= 100 ? 'text-red-400' : pct >= 80 ? 'text-yellow-400' : 'text-green-400';

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 hover:bg-board-border/30 border-b border-board-border/50 text-sm">
      <button onClick={() => onTogglePin()} className="text-blue-400 p-0.5 flex-shrink-0"><Pin size={12} fill="currentColor" /></button>
      <span className="text-white truncate flex-1 min-w-0 font-medium">{project.projectName}</span>
      <span className="text-gray-400 truncate max-w-[180px] text-xs">{project.clientName}</span>
      <span className={`text-xs px-1.5 py-0.5 rounded ${getProjectStatusColor(project.status)}`}>{project.status}</span>
      {pct !== null && <span className={`text-xs w-12 text-right ${pctColor}`}>{pct}%</span>}
      {project.hoursActual != null && <span className="text-xs text-gray-500 w-16 text-right">{formatHours(project.hoursActual)}/{formatHours(hoursEst)}</span>}
    </div>
  );
}

function OpportunityListRow({ opportunity, onTogglePin }: { opportunity: Opportunity; onTogglePin: () => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 hover:bg-board-border/30 border-b border-board-border/50 text-sm">
      <button onClick={() => onTogglePin()} className="text-blue-400 p-0.5 flex-shrink-0"><Pin size={12} fill="currentColor" /></button>
      <span className="text-white truncate flex-1 min-w-0 font-medium">{opportunity.opportunityName}</span>
      <span className="text-gray-400 truncate max-w-[180px] text-xs">{opportunity.companyName}</span>
      {opportunity.stage && <span className={`text-[10px] px-1.5 py-0.5 rounded ${getStageColor(opportunity.stage)} text-white`}>{opportunity.stage}</span>}
      {opportunity.status && <span className={`text-xs ${getOpportunityStatusColor(opportunity.status)}`}>{opportunity.status}</span>}
      <span className="text-xs font-semibold text-green-400 w-20 text-right">{formatCurrency(opportunity.expectedRevenue)}</span>
      {opportunity.salesRep && <span className="text-xs text-gray-500 truncate max-w-[100px]">{opportunity.salesRep}</span>}
    </div>
  );
}

function ServiceTicketListRow({ ticket, onTogglePin }: { ticket: ServiceTicket; onTogglePin: () => void }) {
  const statusColors = getTicketStatusColor(ticket.status);
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 hover:bg-board-border/30 border-b border-board-border/50 text-sm">
      <button onClick={() => onTogglePin()} className="text-blue-400 p-0.5 flex-shrink-0"><Pin size={12} fill="currentColor" /></button>
      <span className="text-[10px] font-mono text-gray-500 flex-shrink-0">#{ticket.externalId}</span>
      <span className="text-white truncate flex-1 min-w-0 font-medium">{ticket.summary || 'No summary'}</span>
      <span className="text-gray-400 truncate max-w-[180px] text-xs">{ticket.companyName}</span>
      {ticket.priority && <span className={`text-[10px] px-1.5 py-0.5 rounded ${getPriorityColor(ticket.priority)}`}>{ticket.priority}</span>}
      <span className={`text-xs ${statusColors.text}`}>{ticket.status}</span>
      {ticket.assignedTo && <span className="text-xs text-gray-500 truncate max-w-[100px]">{ticket.assignedTo}</span>}
      {ticket.hoursRemaining != null && <span className="text-xs text-gray-400 w-12 text-right">{formatHours(ticket.hoursRemaining)}h</span>}
    </div>
  );
}

export default function PinnedView({ pinnedProjects, pinnedOpportunities, pinnedServiceTickets, togglePin }: PinnedViewProps) {
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    try { return (localStorage.getItem('cw-dashboard-pinned-view') as 'cards' | 'list') || 'cards'; } catch { return 'cards'; }
  });
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
              <div className="bg-board-bg border border-board-border rounded overflow-hidden">
                {projects.map((project) => (
                  <ProjectListRow key={project.id} project={project} onTogglePin={() => togglePin('projects', project.id)} />
                ))}
              </div>
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
              <div className="bg-board-bg border border-board-border rounded overflow-hidden">
                {opportunities.map((opportunity) => (
                  <OpportunityListRow key={opportunity.id} opportunity={opportunity} onTogglePin={() => togglePin('opportunities', opportunity.id)} />
                ))}
              </div>
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
              <div className="bg-board-bg border border-board-border rounded overflow-hidden">
                {serviceTickets.map((ticket) => (
                  <ServiceTicketListRow key={ticket.id} ticket={ticket} onTogglePin={() => togglePin('service-tickets', ticket.id)} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

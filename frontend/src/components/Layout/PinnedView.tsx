import { useState, useEffect, useCallback } from 'react';
import { Pin, FolderKanban, TrendingUp, Ticket, Clock } from 'lucide-react';
import { Project, Opportunity, ServiceTicket } from '../../types';
import { projects as projectsApi, opportunities as opportunitiesApi, serviceTickets as serviceTicketsApi, isElectron, settings, sync, events } from '../../api';
import { formatLastSync } from './FullPageViewHeader';
import { useWebSocket } from '../../context/WebSocketContext';
import ProjectCard from '../Project/ProjectCard';
import OpportunityCard from '../Opportunity/OpportunityCard';
import ServiceTicketCard from '../ServiceTicket/ServiceTicketCard';

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

export default function PinnedView({ pinnedProjects, pinnedOpportunities, pinnedServiceTickets, togglePin }: PinnedViewProps) {
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
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500">
          <Pin size={16} className="text-white" />
          <span className="text-white font-semibold">Pinned Items</span>
          <span className="text-white/80 text-sm">
            {projects.length + opportunities.length + serviceTickets.length}
          </span>
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
          </section>
        )}
      </div>
    </div>
  );
}

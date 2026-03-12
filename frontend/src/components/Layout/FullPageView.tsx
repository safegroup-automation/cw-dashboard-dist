import { useState, useEffect, useMemo, useCallback } from 'react';
import { FolderKanban, TrendingUp, Ticket } from 'lucide-react';
import { Project, Opportunity, ServiceTicket } from '../../types';
import { projects as projectsApi, opportunities as opportunitiesApi, serviceTickets as serviceTicketsApi, isElectron, settings, sync, events } from '../../api';
import { useWebSocket } from '../../context/WebSocketContext';
import ProjectCard from '../Project/ProjectCard';
import OpportunityCard from '../Opportunity/OpportunityCard';
import ServiceTicketCard from '../ServiceTicket/ServiceTicketCard';
import DetailFieldsModal from '../Project/DetailFieldsModal';
import FullPageViewHeader, { ViewMode } from './FullPageViewHeader';
import { ProjectFilters, OpportunityFilters, ServiceTicketFilters } from './FilterBar';
import { ProjectRawDataView, OpportunityRawDataView, ServiceTicketRawDataView } from './RawDataView';

// Setting key for visible detail fields
const PROJECT_DETAIL_VISIBLE_FIELDS_KEY = 'project_detail_visible_fields';

type ViewType = 'projects' | 'opportunities' | 'service-tickets';

interface FullPageViewProps {
  type: ViewType;
  isPinned: (type: ViewType, id: number) => boolean;
  togglePin: (type: ViewType, id: number) => void;
}

// Parse PM name from notes field
const parsePMFromNotes = (notes: string | undefined): string | null => {
  if (!notes) return null;
  const match = notes.match(/PM:\s*([^|]+)/);
  return match ? match[1].trim() : null;
};

const TYPE_CONFIG = {
  projects: { icon: FolderKanban, color: 'bg-purple-500', label: 'Projects' },
  opportunities: { icon: TrendingUp, color: 'bg-emerald-500', label: 'Opportunities' },
  'service-tickets': { icon: Ticket, color: 'bg-orange-500', label: 'Service Tickets' },
} as const;

export default function FullPageView({ type, isPinned, togglePin }: FullPageViewProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [serviceTickets, setServiceTickets] = useState<ServiceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const { lastMessage } = useWebSocket();

  // View mode toggle
  const [viewMode, setViewMode] = useState<ViewMode>('detailed');

  // Project-specific filters
  const [statusFilter, setStatusFilter] = useState('');
  const [pmFilter, setPmFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [projectStatuses, setProjectStatuses] = useState<string[]>([]);

  // Opportunity-specific filters - default to "1. Open" stage
  const [stageFilter, setStageFilter] = useState(type === 'opportunities' ? '1. Open' : '');
  const [oppStatusFilter, setOppStatusFilter] = useState('');
  const [salesRepFilter, setSalesRepFilter] = useState('');
  const [stages, setStages] = useState<string[]>([]);
  const [oppStatuses, setOppStatuses] = useState<string[]>([]);
  const [salesReps, setSalesReps] = useState<string[]>([]);

  // Service ticket-specific filters
  const [ticketStatusFilter, setTicketStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [ticketStatuses, setTicketStatuses] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);

  // Detail fields to display on project cards
  const [visibleDetailFields, setVisibleDetailFields] = useState<string[]>([]);
  const [showDetailFieldsModal, setShowDetailFieldsModal] = useState(false);

  // Check if running in Electron
  const isElectronApp = isElectron();

  // Sync status for this page type
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Fetch sync status
  const fetchSyncStatus = useCallback(async () => {
    try {
      const status = await sync.getStatus();
      if (type === 'projects') {
        setLastSync(status.projects?.lastSync || null);
      } else if (type === 'opportunities') {
        setLastSync(status.opportunities?.lastSync || null);
      } else if (type === 'service-tickets') {
        setLastSync(status.serviceTickets?.lastSync || null);
      }
    } catch {
      // Silently fail
    }
  }, [type]);

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
    if (type === 'projects' && settings) {
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
  }, [type]);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (type === 'projects') {
          const [data, statusesData] = await Promise.all([
            projectsApi.getAll({ includeInactive: showInactive }),
            projectsApi.getStatuses(),
          ]);
          setProjects(data);
          setProjectStatuses(statusesData);
        } else if (type === 'opportunities') {
          const [data, stagesData, repsData] = await Promise.all([
            opportunitiesApi.getAll({}),
            opportunitiesApi.getStages(),
            opportunitiesApi.getSalesReps(),
          ]);
          setOpportunities(data);
          setStages(stagesData);
          setSalesReps(repsData);
          // Fetch statuses separately - column may not exist if migration hasn't run
          try {
            const statusesData = await opportunitiesApi.getStatuses();
            setOppStatuses(statusesData);
          } catch {
            setOppStatuses([]);
          }
        } else if (type === 'service-tickets') {
          const [data, statusesData, prioritiesData, assigneesData] = await Promise.all([
            serviceTicketsApi.getAll({}),
            serviceTicketsApi.getStatuses(),
            serviceTicketsApi.getPriorities(),
            serviceTicketsApi.getAssignees(),
          ]);
          setServiceTickets(data);
          setTicketStatuses(statusesData);
          setPriorities(prioritiesData);
          setAssignees(assigneesData);
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [type, showInactive]);

  // Handle WebSocket updates (web mode only - Electron uses IPC events)
  useEffect(() => {
    if (isElectronApp || !lastMessage) return;
    const { type: msgType } = lastMessage;

    if (type === 'projects' && msgType.startsWith('project_')) {
      projectsApi.getAll({ includeInactive: showInactive }).then(setProjects).catch(console.error);
    }
    if (type === 'opportunities' && msgType.startsWith('opportunity_')) {
      opportunitiesApi.getAll({}).then(setOpportunities).catch(console.error);
    }
    if (type === 'service-tickets' && msgType.startsWith('service_ticket_')) {
      serviceTicketsApi.getAll({}).then(setServiceTickets).catch(console.error);
    }
  }, [lastMessage, type, isElectronApp, showInactive]);

  // Get unique PMs from projects
  const allPMs = useMemo(() => {
    const pms = new Set<string>();
    projects.forEach(p => {
      const pm = parsePMFromNotes(p.notes);
      if (pm) pms.add(pm);
    });
    return Array.from(pms).sort((a, b) => a.localeCompare(b));
  }, [projects]);

  // Filter projects
  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      if (statusFilter && project.status !== statusFilter) return false;
      if (pmFilter) {
        const pm = parsePMFromNotes(project.notes);
        if (pm !== pmFilter) return false;
      }
      if (searchText.trim()) {
        const search = searchText.toLowerCase().trim();
        const matchesClient = project.clientName.toLowerCase().includes(search);
        const matchesProject = project.projectName.toLowerCase().includes(search);
        if (!matchesClient && !matchesProject) return false;
      }
      return true;
    });
  }, [projects, statusFilter, pmFilter, searchText]);

  // Filter opportunities
  const filteredOpportunities = useMemo(() => {
    return opportunities.filter(o => {
      if (stageFilter && o.stage !== stageFilter) return false;
      if (oppStatusFilter && o.status !== oppStatusFilter) return false;
      if (salesRepFilter && o.salesRep !== salesRepFilter) return false;
      if (searchText.trim()) {
        const search = searchText.toLowerCase().trim();
        const matchesCompany = o.companyName?.toLowerCase().includes(search);
        const matchesName = o.opportunityName?.toLowerCase().includes(search);
        if (!matchesCompany && !matchesName) return false;
      }
      return true;
    });
  }, [opportunities, stageFilter, oppStatusFilter, salesRepFilter, searchText]);

  // Filter service tickets
  const filteredServiceTickets = useMemo(() => {
    return serviceTickets.filter(t => {
      if (ticketStatusFilter && t.status !== ticketStatusFilter) return false;
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (assigneeFilter && t.assignedTo !== assigneeFilter) return false;
      if (searchText.trim()) {
        const search = searchText.toLowerCase().trim();
        const matchesSummary = t.summary?.toLowerCase().includes(search);
        const matchesCompany = t.companyName?.toLowerCase().includes(search);
        const matchesExternal = t.externalId?.toLowerCase().includes(search);
        if (!matchesSummary && !matchesCompany && !matchesExternal) return false;
      }
      return true;
    });
  }, [serviceTickets, ticketStatusFilter, priorityFilter, assigneeFilter, searchText]);

  const hasActiveFilters = type === 'projects'
    ? statusFilter !== '' || pmFilter !== '' || searchText.trim() !== '' || showInactive
    : type === 'opportunities'
    ? stageFilter !== '' || oppStatusFilter !== '' || salesRepFilter !== '' || searchText.trim() !== ''
    : ticketStatusFilter !== '' || priorityFilter !== '' || assigneeFilter !== '' || searchText.trim() !== '';

  const items = type === 'projects'
    ? filteredProjects
    : type === 'opportunities'
    ? filteredOpportunities
    : filteredServiceTickets;

  const totalCount = type === 'projects'
    ? projects.length
    : type === 'opportunities'
    ? opportunities.length
    : serviceTickets.length;

  const config = TYPE_CONFIG[type];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)]">
        <div className="text-gray-400">Loading {config.label.toLowerCase()}...</div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col overflow-hidden">
      {/* Header */}
      <FullPageViewHeader
        icon={config.icon}
        color={config.color}
        label={config.label}
        itemCount={items.length}
        totalCount={totalCount}
        hasActiveFilters={hasActiveFilters}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(!showFilters)}
        searchText={searchText}
        onSearchChange={setSearchText}
        showDetailSettings={type === 'projects'}
        onOpenDetailSettings={() => setShowDetailFieldsModal(true)}
        lastSync={lastSync}
      />

      {/* Filters */}
      {showFilters && (
        <div className="px-4 py-3 bg-board-panel border-b border-board-border flex items-center gap-3 flex-shrink-0">
          {type === 'projects' && (
            <ProjectFilters
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              projectStatuses={projectStatuses}
              pmFilter={pmFilter}
              setPmFilter={setPmFilter}
              allPMs={allPMs}
              showInactive={showInactive}
              setShowInactive={setShowInactive}
            />
          )}
          {type === 'opportunities' && (
            <OpportunityFilters
              stageFilter={stageFilter}
              setStageFilter={setStageFilter}
              stages={stages}
              statusFilter={oppStatusFilter}
              setStatusFilter={setOppStatusFilter}
              statuses={oppStatuses}
              salesRepFilter={salesRepFilter}
              setSalesRepFilter={setSalesRepFilter}
              salesReps={salesReps}
            />
          )}
          {type === 'service-tickets' && (
            <ServiceTicketFilters
              ticketStatusFilter={ticketStatusFilter}
              setTicketStatusFilter={setTicketStatusFilter}
              ticketStatuses={ticketStatuses}
              priorityFilter={priorityFilter}
              setPriorityFilter={setPriorityFilter}
              priorities={priorities}
              assigneeFilter={assigneeFilter}
              setAssigneeFilter={setAssigneeFilter}
              assignees={assignees}
            />
          )}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            {hasActiveFilters ? `No matching ${config.label.toLowerCase()}` : `No ${config.label.toLowerCase()}`}
          </div>
        ) : viewMode === 'raw' ? (
          /* Raw data view */
          <>
            {type === 'projects' && <ProjectRawDataView projects={filteredProjects} />}
            {type === 'opportunities' && <OpportunityRawDataView opportunities={filteredOpportunities} />}
            {type === 'service-tickets' && <ServiceTicketRawDataView tickets={filteredServiceTickets} />}
          </>
        ) : (
          /* Normal card view */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-3">
            {type === 'projects' && filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isPinned={isPinned('projects', project.id)}
                onTogglePin={() => togglePin('projects', project.id)}
                alwaysExpanded={viewMode === 'detailed'}
                visibleDetailFields={visibleDetailFields}
                onProjectUpdated={(updated) => setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))}
              />
            ))}
            {type === 'opportunities' && filteredOpportunities.map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                opportunity={opportunity}
                isPinned={isPinned('opportunities', opportunity.id)}
                onTogglePin={() => togglePin('opportunities', opportunity.id)}
                alwaysExpanded={viewMode === 'detailed'}
              />
            ))}
            {type === 'service-tickets' && filteredServiceTickets.map((ticket) => (
              <ServiceTicketCard
                key={ticket.id}
                ticket={ticket}
                isPinned={isPinned('service-tickets', ticket.id)}
                onTogglePin={() => togglePin('service-tickets', ticket.id)}
                alwaysExpanded={viewMode === 'detailed'}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Fields Modal */}
      <DetailFieldsModal
        isOpen={showDetailFieldsModal}
        onClose={() => setShowDetailFieldsModal(false)}
        onSave={(fields) => setVisibleDetailFields(fields)}
      />
    </div>
  );
}

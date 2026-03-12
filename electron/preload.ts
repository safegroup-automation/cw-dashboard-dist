import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Type definitions for the exposed API
export interface ElectronAPI {
  // Projects
  projects: {
    getAll: (options?: ProjectQueryOptions) => Promise<Project[]>;
    getById: (id: number) => Promise<Project | null>;
    getByExternalId: (externalId: string) => Promise<Project | null>;
    clearAll: () => Promise<ClearDataResult>;
    getAvailableDetailFields: () => Promise<string[]>;
    getDetailSyncDiagnostics: () => Promise<ProjectDetailDiagnostics>;
    updateHoursOverride: (id: number, hoursOverride: number | null) => Promise<Project | null>;
  };

  // Opportunities
  opportunities: {
    getAll: (options?: OpportunityQueryOptions) => Promise<Opportunity[]>;
    getById: (id: number) => Promise<Opportunity | null>;
    getByExternalId: (externalId: string) => Promise<Opportunity | null>;
    getStages: () => Promise<string[]>;
    getStatuses: () => Promise<string[]>;
    getSalesReps: () => Promise<string[]>;
    clearAll: () => Promise<ClearDataResult>;
  };

  // Service Tickets
  serviceTickets: {
    getAll: (options?: ServiceTicketQueryOptions) => Promise<ServiceTicket[]>;
    getById: (id: number) => Promise<ServiceTicket | null>;
    getByExternalId: (externalId: string) => Promise<ServiceTicket | null>;
    getStatuses: () => Promise<string[]>;
    getPriorities: () => Promise<string[]>;
    getAssignees: () => Promise<string[]>;
    getCompanies: () => Promise<string[]>;
    getBoards: () => Promise<string[]>;
    clearAll: () => Promise<ClearDataResult>;
  };

  // Sync
  sync: {
    request: (syncType: 'PROJECTS' | 'OPPORTUNITIES' | 'SERVICE_TICKETS' | 'ALL') => Promise<SyncRequestResult>;
    getStatus: () => Promise<SyncStatus>;
    getHistory: (options?: SyncHistoryOptions) => Promise<SyncHistory[]>;
    getChanges: (syncHistoryId: number) => Promise<EntityChangeSummary[]>;
    cancel: (syncId: number) => Promise<void>;
    clearHistory: () => Promise<ClearHistoryResult>;
  };

  // ATOM Feeds
  feeds: {
    getAll: () => Promise<AtomFeed[]>;
    import: (filePath: string) => Promise<AtomFeed[]>;
    importFromDialog: () => Promise<AtomFeed[]>;
    delete: (feedId: number) => Promise<void>;
    test: (feedId: number) => Promise<FeedTestResult>;
    update: (feedId: number, updates: { name?: string; feedType?: 'PROJECTS' | 'OPPORTUNITIES' | 'SERVICE_TICKETS' | 'PROJECT_DETAIL' }) => Promise<AtomFeed | null>;
    linkDetail: (summaryFeedId: number, detailFeedId: number) => Promise<AtomFeed | null>;
    unlinkDetail: (summaryFeedId: number) => Promise<AtomFeed | null>;
    getDetailFeeds: () => Promise<AtomFeed[]>;
    getDetailSyncDiagnostics: () => Promise<FeedDetailDiagnostics>;
    testFetchProjectDetail: (projectId?: string) => Promise<TestFetchDetailResult>;
    getAvailableTemplates: () => Promise<FeedTemplate[]>;
    exportTemplates: () => Promise<ExportTemplatesResult>;
    importTemplate: (filename: string) => Promise<AtomFeed[]>;
  };

  // Settings
  settings: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    getAll: () => Promise<Record<string, string>>;
  };

  // Updates
  updates: {
    check: () => Promise<UpdateCheckResult>;
    download: () => Promise<void>;
    install: () => Promise<void>;
    setGitHubToken: (token: string | null) => Promise<void>;
    getGitHubTokenStatus: () => Promise<GitHubTokenStatus>;
  };

  // Cloud Database
  cloud: {
    getStatus: () => Promise<CloudStatus>;
    testConnection: (connectionString: string) => Promise<CloudTestResult>;
    setConnectionString: (connectionString: string) => Promise<void>;
    connect: () => Promise<boolean>;
    disconnect: () => Promise<void>;
    setEnabled: (enabled: boolean) => Promise<void>;
  };

  // Employees
  employees: {
    getAll: (options?: EmployeeQueryOptions) => Promise<Employee[]>;
    getById: (id: number) => Promise<Employee | null>;
    create: (data: CreateEmployeeData) => Promise<Employee>;
    update: (id: number, data: Partial<CreateEmployeeData>) => Promise<Employee | null>;
    delete: (id: number) => Promise<boolean>;
    getDepartments: () => Promise<string[]>;
    reorder: (orderedIds: number[]) => Promise<void>;
    getCount: (isActive?: boolean) => Promise<number>;
  };

  // Quotations
  quotations: {
    getAll: (options?: QuotationQueryOptions) => Promise<Quotation[]>;
    getById: (id: number) => Promise<Quotation | null>;
    create: (data: CreateQuotationData) => Promise<Quotation>;
    update: (id: number, data: Partial<CreateQuotationData>) => Promise<Quotation | null>;
    delete: (id: number) => Promise<boolean>;
    getStatuses: () => Promise<QuotationStatus[]>;
    getPriorities: () => Promise<Priority[]>;
    getStats: () => Promise<QuotationStats>;
  };

  // Resource Tasks
  resourceTasks: {
    getAll: (options?: ResourceTaskQueryOptions) => Promise<ResourceTask[]>;
    getById: (id: number) => Promise<ResourceTask | null>;
    getByEmployee: (employeeId: number) => Promise<ResourceTask[]>;
    getUnassigned: () => Promise<ResourceTask[]>;
    create: (data: CreateResourceTaskData) => Promise<ResourceTask>;
    update: (id: number, data: Partial<CreateResourceTaskData>) => Promise<ResourceTask | null>;
    delete: (id: number) => Promise<boolean>;
    moveToEmployee: (taskId: number, employeeId: number | null, sortOrder?: number) => Promise<ResourceTask | null>;
    reorderForEmployee: (employeeId: number | null, orderedIds: number[]) => Promise<void>;
    getStatuses: () => Promise<TaskStatus[]>;
    getPriorities: () => Promise<TaskPriority[]>;
  };

  // Teams
  teams: {
    getAll: (options?: TeamQueryOptions) => Promise<Team[]>;
    getById: (id: number) => Promise<Team | null>;
    create: (data: CreateTeamData) => Promise<Team>;
    update: (id: number, data: Partial<CreateTeamData>) => Promise<Team | null>;
    delete: (id: number) => Promise<boolean>;
    getMembers: (teamId: number) => Promise<TeamMember[]>;
    addMember: (teamId: number, employeeId: number, isLead?: boolean) => Promise<TeamMember>;
    removeMember: (teamId: number, employeeId: number) => Promise<boolean>;
    setLead: (teamId: number, employeeId: number) => Promise<void>;
    getTeamsForEmployee: (employeeId: number) => Promise<Team[]>;
    reorder: (orderedIds: number[]) => Promise<void>;
  };

  // Events (main -> renderer)
  on: (channel: string, callback: (data: unknown) => void) => () => void;
  off: (channel: string, callback: (data: unknown) => void) => void;

  // App info
  getVersion: () => Promise<string>;
  getPlatform: () => NodeJS.Platform;
}

// Type definitions (these should match your existing types)
interface ProjectQueryOptions {
  status?: string;
  includeInactive?: boolean;
  limit?: number;
  offset?: number;
}

interface OpportunityQueryOptions {
  stage?: string;
  salesRep?: string;
  limit?: number;
  offset?: number;
}

interface ServiceTicketQueryOptions {
  status?: string;
  priority?: string;
  assignedTo?: string;
  companyName?: string;
  boardName?: string;
  limit?: number;
  offset?: number;
}

interface Project {
  id: number;
  externalId: string;
  clientName: string;
  projectName: string;
  budget: number | null;
  spent: number | null;
  hoursEstimate: number | null;
  hoursActual: number | null;
  hoursRemaining: number | null;
  hoursOverride: number | null;
  status: string;
  isActive: boolean;
  notes: string | null;
  rawData: string | null;
  detailRawData: string | null;
  createdAt: string;
  updatedAt: string;
  budgetRemaining?: number;
  budgetPercentUsed?: number;
  hoursPercentUsed?: number;
}

interface Opportunity {
  id: number;
  externalId: string;
  opportunityName: string;
  companyName: string;
  salesRep: string;
  stage: string;
  expectedRevenue: number | null;
  closeDate: string | null;
  probability: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  weightedValue?: number;
}

interface ServiceTicket {
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
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SyncHistory {
  id: number;
  syncType: string;
  status: string;
  triggeredBy: string;
  startedAt: string | null;
  completedAt: string | null;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  errorMessage: string | null;
  createdAt: string;
}

interface SyncStatus {
  projects: { lastSync: string | null; lastSyncId: number | null; recordsSynced: number };
  opportunities: { lastSync: string | null; lastSyncId: number | null; recordsSynced: number };
  serviceTickets: { lastSync: string | null; lastSyncId: number | null; recordsSynced: number };
  pendingSyncs: Array<{ id: number; syncType: string; status: string }>;
}

interface SyncRequestResult {
  ids: number[];
  message: string;
}

interface SyncHistoryOptions {
  syncType?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

interface EntityChangeSummary {
  entityType: string;
  entityId: number;
  externalId: string;
  changeType: string;
  fieldChanges: Array<{ fieldName: string; oldValue: string | null; newValue: string | null }>;
}

interface ClearHistoryResult {
  message: string;
  deletedHistory: number;
  deletedChanges: number;
}

interface ClearDataResult {
  deleted: number;
}

interface AtomFeed {
  id: number;
  name: string;
  feedType: 'PROJECTS' | 'OPPORTUNITIES' | 'SERVICE_TICKETS' | 'PROJECT_DETAIL';
  feedUrl: string;
  detailFeedId: number | null;
  lastSync: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FeedTestResult {
  success: boolean;
  recordCount?: number;
  error?: string;
}

interface UpdateCheckResult {
  updateAvailable: boolean;
  version?: string;
  releaseNotes?: string;
}

interface GitHubTokenStatus {
  hasToken: boolean;
  maskedToken: string | null;
}

interface ProjectDetailDiagnostics {
  projectsWithDetailData: number;
  totalProjects: number;
  sampleExternalIds: string[];
  sampleDetailData: { externalId: string; fieldCount: number; fields: string[] } | null;
  sampleRawDataFields: { externalId: string; allFields: string[]; idFields: Record<string, string> } | null;
}

interface FeedDetailDiagnostics {
  adaptiveSyncEnabled: boolean;
  projectsFeeds: { id: number; name: string; isActive: boolean; hasDetailLink: boolean; detailFeedId: number | null }[];
  detailFeeds: { id: number; name: string; isActive: boolean; feedUrl: string }[];
  linkedPairs: { projectsFeedId: number; projectsFeedName: string; detailFeedId: number; detailFeedName: string }[];
}

interface TestFetchDetailResult {
  success: boolean;
  projectId?: string;
  fieldCount?: number;
  fields?: Record<string, unknown>;
  error?: string;
  debug?: {
    detailFeedUrl: string;
    constructedUrl: string;
    xmlLength?: number;
    xmlPreview?: string;
    entryCount?: number;
  };
}

interface FeedTemplate {
  name: string;
  filename: string;
  type: string;
}

interface ExportTemplatesResult {
  exported: string[];
  errors: string[];
  cancelled: boolean;
}

// Cloud Database Types
interface CloudStatus {
  connected: boolean;
  enabled: boolean;
  lastConnected: string | null;
  lastError: string | null;
  databaseUrl: string | null;
}

interface CloudTestResult {
  success: boolean;
  message: string;
  schemaExists?: boolean;
}

// Employee Types
interface EmployeeQueryOptions {
  isActive?: boolean;
  department?: string;
  limit?: number;
  offset?: number;
}

interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  displayName: string | null;
  email: string | null;
  role: string | null;
  department: string | null;
  color: string;
  avatarUrl: string | null;
  isSenior: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface CreateEmployeeData {
  firstName: string;
  lastName: string;
  displayName?: string;
  email?: string;
  role?: string;
  department?: string;
  color?: string;
  avatarUrl?: string;
  isSenior?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

// Quotation Types
type QuotationStatus = 'draft' | 'sent' | 'follow_up' | 'won' | 'lost';
type Priority = 'low' | 'medium' | 'high' | 'urgent';

interface QuotationQueryOptions {
  status?: QuotationStatus;
  priority?: Priority;
  assignedTo?: number;
  limit?: number;
  offset?: number;
}

interface Quotation {
  id: number;
  reference: string | null;
  clientName: string;
  projectName: string | null;
  description: string | null;
  value: number | null;
  assignedTo: number | null;
  assignedToName?: string | null;
  status: QuotationStatus;
  priority: Priority;
  dueDate: string | null;
  sentDate: string | null;
  followUpDate: string | null;
  probability: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateQuotationData {
  reference?: string;
  clientName: string;
  projectName?: string;
  description?: string;
  value?: number;
  assignedTo?: number;
  status?: QuotationStatus;
  priority?: Priority;
  dueDate?: string;
  sentDate?: string;
  followUpDate?: string;
  probability?: number;
  notes?: string;
}

interface QuotationStats {
  total: number;
  byStatus: Record<QuotationStatus, number>;
  totalValue: number;
  avgProbability: number;
}

// Resource Task Types
type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked';
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

interface ResourceTaskQueryOptions {
  employeeId?: number;
  status?: TaskStatus;
  priority?: TaskPriority;
  unassigned?: boolean;
  limit?: number;
  offset?: number;
}

interface ResourceTask {
  id: number;
  employeeId: number | null;
  employeeName?: string | null;
  projectExternalId: string | null;
  clientName: string | null;
  projectName: string | null;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  estimatedHours: number | null;
  percentComplete: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface CreateResourceTaskData {
  employeeId?: number;
  projectExternalId?: string;
  clientName?: string;
  projectName?: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: string;
  estimatedHours?: number;
  percentComplete?: number;
  sortOrder?: number;
}

// Team Types
interface TeamQueryOptions {
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

interface Team {
  id: number;
  name: string;
  color: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  memberCount?: number;
  createdAt: string;
}

interface CreateTeamData {
  name: string;
  color?: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}

interface TeamMember {
  id: number;
  teamId: number;
  employeeId: number;
  isLead: boolean;
  employeeName?: string;
  employeeRole?: string;
}

// Valid channels for events from main process
const validEventChannels = [
  'sync:progress',
  'sync:completed',
  'sync:failed',
  'update:checking',
  'update:available',
  'update:available-background', // Silent notification when periodic check finds update
  'update:not-available',
  'update:downloading',
  'update:progress',
  'update:downloaded',
  'update:error',
  'feed:sync-started',
  'feed:sync-completed',
  'app:version-updated', // Sent when app version changes, triggers auto-sync
  'cloud:status-changed', // Cloud database connection status changed
  'cloud:connection-lost', // Cloud database connection lost
];

// Expose protected methods via context bridge
contextBridge.exposeInMainWorld('electronAPI', {
  // Projects
  projects: {
    getAll: (options?: ProjectQueryOptions) => ipcRenderer.invoke('projects:getAll', options),
    getById: (id: number) => ipcRenderer.invoke('projects:getById', id),
    getByExternalId: (externalId: string) => ipcRenderer.invoke('projects:getByExternalId', externalId),
    getStatuses: () => ipcRenderer.invoke('projects:getStatuses'),
    clearAll: () => ipcRenderer.invoke('projects:clearAll'),
    getAvailableDetailFields: () => ipcRenderer.invoke('projects:getAvailableDetailFields'),
    getDetailSyncDiagnostics: () => ipcRenderer.invoke('projects:getDetailSyncDiagnostics'),
    updateHoursOverride: (id: number, hoursOverride: number | null) => ipcRenderer.invoke('projects:updateHoursOverride', id, hoursOverride),
  },

  // Opportunities
  opportunities: {
    getAll: (options?: OpportunityQueryOptions) => ipcRenderer.invoke('opportunities:getAll', options),
    getById: (id: number) => ipcRenderer.invoke('opportunities:getById', id),
    getByExternalId: (externalId: string) => ipcRenderer.invoke('opportunities:getByExternalId', externalId),
    getStages: () => ipcRenderer.invoke('opportunities:getStages'),
    getStatuses: () => ipcRenderer.invoke('opportunities:getStatuses'),
    getSalesReps: () => ipcRenderer.invoke('opportunities:getSalesReps'),
    clearAll: () => ipcRenderer.invoke('opportunities:clearAll'),
  },

  // Service Tickets
  serviceTickets: {
    getAll: (options?: ServiceTicketQueryOptions) => ipcRenderer.invoke('serviceTickets:getAll', options),
    getById: (id: number) => ipcRenderer.invoke('serviceTickets:getById', id),
    getByExternalId: (externalId: string) => ipcRenderer.invoke('serviceTickets:getByExternalId', externalId),
    getStatuses: () => ipcRenderer.invoke('serviceTickets:getStatuses'),
    getPriorities: () => ipcRenderer.invoke('serviceTickets:getPriorities'),
    getAssignees: () => ipcRenderer.invoke('serviceTickets:getAssignees'),
    getCompanies: () => ipcRenderer.invoke('serviceTickets:getCompanies'),
    getBoards: () => ipcRenderer.invoke('serviceTickets:getBoards'),
    clearAll: () => ipcRenderer.invoke('serviceTickets:clearAll'),
  },

  // Sync
  sync: {
    request: (syncType: string) => ipcRenderer.invoke('sync:request', syncType),
    getStatus: () => ipcRenderer.invoke('sync:getStatus'),
    getHistory: (options?: SyncHistoryOptions) => ipcRenderer.invoke('sync:getHistory', options),
    getChanges: (syncHistoryId: number) => ipcRenderer.invoke('sync:getChanges', syncHistoryId),
    cancel: (syncId: number) => ipcRenderer.invoke('sync:cancel', syncId),
    clearHistory: () => ipcRenderer.invoke('sync:clearHistory'),
  },

  // ATOM Feeds
  feeds: {
    getAll: () => ipcRenderer.invoke('feeds:getAll'),
    import: (filePath: string) => ipcRenderer.invoke('feeds:import', filePath),
    importFromDialog: () => ipcRenderer.invoke('feeds:importFromDialog'),
    delete: (feedId: number) => ipcRenderer.invoke('feeds:delete', feedId),
    test: (feedId: number) => ipcRenderer.invoke('feeds:test', feedId),
    update: (feedId: number, updates: { name?: string; feedType?: 'PROJECTS' | 'OPPORTUNITIES' | 'SERVICE_TICKETS' | 'PROJECT_DETAIL' }) => ipcRenderer.invoke('feeds:update', feedId, updates),
    linkDetail: (summaryFeedId: number, detailFeedId: number) => ipcRenderer.invoke('feeds:linkDetail', summaryFeedId, detailFeedId),
    unlinkDetail: (summaryFeedId: number) => ipcRenderer.invoke('feeds:unlinkDetail', summaryFeedId),
    getDetailFeeds: () => ipcRenderer.invoke('feeds:getDetailFeeds'),
    getDetailSyncDiagnostics: () => ipcRenderer.invoke('feeds:getDetailSyncDiagnostics'),
    testFetchProjectDetail: (projectId?: string) => ipcRenderer.invoke('feeds:testFetchProjectDetail', projectId),
    getAvailableTemplates: () => ipcRenderer.invoke('feeds:getAvailableTemplates'),
    exportTemplates: () => ipcRenderer.invoke('feeds:exportTemplates'),
    importTemplate: (filename: string) => ipcRenderer.invoke('feeds:importTemplate', filename),
  },

  // Settings
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },

  // Updates
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    install: () => ipcRenderer.invoke('updates:install'),
    setGitHubToken: (token: string | null) => ipcRenderer.invoke('updates:setGitHubToken', token),
    getGitHubTokenStatus: () => ipcRenderer.invoke('updates:getGitHubTokenStatus'),
  },

  // Cloud Database
  cloud: {
    getStatus: () => ipcRenderer.invoke('cloud:getStatus'),
    testConnection: (connectionString: string) => ipcRenderer.invoke('cloud:testConnection', connectionString),
    setConnectionString: (connectionString: string) => ipcRenderer.invoke('cloud:setConnectionString', connectionString),
    connect: () => ipcRenderer.invoke('cloud:connect'),
    disconnect: () => ipcRenderer.invoke('cloud:disconnect'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('cloud:setEnabled', enabled),
  },

  // Employees
  employees: {
    getAll: (options?: EmployeeQueryOptions) => ipcRenderer.invoke('employees:getAll', options),
    getById: (id: number) => ipcRenderer.invoke('employees:getById', id),
    create: (data: CreateEmployeeData) => ipcRenderer.invoke('employees:create', data),
    update: (id: number, data: Partial<CreateEmployeeData>) => ipcRenderer.invoke('employees:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('employees:delete', id),
    getDepartments: () => ipcRenderer.invoke('employees:getDepartments'),
    reorder: (orderedIds: number[]) => ipcRenderer.invoke('employees:reorder', orderedIds),
    getCount: (isActive?: boolean) => ipcRenderer.invoke('employees:getCount', isActive),
  },

  // Quotations
  quotations: {
    getAll: (options?: QuotationQueryOptions) => ipcRenderer.invoke('quotations:getAll', options),
    getById: (id: number) => ipcRenderer.invoke('quotations:getById', id),
    create: (data: CreateQuotationData) => ipcRenderer.invoke('quotations:create', data),
    update: (id: number, data: Partial<CreateQuotationData>) => ipcRenderer.invoke('quotations:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('quotations:delete', id),
    getStatuses: () => ipcRenderer.invoke('quotations:getStatuses'),
    getPriorities: () => ipcRenderer.invoke('quotations:getPriorities'),
    getStats: () => ipcRenderer.invoke('quotations:getStats'),
  },

  // Resource Tasks
  resourceTasks: {
    getAll: (options?: ResourceTaskQueryOptions) => ipcRenderer.invoke('resourceTasks:getAll', options),
    getById: (id: number) => ipcRenderer.invoke('resourceTasks:getById', id),
    getByEmployee: (employeeId: number) => ipcRenderer.invoke('resourceTasks:getByEmployee', employeeId),
    getUnassigned: () => ipcRenderer.invoke('resourceTasks:getUnassigned'),
    create: (data: CreateResourceTaskData) => ipcRenderer.invoke('resourceTasks:create', data),
    update: (id: number, data: Partial<CreateResourceTaskData>) => ipcRenderer.invoke('resourceTasks:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('resourceTasks:delete', id),
    moveToEmployee: (taskId: number, employeeId: number | null, sortOrder?: number) => ipcRenderer.invoke('resourceTasks:moveToEmployee', taskId, employeeId, sortOrder),
    reorderForEmployee: (employeeId: number | null, orderedIds: number[]) => ipcRenderer.invoke('resourceTasks:reorderForEmployee', employeeId, orderedIds),
    getStatuses: () => ipcRenderer.invoke('resourceTasks:getStatuses'),
    getPriorities: () => ipcRenderer.invoke('resourceTasks:getPriorities'),
  },

  // Teams
  teams: {
    getAll: (options?: TeamQueryOptions) => ipcRenderer.invoke('teams:getAll', options),
    getById: (id: number) => ipcRenderer.invoke('teams:getById', id),
    create: (data: CreateTeamData) => ipcRenderer.invoke('teams:create', data),
    update: (id: number, data: Partial<CreateTeamData>) => ipcRenderer.invoke('teams:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('teams:delete', id),
    getMembers: (teamId: number) => ipcRenderer.invoke('teams:getMembers', teamId),
    addMember: (teamId: number, employeeId: number, isLead?: boolean) => ipcRenderer.invoke('teams:addMember', teamId, employeeId, isLead),
    removeMember: (teamId: number, employeeId: number) => ipcRenderer.invoke('teams:removeMember', teamId, employeeId),
    setLead: (teamId: number, employeeId: number) => ipcRenderer.invoke('teams:setLead', teamId, employeeId),
    getTeamsForEmployee: (employeeId: number) => ipcRenderer.invoke('teams:getTeamsForEmployee', employeeId),
    reorder: (orderedIds: number[]) => ipcRenderer.invoke('teams:reorder', orderedIds),
  },

  // Event subscription
  on: (channel: string, callback: (data: unknown) => void) => {
    if (!validEventChannels.includes(channel)) {
      console.warn(`Invalid event channel: ${channel}`);
      return () => {};
    }

    console.log(`[Preload] Subscribing to event: ${channel}`);
    const subscription = (_event: IpcRendererEvent, data: unknown) => {
      console.log(`[Preload] Received event: ${channel}`, data);
      callback(data);
    };
    ipcRenderer.on(channel, subscription);

    // Return unsubscribe function
    return () => {
      console.log(`[Preload] Unsubscribing from event: ${channel}`);
      ipcRenderer.removeListener(channel, subscription);
    };
  },

  off: (channel: string, callback: (data: unknown) => void) => {
    if (validEventChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, callback as never);
    }
  },

  // App info
  getVersion: () => ipcRenderer.invoke('updates:getVersion'),
  getPlatform: () => process.platform,
} as ElectronAPI);

// Extend Window interface
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

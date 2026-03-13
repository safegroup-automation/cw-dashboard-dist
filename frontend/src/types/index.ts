// CW Dashboard Types

export interface ServiceTicket {
  id: number;
  externalId: string;
  summary?: string;
  status?: string;
  priority?: string;
  assignedTo?: string;
  companyName?: string;
  boardName?: string;
  createdDate?: string;
  lastUpdated?: string;
  dueDate?: string;
  hoursEstimate?: number;
  hoursActual?: number;
  hoursRemaining?: number;
  budget?: number;
  age?: number;
  contactName?: string;
  dateClosed?: string;
  notes?: string;
  rawData?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceTicketAPI {
  id: number;
  external_id: string;
  summary?: string;
  status?: string;
  priority?: string;
  assigned_to?: string;
  company_name?: string;
  board_name?: string;
  created_date?: string;
  last_updated?: string;
  due_date?: string;
  hours_estimate?: number;
  hours_actual?: number;
  hours_remaining?: number;
  budget?: number;
  age?: number;
  contact_name?: string;
  date_closed?: string;
  notes?: string;
  raw_data?: string;
  created_at: string;
  updated_at: string;
}

export function transformServiceTicket(api: ServiceTicketAPI): ServiceTicket {
  return {
    id: api.id,
    externalId: api.external_id,
    summary: api.summary,
    status: api.status,
    priority: api.priority,
    assignedTo: api.assigned_to,
    companyName: api.company_name,
    boardName: api.board_name,
    createdDate: api.created_date,
    lastUpdated: api.last_updated,
    dueDate: api.due_date,
    hoursEstimate: api.hours_estimate,
    hoursActual: api.hours_actual,
    hoursRemaining: api.hours_remaining,
    budget: api.budget,
    age: api.age,
    contactName: api.contact_name,
    dateClosed: api.date_closed,
    notes: api.notes,
    rawData: api.raw_data,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
  };
}

export type FeedType = 'PROJECTS' | 'OPPORTUNITIES' | 'SERVICE_TICKETS' | 'PROJECT_DETAIL';

export interface AtomFeed {
  id: number;
  name: string;
  feedType: FeedType;
  feedUrl: string;
  detailFeedId: number | null;
  isActive: boolean;
  lastSync: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AtomFeedAPI {
  id: number;
  name: string;
  feed_type: string;
  feed_url: string;
  detail_feed_id: number | null;
  is_active: boolean;
  last_sync: string | null;
  created_at: string;
  updated_at: string;
}

export function transformAtomFeed(api: AtomFeedAPI): AtomFeed {
  return {
    id: api.id,
    name: api.name,
    feedType: api.feed_type as FeedType,
    feedUrl: api.feed_url,
    detailFeedId: api.detail_feed_id,
    isActive: api.is_active,
    lastSync: api.last_sync,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
  };
}

export interface Project {
  id: number;
  externalId: string;
  clientName: string;
  projectName: string;
  budget?: number;
  spent?: number;
  hoursEstimate?: number;
  hoursActual?: number;
  hoursRemaining?: number;
  hoursOverride?: number | null;
  endDate?: string;
  billable?: number;
  invoiced?: number;
  wip?: number;
  status: string;
  isActive: boolean;
  notes?: string;
  rawData?: string;
  detailRawData?: string;
  budgetRemaining?: number;
  budgetPercentUsed?: number;
  hoursPercentUsed?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Opportunity {
  id: number;
  externalId: string;
  opportunityName: string;
  companyName: string;
  salesRep?: string;
  stage?: string;
  status?: string;
  expectedRevenue?: number;
  closeDate?: string;
  probability?: number;
  dateBecameLead?: string;
  notes?: string;
  rawData?: string;
  weightedValue?: number;
  createdAt: string;
  updatedAt: string;
}

// WebSocket message types
export interface WebSocketMessage {
  type: string;
  payload: Record<string, unknown>;
}

// API response types (snake_case from backend)
export interface ProjectAPI {
  id: number;
  external_id: string;
  client_name: string;
  project_name: string;
  budget?: number;
  spent?: number;
  hours_estimate?: number;
  hours_actual?: number;
  hours_remaining?: number;
  hours_override?: number | null;
  end_date?: string;
  billable?: number;
  invoiced?: number;
  wip?: number;
  status: string;
  is_active: boolean;
  notes?: string;
  raw_data?: string;
  detail_raw_data?: string;
  budget_remaining?: number;
  budget_percent_used?: number;
  hours_percent_used?: number;
  created_at: string;
  updated_at: string;
}

export interface OpportunityAPI {
  id: number;
  external_id: string;
  opportunity_name: string;
  company_name: string;
  sales_rep?: string;
  stage?: string;
  status?: string;
  expected_revenue?: number;
  close_date?: string;
  probability?: number;
  date_became_lead?: string;
  notes?: string;
  raw_data?: string;
  weighted_value?: number;
  created_at: string;
  updated_at: string;
}

// Transform functions
export function transformProject(api: ProjectAPI): Project {
  return {
    id: api.id,
    externalId: api.external_id,
    clientName: api.client_name,
    projectName: api.project_name,
    budget: api.budget,
    spent: api.spent,
    hoursEstimate: api.hours_estimate,
    hoursActual: api.hours_actual,
    hoursRemaining: api.hours_remaining,
    hoursOverride: api.hours_override,
    endDate: api.end_date,
    billable: api.billable,
    invoiced: api.invoiced,
    wip: api.wip,
    status: api.status,
    isActive: api.is_active,
    notes: api.notes,
    rawData: api.raw_data,
    detailRawData: api.detail_raw_data,
    budgetRemaining: api.budget_remaining,
    budgetPercentUsed: api.budget_percent_used,
    hoursPercentUsed: api.hours_percent_used,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
  };
}

export function transformOpportunity(api: OpportunityAPI): Opportunity {
  return {
    id: api.id,
    externalId: api.external_id,
    opportunityName: api.opportunity_name,
    companyName: api.company_name,
    salesRep: api.sales_rep,
    stage: api.stage,
    status: api.status,
    expectedRevenue: api.expected_revenue,
    closeDate: api.close_date,
    probability: api.probability,
    dateBecameLead: api.date_became_lead,
    notes: api.notes,
    rawData: api.raw_data,
    weightedValue: api.weighted_value,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
  };
}

// Sync types
export type SyncType = 'PROJECTS' | 'OPPORTUNITIES' | 'SERVICE_TICKETS';
export type SyncStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

// ============================================
// Cloud Database Types
// ============================================

export interface CloudStatus {
  connected: boolean;
  enabled: boolean;
  lastConnected: string | null;
  lastError: string | null;
  databaseUrl: string | null;
}

export interface CloudTestResult {
  success: boolean;
  message: string;
  schemaExists?: boolean;
}

// ============================================
// Employee Types
// ============================================

export interface Employee {
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

export interface EmployeeQueryOptions {
  isActive?: boolean;
  department?: string;
  limit?: number;
  offset?: number;
}

export interface CreateEmployeeData {
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

// ============================================
// Quotation Types
// ============================================

export type QuotationStatus = 'draft' | 'sent' | 'follow_up' | 'won' | 'lost';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface Quotation {
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

export interface QuotationQueryOptions {
  status?: QuotationStatus;
  priority?: Priority;
  assignedTo?: number;
  limit?: number;
  offset?: number;
}

export interface CreateQuotationData {
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

export interface QuotationStats {
  total: number;
  byStatus: Record<QuotationStatus, number>;
  totalValue: number;
  avgProbability: number;
}

// ============================================
// Resource Task Types
// ============================================

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ResourceTask {
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

export interface ResourceTaskQueryOptions {
  employeeId?: number;
  status?: TaskStatus;
  priority?: TaskPriority;
  unassigned?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateResourceTaskData {
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

// ============================================
// Team Types
// ============================================

export interface Team {
  id: number;
  name: string;
  color: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  memberCount?: number;
  createdAt: string;
}

export interface TeamQueryOptions {
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateTeamData {
  name: string;
  color?: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface TeamMember {
  id: number;
  teamId: number;
  employeeId: number;
  isLead: boolean;
  employeeName?: string;
  employeeRole?: string;
}

export interface SyncHistory {
  id: number;
  syncType: SyncType;
  status: SyncStatus;
  triggeredBy?: string;
  startedAt?: string;
  completedAt?: string;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  recordsRemoved: number;
  errorMessage?: string;
  createdAt: string;
}

export interface SyncChange {
  id: number;
  syncHistoryId: number;
  entityType: 'PROJECT' | 'OPPORTUNITY' | 'SERVICE_TICKET';
  entityId: number;
  externalId?: string;
  changeType: 'CREATED' | 'UPDATED' | 'REMOVED';
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  createdAt: string;
}

export interface SyncStatusSummary {
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
  pendingSyncs: Array<{
    id: number;
    syncType: SyncType;
    status: SyncStatus;
  }>;
}

export interface EntityChangeSummary {
  entityType: 'PROJECT' | 'OPPORTUNITY' | 'SERVICE_TICKET';
  entityId: number;
  externalId?: string;
  changeType: 'CREATED' | 'UPDATED' | 'REMOVED';
  fieldChanges: SyncChange[];
}

// Sync API types (snake_case from backend)
export interface SyncHistoryAPI {
  id: number;
  sync_type: string;
  status: string;
  triggered_by?: string;
  started_at?: string;
  completed_at?: string;
  records_processed: number;
  records_created: number;
  records_updated: number;
  records_unchanged: number;
  records_removed: number;
  error_message?: string;
  created_at: string;
}

export interface SyncChangeAPI {
  id: number;
  sync_history_id: number;
  entity_type: string;
  entity_id: number;
  external_id?: string;
  change_type: string;
  field_name?: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
}

export interface SyncStatusSummaryAPI {
  projects: {
    last_sync: string | null;
    last_sync_id: number | null;
    records_synced: number;
  };
  opportunities: {
    last_sync: string | null;
    last_sync_id: number | null;
    records_synced: number;
  };
  service_tickets: {
    last_sync: string | null;
    last_sync_id: number | null;
    records_synced: number;
  };
  pending_syncs: Array<{
    id: number;
    sync_type: string;
    status: string;
  }>;
}

export function transformSyncHistory(api: SyncHistoryAPI): SyncHistory {
  return {
    id: api.id,
    syncType: api.sync_type as SyncType,
    status: api.status as SyncStatus,
    triggeredBy: api.triggered_by,
    startedAt: api.started_at,
    completedAt: api.completed_at,
    recordsProcessed: api.records_processed,
    recordsCreated: api.records_created,
    recordsUpdated: api.records_updated,
    recordsUnchanged: api.records_unchanged,
    recordsRemoved: api.records_removed ?? 0,
    errorMessage: api.error_message,
    createdAt: api.created_at,
  };
}

export function transformSyncChange(api: SyncChangeAPI): SyncChange {
  return {
    id: api.id,
    syncHistoryId: api.sync_history_id,
    entityType: api.entity_type as 'PROJECT' | 'OPPORTUNITY' | 'SERVICE_TICKET',
    entityId: api.entity_id,
    externalId: api.external_id,
    changeType: api.change_type as 'CREATED' | 'UPDATED' | 'REMOVED',
    fieldName: api.field_name,
    oldValue: api.old_value,
    newValue: api.new_value,
    createdAt: api.created_at,
  };
}

export function transformSyncStatusSummary(api: SyncStatusSummaryAPI): SyncStatusSummary {
  return {
    projects: {
      lastSync: api.projects.last_sync,
      lastSyncId: api.projects.last_sync_id,
      recordsSynced: api.projects.records_synced,
    },
    opportunities: {
      lastSync: api.opportunities.last_sync,
      lastSyncId: api.opportunities.last_sync_id,
      recordsSynced: api.opportunities.records_synced,
    },
    serviceTickets: {
      lastSync: api.service_tickets.last_sync,
      lastSyncId: api.service_tickets.last_sync_id,
      recordsSynced: api.service_tickets.records_synced,
    },
    pendingSyncs: api.pending_syncs.map(s => ({
      id: s.id,
      syncType: s.sync_type as SyncType,
      status: s.status as SyncStatus,
    })),
  };
}

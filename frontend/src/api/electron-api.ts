/**
 * Electron API Client
 *
 * This module provides an API client that communicates with the Electron main process
 * via IPC. It provides the same interface as the HTTP API so the frontend can seamlessly
 * switch between web and desktop modes.
 */

import type { Project, Opportunity, ServiceTicket, SyncHistory, SyncStatusSummary, SyncType, EntityChangeSummary } from '../types';
import type { ProjectsFilter, PaginatedResponse } from './projects';
import type { OpportunitiesFilter } from './opportunities';
import type { ServiceTicketsFilter } from './service-tickets';

// Check if running in Electron
export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && 'electronAPI' in window;
};

// Get the Electron API if available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getElectronAPI(): any {
  if (!isElectron()) {
    throw new Error('Electron API not available - not running in Electron');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).electronAPI;
}

// ============================================
// Projects API
// ============================================

export interface ClearDataResult {
  deleted: number;
}

export const electronProjectsApi = {
  getAll: async (filters: ProjectsFilter = {}): Promise<Project[]> => {
    const api = getElectronAPI();
    return api.projects.getAll({
      status: filters.status,
      includeInactive: filters.includeInactive,
      limit: filters.limit,
      offset: filters.skip, // Map 'skip' to 'offset' for Electron API
    });
  },

  getAllPaginated: async (filters: ProjectsFilter = {}): Promise<PaginatedResponse<Project>> => {
    const api = getElectronAPI();
    const items = await api.projects.getAll({
      status: filters.status,
      includeInactive: filters.includeInactive,
      limit: filters.limit ?? 500,
      offset: filters.skip ?? 0,
    });

    // Electron API doesn't have built-in pagination, so we simulate it
    return {
      items,
      total: items.length,
      skip: filters.skip ?? 0,
      limit: filters.limit ?? 500,
      has_more: false, // Electron loads all at once
    };
  },

  getById: async (id: number): Promise<Project> => {
    const api = getElectronAPI();
    const project = await api.projects.getById(id);
    if (!project) throw new Error(`Project with ID ${id} not found`);
    return project;
  },

  getByExternalId: async (externalId: string): Promise<Project> => {
    const api = getElectronAPI();
    const project = await api.projects.getByExternalId(externalId);
    if (!project) throw new Error(`Project with external ID ${externalId} not found`);
    return project;
  },

  clearAll: async (): Promise<ClearDataResult> => {
    const api = getElectronAPI();
    return api.projects.clearAll();
  },

  getStatuses: async (): Promise<string[]> => {
    const api = getElectronAPI();
    return api.projects.getStatuses();
  },

  getAvailableDetailFields: async (): Promise<string[]> => {
    const api = getElectronAPI();
    return api.projects.getAvailableDetailFields();
  },

  getDetailSyncDiagnostics: async (): Promise<ProjectDetailDiagnostics> => {
    const api = getElectronAPI();
    return api.projects.getDetailSyncDiagnostics();
  },

  updateHoursOverride: async (id: number, hoursOverride: number | null): Promise<Project> => {
    const api = getElectronAPI();
    const project = await api.projects.updateHoursOverride(id, hoursOverride);
    if (!project) throw new Error(`Project with ID ${id} not found`);
    return project;
  },
};

export interface ProjectDetailDiagnostics {
  projectsWithDetailData: number;
  totalProjects: number;
  sampleExternalIds: string[];
  sampleDetailData: { externalId: string; fieldCount: number; fields: string[] } | null;
  sampleRawDataFields: { externalId: string; allFields: string[]; idFields: Record<string, string> } | null;
}

// ============================================
// Opportunities API
// ============================================

export const electronOpportunitiesApi = {
  getAll: async (filters: OpportunitiesFilter = {}): Promise<Opportunity[]> => {
    const api = getElectronAPI();
    return api.opportunities.getAll({
      stage: filters.stage,
      salesRep: filters.salesRep,
      limit: filters.limit,
      offset: filters.skip,
    });
  },

  getAllPaginated: async (filters: OpportunitiesFilter = {}): Promise<PaginatedResponse<Opportunity>> => {
    const api = getElectronAPI();
    const items = await api.opportunities.getAll({
      stage: filters.stage,
      salesRep: filters.salesRep,
      limit: filters.limit ?? 500,
      offset: filters.skip ?? 0,
    });

    return {
      items,
      total: items.length,
      skip: filters.skip ?? 0,
      limit: filters.limit ?? 500,
      has_more: false,
    };
  },

  getById: async (id: number): Promise<Opportunity> => {
    const api = getElectronAPI();
    const opp = await api.opportunities.getById(id);
    if (!opp) throw new Error(`Opportunity with ID ${id} not found`);
    return opp;
  },

  getByExternalId: async (externalId: string): Promise<Opportunity> => {
    const api = getElectronAPI();
    const opp = await api.opportunities.getByExternalId(externalId);
    if (!opp) throw new Error(`Opportunity with external ID ${externalId} not found`);
    return opp;
  },

  getStages: async (): Promise<string[]> => {
    const api = getElectronAPI();
    return api.opportunities.getStages();
  },

  getStatuses: async (): Promise<string[]> => {
    const api = getElectronAPI();
    return api.opportunities.getStatuses();
  },

  getSalesReps: async (): Promise<string[]> => {
    const api = getElectronAPI();
    return api.opportunities.getSalesReps();
  },

  clearAll: async (): Promise<ClearDataResult> => {
    const api = getElectronAPI();
    return api.opportunities.clearAll();
  },
};

// ============================================
// Service Tickets API
// ============================================

export const electronServiceTicketsApi = {
  getAll: async (filters: ServiceTicketsFilter = {}): Promise<ServiceTicket[]> => {
    const api = getElectronAPI();
    return api.serviceTickets.getAll({
      status: filters.status,
      priority: filters.priority,
      assignedTo: filters.assignedTo,
      companyName: filters.companyName,
      boardName: filters.boardName,
      limit: filters.limit,
      offset: filters.skip,
    });
  },

  getAllPaginated: async (filters: ServiceTicketsFilter = {}): Promise<PaginatedResponse<ServiceTicket>> => {
    const api = getElectronAPI();
    const items = await api.serviceTickets.getAll({
      status: filters.status,
      priority: filters.priority,
      assignedTo: filters.assignedTo,
      companyName: filters.companyName,
      boardName: filters.boardName,
      limit: filters.limit ?? 500,
      offset: filters.skip ?? 0,
    });

    return {
      items,
      total: items.length,
      skip: filters.skip ?? 0,
      limit: filters.limit ?? 500,
      has_more: false,
    };
  },

  getById: async (id: number): Promise<ServiceTicket> => {
    const api = getElectronAPI();
    const ticket = await api.serviceTickets.getById(id);
    if (!ticket) throw new Error(`Service ticket with ID ${id} not found`);
    return ticket;
  },

  getByExternalId: async (externalId: string): Promise<ServiceTicket> => {
    const api = getElectronAPI();
    const ticket = await api.serviceTickets.getByExternalId(externalId);
    if (!ticket) throw new Error(`Service ticket with external ID ${externalId} not found`);
    return ticket;
  },

  getStatuses: async (): Promise<string[]> => {
    const api = getElectronAPI();
    return api.serviceTickets.getStatuses();
  },

  getPriorities: async (): Promise<string[]> => {
    const api = getElectronAPI();
    return api.serviceTickets.getPriorities();
  },

  getAssignees: async (): Promise<string[]> => {
    const api = getElectronAPI();
    return api.serviceTickets.getAssignees();
  },

  getCompanies: async (): Promise<string[]> => {
    const api = getElectronAPI();
    return api.serviceTickets.getCompanies();
  },

  getBoards: async (): Promise<string[]> => {
    const api = getElectronAPI();
    return api.serviceTickets.getBoards();
  },

  clearAll: async (): Promise<ClearDataResult> => {
    const api = getElectronAPI();
    return api.serviceTickets.clearAll();
  },
};

// ============================================
// Sync API
// ============================================

export interface SyncRequestResult {
  ids: number[];
  message: string;
}

export interface ClearHistoryResult {
  message: string;
  deleted_history: number;
  deleted_changes: number;
}

export const electronSyncApi = {
  requestSync: async (syncType: SyncType | 'ALL'): Promise<SyncRequestResult> => {
    const api = getElectronAPI();
    return api.sync.request(syncType);
  },

  getStatus: async (): Promise<SyncStatusSummary> => {
    const api = getElectronAPI();
    return api.sync.getStatus();
  },

  getHistory: async (options?: {
    syncType?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<SyncHistory[]> => {
    const api = getElectronAPI();
    return api.sync.getHistory(options);
  },

  getChanges: async (syncHistoryId: number): Promise<EntityChangeSummary[]> => {
    const api = getElectronAPI();
    return api.sync.getChanges(syncHistoryId);
  },

  cancelSync: async (syncId: number): Promise<{ message: string }> => {
    const api = getElectronAPI();
    return api.sync.cancel(syncId);
  },

  clearHistory: async (): Promise<ClearHistoryResult> => {
    const api = getElectronAPI();
    const result = await api.sync.clearHistory();
    // Transform camelCase from Electron to snake_case for consistency
    return {
      message: result.message,
      deleted_history: result.deletedHistory ?? result.deleted_history ?? 0,
      deleted_changes: result.deletedChanges ?? result.deleted_changes ?? 0,
    };
  },

  // Not used in Electron mode (no separate listener process)
  getListenerStatus: async (): Promise<{
    alive: boolean;
    last_heartbeat: string | null;
    age_seconds?: number;
    message: string;
  }> => {
    // Electron doesn't have a listener - syncs run directly in main process
    return {
      alive: true,
      last_heartbeat: null,
      message: 'Electron mode - syncs run directly',
    };
  },
};

// ============================================
// Feeds API (Electron only)
// ============================================

export interface AtomFeed {
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

export interface FeedTestResult {
  success: boolean;
  recordCount?: number;
  error?: string;
}

export const electronFeedsApi = {
  getAll: async (): Promise<AtomFeed[]> => {
    const api = getElectronAPI();
    return api.feeds.getAll();
  },

  import: async (filePath: string): Promise<AtomFeed[]> => {
    const api = getElectronAPI();
    return api.feeds.import(filePath);
  },

  importFromDialog: async (): Promise<AtomFeed[]> => {
    const api = getElectronAPI();
    return api.feeds.importFromDialog();
  },

  delete: async (feedId: number): Promise<void> => {
    const api = getElectronAPI();
    return api.feeds.delete(feedId);
  },

  test: async (feedId: number): Promise<FeedTestResult> => {
    const api = getElectronAPI();
    return api.feeds.test(feedId);
  },

  update: async (feedId: number, updates: { name?: string; feedType?: 'PROJECTS' | 'OPPORTUNITIES' | 'SERVICE_TICKETS' | 'PROJECT_DETAIL' }): Promise<AtomFeed | null> => {
    const api = getElectronAPI();
    return api.feeds.update(feedId, updates);
  },

  linkDetail: async (summaryFeedId: number, detailFeedId: number): Promise<AtomFeed | null> => {
    const api = getElectronAPI();
    return api.feeds.linkDetail(summaryFeedId, detailFeedId);
  },

  unlinkDetail: async (summaryFeedId: number): Promise<AtomFeed | null> => {
    const api = getElectronAPI();
    return api.feeds.unlinkDetail(summaryFeedId);
  },

  getDetailFeeds: async (): Promise<AtomFeed[]> => {
    const api = getElectronAPI();
    return api.feeds.getDetailFeeds();
  },

  getDetailSyncDiagnostics: async (): Promise<FeedDetailDiagnostics> => {
    const api = getElectronAPI();
    return api.feeds.getDetailSyncDiagnostics();
  },

  testFetchProjectDetail: async (projectId?: string): Promise<TestFetchDetailResult> => {
    const api = getElectronAPI();
    return api.feeds.testFetchProjectDetail(projectId);
  },

  getAvailableTemplates: async (): Promise<FeedTemplate[]> => {
    const api = getElectronAPI();
    return api.feeds.getAvailableTemplates();
  },

  exportTemplates: async (): Promise<ExportTemplatesResult> => {
    const api = getElectronAPI();
    return api.feeds.exportTemplates();
  },

  importTemplate: async (filename: string): Promise<AtomFeed[]> => {
    const api = getElectronAPI();
    return api.feeds.importTemplate(filename);
  },
};

export interface FeedTemplate {
  name: string;
  filename: string;
  type: string;
}

export interface ExportTemplatesResult {
  exported: string[];
  errors: string[];
  cancelled: boolean;
}

export interface FeedDetailDiagnostics {
  adaptiveSyncEnabled: boolean;
  projectsFeeds: { id: number; name: string; isActive: boolean; hasDetailLink: boolean; detailFeedId: number | null }[];
  detailFeeds: { id: number; name: string; isActive: boolean; feedUrl: string }[];
  linkedPairs: { projectsFeedId: number; projectsFeedName: string; detailFeedId: number; detailFeedName: string }[];
}

export interface TestFetchDetailResult {
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

// ============================================
// Settings API (Electron only)
// ============================================

export interface Setting {
  key: string;
  value: string;
}

export const electronSettingsApi = {
  get: async (key: string): Promise<string | null> => {
    const api = getElectronAPI();
    return api.settings.get(key);
  },

  set: async (key: string, value: string): Promise<void> => {
    const api = getElectronAPI();
    return api.settings.set(key, value);
  },

  getAll: async (): Promise<Setting[]> => {
    const api = getElectronAPI();
    return api.settings.getAll();
  },
};

// ============================================
// Updates API (Electron only)
// ============================================

export interface UpdateCheckResult {
  updateAvailable: boolean;
  version?: string;
  releaseNotes?: string;
}

export interface GitHubTokenStatus {
  hasToken: boolean;
  maskedToken: string | null;
}

export const electronUpdatesApi = {
  check: async (): Promise<UpdateCheckResult> => {
    const api = getElectronAPI();
    return api.updates.check();
  },

  download: async (): Promise<void> => {
    const api = getElectronAPI();
    return api.updates.download();
  },

  install: async (): Promise<void> => {
    const api = getElectronAPI();
    return api.updates.install();
  },

  getVersion: async (): Promise<string> => {
    const api = getElectronAPI();
    return api.getVersion();
  },

  setGitHubToken: async (token: string | null): Promise<void> => {
    const api = getElectronAPI();
    return api.updates.setGitHubToken(token);
  },

  getGitHubTokenStatus: async (): Promise<GitHubTokenStatus> => {
    const api = getElectronAPI();
    return api.updates.getGitHubTokenStatus();
  },
};

// ============================================
// Event Subscriptions
// ============================================

type EventCallback = (data: unknown) => void;

export const electronEvents = {
  /**
   * Subscribe to an event from the main process
   * @returns Unsubscribe function
   */
  on: (channel: string, callback: EventCallback): (() => void) => {
    if (!isElectron()) {
      console.warn('Electron events not available - not running in Electron');
      return () => {};
    }
    const api = getElectronAPI();
    return api.on(channel, callback);
  },

  /**
   * Unsubscribe from an event
   */
  off: (channel: string, callback: EventCallback): void => {
    if (!isElectron()) return;
    const api = getElectronAPI();
    api.off(channel, callback);
  },
};

// ============================================
// Combined API - Auto-detect Electron vs Web
// ============================================

/**
 * Get the appropriate API client based on the environment.
 * In Electron, uses IPC. In browser, uses HTTP.
 */
export function getApiClient() {
  if (isElectron()) {
    return {
      projects: electronProjectsApi,
      opportunities: electronOpportunitiesApi,
      sync: electronSyncApi,
      feeds: electronFeedsApi,
      settings: electronSettingsApi,
      updates: electronUpdatesApi,
      events: electronEvents,
      isElectron: true,
    };
  }

  // Return web API client (imported dynamically to avoid circular deps)
  return {
    isElectron: false,
    // These will be set by the calling code from the existing API modules
    projects: null,
    opportunities: null,
    sync: null,
    feeds: null,
    settings: null,
    updates: null,
    events: null,
  };
}

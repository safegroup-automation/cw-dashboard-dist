import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as projectService from '../services/projects';
import * as opportunityService from '../services/opportunities';
import * as serviceTicketService from '../services/service-tickets';
import * as syncService from '../services/sync';
import * as feedService from '../services/feeds';
import * as settingsService from '../services/settings';
import * as autoUpdaterService from '../services/auto-updater';
import * as cloudDatabase from '../services/cloud-database';
import * as employeeService from '../services/employees';
import * as quotationService from '../services/quotations';
import * as resourceTaskService from '../services/resource-tasks';
import * as teamService from '../services/teams';
import {
  validateId,
  validateString,
  validateSyncType,
  validateQueryOptions,
  validateFeedUpdateOptions,
  validateSettingKey,
  validateEmployeeData,
  validateQuotationData,
  validateResourceTaskData,
  validateTeamData,
} from './validation';

/**
 * Register all IPC handlers for communication with renderer process
 */
export function registerIpcHandlers(): void {
  // ============================================
  // Projects
  // ============================================
  ipcMain.handle('projects:getAll', async (_, options) => {
    return projectService.getAll(validateQueryOptions(options));
  });

  ipcMain.handle('projects:getById', async (_, id: unknown) => {
    return projectService.getById(validateId(id));
  });

  ipcMain.handle('projects:getByExternalId', async (_, externalId: unknown) => {
    return projectService.getByExternalId(validateString(externalId, 'externalId'));
  });

  ipcMain.handle('projects:clearAll', async () => {
    return projectService.clearAll();
  });

  ipcMain.handle('projects:getStatuses', async () => {
    return projectService.getStatuses();
  });

  ipcMain.handle('projects:getAvailableDetailFields', async () => {
    return projectService.getAvailableDetailFields();
  });

  ipcMain.handle('projects:updateHoursOverride', async (_, id: unknown, hoursOverride: unknown) => {
    const validId = validateId(id);
    const validHours = hoursOverride === null ? null : Number(hoursOverride);
    if (validHours !== null && isNaN(validHours)) {
      throw new Error('Invalid hoursOverride: must be a number or null');
    }
    return projectService.updateHoursOverride(validId, validHours);
  });

  // ============================================
  // Opportunities
  // ============================================
  ipcMain.handle('opportunities:getAll', async (_, options) => {
    return opportunityService.getAll(validateQueryOptions(options));
  });

  ipcMain.handle('opportunities:getById', async (_, id: unknown) => {
    return opportunityService.getById(validateId(id));
  });

  ipcMain.handle('opportunities:getByExternalId', async (_, externalId: unknown) => {
    return opportunityService.getByExternalId(validateString(externalId, 'externalId'));
  });

  ipcMain.handle('opportunities:getStages', async () => {
    return opportunityService.getStages();
  });

  ipcMain.handle('opportunities:getSalesReps', async () => {
    return opportunityService.getSalesReps();
  });

  ipcMain.handle('opportunities:clearAll', async () => {
    return opportunityService.clearAll();
  });

  // ============================================
  // Service Tickets
  // ============================================
  ipcMain.handle('serviceTickets:getAll', async (_, options) => {
    return serviceTicketService.getAll(validateQueryOptions(options));
  });

  ipcMain.handle('serviceTickets:getById', async (_, id: unknown) => {
    return serviceTicketService.getById(validateId(id));
  });

  ipcMain.handle('serviceTickets:getByExternalId', async (_, externalId: unknown) => {
    return serviceTicketService.getByExternalId(validateString(externalId, 'externalId'));
  });

  ipcMain.handle('serviceTickets:getStatuses', async () => {
    return serviceTicketService.getStatuses();
  });

  ipcMain.handle('serviceTickets:getPriorities', async () => {
    return serviceTicketService.getPriorities();
  });

  ipcMain.handle('serviceTickets:getAssignees', async () => {
    return serviceTicketService.getAssignees();
  });

  ipcMain.handle('serviceTickets:getCompanies', async () => {
    return serviceTicketService.getCompanies();
  });

  ipcMain.handle('serviceTickets:getBoards', async () => {
    return serviceTicketService.getBoards();
  });

  ipcMain.handle('serviceTickets:clearAll', async () => {
    return serviceTicketService.clearAll();
  });

  // ============================================
  // Sync
  // ============================================
  ipcMain.handle('sync:request', async (event, syncType: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return syncService.requestSync(validateSyncType(syncType), window);
  });

  ipcMain.handle('sync:getStatus', async () => {
    return syncService.getStatus();
  });

  ipcMain.handle('sync:getHistory', async (_, options) => {
    return syncService.getHistory(validateQueryOptions(options));
  });

  ipcMain.handle('sync:getChanges', async (_, syncHistoryId: unknown) => {
    return syncService.getChanges(validateId(syncHistoryId, 'syncHistoryId'));
  });

  ipcMain.handle('sync:cancel', async (_, syncId: unknown) => {
    return syncService.cancelSync(validateId(syncId, 'syncId'));
  });

  ipcMain.handle('sync:clearHistory', async () => {
    return syncService.clearHistory();
  });

  // ============================================
  // ATOM Feeds
  // ============================================
  ipcMain.handle('feeds:getAll', async () => {
    return feedService.getAllFeeds();
  });

  ipcMain.handle('feeds:import', async (_, filePath: unknown) => {
    return feedService.importFeed(validateString(filePath, 'filePath'));
  });

  ipcMain.handle('feeds:importFromDialog', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window!, {
      title: 'Import ATOMSVC File',
      filters: [
        { name: 'ATOM Service Files', extensions: ['atomsvc', 'xml'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile', 'multiSelections'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return [];
    }

    const importedFeeds = [];
    for (const filePath of result.filePaths) {
      const feeds = await feedService.importFeed(filePath);
      importedFeeds.push(...feeds);
    }
    return importedFeeds;
  });

  ipcMain.handle('feeds:delete', async (_, feedId: unknown) => {
    return feedService.deleteFeed(validateId(feedId, 'feedId'));
  });

  ipcMain.handle('feeds:test', async (_, feedId: unknown) => {
    return feedService.testFeed(validateId(feedId, 'feedId'));
  });

  ipcMain.handle('feeds:update', async (_, feedId: unknown, updates: unknown) => {
    return feedService.updateFeed(validateId(feedId, 'feedId'), validateFeedUpdateOptions(updates));
  });

  ipcMain.handle('feeds:linkDetail', async (_, summaryFeedId: unknown, detailFeedId: unknown) => {
    return feedService.linkDetailFeed(validateId(summaryFeedId, 'summaryFeedId'), validateId(detailFeedId, 'detailFeedId'));
  });

  ipcMain.handle('feeds:unlinkDetail', async (_, summaryFeedId: unknown) => {
    return feedService.unlinkDetailFeed(validateId(summaryFeedId, 'summaryFeedId'));
  });

  ipcMain.handle('feeds:getDetailFeeds', async () => {
    return feedService.getDetailFeeds();
  });

  ipcMain.handle('feeds:getDetailSyncDiagnostics', async () => {
    return feedService.getDetailSyncConfigDiagnostics();
  });

  ipcMain.handle('feeds:testFetchProjectDetail', async (_, projectId?: unknown) => {
    return feedService.testFetchProjectDetail(projectId !== undefined ? validateString(projectId, 'projectId') : undefined);
  });

  ipcMain.handle('feeds:getAvailableTemplates', async () => {
    return feedService.getAvailableTemplates();
  });

  ipcMain.handle('feeds:exportTemplates', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window!, {
      title: 'Select Folder to Export Templates',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { exported: [], errors: [], cancelled: true };
    }

    const exportResult = await feedService.exportTemplatesToDirectory(result.filePaths[0]);
    return { ...exportResult, cancelled: false };
  });

  ipcMain.handle('feeds:importTemplate', async (_, filename: unknown) => {
    const validFilename = validateString(filename, 'filename');
    const content = feedService.getTemplateContent(validFilename);
    if (!content) {
      throw new Error(`Template not found: ${filename}`);
    }

    // Parse and import the template
    const { parseAtomSvcFile } = await import('../services/atomsvc-parser');
    const parsedFeeds = await parseAtomSvcFile(content);

    const db = (await import('../database/connection')).getDatabase();
    const importedFeeds: feedService.AtomFeed[] = [];

    for (const feed of parsedFeeds) {
      // Check if feed URL already exists
      const existing = db.prepare('SELECT id FROM atom_feeds WHERE feed_url = ?').get(feed.feedUrl) as { id: number } | undefined;

      if (existing) {
        // Update existing feed
        db.prepare("UPDATE atom_feeds SET name = ?, feed_type = ?, updated_at = datetime('now') WHERE id = ?").run(
          feed.name,
          feed.feedType,
          existing.id
        );
        importedFeeds.push(feedService.getFeedById(existing.id)!);
      } else {
        // Insert new feed
        const result = db.prepare('INSERT INTO atom_feeds (name, feed_type, feed_url) VALUES (?, ?, ?)').run(
          feed.name,
          feed.feedType,
          feed.feedUrl
        );
        importedFeeds.push(feedService.getFeedById(result.lastInsertRowid as number)!);
      }
    }

    return importedFeeds;
  });

  ipcMain.handle('projects:getDetailSyncDiagnostics', async () => {
    return projectService.getDetailSyncDiagnostics();
  });

  // ============================================
  // Settings
  // ============================================
  ipcMain.handle('settings:get', async (_, key: unknown) => {
    return settingsService.getSetting(validateSettingKey(key));
  });

  ipcMain.handle('settings:set', async (_, key: unknown, value: unknown) => {
    return settingsService.setSetting(validateSettingKey(key), validateString(value, 'value'));
  });

  ipcMain.handle('settings:getAll', async () => {
    return settingsService.getAllSettings();
  });

  // ============================================
  // Updates
  // ============================================
  ipcMain.handle('updates:check', async () => {
    const status = await autoUpdaterService.checkForUpdates();
    return {
      updateAvailable: status.available,
      version: status.version,
      releaseNotes: status.releaseNotes,
    };
  });

  ipcMain.handle('updates:download', async () => {
    await autoUpdaterService.downloadUpdate();
  });

  ipcMain.handle('updates:install', async () => {
    autoUpdaterService.installUpdate();
  });

  ipcMain.handle('updates:getStatus', async () => {
    return autoUpdaterService.getUpdateStatus();
  });

  ipcMain.handle('updates:getVersion', async () => {
    return autoUpdaterService.getCurrentVersion();
  });

  ipcMain.handle('updates:setGitHubToken', async (_, token: unknown) => {
    if (token !== null && token !== undefined) {
      autoUpdaterService.setGitHubToken(validateString(token, 'token'));
    } else {
      autoUpdaterService.setGitHubToken(null);
    }
  });

  ipcMain.handle('updates:getGitHubTokenStatus', async () => {
    return autoUpdaterService.getGitHubTokenStatus();
  });

  // ============================================
  // Cloud Database
  // ============================================
  ipcMain.handle('cloud:getStatus', async () => {
    return cloudDatabase.getStatus();
  });

  ipcMain.handle('cloud:testConnection', async (_, connectionString: unknown) => {
    return cloudDatabase.testConnection(validateString(connectionString, 'connectionString'));
  });

  ipcMain.handle('cloud:setConnectionString', async (_, connectionString: unknown) => {
    cloudDatabase.setConnectionString(validateString(connectionString, 'connectionString'));
  });

  ipcMain.handle('cloud:connect', async () => {
    return cloudDatabase.connect();
  });

  ipcMain.handle('cloud:disconnect', async () => {
    return cloudDatabase.disconnect();
  });

  ipcMain.handle('cloud:setEnabled', async (_, enabled: unknown) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid enabled: must be a boolean');
    }
    cloudDatabase.setCloudEnabled(enabled);
  });

  // ============================================
  // Employees
  // ============================================
  ipcMain.handle('employees:getAll', async (_, options) => {
    return employeeService.getAll(validateQueryOptions(options));
  });

  ipcMain.handle('employees:getById', async (_, id: unknown) => {
    return employeeService.getById(validateId(id));
  });

  ipcMain.handle('employees:create', async (_, data: unknown) => {
    return employeeService.create(validateEmployeeData(data));
  });

  ipcMain.handle('employees:update', async (_, id: unknown, data: unknown) => {
    return employeeService.update(validateId(id), validateEmployeeData(data));
  });

  ipcMain.handle('employees:delete', async (_, id: unknown) => {
    return employeeService.deleteEmployee(validateId(id));
  });

  ipcMain.handle('employees:getDepartments', async () => {
    return employeeService.getDepartments();
  });

  ipcMain.handle('employees:reorder', async (_, orderedIds: unknown) => {
    if (!Array.isArray(orderedIds)) {
      throw new Error('Invalid orderedIds: must be an array');
    }
    return employeeService.reorder(orderedIds.map((id) => validateId(id)));
  });

  ipcMain.handle('employees:getCount', async (_, isActive?: unknown) => {
    return employeeService.getCount(typeof isActive === 'boolean' ? isActive : undefined);
  });

  // ============================================
  // Quotations
  // ============================================
  ipcMain.handle('quotations:getAll', async (_, options) => {
    return quotationService.getAll(validateQueryOptions(options));
  });

  ipcMain.handle('quotations:getById', async (_, id: unknown) => {
    return quotationService.getById(validateId(id));
  });

  ipcMain.handle('quotations:create', async (_, data: unknown) => {
    return quotationService.create(validateQuotationData(data));
  });

  ipcMain.handle('quotations:update', async (_, id: unknown, data: unknown) => {
    return quotationService.update(validateId(id), validateQuotationData(data));
  });

  ipcMain.handle('quotations:delete', async (_, id: unknown) => {
    return quotationService.deleteQuotation(validateId(id));
  });

  ipcMain.handle('quotations:getStatuses', async () => {
    return quotationService.getStatuses();
  });

  ipcMain.handle('quotations:getPriorities', async () => {
    return quotationService.getPriorities();
  });

  ipcMain.handle('quotations:getStats', async () => {
    return quotationService.getStats();
  });

  // ============================================
  // Resource Tasks
  // ============================================
  ipcMain.handle('resourceTasks:getAll', async (_, options) => {
    return resourceTaskService.getAll(validateQueryOptions(options));
  });

  ipcMain.handle('resourceTasks:getById', async (_, id: unknown) => {
    return resourceTaskService.getById(validateId(id));
  });

  ipcMain.handle('resourceTasks:getByEmployee', async (_, employeeId: unknown) => {
    return resourceTaskService.getByEmployee(validateId(employeeId, 'employeeId'));
  });

  ipcMain.handle('resourceTasks:getUnassigned', async () => {
    return resourceTaskService.getUnassigned();
  });

  ipcMain.handle('resourceTasks:create', async (_, data: unknown) => {
    return resourceTaskService.create(validateResourceTaskData(data));
  });

  ipcMain.handle('resourceTasks:update', async (_, id: unknown, data: unknown) => {
    return resourceTaskService.update(validateId(id), validateResourceTaskData(data));
  });

  ipcMain.handle('resourceTasks:delete', async (_, id: unknown) => {
    return resourceTaskService.deleteTask(validateId(id));
  });

  ipcMain.handle('resourceTasks:moveToEmployee', async (_, taskId: unknown, employeeId: unknown, sortOrder?: unknown) => {
    const validEmployeeId = employeeId === null ? null : validateId(employeeId, 'employeeId');
    const validSortOrder = typeof sortOrder === 'number' ? sortOrder : undefined;
    return resourceTaskService.moveToEmployee(validateId(taskId, 'taskId'), validEmployeeId, validSortOrder);
  });

  ipcMain.handle('resourceTasks:reorderForEmployee', async (_, employeeId: unknown, orderedIds: unknown) => {
    if (!Array.isArray(orderedIds)) {
      throw new Error('Invalid orderedIds: must be an array');
    }
    const validEmployeeId = employeeId === null ? null : validateId(employeeId, 'employeeId');
    return resourceTaskService.reorderForEmployee(validEmployeeId, orderedIds.map((id) => validateId(id)));
  });

  ipcMain.handle('resourceTasks:getStatuses', async () => {
    return resourceTaskService.getStatuses();
  });

  ipcMain.handle('resourceTasks:getPriorities', async () => {
    return resourceTaskService.getPriorities();
  });

  // ============================================
  // Teams
  // ============================================
  ipcMain.handle('teams:getAll', async (_, options) => {
    return teamService.getAll(validateQueryOptions(options));
  });

  ipcMain.handle('teams:getById', async (_, id: unknown) => {
    return teamService.getById(validateId(id));
  });

  ipcMain.handle('teams:create', async (_, data: unknown) => {
    return teamService.create(validateTeamData(data));
  });

  ipcMain.handle('teams:update', async (_, id: unknown, data: unknown) => {
    return teamService.update(validateId(id), validateTeamData(data));
  });

  ipcMain.handle('teams:delete', async (_, id: unknown) => {
    return teamService.deleteTeam(validateId(id));
  });

  ipcMain.handle('teams:getMembers', async (_, teamId: unknown) => {
    return teamService.getMembers(validateId(teamId, 'teamId'));
  });

  ipcMain.handle('teams:addMember', async (_, teamId: unknown, employeeId: unknown, isLead?: unknown) => {
    return teamService.addMember(
      validateId(teamId, 'teamId'),
      validateId(employeeId, 'employeeId'),
      typeof isLead === 'boolean' ? isLead : false
    );
  });

  ipcMain.handle('teams:removeMember', async (_, teamId: unknown, employeeId: unknown) => {
    return teamService.removeMember(validateId(teamId, 'teamId'), validateId(employeeId, 'employeeId'));
  });

  ipcMain.handle('teams:setLead', async (_, teamId: unknown, employeeId: unknown) => {
    return teamService.setLead(validateId(teamId, 'teamId'), validateId(employeeId, 'employeeId'));
  });

  ipcMain.handle('teams:getTeamsForEmployee', async (_, employeeId: unknown) => {
    return teamService.getTeamsForEmployee(validateId(employeeId, 'employeeId'));
  });

  ipcMain.handle('teams:reorder', async (_, orderedIds: unknown) => {
    if (!Array.isArray(orderedIds)) {
      throw new Error('Invalid orderedIds: must be an array');
    }
    return teamService.reorder(orderedIds.map((id) => validateId(id)));
  });

  console.log('IPC handlers registered');
}

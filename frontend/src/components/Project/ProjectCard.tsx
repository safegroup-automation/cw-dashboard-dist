import { useState, useMemo, useCallback } from 'react';
import { Clock, DollarSign, Pin, ChevronDown, ChevronUp, Calendar, Hash, FileText, Pencil, X, Check } from 'lucide-react';
import { Project } from '../../types';
import {
  formatCurrency,
  formatHours,
  formatPercent,
  formatDate,
  getProjectStatusStyle,
  getProjectStatusColor,
} from '../../utils/formatting';
import { getFieldShortDisplayName, formatDetailFieldValue } from '../../utils/detailFieldNames';
import { isElectron, electronProjectsApi } from '../../api/electron-api';

interface ProjectCardProps {
  project: Project;
  isPinned?: boolean;
  onTogglePin?: () => void;
  alwaysExpanded?: boolean;
  visibleDetailFields?: string[];
  onProjectUpdated?: (project: Project) => void;
}

export default function ProjectCard({ project, isPinned, onTogglePin, alwaysExpanded = false, visibleDetailFields = [], onProjectUpdated }: ProjectCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingHours, setEditingHours] = useState(false);
  const [hoursInput, setHoursInput] = useState('');
  const isExpanded = alwaysExpanded || expanded;

  // Use override if set, otherwise synced estimate
  const effectiveHoursEstimate = project.hoursOverride ?? project.hoursEstimate;
  const hoursPercentUsed = project.hoursPercentUsed ?? (
    effectiveHoursEstimate && effectiveHoursEstimate > 0 && project.hoursActual != null
      ? (project.hoursActual / effectiveHoursEstimate) * 100
      : 0
  );
  const budgetPercentUsed = project.budgetPercentUsed ?? 0;

  // Budget margin: (budget - spent) / budget
  const budgetMargin = project.budget && project.budget > 0 && project.spent != null
    ? ((project.budget - project.spent) / project.budget) * 100
    : null;

  // Parse detail data if available and fields are selected
  const detailFields = useMemo(() => {
    if (!project.detailRawData || visibleDetailFields.length === 0) {
      return [];
    }
    try {
      const data = JSON.parse(project.detailRawData);
      return visibleDetailFields
        .filter(field => data[field] !== undefined && data[field] !== null && data[field] !== '')
        .map(field => ({
          name: field,
          value: String(data[field]),
        }));
    } catch {
      return [];
    }
  }, [project.detailRawData, visibleDetailFields]);

  const handlePinClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTogglePin?.();
  };

  const handleClick = () => {
    if (!alwaysExpanded) {
      setExpanded(!expanded);
    }
  };

  const hoursBarColor =
    hoursPercentUsed >= 100 ? 'bg-red-500' :
    hoursPercentUsed >= 80 ? 'bg-yellow-500' :
    'bg-green-500';

  const budgetBarColor =
    budgetPercentUsed >= 100 ? 'bg-red-500' :
    budgetPercentUsed >= 80 ? 'bg-amber-500' :
    'bg-blue-500';

  const handleEditHours = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setHoursInput(effectiveHoursEstimate != null ? String(effectiveHoursEstimate) : '');
    setEditingHours(true);
  }, [effectiveHoursEstimate]);

  const handleCancelEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingHours(false);
  }, []);

  const handleClearOverride = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isElectron()) return;
    try {
      const updated = await electronProjectsApi.updateHoursOverride(project.id, null);
      onProjectUpdated?.(updated);
      setEditingHours(false);
    } catch (err) {
      console.error('Failed to clear hours override:', err);
    }
  }, [project.id, onProjectUpdated]);

  const handleSaveHours = useCallback(async (e: React.MouseEvent | React.FormEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isElectron()) return;
    const value = parseFloat(hoursInput);
    if (isNaN(value) || value <= 0) return;
    try {
      const updated = await electronProjectsApi.updateHoursOverride(project.id, value);
      onProjectUpdated?.(updated);
      setEditingHours(false);
    } catch (err) {
      console.error('Failed to update hours override:', err);
    }
  }, [hoursInput, project.id, onProjectUpdated]);

  const hasHoursData = (project.hoursEstimate != null) || (project.hoursActual != null) || (project.hoursOverride != null);

  return (
    <div
      onClick={handleClick}
      className={`bg-board-bg border border-board-border border-l-2 ${getProjectStatusStyle(project.status)} rounded px-2 py-1.5 ${!alwaysExpanded ? 'cursor-pointer hover:bg-board-border/30' : ''} transition-all`}
    >
      {/* First row: Client name, Pin, and Status */}
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-white truncate flex-1">
          {project.clientName}
        </span>
        {onTogglePin && (
          <button
            onClick={handlePinClick}
            className={`p-0.5 rounded transition-colors ${
              isPinned ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
            }`}
            title={isPinned ? 'Unpin' : 'Pin'}
          >
            <Pin size={12} fill={isPinned ? 'currentColor' : 'none'} />
          </button>
        )}
        <span className={`text-[11px] flex-shrink-0 ${getProjectStatusColor(project.status)}`}>
          {project.status}
        </span>
        {!alwaysExpanded && (
          <button className="text-gray-500 p-0.5">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {/* Second row: Project name */}
      <div className="mt-0.5">
        <span className="text-xs text-gray-400 truncate block">{project.projectName}</span>
      </div>

      {/* Hours progress bar (primary) */}
      {hasHoursData && (
        <div className="mt-1.5">
          <div className="flex items-center justify-between text-[10px] text-gray-500 mb-0.5">
            <div className="flex items-center gap-1">
              <Clock size={10} className="text-gray-500" />
              <span>Hours</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400">
                {formatHours(project.hoursActual)} / {formatHours(effectiveHoursEstimate)}
                {project.hoursOverride != null && (
                  <span className="text-purple-400 ml-0.5" title={`Synced: ${formatHours(project.hoursEstimate)}`}>*</span>
                )}
              </span>
              <span className="font-medium text-white">{formatPercent(hoursPercentUsed)}</span>
            </div>
          </div>
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${hoursBarColor}`}
              style={{ width: `${Math.min(100, hoursPercentUsed)}%` }}
            />
          </div>
          {/* Override controls - shown when expanded */}
          {isExpanded && isElectron() && (
            <div className="mt-1 flex items-center gap-1">
              {editingHours ? (
                <form onSubmit={handleSaveHours} onClick={e => e.stopPropagation()} className="flex items-center gap-1">
                  <input
                    type="number"
                    value={hoursInput}
                    onChange={e => setHoursInput(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    className="w-16 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-[10px] text-white focus:outline-none focus:border-purple-400"
                    placeholder="Hours"
                    autoFocus
                    min="0"
                    step="any"
                  />
                  <button type="submit" className="text-green-400 hover:text-green-300 p-0.5" title="Save">
                    <Check size={10} />
                  </button>
                  <button type="button" onClick={handleCancelEdit} className="text-gray-500 hover:text-gray-300 p-0.5" title="Cancel">
                    <X size={10} />
                  </button>
                  {project.hoursOverride != null && (
                    <button type="button" onClick={handleClearOverride} className="text-red-400 hover:text-red-300 p-0.5 text-[9px]" title="Clear override, use synced value">
                      Reset
                    </button>
                  )}
                </form>
              ) : (
                <button
                  onClick={handleEditHours}
                  className="flex items-center gap-0.5 text-[9px] text-purple-400 hover:text-purple-300 transition-colors"
                  title="Override total hours"
                >
                  <Pencil size={8} />
                  <span>{project.hoursOverride != null ? 'Edit override' : 'Override hours'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Budget progress bar (secondary) */}
      <div className="mt-1.5">
        <div className="flex items-center justify-between text-[10px] text-gray-500 mb-0.5">
          <div className="flex items-center gap-1">
            <DollarSign size={10} className="text-gray-500" />
            <span>Budget</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">
              {formatCurrency(project.spent)} / {formatCurrency(project.budget)}
            </span>
            {budgetMargin !== null && (
              <span className={`font-medium ${budgetMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {budgetMargin >= 0 ? '' : '-'}{formatPercent(Math.abs(budgetMargin))} margin
              </span>
            )}
          </div>
        </div>
        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${budgetBarColor}`}
            style={{ width: `${Math.min(100, budgetPercentUsed)}%` }}
          />
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-board-border space-y-2">
          {/* Hours details */}
          {hasHoursData && (
            <div className="flex items-center gap-2">
              <Clock size={12} className="text-gray-500" />
              <span className="text-xs text-gray-400">
                Hours: {formatHours(project.hoursActual)} used of {formatHours(effectiveHoursEstimate)} available
                {project.hoursRemaining !== undefined && project.hoursRemaining !== null && project.hoursRemaining > 0 && (
                  <span className="text-gray-500"> ({formatHours(project.hoursRemaining)} remaining)</span>
                )}
              </span>
            </div>
          )}


          {/* Extended Detail Fields */}
          {detailFields.length > 0 && (
            <div className="mt-2 pt-2 border-t border-board-border/50">
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileText size={11} className="text-purple-400" />
                <span className="text-[10px] text-purple-400 font-medium uppercase tracking-wide">Extended Details</span>
              </div>
              <div className="space-y-1">
                {detailFields.map(field => (
                  <div key={field.name} className="flex gap-2 text-xs">
                    <span className="text-gray-500 flex-shrink-0">{getFieldShortDisplayName(field.name)}:</span>
                    <span className="text-gray-400 break-words">{formatDetailFieldValue(field.name, field.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* External ID */}
          <div className="flex items-center gap-2">
            <Hash size={12} className="text-gray-500" />
            <span className="text-xs text-gray-500">ID: {project.externalId}</span>
          </div>

          {/* Timestamps */}
          <div className="flex items-center gap-2">
            <Calendar size={12} className="text-gray-500" />
            <span className="text-xs text-gray-500">
              Updated: {formatDate(project.updatedAt)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

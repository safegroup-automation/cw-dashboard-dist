import { useState } from 'react';
import { Pin, ChevronDown, ChevronUp, Calendar, Hash, Clock, User, Building2, DollarSign, Layout } from 'lucide-react';
import { ServiceTicket } from '../../types';
import { formatCurrency, formatDate, formatHours, getPriorityColor, getTicketStatusColor } from '../../utils/formatting';

interface ServiceTicketCardProps {
  ticket: ServiceTicket;
  isPinned?: boolean;
  onTogglePin?: () => void;
  alwaysExpanded?: boolean;
}

export default function ServiceTicketCard({ ticket, isPinned, onTogglePin, alwaysExpanded = false }: ServiceTicketCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isExpanded = alwaysExpanded || expanded;

  const statusColors = getTicketStatusColor(ticket.status);

  const handlePinClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTogglePin?.();
  };

  const handleClick = () => {
    if (!alwaysExpanded) {
      setExpanded(!expanded);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`bg-board-bg border border-board-border border-l-4 ${statusColors.border} ${statusColors.bg} rounded px-2 py-1.5 overflow-hidden ${!alwaysExpanded ? 'cursor-pointer hover:bg-board-border/30' : ''} transition-all`}
    >
      {/* Row 1: Summary (primary), Pin, and Priority */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] font-mono text-gray-500 flex-shrink-0">#{ticket.externalId}</span>
        <span className="text-[13px] font-semibold text-white truncate flex-1 min-w-0">
          {ticket.summary || 'No summary'}
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
        {ticket.priority && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${getPriorityColor(ticket.priority)} text-white flex-shrink-0`}>
            {ticket.priority}
          </span>
        )}
        {!alwaysExpanded && (
          <button className="text-gray-500 p-0.5">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {/* Row 2: Company name (secondary) */}
      <div className="mt-0.5 min-w-0">
        <span className="text-xs text-gray-400 truncate block">
          {ticket.companyName || 'No Company'}
        </span>
      </div>

      {/* Row 3: Status and Assigned To */}
      <div className="flex items-center gap-2 mt-1 min-w-0">
        {ticket.status && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded bg-board-border flex-shrink-0 ${statusColors.text}`}>
            {ticket.status}
          </span>
        )}
        {ticket.assignedTo && (
          <span className="text-[10px] text-gray-500 truncate flex-1 min-w-0">
            {ticket.assignedTo}
          </span>
        )}
        {ticket.hoursRemaining !== undefined && ticket.hoursRemaining !== null && (
          <span className="text-[10px] text-orange-400 flex-shrink-0">
            {formatHours(ticket.hoursRemaining)} left
          </span>
        )}
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-board-border space-y-2">
          {/* Hours Info */}
          {(ticket.hoursEstimate !== undefined || ticket.hoursActual !== undefined) && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Clock size={12} className="text-gray-500" />
                <span className="text-xs text-gray-400">
                  Est: {formatHours(ticket.hoursEstimate)}
                </span>
              </div>
              <span className="text-xs text-gray-400">
                Actual: {formatHours(ticket.hoursActual)}
              </span>
              {ticket.hoursRemaining !== undefined && ticket.hoursRemaining !== null && (
                <span className={`text-xs ${ticket.hoursRemaining < 0 ? 'text-red-400' : 'text-green-400'}`}>
                  Remaining: {formatHours(ticket.hoursRemaining)}
                </span>
              )}
            </div>
          )}

          {/* Budget */}
          {ticket.budget !== undefined && ticket.budget !== null && (
            <div className="flex items-center gap-2">
              <DollarSign size={12} className="text-gray-500" />
              <span className="text-xs text-gray-400">
                Budget: {formatCurrency(ticket.budget)}
              </span>
            </div>
          )}

          {/* Company */}
          {ticket.companyName && (
            <div className="flex items-center gap-2">
              <Building2 size={12} className="text-gray-500" />
              <span className="text-xs text-gray-400">
                Company: {ticket.companyName}
              </span>
            </div>
          )}

          {/* Assigned to */}
          {ticket.assignedTo && (
            <div className="flex items-center gap-2">
              <User size={12} className="text-gray-500" />
              <span className="text-xs text-gray-400">
                Assigned to: {ticket.assignedTo}
              </span>
            </div>
          )}

          {/* Board */}
          {ticket.boardName && (
            <div className="flex items-center gap-2">
              <Layout size={12} className="text-gray-500" />
              <span className="text-xs text-gray-400">
                Board: {ticket.boardName}
              </span>
            </div>
          )}

          {/* Created Date */}
          {ticket.createdDate && (
            <div className="flex items-center gap-2">
              <Calendar size={12} className="text-gray-500" />
              <span className="text-xs text-gray-400">
                Created: {formatDate(ticket.createdDate)}
              </span>
            </div>
          )}

          {/* Due Date */}
          {ticket.dueDate && (
            <div className="flex items-center gap-2">
              <Calendar size={12} className="text-gray-500" />
              <span className="text-xs text-gray-400">
                Due: {formatDate(ticket.dueDate)}
              </span>
            </div>
          )}

          {/* Notes */}
          {ticket.notes && (
            <div className="text-xs text-gray-400">
              <span className="text-gray-500">Notes: </span>
              {ticket.notes}
            </div>
          )}

          {/* External ID */}
          <div className="flex items-center gap-2">
            <Hash size={12} className="text-gray-500" />
            <span className="text-xs text-gray-500">Ticket #: {ticket.externalId}</span>
          </div>

          {/* Updated timestamp */}
          {ticket.lastUpdated && (
            <div className="flex items-center gap-2">
              <Calendar size={12} className="text-gray-500" />
              <span className="text-xs text-gray-500">
                Updated: {formatDate(ticket.lastUpdated)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

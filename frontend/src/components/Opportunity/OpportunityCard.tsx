import { useState } from 'react';
import { Pin, ChevronDown, ChevronUp, Calendar, Hash, DollarSign, User } from 'lucide-react';
import { Opportunity } from '../../types';
import { formatCurrency, formatDate, getStageColor, getStageStyle, getOpportunityStatusColor } from '../../utils/formatting';

interface OpportunityCardProps {
  opportunity: Opportunity;
  isPinned?: boolean;
  onTogglePin?: () => void;
  alwaysExpanded?: boolean;
}

export default function OpportunityCard({ opportunity, isPinned, onTogglePin, alwaysExpanded = false }: OpportunityCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isExpanded = alwaysExpanded || expanded;

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
      className={`bg-board-bg border border-board-border border-l-2 ${getStageStyle(opportunity.stage)} rounded px-2 py-1.5 ${!alwaysExpanded ? 'cursor-pointer hover:bg-board-border/30' : ''} transition-all`}
    >
      {/* Row 1: Opportunity name, Pin, Status */}
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-white truncate flex-1">
          {opportunity.opportunityName}
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
        {opportunity.status && (
          <span className={`text-[11px] flex-shrink-0 ${getOpportunityStatusColor(opportunity.status)}`}>
            {opportunity.status}
          </span>
        )}
        {!alwaysExpanded && (
          <button className="text-gray-500 p-0.5">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {/* Row 2: Company name */}
      <div className="mt-0.5">
        <span className="text-xs text-gray-400 truncate block">
          {opportunity.companyName}
        </span>
      </div>

      {/* Row 3: Stage, Revenue, Sales Rep, Probability */}
      <div className="flex items-center gap-2 mt-1">
        {opportunity.stage && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${getStageColor(opportunity.stage)} text-white`}>
            {opportunity.stage}
          </span>
        )}
        <span className="text-[11px] font-semibold text-green-400 flex-shrink-0">
          {formatCurrency(opportunity.expectedRevenue)}
        </span>
        {opportunity.salesRep && (
          <span className="text-[10px] text-gray-500 truncate ml-auto">
            {opportunity.salesRep}
          </span>
        )}
        {opportunity.probability !== undefined && (
          <span className="text-[10px] text-gray-500">
            {opportunity.probability}%
          </span>
        )}
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-board-border space-y-2">
          {/* Weighted value */}
          {opportunity.weightedValue !== undefined && (
            <div className="flex items-center gap-2">
              <DollarSign size={12} className="text-gray-500" />
              <span className="text-xs text-gray-400">
                Weighted Value: {formatCurrency(opportunity.weightedValue)}
                <span className="text-gray-500 ml-1">
                  ({opportunity.probability}% of {formatCurrency(opportunity.expectedRevenue)})
                </span>
              </span>
            </div>
          )}

          {/* Close date */}
          {opportunity.closeDate && (
            <div className="flex items-center gap-2">
              <Calendar size={12} className="text-gray-500" />
              <span className="text-xs text-gray-400">
                Close Date: {formatDate(opportunity.closeDate)}
              </span>
            </div>
          )}

          {/* Sales rep */}
          {opportunity.salesRep && (
            <div className="flex items-center gap-2">
              <User size={12} className="text-gray-500" />
              <span className="text-xs text-gray-400">
                Sales Rep: {opportunity.salesRep}
              </span>
            </div>
          )}

          {/* Notes */}
          {opportunity.notes && (
            <div className="text-xs text-gray-400">
              <span className="text-gray-500">Notes: </span>
              {opportunity.notes}
            </div>
          )}

          {/* ID - use internal database ID since SSRS report doesn't have Opp_RecID */}
          <div className="flex items-center gap-2">
            <Hash size={12} className="text-gray-500" />
            <span className="text-xs text-gray-500">ID: {opportunity.id}</span>
          </div>

          {/* Updated timestamp */}
          <div className="flex items-center gap-2">
            <Calendar size={12} className="text-gray-500" />
            <span className="text-xs text-gray-500">
              Updated: {formatDate(opportunity.updatedAt)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

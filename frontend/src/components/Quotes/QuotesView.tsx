import { FileText } from 'lucide-react';

export default function QuotesView() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl font-semibold text-white">Quotes & Proposals</h2>
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-400 uppercase tracking-wide">
          Coming Soon
        </span>
      </div>
      <div className="bg-board-panel border border-board-border rounded-lg p-12 text-center">
        <FileText className="mx-auto mb-4 text-gray-500" size={48} />
        <h3 className="text-lg font-medium text-white mb-2">Quotes Integration</h3>
        <p className="text-gray-400 max-w-md mx-auto">
          Quote syncing from ConnectWise is planned for a future release. Quotes will be pulled from CW and linked to their associated opportunities.
        </p>
      </div>
    </div>
  );
}

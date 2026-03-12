import { Project, Opportunity, ServiceTicket } from '../../types';

// Safely parse and format raw JSON data
// rawData may be a string (from API) or already-parsed object (from Electron IPC)
const formatRawData = (rawData: string | Record<string, unknown> | null | undefined): string => {
  if (!rawData) return 'No raw data available - sync again to populate';
  if (typeof rawData === 'object') {
    return JSON.stringify(rawData, null, 2);
  }
  try {
    return JSON.stringify(JSON.parse(rawData), null, 2);
  } catch {
    return `[Invalid JSON - displaying raw string]\n\n${rawData}`;
  }
};

interface RawDataCardProps {
  title: string;
  subtitle: string;
  rawData: string | Record<string, unknown> | null | undefined;
  detailRawData?: string | null | undefined;
}

function RawDataCard({ title, subtitle, rawData, detailRawData }: RawDataCardProps) {
  return (
    <div className="bg-board-bg border border-board-border rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-white">{title}</span>
        <span className="text-xs text-gray-500">{subtitle}</span>
      </div>
      <pre className="text-xs text-gray-300 bg-gray-900 p-2 rounded overflow-x-auto max-h-64 overflow-y-auto">
        {formatRawData(rawData)}
      </pre>
      {detailRawData && (
        <>
          <div className="text-xs text-purple-400 mt-3 mb-1 font-medium">Detail Data:</div>
          <pre className="text-xs text-gray-300 bg-gray-900 p-2 rounded overflow-x-auto max-h-64 overflow-y-auto">
            {formatRawData(detailRawData)}
          </pre>
        </>
      )}
    </div>
  );
}

interface ProjectRawDataViewProps {
  projects: Project[];
}

export function ProjectRawDataView({ projects }: ProjectRawDataViewProps) {
  return (
    <div className="space-y-2">
      {projects.map((project) => (
        <RawDataCard
          key={project.id}
          title={`${project.clientName} - ${project.projectName}`}
          subtitle={`ID: ${project.externalId}`}
          rawData={project.rawData}
          detailRawData={project.detailRawData}
        />
      ))}
    </div>
  );
}

interface OpportunityRawDataViewProps {
  opportunities: Opportunity[];
}

export function OpportunityRawDataView({ opportunities }: OpportunityRawDataViewProps) {
  return (
    <div className="space-y-2">
      {opportunities.map((opportunity) => (
        <RawDataCard
          key={opportunity.id}
          title={`${opportunity.companyName} - ${opportunity.opportunityName}`}
          subtitle={`ID: ${opportunity.id}`}
          rawData={opportunity.rawData}
        />
      ))}
    </div>
  );
}

interface ServiceTicketRawDataViewProps {
  tickets: ServiceTicket[];
}

export function ServiceTicketRawDataView({ tickets }: ServiceTicketRawDataViewProps) {
  return (
    <div className="space-y-2">
      {tickets.map((ticket) => (
        <RawDataCard
          key={ticket.id}
          title={`${ticket.companyName} - ${ticket.summary}`}
          subtitle={`ID: ${ticket.id}`}
          rawData={ticket.rawData}
        />
      ))}
    </div>
  );
}

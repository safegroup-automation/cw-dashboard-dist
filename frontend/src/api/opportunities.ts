import api from './client';
import { Opportunity, OpportunityAPI, transformOpportunity } from '../types';
import { PaginatedResponse } from './projects';

export interface OpportunitiesFilter {
  stage?: string;
  salesRep?: string;
  skip?: number;
  limit?: number;
}

export const opportunitiesApi = {
  getAll: async (filters: OpportunitiesFilter = {}): Promise<Opportunity[]> => {
    const params: Record<string, string> = {};
    if (filters.stage) params.stage = filters.stage;
    if (filters.salesRep) params.sales_rep = filters.salesRep;
    if (filters.skip !== undefined) params.skip = String(filters.skip);
    if (filters.limit !== undefined) params.limit = String(filters.limit);

    const response = await api.get<PaginatedResponse<OpportunityAPI>>(
      '/opportunities',
      Object.keys(params).length > 0 ? params : undefined
    );
    return response.items.map(transformOpportunity);
  },

  getAllPaginated: async (filters: OpportunitiesFilter = {}): Promise<PaginatedResponse<Opportunity>> => {
    const params: Record<string, string> = {};
    if (filters.stage) params.stage = filters.stage;
    if (filters.salesRep) params.sales_rep = filters.salesRep;
    if (filters.skip !== undefined) params.skip = String(filters.skip);
    if (filters.limit !== undefined) params.limit = String(filters.limit);

    const response = await api.get<PaginatedResponse<OpportunityAPI>>(
      '/opportunities',
      Object.keys(params).length > 0 ? params : undefined
    );

    return {
      ...response,
      items: response.items.map(transformOpportunity),
    };
  },

  getById: async (id: number): Promise<Opportunity> => {
    const data = await api.get<OpportunityAPI>(`/opportunities/${id}`);
    return transformOpportunity(data);
  },

  getByExternalId: async (externalId: string): Promise<Opportunity> => {
    const data = await api.get<OpportunityAPI>(`/opportunities/external/${externalId}`);
    return transformOpportunity(data);
  },

  getStages: async (): Promise<string[]> => {
    return api.get<string[]>('/opportunities/stages');
  },

  getStatuses: async (): Promise<string[]> => {
    return api.get<string[]>('/opportunities/statuses');
  },

  getSalesReps: async (): Promise<string[]> => {
    return api.get<string[]>('/opportunities/sales-reps');
  },
};

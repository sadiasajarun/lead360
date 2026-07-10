import { createAsyncThunk } from '@reduxjs/toolkit';
import { httpService } from '../httpService';
import type { Lead, LeadFilters } from '~/types/lead';
import type { Paginated } from '~/types/api';

export const fetchLeads = createAsyncThunk('leads/fetch', async (filters?: LeadFilters) => {
  const res = await httpService.get('/leads', { params: filters || {} });
  return res.data.data as Paginated<Lead>;
});

export async function createLead(payload: Partial<Lead>): Promise<Lead> {
  const res = await httpService.post('/leads', payload);
  return res.data.data as Lead;
}

export const deleteLead = (id: string) => httpService.delete(`/leads/${id}`);

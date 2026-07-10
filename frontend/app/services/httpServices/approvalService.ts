import { createAsyncThunk } from '@reduxjs/toolkit';
import { httpService } from '../httpService';
import type { Lead } from '~/types/lead';
import type { Paginated } from '~/types/api';

export const fetchQueue = createAsyncThunk('approvals/fetch', async () => {
  const res = await httpService.get('/approvals');
  return res.data.data as Paginated<Lead>;
});

export const approveLead = (id: string, note?: string) =>
  httpService.post(`/approvals/${id}/approve`, { note });
export const rejectLead = (id: string, note: string) =>
  httpService.post(`/approvals/${id}/reject`, { note });

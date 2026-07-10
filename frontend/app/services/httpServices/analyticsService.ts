import { createAsyncThunk } from '@reduxjs/toolkit';
import { httpService } from '../httpService';
import type { Overview } from '~/types/analytics';

export const fetchOverview = createAsyncThunk('analytics/overview', async () => {
  const res = await httpService.get('/analytics/overview');
  return res.data.data as Overview;
});

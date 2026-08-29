import { createAsyncThunk } from '@reduxjs/toolkit';
import { httpService } from '../httpService';
import type { TokenStats } from '~/types/generation';

export const fetchTokenStats = createAsyncThunk('generation/tokenStats', async () => {
  const res = await httpService.get('/generations/stats');
  return res.data.data as TokenStats;
});

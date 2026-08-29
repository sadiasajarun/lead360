import { createSlice } from '@reduxjs/toolkit';
import { fetchTokenStats } from '~/services/httpServices/generationService';
import type { TokenStatsState } from '~/types/generation';

const initialState: TokenStatsState = { data: null, status: 'idle', error: null };

const tokenStatsSlice = createSlice({
  name: 'tokenStats',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTokenStats.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchTokenStats.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.data = action.payload;
      })
      .addCase(fetchTokenStats.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load token stats';
      });
  },
});

export default tokenStatsSlice.reducer;

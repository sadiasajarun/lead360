import { createSlice } from '@reduxjs/toolkit';
import { fetchOverview } from '~/services/httpServices/analyticsService';
import type { AnalyticsState } from '~/types/analytics';

const initialState: AnalyticsState = { data: null, status: 'idle', error: null };

const analyticsSlice = createSlice({
  name: 'analytics',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchOverview.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchOverview.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.data = action.payload;
      })
      .addCase(fetchOverview.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load analytics';
      });
  },
});

export default analyticsSlice.reducer;

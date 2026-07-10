import { createSlice } from '@reduxjs/toolkit';
import { fetchQueue } from '~/services/httpServices/approvalService';
import type { ApprovalsState } from '~/types/analytics';

const initialState: ApprovalsState = { items: [], status: 'idle', error: null };

const approvalsSlice = createSlice({
  name: 'approvals',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchQueue.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchQueue.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload.items;
      })
      .addCase(fetchQueue.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load queue';
      });
  },
});

export default approvalsSlice.reducer;

import { createSlice } from '@reduxjs/toolkit';
import { fetchLeads } from '~/services/httpServices/leadService';
import type { LeadsState } from '~/types/lead';

const initialState: LeadsState = { items: [], total: 0, status: 'idle', error: null };

const leadsSlice = createSlice({
  name: 'leads',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchLeads.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchLeads.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload.items;
        state.total = action.payload.total;
      })
      .addCase(fetchLeads.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load leads';
      });
  },
});

export default leadsSlice.reducer;

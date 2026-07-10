import { createSlice } from '@reduxjs/toolkit';
import { fetchLead } from '~/services/httpServices/leadDetailService';
import type { LeadDetailState } from '~/types/leadDetail';

const initialState: LeadDetailState = { lead: null, status: 'idle', error: null };

const leadDetailSlice = createSlice({
  name: 'leadDetail',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchLead.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchLead.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.lead = action.payload;
      })
      .addCase(fetchLead.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load lead';
      });
  },
});

export default leadDetailSlice.reducer;

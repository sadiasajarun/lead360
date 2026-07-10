import { createSlice } from '@reduxjs/toolkit';
import { fetchBudget } from '~/services/httpServices/budgetService';
import type { BudgetState } from '~/types/budget';

const initialState: BudgetState = { data: null, status: 'idle', error: null };

const budgetSlice = createSlice({
  name: 'budget',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBudget.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchBudget.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.data = action.payload;
      })
      .addCase(fetchBudget.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load budget';
      });
  },
});

export default budgetSlice.reducer;

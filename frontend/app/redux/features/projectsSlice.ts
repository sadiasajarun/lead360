import { createSlice } from '@reduxjs/toolkit';
import { fetchProjects, fetchPortfolio } from '~/services/httpServices/projectService';
import type { ProjectsState } from '~/types/project';

const initialState: ProjectsState = { items: [], status: 'idle', error: null, portfolio: [], portfolioStatus: 'idle' };

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjects.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload;
      })
      .addCase(fetchProjects.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load projects';
      })
      .addCase(fetchPortfolio.pending, (state) => {
        state.portfolioStatus = 'loading';
      })
      .addCase(fetchPortfolio.fulfilled, (state, action) => {
        state.portfolioStatus = 'succeeded';
        state.portfolio = action.payload;
      })
      .addCase(fetchPortfolio.rejected, (state) => {
        state.portfolioStatus = 'failed';
      });
  },
});

export default projectsSlice.reducer;

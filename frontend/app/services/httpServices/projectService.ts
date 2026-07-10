import { createAsyncThunk } from '@reduxjs/toolkit';
import { httpService } from '../httpService';
import type { Project, PortfolioProject } from '~/types/project';

export const fetchProjects = createAsyncThunk(
  'projects/fetch',
  async (params?: { q?: string; category?: string; tech?: string }) => {
    const res = await httpService.get('/projects', { params: params || {} });
    return res.data.data as Project[];
  },
);

export async function createProject(payload: {
  name: string;
  summary?: string;
  category?: string[];
  link?: string;
  techStack?: string[];
}): Promise<Project> {
  const res = await httpService.post('/projects', payload);
  return res.data.data as Project;
}

// Edit a local project (manual or auto-created from a locked lead). Slug regenerates on rename.
// Allowed for sales_pm AND admin. Scraped riseuplabs.com portfolio items are NOT editable.
export async function updateProject(id: string, patch: {
  name?: string;
  summary?: string;
  category?: string[];
  link?: string;
  techStack?: string[];
}): Promise<Project> {
  const res = await httpService.patch(`/projects/${id}`, patch);
  return res.data.data as Project;
}

// Soft-delete a local project. Allowed for sales_pm AND admin.
export async function deleteProject(id: string): Promise<void> {
  await httpService.delete(`/projects/${id}`);
}

// The real Riseup portfolio (scraped from riseuplabs.com/portfolio, stored + embedded for RAG).
export const fetchPortfolio = createAsyncThunk('projects/fetchPortfolio', async () => {
  const res = await httpService.get('/portfolio');
  return res.data.data as PortfolioProject[];
});

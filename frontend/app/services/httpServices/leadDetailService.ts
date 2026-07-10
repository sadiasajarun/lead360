import { createAsyncThunk } from '@reduxjs/toolkit';
import { httpService } from '../httpService';
import type { Lead } from '~/types/lead';
import type { BriefAttachmentResult } from '~/types/leadDetail';
import type { LeadComment } from '~/types/comment';

export const fetchLead = createAsyncThunk('leadDetail/fetch', async (id: string) => {
  const res = await httpService.get(`/leads/${id}`);
  return res.data.data as Lead;
});

// MUTATIONS (direct service calls).
export const submitLead = (id: string) => httpService.post(`/leads/${id}/submit`);
export const markSent = (id: string) => httpService.post(`/leads/${id}/mark-sent`);
export const markLocked = (id: string) => httpService.post(`/leads/${id}/mark-locked`);
export const markLost = (id: string, reason: string, note?: string) =>
  httpService.post(`/leads/${id}/mark-lost`, { reason, note });
export const generate = (id: string, prompt?: string) =>
  httpService.post(`/leads/${id}/generate`, prompt ? { prompt } : {});
export const regenerateBudget = (id: string, prompt?: string) =>
  httpService.post(`/leads/${id}/generate/budget`, prompt ? { prompt } : {});
// Manually edit one proposal section (shape preserved) / delete a section entirely.
export const saveProposalSection = (id: string, key: string, value: unknown) =>
  httpService.put(`/leads/${id}/proposal/section`, { key, value });
export const deleteProposalSection = (id: string, key: string) =>
  httpService.delete(`/leads/${id}/proposal/section/${encodeURIComponent(key)}`);

// Regenerate one proposal section (keeps its shape), steered by a plain-English instruction.
export const regenerateSection = (id: string, key: string, instruction?: string) =>
  httpService.post(`/leads/${id}/generate/section`, { key, instruction: instruction || undefined });

// Download the branded proposal PDF (the actual generated format) through the authenticated client.
export async function downloadProposalPdf(id: string, filename: string): Promise<void> {
  const res = await httpService.get(`/leads/${id}/proposal/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const generateBrief = (id: string) => httpService.post(`/leads/${id}/generate/brief`);
export const generatePitch = (id: string) => httpService.post(`/leads/${id}/generate/pitch`);

// --- Comments (shared thread: plain comments + admin decision notes) ---
// oldest-first. 403 when the lead isn't visible to the caller.
export async function fetchComments(id: string): Promise<LeadComment[]> {
  const res = await httpService.get(`/leads/${id}/comments`);
  return res.data.data as LeadComment[];
}
export async function postComment(id: string, body: string): Promise<LeadComment> {
  const res = await httpService.post(`/leads/${id}/comments`, { body });
  return res.data.data as LeadComment;
}

export async function createLeadFull(payload: Record<string, unknown>): Promise<Lead> {
  const res = await httpService.post('/leads', payload);
  return res.data.data as Lead;
}
export const upsertRequirement = (id: string, sourceText: string) =>
  httpService.post(`/leads/${id}/requirement`, { sourceText });

export const updateLead = (id: string, patch: Record<string, unknown>) =>
  httpService.patch(`/leads/${id}`, patch);

export interface ClientQuery {
  id: string;
  question: string;
  why: string;
  status: 'open' | 'confirmed';
  answer?: string;
}
export interface Readiness {
  score: number;
  queries: ClientQuery[];
}

export async function fetchReadiness(id: string): Promise<Readiness> {
  const res = await httpService.get(`/leads/${id}/readiness`);
  return res.data.data as Readiness;
}

// Confirm/answer or reopen a client query; returns the recomputed readiness.
export async function resolveQuery(
  id: string,
  queryId: string,
  patch: { status?: 'open' | 'confirmed'; answer?: string },
): Promise<Readiness> {
  const res = await httpService.patch(`/leads/${id}/readiness/queries/${queryId}`, patch);
  return res.data.data as Readiness;
}

export async function fetchRequirement(
  id: string,
): Promise<{ sourceText?: string; files?: { name: string; key: string; mime: string }[] } | null> {
  const res = await httpService.get(`/leads/${id}/requirement`);
  return res.data.data as { sourceText?: string; files?: { name: string; key: string; mime: string }[] } | null;
}

// Upload a brief document (PDF/DOCX/TXT). Override the default JSON Content-Type so axios/browser
// set multipart/form-data with the correct boundary. Text is extracted server-side into the brief.
export async function uploadBriefAttachment(id: string, file: File): Promise<BriefAttachmentResult> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await httpService.post(`/leads/${id}/requirement/attachments`, fd, {
    headers: { 'Content-Type': undefined },
  });
  return res.data.data as BriefAttachmentResult;
}

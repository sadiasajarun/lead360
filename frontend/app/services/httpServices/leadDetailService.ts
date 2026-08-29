import { createAsyncThunk } from '@reduxjs/toolkit';
import { httpService } from '../httpService';
import type { Lead } from '~/types/lead';
import type { BriefAttachmentResult, ClientFeedback } from '~/types/leadDetail';
import type { GenDiagnostics, BlockExplain, LeadTokenUsage, ModuleBreakdown } from '~/types/generation';
import type { LeadComment } from '~/types/comment';

// Client feedback (P5) — captured after sharing; applied with top priority on the next regeneration.
export const listFeedback = async (id: string): Promise<ClientFeedback[]> => {
  const res = await httpService.get(`/leads/${id}/feedback`);
  return res.data.data as ClientFeedback[];
};
export const addFeedback = async (id: string, text: string): Promise<ClientFeedback> => {
  const res = await httpService.post(`/leads/${id}/feedback`, { text });
  return res.data.data as ClientFeedback;
};
export const deleteFeedback = (id: string, feedbackId: string) =>
  httpService.delete(`/leads/${id}/feedback/${feedbackId}`);

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
export const generate = async (id: string, prompt?: string) => {
  const res = await httpService.post(`/leads/${id}/generate`, prompt ? { prompt } : {});
  const diag = (res.data?.data as { diagnostics?: GenDiagnostics } | undefined)?.diagnostics;
  if (diag) logGenerationDiagnostics(diag);
  return res;
};

// Print the backend generation process to the browser console (Inspect → Console): which system
// prompts ran, what Riseup DB knowledge grounded the output, and the exact token cost for this lead.
export function logGenerationDiagnostics(d: GenDiagnostics): void {
  const c = (n: number) => `$${(n).toFixed(4)}`;
  const k = d.knowledge;
  const h1 = 'color:#EA5400;font-weight:bold;font-size:12px';
  const h2 = 'color:#EA5400;font-weight:bold';
  /* eslint-disable no-console */
  // Expanded (not collapsed) so the full reasoning shows immediately — the header alone hid everything.
  console.group(`%c[Lead360] Generation diagnostics · ${d.model} · ${d.totals.tokens.toLocaleString()} tokens · ${c(d.costUsd)}`, h1);

  console.log('%cHow the backend built this proposal (pipeline)', h2);
  console.log(
    '1) UNDERSTAND — the brief → a structured Intent (domain, modules, roles, integrations, scope size).\n' +
    '2) DECIDE — Intent → grounded decisions: tech stack, resource plan (priced ONLY by the rate card), phases, phase-wise budget. Grounded in RAG (KB) + portfolio.\n' +
    '3) ARCHITECT — rule-based section plan for this template.\n' +
    '4) COMPOSE — one AI call writes the client-facing copy.\n' +
    '5) ASSEMBLE — blocks[] built, diagrams + icons filled. (Budget/rates never come from the AI.)',
  );

  console.groupCollapsed('%cWhich knowledge drove each DECISION', h2);
  console.log(`%cKB retrieval category:%c ${k.kbCategory}  (half the RAG excerpts are reserved for this template's past projects)`, 'font-weight:bold', '');
  console.log('%c• Tech stack ← grounded in these EXACT technologies from comparable past portfolio projects:', 'font-weight:bold', k.portfolioTech.length ? k.portfolioTech : '(no portfolio tech matched — used standard defaults)');
  console.log('  chosen stack:', k.stack);
  console.log('%c• Budget / investment ← rate-card resource plan + historical sanity band:', 'font-weight:bold');
  console.log('  roles priced (rate card):', k.rolesPriced);
  console.log('  historical band:', k.historicalBand ?? '(heuristic fallback)');
  console.log('  rationale:', k.budgetRationale ?? '—');
  console.log('%c• Structure / timeline:', 'font-weight:bold', { scopeSize: k.scopeSize, structureMode: k.structureMode, timelineWeeks: k.timelineWeeks });
  console.log('%c• Comparable projects cited:', 'font-weight:bold', k.comparables.length ? k.comparables : '(none)');
  console.groupEnd();

  console.groupCollapsed('%cRAG excerpts used from the Riseup knowledge base (verbatim grounding)', h2);
  if (k.grounding.length) k.grounding.forEach((g, i) => console.log(`[${i + 1}] ${g}`));
  else console.log('(no KB excerpts retrieved — check that the knowledge base is embedded for this category)');
  console.groupEnd();

  console.groupCollapsed('%cSystem prompts (verbatim, per stage)', h2);
  console.log('understand →', d.systemPrompts.understand);
  console.log('decide →', d.systemPrompts.decide);
  console.log('compose →', d.systemPrompts.compose);
  console.groupEnd();

  console.groupCollapsed('%cToken cost (this lead)', h2);
  console.table({
    understand: { in: d.stages.understand.tokensIn, out: d.stages.understand.tokensOut },
    decide: { in: d.stages.decide.tokensIn, out: d.stages.decide.tokensOut },
    compose: { in: d.stages.compose.tokensIn, out: d.stages.compose.tokensOut },
    TOTAL: { in: d.totals.tokensIn, out: d.totals.tokensOut },
  });
  console.log(`cost = in×$2.50/1M + out×$15/1M = ${c(d.costUsd)}  (model: ${d.model})`);
  console.groupEnd();

  console.groupEnd();
  /* eslint-enable no-console */
}
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

// Download the proposal in a given format (PDF = branded pixel-perfect; DOCX = editable Word) through
// the authenticated client. Shared blob-download helper for both.
async function downloadBlob(path: string, filename: string): Promise<void> {
  const res = await httpService.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export const downloadProposalPdf = (id: string, filename: string) => downloadBlob(`/leads/${id}/proposal/pdf`, filename);
export const downloadProposalDocx = (id: string, filename: string) => downloadBlob(`/leads/${id}/proposal/docx`, filename);

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
// The pasted text is the rep's ADDITIONAL requirements (top priority) — saved to its own field so an
// uploaded document's extracted text (sourceText) is never overwritten by it, and vice versa.
export const upsertRequirement = (id: string, additionalRequirements: string) =>
  httpService.post(`/leads/${id}/requirement`, { additionalRequirements });

export const updateLead = (id: string, patch: Record<string, unknown>) =>
  httpService.patch(`/leads/${id}`, patch);

// --- Block editing (block-based proposals) ---
export interface PaletteEntry { type: string; label: string }
export async function fetchBlockPalette(id: string): Promise<PaletteEntry[]> {
  const res = await httpService.get(`/leads/${id}/proposal/blocks/palette`);
  return res.data.data as PaletteEntry[];
}
export const reorderBlocks = (id: string, order: string[]) =>
  httpService.patch(`/leads/${id}/proposal/blocks/order`, { order });
export const insertBlock = (id: string, type: string, afterId?: string) =>
  httpService.post(`/leads/${id}/proposal/blocks`, { type, afterId });
export const updateBlock = (id: string, blockId: string, patch: Record<string, unknown>) =>
  httpService.patch(`/leads/${id}/proposal/blocks/${blockId}`, patch);
export const changeBlockType = (id: string, blockId: string, type: string) =>
  httpService.patch(`/leads/${id}/proposal/blocks/${blockId}/type`, { type });
export const deleteBlock = (id: string, blockId: string) =>
  httpService.delete(`/leads/${id}/proposal/blocks/${blockId}`);
// Regenerate ONE block (re-runs the engine, swaps that block's content, keeps its position).
// An optional prompt steers the regeneration in plain English (e.g. "make it more concise").
export const regenerateBlock = (id: string, blockId: string, prompt?: string) =>
  httpService.post(`/leads/${id}/generate/block/${blockId}`, prompt?.trim() ? { prompt: prompt.trim() } : {});
// Internal 💡 explain for a block: cost breakdown (financial) or tech why+references (tech stack).
// All-in AI token usage for this lead (proposal + budget + brief + pitch + every regeneration) — for the
// single-line usage summary under the regenerate box. Refreshed after each generation.
export async function getLeadTokenUsage(id: string): Promise<LeadTokenUsage> {
  const res = await httpService.get(`/leads/${id}/generate/usage`);
  return res.data.data as LeadTokenUsage;
}

export async function explainBlock(id: string, blockId: string): Promise<BlockExplain> {
  const res = await httpService.get(`/leads/${id}/generate/block/${blockId}/explain`);
  return res.data.data as BlockExplain;
}

// Ask a grounded, read-only question about the proposal/budget/rationale (Workstream C). No regeneration.
export async function askProposal(id: string, question: string): Promise<{ answer: string }> {
  const res = await httpService.post(`/leads/${id}/generate/ask`, { question });
  return res.data.data as { answer: string };
}

// Internal module-intelligence breakdown (per-module type/complexity/weight + est. effort & cost). Read-only.
export async function getModuleBreakdown(id: string): Promise<ModuleBreakdown> {
  const res = await httpService.get(`/leads/${id}/generate/modules`);
  return res.data.data as ModuleBreakdown;
}

export type QueryKind = 'single' | 'multi' | 'text' | 'upload';
export interface ClientQuery {
  id: string;
  question: string;
  why: string;
  kind: QueryKind;
  options?: string[];
  status: 'open' | 'confirmed';
  answer?: string;
  answers?: string[];
  attachmentKey?: string;
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
  patch: { status?: 'open' | 'confirmed'; answer?: string; answers?: string[] },
): Promise<Readiness> {
  const res = await httpService.patch(`/leads/${id}/readiness/queries/${queryId}`, patch);
  return res.data.data as Readiness;
}

// Answer an "upload" query with a file — stored + extracted into the brief; returns recomputed readiness.
export async function answerQueryWithFile(id: string, queryId: string, file: File): Promise<Readiness> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await httpService.post(`/leads/${id}/readiness/queries/${queryId}/attachment`, fd, {
    headers: { 'Content-Type': undefined },
  });
  return res.data.data as Readiness;
}

// Upload a filled questionnaire .docx — parses the ticked/written answers back into the queries
// (auto-confirmed) and returns the recomputed readiness. Download is a plain cookie-authed <a href>.
export async function importQuestionnaire(id: string, file: File): Promise<Readiness & { applied?: number }> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await httpService.post(`/leads/${id}/readiness/questionnaire`, fd, {
    headers: { 'Content-Type': undefined },
  });
  return res.data.data as Readiness & { applied?: number };
}

// Force a fresh clarification rubric (used when the brief materially changed).
export async function regenerateReadiness(id: string): Promise<Readiness> {
  const res = await httpService.post(`/leads/${id}/readiness/regenerate`);
  return res.data.data as Readiness;
}

// Upload the client's brand logo (Client & Brand step); stored as a data URI on the lead.
export async function uploadClientLogo(id: string, file: File): Promise<Lead> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await httpService.post(`/leads/${id}/logo`, fd, { headers: { 'Content-Type': undefined } });
  return res.data.data as Lead;
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

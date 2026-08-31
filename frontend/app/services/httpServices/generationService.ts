import { createAsyncThunk } from '@reduxjs/toolkit';
import { httpService } from '../httpService';
import type { DeliveryPlan, PlanPhase, ProposalVersionSummary, TokenStats } from '~/types/generation';

export const fetchTokenStats = createAsyncThunk('generation/tokenStats', async () => {
  const res = await httpService.get('/generations/stats');
  return res.data.data as TokenStats;
});

// ── Delivery plan ───────────────────────────────────────────────────────────────────────────────────
// Mutations, so plain service calls with local loading state (not thunks). Saving a plan is deterministic
// on the server: the budget and the proposal's money blocks are recomputed from it with no AI call.

export async function getPlan(leadId: string): Promise<DeliveryPlan> {
  const res = await httpService.get(`/leads/${leadId}/generate/plan`);
  return res.data.data as DeliveryPlan;
}

export async function savePlan(leadId: string, phases: PlanPhase[]): Promise<DeliveryPlan> {
  const res = await httpService.put(`/leads/${leadId}/generate/plan`, { phases });
  return res.data.data as DeliveryPlan;
}

// ── Proposal snapshots ──────────────────────────────────────────────────────────────────────────────

export async function listProposalVersions(leadId: string): Promise<ProposalVersionSummary[]> {
  const res = await httpService.get(`/leads/${leadId}/proposal/versions`);
  return res.data.data as ProposalVersionSummary[];
}

export async function restoreProposalVersion(leadId: string, versionId: string): Promise<void> {
  await httpService.post(`/leads/${leadId}/proposal/versions/${versionId}/restore`, {});
}

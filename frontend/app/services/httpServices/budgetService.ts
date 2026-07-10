import { createAsyncThunk } from '@reduxjs/toolkit';
import { httpService } from '../httpService';
import type { BudgetResponse, UpdateBudgetPayload } from '~/types/budget';

// Redux thunk — always fetches the budget in its OWN authored currency (no ?currency), so the Proposal
// tab / pricing summary stay stable regardless of any display-only conversion in the Budget tab.
export const fetchBudget = createAsyncThunk('budget/fetch', async (leadId: string) => {
  const res = await httpService.get(`/leads/${leadId}/budget`);
  return res.data.data as BudgetResponse;
});

// Read a budget, optionally converted to `currency` for DISPLAY ONLY (server converts dayRateCents +
// computed totals; nothing is written back). Used by the read-only converted budget view.
export async function getBudget(leadId: string, currency?: string): Promise<BudgetResponse> {
  const res = await httpService.get(`/leads/${leadId}/budget`, { params: currency ? { currency } : {} });
  return res.data.data as BudgetResponse;
}

export async function updateBudget(leadId: string, payload: UpdateBudgetPayload): Promise<BudgetResponse> {
  const res = await httpService.put(`/leads/${leadId}/budget`, payload);
  return res.data.data as BudgetResponse;
}

// Maintained day-rate for a role+seniority from the rate card (auto-fills a budget line). null if none.
export async function suggestRate(role: string, seniority: string): Promise<number | null> {
  const res = await httpService.get('/rate-cards/suggest', { params: { role, seniority } });
  return (res.data.data?.dayRateCents ?? null) as number | null;
}

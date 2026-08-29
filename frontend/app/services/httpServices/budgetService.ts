import { createAsyncThunk } from '@reduxjs/toolkit';
import { httpService } from '../httpService';
import type { BudgetResponse, CommitVendorQuote, RateCardRow, UpdateBudgetPayload, VendorQuotePreview } from '~/types/budget';

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

/** Read a supplier quotation (or a typed description) into equipment rows. Writes NOTHING. */
export async function previewVendorQuote(leadId: string, input: { file?: File; text?: string }): Promise<VendorQuotePreview> {
  const fd = new FormData();
  if (input.file) fd.append('file', input.file);
  if (input.text) fd.append('text', input.text);
  const res = await httpService.post(`/leads/${leadId}/budget/equipment/import/preview`, fd, {
    headers: { 'Content-Type': undefined },
  });
  return res.data.data as VendorQuotePreview;
}

/** Apply the reviewed rows + install window + warranty to the budget. */
export async function commitVendorQuote(leadId: string, dto: CommitVendorQuote): Promise<BudgetResponse> {
  const res = await httpService.post(`/leads/${leadId}/budget/equipment/import/commit`, dto);
  return res.data.data as BudgetResponse;
}

export async function updateBudget(leadId: string, payload: UpdateBudgetPayload): Promise<BudgetResponse> {
  const res = await httpService.put(`/leads/${leadId}/budget`, payload);
  return res.data.data as BudgetResponse;
}

// Maintained day-rate for a role+seniority from the rate card (auto-fills a budget line), in the budget's
// OWN currency so a BDT sheet never pre-fills a USD rate. null if the role isn't on the card.
export async function suggestRate(role: string, seniority: string, currency?: string): Promise<number | null> {
  const res = await httpService.get('/rate-cards/suggest', { params: { role, seniority, ...(currency ? { currency } : {}) } });
  return (res.data.data?.dayRateCents ?? null) as number | null;
}

// The maintained rate card — the role/head options + rates for the budget editor's dropdown.
export async function getRateCards(): Promise<RateCardRow[]> {
  const res = await httpService.get('/rate-cards');
  return (res.data.data ?? []) as RateCardRow[];
}

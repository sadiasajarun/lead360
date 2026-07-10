import { httpService } from '../httpService';
import type { BudgetResponse } from '~/types/budget';
import type { Lead } from '~/types/lead';

// Read-only fetches for the client/present deliverable views.
export async function getBudget(id: string): Promise<BudgetResponse> {
  const res = await httpService.get(`/leads/${id}/budget`);
  return res.data.data as BudgetResponse;
}

export async function getLead(id: string): Promise<Lead> {
  const res = await httpService.get(`/leads/${id}`);
  return res.data.data as Lead;
}

export interface ProposalPayload {
  id: string;
  template: string;
  // Section values may be prose (string), bullet lists (string[]) or structured rows (object[]) —
  // the generator emits structured data that ProposalDocument renders as tables/cards.
  sections: Record<string, unknown>;
  salesBrief?: SalesBrief | null;
  pitchDeck?: { slides?: Slide[] } | null;
}
export interface SalesBrief {
  proposing?: string;
  whyMatters?: string;
  highlights?: string[];
  talkingPoints?: string[];
  objections?: { objection: string; response: string }[];
  comparableProjects?: string[];
  sixtySecondPitch?: string;
  suggestedClose?: string;
}
export interface Slide {
  title?: string;
  subtitle?: string;
  bullets?: string[];
  table?: { headers?: string[]; rows?: string[][] };
  cover?: boolean;
}

export async function getProposal(id: string): Promise<ProposalPayload> {
  const res = await httpService.get(`/leads/${id}/proposal`);
  return res.data.data as ProposalPayload;
}

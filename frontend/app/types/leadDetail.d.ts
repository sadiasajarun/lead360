import type { Lead } from '~/types/lead';

export interface Proposal {
  id: string;
  template: string;
  sections: Record<string, string>;
  theme: string;
}

export interface LeadDetailState {
  lead: Lead | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

export interface BriefAttachmentResult {
  file: { name: string; mime: string; key: string };
  extractedChars: number;
  parsed: boolean;
}

/** Client feedback captured after a proposal is shared — applied with top priority on the next regeneration. */
export interface ClientFeedback {
  id: string;
  leadId: string;
  text: string;
  status: 'open' | 'applied';
  appliedAt?: string | null;
  createdAt: string;
}

/** One "what changed" entry from a regeneration/edit (P6) — drives the change panel under the regenerate prompt. */
export interface ChangeEntry {
  at: string;
  kind: 'proposal' | 'budget' | 'section';
  title: string;
  details: string[];
  budgetBeforeCents?: number;
  budgetAfterCents?: number;
  weeksBefore?: number;
  weeksAfter?: number;
  currency?: string;
}

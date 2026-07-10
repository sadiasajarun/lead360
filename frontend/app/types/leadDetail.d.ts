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

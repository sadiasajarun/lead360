import type { LeadStatus, TemplateType } from '~/enums/lead.enum';

export interface Lead {
  id: string;
  title: string;
  company: string;
  contactName?: string;
  contactEmail?: string;
  website?: string;
  status: LeadStatus;
  template: TemplateType;
  valueCents: string;
  /** ISO-4217 code the budget is authored in (BDT for Local, USD otherwise, or an explicit choice). */
  budgetCurrency?: string;
  createdAt: string;
  updatedAt: string;
  /** When the lead entered the approval queue. Null on legacy rows submitted before the column existed. */
  submittedAt?: string | null;
  /** FK of the rep who created/owns the lead. Always serialised (plain column) — present on the detail
   *  payload even though the `submittedBy` relation is only joined for the list. Use this for ownership. */
  submittedById?: string | null;
  /** The sales rep who submitted the lead — joined for the Approvals queue (list payload only). */
  submittedBy?: { id: string; name: string; email: string } | null;
  /** Set only on Lost leads. */
  lossReason?: string | null;
  lossNote?: string | null;
}

export interface LeadsState {
  items: Lead[];
  total: number;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

export interface LeadFilters {
  status?: LeadStatus;
  template?: TemplateType;
  q?: string;
  /** ISO instants — filter on lead CREATION time (the one date every lead has). */
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

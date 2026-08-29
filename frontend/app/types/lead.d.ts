import type { LeadStatus, TemplateType, ProjectType, Audience } from '~/enums/lead.enum';

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
  /** Client brand mark (data URI) from the Client & Brand step. */
  clientLogoUrl?: string | null;
  /** How the engine frames the proposal (Template & Setup step). */
  projectType?: ProjectType;
  /** Who the proposal is written for (Template & Setup step). */
  audience?: Audience;
  /** Freeform project context appended to the effective brief. */
  projectContext?: string | null;
  /** Procurement (Template & Setup): hardware and/or a third-party service is involved. */
  hardwareProject?: boolean;
  thirdPartyService?: boolean;
  /** Internal note on the arrangement — the supplier is never named to the client. */
  procurementNotes?: string | null;
  /** Delivery/installation window in weeks — ADDED to the software schedule as an on-site phase. */
  hardwareInstallWeeks?: number | null;
  /** Warranty cover, restated in the proposal as our commitment. */
  hardwareWarranty?: string | null;
  /** Sales override of the auto-picked delivery structure; null/undefined = auto. */
  structureModeOverride?: 'phase' | 'milestone' | 'scope' | 'module' | null;
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

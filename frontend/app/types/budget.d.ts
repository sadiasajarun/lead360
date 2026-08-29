export interface BudgetLine {
  id?: string;
  milestoneName?: string;
  department: string;
  role: string;
  seniority: string;
  units: number;
  /** Effective man-days = hoursPerDay × workingDays / 8 (derived; drives cost = units × days × dayRate). */
  days: number;
  /** Daily commitment in hours (1..8; 8 = full-time). Editable; derives `days`. */
  hoursPerDay?: number;
  /** Calendar days the role is staffed (timeline proxy). Editable; derives `days`. */
  workingDays?: number;
  dayRateCents: number;
  optional: boolean;
}

/** One maintained rate-card entry (from GET /rate-cards) — feeds the budget editor's Role/Head dropdown. */
export interface RateCardRow {
  id: string;
  department: string;
  role: string;
  seniority: string;
  dailyUsdCents: string | number;
  dailyBdtCents: string | number;
}

/** A purchased item — hardware, device, licence or on-site installation. Cost = qty x unitPriceCents. */
export interface BudgetEquipment {
  id?: string;
  item: string;
  brand?: string;
  /** Unit of measure as quoted — pcs, lot, job, node. */
  uom?: string;
  qty: number;
  unitPriceCents: string | number;
  note?: string;
}

/** What a supplier quotation yields once read — reviewed by the rep before anything is written. */
export interface VendorQuotePreview {
  rows: BudgetEquipment[];
  currency?: string;
  /** Delivery + installation window in weeks — ADDED to the software schedule, never a replacement. */
  installWeeks?: number;
  warranty?: string;
  subtotalCents?: number;
  vatCents?: number;
  totalCents?: number;
  parsed: number;
  skipped: number;
  warnings: string[];
}

export interface CommitVendorQuote {
  rows: BudgetEquipment[];
  installWeeks?: number;
  warranty?: string;
  vatCents?: number;
}

export interface BudgetComputed {
  lineCostsCents: number[];
  byDepartmentCents: Record<string, number>;
  /** Purchased-items subtotal, already included in subtotalCents. */
  equipmentCents: number;
  subtotalCents: number;
  contingencyCents: number;
  discountCents: number;
  vatCents: number;
  totalCents: number;
}

export interface Budget {
  id: string;
  leadId: string;
  currency: string;
  contingencyPct: string;
  discountPct: string;
  vatPct: string;
  totalCents: string;
  version: number;
  lines: BudgetLine[];
  equipment?: BudgetEquipment[];
}

export interface BudgetResponse {
  budget: Budget;
  computed: BudgetComputed;
  /** The currency the figures are expressed in (equals budget.currency unless a view conversion applied). */
  viewCurrency?: string;
  /** True when the figures were converted from budget.currency for display only (nothing written back). */
  converted?: boolean;
  /** Conversion rate applied when converted === true. */
  rate?: number;
}

export interface UpdateBudgetPayload {
  version: number;
  currency?: string;
  contingencyPct?: number;
  discountPct?: number;
  vatPct?: number;
  includeOptional?: boolean;
  lines: BudgetLine[];
  /** Omit to leave purchased items untouched; send an array to replace them wholesale. */
  equipment?: BudgetEquipment[];
}

export interface BudgetState {
  data: BudgetResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

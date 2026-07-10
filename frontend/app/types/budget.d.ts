export interface BudgetLine {
  id?: string;
  milestoneName?: string;
  department: string;
  role: string;
  seniority: string;
  units: number;
  days: number;
  dayRateCents: number;
  optional: boolean;
}

export interface BudgetComputed {
  lineCostsCents: number[];
  byDepartmentCents: Record<string, number>;
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
}

export interface BudgetState {
  data: BudgetResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

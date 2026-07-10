export interface OverviewKpis {
  total: number;
  locked: number;
  lost: number;
  wonValueCents: number;
  conversionRate: number;
  // null = not enough data yet; the UI shows "—" rather than a fake zero.
  avgCycleDays: number | null;
  approvalTurnaroundHours: number | null;
  revenueAtStakeCents: number;
}
// Every stage is emitted (zeros included); pct is relative to the widest stage.
export interface FunnelRow { status: string; count: number; pct: number; }
// Side-branch summary ({ count, pct }) — shared by the Lost and Rejected off-funnel stats.
export interface BranchSummary { count: number; pct: number; }
export interface LossRow { reason: string; count: number; }

export interface Overview {
  kpis: OverviewKpis;
  funnel: FunnelRow[];
  lost: BranchSummary;
  /** Leads returned to the rep for revision — rendered as a side-branch, not a funnel bar. */
  rejected: BranchSummary;
  lossReasons: LossRow[];
}

export interface AnalyticsState {
  data: Overview | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

export interface ApprovalsState {
  items: import('~/types/lead').Lead[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

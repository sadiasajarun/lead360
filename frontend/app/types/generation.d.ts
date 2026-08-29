// Per-stage token usage (input/output) for one AI call.
export interface GenUsage {
  tokensIn: number;
  tokensOut: number;
}

// Per-lead generation diagnostics — logged to the browser console after a full generation. Mirrors the
// backend GenDiagnostics (engine.service.ts): which prompts ran, what knowledge grounded the output, and
// the exact token cost.
export interface GenDiagnostics {
  model: string;
  systemPrompts: { understand: string; decide: string; compose: string };
  knowledge: {
    scopeSize: string;
    structureMode: string;
    timelineWeeks: number;
    stack: string[];
    rolesPriced: string[];
    comparables: string[];
    historicalBand?: string;
    budgetRationale?: string;
    kbCategory: string;
    grounding: string[];
    portfolioTech: string[];
  };
  stages: { understand: GenUsage; decide: GenUsage; compose: GenUsage };
  totals: { tokensIn: number; tokensOut: number; tokens: number };
  costUsd: number;
}

// Internal "explain" for the 💡 verify panel on a proposal block. `kind` selects which fields are present.
export interface ExplainFinancial {
  currency: string;
  teamWeeklyCents: number;
  members: { role: string; seniority: string; units: number; weeklyRateCents: number }[];
  phases: { label: string; weeks: number; cents: number; weeklyCents?: number; team?: { units: number }[] }[];
  totalCents: number;
}
export interface ExplainTechRef {
  title: string;
  url: string;
}
export interface ExplainTechRow {
  layer: string;
  choice: string;
  why: string;
  references: ExplainTechRef[];
}
export interface BlockExplain {
  kind: 'financial' | 'techStack' | 'generic';
  financial?: ExplainFinancial | null;
  rows?: ExplainTechRow[];
  matchedRule?: string;
  heading?: string;
  note?: string;
}

// Internal module-intelligence breakdown (module-intelligence layer) — per module: type/complexity/weight +
// estimated effort & cost. Effort is modeled and calibrated to real project totals; the plan sets the price.
export interface ModuleBreakdownRow {
  name: string;
  type: string;
  complexity: string;
  weight: number;
  keyFeatures: string[];
  estDays: number;
  estCents: number;
}
export interface ModuleBreakdown {
  modules: ModuleBreakdownRow[];
  totalEstDays: number;
  totalEstCents: number;
  planSubtotalCents: number;
  currency: string;
}

// AI token-usage & cost aggregates, shown as the stat dashboard on the Leads page.
export interface TokenBucket {
  tokensIn: number;
  tokensOut: number;
  tokens: number;
  costUsd: number;
}

export interface TokenStats {
  lifetime: TokenBucket;
  avgPerProposal: { tokens: number; costUsd: number; proposals: number };
  today: TokenBucket;
  yesterday: TokenBucket;
  model: string;
}

export interface TokenStatsState {
  data: TokenStats | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

// Per-lead AI token usage — the all-in total for one lead plus a per-kind breakdown (proposal, budget,
// sales brief, pitch deck, regenerations). Shown as a single line under the regenerate box.
export interface LeadTokenUsageKind {
  kind: string;
  tokens: number;
  runs: number;
  costUsd: number;
}
export interface LeadTokenUsage {
  tokens: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  runs: number;
  byKind: LeadTokenUsageKind[];
  model: string;
}

/**
 * Constraint calibration — pure maths over the user's APPROVED projects (person-days, never money).
 *
 *  - effort → weeks:   a power law  weeks = a · effort^b  fitted on approved deliveries
 *  - overhead ratio:   PM/analyst/QA/DevOps days per build day, as the user actually staffs
 *  - phase-count prior: how many phases the user's approved plans have at this size
 *  - feasibility:      can the required effort fit a stated budget and/or deadline?
 *  - scope cut:        if not, which modules to drop (lowest importance first) to make it fit
 */
export interface DeliveryPoint {
  effort: number; // person-days
  weeks: number;
  phases: number; // 0 = unknown
  heads: number;
  overheadDays: number;
  buildDays: number;
}

export interface PowerLaw {
  a: number;
  b: number;
  n: number;
}

const median = (xs: number[]): number => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
export const quantile = (xs: number[], q: number): number => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  return v[lo] + (v[Math.min(v.length - 1, lo + 1)] - v[lo]) * (pos - lo);
};

/** Least squares on logs; robust default (b = 0.5) when there are too few points. */
export function fitEffortWeeks(points: DeliveryPoint[]): PowerLaw {
  const pts = points.filter((p) => p.effort > 0 && p.weeks > 0);
  if (pts.length < 4) return { a: 0.9, b: 0.5, n: pts.length };
  const xs = pts.map((p) => Math.log(p.effort));
  const ys = pts.map((p) => Math.log(p.weeks));
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
  const my = ys.reduce((s, y) => s + y, 0) / ys.length;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const b = sxx > 0 ? Math.min(0.9, Math.max(0.2, sxy / sxx)) : 0.5;
  const a = Math.exp(my - b * mx);
  return { a, b, n: pts.length };
}

export const weeksForEffort = (effort: number, law: PowerLaw): number => Math.max(1, Math.round(law.a * Math.pow(Math.max(1, effort), law.b)));

/** Median overhead (PM, analyst, QA, DevOps…) per build day across approved deliveries. */
export function overheadRatio(points: DeliveryPoint[]): number {
  const r = median(points.filter((p) => p.buildDays > 0).map((p) => p.overheadDays / p.buildDays));
  return Number.isFinite(r) ? Math.min(1, Math.max(0.1, r)) : 0.35;
}

/** Median phase count of approved plans of similar length (±50% weeks), else of all approved plans. */
export function phasePrior(points: DeliveryPoint[], weeks: number): number | undefined {
  const withPhases = points.filter((p) => p.phases > 0);
  const near = withPhases.filter((p) => p.weeks >= weeks * 0.5 && p.weeks <= weeks * 1.5);
  const m = median((near.length >= 3 ? near : withPhases).map((p) => p.phases));
  return Number.isFinite(m) ? Math.round(m) : undefined;
}

export interface Feasibility {
  fits: boolean;
  /** Most effort (person-days) the constraints allow. */
  maxEffort?: number;
  reason?: string;
}

/**
 * Does `requiredEffort` fit the stated constraints? Budget → effort it buys at the plan's blended day rate.
 * Deadline → the effort-per-week the user's approved projects actually sustained (p90, +30% headroom).
 */
export function feasibility(input: {
  requiredEffort: number;
  statedBudgetCents?: number;
  blendedDayRateCents?: number;
  statedWeeks?: number;
  peers: DeliveryPoint[];
}): Feasibility {
  const caps: { cap: number; why: string }[] = [];
  if (input.statedBudgetCents && input.blendedDayRateCents && input.blendedDayRateCents > 0) {
    caps.push({ cap: input.statedBudgetCents / input.blendedDayRateCents, why: 'budget' });
  }
  if (input.statedWeeks && input.statedWeeks > 0) {
    const perWeek = quantile(input.peers.filter((p) => p.weeks > 0).map((p) => p.effort / p.weeks), 0.9);
    if (Number.isFinite(perWeek)) caps.push({ cap: perWeek * 1.3 * input.statedWeeks, why: 'deadline' });
  }
  if (!caps.length) return { fits: true };
  const tightest = caps.reduce((a, b) => (b.cap < a.cap ? b : a));
  const fits = input.requiredEffort <= tightest.cap * 1.1;
  return { fits, maxEffort: Math.round(tightest.cap), reason: fits ? undefined : `required ${Math.round(input.requiredEffort)} person-days exceeds what the stated ${tightest.why} allows (~${Math.round(tightest.cap)})` };
}

export interface CutModule {
  name: string;
  days: number;
  /** 1–5 importance (the analyst's relative weight). */
  importance: number;
}

/**
 * Reduced-scope proposal: drop the least important modules first (largest first among equals) until the
 * build effort fits `allowedBuildDays`. The single most important module is never dropped.
 */
export function proposeScopeCut(modules: CutModule[], allowedBuildDays: number): { keep: string[]; drop: string[]; keptDays: number } {
  const order = [...modules].sort((a, b) => a.importance - b.importance || b.days - a.days);
  const protectedName = [...modules].sort((a, b) => b.importance - a.importance || b.days - a.days)[0]?.name;
  let total = modules.reduce((s, m) => s + m.days, 0);
  const drop: string[] = [];
  for (const m of order) {
    if (total <= allowedBuildDays) break;
    if (m.name === protectedName) continue;
    drop.push(m.name);
    total -= m.days;
  }
  return { keep: modules.map((m) => m.name).filter((n) => !drop.includes(n)), drop, keptDays: Math.round(total * 10) / 10 };
}

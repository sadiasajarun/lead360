import type { Complexity } from './module-taxonomy';

/**
 * Feature SCALE — how big a feature really is, on a 1–5 scale, independent of its name.
 * "CMS that edits products" and "CMS that edits products + site pages + banners with approval" share a type
 * but not a scale. Deterministic so the same evidence always yields the same score (no AI judgement).
 */
export interface ScaleSignals {
  /** Data objects the feature manages, e.g. ["products"] vs ["products", "pages", "banners"]. */
  entities?: string[];
  /** view = read-only display · crud = create/edit/delete · workflow = approvals, states, scheduling. */
  operations?: string;
  /** Number of user roles that use or are governed by the feature. */
  roles?: number;
  integrations?: string[];
  platforms?: string[];
}

const band = (n: number, cuts: number[]): number => cuts.filter((c) => n >= c).length;

/** 1–5 from explicit evidence (approved proposals, or a new brief's analysed feature). */
export function scaleFromSignals(signals: ScaleSignals | undefined, subFeatureCount = 0): number {
  const s = signals ?? {};
  const ops = String(s.operations ?? '').toLowerCase();
  const raw =
    band((s.entities ?? []).length, [2, 4]) + // 0–2
    (ops.startsWith('work') ? 2 : ops === 'crud' ? 1 : 0) + // 0–2
    band(Number(s.roles) || 0, [2, 4]) + // 0–2
    band((s.integrations ?? []).length, [1, 2]) + // 0–2
    band((s.platforms ?? []).length, [2, 3]) * 0.5 + // 0–1
    band(subFeatureCount, [3, 6]) * 0.5; // 0–1
  return Math.min(5, Math.max(1, 1 + Math.round((raw / 10) * 4)));
}

/** 1–5 for a NEW project's module when only the analyst's complexity + key features are known. */
export function scaleFromAnalysis(complexity: Complexity, keyFeatureCount: number): number {
  const base: Record<Complexity, number> = { simple: 1.5, moderate: 2.5, complex: 3.5, 'very-complex': 4.5 };
  const adj = keyFeatureCount >= 5 ? 0.5 : keyFeatureCount <= 1 ? -0.5 : 0;
  return Math.min(5, Math.max(1, Math.round(base[complexity] + adj)));
}

/** Complexity tier implied by a scale (to reuse the taxonomy's base-day table as an attribution weight). */
export function complexityForScale(scale: number): Complexity {
  return scale <= 1 ? 'simple' : scale <= 3 ? 'moderate' : scale === 4 ? 'complex' : 'very-complex';
}

/**
 * Transfer an effort observed at one scale to another: effort grows sub-linearly with scope
 * (exponent 0.8 — doubling the feature's scope rarely doubles the effort).
 */
export function scaleAdjustDays(observedDays: number, observedScale: number, targetScale: number): number {
  if (!(observedDays > 0) || !(observedScale > 0) || !(targetScale > 0)) return observedDays;
  return observedDays * Math.pow(targetScale / observedScale, 0.8);
}

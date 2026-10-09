import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AiService } from '../../infrastructure/ai/ai.service';
import { CaseFeatureRepository, type CaseFeatureRow, type FeatureMatch } from './case-feature.repository';
import { baseModuleDays, normalizeType, type Complexity, type ModuleType } from '../generation/engine/module-taxonomy';
import { complexityForScale, scaleAdjustDays, scaleFromAnalysis, scaleFromSignals } from '../generation/engine/feature-scale.util';
import type { RawFeature } from './approved-ingest.service';

const EMBED_DIM = 768;
/** Roles whose days are NOT feature build effort (management, analysis, QA, ops) — excluded from attribution. */
const OVERHEAD_ROLE = /(project|product)\s*manager|\bpm\b|analyst|\bqa\b|quality|tester|devops|dev ops|architect|account lead/i;

export interface FeatureEstimate {
  /** Scale-adjusted, similarity-weighted estimate of effective build days for this module. */
  days: number;
  scale: number;
  matches: { feature: string; project: string; scale: number; days: number; distance: number }[];
}

/**
 * Feature memory: learns per-FEATURE effort from the approved corpus and estimates a new module's effort from
 * the closest features in ANY past project (cross-domain), adjusted for scale. Effort is in person-days —
 * money is always derived later from the rate card.
 */
@Injectable()
export class FeatureMemoryService {
  private readonly logger = new Logger(FeatureMemoryService.name);

  constructor(
    private readonly features: CaseFeatureRepository,
    private readonly ai: AiService,
    private readonly ds: DataSource,
  ) {}

  /**
   * (Re)build feature rows for every gold case. Days are ATTRIBUTED: the case's build effort (team days minus
   * overhead roles) is split across its features by type × scale weight. Approved budgets are not itemised per
   * feature, so this is the best real-scale signal available; it is flagged 'attributed'.
   */
  async rebuildFromGold(): Promise<{ cases: number; features: number }> {
    await this.features.ensureTable(EMBED_DIM);
    const cases = (await this.ds.query(
      `SELECT id, title, team, features_raw FROM project_cases WHERE deleted_at IS NULL AND quality = 'gold'`,
    )) as { id: string; title: string; team: { role: string; units: number; days?: number }[]; features_raw: { features?: RawFeature[] } | null }[];
    let total = 0;
    for (const c of cases) {
      const raw = c.features_raw?.features ?? [];
      if (!raw.length) continue;
      const buildDays = (c.team ?? []).filter((t) => !OVERHEAD_ROLE.test(t.role)).reduce((s, t) => s + (Number(t.units) || 1) * (Number(t.days) || 0), 0);
      const scored = raw.map((f) => {
        const scale = scaleFromSignals(f.signals, f.subFeatures?.length ?? 0);
        const type = normalizeType(f.type) as ModuleType;
        return { f, type, scale, weight: baseModuleDays(type, complexityForScale(scale)) * (scale === 2 ? 0.8 : 1) };
      });
      const sumW = scored.reduce((s, x) => s + x.weight, 0) || 1;
      const texts = scored.map((x) => `${x.type}: ${x.f.capability}${x.f.subFeatures?.length ? ` — ${x.f.subFeatures.join(', ')}` : ''}`);
      const vecs = this.ai.enabled ? await this.ai.embed(texts) : [];
      const rows: (CaseFeatureRow & { embedding?: number[] })[] = scored.map((x, i) => ({
        caseId: c.id,
        name: x.f.name,
        type: x.type,
        capability: x.f.capability,
        subFeatures: x.f.subFeatures ?? [],
        scale: x.scale,
        signals: x.f.signals,
        measuredDays: buildDays > 0 ? Math.round(((buildDays * x.weight) / sumW) * 10) / 10 : 0,
        daysSource: 'attributed',
        embedding: vecs[i],
      }));
      await this.features.replaceForCase(c.id, rows);
      total += rows.length;
      this.logger.log(`feature memory ✓ ${c.title}: ${rows.length} features (${Math.round(buildDays)} build days)`);
    }
    return { cases: cases.length, features: total };
  }

  /**
   * Estimate one module of a NEW project from the closest past features. Same-type matches first; falls back
   * to any type when there are too few. Returns null when the memory has nothing close enough.
   */
  async estimate(module: { name: string; type: ModuleType; complexity: Complexity; keyFeatures: string[] }): Promise<FeatureEstimate | null> {
    if (!this.ai.enabled) return null;
    const scale = scaleFromAnalysis(module.complexity, module.keyFeatures.length);
    const [vec] = await this.ai.embed([`${module.type}: ${module.name}${module.keyFeatures.length ? ` — ${module.keyFeatures.join(', ')}` : ''}`]);
    if (!vec) return null;
    let hits: FeatureMatch[] = await this.features.search(vec, module.type, 12);
    if (hits.length < 3) hits = [...hits, ...(await this.features.search(vec, null, 12)).filter((h) => !hits.some((x) => x.name === h.name && x.caseTitle === h.caseTitle))];
    const close = hits
      .map((h) => ({ h, rank: Number(h.distance) + 0.12 * Math.abs(Number(h.scale) - scale) }))
      .filter((x) => Number(x.h.distance) <= 0.6)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 5);
    if (!close.length) return null;
    // Similarity-weighted median of scale-adjusted days.
    const pts = close.map((x) => ({ d: scaleAdjustDays(Number(x.h.measuredDays), Number(x.h.scale), scale), w: 1 / (0.05 + x.rank) })).sort((a, b) => a.d - b.d);
    const half = pts.reduce((s, p) => s + p.w, 0) / 2;
    let acc = 0;
    let days = pts[pts.length - 1].d;
    for (const p of pts) { acc += p.w; if (acc >= half) { days = p.d; break; } }
    return {
      days: Math.max(1, Math.round(days * 10) / 10),
      scale,
      matches: close.map((x) => ({ feature: x.h.name, project: x.h.caseTitle, scale: Number(x.h.scale), days: Number(x.h.measuredDays), distance: Math.round(Number(x.h.distance) * 1000) / 1000 })),
    };
  }
}

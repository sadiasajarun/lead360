import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { HistoricalProject } from './historical-project.entity';
import { usdTotals, weeksOf, projectKey, scopeSizeOf, looksBdt, TITLE_EXT } from './estimate.mining';

export interface Band {
  loCents: number;
  hiCents: number;
  medianCents: number;
  n: number;
}

/**
 * EstimateService — the budget-first "band" from mined history. Returns the cost range comparable
 * delivered Riseup projects landed in (in USD cents), so DecideService can validate its rate-card
 * total against real work. Falls back to null (→ heuristic band) when history is too thin.
 */
@Injectable()
export class EstimateService {
  private readonly logger = new Logger(EstimateService.name);

  constructor(
    @InjectRepository(HistoricalProject) private readonly repo: Repository<HistoricalProject>,
  ) {}

  count() {
    return this.repo.count();
  }

  /** Upsert a mined project by (category,title) so re-running the batch ingest is idempotent. */
  async upsert(row: Partial<HistoricalProject>): Promise<void> {
    const existing = await this.repo.findOne({ where: { category: row.category, title: row.title } });
    if (existing) await this.repo.update(existing.id, row);
    else await this.repo.save(this.repo.create(row));
  }

  /**
   * Mine ONE document's text (per-upload hook) into the historical band. Extracts the project total
   * (≈ the largest money figure), currency and timeline, then merges into any existing row for the
   * same project (same category + section-stripped title) — so a Budget upload augments its Proposal
   * rather than creating a near-duplicate. Returns null when the doc has no usable total (e.g. a bare
   * requirement) so the caller can skip silently. Best-effort: never throws to the caller.
   */
  async mineFromText(category: string, title: string, text: string, section?: string): Promise<HistoricalProject | null> {
    try {
      const totals = usdTotals(text);
      if (!totals.length) return null;
      const totalUsd = Math.max(...totals);
      const isBudget = (section ?? '').toLowerCase().startsWith('budget');
      return await this.mergeUpsert({
        category,
        title,
        totalUsd,
        currency: looksBdt(text) ? 'BDT' : 'USD',
        weeks: weeksOf(text),
        isBudget,
      });
    } catch (e) {
      this.logger.warn(`Estimate mining skipped for "${title}": ${String(e)}`);
      return null;
    }
  }

  // Merge a freshly-mined figure into the existing project row (matched by section-stripped title),
  // preferring a Budget doc's total, else the larger; filling weeks if absent. Creates a row if none.
  private async mergeUpsert(m: { category: string; title: string; totalUsd: number; currency: string; weeks?: number; isBudget: boolean }): Promise<HistoricalProject> {
    const key = projectKey(m.title);
    const rows = await this.repo.find({ where: { category: m.category } });
    const existing = rows.find((r) => projectKey(r.title) === key);
    const cleanTitle = m.title.replace(TITLE_EXT, '');

    if (!existing) {
      return this.repo.save(
        this.repo.create({
          category: m.category,
          title: cleanTitle,
          totalUsdCents: String(Math.round(m.totalUsd * 100)),
          currency: m.currency,
          weeks: m.weeks,
          scopeSize: scopeSizeOf(m.totalUsd),
          source: m.title,
        }),
      );
    }
    const prevTotal = existing.totalUsdCents ? Number(existing.totalUsdCents) / 100 : 0;
    const takeNew = m.isBudget || m.totalUsd > prevTotal; // Budget total wins; else the larger figure
    const total = takeNew ? m.totalUsd : prevTotal;
    const patch: Partial<HistoricalProject> = {
      totalUsdCents: String(Math.round(total * 100)),
      currency: takeNew ? m.currency : existing.currency,
      scopeSize: scopeSizeOf(total),
      weeks: existing.weeks ?? m.weeks,
    };
    await this.repo.update(existing.id, patch);
    return { ...existing, ...patch } as HistoricalProject;
  }

  /**
   * Band for a category (optionally narrowed to a scope size). Uses the interquartile range so a
   * single outlier can't stretch the band; needs ≥3 comparable projects or returns null.
   */
  async band(category: string, scopeSize?: string): Promise<Band | null> {
    // Same-scope comparables ONLY. Widening to the whole category let 24 tiny "small" projects
    // pollute a large-project band (BioTrace agency-large → $2.5k–$6k). If too few same-scope rows,
    // return null so the caller uses its scope-appropriate reference band instead.
    const rows = await this.load(category, scopeSize);
    if (rows.length < 3) return null;

    const totals = rows.map((r) => Number(r.totalUsdCents)).filter((n) => n > 0).sort((a, b) => a - b);
    if (totals.length < 3) return null;
    const q = (p: number) => totals[Math.min(totals.length - 1, Math.floor(p * (totals.length - 1)))];
    return { loCents: q(0.25), hiCents: q(0.75), medianCents: q(0.5), n: totals.length };
  }

  private load(category: string, scopeSize?: string) {
    return this.repo.find({
      where: { category, totalUsdCents: Not(IsNull()), ...(scopeSize ? { scopeSize } : {}) },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { BaseRepository } from '../../core/base/base.repository';
import { ProjectCase } from './project-case.entity';
import { AsyncLocalStorage } from 'async_hooks';
import { flagEnabled } from '../generation/engine/engine-flags';

/**
 * V1 stability guard: approved ("gold") cases only take part in retrieval and norms when ENGINE_V2_GOLD=on.
 * With the flag off every query below behaves exactly as before the gold corpus existed.
 */
export const goldFilter = (includeGold = flagEnabled('GOLD')): string => (includeGold ? '' : " AND quality IS DISTINCT FROM 'gold'");

/**
 * Leave-one-out isolation for the accuracy backtest: case ids in this context are invisible to every
 * retrieval/norm query, so a project can never "find itself". Empty outside the backtest.
 */
export const caseExclusion = new AsyncLocalStorage<string[]>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const excludedIdsClause = (alias = ''): string => {
  const ids = (caseExclusion.getStore() ?? []).filter((x) => UUID.test(x));
  return ids.length ? ` AND ${alias}id NOT IN (${ids.map((x) => `'${x}'`).join(',')})` : '';
};
/** Gold flag + leave-one-out exclusion, for raw SQL. */
const caseFilters = (): string => `${caseFilters()}${excludedIdsClause()}`;

/** Budget norm — STRICTLY scoped to one template + currency (never mixed: BDT ≠ USD). */
export interface BudgetNorm {
  sampleCount: number;
  p25Cents?: number;
  p50Cents?: number;
  p75Cents?: number;
}

/** Timeline norm — currency-independent, so it may span one or several templates (cross-template fallback). */
export interface TimelineNorm {
  sampleCount: number;
  weeksP25?: number;
  weeksP50?: number;
  weeksP75?: number;
}

@Injectable()
export class ProjectCaseRepository extends BaseRepository<ProjectCase> {
  constructor(@InjectRepository(ProjectCase) repo: Repository<ProjectCase>) {
    super(repo);
  }

  // Idempotent: enable pgvector, add the raw embedding column, build the HNSW cosine index. Called at boot
  // (self-heal — survives a synchronize-driven drop) and by the migration. Mirrors KbRepository.
  async ensureVectorColumn(dim: number): Promise<void> {
    await this.repository.query('CREATE EXTENSION IF NOT EXISTS vector');
    await this.repository.query(`ALTER TABLE project_cases ADD COLUMN IF NOT EXISTS embedding vector(${dim})`);
    await this.repository.query(
      'CREATE INDEX IF NOT EXISTS project_cases_embedding_idx ON project_cases USING hnsw (embedding vector_cosine_ops)',
    );
  }

  async saveEmbedding(id: string, vec: number[]): Promise<void> {
    await this.repository.query('UPDATE project_cases SET embedding = $1 WHERE id = $2', [JSON.stringify(vec), id]);
  }

  // Idempotent, additive: the approved-corpus columns (mirrors database/add-gold-cases.ts).
  async ensureGoldColumns(): Promise<void> {
    for (const c of ['quality varchar(16)', 'source_kind varchar(32)', 'source_path text', 'effort_days numeric', 'features_raw jsonb', 'final_at timestamptz']) {
      await this.repository.query(`ALTER TABLE project_cases ADD COLUMN IF NOT EXISTS ${c}`);
    }
  }

  /** Idempotency for the approved-corpus import: the existing case for a manifest project key, if any. */
  findBySourcePath(sourcePath: string): Promise<ProjectCase | null> {
    return this.repository.findOne({ where: { sourcePath } });
  }

  /** Cases whose embedding is missing (fresh rows, or after a synchronize drop) — cheap re-embed. */
  rowsMissingEmbedding(): Promise<ProjectCase[]> {
    return this.repository.query(
      'SELECT * FROM project_cases WHERE deleted_at IS NULL AND embedding IS NULL',
    ) as Promise<ProjectCase[]>;
  }

  /** Idempotency for the learning loop / backfill: the existing case for a lead, if any. */
  findBySourceLead(leadId: string): Promise<ProjectCase | null> {
    return this.repository.findOne({ where: { sourceLeadId: leadId } });
  }

  /** Idempotency for the seed-corpus backfill: the existing case for a KB document, if any. */
  findBySourceDoc(docId: string): Promise<ProjectCase | null> {
    return this.repository.findOne({ where: { sourceDocId: docId } });
  }

  /** Soft-delete in-app (lead-sourced) cases — used to clear polluting test data before/after a seed rebuild. */
  async softDeleteInAppCases(): Promise<number> {
    const r = (await this.repository.query(
      "UPDATE project_cases SET deleted_at = now() WHERE source_lead_id IS NOT NULL AND deleted_at IS NULL",
    )) as unknown as [unknown, number];
    return Array.isArray(r) ? Number(r[1] ?? 0) : 0;
  }

  /** Concatenated text of a KB document's chunks — for seed-case extraction. */
  async kbDocText(docId: string): Promise<string> {
    const r = (await this.repository.query(
      "SELECT string_agg(text, E'\n') AS t FROM kb_chunks WHERE kb_document_id = $1",
      [docId],
    )) as Array<{ t: string | null }>;
    return r[0]?.t ?? '';
  }

  /** Seed KB documents of a given section (Proposal / Budget) across the four template categories. */
  kbSeedDocs(section: string): Promise<{ id: string; title: string; category: string }[]> {
    return this.repository.query(
      `SELECT id, title, category FROM kb_documents
        WHERE deleted_at IS NULL AND category IN ('Global','Local','Agency','Design Portfolio')
          AND (meta->>'section') = $1`,
      [section],
    ) as Promise<{ id: string; title: string; category: string }[]>;
  }

  /** Hybrid retrieval within ONE template — tag overlap first, then vector cosine. Each row carries its
   *  cosine `distance` (0 = identical) so the caller can detect a near-identical STRONG match for reuse. */
  hybridSearch(vec: number[], tags: string[], template: string, k: number): Promise<(ProjectCase & { distance: number })[]> {
    return this.repository.query(
      // Raw query returns DB column names — alias the snake_case columns the callers read as camelCase
      // (timeline_weeks/budget_total_cents/scope_size), else they arrive undefined and strong-match /
      // analog timeline+budget silently vanish.
      `SELECT *,
              timeline_weeks AS "timelineWeeks",
              budget_total_cents AS "budgetTotalCents",
              scope_size AS "scopeSize",
              module_count AS "moduleCount",
              integration_count AS "integrationCount",
              cardinality(ARRAY(SELECT unnest(tags) INTERSECT SELECT unnest($2::text[]))) AS tag_overlap,
              (embedding <=> $1) AS distance
         FROM project_cases
        WHERE deleted_at IS NULL AND embedding IS NOT NULL AND template = $3${caseFilters()}
        ORDER BY tag_overlap DESC, embedding <=> $1
        LIMIT $4`,
      [JSON.stringify(vec), tags, template, k],
    ) as Promise<(ProjectCase & { distance: number })[]>;
  }

  /** Hybrid retrieval EXCLUDING a template — the cross-template analog fallback (shape/approach only). */
  hybridSearchExcluding(vec: number[], tags: string[], excludeTemplate: string, k: number): Promise<ProjectCase[]> {
    return this.repository.query(
      `SELECT *,
              timeline_weeks AS "timelineWeeks",
              budget_total_cents AS "budgetTotalCents",
              scope_size AS "scopeSize",
              module_count AS "moduleCount",
              integration_count AS "integrationCount",
              cardinality(ARRAY(SELECT unnest(tags) INTERSECT SELECT unnest($2::text[]))) AS tag_overlap
         FROM project_cases
        WHERE deleted_at IS NULL AND embedding IS NOT NULL AND template <> $3${caseFilters()}
        ORDER BY tag_overlap DESC, embedding <=> $1
        LIMIT $4`,
      [JSON.stringify(vec), tags, excludeTemplate, k],
    ) as Promise<ProjectCase[]>;
  }

  /**
   * Budget norm — percentiles over `budget_total_cents`, STRICTLY same template + same currency (+ positive
   * totals). Never mixes currencies. `sampleCount` gates trust (min-sample guard in the service).
   */
  async budgetNormStats(template: string, scopeSize: string, currency: string): Promise<BudgetNorm> {
    const r = (await this.repository.query(
      `SELECT count(*)::int AS sc,
              percentile_cont(0.25) WITHIN GROUP (ORDER BY budget_total_cents) AS p25,
              percentile_cont(0.50) WITHIN GROUP (ORDER BY budget_total_cents) AS p50,
              percentile_cont(0.75) WITHIN GROUP (ORDER BY budget_total_cents) AS p75
         FROM project_cases
        WHERE deleted_at IS NULL AND template = $1 AND ($2 = '' OR scope_size = $2) AND currency = $3 AND budget_total_cents > 0${caseFilters()}`,
      [template, scopeSize, currency],
    )) as Array<Record<string, string | number | null>>;
    const row = r[0] ?? {};
    const num = (v: unknown): number | undefined => (v == null ? undefined : Number(v));
    return { sampleCount: Number(row.sc ?? 0), p25Cents: num(row.p25), p50Cents: num(row.p50), p75Cents: num(row.p75) };
  }

  /**
   * Timeline norm — percentiles over `timeline_weeks` across ONE OR MORE templates (currency-independent, so
   * cross-template borrowing is safe). Pass [template] for same-template; the full list for the fallback.
   */
  async timelineNormStats(templates: string[], scopeSize: string): Promise<TimelineNorm> {
    const r = (await this.repository.query(
      `SELECT count(*)::int AS sc,
              percentile_cont(0.25) WITHIN GROUP (ORDER BY timeline_weeks) AS p25,
              percentile_cont(0.50) WITHIN GROUP (ORDER BY timeline_weeks) AS p50,
              percentile_cont(0.75) WITHIN GROUP (ORDER BY timeline_weeks) AS p75
         FROM project_cases
        WHERE deleted_at IS NULL AND template = ANY($1::text[]) AND ($2 = '' OR scope_size = $2) AND timeline_weeks IS NOT NULL${caseFilters()}`,
      [templates, scopeSize],
    )) as Array<Record<string, string | number | null>>;
    const row = r[0] ?? {};
    const num = (v: unknown): number | undefined => (v == null ? undefined : Number(v));
    return { sampleCount: Number(row.sc ?? 0), weeksP25: num(row.p25), weeksP50: num(row.p50), weeksP75: num(row.p75) };
  }

  /** Raw cases in a template's scope bucket — for team-ratio aggregation + the same-template analog fallback. */
  casesInBucket(template: string, scopeSize: string): Promise<ProjectCase[]> {
    return this.repository
      .createQueryBuilder('c')
      .where('c.template = :template AND c.scope_size = :scopeSize', { template, scopeSize })
      .andWhere(`${flagEnabled('GOLD') ? '1=1' : "c.quality IS DISTINCT FROM 'gold'"}${excludedIdsClause('c.')}`)
      .getMany();
  }

  /** Cross-template cases in a scope bucket — the non-vector analog fallback (shape/approach only). */
  casesInScopeExcluding(scopeSize: string, excludeTemplate: string, k: number): Promise<ProjectCase[]> {
    return this.repository
      .createQueryBuilder('c')
      .where('c.scope_size = :scopeSize AND c.template <> :excludeTemplate', { scopeSize, excludeTemplate })
      .andWhere(`${flagEnabled('GOLD') ? '1=1' : "c.quality IS DISTINCT FROM 'gold'"}${excludedIdsClause('c.')}`)
      .take(k)
      .getMany();
  }
}

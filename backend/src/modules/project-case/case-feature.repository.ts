import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { excludedIdsClause } from './project-case.repository';

/**
 * Feature memory — one row per FEATURE of a past project (not per project), so a new SaaS lead can reuse the
 * checkout/payment effort of an e-commerce project even though the projects as a whole don't match.
 *
 * Raw SQL (like project_cases.embedding): TypeORM can't manage pgvector, and the table is fully owned here.
 * Additive — nothing existing reads it unless ENGINE_V2_FEATURES is shadow/on.
 */
export interface CaseFeatureRow {
  caseId: string;
  name: string;
  type: string;
  capability: string;
  subFeatures: string[];
  scale: number;
  signals: unknown;
  measuredDays: number;
  daysSource: 'attributed' | 'measured';
}

export interface FeatureMatch {
  name: string;
  type: string;
  capability: string;
  scale: number;
  measuredDays: number;
  caseTitle: string;
  template: string;
  quality: string | null;
  distance: number;
}

@Injectable()
export class CaseFeatureRepository {
  constructor(private readonly ds: DataSource) {}

  async ensureTable(dim: number): Promise<void> {
    await this.ds.query('CREATE EXTENSION IF NOT EXISTS vector');
    await this.ds.query(`
      CREATE TABLE IF NOT EXISTS case_features (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id uuid NOT NULL REFERENCES project_cases(id) ON DELETE CASCADE,
        name text NOT NULL,
        type varchar(48) NOT NULL,
        capability text NOT NULL DEFAULT '',
        sub_features text[] NOT NULL DEFAULT '{}',
        scale_score smallint NOT NULL DEFAULT 3,
        scale_signals jsonb,
        measured_days numeric NOT NULL DEFAULT 0,
        days_source varchar(16) NOT NULL DEFAULT 'attributed',
        embedding vector(${dim}),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await this.ds.query('CREATE INDEX IF NOT EXISTS case_features_case_idx ON case_features (case_id)');
    await this.ds.query('CREATE INDEX IF NOT EXISTS case_features_type_idx ON case_features (type)');
    await this.ds.query('CREATE INDEX IF NOT EXISTS case_features_embedding_idx ON case_features USING hnsw (embedding vector_cosine_ops)');
  }

  /** Replace a case's features atomically (idempotent rebuilds). */
  async replaceForCase(caseId: string, rows: (CaseFeatureRow & { embedding?: number[] })[]): Promise<void> {
    await this.ds.transaction(async (m) => {
      await m.query('DELETE FROM case_features WHERE case_id = $1', [caseId]);
      for (const r of rows) {
        await m.query(
          `INSERT INTO case_features (case_id, name, type, capability, sub_features, scale_score, scale_signals, measured_days, days_source, embedding)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [caseId, r.name, r.type, r.capability, r.subFeatures, r.scale, JSON.stringify(r.signals ?? {}), r.measuredDays, r.daysSource, r.embedding ? JSON.stringify(r.embedding) : null],
        );
      }
    });
  }

  /**
   * Nearest features by capability meaning across ALL domains and templates (cross-domain reuse), optionally
   * restricted to one feature type. Leave-one-out exclusion applies (backtest).
   */
  search(vec: number[], type: string | null, limit: number): Promise<FeatureMatch[]> {
    return this.ds.query(
      `SELECT f.name, f.type, f.capability, f.scale_score AS scale, f.measured_days::float AS "measuredDays",
              c.title AS "caseTitle", c.template, c.quality, (f.embedding <=> $1) AS distance
         FROM case_features f JOIN project_cases c ON c.id = f.case_id
        WHERE c.deleted_at IS NULL AND f.embedding IS NOT NULL AND f.measured_days > 0
          AND ($2::text IS NULL OR f.type = $2)${excludedIdsClause('c.')}
        ORDER BY f.embedding <=> $1
        LIMIT $3`,
      [JSON.stringify(vec), type, limit],
    ) as Promise<FeatureMatch[]>;
  }

  async count(): Promise<number> {
    const r = (await this.ds.query('SELECT count(*)::int AS n FROM case_features')) as { n: number }[];
    return r[0]?.n ?? 0;
  }
}

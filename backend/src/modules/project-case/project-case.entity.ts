import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';

/**
 * ProjectCase — a structured, learned record of one delivered/estimated project (Learning Engine, Phase 2).
 * Extracted from a lead's requirement → proposal → budget (in-app leads) or the seed corpus. Carries the
 * DECISIONS (stack, team, phases, timeline, budget) — never prose — so Decide can anchor new estimates to
 * how comparable projects were actually delivered ("learn the decisions, not the words").
 *
 * NOTE: the `embedding vector(768)` column + HNSW index are created via raw SQL (a migration +
 * ProjectCaseRepository.ensureVectorColumn), because TypeORM cannot manage the pgvector type. Do NOT add
 * `embedding` as a managed @Column here.
 *
 * synchronize:false is REQUIRED — with DATABASE_SYNCHRONIZE=true, schema-sync would treat the raw-managed
 * `embedding` column as unknown and DROP it on every boot, wiping all embeddings. The migration + boot-time
 * ensureVectorColumn own this table's schema instead.
 */
@Entity('project_cases', { synchronize: false })
export class ProjectCase extends BaseEntity {
  @Column({ default: '' })
  title: string;

  // Template category the case belongs to ('global' | 'local' | 'agency' | 'design_portfolio') — matches
  // lead.template + the Decide grounding category. Primary bucket dimension for norms + retrieval.
  @Index()
  @Column()
  template: string;

  @Column({ nullable: true })
  domain?: string;

  // Keyword tags (domain terms, integration + module names) — GIN-indexed for exact hybrid-search overlap.
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @Index()
  @Column({ name: 'scope_size', default: 'medium' })
  scopeSize: string;

  // Size signal for norm bucketing (never module count alone — combined with scope + integrations).
  @Column({ name: 'module_count', type: 'int', default: 0 })
  moduleCount: number;

  @Column({ name: 'integration_count', type: 'int', default: 0 })
  integrationCount: number;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  modules: string[];

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  stack: string[];

  // [{ role, seniority, units, days? }] — `days` = the role's effective man-days from the source budget's
  // "No. of Days" column (Workstream A); the anchor for per-role effort. Optional (legacy cases omit it).
  @Column({ type: 'jsonb', default: () => "'[]'" })
  team: { role: string; seniority: string; units: number; days?: number }[];

  // Module-intelligence profiles (module-intelligence layer): each scoped module classified by type +
  // complexity with the effective man-days ATTRIBUTED to it from the project's real total. Empty for legacy /
  // unclassified cases. Parallel to `modules` (which stays a bare string[] for tags/embedding/coverage).
  @Column({ name: 'module_profiles', type: 'jsonb', default: () => "'[]'" })
  moduleProfiles: { name: string; type: string; complexity: string; days: number }[];

  // [{ name, weeks, focus }]
  @Column({ type: 'jsonb', default: () => "'[]'" })
  phases: { name: string; weeks: number; focus?: string }[];

  @Column({ name: 'timeline_weeks', type: 'int', nullable: true })
  timelineWeeks?: number;

  // Stored as string (bigint) — matches the rate-card/budget cents convention, avoids JS precision loss.
  @Column({ name: 'budget_total_cents', type: 'bigint', default: 0 })
  budgetTotalCents: string;

  @Column({ default: 'USD' })
  currency: string;

  // Which sections the proposal contained, in order — feeds adaptive composition (2c).
  @Column({ name: 'section_structure', type: 'jsonb', default: () => "'[]'" })
  sectionStructure: string[];

  // Provenance: exactly one is set. In-app lead (preferred, higher signal) OR a seed-corpus document.
  @Index()
  @Column({ name: 'source_lead_id', type: 'uuid', nullable: true })
  sourceLeadId?: string;

  @Column({ name: 'source_doc_id', type: 'uuid', nullable: true })
  sourceDocId?: string;
}

import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';

// A real Riseup portfolio project scraped from riseuplabs.com/portfolio (Generation-Engine spec §1).
// NOTE: the `embedding vector(768)` column + HNSW index are created via raw SQL (TypeORM can't manage
// the pgvector type) — see PortfolioRepository.ensureVectorColumn. Do NOT add it as a managed @Column.
@Entity('portfolio_projects')
export class PortfolioProject extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'detail_url' })
  detailUrl: string;

  @Column()
  title: string;

  @Column({ type: 'text', default: '' })
  summary: string;

  @Column({ name: 'full_description', type: 'text', default: '' })
  fullDescription: string;

  @Column({ name: 'category_tags', type: 'jsonb', default: [] })
  categoryTags: string[];

  @Column({ name: 'industry_tags', type: 'jsonb', default: [] })
  industryTags: string[];

  /** Derived from the stack-recommendation table (§1) — the portfolio pages do not publish a stack. */
  @Column({ name: 'tech_stack', type: 'jsonb', default: [] })
  techStack: string[];

  @Column({ name: 'hero_image_url', nullable: true })
  heroImageUrl?: string;

  /** Raw `❏ Label : Value` meta scraped from the detail page (Category, Product Type, Platform Type, …). */
  @Column({ type: 'jsonb', default: {} })
  meta: Record<string, string>;
}

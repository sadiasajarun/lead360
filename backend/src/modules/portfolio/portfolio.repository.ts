import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { PortfolioProject } from './portfolio-project.entity';

@Injectable()
export class PortfolioRepository {
  constructor(@InjectRepository(PortfolioProject) private readonly repo: Repository<PortfolioProject>) {}

  findAll() {
    return this.repo.find({ order: { title: 'ASC' } });
  }

  findByUrl(detailUrl: string) {
    return this.repo.findOne({ where: { detailUrl } });
  }

  count() {
    return this.repo.count();
  }

  /** Rows whose embedding is missing (e.g. after a synchronize drop) — cheap re-embed, no re-scrape. */
  findWithoutEmbedding(): Promise<{ id: string; title: string; summary: string; fullDescription: string }[]> {
    return this.repo.query(
      `SELECT id, title, summary, full_description AS "fullDescription"
       FROM portfolio_projects WHERE embedding IS NULL`,
    );
  }

  // Idempotent upsert by detail_url (spec §9.1: re-running the job must not duplicate rows).
  async upsert(data: DeepPartial<PortfolioProject>) {
    const existing = await this.findByUrl(data.detailUrl as string);
    if (existing) return this.repo.save({ ...existing, ...data, id: existing.id });
    return this.repo.save(this.repo.create(data));
  }

  // --- pgvector (semantic retrieval of comparable projects) ---
  async ensureVectorColumn(dim: number) {
    await this.repo.query('CREATE EXTENSION IF NOT EXISTS vector');
    await this.repo.query(`ALTER TABLE portfolio_projects ADD COLUMN IF NOT EXISTS embedding vector(${dim})`);
    await this.repo.query(
      'CREATE INDEX IF NOT EXISTS portfolio_projects_embedding_idx ON portfolio_projects USING hnsw (embedding vector_cosine_ops)',
    );
  }

  setEmbedding(id: string, vec: number[]) {
    return this.repo.query('UPDATE portfolio_projects SET embedding = $1 WHERE id = $2', [`[${vec.join(',')}]`, id]);
  }

  /** Top-K most similar projects (cosine distance). Spec §1 step 1. */
  similar(vec: number[], limit: number): Promise<PortfolioProject[]> {
    return this.repo.query(
      `SELECT id, title, summary, detail_url AS "detailUrl", tech_stack AS "techStack",
              category_tags AS "categoryTags", industry_tags AS "industryTags"
       FROM portfolio_projects WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1 LIMIT $2`,
      [`[${vec.join(',')}]`, limit],
    );
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { BaseRepository } from '../../core/base/base.repository';
import { Proposal } from './proposal.entity';

@Injectable()
export class ProposalRepository extends BaseRepository<Proposal> {
  constructor(@InjectRepository(Proposal) repo: Repository<Proposal>) {
    super(repo);
  }

  findByLead(leadId: string) {
    return this.qb.findOne({ where: { leadId }, relations: ['versions'] });
  }

  // Loads the proposal with its lead (title/company/value) for PDF rendering.
  findWithLead(leadId: string) {
    return this.qb.findOne({ where: { leadId }, relations: ['lead'] });
  }

  // Read the cached PDF + its content hash (the blob columns are select:false, so ask explicitly).
  getPdfCache(id: string) {
    return this.qb.findOne({ where: { id }, select: { id: true, pdfCache: true, pdfHash: true } });
  }

  savePdfCache(id: string, pdfCache: Buffer, pdfHash: string) {
    return this.qb.update(id, { pdfCache, pdfHash });
  }

  // Internal-only cost breakdown (select:false → never in the normal read).
  async setInternalCalc(leadId: string, internalCalc: Record<string, unknown>) {
    const p = await this.qb.findOne({ where: { leadId } });
    if (p) await this.qb.update(p.id, { internalCalc } as QueryDeepPartialEntity<Proposal>);
  }

  getInternalCalc(leadId: string) {
    return this.qb.findOne({ where: { leadId }, select: { id: true, internalCalc: true } });
  }

  // All proposals with their lead + the (select:false) internalCalc — for Project Case backfill (learning).
  findAllWithLeadAndCalc(): Promise<Proposal[]> {
    return this.qb
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.lead', 'lead')
      .addSelect('p.internalCalc')
      .getMany();
  }

  /** Prepend a "what changed" entry (newest first), capped to `cap`. Best-effort — no-op if no proposal yet. */
  async appendChange(leadId: string, entry: Record<string, unknown>, cap = 20) {
    const p = await this.qb.findOne({ where: { leadId }, select: { id: true, changeLog: true } });
    if (!p) return;
    const next = [entry, ...(p.changeLog ?? [])].slice(0, cap);
    await this.qb.update(p.id, { changeLog: next } as QueryDeepPartialEntity<Proposal>);
  }
}

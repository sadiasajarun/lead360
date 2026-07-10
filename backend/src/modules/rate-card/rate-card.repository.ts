import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { RateCard } from './rate-card.entity';
import { Seniority } from '../../common/enums';

@Injectable()
export class RateCardRepository {
  constructor(@InjectRepository(RateCard) private readonly repo: Repository<RateCard>) {}

  findAll() {
    return this.repo.find({ order: { department: 'ASC', role: 'ASC', seniority: 'ASC' } });
  }

  findByRole(role: string, seniority: Seniority) {
    return this.repo.findOne({ where: { role, seniority } });
  }

  create(data: DeepPartial<RateCard>) {
    return this.repo.save(this.repo.create(data));
  }

  /** Full rebuild in one transaction — the card is replaced atomically or not at all. */
  async replaceAll(rows: DeepPartial<RateCard>[]) {
    await this.repo.manager.transaction(async (m) => {
      const r = m.getRepository(RateCard);
      await r.createQueryBuilder().delete().execute();
      await r.save(rows.map((x) => r.create(x)));
    });
  }

  /** Patch individual rows by id (the editable Rates table's Save). */
  async saveMany(rows: (DeepPartial<RateCard> & { id: string })[]) {
    await this.repo.manager.transaction(async (m) => {
      const r = m.getRepository(RateCard);
      for (const row of rows) await r.update({ id: row.id }, row);
    });
    return this.findAll();
  }
}

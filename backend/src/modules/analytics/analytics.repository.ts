import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../core/base/base.repository';
import { Lead } from '../lead/lead.entity';
import { LeadStatus } from '../../common/enums';

@Injectable()
export class AnalyticsRepository extends BaseRepository<Lead> {
  constructor(@InjectRepository(Lead) repo: Repository<Lead>) {
    super(repo);
  }

  funnel() {
    return this.qb
      .createQueryBuilder('l')
      .select('l.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('l.status')
      .getRawMany();
  }

  lossReasons() {
    return this.qb
      .createQueryBuilder('l')
      .select('l.loss_reason', 'reason')
      .addSelect('COUNT(*)', 'count')
      .where('l.status = :s', { s: LeadStatus.LOST })
      .andWhere('l.loss_reason IS NOT NULL')
      .groupBy('l.loss_reason')
      .getRawMany();
  }

  async kpis() {
    const total = await this.qb.count();
    const locked = await this.qb.count({ where: { status: LeadStatus.LOCKED } });
    const lost = await this.qb.count({ where: { status: LeadStatus.LOST } });
    const won = await this.qb
      .createQueryBuilder('l')
      .select('COALESCE(SUM(l.value_cents), 0)', 'v')
      .where('l.status = :s', { s: LeadStatus.LOCKED })
      .getRawOne<{ v: string }>();

    // Avg cycle time: created -> closed (locked or lost), in days. NULL when nothing has closed.
    const cycle = await this.qb
      .createQueryBuilder('l')
      .select('AVG(EXTRACT(EPOCH FROM (l.updated_at - l.created_at)))', 's')
      .where('l.status IN (:...s)', { s: [LeadStatus.LOCKED, LeadStatus.LOST] })
      .getRawOne<{ s: string | null }>();

    // Approval turnaround: submitted -> decided, in hours. Only leads that were actually submitted.
    const turnaround = await this.qb
      .createQueryBuilder('l')
      .select('AVG(EXTRACT(EPOCH FROM (l.updated_at - l.submitted_at)))', 's')
      .where('l.submitted_at IS NOT NULL')
      .andWhere('l.status IN (:...s)', { s: [LeadStatus.APPROVED, LeadStatus.SENT, LeadStatus.LOCKED] })
      .getRawOne<{ s: string | null }>();

    // Revenue at stake: value of everything still open (not locked, not lost).
    const atStake = await this.qb
      .createQueryBuilder('l')
      .select('COALESCE(SUM(l.value_cents), 0)', 'v')
      .where('l.status NOT IN (:...s)', { s: [LeadStatus.LOCKED, LeadStatus.LOST] })
      .getRawOne<{ v: string }>();

    const cycleSec = cycle?.s ? Number(cycle.s) : null;
    const turnSec = turnaround?.s ? Number(turnaround.s) : null;

    return {
      total,
      locked,
      lost,
      wonValueCents: Number(won?.v ?? 0),
      conversionRate: locked + lost > 0 ? locked / (locked + lost) : 0,
      // null = not enough data yet; the UI shows "—" rather than a fake zero.
      avgCycleDays: cycleSec === null ? null : Math.round((cycleSec / 86400) * 10) / 10,
      approvalTurnaroundHours: turnSec === null ? null : Math.round((turnSec / 3600) * 10) / 10,
      revenueAtStakeCents: Number(atStake?.v ?? 0),
    };
  }
}

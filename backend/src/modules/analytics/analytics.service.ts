import { Injectable } from '@nestjs/common';
import { AnalyticsRepository } from './analytics.repository';
import { LeadStatus } from '../../common/enums';

// Funnel order for the Overview bars. `lost` and `rejected` are side-branches, not stages:
// `lost` leaked out of the funnel, `rejected` was bounced back to the rep and will re-enter it.
const FUNNEL_ORDER: LeadStatus[] = [
  LeadStatus.GENERATED,
  LeadStatus.PENDING_APPROVAL,
  LeadStatus.APPROVED,
  LeadStatus.SENT,
  LeadStatus.LOCKED,
];

@Injectable()
export class AnalyticsService {
  constructor(private readonly repo: AnalyticsRepository) {}

  async overview() {
    const [kpis, rawFunnel, lossReasons] = await Promise.all([
      this.repo.kpis(),
      this.repo.funnel(),
      this.repo.lossReasons(),
    ]);

    const counts = new Map<string, number>(
      (rawFunnel as { status: string; count: string }[]).map((r) => [r.status, Number(r.count)]),
    );
    // Every stage is emitted (zeros included) so the UI can draw a complete, comparable bar chart.
    // Percentages are relative to the widest stage — a per-stage snapshot, not strict drop-off.
    const funnel = FUNNEL_ORDER.map((status) => ({ status, count: counts.get(status) ?? 0 }));
    const peak = Math.max(1, ...funnel.map((f) => f.count));
    const lostCount = counts.get(LeadStatus.LOST) ?? 0;
    const rejectedCount = counts.get(LeadStatus.REJECTED) ?? 0;

    return {
      kpis,
      funnel: funnel.map((f) => ({ ...f, pct: Math.round((f.count / peak) * 100) })),
      lost: { count: lostCount, pct: Math.round((lostCount / peak) * 100) },
      rejected: { count: rejectedCount, pct: Math.round((rejectedCount / peak) * 100) },
      lossReasons: (lossReasons as { reason: string; count: string }[]).map((r) => ({
        reason: r.reason,
        count: Number(r.count),
      })),
    };
  }
}

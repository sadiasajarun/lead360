import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { excludedIdsClause } from './project-case.repository';
import {
  feasibility,
  fitEffortWeeks,
  overheadRatio,
  phasePrior,
  proposeScopeCut,
  weeksForEffort,
  type DeliveryPoint,
  type PowerLaw,
} from '../generation/engine/calibration.util';

const OVERHEAD_ROLE = /(project|product)\s*manager|\bpm\b|analyst|\bqa\b|quality|tester|devops|dev ops|architect|account lead/i;

/** Calibration of a draft plan against the user's approved deliveries. Recorded in internalCalc. */
export interface Calibration {
  mode: 'shadow' | 'on';
  /** Effort the plan as drafted carries (person-days). */
  effortPlan: number;
  /** Feature-memory build estimate (person-days), when enough modules matched past features. */
  buildEstimate?: number;
  /** buildEstimate × (1 + learned overhead) — what approved projects of this scope actually staffed. */
  effortTarget?: number;
  overheadRatio: number;
  /** Learned weeks for the effort (only proposed when the client stated no timeline). */
  weeks?: number;
  /** Learned phase count for plans of this length. */
  phaseCount?: number;
  /** Multiply the plan's effort by this to reach effortTarget (only when meaningfully off). */
  effortScale?: number;
  fits: boolean;
  reason?: string;
  /** Reduced-scope proposal when the stated budget/deadline can't buy the scope. */
  scopeCut?: { drop: string[]; keep: string[]; allowedEffort: number };
  basis: { peers: number; law: PowerLaw };
}

export interface CalibrationInput {
  mode: 'shadow' | 'on';
  modules: { name: string; estDays: number; weight: number; featureEstimate?: { days: number } }[];
  planEffort: number;
  planWeeks: number;
  statedWeeks?: number;
  statedBudgetCents?: number;
  blendedDayRateCents?: number;
}

@Injectable()
export class ConstraintCalibrationService {
  private readonly logger = new Logger(ConstraintCalibrationService.name);
  constructor(private readonly ds: DataSource) {}

  /** Approved deliveries as effort points (leave-one-out exclusion applies). */
  async points(): Promise<DeliveryPoint[]> {
    const rows = (await this.ds.query(
      `SELECT effort_days, timeline_weeks, phases, team FROM project_cases
        WHERE deleted_at IS NULL AND quality = 'gold' AND effort_days IS NOT NULL AND timeline_weeks IS NOT NULL${excludedIdsClause()}`,
    )) as { effort_days: string; timeline_weeks: number; phases: unknown[]; team: { role: string; units: number; days?: number }[] }[];
    return rows.map((r) => {
      let overhead = 0;
      let build = 0;
      for (const t of r.team ?? []) {
        const d = (Number(t.units) || 1) * (Number(t.days) || 0);
        if (OVERHEAD_ROLE.test(t.role)) overhead += d; else build += d;
      }
      return { effort: Number(r.effort_days), weeks: Number(r.timeline_weeks), phases: Array.isArray(r.phases) ? r.phases.length : 0, heads: (r.team ?? []).reduce((s, t) => s + (Number(t.units) || 1), 0), overheadDays: overhead, buildDays: build };
    });
  }

  async calibrate(input: CalibrationInput): Promise<Calibration | undefined> {
    const peers = await this.points();
    if (peers.length < 4) return undefined; // not enough approved evidence — leave the plan alone
    const law = fitEffortWeeks(peers);
    const ovh = overheadRatio(peers);

    const covered = input.modules.filter((m) => m.featureEstimate);
    const enough = input.modules.length > 0 && covered.length / input.modules.length >= 0.5;
    const buildEstimate = enough ? Math.round(input.modules.reduce((s, m) => s + (m.featureEstimate?.days ?? m.estDays), 0)) : undefined;
    const effortTarget = buildEstimate ? Math.round(buildEstimate * (1 + ovh)) : undefined;
    const effortForWeeks = effortTarget ?? input.planEffort;

    const weeks = input.statedWeeks ? undefined : weeksForEffort(effortForWeeks, law);
    const phaseCount = phasePrior(peers, input.statedWeeks ?? weeks ?? input.planWeeks);
    const ratio = effortTarget && input.planEffort > 0 ? effortTarget / input.planEffort : 1;
    const effortScale = ratio < 0.8 || ratio > 1.25 ? Math.min(2.5, Math.max(0.4, Math.round(ratio * 100) / 100)) : undefined;

    const fz = feasibility({ requiredEffort: effortForWeeks, statedBudgetCents: input.statedBudgetCents, blendedDayRateCents: input.blendedDayRateCents, statedWeeks: input.statedWeeks, peers });
    let scopeCut: Calibration['scopeCut'];
    if (!fz.fits && fz.maxEffort) {
      const allowedBuild = fz.maxEffort / (1 + ovh);
      const cut = proposeScopeCut(input.modules.map((m) => ({ name: m.name, days: m.featureEstimate?.days ?? m.estDays, importance: m.weight })), allowedBuild);
      scopeCut = { drop: cut.drop, keep: cut.keep, allowedEffort: fz.maxEffort };
    }
    const result: Calibration = { mode: input.mode, effortPlan: Math.round(input.planEffort), buildEstimate, effortTarget, overheadRatio: Math.round(ovh * 100) / 100, weeks, phaseCount, effortScale, fits: fz.fits, reason: fz.reason, scopeCut, basis: { peers: peers.length, law } };
    this.logger.log(`Calibrate ▸ ${input.mode} · plan ${result.effortPlan}pd → target ${effortTarget ?? '—'}pd · weeks ${weeks ?? `stated ${input.statedWeeks}`} · phases ${phaseCount ?? '—'} · fits ${fz.fits}${scopeCut ? ` · cut ${scopeCut.drop.join(', ')}` : ''}`);
    return result;
  }
}

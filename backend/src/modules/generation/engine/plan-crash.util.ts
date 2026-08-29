import { CRUNCH_HOURS_PER_DAY, HOURS_PER_DAY } from '../../../common/constants/time.constants';

/** A role that can be staffed in PARALLEL (multiple heads) — a solo PM/lead/architect/DevOps is not. */
export function isParallelizableRole(role: string): boolean {
  return !/\b(manager|pm|lead|architect|principal|head|director|devops|dev ?ops|scrum)\b/i.test(role || '');
}

/** Minimal structural shape the crash operates on (both DecisionPhase and sheet-derived plan phases match).
 *  Extra fields the caller carries (phase.focus, member.seniority/dayRateCents/department) are preserved at
 *  runtime through object spread even though they are not named here. */
interface CrashMember { role: string; units: number; hoursPerDay: number }
export interface CrashPhase {
  pinnedWeeks?: boolean;
  name: string;
  weeks: number;
  team: CrashMember[];
}

/** Merge adjacent phases (smallest-combined first) until at most `target` remain — so a deadline shorter than
 *  the phase count can still be met on a sequential calendar (each phase is ≥1 week). Teams union by role
 *  (peak units, max hours); names join; extra phase fields (focus) carry from the first of each pair. */
function mergePhases(phases: CrashPhase[], target: number): void {
  while (phases.length > Math.max(1, target)) {
    let idx = 0;
    let best = Infinity;
    for (let i = 0; i < phases.length - 1; i++) {
      const w = phases[i].weeks + phases[i + 1].weeks;
      if (w < best) { best = w; idx = i; }
    }
    const a = phases[idx];
    const b = phases[idx + 1];
    const byRole = new Map<string, CrashMember>();
    for (const m of [...a.team, ...b.team]) {
      const ex = byRole.get(m.role);
      if (!ex) byRole.set(m.role, { ...m });
      else { ex.units = Math.max(ex.units, m.units); ex.hoursPerDay = Math.max(ex.hoursPerDay, m.hoursPerDay); }
    }
    phases.splice(idx, 2, { ...a, name: `${a.name} & ${b.name}`, weeks: a.weeks + b.weeks, team: [...byRole.values()] });
  }
}

/**
 * CRASH a plan to a shorter deadline (constraint-driven planning). If the deadline is tighter than the phase
 * count, phases MERGE first (compress in parallel). Then compress each phase's weeks toward `targetWeeks`
 * while CONSERVING each role's effort: raise `hoursPerDay` toward the crunch cap (12h), then add parallel
 * `units` on buildable roles. So a big scope in a short deadline stays real work with a bigger, harder-working
 * team (and a higher, honest cost). Mutates `phases` in place, pins them to exactly `targetWeeks`, and returns
 * a note describing the compression. No-op when `targetWeeks >= naturalWeeks`.
 */
export function crashPlanToWeeks(phases: CrashPhase[], targetWeeks: number, naturalWeeks: number, hard: boolean): string {
  if (!(targetWeeks > 0) || !(naturalWeeks > 0) || targetWeeks >= naturalWeeks) return '';
  // A deadline shorter than the phase count can't fit 1 week/phase sequentially → merge phases to fit.
  if (targetWeeks < phases.length) mergePhases(phases, targetWeeks);
  const curWeeks = phases.reduce((s, p) => s + p.weeks, 0);
  const k = targetWeeks / curWeeks; // < 1
  let hoursCapped = false;
  let addedHeads = 0;
  for (const p of phases) {
    // A pinned phase holds its agreed duration even under a crash — a fixed on-site window or a duration the
    // client signed off does not shrink because the rest of the plan is being compressed.
    if (p.pinnedWeeks) continue;
    const newWeeks = Math.max(1, Math.round(p.weeks * k));
    const shrink = p.weeks > 0 ? newWeeks / p.weeks : 1; // <= 1
    p.weeks = newWeeks;
    if (shrink >= 1) continue;
    const needed = 1 / shrink; // > 1 — intensity to hold this phase's person-days constant
    for (const m of p.team) {
      const curHours = m.hoursPerDay || HOURS_PER_DAY;
      const newHours = Math.min(CRUNCH_HOURS_PER_DAY, curHours * needed);
      if (newHours >= CRUNCH_HOURS_PER_DAY - 0.01) hoursCapped = true;
      const fromHours = curHours > 0 ? newHours / curHours : 1;
      m.hoursPerDay = Math.round(newHours * 100) / 100;
      const remain = needed / fromHours; // > 1 if hours alone couldn't absorb it
      if (remain > 1.05 && isParallelizableRole(m.role)) {
        const before = m.units;
        m.units = Math.max(1, Math.round(m.units * remain));
        addedHeads += m.units - before;
      }
    }
  }
  // Pin exactly to the requested weeks (largest phase absorbs the rounding drift).
  const drift = targetWeeks - phases.reduce((s, p) => s + p.weeks, 0);
  const big = [...phases].filter((p) => !p.pinnedWeeks).sort((a, b) => b.weeks - a.weeks)[0];
  if (big) big.weeks = Math.max(1, big.weeks + drift);
  const ratio = targetWeeks / naturalWeeks;
  if (ratio >= 0.75) return '';
  const bits: string[] = [];
  if (hoursCapped) bits.push('extended (overtime) hours');
  if (addedHeads > 0) bits.push(`${addedHeads} extra parallel resource${addedHeads === 1 ? '' : 's'}`);
  if (!bits.length) bits.push('a heavier daily allocation');
  let note = `Compressed to the ${targetWeeks}-week ${hard ? 'deadline' : 'timeline'} with ${bits.join(' and ')}.`;
  if (ratio < 0.34) note += ' This is an aggressive timeline — plan for delivery risk.';
  return note;
}

/**
 * crashPlanToWeeks compresses a plan to a shorter deadline while CONSERVING effort — it raises hours/day
 * toward the crunch cap, then adds parallel heads. Two shipped incidents came from here: a supplier's
 * "5-7 working days" being read as the project timeline (crashing a real build into 1 week with 61 people),
 * and pinned phases being compressed away. Both are covered below.
 */
import { crashPlanToWeeks, isParallelizableRole, type CrashPhase } from '../../src/modules/generation/engine/plan-crash.util';

const phase = (name: string, weeks: number, team: { role: string; units: number; hoursPerDay?: number }[] = []): CrashPhase => ({
  name, weeks, team: team.map((m) => ({ hoursPerDay: 8, ...m })),
});
const totalWeeks = (p: CrashPhase[]) => p.reduce((s, x) => s + x.weeks, 0);
const peakHeads = (p: CrashPhase[]) => Math.max(...p.map((x) => x.team.reduce((s, m) => s + m.units, 0)));

describe('isParallelizableRole', () => {
  it('lets hands-on roles scale out', () => {
    for (const r of ['Backend Developer', 'QA Engineer', 'UI Designer']) expect(isParallelizableRole(r)).toBe(true);
  });
  it('refuses to clone singular roles', () => {
    for (const r of ['Project Manager', 'Solution Architect', 'Tech Lead', 'DevOps Engineer']) {
      expect(isParallelizableRole(r)).toBe(false);
    }
  });
});

describe('crashPlanToWeeks', () => {
  it('does nothing when the target is not shorter than the natural plan', () => {
    const p = [phase('Build', 6, [{ role: 'Developer', units: 2 }])];
    expect(crashPlanToWeeks(p, 8, 6, false)).toBe('');
    expect(totalWeeks(p)).toBe(6);
  });

  it('hits the requested total exactly', () => {
    const p = [phase('A', 4, [{ role: 'Developer', units: 2 }]), phase('B', 8, [{ role: 'Developer', units: 3 }])];
    crashPlanToWeeks(p, 6, 12, true);
    expect(totalWeeks(p)).toBe(6);
  });

  it('merges phases when the deadline is shorter than the phase count', () => {
    const p = [phase('A', 2), phase('B', 2), phase('C', 2), phase('D', 2)];
    crashPlanToWeeks(p, 2, 8, true);
    expect(p.length).toBeLessThanOrEqual(2);
    expect(totalWeeks(p)).toBe(2);
  });

  it('conserves effort by raising hours before cloning people', () => {
    const p = [phase('Build', 10, [{ role: 'Developer', units: 2, hoursPerDay: 4 }])];
    crashPlanToWeeks(p, 5, 10, true);
    const dev = p[0].team[0];
    expect(dev.hoursPerDay).toBeGreaterThan(4);   // absorbed by intensity first
    expect(dev.units).toBe(2);                    // no extra heads needed yet
  });

  it('adds parallel heads only once hours are capped', () => {
    const p = [phase('Build', 12, [{ role: 'Developer', units: 2, hoursPerDay: 8 }])];
    crashPlanToWeeks(p, 3, 12, true);
    expect(p[0].team[0].hoursPerDay).toBeLessThanOrEqual(12);
    expect(p[0].team[0].units).toBeGreaterThan(2);
  });

  it('never clones a singular role even under an extreme crash', () => {
    const p = [phase('Build', 20, [{ role: 'Project Manager', units: 1 }, { role: 'Developer', units: 2 }])];
    crashPlanToWeeks(p, 2, 20, true);
    expect(p[0].team.find((m) => m.role === 'Project Manager')!.units).toBe(1);
  });

  it('regression: a vendor SLA read as the timeline must not explode the team past reason', () => {
    // The shipped bug: 1 week / 61 people. Effort conservation alone should not reach that scale here.
    const p = [phase('Build', 11, [{ role: 'Developer', units: 4 }, { role: 'QA Engineer', units: 2 }])];
    crashPlanToWeeks(p, 1, 11, true);
    expect(totalWeeks(p)).toBe(1);
    expect(peakHeads(p)).toBeLessThan(61);
  });

  it('holds a pinned phase at its agreed duration while the rest compresses', () => {
    const p = [phase('Build', 10, [{ role: 'Developer', units: 2 }]), { ...phase('On-site Install', 2), pinnedWeeks: true }];
    crashPlanToWeeks(p, 6, 12, true);
    expect(p[1].weeks).toBe(2);                   // the fixed on-site window survives
    expect(totalWeeks(p)).toBe(6);
  });

  it('keeps every phase at a minimum of one week', () => {
    const p = [phase('A', 3), phase('B', 3), phase('C', 3)];
    crashPlanToWeeks(p, 3, 9, true);
    for (const x of p) expect(x.weeks).toBeGreaterThanOrEqual(1);
  });

  it('describes the compression, and flags an aggressive one', () => {
    const mild = [phase('Build', 10, [{ role: 'Developer', units: 2 }])];
    expect(crashPlanToWeeks(mild, 8, 10, false)).toBe('');   // within 75% — nothing worth saying
    const hard = [phase('Build', 20, [{ role: 'Developer', units: 2 }])];
    const note = crashPlanToWeeks(hard, 5, 20, true);
    expect(note).toMatch(/compressed/i);
    expect(note).toMatch(/aggressive/i);
  });
});

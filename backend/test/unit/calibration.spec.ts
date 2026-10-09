import { feasibility, fitEffortWeeks, overheadRatio, phasePrior, proposeScopeCut, weeksForEffort, type DeliveryPoint } from '../../src/modules/generation/engine/calibration.util';

const pt = (effort: number, weeks: number, phases = 3): DeliveryPoint => ({ effort, weeks, phases, heads: 5, buildDays: effort * 0.7, overheadDays: effort * 0.3 });
const PEERS = [pt(50, 2), pt(100, 5), pt(150, 7), pt(200, 9), pt(300, 11), pt(500, 14)];

describe('calibration', () => {
  it('fits a monotone effort→weeks law from approved deliveries', () => {
    const law = fitEffortWeeks(PEERS);
    expect(law.n).toBe(6);
    expect(weeksForEffort(100, law)).toBeLessThan(weeksForEffort(400, law));
    expect(weeksForEffort(150, law)).toBeGreaterThanOrEqual(5);
    expect(weeksForEffort(150, law)).toBeLessThanOrEqual(9);
  });

  it('falls back to a safe default with too few points', () => {
    expect(fitEffortWeeks([pt(100, 5)]).b).toBe(0.5);
  });

  it('learns the overhead ratio', () => {
    expect(overheadRatio(PEERS)).toBeCloseTo(0.3 / 0.7, 2);
  });

  it('learns the phase-count prior from similar-length plans', () => {
    expect(phasePrior([...PEERS, pt(120, 6, 7)], 6)).toBe(3);
    expect(phasePrior([pt(10, 1, 0)], 4)).toBeUndefined();
  });

  it('flags a budget that cannot buy the required effort', () => {
    const f = feasibility({ requiredEffort: 200, statedBudgetCents: 500000, blendedDayRateCents: 5000, peers: PEERS });
    expect(f.fits).toBe(false);
    expect(f.maxEffort).toBe(100);
  });

  it('accepts a budget that fits, and a deadline peers could sustain', () => {
    expect(feasibility({ requiredEffort: 90, statedBudgetCents: 500000, blendedDayRateCents: 5000, peers: PEERS }).fits).toBe(true);
    expect(feasibility({ requiredEffort: 150, statedWeeks: 7, peers: PEERS }).fits).toBe(true);
  });

  it('flags a deadline far tighter than any approved project sustained', () => {
    expect(feasibility({ requiredEffort: 400, statedWeeks: 2, peers: PEERS }).fits).toBe(false);
  });

  it('proposes dropping the least important modules first, never the core one', () => {
    const cut = proposeScopeCut(
      [
        { name: 'Booking', days: 30, importance: 5 },
        { name: 'Reports', days: 20, importance: 2 },
        { name: 'Loyalty', days: 15, importance: 1 },
        { name: 'Chat', days: 10, importance: 3 },
      ],
      45,
    );
    expect(cut.drop).toEqual(['Loyalty', 'Reports']);
    expect(cut.keep).toContain('Booking');
    expect(cut.keptDays).toBe(40);
  });
});

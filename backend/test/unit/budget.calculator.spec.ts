/**
 * The money math is the one thing that must never drift: every total the client sees — the proposal's
 * financial block, the Budget tab and the Excel export — is a projection of computeBudget. Two shipped
 * bugs came from equipment being left out of a total, so equipment has its own cases here.
 */
import { computeBudget, type CalcLine, type CalcAdjustments } from '../../src/modules/budget/budget.calculator';

const line = (over: Partial<CalcLine> = {}): CalcLine => ({
  department: 'Engineering', units: 1, days: 10, dayRateCents: 10_000, optional: false, ...over,
});
const NO_ADJ: CalcAdjustments = { contingencyPct: 0, discountPct: 0, vatPct: 0 };

describe('computeBudget', () => {
  it('costs a line as units x days x dayRate', () => {
    const r = computeBudget([line({ units: 2, days: 5, dayRateCents: 20_000 })], NO_ADJ);
    expect(r.lineCostsCents).toEqual([200_000]);
    expect(r.subtotalCents).toBe(200_000);
    expect(r.totalCents).toBe(200_000);
  });

  it('excludes optional lines unless they are explicitly included', () => {
    const lines = [line(), line({ optional: true })];
    expect(computeBudget(lines, NO_ADJ, false).subtotalCents).toBe(100_000);
    expect(computeBudget(lines, NO_ADJ, true).subtotalCents).toBe(200_000);
  });

  it('still reports a cost for an excluded optional line', () => {
    // The row is priced in the sheet even when it sits outside the total.
    const r = computeBudget([line({ optional: true })], NO_ADJ, false);
    expect(r.lineCostsCents).toEqual([100_000]);
    expect(r.subtotalCents).toBe(0);
  });

  it('applies contingency, then discount, then VAT on the discounted base', () => {
    const r = computeBudget([line()], { contingencyPct: 10, discountPct: 5, vatPct: 15 });
    expect(r.subtotalCents).toBe(100_000);
    expect(r.contingencyCents).toBe(10_000);
    expect(r.discountCents).toBe(5_000);
    expect(r.vatCents).toBe(15_750);   // (100000 + 10000 - 5000) * 15%
    expect(r.totalCents).toBe(120_750);
  });

  describe('equipment', () => {
    it('folds qty x unitPrice into the subtotal and the total', () => {
      const r = computeBudget([line()], NO_ADJ, false, [{ qty: 4, unitPriceCents: 50_000 }]);
      expect(r.equipmentCents).toBe(200_000);
      expect(r.subtotalCents).toBe(300_000);
      expect(r.totalCents).toBe(300_000);
    });

    it('carries equipment through contingency and VAT', () => {
      const r = computeBudget([line()], { contingencyPct: 0, discountPct: 0, vatPct: 10 }, false, [
        { qty: 2, unitPriceCents: 100_000 },
      ]);
      expect(r.subtotalCents).toBe(300_000);
      expect(r.vatCents).toBe(30_000);
      expect(r.totalCents).toBe(330_000);
    });

    it('regression: an equipment-only budget still totals (hardware silently vanished before)', () => {
      const r = computeBudget([], NO_ADJ, false, [{ qty: 3, unitPriceCents: 25_000 }]);
      expect(r.equipmentCents).toBe(75_000);
      expect(r.totalCents).toBe(75_000);
    });

    it('keeps equipment out of the per-department split', () => {
      const r = computeBudget([line()], NO_ADJ, false, [{ qty: 1, unitPriceCents: 500_000 }]);
      expect(r.byDepartmentCents).toEqual({ Engineering: 100_000 });
    });
  });

  describe('guards', () => {
    it('clamps a discount above 100% instead of inverting the total', () => {
      const r = computeBudget([line()], { contingencyPct: 0, discountPct: 250, vatPct: 0 });
      expect(r.discountCents).toBe(100_000);
      expect(r.totalCents).toBe(0);
    });

    it('treats missing and negative numbers as zero rather than producing NaN', () => {
      const r = computeBudget(
        [line({ units: NaN as unknown as number, days: -5 })],
        { contingencyPct: -10, discountPct: NaN as unknown as number, vatPct: 0 },
      );
      expect(r.totalCents).toBe(0);
      expect(Number.isNaN(r.totalCents)).toBe(false);
    });

    it('returns integer cents — never a fraction that would round differently downstream', () => {
      const r = computeBudget([line({ days: 3, dayRateCents: 3_333 })], { contingencyPct: 7, discountPct: 3, vatPct: 15 });
      for (const v of [r.subtotalCents, r.contingencyCents, r.discountCents, r.vatCents, r.totalCents]) {
        expect(Number.isInteger(v)).toBe(true);
      }
    });

    it('an empty budget is zero, not NaN', () => {
      expect(computeBudget([], NO_ADJ).totalCents).toBe(0);
    });
  });
});

// Pure, deterministic budget math — the single source of truth for every total.
// ALL amounts are integer minor units (cents). The LLM never does this; code does.
// Matches BUDGETING.md + the approved prototype:
//   unitCost = units * days * dayRateCents
//   subtotal = sum of NON-optional line costs (optional lines only when includeOptional)
//   contingency = subtotal * contingency%   (adds)
//   discount    = subtotal * discount%      (subtracts; clamped 0..100)
//   vat         = (subtotal + contingency - discount) * vat%
//   total       = subtotal + contingency - discount + vat

export interface CalcLine {
  department: string;
  units: number;
  days: number;
  dayRateCents: number;
  optional: boolean;
}

/** A purchased item: cost = qty x unitPriceCents (no man-days involved). */
export interface CalcEquipment {
  qty: number;
  unitPriceCents: number;
}

export interface CalcAdjustments {
  contingencyPct: number;
  discountPct: number;
  vatPct: number;
}

export interface CalcResult {
  lineCostsCents: number[];
  byDepartmentCents: Record<string, number>;
  /** Purchased-items subtotal, already included in subtotalCents. */
  equipmentCents: number;
  subtotalCents: number;
  contingencyCents: number;
  discountCents: number;
  vatCents: number;
  totalCents: number;
}

const clampPct = (v: number, max = 1000): number => Math.min(max, Math.max(0, Number(v) || 0));

export function computeBudget(
  lines: CalcLine[],
  adj: CalcAdjustments,
  includeOptional = false,
  equipment: CalcEquipment[] = [],
): CalcResult {
  const lineCostsCents = lines.map((l) =>
    Math.round((Number(l.units) || 0) * (Number(l.days) || 0) * (Number(l.dayRateCents) || 0)),
  );

  const byDepartmentCents: Record<string, number> = {};
  let subtotal = 0;
  lines.forEach((l, i) => {
    if (l.optional && !includeOptional) return;
    byDepartmentCents[l.department] = (byDepartmentCents[l.department] ?? 0) + lineCostsCents[i];
    subtotal += lineCostsCents[i];
  });

  // Purchased items sit in the same subtotal as resources, so every downstream total already covers them.
  const equipmentCents = equipment.reduce(
    (sum, e) => sum + Math.round((Number(e.qty) || 0) * (Number(e.unitPriceCents) || 0)),
    0,
  );
  subtotal += equipmentCents;

  const contingency = Math.round((subtotal * clampPct(adj.contingencyPct)) / 100);
  const discount = Math.round((subtotal * clampPct(adj.discountPct, 100)) / 100);
  const afterDiscount = subtotal + contingency - discount;
  const vat = Math.round((afterDiscount * clampPct(adj.vatPct)) / 100);
  const total = afterDiscount + vat;

  return {
    lineCostsCents,
    byDepartmentCents,
    equipmentCents,
    subtotalCents: subtotal,
    contingencyCents: contingency,
    discountCents: discount,
    vatCents: vat,
    totalCents: total,
  };
}

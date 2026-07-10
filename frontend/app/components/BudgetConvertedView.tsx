import { useEffect, useState } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { getBudget } from '~/services/httpServices/budgetService';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';
import { formatMoney } from '~/enums/currency.enum';
import type { BudgetLine, BudgetResponse } from '~/types/budget';

const lineCost = (l: BudgetLine) =>
  Math.round((Number(l.units) || 0) * (Number(l.days) || 0) * (Number(l.dayRateCents) || 0));

/**
 * Read-only budget rendered in a DISPLAY currency other than the one it was authored in. The figures
 * come from `GET /leads/:id/budget?currency=XXX` (server converts dayRateCents + computed totals from
 * USD at the live rate). Because this view can't edit or save, converted rates can never be persisted —
 * to change the numbers the user must switch back to the authored currency (the editable BudgetEditor).
 */
export function BudgetConvertedView({ leadId, currency, budgetCurrency }: {
  leadId: string;
  currency: string;
  budgetCurrency: string;
}) {
  const [data, setData] = useState<BudgetResponse | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setData(null); setErr('');
    getBudget(leadId, currency)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(apiErrorMessage(e)); });
    return () => { alive = false; };
  }, [leadId, currency]);

  if (err) return <div data-testid="budget-converted-error" className="text-sm text-[#B42318]">{err}</div>;
  if (!data) return <div className="flex items-center gap-2 text-sm text-[#6B6660]"><Loader2 size={15} className="animate-spin" /> Converting budget…</div>;

  const fmt = (c: number | string) => formatMoney(c, currency);
  const c = data.computed;
  const lines = data.budget.lines;

  return (
    <div data-testid="budget-converted">
      {data.converted && (
        <div data-testid="budget-converted-note" className="mb-4 flex items-start gap-2 rounded-lg border border-[#F3D9C7] bg-[#FDF6F0] px-3.5 py-2.5 text-[13px] text-[#6B6660]">
          <Info size={16} className="mt-0.5 shrink-0 text-[#EA5400]" />
          <span>
            Converted from {budgetCurrency} at {(Number(data.rate) || 0).toFixed(4)} — display only. Saved rates stay in {budgetCurrency}.
            <b className="text-[#0F0F0F]"> Switch back to {budgetCurrency} to edit.</b>
          </span>
        </div>
      )}

      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-[#E8E6E3] bg-[#141310] px-4 py-2.5 text-white">
        <span className="text-[13px] font-semibold">Cost Breakdown · {currency}</span>
        <span data-testid="budget-converted-total" className="text-[15px] font-bold tabular-nums text-[#EA5400]">{fmt(c.totalCents)}</span>
      </div>

      <div className="overflow-x-auto border-x border-[#E8E6E3]">
        <table className="w-full text-sm">
          <thead className="bg-[#F4F4F2] text-left text-xs uppercase tracking-wide text-[#9A948E]">
            <tr>
              <th className="px-3 py-2">Department</th><th className="px-3">Role / Head</th><th className="px-3">Type</th>
              <th className="px-3 text-right">Unit</th><th className="px-3 text-right">Days</th>
              <th className="px-3 text-right">Rate</th><th className="px-3 text-right">Unit Cost</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id ?? i} data-testid={`budget-converted-line-${i}`} className={`border-t border-[#E8E6E3] ${l.optional ? 'bg-[#FBF4EA]' : ''}`}>
                <td className="px-3 py-1.5 font-medium">{l.department}</td>
                <td className="px-3">{l.role}</td>
                <td className="px-3 capitalize text-[#6B6660]">{l.seniority}{l.optional ? ' · optional' : ''}</td>
                <td className="px-3 text-right tabular-nums">{Number(l.units)}</td>
                <td className="px-3 text-right tabular-nums">{Number(l.days)}</td>
                <td className="px-3 text-right tabular-nums">{fmt(l.dayRateCents)}</td>
                <td className="px-3 text-right tabular-nums">{fmt(lineCost(l))}</td>
              </tr>
            ))}
            <tr className="border-t border-[#D4D1CC] bg-[#F4F4F2]"><td colSpan={6} className="px-3 py-2 font-medium text-[#6B6660]">Subtotal</td><td data-testid="budget-converted-subtotal" className="px-3 text-right font-semibold tabular-nums">{fmt(c.subtotalCents)}</td></tr>
            {Number(c.contingencyCents) !== 0 && <tr className="bg-[#F4F4F2]"><td colSpan={6} className="px-3 py-1 text-[#6B6660]">Contingency</td><td className="px-3 text-right tabular-nums">+{fmt(c.contingencyCents)}</td></tr>}
            {Number(c.discountCents) !== 0 && <tr className="bg-[#F4F4F2]"><td colSpan={6} className="px-3 py-1 text-[#6B6660]">Discount</td><td className="px-3 text-right tabular-nums">−{fmt(c.discountCents)}</td></tr>}
            {Number(c.vatCents) !== 0 && <tr className="bg-[#F4F4F2]"><td colSpan={6} className="px-3 py-1 text-[#6B6660]">VAT / Tax</td><td className="px-3 text-right tabular-nums">+{fmt(c.vatCents)}</td></tr>}
            <tr className="border-t border-[#D4D1CC] bg-[#141310] text-white"><td colSpan={6} className="px-3 py-2.5 font-semibold">Total (engagement)</td><td className="px-3 text-right font-semibold tabular-nums text-[#EA5400]">{fmt(c.totalCents)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

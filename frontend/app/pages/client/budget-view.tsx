import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { getBudget } from '~/services/httpServices/presentService';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';
import type { BudgetResponse } from '~/types/budget';

const money = (c: number) => '$' + Math.round(c / 100).toLocaleString();

export default function ClientBudgetView() {
  const { id = '' } = useParams();
  const [data, setData] = useState<BudgetResponse | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getBudget(id).then(setData).catch((e) => setErr(apiErrorMessage(e)));
  }, [id]);

  if (err) return <div className="p-10 text-sm text-[#B42318]">{err}</div>;
  if (!data) return <div className="p-10 text-sm text-[#6B6660]">Loading…</div>;
  const { budget, computed } = data;

  return (
    <main data-testid="client-budget-view" className="mx-auto max-w-[900px] p-10">
      <div className="mb-6 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-[#EA5400] text-sm font-bold text-white">L</span>
        <span className="font-semibold">Riseup Labs</span>
      </div>
      <h1 className="text-2xl font-bold">Budget</h1>
      <p className="mb-6 text-sm text-[#6B6660]">Cost breakdown ({budget.currency}) · read-only</p>
      <div className="overflow-x-auto rounded-xl border border-[#EAE4DE]">
        <table className="w-full text-sm">
          <thead className="bg-[#FBF7F3] text-left text-xs uppercase text-[#6B6660]">
            <tr>
              <th className="px-4 py-3">Department</th><th className="px-4">Role</th>
              <th className="px-4 text-right">Unit</th><th className="px-4 text-right">Days</th>
              <th className="px-4 text-right">Rate</th><th className="px-4 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {budget.lines.map((l, i) =>
              l.optional ? null : (
                <tr key={i} className="border-t border-[#EAE4DE]">
                  <td className="px-4 py-2.5">{l.department}</td>
                  <td className="px-4">{l.role}</td>
                  <td className="px-4 text-right">{l.units}</td>
                  <td className="px-4 text-right">{l.days}</td>
                  <td className="px-4 text-right">{money(l.dayRateCents)}</td>
                  <td className="px-4 text-right tabular-nums">{money(computed.lineCostsCents[i])}</td>
                </tr>
              ),
            )}
            <tr className="border-t border-[#EAE4DE] bg-[#FBF7F3]"><td colSpan={5} className="px-4 py-2.5 font-medium">Subtotal</td><td className="px-4 text-right font-semibold tabular-nums">{money(computed.subtotalCents)}</td></tr>
            {computed.contingencyCents > 0 && <tr className="bg-[#FBF7F3]"><td colSpan={5} className="px-4 py-1">Contingency</td><td className="px-4 text-right tabular-nums">+{money(computed.contingencyCents)}</td></tr>}
            {computed.discountCents > 0 && <tr className="bg-[#FBF7F3]"><td colSpan={5} className="px-4 py-1">Discount</td><td className="px-4 text-right tabular-nums">−{money(computed.discountCents)}</td></tr>}
            {computed.vatCents > 0 && <tr className="bg-[#FBF7F3]"><td colSpan={5} className="px-4 py-1">VAT / Tax</td><td className="px-4 text-right tabular-nums">+{money(computed.vatCents)}</td></tr>}
            <tr className="border-t border-[#141310] bg-[#141310] text-white"><td colSpan={5} className="px-4 py-3 font-semibold">Total</td><td data-testid="client-budget-total" className="px-4 text-right font-semibold tabular-nums text-[#EA5400]">{money(computed.totalCents)}</td></tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}

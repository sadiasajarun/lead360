import { useEffect, useState } from 'react';
import { Boxes, ChevronDown, Loader2 } from 'lucide-react';
import { getModuleBreakdown } from '~/services/httpServices/leadDetailService';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';
import { formatMoney } from '~/enums/currency.enum';
import type { ModuleBreakdown } from '~/types/generation';

/**
 * Internal module-intelligence breakdown (module-intelligence layer) — sales-team only, NOT in the client
 * proposal. Per module: type, complexity, relative weight, and estimated effort/cost, plus a cross-check of
 * the module-sum against the role-based plan (which stays authoritative). Effort is modeled from a
 * type/complexity taxonomy and calibrated against real past project totals.
 */
const COMPLEXITY_STYLE: Record<string, string> = {
  simple: 'bg-[#E7F6EE] text-[#0E7C5A]',
  moderate: 'bg-[#E8F0FE] text-[#1A56C4]',
  complex: 'bg-[#FDF0E1] text-[#B7791F]',
  'very-complex': 'bg-[#FDECEC] text-[#B42318]',
};
const TYPE_LABEL = (t: string) => t.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function ModuleBreakdownPanel({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ModuleBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    setLoading(true); setErr('');
    getModuleBreakdown(leadId)
      .then((d) => { setData(d); setLoaded(true); })
      .catch((e) => setErr(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [open, loaded, leadId]);

  const fmt = (cents: number) => formatMoney(cents, data?.currency ?? 'USD');
  const hasModules = !!data && data.modules.length > 0;
  const delta = data ? data.totalEstCents - data.planSubtotalCents : 0;
  const deltaPct = data && data.planSubtotalCents > 0 ? Math.round((delta / data.planSubtotalCents) * 100) : 0;

  return (
    <div data-testid="module-breakdown" className="mt-3 rounded-[10px] border border-[#E7E3DC] bg-white">
      <button
        type="button"
        data-testid="module-breakdown-toggle"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Boxes size={14} className="text-[#EA5400]" />
        <span className="text-[12px] font-semibold uppercase tracking-wide text-[#3A3530]">Module breakdown</span>
        <span className="text-[11px] text-[#9A948E]">internal · effort &amp; complexity</span>
        <ChevronDown size={15} className={`ml-auto text-[#9A948E] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-[#EFEBE4] px-3 py-2.5">
          {loading && <div className="flex items-center gap-2 py-2 text-[12.5px] text-[#6B6660]"><Loader2 size={14} className="animate-spin" /> Loading…</div>}
          {err && <div className="py-2 text-[12px] text-[#B42318]" data-testid="module-breakdown-error">{err}</div>}
          {!loading && !err && !hasModules && (
            <div className="py-2 text-[12.5px] text-[#9A948E]">No module breakdown yet — generate the proposal first.</div>
          )}

          {hasModules && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-[#9A948E]">
                    <tr>
                      <th className="py-1.5 pr-2">Module</th><th className="px-2">Type</th><th className="px-2">Complexity</th>
                      <th className="px-2 text-right">Weight</th><th className="px-2 text-right">Est. days</th><th className="pl-2 text-right">Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.modules.map((m, i) => (
                      <tr key={i} data-testid={`module-row-${i}`} className="border-t border-[#F0EEEB] align-top">
                        <td className="py-1.5 pr-2">
                          <div className="font-medium text-[#3A3530]">{m.name}</div>
                          {m.keyFeatures.length > 0 && <div className="text-[11px] text-[#9A948E]">{m.keyFeatures.join(' · ')}</div>}
                        </td>
                        <td className="px-2"><span className="rounded bg-[#F4F4F2] px-1.5 py-0.5 text-[11px] text-[#6B6660]">{TYPE_LABEL(m.type)}</span></td>
                        <td className="px-2"><span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${COMPLEXITY_STYLE[m.complexity] ?? 'bg-[#F4F4F2] text-[#6B6660]'}`}>{m.complexity}</span></td>
                        <td className="px-2 text-right tabular-nums text-[#6B6660]">{m.weight}</td>
                        <td className="px-2 text-right tabular-nums text-[#3A3530]">{m.estDays}d</td>
                        <td className="pl-2 text-right tabular-nums text-[#3A3530]">{fmt(m.estCents)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-[#D4D1CC] font-semibold">
                      <td className="py-1.5 pr-2 text-[#3A3530]" colSpan={4}>Module estimate</td>
                      <td className="px-2 text-right tabular-nums text-[#3A3530]">{data!.totalEstDays}d</td>
                      <td className="pl-2 text-right tabular-nums text-[#EA5400]">{fmt(data!.totalEstCents)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-2.5 rounded-md bg-[#FAF8F5] px-2.5 py-2 text-[11.5px] leading-relaxed text-[#6B6660]">
                <b className="text-[#3A3530]">Cross-check:</b> the module estimate {fmt(data!.totalEstCents)} vs the plan{' '}
                {fmt(data!.planSubtotalCents)}
                {data!.planSubtotalCents > 0 && <> ({delta >= 0 ? '+' : ''}{deltaPct}%)</>}. The role-based plan sets the price;
                this breakdown is an informational sizing view. Per-module effort is <b className="text-[#3A3530]">modeled</b> from
                a type/complexity taxonomy and calibrated against real past project totals (the corpus has no per-module hours).
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

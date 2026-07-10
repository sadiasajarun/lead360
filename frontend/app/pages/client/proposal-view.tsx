import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { getProposal, getLead, getBudget } from '~/services/httpServices/presentService';
import { ProposalDocument, buildPricing } from '~/components/ProposalDocument';
import { formatMoneyWhole } from '~/enums/currency.enum';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';
import type { Lead } from '~/types/lead';
import type { BudgetResponse } from '~/types/budget';

export default function ClientProposalView() {
  const { id = '' } = useParams();
  const [data, setData] = useState<{ template: string; sections: Record<string, unknown> } | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [budget, setBudget] = useState<BudgetResponse | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getProposal(id).then(setData).catch((e) => setErr(apiErrorMessage(e)));
    getLead(id).then(setLead).catch(() => setLead(null));
    getBudget(id).then(setBudget).catch(() => setBudget(null));
  }, [id]);

  if (err) return <div data-testid="proposal-empty" className="p-10 text-sm text-[#6B6660]">Not generated yet.</div>;
  if (!data) return <div className="p-10 text-sm text-[#6B6660]">Loading…</div>;

  const budgetCurrency = lead?.budgetCurrency || 'USD';
  // Hero "Investment" fallback → whole units (client headline figure).
  const money = lead ? formatMoneyWhole(lead.valueCents, budgetCurrency) : undefined;
  const hasSections = Object.keys(data.sections || {}).length > 0;

  return (
    <main data-testid="client-proposal-view" className="mx-auto max-w-[1180px] p-6 sm:p-10">
      {hasSections ? (
        <ProposalDocument
          title={lead?.title ?? 'Proposal'}
          company={lead?.company ?? '—'}
          template={data.template}
          valueLabel={money}
          currency={budgetCurrency}
          pricing={budget ? buildPricing(Number(budget.computed.totalCents), budget.budget.lines, data.sections?.timeline, `/present/${id}/budget`) : undefined}
          contactName={lead?.contactName ?? undefined}
          sections={data.sections}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-[#D4D1CC] p-14 text-center text-sm text-[#6B6660]">
          This proposal has not been generated yet.
        </div>
      )}
      <footer className="mt-8 text-center text-xs text-[#9A948E]">© {new Date().getFullYear()} Riseup Labs</footer>
    </main>
  );
}

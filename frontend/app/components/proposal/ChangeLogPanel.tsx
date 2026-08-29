import { useState } from 'react';
import { History, ArrowRight, Maximize2, X, Sparkles, Send, Loader2 } from 'lucide-react';
import { askProposal } from '~/services/httpServices/leadDetailService';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';
import type { ChangeEntry } from '~/types/leadDetail';

/**
 * Compact, scrollable "what changed in the last regenerations" panel (P6). Mounts directly under the
 * regenerate prompt (proposal + budget). Read-only; fed from `proposal.changeLog` (newest first).
 * The corner expand icon opens the full history in a larger modal.
 *
 * Workstream C: when `enableAsk` + `leadId` are provided, it also hosts a grounded Q&A box — ask why the
 * budget/timeline/team/stack landed where it did and get an answer from the saved decision record (no regen).
 */
interface ChangeLogPanelProps {
  entries?: ChangeEntry[];
  testId?: string;
  /** Lead id — required for the Q&A box. */
  leadId?: string;
  /** Show the "Ask about this proposal" box (only on the main proposal panel, not the budget one). */
  enableAsk?: boolean;
}

interface QaTurn { q: string; a: string }

const KIND_LABEL: Record<ChangeEntry['kind'], string> = {
  proposal: 'Proposal',
  budget: 'Budget',
  section: 'Section',
};

const fmtCents = (cents: number, currency = 'USD') =>
  new Intl.NumberFormat(currency === 'BDT' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);

// "just now" / "5m ago" / "2h ago" / "3d ago".
function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** One change entry — reused by the compact list and the expanded modal. */
function ChangeEntryRow({ e, testId }: { e: ChangeEntry; testId: string }) {
  const hasBudget = typeof e.budgetAfterCents === 'number';
  const hasWeeks = typeof e.weeksAfter === 'number';
  return (
    <li data-testid={testId} className="px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-[#EA5400] bg-[#FDEBE0] rounded px-1.5 py-0.5">{KIND_LABEL[e.kind] ?? e.kind}</span>
        <span className="text-[12.5px] font-medium text-[#3A3530] leading-snug">{e.title}</span>
        <span className="ml-auto shrink-0 text-[10.5px] text-[#8A857D]">{relativeTime(e.at)}</span>
      </div>
      {e.details?.length > 0 && (
        <ul className="mt-1 ml-1 space-y-0.5">
          {e.details.map((d, j) => (
            <li key={j} className="text-[11.5px] text-[#6B6660] leading-snug">• {d}</li>
          ))}
        </ul>
      )}
      {(hasBudget || hasWeeks) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#6B6660]">
          {hasBudget && (
            <span className="inline-flex items-center gap-1">
              {typeof e.budgetBeforeCents === 'number' && (
                <>
                  <span className="text-[#A19B92]">{fmtCents(e.budgetBeforeCents, e.currency)}</span>
                  <ArrowRight size={11} className="text-[#A19B92]" />
                </>
              )}
              <span className="font-semibold text-[#3A3530]">{fmtCents(e.budgetAfterCents as number, e.currency)}</span>
            </span>
          )}
          {hasWeeks && (
            <span className="inline-flex items-center gap-1">
              {typeof e.weeksBefore === 'number' && (
                <>
                  <span className="text-[#A19B92]">{e.weeksBefore}w</span>
                  <ArrowRight size={11} className="text-[#A19B92]" />
                </>
              )}
              <span className="font-semibold text-[#3A3530]">{e.weeksAfter}w</span>
            </span>
          )}
        </div>
      )}
    </li>
  );
}

export function ChangeLogPanel({ entries, testId = 'change-log-panel', leadId, enableAsk }: ChangeLogPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const hasEntries = !!entries && entries.length > 0;
  const showAsk = !!enableAsk && !!leadId;
  // Nothing to show at all (no history and no Q&A box) → render nothing, as before.
  if (!hasEntries && !showAsk) return null;

  return (
    <>
      {hasEntries && (
      <div data-testid={testId} className="mt-3 rounded-[10px] border border-[#E7E3DC] bg-[#FAF8F5]">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#E7E3DC]">
          <History size={14} className="text-[#EA5400]" />
          <span className="text-[12px] font-semibold text-[#3A3530] uppercase tracking-wide">What changed</span>
          <span className="ml-auto text-[11px] text-[#8A857D]">{entries!.length}</span>
          <button
            type="button"
            data-testid={`${testId}-expand`}
            onClick={() => setExpanded(true)}
            title="Expand change history"
            aria-label="Expand change history"
            className="grid h-6 w-6 place-items-center rounded-md text-[#8A857D] hover:bg-[#F0EBE3] hover:text-[#3A3530] cursor-pointer"
          >
            <Maximize2 size={13} />
          </button>
        </div>
        {/* ~1 inch tall, scrolls when the history grows */}
        <ul className="max-h-[112px] overflow-y-auto divide-y divide-[#EFEBE4]">
          {entries!.map((e, i) => (
            <ChangeEntryRow key={`${e.at}-${i}`} e={e} testId={`${testId}-entry`} />
          ))}
        </ul>
      </div>
      )}

      {showAsk && <ProposalAskBox leadId={leadId as string} testId={`${testId}-ask`} />}

      {expanded && entries && (
        <div
          data-testid={`${testId}-modal`}
          className="fixed inset-0 z-[130] grid place-items-center bg-black/40 p-4"
          onClick={() => setExpanded(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-[#E7E3DC] bg-white shadow-2xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[#E7E3DC] px-5 py-3">
              <History size={16} className="text-[#EA5400]" />
              <span className="text-[14px] font-semibold text-[#3A3530]">What changed</span>
              <span className="text-[12px] text-[#8A857D]">· {entries.length} update{entries.length === 1 ? '' : 's'}</span>
              <button
                type="button"
                data-testid={`${testId}-modal-close`}
                onClick={() => setExpanded(false)}
                aria-label="Close"
                className="ml-auto grid h-8 w-8 place-items-center rounded-md text-[#8A857D] hover:bg-[#F4F4F2] hover:text-[#0F0F0F] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <ul className="flex-1 overflow-y-auto divide-y divide-[#EFEBE4]">
              {entries!.map((e, i) => (
                <ChangeEntryRow key={`${e.at}-${i}`} e={e} testId={`${testId}-modal-entry`} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Grounded, read-only Q&A about this proposal (Workstream C). Ask why the budget/timeline/team/stack landed
 * where they did; answers come from the saved decision record. Nothing is regenerated. English or বাংলা.
 */
function ProposalAskBox({ leadId, testId }: { leadId: string; testId: string }) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<QaTurn[]>([]);
  const [err, setErr] = useState('');

  const ask = async () => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true); setErr('');
    try {
      const { answer } = await askProposal(leadId, q);
      setTurns((t) => [...t, { q, a: answer }]);
      setQuestion('');
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally { setBusy(false); }
  };

  return (
    <div data-testid={testId} className="mt-3 rounded-[10px] border border-[#E7E3DC] bg-white">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#E7E3DC]">
        <Sparkles size={14} className="text-[#EA5400]" />
        <span className="text-[12px] font-semibold text-[#3A3530] uppercase tracking-wide">Ask about this proposal</span>
      </div>

      {turns.length > 0 && (
        <ul className="max-h-[220px] space-y-2.5 overflow-y-auto px-3 py-2.5" data-testid={`${testId}-thread`}>
          {turns.map((t, i) => (
            <li key={i} className="space-y-1">
              <div className="text-[12px] font-semibold text-[#3A3530]">{t.q}</div>
              <div className="whitespace-pre-wrap rounded-md bg-[#FAF8F5] px-2.5 py-1.5 text-[12.5px] leading-relaxed text-[#4A453F]">{t.a}</div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2 p-2.5">
        <textarea
          data-testid={`${testId}-input`}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(); } }}
          placeholder="e.g. Why is the budget this much? Why 3 phases? / বাজেট এত কেন?"
          rows={1}
          className="min-h-[36px] flex-1 resize-y rounded-md border border-[#E8E6E3] bg-[#FAF9F8] px-2.5 py-1.5 text-[12.5px] leading-relaxed outline-none focus:border-[#EA5400] focus:bg-white"
        />
        <button
          type="button"
          data-testid={`${testId}-send`}
          onClick={ask}
          disabled={busy || !question.trim()}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#EA5400] text-white hover:bg-[#CC4900] disabled:opacity-50"
          aria-label="Ask"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>
      {err && <p className="px-3 pb-2 text-[11px] text-[#B42318]" data-testid={`${testId}-error`}>{err}</p>}
      <p className="px-3 pb-2.5 text-[11px] text-[#9A948E]">Answers explain the saved plan &amp; budget — read-only, nothing is regenerated.</p>
    </div>
  );
}

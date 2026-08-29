import { useEffect, useState } from 'react';
import { MessageSquarePlus, Check, Trash2, Loader2, Send } from 'lucide-react';
import type { ClientFeedback } from '~/types/leadDetail';
import { listFeedback, addFeedback, deleteFeedback } from '~/services/httpServices/leadDetailService';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';

/**
 * Client feedback capture + list (P5). Each open item is applied with TOP priority on the next proposal
 * regeneration (it is the client's own direction), then marked "applied" for the audit trail. Self-contained:
 * loads its own list and refreshes after add/delete.
 */
interface ClientFeedbackPanelProps {
  leadId: string;
  disabled?: boolean;
}

export function ClientFeedbackPanel({ leadId, disabled }: ClientFeedbackPanelProps) {
  const [items, setItems] = useState<ClientFeedback[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const reload = () => {
    listFeedback(leadId).then(setItems).catch(() => {});
  };
  useEffect(reload, [leadId]);

  const openCount = items.filter((i) => i.status === 'open').length;

  const add = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setErr('');
    try {
      const created = await addFeedback(leadId, t);
      setItems((prev) => [created, ...prev]);
      setText('');
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (feedbackId: string) => {
    try {
      await deleteFeedback(leadId, feedbackId);
      setItems((prev) => prev.filter((i) => i.id !== feedbackId));
    } catch (e) {
      setErr(apiErrorMessage(e));
    }
  };

  return (
    <div data-testid="client-feedback-panel" className="rounded-[12px] border border-[#E7E3DC] bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquarePlus size={15} className="text-[#EA5400]" />
        <h3 className="text-[13px] font-semibold text-[#3A3530]">Client feedback</h3>
        {openCount > 0 && (
          <span className="ml-auto text-[10.5px] font-semibold text-[#EA5400] bg-[#FDEBE0] rounded-full px-2 py-0.5">
            {openCount} to apply
          </span>
        )}
      </div>
      <p className="text-[11.5px] text-[#8A857D] mb-2 leading-snug">
        Applied with top priority on the next <span className="font-medium text-[#6B6660]">Regenerate</span>.
      </p>

      {!disabled && (
        <div className="flex flex-col gap-1.5 mb-3">
          <textarea
            data-testid="client-feedback-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') add(); }}
            rows={2}
            placeholder="e.g. Client wants a dedicated UAT phase and a lower price…"
            className="w-full resize-none rounded-[8px] border border-[#E0DBD3] px-2.5 py-2 text-[12.5px] text-[#3A3530] placeholder:text-[#B4AEA5] focus:outline-none focus:border-[#EA5400]"
          />
          <button
            type="button"
            data-testid="client-feedback-add"
            onClick={add}
            disabled={busy || !text.trim()}
            className="self-end inline-flex items-center gap-1.5 rounded-[8px] bg-[#EA5400] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50 cursor-pointer hover:bg-[#D34C00]"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Add feedback
          </button>
        </div>
      )}
      {err && <p className="text-[11.5px] text-[#C0392B] mb-2">{err}</p>}

      {items.length === 0 ? (
        <p data-testid="client-feedback-empty" className="text-[12px] text-[#B4AEA5] py-1">No feedback captured yet.</p>
      ) : (
        <ul className="space-y-1.5 max-h-[220px] overflow-y-auto">
          {items.map((f) => (
            <li key={f.id} data-testid="client-feedback-item" className="flex items-start gap-2 rounded-[8px] border border-[#EFEBE4] bg-[#FAF8F5] px-2.5 py-2">
              <span
                className={`mt-0.5 shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  f.status === 'applied' ? 'bg-[#E8F0E8] text-[#4A7A4A]' : 'bg-[#FDEBE0] text-[#EA5400]'
                }`}
              >
                {f.status === 'applied' ? <><Check size={10} /> Applied</> : 'Open'}
              </span>
              <span className="flex-1 text-[12px] text-[#3A3530] leading-snug">{f.text}</span>
              {!disabled && f.status === 'open' && (
                <button
                  type="button"
                  data-testid="client-feedback-delete"
                  onClick={() => remove(f.id)}
                  aria-label="Remove feedback"
                  className="shrink-0 text-[#B4AEA5] hover:text-[#C0392B] cursor-pointer"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, XCircle } from 'lucide-react';
import { LossReason, LOSS_REASON_LABEL } from '~/enums/lead.enum';

interface MarkLostModalProps {
  /** Lead title, shown so the user can confirm they are closing the right lead. */
  leadTitle: string;
  /** Resolves once the lead is marked lost; the modal stays open (and busy) until it settles. */
  onConfirm: (reason: LossReason, note?: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Closing a lead as lost is irreversible, so the reason is captured against the
 * LossReason enum the backend validates — never free text.
 */
export function MarkLostModal({ leadTitle, onConfirm, onCancel }: MarkLostModalProps) {
  const [reason, setReason] = useState<LossReason | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const noteRequired = reason === LossReason.OTHER;
  const canSubmit = !!reason && (!noteRequired || note.trim().length > 0);

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setErr('');
    try {
      await onConfirm(reason as LossReason, note.trim() || undefined);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not mark this lead lost.');
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="lead-lost-modal"
      className="fixed inset-0 z-[130] grid place-items-center bg-black/40 p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-lost-title"
        className="w-full max-w-[460px] rounded-xl border border-[#E8E6E3] bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div id="lead-lost-title" className="mb-1 flex items-center gap-2 text-[15px] font-semibold">
          <AlertTriangle size={17} className="text-[#B42318]" /> Mark this lead as lost?
        </div>
        <p className="text-[13px] leading-relaxed text-[#6B6660]">
          “{leadTitle}” will be closed and moved out of the active pipeline. The reason feeds the loss
          breakdown on the Overview dashboard.
        </p>

        <label htmlFor="lead-lost-reason" className="mt-4 mb-1.5 block text-[13px] font-medium">
          Why was it lost? <span className="text-[#B42318]">*</span>
        </label>
        <select
          id="lead-lost-reason"
          data-testid="lead-lost-reason"
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value as LossReason)}
          className="h-9 w-full cursor-pointer rounded-md border border-[#D4D1CC] bg-white px-2.5 text-sm outline-none focus:border-[#EA5400] disabled:opacity-50"
        >
          <option value="" disabled>Select a reason…</option>
          {Object.values(LossReason).map((r) => (
            <option key={r} value={r}>{LOSS_REASON_LABEL[r]}</option>
          ))}
        </select>

        <label htmlFor="lead-lost-note" className="mt-3.5 mb-1.5 block text-[13px] font-medium">
          Note {noteRequired ? <span className="text-[#B42318]">*</span> : <span className="font-normal text-[#6B6660]">(optional)</span>}
        </label>
        <textarea
          id="lead-lost-note"
          data-testid="lead-lost-note"
          rows={3}
          value={note}
          disabled={busy}
          placeholder={noteRequired ? 'Tell the team what happened.' : 'Anything the team should know for next time.'}
          onChange={(e) => setNote(e.target.value)}
          className="w-full resize-none rounded-md border border-[#D4D1CC] px-2.5 py-2 text-sm outline-none placeholder:text-[#9A968F] focus:border-[#EA5400] disabled:opacity-50"
        />

        {err && <p data-testid="lead-lost-error" className="mt-2 text-[13px] text-[#B42318]">{err}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            data-testid="lead-lost-cancel"
            disabled={busy}
            onClick={onCancel}
            className="h-9 cursor-pointer rounded-md border border-[#D4D1CC] px-4 text-sm font-medium hover:bg-[#F4F4F2] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="lead-lost-confirm"
            disabled={!canSubmit || busy}
            onClick={() => void submit()}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-[#B42318] px-4 text-sm font-medium text-white hover:bg-[#912018] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Mark lost
          </button>
        </div>
      </div>
    </div>
  );
}

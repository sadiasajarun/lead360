/**
 * ReadinessPanel — requirement-readiness score + the typed clarification questions.
 *
 * Shared by the new-lead wizard (step 4) and the lead detail page's Requirement tab, so a rep can come
 * back to a lead AFTER it was generated, upload the client's filled questionnaire, and regenerate from
 * the updated answers. Data-driven from GET /leads/:id/readiness.
 */
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  FlaskConical, Download, Upload, Loader2, CircleCheck, HelpCircle, Copy, Check, UploadCloud, FileText, RefreshCw,
} from 'lucide-react';
import {
  resolveQuery, answerQueryWithFile, importQuestionnaire, regenerateReadiness,
} from '~/services/httpServices/leadDetailService';
import type { ClientQuery, Readiness } from '~/services/httpServices/leadDetailService';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
const ACCEPT = '.pdf,.doc,.docx,.xlsx,.pptx,.txt,.md';

/** Readiness score + gauge + AI-generated, typed client queries. */
export function ReadinessPanel({
  leadId,
  readiness,
  onChange,
  showRegenerate = false,
}: {
  leadId: string;
  readiness: Readiness;
  onChange: (r: Readiness) => void;
  /** Show "Refresh questions" — used on the lead detail page when the brief changed after generation. */
  showRegenerate?: boolean;
}) {
  const { score, queries } = readiness;
  const ready = score >= 80;
  const confirmed = queries.filter((q) => q.status === 'confirmed').length;
  const qFileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setImporting(true); setImportMsg('');
    try {
      const r = await importQuestionnaire(leadId, f);
      onChange({ score: r.score, queries: r.queries });
      setImportMsg(r.applied ? `Imported ${r.applied} answer${r.applied === 1 ? '' : 's'} from the document.` : 'No answers were detected in that file.');
    } catch (err) { setImportMsg(apiErrorMessage(err)); } finally { setImporting(false); }
  };
  const refresh = async () => {
    setRefreshing(true); setImportMsg('');
    try { onChange(await regenerateReadiness(leadId)); } catch (err) { setImportMsg(apiErrorMessage(err)); } finally { setRefreshing(false); }
  };

  return (
    <div>
      <div className="rounded-xl border border-[#E8E6E3] bg-white p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-end gap-1"><span className="text-[40px] font-bold leading-none">{score}</span><span className="mb-1 text-sm text-[#9A948E]">/ 100</span></div>
            <span className={`mt-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[13px] font-medium ${ready ? 'border-[#BFE3D4] bg-[#ECF7F2] text-[#0E7C5A]' : 'border-[#F3E2C8] bg-[#FDF6EA] text-[#B7791F]'}`}><FlaskConical size={14} /> {ready ? 'Ready to generate' : 'Below threshold'}</span>
          </div>
          <div className="text-right"><div className="text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">Readiness</div><div className="text-xs text-[#9A948E]">Recommended: 80+</div></div>
        </div>
        <div className="mt-5">
          <div className="relative h-2 w-full rounded-full bg-gradient-to-r from-[#F2C4B8] via-[#F3E2C8] to-[#BFE3D4]">
            <div className="absolute top-[-3px] h-[14px] w-[2px] rounded bg-[#0F0F0F]" style={{ left: `${Math.min(100, Math.max(0, score))}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] font-medium"><span className="text-[#B42318]">AT RISK</span><span className="text-[#9A948E]">60</span><span className="text-[#B7791F]">FAIR</span><span className="text-[#0E7C5A]">READY</span></div>
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">Clarifying questions</span>
          <span className="text-xs text-[#9A948E]">{queries.length ? `${confirmed} of ${queries.length} answered` : '0 open'}</span>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {queries.length > 0 && (
            <>
              <a
                data-testid="readiness-download-questionnaire"
                href={`${API_BASE}/leads/${leadId}/readiness/questionnaire.docx`}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[#D4D1CC] bg-white px-3 text-[13px] font-medium text-[#3A3632] hover:bg-[#F4F4F2]"
              >
                <Download size={14} /> Download as Word
              </a>
              <button
                type="button"
                data-testid="readiness-upload-questionnaire"
                onClick={() => qFileRef.current?.click()}
                disabled={importing}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[#D4D1CC] bg-white px-3 text-[13px] font-medium text-[#3A3632] hover:bg-[#F4F4F2] disabled:opacity-60"
              >
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload filled .docx
              </button>
              <input ref={qFileRef} type="file" accept=".docx" className="hidden" onChange={onImport} data-testid="readiness-questionnaire-file" />
            </>
          )}
          {showRegenerate && (
            <button
              type="button"
              data-testid="readiness-refresh-questions"
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[#D4D1CC] bg-white px-3 text-[13px] font-medium text-[#3A3632] hover:bg-[#F4F4F2] disabled:opacity-60"
            >
              {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh questions
            </button>
          )}
          {importMsg && <span className="text-xs text-[#6B6660]">{importMsg}</span>}
        </div>
        {queries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#D4D1CC] p-6 text-center text-sm text-[#6B6660]">No open questions — the brief looks complete enough to generate.</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {queries.map((q) => <QueryRow key={q.id} leadId={leadId} query={q} onChange={onChange} />)}
          </div>
        )}
      </div>
    </div>
  );
}

const KIND_LABEL: Record<ClientQuery['kind'], string> = { single: 'Choose one', multi: 'Choose any', text: 'Short answer', upload: 'Upload a file' };

/** A single typed clarifying question — radio / checkbox / text / file, plus Copy-to-send. */
function QueryRow({ leadId, query, onChange }: { leadId: string; query: ClientQuery; onChange: (r: Readiness) => void }) {
  const [text, setText] = useState(query.answer ?? '');
  const [multi, setMulti] = useState<string[]>(query.answers ?? []);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmed = query.status === 'confirmed';
  const fileRef = useRef<HTMLInputElement>(null);

  const copy = async () => {
    try { await navigator.clipboard.writeText(query.question); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  };
  const confirm = async () => {
    setBusy(true);
    try {
      const patch = query.kind === 'multi'
        ? { status: 'confirmed' as const, answers: multi }
        : { status: 'confirmed' as const, answer: text.trim() || undefined };
      onChange(await resolveQuery(leadId, query.id, patch));
    } finally { setBusy(false); }
  };
  const reopen = async () => { setBusy(true); try { onChange(await resolveQuery(leadId, query.id, { status: 'open' })); } finally { setBusy(false); } };
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setBusy(true);
    try { onChange(await answerQueryWithFile(leadId, query.id, f)); } catch { /* surfaced by score not moving */ } finally { setBusy(false); }
  };
  const toggle = (opt: string) => setMulti((m) => (m.includes(opt) ? m.filter((x) => x !== opt) : [...m, opt]));

  const canConfirm = query.kind === 'multi' ? multi.length > 0 : text.trim().length > 0;

  return (
    <div data-testid={`query-${query.id}`} className={`rounded-lg border p-4 ${confirmed ? 'border-[#BFE3D4] bg-[#F4FBF8]' : 'border-[#E8E6E3] bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {confirmed ? <CircleCheck size={18} className="mt-0.5 shrink-0 text-[#0E7C5A]" /> : <HelpCircle size={18} className="mt-0.5 shrink-0 text-[#B7791F]" />}
          <div>
            <div className="text-[14px] font-semibold text-[#0F0F0F]">{query.question}</div>
            {query.why && <div className="mt-0.5 text-[13px] text-[#6B6660]">{query.why}</div>}
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-[#E8E6E3] bg-[#F9F8F7] px-2 py-0.5 text-[11px] font-medium text-[#9A948E]">{KIND_LABEL[query.kind]}</span>
      </div>

      {/* Answer control by kind */}
      <div className="mt-3">
        {query.kind === 'single' && (
          <div className="flex flex-col gap-1.5" data-testid={`query-options-${query.id}`}>
            {(query.options ?? []).map((opt) => (
              <label key={opt} className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-[13px] ${text === opt ? 'border-[#EA5400] bg-[#FEF6F1]' : 'border-[#E8E6E3] bg-white hover:border-[#D4D1CC]'}`}>
                <input type="radio" name={`q-${query.id}`} checked={text === opt} onChange={() => setText(opt)} className="accent-[#EA5400]" />
                {opt}
              </label>
            ))}
          </div>
        )}
        {query.kind === 'multi' && (
          <div className="flex flex-col gap-1.5" data-testid={`query-options-${query.id}`}>
            {(query.options ?? []).map((opt) => (
              <label key={opt} className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-[13px] ${multi.includes(opt) ? 'border-[#EA5400] bg-[#FEF6F1]' : 'border-[#E8E6E3] bg-white hover:border-[#D4D1CC]'}`}>
                <input type="checkbox" checked={multi.includes(opt)} onChange={() => toggle(opt)} className="accent-[#EA5400]" />
                {opt}
              </label>
            ))}
          </div>
        )}
        {query.kind === 'text' && (
          <input data-testid={`query-answer-${query.id}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type the client's answer…"
            className="h-9 w-full rounded-md border border-[#D4D1CC] px-3 text-[13px] outline-none focus:border-[#EA5400]" />
        )}
        {query.kind === 'upload' && (
          <div className="flex items-center gap-2.5">
            <button type="button" data-testid={`query-upload-${query.id}`} disabled={busy} onClick={() => fileRef.current?.click()} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[#D4D1CC] bg-white px-3 text-[13px] font-medium hover:bg-[#F4F4F2] disabled:opacity-50">
              <UploadCloud size={15} /> {query.attachmentKey ? 'Replace file' : 'Upload file'}
            </button>
            {query.answer && <span className="flex items-center gap-1.5 text-[13px] text-[#0E7C5A]"><FileText size={14} /> {query.answer}</span>}
            <input ref={fileRef} type="file" accept={ACCEPT} onChange={onFile} className="hidden" />
          </div>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button type="button" data-testid={`query-copy-${query.id}`} onClick={copy} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[#D4D1CC] bg-white px-2.5 text-[13px] font-medium hover:bg-[#F4F4F2]">
          <Copy size={13} /> {copied ? 'Copied' : 'Copy to send'}
        </button>
        {confirmed ? (
          <button type="button" data-testid={`query-reopen-${query.id}`} disabled={busy} onClick={reopen} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-[#6B6660] hover:bg-[#F4F4F2] disabled:opacity-50">
            Reopen
          </button>
        ) : query.kind !== 'upload' ? (
          <button type="button" data-testid={`query-confirm-${query.id}`} disabled={busy || !canConfirm} onClick={confirm} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-[#0E7C5A] px-2.5 text-[13px] font-medium text-white hover:bg-[#0B6448] disabled:opacity-50">
            <Check size={13} /> Mark answered
          </button>
        ) : null}
      </div>
    </div>
  );
}

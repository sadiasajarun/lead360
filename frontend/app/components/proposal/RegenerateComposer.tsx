import { useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { Paperclip, Figma, Cloud, RefreshCw, Loader2, X, FileText, CircleCheck } from 'lucide-react';
import { uploadBriefAttachment, addFeedback } from '~/services/httpServices/leadDetailService';
import { REGEN_COMMANDS } from '~/components/proposal/regen-commands';
import type { LeadTokenUsage } from '~/types/generation';

const ACCEPT = '.pdf,.doc,.docx,.xlsx,.pptx,.txt,.md';
type Attached = { name: string; status: 'uploading' | 'parsed' | 'stored' };

// The "/…" token immediately before the caret (starts the line or follows whitespace) — powers the command menu.
function slashToken(value: string, caret: number): { start: number; query: string } | null {
  let k = caret;
  while (k > 0 && /[a-zA-Z0-9-]/.test(value[k - 1])) k--;
  if (k > 0 && value[k - 1] === '/') {
    const slashPos = k - 1;
    if (slashPos === 0 || /\s/.test(value[slashPos - 1])) return { start: slashPos, query: value.slice(k, caret) };
  }
  return null;
}

// Compact token / cost formatting for the per-lead usage line.
const fmtTokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const fmtUsd = (n: number) => `$${n >= 1 ? n.toFixed(2) : n.toFixed(4)}`;
const KIND_LABEL: Record<string, string> = { proposal: 'proposal', budget: 'budget', brief: 'sales brief', pitch: 'pitch', section: 'section' };

/**
 * RegenerateComposer — a prompt-writing surface for re-running generation. The rep types a change,
 * and can attach reference files (brief addenda, updated scope, decks) that are parsed into the brief
 * before regeneration. Figma / Google Drive import are shown as affordances but require the workspace
 * connectors to be authorized first (Settings → Connections).
 */
export function RegenerateComposer({
  leadId,
  busy,
  onRegenerate,
  onAttached,
  usage,
}: {
  leadId: string;
  busy: boolean;
  onRegenerate: (prompt: string) => Promise<void> | void;
  onAttached?: () => void; // let the parent refresh readiness/brief after an attach
  usage?: LeadTokenUsage | null; // all-in AI token usage for THIS lead (refreshed by the parent after each run)
}) {
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<Attached[]>([]);
  const [note, setNote] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // "/" command palette (Workstream B): open when a slash token sits before the caret.
  const [slash, setSlash] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const matches = slash
    ? REGEN_COMMANDS.filter((c) => c.cmd.slice(1).includes(slash.query.toLowerCase()) || c.label.toLowerCase().includes(slash.query.toLowerCase()))
    : [];

  const onPromptChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setPrompt(v);
    const tok = slashToken(v, e.target.selectionStart ?? v.length);
    setSlash(tok);
    setActive(0);
  };

  const insertCommand = (cmd: string) => {
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? prompt.length;
    const start = slash?.start ?? caret;
    const next = `${prompt.slice(0, start)}${cmd} ${prompt.slice(caret)}`;
    setPrompt(next);
    setSlash(null);
    const pos = start + cmd.length + 1;
    setTimeout(() => { ta?.focus(); ta?.setSelectionRange(pos, pos); }, 0);
  };

  const onPromptKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!slash || !matches.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % matches.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + matches.length) % matches.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertCommand(matches[active].cmd); }
    else if (e.key === 'Escape') { e.preventDefault(); setSlash(null); }
  };

  const attach = async (picked: File[]) => {
    setNote('');
    for (const file of picked) {
      const entry: Attached = { name: file.name, status: 'uploading' };
      setFiles((p) => [...p, entry]);
      try {
        const res = await uploadBriefAttachment(leadId, file);
        setFiles((p) => p.map((x) => (x === entry ? { ...x, status: res.parsed ? 'parsed' : 'stored' } : x)));
      } catch {
        setFiles((p) => p.map((x) => (x === entry ? { ...x, status: 'stored' } : x)));
      }
    }
    onAttached?.();
  };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => { attach(Array.from(e.target.files ?? [])); e.target.value = ''; };

  const submit = async () => {
    const text = prompt.trim();
    // "/client-feedback …" → store as the client's own direction (highest priority on the next regeneration),
    // not an immediate re-draft. Everything else re-drafts the proposal (the backend router splits it).
    const fb = text.match(/^\/client-feedback\b[:\s]*(.*)$/is);
    if (fb) {
      const body = fb[1].trim();
      if (!body) { setNote('Add the feedback after /client-feedback.'); return; }
      try {
        await addFeedback(leadId, body);
        setPrompt(''); setSlash(null);
        setNote('Saved as client feedback — it will be applied with top priority on the next regeneration.');
      } catch { setNote('Could not save the feedback — try again.'); }
      return;
    }
    setNote('');
    await onRegenerate(text);
    setPrompt('');
    setFiles([]);
    setSlash(null);
  };

  const chipBtn = 'inline-flex items-center gap-1.5 rounded-md border border-[#D4D1CC] bg-white px-2.5 h-8 text-[13px] font-medium hover:bg-[#F4F4F2]';

  return (
    <div className="mt-4 rounded-xl border border-[#E8E6E3] bg-white p-3" data-testid="regen-composer">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">Regenerate proposal</span>
        <span className="text-[11px] text-[#9A948E]">Type <kbd className="rounded border border-[#D4D1CC] bg-[#F4F4F2] px-1 font-mono">/</kbd> for commands · English or বাংলা</span>
      </div>
      <div className="relative">
        <textarea
          ref={taRef}
          data-testid="regen-prompt"
          value={prompt}
          onChange={onPromptChange}
          onKeyDown={onPromptKeyDown}
          placeholder="Describe a change — e.g. 'tighten the exec summary, add a phased rollout, and reflect the updated scope'. Type / to target a section…"
          className="min-h-[84px] w-full resize-y rounded-md border border-[#E8E6E3] bg-[#FAF9F8] px-3 py-2.5 text-[13px] leading-relaxed outline-none focus:border-[#EA5400] focus:bg-white"
        />
        {slash && matches.length > 0 && (
          <div data-testid="regen-slash-menu" className="absolute left-2 top-full z-30 mt-1 max-h-64 w-[320px] overflow-auto rounded-md border border-[#D4D1CC] bg-white text-[13px] shadow-xl">
            {matches.map((c, i) => (
              <button
                key={c.cmd}
                type="button"
                data-testid={`regen-slash-${c.cmd.slice(1)}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); insertCommand(c.cmd); }}
                className={`flex w-full items-start gap-2 px-3 py-1.5 text-left ${i === active ? 'bg-[#FDF0E9]' : 'hover:bg-[#F7F6F4]'}`}
              >
                <span className="mt-0.5 shrink-0 font-mono text-[12px] font-semibold text-[#EA5400]">{c.cmd}</span>
                <span className="min-w-0"><span className="font-medium text-[#0F0F0F]">{c.label}</span><span className="block truncate text-[11px] text-[#9A948E]">{c.hint}</span></span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* All-in AI token usage for THIS lead — proposal + budget + brief + pitch + every regeneration. */}
      {usage && usage.runs > 0 && (
        <p data-testid="regen-usage" className="mt-2 text-[11px] leading-relaxed text-[#6B6660]">
          <span className="font-semibold text-[#0F0F0F]">AI usage for this lead:</span>{' '}
          <span title={`${usage.tokens.toLocaleString()} tokens (in ${usage.tokensIn.toLocaleString()} / out ${usage.tokensOut.toLocaleString()})`} className="tabular-nums">
            {fmtTokens(usage.tokens)} tokens
          </span>{' '}
          · <span className="font-medium text-[#EA5400]">{fmtUsd(usage.costUsd)}</span>{' '}
          · {usage.runs} run{usage.runs === 1 ? '' : 's'}
          {usage.byKind.length > 0 && (
            <span className="text-[#9A948E]">
              {' '}({usage.byKind.map((k) => `${KIND_LABEL[k.kind] ?? k.kind} ×${k.runs}`).join(', ')})
            </span>
          )}
        </p>
      )}

      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2" data-testid="regen-attachments">
          {files.map((f, i) => (
            <span key={f.name + i} className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E6E3] bg-[#F9F8F7] px-2.5 py-1 text-xs">
              <FileText size={12} className="text-[#EA5400]" />
              <span className="max-w-[160px] truncate">{f.name}</span>
              {f.status === 'uploading' && <Loader2 size={12} className="animate-spin text-[#9A948E]" />}
              {f.status === 'parsed' && <CircleCheck size={12} className="text-[#0E7C5A]" />}
              {f.status === 'stored' && <span className="text-[#B7791F]">stored</span>}
              <button type="button" onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))} className="text-[#9A948E] hover:text-[#0F0F0F]"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-[#F0EEEB] pt-2.5">
        <button type="button" data-testid="regen-attach" onClick={() => fileInput.current?.click()} className={chipBtn}>
          <Paperclip size={14} /> Attach file
        </button>
        <button type="button" data-testid="regen-figma" disabled title="Connect Figma in Settings → Connections" className={`${chipBtn} opacity-55`}>
          <Figma size={14} /> Figma <span className="text-[11px] text-[#9A948E]">soon</span>
        </button>
        <button type="button" data-testid="regen-drive" disabled title="Connect Google Drive in Settings → Connections" className={`${chipBtn} opacity-55`}>
          <Cloud size={14} /> Google Drive <span className="text-[11px] text-[#9A948E]">soon</span>
        </button>
        <input ref={fileInput} type="file" accept={ACCEPT} multiple onChange={onPick} className="hidden" data-testid="regen-file-input" />

        <button
          type="button"
          data-testid="regen-submit"
          onClick={submit}
          disabled={busy}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md bg-[#EA5400] px-3.5 text-sm font-medium text-white hover:bg-[#CC4900] disabled:opacity-50"
        >
          {busy ? <><Loader2 size={15} className="animate-spin" /> Regenerating…</> : <><RefreshCw size={15} /> Regenerate</>}
        </button>
      </div>
      {note && <p className="mt-2 text-[11px] text-[#6B6660]">{note}</p>}
      <p className="mt-2 text-[11px] text-[#9A948E]">A mixed request is split per section and applied in place — untouched sections stay as they are. Instructions can be in English or বাংলা. Type <span className="font-mono">/</span> to target a section, budget, or file client feedback.</p>
    </div>
  );
}

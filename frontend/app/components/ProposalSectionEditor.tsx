import { useState } from 'react';
import { Plus, Trash2, Save, X, Loader2 } from 'lucide-react';

// Inline editor for one proposal section. Preserves the section's shape:
//  - array of row objects  -> editable table (each cell), add/remove rows
//  - array of strings      -> editable bullet points, add/remove points
//  - string                -> textarea
const isObjArr = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.length > 0 && v.every((x) => x != null && typeof x === 'object' && !Array.isArray(x));
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const humanize = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();

const inputCls =
  'w-full rounded-md border border-[#EAE4DE] bg-white px-2.5 py-2 text-[13px] leading-[1.5] outline-none focus:border-[#EA5400]';

export function ProposalSectionEditor({
  value,
  onSave,
  onCancel,
}: {
  value: unknown;
  onSave: (v: unknown) => Promise<void>;
  onCancel: () => void;
}) {
  // Local working copy, typed by shape.
  const [rows, setRows] = useState<Record<string, string>[]>(
    isObjArr(value) ? value.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')]))) : [],
  );
  const [points, setPoints] = useState<string[]>(isStrArr(value) && !isObjArr(value) ? [...value] : []);
  const [text, setText] = useState<string>(typeof value === 'string' ? value : '');
  const [busy, setBusy] = useState(false);

  const cols = isObjArr(value)
    ? Array.from(value.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set<string>()))
    : [];

  const save = async () => {
    setBusy(true);
    try {
      const next: unknown = isObjArr(value) ? rows : isStrArr(value) ? points.filter((p) => p.trim()) : text;
      await onSave(next);
    } finally {
      setBusy(false);
    }
  };

  const actions = (
    <div className="mt-3 flex items-center gap-2">
      <button data-testid="section-save" onClick={save} disabled={busy}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#EA5400] px-3.5 text-[13px] font-medium text-white hover:bg-[#CC4900] disabled:opacity-50">
        {busy ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save section</>}
      </button>
      <button data-testid="section-cancel" onClick={onCancel} disabled={busy}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#EAE4DE] bg-white px-3 text-[13px] font-medium text-[#6B6660] hover:bg-[#FBF7F3]">
        <X size={14} /> Cancel
      </button>
    </div>
  );

  // ---- table of rows ----
  if (isObjArr(value)) {
    return (
      <div data-testid="section-editor-rows" className="rounded-xl border border-[#EAE4DE] bg-[#FBF7F3] p-3">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {cols.map((c) => <th key={c} className="px-1 pb-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">{humanize(c)}</th>)}
                <th className="w-9" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c} className="px-1 pb-2 align-top">
                      <textarea data-testid={`cell-${i}-${c}`} value={row[c] ?? ''} rows={2}
                        onChange={(e) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [c]: e.target.value } : r)))}
                        className={inputCls} />
                    </td>
                  ))}
                  <td className="px-1 pb-2 align-top">
                    <button data-testid={`row-del-${i}`} title="Delete row" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                      className="mt-1.5 text-[#9A948E] hover:text-[#B42318]"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button data-testid="row-add" onClick={() => setRows((rs) => [...rs, Object.fromEntries(cols.map((c) => [c, '']))])}
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#EA5400]"><Plus size={14} /> Add row</button>
        {actions}
      </div>
    );
  }

  // ---- bullet points ----
  if (isStrArr(value)) {
    return (
      <div data-testid="section-editor-points" className="rounded-xl border border-[#EAE4DE] bg-[#FBF7F3] p-3">
        <div className="flex flex-col gap-2">
          {points.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[#EA5400]" />
              <textarea data-testid={`point-${i}`} value={p} rows={2}
                onChange={(e) => setPoints((ps) => ps.map((x, idx) => (idx === i ? e.target.value : x)))}
                className={inputCls} />
              <button data-testid={`point-del-${i}`} title="Delete point" onClick={() => setPoints((ps) => ps.filter((_, idx) => idx !== i))}
                className="mt-2 text-[#9A948E] hover:text-[#B42318]"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <button data-testid="point-add" onClick={() => setPoints((ps) => [...ps, ''])}
          className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-[#EA5400]"><Plus size={14} /> Add point</button>
        {actions}
      </div>
    );
  }

  // ---- prose ----
  return (
    <div data-testid="section-editor-text" className="rounded-xl border border-[#EAE4DE] bg-[#FBF7F3] p-3">
      <textarea data-testid="section-text" value={text} onChange={(e) => setText(e.target.value)} rows={7} className={inputCls} />
      {actions}
    </div>
  );
}

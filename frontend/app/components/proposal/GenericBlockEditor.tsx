/**
 * GenericBlockEditor — edit EVERY field of ANY block, without a bespoke form per type.
 *
 * It reflects over the block's own data (strings, numbers, booleans, string lists, and arbitrarily
 * nested arrays/objects) and renders the right input for each, so a sales/PM user can edit anything on
 * the proposal in place. Saving sends the edited shape back through `onSaveBlock(blockId, patch)`; the
 * backend merges it (id/type are never overwritten). Internal-only — never shown in /present or the PDF.
 */
import { useState } from 'react';
import { Check, X, Plus, Trash2 } from 'lucide-react';
import type { Block } from '~/types/proposal';

// Fields that are rendered artifacts or identity, not user-editable text.
const SKIP_KEYS = new Set(['id', 'type', 'svg', 'iconMap']);

type Path = (string | number)[];

function setIn<T>(obj: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const clone: unknown = Array.isArray(obj) ? [...(obj as unknown[])] : { ...(obj as object) };
  (clone as Record<string | number, unknown>)[head] = setIn((obj as Record<string | number, unknown>)?.[head], rest, value);
  return clone as T;
}

function blankLike(v: unknown): unknown {
  if (typeof v === 'string') return '';
  if (typeof v === 'number') return 0;
  if (typeof v === 'boolean') return false;
  if (Array.isArray(v)) return v.length ? [blankLike(v[0])] : [''];
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, blankLike(val)]));
  return '';
}

const humanize = (k: string | number) =>
  String(k).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).replace(/_/g, ' ').trim();

function FieldNode({ label, value, path, set, currency }: { label: string; value: unknown; path: Path; set: (path: Path, value: unknown) => void; currency?: string }) {
  if (typeof value === 'string') {
    const long = value.length > 60 || value.includes('\n');
    return (
      <label className="pdoc-gedit-f">
        <span>{label}</span>
        {long
          ? <textarea value={value} onChange={(e) => set(path, e.target.value)} rows={Math.min(6, Math.max(2, Math.ceil(value.length / 60)))} />
          : <input value={value} onChange={(e) => set(path, e.target.value)} />}
      </label>
    );
  }
  if (typeof value === 'number') {
    // Money fields are stored in minor units (…Cents) but MUST be edited in the block's own currency
    // (BDT for local proposals, USD otherwise) — show value ÷ 100 and multiply back on change.
    const key = String(path[path.length - 1] ?? '');
    if (/cents$/i.test(key)) {
      const label2 = `${label.replace(/\s*cents$/i, '').trim() || 'Amount'}${currency ? ` (${currency})` : ''}`;
      const units = Number(value) / 100;
      return (
        <label className="pdoc-gedit-f">
          <span>{label2}</span>
          <input
            type="number"
            step="0.01"
            value={Number.isFinite(units) ? units : 0}
            onChange={(e) => set(path, e.target.value === '' ? 0 : Math.round(Number(e.target.value) * 100))}
          />
        </label>
      );
    }
    return (
      <label className="pdoc-gedit-f">
        <span>{label}</span>
        <input type="number" value={value} onChange={(e) => set(path, e.target.value === '' ? 0 : Number(e.target.value))} />
      </label>
    );
  }
  if (typeof value === 'boolean') {
    return (
      <label className="pdoc-gedit-f pdoc-gedit-bool">
        <input type="checkbox" checked={value} onChange={(e) => set(path, e.target.checked)} />
        <span>{label}</span>
      </label>
    );
  }
  if (Array.isArray(value)) {
    const add = () => set(path, [...value, value.length ? blankLike(value[0]) : '']);
    const removeAt = (i: number) => set(path, value.filter((_, j) => j !== i));
    return (
      <div className="pdoc-gedit-arr">
        <div className="pdoc-gedit-arrh"><span>{label}</span><button type="button" onClick={add} title={`Add ${label}`}><Plus size={13} /> Add</button></div>
        {value.map((item, i) => (
          <div className="pdoc-gedit-item" key={i}>
            <button type="button" className="pdoc-gedit-rm" title="Remove" onClick={() => removeAt(i)}><Trash2 size={12} /></button>
            <div className="pdoc-gedit-itembody">
              <FieldNode label={`${label.replace(/s$/, '')} ${i + 1}`} value={item} path={[...path, i]} set={set} currency={currency} />
            </div>
          </div>
        ))}
        {value.length === 0 ? <p className="pdoc-gedit-empty">None yet — “Add” to create one.</p> : null}
      </div>
    );
  }
  if (value && typeof value === 'object') {
    return (
      <div className="pdoc-gedit-obj">
        {label ? <div className="pdoc-gedit-objlab">{label}</div> : null}
        {Object.entries(value as Record<string, unknown>)
          .filter(([k]) => !SKIP_KEYS.has(k))
          .map(([k, v]) => <FieldNode key={k} label={humanize(k)} value={v} path={[...path, k]} set={set} currency={currency} />)}
      </div>
    );
  }
  return null;
}

export function GenericBlockEditor({ block, onSave, onClose }: { block: Block; onSave: (patch: Record<string, unknown>) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() => JSON.parse(JSON.stringify(block)) as Record<string, unknown>);
  const [saving, setSaving] = useState(false);
  const set = (path: Path, value: unknown) => setDraft((d) => setIn(d, path, value));

  const save = async () => {
    setSaving(true);
    try {
      const { id: _i, type: _t, ...patch } = draft; // id/type stripped (server protects them anyway)
      void _i; void _t;
      await onSave(patch);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const fields = Object.entries(draft).filter(([k]) => !SKIP_KEYS.has(k));
  // The block's own currency drives how money (…Cents) fields are labelled + edited (BDT / USD / …).
  const currency = typeof draft.currency === 'string' ? draft.currency : undefined;
  return (
    <div className="pdoc-gedit" contentEditable={false} data-testid={`block-edit-panel-${block.id}`}>
      <div className="pdoc-gedit-head">
        <span>Edit section <em>— {humanize(block.type)}</em></span>
        <button type="button" onClick={onClose} aria-label="Close"><X size={14} /></button>
      </div>
      <div className="pdoc-gedit-body">
        {fields.map(([k, v]) => <FieldNode key={k} label={humanize(k)} value={v} path={[k]} set={set} currency={currency} />)}
      </div>
      <div className="pdoc-gedit-foot">
        <button type="button" className="save" disabled={saving} onClick={save} data-testid={`block-edit-save-${block.id}`}><Check size={14} /> {saving ? 'Saving…' : 'Save changes'}</button>
        <button type="button" className="cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

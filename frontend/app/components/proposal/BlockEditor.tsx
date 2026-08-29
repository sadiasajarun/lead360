import { useEffect, useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, Trash2, Plus, Pencil, Check, X, GripVertical } from 'lucide-react';
import {
  fetchBlockPalette, reorderBlocks, insertBlock, updateBlock, changeBlockType, deleteBlock,
} from '~/services/httpServices/leadDetailService';
import type { PaletteEntry } from '~/services/httpServices/leadDetailService';
import type { Block, ProposalDocument } from '~/types/proposal';

/**
 * BlockEditor — structural editing for a block-based proposal. The locked design never changes; this
 * reorders (drag-and-drop or arrows), adds (palette popover), retypes, removes, and edits blocks.
 * Every action calls the backend and refreshes the stored document via `onChanged`.
 */
export function BlockEditor({ leadId, doc, onChanged }: { leadId: string; doc: ProposalDocument; onChanged: () => Promise<void> | void }) {
  const [palette, setPalette] = useState<PaletteEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  useEffect(() => { fetchBlockPalette(leadId).then(setPalette).catch(() => undefined); }, [leadId]);
  const label = useMemo(() => {
    const m = new Map(palette.map((p) => [p.type, p.label]));
    return (t: string) => m.get(t) ?? t;
  }, [palette]);

  const blocks = doc.blocks;
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await onChanged(); } finally { setBusy(false); }
  };
  const reorderTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const order = blocks.map((b) => b.id);
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    run(() => reorderBlocks(leadId, order));
  };
  const move = (i: number, dir: -1 | 1) => reorderTo(i, i + dir);
  const onDrop = (to: number) => {
    const from = dragIdx;
    setDragIdx(null); setOverIdx(null);
    if (from !== null) reorderTo(from, to);
  };

  const rowCls = 'flex items-center gap-2 rounded-md border bg-white px-2.5 py-2 transition-colors';
  const iconBtn = 'grid h-7 w-7 place-items-center rounded-md border border-[#D4D1CC] bg-white text-[#6B6660] hover:bg-[#F4F4F2] disabled:opacity-40';
  const selCls = 'h-7 rounded-md border border-[#D4D1CC] bg-white px-1.5 text-xs outline-none focus:border-[#EA5400]';

  return (
    <div data-testid="block-editor" className="mb-4 rounded-xl border border-[#E8E6E3] bg-[#FAF9F8] p-4">
      <div className="mb-3 text-[13px] text-[#6B6660]">Edit layout — drag to reorder (or use arrows), add, retype, or remove sections. The design stays locked.</div>
      <div className="flex flex-col gap-1.5">
        {blocks.map((b, i) => (
          <div key={b.id}>
            <div
              data-testid={`block-row-${b.id}`}
              draggable={!busy && editing !== b.id}
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => { e.preventDefault(); if (overIdx !== i) setOverIdx(i); }}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
              onDrop={(e) => { e.preventDefault(); onDrop(i); }}
              className={`${rowCls} ${overIdx === i && dragIdx !== null && dragIdx !== i ? 'border-[#EA5400] bg-[#FEF6F1]' : 'border-[#E8E6E3]'} ${dragIdx === i ? 'opacity-40' : ''}`}
            >
              <GripVertical size={15} className="shrink-0 cursor-grab text-[#B9B4AE] active:cursor-grabbing" data-testid={`block-drag-${b.id}`} />
              <div className="min-w-0 flex-1">
                <span className="text-[13px] font-semibold">{label(b.type)}</span>
                {b.heading ? <span className="ml-2 truncate text-xs text-[#9A948E]">{b.heading}</span> : null}
              </div>
              <button type="button" title="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)} className={iconBtn} data-testid={`block-up-${b.id}`}><ChevronUp size={14} /></button>
              <button type="button" title="Move down" disabled={busy || i === blocks.length - 1} onClick={() => move(i, 1)} className={iconBtn} data-testid={`block-down-${b.id}`}><ChevronDown size={14} /></button>
              <select title="Change type" disabled={busy} value={b.type} onChange={(e) => run(() => changeBlockType(leadId, b.id, e.target.value))} className={selCls} data-testid={`block-type-${b.id}`}>
                {palette.map((p) => <option key={p.type} value={p.type}>{p.label}</option>)}
              </select>
              <button type="button" title="Edit content" disabled={busy} onClick={() => setEditing(editing === b.id ? null : b.id)} className={iconBtn} data-testid={`block-edit-${b.id}`}><Pencil size={14} /></button>
              <button type="button" title="Delete" disabled={busy} onClick={() => run(() => deleteBlock(leadId, b.id))} className={`${iconBtn} hover:text-[#B42318]`} data-testid={`block-delete-${b.id}`}><Trash2 size={14} /></button>
            </div>
            {editing === b.id && <ContentEditor block={b} onSave={(patch) => run(() => updateBlock(leadId, b.id, patch)).then(() => setEditing(null)).catch(() => undefined)} onCancel={() => setEditing(null)} busy={busy} />}
            <div className="flex justify-center py-0.5">
              <AddMenu palette={palette} busy={busy} onAdd={(type) => run(() => insertBlock(leadId, type, b.id))} />
            </div>
          </div>
        ))}
      </div>
      {blocks.length === 0 && (
        <AddMenu palette={palette} busy={busy} onAdd={(type) => run(() => insertBlock(leadId, type))} label="Add first block" />
      )}
    </div>
  );
}

// Palette popover — a button menu (NOT a native <select>, whose onBlur fired before onChange, so
// "insert a block" never registered on click). Click a type to insert; click outside or Esc to close.
function AddMenu({ palette, busy, onAdd, label = '+ block' }: { palette: PaletteEntry[]; busy: boolean; onAdd: (type: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" disabled={busy} onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#D4D1CC] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#9A948E] hover:border-[#EA5400] hover:text-[#EA5400] disabled:opacity-40" data-testid="block-add">
        <Plus size={11} /> {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[40]" onClick={() => setOpen(false)} />
          <div className="absolute left-1/2 z-[41] mt-1 max-h-[260px] w-[210px] -translate-x-1/2 overflow-auto rounded-lg border border-[#E8E6E3] bg-white p-1 shadow-xl" data-testid="block-add-menu">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#9A948E]">Insert a block</div>
            {palette.map((p) => (
              <button key={p.type} type="button" disabled={busy} onClick={() => { onAdd(p.type); setOpen(false); }} className="block w-full rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-[#F4F4F2] disabled:opacity-40" data-testid={`block-add-${p.type}`}>
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Lightweight content editor: heading for every block, plus paragraph text for prose blocks.
function ContentEditor({ block, onSave, onCancel, busy }: { block: Block; onSave: (patch: Record<string, unknown>) => void; onCancel: () => void; busy: boolean }) {
  const [heading, setHeading] = useState(block.heading ?? '');
  const isProse = block.type === 'prose';
  const [text, setText] = useState(isProse ? (block as { paragraphs?: string[] }).paragraphs?.join('\n\n') ?? '' : '');

  const save = () => {
    const patch: Record<string, unknown> = { heading: heading.trim() || undefined };
    if (isProse) patch.paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    onSave(patch);
  };
  return (
    <div className="mt-1 rounded-md border border-[#E8E6E3] bg-white p-3" data-testid={`block-content-${block.id}`}>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">Heading</label>
      <input value={heading} onChange={(e) => setHeading(e.target.value)} className="mb-2 h-8 w-full rounded-md border border-[#D4D1CC] px-2.5 text-[13px] outline-none focus:border-[#EA5400]" data-testid={`block-heading-input-${block.id}`} />
      {isProse && (
        <>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">Paragraphs <span className="font-normal normal-case">(blank line between)</span></label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} className="mb-2 min-h-[90px] w-full rounded-md border border-[#D4D1CC] p-2.5 text-[13px] outline-none focus:border-[#EA5400]" data-testid={`block-paragraphs-input-${block.id}`} />
        </>
      )}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={save} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#EA5400] px-3 text-[13px] font-medium text-white hover:bg-[#CC4900] disabled:opacity-50" data-testid={`block-save-${block.id}`}><Check size={13} /> Save</button>
        <button type="button" onClick={onCancel} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#D4D1CC] bg-white px-3 text-[13px] font-medium hover:bg-[#F4F4F2]"><X size={13} /> Cancel</button>
      </div>
    </div>
  );
}

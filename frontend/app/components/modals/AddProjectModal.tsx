import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Link2, Loader2, Plus, Search, X } from 'lucide-react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { createProject, updateProject } from '~/services/httpServices/projectService';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';
import type { Project } from '~/types/project';

interface AddProjectModalProps {
  /** Canonical category options (merged from the portfolio + existing projects). */
  categoryOptions: string[];
  /** When provided, the modal edits this local project (PATCH) instead of creating a new one. */
  project?: Project;
  onClose: () => void;
  onDone: () => void;
}

/** Add/Edit-project modal matching the portfolio data shape: name, summary, tech chips (Enter to add),
 *  multi-select searchable categories (create-your-own allowed), and the live/riseuplabs link. When a
 *  `project` is passed it pre-fills and saves via PATCH — used to fill in auto-created (from locked
 *  lead) projects that arrive with only a name. */
export default function AddProjectModal({ categoryOptions, project, onClose, onDone }: AddProjectModalProps) {
  const isEdit = !!project;
  const [name, setName] = useState(project?.name ?? '');
  const [summary, setSummary] = useState(project?.summary ?? '');
  const [tech, setTech] = useState<string[]>(project?.techStack ?? []);
  const [techInput, setTechInput] = useState('');
  const [categories, setCategories] = useState<string[]>(project?.category ?? []);
  const [link, setLink] = useState(project?.link ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const addTech = (raw: string) => {
    const t = raw.trim().replace(/,+$/, '');
    if (t && !tech.some((x) => x.toLowerCase() === t.toLowerCase())) setTech([...tech, t]);
    setTechInput('');
  };
  const onTechKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTech(techInput); }
    if (e.key === 'Backspace' && !techInput && tech.length) setTech(tech.slice(0, -1));
  };

  const submit = async () => {
    if (!name.trim()) { setErr('Name is required.'); return; }
    let url = link.trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`; // backend validates a full URL
    const payload = {
      name: name.trim(),
      summary: summary.trim() || undefined,
      techStack: techInput.trim() ? [...tech, techInput.trim()] : tech, // don't lose an un-entered chip
      category: categories,
      link: url || undefined,
    };
    setBusy(true); setErr('');
    try {
      if (project) await updateProject(project.id, payload);
      else await createProject(payload);
      onDone();
    } catch (e) {
      setErr(apiErrorMessage(e));
      setBusy(false);
    }
  };

  const inputCls = 'h-10 w-full rounded-md border border-[#D4D1CC] px-3 text-sm outline-none focus:border-[#EA5400]';

  return (
    <div data-testid="add-project-modal" className="fixed inset-0 z-[130] grid place-items-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <div className="max-h-[92vh] w-full max-w-[520px] overflow-auto rounded-xl border border-[#E8E6E3] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">{isEdit ? 'Edit project' : 'Add project'}</h2>
          <button data-testid="add-project-close" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-[#9A948E] hover:bg-[#F4F4F2] hover:text-[#0F0F0F]"><X size={16} /></button>
        </div>
        <p className="mb-4 text-xs text-[#9A948E]">Part of the Riseup evidence base — the AI can cite it in future proposals.</p>

        <label className="block text-[13px] font-semibold">
          Name <span className="text-[#B42318]">*</span>
          <input data-testid="add-project-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Blitz Clone" className={`mt-1.5 font-normal ${inputCls}`} />
        </label>

        <label className="mt-3 block text-[13px] font-semibold">
          Summary
          <textarea data-testid="add-project-summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What was built, for whom, and the outcome…" className="mt-1.5 min-h-[70px] w-full rounded-md border border-[#D4D1CC] p-3 text-sm font-normal outline-none focus:border-[#EA5400]" />
        </label>

        <div className="mt-3 text-[13px] font-semibold">
          Tech stack
          <div className="mt-1.5 flex min-h-[40px] w-full flex-wrap items-center gap-1.5 rounded-md border border-[#D4D1CC] px-2 py-1.5 focus-within:border-[#EA5400]">
            {tech.map((t) => (
              <span key={t} data-testid={`add-project-tech-${t}`} className="inline-flex items-center gap-1 rounded-[5px] border border-[#D4D1CC] bg-[#F4F4F2] px-2 py-0.5 text-[12px] font-medium text-[#475467]">
                {t}
                <button onClick={() => setTech(tech.filter((x) => x !== t))} className="text-[#9A948E] hover:text-[#B42318]"><X size={11} /></button>
              </span>
            ))}
            <input
              data-testid="add-project-tech-input"
              value={techInput}
              onChange={(e) => setTechInput(e.target.value)}
              onKeyDown={onTechKey}
              onBlur={() => techInput.trim() && addTech(techInput)}
              placeholder={tech.length ? '' : 'Type and press Enter — e.g. React Native ⏎ Node.js ⏎'}
              className="h-7 min-w-[140px] flex-1 border-none text-[13px] font-normal outline-none"
            />
          </div>
        </div>

        <CategoryMultiSelect options={categoryOptions} value={categories} onChange={setCategories} />

        <label className="mt-3 block text-[13px] font-semibold">
          Link <span className="font-normal text-[#9A948E]">(live site or riseuplabs.com project page)</span>
          <div className="relative mt-1.5">
            <Link2 size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9A948E]" />
            <input data-testid="add-project-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className={`pl-9 font-normal ${inputCls}`} />
          </div>
        </label>

        {err && <p data-testid="add-project-error" className="mt-3 text-xs text-[#B42318]">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button data-testid="add-project-cancel" disabled={busy} onClick={onClose} className="h-9 rounded-md border border-[#D4D1CC] px-4 text-sm font-medium hover:bg-[#F4F4F2]">Cancel</button>
          <button data-testid="add-project-save" disabled={busy || !name.trim()} onClick={() => void submit()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#EA5400] px-4 text-sm font-medium text-white hover:bg-[#CC4900] disabled:opacity-50">
            {busy ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : isEdit ? 'Save changes' : 'Save project'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Searchable multi-select with create-new — options are the merged canonical categories. */
function CategoryMultiSelect({ options, value, onChange }: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const lowerSel = new Set(value.map((v) => v.toLowerCase()));
  const shown = options.filter((o) => !search.trim() || o.toLowerCase().includes(search.trim().toLowerCase()));
  const canCreate = search.trim()
    && !options.some((o) => o.toLowerCase() === search.trim().toLowerCase())
    && !lowerSel.has(search.trim().toLowerCase());

  const toggle = (cat: string) =>
    onChange(lowerSel.has(cat.toLowerCase()) ? value.filter((v) => v.toLowerCase() !== cat.toLowerCase()) : [...value, cat]);

  return (
    <div className="mt-3 text-[13px] font-semibold" ref={boxRef}>
      Category
      <div className="relative mt-1.5">
        <button
          type="button"
          data-testid="add-project-category-trigger"
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-[40px] w-full flex-wrap items-center gap-1.5 rounded-md border border-[#D4D1CC] px-2 py-1.5 text-left focus:border-[#EA5400]"
        >
          {value.length === 0 && <span className="px-1 text-[13px] font-normal text-[#9A948E]">Select or create categories…</span>}
          {value.map((c) => (
            <span key={c} data-testid={`add-project-cat-${c}`} className="inline-flex items-center gap-1 rounded-full border border-[#EA5400]/25 bg-[#FFF6ED] px-2 py-0.5 text-[12px] font-medium text-[#EA5400]">
              {c}
              <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); toggle(c); }} className="hover:text-[#B42318]"><X size={11} /></span>
            </span>
          ))}
          <ChevronDown size={14} className="ml-auto shrink-0 text-[#9A948E]" />
        </button>

        {open && (
          /* Opens UPWARD (bottom-full) so it never spills past the modal's lower edge. */
          <div data-testid="add-project-category-menu" className="absolute bottom-full z-[70] mb-1 w-full rounded-lg border border-[#E8E6E3] bg-white p-2 shadow-xl">
            <div className="max-h-[180px] overflow-auto">
              {canCreate && (
                <button data-testid="add-project-category-create" onClick={() => { toggle(search.trim()); setSearch(''); }} className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[12px] font-normal hover:bg-[#F4F4F2]">
                  <Plus size={12} className="text-[#EA5400]" /> Create “{search.trim()}”
                </button>
              )}
              {shown.map((o) => (
                <label key={o} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-[12px] font-normal hover:bg-[#F4F4F2]">
                  <input type="checkbox" data-testid={`add-project-category-opt-${o}`} checked={lowerSel.has(o.toLowerCase())} onChange={() => toggle(o)} className="h-3.5 w-3.5 accent-[#EA5400]" />
                  {o}
                </label>
              ))}
              {!shown.length && !canCreate && <div className="px-2 py-1.5 text-[11px] font-normal text-[#9A948E]">No match.</div>}
            </div>
            {/* Search sits at the BOTTOM: the menu opens upward, so the input stays next to the trigger. */}
            <div className="relative mt-1.5">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9A948E]" />
              <input
                data-testid="add-project-category-search"
                autoFocus
                value={search}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canCreate) { toggle(search.trim()); setSearch(''); } }}
                placeholder="Search categories…"
                className="h-8 w-full rounded-md border border-[#D4D1CC] pl-8 pr-2 text-[12px] font-normal outline-none focus:border-[#EA5400]"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

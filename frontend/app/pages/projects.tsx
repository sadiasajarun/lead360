import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  Plus, LayoutGrid, Database as DatabaseIcon, Info,
  Building2, Palette, Globe, MapPin, ClipboardList, FileSignature, Wallet,
  File as FileIcon, Eye, Download, FolderSearch, Lock, Upload, Loader2,
  Pencil, Trash2, Check, X, AlertTriangle, Search, ArrowUpDown, ChevronLeft, ChevronRight, Tag, MoreVertical,
} from 'lucide-react';
import FileTypeBadge from '~/components/atoms/FileTypeBadge';
import AddProjectModal from '~/components/modals/AddProjectModal';
import type { LucideIcon } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useAppDispatch, useAppSelector } from '~/redux/store/hooks';
import { fetchProjects, fetchPortfolio, deleteProject } from '~/services/httpServices/projectService';
import {
  getKbDocuments, uploadKbDocument, openKbFile, updateKbDocument, trashKbDocument,
} from '~/services/httpServices/kbService';
import { verifyPassword } from '~/services/httpServices/authService';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';
import { canonicalCategory, mergedCategoryOptions } from '~/utils/categoryMerge';
import type { KbDocument } from '~/types/kb';
import type { PortfolioProject, Project } from '~/types/project';

const DB_CATEGORIES = ['Agency', 'Design Portfolio', 'Global', 'Local'];

type Tab = 'portfolio' | 'database';

// riseuplabs.com portfolio-page service categories, matched against scraped data. Pills with zero
// matches are hidden so the bar never shows dead filters.
const SERVICE_PILLS: { label: string; match: (hay: string) => boolean }[] = [
  { label: 'AI', match: (h) => /(^|[^a-z])ai([^a-z]|$)|artificial|openai|machine learning/.test(h) },
  { label: 'Website', match: (h) => /website/.test(h) },
  { label: 'Mobile Apps', match: (h) => /mobile app|flutter|react native|android|ios/.test(h) },
  { label: 'Web Systems', match: (h) => /web system|web application|management system|reporting|registration|resume builder|link shortener/.test(h) },
  { label: 'eLearning', match: (h) => /elearning|e-learning|online training|education|moodle/.test(h) },
  { label: 'eCommerce', match: (h) => /ecommerce|e-commerce|woocommerce/.test(h) },
  { label: 'Games', match: (h) => /game|arcade|puzzle|casino|strategy|running simulator/.test(h) },
  { label: 'AR/VR/MR', match: (h) => /augmented reality|virtual reality|(^|[^a-z])(ar|vr|mr)([^a-z]|$)/.test(h) },
  { label: 'eGov', match: (h) => /a2i|ict division|digital bangladesh|cabinet division/.test(h) },
  { label: 'MIS', match: (h) => /information management|(^|[^a-z])ims([^a-z]|$)|reporting system/.test(h) },
  { label: 'UN-NGO', match: (h) => /unicef|who|unfpa|undp|plan international|bbc media|sesame|icddr|nonprofit/.test(h) },
];
const pfHaystack = (p: PortfolioProject) =>
  `${p.title} ${p.categoryTags.join(' ')} ${p.techStack.join(' ')} ${p.industryTags.join(' ')}`.toLowerCase();
const PAGE_SIZES = [20, 40, 60];

const CAT_ICON: Record<string, LucideIcon> = {
  Agency: Building2, 'Design Portfolio': Palette, Global: Globe, Local: MapPin,
};
const SECTION_ICON: Record<string, LucideIcon> = {
  'Client requirement': ClipboardList, Proposal: FileSignature, Budget: Wallet,
};

export default function Projects() {
  const dispatch = useAppDispatch();
  const { items, status, error, portfolio, portfolioStatus } = useAppSelector((s) => s.projects);
  // Tab lives in the URL so a reload keeps you exactly where you were (?tab=database&cat=…&sec=…).
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'database' ? 'database' : 'portfolio';
  const setTab = (t: Tab) =>
    setParams((p) => { const n = new URLSearchParams(p); n.set('tab', t); return n; }, { replace: true });
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  // Local-project (items) row menu + edit/delete. Scraped portfolio cards get none of this.
  const [menuFor, setMenuFor] = useState('');
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [pill, setPill] = useState('All');
  const [techFilter, setTechFilter] = useState('All');
  const [industryFilter, setIndustryFilter] = useState('All'); // category treated as industry
  const [pfPage, setPfPage] = useState(1);
  const [pfPageSize, setPfPageSize] = useState(20);
  const [dbStats, setDbStats] = useState<{ req: number; prop: number; bud: number; lastSync: string } | null>(null);

  useEffect(() => {
    dispatch(fetchProjects());
    dispatch(fetchPortfolio());
  }, [dispatch]);

  const filtered = items.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  const nq = q.trim().toLowerCase();
  const activePill = SERVICE_PILLS.find((sp) => sp.label === pill);
  const filteredPortfolio = portfolio.filter((p) => {
    const hay = pfHaystack(p);
    if (activePill && !activePill.match(hay)) return false;
    if (techFilter !== 'All' && !p.techStack.some((t) => t === techFilter)) return false;
    if (industryFilter !== 'All' && !p.categoryTags.some((t) => canonicalCategory(t) === industryFilter)) return false;
    return !nq || hay.includes(nq);
  });
  // Filter option lists derived from the data (Industry = the project categories, per user decision).
  const visiblePills = ['All', ...SERVICE_PILLS.filter((sp) => portfolio.some((p) => sp.match(pfHaystack(p)))).map((sp) => sp.label)];
  const techOptions = ['All', ...[...new Set(portfolio.flatMap((p) => p.techStack))].sort()];
  const industryOptions = ['All', ...mergedCategoryOptions(...portfolio.map((p) => p.categoryTags))];
  // Pagination (reset by any filter/search change via resetPf below).
  const pfPageCount = Math.max(1, Math.ceil(filteredPortfolio.length / pfPageSize));
  const pfSafePage = Math.min(pfPage, pfPageCount);
  const pagedPortfolio = filteredPortfolio.slice((pfSafePage - 1) * pfPageSize, pfSafePage * pfPageSize);
  const resetPf = () => setPfPage(1);

  // Merged canonical category options for the Add-project modal (portfolio + existing projects).
  const categoryOptions = mergedCategoryOptions(...portfolio.map((p) => p.categoryTags), ...items.map((p) => p.category ?? []));

  const showToast = (t: string) => {
    setToast(t);
    window.setTimeout(() => setToast(''), 2600);
  };

  const doDeleteProject = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteProject(deleting.id);
      setDeleting(null);
      showToast('Project deleted.');
      dispatch(fetchProjects());
    } catch (e) {
      showToast(apiErrorMessage(e));
    } finally {
      setDeleteBusy(false);
    }
  };

  const seg = (t: Tab, Icon: LucideIcon, label: string) => (
    <button
      data-testid={`projects-tab-${t}`}
      onClick={() => setTab(t)}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3.5 text-[13px] font-medium transition-colors ${
        tab === t ? 'border border-[#E8E6E3] bg-white text-[#0F0F0F] shadow-sm' : 'text-[#6B6660] hover:text-[#0F0F0F]'
      }`}
    >
      <Icon size={15} /> {label}
    </button>
  );

  return (
    <div data-testid="projects-page">
      {/* Header */}
      <div className="mb-1.5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold">Projects</h1>
          {tab === 'database' ? (
            <>
              <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-[#9A948E]">
                <span className="h-[7px] w-[7px] rounded-full bg-[#0E7C5A]" />
                {dbStats
                  ? `${dbStats.req} client requirements · ${dbStats.prop} proposals · ${dbStats.bud} budgets`
                  : 'Loading database…'}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-[#9A948E]">
                <DatabaseIcon size={13} className="text-[#EA5400]" /> Source: “Proposal &amp; Budget Database” (Google Drive)
                {dbStats && <> · last synced {dbStats.lastSync}</>}
              </div>
            </>
          ) : (
            <>
              <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-[#9A948E]">
                <span className="h-[7px] w-[7px] rounded-full bg-[#0E7C5A]" />
                {portfolio.length + items.length} projects · synced from{' '}
                <a href="https://riseuplabs.com/portfolio/" target="_blank" rel="noreferrer" className="font-medium text-[#EA5400]">riseuplabs.com/portfolio</a>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-[#9A948E]">
                <Lock size={13} className="text-[#EA5400]" /> Locked leads are added here automatically.
              </div>
            </>
          )}
        </div>
        <div className="flex gap-2.5">
          <button data-testid="projects-add" onClick={() => { setTab('portfolio'); setAdding(true); }} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#EA5400] px-3.5 text-sm font-medium text-white hover:bg-[#CC4900]">
            <Plus size={16} /> Add project
          </button>
        </div>
      </div>

      {/* Segmented tabs */}
      <div className="my-5 inline-flex gap-0.5 rounded-lg border border-[#E8E6E3] bg-[#F4F4F2] p-[3px]">
        {seg('portfolio', LayoutGrid, 'Portfolio')}
        {seg('database', DatabaseIcon, 'Database')}
      </div>

      {tab === 'portfolio' && (
        <div data-testid="projects-portfolio-panel">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {visiblePills.map((label) => (
              <button
                key={label}
                data-testid={`pf-pill-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                onClick={() => { setPill(label); resetPf(); }}
                className={`h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
                  pill === label ? 'border-[#EA5400] bg-[#EA5400] text-white' : 'border-[#D4D1CC] bg-white text-[#475467] hover:border-[#EA5400] hover:text-[#EA5400]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <input data-testid="projects-search" placeholder="Search projects…" value={q} onChange={(e) => { setQ(e.target.value); resetPf(); }} className="h-9 w-full max-w-[300px] rounded-md border border-[#D4D1CC] px-3 text-sm outline-none focus:border-[#EA5400]" />
            <label className="flex items-center gap-1.5 text-[13px] text-[#6B6660]">
              Technology:
              <select data-testid="pf-filter-tech" value={techFilter} onChange={(e) => { setTechFilter(e.target.value); resetPf(); }} className="h-9 rounded-md border border-[#D4D1CC] bg-white px-2 text-[13px] font-medium outline-none focus:border-[#EA5400]">
                {techOptions.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[13px] text-[#6B6660]">
              Industry:
              <select data-testid="pf-filter-industry" value={industryFilter} onChange={(e) => { setIndustryFilter(e.target.value); resetPf(); }} className="h-9 rounded-md border border-[#D4D1CC] bg-white px-2 text-[13px] font-medium outline-none focus:border-[#EA5400]">
                {industryOptions.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
          </div>

          {status === 'loading' && <div data-testid="projects-loading" className="text-sm text-[#6B6660]">Loading…</div>}
          {status === 'failed' && <div className="text-sm text-[#B42318]">{error}</div>}
          {status === 'succeeded' && portfolioStatus !== 'loading' && filtered.length === 0 && filteredPortfolio.length === 0 && (
            <div data-testid="projects-empty" className="py-14 text-center text-sm text-[#6B6660]">
              <FolderSearch size={28} className="mx-auto mb-2.5 text-[#9A948E]" />
              {nq ? `No project matches "${q}".` : 'No projects yet — locked leads are added here automatically.'}
            </div>
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {filtered.map((p) => {
              const body = (
                <>
                  <div className="relative flex h-[84px] items-end border-b border-[#E8E6E3] bg-gradient-to-br from-[#FCFBFA] to-[#F4F1EE] p-3 before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-[#EA5400] before:content-['']">
                    {p.techStack?.length > 0 && (
                      <div className="relative z-[1] flex flex-wrap gap-1.5">
                        {p.techStack.slice(0, 2).map((t) => (
                          <span key={t} className="rounded-[5px] border border-[#D4D1CC] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#EA5400]">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="mb-1.5 text-[15px] font-semibold">{p.name}</h3>
                    {p.summary && <p className="flex-1 text-[13px] leading-[1.5] text-[#6B6660]">{p.summary}</p>}
                    {p.techStack?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {p.techStack.map((t) => (
                          <span key={t} className="rounded border border-[#E8E6E3] bg-[#F4F4F2] px-1.5 py-0.5 text-[11px] text-[#6B6660]">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              );
              return (
                <div
                  key={p.id}
                  data-testid={`project-card-${p.slug}`}
                  className="relative flex flex-col overflow-hidden rounded-[10px] border border-[#E8E6E3] bg-white transition-shadow hover:border-[#D4D1CC] hover:shadow-[0_8px_24px_rgba(15,15,15,0.07)]"
                >
                  {/* ⋯ menu — local projects (manual + auto-created from locked leads) only. */}
                  <div className="absolute right-2 top-2 z-[2]">
                    <button
                      data-testid={`project-menu-${p.slug}`}
                      onClick={() => setMenuFor(menuFor === p.id ? '' : p.id)}
                      className="grid h-8 w-8 place-items-center rounded-md border border-[#E8E6E3] bg-white/95 text-[#6B6660] shadow-sm hover:bg-white hover:text-[#0F0F0F]"
                      title="Project actions"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {menuFor === p.id && (
                      <>
                        <button aria-label="Close menu" className="fixed inset-0 z-[1] cursor-default" onClick={() => setMenuFor('')} />
                        <div className="absolute right-0 top-[38px] z-[3] w-[150px] rounded-lg border border-[#E8E6E3] bg-white p-1 text-left shadow-xl">
                          <button data-testid={`project-edit-${p.slug}`} onClick={() => { setMenuFor(''); setEditing(p); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-[13px] hover:bg-[#F4F4F2]">
                            <Pencil size={14} className="text-[#6B6660]" /> Edit
                          </button>
                          <button data-testid={`project-delete-${p.slug}`} onClick={() => { setMenuFor(''); setDeleting(p); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-[13px] text-[#B42318] hover:bg-[#FEF3F2]">
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  {p.link ? (
                    <a href={p.link} target="_blank" rel="noreferrer" className="flex flex-1 flex-col">{body}</a>
                  ) : (
                    <div className="flex flex-1 flex-col">{body}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* The real Riseup portfolio (scraped from riseuplabs.com/portfolio; the evidence base the
              AI cites for stack recommendations). Won/manual projects above; showcase below. */}
          {filteredPortfolio.length > 0 && (
            <>
              <div className="mb-3 mt-8 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-[#9A948E]">
                <Globe size={14} /> Riseup portfolio ({filteredPortfolio.length})
              </div>
              <div data-testid="projects-portfolio-grid" className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                {pagedPortfolio.map((p) => (
                  <a
                    key={p.id}
                    href={p.detailUrl}
                    target="_blank"
                    rel="noreferrer"
                    data-testid={`portfolio-card-${p.id}`}
                    className="flex flex-col overflow-hidden rounded-[10px] border border-[#E8E6E3] bg-white transition-shadow hover:border-[#D4D1CC] hover:shadow-[0_8px_24px_rgba(15,15,15,0.07)]"
                  >
                    <div className="relative flex h-[54px] items-end border-b border-[#E8E6E3] bg-gradient-to-br from-[#FCFBFA] to-[#F4F1EE] p-3 before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-[#111] before:content-['']">
                      {p.categoryTags.length > 0 && (
                        <div className="relative z-[1] flex flex-wrap gap-1.5">
                          {p.categoryTags.slice(0, 2).map((t) => (
                            <span key={t} className="rounded-[5px] border border-[#D4D1CC] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#475467]">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <h3 className="mb-1.5 text-[15px] font-semibold">{p.title}</h3>
                      {p.summary && <p className="flex-1 text-[13px] leading-[1.5] text-[#6B6660]">{p.summary.slice(0, 140)}{p.summary.length > 140 ? '…' : ''}</p>}
                      {p.techStack.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {p.techStack.slice(0, 6).map((t) => (
                            <span key={t} className="rounded border border-[#E8E6E3] bg-[#F4F4F2] px-1.5 py-0.5 text-[11px] text-[#6B6660]">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </a>
                ))}
              </div>

              {(filteredPortfolio.length > 20 || pfPageCount > 1) && (
                <div data-testid="pf-pagination" className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E8E6E3] bg-white px-3.5 py-2 text-[12px] text-[#6B6660]">
                  <span>
                    Showing {(pfSafePage - 1) * pfPageSize + 1}–{Math.min(pfSafePage * pfPageSize, filteredPortfolio.length)} of {filteredPortfolio.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5">
                      Show
                      <select data-testid="pf-page-size" value={pfPageSize} onChange={(e) => { setPfPageSize(Number(e.target.value)); resetPf(); }} className="h-7 rounded-md border border-[#D4D1CC] bg-white px-1.5 text-[12px] font-medium">
                        {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                    <button data-testid="pf-page-prev" disabled={pfSafePage <= 1} onClick={() => setPfPage(pfSafePage - 1)} className="grid h-7 w-7 place-items-center rounded-md border border-[#D4D1CC] bg-white hover:bg-[#F4F4F2] disabled:opacity-40"><ChevronLeft size={14} /></button>
                    <span className="font-medium">{pfSafePage} / {pfPageCount}</span>
                    <button data-testid="pf-page-next" disabled={pfSafePage >= pfPageCount} onClick={() => setPfPage(pfSafePage + 1)} className="grid h-7 w-7 place-items-center rounded-md border border-[#D4D1CC] bg-white hover:bg-[#F4F4F2] disabled:opacity-40"><ChevronRight size={14} /></button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'database' && <DatabasePanel onToast={showToast} onStats={setDbStats} />}

      {adding && (
        <AddProjectModal
          categoryOptions={categoryOptions}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            showToast('Project added to the evidence base.');
            dispatch(fetchProjects());
          }}
        />
      )}

      {editing && (
        <AddProjectModal
          categoryOptions={categoryOptions}
          project={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            showToast('Project updated.');
            dispatch(fetchProjects());
          }}
        />
      )}

      {deleting && (
        <div data-testid="project-delete-modal" className="fixed inset-0 z-[130] grid place-items-center bg-black/40 p-4" onClick={() => !deleteBusy && setDeleting(null)}>
          <div className="w-full max-w-[420px] rounded-xl border border-[#E8E6E3] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><AlertTriangle size={17} className="text-[#B42318]" /> Delete this project?</div>
            <p className="text-[13px] leading-relaxed text-[#6B6660]">
              “{deleting.name}” will be removed from the Projects evidence base. This cannot be undone from the UI.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button data-testid="project-delete-no" disabled={deleteBusy} onClick={() => setDeleting(null)} className="h-9 rounded-md border border-[#D4D1CC] px-4 text-sm font-medium hover:bg-[#F4F4F2]">No, keep it</button>
              <button data-testid="project-delete-yes" disabled={deleteBusy} onClick={() => void doDeleteProject()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#B42318] px-4 text-sm font-medium text-white hover:bg-[#912018] disabled:opacity-50">
                {deleteBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div data-testid="projects-toast" className="fixed bottom-6 left-1/2 z-[120] -translate-x-1/2 rounded-lg bg-[#0F0F0F] px-4 py-2.5 text-[13px] font-medium text-white shadow-xl">{toast}</div>
      )}
    </div>
  );
}

// Sub-navs per category: combined templates (Agency / Design Portfolio) carry the budget inside
// the proposal, so they have no Budget sub-nav; Global / Local get all three.
const SECTIONS_FOR: Record<string, string[]> = {
  Agency: ['Client requirement', 'Proposal'],
  'Design Portfolio': ['Client requirement', 'Proposal'],
  Global: ['Client requirement', 'Proposal', 'Budget'],
  Local: ['Client requirement', 'Proposal', 'Budget'],
};
const ADD_LABEL: Record<string, string> = {
  'Client requirement': 'Add client requirement',
  Proposal: 'Add proposal',
  Budget: 'Add budget',
};

// "Date — newest first" was dropped: Default already IS latest-first (user decision 2026-07-09).
type SortMode = 'default' | 'date_asc' | 'az' | 'za';
const SORT_LABEL: Record<SortMode, string> = {
  default: 'Default (latest first)',
  date_asc: 'Date — oldest first',
  az: 'Name — A to Z',
  za: 'Name — Z to A',
};

// Notion-style tag palette: a tag's colour is stable, derived from its name.
const TAG_COLORS = [
  'bg-[#FEF3F2] text-[#B42318] border-[#B42318]/20',
  'bg-[#EFF8FF] text-[#175CD3] border-[#175CD3]/20',
  'bg-[#ECFDF3] text-[#0E7C5A] border-[#0E7C5A]/20',
  'bg-[#FFF6ED] text-[#EA5400] border-[#EA5400]/25',
  'bg-[#F9F5FF] text-[#6941C6] border-[#6941C6]/20',
  'bg-[#F4F4F2] text-[#475467] border-[#98A2B3]/30',
];
const tagColor = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
};

// Database = the Riseup Proposal & Budget Database: category rail > section sub-nav > file rows.
// Data comes from GET /kb/documents (never hardcoded). Files can be added (drag & drop), renamed,
// tagged (Notion-style; pool shared per category), searched, sorted, paginated, and deleted to
// Trash (Settings > Trash, 30-day retention). Category/sub-nav persist in the URL across reloads.
function DatabasePanel({ onToast, onStats }: {
  onToast: (t: string) => void;
  onStats: (s: { req: number; prop: number; bud: number; lastSync: string } | null) => void;
}) {
  const [docs, setDocs] = useState<KbDocument[] | null>(null);
  const [err, setErr] = useState('');
  const [params, setParams] = useSearchParams();
  const activeCat = DB_CATEGORIES.includes(params.get('cat') ?? '') ? (params.get('cat') as string) : 'Agency';
  const rawSec = params.get('sec') ?? '';
  const activeSection = SECTIONS_FOR[activeCat].includes(rawSec) ? rawSec : SECTIONS_FOR[activeCat][0];
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<KbDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renamingId, setRenamingId] = useState('');
  const [renameVal, setRenameVal] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<'subset' | 'all' | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortMode>('default');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [tagEditorId, setTagEditorId] = useState('');

  const load = () =>
    getKbDocuments()
      .then((d) => {
        setDocs(d);
        // Header stats: totals per section + when the database last changed ("last synced").
        const count = (sec: string) => d.filter((x) => x.section === sec).length;
        const last = d.reduce((m, x) => (x.createdAt > m ? x.createdAt : m), '');
        onStats({
          req: count('Client requirement'),
          prop: count('Proposal'),
          bud: count('Budget'),
          lastSync: last ? new Date(last).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : '—',
        });
      })
      .catch((e) => setErr(apiErrorMessage(e)));
  useEffect(() => { load(); }, []);

  const openFile = async (id: string, mode: 'view' | 'download', title: string) => {
    try {
      await openKbFile(id, mode, title);
    } catch (e) {
      onToast(apiErrorMessage(e));
    }
  };

  const resetListState = () => { setSelected(new Set()); setPage(1); setTagEditorId(''); };
  const switchCat = (c: string) => {
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set('cat', c);
      n.set('sec', SECTIONS_FOR[c].includes(activeSection) ? activeSection : SECTIONS_FOR[c][0]);
      return n;
    }, { replace: true });
    resetListState();
  };
  const switchSection = (s: string) => {
    setParams((p) => { const n = new URLSearchParams(p); n.set('cat', activeCat); n.set('sec', s); return n; }, { replace: true });
    resetListState();
  };

  const saveTags = async (id: string, tags: string[]) => {
    try {
      await updateKbDocument(id, { tags });
      await load();
    } catch (e) {
      onToast(apiErrorMessage(e));
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await trashKbDocument(confirmDelete.id);
      onToast('Moved to Trash — restorable from Settings for 30 days.');
      setConfirmDelete(null);
      await load();
    } catch (e) {
      onToast(apiErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  const toggleRow = (id: string) =>
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Sequentially download every selected file that has a stored file (skips catalog-only refs).
  // Small gap between saves so the browser doesn't swallow parallel programmatic downloads.
  const downloadSelected = async (list: KbDocument[]) => {
    const targets = list.filter((d) => selected.has(d.id) && d.downloadable);
    if (!targets.length) { onToast('Nothing downloadable selected.'); return; }
    setDownloading(true);
    try {
      for (const d of targets) {
        await openKbFile(d.id, 'download', d.title);
        await new Promise((r) => setTimeout(r, 350));
      }
      onToast(`Downloaded ${targets.length} file(s).`);
    } catch (e) {
      onToast(apiErrorMessage(e));
    } finally {
      setDownloading(false);
    }
  };

  // Bulk trash the selection (already confirmed — and password-verified when it was "all").
  const deleteSelected = async () => {
    const ids = [...selected];
    setDeleting(true);
    try {
      for (const id of ids) await trashKbDocument(id);
      onToast(`${ids.length} file(s) moved to Trash — restorable from Settings for 30 days.`);
      setBulkConfirm(null);
      setSelected(new Set());
      await load();
    } catch (e) {
      onToast(apiErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  const startRename = (d: KbDocument) => { setRenamingId(d.id); setRenameVal(d.title); };
  const saveRename = async () => {
    const id = renamingId;
    if (!id || !renameVal.trim()) { setRenamingId(''); return; }
    try {
      await updateKbDocument(id, { title: renameVal.trim() });
      setRenamingId('');
      await load();
    } catch (e) {
      onToast(apiErrorMessage(e));
    }
  };

  const byCat = useMemo(() => {
    const grouped: Record<string, Record<string, KbDocument[]>> = {};
    for (const d of docs ?? []) (grouped[d.category] ??= {})[d.section] = [...(grouped[d.category]?.[d.section] ?? []), d];
    return grouped;
  }, [docs]);

  if (err) return <div data-testid="database-error" className="text-sm text-[#B42318]">{err}</div>;
  if (!docs) return <div data-testid="database-loading" className="mt-6 text-sm text-[#6B6660]">Loading database…</div>;

  const sectionDocs = byCat[activeCat]?.[activeSection] ?? [];
  // Search matches the name OR any tag; sort per the dropdown; then paginate.
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? sectionDocs.filter((d) => d.title.toLowerCase().includes(needle) || d.tags.some((t) => t.toLowerCase().includes(needle)))
    : sectionDocs;
  const files = [...filtered].sort((a, b) => {
    if (sort === 'az') return a.title.localeCompare(b.title);
    if (sort === 'za') return b.title.localeCompare(a.title);
    const da = new Date(a.docDate).getTime();
    const db = new Date(b.docDate).getTime();
    return sort === 'date_asc' ? da - db : db - da; // default = latest first
  });
  const pageCount = Math.max(1, Math.ceil(files.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageFiles = files.slice((safePage - 1) * pageSize, safePage * pageSize);
  // The tag pool is per CATEGORY: tags used anywhere under Agency are offered across Agency's
  // sub-navs, but never leak into Global/Local (and vice versa).
  const tagPool = [...new Set(Object.values(byCat[activeCat] ?? {}).flat().flatMap((d) => d.tags))].sort();
  const SIcon = SECTION_ICON[activeSection] ?? FileIcon;

  return (
    <div data-testid="projects-database-panel">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E8E6E3] bg-white px-3.5 py-[11px] text-[13px] text-[#6B6660]">
        <span className="flex items-center gap-2"><Info size={16} className="shrink-0 text-[#EA5400]" /> Synced from the Riseup Proposal &amp; Budget Database — approved leads are filed here automatically. PDFs preview inline; Office files download.</span>
      </div>

      <div className="grid items-start gap-5 md:grid-cols-[220px_1fr]">
        {/* Left category rail (all four templates, even when empty) */}
        <div className="flex flex-col gap-0.5" role="tablist">
          {DB_CATEGORIES.map((c) => {
            const Icon = CAT_ICON[c] ?? FileIcon;
            const count = Object.values(byCat[c] ?? {}).reduce((a, s) => a + s.length, 0);
            const on = c === activeCat;
            return (
              <button
                key={c}
                data-testid={`db-cat-${c.toLowerCase().replace(/\s+/g, '-')}`}
                onClick={() => switchCat(c)}
                className={`relative flex h-[38px] items-center gap-[9px] rounded-md px-3 text-left text-sm font-medium transition-colors ${
                  on ? "border border-[#D4D1CC] bg-white text-[#0F0F0F] before:absolute before:bottom-[9px] before:left-0 before:top-[9px] before:w-[2px] before:rounded before:bg-[#EA5400] before:content-['']" : 'border border-transparent text-[#6B6660] hover:bg-[#F4F4F2] hover:text-[#0F0F0F]'
                }`}
              >
                <Icon size={16} />
                <span>{c}</span>
                <span className="ml-auto text-xs font-semibold text-[#9A948E]">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Right: section sub-nav + file rows */}
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
            <div className="inline-flex gap-0.5 rounded-lg border border-[#E8E6E3] bg-[#F4F4F2] p-[3px]" role="tablist">
              {SECTIONS_FOR[activeCat].map((s) => {
                const Icon = SECTION_ICON[s] ?? FileIcon;
                const n = byCat[activeCat]?.[s]?.length ?? 0;
                const on = s === activeSection;
                return (
                  <button
                    key={s}
                    role="tab"
                    data-testid={`db-subnav-${s.toLowerCase().replace(/\s+/g, '-')}`}
                    onClick={() => switchSection(s)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors ${
                      on ? 'border border-[#E8E6E3] bg-white text-[#0F0F0F] shadow-sm' : 'text-[#6B6660] hover:text-[#0F0F0F]'
                    }`}
                  >
                    <Icon size={14} /> {s === 'Client requirement' ? 'Client requirements' : s}
                    <span className={`text-[11px] font-semibold ${on ? 'text-[#EA5400]' : 'text-[#9A948E]'}`}>{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-1 items-center justify-end gap-2">
              <div className="relative w-full max-w-[240px]">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9A948E]" />
                <input
                  data-testid="db-search"
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPage(1); }}
                  placeholder={`Search ${activeSection.toLowerCase()}s or tags…`}
                  className="h-8 w-full rounded-md border border-[#D4D1CC] bg-white pl-8 pr-2.5 text-[13px] outline-none focus:border-[#EA5400]"
                />
              </div>
              <div className="relative flex items-center">
                <ArrowUpDown size={13} className="pointer-events-none absolute left-2.5 text-[#9A948E]" />
                <select
                  data-testid="db-sort"
                  value={sort}
                  onChange={(e) => { setSort(e.target.value as SortMode); setPage(1); }}
                  title="Sort"
                  className="h-8 appearance-none rounded-md border border-[#D4D1CC] bg-white pl-8 pr-3 text-[13px] font-medium text-[#475467] outline-none focus:border-[#EA5400]"
                >
                  {(Object.keys(SORT_LABEL) as SortMode[]).map((m) => <option key={m} value={m}>{SORT_LABEL[m]}</option>)}
                </select>
              </div>
              <button
                data-testid="db-add-document"
                onClick={() => setShowAdd(true)}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-[#EA5400] px-3 text-[13px] font-medium text-white hover:bg-[#CC4900]"
              >
                <Plus size={14} /> {ADD_LABEL[activeSection]}
              </button>
            </div>
          </div>

          {files.length === 0 ? (
            <div data-testid="db-section-empty" className="rounded-lg border border-dashed border-[#D4D1CC] bg-white py-12 text-center text-sm text-[#6B6660]">
              <SIcon size={26} className="mx-auto mb-2 text-[#9A948E]" />
              {needle ? (
                <>
                  No match for “{q}” in {activeCat} → {activeSection.toLowerCase()}s.
                  <div className="mt-2"><button data-testid="db-search-clear" onClick={() => setQ('')} className="text-xs font-medium text-[#EA5400] hover:underline">Clear search</button></div>
                </>
              ) : (
                <>
                  No {activeSection.toLowerCase()} files under {activeCat} yet.
                  <div className="mt-1 text-xs text-[#9A948E]">Approved leads are filed here automatically — or add one manually.</div>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col overflow-hidden rounded-lg border border-[#E8E6E3] bg-white">
              {/* Select-all header + bulk actions */}
              <div className="flex items-center gap-3 border-b border-[#E8E6E3] bg-[#FCFBFA] px-3.5 py-2">
                <input
                  data-testid="db-select-all"
                  type="checkbox"
                  checked={selected.size === files.length && files.length > 0}
                  onChange={() => setSelected(selected.size === files.length ? new Set() : new Set(files.map((f) => f.id)))}
                  className="h-4 w-4 accent-[#EA5400]"
                />
                <span className="text-[12px] font-semibold text-[#9A948E]">
                  {selected.size > 0 ? `${selected.size} of ${files.length} selected` : 'Select all'}
                </span>
                {selected.size === 0 && (
                  <>
                    <span className="ml-auto w-[210px] text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">Client</span>
                    <span className="w-[110px] text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">Owner</span>
                    <span className="w-[76px] text-right text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">Date</span>
                    <span className="w-[140px]" />
                  </>
                )}
                {selected.size > 0 && (
                  <div className="ml-auto flex gap-1.5">
                    <button
                      data-testid="db-bulk-download"
                      disabled={downloading}
                      onClick={() => void downloadSelected(files)}
                      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#D4D1CC] bg-white px-2.5 text-[12px] font-medium hover:bg-[#F4F4F2] disabled:opacity-50"
                    >
                      {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                      Download ({selected.size})
                    </button>
                    <button
                      data-testid="db-bulk-delete"
                      disabled={deleting}
                      onClick={() => setBulkConfirm(selected.size === sectionDocs.length ? 'all' : 'subset')}
                      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#D4D1CC] px-2.5 text-[12px] font-medium text-[#B42318] hover:bg-[#FEF3F2] disabled:opacity-50"
                    >
                      <Trash2 size={13} /> {selected.size === sectionDocs.length ? `Delete all (${selected.size})` : `Delete (${selected.size})`}
                    </button>
                  </div>
                )}
              </div>

              {pageFiles.map((d) => {
                const renaming = renamingId === d.id;
                return (
                  <div key={d.id} data-testid={`db-file-row-${d.id}`} className={`relative flex items-center gap-3 border-t border-[#E8E6E3] px-3.5 py-[11px] first:border-t-0 hover:bg-[#F4F4F2] ${selected.has(d.id) ? 'bg-[#EA5400]/[0.03]' : ''}`}>
                    <input
                      data-testid={`db-file-check-${d.id}`}
                      type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={() => toggleRow(d.id)}
                      className="h-4 w-4 shrink-0 accent-[#EA5400]"
                    />
                    <FileTypeBadge fileType={d.fileType} />
                    {renaming ? (
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <input
                          data-testid={`db-file-rename-input-${d.id}`}
                          autoFocus
                          value={renameVal}
                          onChange={(e) => setRenameVal(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') void saveRename(); if (e.key === 'Escape') setRenamingId(''); }}
                          className="h-8 min-w-0 flex-1 rounded-md border border-[#EA5400] px-2 text-[13px] outline-none"
                        />
                        <button data-testid={`db-file-rename-save-${d.id}`} onClick={() => void saveRename()} className="inline-flex h-8 items-center rounded-md bg-[#EA5400] px-2.5 text-[12px] font-medium text-white hover:bg-[#CC4900]"><Check size={14} /></button>
                        <button onClick={() => setRenamingId('')} className="inline-flex h-8 items-center rounded-md border border-[#D4D1CC] px-2.5 text-[12px] font-medium text-[#6B6660] hover:bg-[#F4F4F2]"><X size={14} /></button>
                      </div>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={d.title}>{d.title}</span>
                    )}
                    {/* Client (tags) — Notion-style: the whole cell opens the tag popup */}
                    {!renaming && (
                      <div className="relative w-[210px] shrink-0">
                        <button
                          data-testid={`db-add-tag-${d.id}`}
                          onClick={() => setTagEditorId(tagEditorId === d.id ? '' : d.id)}
                          className="flex min-h-[26px] w-full flex-wrap items-center gap-1 rounded-md px-1 py-0.5 text-left hover:bg-[#EFEDEA]"
                        >
                          {d.tags.length === 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#D4D1CC] px-2 py-[1px] text-[11px] font-medium text-[#9A948E]">
                              <Tag size={10} /> Add tag
                            </span>
                          ) : (
                            d.tags.map((t) => (
                              <span key={t} data-testid={`db-tag-${d.id}-${t}`} className={`inline-flex items-center rounded-[4px] border px-1.5 py-[1px] text-[11px] font-medium ${tagColor(t)}`}>
                                {t}
                              </span>
                            ))
                          )}
                        </button>
                        {tagEditorId === d.id && (
                          <TagEditor
                            current={d.tags}
                            pool={tagPool}
                            onPick={(t) => void saveTags(d.id, [...d.tags, t])}
                            onRemove={(t) => void saveTags(d.id, d.tags.filter((x) => x !== t))}
                            onClose={() => setTagEditorId('')}
                          />
                        )}
                      </div>
                    )}
                    <span data-testid={`db-file-owner-${d.id}`} title={d.owner} className="w-[110px] shrink-0 truncate text-[12px] text-[#6B6660]">
                      {d.owner}
                    </span>
                    <span data-testid={`db-file-date-${d.id}`} title="Document date" className="w-[76px] shrink-0 text-right text-[12px] tabular-nums text-[#9A948E]">
                      {new Date(d.docDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </span>
                    <div className="flex w-[140px] shrink-0 items-center justify-end gap-1">
                      {d.downloadable ? (
                        <>
                          <button data-testid={`db-file-preview-${d.id}`} title="Preview" onClick={() => openFile(d.id, 'view', d.title)} className="grid h-8 w-8 place-items-center rounded-md text-[#9A948E] hover:bg-[#F4F4F2] hover:text-[#0F0F0F]">
                            <Eye size={15} />
                          </button>
                          <button data-testid={`db-file-download-${d.id}`} title="Download" onClick={() => openFile(d.id, 'download', d.title)} className="grid h-8 w-8 place-items-center rounded-md text-[#9A948E] hover:bg-[#F4F4F2] hover:text-[#0F0F0F]">
                            <Download size={15} />
                          </button>
                        </>
                      ) : (
                        <span data-testid={`db-file-ref-${d.id}`} title="Source file lives in the Riseup Drive — not stored in this instance" className="rounded bg-[#F0EEEB] px-2 py-1 text-[11px] font-medium text-[#9A948E]">Reference</span>
                      )}
                      <button data-testid={`db-file-rename-${d.id}`} title="Rename" onClick={() => startRename(d)} className="grid h-8 w-8 place-items-center rounded-md text-[#9A948E] hover:bg-[#F4F4F2] hover:text-[#0F0F0F]">
                        <Pencil size={14} />
                      </button>
                      <button data-testid={`db-file-delete-${d.id}`} title="Delete" onClick={() => setConfirmDelete(d)} className="grid h-8 w-8 place-items-center rounded-md text-[#9A948E] hover:bg-[#FEF3F2] hover:text-[#B42318]">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {(pageCount > 1 || files.length > 20) && (
                <div data-testid="db-pagination" className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E8E6E3] bg-[#FCFBFA] px-3.5 py-2 text-[12px] text-[#6B6660]">
                  <span>
                    Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, files.length)} of {files.length}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <label className="mr-1 flex items-center gap-1.5">
                      Show
                      <select data-testid="db-page-size" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="h-7 rounded-md border border-[#D4D1CC] bg-white px-1.5 text-[12px] font-medium">
                        {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                    <button
                      data-testid="db-page-prev"
                      disabled={safePage <= 1}
                      onClick={() => setPage(safePage - 1)}
                      className="grid h-7 w-7 place-items-center rounded-md border border-[#D4D1CC] bg-white hover:bg-[#F4F4F2] disabled:opacity-40"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="font-medium">{safePage} / {pageCount}</span>
                    <button
                      data-testid="db-page-next"
                      disabled={safePage >= pageCount}
                      onClick={() => setPage(safePage + 1)}
                      className="grid h-7 w-7 place-items-center rounded-md border border-[#D4D1CC] bg-white hover:bg-[#F4F4F2] disabled:opacity-40"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <AddDocumentModal
          category={activeCat}
          section={activeSection}
          onClose={() => setShowAdd(false)}
          onDone={async () => {
            setShowAdd(false);
            onToast('Document added — stored, downloadable, and learned by the AI.');
            await load();
          }}
        />
      )}

      {confirmDelete && (
        <div data-testid="db-delete-modal" className="fixed inset-0 z-[130] grid place-items-center bg-black/40 p-4" onClick={() => !deleting && setConfirmDelete(null)}>
          <div className="w-full max-w-[420px] rounded-xl border border-[#E8E6E3] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><AlertTriangle size={17} className="text-[#B42318]" /> Move to Trash?</div>
            <p className="text-[13px] leading-relaxed text-[#6B6660]">
              “{confirmDelete.title}” will move to <strong>Settings → Trash</strong> and stop feeding the AI immediately.
              It stays restorable for <strong>30 days</strong>, then is permanently removed.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button data-testid="db-delete-no" disabled={deleting} onClick={() => setConfirmDelete(null)} className="h-9 rounded-md border border-[#D4D1CC] px-4 text-sm font-medium hover:bg-[#F4F4F2]">No, keep it</button>
              <button data-testid="db-delete-yes" disabled={deleting} onClick={() => void doDelete()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#B42318] px-4 text-sm font-medium text-white hover:bg-[#912018] disabled:opacity-50">
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Yes, move to Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkConfirm === 'subset' && (
        <div data-testid="db-bulk-delete-modal" className="fixed inset-0 z-[130] grid place-items-center bg-black/40 p-4" onClick={() => !deleting && setBulkConfirm(null)}>
          <div className="w-full max-w-[420px] rounded-xl border border-[#E8E6E3] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><AlertTriangle size={17} className="text-[#B42318]" /> Move {selected.size} file(s) to Trash?</div>
            <p className="text-[13px] leading-relaxed text-[#6B6660]">
              They will move to <strong>Settings → Trash</strong> and stop feeding the AI immediately.
              Restorable for <strong>30 days</strong>, then permanently removed.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button data-testid="db-bulk-delete-no" disabled={deleting} onClick={() => setBulkConfirm(null)} className="h-9 rounded-md border border-[#D4D1CC] px-4 text-sm font-medium hover:bg-[#F4F4F2]">No, cancel</button>
              <button data-testid="db-bulk-delete-yes" disabled={deleting} onClick={() => void deleteSelected()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#B42318] px-4 text-sm font-medium text-white hover:bg-[#912018] disabled:opacity-50">
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Yes, move to Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkConfirm === 'all' && (
        <DeleteAllModal
          count={selected.size}
          category={activeCat}
          section={activeSection}
          busy={deleting}
          onCancel={() => setBulkConfirm(null)}
          onConfirm={() => void deleteSelected()}
        />
      )}
    </div>
  );
}

/** Notion-style tag popup: current tags (removable ×) on top, then "Select an option or create
 *  one" from the CATEGORY's shared pool (Agency tags never appear under Global, etc.). */
function TagEditor({ current, pool, onPick, onRemove, onClose }: {
  current: string[];
  pool: string[];
  onPick: (tag: string) => void;
  onRemove: (tag: string) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const lowerCurrent = new Set(current.map((t) => t.toLowerCase()));
  const needle = input.trim().toLowerCase();
  const suggestions = pool.filter((t) => !lowerCurrent.has(t.toLowerCase()) && (!needle || t.toLowerCase().includes(needle)));
  const canCreate = !!needle && !lowerCurrent.has(needle) && !pool.some((t) => t.toLowerCase() === needle);

  return (
    <div ref={boxRef} data-testid="db-tag-editor" className="absolute right-0 top-full z-[60] mt-1 w-[230px] rounded-lg border border-[#E8E6E3] bg-white shadow-xl">
      {/* Current tags + type-to-search/create (Notion's top strip) */}
      <div className="flex flex-wrap items-center gap-1 border-b border-[#E8E6E3] bg-[#FCFBFA] p-2">
        {current.map((t) => (
          <span key={t} data-testid={`db-tag-current-${t}`} className={`inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-[1px] text-[11px] font-medium ${tagColor(t)}`}>
            {t}
            <button title="Remove" onClick={() => onRemove(t)} className="opacity-60 hover:opacity-100"><X size={10} /></button>
          </span>
        ))}
        <input
          data-testid="db-tag-input"
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim()) { onPick(input.trim()); setInput(''); }
            if (e.key === 'Escape') onClose();
            if (e.key === 'Backspace' && !input && current.length) onRemove(current[current.length - 1]);
          }}
          placeholder={current.length ? '' : 'Search or create…'}
          className="h-6 min-w-[70px] flex-1 border-none bg-transparent text-[12px] outline-none"
        />
      </div>
      <div className="p-1.5">
        <div className="px-1.5 pb-1 text-[11px] font-medium text-[#9A948E]">Select an option or create one</div>
        <div className="max-h-[160px] overflow-auto">
          {canCreate && (
            <button data-testid="db-tag-create" onClick={() => { onPick(input.trim()); setInput(''); }} className="flex w-full items-center gap-1.5 rounded px-1.5 py-1.5 text-left text-[12px] hover:bg-[#F4F4F2]">
              <Plus size={12} className="text-[#EA5400]" /> Create
              <span className={`inline-flex items-center rounded-[4px] border px-1.5 py-[1px] text-[11px] font-medium ${tagColor(input.trim())}`}>{input.trim()}</span>
            </button>
          )}
          {suggestions.map((t) => (
            <button key={t} data-testid={`db-tag-pick-${t}`} onClick={() => { onPick(t); setInput(''); }} className="flex w-full items-center rounded px-1.5 py-1.5 text-left hover:bg-[#F4F4F2]">
              <span className={`inline-flex items-center rounded-[4px] border px-1.5 py-[1px] text-[11px] font-medium ${tagColor(t)}`}>{t}</span>
            </button>
          ))}
          {!suggestions.length && !canCreate && (
            <div className="px-1.5 py-1.5 text-[11px] text-[#9A948E]">{needle ? 'Already added.' : 'Type to create the first tag.'}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Deleting EVERY file of a sub-nav is a high-blast-radius action: it requires the user's password
 *  (re-authenticated server-side) AND typing DELETE_ALL, per user decision 2026-07-09. */
function DeleteAllModal({ count, category, section, busy, onCancel, onConfirm }: {
  count: number;
  category: string;
  section: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [password, setPassword] = useState('');
  const [phrase, setPhrase] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [err, setErr] = useState('');
  const armed = phrase === 'DELETE_ALL' && password.length > 0;

  const submit = async () => {
    setVerifying(true); setErr('');
    try {
      await verifyPassword(password);
      onConfirm();
    } catch (e) {
      setErr(apiErrorMessage(e));
      setVerifying(false);
    }
  };

  return (
    <div data-testid="db-delete-all-modal" className="fixed inset-0 z-[130] grid place-items-center bg-black/40 p-4" onClick={() => !busy && !verifying && onCancel()}>
      <div className="w-full max-w-[440px] rounded-xl border border-[#E8E6E3] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><AlertTriangle size={17} className="text-[#B42318]" /> Delete ALL {count} files?</div>
        <p className="text-[13px] leading-relaxed text-[#6B6660]">
          You are about to move <strong>every file</strong> under <strong>{category} → {section}</strong> to Trash.
          They stop feeding the AI immediately and are permanently removed after 30 days.
          Confirm with your password and type <code className="rounded bg-[#F4F4F2] px-1 font-semibold text-[#B42318]">DELETE_ALL</code>.
        </p>
        <label className="mt-4 block text-[13px] font-semibold">
          Your password
          <input
            data-testid="db-delete-all-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 h-10 w-full rounded-md border border-[#D4D1CC] px-3 text-sm font-normal outline-none focus:border-[#EA5400]"
          />
        </label>
        <label className="mt-3 block text-[13px] font-semibold">
          Type <span className="text-[#B42318]">DELETE_ALL</span> to confirm
          <input
            data-testid="db-delete-all-phrase"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="DELETE_ALL"
            className="mt-1.5 h-10 w-full rounded-md border border-[#D4D1CC] px-3 text-sm font-normal outline-none focus:border-[#EA5400]"
          />
        </label>
        {err && <p data-testid="db-delete-all-error" className="mt-2 text-xs text-[#B42318]">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button data-testid="db-delete-all-cancel" disabled={busy || verifying} onClick={onCancel} className="h-9 rounded-md border border-[#D4D1CC] px-4 text-sm font-medium hover:bg-[#F4F4F2]">Cancel</button>
          <button
            data-testid="db-delete-all-confirm"
            disabled={!armed || busy || verifying}
            onClick={() => void submit()}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#B42318] px-4 text-sm font-medium text-white hover:bg-[#912018] disabled:opacity-40"
          >
            {busy || verifying ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete all {count} files
          </button>
        </div>
      </div>
    </div>
  );
}

/** Add-document modal: drag & drop (or browse) + display-name field. Files upload into the active
 *  category + sub-nav and are immediately text-extracted + embedded so the AI learns them. */
function AddDocumentModal({ category, section, onClose, onDone }: {
  category: string;
  section: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = (f: File | null) => {
    setFile(f);
    if (f && !name.trim()) setName(f.name.replace(/\.[^.]+$/, ''));
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      await uploadKbDocument(file, category, section, name);
      await onDone();
    } catch (e) {
      setErr(apiErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div data-testid="db-add-modal" className="fixed inset-0 z-[130] grid place-items-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-[480px] rounded-xl border border-[#E8E6E3] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 text-[15px] font-semibold">{ADD_LABEL[section]}</div>
        <p className="mb-4 text-xs text-[#9A948E]">Files under <strong>{category} → {section}</strong>. Stored, downloadable, and learned by the AI for future proposals.</p>

        <div
          data-testid="db-add-dropzone"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files?.[0] ?? null); }}
          className={`grid place-items-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragOver ? 'border-[#EA5400] bg-[#EA5400]/[0.04]' : 'border-[#D4D1CC] bg-[#FCFBFA]'
          }`}
        >
          <Upload size={22} className={`mb-2 ${dragOver ? 'text-[#EA5400]' : 'text-[#9A948E]'}`} />
          {file ? (
            <div className="text-[13px] font-medium">{file.name} <span className="text-[#9A948E]">({(file.size / 1024 / 1024).toFixed(1)} MB)</span></div>
          ) : (
            <div className="text-[13px] text-[#6B6660]">Drag &amp; drop a file here, or</div>
          )}
          <label className="mt-2 inline-flex h-8 items-center rounded-md border border-[#D4D1CC] bg-white px-3 text-[13px] font-medium hover:bg-[#F4F4F2]">
            Browse…
            <input data-testid="db-add-file" type="file" accept=".pdf,.doc,.docx,.txt,.md,.xlsx,.pptx" className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => pick(e.target.files?.[0] ?? null)} />
          </label>
          <div className="mt-2 text-[11px] text-[#9A948E]">PDF · DOCX · XLSX · PPTX · TXT — max 25 MB</div>
        </div>

        <label className="mt-4 block text-[13px]">
          <span className="mb-1 block font-medium text-[#475467]">Name of the file</span>
          <input data-testid="db-add-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ACME - Technical Proposal" className="h-9 w-full rounded-md border border-[#D4D1CC] px-3 text-sm" />
        </label>

        {err && <p className="mt-2 text-xs text-[#B42318]">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button disabled={busy} onClick={onClose} className="h-9 rounded-md border border-[#D4D1CC] px-4 text-sm font-medium hover:bg-[#F4F4F2]">Cancel</button>
          <button data-testid="db-add-submit" disabled={!file || busy} onClick={() => void submit()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#EA5400] px-4 text-sm font-medium text-white hover:bg-[#CC4900] disabled:opacity-50">
            {busy ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> : <><Upload size={14} /> Add file</>}
          </button>
        </div>
      </div>
    </div>
  );
}

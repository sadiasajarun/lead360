import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Briefcase, ClipboardList, Clock, FileSignature, Globe, Loader2, Search, Wallet, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { httpService } from '~/services/httpService';
import { getKbDocuments, openKbFile } from '~/services/httpServices/kbService';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';
import type { KbDocument } from '~/types/kb';
import type { PortfolioProject, Project } from '~/types/project';

interface LeadHit { id: string; title: string; company: string; status: string }

interface Hit {
  key: string;
  group: 'Leads' | 'Projects' | 'Proposals' | 'Client requirements' | 'Budgets';
  icon: LucideIcon;
  title: string;
  subtitle: string;
  score: number;
  action: () => void;
}

const GROUP_ORDER: Hit['group'][] = ['Leads', 'Projects', 'Proposals', 'Client requirements', 'Budgets'];
const SECTION_GROUP: Record<string, { group: Hit['group']; icon: LucideIcon }> = {
  Proposal: { group: 'Proposals', icon: FileSignature },
  'Client requirement': { group: 'Client requirements', icon: ClipboardList },
  Budget: { group: 'Budgets', icon: Wallet },
};

const HISTORY_KEY = 'lead360.search.history';
const HISTORY_MAX = 8;
const loadHistory = (): string[] => {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as string[]; } catch { return []; }
};

// Multi-keyword scoring: every entered word that appears in the haystack counts; items matching
// more of the words rank higher. Zero matches = excluded.
function scoreOf(haystack: string, words: string[]): number {
  const h = haystack.toLowerCase();
  return words.reduce((n, w) => (h.includes(w) ? n + 1 : n), 0);
}

// KB docs + portfolio change rarely mid-session — fetch once per page load, share across searches.
let kbCache: Promise<KbDocument[]> | null = null;
let pfCache: Promise<PortfolioProject[]> | null = null;

/** Topbar global search: leads, portfolio/manual projects, and Database docs (proposals /
 *  client requirements / budgets). Multi-keyword ranked, grouped with type icons; click acts
 *  (open lead / project link / document). Keeps a clearable local search history. */
export default function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const boxRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0); // drop out-of-order responses (fast typing edge case)

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const remember = (term: string) => {
    const t = term.trim().slice(0, 60);
    if (!t) return;
    const next = [t, ...history.filter((h) => h.toLowerCase() !== t.toLowerCase())].slice(0, HISTORY_MAX);
    setHistory(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* storage full/blocked — history is best-effort */ }
  };
  const clearHistory = () => {
    setHistory([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
  };

  const run = (hit: Hit) => {
    remember(q);
    setOpen(false);
    hit.action();
  };

  // Debounced multi-source search.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setLoading(false); setErr(''); return; }
    const seq = ++seqRef.current;
    setLoading(true);
    setErr('');
    const t = window.setTimeout(async () => {
      try {
        const words = [...new Set(term.toLowerCase().split(/\s+/).filter(Boolean))].slice(0, 6);
        kbCache ??= getKbDocuments();
        pfCache ??= httpService.get('/portfolio').then((r) => r.data.data as PortfolioProject[]);
        const [leadsRes, kb, pf, projRes] = await Promise.all([
          httpService.get('/leads', { params: { q: term, limit: 10 } }).then((r) => r.data.data)
            .catch(() => ({ items: [] })), // lead search failing must not sink the whole dropdown
          kbCache.catch(() => [] as KbDocument[]),
          pfCache.catch(() => [] as PortfolioProject[]),
          httpService.get('/projects').then((r) => r.data.data as Project[]).catch(() => [] as Project[]),
        ]);
        if (seq !== seqRef.current) return; // a newer keystroke superseded this response

        const out: Hit[] = [];
        const leads: LeadHit[] = Array.isArray(leadsRes) ? leadsRes : leadsRes.items ?? leadsRes.data ?? [];
        for (const l of leads) {
          const score = scoreOf(`${l.title} ${l.company}`, words);
          if (score) out.push({
            key: `lead-${l.id}`, group: 'Leads', icon: Briefcase,
            title: l.title, subtitle: `${l.company} · ${String(l.status).replace(/_/g, ' ')}`,
            score, action: () => navigate(`/leads/${l.id}`),
          });
        }
        for (const p of pf) {
          const score = scoreOf(`${p.title} ${p.techStack.join(' ')} ${p.categoryTags.join(' ')}`, words);
          if (score) out.push({
            key: `pf-${p.id}`, group: 'Projects', icon: Globe,
            title: p.title, subtitle: p.categoryTags.slice(0, 2).join(' · ') || 'Riseup portfolio',
            score, action: () => window.open(p.detailUrl, '_blank', 'noopener'),
          });
        }
        for (const p of projRes) {
          const score = scoreOf(`${p.name} ${p.techStack?.join(' ') ?? ''} ${(p.category ?? []).join(' ')}`, words);
          if (score) out.push({
            key: `proj-${p.id}`, group: 'Projects', icon: Briefcase,
            title: p.name, subtitle: p.techStack?.slice(0, 3).join(' · ') || 'Project',
            score,
            action: () => (p.link ? window.open(p.link, '_blank', 'noopener') : navigate('/projects')),
          });
        }
        for (const d of kb) {
          const map = SECTION_GROUP[d.section];
          if (!map) continue;
          const score = scoreOf(`${d.title} ${d.tags.join(' ')}`, words);
          if (score) out.push({
            key: `kb-${d.id}`, group: map.group, icon: map.icon,
            title: d.title, subtitle: `${d.category} · ${d.owner}`,
            score,
            action: () => {
              if (d.downloadable) void openKbFile(d.id, 'view', d.title).catch(() => undefined);
              else navigate(`/projects?tab=database&cat=${encodeURIComponent(d.category)}&sec=${encodeURIComponent(d.section)}`);
            },
          });
        }

        out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
        // Cap per group so one noisy source can't drown the rest.
        const capped: Hit[] = [];
        const perGroup: Record<string, number> = {};
        for (const h of out) {
          perGroup[h.group] = (perGroup[h.group] ?? 0) + 1;
          if (perGroup[h.group] <= 5) capped.push(h);
        }
        setHits(capped);
      } catch (e) {
        if (seq === seqRef.current) setErr(apiErrorMessage(e));
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [q, navigate]);

  const grouped = useMemo(() => {
    const g = new Map<Hit['group'], Hit[]>();
    for (const h of hits) g.set(h.group, [...(g.get(h.group) ?? []), h]);
    return GROUP_ORDER.filter((k) => g.has(k)).map((k) => ({ group: k, items: g.get(k)! }));
  }, [hits]);

  const showHistory = open && q.trim().length < 2 && history.length > 0;
  const showResults = open && q.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative max-w-[420px] flex-1">
      <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-[#9A948E]" />
      <input
        data-testid="topbar-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Enter' && hits.length) run(hits[0]);
        }}
        placeholder="Search leads, projects, proposals…"
        className="h-9 w-full rounded-md border border-[#E8E6E3] bg-[#FAFAF9] pl-[34px] pr-8 text-[13px] outline-none focus:border-[#EA5400]"
      />
      {q && (
        <button data-testid="topbar-search-clear" onClick={() => { setQ(''); setErr(''); }} className="absolute right-2 top-2.5 text-[#9A948E] hover:text-[#0F0F0F]">
          <X size={14} />
        </button>
      )}

      {(showHistory || showResults) && (
        <div data-testid="global-search-dropdown" className="absolute left-0 right-0 top-full z-[80] mt-1 max-h-[420px] overflow-auto rounded-lg border border-[#E8E6E3] bg-white py-1.5 shadow-xl">
          {showHistory && (
            <>
              <div className="flex items-center justify-between px-3 py-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">Recent searches</span>
                <button data-testid="global-search-clear-history" onClick={clearHistory} className="text-[11px] font-medium text-[#EA5400] hover:underline">Clear all</button>
              </div>
              {history.map((h) => (
                <button key={h} data-testid={`global-search-history-${h}`} onClick={() => setQ(h)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-[#F4F4F2]">
                  <Clock size={13} className="shrink-0 text-[#9A948E]" /> {h}
                </button>
              ))}
            </>
          )}

          {showResults && loading && (
            <div className="flex items-center gap-2 px-3 py-3 text-[13px] text-[#6B6660]"><Loader2 size={14} className="animate-spin" /> Searching…</div>
          )}
          {showResults && !loading && err && (
            <div data-testid="global-search-error" className="px-3 py-3 text-[13px] text-[#B42318]">{err}</div>
          )}
          {showResults && !loading && !err && hits.length === 0 && (
            <div data-testid="global-search-empty" className="px-3 py-3 text-[13px] text-[#6B6660]">No match for “{q.trim()}”.</div>
          )}
          {showResults && !loading && !err && grouped.map(({ group, items }) => (
            <div key={group}>
              <div className="px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">{group}</div>
              {items.map((h) => {
                const HIcon = h.icon;
                return (
                  <button key={h.key} data-testid={`global-search-hit-${h.key}`} onClick={() => run(h)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[#F4F4F2]">
                    <HIcon size={15} className="shrink-0 text-[#9A948E]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{h.title}</span>
                      <span className="block truncate text-[11px] text-[#9A948E]">{h.subtitle}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

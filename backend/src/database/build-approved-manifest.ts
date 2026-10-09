import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * Builds `.claude-project/clients/_approved.yaml` — the list of finished projects the learning engine treats
 * as approved ground truth. Rule (from the user): the LAST-created version of each proposal/budget is the
 * final one, produced after rounds of feedback. So per project we take the latest-modified budget (.xlsx) and
 * proposal (.docx); older copies are kept as `drafts` (draft → final deltas feed the correction priors).
 *
 * The file is a reviewable artifact: edit it (exclude, override weeks/template) and re-run ingest:approved.
 * Re-running this builder preserves manual `exclude`, `weeks`, `template` and `note` overrides.
 *
 * Usage: npx ts-node src/database/build-approved-manifest.ts
 */
const HOME = process.env.USERPROFILE || process.env.HOME || '';
const ROOTS = [path.join(HOME, 'Downloads'), path.resolve(__dirname, '..', '..', '..', '.claude-project', 'clients')];
const OUT = path.resolve(__dirname, '..', '..', '..', '.claude-project', 'clients', '_approved.yaml');

/** Never training data: rate sheets, tender annexures, estimation sheets, and projects the user excluded. */
const EXCLUDE = [/head-cost/i, /annexure/i, /estimation/i, /^features\.xlsx$/i, /\bidcol\b/i, /\bdrs\b/i, /payment_terms/i, /clarification/i];
/** Projects excluded by decision, with the reason recorded in the manifest. */
const EXCLUDED_PROJECTS: Record<string, string> = {
  idcol: 'excluded by user — conflicting final versions',
  drs: 'excluded by user — conflicting final versions (IDCOL DRS)',
  'city bank lms': 'multi-item tender budget (11 sheets) — not a single house-format sheet',
};
const STOP = new Set(['the', 'and', 'for', 'of', 'budget', 'proposal', 'technical', 'financial', 'commercial', 'riseup', 'labs', 'final', 'draft', 'v2', 'v3', 'usd', 'bdt', 'with', 'docx', 'xlsx', 'development',
  // generic product words — never enough on their own to say two files are the same project
  'mobile', 'application', 'app', 'website', 'web', 'platform', 'system', 'software', 'integrated', 'management', 'corporate', 'design', 'scope', 'project', 'service', 'services', 'solution', 'phase1', 'mvp', 'ltd']);

export interface ApprovedEntry {
  key: string;
  title: string;
  budget: string;
  proposal?: string;
  truthMd?: string;
  drafts?: string[];
  finalAt: string;
  template?: 'global' | 'local' | 'agency';
  weeks?: number;
  exclude?: boolean;
  /** The paired proposal is a different deliverable — learn from the budget (and truth md) only. */
  noProposal?: boolean;
  note?: string;
}

const words = (f: string): string[] =>
  path.basename(f).replace(/\.[a-z0-9]+$/i, '').replace(/\(\d+\)/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
const overlap = (a: string[], b: string[]) => a.filter((w) => b.includes(w)).length;
const mtime = (f: string) => fs.statSync(f).mtimeMs;

function walk(dir: string, depth = 0, out: string[] = []): string[] {
  if (!fs.existsSync(dir) || depth > 3) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.git/.test(e.name)) walk(p, depth + 1, out); }
    else out.push(p);
  }
  return out;
}

export function buildManifest(): ApprovedEntry[] {
  const files = ROOTS.flatMap((r) => walk(r)).filter((f) => !EXCLUDE.some((re) => re.test(path.basename(f))));
  const budgets = files.filter((f) => /\.xlsx$/i.test(f) && /budget/i.test(path.basename(f)));
  const proposals = files.filter((f) => /\.docx$/i.test(f) && /proposal/i.test(path.basename(f)));
  const truths = files.filter((f) => /_KNOWLEDGE\.md$/i.test(f));

  // Group budget copies of the same project (one's significant words ⊆ the other's, or ≥2 shared words).
  const groups: string[][] = [];
  for (const b of budgets.sort((x, y) => mtime(y) - mtime(x))) {
    const w = words(b);
    const g = groups.find((grp) => { const gw = words(grp[0]); const o = overlap(w, gw); return o > 0 && o >= Math.min(2, w.length, gw.length) && o / Math.min(w.length, gw.length) >= 0.6; });
    if (g) g.push(b); else groups.push([b]);
  }

  const prior: ApprovedEntry[] = fs.existsSync(OUT) ? ((yaml.load(fs.readFileSync(OUT, 'utf8')) as { projects?: ApprovedEntry[] })?.projects ?? []) : [];
  return groups.map((g) => {
    const latest = g[0];
    const w = words(latest);
    const key = w.slice(0, 4).join('-');
    const props = proposals.map((p) => ({ p, o: overlap(words(p), w) })).filter((x) => x.o >= Math.min(2, w.length) && x.o / Math.min(words(x.p).length || 1, w.length || 1) >= 0.6).sort((a, b) => b.o - a.o || mtime(b.p) - mtime(a.p));
    const bestO = props[0]?.o ?? 0;
    const sameProject = props.filter((x) => x.o === bestO).map((x) => x.p).sort((a, b) => mtime(b) - mtime(a));
    const truth = truths.find((t) => overlap(words(t.replace(/_KNOWLEDGE/i, '')), w) >= 1);
    const title = path.basename(latest).replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/\b(budget|riseup labs)\b/gi, '').replace(/\(\d+\)/g, '').replace(/\s+/g, ' ').trim();
    const excludedBy = Object.entries(EXCLUDED_PROJECTS).find(([k]) => title.toLowerCase().includes(k));
    const old = prior.find((p) => p.key === key);
    const entry: ApprovedEntry = {
      key,
      title,
      budget: latest,
      proposal: sameProject[0],
      truthMd: truth,
      drafts: [...g.slice(1), ...sameProject.slice(1)],
      finalAt: new Date(Math.max(mtime(latest), sameProject[0] ? mtime(sameProject[0]) : 0)).toISOString(),
    };
    if (excludedBy) { entry.exclude = true; entry.note = excludedBy[1]; }
    if (old) for (const k of ['exclude', 'weeks', 'template', 'note', 'noProposal'] as const) if (old[k] !== undefined) (entry as unknown as Record<string, unknown>)[k] = old[k];
    if (entry.noProposal) delete entry.proposal;
    if (!entry.drafts?.length) delete entry.drafts;
    return entry;
  });
}

if (require.main === module) {
  const projects = buildManifest();
  const header =
    '# Approved corpus — the user\'s FINAL versions (latest file after rounds of feedback).\n' +
    '# Edit freely: set `exclude: true`, or override `weeks` / `template` (global|local|agency), then run\n' +
    '#   npm run ingest:approved\n' +
    '# Re-running build-approved-manifest keeps these manual overrides.\n';
  fs.writeFileSync(OUT, header + yaml.dump({ projects }, { lineWidth: 200 }));
  const used = projects.filter((p) => !p.exclude);
  console.log(`Wrote ${OUT}\n${used.length} projects to ingest, ${projects.length - used.length} excluded.`);
  for (const p of projects) console.log(`${p.exclude ? '  ✗' : '  ✓'} ${p.title.padEnd(70)} proposal:${p.proposal ? 'yes' : 'NO '} drafts:${p.drafts?.length ?? 0}${p.note ? '  — ' + p.note : ''}`);
}

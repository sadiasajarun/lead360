/**
 * iconResolver — turns an icon *name* into an inline SVG string.
 *
 * Priority: devicon (tech stack, multi-color, first) -> simple-icons (brand) ->
 * lucide-static (feature/module). Everything is read from the installed packs and
 * returned inline, so the proposal's icons are self-contained (CSP-safe, identical
 * on web + PDF). Resolution happens once at generation time; the resolved SVGs are
 * stored in the document's iconMap and both renderers just inject them.
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import type { Block, ProposalDocument } from '../../modules/generation/blocks/block.types';

/** Find <pkg>/icons by walking up from here to the nearest node_modules (robust vs. `exports`). */
function packDir(pkg: string): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const cand = join(dir, 'node_modules', pkg, 'icons');
    if (existsSync(cand)) return cand;
    dir = dirname(dir);
  }
  return join(process.cwd(), 'node_modules', pkg, 'icons');
}
const DEVICON = packDir('devicon');
const SIMPLE = packDir('simple-icons');
const LUCIDE = packDir('lucide-static');

/** Common name -> devicon family slug. */
const TECH_ALIAS: Record<string, string> = {
  aws: 'amazonwebservices', 'amazon web services': 'amazonwebservices',
  node: 'nodejs', 'node.js': 'nodejs', nodejs: 'nodejs',
  postgres: 'postgresql', postgre: 'postgresql',
  next: 'nextjs', 'next.js': 'nextjs',
  react: 'react', reactjs: 'react', 'react native': 'react',
  vue: 'vuejs', 'vue.js': 'vuejs',
  k8s: 'kubernetes', golang: 'go', 'c#': 'csharp', 'c++': 'cplusplus',
  tailwind: 'tailwindcss', 'tailwind css': 'tailwindcss',
  gcp: 'googlecloud', 'google cloud': 'googlecloud',
  ms: 'microsoftsqlserver', mssql: 'microsoftsqlserver',
};

const clean = (svg: string) =>
  svg.replace(/<!--[\s\S]*?-->/g, '').replace(/<title>[\s\S]*?<\/title>/i, '').trim();

const slug = (name: string) => name.trim().toLowerCase();
const tight = (name: string) => slug(name).replace(/[^a-z0-9]/g, ''); // for pack filenames

const cache = new Map<string, string | null>();

function fromDevicon(name: string): string | null {
  const fam = TECH_ALIAS[slug(name)] ?? tight(name);
  const dir = join(DEVICON, fam);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.svg'));
  const pick =
    files.find((f) => f === `${fam}-original.svg`) ??
    files.find((f) => f === `${fam}-plain.svg`) ??
    files.find((f) => f.includes('-original')) ??
    files.find((f) => f.includes('-plain')) ??
    files[0];
  return pick ? clean(readFileSync(join(dir, pick), 'utf8')) : null;
}

function fromPackFile(base: string, name: string): string | null {
  // try tight slug then kebab (lucide names are kebab)
  for (const cand of [tight(name), slug(name).replace(/[^a-z0-9]+/g, '-')]) {
    const p = join(base, `${cand}.svg`);
    if (existsSync(p)) return clean(readFileSync(p, 'utf8'));
  }
  return null;
}

/** Resolve a single icon name to inline SVG, or null if nothing matches. */
export function resolveIcon(name: string): string | null {
  if (!name) return null;
  const key = slug(name);
  if (cache.has(key)) return cache.get(key)!;
  const svg = fromDevicon(name) ?? fromPackFile(SIMPLE, name) ?? fromPackFile(LUCIDE, name);
  cache.set(key, svg);
  return svg;
}

/** Collect every icon name referenced anywhere in a document's blocks. */
export function collectIconNames(doc: ProposalDocument): string[] {
  const names = new Set<string>();
  const add = (v?: string) => { if (v) names.add(v); };
  const scan = (b: Block) => {
    switch (b.type) {
      case 'overview': b.stats.forEach((s) => add(s.icon)); break;
      case 'scope': b.modules.forEach((m) => add(m.icon)); break;
      case 'layeredArchitecture': b.layers.forEach((l) => l.modules.forEach((m) => add(m.icon))); break;
      case 'vendorArchitecture':
        b.tiers.forEach((n) => add(n.icon));
        b.group?.services.forEach((n) => add(n.icon));
        b.data?.forEach((n) => add(n.icon));
        break;
      case 'numberedFlow': b.steps.forEach((s) => add(s.icon)); add(b.rulesBar?.icon); break;
      case 'featureMatrix': b.modules.forEach((m) => add(m.icon)); break;
      case 'teamAllocation': b.members.forEach((m) => add(m.icon)); break;
      default: break;
    }
  };
  doc.blocks.forEach(scan);
  return [...names];
}

/** Build the { name -> svg } map for a document (skips names that don't resolve). */
export function buildIconMap(doc: ProposalDocument): Record<string, string> {
  const map: Record<string, string> = {};
  for (const name of collectIconNames(doc)) {
    const svg = resolveIcon(name);
    if (svg) map[name] = svg;
  }
  return map;
}

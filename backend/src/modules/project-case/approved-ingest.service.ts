import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { AiService } from '../../infrastructure/ai/ai.service';
import { ProjectCaseRepository } from './project-case.repository';
import { parseHouseBudget, type HouseBudget } from './house-budget.parser';
import { parseProposalDocx, type ProposalFacts } from './proposal-docx.parser';
import { MODULE_TYPE_KEYS, baseModuleDays, guessComplexity, guessType, normalizeComplexity, normalizeType } from '../generation/engine/module-taxonomy';
import type { ApprovedEntry } from '../../database/build-approved-manifest';

const EMBED_DIM = 768;
const STOP = new Set(['the', 'and', 'for', 'app', 'platform', 'system', 'project', 'proposal', 'budget', 'technical', 'financial', 'final', 'draft', 'with', 'a', 'an', 'of', 'to', 'in', 'on']);
const tagsOf = (...parts: string[]): string[] => {
  const s = new Set<string>();
  for (const p of parts) for (const w of (p || '').toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 2 && !STOP.has(w)) s.add(w);
  return [...s];
};

/** One feature as it appeared in an approved proposal — the raw input to the feature memory (Phase 2). */
export interface RawFeature {
  name: string;
  type: string;
  /** Domain-free description of what the feature does, e.g. "checkout, payment gateway, discount codes". */
  capability: string;
  subFeatures: string[];
  signals: { entities?: string[]; operations?: string; roles?: number; integrations?: string[]; platforms?: string[] };
}

interface Extracted {
  domain?: string;
  summary?: string;
  modules?: string[];
  moduleProfiles?: { name?: string; type?: string; complexity?: string }[];
  stack?: string[];
  integrations?: string[];
  features?: Partial<RawFeature>[];
}

export interface ApprovedIngestResult {
  ingested: { key: string; title: string; template: string; currency: string; weeks?: number; effortDays: number; total: number; phases: number; features: number }[];
  skipped: { key: string; reason: string }[];
}

/**
 * Imports the user's APPROVED corpus — the final proposal + budget of each finished project (latest file after
 * rounds of feedback) — as gold ProjectCases. Delivery facts (team, days, rates, total, weeks, phases) come
 * from parsing the files directly; one AI call per project extracts only the descriptive layer (domain,
 * modules, stack, per-feature capability + scale signals). Idempotent: upserts by manifest key.
 */
@Injectable()
export class ApprovedIngestService {
  private readonly logger = new Logger(ApprovedIngestService.name);

  constructor(
    private readonly cases: ProjectCaseRepository,
    private readonly ai: AiService,
  ) {}

  async ingestManifest(manifestPath: string, opts: { only?: string[] } = {}): Promise<ApprovedIngestResult> {
    const doc = yaml.load(fs.readFileSync(manifestPath, 'utf8')) as { projects?: ApprovedEntry[] };
    const result: ApprovedIngestResult = { ingested: [], skipped: [] };
    await this.cases.ensureVectorColumn(EMBED_DIM);
    await this.cases.ensureGoldColumns();
    for (const e of doc.projects ?? []) {
      if (opts.only?.length && !opts.only.includes(e.key)) continue;
      if (e.exclude) { result.skipped.push({ key: e.key, reason: e.note ?? 'excluded' }); continue; }
      try {
        const r = await this.ingestOne(e);
        if (r) result.ingested.push(r); else result.skipped.push({ key: e.key, reason: 'no house-format budget table' });
      } catch (err) {
        this.logger.warn(`approved ingest failed for ${e.key}: ${String(err)}`);
        result.skipped.push({ key: e.key, reason: String(err).slice(0, 200) });
      }
    }
    return result;
  }

  private async ingestOne(e: ApprovedEntry): Promise<ApprovedIngestResult['ingested'][number] | null> {
    const budget = await parseHouseBudget(e.budget);
    if (!budget) return null;
    const facts: ProposalFacts | null = e.proposal && fs.existsSync(e.proposal) ? await parseProposalDocx(e.proposal) : null;
    const truth = e.truthMd && fs.existsSync(e.truthMd) ? fs.readFileSync(e.truthMd, 'utf8') : '';

    const weeks = e.weeks ?? budget.weeks ?? facts?.weeks;
    const template = e.template ?? (budget.currency === 'BDT' ? 'local' : 'global');
    const extracted = this.ai.enabled ? await this.extract(e.title, facts?.text ?? '', truth, budget) : ({} as Extracted);

    const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : []);
    const modules = strArr(extracted.modules);
    const stack = strArr(extracted.stack);
    const integrations = strArr(extracted.integrations);
    const team = budget.lines.map((l) => ({ role: l.role, seniority: l.seniority, units: Math.round(l.units), days: Math.round(l.days) }));

    // Module profiles carry the project's REAL effort attributed by base weight (Phase 2 replaces attribution
    // with measured per-feature effort where the approved phase tables allow it).
    const classified = (extracted.moduleProfiles ?? [])
      .filter((m) => m?.name)
      .map((m) => ({ name: String(m.name).trim(), type: normalizeType(m.type), complexity: normalizeComplexity(m.complexity) }));
    for (const name of modules) if (!classified.some((c) => c.name.toLowerCase() === name.toLowerCase())) classified.push({ name, type: guessType(name), complexity: guessComplexity(name) });
    const weights = classified.map((c) => baseModuleDays(c.type, c.complexity));
    const sumW = weights.reduce((s, w) => s + w, 0) || 1;
    const moduleProfiles = classified.map((c, i) => ({ name: c.name, type: c.type, complexity: c.complexity, days: Math.max(1, Math.round((budget.effortDays * weights[i]) / sumW)) }));

    const features: RawFeature[] = (extracted.features ?? [])
      .filter((f) => f?.name)
      .map((f) => ({
        name: String(f.name).trim(),
        type: normalizeType(f.type),
        capability: String(f.capability ?? f.name).trim(),
        subFeatures: strArr(f.subFeatures),
        signals: (f.signals ?? {}) as RawFeature['signals'],
      }));

    const headcount = team.reduce((s, t) => s + t.units, 0);
    const scopeSize = headcount >= 10 || (weeks ?? 0) >= 16 ? 'large' : headcount <= 4 && (weeks ?? 99) <= 6 ? 'small' : 'medium';
    const phases = (facts?.phases ?? []).map((p) => ({ name: p.name, weeks: p.weeks ?? 0 }));

    const fields = {
      title: e.title,
      template,
      domain: extracted.domain,
      tags: tagsOf(e.title, extracted.domain ?? '', modules.join(' '), stack.join(' '), integrations.join(' ')),
      scopeSize,
      moduleCount: modules.length,
      integrationCount: integrations.length,
      modules,
      moduleProfiles,
      stack,
      team,
      phases,
      timelineWeeks: weeks ? Math.round(weeks) : undefined,
      budgetTotalCents: String(Math.round(budget.total * 100)),
      currency: budget.currency,
      sectionStructure: facts?.sections ?? [],
      quality: 'gold',
      sourceKind: 'approved_manual',
      sourcePath: e.key,
      effortDays: String(budget.effortDays),
      featuresRaw: { features, integrations, summary: extracted.summary ?? '', drafts: e.drafts ?? [] },
      finalAt: new Date(e.finalAt),
    };

    const existing = await this.cases.findBySourcePath(e.key);
    const saved = existing ? await this.cases.update(existing.id, fields as never) : await this.cases.create(fields as never);
    const id = (saved as { id?: string } | null)?.id ?? existing?.id;
    if (id && this.ai.enabled) {
      const embedText = [e.title, extracted.domain ?? '', extracted.summary ?? '', modules.length ? `modules: ${modules.join(', ')}` : '', integrations.length ? `integrations: ${integrations.join(', ')}` : '', stack.length ? `stack: ${stack.join(', ')}` : '']
        .filter(Boolean).join('\n');
      const [vec] = await this.ai.embed([embedText]);
      if (vec) await this.cases.saveEmbedding(id, vec);
    }
    this.logger.log(`gold case ✓ ${e.title}: ${template}/${budget.currency} · ${weeks ?? '?'} wks · ${budget.effortDays} pd · ${budget.total} · ${phases.length} phases · ${features.length} features`);
    return { key: e.key, title: e.title, template, currency: budget.currency, weeks, effortDays: budget.effortDays, total: budget.total, phases: phases.length, features: features.length };
  }

  private async extract(title: string, proposalText: string, truthMd: string, budget: HouseBudget): Promise<Extracted> {
    const roles = budget.lines.map((l) => `${l.role} (${l.seniority}) × ${l.units}, ${l.days} days`).join('; ');
    const source = [proposalText ? `PROPOSAL:\n${proposalText.slice(0, 22000)}` : '', truthMd ? `PROJECT NOTES:\n${truthMd.slice(0, 8000)}` : '', `BUDGET TEAM: ${roles}`].filter(Boolean).join('\n\n');
    const { data } = await this.ai.json<Extracted>({
      label: 'approved-case-extract',
      system: "You extract structured facts from a FINAL, client-approved Riseup Labs proposal. Use ONLY what the documents state — never invent features, numbers or technologies. Omit anything not stated.",
      maxTokens: 7000,
      prompt:
        'Return JSON with EXACTLY these keys:\n' +
        '{\n' +
        '  "domain": short domain phrase (e.g. "kids football family organiser app"),\n' +
        '  "summary": one sentence describing what was built,\n' +
        '  "modules": string[] — the main modules/feature groups scoped,\n' +
        `  "moduleProfiles": [{ "name": a module from "modules", "type": one of [${MODULE_TYPE_KEYS.join(', ')}], "complexity": "simple"|"moderate"|"complex"|"very-complex" }],\n` +
        '  "stack": string[] — technologies chosen,\n' +
        '  "integrations": string[] — external systems/services integrated (payment gateways, CRMs, SMS, maps…),\n' +
        '  "features": [{\n' +
        '     "name": the feature as named in the proposal,\n' +
        `     "type": one of [${MODULE_TYPE_KEYS.join(', ')}],\n` +
        '     "capability": what it does in DOMAIN-FREE words, so it matches the same capability in other industries (e.g. "checkout with payment gateway, discount codes and order confirmation" — not "ticket checkout for football fans"),\n' +
        '     "subFeatures": string[] — the concrete sub-capabilities listed,\n' +
        '     "signals": { "entities": string[] (data objects it manages, e.g. ["products","site pages","banners"]), "operations": "view"|"crud"|"workflow" (workflow = approvals/states/scheduling), "roles": number of user roles involved, "integrations": string[], "platforms": string[] (web, iOS, Android, admin, VR…) }\n' +
        '  }] — one entry per distinct feature/module actually in scope (6–25 typical)\n' +
        '}\n' +
        `Project: "${title}".\n\n${source}`,
    });
    return data ?? {};
  }
}

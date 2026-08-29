import { Injectable, Logger } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { existsSync } from 'fs';
import { join } from 'path';
import { AiService } from '../../infrastructure/ai/ai.service';
import { ProjectCaseRepository } from './project-case.repository';
import { MODULE_TYPE_KEYS, baseModuleDays, guessComplexity, guessType, normalizeComplexity, normalizeType } from '../generation/engine/module-taxonomy';

// Seed corpus on disk: data/kb-seed/{Category}/{Section}/{filename}. npm scripts run from backend/.
const SEED_ROOT = join(process.cwd(), 'data', 'kb-seed');

/**
 * Seed-corpus case ingestion (Learning Engine). Turns Riseup's REAL delivered proposals + budgets (the KB
 * seed corpus) into structured project_cases so the norms/analogs that drive timeline/team/budget are learned
 * from actual projects — not from junk in-app test leads. One AI extraction per project pulls the delivery
 * FACTS (team, development timeline, budget, stack) straight from the documents; never invents numbers.
 */

const CAT_TO_TEMPLATE: Record<string, string> = { Global: 'global', Local: 'local', Agency: 'agency', 'Design Portfolio': 'design_portfolio' };
const SENIORITIES = new Set(['senior', 'mid', 'junior']);
const STOP = new Set(['the', 'and', 'for', 'app', 'platform', 'system', 'project', 'proposal', 'budget', 'technical', 'financial', 'final', 'draft', 'dev', 'with', 'a', 'an', 'of', 'to', 'in', 'on']);

function tagsOf(...parts: string[]): string[] {
  const s = new Set<string>();
  for (const p of parts) for (const w of (p || '').toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 2 && !STOP.has(w)) s.add(w);
  return [...s];
}
function sigWords(t: string): Set<string> {
  return new Set((t || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
}
const posInt = (v: unknown): number | undefined => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : undefined);
const clamp = (v: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(v) || lo)));

@Injectable()
export class SeedCaseIngestService {
  private readonly logger = new Logger(SeedCaseIngestService.name);

  constructor(private readonly cases: ProjectCaseRepository, private readonly ai: AiService) {}

  /**
   * Rebuild cases from the seed corpus. `dropInApp` first soft-deletes the polluting in-app test leads so the
   * norms come only from real delivered projects.
   */
  async ingestSeedCorpus(opts: { dropInApp?: boolean } = {}): Promise<{ total: number; created: number; updated: number; skipped: number; droppedInApp: number }> {
    let droppedInApp = 0;
    if (opts.dropInApp) {
      droppedInApp = await this.cases.softDeleteInAppCases();
      this.logger.log(`Dropped ${droppedInApp} in-app (test-lead) cases before seed rebuild.`);
    }

    const proposals = await this.cases.kbSeedDocs('Proposal');
    const budgets = await this.cases.kbSeedDocs('Budget');
    let created = 0, updated = 0, skipped = 0;

    for (const doc of proposals) {
      try {
        // Resumable: skip a FULLY-populated case (team + budget + timeline) ONLY when it already carries per-role
        // days (Workstream A), or when no budget sheet is pairable to pull them from. A complete-but-day-less case
        // that HAS a budget is re-extracted so the "No. of Days" column fills in; missing cases always re-extract.
        const prior = await this.cases.findBySourceDoc(doc.id);
        const budget = this.bestBudget(doc, budgets);
        const priorHasDays = !!prior?.team?.some((m) => m.days != null);
        const priorHasModules = !!prior?.moduleProfiles?.length;
        if (prior && prior.team?.length && Number(prior.budgetTotalCents) > 0 && prior.timelineWeeks && priorHasModules && (priorHasDays || !budget)) { skipped++; continue; }
        const proposalText = await this.cases.kbDocText(doc.id);
        // Pair the best budget doc in the same category (≥2 shared significant title words) for exact numbers.
        // Budgets are .xlsx sidecars — read the SPREADSHEET directly (clean tab-separated rows) rather than the
        // garbled kb_chunks text, so team, day-rates and totals actually extract (Global/Local RC3 fix).
        let budgetText = '';
        if (budget) {
          if (/\.xlsx?$/i.test(budget.title)) budgetText = await this.xlsxToText(doc.category, budget.title);
          if (!budgetText) budgetText = await this.cases.kbDocText(budget.id);
        }
        // Reserve room for the budget so a long proposal can't truncate it away (the team/rates/totals live in
        // the budget, and slicing `proposal + budget` at 16k dropped them for every long Global/Local brief).
        const proposalSlice = proposalText.slice(0, 14000);
        const budgetSlice = budgetText.slice(0, 10000);
        const combined = budgetSlice
          ? `PROPOSAL:\n${proposalSlice}\n\nBUDGET SHEET (actual team, day-rates and totals):\n${budgetSlice}`.trim()
          : proposalSlice.trim();
        if (combined.length < 200) { skipped++; continue; }

        const draft = await this.extract(doc, combined);
        if (!draft) { skipped++; continue; }

        const saved = prior ? await this.cases.update(prior.id, draft.fields) : await this.cases.create(draft.fields);
        if (saved && this.ai.enabled && draft.embedText.trim()) {
          try { const [vec] = await this.ai.embed([draft.embedText]); if (vec) await this.cases.saveEmbedding(saved.id, vec); }
          catch (e) { this.logger.warn(`Seed case embed skipped for "${doc.title}": ${String(e)}`); }
        }
        prior ? updated++ : created++;
      } catch (e) {
        this.logger.warn(`Seed case failed for "${doc.title}": ${String(e)}`);
        skipped++;
      }
    }
    this.logger.log(`Seed corpus ingest: ${created} created, ${updated} updated, ${skipped} skipped of ${proposals.length} proposals.`);
    return { total: proposals.length, created, updated, skipped, droppedInApp };
  }

  private bestBudget(doc: { title: string; category: string }, budgets: { id: string; title: string; category: string }[]): { id: string; title: string } | undefined {
    const dw = sigWords(doc.title);
    let best: { id: string; title: string } | undefined;
    let bestN = 0;
    for (const b of budgets) {
      if (b.category !== doc.category) continue;
      const overlap = [...sigWords(b.title)].filter((w) => dw.has(w)).length;
      if (overlap > bestN) { bestN = overlap; best = b; }
    }
    return bestN >= 2 ? best : undefined;
  }

  /** Read a budget .xlsx from disk into clean tab-separated text (all sheets/rows/cells) for extraction —
   *  spreadsheets turn to garbage through the kb_chunks text path, which is why Global/Local cases had no
   *  team or budget. Returns '' when the file isn't on disk (caller then falls back to kb text). */
  private async xlsxToText(category: string, title: string): Promise<string> {
    const path = join(SEED_ROOT, category, 'Budget', title);
    if (!existsSync(path)) return '';
    try {
      const wb = new Workbook();
      await wb.xlsx.readFile(path);
      const lines: string[] = [];
      wb.eachSheet((ws) => {
        lines.push(`# Sheet: ${ws.name}`);
        ws.eachRow({ includeEmpty: false }, (row) => {
          const cells: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell) => {
            const v = cell.value as unknown;
            let s = '';
            if (v == null) s = '';
            else if (typeof v === 'object') {
              const o = v as { result?: unknown; text?: unknown; richText?: { text?: string }[]; hyperlink?: string };
              s = String(o.result ?? o.text ?? o.richText?.map((r) => r.text ?? '').join('') ?? o.hyperlink ?? '');
            } else s = String(v);
            cells.push(s.trim());
          });
          if (cells.some((c) => c)) lines.push(cells.join('\t'));
        });
      });
      return lines.join('\n').slice(0, 24000);
    } catch (e) {
      this.logger.warn(`xlsx read failed for "${title}": ${String(e)}`);
      return '';
    }
  }

  private async extract(doc: { id: string; title: string; category: string }, text: string) {
    const { data } = await this.ai.json<{
      domain?: string;
      modules?: string[];
      moduleProfiles?: { name?: string; type?: string; complexity?: string }[];
      stack?: string[];
      team?: { role?: string; seniority?: string; units?: number; days?: number }[];
      timelineWeeks?: number;
      budgetTotal?: number;
      currency?: string;
    }>({
      label: 'seed-case-extract',
      system: "You extract the DELIVERY FACTS from a REAL Riseup Labs proposal/budget. Extract ONLY what the documents state — never invent numbers, roles, or costs. Leave a field empty/absent when the documents don't state it.",
      maxTokens: 800,
      prompt:
        'From this real proposal (and its budget, if present), extract JSON with EXACTLY these keys:\n' +
        '{\n' +
        '  "domain": short domain phrase (e.g. "FemTech wellness iOS app"),\n' +
        '  "modules": string[] — the main modules/features actually scoped,\n' +
        `  "moduleProfiles": [{ "name": string (a module from "modules"), "type": one of [${MODULE_TYPE_KEYS.join(', ')}], "complexity": "simple"|"moderate"|"complex"|"very-complex" }] — classify EACH module by type + build complexity (judge from what it involves: data, integrations, real-time, roles). One entry per module,\n` +
        '  "stack": string[] — the specific technologies chosen (e.g. "SwiftUI", "Supabase", "NestJS"),\n' +
        '  "team": [{ "role": string, "seniority": "senior"|"mid"|"junior", "units": number, "days": number }] — the ACTUAL team from the budget/HR section. "days" = that role\'s "No. of Days" (effective man-days it actually worked) straight from the budget sheet\'s days column; omit "days" only if the sheet has no such column,\n' +
        '  "timelineWeeks": number — the DEVELOPMENT / build duration in WEEKS (NOT the contract term, support window, or client-side rollout/monitoring period). Convert months ×4.33 (e.g. "6.5 weeks"->7, "2.5 months"->11, "5.5-month contract with 2.5-month build"->11).\n' +
        '  "budgetTotal": number — the TOTAL project cost as a plain number in MAJOR units (5000 for $5,000; 1000000 for BDT 1,000,000). Omit if not stated.\n' +
        '  "currency": "USD" or "BDT"\n' +
        '}\n' +
        `Project: "${doc.title}" (category ${doc.category}). Extract only stated facts; omit unknowns; never invent.\n\nDOCUMENT:\n${text}`,
    });

    const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()) : []);
    const modules = strArr(data.modules);
    const stack = strArr(data.stack);
    const team = (data.team ?? [])
      .filter((t) => t && typeof t.role === 'string' && t.role.trim())
      .map((t) => ({
        role: String(t.role).trim(),
        seniority: SENIORITIES.has(String(t.seniority)) ? String(t.seniority) : 'mid',
        units: clamp(t.units, 1, 20),
        days: Number(t.days) > 0 ? Math.round(Number(t.days)) : undefined,
      }));
    const timelineWeeks = posInt(data.timelineWeeks);
    if (!team.length && !timelineWeeks) return null; // no usable delivery facts

    // Module profiles: classify each module (from the AI, else heuristic) and ATTRIBUTE the project's real
    // total effective man-days across them by the base type/complexity weight — so the learned per-module
    // effort has a REAL absolute scale even though the corpus never itemises effort per module.
    const classified = (data.moduleProfiles ?? [])
      .filter((m) => m?.name && typeof m.name === 'string')
      .map((m) => ({ name: String(m.name).trim(), type: normalizeType(m.type), complexity: normalizeComplexity(m.complexity) }));
    for (const name of modules) {
      if (!classified.some((c) => c.name.toLowerCase() === name.toLowerCase())) classified.push({ name, type: guessType(name), complexity: guessComplexity(name) });
    }
    const projectDevDays = team.reduce((s, t) => s + (Number(t.units) || 1) * (Number(t.days) || 0), 0);
    const weights = classified.map((c) => baseModuleDays(c.type, c.complexity));
    const sumW = weights.reduce((s, w) => s + w, 0) || 1;
    const moduleProfiles = classified.map((c, i) => ({
      name: c.name,
      type: c.type,
      complexity: c.complexity,
      days: projectDevDays > 0 ? Math.max(1, Math.round((projectDevDays * weights[i]) / sumW)) : weights[i],
    }));

    const totalCents = Number(data.budgetTotal) > 0 ? Math.round(Number(data.budgetTotal) * 100) : 0;
    const currency = data.currency === 'BDT' ? 'BDT' : 'USD';
    const headcount = team.reduce((s, t) => s + t.units, 0);
    const scopeSize = headcount >= 10 || (timelineWeeks ?? 0) >= 16 ? 'large' : headcount <= 4 && (timelineWeeks ?? 99) <= 6 ? 'small' : 'medium';
    const title = doc.title.replace(/\.[a-z0-9]+$/i, '').replace(/\b(technical|financial|proposal|budget|final|draft|dev|v\d+)\b/gi, '').replace(/\s+/g, ' ').trim() || doc.title;

    return {
      fields: {
        title,
        template: CAT_TO_TEMPLATE[doc.category] ?? 'agency',
        domain: data.domain ? String(data.domain) : undefined,
        tags: tagsOf(doc.title, data.domain ?? '', modules.join(' '), stack.join(' ')),
        scopeSize,
        moduleCount: modules.length,
        integrationCount: 0,
        modules,
        moduleProfiles,
        stack,
        team,
        phases: [],
        timelineWeeks: timelineWeeks ?? undefined,
        budgetTotalCents: String(Math.max(0, totalCents)),
        currency,
        sectionStructure: [],
        sourceDocId: doc.id,
      },
      embedText: [doc.title, data.domain ?? '', modules.length ? `modules: ${modules.join(', ')}` : '', stack.length ? `stack: ${stack.join(', ')}` : '']
        .filter(Boolean).join('\n'),
    };
  }
}

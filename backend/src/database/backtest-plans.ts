import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { UnderstandService } from '../modules/generation/engine/understand.service';
import { DecideService } from '../modules/generation/engine/decide.service';
import { caseExclusion } from '../modules/project-case/project-case.repository';
import type { TemplateCategory } from '../modules/generation/blocks/block.types';
import { BudgetCurrency } from '../common/enums';

/**
 * Accuracy backtest — leave-one-out over the user's APPROVED ("gold") projects.
 *
 * For every gold case: build a brief from its scope (no numbers), run Understand → Decide with that case
 * hidden from retrieval, and compare the plan with what the user actually approved: phase count, weeks,
 * effort (person-days), total (same currency) and team roles. Writes BACKTEST.md + a JSON run file so
 * runs can be compared phase by phase (a flag may only go "on" if it is not worse on any metric).
 *
 * Briefs are reconstructed from the approved proposal's scope (the original client briefs are not all on
 * file) — they carry modules/features/platforms only, never weeks, team or money.
 *
 * Usage: npm run backtest -- <label> [key ...]       e.g.  npm run backtest -- baseline-v1
 * Cost: ~2–3 AI calls per case (≈ $0.04), ≈ $1 for the whole corpus.
 */
interface GoldRow {
  id: string;
  title: string;
  template: TemplateCategory;
  currency: string;
  timeline_weeks: number | null;
  budget_total_cents: string;
  effort_days: string | null;
  phases: { name: string; weeks: number }[];
  team: { role: string; seniority: string; units: number; days?: number }[];
  modules: string[];
  source_path: string;
  features_raw: { summary?: string; features?: { name: string; capability?: string; subFeatures?: string[]; signals?: { platforms?: string[] } }[]; integrations?: string[] } | null;
}

export interface CaseResult {
  key: string;
  title: string;
  truth: { phases: number; weeks: number | null; effort: number; total: number; roles: string[] };
  plan: { phases: number; weeks: number; effort: number; total: number; roles: string[] };
  err: { phases?: number; weeks?: number; effort?: number; total?: number; roles: number };
  error?: string;
}

const pctErr = (plan: number, truth: number | null | undefined): number | undefined => (truth && truth > 0 ? Math.abs(plan - truth) / truth : undefined);
const roleKey = (r: string) => r.toLowerCase().replace(/\b(sr|senior|mid|junior|jr)\.?\b/g, '').replace(/[^a-z]+/g, ' ').trim().split(' ').filter((w) => w.length > 2).slice(0, 2).join(' ');
const jaccard = (a: string[], b: string[]) => { const A = new Set(a), B = new Set(b); const i = [...A].filter((x) => B.has(x)).length; const u = new Set([...A, ...B]).size; return u ? i / u : 1; };

function briefOf(c: GoldRow): string {
  const f = c.features_raw ?? {};
  const platforms = new Set<string>();
  for (const x of f.features ?? []) for (const p of x.signals?.platforms ?? []) platforms.add(p);
  return [
    `Project: ${c.title}`,
    f.summary ? `Overview: ${f.summary}` : '',
    platforms.size ? `Platforms: ${[...platforms].join(', ')}` : '',
    'Required features:',
    ...(f.features ?? []).map((x) => `- ${x.name}${x.subFeatures?.length ? `: ${x.subFeatures.join('; ')}` : ''}`),
    !(f.features ?? []).length && c.modules.length ? c.modules.map((m) => `- ${m}`).join('\n') : '',
    f.integrations?.length ? `Integrations: ${f.integrations.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

async function main() {
  const label = (process.argv[2] ?? `run-${new Date().toISOString().slice(0, 10)}`).replace(/[^a-z0-9._-]+/gi, '-');
  const only = process.argv.slice(3);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const out: CaseResult[] = [];
  try {
    const ds = app.get(DataSource);
    const understand = app.get(UnderstandService, { strict: false });
    const decide = app.get(DecideService, { strict: false });
    const rows = (await ds.query(
      `SELECT id, title, template, currency, timeline_weeks, budget_total_cents, effort_days, phases, team, modules, source_path, features_raw
         FROM project_cases WHERE deleted_at IS NULL AND quality = 'gold' ORDER BY title`,
    )) as GoldRow[];
    for (const c of rows.filter((r) => !only.length || only.includes(r.source_path))) {
      const truth = {
        phases: (c.phases ?? []).length,
        weeks: c.timeline_weeks,
        effort: Number(c.effort_days ?? 0),
        total: Number(c.budget_total_cents) / 100,
        roles: [...new Set(c.team.map((t) => roleKey(t.role)))],
      };
      try {
        const r = await caseExclusion.run([c.id], async () => {
          const { intent } = await understand.understand({ brief: briefOf(c), template: c.template, projectType: 'new_build', audience: 'mixed', todayISO: new Date().toISOString() });
          const { decisions } = await decide.decide(intent, c.template, c.currency as BudgetCurrency);
          return decisions;
        });
        const plan = {
          phases: r.phases.length,
          weeks: r.timelineWeeks,
          effort: Math.round(r.resources.reduce((s, x) => s + x.units * x.days, 0)),
          total: r.budget.currency === c.currency ? Math.round(r.budget.totalCents) / 100 : NaN,
          roles: [...new Set(r.resources.map((x) => roleKey(x.role)))],
        };
        out.push({
          key: c.source_path, title: c.title, truth, plan,
          err: { phases: truth.phases ? Math.abs(plan.phases - truth.phases) : undefined, weeks: pctErr(plan.weeks, truth.weeks), effort: pctErr(plan.effort, truth.effort), total: Number.isFinite(plan.total) ? pctErr(plan.total, truth.total) : undefined, roles: 1 - jaccard(plan.roles, truth.roles) },
        });
        console.log(`✓ ${c.title.slice(0, 50).padEnd(50)} wks ${plan.weeks}/${truth.weeks ?? '?'}  pd ${plan.effort}/${truth.effort}  total ${plan.total}/${truth.total}  phases ${plan.phases}/${truth.phases || '?'}`);
      } catch (e) {
        out.push({ key: c.source_path, title: c.title, truth, plan: { phases: 0, weeks: 0, effort: 0, total: 0, roles: [] }, err: { roles: 1 }, error: String(e).slice(0, 200) });
        console.log(`✗ ${c.title}: ${String(e).slice(0, 120)}`);
      }
    }
  } finally {
    await app.close();
  }

  const mean = (xs: (number | undefined)[]) => { const v = xs.filter((x): x is number => Number.isFinite(x as number)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN; };
  const ok = out.filter((r) => !r.error);
  const summary = {
    label, at: new Date().toISOString(), cases: out.length, failed: out.length - ok.length,
    flags: Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('ENGINE_V2_'))),
    phasesAbsErr: mean(ok.map((r) => r.err.phases)), weeksPctErr: mean(ok.map((r) => r.err.weeks)), effortPctErr: mean(ok.map((r) => r.err.effort)),
    totalPctErr: mean(ok.map((r) => r.err.total)), roleMismatch: mean(ok.map((r) => r.err.roles)),
  };
  const dir = path.resolve(__dirname, '..', '..', '..', '.claude-project', 'docs', 'backtest');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${label}.json`), JSON.stringify({ summary, results: out }, null, 2));

  // BACKTEST.md — one row per run, newest first.
  const md = path.resolve(dir, '..', 'BACKTEST.md');
  const pc = (x: number) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '—');
  const row = `| ${label} | ${summary.at.slice(0, 16).replace('T', ' ')} | ${summary.cases - summary.failed}/${summary.cases} | ${Number.isFinite(summary.phasesAbsErr) ? summary.phasesAbsErr.toFixed(2) : '—'} | ${pc(summary.weeksPctErr)} | ${pc(summary.effortPctErr)} | ${pc(summary.totalPctErr)} | ${pc(summary.roleMismatch)} | ${Object.entries(summary.flags).map(([k, v]) => `${k.replace('ENGINE_V2_', '')}=${v}`).join(' ') || 'all off'} |`;
  const head = '# Lead360 accuracy backtest (leave-one-out over approved projects)\n\nLower is better. Phases = mean absolute difference in phase count; other columns = mean absolute % error vs the approved version; Roles = share of team roles that differ.\n\n| Run | When | Cases | Phases Δ | Weeks | Effort | Total | Roles | Flags |\n|---|---|---|---|---|---|---|---|---|\n';
  const prev = fs.existsSync(md) ? fs.readFileSync(md, 'utf8').split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Run') && !l.startsWith('|---')) : [];
  fs.writeFileSync(md, head + [row, ...prev].join('\n') + '\n');
  console.log('\nSUMMARY', JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error('backtest failed:', e);
  process.exit(1);
});

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { basename, join } from 'path';
import { AppModule } from '../app.module';
import { GenerationService } from '../modules/generation/generation.service';
import { LeadService } from '../modules/lead/lead.service';
import { RequirementService } from '../modules/requirement/requirement.service';
import { ProposalService } from '../modules/proposal/proposal.service';
import { BudgetService } from '../modules/budget/budget.service';
import { extractText } from '../common/utils/extract-text.util';
import { TemplateType, BudgetCurrency } from '../common/enums';

/**
 * Regression suite: generate one proposal per template from the REAL client requirement documents in the
 * seed corpus, so the output can be diffed against the real proposal Riseup delivered for the same brief.
 *
 * Deliberately bounded - exactly three generations, no other AI work - because each one spends tokens.
 * Results are written to a JSON file for the comparison step rather than printed and lost.
 *
 * Usage: npx ts-node src/database/run-generation-suite.ts [outfile]
 */

const ROOT = join(__dirname, '../../data/kb-seed');

const CASES = [
  {
    key: 'steel-welding',
    template: TemplateType.GLOBAL,
    title: 'TEST Steel Welding VR Training',
    company: 'Steel Welding',
    requirement: join(ROOT, 'Global/Client requirement/PROJECT OVERVIEW- Steel Welding.docx'),
    reference: join(ROOT, 'Global/Proposal/Steel_Welding_VR_Training_Technical_Proposal_Revised_Duration_Options.docx'),
  },
  {
    key: 'e-learning',
    template: TemplateType.LOCAL,
    title: 'TEST E-Learning Platform',
    company: 'E-Learning',
    requirement: join(ROOT, 'Local/Client requirement/Terms of reference-E-Learning.pdf'),
    reference: join(ROOT, 'Local/Proposal/Technical_Proposal_E_Learning_Digital_Accessibility_Disability_Inclusion.docx'),
  },
  {
    key: 'humm',
    template: TemplateType.AGENCY,
    title: 'TEST Humm Wellness App',
    company: 'Humm',
    requirement: join(ROOT, 'Agency/Client requirement/Hummm - UX_UI Estimation (Final) - Dev Draft.pdf'),
    reference: join(ROOT, 'Agency/Proposal/Humm_Technical_and_Financial_Proposal_iOS_Development.docx'),
  },
];

const MIME: Record<string, string> = {
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pdf': 'application/pdf',
};

async function textOf(path: string): Promise<string> {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  return extractText({ originalname: basename(path), buffer: readFileSync(path), mimetype: MIME[ext] ?? 'application/octet-stream' });
}

void (async () => {
  const out = process.argv[2] ?? join(__dirname, 'generation-suite-result.json');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const generation = app.get(GenerationService);
  const leads = app.get(LeadService);
  const requirements = app.get(RequirementService);
  const proposals = app.get(ProposalService);
  const budgets = app.get(BudgetService);

  const results: Record<string, unknown>[] = [];

  for (const c of CASES) {
    console.log(`\n=========== ${c.key} (${c.template}) ===========`);
    const started = Date.now();
    try {
      const sourceText = await textOf(c.requirement);
      console.log(`requirement: ${basename(c.requirement)} — ${sourceText.length} chars`);

      const lead = await leads.createFor(
        {
          title: c.title,
          company: c.company,
          template: c.template,
          budgetCurrency: c.template === TemplateType.LOCAL ? BudgetCurrency.BDT : BudgetCurrency.USD,
        },
        undefined,
      );
      await requirements.upsert(lead.id, { sourceText });
      console.log(`lead ${lead.id} created; generating…`);

      await generation.generateDocument(lead.id);

      const proposal = await proposals.getForLead(lead.id);
      const { budget, computed } = await budgets.getForLead(lead.id);
      const calc = (proposal as { internalCalc?: Record<string, unknown> } | null)?.internalCalc ?? {};
      const plan = (calc as { plan?: { phases?: { name: string; weeks: number; team: { role: string; seniority: string; units: number; dayRateCents: number }[] }[] } }).plan;

      results.push({
        key: c.key,
        template: c.template,
        leadId: lead.id,
        reference: basename(c.reference),
        requirementChars: sourceText.length,
        elapsedMs: Date.now() - started,
        budget: {
          currency: budget?.currency,
          totalCents: Number(computed?.totalCents ?? 0),
          contingencyPct: Number(budget?.contingencyPct ?? 0),
          discountPct: Number(budget?.discountPct ?? 0),
          lineCount: (budget?.lines ?? []).length,
        },
        budgetFit: (calc as { budgetFit?: unknown }).budgetFit ?? null,
        plan: (plan?.phases ?? []).map((p) => ({
          name: p.name,
          weeks: p.weeks,
          team: (p.team ?? []).map((m) => `${m.role} [${m.seniority}] x${m.units} @${m.dayRateCents}`),
        })),
        totalWeeks: (plan?.phases ?? []).reduce((s, p) => s + (p.weeks || 0), 0),
        blocks: ((proposal?.sections as { blocks?: { type: string }[] } | undefined)?.blocks ?? []).map((b) => b.type),
      });
      console.log(`done in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (e) {
      console.error(`FAILED ${c.key}: ${(e as Error).message}`);
      results.push({ key: c.key, template: c.template, error: (e as Error).message });
    }
  }

  mkdirSync(join(out, '..'), { recursive: true });
  writeFileSync(out, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nwrote ${out}`);
  await app.close();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

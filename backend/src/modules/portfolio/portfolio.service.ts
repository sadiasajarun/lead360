import { Injectable } from '@nestjs/common';
import { PortfolioRepository } from './portfolio.repository';
import { AiService } from '../../infrastructure/ai/ai.service';
import { rulesForShape } from './stack-recommendation';

export interface ComparableProject {
  id: string;
  title: string;
  summary: string;
  detailUrl: string;
  techStack: string[];
  categoryTags?: string[];
  industryTags?: string[];
}

export interface StackEntry {
  technology: string;
  /** Past Riseup projects that used this technology (spec §1 step 4 / §10 "must cite portfolio projects"). */
  evidence: { title: string; detailUrl: string }[];
  /** The stack-recommendation rule (§1) that proposed it, if any. */
  fromRule?: string;
  /** False when the technology comes only from the rule table with no portfolio project behind it. */
  cited: boolean;
}

export interface StackResolution {
  stack: StackEntry[];
  comparableProjects: ComparableProject[];
  /** The §1 rule matched for this brief (transparency — what "shape" the generator thinks this is). */
  matchedRule?: string;
  /** Non-fatal notes, e.g. technologies with no portfolio evidence (auditable per §10). */
  warnings: string[];
}

@Injectable()
export class PortfolioService {
  constructor(
    private readonly repo: PortfolioRepository,
    private readonly ai: AiService,
  ) {}

  list() {
    return this.repo.findAll();
  }

  /** Top-K comparable past projects for a brief (spec §1 step 1). */
  async comparable(brief: string, k = 5): Promise<ComparableProject[]> {
    if (!this.ai.enabled) return [];
    const [vec] = await this.ai.embed([brief.slice(0, 8000)]);
    return this.repo.similar(vec, k);
  }

  /**
   * Spec §1: resolve a tech stack for a brief.
   *  1. vector-search the 3–5 most similar past projects
   *  2. take the union of their tech_stack
   *  3. cross-reference the stack-recommendation table
   *  4. return a rationale citing the past projects that used each technology
   * Never returns "modern industry-standard" filler — every technology carries evidence or a rule.
   */
  async resolveStack(brief: string, k = 5): Promise<StackResolution> {
    const projects = await this.comparable(brief, k);
    const warnings: string[] = [];

    // 2. evidence: which comparable projects use which technology
    const evidence = new Map<string, { title: string; detailUrl: string }[]>();
    for (const p of projects) {
      for (const tech of p.techStack ?? []) {
        const list = evidence.get(tech) ?? [];
        list.push({ title: p.title, detailUrl: p.detailUrl });
        evidence.set(tech, list);
      }
    }

    // 3. cross-reference the stack-recommendation table. The BRIEF is the primary signal for what is
    // being built; the comparables' DOMINANT category is secondary. (Using the union of retrieved
    // categories made a VR brief resolve to an eLearning stack.)
    const counts = new Map<string, number>();
    for (const p of projects) for (const c of p.categoryTags ?? []) counts.set(c, (counts.get(c) ?? 0) + 1);
    const dominantCategory = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const rules = rulesForShape({ category: brief, productType: dominantCategory });
    const best = rules[0];
    if (!best) warnings.push('No stack-recommendation rule matched this brief; stack is portfolio-evidence only.');
    const ruleOf = new Map<string, string>();
    for (const tech of best?.stack ?? []) ruleOf.set(tech, best.shape);

    // Rule-recommended technologies first (in rule order), then any extra tech the comparables used.
    const ordered = [...(best?.stack ?? []), ...[...evidence.keys()].filter((t) => !ruleOf.has(t))];
    const stack: StackEntry[] = ordered.map((technology) => {
      const ev = evidence.get(technology) ?? [];
      return { technology, evidence: ev, fromRule: ruleOf.get(technology), cited: ev.length > 0 };
    });

    const uncited = stack.filter((s) => !s.cited).map((s) => s.technology);
    if (uncited.length) {
      warnings.push(
        `No portfolio project evidences: ${uncited.join(', ')} — recommended by rule "${best?.shape}" only. ` +
          'Ingest more portfolio projects or confirm before citing these in a proposal (spec §10).',
      );
    }

    return { stack, comparableProjects: projects, matchedRule: best?.shape, warnings };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../../../infrastructure/ai/ai.service';
import {
  MODULE_TYPE_KEYS,
  baseModuleDays,
  guessComplexity,
  guessType,
  normalizeComplexity,
  normalizeType,
  type Complexity,
  type ModuleType,
} from './module-taxonomy';
import type { Intent, Usage } from './intent.types';

/** One classified module: type + complexity + relative weight + estimated effective man-days. */
export interface ModuleAnalysis {
  name: string;
  type: ModuleType;
  complexity: Complexity;
  /** Relative build size vs the other modules in this project (1-5). */
  weight: number;
  keyFeatures: string[];
  /** Estimated effective man-days — learned per-(type,complexity) when available, else the base table. */
  estDays: number;
}

/** Learned per-(type,complexity) effort anchor from comparable past projects (from DecisionBrief). */
export type TypicalModuleEffort = { type: string; complexity: string; days: number }[];

/**
 * ModuleService — classifies each project module by type + complexity and estimates its effort, grounded in
 * a fixed taxonomy and the learned per-module effort. Informs Decide's sizing and powers the internal module
 * breakdown; it does NOT set the price (the rate-card role plan stays authoritative).
 */
@Injectable()
export class ModuleService {
  private readonly logger = new Logger(ModuleService.name);
  constructor(private readonly ai: AiService) {}

  async analyze(intent: Intent, typicalModuleEffort?: TypicalModuleEffort): Promise<{ modules: ModuleAnalysis[]; totalEstDays: number; usage: Usage }> {
    const names = (intent.modules ?? []).map((m) => (m || '').trim()).filter(Boolean);
    if (!names.length) return { modules: [], totalEstDays: 0, usage: { tokensIn: 0, tokensOut: 0 } };

    const learned = new Map<string, number>();
    for (const e of typicalModuleEffort ?? []) learned.set(`${e.type}|${e.complexity}`, e.days);
    const effDays = (type: ModuleType, complexity: Complexity) => learned.get(`${type}|${complexity}`) ?? baseModuleDays(type, complexity);

    const learnedBlock = typicalModuleEffort?.length
      ? `\nLEARNED per-module effort from comparable past Riseup projects (effective man-days — use as the effort anchor): ${typicalModuleEffort.map((e) => `${e.type}/${e.complexity} ≈ ${e.days}d`).join(', ')}`
      : '';

    let out: ModuleAnalysis[] = [];
    let usage: Usage = { tokensIn: 0, tokensOut: 0 };
    try {
      const { data, tokensIn, tokensOut } = await this.ai.json<{
        modules?: { name?: string; type?: string; complexity?: string; keyFeatures?: string[]; weight?: number }[];
      }>({
        label: 'module-analyze',
        system:
          "You are Riseup Labs' delivery analyst. Classify each software MODULE by TYPE and COMPLEXITY so its build effort can be estimated. Judge complexity from what the module realistically involves — data model, third-party integrations, real-time behaviour, number of user roles, and edge cases. Classify ONLY the modules given; never invent or split them. Output JSON.",
        maxTokens: 1600,
        prompt:
          `Project: ${intent.summary}\nDomain: ${intent.domain}\n` +
          `Surfaces: ${intent.surfaces.map((s) => s.name).join(', ') || '—'}\n` +
          `User roles: ${intent.userRoles.join(', ') || '—'}\n` +
          `Integrations: ${intent.integrations.join(', ') || '—'}\n` +
          `Platforms: ${intent.platforms.join(', ') || '—'}${learnedBlock}\n\n` +
          `Modules to classify:\n${names.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\n` +
          `Return ONLY: {"modules":[{ "name": string (echo the module name exactly), "type": one of [${MODULE_TYPE_KEYS.join(', ')}], "complexity": "simple"|"moderate"|"complex"|"very-complex", "keyFeatures": string[] (2-5 concrete sub-features), "weight": number 1-5 (relative build size vs the OTHER modules in this project) }]}`,
      });
      usage = { tokensIn, tokensOut };
      for (const m of data.modules ?? []) {
        const name = String(m.name || '').trim();
        if (!name) continue;
        const type = normalizeType(m.type);
        const complexity = normalizeComplexity(m.complexity);
        const weight = Math.min(5, Math.max(1, Math.round(Number(m.weight) || 3)));
        const keyFeatures = Array.isArray(m.keyFeatures)
          ? m.keyFeatures.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()).slice(0, 6)
          : [];
        out.push({ name, type, complexity, weight, keyFeatures, estDays: effDays(type, complexity) });
      }
    } catch (e) {
      this.logger.warn(`module-analyze failed; falling back to heuristic classification: ${String(e)}`);
    }

    // Any module the model dropped (or a total failure) → deterministic keyword fallback so every module is covered.
    for (const n of names) {
      if (out.some((o) => o.name.toLowerCase() === n.toLowerCase())) continue;
      const type = guessType(n);
      const complexity = guessComplexity(n);
      out.push({ name: n, type, complexity, weight: 3, keyFeatures: [], estDays: effDays(type, complexity) });
    }

    const totalEstDays = Math.round(out.reduce((s, m) => s + m.estDays, 0) * 10) / 10;
    return { modules: out, totalEstDays, usage };
  }
}

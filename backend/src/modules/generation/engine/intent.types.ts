/**
 * Intent — the structured read of a brief produced by the Understand pass.
 * Everything downstream (Decide, Architect, Compose) reads this instead of the
 * raw brief, so decisions are grounded in facts, not re-parsed prose.
 */
import type { ProjectType, Audience } from '../blocks/block.types';

export type SurfaceKind = 'web' | 'mobile' | 'admin' | 'api' | 'portal' | 'other';
export type ScopeSize = 'small' | 'medium' | 'large';

/** Token usage from an AI call, summed through the engine for a truthful per-lead cost trail. */
export interface Usage {
  tokensIn: number;
  tokensOut: number;
}

export interface Surface {
  name: string;
  kind: SurfaceKind;
  note?: string;
}

export interface Intent {
  /** new build / enhance existing / fix specific issues / deploy — drives framing. */
  projectType: ProjectType;
  /** technical vs business/feature-focused — drives tone + section emphasis. */
  audience: Audience;
  domain: string; // e.g. "air ticketing / travel"
  summary: string; // one sentence: what is being built, for whom
  surfaces: Surface[]; // product surfaces (web / mobile / admin / portal / api)
  modules: string[]; // major modules / features
  userRoles: string[]; // distinct user types (Customer, Agent, Admin …)
  integrations: string[]; // third-party services / APIs
  platforms: string[]; // iOS, Android, Web …
  pains: string[]; // the client's stated problems / goals
  desiredOutcome: string; // the concrete business outcome
  constraints: string[]; // hard constraints (mandated stack, compliance, deadline)
  outOfScope: string[]; // anything explicitly excluded
  scopeSize: ScopeSize; // overall size read (feeds structure + estimation)
  /** Client's stated delivery timeline in WEEKS, when the brief gives one — a hard signal for sizing
   *  scope/team/phases (Phase 1). undefined when the brief states no timeline. Derived from `deadlineDate`
   *  when the brief gives a calendar deadline instead of a duration. */
  timelineWeeks?: number;
  /** A stated calendar DEADLINE (ISO yyyy-mm-dd), when the brief gives an absolute date ("by 2 Sept 2026")
   *  rather than a duration. Converted to `timelineWeeks` against "today" and treated as a HARD pin. */
  deadlineDate?: string;
  /** True when the timeline came from a hard deadline/date (must be met) — the plan is CRASHED to it
   *  (more people + overtime), never stretched, and learning may not override it. */
  timelineHard?: boolean;
  /** Signatory the client will sign as ("For the Client"), extracted from the brief when stated. */
  clientSignatory?: { name: string; title?: string };
  /** Riseup signatory ("For Riseup Labs"), extracted from the brief when stated (else a settings default). */
  providerSignatory?: { name: string; title?: string };
  /**
   * Client's stated budget in MINOR UNITS of `budgetCurrency`, when the brief gives one. Riseup's intake
   * template has a "Client's Budget" field, so this is usually present in the uploaded document already —
   * no new input is collected for it. undefined when the brief says nothing, or says "Not Disclosed".
   */
  budgetCents?: number;
  /** Currency the stated budget was written in (ISO code as the brief wrote it, e.g. "USD", "BDT"). */
  budgetCurrency?: string;
  /**
   * How binding the stated budget is. `hard` = a cap the client will not move ("budget is $5,000",
   * "maximum 4 lakh"); `soft` = a range, estimate or aspiration ("around $10k", "$8-12k"). Drives whether
   * the plan is FITTED to the number or merely sanity-checked against it.
   */
  budgetHardness?: 'hard' | 'soft';
}

/**
 * Deterministic parts of natural-language directive parsing.
 *
 * The model proposes; this module decides. Both shipped bugs in this area were the model's reading being
 * trusted outright: "make the Core Build phase 2 weeks" came back as a 2-week PROJECT total and crashed an
 * 11-week plan into two one-week phases. Phase naming and duration attribution are mechanical, so they are
 * settled here in code where they can be tested without an AI call.
 */

/** A positive whole number, or undefined for anything else (null, NaN, 0, negatives, junk). */
export function posInt(n: unknown): number | undefined {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;
}

/**
 * Compare phase names ignoring case, punctuation and spacing, so "Core Build" matches "core-build".
 * "&" folds to "and" because a rep typing the phase name will usually spell it out.
 */
export function normalisePhaseName(v: string): string {
  return (v || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Every plan phase whose full name appears in the instruction. */
export function findNamedPhases(prompt: string, phaseNames: string[]): string[] {
  const said = normalisePhaseName(prompt);
  if (!said) return [];
  return phaseNames.filter((name) => {
    const n = normalisePhaseName(name);
    return n.length > 0 && said.includes(n);
  });
}

/** How many separate "<number> week(s)" durations the instruction mentions. */
export function countWeekMentions(prompt: string): number {
  return (prompt.match(/\d+(?:\.\d+)?\s*week/gi) ?? []).length;
}

export interface PhaseWeeks {
  phase: string;
  weeks: number;
}

/**
 * The per-phase durations to apply. The model's own `phaseWeeks` wins when it produced any; otherwise, if the
 * instruction names exactly ONE real phase alongside a duration, that is unambiguously a per-phase change and
 * is reconstructed here. A range ("2-3 weeks") takes the upper bound.
 */
export function resolvePhaseWeeks(prompt: string, phaseNames: string[], modelPhaseWeeks: unknown): PhaseWeeks[] {
  const fromModel = Array.isArray(modelPhaseWeeks)
    ? modelPhaseWeeks
        .map((x) => ({
          phase: String((x as { phase?: unknown })?.phase ?? '').trim(),
          weeks: posInt((x as { weeks?: unknown })?.weeks) ?? 0,
        }))
        .filter((x) => x.phase && x.weeks > 0)
    : [];
  if (fromModel.length) return fromModel;

  const named = findNamedPhases(prompt, phaseNames);
  if (named.length !== 1) return [];
  const m = /(\d+(?:\.\d+)?)\s*(?:-|to)?\s*(\d+(?:\.\d+)?)?\s*week/i.exec(prompt);
  const weeks = m ? posInt(m[2] ?? m[1]) : undefined;
  return weeks ? [{ phase: named[0], weeks }] : [];
}

/**
 * Whether the model's `totalWeeks` is really the per-phase duration read a second time. True only when the
 * instruction mentions a single duration AND that number is already claimed by a phase — so a prompt that
 * genuinely states both ("Core Build 2 weeks, 12 weeks overall") keeps its project total.
 */
export function isTotalWeeksMisread(prompt: string, modelTotal: number | undefined, phaseWeeks: PhaseWeeks[]): boolean {
  if (modelTotal === undefined || !phaseWeeks.length) return false;
  return countWeekMentions(prompt) <= 1 && phaseWeeks.some((x) => x.weeks === modelTotal);
}

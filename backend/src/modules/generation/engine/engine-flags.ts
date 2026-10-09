import type { Logger } from '@nestjs/common';

/**
 * Engine V2 feature flags — every V2 improvement ships dark and is switched per capability.
 *
 *   ENGINE_V2_<FLAG>=off     (default) today's V1 path only
 *   ENGINE_V2_<FLAG>=shadow  V1 result is used; V2 also runs and its output is only recorded for comparison
 *   ENGINE_V2_<FLAG>=on      V2 result is used; any V2 error/timeout falls back to V1 automatically
 *
 * The fallback guarantee is what keeps the system stable: a V2 failure can never break generation.
 */
export type EngineV2Flag = 'GOLD' | 'FEATURES' | 'CALIBRATION' | 'TOOL_DECIDE' | 'CRITIC' | 'CLARIFY';
export type FlagMode = 'off' | 'shadow' | 'on';

export function flagMode(flag: EngineV2Flag, env: NodeJS.ProcessEnv = process.env): FlagMode {
  const v = String(env[`ENGINE_V2_${flag}`] ?? 'off').trim().toLowerCase();
  return v === 'on' || v === 'shadow' ? v : 'off';
}

export const flagEnabled = (flag: EngineV2Flag, env?: NodeJS.ProcessEnv): boolean => flagMode(flag, env) === 'on';

export interface V2Outcome<T> {
  result: T;
  /** Which path produced `result`. */
  used: 'v1' | 'v2';
  /** Shadow-mode V2 output (or its error), recorded for comparison; never shown to the user. */
  shadow?: { value?: T; error?: string; ms: number };
  /** Set when V2 was on but failed and V1 was used instead. */
  fallbackReason?: string;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * Run a capability through its flag. `v1` is always the safe path; `v2` only influences the result when
 * the flag is `on` and it succeeds within the timeout.
 */
export async function runWithFlag<T>(
  flag: EngineV2Flag,
  v1: () => Promise<T>,
  v2: () => Promise<T>,
  opts: { logger?: Logger; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<V2Outcome<T>> {
  const mode = flagMode(flag, opts.env);
  const timeoutMs = opts.timeoutMs ?? 120_000;
  if (mode === 'off') return { result: await v1(), used: 'v1' };

  if (mode === 'shadow') {
    const started = Date.now();
    const [base, side] = await Promise.all([
      v1(),
      withTimeout(v2(), timeoutMs).then(
        (value) => ({ value, ms: Date.now() - started }),
        (e: unknown) => ({ error: String((e as Error)?.message ?? e), ms: Date.now() - started }),
      ),
    ]);
    if ('error' in side) opts.logger?.warn(`V2 ${flag} shadow failed: ${side.error}`);
    return { result: base, used: 'v1', shadow: side };
  }

  try {
    return { result: await withTimeout(v2(), timeoutMs), used: 'v2' };
  } catch (e) {
    const reason = String((e as Error)?.message ?? e);
    opts.logger?.warn(`V2 ${flag} failed, falling back to V1: ${reason}`);
    return { result: await v1(), used: 'v1', fallbackReason: reason };
  }
}

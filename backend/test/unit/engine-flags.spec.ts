import { flagMode, runWithFlag } from '../../src/modules/generation/engine/engine-flags';

const env = (v?: string): NodeJS.ProcessEnv => (v === undefined ? {} : { ENGINE_V2_FEATURES: v });

describe('engine V2 flags', () => {
  it('defaults to off and accepts only off/shadow/on', () => {
    expect(flagMode('FEATURES', env())).toBe('off');
    expect(flagMode('FEATURES', env('ON'))).toBe('on');
    expect(flagMode('FEATURES', env(' shadow '))).toBe('shadow');
    expect(flagMode('FEATURES', env('yes'))).toBe('off');
  });

  it('off: runs V1 only, never touches V2', async () => {
    const v2 = jest.fn(async () => 2);
    const out = await runWithFlag('FEATURES', async () => 1, v2, { env: env('off') });
    expect(out).toEqual({ result: 1, used: 'v1' });
    expect(v2).not.toHaveBeenCalled();
  });

  it('shadow: user gets V1, V2 output is recorded', async () => {
    const out = await runWithFlag('FEATURES', async () => 1, async () => 2, { env: env('shadow') });
    expect(out.result).toBe(1);
    expect(out.used).toBe('v1');
    expect(out.shadow?.value).toBe(2);
  });

  it('shadow: a failing V2 never affects the result', async () => {
    const out = await runWithFlag('FEATURES', async () => 1, async () => { throw new Error('boom'); }, { env: env('shadow') });
    expect(out.result).toBe(1);
    expect(out.shadow?.error).toBe('boom');
  });

  it('on: uses V2 when it succeeds', async () => {
    const out = await runWithFlag('FEATURES', async () => 1, async () => 2, { env: env('on') });
    expect(out).toEqual({ result: 2, used: 'v2' });
  });

  it('on: falls back to V1 when V2 throws', async () => {
    const out = await runWithFlag('FEATURES', async () => 1, async () => { throw new Error('bad'); }, { env: env('on') });
    expect(out.result).toBe(1);
    expect(out.used).toBe('v1');
    expect(out.fallbackReason).toBe('bad');
  });

  it('on: falls back to V1 when V2 times out', async () => {
    const slow = () => new Promise<number>((r) => setTimeout(() => r(2), 200));
    const out = await runWithFlag('FEATURES', async () => 1, slow, { env: env('on'), timeoutMs: 20 });
    expect(out.result).toBe(1);
    expect(out.fallbackReason).toMatch(/timed out/);
  });
});

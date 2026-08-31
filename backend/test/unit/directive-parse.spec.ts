/**
 * Regression cover for the instruction-parsing bugs that reached production twice:
 *   "make the Core Build phase 2 weeks"  ->  read as a 2-WEEK PROJECT, crashing an 11-week plan
 *   a named phase                        ->  silently discarded the project total stated alongside it
 */
import {
  posInt, normalisePhaseName, findNamedPhases, countWeekMentions, resolvePhaseWeeks, isTotalWeeksMisread,
} from '../../src/modules/generation/engine/directive-parse.util';

const PHASES = ['Foundation', 'Core Build', 'Integration & Hardening', 'Launch'];

describe('posInt', () => {
  it('accepts positive numbers and rounds them', () => {
    expect(posInt(3)).toBe(3);
    expect(posInt('7')).toBe(7);
    expect(posInt(2.6)).toBe(3);
  });
  it('rejects anything that is not a positive number', () => {
    for (const v of [0, -1, null, undefined, '', 'abc', NaN, Infinity]) expect(posInt(v)).toBeUndefined();
  });
});

describe('normalisePhaseName', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(normalisePhaseName('Core-Build')).toBe(normalisePhaseName('core build'));
    expect(normalisePhaseName('Integration & Hardening')).toBe('integration and hardening');
  });
  it('survives empty input', () => {
    expect(normalisePhaseName('')).toBe('');
  });
});

describe('findNamedPhases', () => {
  it('finds a phase named in the instruction, whatever the casing', () => {
    expect(findNamedPhases('make core build 2 weeks', PHASES)).toEqual(['Core Build']);
  });
  it('matches through punctuation differences, including "and" for "&"', () => {
    expect(findNamedPhases('set Integration & Hardening to 3 weeks', PHASES)).toEqual(['Integration & Hardening']);
    expect(findNamedPhases('set Integration and Hardening to 3 weeks', PHASES)).toEqual(['Integration & Hardening']);
  });
  it('returns nothing when no phase is named', () => {
    expect(findNamedPhases('make the whole project 8 weeks', PHASES)).toEqual([]);
  });
  it('does not match on a partial word', () => {
    expect(findNamedPhases('the build is late', PHASES)).toEqual([]);
  });
  it('can find several', () => {
    expect(findNamedPhases('Foundation and Launch both slip', PHASES)).toEqual(['Foundation', 'Launch']);
  });
});

describe('countWeekMentions', () => {
  it('counts each stated duration', () => {
    expect(countWeekMentions('make it 2 weeks')).toBe(1);
    expect(countWeekMentions('Core Build 2 weeks, 12 weeks overall')).toBe(2);
    expect(countWeekMentions('no durations here')).toBe(0);
  });
});

describe('resolvePhaseWeeks', () => {
  it('prefers what the model returned', () => {
    const out = resolvePhaseWeeks('anything', PHASES, [{ phase: 'Launch', weeks: 3 }]);
    expect(out).toEqual([{ phase: 'Launch', weeks: 3 }]);
  });
  it('drops malformed model entries', () => {
    expect(resolvePhaseWeeks('x', PHASES, [{ phase: '', weeks: 3 }, { phase: 'Launch', weeks: 0 }])).toEqual([]);
  });
  it('THE BUG: reconstructs a per-phase change the model missed', () => {
    expect(resolvePhaseWeeks('make the Core Build phase 2 weeks', PHASES, [])).toEqual([{ phase: 'Core Build', weeks: 2 }]);
  });
  it('takes the upper bound of a range', () => {
    expect(resolvePhaseWeeks('Launch 2-3 weeks', PHASES, [])).toEqual([{ phase: 'Launch', weeks: 3 }]);
  });
  it('stays out of it when the instruction is ambiguous about which phase', () => {
    expect(resolvePhaseWeeks('Foundation and Launch should be 2 weeks', PHASES, [])).toEqual([]);
  });
  it('stays out of it when no phase is named — that is a project total', () => {
    expect(resolvePhaseWeeks('make the whole project 8 weeks', PHASES, [])).toEqual([]);
  });
  it('needs a duration, not just a phase name', () => {
    expect(resolvePhaseWeeks('rewrite the Core Build section', PHASES, [])).toEqual([]);
  });
});

describe('isTotalWeeksMisread', () => {
  it('THE BUG: one duration, claimed by a phase, is not also the project total', () => {
    expect(isTotalWeeksMisread('make the Core Build phase 2 weeks', 2, [{ phase: 'Core Build', weeks: 2 }])).toBe(true);
  });
  it('keeps a total that is genuinely stated alongside a phase change', () => {
    expect(isTotalWeeksMisread('Core Build 2 weeks, 12 weeks overall', 12, [{ phase: 'Core Build', weeks: 2 }])).toBe(false);
  });
  it('keeps a total when no phase was changed', () => {
    expect(isTotalWeeksMisread('make the project 8 weeks', 8, [])).toBe(false);
  });
  it('keeps a total that differs from every phase duration', () => {
    expect(isTotalWeeksMisread('Core Build 2 weeks', 9, [{ phase: 'Core Build', weeks: 2 }])).toBe(false);
  });
  it('is inert when the model gave no total', () => {
    expect(isTotalWeeksMisread('Core Build 2 weeks', undefined, [{ phase: 'Core Build', weeks: 2 }])).toBe(false);
  });
});

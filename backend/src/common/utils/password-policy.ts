/**
 * Single source of truth for password strength. The frontend mirrors these rules to render live
 * suggestions (frontend/app/utils/passwordPolicy.ts) — keep the two in sync.
 */
export const PASSWORD_MIN = 8;

export const PASSWORD_RULES: { id: string; label: string; test: (p: string) => boolean }[] = [
  { id: 'length', label: `At least ${PASSWORD_MIN} characters`, test: (p) => p.length >= PASSWORD_MIN },
  { id: 'upper', label: 'One uppercase letter (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter (a-z)', test: (p) => /[a-z]/.test(p) },
  { id: 'digit', label: 'One number (0-9)', test: (p) => /\d/.test(p) },
  { id: 'special', label: 'One special character (!@#$…)', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/** Regex form for class-validator / HTML pattern attributes. */
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export const passwordProblems = (p: string): string[] =>
  PASSWORD_RULES.filter((r) => !r.test(p)).map((r) => r.label);

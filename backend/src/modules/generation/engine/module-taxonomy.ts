/**
 * Module-intelligence taxonomy (module-intelligence layer).
 *
 * A fixed set of module TYPES + COMPLEXITY tiers so per-module effort can be classified and, crucially,
 * LEARNED cleanly (same keys aggregate across projects). The corpus has no per-module effort, so effort is
 * modeled: a cold-start base table `BASE_COMPLEXITY_DAYS[complexity] × type.weight` (effective man-days),
 * refined over time by attributing real project totals across their modules (see project-case learning).
 */

export const COMPLEXITY = ['simple', 'moderate', 'complex', 'very-complex'] as const;
export type Complexity = (typeof COMPLEXITY)[number];

/** Cold-start effort per complexity tier, in EFFECTIVE man-days (the same unit the budget costs). */
export const BASE_COMPLEXITY_DAYS: Record<Complexity, number> = {
  simple: 5,
  moderate: 12,
  complex: 22,
  'very-complex': 38,
};

/** Fixed module types: canonical key → display label + a relative effort weight (multiplier on the base). */
export const MODULE_TYPES = {
  auth: { label: 'Authentication & Access', weight: 1.0 },
  'user-management': { label: 'User Management', weight: 0.9 },
  'payments-billing': { label: 'Payments & Billing', weight: 1.3 },
  'content-cms': { label: 'Content / CMS', weight: 0.9 },
  search: { label: 'Search & Discovery', weight: 1.1 },
  'messaging-chat': { label: 'Messaging & Chat', weight: 1.2 },
  notifications: { label: 'Notifications', weight: 0.7 },
  realtime: { label: 'Real-time / Live', weight: 1.3 },
  'ai-ml': { label: 'AI / ML', weight: 1.5 },
  'analytics-reporting': { label: 'Analytics & Reporting', weight: 1.1 },
  'admin-dashboard': { label: 'Admin Dashboard', weight: 1.0 },
  integration: { label: 'Third-party Integration', weight: 1.1 },
  media: { label: 'Media (Upload / Stream)', weight: 1.2 },
  ecommerce: { label: 'E-commerce / Catalog', weight: 1.2 },
  'booking-scheduling': { label: 'Booking & Scheduling', weight: 1.1 },
  'workflow-automation': { label: 'Workflow & Automation', weight: 1.2 },
  'geo-maps': { label: 'Maps & Geolocation', weight: 1.1 },
  social: { label: 'Social & Community', weight: 1.0 },
  onboarding: { label: 'Onboarding', weight: 0.7 },
  'settings-config': { label: 'Settings & Config', weight: 0.6 },
  other: { label: 'Other', weight: 1.0 },
} as const;

export type ModuleType = keyof typeof MODULE_TYPES;
export const MODULE_TYPE_KEYS = Object.keys(MODULE_TYPES) as ModuleType[];

/** Cold-start effort estimate (effective man-days) for a module of this type + complexity. */
export function baseModuleDays(type: ModuleType, complexity: Complexity): number {
  const t = MODULE_TYPES[type] ?? MODULE_TYPES.other;
  return Math.max(1, Math.round(BASE_COMPLEXITY_DAYS[complexity] * t.weight));
}

export function normalizeType(v: unknown): ModuleType {
  const s = String(v || '').toLowerCase().trim().replace(/[\s_/]+/g, '-');
  return (MODULE_TYPE_KEYS as string[]).includes(s) ? (s as ModuleType) : 'other';
}
export function normalizeComplexity(v: unknown): Complexity {
  const s = String(v || '').toLowerCase().trim().replace(/[\s_]+/g, '-');
  return (COMPLEXITY as readonly string[]).includes(s) ? (s as Complexity) : 'moderate';
}

// ── Deterministic fallbacks (no AI) — used by the in-app case extractor and as a safety net. ─────────────
const TYPE_KEYWORDS: [ModuleType, RegExp][] = [
  ['auth', /\b(auth|login|log ?in|sign ?up|sign ?in|otp|sso|password|register|onboard)\b/i],
  ['payments-billing', /\b(payment|billing|checkout|invoice|subscription|wallet|payout|stripe|pricing)\b/i],
  ['messaging-chat', /\b(chat|messag|inbox|dm|conversation)\b/i],
  ['notifications', /\b(notif|push|alert|reminder|email)\b/i],
  ['realtime', /\b(real ?time|live|socket|streaming|presence)\b/i],
  ['ai-ml', /\b(ai|ml|machine learning|recommendation|predict|nlp|chatbot|llm|vision)\b/i],
  ['analytics-reporting', /\b(analytic|report|dashboard metrics|insight|stats|kpi)\b/i],
  ['admin-dashboard', /\b(admin|back ?office|management console|dashboard)\b/i],
  ['integration', /\b(integrat|api|webhook|third ?party|sync|connector)\b/i],
  ['media', /\b(media|upload|video|image|photo|stream|gallery)\b/i],
  ['ecommerce', /\b(shop|store|cart|catalog|product|order|inventory|e ?commerce)\b/i],
  ['booking-scheduling', /\b(book|schedul|appointment|calendar|reservation|slot)\b/i],
  ['workflow-automation', /\b(workflow|automat|approval|pipeline|rule engine)\b/i],
  ['geo-maps', /\b(map|geo|location|gps|route|tracking)\b/i],
  ['social', /\b(social|community|feed|follow|comment|like|forum)\b/i],
  ['search', /\b(search|discover|filter|explore)\b/i],
  ['content-cms', /\b(content|cms|article|blog|page|post)\b/i],
  ['user-management', /\b(user|profile|role|permission|member|account)\b/i],
  ['settings-config', /\b(setting|config|preference|option)\b/i],
];

export function guessType(name: string): ModuleType {
  for (const [type, re] of TYPE_KEYWORDS) if (re.test(name)) return type;
  return 'other';
}

/** Rough complexity from a module name + optional feature count (used only where no AI classification runs). */
export function guessComplexity(name: string, featureCount = 0): Complexity {
  const heavy = /\b(real ?time|ai|ml|payment|integrat|video|stream|workflow|recommendation)\b/i.test(name);
  if (featureCount >= 6 || heavy) return 'complex';
  if (featureCount >= 3) return 'moderate';
  return 'simple';
}

/**
 * Pure text→estimate mining helpers, shared by the batch script (ingest-estimates.ts) and the
 * per-upload hook (EstimateService.mineFromText). Single source of truth so both stay consistent.
 */

export const BDT_PER_USD = 120; // ingest-time FX for normalizing BDT totals to USD

const num = (s: string) => Number(s.replace(/,/g, ''));

// All plausible money figures in the text, normalized to USD, with sane bounds to drop years/phones.
export function usdTotals(text: string): number[] {
  const out: number[] = [];
  const push = (raw: string, bdt: boolean) => {
    const v = num(raw);
    if (!Number.isFinite(v)) return;
    const usd = bdt ? v / BDT_PER_USD : v;
    if (usd >= 500 && usd <= 5_000_000) out.push(usd);
  };
  for (const m of text.matchAll(/(?:US\$|USD|\$)\s?([\d][\d,]{2,})(?:\.\d+)?/gi)) push(m[1], false);
  for (const m of text.matchAll(/(?:BDT|Tk\.?|৳)\s?([\d][\d,]{2,})/gi)) push(m[1], true);
  for (const m of text.matchAll(/([\d][\d,]{4,})\s?(?:BDT|taka)/gi)) push(m[1], true);
  return out;
}

export function weeksOf(text: string): number | undefined {
  let best = 0;
  for (const m of text.matchAll(/(\d{1,3})\s*(?:weeks?|wks?)/gi)) best = Math.max(best, Math.min(104, num(m[1])));
  for (const m of text.matchAll(/(\d{1,2})\s*months?/gi)) best = Math.max(best, Math.min(104, Math.round(num(m[1]) * 4.33)));
  return best || undefined;
}

// Strip section words so a project's Proposal + Budget docs collapse to one key.
export function projectKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\.(pdf|docx?|xlsx?|pptx?|txt)$/i, '')
    .replace(/\b(proposal|budget|financial|quotation|estimate|technical|commercial|final|draft|v?\d+)\b/gi, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function scopeSizeOf(usd: number): string {
  if (usd < 10_000) return 'small';
  if (usd < 40_000) return 'medium';
  return 'large';
}

// Whether a doc's text looks BDT-authored (৳/BDT/Tk present and no $/USD).
export function looksBdt(text: string): boolean {
  return /(?:BDT|Tk\.?|৳|taka)/i.test(text) && !/\$|USD/i.test(text);
}

export const TITLE_EXT = /\.(pdf|docx?|xlsx?|pptx?|txt)$/i;

// The nine budget currencies Lead360 supports (server-verified). USD and BDT come from the head-cost
// sheet's own columns; every other currency is USD × the live rate. Single source of truth — do not
// duplicate this list in components.
export const CURRENCIES = [
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'BDT', label: 'BDT — Bangladeshi Taka' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'CAD', label: 'CAD — Canadian Dollar' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
  { code: 'CNY', label: 'CNY — Chinese Yuan' },
  { code: 'JPY', label: 'JPY — Japanese Yen' },
  { code: 'INR', label: 'INR — Indian Rupee' },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as readonly string[];

// Server rule: Local template defaults to BDT, everything else defaults to USD.
export function defaultCurrencyForTemplate(template: string): CurrencyCode {
  return template === 'local' ? 'BDT' : 'USD';
}

// Format an amount held in minor units (cents) in the given ISO-4217 currency. Intl gives the right
// symbol (৳/€/¥/₹) and decimal count per currency automatically (e.g. JPY → 0 decimals). Falls back to
// a plain code-prefixed number if the currency code is somehow unsupported by the runtime.
export function formatMoney(cents: number | string, currency: string): string {
  const value = (Number(cents) || 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

// Whole-unit variant for client-facing HEADLINE figures (proposal hero "Investment", Pricing Summary
// total, lead header value, leads-table value, Overview KPIs). Same Intl call as formatMoney but with
// zero fraction digits, so $184,100.00 renders as $184,100. Reconciling numbers (budget line items,
// day rates, subtotals) must keep their cents — use formatMoney for those. JPY is unaffected: it is
// already 0-decimal, and an explicit 0/0 stays consistent with that.
export function formatMoneyWhole(cents: number | string, currency: string): string {
  const value = (Number(cents) || 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString()}`;
  }
}

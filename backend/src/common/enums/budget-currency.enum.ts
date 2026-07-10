/**
 * The currency a lead's budget is priced in (user decision 2026-07-10).
 *
 * Pricing source per currency:
 *  - **USD** — the head-cost sheet's USD columns (the base).
 *  - **BDT** — the head-cost sheet's own BDT columns, verbatim. Never USD × FX: the sheet rounds
 *    each column independently and its numbers are the authored truth.
 *  - **everything else** — USD × the live FX rate synced into Settings → Currency & FX.
 *
 * Default: BDT for a Local lead, USD for every other template. The rep may override with any of these.
 */
export enum BudgetCurrency {
  USD = 'USD',
  BDT = 'BDT',
  GBP = 'GBP',
  EUR = 'EUR',
  CAD = 'CAD',
  AUD = 'AUD',
  CNY = 'CNY',
  JPY = 'JPY',
  INR = 'INR',
}

export const CURRENCY_LABEL: Record<BudgetCurrency, string> = {
  [BudgetCurrency.USD]: 'US Dollar',
  [BudgetCurrency.BDT]: 'Bangladeshi Taka',
  [BudgetCurrency.GBP]: 'British Pound',
  [BudgetCurrency.EUR]: 'Euro',
  [BudgetCurrency.CAD]: 'Canadian Dollar',
  [BudgetCurrency.AUD]: 'Australian Dollar',
  [BudgetCurrency.CNY]: 'Chinese Yuan',
  [BudgetCurrency.JPY]: 'Japanese Yen',
  [BudgetCurrency.INR]: 'Indian Rupee',
};

export const CURRENCY_SYMBOL: Record<BudgetCurrency, string> = {
  [BudgetCurrency.USD]: '$',
  [BudgetCurrency.BDT]: '৳',
  [BudgetCurrency.GBP]: '£',
  [BudgetCurrency.EUR]: '€',
  [BudgetCurrency.CAD]: 'C$',
  [BudgetCurrency.AUD]: 'A$',
  [BudgetCurrency.CNY]: '¥',
  [BudgetCurrency.JPY]: '¥',
  [BudgetCurrency.INR]: '₹',
};

/** These are priced straight from the head-cost sheet; the rest convert from USD. */
export const SHEET_CURRENCIES = new Set<BudgetCurrency>([BudgetCurrency.USD, BudgetCurrency.BDT]);

/** A Local lead defaults to BDT; everything else defaults to USD. */
export const defaultCurrencyFor = (template: string): BudgetCurrency =>
  template === 'local' ? BudgetCurrency.BDT : BudgetCurrency.USD;

/** Honour an explicit, supported choice; otherwise fall back to the template default. */
export function resolveBudgetCurrency(template: string, requested?: BudgetCurrency | string): BudgetCurrency {
  const wants = String(requested ?? '').toUpperCase() as BudgetCurrency;
  return Object.values(BudgetCurrency).includes(wants) ? wants : defaultCurrencyFor(template);
}

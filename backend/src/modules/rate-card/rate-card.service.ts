import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RateCardRepository } from './rate-card.repository';
import { RateCard } from './rate-card.entity';
import { RoleDaySample } from './role-day-sample.entity';
import { CreateRateCardDto } from './dtos/rate-card.dtos';
import { BudgetCurrency, CURRENCY_SYMBOL, SHEET_CURRENCIES, Seniority } from '../../common/enums';
import { SettingsService } from '../settings/settings.service';

/**
 * Daily rate in the requested currency.
 *  - USD / BDT come straight from the head-cost sheet's own columns (never converted).
 *  - Any other currency is USD × the live FX rate synced in Settings → Currency & FX.
 */
const sheetDailyCents = (rc: RateCard, currency: BudgetCurrency): number =>
  Number(currency === BudgetCurrency.BDT ? rc.dailyBdtCents : rc.dailyUsdCents);

@Injectable()
export class RateCardService {
  constructor(
    private readonly repo: RateCardRepository,
    @InjectRepository(RoleDaySample) private readonly samples: Repository<RoleDaySample>,
    private readonly settings: SettingsService,
  ) {}

  /** Sheet currencies are used verbatim; anything else converts from USD at the synced FX rate. */
  private async dailyCents(rc: RateCard, currency: BudgetCurrency): Promise<number> {
    if (SHEET_CURRENCIES.has(currency)) return sheetDailyCents(rc, currency);
    const fx = await this.settings.fxRate(currency);
    return Math.round(Number(rc.dailyUsdCents) * fx);
  }

  list() {
    return this.repo.findAll();
  }

  // Suggest a maintained day-rate for the budget editor to pre-fill a line (null if none on file).
  async suggestRate(role: string, seniority: Seniority, currency: BudgetCurrency = BudgetCurrency.USD) {
    const rc = await this.repo.findByRole(role, seniority);
    return { role, seniority, currency, dayRateCents: rc ? await this.dailyCents(rc, currency) : null };
  }

  /**
   * Resolve a day-rate in the requested currency (never guessed by the LLM): exact seniority match
   * → any seniority for the same role. Returns NULL for roles missing from the card — the caller
   * must SKIP that line rather than invent a number (spec §10).
   *
   * BDT comes from the head-cost sheet's own BDT column, never USD × FX.
   */
  async rateFor(role: string, seniority: Seniority, currency: BudgetCurrency = BudgetCurrency.USD): Promise<number | null> {
    const exact = await this.repo.findByRole(role, seniority);
    if (exact) return this.dailyCents(exact, currency);
    const all = await this.repo.findAll();
    const byRole = all.find((r) => r.role.toLowerCase() === role.toLowerCase());
    return byRole ? this.dailyCents(byRole, currency) : null;
  }

  // Compact valid-roles + rates listing for the AI budget prompt (so it picks real roles).
  async rolesForPrompt(currency: BudgetCurrency = BudgetCurrency.USD): Promise<string> {
    const all = await this.repo.findAll();
    const sym = CURRENCY_SYMBOL[currency] ?? '';
    const byRole = new Map<string, { department: string; rates: Partial<Record<string, number>> }>();
    for (const r of all) {
      const e = byRole.get(r.role) ?? { department: r.department, rates: {} };
      e.rates[r.seniority] = Math.round((await this.dailyCents(r, currency)) / 100);
      byRole.set(r.role, e);
    }
    return [...byRole.entries()]
      .map(([role, e]) => {
        const parts = (['senior', 'mid', 'junior'] as const)
          .filter((k) => e.rates[k] !== undefined)
          .map((k) => `${k} ${sym}${e.rates[k]}`);
        return `${e.department} · ${role} (${parts.join(' / ')} per day)`;
      })
      .join('\n');
  }

  /** Save edited rows from the Rates table. `dayRateCents` is kept in sync with the USD daily rate. */
  async saveMany(rows: { id: string; [k: string]: unknown }[]) {
    const clean = rows.map((r) => {
      const usdDaily = String(r.dailyUsdCents ?? '0');
      return {
        id: String(r.id),
        department: r.department as string,
        role: r.role as string,
        monthlyUsdCents: String(r.monthlyUsdCents ?? '0'),
        dailyUsdCents: usdDaily,
        hourlyUsdCents: String(r.hourlyUsdCents ?? '0'),
        monthlyBdtCents: String(r.monthlyBdtCents ?? '0'),
        dailyBdtCents: String(r.dailyBdtCents ?? '0'),
        hourlyBdtCents: String(r.hourlyBdtCents ?? '0'),
        dayRateCents: usdDaily, // deprecated mirror
      };
    });
    return this.repo.saveMany(clean);
  }

  create(dto: CreateRateCardDto) {
    return this.repo.create({ ...dto, dayRateCents: String(dto.dayRateCents) });
  }

  // --- Learning loop: record role-day samples from generated/approved budgets; feed averages back ---
  async recordSamples(signature: string, lines: { role: string; days: number }[]) {
    if (!lines.length) return;
    await this.samples.save(lines.map((l) => this.samples.create({ scopeSignature: signature, role: l.role, days: l.days })));
  }

  // Average days per role learned from past projects with this scope signature (e.g. template).
  async learnedDays(signature: string): Promise<Record<string, number>> {
    const rows = await this.samples.find({ where: { scopeSignature: signature } });
    const agg = new Map<string, { sum: number; n: number }>();
    for (const r of rows) {
      const a = agg.get(r.role) ?? { sum: 0, n: 0 };
      a.sum += r.days; a.n += 1;
      agg.set(r.role, a);
    }
    const out: Record<string, number> = {};
    for (const [role, a] of agg) out[role] = Math.round(a.sum / a.n);
    return out;
  }
}

import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { Seniority } from '../../common/enums';
import { RoleDaySample } from './role-day-sample.entity';

/**
 * Mirrors Riseup's authored head-cost spreadsheet (`data/rate-sources/Head-Cost-…xlsx`): one row per
 * department+role, carrying monthly / daily / hourly cost in BOTH currencies. All money is stored in
 * integer minor units (cents / poisha).
 *
 * BDT figures are the sheet's own columns — never USD × FX — because the sheet rounds each column
 * independently and its numbers are the authored truth (user decision 2026-07-10).
 *
 * `seniority` is parsed out of the role name ("Sr. UI/UX Designer" → senior) so the generator can
 * still match a requested seniority; the role name itself stays intact and is what a budget shows.
 */
@Entity('rate_cards')
@Index(['role', 'seniority'])
export class RateCard extends BaseEntity {
  @Column()
  department: string;

  @Column()
  role: string;

  /** Parsed from the role name; MID when the name carries no Sr./Jr. marker. */
  @Column({ type: 'enum', enum: Seniority })
  seniority: Seniority;

  // --- USD (default pricing currency) ---
  @Column({ name: 'monthly_usd_cents', type: 'bigint', default: 0 })
  monthlyUsdCents: string;

  @Column({ name: 'daily_usd_cents', type: 'bigint', default: 0 })
  dailyUsdCents: string;

  @Column({ name: 'hourly_usd_cents', type: 'bigint', default: 0 })
  hourlyUsdCents: string;

  // --- BDT (used verbatim for local pricing) ---
  @Column({ name: 'monthly_bdt_cents', type: 'bigint', default: 0 })
  monthlyBdtCents: string;

  @Column({ name: 'daily_bdt_cents', type: 'bigint', default: 0 })
  dailyBdtCents: string;

  @Column({ name: 'hourly_bdt_cents', type: 'bigint', default: 0 })
  hourlyBdtCents: string;

  /**
   * @deprecated Mirrors `dailyUsdCents` so existing budget code keeps resolving.
   * New code must read the explicit per-currency columns.
   */
  @Column({ name: 'day_rate_cents', type: 'bigint', default: 0 })
  dayRateCents: string;

  @Column({ default: 'USD' })
  currency: string;

  @OneToMany(() => RoleDaySample, (s) => s.rateCard)
  samples: RoleDaySample[];
}

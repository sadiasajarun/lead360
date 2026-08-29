import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { Budget } from './budget.entity';

/**
 * A purchased item on the budget — hardware, devices, licences, on-site installation.
 *
 * Kept SEPARATE from BudgetLine on purpose: equipment is bought, not staffed. It has a quantity and a
 * unit price, and none of the resource concepts (seniority, hours/day, working days, man-days) apply —
 * forcing it into a role row shows a meaningless "Mid / 8 hrs / 1 day" against a power adapter.
 *
 * Cost = qty × unitPriceCents. Equipment is added to the budget subtotal alongside resource lines.
 */
@Entity('budget_equipment')
export class BudgetEquipment extends BaseEntity {
  @Column({ name: 'budget_id' })
  budgetId: string;

  @ManyToOne(() => Budget, (b) => b.equipment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'budget_id' })
  budget: Budget;

  /** What is being supplied, as the client should read it (e.g. "Biometric Face & RFID Terminal"). */
  @Column()
  item: string;

  /** Manufacturer / model, when the spec matters to the client (e.g. "ZKTeco SpeedFace-V5L"). */
  @Column({ nullable: true })
  brand?: string;

  /** Unit of measure as quoted — pcs, lot, job, node. Display only. */
  @Column({ nullable: true })
  uom?: string;

  @Column({ type: 'int', default: 1 })
  qty: number;

  @Column({ name: 'unit_price_cents', type: 'bigint', default: 0 })
  unitPriceCents: string;

  /** Warranty, "at actual", or any remark that belongs beside the item. */
  @Column({ nullable: true })
  note?: string;

  @Column({ name: 'order_no', type: 'int', default: 0 })
  orderNo: number;
}

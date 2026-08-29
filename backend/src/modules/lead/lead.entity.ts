import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { LeadStatus, TemplateType, LossReason, BudgetCurrency, ProjectType, Audience } from '../../common/enums';
import { User } from '../user/user.entity';
import { Requirement } from '../requirement/requirement.entity';
import { Proposal } from '../proposal/proposal.entity';
import { Budget } from '../budget/budget.entity';
import { Approval } from '../approval/approval.entity';

@Entity('leads')
export class Lead extends BaseEntity {
  @Column()
  title: string;

  @Column()
  company: string;

  @Column({ name: 'contact_name', nullable: true })
  contactName?: string;

  @Column({ name: 'contact_email', nullable: true })
  contactEmail?: string;

  @Column({ nullable: true })
  website?: string;

  @Column({ type: 'enum', enum: LeadStatus, default: LeadStatus.GENERATED })
  status: LeadStatus;

  @Column({ type: 'enum', enum: TemplateType })
  template: TemplateType;

  /** Client brand mark uploaded in the wizard's Client & Brand step, stored as a data URI
   *  (CSP-safe, renders identically on web + PDF). Feeds ProposalMeta.client.logoUrl. */
  @Column({ name: 'client_logo_url', type: 'text', nullable: true })
  clientLogoUrl?: string;

  /** How the engine frames the proposal (Template & Setup step). */
  @Column({ name: 'project_type', type: 'enum', enum: ProjectType, default: ProjectType.NEW_BUILD })
  projectType: ProjectType;

  /** Who the proposal is written for — shifts tone/register (Template & Setup step). */
  @Column({ type: 'enum', enum: Audience, default: Audience.MIXED })
  audience: Audience;

  /** Freeform project context from the Template & Setup step — appended to the effective brief. */
  @Column({ name: 'project_context', type: 'text', nullable: true })
  projectContext?: string;

  /** Sales override of the auto-picked delivery structure (phase | milestone | scope | module); null = auto. */
  @Column({ name: 'structure_mode_override', type: 'varchar', nullable: true })
  structureModeOverride?: string;

  // --- Procurement (Template & Setup step). Both flags optional; they unlock the equipment schedule. ---

  /** Hardware/devices are supplied as part of this engagement. */
  @Column({ name: 'hardware_project', type: 'boolean', default: false })
  hardwareProject: boolean;

  /** A third-party service/supplier is involved. INTERNAL — the client is never told a subcontractor exists. */
  @Column({ name: 'third_party_service', type: 'boolean', default: false })
  thirdPartyService: boolean;

  /** Internal note on the hardware / third-party arrangement. Shapes the proposal; never quoted verbatim. */
  @Column({ name: 'procurement_notes', type: 'text', nullable: true })
  procurementNotes?: string;

  /**
   * Hardware delivery + installation window, in weeks, taken from the supplier quotation (or the note).
   * ADDED to the software schedule as an on-site phase — it never replaces the project timeline.
   */
  @Column({ name: 'hardware_install_weeks', type: 'int', nullable: true })
  hardwareInstallWeeks?: number;

  /**
   * Warranty cover for the supplied hardware, taken from the supplier quotation. Restated in the proposal
   * as Riseup's own commitment — the client buys the warranty from us, not from a named reseller.
   */
  @Column({ name: 'hardware_warranty', type: 'text', nullable: true })
  hardwareWarranty?: string;

  /** Deal value in integer minor units (cents). Never a float. */
  /** Currency this lead's budget is priced in. Only Local leads may be BDT. */
  @Column({ name: 'budget_currency', type: 'enum', enum: BudgetCurrency, default: BudgetCurrency.USD })
  budgetCurrency: BudgetCurrency;

  @Column({ name: 'value_cents', type: 'bigint', default: 0 })
  valueCents: string;

  @Column({ name: 'loss_reason', type: 'enum', enum: LossReason, nullable: true })
  lossReason?: LossReason;

  @Column({ name: 'loss_note', type: 'text', nullable: true })
  lossNote?: string;

  @Column({ name: 'submitted_by_id', nullable: true })
  submittedById?: string;

  /** When the lead entered the approval queue — drives the "waiting" age on the Approvals page. */
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt?: Date;

  @ManyToOne(() => User, (user) => user.leads, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'submitted_by_id' })
  submittedBy?: User;

  @OneToOne(() => Requirement, (r) => r.lead)
  requirement: Requirement;

  @OneToMany(() => Proposal, (p) => p.lead)
  proposals: Proposal[];

  @OneToOne(() => Budget, (b) => b.lead)
  budget: Budget;

  @OneToMany(() => Approval, (a) => a.lead)
  approvals: Approval[];
}

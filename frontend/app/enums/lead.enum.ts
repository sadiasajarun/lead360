export enum LeadStatus {
  GENERATED = 'generated',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SENT = 'sent',
  LOCKED = 'locked',
  LOST = 'lost',
}

/** Display order for status filters — mirrors the lifecycle, not the enum's alphabet. */
export const STATUS_ORDER: LeadStatus[] = [
  LeadStatus.GENERATED,
  LeadStatus.PENDING_APPROVAL,
  LeadStatus.APPROVED,
  LeadStatus.REJECTED,
  LeadStatus.SENT,
  LeadStatus.LOCKED,
  LeadStatus.LOST,
];

export enum LossReason {
  BUDGET = 'budget',
  SCOPE = 'scope',
  TIMELINE = 'timeline',
  COMPETITOR = 'competitor',
  NO_RESPONSE = 'no_response',
  OTHER = 'other',
}

export const LOSS_REASON_LABEL: Record<LossReason, string> = {
  [LossReason.BUDGET]: 'Budget — price was too high',
  [LossReason.SCOPE]: 'Scope — we could not cover what they needed',
  [LossReason.TIMELINE]: 'Timeline — we could not deliver in time',
  [LossReason.COMPETITOR]: 'Competitor — they went elsewhere',
  [LossReason.NO_RESPONSE]: 'No response — the client went quiet',
  [LossReason.OTHER]: 'Other',
};

export enum TemplateType {
  GLOBAL = 'global',
  LOCAL = 'local',
  AGENCY = 'agency',
  DESIGN_PORTFOLIO = 'design_portfolio',
}

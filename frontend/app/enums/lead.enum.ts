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

/** How the engine frames the proposal (Template & Setup step). Mirrors backend ProjectType. */
export enum ProjectType {
  NEW_BUILD = 'new_build',
  ENHANCE = 'enhance',
  ISSUE_FIX = 'issue_fix',
  DEPLOY = 'deploy',
  ASSESSMENT = 'assessment',
}

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  [ProjectType.NEW_BUILD]: 'New build — greenfield product from scratch',
  [ProjectType.ENHANCE]: 'Enhance — add to an existing system',
  [ProjectType.ISSUE_FIX]: 'Issue fix — stabilise / fix an existing system',
  [ProjectType.DEPLOY]: 'Deploy — ship / roll out an existing build',
  [ProjectType.ASSESSMENT]: 'Assessment — advise & recommend an approach (not a full build)',
};

/** Who the proposal is written for (Template & Setup step). Mirrors backend Audience. */
export enum Audience {
  TECHNICAL = 'technical',
  BUSINESS = 'business',
  MIXED = 'mixed',
}

export const AUDIENCE_LABEL: Record<Audience, string> = {
  [Audience.TECHNICAL]: 'Technical — engineers/architects (deeper technical detail)',
  [Audience.BUSINESS]: 'Business — decision-makers (outcome & value focus)',
  [Audience.MIXED]: 'Mixed — both audiences',
};

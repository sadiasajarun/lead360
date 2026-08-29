// Who the proposal is written for. Set on the lead in the wizard's Template & Setup step and
// passed to ProposalMeta.audience — it shifts tone/register (and whether deep-technical blocks
// appear), never the locked visual template.
export enum Audience {
  TECHNICAL = 'technical',
  BUSINESS = 'business',
  MIXED = 'mixed',
}

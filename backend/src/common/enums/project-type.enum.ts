// How the engine frames the proposal. Set on the lead in the wizard's Template & Setup step
// and passed through to ProposalMeta.projectType — it changes section framing, not the design.
export enum ProjectType {
  NEW_BUILD = 'new_build',
  ENHANCE = 'enhance',
  ISSUE_FIX = 'issue_fix',
  DEPLOY = 'deploy',
  // Advisory / feasibility engagement — the client asks Riseup to assess options and recommend an approach
  // (e.g. "assess VR vs AR"), NOT to build a full system. Sized small and framed as options, not a build plan.
  ASSESSMENT = 'assessment',
}

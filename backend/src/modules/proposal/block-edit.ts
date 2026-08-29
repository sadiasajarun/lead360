import { randomUUID } from 'crypto';
import type { Block, BlockType } from '../generation/blocks/block.types';

/**
 * Block-editing support for the stored ProposalDocument. The design is locked; editing only
 * changes WHICH blocks appear, their order, and their content — never the visual template.
 *
 * `scaffoldBlock` mints a minimal, valid, placeholder block of a given type so the palette can
 * insert one (and "change type" = remove + insert scaffold). The rep then edits the content inline.
 */

// Human labels for the insert-from-palette UI. Order = palette order.
export const BLOCK_PALETTE: { type: BlockType; label: string }[] = [
  { type: 'prose', label: 'Text block' },
  { type: 'overview', label: 'Overview + stats' },
  { type: 'scope', label: 'Scope' },
  { type: 'numberedFlow', label: 'Numbered flow' },
  { type: 'diagram', label: 'Diagram (Mermaid/D2)' },
  { type: 'layeredArchitecture', label: 'Layered architecture' },
  { type: 'vendorArchitecture', label: 'Vendor architecture' },
  { type: 'featureMatrix', label: 'Feature matrix' },
  { type: 'workApproach', label: 'Work approach' },
  { type: 'techStack', label: 'Tech stack' },
  { type: 'teamAllocation', label: 'Team allocation' },
  { type: 'financial', label: 'Financial' },
  { type: 'equipment', label: 'Hardware & equipment' },
  { type: 'paymentTerms', label: 'Payment terms' },
  { type: 'handover', label: 'Handover' },
  { type: 'comparables', label: 'Comparable work' },
  { type: 'nextStep', label: 'Next steps' },
  { type: 'cover', label: 'Cover' },
];

export function scaffoldBlock(type: BlockType): Block {
  const id = randomUUID();
  switch (type) {
    case 'cover':
      return { id, type, kicker: 'Technical & Financial Proposal', projectName: 'Project name', oneLiner: 'One-line summary of the solution.' };
    case 'overview':
      return { id, type, heading: 'The solution', lead: 'What will be built and why it matters.', stats: [{ icon: 'layout-dashboard', n: '1', label: 'Surface' }] };
    case 'scope':
      return { id, type, eyebrow: 'Project scope', heading: "What we'll build", modules: [{ icon: 'search', title: 'Module', points: ['Key capability'] }], experience: [], outOfScope: [] };
    case 'layeredArchitecture':
      return { id, type, eyebrow: 'Solution architecture', heading: 'How the platform is wired together', layers: [{ label: 'Application Core', tone: 'core', modules: [{ icon: 'search', label: 'Module' }] }] };
    case 'vendorArchitecture':
      return { id, type, eyebrow: 'Deployment', heading: 'Infrastructure & vendors', tiers: [{ icon: 'server', title: 'Service' }] };
    case 'solutionArchitecture':
      return {
        id, type, eyebrow: 'Solution architecture', heading: 'High-level solution architecture',
        groups: [
          { key: 'client', label: 'Client', icon: 'users', tone: 'client', nodes: [{ icon: 'monitor', title: 'Web App', subtitle: 'Single-page app' }] },
          { key: 'core', label: 'Application Core', icon: 'server', tone: 'core', nodes: [{ icon: 'server-cog', title: 'API Server', subtitle: 'REST API', items: [{ icon: 'search', label: 'Module' }] }] },
          { key: 'data', label: 'Persistence', icon: 'database', tone: 'data', span: true, nodes: [{ icon: 'database', title: 'Relational DB', subtitle: 'PostgreSQL' }] },
        ],
        edges: [{ from: 'client', to: 'core', label: 'REST / API', kind: 'sync' }, { from: 'core', to: 'data', label: 'ORM', kind: 'orm' }],
      };
    case 'numberedFlow':
      return { id, type, eyebrow: 'User journey', heading: 'How it works, end to end', steps: [{ icon: 'circle', title: 'Step' }] };
    case 'diagram':
      return { id, type, heading: 'Key flow', kind: 'flowchart', engine: 'mermaid', spec: 'flowchart LR\n  A[Start] --> B[End]' };
    case 'featureMatrix':
      return { id, type, heading: 'Features by module', users: [{ code: 'U', label: 'User' }], modules: [{ name: 'Module', features: [{ title: 'Feature', users: ['U'] }] }] };
    case 'workApproach':
      return { id, type, heading: 'Delivery approach', unitKind: 'phase', units: [{ name: 'Phase 1', timeline: '2 wks', deliverables: ['Deliverable'], acceptance: 'Delivered on staging, passes QA, signed off.' }] };
    case 'techStack':
      return { id, type, heading: 'What we chose, and why', rows: [{ layer: 'Layer', choice: 'Choice', why: 'Why this fits.' }] };
    case 'teamAllocation':
      return { id, type, heading: 'Who delivers this', members: [{ icon: 'user', role: 'Role', units: 1, responsibility: 'What they own.' }] };
    case 'equipment':
      // Empty shell — the Budget tab's equipment rows fill it via rederiveMoneyBlocksFromSheet.
      return { id, type, eyebrow: 'Hardware & equipment', heading: 'Hardware, equipment & installation', currency: 'USD', rows: [], totalCents: 0 };
    case 'financial':
      return { id, type, heading: 'Investment', currency: 'USD', rows: [{ label: 'Phase', focus: 'Focus', timeline: '2 wks', amountCents: 0 }], totalCents: 0, note: 'Total (excl. third-party costs)' };
    case 'paymentTerms':
      return { id, type, heading: 'Payment schedule', terms: [{ percent: 100, label: 'On delivery' }], note: '' };
    case 'handover':
      return { id, type, heading: 'What you receive from us', columns: [['Item'], ['Item']] };
    case 'comparables':
      return { id, type, heading: "We've built comparable products before", items: [{ name: 'Project', blurb: 'What it was.' }] };
    case 'nextStep':
      return { id, type, heading: 'Getting started', steps: [{ title: 'Step', sub: '' }] };
    case 'assumptions':
      return { id, type, eyebrow: 'Ground rules', heading: 'Assumptions & remarks', assumptions: ['Assumption'], dependencies: ['Remark'] };
    case 'outOfScope':
      return { id, type, eyebrow: 'Boundaries', heading: 'Proposed out of scope', items: ['Not included in this engagement.'] };
    case 'signoff':
      return { id, type, eyebrow: 'Acceptance', heading: 'Acceptance & sign-off', criteria: ['Deliverables are accepted against the agreed acceptance criteria.'], parties: [{ role: 'For the Client' }, { role: 'For Riseup Labs' }] };
    case 'prose':
    default:
      return { id, type: 'prose', heading: 'Section heading', paragraphs: ['Write your content here.'] };
  }
}

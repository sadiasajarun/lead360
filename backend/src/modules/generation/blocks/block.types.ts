/**
 * Proposal content model — backend mirror of frontend/app/types/proposal.d.ts.
 * The generation engine emits a `ProposalDocument` (meta + ordered `blocks[]`);
 * the locked Design-2 renderer draws each block with a fixed component.
 *
 * The DESIGN is fixed; the CONTENT is dynamic. The Architect pass includes/omits
 * and orders blocks per lead, but may only pick block types defined here.
 *
 * Money is integer minor units named `*Cents`. Icon fields are names resolved via
 * iconResolver: devicon (tech, priority) -> simple-icons (brand) -> lucide.
 *
 * Keep this file in lockstep with frontend/app/types/proposal.d.ts.
 */

export type Cents = number;

export type TemplateCategory = 'global' | 'local' | 'agency' | 'design_portfolio';
export type ProjectType = 'new_build' | 'enhance' | 'issue_fix' | 'deploy' | 'assessment';
export type Audience = 'technical' | 'business' | 'mixed';

export interface ProposalMeta {
  client: { name: string; logoUrl?: string | null };
  /** The EXACT project name from the lead/requirement — used verbatim as the cover title (never invented). */
  projectTitle?: string;
  preparedBy: string;
  contact: { email?: string; phone?: string; website?: string; address?: string };
  template: TemplateCategory;
  projectType: ProjectType;
  audience: Audience;
  currency: string;
  date: string;
  /** Riseup signatory ("For Riseup Labs") from org settings — the default when the brief names none. */
  signatory?: { name: string; title?: string };
}

export interface ProposalDocument {
  meta: ProposalMeta;
  blocks: Block[];
  /** name -> inline SVG, resolved once at generation (devicon → simple-icons → lucide). */
  iconMap?: Record<string, string>;
}

export interface BlockBase {
  id: string;
  /** Hand-edited, so a regeneration must not overwrite it. Set automatically when a block is edited. */
  locked?: boolean;
  eyebrow?: string;
  heading?: string;
}

export interface CoverBlock extends BlockBase {
  type: 'cover';
  kicker: string;
  projectName: string;
  oneLiner: string;
}

export interface StatCard {
  icon?: string;
  n: string;
  label: string;
  sub?: string;
}
export interface OverviewBlock extends BlockBase {
  type: 'overview';
  lead: string;
  stats: StatCard[];
}

export interface ScopeBlock extends BlockBase {
  type: 'scope';
  modules: { icon?: string; title: string; points: string[] }[];
  experience?: { title: string; detail: string }[];
  outOfScope?: string[];
}

export interface LayeredArchitectureBlock extends BlockBase {
  type: 'layeredArchitecture';
  layers: {
    label: string;
    tone?: 'blue' | 'core' | 'grey' | 'amber';
    modules: { icon: string; label: string }[];
  }[];
}

export interface VendorNode {
  key?: string;
  icon: string;
  title: string;
  sub?: string;
  badge?: number;
}
export interface VendorArchitectureBlock extends BlockBase {
  type: 'vendorArchitecture';
  tiers: VendorNode[];
  group?: { label: string; services: VendorNode[] };
  data?: VendorNode[];
  edges?: { from: string; to: string; dashed?: boolean; label?: string }[];
}

/**
 * High-Level Solution Architecture — grouped, colour-coded containers (e.g. Client / Application Core / AI &
 * Data Services / Persistence) of cards, joined by LABELLED, colour-TYPED connectors, with a legend. The
 * topology + content vary per project; the visual language is fixed. Connectors are GROUP-level (from/to are
 * group keys) so the diagram renders identically on web, PDF and Word.
 */
export interface SolutionArchNode {
  key?: string;
  icon: string;
  title: string;
  subtitle?: string;
  /** Small sub-tiles inside a card, e.g. Auth · Orchestration · Rate Limit. */
  items?: { icon: string; label: string }[];
}
export interface SolutionArchGroup {
  key: string;
  label: string;
  icon: string;
  /** Colour theme for the container + header. */
  tone: 'client' | 'core' | 'ai' | 'data' | 'grey';
  /** Full-width row of its own (e.g. Persistence sits below the top row). */
  span?: boolean;
  nodes: SolutionArchNode[];
  footnote?: string;
}
export interface SolutionArchitectureBlock extends BlockBase {
  type: 'solutionArchitecture';
  groups: SolutionArchGroup[];
  /** Connectors between GROUPS. `kind` maps to the legend arrow styles. */
  edges: { from: string; to: string; label?: string; kind: 'sync' | 'data' | 'vector' | 'orm' }[];
}

export interface NumberedFlowBlock extends BlockBase {
  type: 'numberedFlow';
  steps: { icon: string; title: string; sub?: string }[];
  rulesBar?: { icon?: string; title: string; items: string[] };
  note?: string;
}

/**
 * Process/System Flow — 1-2 IMPORTANT technical flows in the system (NOT the end-user journey): a numbered
 * horizontal pipeline of stages, each with a floating icon + a colour-numbered card + a footer chip, joined by
 * labelled/typed arrows, optionally branching DOWN to output/store cards with sub-items. Rendered in the house
 * "Diagram 2" style. Content is chosen from the project's requirement (e.g. an ingestion pipeline, a payment
 * flow, an order → fulfilment flow).
 */
export interface FlowStage {
  icon: string;
  title: string;
  desc: string;
  footerIcon?: string;
  footer?: string;
}
export interface FlowOutput {
  icon: string;
  title: string;
  desc?: string;
  items?: { icon: string; label: string }[];
}
export interface FlowSpec {
  heading: string;
  stages: FlowStage[];
  /** One per gap between stages (stages.length - 1). kind → arrow colour. */
  arrows?: { label?: string; kind?: 'data' | 'processing' | 'storage' }[];
  /** Optional down-branch: store/output cards under the pipeline. */
  outputs?: FlowOutput[];
  /** Label on the down-branch connector to the outputs (e.g. "store vectors"). */
  outputLabel?: string;
}
export interface ProcessFlowBlock extends BlockBase {
  type: 'processFlow';
  eyebrow?: string;
  flows: FlowSpec[];
}

export interface DiagramBlock extends BlockBase {
  type: 'diagram';
  kind: 'sequence' | 'flowchart' | 'subgraph' | 'tree' | 'state' | 'erd' | 'gantt' | 'journey';
  engine: 'mermaid' | 'd2';
  spec: string;
  svg?: string;
}

export interface FeatureMatrixBlock extends BlockBase {
  type: 'featureMatrix';
  users: { code: string; label: string }[];
  modules: {
    icon?: string;
    name: string;
    features: { title: string; sub?: string; users: string[] }[];
  }[];
}

export interface WorkApproachBlock extends BlockBase {
  type: 'workApproach';
  unitKind: 'phase' | 'milestone' | 'scope' | 'module';
  units: {
    name: string;
    timeline: string;
    deliverables: string[];
    acceptance: string;
  }[];
  devTesting?: string;
  /** Development methodology — how the team works (Agile/Scrum, sprints, ceremonies). Global/Local. */
  methodology?: string;
  /** QA approach — testing types, coverage, quality gates before each release. Global/Local. */
  qaApproach?: string;
}

/**
 * Deliverables & acceptance criteria — a granular, contractual matrix (distinct from the phase
 * narrative in workApproach): each concrete deliverable paired with how it is signed off.
 */
export interface DeliverablesBlock extends BlockBase {
  type: 'deliverables';
  items: { deliverable: string; acceptance: string; phase?: string }[];
}

/**
 * Project timeline chart — a week-by-week Gantt: which phase/deliverable lands in which weeks.
 * Derived deterministically from the phase plan (no LLM), so the bars always match the budget.
 */
export interface TimelineBlock extends BlockBase {
  type: 'timeline';
  totalWeeks: number;
  rows: { label: string; startWeek: number; endWeek: number; deliverable?: string; duration?: string }[];
  /** 'gantt' (default) = week-by-week bar chart; 'table' = a plain Phase | Duration table (local template). */
  layout?: 'gantt' | 'table';
}

/** Assumptions & remarks — what we assume to be true, and notes we rely on the client for. */
export interface AssumptionsBlock extends BlockBase {
  type: 'assumptions';
  assumptions: string[];
  dependencies: string[];
}

/**
 * Hardware / equipment schedule — the purchased items on the budget, itemised for the client.
 *
 * A pure projection of `budget_equipment` (see rederiveMoneyBlocksFromSheet): the engine never invents
 * hardware. Presented as a BREAKDOWN of the equipment line already inside the financial total, never as an
 * addition to it. The supplier is never named — manufacturer models are specs the client is buying.
 */
export interface EquipmentBlock extends BlockBase {
  type: 'equipment';
  currency: string;
  rows: { item: string; brand?: string; uom?: string; qty: number; unitPriceCents: Cents; amountCents: Cents; note?: string }[];
  totalCents: Cents;
  /** Show unit prices + total. Only the combined-document templates (agency, design_portfolio) do — for
   *  global/local the money lives in the Budget tab, so the proposal lists what is supplied, not its cost. */
  showPricing?: boolean;
  /** Warranty cover, stated as our commitment. */
  warranty?: string;
  note?: string;
}

/** Explicit exclusions — what is NOT included in this engagement (global/local proposals). */
export interface OutOfScopeBlock extends BlockBase {
  type: 'outOfScope';
  items: string[];
  note?: string;
}

/** Acceptance criteria + a formal sign-off block (global/local proposals). */
export interface SignoffBlock extends BlockBase {
  type: 'signoff';
  criteria: string[];
  parties: { role: string; name?: string }[];
  note?: string;
}

export interface TechStackBlock extends BlockBase {
  type: 'techStack';
  rows: { layer: string; choice: string; why: string; value?: string }[];
}

export interface TeamAllocationBlock extends BlockBase {
  type: 'teamAllocation';
  members: { icon?: string; role: string; units: number; responsibility: string }[];
}

export interface FinancialBlock extends BlockBase {
  type: 'financial';
  currency: string;
  rows: { label: string; focus?: string; timeline?: string; amountCents: Cents; rationale?: string }[];
  totalCents: Cents;
  note?: string;
  explanation?: {
    byStack?: string;
    byRole?: string;
    byTimeline?: string;
    rationale?: string;
    /** Budget-first sanity band — the typical cost range for a comparable Riseup project. */
    band?: string;
  };
}

export interface PaymentTermsBlock extends BlockBase {
  type: 'paymentTerms';
  terms: { percent: number; label: string }[];
  note?: string;
}

/**
 * Post-launch commercial terms — hosting, maintenance, support response, backup and disaster recovery,
 * ownership and warranty. Clients ask for these routinely and the proposal had nowhere to state them.
 *
 * Deliberately has NO price field. Support and maintenance pricing needs a basis Riseup sets commercially,
 * and inventing one here would put a number the business never agreed in front of a client. A term may carry
 * a `basis` describing how it is charged in words ("quoted separately", "included for 3 months").
 */
export interface CommercialTermsBlock extends BlockBase {
  type: 'commercialTerms';
  terms: { label: string; detail: string; basis?: string }[];
  note?: string;
}

export interface HandoverBlock extends BlockBase {
  type: 'handover';
  columns: string[][];
}

export interface ComparablesBlock extends BlockBase {
  type: 'comparables';
  items: { name: string; blurb: string; url?: string }[];
  whyRiseup?: {
    heading: string;
    body: string;
    points: { stat: string; label: string }[];
  };
}

export interface NextStepBlock extends BlockBase {
  type: 'nextStep';
  steps: { title: string; sub?: string }[];
}

export interface ProseBlock extends BlockBase {
  type: 'prose';
  paragraphs: string[];
}

export type Block =
  | CoverBlock
  | OverviewBlock
  | ScopeBlock
  | LayeredArchitectureBlock
  | VendorArchitectureBlock
  | SolutionArchitectureBlock
  | NumberedFlowBlock
  | ProcessFlowBlock
  | DiagramBlock
  | FeatureMatrixBlock
  | WorkApproachBlock
  | DeliverablesBlock
  | TimelineBlock
  | AssumptionsBlock
  | OutOfScopeBlock
  | SignoffBlock
  | TechStackBlock
  | TeamAllocationBlock
  | FinancialBlock
  | EquipmentBlock
  | PaymentTermsBlock
  | CommercialTermsBlock
  | HandoverBlock
  | ComparablesBlock
  | NextStepBlock
  | ProseBlock;

export type BlockType = Block['type'];
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;

/**
 * Runtime palette — the block types the Architect may choose from, and the
 * exhaustive list the renderer/registry switches on. Keep in sync with `Block`.
 */
export const BLOCK_TYPES = [
  'cover',
  'overview',
  'scope',
  'layeredArchitecture',
  'vendorArchitecture',
  'solutionArchitecture',
  'numberedFlow',
  'diagram',
  'featureMatrix',
  'workApproach',
  'deliverables',
  'timeline',
  'assumptions',
  'outOfScope',
  'signoff',
  'techStack',
  'teamAllocation',
  'financial',
  'equipment',
  'processFlow', // was missing: rendered everywhere but absent here, so block insert/type-change rejected it
  'paymentTerms',
  'commercialTerms',
  'handover',
  'comparables',
  'nextStep',
  'prose',
] as const satisfies readonly BlockType[];

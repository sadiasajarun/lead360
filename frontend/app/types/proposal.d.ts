/**
 * Proposal content model — the single contract between the generation engine
 * and the locked Design-2 renderer.
 *
 * The DESIGN is fixed (Design 2 / proposal-v2b); the CONTENT is dynamic. The
 * engine emits a `ProposalDocument` (meta + an ordered `blocks[]`); the renderer
 * draws each block with a fixed component. The Architect pass may include or omit
 * blocks and reorder them per lead — "nothing more, nothing less" — but it can
 * only choose block types that exist here (dynamic within a fixed palette).
 *
 * Money is always integer minor units (cents/poisha) named `*Cents`.
 * Icon fields are names resolved at render time via iconResolver:
 * devicon (tech, priority) -> simple-icons (brand) -> lucide (feature/module).
 */

export type Cents = number;

export type TemplateCategory = 'global' | 'local' | 'agency' | 'design_portfolio';
export type ProjectType = 'new_build' | 'enhance' | 'issue_fix' | 'deploy' | 'assessment';
export type Audience = 'technical' | 'business' | 'mixed';

/** Document-level metadata — shared by many blocks (cover branding, financials). */
export interface ProposalMeta {
  client: { name: string; logoUrl?: string | null };
  /** The EXACT project name from the lead/requirement — used verbatim as the cover title (never invented). */
  projectTitle?: string;
  preparedBy: string; // "Riseup Labs"
  contact: { email?: string; phone?: string; website?: string; address?: string };
  template: TemplateCategory;
  projectType: ProjectType;
  audience: Audience;
  currency: string; // 'USD' | 'BDT' | ...
  date: string; // ISO or display date
}

/** The whole generated proposal. Stored in proposal.sections (jsonb). */
export interface ProposalDocument {
  meta: ProposalMeta;
  blocks: Block[];
  /** name -> inline SVG, resolved once at generation (devicon → simple-icons → lucide). */
  iconMap?: Record<string, string>;
}

/** Every block carries an id (stable, for edit/reorder), optional eyebrow + heading. */
export interface BlockBase {
  id: string;
  /** Hand-edited, so a regeneration must not overwrite it. Set automatically when a block is edited. */
  locked?: boolean;
  eyebrow?: string; // small uppercase label above the heading
  heading?: string; // section h2
}

/* ────────────────────────────────────────────────────────────────────────────
 * Block palette — one interface per element in the locked template.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Cover page. Logos + contact come from ProposalMeta. */
export interface CoverBlock extends BlockBase {
  type: 'cover';
  kicker: string; // e.g. "Technical & Financial Proposal · August 2026"
  projectName: string;
  oneLiner: string;
}

/** "The Solution" — lead paragraph + at-a-glance stat cards (3–4). */
export interface OverviewBlock extends BlockBase {
  type: 'overview';
  lead: string;
  stats: StatCard[];
}
export interface StatCard {
  icon?: string;
  n: string; // "3", "6", "14 wk", "$14.2k"
  label: string; // "Verticals"
  sub?: string; // "Flights · Holidays · Visas"
}

/** Project scope — module cards + customer-experience list + out-of-scope (red ✗). */
export interface ScopeBlock extends BlockBase {
  type: 'scope';
  modules: { icon?: string; title: string; points: string[] }[];
  experience?: { title: string; detail: string }[]; // numbered benefit statements
  outOfScope?: string[];
}

/** Layered icon architecture (5.1-mobile style) — in-house component. */
export interface LayeredArchitectureBlock extends BlockBase {
  type: 'layeredArchitecture';
  layers: {
    label: string;
    tone?: 'blue' | 'core' | 'grey' | 'amber';
    modules: { icon: string; label: string }[];
  }[];
}

/** Deployment/infra architecture with real tech-stack logos — in-house component. */
export interface VendorArchitectureBlock extends BlockBase {
  type: 'vendorArchitecture';
  tiers: VendorNode[]; // stacked top nodes (User -> SSL -> Frontend ...)
  group?: { label: string; services: VendorNode[] }; // the container (e.g. "Single VM")
  data?: VendorNode[]; // data-layer nodes
  edges?: { from: string; to: string; dashed?: boolean; label?: string }[];
}
export interface VendorNode {
  key?: string;
  icon: string; // tech name -> devicon first
  title: string;
  sub?: string;
  badge?: number;
}

/** High-Level Solution Architecture — grouped colour-coded containers of cards + labelled, typed connectors. */
export interface SolutionArchNode {
  key?: string;
  icon: string;
  title: string;
  subtitle?: string;
  items?: { icon: string; label: string }[];
}
export interface SolutionArchGroup {
  key: string;
  label: string;
  icon: string;
  tone: 'client' | 'core' | 'ai' | 'data' | 'grey';
  span?: boolean;
  nodes: SolutionArchNode[];
  footnote?: string;
}
export interface SolutionArchitectureBlock extends BlockBase {
  type: 'solutionArchitecture';
  groups: SolutionArchGroup[];
  edges: { from: string; to: string; label?: string; kind: 'sync' | 'data' | 'vector' | 'orm' }[];
}

/** Numbered icon flow (Set-Builder style) — in-house component. */
export interface NumberedFlowBlock extends BlockBase {
  type: 'numberedFlow';
  steps: { icon: string; title: string; sub?: string }[];
  rulesBar?: { icon?: string; title: string; items: string[] };
  note?: string;
}

/** Process/System Flow — 1-2 important technical flows, rendered as a numbered pipeline (the "Diagram 2" style). */
export interface FlowStage { icon: string; title: string; desc: string; footerIcon?: string; footer?: string }
export interface FlowOutput { icon: string; title: string; desc?: string; items?: { icon: string; label: string }[] }
export interface FlowSpec {
  heading: string;
  stages: FlowStage[];
  arrows?: { label?: string; kind?: 'data' | 'processing' | 'storage' }[];
  outputs?: FlowOutput[];
  outputLabel?: string;
}
export interface ProcessFlowBlock extends BlockBase {
  type: 'processFlow';
  eyebrow?: string;
  flows: FlowSpec[];
}

/**
 * Kroki-rendered logical diagram (sequence / flowchart / subgraph / tree /
 * state / erd / gantt / journey). The AI writes `spec` (Mermaid/D2); the
 * pipeline fills `svg` via the Kroki service.
 */
export interface DiagramBlock extends BlockBase {
  type: 'diagram';
  kind: 'sequence' | 'flowchart' | 'subgraph' | 'tree' | 'state' | 'erd' | 'gantt' | 'journey';
  engine: 'mermaid' | 'd2';
  spec: string;
  svg?: string;
}

/** Feature breakdown — features per module, tagged with the users they serve. */
export interface FeatureMatrixBlock extends BlockBase {
  type: 'featureMatrix';
  users: { code: string; label: string }[]; // legend, e.g. C=Customer, A=Agent, M=Admin
  modules: {
    icon?: string;
    name: string;
    features: { title: string; sub?: string; users: string[] }[]; // users = codes present
  }[];
}

/** Work approach — phase/milestone/scope units, each with deliverables + acceptance. */
export interface WorkApproachBlock extends BlockBase {
  type: 'workApproach';
  unitKind: 'phase' | 'milestone' | 'scope' | 'module';
  units: {
    name: string;
    timeline: string; // "Weeks 1–6"
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

/** Assumptions & dependencies — what we assume to be true, and what we rely on the client for. */
export interface AssumptionsBlock extends BlockBase {
  type: 'assumptions';
  assumptions: string[];
  dependencies: string[];
}

/** Explicit exclusions — what is NOT included (global/local proposals). */
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

/** Technology choices — Layer | Choice | Why (+ optional value-for-money). */
export interface TechStackBlock extends BlockBase {
  type: 'techStack';
  rows: { layer: string; choice: string; why: string; value?: string }[];
}

/** Team allocation — role cards with units + responsibility. */
export interface TeamAllocationBlock extends BlockBase {
  type: 'teamAllocation';
  members: { icon?: string; role: string; units: number; responsibility: string }[];
}

/**
 * Financial estimation. Rows are phase/milestone-wise (never deliverable-wise).
 * Amounts computed by the app from the rate card; explanation is the budget-first
 * rationale surfaced to the client/Sales.
 */
export interface FinancialBlock extends BlockBase {
  type: 'financial';
  currency: string;
  rows: { label: string; focus?: string; timeline?: string; amountCents: Cents; rationale?: string }[];
  totalCents: Cents;
  note?: string;
  explanation?: {
    byStack?: string; // "Backend 40% · Mobile 32% · Console 18% · QA/PM 10%"
    byRole?: string;
    byTimeline?: string;
    rationale?: string; // why this budget (comparable band)
    band?: string; // budget-first sanity band — typical range for a comparable Riseup project
  };
}

/** Payment terms — the % schedule + note. */
/**
 * Hardware / equipment schedule — the purchased items on the budget, itemised for the client.
 * A pure projection of the budget's equipment rows; the engine never invents hardware. Presented as a
 * BREAKDOWN of the equipment line already inside the financial total, never as an addition to it.
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

export interface PaymentTermsBlock extends BlockBase {
  type: 'paymentTerms';
  terms: { percent: number; label: string }[];
  note?: string;
}

/** Release & handover — what the client receives (2 bullet columns). */
/** Post-launch commercial terms — hosting, maintenance, support, ownership. Deliberately carries no price:
 *  support pricing needs a commercial basis the business sets, not a figure invented per proposal. */
export interface CommercialTermsBlock extends BlockBase {
  type: 'commercialTerms';
  terms: { label: string; detail: string; basis?: string }[];
  note?: string;
}

export interface HandoverBlock extends BlockBase {
  type: 'handover';
  columns: string[][];
}

/** Comparable work (clickable) + the "why Riseup Labs" closing. */
export interface ComparablesBlock extends BlockBase {
  type: 'comparables';
  items: { name: string; blurb: string; url?: string }[];
  whyRiseup?: {
    heading: string;
    body: string;
    points: { stat: string; label: string }[];
  };
}

/** Next step — numbered getting-started cards. */
export interface NextStepBlock extends BlockBase {
  type: 'nextStep';
  steps: { title: string; sub?: string }[];
}

/** Generic prose — fallback for any content without a dedicated component. */
export interface ProseBlock extends BlockBase {
  type: 'prose';
  paragraphs: string[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * The discriminated union + the type-level palette.
 * ──────────────────────────────────────────────────────────────────────────── */

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

/** Every block-type string — the palette the Architect may choose from. */
export type BlockType = Block['type'];

/** Narrow a block by type: `if (isBlock(b, 'financial')) b.totalCents` */
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;

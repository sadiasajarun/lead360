/**
 * ProposalRenderer — draws a ProposalDocument in the locked Design-2 template.
 * The design is fixed (proposal.css, scoped under .pdoc); content is dynamic.
 * Absent block types are simply not rendered → that's how sections become optional.
 * Icons come from doc.iconMap (resolved at generation), provided via IconProvider.
 *
 * In the internal lead-detail view (when block actions are passed) each block gets a hover toolbar
 * (regenerate / remove). In the client `/present` view and the PDF no actions are passed, so the
 * toolbar never renders — the document stays clean.
 */
import './proposal.css';
import { useContext, useState } from 'react';
import { RefreshCw, Trash2, Loader2, Lightbulb, X, Pencil } from 'lucide-react';
import type { Block, ProposalDocument, ProposalMeta } from '~/types/proposal';
import type { BlockExplain } from '~/types/generation';
import { IconProvider } from './Icon';
import { GenericBlockEditor } from './GenericBlockEditor';
import { BlockEditContext, BlockToolbarContext, type SaveBlock, type BlockAction, type RegenerateBlock, type ExplainBlock } from './edit-context';
import {
  Cover, Overview, Scope, FeatureMatrix, WorkApproach, Deliverables, Timeline, Assumptions, OutOfScope, Signoff, TechStack,
  TeamAllocation, Financial, Equipment, PaymentTerms, CommercialTerms, Handover, Comparables, NextStep, Prose,
} from './blocks';
import { LayeredArchitecture, NumberedFlow, ProcessFlow, VendorArchitecture, SolutionArchitecture, Diagram } from './diagrams';

function renderBlock(block: Block, meta: ProposalMeta) {
  switch (block.type) {
    case 'cover': return <Cover block={block} meta={meta} />;
    case 'overview': return <Overview block={block} />;
    case 'scope': return <Scope block={block} />;
    case 'featureMatrix': return <FeatureMatrix block={block} />;
    case 'workApproach': return <WorkApproach block={block} />;
    case 'deliverables': return <Deliverables block={block} />;
    case 'timeline': return <Timeline block={block} />;
    case 'assumptions': return <Assumptions block={block} />;
    case 'outOfScope': return <OutOfScope block={block} />;
    case 'signoff': return <Signoff block={block} />;
    case 'techStack': return <TechStack block={block} />;
    case 'teamAllocation': return <TeamAllocation block={block} />;
    case 'financial': return <Financial block={block} />;
    case 'equipment': return <Equipment block={block} />;
    case 'paymentTerms': return <PaymentTerms block={block} />;
    case 'commercialTerms': return <CommercialTerms block={block} />;
    case 'handover': return <Handover block={block} />;
    case 'comparables': return <Comparables block={block} />;
    case 'nextStep': return <NextStep block={block} />;
    case 'prose': return <Prose block={block} />;
    case 'layeredArchitecture': return <LayeredArchitecture block={block} />;
    case 'vendorArchitecture': return <VendorArchitecture block={block} />;
    case 'solutionArchitecture': return <SolutionArchitecture block={block} />;
    case 'numberedFlow': return <NumberedFlow block={block} />;
    case 'processFlow': return <ProcessFlow block={block} />;
    case 'diagram': return <Diagram block={block} />;
    default: {
      const _never: never = block;
      return _never;
    }
  }
}

// Wraps a block with the internal hover toolbar (regenerate / remove). Renders a plain block when no
// toolbar actions are in context (client view / PDF), so the client document is never touched.
function BlockFrame({ block, meta }: { block: Block; meta: ProposalMeta }) {
  const tools = useContext(BlockToolbarContext);
  const onSaveBlock = useContext(BlockEditContext);
  const [busy, setBusy] = useState(false);
  const [explain, setExplain] = useState<BlockExplain | null>(null);
  const [loadingExp, setLoadingExp] = useState(false);
  const [editing, setEditing] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const hasTools = !!tools && (!!tools.regenerate || !!tools.remove || !!tools.explain);
  if (!hasTools && !onSaveBlock) return <div>{renderBlock(block, meta)}</div>;
  const run = async (fn: BlockAction) => { setBusy(true); try { await fn(block.id); } finally { setBusy(false); } };
  const runRegen = async (fn: RegenerateBlock, prompt?: string) => { setBusy(true); setRegenOpen(false); try { await fn(block.id, prompt); } finally { setBusy(false); } };
  const toggleExplain = async (fn: ExplainBlock) => {
    if (explain) { setExplain(null); return; }
    setLoadingExp(true);
    try { setExplain(await fn(block.id)); } catch { /* surfaced by nothing rendering */ } finally { setLoadingExp(false); }
  };
  return (
    <div className="pdoc-blockframe" data-testid={`blockframe-${block.id}`}>
      <div className="pdoc-blocktools" contentEditable={false}>
        {onSaveBlock ? (
          <button type="button" title="Edit every field in this section" disabled={busy} onClick={() => { setEditing((e) => !e); setRegenOpen(false); setExplain(null); }} data-testid={`block-edit-${block.id}`} className={editing ? 'on' : ''}>
            <Pencil size={13} /> <span className="lbl">Edit</span>
          </button>
        ) : null}
        {tools?.explain ? (
          <button type="button" title="Verify — internal cost calc & references (not shown to the client)" disabled={loadingExp} onClick={() => toggleExplain(tools.explain!)} data-testid={`block-explain-${block.id}`} className={explain ? 'on' : ''}>
            {loadingExp ? <Loader2 size={13} className="animate-spin" /> : <Lightbulb size={13} />} <span className="lbl">Verify</span>
          </button>
        ) : null}
        {tools?.regenerate ? (
          <button type="button" title="Regenerate this section with an optional prompt" disabled={busy} onClick={() => { setRegenOpen((o) => !o); setEditing(false); }} data-testid={`block-regen-${block.id}`} className={regenOpen ? 'on' : ''}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} <span className="lbl">Regenerate</span>
          </button>
        ) : null}
        {tools?.remove ? (
          <button type="button" title="Remove this section from the proposal" disabled={busy} onClick={() => run(tools.remove!)} data-testid={`block-remove-${block.id}`} className="danger">
            <Trash2 size={13} /> <span className="lbl">Delete</span>
          </button>
        ) : null}
      </div>
      {busy ? <div className="pdoc-blockbusy" /> : null}
      {regenOpen && tools?.regenerate ? <RegenPopover onClose={() => setRegenOpen(false)} onRun={(p) => runRegen(tools.regenerate!, p)} /> : null}
      {editing && onSaveBlock ? <GenericBlockEditor block={block} onSave={(patch) => onSaveBlock(block.id, patch)} onClose={() => setEditing(false)} /> : null}
      {explain ? <ExplainPanel explain={explain} onClose={() => setExplain(null)} /> : null}
      {renderBlock(block, meta)}
    </div>
  );
}

// Small prompt box for steering a single-block regeneration ("make it shorter", "add a rollout phase").
function RegenPopover({ onRun, onClose }: { onRun: (prompt?: string) => void; onClose: () => void }) {
  const [prompt, setPrompt] = useState('');
  return (
    <div className="pdoc-regen" contentEditable={false} data-testid="block-regen-popover">
      <div className="pdoc-regen-head"><span>Regenerate this section</span><button type="button" onClick={onClose} aria-label="Close"><X size={13} /></button></div>
      <textarea
        autoFocus
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Optional — describe the change, e.g. “make it more concise” or “add a phased rollout”. Leave blank to redraft as-is."
        data-testid="block-regen-prompt"
      />
      <div className="pdoc-regen-foot">
        <button type="button" className="go" onClick={() => onRun(prompt)} data-testid="block-regen-run"><RefreshCw size={13} /> Regenerate</button>
        <span className="muted">Uses AI · re-drafts this section, grounded in the Riseup database.</span>
      </div>
    </div>
  );
}

const money = (cents: number, currency: string) => new Intl.NumberFormat(currency === 'BDT' ? 'en-IN' : 'en-US', { maximumFractionDigits: 0 }).format(Math.round(cents / 100));

// Internal-only 💡 panel: cost breakdown (team × weekly rate × weeks) or tech why + portfolio references.
function ExplainPanel({ explain, onClose }: { explain: BlockExplain; onClose: () => void }) {
  const f = explain.financial;
  return (
    <div className="pdoc-explain" contentEditable={false} data-testid="block-explain-panel">
      <div className="pdoc-explain-head">
        <span>💡 Internal — {explain.kind === 'financial' ? 'cost calculation' : explain.kind === 'techStack' ? 'tech rationale & references' : 'notes'} <em>(not shown to the client or in the PDF)</em></span>
        <button type="button" onClick={onClose} aria-label="Close"><X size={14} /></button>
      </div>
      {explain.kind === 'financial' && f ? (
        <div>
          <table className="pdoc-explain-tbl">
            <tbody>
              <tr><th>Team member</th><th className="r">Weekly rate ({f.currency})</th></tr>
              {f.members.map((m, i) => (
                <tr key={i}><td>{m.role}{m.units > 1 ? ` ×${m.units}` : ''} <span className="muted">· {m.seniority}</span></td><td className="r num">{money(m.weeklyRateCents * m.units, f.currency)}</td></tr>
              ))}
              <tr className="sub"><td>Team weekly cost</td><td className="r num">{money(f.teamWeeklyCents, f.currency)}</td></tr>
            </tbody>
          </table>
          <table className="pdoc-explain-tbl" style={{ marginTop: 10 }}>
            <tbody>
              <tr><th>Phase</th><th>Team</th><th>Weeks</th><th className="r">Cost = phase team weekly × weeks</th></tr>
              {f.phases.map((p, i) => {
                const wk = p.weeklyCents ?? f.teamWeeklyCents;
                const heads = p.team?.reduce((s, m) => s + m.units, 0) ?? 0;
                return <tr key={i}><td>{p.label}</td><td>{heads ? `${heads} ppl` : '—'}</td><td>{p.weeks}</td><td className="r num">{money(wk, f.currency)} × {p.weeks} = {money(p.cents, f.currency)}</td></tr>;
              })}
              <tr className="sub"><td colSpan={3}>Total</td><td className="r num">{money(f.totalCents, f.currency)}</td></tr>
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: 8, fontSize: 11.5 }}>Each phase is billed for its OWN team (ramped up/down), not the full team every phase. Edit the team per phase in the layout panel, then regenerate. To hit an exact budget, regenerate with a prompt like “make the budget $95k”.</p>
        </div>
      ) : explain.kind === 'techStack' && explain.rows ? (
        <div className="pdoc-explain-tech">
          {explain.rows.map((r, i) => (
            <div key={i} className="row">
              <div><b>{r.choice}</b> <span className="muted">· {r.layer}</span></div>
              <div className="why">{r.why}</div>
              <div className="refs">
                {r.references.length ? <>Used in: {r.references.map((ref, j) => <a key={j} href={ref.url} target="_blank" rel="noreferrer">{ref.title}</a>)}</> : <span className="muted">No cited portfolio project yet.</span>}
              </div>
            </div>
          ))}
          {explain.matchedRule ? <p className="muted" style={{ fontSize: 11.5 }}>Stack shape: {explain.matchedRule}</p> : null}
        </div>
      ) : (
        <p className="muted">{explain.note}</p>
      )}
    </div>
  );
}

export function ProposalRenderer({
  doc,
  onSaveBlock,
  onRegenerateBlock,
  onDeleteBlock,
  onExplainBlock,
}: {
  doc: ProposalDocument;
  onSaveBlock?: SaveBlock;
  onRegenerateBlock?: RegenerateBlock;
  onDeleteBlock?: BlockAction;
  onExplainBlock?: ExplainBlock;
}) {
  const tools = onRegenerateBlock || onDeleteBlock || onExplainBlock ? { regenerate: onRegenerateBlock, remove: onDeleteBlock, explain: onExplainBlock } : null;
  return (
    <IconProvider map={doc.iconMap}>
      <BlockEditContext.Provider value={onSaveBlock ?? null}>
        <BlockToolbarContext.Provider value={tools}>
          <div className="pdoc">
            <div className="paper">
              {doc.blocks.map((block) => (
                <BlockFrame key={block.id} block={block} meta={doc.meta} />
              ))}
            </div>
          </div>
        </BlockToolbarContext.Provider>
      </BlockEditContext.Provider>
    </IconProvider>
  );
}

export default ProposalRenderer;

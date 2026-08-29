/**
 * Diagram block components. Icon-based ones (layered, numbered, vendor) are
 * in-house and draw from a spec + iconMap. The `diagram` slot renders the SVG
 * that Kroki produced at generation time (Mermaid/D2) — placeholder until then.
 */
import { Fragment } from 'react';
import type {
  LayeredArchitectureBlock,
  NumberedFlowBlock,
  VendorArchitectureBlock,
  SolutionArchitectureBlock,
  SolutionArchGroup,
  ProcessFlowBlock,
  DiagramBlock,
} from '~/types/proposal';
import { Icon } from './Icon';
import { ArchIcon } from './arch-icons';

const KIND_LABEL: Record<string, string> = { sync: 'Synchronous Call', data: 'Data Flow', vector: 'Event / Webhook', orm: 'ORM Connection' };
// Header-chip colour per zone; node-chip colour derives from the zone + the node's position (first core
// service is dark, the rest orange — mirrors the inspiration); sub-tile tint follows the node chip.
const HEAD_TONE: Record<string, string> = { client: 'blue', core: 'dark', ai: 'purple', data: 'green', grey: 'dark' };
const nodeTone = (gt: string, i: number) => (gt === 'client' ? 'blue' : gt === 'core' ? (i === 0 ? 'dark' : 'orange') : gt === 'ai' ? 'purple' : gt === 'data' ? 'green' : 'dark');
const subTone = (nt: string) => (nt === 'dark' ? 'blue' : nt);
const arrowClass = (k: string) => (k === 'sync' ? 'sync' : k === 'data' ? 'data' : k === 'vector' ? 'event' : 'orm');

/** Stylised client dashboard illustration — fixed art; renders in the Client zone. */
function SaMonitor() {
  return (
    <div className="sa-monitor">
      <svg viewBox="0 0 200 118" fill="none" aria-hidden="true">
        <rect x="6" y="6" width="188" height="94" rx="8" fill="#fff" stroke="#C4D6FF" strokeWidth="2" />
        <rect x="6" y="6" width="188" height="20" rx="8" fill="#EAF1FF" />
        <circle cx="18" cy="16" r="2.4" fill="#2563EB" /><circle cx="27" cy="16" r="2.4" fill="#93B4FF" /><circle cx="36" cy="16" r="2.4" fill="#CBD9FF" />
        <rect x="16" y="36" width="52" height="54" rx="6" fill="#EAF1FF" />
        <circle cx="42" cy="58" r="14" fill="none" stroke="#2563EB" strokeWidth="6" /><path d="M42 44a14 14 0 0 1 12 7" stroke="#EA5400" strokeWidth="6" fill="none" />
        <rect x="80" y="36" width="104" height="12" rx="4" fill="#EAF1FF" /><rect x="80" y="54" width="104" height="12" rx="4" fill="#F1F5FB" /><rect x="80" y="72" width="70" height="12" rx="4" fill="#F1F5FB" />
        <path d="M60 100h80M100 100v8M92 108h16" stroke="#C4D6FF" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/** High-level solution architecture — grouped colour-coded zones + labelled, typed connectors (the house figure). */
export function SolutionArchitecture({ block }: { block: SolutionArchitectureBlock }) {
  const top = block.groups.filter((g) => !g.span);
  const spans = block.groups.filter((g) => g.span);
  const between = (a: string, b: string) => block.edges.filter((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
  const downEdges = block.edges.filter((e) => spans.some((s) => s.key === e.to));
  const kinds = [...new Set(block.edges.map((e) => e.kind))];

  const nodeCard = (g: SolutionArchGroup, n: SolutionArchGroup['nodes'][number], i: number) => {
    const nt = nodeTone(g.tone, i);
    return (
      <div className="sa-card" key={n.key ?? i}>
        <div className="sa-nrow">
          <span className={`sa-chip lg ${nt}`}><ArchIcon name={n.icon} /></span>
          <span className="sa-ntext"><b>{n.title}</b>{n.subtitle ? <span>{n.subtitle}</span> : null}</span>
        </div>
        {n.items?.length ? (
          <div className="sa-subs">
            {n.items.map((it, j) => (
              <span className={`sa-sub ${subTone(nt)}`} key={j}><span className="sa-sic"><ArchIcon name={it.icon} /></span>{it.label}</span>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const groupCard = (g: SolutionArchGroup) => (
    <div className={`sa-group ${g.tone}`} key={g.key}>
      <div className="sa-ghead"><span className={`sa-chip ${HEAD_TONE[g.tone] ?? 'dark'}`}><ArchIcon name={g.icon} /></span>{g.label}</div>
      {g.tone === 'client' ? <SaMonitor /> : null}
      {g.tone === 'client' ? (
        <div className="sa-surf">
          {g.nodes.map((n, i) => (
            <div className="sa-s" key={n.key ?? i}><span className="sa-chip blue"><ArchIcon name={n.icon} /></span><span>{n.title}</span></div>
          ))}
        </div>
      ) : (
        <div className={`sa-nodes ${g.span ? 'row' : ''}`}>
          {g.nodes.map((n, i) => (
            <Fragment key={n.key ?? i}>
              {i > 0 && !g.span ? <div className="sa-vgap"><svg width="15" height="22" aria-hidden="true"><line x1="7.5" y1="1" x2="7.5" y2="15" stroke="currentColor" strokeWidth="1.8" /><polygon points="7.5,21 3.5,13 11.5,13" fill="currentColor" /></svg></div> : null}
              {nodeCard(g, n, i)}
            </Fragment>
          ))}
        </div>
      )}
      {g.footnote ? <div className="sa-foot">{g.footnote}</div> : null}
    </div>
  );

  const hConn = (leftKey: string, edges: typeof block.edges) => {
    const fwd = edges.some((e) => e.from === leftKey);
    const back = edges.some((e) => e.to === leftKey);
    const kind = edges[0]?.kind ?? 'sync';
    return (
      <div className="sa-gut">
        {edges.map((e, i) => (e.label ? <span className={`sa-pill ${arrowClass(e.kind)}`} key={i}>{e.label}</span> : null))}
        <svg width="60" height="14" className={`sa-arw ${arrowClass(kind)}`} aria-hidden="true">
          <line x1="4" y1="7" x2="56" y2="7" stroke="currentColor" strokeWidth="2" strokeDasharray={kind === 'orm' ? '4 3' : undefined} />
          {fwd ? <polygon points="56,7 49,3.5 49,10.5" fill="currentColor" /> : null}
          {back ? <polygon points="4,7 11,3.5 11,10.5" fill="currentColor" /> : null}
        </svg>
      </div>
    );
  };

  const vConn = (edges: typeof block.edges) => (
    <div className="sa-downs">
      {edges.map((e, i) => (
        <div className="sa-down" key={i}>
          {e.label ? <span className={`sa-pill ${arrowClass(e.kind)}`}>{e.label}</span> : null}
          <svg width="15" height="22" className={`sa-arw ${arrowClass(e.kind)}`} aria-hidden="true"><line x1="7.5" y1="1" x2="7.5" y2="15" stroke="currentColor" strokeWidth="2" strokeDasharray={e.kind === 'orm' ? '4 3' : undefined} /><polygon points="7.5,21 3.5,13 11.5,13" fill="currentColor" /></svg>
        </div>
      ))}
    </div>
  );

  return (
    <section>
      {block.eyebrow ? <span className="eyebrow">{block.eyebrow}</span> : null}
      <div className="sa">
        {block.heading ? <div className="sa-title"><h3>{block.heading}</h3><span className="sa-rule" /></div> : null}
        <div className="sa-top">
          {top.map((g, i) => (
            <Fragment key={g.key}>
              {groupCard(g)}
              {i < top.length - 1 && between(g.key, top[i + 1].key).length ? hConn(g.key, between(g.key, top[i + 1].key)) : null}
            </Fragment>
          ))}
        </div>
        {spans.length ? (
          <>
            {downEdges.length ? vConn(downEdges) : null}
            {spans.map((g) => groupCard(g))}
          </>
        ) : null}
        <div className="sa-legend">
          {kinds.map((k) => <span className={`sa-lg ${arrowClass(k)}`} key={k}><i />{KIND_LABEL[k] ?? k}</span>)}
          <span className="sa-lgsep" />
          <span className="sa-lg"><span className="sa-chip dark"><ArchIcon name="shield" /></span>Security</span>
          <span className="sa-lg"><span className="sa-chip orange"><ArchIcon name="gear" /></span>Processing</span>
          <span className="sa-lg"><span className="sa-chip green"><ArchIcon name="db" /></span>Storage</span>
          <span className="sa-lg"><span className="sa-chip purple"><ArchIcon name="plug" /></span>Integration</span>
        </div>
      </div>
    </section>
  );
}

const ARROW = '#9AA4B4';
const VArrow = () => (
  <svg width="26" height="34" viewBox="0 0 26 34" style={{ margin: '2px 0' }} aria-hidden="true">
    <path d="M13 2 V25" stroke={ARROW} strokeWidth="2" fill="none" />
    <path d="M13 32 L8 23 H18 Z" fill={ARROW} />
  </svg>
);

export function LayeredArchitecture({ block }: { block: LayeredArchitectureBlock }) {
  const tones = ['blue', 'core', 'grey', 'amber'] as const;
  return (
    <section>
      {block.eyebrow ? <span className="eyebrow">{block.eyebrow}</span> : null}
      {block.heading ? <h2>{block.heading}</h2> : null}
      <div className="dg-arch">
        {block.layers.map((l, i) => (
          <Fragment key={i}>
            <div className={`dg-layer ${l.tone ?? tones[i % tones.length]}`}>
              <span className="dg-lab">{l.label}</span>
              <div className="dg-mods">
                {l.modules.map((m, j) => (
                  <div className="dg-mod" key={j}><span className="dg-ico"><Icon name={m.icon} /></span><b>{m.label}</b></div>
                ))}
              </div>
            </div>
            {i < block.layers.length - 1 ? <div className="dg-drop" /> : null}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

export function NumberedFlow({ block }: { block: NumberedFlowBlock }) {
  return (
    <section>
      {block.eyebrow ? <span className="eyebrow">{block.eyebrow}</span> : null}
      {block.heading ? <h2>{block.heading}</h2> : null}
      <div className="dg-flow">
        {block.steps.map((s, i) => (
          <Fragment key={i}>
            <div className="dg-card">
              <span className="dg-nb">{i + 1}</span>
              <span className="dg-cico"><Icon name={s.icon} size={24} /></span>
              <b>{s.title}</b>
              <span className="dg-rule" />
              {s.sub ? <span>{s.sub}</span> : null}
            </div>
            {i < block.steps.length - 1 ? <div className="dg-narr">→</div> : null}
          </Fragment>
        ))}
      </div>
      {block.rulesBar ? (
        <div className="dg-rules">
          <span className="dg-rico"><Icon name={block.rulesBar.icon} size={22} /></span>
          <div><b>{block.rulesBar.title}</b><span>{block.rulesBar.items.join(' · ')}</span></div>
        </div>
      ) : null}
      {block.note ? <p className="small muted" style={{ marginTop: 12 }}>{block.note}</p> : null}
    </section>
  );
}

// ── Process / System Flow — the "Diagram 2" numbered pipeline ────────────────────────────────────────
const FLOW_TONE = ['blue', 'orange', 'purple', 'green'];
const flowArrow = (k?: string) => (k === 'data' ? 'data' : k === 'storage' ? 'storage' : 'proc');

export function ProcessFlow({ block }: { block: ProcessFlowBlock }) {
  const kinds = [...new Set(block.flows.flatMap((f) => (f.arrows ?? []).map((a) => flowArrow(a.kind))).concat(block.flows.some((f) => f.outputs?.length) ? ['storage'] : []))];
  const LINE_LABEL: Record<string, string> = { data: 'Data Flow', proc: 'Processing Flow', storage: 'Storage Flow' };
  return (
    <section>
      {block.eyebrow ? <span className="eyebrow">{block.eyebrow}</span> : null}
      <div className="pf">
        {block.flows.map((flow, fi) => (
          <div className="pf-flow" key={fi}>
            {flow.heading ? <div className="pf-title"><h3>{flow.heading}</h3><span className="pf-rule" /></div> : null}
            <div className="pf-pipe">
              {flow.stages.map((s, i) => {
                const tone = FLOW_TONE[i % 4];
                return (
                  <Fragment key={i}>
                    <div className="pf-stage">
                      <div className={`pf-ficon ${tone}`}><ArchIcon name={s.icon} /></div>
                      <div className={`pf-card ${tone}`}>
                        <div className="pf-chead">
                          <span className={`pf-badge ${tone}`}>{String(i + 1).padStart(2, '0')}</span>
                          <div className="pf-ctext"><b>{s.title}</b>{s.desc ? <span>{s.desc}</span> : null}</div>
                        </div>
                        {s.footer ? <div className={`pf-foot ${tone}`}><span className="pf-fico"><ArchIcon name={s.footerIcon || s.icon} /></span>{s.footer}</div> : null}
                      </div>
                    </div>
                    {i < flow.stages.length - 1 ? (
                      <div className={`pf-arr ${flowArrow(flow.arrows?.[i]?.kind)}`}>
                        {flow.arrows?.[i]?.label ? <span className="pf-alabel">{flow.arrows[i].label}</span> : null}
                        <svg width="46" height="14" aria-hidden="true"><line x1="2" y1="7" x2="39" y2="7" stroke="currentColor" strokeWidth="2" /><polygon points="44,7 36,3 36,11" fill="currentColor" /></svg>
                      </div>
                    ) : null}
                  </Fragment>
                );
              })}
            </div>
            {flow.outputs?.length ? (
              <>
                <div className="pf-branch">{flow.outputLabel ? <span className="pf-blabel">{flow.outputLabel}</span> : <span className="pf-blabel">outputs</span>}</div>
                <div className="pf-outs">
                  {flow.outputs.map((o, oi) => (
                    <div className="pf-out" key={oi}>
                      <div className="pf-orow"><span className="pf-oico"><ArchIcon name={o.icon} /></span><div className="pf-otext"><b>{o.title}</b>{o.desc ? <span>{o.desc}</span> : null}</div></div>
                      {o.items?.length ? <div className="pf-oitems">{o.items.map((it, ii) => <span className="pf-oitem" key={ii}><ArchIcon name={it.icon} />{it.label}</span>)}</div> : null}
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ))}
        {kinds.length ? (
          <div className="pf-legend">
            {kinds.map((k) => <span className={`pf-lg ${k}`} key={k}><i />{LINE_LABEL[k] ?? k}</span>)}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function VendorArchitecture({ block }: { block: VendorArchitectureBlock }) {
  return (
    <section>
      {block.eyebrow ? <span className="eyebrow">{block.eyebrow}</span> : null}
      {block.heading ? <h2>{block.heading}</h2> : null}
      <div className="diagram" style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '30px 20px', overflowX: 'auto' }}>
        <div className="va-col">
          {block.tiers.map((n, i) => (
            <Fragment key={i}>
              <div className="va-node">
                {n.badge != null ? <span className="va-badge">{n.badge}</span> : null}
                <span className="va-ico"><Icon name={n.icon} size={24} /></span>
                <span className="va-t"><b>{n.title}</b>{n.sub ? <span>{n.sub}</span> : null}</span>
              </div>
              <VArrow />
            </Fragment>
          ))}
          {block.group ? (
            <div className="va-vm">
              <div className="va-vm-h">{block.group.label}</div>
              <div className="va-svcs">
                {block.group.services.map((s, j) => (
                  <Fragment key={j}>
                    <div className="va-svc"><span className="va-ico"><Icon name={s.icon} size={24} /></span><b>{s.title}</b>{s.sub ? <span>{s.sub}</span> : null}</div>
                    {j < block.group!.services.length - 1 ? <span className="va-harr">→</span> : null}
                  </Fragment>
                ))}
              </div>
            </div>
          ) : null}
          {block.data?.length ? (
            <>
              <VArrow />
              {block.data.map((n, i) => (
                <div className="va-node va-db" key={i}>
                  <span className="va-ico"><Icon name={n.icon} size={24} /></span>
                  <span className="va-t"><b>{n.title}</b>{n.sub ? <span>{n.sub}</span> : null}</span>
                </div>
              ))}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function Diagram({ block }: { block: DiagramBlock }) {
  return (
    <section>
      {block.eyebrow ? <span className="eyebrow">{block.eyebrow}</span> : null}
      {block.heading ? <h2>{block.heading}</h2> : null}
      {block.svg ? (
        <div className="kroki-svg" dangerouslySetInnerHTML={{ __html: block.svg }} />
      ) : (
        <div style={{ border: '1px dashed var(--line-2)', borderRadius: 12, padding: '36px 20px', textAlign: 'center', color: 'var(--subtle)', background: 'var(--soft)', fontSize: 13 }}>
          ▧ {block.kind} diagram · rendered at generation via Kroki ({block.engine})
        </div>
      )}
    </section>
  );
}

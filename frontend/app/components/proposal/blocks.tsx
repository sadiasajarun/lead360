/**
 * Block components for the locked Design-2 renderer.
 * Each component reads a typed block payload and emits the exact markup/classes
 * of proposal-v2b (styles live in proposal.css, scoped under .pdoc).
 *
 * Content blocks are fully implemented. The four diagram blocks
 * (layeredArchitecture, vendorArchitecture, numberedFlow, diagram) render as
 * labeled placeholders here — the real diagram components + iconResolver are Task 3.
 */
import type {
  ProposalMeta,
  CoverBlock,
  OverviewBlock,
  ScopeBlock,
  FeatureMatrixBlock,
  WorkApproachBlock,
  DeliverablesBlock,
  TimelineBlock,
  EquipmentBlock,
  AssumptionsBlock,
  OutOfScopeBlock,
  SignoffBlock,
  TechStackBlock,
  TeamAllocationBlock,
  FinancialBlock,
  PaymentTermsBlock,
  HandoverBlock,
  ComparablesBlock,
  NextStepBlock,
  ProseBlock,
  Block,
} from '~/types/proposal';
import { useContext, useEffect, useState } from 'react';
import { Icon } from './Icon';
import { BlockEditContext } from './edit-context';

const money = (cents: number, currency: string) => {
  const locale = currency === 'BDT' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(cents / 100));
};

// Riseup Labs' own contact — shown on the cover; used as a fallback so older proposals (generated before
// the contact was baked into meta) still display it without needing a regenerate.
const RISEUP_CONTACT = { phone: '+88-0175-974-7387', email: 'contact@riseuplabs.com', website: 'riseuplabs.com' };

export function Cover({ block, meta }: { block: CoverBlock; meta: ProposalMeta }) {
  const client = meta.client;
  const contact = {
    email: meta.contact.email || RISEUP_CONTACT.email,
    phone: meta.contact.phone || RISEUP_CONTACT.phone,
    website: meta.contact.website || RISEUP_CONTACT.website,
  };
  return (
    <section className="cover">
      <div className="top">
        <div className="rlogo" role="img" aria-label="Riseup Labs" />
        {client.logoUrl ? (
          <img src={client.logoUrl} alt={client.name} style={{ maxHeight: 40, maxWidth: 160 }} />
        ) : (
          <div className="clogo"><span className="cm">{client.name.trim().charAt(0).toUpperCase() || '•'}</span> {client.name.toUpperCase()}</div>
        )}
      </div>
      <div className="mid">
        <div className="pk">{block.kicker}</div>
        <h1>{block.projectName}</h1>
        <p className="oneline">{block.oneLiner}</p>
      </div>
      <div className="foot">
        <div><b>Prepared for</b>{client.name}{meta.contact.address ? <><br />{meta.contact.address}</> : null}</div>
        <div><b>Prepared by</b>{meta.preparedBy}</div>
        <div className="ct"><b>Contact</b>
          <span className="o">{contact.email}</span>
          <span>{contact.phone}</span>
          <span>{contact.website}</span>
        </div>
      </div>
    </section>
  );
}

export function Overview({ block }: { block: OverviewBlock }) {
  return (
    <section>
      <span className="eyebrow">{block.eyebrow ?? 'The Solution'}</span>
      {block.heading ? <h2>{block.heading}</h2> : null}
      <p className="lead">{block.lead}</p>
    </section>
  );
}

export function Scope({ block }: { block: ScopeBlock }) {
  return (
    <section>
      <span className="eyebrow">{block.eyebrow ?? 'Project scope'}</span>
      {block.heading ? <h2>{block.heading}</h2> : null}
      <div className="cols3" style={{ marginBottom: 26 }}>
        {block.modules.map((m, i) => (
          <div className="card" key={i}>
            {m.icon ? <div className="cico"><Icon name={m.icon} /></div> : null}
            <h3>{m.title}</h3>
            <ul className="clean small">{m.points.map((p, j) => <li key={j}>{p}</li>)}</ul>
          </div>
        ))}
      </div>
      {(block.experience?.length || block.outOfScope?.length) ? (
        // Side by side only when there IS an out-of-scope column; alone, the experience list takes the
        // full width and flows as a 2-column grid rather than one tall stack.
        <div className={block.experience?.length && block.outOfScope?.length ? 'cols2' : ''}>
          {block.experience?.length ? (
            <div>
              <div className="subh">How your end users will experience it</div>
              <div className="exp">
                {block.experience.map((e, i) => (
                  <div className="row" key={i}>
                    <div className="ei">{i + 1}</div>
                    <div><b>{e.title}</b><p>{e.detail}</p></div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {block.outOfScope?.length ? (
            <div>
              <div className="oos">
                <div className="subh">Out of scope</div>
                <ul>{block.outOfScope.map((o, i) => <li key={i}>{o}</li>)}</ul>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function FeatureMatrix({ block }: { block: FeatureMatrixBlock }) {
  return (
    <section>
      <span className="eyebrow">{block.eyebrow ?? 'Requirements'}</span>
      {block.heading ? <h2>{block.heading}</h2> : null}
      {block.modules.map((m, i) => (
        <div className="fmod" key={i}>
          <div className="fh">{m.icon ? <span className="fi"><Icon name={m.icon} size={16} /></span> : null} {m.name}</div>
          {m.features.map((f, j) => (
            <div className="frow" key={j}>
              <div className="ft">{f.title}{f.sub ? <span>{f.sub}</span> : null}</div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

export function WorkApproach({ block }: { block: WorkApproachBlock }) {
  return (
    <section>
      <span className="eyebrow">Our work approach</span>
      {block.heading ? <h2>{block.heading}</h2> : null}
      {block.methodology || block.qaApproach ? (
        <div className="cols2 wa-how">
          {block.methodology ? <div className="wa-c"><div className="subh">Development methodology</div><p>{block.methodology}</p></div> : null}
          {block.qaApproach ? <div className="wa-c"><div className="subh">QA approach</div><p>{block.qaApproach}</p></div> : null}
        </div>
      ) : null}
      {block.units.map((u, i) => (
        <div className="phase" key={i}>
          {/* Deliverables only — the week chip and acceptance panel are not shown in this section. */}
          <div className="ph-h"><b>{u.name}</b></div>
          <div>
            <div className="subh">Deliverables</div>
            <ol className="del">{u.deliverables.map((d, j) => <li key={j}>{d}</li>)}</ol>
          </div>
        </div>
      ))}
      {block.devTesting ? <p className="small muted" style={{ marginTop: 16 }}>{block.devTesting}</p> : null}
    </section>
  );
}

export function Deliverables({ block }: { block: DeliverablesBlock }) {
  return (
    <section>
      <span className="eyebrow">{block.eyebrow ?? 'Scope commitment'}</span>
      {block.heading ? <h2>{block.heading}</h2> : null}
      <div className="tw">
        <table className="dl-tbl">
          <tbody>
            <tr><th>Deliverable</th><th>Acceptance criteria</th></tr>
            {block.items.map((it, i) => (
              <tr key={i}>
                <td><b>{it.deliverable}</b>{it.phase ? <span className="small muted"> · {it.phase}</span> : null}</td>
                <td>{it.acceptance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function Timeline({ block }: { block: TimelineBlock }) {
  const total = Math.max(1, block.totalWeeks);
  const dur = (weeks: number) => `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
  if (block.layout === 'table') {
    return (
      <section>
        <span className="eyebrow">{block.eyebrow ?? 'Delivery timeline'}</span>
        {block.heading ? <h2>{block.heading}</h2> : null}
        <div className="tw">
          <table>
            <tbody>
              <tr><th>Phase</th><th className="r">Duration</th></tr>
              {block.rows.map((r, i) => (
                <tr key={i}>
                  <td><b>{r.label}</b>{r.deliverable ? <span className="small muted"> · {r.deliverable}</span> : null}</td>
                  <td className="r">{r.duration ?? dur(Math.max(1, r.endWeek - r.startWeek + 1))}</td>
                </tr>
              ))}
              <tr className="tot"><td>Total</td><td className="r">{dur(block.totalWeeks)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>Durations run from project kickoff; parallelisable work may compress the total.</p>
      </section>
    );
  }
  return (
    <section>
      <span className="eyebrow">{block.eyebrow ?? 'Delivery timeline'}</span>
      {block.heading ? <h2>{block.heading}</h2> : null}
      <div className="tl">
        <div className="tl-row tl-axis">
          <div className="tl-lab" />
          <div className="tl-track tl-ticks">
            {Array.from({ length: total }, (_, i) => <span className="tl-tick" key={i}>{i + 1}</span>)}
          </div>
        </div>
        {block.rows.map((r, i) => {
          const span = Math.max(1, r.endWeek - r.startWeek + 1);
          const left = ((r.startWeek - 1) / total) * 100;
          const width = (span / total) * 100;
          const wkLabel = r.startWeek === r.endWeek ? `Wk ${r.startWeek}` : `Wks ${r.startWeek}–${r.endWeek}`;
          return (
            <div className="tl-row" key={i}>
              <div className="tl-lab"><b>{r.label}</b>{r.deliverable ? <span>{r.deliverable}</span> : null}</div>
              <div className="tl-track">
                <div className="tl-bar" style={{ left: `${left.toFixed(2)}%`, width: `${width.toFixed(2)}%` }}><span>{wkLabel}</span></div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>Weeks are indicative and run from project kickoff; parallelisable work may compress the total.</p>
    </section>
  );
}

export function Assumptions({ block }: { block: AssumptionsBlock }) {
  return (
    <section>
      <span className="eyebrow">{block.eyebrow ?? 'Ground rules'}</span>
      {block.heading ? <h2>{block.heading}</h2> : null}
      <div className="cols2">
        <div><div className="subh">Assumptions</div><ul className="clean small ad-list">{block.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
        <div><div className="subh">Remarks</div><ul className="clean small ad-list">{block.dependencies.map((d, i) => <li key={i}>{d}</li>)}</ul></div>
      </div>
    </section>
  );
}

export function OutOfScope({ block }: { block: OutOfScopeBlock }) {
  return (
    <section>
      <span className="eyebrow">{block.eyebrow ?? 'Boundaries'}</span>
      {block.heading ? <h2>{block.heading}</h2> : null}
      <ul className="clean small oos-list">{block.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
      {block.note ? <p className="small muted" style={{ marginTop: 12 }}>{block.note}</p> : null}
    </section>
  );
}

export function Signoff({ block }: { block: SignoffBlock }) {
  return (
    <section>
      <span className="eyebrow">{block.eyebrow ?? 'Acceptance'}</span>
      {block.heading ? <h2>{block.heading}</h2> : null}
      <ul className="clean small ad-list">{(block.criteria ?? []).map((c, i) => <li key={i}>{c}</li>)}</ul>
      {block.note ? <p className="small muted" style={{ marginTop: 10 }}>{block.note}</p> : null}
      <div className="so-grid">
        {(block.parties ?? []).map((p, i) => (
          <div className="so-party" key={i}>
            <div className="so-role">{p.role}</div>
            <div className="so-line"><span>Name</span><i />{p.name ? <b>{p.name}</b> : null}</div>
            <div className="so-line"><span>Signature</span><i /></div>
            <div className="so-line"><span>Date</span><i /></div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Hardware / equipment schedule — a breakdown of the equipment already inside the financial total.
 * Renders nothing when no hardware is supplied, so the section never appears as an empty table.
 */
export function Equipment({ block }: { block: EquipmentBlock }) {
  if (!block.rows?.length) return null;
  const money = (c: number) => new Intl.NumberFormat(block.currency === 'BDT' ? 'en-IN' : 'en-US', { maximumFractionDigits: 0 }).format(Math.round(c / 100));
  return (
    <section>
      <span className="eyebrow">{block.eyebrow ?? 'Hardware & equipment'}</span>
      {block.heading ? <h2>{block.heading}</h2> : null}
      <div className="tw">
        <table>
          <tbody>
            {block.showPricing ? (
              <>
                <tr><th>Item</th><th className="r">Qty</th><th className="r">Unit price</th><th className="r">{`Amount (${block.currency})`}</th><th>Remarks</th></tr>
                {block.rows.map((r, i) => {
                  const spec = [r.brand, r.uom].filter(Boolean).join(' · ');
                  return (
                    <tr key={i}>
                      <td><b>{r.item}</b>{spec ? <span className="small muted"> · {spec}</span> : null}</td>
                      <td className="r num">{r.qty}</td>
                      <td className="r num">{money(r.unitPriceCents)}</td>
                      <td className="r num">{money(r.amountCents)}</td>
                      <td>{r.note ?? ''}</td>
                    </tr>
                  );
                })}
                <tr className="tot"><td colSpan={3}>{block.note ?? 'Total'}</td><td className="r num">{money(block.totalCents)}</td><td /></tr>
              </>
            ) : (
              <>
                {/* Global/local: what is supplied, not what it costs — the money is in the Budget tab. */}
                <tr><th>Item</th><th>Brand / model</th><th className="r">Qty</th><th>Remarks</th></tr>
                {block.rows.map((r, i) => (
                  <tr key={i}>
                    <td><b>{r.item}</b></td>
                    <td>{r.brand ?? ''}</td>
                    <td className="r num">{r.qty}{r.uom ? ` ${r.uom}` : ''}</td>
                    <td>{r.note ?? ''}</td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
      {!block.showPricing && block.note ? <p className="small muted" style={{ marginTop: 6 }}>{block.note}</p> : null}
      {block.warranty ? <p className="small muted" style={{ marginTop: 10 }}>Warranty — {block.warranty}</p> : null}
    </section>
  );
}

export function TechStack({ block }: { block: TechStackBlock }) {
  return (
    <section>
      <span className="eyebrow">Technology choices</span>
      {block.heading ? <h2>{block.heading}</h2> : null}
      <div className="tw">
        <table>
          <tbody>
            <tr><th>Layer</th><th>Choice</th><th>Why</th></tr>
            {block.rows.map((r, i) => (
              <tr key={i}>
                <td>{r.layer}</td>
                <td><b>{r.choice}</b></td>
                <td className="why"><div className="whybox">{r.why}{r.value ? <div className="val">{r.value}</div> : null}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function TeamAllocation({ block }: { block: TeamAllocationBlock }) {
  return (
    <section>
      <span className="eyebrow">Team allocation</span>
      {block.heading ? <h2>{block.heading}</h2> : null}
      <div className="team">
        {block.members.map((m, i) => (
          <div className="tcard" key={i}>
            <div className="av"><Icon name={m.icon} /></div>
            <div className="tinfo">
              <div className="rn">{m.role}</div>
              {m.responsibility ? <div className="rp">{m.responsibility}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Financial({ block }: { block: FinancialBlock }) {
  const onSave = useContext(BlockEditContext);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState(block.rows);
  const [total, setTotal] = useState(block.totalCents);

  // Re-seed local edits whenever the underlying block changes (e.g. after a save/reload or regenerate).
  useEffect(() => { setRows(block.rows); setTotal(block.totalCents); }, [block]);

  const toCents = (v: string) => Math.max(0, Math.round((parseFloat(v.replace(/,/g, '')) || 0) * 100));
  const setRowAmount = (i: number, v: string) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, amountCents: toCents(v) } : r));
    setRows(next);
    setTotal(next.reduce((s, r) => s + (r.amountCents || 0), 0)); // auto-sum; the total can still be overridden
  };
  const cancel = () => { setEditing(false); setRows(block.rows); setTotal(block.totalCents); };
  // Sum the phase-row weeks for the total row (adjustment rows carry "—" → contribute 0).
  const totalWeeks = rows.reduce((s, r) => { const m = /(\d+(?:\.\d+)?)/.exec(r.timeline ?? ''); return s + (m ? parseFloat(m[1]) : 0); }, 0);
  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      const patch: Record<string, unknown> = { rows, totalCents: total };
      // Manual pricing supersedes the "no rate-card match / pending" note.
      if (total > 0 && block.explanation?.rationale?.includes('pending')) {
        patch.explanation = { ...block.explanation, rationale: 'Pricing set by the Riseup team.' };
      }
      await onSave(block.id, patch);
      setEditing(false);
    } finally { setSaving(false); }
  };

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span className="eyebrow">Financial estimation</span>
        {onSave ? (
          editing ? (
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="pdoc-editbtn" onClick={save} disabled={saving} data-testid="financial-save">{saving ? 'Saving…' : 'Save prices'}</button>
              <button type="button" className="pdoc-editbtn ghost" onClick={cancel} data-testid="financial-cancel">Cancel</button>
            </span>
          ) : (
            <button type="button" className="pdoc-editbtn" onClick={() => setEditing(true)} data-testid="financial-edit">Edit prices</button>
          )
        ) : null}
      </div>
      {block.heading ? <h2>{block.heading}</h2> : null}
      <div className="tw">
        <table>
          <tbody>
            <tr><th>Phase</th><th>Focus</th><th>Timeline</th><th className="r">{`Investment (${block.currency})`}</th></tr>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><b>{r.label}</b></td>
                <td>{r.focus}{r.rationale ? <span className="small muted"> · {r.rationale}</span> : null}</td>
                <td>{r.timeline}</td>
                <td className="r num">
                  {editing ? (
                    <input type="number" min="0" step="1" className="pdoc-priceinput" value={Math.round(r.amountCents / 100)} onChange={(e) => setRowAmount(i, e.target.value)} data-testid={`financial-row-${i}`} />
                  ) : money(r.amountCents, block.currency)}
                </td>
              </tr>
            ))}
            <tr className="tot">
              <td colSpan={2}>{block.note ?? 'Total'}</td>
              <td>{totalWeeks > 0 ? `${totalWeeks} wks` : ''}</td>
              <td className="r num">
                {editing ? (
                  <input type="number" min="0" step="1" className="pdoc-priceinput tot" value={Math.round(total / 100)} onChange={(e) => setTotal(toCents(e.target.value))} data-testid="financial-total" />
                ) : money(total, block.currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {editing ? (
        <p className="small muted" style={{ marginTop: 10 }}>Type each phase's investment — the total sums automatically, or override the total directly. Amounts are in {block.currency}.</p>
      ) : null}
    </section>
  );
}

// The standard Riseup payment structures — a dropdown applies one, then rows stay manually editable.
const PAY_PRESETS: Record<string, { percent: number; label: string }[]> = {
  '30 / 30 / 30 / 10': [{ percent: 30, label: 'On signing' }, { percent: 30, label: 'Phase 1 acceptance' }, { percent: 30, label: 'Phase 2 acceptance' }, { percent: 10, label: 'On go-live' }],
  '30 / 70 (advance · delivery)': [{ percent: 30, label: 'Advance' }, { percent: 70, label: 'On delivery' }],
  '30 / 30 / 40': [{ percent: 30, label: 'Advance' }, { percent: 30, label: 'Midpoint' }, { percent: 40, label: 'On delivery' }],
  '50 / 50': [{ percent: 50, label: 'Advance' }, { percent: 50, label: 'On delivery' }],
};

export function PaymentTerms({ block }: { block: PaymentTermsBlock }) {
  const onSave = useContext(BlockEditContext);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [terms, setTerms] = useState(block.terms);
  const [note, setNote] = useState(block.note ?? '');
  useEffect(() => { setTerms(block.terms); setNote(block.note ?? ''); }, [block]);

  const sum = terms.reduce((s, t) => s + (Number(t.percent) || 0), 0);
  const setRow = (i: number, patch: Partial<{ percent: number; label: string }>) => setTerms(terms.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const cancel = () => { setEditing(false); setTerms(block.terms); setNote(block.note ?? ''); };
  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(block.id, { terms: terms.map((t) => ({ percent: Math.round(Number(t.percent) || 0), label: t.label })), note: note.trim() || undefined });
      setEditing(false);
    } finally { setSaving(false); }
  };

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span className="eyebrow">Payment terms</span>
        {onSave ? (
          editing ? (
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="pdoc-editbtn" onClick={save} disabled={saving} data-testid="payterms-save">{saving ? 'Saving…' : 'Save'}</button>
              <button type="button" className="pdoc-editbtn ghost" onClick={cancel} data-testid="payterms-cancel">Cancel</button>
            </span>
          ) : (
            <button type="button" className="pdoc-editbtn" onClick={() => setEditing(true)} data-testid="payterms-edit">Edit</button>
          )
        ) : null}
      </div>
      {block.heading ? <h2>{block.heading}</h2> : null}

      {editing ? (
        <div className="pdoc-editpanel" data-testid="payterms-editor">
          <label className="small muted" style={{ display: 'block', marginBottom: 6 }}>Apply a standard structure</label>
          <select className="pdoc-priceinput" style={{ width: 'auto', textAlign: 'left', marginBottom: 12 }} defaultValue="" onChange={(e) => { const p = PAY_PRESETS[e.target.value]; if (p) setTerms(p.map((t) => ({ ...t }))); e.target.value = ''; }} data-testid="payterms-preset">
            <option value="" disabled>Choose a structure…</option>
            {Object.keys(PAY_PRESETS).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          {terms.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <input type="number" min="0" max="100" className="pdoc-priceinput" style={{ width: 80 }} value={t.percent} onChange={(e) => setRow(i, { percent: Number(e.target.value) })} data-testid={`payterms-pct-${i}`} />
              <span className="small muted">%</span>
              <input className="pdoc-priceinput" style={{ flex: 1, textAlign: 'left' }} value={t.label} onChange={(e) => setRow(i, { label: e.target.value })} data-testid={`payterms-label-${i}`} />
              <button type="button" className="pdoc-editbtn ghost" onClick={() => setTerms(terms.filter((_, idx) => idx !== i))}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
            <button type="button" className="pdoc-editbtn" onClick={() => setTerms([...terms, { percent: 0, label: 'Payment' }])} data-testid="payterms-add">+ instalment</button>
            <span className="small" style={{ color: sum === 100 ? 'var(--ok)' : 'var(--red)' }}>Total: {sum}%{sum !== 100 ? ' (should be 100%)' : ''}</span>
          </div>
          <textarea className="pdoc-priceinput" style={{ width: '100%', textAlign: 'left', height: 56, marginTop: 10 }} placeholder="Note (e.g. change requests billed at the standard man-day rate)…" value={note} onChange={(e) => setNote(e.target.value)} data-testid="payterms-note" />
        </div>
      ) : (
        <>
          <div className="paybar">
            {block.terms.map((t, i) => (
              <div className="p" key={i}><div className="pn num">{t.percent}%</div><div className="pl">{t.label}</div></div>
            ))}
          </div>
          {block.note ? <p className="small muted" style={{ marginTop: 14 }}>{block.note}</p> : null}
        </>
      )}
    </section>
  );
}

export function Handover({ block }: { block: HandoverBlock }) {
  return (
    <section>
      <span className="eyebrow">Release &amp; handover</span>
      {block.heading ? <h2>{block.heading}</h2> : null}
      <div className="cols2">
        {block.columns.map((col, i) => (
          <ul className="clean" key={i}>{col.map((li, j) => <li key={j}>{li}</li>)}</ul>
        ))}
      </div>
    </section>
  );
}

export function Comparables({ block }: { block: ComparablesBlock }) {
  const onSave = useContext(BlockEditContext);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState(block.items);
  useEffect(() => { setItems(block.items); }, [block]);

  const setItem = (i: number, patch: Partial<{ name: string; blurb: string; url: string }>) => setItems(items.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const cancel = () => { setEditing(false); setItems(block.items); };
  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    try { await onSave(block.id, { items: items.map((c) => ({ name: c.name, blurb: c.blurb, url: c.url?.trim() || undefined })) }); setEditing(false); }
    finally { setSaving(false); }
  };

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span className="eyebrow">Comparable work</span>
        {onSave ? (
          editing ? (
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="pdoc-editbtn" onClick={save} disabled={saving} data-testid="comparables-save">{saving ? 'Saving…' : 'Save'}</button>
              <button type="button" className="pdoc-editbtn ghost" onClick={cancel} data-testid="comparables-cancel">Cancel</button>
            </span>
          ) : (
            <button type="button" className="pdoc-editbtn" onClick={() => setEditing(true)} data-testid="comparables-edit">Edit links</button>
          )
        ) : null}
      </div>
      {block.heading ? <h2>{block.heading}</h2> : null}
      {editing ? (
        <div className="pdoc-editpanel" data-testid="comparables-editor">
          {items.map((c, i) => (
            <div key={i} style={{ borderTop: i ? '1px solid var(--line)' : 'none', paddingTop: i ? 10 : 0, marginTop: i ? 10 : 0 }}>
              <input className="pdoc-priceinput" style={{ width: '100%', textAlign: 'left', fontWeight: 700 }} value={c.name} onChange={(e) => setItem(i, { name: e.target.value })} data-testid={`comparables-name-${i}`} />
              <input className="pdoc-priceinput" style={{ width: '100%', textAlign: 'left', marginTop: 6 }} value={c.blurb} onChange={(e) => setItem(i, { blurb: e.target.value })} placeholder="What it was" data-testid={`comparables-blurb-${i}`} />
              <input className="pdoc-priceinput" style={{ width: '100%', textAlign: 'left', marginTop: 6 }} value={c.url ?? ''} onChange={(e) => setItem(i, { url: e.target.value })} placeholder="https://riseuplabs.com/…  (add or paste the project link)" data-testid={`comparables-url-${i}`} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="pdoc-editbtn ghost" onClick={() => setItems(items.filter((_, idx) => idx !== i))}>Remove</button>
              </div>
            </div>
          ))}
          <button type="button" className="pdoc-editbtn" style={{ marginTop: 10 }} onClick={() => setItems([...items, { name: 'Project name', blurb: 'What it was', url: '' }])} data-testid="comparables-add">+ project</button>
        </div>
      ) : (
        <div className="cmp">
          {block.items.map((c, i) => (
            <a href={c.url ?? '#'} target="_blank" rel="noopener noreferrer" key={i}>
              <b>{c.name}</b><p>{c.blurb}</p><span className="go">View project →</span>
            </a>
          ))}
        </div>
      )}
      {block.whyRiseup ? (
        <div className="why">
          <h3>{block.whyRiseup.heading}</h3>
          <p>{block.whyRiseup.body}</p>
          <div className="pts">
            {block.whyRiseup.points.map((p, i) => (
              <div className="pt" key={i}><b>{p.stat}</b><span>{p.label}</span></div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function NextStep({ block }: { block: NextStepBlock }) {
  return (
    <section>
      <span className="eyebrow">Next step</span>
      {block.heading ? <h2>{block.heading}</h2> : null}
      <div className="steps">
        {block.steps.map((s, i) => (
          <div className="step" key={i}><div className="k num">{i + 1}</div><h4>{s.title}</h4>{s.sub ? <p>{s.sub}</p> : null}</div>
        ))}
      </div>
    </section>
  );
}

export function Prose({ block }: { block: ProseBlock }) {
  return (
    <section>
      {block.eyebrow ? <span className="eyebrow">{block.eyebrow}</span> : null}
      {block.heading ? <h2>{block.heading}</h2> : null}
      {block.paragraphs.map((p, i) => <p className="lead" key={i}>{p}</p>)}
    </section>
  );
}

/** Task-3 placeholder for the four diagram block types. */
export function DiagramPlaceholder({ block }: { block: Extract<Block, { type: 'layeredArchitecture' | 'vendorArchitecture' | 'numberedFlow' | 'diagram' }> }) {
  const label = block.type === 'diagram' ? `${block.kind} diagram` : block.type;
  return (
    <section>
      {block.eyebrow ? <span className="eyebrow">{block.eyebrow}</span> : null}
      {block.heading ? <h2>{block.heading}</h2> : null}
      <div style={{ border: '1px dashed var(--line-2)', borderRadius: 12, padding: '40px 20px', textAlign: 'center', color: 'var(--subtle)', background: 'var(--soft)', fontSize: 13 }}>
        ▧ {label} — rendered in Task 3 (diagram components + iconResolver)
      </div>
    </section>
  );
}

/**
 * The client must never learn that an outside party is involved, and must never see how the work is produced.
 * Both leaked in shipped proposals while the only protection was prompt wording. These cases pin the real
 * leaked strings, and — just as important — the legitimate copy that must NOT be flagged.
 */
import {
  collectClientFacingText, lintRedaction, summariseRedaction,
} from '../../src/modules/generation/engine/redaction.util';

const kinds = (t: string, supplier: string[] = []) => lintRedaction([t], supplier).map((f) => f.kind);
const terms = (t: string, supplier: string[] = []) => lintRedaction([t], supplier).map((f) => f.term.toLowerCase());

describe('collectClientFacingText', () => {
  it('flattens nested block content', () => {
    const doc = { blocks: [{ heading: 'Overview', bullets: ['one', 'two'], nested: { lead: 'three' } }] };
    expect(collectClientFacingText(doc).sort()).toEqual(['Overview', 'one', 'three', 'two']);
  });
  it('skips internal-only keys so a reviewer is not spammed', () => {
    const doc = { blocks: [{ id: 'abc-123', type: 'overview', rationale: 'chosen because vendor was cheaper', lead: 'Real copy.' }] };
    expect(collectClientFacingText(doc)).toEqual(['Real copy.']);
  });
  it('ignores empty strings', () => {
    expect(collectClientFacingText({ a: '', b: '   ', c: 'x' })).toEqual(['x']);
  });
});

describe('lintRedaction — confidentiality', () => {
  it('catches the exact phrase that shipped', () => {
    expect(kinds('This is handled with the support of a third-party vendor.')).toContain('confidentiality');
  });
  it('catches the financial note that shipped', () => {
    expect(terms('Total (excl. third-party & certification costs)')).toContain('third-party');
  });
  it('catches the spelling variants', () => {
    for (const s of ['third party', '3rd party', 'subcontractor', 'reseller', 'our supplier', 'outsourced']) {
      expect(kinds(`Work is ${s} handled.`)).toContain('confidentiality');
    }
  });
  it('does not fire on an innocent word that merely contains one', () => {
    expect(lintRedaction(['The calendar vendors list is irrelevant.'])).toEqual([]);   // "vendors" != "vendor"
    expect(lintRedaction(['Suppliers of raw cotton are out of scope.'])).toEqual([]);
  });
});

describe('lintRedaction — internal tooling', () => {
  it('catches disclosure of how the work is produced', () => {
    for (const s of ['AI-generated', 'AI-assisted', 'Claude', 'Copilot', 'an LLM', 'ChatGPT']) {
      expect(kinds(`This section was ${s} produced.`)).toContain('tooling');
    }
  });
  it('LEAVES the client’s own AI product alone', () => {
    // Riseup builds AI products. Flagging a bare "AI" would make the lint unusable.
    expect(lintRedaction(['An AI-powered attendance platform with AI face recognition.'])).toEqual([]);
    expect(lintRedaction(['Unified AI Integrated Enterprise Management Platform'])).toEqual([]);
  });
});

describe('lintRedaction — supplier identity', () => {
  it('catches a supplier name taken from the parsed quotation', () => {
    const f = lintRedaction(['Installation by Access Control Solutions Ltd.'], ['Access Control Solutions Ltd']);
    expect(f.map((x) => x.kind)).toContain('supplier');
  });
  it('catches supplier contact details', () => {
    expect(kinds('Queries to sales@acme-security.com', ['sales@acme-security.com'])).toContain('supplier');
  });
  it('ignores very short supplier tokens that would match everything', () => {
    expect(lintRedaction(['A big win for the team.'], ['a', 'in'])).toEqual([]);
  });
  it('treats a supplier name with regex characters literally', () => {
    expect(() => lintRedaction(['text'], ['A+B (Pvt.) Ltd.'])).not.toThrow();
    expect(kinds('Supplied by A+B (Pvt.) Ltd. today', ['A+B (Pvt.) Ltd.'])).toContain('supplier');
  });
  it('keeps manufacturer makes and models, which are legitimate specifications', () => {
    expect(lintRedaction(['4 x Hikvision DS-K1T341 face terminals.'], ['Acme Security'])).toEqual([]);
  });
});

describe('findings', () => {
  it('reports where the term appeared', () => {
    const [f] = lintRedaction(['Delivery is handled with the support of a third-party vendor for the gate hardware.']);
    expect(f.context).toContain('third-party');
  });
  it('summarises supplier exposure ahead of generic wording', () => {
    const findings = lintRedaction(
      ['Installed by Acme Security. Some work is outsourced. Written by AI.'],
      ['Acme Security'],
    );
    const lines = summariseRedaction(findings);
    expect(lines[0]).toMatch(/Supplier identity/);
    expect(lines.join('\n')).toMatch(/outside party/);
    expect(lines.join('\n')).toMatch(/internal tooling/);
  });
  it('deduplicates a term repeated throughout the document', () => {
    const findings = lintRedaction(['a vendor here', 'another vendor there', 'vendor again']);
    expect(findings.length).toBe(3);
    expect(summariseRedaction(findings)).toHaveLength(1);
  });
  it('says nothing about clean copy', () => {
    expect(lintRedaction(['Riseup Labs supplies, installs and commissions the attendance machines.'])).toEqual([]);
    expect(summariseRedaction([])).toEqual([]);
  });
});

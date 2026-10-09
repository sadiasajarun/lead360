/**
 * Renderer golden tests — the regression gate for "templates and documents must not change".
 *
 * Renders fixed synthetic proposals (every block type, each main template) through the house HTML and
 * Word renderers and compares against saved goldens in test/golden/. Any change to rendered output fails.
 * Intentional design changes: re-record with `UPDATE_GOLDEN=1 npx jest renderer-golden`.
 */
import * as fs from 'fs';
import * as path from 'path';
import JSZip = require('jszip');
import { renderProposalDocumentHtml } from '../../src/common/utils/proposal-render/render-proposal-document';
import { renderProposalDocx } from '../../src/common/utils/proposal-render/render-proposal-docx';
import type { ProposalDocument, TemplateCategory } from '../../src/modules/generation/blocks/block.types';
import { sampleProposal } from '../fixtures/proposal-sample';
import { extendedProposal } from '../fixtures/proposal-extended';

const GOLDEN = path.join(__dirname, '..', 'golden');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

const withTemplate = (doc: ProposalDocument, template: TemplateCategory, currency: string): ProposalDocument =>
  ({ ...doc, meta: { ...doc.meta, template, currency } }) as ProposalDocument;

const CASES: Record<string, ProposalDocument> = {
  'sample-agency': sampleProposal,
  'sample-global': withTemplate(sampleProposal, 'global', 'USD'),
  'sample-local': withTemplate(sampleProposal, 'local', 'BDT'),
  'extended-global': extendedProposal('global', 'USD'),
  'extended-local': extendedProposal('local', 'BDT'),
  'extended-agency': extendedProposal('agency', 'USD'),
};

async function docxText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('string');
  // Paragraph-separated visible text: stable across docx library internals (rsids, zip timestamps).
  return xml
    .split(/<\/w:p>/)
    .map((p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join(''))
    .filter((s) => s.length)
    .join('\n');
}

function check(name: string, actual: string): void {
  const file = path.join(GOLDEN, name);
  if (UPDATE || !fs.existsSync(file)) {
    fs.mkdirSync(GOLDEN, { recursive: true });
    fs.writeFileSync(file, actual);
    return;
  }
  expect(actual).toBe(fs.readFileSync(file, 'utf8'));
}

describe('renderer golden output', () => {
  for (const [name, doc] of Object.entries(CASES)) {
    it(`HTML is unchanged — ${name}`, () => {
      const html = renderProposalDocumentHtml(doc);
      expect(renderProposalDocumentHtml(doc)).toBe(html); // deterministic
      check(`${name}.html`, html);
    });
    it(`Word text is unchanged — ${name}`, async () => {
      check(`${name}.docx.txt`, await docxText(await renderProposalDocx(doc)));
    });
  }
});

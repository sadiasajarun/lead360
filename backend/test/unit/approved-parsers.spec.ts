import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Workbook } from 'exceljs';
import { parseHouseBudget, parseWeeksNote } from '../../src/modules/project-case/house-budget.parser';
import { proposalFactsFromText } from '../../src/modules/project-case/proposal-docx.parser';

async function writeBudget(rows: (string | number | null)[][], note: string): Promise<string> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Development');
  ws.addRow(['Cost Breakdown for Item 1\nDevelopment']);
  ws.addRow(['Sl.', 'Departments', 'Heads', 'Type', 'No. of Unit', 'No. of Days', 'Per Day Cost', 'Unit Cost', 'Total Cost']);
  for (const r of rows) ws.addRow(r);
  ws.addRow(['Total']);
  ws.addRow([note]);
  const f = path.join(os.tmpdir(), `budget-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  await wb.xlsx.writeFile(f);
  return f;
}

describe('house budget parser', () => {
  it('reads roles, carries departments, recomputes totals and weeks (USD)', async () => {
    const f = await writeBudget(
      [
        [1, 'Managing & Planning', 'Product Manager', 'Senior', 1, 10, 47.11],
        [null, null, 'Product Analyst', 'Senior', 1, 5, 42.42],
        [2, 'Development', 'Flutter Developer', 'Senior', 2, 20, 49.32],
      ],
      'Note: Development Timeline = 10 weeks (3 phases).',
    );
    const b = await parseHouseBudget(f);
    fs.unlinkSync(f);
    expect(b).not.toBeNull();
    expect(b!.lines).toHaveLength(3);
    expect(b!.lines[1].department).toBe('Managing & Planning');
    expect(b!.lines[2]).toMatchObject({ role: 'Flutter Developer', seniority: 'senior', units: 2, days: 20 });
    expect(b!.effortDays).toBe(10 + 5 + 40);
    expect(b!.total).toBeCloseTo(10 * 47.11 + 5 * 42.42 + 40 * 49.32, 2);
    expect(b!.weeks).toBe(10);
    expect(b!.currency).toBe('USD');
  });

  it('detects BDT from day rates', async () => {
    const f = await writeBudget([[1, 'Development', 'Technical Lead', 'Senior', 1, 12, 7251.41]], 'Note: Delivery Timeline = 5 weeks.');
    const b = await parseHouseBudget(f);
    fs.unlinkSync(f);
    expect(b!.currency).toBe('BDT');
    expect(b!.weeks).toBe(5);
  });

  it('parses week notes', () => {
    expect(parseWeeksNote('Note: Development Timeline = 22.5 weeks.')).toBe(22.5);
    expect(parseWeeksNote('no timeline here')).toBeUndefined();
  });
});

describe('proposal facts', () => {
  it('finds uppercase sections and de-duplicated phases', () => {
    const f = proposalFactsFromText(
      ['THE SOLUTION', 'Some text', 'OUR WORK APPROACH', 'Phase 1 — Discovery · Weeks 1–2', 'Phase 2 — Build · Weeks 3–7', 'Phase 1 — Discovery', 'Total estimated development duration 7 weeks'].join('\n'),
    );
    expect(f.sections).toEqual(['THE SOLUTION', 'OUR WORK APPROACH']);
    expect(f.phases.map((p) => p.name)).toEqual(['Phase 1 — Discovery', 'Phase 2 — Build']);
    expect(f.phases[1].weeks).toBe(5);
    expect(f.weeks).toBe(7);
  });
});

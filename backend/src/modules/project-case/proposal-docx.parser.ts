import * as mammoth from 'mammoth';

/**
 * Reads a finished proposal (.docx) into plain text plus the structure facts the learning engine uses:
 * the section list (house eyebrows are short UPPERCASE lines) and the delivery phases/milestones. Pure.
 */
export interface ProposalFacts {
  text: string;
  sections: string[];
  phases: { name: string; weeks?: number }[];
  weeks?: number;
}

const PHASE_RE = /^(phase|milestone)\s*[-–—:]?\s*\d+\b.*$/i;

function weeksIn(s: string): number | undefined {
  const range = /weeks?\s*(\d+)\s*[–-]\s*(\d+)/i.exec(s);
  if (range) return Number(range[2]) - Number(range[1]) + 1;
  const m = /(\d+(?:\.\d+)?)\s*(?:working\s+)?weeks?\b/i.exec(s);
  return m ? Number(m[1]) : undefined;
}

export function proposalFactsFromText(raw: string): ProposalFacts {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const sections: string[] = [];
  for (const l of lines) {
    if (l.length >= 4 && l.length <= 60 && l === l.toUpperCase() && /[A-Z]{3}/.test(l) && !/^\d/.test(l)) {
      if (!sections.includes(l)) sections.push(l);
    }
  }
  const phases: { name: string; weeks?: number }[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    if (!PHASE_RE.test(l) || l.length > 140) continue;
    const name = l.replace(/\s*[·|].*$/, '').replace(/\s+\d+(\.\d+)?\s*weeks?.*$/i, '').trim();
    const key = (/^(phase|milestone)\s*[-–—:]?\s*(\d+)/i.exec(l)?.[2] ?? name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    phases.push({ name, weeks: weeksIn(l) });
  }
  const totalLine = lines.find((l) => /^total/i.test(l) && /week/i.test(l)) ?? lines.find((l) => /\b\d+\s*weeks?\s*(to go-live|total|of development|development)/i.test(l));
  return { text: raw, sections, phases, weeks: totalLine ? weeksIn(totalLine) : undefined };
}

export async function parseProposalDocx(path: string): Promise<ProposalFacts> {
  const { value } = await mammoth.extractRawText({ path });
  return proposalFactsFromText(value);
}

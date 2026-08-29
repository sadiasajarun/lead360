/**
 * Slash-command palette for the regeneration composer (Workstream B). Typing "/" shows these; picking one
 * inserts its `cmd` tag into the prompt. `/client-feedback` is special-cased by the composer (stored as client
 * feedback, top priority); every other tag is an explicit target the backend regen router honours.
 */
export interface RegenCommand {
  cmd: string;
  label: string;
  hint: string;
}

export const REGEN_COMMANDS: RegenCommand[] = [
  { cmd: '/client-feedback', label: 'Client feedback', hint: 'Save as the client’s own direction — highest priority' },
  { cmd: '/budget-reestimation', label: 'Budget re-estimation', hint: 'Re-estimate cost or set a budget target' },
  { cmd: '/timeline', label: 'Timeline', hint: 'Change the delivery timeline or structure (phase / module…)' },
  { cmd: '/team', label: 'Team allocation', hint: 'Add or remove roles, change effort' },
  { cmd: '/scope', label: 'Scope', hint: 'Adjust project scope or modules' },
  { cmd: '/overview', label: 'Overview', hint: 'The solution overview / executive summary' },
  { cmd: '/architecture', label: 'Solution architecture', hint: 'The architecture diagram' },
  { cmd: '/process-flow', label: 'Process flow', hint: 'The system / process flow diagram' },
  { cmd: '/features', label: 'Features by module', hint: 'The feature matrix' },
  { cmd: '/work-approach', label: 'Work approach', hint: 'Delivery approach & methodology' },
  { cmd: '/deliverables', label: 'Deliverables', hint: 'The deliverables & acceptance list' },
  { cmd: '/assumptions', label: 'Assumptions', hint: 'Assumptions & dependencies' },
  { cmd: '/tech-stack', label: 'Tech stack', hint: 'The technology choices' },
  { cmd: '/comparables', label: 'Comparable work', hint: 'Past Riseup projects shown' },
  { cmd: '/next-steps', label: 'Next steps', hint: 'The closing call to action' },
];

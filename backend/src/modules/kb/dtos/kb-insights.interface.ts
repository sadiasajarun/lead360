/**
 * Structured knowledge distilled from an uploaded KB document by an LLM pass, stored on
 * `kb_documents.meta.insights` and also synthesized into a high-signal embedded chunk. Every field is
 * optional/array-shaped so a thin doc (a bare requirement, a flattened budget) extracts cleanly.
 */
export interface KbInsights {
  summary?: string;
  technical?: string[]; // approach / architecture / technical aspects
  stack?: string[]; // technologies, platforms, frameworks
  resources?: { role: string; count?: number; allocation?: string }[];
  pricing?: { currency?: string; total?: number; lineItems?: { label: string; amount: number }[]; notes?: string };
  budgeting?: string[]; // assumptions, margins, contingency, payment terms
  timeline?: { totalDuration?: string; milestones?: { name: string; duration?: string }[] };
  diagramTypes?: string[]; // ERD, sequence, architecture, wireframe, gantt…
  decisions?: string[]; // key decisions + rationale
}

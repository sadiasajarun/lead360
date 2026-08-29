// Riseup Proposal & Budget Database catalog entry (Projects > Database tab).
export interface KbDocument {
  id: string;
  title: string;
  category: string;
  section: string;
  fileType: string;
  downloadable: boolean;
  /** Notion-style tags; the tag pool is shared within a category (across its sub-navs). */
  tags: string[];
  /** Original Drive file date (corpus) / approval date (generated) / added-on date (manual). */
  docDate: string;
  /** Who generated/added the doc; pre-existing corpus shows the company default. */
  owner: string;
  /** When the row entered this system (drives the "last synced" header stat). */
  createdAt: string;
  /** True when an LLM-distilled insight record was captured on upload (the "AI-learned" badge). */
  learned?: boolean;
}

/** Structured knowledge the AI distilled from an uploaded document (mirrors backend KbInsights). */
export interface KbInsights {
  summary?: string;
  technical?: string[];
  stack?: string[];
  resources?: { role: string; count?: number; allocation?: string }[];
  pricing?: { currency?: string; total?: number; lineItems?: { label: string; amount: number }[]; notes?: string };
  budgeting?: string[];
  timeline?: { totalDuration?: string; milestones?: { name: string; duration?: string }[] };
  diagramTypes?: string[];
  decisions?: string[];
}

/** Result of a single KB upload (one file). */
export interface KbUploadResult {
  id: string;
  downloadable: boolean;
  parsed: boolean;
  chunksAdded: number;
  embedded: number;
  insights?: KbInsights;
}

/** Per-file state for the bulk-upload modal. */
export interface KbUploadItem {
  file: File;
  name: string;
  status: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
  learned?: string[]; // short chips summarizing what the AI learned
}

// A trashed Database document (Settings > Trash). Auto-purged when daysLeft hits 0.
export interface KbTrashItem {
  id: string;
  title: string;
  category: string;
  section: string;
  fileType: string;
  deletedAt: string;
  daysLeft: number;
}

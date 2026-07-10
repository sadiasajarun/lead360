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

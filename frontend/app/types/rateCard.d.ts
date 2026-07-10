// Admin day-rate card entry (GET /rate-cards), ingested from Riseup's real head-cost sheet and used
// to ground generated budgets. All money is in integer minor units (cents) delivered as STRINGS.
export interface RateCard {
  id: string;
  department: string;
  role: string;
  /** 'senior' | 'mid' | 'junior' */
  seniority: string;
  monthlyUsdCents: string;
  dailyUsdCents: string;
  hourlyUsdCents: string;
  monthlyBdtCents: string;
  dailyBdtCents: string;
  hourlyBdtCents: string;
  /** Deprecated mirror of dailyUsdCents kept for backward compatibility. */
  dayRateCents: string;
  currency: string;
}

// A single row parsed from an uploaded CSV/XLSX during import (POST /rate-cards/import/preview).
// Every value is parsed from the file in code — the AI only maps column HEADERS.
export interface RateImportRow {
  department: string;
  role: string;
  seniority: string;
  monthlyBdtCents: string;
  dailyBdtCents: string;
  hourlyBdtCents: string;
  monthlyUsdCents: string;
  dailyUsdCents: string;
  hourlyUsdCents: string;
  dayRateCents: string;
  currency: string;
}

// Preview payload for a rate-card import — header mapping + parsed rows for the admin to confirm.
export interface RateImportPreview {
  /** header text → canonical field name (or null when it maps to none). */
  mapping: Record<string, string | null>;
  headerRow: number;
  parsed: number;
  skipped: number;
  warnings: string[];
  rows: RateImportRow[];
}

export interface RateImportCommitResult {
  replaced: number;
  imported: number;
}

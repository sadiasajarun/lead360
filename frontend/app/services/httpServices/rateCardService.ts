import { httpService } from '../httpService';
import type {
  RateCard, RateImportPreview, RateImportRow, RateImportCommitResult,
} from '~/types/rateCard';

// The maintained day-rate card (seniority-tiered), ingested from Riseup's real head-cost sheet.
export async function getRateCards(): Promise<RateCard[]> {
  const res = await httpService.get('/rate-cards');
  return res.data.data as RateCard[];
}

// Save edited rate rows (the Rates table "Save rates" button). Send every changed row with its id
// and the cents fields; the server returns the refreshed card.
export async function saveRateCards(rows: Array<{ id: string } & Partial<RateCard>>): Promise<RateCard[]> {
  const res = await httpService.put('/rate-cards', { rows });
  return res.data.data as RateCard[];
}

// Parse an uploaded .xlsx/.csv (≤5 MB) and map its column HEADERS onto our canonical fields. The AI
// maps headers only — every value is parsed from the file in code. Override JSON Content-Type so the
// browser sets the multipart boundary (same pattern as kbService.uploadKbDocument).
export async function previewRateImport(file: File): Promise<RateImportPreview> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await httpService.post('/rate-cards/import/preview', fd, { headers: { 'Content-Type': undefined } });
  return res.data.data as RateImportPreview;
}

// Replace the whole rate card with the previously previewed rows (needs ≥5 rows or the API 400s).
export async function commitRateImport(rows: RateImportRow[]): Promise<RateImportCommitResult> {
  const res = await httpService.post('/rate-cards/import/commit', { rows });
  return res.data.data as RateImportCommitResult;
}

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AiService } from '../../infrastructure/ai/ai.service';
import { Lead } from '../lead/lead.entity';
import { BudgetService } from './budget.service';
import { extractTables } from '../../common/utils/extract-tables.util';
import type { ExtractableFile } from '../../common/utils/extract-text.util';
import type { BudgetEquipmentInput, CommitVendorQuoteDto } from './dtos/budget.dtos';

/**
 * Reads a SUPPLIER QUOTATION (or a typed description of one) into the structured facts a proposal needs:
 * the priced line items, the money totals, the delivery window and the warranty.
 *
 * Two rules make this safe to show a client:
 *  1. The quotation is INTERNAL. Nothing here writes to the requirement/brief, so a supplier's terms can
 *     never be mistaken for the client's requirements — that is what once turned a "05-07 working days"
 *     delivery SLA into the whole project timeline.
 *  2. The supplier is anonymous. Manufacturer models (ZKTeco SpeedFace-V5L) are real specs the client is
 *     buying and are kept; the reseller issuing the quotation is stripped.
 *
 * Nothing is persisted — the caller previews, the rep confirms, and only then is it committed.
 */
export interface VendorQuotePreview {
  rows: BudgetEquipmentInput[];
  /** ISO code the quotation is priced in, when stated. */
  currency?: string;
  /** Delivery + installation window in weeks. ADDED to the software schedule; never replaces it. */
  installWeeks?: number;
  /** Warranty cover, restated for the client as our commitment. */
  warranty?: string;
  /** The quotation's own money lines, for reconciliation against the parsed rows. */
  subtotalCents?: number;
  vatCents?: number;
  totalCents?: number;
  parsed: number;
  skipped: number;
  warnings: string[];
}

interface RawItem {
  item?: unknown; brand?: unknown; uom?: unknown; qty?: unknown; unitPrice?: unknown; note?: unknown;
}
interface RawQuote {
  items?: RawItem[];
  currency?: unknown;
  installWorkingDays?: unknown;
  installWeeks?: unknown;
  warranty?: unknown;
  subtotal?: unknown;
  vat?: unknown;
  total?: unknown;
}

const SYSTEM =
  "You read supplier quotations for Riseup Labs' procurement team. Extract ONLY what the document states. " +
  'NEVER invent an item, a price, a quantity or a date. Omit any field the document does not support. ' +
  'Money is read in MAJOR units exactly as printed (112,800 -> 112800), never converted.';

const num = (v: unknown): number => {
  if (typeof v === 'number' && isFinite(v)) return v;
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  return isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const cents = (major: number): number => Math.round(major * 100);

@Injectable()
export class VendorQuoteService {
  private readonly logger = new Logger(VendorQuoteService.name);

  constructor(
    private readonly ai: AiService,
    private readonly budgets: BudgetService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Apply the reviewed rows. Writes the equipment schedule to the budget and records the two terms the
   * proposal needs — the installation window (ADDED to the schedule as an on-site phase) and the warranty
   * (restated as our own commitment). Ticking `hardwareProject` here keeps the wizard flag honest for a
   * lead where the quotation arrived later.
   */
  async commit(leadId: string, dto: CommitVendorQuoteDto) {
    // Scalars only — a Partial<Lead> would drag the relations into TypeORM's update typing.
    const patch: { hardwareProject: boolean; hardwareInstallWeeks?: number; hardwareWarranty?: string } = {
      hardwareProject: true,
    };
    if (dto.installWeeks !== undefined) patch.hardwareInstallWeeks = dto.installWeeks || undefined;
    if (dto.warranty?.trim()) patch.hardwareWarranty = dto.warranty.trim();
    await this.dataSource.getRepository(Lead).update({ id: leadId }, patch);
    // The extractor deliberately skips subtotal/VAT/total rows when reading ITEMS, so the tax has to be
    // carried separately — otherwise the schedule totals the pre-tax subtotal and we under-recover.
    const rows = [...(dto.rows ?? [])];
    if (dto.vatCents && dto.vatCents > 0) {
      rows.push({ item: 'VAT & tax on equipment and installation', uom: 'lot', qty: 1, unitPriceCents: dto.vatCents });
    }
    return this.budgets.replaceEquipment(leadId, rows);
  }

  async preview(input: { file?: ExtractableFile; text?: string }): Promise<VendorQuotePreview> {
    const body = input.file?.buffer?.length
      ? (await extractTables(input.file)).text
      : (input.text ?? '').trim();
    if (!body) throw new BadRequestException('Nothing to read — attach the quotation or describe the hardware.');
    if (!this.ai.enabled) throw new BadRequestException('AI is not configured, so the quotation cannot be read automatically. Add the items by hand in the Budget tab.');

    const { data } = await this.ai.json<RawQuote>({
      label: 'vendor-quote',
      system: SYSTEM,
      maxTokens: 2500,
      prompt:
        'Read this supplier quotation and return JSON:\n' +
        '{\n' +
        '  "items": [{\n' +
        '     "item": string — what is supplied, as the buyer should read it. Drop marketing spec dumps; keep it one clear line.\n' +
        '     "brand": string — the MANUFACTURER/model of the goods (e.g. "ZKTeco SpeedFace-V5L", "KING").\n' +
        '        Leave EMPTY when the brand column names the company that ISSUED this quotation (the reseller/\n' +
        '        installer named in the letterhead, signature or contact details) — that is not a manufacturer.\n' +
        '        Leave EMPTY for pure labour/service lines.\n' +
        '     "uom": string — unit of measure as quoted (pcs, lot, job, node).\n' +
        '     "qty": number — quantity.\n' +
        '     "unitPrice": number — UNIT rate in MAJOR units, not the line total.\n' +
        '     "note": string — a short remark if the row carries one (warranty, "at actual", "as required").\n' +
        '  }] — every priced row, in document order. EXCLUDE subtotal / VAT / grand-total rows.\n' +
        '  "currency": string — ISO code the prices are in (BDT, USD). Omit if unstated.\n' +
        '  "installWorkingDays": number — the delivery AND installation lead time in WORKING DAYS, taking the\n' +
        '     upper bound of any range ("within 05-07 working days" -> 7). Omit if unstated.\n' +
        '  "warranty": string — the warranty cover in one sentence, including what it excludes. Omit if unstated.\n' +
        '  "subtotal": number — pre-tax subtotal in MAJOR units. Omit if unstated.\n' +
        '  "vat": number — VAT/tax amount in MAJOR units. Omit if unstated.\n' +
        '  "total": number — grand total including tax, in MAJOR units. Omit if unstated.\n' +
        '}\n' +
        'Never name the issuing supplier anywhere in your output — not in item, brand or note.\n\n' +
        `DOCUMENT:\n${body.slice(0, 20000)}`,
    });

    const warnings: string[] = [];
    let skipped = 0;
    const rows: BudgetEquipmentInput[] = [];
    for (const raw of Array.isArray(data?.items) ? data.items : []) {
      const item = str(raw.item);
      const qty = Math.min(100000, Math.max(0, Math.round(num(raw.qty))));
      const unit = num(raw.unitPrice);
      if (!item || unit <= 0) { skipped++; continue; }
      rows.push({
        item,
        brand: str(raw.brand) || undefined,
        uom: str(raw.uom) || undefined,
        qty: qty || 1,
        unitPriceCents: cents(unit),
        note: str(raw.note) || undefined,
      });
    }
    if (!rows.length) warnings.push('No priced items could be read — add them by hand, or check the file is the quotation.');
    if (skipped) warnings.push(`${skipped} row(s) skipped for having no item name or no unit price.`);

    // Working days -> weeks (5-day week), upper bound, at least a week. Regex fallback keeps this working
    // when the model omits the field but the document plainly states it.
    const days = num(data?.installWorkingDays);
    const fallback = /(\d+)\s*[-–—]\s*(\d+)\s*working\s*days/i.exec(body) ?? /within\s*(\d+)\s*working\s*days/i.exec(body);
    const effDays = days > 0 ? days : fallback ? Math.max(...fallback.slice(1).map(Number).filter(isFinite)) : 0;
    const installWeeks = effDays > 0 ? Math.max(1, Math.ceil(effDays / 5)) : num(data?.installWeeks) || undefined;

    const subtotalCents = num(data?.subtotal) > 0 ? cents(num(data.subtotal)) : undefined;
    const vatCents = num(data?.vat) > 0 ? cents(num(data.vat)) : undefined;
    const totalCents = num(data?.total) > 0 ? cents(num(data.total)) : undefined;

    // Reconcile the parsed rows against the quotation's own subtotal — a mismatch means a missed or
    // double-counted row, and the rep should see that before it reaches a client-facing budget.
    const rowSum = rows.reduce((s, r) => s + r.qty * r.unitPriceCents, 0);
    if (subtotalCents && Math.abs(rowSum - subtotalCents) > 100) {
      warnings.push(
        `Line items total ${(rowSum / 100).toLocaleString()} but the quotation's subtotal reads ` +
        `${(subtotalCents / 100).toLocaleString()} — check for a missed row before committing.`,
      );
    }

    this.logger.log(`Vendor quote ▸ ${rows.length} item(s), skipped ${skipped}, installWeeks=${installWeeks ?? '—'}`);
    return {
      rows,
      currency: str(data?.currency).toUpperCase() || undefined,
      installWeeks,
      warranty: str(data?.warranty) || undefined,
      subtotalCents, vatCents, totalCents,
      parsed: rows.length,
      skipped,
      warnings,
    };
  }
}

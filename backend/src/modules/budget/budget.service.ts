import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Budget } from './budget.entity';
import { Milestone } from './milestone.entity';
import { BudgetLine } from './budget-line.entity';
import { BudgetEquipment } from './budget-equipment.entity';
import { Lead } from '../lead/lead.entity';
import { BudgetRepository } from './budget.repository';
import { BudgetEquipmentInput, UpdateBudgetDto } from './dtos/budget.dtos';
import { CalcEquipment, CalcLine, computeBudget } from './budget.calculator';
import { Seniority, BudgetCurrency, CURRENCY_SYMBOL } from '../../common/enums';
import { SettingsService } from '../settings/settings.service';

export interface GeneratedBudgetLine {
  milestoneName?: string; // the phase/milestone this line belongs to (groups the sheet by phase)
  department: string;
  role: string;
  seniority: Seniority;
  units: number;
  days: number; // EFFECTIVE man-days = hoursPerDay × workingDays / 8
  hoursPerDay?: number; // daily commitment (1..8; default 8 = full-time)
  workingDays?: number; // calendar days staffed (timeline proxy; default = days)
  dayRateCents: number;
}

@Injectable()
export class BudgetService {
  constructor(
    private readonly budgets: BudgetRepository,
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
    private readonly events: EventEmitter2,
  ) {}

  private toCalcLines(lines: Pick<BudgetLine, 'department' | 'units' | 'days' | 'dayRateCents' | 'optional'>[]): CalcLine[] {
    return lines.map((l) => ({
      department: l.department,
      units: Number(l.units),
      days: Number(l.days),
      dayRateCents: Number(l.dayRateCents),
      optional: !!l.optional,
    }));
  }

  private toCalcEquipment(items: Pick<BudgetEquipment, 'qty' | 'unitPriceCents'>[] | undefined): CalcEquipment[] {
    return (items ?? []).map((e) => ({ qty: Number(e.qty), unitPriceCents: Number(e.unitPriceCents) }));
  }

  private adjOf(b: Budget) {
    return {
      contingencyPct: Number(b.contingencyPct),
      discountPct: Number(b.discountPct),
      vatPct: Number(b.vatPct),
    };
  }

  /**
   * Read a budget, optionally re-priced into `viewCurrency` for display.
   *
   * The stored line rates are in the budget's OWN currency. Converting for a viewer is a pure
   * display concern: we go through USD (rate ÷ fx[from] × fx[to]) and never write the result back.
   * BDT is exact when it IS the stored currency — the sheet's own column — and otherwise converted
   * like any other, since a stored USD figure has no BDT column to look up.
   */
  async getForLeadInCurrency(leadId: string, viewCurrency?: string) {
    const base = await this.getForLead(leadId);
    const from = (base.budget.currency || 'USD').toUpperCase();
    const to = (viewCurrency || from).toUpperCase();
    if (!viewCurrency || to === from) return { ...base, viewCurrency: from, converted: false };

    const [fxFrom, fxTo] = await Promise.all([this.settings.fxRate(from), this.settings.fxRate(to)]);
    const factor = fxTo / fxFrom;
    const conv = (v: unknown) => Math.round(Number(v ?? 0) * factor);

    const lines = base.budget.lines.map((l) => ({ ...l, dayRateCents: String(conv(l.dayRateCents)) }));
    const equipment = (base.budget.equipment ?? []).map((e) => ({ ...e, unitPriceCents: String(conv(e.unitPriceCents)) }));
    const computed = computeBudget(this.toCalcLines(lines), this.adjOf(base.budget), true, this.toCalcEquipment(equipment));
    return {
      budget: { ...base.budget, lines, equipment, currency: to },
      computed,
      viewCurrency: to,
      converted: true,
      rate: factor,
    };
  }

  async getForLead(leadId: string) {
    let budget = await this.budgets.findByLead(leadId);
    if (!budget) {
      // No budget exists yet for this lead — lazily create an empty one so the editor can
      // start from scratch (add lines, then save). Avoids a 404 on every freshly-created lead.
      const repo = this.dataSource.getRepository(Budget);
      budget = await repo.save(repo.create({ leadId, currency: 'USD' }));
      budget.lines = [];
      budget.milestones = [];
    }
    // Attach each line's milestoneName (resolved from the milestone relation) so the editor can
    // group by milestone without a second lookup. dayRateCents stays a string (bigint) — the client coerces.
    const nameById = new Map((budget.milestones ?? []).map((m) => [m.id, m.name]));
    const lines = (budget.lines ?? []).map((l) => ({
      ...l,
      milestoneName: l.milestoneId ? nameById.get(l.milestoneId) ?? undefined : undefined,
    }));
    const equipment = [...(budget.equipment ?? [])].sort((a, b) => a.orderNo - b.orderNo);
    const computed = computeBudget(this.toCalcLines(lines), this.adjOf(budget), true, this.toCalcEquipment(equipment));
    return { budget: { ...budget, lines, equipment }, computed };
  }

  // Replace all lines + adjustments in one transaction, guarded by an optimistic lock.
  async replace(leadId: string, dto: UpdateBudgetDto) {
    const current = await this.budgets.findByLead(leadId);
    if (!current) throw new NotFoundException(`Budget for lead ${leadId} not found`);
    if (dto.version !== current.version) {
      throw new ConflictException('Budget changed since you loaded it — reload and reapply your edits');
    }

    await this.dataSource.transaction(async (manager) => {
      const budgetRepo = manager.getRepository(Budget);
      const milestoneRepo = manager.getRepository(Milestone);
      const lineRepo = manager.getRepository(BudgetLine);
      const equipRepo = manager.getRepository(BudgetEquipment);

      // wipe existing lines for this budget
      await lineRepo.delete({ budgetId: current.id });

      // ensure milestones exist (by name), keyed for line assignment
      const milestoneByName = new Map<string, string>();
      for (const name of new Set(dto.lines.map((l) => l.milestoneName).filter(Boolean) as string[])) {
        let ms = await milestoneRepo.findOne({ where: { budgetId: current.id, name } });
        if (!ms) ms = await milestoneRepo.save(milestoneRepo.create({ budgetId: current.id, name }));
        milestoneByName.set(name, ms.id);
      }

      // insert new lines
      const newLines = dto.lines.map((l) =>
        lineRepo.create({
          budgetId: current.id,
          milestoneId: l.milestoneName ? milestoneByName.get(l.milestoneName) : undefined,
          department: l.department,
          role: l.role,
          seniority: l.seniority,
          units: l.units,
          days: l.days,
          // Part-time inputs: fall back to full-time (hours=8, workingDays=days) when the client omits them.
          hoursPerDay: l.hoursPerDay ?? 8,
          workingDays: l.workingDays ?? Math.round(Number(l.days) || 0),
          dayRateCents: String(l.dayRateCents),
          optional: !!l.optional,
        }),
      );
      await lineRepo.save(newLines);

      // Equipment: only touched when the caller actually sends the array, so an editor that does not
      // manage purchased items cannot silently wipe them.
      if (dto.equipment) {
        await equipRepo.delete({ budgetId: current.id });
        if (dto.equipment.length) {
          await equipRepo.save(dto.equipment.map((e, i) => equipRepo.create({
            budgetId: current.id,
            item: e.item,
            brand: e.brand,
            uom: e.uom,
            qty: e.qty,
            unitPriceCents: String(e.unitPriceCents),
            note: e.note,
            orderNo: i,
          })));
        }
      }
      const equipNow = await equipRepo.find({ where: { budgetId: current.id } });

      // recompute total in code (never trust a client-sent total)
      const adj = {
        contingencyPct: dto.contingencyPct ?? Number(current.contingencyPct),
        discountPct: dto.discountPct ?? Number(current.discountPct),
        vatPct: dto.vatPct ?? Number(current.vatPct),
      };
      const result = computeBudget(this.toCalcLines(newLines), adj, dto.includeOptional ?? true, this.toCalcEquipment(equipNow));

      // Save ONLY the budget's own columns (VersionColumn bumps -> future stale saves 409).
      // Never include the `lines`/`milestones` relations here: spreading the stale (empty) arrays
      // makes TypeORM orphan the lines we just inserted (sets budget_id=null -> NOT NULL violation).
      await budgetRepo.save(
        budgetRepo.create({
          id: current.id,
          leadId: current.leadId,
          version: current.version,
          createdAt: current.createdAt,
          fxRate: current.fxRate,
          currency: dto.currency ?? current.currency,
          contingencyPct: String(adj.contingencyPct),
          discountPct: String(adj.discountPct),
          vatPct: String(adj.vatPct),
          totalCents: String(result.totalCents),
        }),
      );
      // Keep the lead's headline value in sync with the budget total (drives the Investment/pricing).
      await manager.getRepository(Lead).update({ id: current.leadId }, { valueCents: String(result.totalCents) });
    });

    // The sheet is the Excel: a manual edit ripples into the proposal's money blocks (timeline/team/financial).
    // Fire-and-forget after commit — a sync failure must never fail the save. (P1 generation uses a different
    // path — applyGeneratedPlan — which the proposal already matches, so no event there.)
    this.events.emit('budget.edited', { leadId });
    return this.getForLead(leadId);
  }

  /**
   * Drop purchased items whose name matches any of `names` (loose, case/punctuation-insensitive). The budget
   * is the source of truth for hardware, so a "remove that row" instruction must edit HERE — the proposal's
   * equipment section is only a projection and re-syncs from this.
   */
  async removeEquipmentByName(leadId: string, names: string[]) {
    const { budget } = await this.getForLead(leadId);
    const norm = (v: string) => (v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const wanted = names.map(norm).filter(Boolean);
    const kept = (budget.equipment ?? []).filter((e) => {
      const item = norm(e.item);
      return !wanted.some((w) => item === w || item.includes(w) || w.includes(item));
    });
    const removed = (budget.equipment ?? []).length - kept.length;
    if (!removed) return { removed: 0, budget: await this.getForLead(leadId) };
    await this.replaceEquipment(leadId, kept.map((e) => ({
      item: e.item, brand: e.brand, uom: e.uom, qty: Number(e.qty),
      unitPriceCents: Number(e.unitPriceCents), note: e.note,
    })));
    return { removed, budget: await this.getForLead(leadId) };
  }

  /**
   * Replace the purchased items (hardware/licences/installation) on a budget, leaving the resource lines
   * alone. `replace()` cannot be used for this — it demands a full `lines` array and wipes what it is not
   * given, so an equipment import would have to round-trip the whole sheet to avoid destroying it.
   */
  async replaceEquipment(leadId: string, items: BudgetEquipmentInput[]) {
    const { budget } = await this.getForLead(leadId); // lazily creates the budget if this is a new lead
    await this.dataSource.transaction(async (manager) => {
      const equipRepo = manager.getRepository(BudgetEquipment);
      const budgetRepo = manager.getRepository(Budget);
      await equipRepo.delete({ budgetId: budget.id });
      if (items.length) {
        await equipRepo.save(items.map((e, i) => equipRepo.create({
          budgetId: budget.id,
          item: e.item,
          brand: e.brand,
          uom: e.uom,
          qty: e.qty,
          unitPriceCents: String(e.unitPriceCents),
          note: e.note,
          orderNo: i,
        })));
      }
      const lines = await manager.getRepository(BudgetLine).find({ where: { budgetId: budget.id } });
      const equipNow = await equipRepo.find({ where: { budgetId: budget.id } });
      const result = computeBudget(this.toCalcLines(lines), this.adjOf(budget), true, this.toCalcEquipment(equipNow));
      await budgetRepo.update({ id: budget.id }, { totalCents: String(result.totalCents) });
      await manager.getRepository(Lead).update({ id: leadId }, { valueCents: String(result.totalCents) });
    });
    // Same ripple as a manual sheet edit — the proposal's money blocks follow the sheet.
    this.events.emit('budget.edited', { leadId });
    return this.getForLead(leadId);
  }

  // Replace budget lines with an AI-generated resource plan (rates already resolved from the rate
  // card — never LLM-guessed). System-generated: ensures the budget exists, no optimistic-lock check.
  /** `currency` stamps the budget so exports/UI render the right symbol; rates already arrive in it.
   *  `adjustments` (contingency/discount/VAT %) default to ZERO — a freshly derived sheet carries no stale
   *  adjustment. The exact-budget solver (P4) passes a computed discount/premium here to land on a target. */
  async applyGeneratedPlan(
    leadId: string,
    lines: GeneratedBudgetLine[],
    currency = 'USD',
    adjustments?: { contingencyPct: number; discountPct: number; vatPct: number },
  ) {
    await this.getForLead(leadId); // ensure the budget row exists
    const current = await this.budgets.findByLead(leadId);
    if (!current) throw new NotFoundException(`Budget for lead ${leadId} not found`);

    await this.dataSource.transaction(async (manager) => {
      const budgetRepo = manager.getRepository(Budget);
      const lineRepo = manager.getRepository(BudgetLine);
      const equipRepo = manager.getRepository(BudgetEquipment);
      const milestoneRepo = manager.getRepository(Milestone);
      await lineRepo.delete({ budgetId: current.id });
      await milestoneRepo.delete({ budgetId: current.id });
      // Only scalar columns — never spread the stale `lines` relation (orphans the new rows).
      await budgetRepo.update({ id: current.id }, { currency });
      // Recreate milestones (phases) by name, in first-seen order, so the sheet groups by phase.
      const milestoneByName = new Map<string, string>();
      let order = 0;
      for (const name of lines.map((l) => l.milestoneName?.trim()).filter((n): n is string => !!n)) {
        if (milestoneByName.has(name)) continue;
        const ms = await milestoneRepo.save(milestoneRepo.create({ budgetId: current.id, name, orderNo: order++ }));
        milestoneByName.set(name, ms.id);
      }
      const newLines = lines.map((l) =>
        lineRepo.create({
          budgetId: current.id,
          milestoneId: l.milestoneName ? milestoneByName.get(l.milestoneName.trim()) : undefined,
          department: l.department,
          role: l.role,
          seniority: l.seniority,
          units: l.units,
          days: l.days,
          hoursPerDay: l.hoursPerDay ?? 8,
          workingDays: l.workingDays ?? Math.round(Number(l.days) || 0),
          dayRateCents: String(l.dayRateCents),
          optional: false,
        }),
      );
      if (newLines.length) await lineRepo.save(newLines);
      // Reset adjustments to zero for a freshly derived sheet unless the caller supplies exact ones (P4 solver).
      const adj = {
        contingencyPct: Number(adjustments?.contingencyPct ?? 0),
        discountPct: Number(adjustments?.discountPct ?? 0),
        vatPct: Number(adjustments?.vatPct ?? 0),
      };
      // Equipment is NOT wiped by a regeneration (only lines/milestones are), so it must stay in the
      // recomputed total — otherwise the hardware silently vanishes from the budget on every regen.
      const equipNow = await equipRepo.find({ where: { budgetId: current.id } });
      const result = computeBudget(this.toCalcLines(newLines), adj, true, this.toCalcEquipment(equipNow));
      await budgetRepo.save(
        budgetRepo.create({
          id: current.id,
          leadId: current.leadId,
          version: current.version,
          createdAt: current.createdAt,
          fxRate: current.fxRate,
          currency, // the generation currency (BDT/USD) — NOT current.currency, which is stale (see line above)
          contingencyPct: String(adj.contingencyPct),
          discountPct: String(adj.discountPct),
          vatPct: String(adj.vatPct),
          totalCents: String(result.totalCents),
        }),
      );
      await manager.getRepository(Lead).update({ id: current.leadId }, { valueCents: String(result.totalCents) });
    });
    return this.getForLead(leadId);
  }

  // Branded .xlsx in the FIFA 9-column structure. Values are computed in code (integer cents -> currency units).
  // (Live in-cell formulas are a follow-up polish; totals here are already exact.)
  /**
   * FIFA-structured budget workbook (Generation-Engine spec §4.3) — mirrors exactly what the system
   * generates on screen. One sheet per milestone; department-grouped rows; REAL formulas (not baked
   * values) so the file recomputes in Excel/Sheets:
   *   Unit Cost  H{r} = E{r}*F{r}*G{r}
   *   Total Cost I{first} = SUM(H{first}:H{last})   (top row of each department group)
   *   Grand total          = SUM(I{firstGroup}:I{lastGroup})
   * Budget-wide adjustments (contingency / discount / VAT) follow the grand total, also as formulas.
   */
  /** Download name for the budget export: "<Project name>_budget.xlsx" (falls back to Project_budget). */
  async exportFilename(leadId: string): Promise<string> {
    const lead = await this.dataSource.getRepository(Lead).findOne({ where: { id: leadId } }).catch(() => null);
    const safe = (lead?.title ?? '')
      .replace(/[^\w.\- ]+/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    return `${safe || 'Project'}_budget.xlsx`;
  }

  async exportXlsx(leadId: string): Promise<Buffer> {
    const { budget } = await this.getForLead(leadId);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Lead360 / Riseup Labs';

    const money = (cents: number | string) => Number(cents) / 100;
    const DEFAULT_MS = 'Development';

    // ONE consolidated sheet grouped by department (matches Riseup's global/local budget sheets) — merge any
    // per-phase duplicate department+role+seniority+rate lines into a single row (peak units; days = total
    // person-days ÷ peak units), and ignore milestones entirely.
    const raw = budget.lines ?? [];
    const cons = new Map<string, { l: (typeof raw)[number]; peak: number; personDays: number; workingDays: number }>();
    const ordered: string[] = [];
    for (const l of raw) {
      const units = Math.max(0, Number(l.units) || 0);
      const days = Math.max(0, Number(l.days) || 0);
      const wd = Math.max(0, Number(l.workingDays) || Math.round(days));
      const key = l.optional ? `opt-${ordered.length}` : `${l.department}|${l.role}|${l.seniority}|${l.dayRateCents}`;
      const e = cons.get(key);
      if (!e) { cons.set(key, { l, peak: units, personDays: units * days, workingDays: wd }); ordered.push(key); }
      else { e.peak = Math.max(e.peak, units); e.personDays += units * days; e.workingDays += wd; }
    }
    // Each consolidated row keeps the identity  effectiveDays = hoursPerDay × workingDays / 8  so the in-Excel
    // formula recomputes cleanly. days = effective person-days ÷ peak units; hours/day is back-solved from it.
    const lines = ordered.map((k) => {
      const e = cons.get(k)!;
      if (e.l.optional) return e.l;
      const units = Math.max(1, e.peak);
      const days = Math.max(0, e.personDays / units);
      const workingDays = Math.max(1, Math.round(e.workingDays || days));
      const hoursPerDay = Math.round(((days * 8) / workingDays) * 100) / 100;
      return { ...e.l, units, days, hoursPerDay, workingDays };
    });
    const byMs = new Map<string, typeof lines>([[DEFAULT_MS, lines]]);

    // Hours/Day and Working Days are DELIBERATELY not exported: they are internal planning inputs. They
    // still drive the maths (effective days = hoursPerDay × workingDays ÷ 8) — the sheet just shows the
    // resulting day count, rounded to a whole number so the client never sees a fractional day.
    const HEADER = ['Sl.', 'Departments', 'Heads', 'Type', 'No. of Unit', 'No. of Days', 'Per Day Cost', 'Unit Cost', 'Total Cost'];
    const wholeDays = (d: number) => Math.max(d > 0 ? 1 : 0, Math.round(d));
    const thin = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    // Number format follows the budget's OWN currency — a BDT budget must render "৳", not "$". Unknown
    // currencies fall back to a trailing code (e.g. `1,234 SGD`) rather than mislabelling with a dollar sign.
    const curSym = CURRENCY_SYMBOL[budget.currency as BudgetCurrency];
    const CURRENCY = curSym ? `"${curSym}"#,##0` : `#,##0" ${budget.currency || 'USD'}"`;

    const msTotalCells: string[] = []; // for the multi-milestone summary sheet

    let itemNo = 0;
    for (const [milestone, msLines] of byMs) {
      itemNo++;
      const ws = wb.addWorksheet(milestone.slice(0, 31) || DEFAULT_MS);
      ws.columns = [{ width: 6 }, { width: 22 }, { width: 26 }, { width: 11 }, { width: 11 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 15 }];

      // banner row (merged) — "Cost Breakdown for Item X \n Milestone"
      ws.mergeCells(1, 1, 1, 9);
      const banner = ws.getCell(1, 1);
      banner.value = `Cost Breakdown for Item ${itemNo}\n${milestone}`;
      banner.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      banner.font = { name: 'Arial', size: 11, bold: true };
      ws.getRow(1).height = 32;

      const headerRow = ws.addRow(HEADER);
      headerRow.font = { name: 'Arial', size: 10, bold: true };
      headerRow.eachCell((c) => { c.border = border; c.alignment = { horizontal: 'center', wrapText: true }; });

      // department groups
      const deptOrder: string[] = [];
      const byDept = new Map<string, typeof msLines>();
      for (const l of msLines) {
        const d = l.department || 'Development';
        if (!byDept.has(d)) { byDept.set(d, []); deptOrder.push(d); }
        byDept.get(d)!.push(l);
      }

      const groupTopRows: number[] = [];
      let sl = 0;
      for (const dept of deptOrder) {
        const group = byDept.get(dept)!;
        sl++;
        const firstRow = ws.rowCount + 1;
        group.forEach((l, idx) => {
          const hpd = Number((l as { hoursPerDay?: number }).hoursPerDay ?? 8);
          const wd = Number((l as { workingDays?: number }).workingDays ?? Math.round(Number(l.days) || 0));
          // Effective days computed from the internal hours/day × working-days, then rounded to a whole
          // day for the client-facing sheet (8.75 → 9). The formulas below recompute from THIS number, so
          // the exported sheet always adds up to what it shows.
          const days = wholeDays((hpd * wd) / 8);
          const r = ws.addRow([
            idx === 0 ? sl : '',
            idx === 0 ? dept : '',
            l.role,
            // Equipment/licence lines are not staffed roles — a seniority ("mid") in the Type column would
            // read as nonsense next to "Power Adapter", so it is left blank for those rows.
            /hardware|equipment|licen[cs]e|installation/i.test(l.department || '') ? '' : l.seniority,
            Number(l.units),
            days,
            money(l.dayRateCents),
            null, // H — unit cost = E*F*G (formula below)
            null, // I — group total on the first row only
          ]);
          const rn = r.number;
          r.getCell(8).value = { formula: `E${rn}*F${rn}*G${rn}` };
          r.font = { name: 'Arial', size: 10 };
          r.eachCell({ includeEmpty: true }, (c) => { c.border = border; });
          r.getCell(6).numFmt = '0';
          r.getCell(7).numFmt = CURRENCY;
          r.getCell(8).numFmt = CURRENCY;
        });
        const lastRow = ws.rowCount;
        const gt = ws.getCell(firstRow, 9);
        gt.value = { formula: `SUM(H${firstRow}:H${lastRow})` };
        gt.numFmt = CURRENCY;
        gt.font = { name: 'Arial', size: 10, bold: true };
        groupTopRows.push(firstRow);
      }

      // grand total for this milestone = sum of the department group totals (col K)
      const firstG = groupTopRows[0] ?? 3;
      const lastG = ws.rowCount;
      const totalRow = ws.addRow(['Total', '', '', '', '', '', '', '', null]);
      totalRow.font = { name: 'Arial', size: 10, bold: true };
      totalRow.eachCell({ includeEmpty: true }, (c) => { c.border = border; });
      const totalCell = ws.getCell(totalRow.number, 9);
      totalCell.value = groupTopRows.length ? { formula: `SUM(I${firstG}:I${lastG})` } : 0;
      totalCell.numFmt = CURRENCY;
      msTotalCells.push(`'${ws.name}'!I${totalRow.number}`);

      // ---- Equipment schedule: its own block, with its own columns -------------------------------
      // Purchased items are quantity x unit price, so the resource columns (Type / No. of Days) are
      // meaningless here and are left out entirely rather than filled with placeholder values.
      const equipment = [...(budget.equipment ?? [])].sort((a, b) => a.orderNo - b.orderNo);
      let equipTotalCell = '';
      if (equipment.length) {
        ws.addRow([]);
        const eb = ws.addRow(['Hardware, Equipment & Installation']);
        ws.mergeCells(eb.number, 1, eb.number, 9);
        eb.getCell(1).font = { name: 'Arial', size: 11, bold: true };
        eb.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        eb.getCell(1).border = border;

        const eh = ws.addRow(['Sl.', 'Item', '', 'Brand / Model', 'UoM', 'Qty', 'Unit Price', 'Total Price', 'Remarks']);
        ws.mergeCells(eh.number, 2, eh.number, 3);
        eh.font = { name: 'Arial', size: 10, bold: true };
        eh.eachCell({ includeEmpty: true }, (c) => { c.border = border; c.alignment = { horizontal: 'center', wrapText: true }; });

        const eFirst = ws.rowCount + 1;
        equipment.forEach((e, i) => {
          const r = ws.addRow([i + 1, e.item, '', e.brand ?? '', e.uom ?? '', Number(e.qty), money(e.unitPriceCents), null, e.note ?? '']);
          ws.mergeCells(r.number, 2, r.number, 3);
          r.getCell(8).value = { formula: `F${r.number}*G${r.number}` };
          r.font = { name: 'Arial', size: 10 };
          r.eachCell({ includeEmpty: true }, (c) => { c.border = border; });
          r.getCell(7).numFmt = CURRENCY;
          r.getCell(8).numFmt = CURRENCY;
        });
        const eLast = ws.rowCount;
        const et = ws.addRow(['', 'Hardware, Equipment & Installation — total', '', '', '', '', '', null, '']);
        ws.mergeCells(et.number, 2, et.number, 3);
        et.font = { name: 'Arial', size: 10, bold: true };
        et.eachCell({ includeEmpty: true }, (c) => { c.border = border; });
        et.getCell(8).value = { formula: `SUM(H${eFirst}:H${eLast})` };
        et.getCell(8).numFmt = CURRENCY;
        equipTotalCell = `H${et.number}`;
      }

      // Grand total across resources + equipment.
      if (equipTotalCell) {
        ws.addRow([]);
        const gt2 = ws.addRow(['', 'Project total (resources + hardware)', '', '', '', '', '', '', null]);
        ws.mergeCells(gt2.number, 2, gt2.number, 3);
        gt2.font = { name: 'Arial', size: 11, bold: true };
        gt2.eachCell({ includeEmpty: true }, (c) => { c.border = border; });
        gt2.getCell(9).value = { formula: `I${totalRow.number}+${equipTotalCell}` };
        gt2.getCell(9).numFmt = CURRENCY;
      }

      // Note row — timeline derived from the longest role's WORKING days in this milestone (5-day weeks).
      const maxDays = msLines.reduce((m, l) => Math.max(m, Number((l as { workingDays?: number }).workingDays ?? l.days) || 0), 0);
      const weeks = Math.max(1, Math.ceil(maxDays / 5));
      ws.addRow([]);
      const note = ws.addRow([`Note: ${milestone} Timeline = ${weeks} week${weeks > 1 ? 's' : ''}.`]);
      note.font = { name: 'Arial', size: 10, italic: true };

      // Single-milestone budgets carry the adjustments here (mirrors the on-screen budget).
      if (byMs.size === 1) {
        this.appendAdjustments(ws, totalRow.number, budget, CURRENCY, border);
      }
    }

    // Multi-milestone: a Summary sheet with each milestone total + the adjustments.
    if (byMs.size > 1) {
      const ws = wb.addWorksheet('Summary');
      ws.columns = [{ width: 30 }, { width: 18 }];
      const h = ws.addRow(['Milestone', 'Total Cost']);
      h.font = { name: 'Arial', size: 10, bold: true };
      [...byMs.keys()].forEach((name, i) => {
        const r = ws.addRow([name, null]);
        r.getCell(2).value = { formula: msTotalCells[i] };
        r.getCell(2).numFmt = CURRENCY;
      });
      const sub = ws.addRow(['Subtotal', null]);
      sub.getCell(2).value = { formula: `SUM(B2:B${sub.number - 1})` };
      sub.getCell(2).numFmt = CURRENCY;
      sub.font = { name: 'Arial', size: 10, bold: true };
      this.appendAdjustments(ws, sub.number, budget, CURRENCY, border, 2);
    }

    // ExcelJS returns its own Buffer-like type; wrap in a Node Buffer for the HTTP response.
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Contingency / Discount / VAT / Total as live formulas anchored to the subtotal row. */
  private appendAdjustments(
    ws: ExcelJS.Worksheet,
    subtotalRow: number,
    budget: Budget,
    numFmt: string,
    border: Partial<ExcelJS.Borders>,
    col = 9,
  ) {
    const L = String.fromCharCode(64 + col - 1); // label column (one left of the value column)
    const C = String.fromCharCode(64 + col);
    const cont = Number(budget.contingencyPct) || 0;
    const disc = Number(budget.discountPct) || 0;
    const vat = Number(budget.vatPct) || 0;
    if (!cont && !disc && !vat) return;

    ws.addRow([]);
    const add = (label: string, formula: string, bold = false) => {
      const r = ws.addRow([]);
      r.getCell(col - 1).value = label;
      r.getCell(col).value = { formula };
      r.getCell(col).numFmt = numFmt;
      r.font = { name: 'Arial', size: 10, bold };
      r.getCell(col - 1).border = border;
      r.getCell(col).border = border;
      return r.number;
    };
    const sub = `${C}${subtotalRow}`;
    const cRow = add(`Contingency (${cont}%)`, `${sub}*${cont / 100}`);
    const dRow = add(`Discount (${disc}%)`, `-${sub}*${disc / 100}`);
    const vRow = add(`VAT / Tax (${vat}%)`, `(${sub}+${C}${cRow}+${C}${dRow})*${vat / 100}`);
    add(`Total (${budget.currency})`, `${sub}+${C}${cRow}+${C}${dRow}+${C}${vRow}`, true);
    void L;
  }
}

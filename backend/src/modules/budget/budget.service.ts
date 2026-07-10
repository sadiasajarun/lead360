import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Budget } from './budget.entity';
import { Milestone } from './milestone.entity';
import { BudgetLine } from './budget-line.entity';
import { Lead } from '../lead/lead.entity';
import { BudgetRepository } from './budget.repository';
import { UpdateBudgetDto } from './dtos/budget.dtos';
import { CalcLine, computeBudget } from './budget.calculator';
import { Seniority } from '../../common/enums';
import { SettingsService } from '../settings/settings.service';

export interface GeneratedBudgetLine {
  department: string;
  role: string;
  seniority: Seniority;
  units: number;
  days: number;
  dayRateCents: number;
}

@Injectable()
export class BudgetService {
  constructor(
    private readonly budgets: BudgetRepository,
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
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
    const computed = computeBudget(this.toCalcLines(lines), this.adjOf(base.budget), true);
    return {
      budget: { ...base.budget, lines, currency: to },
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
    const computed = computeBudget(this.toCalcLines(lines), this.adjOf(budget), true);
    return { budget: { ...budget, lines }, computed };
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
          dayRateCents: String(l.dayRateCents),
          optional: !!l.optional,
        }),
      );
      await lineRepo.save(newLines);

      // recompute total in code (never trust a client-sent total)
      const adj = {
        contingencyPct: dto.contingencyPct ?? Number(current.contingencyPct),
        discountPct: dto.discountPct ?? Number(current.discountPct),
        vatPct: dto.vatPct ?? Number(current.vatPct),
      };
      const result = computeBudget(this.toCalcLines(newLines), adj, dto.includeOptional ?? true);

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

    return this.getForLead(leadId);
  }

  // Replace budget lines with an AI-generated resource plan (rates already resolved from the rate
  // card — never LLM-guessed). System-generated: ensures the budget exists, no optimistic-lock check.
  /** `currency` stamps the budget so exports/UI render the right symbol; rates already arrive in it. */
  async applyGeneratedPlan(leadId: string, lines: GeneratedBudgetLine[], currency = 'USD') {
    await this.getForLead(leadId); // ensure the budget row exists
    const current = await this.budgets.findByLead(leadId);
    if (!current) throw new NotFoundException(`Budget for lead ${leadId} not found`);

    await this.dataSource.transaction(async (manager) => {
      const budgetRepo = manager.getRepository(Budget);
      const lineRepo = manager.getRepository(BudgetLine);
      await lineRepo.delete({ budgetId: current.id });
      // Only scalar columns — never spread the stale `lines` relation (orphans the new rows).
      await budgetRepo.update({ id: current.id }, { currency });
      const newLines = lines.map((l) =>
        lineRepo.create({
          budgetId: current.id,
          department: l.department,
          role: l.role,
          seniority: l.seniority,
          units: l.units,
          days: l.days,
          dayRateCents: String(l.dayRateCents),
          optional: false,
        }),
      );
      if (newLines.length) await lineRepo.save(newLines);
      const adj = {
        contingencyPct: Number(current.contingencyPct),
        discountPct: Number(current.discountPct),
        vatPct: Number(current.vatPct),
      };
      const result = computeBudget(this.toCalcLines(newLines), adj, true);
      await budgetRepo.save(
        budgetRepo.create({
          id: current.id,
          leadId: current.leadId,
          version: current.version,
          createdAt: current.createdAt,
          fxRate: current.fxRate,
          currency: current.currency,
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
  async exportXlsx(leadId: string): Promise<Buffer> {
    const { budget } = await this.getForLead(leadId);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Lead360 / Riseup Labs';

    const money = (cents: number | string) => Number(cents) / 100;
    const lines = budget.lines ?? [];
    const msName = new Map((budget.milestones ?? []).map((m) => [m.id, m.name]));
    const DEFAULT_MS = 'Development';

    // group lines by milestone (preserving encounter order), then by department within each
    const byMs = new Map<string, typeof lines>();
    for (const l of lines) {
      const name = (l.milestoneId && msName.get(l.milestoneId)) || DEFAULT_MS;
      if (!byMs.has(name)) byMs.set(name, []);
      byMs.get(name)!.push(l);
    }
    if (byMs.size === 0) byMs.set(DEFAULT_MS, []);

    const HEADER = ['Sl.', 'Departments', 'Heads', 'Type', 'No. of Unit', 'No. of Days', 'Per Day Cost', 'Unit Cost', 'Total Cost'];
    const thin = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const CURRENCY = '$#,##0';

    const msTotalCells: string[] = []; // for the multi-milestone summary sheet

    let itemNo = 0;
    for (const [milestone, msLines] of byMs) {
      itemNo++;
      const ws = wb.addWorksheet(milestone.slice(0, 31) || DEFAULT_MS);
      ws.columns = [{ width: 6 }, { width: 24 }, { width: 26 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 15 }];

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
          const r = ws.addRow([
            idx === 0 ? sl : '',
            idx === 0 ? dept : '',
            l.role,
            l.seniority,
            Number(l.units),
            Number(l.days),
            money(l.dayRateCents),
            null, // H — formula below
            null, // I — group total on the first row only
          ]);
          const rn = r.number;
          r.getCell(8).value = { formula: `E${rn}*F${rn}*G${rn}` };
          r.font = { name: 'Arial', size: 10 };
          r.eachCell({ includeEmpty: true }, (c) => { c.border = border; });
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

      // grand total for this milestone = sum of the department group totals (col I)
      const firstG = groupTopRows[0] ?? 3;
      const lastG = ws.rowCount;
      const totalRow = ws.addRow(['Total', '', '', '', '', '', '', '', null]);
      totalRow.font = { name: 'Arial', size: 10, bold: true };
      totalRow.eachCell({ includeEmpty: true }, (c) => { c.border = border; });
      const totalCell = ws.getCell(totalRow.number, 9);
      totalCell.value = groupTopRows.length ? { formula: `SUM(I${firstG}:I${lastG})` } : 0;
      totalCell.numFmt = CURRENCY;
      msTotalCells.push(`'${ws.name}'!I${totalRow.number}`);

      // Note row — timeline derived from the longest role duration in this milestone (5-day weeks).
      const maxDays = msLines.reduce((m, l) => Math.max(m, Number(l.days) || 0), 0);
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

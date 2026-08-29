import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { BaseService } from '../../core/base/base.service';
import { Requirement } from './requirement.entity';
import { Lead } from '../lead/lead.entity';
import { RequirementRepository } from './requirement.repository';
import { UpsertRequirementDto } from './dtos/requirement.dtos';
import { StorageService } from '../../infrastructure/s3/storage.service';
import { AiService } from '../../infrastructure/ai/ai.service';
// Shared extractor — handles PDF, DOCX, XLSX, PPTX, TXT/MD (same one the corpus ingestion uses).
import { extractText as extractFileText } from '../../common/utils/extract-text.util';
import { buildQuestionnaireDocx, parseQuestionnaireText, refOf } from '../../common/utils/questionnaire-docx';

// The shape multer gives us for an uploaded file (subset we use).
export type UploadedBrief = { originalname: string; buffer: Buffer; mimetype: string; size: number };

// How a clarifying question is answered — mirrors the way Claude Code asks: pick one, pick many,
// type a specific answer, or hand over a document.
export type QueryKind = 'single' | 'multi' | 'text' | 'upload';

// A clarifying question the sales rep should confirm with the client before finalizing. Typed so the
// UI can render the right control (radio / checkbox / textarea / file drop).
export interface ClientQuery {
  id: string;
  question: string;
  why: string;
  kind: QueryKind;
  options?: string[]; // concrete choices for single/multi
  status: 'open' | 'confirmed';
  answer?: string; // text answer, the chosen option (single), or the uploaded filename (upload)
  answers?: string[]; // chosen options (multi)
  attachmentKey?: string; // storage key (upload)
  note?: string; // extra context the client typed beside the options (from an imported questionnaire)
}

@Injectable()
export class RequirementService extends BaseService<Requirement> {
  constructor(
    private readonly reqs: RequirementRepository,
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    private readonly storage: StorageService,
    private readonly ai: AiService,
  ) {
    super(reqs, 'Requirement');
  }

  getForLead(leadId: string) {
    return this.reqs.findByLead(leadId);
  }

  // The full brief for readiness/query generation — typed priority requirements FIRST, then the document
  // extraction (supporting detail). Ordering signals priority.
  private combinedBrief(req: Requirement | null | undefined): string {
    return [req?.additionalRequirements?.trim(), req?.sourceText?.trim()].filter(Boolean).join('\n\n');
  }

  // Create-or-update the brief for a lead. NON-DESTRUCTIVE: only fields the caller actually sends are
  // written, so an uploaded document's `sourceText` and the rep's typed `additionalRequirements` can never
  // overwrite each other (fixes the "only one part is read" data-loss).
  async upsert(leadId: string, dto: UpsertRequirementDto) {
    const existing = await this.reqs.findByLead(leadId);
    const data: Partial<Requirement> = {
      leadId,
      sourceText: dto.sourceText ?? existing?.sourceText,
      additionalRequirements: dto.additionalRequirements ?? existing?.additionalRequirements,
      files: dto.files ?? existing?.files ?? [],
    };
    // Keep the persisted readinessScore in step with the brief (any direct reader gets a live number).
    const queries = (existing?.queries as ClientQuery[] | undefined) ?? [];
    data.readinessScore = this.scoreFor({ ...existing, ...data } as Requirement, queries);
    const saved = existing
      ? await this.reqs.update(existing.id, data)
      : await this.reqs.create(data);
    return saved;
  }

  // Store an uploaded brief document (PDF/DOCX/XLSX/PPTX/TXT), extract its text, and merge both the
  // file reference and the extracted text into the lead's requirement so generation can use it.
  async addAttachment(leadId: string, file: UploadedBrief) {
    if (!file || !file.buffer?.length) throw new BadRequestException('No file uploaded');

    const safeName = file.originalname.replace(/[^\w.\-]+/g, '_');
    const key = `leads/${leadId}/brief/${Date.now()}-${safeName}`;
    await this.storage.upload(key, file.buffer, file.mimetype);

    const extracted = await extractFileText(file);

    const existing = await this.reqs.findByLead(leadId);
    const files = [...(existing?.files ?? []), { name: file.originalname, key, mime: file.mimetype }];
    const sourceText = [
      existing?.sourceText ?? '',
      extracted ? `\n\n--- ${file.originalname} ---\n${extracted}` : '',
    ]
      .join('')
      .trim();

    const data: Partial<Requirement> = { leadId, files, sourceText };
    // Recompute readiness so the persisted score reflects the just-added attachment/text.
    const queries = (existing?.queries as ClientQuery[] | undefined) ?? [];
    data.readinessScore = this.scoreFor({ ...existing, ...data } as Requirement, queries);
    const saved = existing ? await this.reqs.update(existing.id, data) : await this.reqs.create(data);
    return {
      file: { name: file.originalname, mime: file.mimetype, key },
      extractedChars: extracted.length,
      parsed: extracted.length > 0,
      requirement: saved,
    };
  }

  // Readiness = a score plus AI-generated, typed clarifying questions the rep confirms with the client
  // before finalizing. Questions are generated once from the brief (adaptive to the lead's project
  // context), then persisted so their answered state survives. The real score is written to the column.
  async readiness(leadId: string) {
    const req = await this.reqs.findByLead(leadId);
    const combined = this.combinedBrief(req);
    if (!combined && !req?.files?.length) {
      throw new BadRequestException('Add the requirement first — upload the brief/RFP or paste the requirement text.');
    }
    let queries = (req!.queries as ClientQuery[] | undefined) ?? [];

    // Lazily generate the rubric the first time, if we have a brief and AI is configured.
    if (!queries.length && this.ai.enabled && combined.length > 20) {
      const lead = await this.leads.findOne({ where: { id: leadId } }).catch(() => null);
      queries = await this.generateQueries(combined, lead);
    }
    const score = this.scoreFor(req, queries);
    await this.reqs.update(req!.id, { queries, readinessScore: score });
    return { score, queries };
  }

  // Force a fresh rubric — used when the brief materially changes. Overwrites existing questions,
  // preserving any confirmed answers whose question text is unchanged.
  async regenerateQueries(leadId: string) {
    const req = await this.reqs.findByLead(leadId);
    const combined = this.combinedBrief(req);
    if (!req || !combined) throw new BadRequestException('Add the brief text first.');
    if (!this.ai.enabled) return this.readiness(leadId);
    const lead = await this.leads.findOne({ where: { id: leadId } }).catch(() => null);
    const prior = (req.queries as ClientQuery[] | undefined) ?? [];
    const fresh = await this.generateQueries(combined, lead);
    // Carry forward answers for questions that survived verbatim.
    const merged = fresh.map((q) => {
      const match = prior.find((p) => p.question.trim().toLowerCase() === q.question.trim().toLowerCase());
      // Only carry an answer forward when the regenerated question is the same TYPE (a single→multi
      // drift would strand the old answer against options that may no longer exist).
      return match && match.kind === q.kind
        ? { ...q, status: match.status, answer: match.answer, answers: match.answers, attachmentKey: match.attachmentKey }
        : q;
    });
    const score = this.scoreFor(req, merged);
    await this.reqs.update(req.id, { queries: merged, readinessScore: score });
    return { score, queries: merged };
  }

  // Ask the model to derive a project-specific coverage rubric and emit TYPED questions — only for
  // genuine gaps it cannot resolve from the brief. Prefers concrete single/multi choices (like Claude
  // Code) so the rep clicks rather than writes; uses text for open specifics and upload when a document
  // is needed. Decisions/facts still come from data downstream; this only closes unknowns.
  private async generateQueries(brief: string, lead: Lead | null): Promise<ClientQuery[]> {
    const ctx = lead
      ? `Project context — template: ${lead.template}, framing: ${lead.projectType}, audience: ${lead.audience}.` +
        (lead.projectContext ? ` Notes: ${lead.projectContext.slice(0, 500)}` : '')
      : '';
    try {
      const { data } = await this.ai.json<{
        queries?: { question?: string; why?: string; kind?: string; options?: string[] }[];
      }>({
        maxTokens: 2000,
        prompt:
          'You are a Riseup Labs solution consultant reviewing a client brief for a software project. ' +
          'First, judge coverage across: scope/features, users & roles, integrations, platforms/hosting, ' +
          'data & security, timeline, and budget signals. THEN list ONLY the 3-6 highest-impact unknowns ' +
          'that you genuinely cannot infer from the brief and that would change scope, budget, integration ' +
          'surface, or timeline. Do not ask what the brief already answers.\n' +
          'For each unknown return {question, why, kind, options}:\n' +
          '- "why": what the answer changes (one short clause).\n' +
          '- "kind": one of "single" (pick exactly one), "multi" (pick several), "text" (a short specific ' +
          'answer), "upload" (a document is needed, e.g. existing schema, brand assets, API docs).\n' +
          '- "options": for single/multi ONLY, 3-5 concrete choices phrased for THIS project. Omit for text/upload.\n' +
          'Prefer single/multi with concrete options over open text wherever possible. Be specific — no generic filler.\n' +
          'Return JSON: {"queries":[{"question":"...","why":"...","kind":"single","options":["...","..."]}]}\n\n' +
          (ctx ? ctx + '\n\n' : '') +
          `Brief:\n${brief.slice(0, 6000)}`,
      });
      return (data.queries ?? [])
        .filter((q) => q.question?.trim())
        .slice(0, 6)
        .map((q) => {
          const kind = (['single', 'multi', 'text', 'upload'] as const).includes(q.kind as QueryKind)
            ? (q.kind as QueryKind)
            : 'text';
          const options =
            (kind === 'single' || kind === 'multi') && Array.isArray(q.options)
              ? q.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 6)
              : undefined;
          // A single/multi with no usable options degrades to a text question.
          const finalKind = (kind === 'single' || kind === 'multi') && (!options || options.length < 2) ? 'text' : kind;
          return {
            id: randomUUID(),
            question: q.question!.trim(),
            why: (q.why ?? '').trim(),
            kind: finalKind,
            options: finalKind === 'single' || finalKind === 'multi' ? options : undefined,
            status: 'open' as const,
          };
        });
    } catch {
      return [];
    }
  }

  // Confirm a query (with a text/single answer and/or multi-select answers) or reopen it. Recomputes
  // and persists readiness.
  async resolveQuery(
    leadId: string,
    queryId: string,
    patch: { status?: 'open' | 'confirmed'; answer?: string; answers?: string[] },
  ) {
    const req = await this.reqs.findByLead(leadId);
    if (!req) throw new NotFoundException('No requirement for this lead');
    const hasAnswer = (patch.answer?.trim()?.length ?? 0) > 0 || (patch.answers?.length ?? 0) > 0;
    const queries = ((req.queries as ClientQuery[] | undefined) ?? []).map((q) =>
      q.id === queryId
        ? {
            ...q,
            status: patch.status ?? (hasAnswer ? ('confirmed' as const) : q.status),
            answer: patch.answer ?? q.answer,
            answers: patch.answers ?? q.answers,
          }
        : q,
    );
    const score = this.scoreFor(req, queries);
    await this.reqs.update(req.id, { queries, readinessScore: score });
    return { score, queries };
  }

  // Answer an "upload" query with a file: store it, extract its text into the brief, mark the query
  // confirmed with the filename + storage key, and recompute readiness.
  async answerQueryWithFile(leadId: string, queryId: string, file: UploadedBrief) {
    if (!file || !file.buffer?.length) throw new BadRequestException('No file uploaded');
    const req = await this.reqs.findByLead(leadId);
    if (!req) throw new NotFoundException('No requirement for this lead');
    const target = ((req.queries as ClientQuery[] | undefined) ?? []).find((q) => q.id === queryId);
    if (!target) throw new NotFoundException('Query not found');

    const safeName = file.originalname.replace(/[^\w.\-]+/g, '_');
    const key = `leads/${leadId}/clarifications/${queryId}/${Date.now()}-${safeName}`;
    await this.storage.upload(key, file.buffer, file.mimetype);
    const extracted = await extractFileText(file);

    const files = [...(req.files ?? []), { name: file.originalname, key, mime: file.mimetype }];
    const sourceText = [
      req.sourceText ?? '',
      extracted ? `\n\n--- ${target.question} → ${file.originalname} ---\n${extracted}` : '',
    ]
      .join('')
      .trim();
    const queries = ((req.queries as ClientQuery[] | undefined) ?? []).map((q) =>
      q.id === queryId ? { ...q, status: 'confirmed' as const, answer: file.originalname, attachmentKey: key } : q,
    );
    const score = this.scoreFor({ ...req, sourceText, files } as Requirement, queries);
    await this.reqs.update(req.id, { files, sourceText, queries, readinessScore: score });
    return { score, queries, parsed: extracted.length > 0 };
  }

  // Build a fillable Word questionnaire from the current readiness questions (deterministic — no AI). The
  // client fills the `[ ]` tick-boxes / write-in lines offline and returns it to importQuestionnaire.
  async questionnaireDocx(leadId: string): Promise<{ buffer: Buffer; filename: string }> {
    const req = await this.reqs.findByLead(leadId);
    if (!req) throw new NotFoundException('No requirement for this lead');
    const queries = (req.queries as ClientQuery[] | undefined) ?? [];
    if (!queries.length) throw new BadRequestException('No readiness questions yet — open the readiness step to generate them first.');
    const lead = await this.leads.findOne({ where: { id: leadId } }).catch(() => null);
    const buffer = await buildQuestionnaireDocx(queries, { projectTitle: lead?.title ?? undefined, company: lead?.company ?? undefined });
    const safe = (lead?.title || 'Requirement').replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '_') || 'Requirement';
    return { buffer, filename: `${safe}-Clarifications.docx` };
  }

  // Import a filled questionnaire .docx: extract its text, parse ticked options + write-in answers, map each
  // block back to its query (by [ref:] marker, else verbatim question text), and set the answers as CONFIRMED
  // so they immediately feed the brief. Lenient — unrecognised/blank answers are skipped, not failed.
  async importQuestionnaire(leadId: string, file: UploadedBrief) {
    if (!file || !file.buffer?.length) throw new BadRequestException('No file uploaded');
    const req = await this.reqs.findByLead(leadId);
    if (!req) throw new NotFoundException('No requirement for this lead');
    const queries = (req.queries as ClientQuery[] | undefined) ?? [];
    if (!queries.length) throw new BadRequestException('No readiness questions to import into — generate them first.');
    const text = await extractFileText(file);
    if (!text) throw new BadRequestException('Could not read the uploaded document — make sure it is the filled .docx.');
    const parsed = parseQuestionnaireText(text);
    const norm = (s: string) => (s || '').trim().toLowerCase();
    let applied = 0;
    const updated = queries.map((q) => {
      const block =
        parsed.find((pb) => pb.ref && refOf(q.id).toLowerCase() === pb.ref) ??
        parsed.find((pb) => pb.question && norm(pb.question) === norm(q.question));
      if (!block) return q;
      const note = (block.note ?? '').trim() || undefined;
      if (q.kind === 'single' || q.kind === 'multi') {
        const opts = q.options ?? [];
        const picked = block.checked
          .map((c) => opts.find((o) => norm(o) === norm(c)) ?? c.trim())
          .filter((v, i, a) => v && a.indexOf(v) === i);
        // A client who ticks nothing but writes an explanation HAS answered — keep their prose as the
        // answer rather than discarding the reply.
        if (!picked.length) {
          if (!note) return q;
          applied++;
          return { ...q, status: 'confirmed' as const, answer: note, answers: undefined, note };
        }
        applied++;
        return q.kind === 'multi'
          ? { ...q, status: 'confirmed' as const, answers: picked, answer: undefined, note }
          : { ...q, status: 'confirmed' as const, answer: picked[0], answers: undefined, note };
      }
      if (q.kind === 'text') {
        const t = (block.text ?? '').trim() || note;
        if (!t) return q;
        applied++;
        return { ...q, status: 'confirmed' as const, answer: t };
      }
      return q; // 'upload' kind — a file can't be answered from inside the doc
    });
    const score = this.scoreFor(req, updated);
    await this.reqs.update(req.id, { queries: updated, readinessScore: score });
    return { score, queries: updated, applied };
  }

  // Score blends how much brief exists with how many clarifying questions have been answered.
  private scoreFor(req: Requirement | null | undefined, queries: ClientQuery[]): number {
    const len = (req?.sourceText?.length ?? 0) + (req?.additionalRequirements?.length ?? 0);
    const hasFiles = (req?.files?.length ?? 0) > 0;
    const base = Math.min(70, (hasFiles ? 25 : 0) + Math.min(55, Math.floor(len / 25)));
    if (!queries.length) return Math.min(100, base);
    const confirmed = queries.filter((q) => q.status === 'confirmed').length;
    return Math.min(100, Math.round(base + (confirmed / queries.length) * 30));
  }
}

// Render the confirmed clarifications as a brief-ready block. Shared with generation so the effective
// brief always includes what the rep pinned down. Returns '' when nothing is confirmed.
export function formatConfirmedQueries(queries: ClientQuery[] | undefined): string {
  const confirmed = (queries ?? []).filter(
    (q) => q.status === 'confirmed' && (q.answer || (q.answers?.length ?? 0) > 0),
  );
  if (!confirmed.length) return '';
  const lines = confirmed.map((q) => {
    const ans = q.answers?.length ? q.answers.join(', ') : q.answer ?? '';
    // The note is the client's own elaboration — it carries constraints the option label cannot.
    const note = q.note && q.note.trim() && q.note.trim() !== ans.trim() ? ` — client's note: ${q.note.trim()}` : '';
    return `- ${q.question} → ${ans}${note}`;
  });
  return `Confirmed clarifications:\n${lines.join('\n')}`;
}

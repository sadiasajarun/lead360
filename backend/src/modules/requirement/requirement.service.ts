import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as mammoth from 'mammoth';
import { BaseService } from '../../core/base/base.service';
import { Requirement } from './requirement.entity';
import { RequirementRepository } from './requirement.repository';
import { UpsertRequirementDto } from './dtos/requirement.dtos';
import { StorageService } from '../../infrastructure/s3/storage.service';
import { AiService } from '../../infrastructure/ai/ai.service';

// pdf-parse is a CommonJS default export; import-equals is runtime-safe without esModuleInterop.
import pdfParse = require('pdf-parse');

// The shape multer gives us for an uploaded file (subset we use).
export type UploadedBrief = { originalname: string; buffer: Buffer; mimetype: string; size: number };

// A clarifying question the sales rep should confirm with the client before finalizing.
export interface ClientQuery {
  id: string;
  question: string;
  why: string;
  status: 'open' | 'confirmed';
  answer?: string;
}

@Injectable()
export class RequirementService extends BaseService<Requirement> {
  constructor(
    private readonly reqs: RequirementRepository,
    private readonly storage: StorageService,
    private readonly ai: AiService,
  ) {
    super(reqs, 'Requirement');
  }

  getForLead(leadId: string) {
    return this.reqs.findByLead(leadId);
  }

  // Create-or-update the brief for a lead.
  async upsert(leadId: string, dto: UpsertRequirementDto) {
    const existing = await this.reqs.findByLead(leadId);
    const data: Partial<Requirement> = {
      leadId,
      sourceText: dto.sourceText,
      files: dto.files ?? existing?.files ?? [],
    };
    const saved = existing
      ? await this.reqs.update(existing.id, data)
      : await this.reqs.create(data);
    return saved;
  }

  // Store an uploaded brief document (PDF/DOCX/TXT), extract its text, and merge both the file
  // reference and the extracted text into the lead's requirement so generation can use it.
  async addAttachment(leadId: string, file: UploadedBrief) {
    if (!file || !file.buffer?.length) throw new BadRequestException('No file uploaded');

    const safeName = file.originalname.replace(/[^\w.\-]+/g, '_');
    const key = `leads/${leadId}/brief/${Date.now()}-${safeName}`;
    await this.storage.upload(key, file.buffer, file.mimetype);

    const extracted = await this.extractText(file);

    const existing = await this.reqs.findByLead(leadId);
    const files = [...(existing?.files ?? []), { name: file.originalname, key, mime: file.mimetype }];
    const sourceText = [
      existing?.sourceText ?? '',
      extracted ? `\n\n--- ${file.originalname} ---\n${extracted}` : '',
    ]
      .join('')
      .trim();

    const data: Partial<Requirement> = { leadId, files, sourceText };
    const saved = existing ? await this.reqs.update(existing.id, data) : await this.reqs.create(data);
    return {
      file: { name: file.originalname, mime: file.mimetype, key },
      extractedChars: extracted.length,
      parsed: extracted.length > 0,
      requirement: saved,
    };
  }

  // Best-effort text extraction. Unparseable types (e.g. legacy .doc) are stored but return ''.
  private async extractText(file: UploadedBrief): Promise<string> {
    const name = file.originalname.toLowerCase();
    try {
      if (file.mimetype === 'application/pdf' || name.endsWith('.pdf')) {
        return ((await pdfParse(file.buffer)).text || '').trim();
      }
      if (name.endsWith('.docx') || file.mimetype.includes('wordprocessingml')) {
        return ((await mammoth.extractRawText({ buffer: file.buffer })).value || '').trim();
      }
      if (file.mimetype.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) {
        return file.buffer.toString('utf8').trim();
      }
    } catch {
      return ''; // extraction failed — the stored file is still kept
    }
    return '';
  }

  // Readiness = a score plus AI-generated clarifying questions the rep should confirm with the client
  // before finalizing the proposal/budget. Queries are generated once from the brief, then persisted so
  // their confirmed/answered state survives. Confirming queries raises the readiness score.
  async readiness(leadId: string) {
    const existing = await this.reqs.findByLead(leadId);
    if (!existing?.sourceText?.trim() && !existing?.files?.length) {
      throw new BadRequestException('Add the requirement first — upload the brief/RFP or paste the requirement text.');
    }
    const req = await this.reqs.findByLead(leadId);
    let queries = (req?.queries as ClientQuery[] | undefined) ?? [];

    // Lazily generate queries the first time, if we have a brief and AI is configured.
    if (!queries.length && this.ai.enabled && (req?.sourceText?.trim()?.length ?? 0) > 20) {
      queries = await this.generateQueries(req!.sourceText as string);
      if (req) await this.reqs.update(req.id, { queries });
    }
    return { score: this.scoreFor(req, queries), queries };
  }

  // Ask the model for the highest-impact unknowns that would change scope, budget, integration or timeline.
  private async generateQueries(brief: string): Promise<ClientQuery[]> {
    try {
      const { data } = await this.ai.json<{ queries?: { question?: string; why?: string }[] }>({
        maxTokens: 1500,
        prompt:
          'You are a Riseup Labs solution consultant reviewing a client brief for a software project. ' +
          'List the 3-5 highest-impact clarifying questions the sales team MUST confirm with the client ' +
          'BEFORE finalizing the proposal and budget. For each, give {question, why} where "why" states ' +
          'what the answer changes (scope, budget, integration surface, timeline, security/hosting). ' +
          'Be specific to this brief — no generic filler.\n' +
          'Return JSON: {"queries":[{"question":"...","why":"..."}]}\n\n' +
          `Brief:\n${brief.slice(0, 6000)}`,
      });
      return (data.queries ?? [])
        .filter((q) => q.question?.trim())
        .slice(0, 6)
        .map((q) => ({ id: randomUUID(), question: q.question!.trim(), why: (q.why ?? '').trim(), status: 'open' as const }));
    } catch {
      return [];
    }
  }

  // Confirm a query (optionally with the client's answer) or reopen it. Recomputes readiness.
  async resolveQuery(leadId: string, queryId: string, patch: { status?: 'open' | 'confirmed'; answer?: string }) {
    const req = await this.reqs.findByLead(leadId);
    if (!req) throw new NotFoundException('No requirement for this lead');
    const queries = ((req.queries as ClientQuery[] | undefined) ?? []).map((q) =>
      q.id === queryId
        ? { ...q, status: patch.status ?? (patch.answer ? 'confirmed' : q.status), answer: patch.answer ?? q.answer }
        : q,
    );
    await this.reqs.update(req.id, { queries });
    return { score: this.scoreFor(req, queries), queries };
  }

  // Score blends how much brief exists with how many open questions are still unconfirmed.
  private scoreFor(req: Requirement | null | undefined, queries: ClientQuery[]): number {
    const len = req?.sourceText?.length ?? 0;
    const hasFiles = (req?.files?.length ?? 0) > 0;
    const base = Math.min(70, (hasFiles ? 25 : 0) + Math.min(55, Math.floor(len / 25)));
    if (!queries.length) return Math.min(100, base);
    const confirmed = queries.filter((q) => q.status === 'confirmed').length;
    return Math.min(100, Math.round(base + (confirmed / queries.length) * 30));
  }
}

import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { KbRepository } from './kb.repository';
import { KbDocument } from './kb-document.entity';
import { StorageService } from '../../infrastructure/s3/storage.service';
import { AiService, EMBED_DIM } from '../../infrastructure/ai/ai.service';
import { extractText, ExtractableFile } from '../../common/utils/extract-text.util';
import { IngestDto } from './dtos/kb.dtos';

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  html: 'text/html',
  txt: 'text/plain',
};

export interface GeneratedDocInput {
  title: string;
  category: string;
  section: string;
  fileType: string;
  storageKey: string;
  leadId: string;
  /** Who generated/added the doc (shown in the Database's Owner column). */
  owner?: string;
}

// The three Database sub-navs. Budget only exists for Global/Local (Agency & Design Portfolio
// proposals carry the budget inline as Financial Proposal — no separate budget files).
export const KB_SECTIONS = ['Client requirement', 'Proposal', 'Budget'] as const;
export type KbSection = (typeof KB_SECTIONS)[number];

export function normalizeSection(input?: string): KbSection {
  const f = (input || '').toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (f.startsWith('client requirement') || f === 'requirement') return 'Client requirement';
  if (f.startsWith('budget')) return 'Budget';
  return 'Proposal';
}

const TRASH_RETENTION_DAYS = 30;

@Injectable()
export class KbService implements OnModuleInit {
  private readonly logger = new Logger(KbService.name);

  constructor(
    private readonly kb: KbRepository,
    private readonly storage: StorageService,
    private readonly ai: AiService,
  ) {}

  // Ensure the pgvector extension + embedding column/index exist (idempotent). Non-fatal if the
  // DB user can't create the extension — retrieval falls back to keyword search.
  async onModuleInit() {
    try {
      await this.kb.ensureVectorColumn(EMBED_DIM);
      this.logger.log(`pgvector ready (embedding vector(${EMBED_DIM}) on kb_chunks).`);
    } catch (e) {
      this.logger.warn(`pgvector setup skipped: ${String(e)}`);
    }
    // 30-day trash retention: purge on boot, then daily. (setInterval avoids a scheduler dependency;
    // in a multi-instance prod deploy move this to a proper cron/queue job.)
    void this.purgeExpiredTrash();
    const timer = setInterval(() => void this.purgeExpiredTrash(), 24 * 60 * 60 * 1000);
    timer.unref(); // never keep the process alive just for the purge timer
  }

  private hash(s: string) {
    return createHash('sha256').update(s).digest('hex');
  }

  // Section-aware-ish splitter: break on blank lines, then cap chunk size.
  private chunkText(text: string, maxLen = 1200): string[] {
    const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const out: string[] = [];
    let buf = '';
    for (const p of paras) {
      if ((buf + '\n\n' + p).length > maxLen && buf) {
        out.push(buf);
        buf = p;
      } else {
        buf = buf ? `${buf}\n\n${p}` : p;
      }
    }
    if (buf) out.push(buf);
    return out;
  }

  // GUARD: only Riseup-owned documents are ingested. The caller MUST NOT pass template-author
  // (Potential Inc) sample data — see PRESENTATION_GUIDE.md §0 (denylist).
  async ingest(input: IngestDto) {
    const doc = await this.kb.saveDoc({
      title: input.title,
      sourcePath: input.sourcePath,
      category: input.category,
      template: input.template,
      meta: {},
    });

    const { chunksAdded, embedded } = await this.indexText(doc.id, input.text);
    return { documentId: doc.id, chunksAdded, chunksTotal: this.chunkText(input.text).length, embedded };
  }

  // Upload a real document file: store it (downloadable) + extract/chunk/embed its text for RAG.
  // `displayName` (from the Add modal) becomes the catalog title; the file's extension is preserved.
  async uploadDocument(file: ExtractableFile, category: string, section: string, displayName?: string, ownerName?: string) {
    if (!file || !(file as { buffer?: Buffer }).buffer?.length) throw new BadRequestException('No file uploaded');
    const ext = this.extOf(file.originalname);
    const name = displayName?.trim()
      ? displayName.trim().toLowerCase().endsWith(`.${ext}`)
        ? displayName.trim()
        : `${displayName.trim()}.${ext}`
      : file.originalname;
    const safe = name.replace(/[^\w.\-]+/g, '_');
    const key = `kb/${category}/${Date.now()}-${safe}`;
    await this.storage.upload(key, file.buffer, file.mimetype);

    const text = await extractText(file);
    const doc = await this.kb.saveDoc({
      title: name,
      category,
      template: category,
      sourcePath: key,
      meta: {
        section: normalizeSection(section),
        fileType: ext,
        storageKey: key,
        source: 'Uploaded',
        docDate: new Date().toISOString(), // manual addition -> added-on date
        owner: ownerName || 'Riseup Labs',
      },
    });
    const { chunksAdded, embedded } = await this.indexText(doc.id, text);
    return { id: doc.id, downloadable: true, parsed: text.length > 0, chunksAdded, embedded };
  }

  // Update catalog metadata: display title and/or Notion-style tags (the stored file is untouched).
  // Tags: trimmed, deduped case-insensitively, ≤24 chars each, ≤10 per doc.
  async updateDocument(id: string, patch: { title?: string; tags?: string[] }) {
    const doc = await this.kb.findDocById(id);
    if (!doc) throw new NotFoundException('Document not found');
    if (patch.title !== undefined) {
      const clean = patch.title.trim();
      if (!clean) throw new BadRequestException('Name cannot be empty');
      doc.title = clean;
    }
    if (patch.tags !== undefined) {
      const seen = new Set<string>();
      const tags = patch.tags
        .map((t) => t.trim().slice(0, 24))
        .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
        .slice(0, 10);
      doc.meta = { ...doc.meta, tags };
    }
    await this.kb.saveDoc(doc);
    return { id: doc.id, title: doc.title, tags: (doc.meta?.tags as string[]) ?? [] };
  }

  // --- Trash lifecycle -------------------------------------------------------------------------
  // Delete = soft-delete to Trash + forget the knowledge NOW (chunks/embeddings removed so RAG
  // never grounds on deleted material). The stored file stays for TRASH_RETENTION_DAYS so the
  // doc can be restored (restore re-extracts + re-embeds from the stored file).

  async deleteDocument(id: string) {
    const doc = await this.kb.findDocById(id);
    if (!doc) throw new NotFoundException('Document not found');
    await this.kb.deleteChunksForDoc(id);
    await this.kb.softDeleteDoc(id);
    return { id, trashed: true, retentionDays: TRASH_RETENTION_DAYS };
  }

  async listTrash() {
    const docs = await this.kb.listTrash();
    const now = Date.now();
    return docs.map((d) => {
      const deletedAt = d.deletedAt as Date;
      const daysLeft = Math.max(
        0,
        TRASH_RETENTION_DAYS - Math.floor((now - new Date(deletedAt).getTime()) / 86_400_000),
      );
      return {
        id: d.id,
        title: d.title,
        category: d.category ?? 'Uncategorized',
        section: (d.meta?.section as string) ?? 'Document',
        fileType: (d.meta?.fileType as string) ?? this.extOf(d.title),
        deletedAt,
        daysLeft,
      };
    });
  }

  async restoreDocument(id: string) {
    const doc = await this.kb.findDocByIdWithDeleted(id);
    if (!doc || !doc.deletedAt) throw new NotFoundException('Not in trash');
    await this.kb.restoreDoc(id);

    // Re-learn: rebuild chunks + embeddings from the stored file (knowledge was dropped at delete).
    let chunksAdded = 0;
    const key = doc.meta?.storageKey as string | undefined;
    if (key) {
      try {
        const buffer = await this.storage.getObject(key);
        const fileType = (doc.meta?.fileType as string) ?? this.extOf(doc.title);
        const text = await extractText({
          originalname: doc.title,
          buffer,
          mimetype: MIME[fileType] ?? 'application/octet-stream',
        });
        chunksAdded = (await this.indexText(doc.id, text)).chunksAdded;
      } catch (e) {
        this.logger.warn(`Restore re-index failed for ${doc.title}: ${String(e)}`);
      }
    }
    return { id, restored: true, chunksAdded };
  }

  // Permanent delete: stored file + row (chunks cascade). Irreversible.
  async purgeDocument(id: string) {
    const doc = await this.kb.findDocByIdWithDeleted(id);
    if (!doc) throw new NotFoundException('Document not found');
    const key = doc.meta?.storageKey as string | undefined;
    if (key) await this.storage.delete(key).catch((e) => this.logger.warn(`File delete failed: ${e}`));
    await this.kb.hardDeleteDoc(id);
    return { id, purged: true };
  }

  async purgeMany(ids: string[]) {
    const results = await Promise.allSettled(ids.map((id) => this.purgeDocument(id)));
    return { purged: results.filter((r) => r.status === 'fulfilled').length, of: ids.length };
  }

  async purgeAllTrash() {
    const trash = await this.kb.listTrash();
    return this.purgeMany(trash.map((d) => d.id));
  }

  // Daily retention job: anything trashed > TRASH_RETENTION_DAYS ago is permanently removed.
  async purgeExpiredTrash() {
    try {
      const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86_400_000);
      const expired = await this.kb.listExpiredTrash(cutoff);
      if (!expired.length) return;
      const { purged } = await this.purgeMany(expired.map((d) => d.id));
      this.logger.log(`Trash retention: permanently removed ${purged} document(s) older than ${TRASH_RETENTION_DAYS} days.`);
    } catch (e) {
      this.logger.warn(`Trash auto-purge failed: ${String(e)}`);
    }
  }

  // Bulk-ingest a real Riseup Drive file: store it (downloadable) + extract/chunk/embed for RAG,
  // UPSERTING onto the existing catalog row of the same title so the seeded entry gains a real file
  // instead of creating a duplicate. Used by the ingest-riseup script.
  async ingestStoredFile(file: ExtractableFile, category: string, section: string) {
    if (!file?.buffer?.length) throw new BadRequestException('Empty file');
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
    const key = `kb/${category}/${section}/${safe}`.replace(/\s+/g, '_');
    await this.storage.upload(key, file.buffer, file.mimetype);

    const text = await extractText(file);
    const meta = { section, fileType: this.extOf(file.originalname), storageKey: key, source: 'Riseup Drive' };

    const existing = await this.kb.findDocByTitle(file.originalname);
    const doc = existing
      ? await this.kb.saveDoc(Object.assign(existing, { category, template: category, sourcePath: key, meta }))
      : await this.kb.saveDoc({ title: file.originalname, category, template: category, sourcePath: key, meta });

    const { chunksAdded, embedded } = await this.indexText(doc.id, text);
    return { id: doc.id, title: doc.title, parsedChars: text.length, chunksAdded, embedded };
  }

  // Chunk (dedupe by content hash), store, and embed text for a document. Shared by ingest + upload.
  private async indexText(docId: string, text: string): Promise<{ chunksAdded: number; embedded: number }> {
    if (!text.trim()) return { chunksAdded: 0, embedded: 0 };
    const parts = this.chunkText(text);
    const toInsert = [];
    for (let i = 0; i < parts.length; i++) {
      const contentHash = this.hash(parts[i]);
      if (await this.kb.findChunkByHash(contentHash)) continue; // content cache — skip unchanged
      toInsert.push({ kbDocumentId: docId, text: parts[i], contentHash, meta: { index: i } });
    }
    const saved = toInsert.length ? await this.kb.saveChunks(toInsert) : [];

    let embedded = 0;
    if (this.ai.enabled && saved.length) {
      try {
        const vectors = await this.ai.embed(saved.map((c) => c.text));
        await Promise.all(vectors.map((v, i) => this.kb.setEmbedding(saved[i].id, v)));
        embedded = vectors.length;
      } catch (e) {
        this.logger.warn(`Embedding failed (chunks stored, retrievable by keyword): ${String(e)}`);
      }
    }
    return { chunksAdded: saved.length, embedded };
  }

  search(q: string, limit = 5) {
    return this.kb.textSearch(q, limit);
  }

  // RAG retrieval for generation: semantic (pgvector) when embeddings are available, else keyword.
  // Returns plain chunk texts to inject as grounding context.
  // When `category` is given, half the budget is reserved for that category's real PROPOSAL
  // documents (structure/voice exemplars) and the rest stays general (facts from anywhere).
  async retrieveContext(query: string, limit = 6, category?: string): Promise<string[]> {
    if (this.ai.enabled) {
      try {
        const [vec] = await this.ai.embed([query]);
        const half = Math.ceil(limit / 2);
        const [templ, general] = await Promise.all([
          category ? this.kb.semanticSearch(vec, half, category) : Promise.resolve([]),
          this.kb.semanticSearch(vec, limit),
        ]);
        const seen = new Set<string>();
        const rows = [...templ, ...general].filter((r) => !seen.has(r.text) && !!seen.add(r.text)).slice(0, limit);
        if (rows.length) return rows.map((r) => r.text);
      } catch (e) {
        this.logger.warn(`Semantic retrieval failed, falling back to keyword: ${String(e)}`);
      }
    }
    const kw = await this.kb.textSearch(query.split(/\s+/).slice(0, 6).join(' '), limit);
    return kw.map((c) => c.text);
  }

  // Catalog view for the Projects > Database tab: the Riseup Proposal & Budget Database library.
  // Section + file type live in meta (set by the seed / ingest). `downloadable` = a real file
  // is stored (generated deliverables); seeded catalog entries have no file (reference only).
  async listDocuments() {
    const docs = await this.kb.listDocs();
    return docs.map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category ?? 'Uncategorized',
      section: (d.meta?.section as string) ?? 'Document',
      fileType: (d.meta?.fileType as string) ?? this.extOf(d.title),
      downloadable: !!d.meta?.storageKey,
      tags: (d.meta?.tags as string[]) ?? [],
      owner: (d.meta?.owner as string) ?? 'Riseup Labs', // pre-existing corpus -> company default
      // Document date: original Drive file date (backfilled) / approval date (generated) /
      // added-on date (manual upload); falls back to the row's creation time.
      docDate: (d.meta?.docDate as string) ?? d.createdAt,
      createdAt: d.createdAt, // when the row entered THIS system (used for "last synced")
    }));
  }

  // Upsert a generated deliverable (proposal PDF / budget xlsx / client requirement) into the
  // Database, keyed by title so re-approving a lead replaces its previous file rather than
  // duplicating — then (re)index its text into RAG so every approved deal improves future
  // generations (the learning loop the product promises).
  async addGeneratedDoc(input: GeneratedDocInput) {
    const existing = await this.kb.findDocByTitle(input.title);
    const meta = {
      section: normalizeSection(input.section),
      fileType: input.fileType,
      storageKey: input.storageKey,
      leadId: input.leadId,
      source: 'Generated deliverable',
      owner: input.owner ?? 'Riseup Labs',
      docDate: new Date().toISOString(), // filed on approval -> approval date
      // keep any tags the user already put on a previous version of this deliverable
      ...(existing?.meta?.tags ? { tags: existing.meta.tags } : {}),
    };
    let doc: KbDocument;
    if (existing) {
      existing.category = input.category;
      existing.sourcePath = input.storageKey;
      existing.meta = meta;
      doc = await this.kb.saveDoc(existing);
      await this.kb.deleteChunksForDoc(doc.id); // content changed — drop stale chunks before re-index
    } else {
      doc = await this.kb.saveDoc({
        title: input.title,
        category: input.category,
        template: input.category,
        sourcePath: input.storageKey,
        meta,
      });
    }

    // RAG learning: extract the stored file's text and embed it. Best-effort — filing the document
    // into the Database must not fail because a PDF wouldn't parse.
    try {
      const buffer = await this.storage.getObject(input.storageKey);
      const text = await extractText({
        originalname: input.title,
        buffer,
        mimetype: MIME[input.fileType] ?? 'application/octet-stream',
      });
      const { chunksAdded, embedded } = await this.indexText(doc.id, text);
      if (chunksAdded) this.logger.log(`RAG learned "${input.title}": +${chunksAdded} chunks (${embedded} embedded).`);
    } catch (e) {
      this.logger.warn(`RAG indexing skipped for "${input.title}": ${String(e)}`);
    }
    return doc;
  }

  // Fetch a stored document's bytes for download/view. 404 if it has no stored file.
  async getFile(id: string) {
    const doc = await this.kb.findDocById(id);
    if (!doc) throw new NotFoundException('Document not found');
    const key = doc.meta?.storageKey as string | undefined;
    if (!key) {
      throw new NotFoundException('This is a catalog reference — no file is stored in this instance');
    }
    const buffer = await this.storage.getObject(key);
    const fileType = (doc.meta?.fileType as string) ?? this.extOf(doc.title);
    return { buffer, filename: doc.title, mime: MIME[fileType] ?? 'application/octet-stream' };
  }

  private extOf(name: string) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    return ext || 'file';
  }
}

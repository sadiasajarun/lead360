import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep, extname } from 'path';
import { AppModule } from '../app.module';
import { KbService } from '../modules/kb/kb.service';

// Bulk ingest of Riseup Labs' real Proposal & Budget Database into the RAG corpus.
// Each file is stored (downloadable/viewable) and its text is chunked + embedded. The catalog row
// of the same title (created by the seed) is upserted, so no duplicates. Idempotent to re-run.
//
// Source of truth: backend/data/kb-seed/ — COMMITTED to the repo so a fresh clone can rebuild the
// whole knowledge base (layout: <Category>/<Section>/<file>). Override with an arg or RISEUP_DB_DIR.
//
// Usage:
//   npm run ingest:riseup                                  # reads backend/data/kb-seed
//   npm run ingest:riseup -- "C:\\path\\to\\other\\dir"    # explicit source

const DEFAULT_DIR = process.env.RISEUP_DB_DIR || join(__dirname, '..', '..', 'data', 'kb-seed');

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
};

// Top-level folder name -> catalog category (matches the seed's KB_CATALOG keys).
function categoryOf(topFolder: string): string {
  const f = topFolder.trim();
  if (f === 'Global_' || f.toLowerCase() === 'global') return 'Global';
  return f; // 'Agency' | 'Design Portfolio' | 'Local'
}

// Second-level folder -> section, normalised to the three catalog sections.
function sectionOf(secondFolder: string | undefined): string {
  const f = (secondFolder || '').toLowerCase();
  if (f.startsWith('client requirement')) return 'Client requirement';
  if (f.startsWith('proposal')) return 'Proposal';
  if (f.startsWith('budget')) return 'Budget';
  return 'Document';
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

async function run() {
  const root = process.argv[2] || DEFAULT_DIR;
  const stat = statSync(root); // throws with a clear ENOENT if the path is wrong
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${root}`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const kb = app.get(KbService);

  const files = walk(root).filter((f) => MIME[extname(f).toLowerCase()]);
  console.log(`Found ${files.length} ingestable file(s) under:\n  ${root}\n`);

  let ok = 0;
  let totalChunks = 0;
  let totalEmbedded = 0;
  for (const abs of files) {
    const rel = relative(root, abs);
    const parts = rel.split(sep);
    const category = categoryOf(parts[0]);
    const section = sectionOf(parts[1]);
    const originalname = parts[parts.length - 1];
    const ext = extname(originalname).toLowerCase();

    try {
      const res = await kb.ingestStoredFile(
        { originalname, buffer: readFileSync(abs), mimetype: MIME[ext] },
        category,
        section,
      );
      ok++;
      totalChunks += res.chunksAdded;
      totalEmbedded += res.embedded;
      console.log(
        `✓ [${category} / ${section}] ${originalname} — ${res.parsedChars} chars, ` +
          `+${res.chunksAdded} chunks, ${res.embedded} embedded`,
      );
    } catch (e) {
      console.error(`✗ ${originalname}: ${(e as Error).message}`);
    }
  }

  console.log(
    `\nDone. ${ok}/${files.length} files ingested · +${totalChunks} new chunks · ${totalEmbedded} embedded.`,
  );
  await app.close();
}

run().catch((e) => {
  console.error('Ingest failed:', e);
  process.exit(1);
});

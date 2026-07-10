import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { PortfolioRepository } from './portfolio.repository';
import { AiService, EMBED_DIM } from '../../infrastructure/ai/ai.service';
import { stackForShape } from './stack-recommendation';

const LISTING = 'https://riseuplabs.com/portfolio/';
const UA = 'Mozilla/5.0 (compatible; Lead360Bot/1.0; +https://riseuplabs.com)';

// Non-project pages that live under the same URL shape (services, marketing, taxonomy).
const SKIP = /\/(category|tag|page|author|wp-|feed|blog|services?|contact|about|career|industr|solutions?|technolog|portfolio|privacy|terms|team|news|events?|affiliate|application-|.*-development|.*-services)\/$/i;

export interface ScrapedProject {
  detailUrl: string;
  title: string;
  summary: string;
  fullDescription: string;
  categoryTags: string[];
  industryTags: string[];
  techStack: string[];
  heroImageUrl?: string;
  meta: Record<string, string>;
}

// Scrapes riseuplabs.com/portfolio + each case-study page (Generation-Engine spec §1 / §9.1).
@Injectable()
export class PortfolioScraperService implements OnModuleInit {
  private readonly logger = new Logger(PortfolioScraperService.name);

  constructor(
    private readonly repo: PortfolioRepository,
    private readonly ai: AiService,
  ) {}

  // `embedding` is a raw pgvector column TypeORM doesn't manage, so `synchronize:true` DROPS it on
  // every boot. Re-create it here (idempotent) exactly as KbService does. Prod (migrations) won't.
  async onModuleInit() {
    try {
      await this.repo.ensureVectorColumn(EMBED_DIM);
    } catch (e) {
      this.logger.warn(`portfolio pgvector setup skipped: ${String(e)}`);
    }
  }

  /** Re-embed rows missing an embedding (e.g. after a synchronize drop). No re-scrape needed. */
  async embedMissing(): Promise<{ embedded: number; remaining: number }> {
    await this.repo.ensureVectorColumn(EMBED_DIM);
    if (!this.ai.enabled) return { embedded: 0, remaining: (await this.repo.findWithoutEmbedding()).length };
    const rows = await this.repo.findWithoutEmbedding();
    let embedded = 0;
    for (const r of rows) {
      try {
        const [vec] = await this.ai.embed([`${r.title}\n${r.summary}\n${r.fullDescription}`.slice(0, 8000)]);
        await this.repo.setEmbedding(r.id, vec);
        embedded++;
      } catch (e) {
        this.logger.warn(`Re-embed failed for ${r.title}: ${String(e)}`);
      }
    }
    return { embedded, remaining: rows.length - embedded };
  }

  private async fetchHtml(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25_000) });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  /** Candidate project URLs from the listing page. */
  async discover(): Promise<string[]> {
    const html = await this.fetchHtml(LISTING);
    if (!html) return [];
    const $ = cheerio.load(html);
    const urls = new Set<string>();
    $('a[href^="https://riseuplabs.com/"]').each((_, a) => {
      const href = ($(a).attr('href') || '').split(/[#?]/)[0];
      if (!href.endsWith('/') || SKIP.test(href)) return;
      // project pages are one path segment deep: https://riseuplabs.com/<slug>/
      if (href.replace('https://riseuplabs.com/', '').split('/').filter(Boolean).length === 1) urls.add(href);
    });
    return [...urls];
  }

  /** Parse one case-study page. Returns null when the page has no `❏ Label : Value` meta table
   *  (that table is the reliable discriminator between real projects and service/marketing pages). */
  async parseProject(detailUrl: string): Promise<ScrapedProject | null> {
    const html = await this.fetchHtml(detailUrl);
    if (!html) return null;
    const $ = cheerio.load(html);

    const meta: Record<string, string> = {};
    $('tr').each((_, tr) => {
      const tds = $(tr).find('td');
      if (tds.length < 2) return;
      const label = $(tds[0]).text().replace(/❏/g, '').replace(/\s+/g, ' ').trim().replace(/:$/, '');
      if (!label || !$(tds[0]).text().includes('❏')) return;
      const value = $(tds[tds.length - 1]).text().replace(/\s+/g, ' ').trim();
      if (label && value && value !== ':') meta[label] = value;
    });
    if (Object.keys(meta).length === 0) return null; // not a project page

    const title = ($('h1').first().text() || $('title').text()).split('|')[0].replace(/- Riseup Labs.*$/i, '').trim();
    const summary = ($('meta[name="description"]').attr('content') || '').trim();
    const paras: string[] = [];
    $('p').each((_, p) => {
      const t = $(p).text().replace(/\s+/g, ' ').trim();
      if (t.length > 60) paras.push(t);
    });
    const fullDescription = paras.slice(0, 25).join('\n\n').slice(0, 12_000);
    const heroImageUrl = $('meta[property="og:image"]').attr('content') || undefined;

    // Structured shape drives stack derivation — Category is authoritative, Platform is noise.
    const shape = {
      category: meta['Category'],
      productType: [meta['Product Type'], meta['Course Type']].filter(Boolean).join(' '),
      serviceType: meta['Service Type'],
      platformType: meta['Platform Type'],
      title,
    };
    const categoryTags = [meta['Category'], meta['Product Type'], meta['Service Type']]
      .filter(Boolean).flatMap((v) => v.split(/\s*(?:,|and)\s*/i)).map((s) => s.trim()).filter(Boolean);
    const industryTags = [meta['Publisher Name'], meta['Client Name'], meta['Client Name:']]
      .filter(Boolean).map((s) => s.trim());

    return {
      detailUrl, title, summary, fullDescription,
      categoryTags: [...new Set(categoryTags)],
      industryTags: [...new Set(industryTags)],
      techStack: stackForShape(shape),
      heroImageUrl, meta,
    };
  }

  /** Full idempotent ingest: discover → parse → store → embed. Spec §9.1. */
  async ingestAll(limit?: number): Promise<{ discovered: number; projects: number; embedded: number; skipped: number }> {
    await this.repo.ensureVectorColumn(EMBED_DIM);
    const urls = await this.discover();
    const targets = limit ? urls.slice(0, limit) : urls;
    let projects = 0, embedded = 0, skipped = 0;

    for (const url of targets) {
      const p = await this.parseProject(url);
      if (!p) { skipped++; continue; }
      const saved = await this.repo.upsert(p);
      projects++;
      if (this.ai.enabled) {
        try {
          const [vec] = await this.ai.embed([`${p.title}\n${p.summary}\n${p.fullDescription}`.slice(0, 8000)]);
          await this.repo.setEmbedding(saved.id, vec);
          embedded++;
        } catch (e) {
          this.logger.warn(`Embed failed for ${url}: ${String(e)}`);
        }
      }
    }
    this.logger.log(`Portfolio ingest: ${projects} projects (${embedded} embedded), ${skipped} non-project pages skipped.`);
    return { discovered: urls.length, projects, embedded, skipped };
  }
}

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Browser } from 'puppeteer';

// puppeteer is a CommonJS default export; import-equals is runtime-safe without esModuleInterop.
import puppeteer = require('puppeteer');

// Renders HTML to a print-quality PDF via a single reused headless Chromium instance.
@Injectable()
export class PdfService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfService.name);
  private browser?: Browser;

  private async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.connected) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browser;
  }

  async htmlToPdf(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle0' });
      // The `.paper` is a roomy 900px canvas scaled to the A4 width (900 × 0.88 ≈ 794px @96dpi).
      // preferCSSPageSize lets the HTML's @page rules control per-page margins (full-bleed cover via
      // @page:first, top/bottom breathing room on content pages) — the uniform `margin` option can't.
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        scale: 0.88,
        preferCSSPageSize: true,
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  /**
   * Rasterise ONE element of an HTML page to a crisp PNG (2× device scale) — used to embed the exact
   * PDF-styled figures (e.g. the solution-architecture diagram) into the Word export, which can't render
   * HTML/CSS/SVG itself. Returns the PNG plus the element's CSS-pixel size for proportional sizing.
   */
  async htmlToPng(html: string, selector: string): Promise<{ png: Buffer; width: number; height: number } | null> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 980, height: 900, deviceScaleFactor: 2 });
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const el = await page.$(selector);
      if (!el) return null;
      const box = await el.boundingBox();
      const png = await el.screenshot({ type: 'png' });
      return { png: Buffer.from(png), width: Math.round(box?.width ?? 0), height: Math.round(box?.height ?? 0) };
    } finally {
      await page.close();
    }
  }

  async onModuleDestroy() {
    if (this.browser) await this.browser.close().catch(() => undefined);
  }
}

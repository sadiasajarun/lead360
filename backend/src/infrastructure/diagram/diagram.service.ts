import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ProposalDocument } from '../../modules/generation/blocks/block.types';

export type DiagramEngine = 'mermaid' | 'd2';

/**
 * DiagramService — renders AI-written diagram specs (Mermaid / D2) into
 * self-contained SVG via a self-hosted Kroki service. Nothing leaves our box.
 *
 * The AI writes a spec (never SVG); this fills the DiagramBlock.svg at generation
 * time. On any failure it returns null so the block falls back to a placeholder —
 * a broken diagram never fails the whole proposal.
 */
@Injectable()
export class DiagramService {
  private readonly logger = new Logger(DiagramService.name);
  private readonly krokiUrl: string;
  private readonly timeoutMs = 15_000;

  constructor(private readonly config: ConfigService) {
    // http://kroki:8000 inside docker-compose; http://localhost:8000 on the host.
    this.krokiUrl = this.config.get<string>('KROKI_URL', 'http://localhost:8000').replace(/\/$/, '');
  }

  /** Riseup theme for Mermaid — prepended unless the spec already sets an init directive. */
  private themeMermaid(spec: string): string {
    if (/^\s*%%\{\s*init/.test(spec)) return spec;
    const init =
      "%%{init: {'theme':'base','themeVariables':{" +
      "'fontFamily':'Inter, sans-serif','primaryColor':'#FDEEE6','primaryBorderColor':'#EA5400'," +
      "'primaryTextColor':'#211E1F','lineColor':'#9AA4B4','actorBkg':'#FDEEE6','actorBorder':'#EA5400'," +
      "'actorTextColor':'#211E1F','signalColor':'#211E1F','signalTextColor':'#211E1F'}}}%%\n";
    return init + spec;
  }

  /** POST a diagram spec to Kroki, return the SVG string (or null on failure). */
  async render(engine: DiagramEngine, spec: string): Promise<string | null> {
    const body = engine === 'mermaid' ? this.themeMermaid(spec) : spec;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.krokiUrl}/${engine}/svg`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`Kroki ${engine} render failed: HTTP ${res.status}`);
        return null;
      }
      const svg = await res.text();
      return svg.startsWith('<') ? svg : null;
    } catch (e) {
      this.logger.warn(`Kroki ${engine} render error: ${String(e)}`);
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  renderMermaid(spec: string): Promise<string | null> {
    return this.render('mermaid', spec);
  }
  renderD2(spec: string): Promise<string | null> {
    return this.render('d2', spec);
  }

  /**
   * Fill every `diagram` block's `svg` from its spec (in parallel). Blocks that fail
   * to render are left without an svg → the renderer shows a placeholder. Mutates doc.
   */
  async fillDocumentDiagrams(doc: ProposalDocument): Promise<void> {
    const pending = doc.blocks
      .filter((b): b is Extract<typeof b, { type: 'diagram' }> => b.type === 'diagram' && !b.svg)
      .map(async (b) => {
        const svg = await this.render(b.engine, b.spec);
        if (svg) b.svg = svg;
      });
    await Promise.all(pending);
  }
}

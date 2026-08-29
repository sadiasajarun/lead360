import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export type ModelTier = 'haiku' | 'sonnet' | 'opus';

export interface CompleteOpts {
  tier?: ModelTier;
  system?: string;
  prompt: string;
  maxTokens?: number;
  jsonMode?: boolean;
  /** Short name for this call (e.g. 'understand', 'decide', 'compose', 'regenerate:overview') — printed on the
   *  per-call token/cost log line so the dev console reads as a labelled trace of the generation pipeline. */
  label?: string;
}

export interface CompleteResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

// All embeddings are pinned to 768 dims (via the `dimensions` param) to fit the pgvector columns
// (kb_chunks.embedding, portfolio_projects.embedding). Changing this requires re-embedding everything.
export const EMBED_DIM = 768;

// Provider-agnostic AI wrapper (OpenAI SDK). Current provider: OpenAI Platform — AI_CHAT_MODEL for
// generation, AI_EMBED_MODEL for RAG embeddings. Swappable to any OpenAI-compatible endpoint
// (Ollama, Gemini-compat, …) via AI_BASE_URL + model envs; see docs/AI_MODEL_GUIDE.md before switching.
// The client is only built when AI_API_KEY is set; calls without it fail with a clear 503.
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client?: OpenAI;
  private readonly chatModel: string;
  private readonly embedModel: string;
  // USD list price per 1M tokens. Defaults match the figures the generation diagnostics already use for
  // gpt-5.4 ($2.50 in / $15 out); embeddings default to text-embedding-3-small ($0.02). Override per
  // deployment via AI_PRICE_IN_PER_1M / AI_PRICE_OUT_PER_1M / AI_EMBED_PRICE_PER_1M when the model changes.
  private readonly priceInPer1M: number;
  private readonly priceOutPer1M: number;
  private readonly embedPricePer1M: number;
  // Running cost across the whole process (dev-console transparency) — every chat + embed call adds to it.
  private cumulativeTokens = 0;
  private cumulativeCostUsd = 0;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('AI_API_KEY');
    const baseURL = this.config.get<string>('AI_BASE_URL', 'https://api.openai.com/v1');
    this.chatModel = this.config.get<string>('AI_CHAT_MODEL', 'gpt-4o-mini');
    this.embedModel = this.config.get<string>('AI_EMBED_MODEL', 'text-embedding-3-small');
    this.priceInPer1M = Number(this.config.get('AI_PRICE_IN_PER_1M', 2.5));
    this.priceOutPer1M = Number(this.config.get('AI_PRICE_OUT_PER_1M', 15));
    this.embedPricePer1M = Number(this.config.get('AI_EMBED_PRICE_PER_1M', 0.02));
    if (apiKey) this.client = new OpenAI({ apiKey, baseURL });
    else this.logger.warn('AI_API_KEY not set — AI generation & embeddings are disabled until it is configured.');
  }

  get enabled(): boolean {
    return !!this.client;
  }

  /** The chat model actually in use — recorded on every Generation row so cost/audit trails are truthful. */
  get model(): string {
    return this.chatModel;
  }

  /** USD cost of a chat call at the configured per-1M input/output rates (4 dp, matches the diagnostics). */
  price(tokensIn: number, tokensOut: number): number {
    return +(tokensIn * this.priceInPer1M / 1e6 + tokensOut * this.priceOutPer1M / 1e6).toFixed(4);
  }

  private static fmt(n: number): string {
    return n.toLocaleString('en-US');
  }

  // One line per AI call in the dev console: label · model · in+out tokens · $cost · running total. This is the
  // single place every chat/embed call is metered, so the trace and the cost are always truthful and complete.
  private logCall(label: string, model: string, tokensIn: number, tokensOut: number, costUsd: number): void {
    this.cumulativeTokens += tokensIn + tokensOut;
    this.cumulativeCostUsd += costUsd;
    const F = AiService.fmt;
    this.logger.log(
      `AI ▸ ${label} · ${model} · in ${F(tokensIn)} + out ${F(tokensOut)} = ${F(tokensIn + tokensOut)} tok · ` +
        `$${costUsd.toFixed(4)}  (session: ${F(this.cumulativeTokens)} tok · $${this.cumulativeCostUsd.toFixed(4)})`,
    );
  }

  /**
   * Reasoning-era models (gpt-5.x, o1/o3/o4) reject `max_tokens` and require `max_completion_tokens`,
   * and reject any non-default `temperature`. Older chat models (gpt-4o/4.1, non-OpenAI compat
   * endpoints) still take `max_tokens`. Pick the right parameter per model rather than sending both.
   */
  private get usesCompletionTokens(): boolean {
    return /^(gpt-5|o1|o3|o4)/i.test(this.chatModel);
  }

  async complete(opts: CompleteOpts): Promise<CompleteResult> {
    if (!this.client) throw new ServiceUnavailableException('AI_API_KEY is not configured');
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: opts.prompt });

    const budget = opts.maxTokens ?? 1500;
    const params = {
      model: this.chatModel,
      messages,
      // Reasoning models count "thinking" tokens against this budget — give them headroom.
      ...(this.usesCompletionTokens ? { max_completion_tokens: budget } : { max_tokens: budget }),
      // JSON mode returns well-formed JSON (avoids truncated/interleaved output).
      ...(opts.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;

    let res: OpenAI.Chat.ChatCompletion;
    try {
      res = await this.client.chat.completions.create(params);
    } catch (e) {
      // Surface OpenAI API failures as a clear, actionable 503 instead of an opaque 500 — the caller
      // (proposal generation) then shows a meaningful message rather than "Internal server error".
      const status = (e as { status?: number }).status;
      const raw = (e as Error)?.message ?? String(e);
      if (status === 429) {
        const outOfCredits = /credit|billing|quota/i.test(raw);
        throw new ServiceUnavailableException(
          outOfCredits
            ? 'AI provider has no credits remaining. Add credits to the OpenAI account, then retry generation.'
            : 'AI provider is rate-limited right now. Wait a moment and retry generation.',
        );
      }
      if (status === 401 || status === 403) {
        throw new ServiceUnavailableException('AI provider rejected the API key (invalid or rotated). Update AI_API_KEY, then retry.');
      }
      if (status && status >= 500) {
        throw new ServiceUnavailableException('AI provider is temporarily unavailable. Retry generation shortly.');
      }
      throw new ServiceUnavailableException(`AI request failed: ${raw}`);
    }
    const text = res.choices[0]?.message?.content ?? '';
    if (!text && res.choices[0]?.finish_reason === 'length') {
      throw new Error(
        `${this.chatModel} exhausted its token budget (${budget}) on reasoning before emitting output. ` +
          'Raise maxTokens or use a non-reasoning model.',
      );
    }
    const tokensIn = res.usage?.prompt_tokens ?? 0;
    const tokensOut = res.usage?.completion_tokens ?? 0;
    this.logCall(opts.label ?? 'chat', this.chatModel, tokensIn, tokensOut, this.price(tokensIn, tokensOut));
    return { text, tokensIn, tokensOut };
  }

  // Structured output: JSON mode + generous token headroom (2.5-flash spends tokens "thinking",
  // so too small a budget truncates the JSON). Parses the returned object.
  async json<T>(opts: CompleteOpts): Promise<{ data: T; tokensIn: number; tokensOut: number }> {
    const r = await this.complete({
      ...opts,
      jsonMode: true,
      maxTokens: opts.maxTokens ?? 8000,
      prompt: `${opts.prompt}\n\nReturn ONLY a single valid JSON object — no prose, no code fences.`,
    });
    const match = r.text.match(/[[{][\s\S]*[\]}]/);
    const data = JSON.parse(match ? match[0] : r.text) as T;
    return { data, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
  }

  // Embed one or more texts for pgvector similarity search (RAG). Returns EMBED_DIM-length vectors.
  async embed(texts: string[]): Promise<number[][]> {
    if (!this.client) throw new ServiceUnavailableException('AI_API_KEY is not configured');
    if (texts.length === 0) return [];
    // Pin the output size to EMBED_DIM so vectors fit the vector(768) pgvector columns
    // (text-embedding-3-small defaults to 1536 but honours the `dimensions` parameter).
    const res = await this.client.embeddings.create({ model: this.embedModel, input: texts, dimensions: EMBED_DIM });
    // Embeddings are input-only (no completion tokens); price at the embed rate. Small but metered for a truthful total.
    const embedTokens = res.usage?.total_tokens ?? 0;
    this.logCall(`embed (${texts.length} text${texts.length === 1 ? '' : 's'})`, this.embedModel, embedTokens, 0, +(embedTokens * this.embedPricePer1M / 1e6).toFixed(6));
    return res.data.map((d) => d.embedding as number[]);
  }
}

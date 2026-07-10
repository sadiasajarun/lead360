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

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('AI_API_KEY');
    const baseURL = this.config.get<string>('AI_BASE_URL', 'https://api.openai.com/v1');
    this.chatModel = this.config.get<string>('AI_CHAT_MODEL', 'gpt-4o-mini');
    this.embedModel = this.config.get<string>('AI_EMBED_MODEL', 'text-embedding-3-small');
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

    const res = await this.client.chat.completions.create(params);
    const text = res.choices[0]?.message?.content ?? '';
    if (!text && res.choices[0]?.finish_reason === 'length') {
      throw new Error(
        `${this.chatModel} exhausted its token budget (${budget}) on reasoning before emitting output. ` +
          'Raise maxTokens or use a non-reasoning model.',
      );
    }
    return {
      text,
      tokensIn: res.usage?.prompt_tokens ?? 0,
      tokensOut: res.usage?.completion_tokens ?? 0,
    };
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
    return res.data.map((d) => d.embedding as number[]);
  }
}

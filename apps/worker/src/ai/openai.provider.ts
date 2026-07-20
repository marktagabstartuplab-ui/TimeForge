import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

export interface AiCompletion {
  summary: string;
  recommendation: string;
  confidence: number;
  promptHash: string;
  responseHash: string;
  totalTokens: number;
  latencyMs: number;
}

interface OpenAiMessage { role: 'system' | 'user' | 'assistant'; content: string; }

interface OpenAiResponse {
  choices: Array<{ message: { content: string } }>;
  usage?: { total_tokens: number };
}

/**
 * OpenAI abstraction layer.
 * Uses native fetch (Node 18+) — no SDK dependency.
 * Falls back to a deterministic stub when OPENAI_API_KEY is absent.
 */
@Injectable()
export class OpenAiProvider {
  private readonly logger = new Logger(OpenAiProvider.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey  = config.get<string>('ai.openaiApiKey') ?? '';
    this.model   = config.get<string>('ai.openaiModel')  ?? 'qwen/qwen3.6-plus';
    this.baseUrl = config.get<string>('ai.openaiBaseUrl') ?? 'https://openrouter.ai/api/v1';
  }

  async complete(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<AiCompletion> {
    const startedAt = Date.now();

    if (!this.apiKey) {
      return this.stub(systemPrompt, userPrompt, startedAt);
    }

    // Org-wide currency rule appended to every feature prompt in one place:
    // TimeForge amounts are Philippine Pesos everywhere (BR: ₱, never $).
    const currencyRule =
      ' All monetary amounts are in Philippine Pesos — always write them with the ₱ symbol (or "PHP"), never "$" or USD.';

    const messages: OpenAiMessage[] = [
      { role: 'system',  content: systemPrompt + currencyRule },
      { role: 'user',    content: userPrompt   },
    ];

    // No response_format constraint: not every OpenAI-compatible provider/model
    // (e.g. OpenRouter free-tier models) supports json_object/json_schema mode.
    // Prompts already instruct JSON output; parseStructured() has a raw-text fallback.
    const body = JSON.stringify({
      model: this.model,
      messages,
      temperature: 0.3,
      max_tokens: 1024,
      // Reasoning/"thinking" models (e.g. the default qwen3.6-plus) burn most
      // of their latency — and token budget — on a hidden reasoning phase
      // these short structured completions don't need; with it enabled, calls
      // regularly blew the request timeout and every AI feature failed with
      // "The operation was aborted due to timeout". OpenRouter's unified
      // `reasoning` param turns that phase off (ignored by non-reasoning
      // models). Only sent to OpenRouter: other OpenAI-compatible hosts may
      // reject the unknown field.
      ...(this.baseUrl.includes('openrouter') ? { reasoning: { enabled: false } } : {}),
    });

    const promptHash = this.hash(body);

    let raw: string;
    try {
      const resp = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body,
        // 100s, not 60s: the frontend polls the job for up to 120s
        // (runAndPollAiJob), so a slow-but-successful completion inside that
        // window should be persisted rather than aborted at the old 60s mark.
        signal: AbortSignal.timeout(100_000),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 200)}`);
      }

      const json = await resp.json() as OpenAiResponse;
      raw = json.choices[0]?.message?.content ?? '{}';
      const totalTokens = json.usage?.total_tokens ?? 0;
      const responseHash = this.hash(raw);
      const latencyMs = Date.now() - startedAt;

      const parsed = this.parseStructured(raw);

      this.logger.log(`OpenAI complete: ${totalTokens} tokens, ${latencyMs}ms`);

      return { ...parsed, promptHash, responseHash, totalTokens, latencyMs };
    } catch (err) {
      this.logger.error(`OpenAI call failed: ${(err as Error).message}`);
      throw err;
    }
  }

  // ─── Stub (no API key) ────────────────────────────────────────────────────

  private stub(systemPrompt: string, userPrompt: string, startedAt: number): AiCompletion {
    this.logger.warn('OPENAI_API_KEY not set — returning stub result');
    const combined = systemPrompt + userPrompt;
    const promptHash   = this.hash(combined);
    const responseHash = this.hash('stub:' + combined);
    return {
      summary:        'AI provider not configured. Set OPENAI_API_KEY to enable real analysis.',
      recommendation: 'No action required (stub mode).',
      confidence:     0.0,
      promptHash,
      responseHash,
      totalTokens: 0,
      latencyMs: Date.now() - startedAt,
    };
  }

  // ─── Parse structured JSON from model ─────────────────────────────────────

  private parseStructured(raw: string): Pick<AiCompletion, 'summary' | 'recommendation' | 'confidence'> {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        summary:        String(parsed['summary']        ?? raw.slice(0, 500)),
        recommendation: String(parsed['recommendation'] ?? 'See summary.'),
        confidence:     Math.min(1, Math.max(0, Number(parsed['confidence'] ?? 0.8))),
      };
    } catch {
      // Model didn't produce JSON — use raw text as summary
      return { summary: raw.slice(0, 500), recommendation: 'See summary.', confidence: 0.5 };
    }
  }

  // ─── SHA-256 hash helper ──────────────────────────────────────────────────

  private hash(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}

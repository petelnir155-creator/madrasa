import type { LLM } from './ai';

/**
 * Server-side LLM adapter. Keys never leave the server (no NEXT_PUBLIC_ prefix).
 *   ANTHROPIC_API_KEY  (+ optional ANTHROPIC_MODEL)   – preferred
 *   OPENAI_API_KEY     (+ optional OPENAI_MODEL)      – fallback
 */
export class NotConfiguredError extends Error {
  constructor() {
    super('No LLM API key configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY)');
  }
}

export function llmConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY);
}

export function getLLM(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): LLM {
  if (env.ANTHROPIC_API_KEY) {
    const model = env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
    return async ({ system, user, maxTokens }) => {
      const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      return (data.content ?? []).map((c) => (c.type === 'text' ? c.text ?? '' : '')).join('');
    };
  }
  if (env.OPENAI_API_KEY) {
    const model = env.OPENAI_MODEL || 'gpt-4o-mini';
    return async ({ system, user, maxTokens }) => {
      const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`OpenAI API ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return data.choices?.[0]?.message?.content ?? '';
    };
  }
  throw new NotConfiguredError();
}

/** Tiny in-memory limiter (per server instance) – enough to stop a runaway client loop. */
const hits = new Map<string, number[]>();
export function rateLimited(key: string, limit = 30, windowMs = 60_000, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

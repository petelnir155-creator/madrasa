import { generateSentence, translateQuery, type LLM } from './ai';
import { NotConfiguredError } from './llm';

export interface HandlerResult {
  status: number;
  json: Record<string, unknown>;
}

const isStr = (v: unknown): v is string => typeof v === 'string';

/** POST /api/sentence  { words: [{id, hebrew, translit, arabic?}] }  (max 10 per call) */
export async function handleSentences(body: unknown, getLlm: () => LLM): Promise<HandlerResult> {
  const words = (body as { words?: unknown })?.words;
  if (!Array.isArray(words) || words.length === 0 || words.length > 10) {
    return { status: 400, json: { error: 'words must be an array of 1-10 items' } };
  }
  const clean = words.filter(
    (w): w is { id: string; hebrew: string; translit: string; arabic?: string } =>
      !!w && isStr(w.id) && isStr(w.hebrew) && isStr(w.translit) && w.translit.length < 120 && w.hebrew.length < 200,
  );
  if (!clean.length) return { status: 400, json: { error: 'invalid words' } };

  let llm: LLM;
  try {
    llm = getLlm();
  } catch (e) {
    if (e instanceof NotConfiguredError) return { status: 503, json: { error: 'not_configured' } };
    throw e;
  }
  const settled = await Promise.allSettled(clean.map((w) => generateSentence(w, llm)));
  const sentences: Record<string, unknown> = {};
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') sentences[clean[i].id] = r.value;
  });
  return { status: 200, json: { sentences } };
}

/** POST /api/translate  { query, categories: string[] } */
export async function handleTranslate(body: unknown, getLlm: () => LLM): Promise<HandlerResult> {
  const b = body as { query?: unknown; categories?: unknown };
  if (!isStr(b?.query) || !b.query.trim() || b.query.length > 80) {
    return { status: 400, json: { error: 'query must be 1-80 characters' } };
  }
  const categories = Array.isArray(b.categories) ? b.categories.filter(isStr).slice(0, 80) : [];
  let llm: LLM;
  try {
    llm = getLlm();
  } catch (e) {
    if (e instanceof NotConfiguredError) return { status: 503, json: { error: 'not_configured' } };
    throw e;
  }
  try {
    return { status: 200, json: { result: await translateQuery(b.query, categories, llm) } };
  } catch (e) {
    return { status: 422, json: { error: e instanceof Error ? e.message : 'translation failed' } };
  }
}

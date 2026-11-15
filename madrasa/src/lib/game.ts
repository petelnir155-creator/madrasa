import { translateQuery, type LLM } from './ai';
import { NotConfiguredError } from './llm';


export interface HandlerResult {
  status: number;
  json: Record<string, unknown>;
}

const isStr = (v: unknown): v is string => typeof v === 'string';

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

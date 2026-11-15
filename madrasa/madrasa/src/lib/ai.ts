
/** Provider-agnostic LLM call – injected so everything below is unit-testable without a network. */
export type LLM = (req: { system: string; user: string; maxTokens: number }) => Promise<string>;

export const TRANSCRIPTION_RULES = `Transcription convention (the app's own): Levantine Arabic written in HEBREW letters with niqqud, e.g. خبز = חֻ'בְּז, غدا = עַ'דַא, جوعان = ג'וּעַאן, ظهر = טֻ'הְר, قهوة = קַהְוַה, ساكن = סַאכֵּן. Use geresh (') for ח' ע' ג' ט'. Colloquial Palestinian/Levantine speech, not Modern Standard Arabic.
Style examples:
- בִּדִּי קַהְוַה לַו סַמַחְת, בַּס בִּדוּן סֻכַּר
- אַנַא שַׁאיִף פִילְם בַּסִּינַמַא
- אַנַא רַאיֵח עַ-ל-בַּחַר פִי אֶצֵּיף`;

/** Pull the first JSON object out of a model reply (tolerates code fences and chatter). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in model reply');
  return JSON.parse(text.slice(start, end + 1));
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export interface Translation {
  hebrew: string;
  arabic: string;
  translit: string;
  category: string;
  note: string;
}

export function translatePrompt(query: string, categories: string[]): { system: string; user: string } {
  const system = `You are a Levantine (Palestinian/Israeli-Arab colloquial) Arabic dictionary for a Hebrew speaker.
${TRANSCRIPTION_RULES}
Given a Hebrew or English word/phrase, answer with JSON only:
{"hebrew": "<the meaning in Hebrew, short>", "arabic": "<colloquial Levantine, Arabic script>", "translit": "<Hebrew letters with niqqud per the convention>", "category": "<ONE of the allowed categories, exactly as written>", "note": "<optional one-line usage note in Hebrew, or empty>"}
Allowed categories: ${JSON.stringify(categories)}.
If the query is not a translatable word or phrase, return {"error": "..."}.`;
  return { system, user: query };
}

export function validateTranslation(raw: unknown, categories: string[]): Translation | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.error) return null;
  const hebrew = str(r.hebrew, 120);
  const arabic = str(r.arabic, 120);
  const translit = str(r.translit, 120);
  if (!hebrew || !arabic || !translit) return null;
  const cat = str(r.category, 120);
  return {
    hebrew,
    arabic,
    translit,
    category: categories.includes(cat) ? cat : '',
    note: str(r.note, 200),
  };
}

export async function translateQuery(query: string, categories: string[], llm: LLM): Promise<Translation> {
  const q = query.trim().slice(0, 80);
  if (!q) throw new Error('empty query');
  const { system, user } = translatePrompt(q, categories);
  const reply = await llm({ system, user, maxTokens: 400 });
  const ok = validateTranslation(extractJson(reply), categories);
  if (!ok) throw new Error('could not translate that');
  return ok;
}

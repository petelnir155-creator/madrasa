import { expandVariants, meaningKey, normalizeText, wordKey } from './normalize';
import { LESSON_FALLBACK_CATEGORY, type Category, type Sentence, type Word } from './types';

export interface RawLesson { lesson: number; sentence: string; translit: string; hebrew: string }
export interface RawCat { tab: string; arabic: string; translit: string; hebrew: string; category: string | null }
export interface Raw { lessons: RawLesson[]; categoryTabs: RawCat[]; extras: RawCat[] }

export interface BuildStats {
  rawRows: number;
  uniqueWords: number;
  mergedByTranslit: number;
  mergedByMeaning: number;
  lessonOnly: number;
  withSentence: number;
  duplicatesRemoved: number;
  /** low-confidence merges / new senses worth eyeballing */
  review: string[];
}

const groupOf = (name: string) => (name.includes(':') ? name.split(':')[0].trim() : name);

/** Hebrew meaning similarity 0..1 (equal, shared alternative, or token overlap). */
export function meaningSimilarity(a: string, b: string): number {
  const pieces = (m: string) =>
    m
      .replace(/\([^)]*\)/g, ' ')
      .split(/[\/,;]| - /)
      .map((p) => normalizeText(p))
      .filter(Boolean);
  const pa = pieces(a);
  const pb = pieces(b);
  if (pa.some((x) => pb.includes(x))) return 1;
  const tokens = (arr: string[]) =>
    new Set(
      arr
        .join(' ')
        .split(' ')
        .map((t) => (t.length > 3 && 'הבלומשכ'.includes(t[0]) ? t.slice(1) : t))
        .filter((t) => t.length > 1),
    );
  const ta = tokens(pa);
  const tb = tokens(pb);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

const SAME_SENSE = 0.34;

/** id = compact translit key; a second *different* sense of the same key gets "~<meaning key>". */
export function makeWordId(translit: string, hebrew: string, taken: (id: string) => boolean): string {
  const base = wordKey(translit);
  if (!taken(base)) return base;
  const withMeaning = `${base}~${meaningKey(hebrew)}`;
  if (!taken(withMeaning)) return withMeaning;
  let i = 2;
  while (taken(`${withMeaning}~${i}`)) i++;
  return `${withMeaning}~${i}`;
}

/**
 * Merge the category tabs and the lesson tabs into ONE list of unique words.
 *
 * Identity = transliteration key (niqqud/spacing/punctuation-insensitive, any written variant)
 *            AND a compatible meaning. The key alone is not enough: after stripping niqqud
 *            "בַּסّ" means "but", "only" and "enough", and "חַ'אל"/"חַאל" are "uncle"/"state".
 * Result:    the word keeps its category tag + Arabic script from the category tab and
 *            inherits every sentence from the lesson tabs.
 */
export function buildSeed(raw: Raw): { words: Word[]; categories: Category[]; stats: BuildStats } {
  const words = new Map<string, Word>();
  const byVariant = new Map<string, Set<string>>(); // translit variant key -> word ids
  const review: string[] = [];
  let mergedByTranslit = 0;
  let mergedByMeaning = 0;

  const candidatesFor = (translit: string): Word[] => {
    const ids = new Set<string>();
    for (const v of expandVariants(translit)) for (const id of byVariant.get(wordKey(v)) ?? []) ids.add(id);
    return [...ids].map((id) => words.get(id)!);
  };
  const best = (cands: Word[], hebrew: string) =>
    cands
      .map((w) => ({ w, sim: meaningSimilarity(w.hebrew, hebrew) }))
      .sort((a, b) => b.sim - a.sim)[0];

  const create = (r: { translit: string; hebrew: string; arabic: string; category: string | null }, s?: Sentence) => {
    const id = makeWordId(r.translit, r.hebrew, (x) => words.has(x));
    const w: Word = {
      id,
      hebrew: r.hebrew,
      translit: r.translit,
      arabic: r.arabic,
      categoryId: r.category ?? LESSON_FALLBACK_CATEGORY,
      sentences: s ? [s] : [],
      source: 'seed',
      staged: false,
    };
    words.set(id, w);
    for (const v of expandVariants(w.translit)) {
      const k = wordKey(v);
      (byVariant.get(k) ?? byVariant.set(k, new Set()).get(k)!).add(id);
    }
    return w;
  };

  // 1) category tabs + names tab are the canonical entries
  for (const r of [...raw.categoryTabs, ...raw.extras]) {
    if (!wordKey(r.translit)) continue;
    const hit = best(candidatesFor(r.translit), r.hebrew);
    if (hit && hit.sim >= SAME_SENSE) {
      mergedByTranslit++;
      if (!hit.w.arabic && r.arabic) hit.w.arabic = r.arabic;
    } else {
      create(r);
    }
  }

  // 2) lesson rows attach sentences to an existing word, or create a lesson-only word
  let lessonOnly = 0;
  for (const r of raw.lessons) {
    const sentence: Sentence = { text: r.sentence, target: r.translit, lesson: r.lesson };
    const cands = candidatesFor(r.translit);
    const hit = best(cands, r.hebrew);
    let target: Word | undefined;
    if (hit && hit.sim >= SAME_SENSE) {
      target = hit.w;
      mergedByTranslit++;
    } else if (cands.length === 1) {
      // lone candidate: the lesson cell just words the meaning differently
      target = cands[0];
      mergedByMeaning++;
      review.push(`${r.translit}: "${r.hebrew}" -> "${target.hebrew}"`);
    } else if (cands.length > 1) {
      review.push(`NEW SENSE ${r.translit}: "${r.hebrew}" (had: ${cands.map((c) => c.hebrew).join(' | ')})`);
    }

    if (target) {
      if (r.sentence && !target.sentences.some((x) => normalizeText(x.text) === normalizeText(r.sentence))) {
        target.sentences.push(sentence);
      }
      continue;
    }
    create({ translit: r.translit, hebrew: r.hebrew, arabic: '', category: null }, r.sentence ? sentence : undefined);
    lessonOnly++;
  }

  const list = [...words.values()];
  const categoryNames = [...new Set(list.map((w) => w.categoryId))];
  const categories: Category[] = categoryNames.map((name) => ({ id: name, name, group: groupOf(name) }));
  const rawRows = raw.lessons.length + raw.categoryTabs.length + raw.extras.length;
  return {
    words: list,
    categories,
    stats: {
      rawRows,
      uniqueWords: list.length,
      mergedByTranslit,
      mergedByMeaning,
      lessonOnly,
      withSentence: list.filter((w) => w.sentences.length).length,
      duplicatesRemoved: rawRows - list.length,
      review,
    },
  };
}

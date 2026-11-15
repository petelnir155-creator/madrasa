import { makeWordId, meaningSimilarity } from './seed-build';
import { expandVariants, normalizeText, wordKey } from './normalize';
import { NEW_WORDS_ID, type Category, type Word, type WordSource } from './types';

export interface Draft {
  hebrew: string;
  translit: string;
  arabic: string;
  /** the word's designated category – it is only unlocked once the word is learned */
  categoryId: string;
  source: WordSource;
}

export type DraftResult = { ok: true; word: Word } | { ok: false; error: string; existing?: Word };

/** Find an existing word that is the same word (same translit key + compatible meaning). */
export function findDuplicate(words: readonly Word[], translit: string, hebrew: string): Word | undefined {
  const keys = new Set(expandVariants(translit).map(wordKey));
  return words.find(
    (w) => expandVariants(w.translit).some((v) => keys.has(wordKey(v))) && meaningSimilarity(w.hebrew, hebrew) >= 0.34,
  );
}

/**
 * Turn a form / search result into a staged Word. New words ALWAYS start in the "new words"
 * bucket (staged = true) and unlock their designated category after a streak of 3.
 */
export function makeUserWord(d: Draft, words: readonly Word[], categories: readonly Category[]): DraftResult {
  const hebrew = d.hebrew.trim();
  const translit = d.translit.trim();
  const arabic = d.arabic.trim();
  if (!hebrew) return { ok: false, error: 'חסר פירוש בעברית' };
  if (!translit || !normalizeText(translit)) return { ok: false, error: 'חסר תעתיק' };
  if (hebrew.length > 120 || translit.length > 120 || arabic.length > 120) return { ok: false, error: 'הטקסט ארוך מדי' };
  if (d.categoryId === NEW_WORDS_ID || !categories.some((c) => c.id === d.categoryId)) {
    return { ok: false, error: 'יש לבחור קטגוריה' };
  }
  const existing = findDuplicate(words, translit, hebrew);
  if (existing) return { ok: false, error: 'המילה כבר קיימת', existing };
  const taken = new Set(words.map((w) => w.id));
  return {
    ok: true,
    word: {
      id: makeWordId(translit, hebrew, (id) => taken.has(id)),
      hebrew,
      translit,
      arabic,
      categoryId: d.categoryId,
      sentences: [],
      source: d.source,
      staged: true,
    },
  };
}

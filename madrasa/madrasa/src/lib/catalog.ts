import { NEW_WORDS_ID, type Category, type ProgressMap, type Word } from './types';
import { isLearned } from './srs';

/** Staged words live in the "new words" category until their streak unlocks the real one. */
export function effectiveCategoryId(word: Word, progress: ProgressMap): string {
  return word.staged && !isLearned(progress[word.id]) ? NEW_WORDS_ID : word.categoryId;
}

export interface CategoryView {
  id: string;
  name: string;
  group: string;
  wordIds: string[];
  /** words with learnedAt set */
  learned: number;
}

/**
 * Build the category list from the *unique* word list. Counts are always derived here,
 * never stored, so they cannot drift from what the game actually plays.
 */
export function buildCategoryViews(words: Word[], categories: Category[], progress: ProgressMap): CategoryView[] {
  const byId = new Map<string, CategoryView>();
  const ensure = (id: string, name = id, group = id) => {
    let v = byId.get(id);
    if (!v) byId.set(id, (v = { id, name, group, wordIds: [], learned: 0 }));
    return v;
  };
  for (const c of categories) ensure(c.id, c.name, c.group);
  const seen = new Set<string>();
  for (const w of words) {
    if (seen.has(w.id)) continue; // defensive: a word can only be counted once
    seen.add(w.id);
    const v = ensure(effectiveCategoryId(w, progress));
    v.wordIds.push(w.id);
    if (isLearned(progress[w.id])) v.learned++;
  }
  const staging = byId.get(NEW_WORDS_ID);
  const rest = [...byId.values()].filter((v) => v.id !== NEW_WORDS_ID && v.wordIds.length > 0);
  // the staging area is always shown first, even when empty
  return [staging ?? { id: NEW_WORDS_ID, name: NEW_WORDS_ID, group: NEW_WORDS_ID, wordIds: [], learned: 0 }, ...rest];
}

/** Merge bundled seed words with user-added ones; user words never override seed ids. */
export function mergeWords(seed: Word[], user: Word[]): Word[] {
  const map = new Map<string, Word>();
  for (const w of seed) map.set(w.id, w);
  for (const w of user) if (!map.has(w.id)) map.set(w.id, w);
  return [...map.values()];
}

import { LEARN_STREAK, type ProgressMap, type WordProgress } from './types';

const DAY = 24 * 60 * 60 * 1000;
/** Leitner boxes 1..5 -> how long until the word is due again */
export const BOX_INTERVAL_MS = [0, 10 * 60 * 1000, 1 * DAY, 3 * DAY, 7 * DAY, 21 * DAY];
export const MAX_BOX = 5;

export function newProgress(wordId: string, now = Date.now()): WordProgress {
  return { wordId, streak: 0, correct: 0, wrong: 0, box: 1, dueAt: now, lastSeen: 0, learnedAt: null };
}

export function isLearned(p?: WordProgress): boolean {
  return !!p && (p.learnedAt !== null || p.streak >= LEARN_STREAK);
}

/** Pure update: returns a new progress object. `correct` includes "close" typed answers. */
export function applyAnswer(prev: WordProgress | undefined, wordId: string, correct: boolean, now = Date.now()): WordProgress {
  const p = prev ?? newProgress(wordId, now);
  if (correct) {
    const streak = p.streak + 1;
    const box = Math.min(MAX_BOX, p.box + 1);
    return {
      ...p,
      streak,
      correct: p.correct + 1,
      box,
      dueAt: now + BOX_INTERVAL_MS[box],
      lastSeen: now,
      // unlock stays: once learned, a later slip does not push the word back into staging
      learnedAt: p.learnedAt ?? (streak >= LEARN_STREAK ? now : null),
    };
  }
  return { ...p, streak: 0, wrong: p.wrong + 1, box: 1, dueAt: now + BOX_INTERVAL_MS[1], lastSeen: now };
}

export function recordAnswer(map: ProgressMap, wordId: string, correct: boolean, now = Date.now()): ProgressMap {
  return { ...map, [wordId]: applyAnswer(map[wordId], wordId, correct, now) };
}

/** Lower = should be practised sooner. Unseen words come right after overdue ones. */
export function priority(p: WordProgress | undefined, now = Date.now()): number {
  if (!p || p.lastSeen === 0) return 0.5; // new
  if (p.dueAt <= now) return -1 + p.box / 10; // overdue, weakest box first
  return 1 + (p.dueAt - now) / DAY; // not due yet
}

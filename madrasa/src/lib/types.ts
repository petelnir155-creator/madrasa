export const NEW_WORDS_ID = 'מילים חדשות';
export const LESSON_FALLBACK_CATEGORY = 'משיעורים (ללא קטגוריה)';
/** consecutive correct answers needed before a staged word unlocks its real category */
export const LEARN_STREAK = 3;

export interface Sentence {
  /** full sentence in transcription */
  text: string;
  /** the word exactly as the lesson cell wrote it (may be an inflected form) */
  target: string;
  lesson?: number;
}

export type WordSource = 'seed' | 'admin' | 'search';

export interface Word {
  /** stable id = compact normalised transliteration (see wordKey) */
  id: string;
  hebrew: string;
  translit: string;
  arabic: string;
  /** designated category (a Category.id) */
  categoryId: string;
  sentences: Sentence[];
  source: WordSource;
  /** staged words sit in NEW_WORDS_ID until learned */
  staged: boolean;
}

export interface Category {
  id: string;
  name: string;
  /** text before ':' – used for grouping in the UI */
  group: string;
}

export interface WordProgress {
  wordId: string;
  streak: number;
  correct: number;
  wrong: number;
  /** Leitner box 1..5 */
  box: number;
  /** epoch ms when due again */
  dueAt: number;
  lastSeen: number;
  /** epoch ms when the streak first reached LEARN_STREAK (null = not yet) */
  learnedAt: number | null;
}

export type ProgressMap = Record<string, WordProgress>;

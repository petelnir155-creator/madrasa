import { blankAround, expandVariants, gradeTyped, locateInSentence, meaningKey, normalizeText, type GradeResult } from './normalize';
import { priority } from './srs';
import type { ProgressMap, Word } from './types';

export type RoundMode = 'mixed' | 'choice' | 'typing-h2t' | 'typing-t2h';

/** A validated, LLM-generated sentence for one word (see ai.ts). */
export interface AiSentence {
  /** text before the blank – any clitic prefix stays visible here ("בְּ") */
  before: string;
  /** the target word exactly as in the lexicon (this is what the correct button shows) */
  word: string;
  /** text after the blank */
  after: string;
  /** Hebrew translation of the whole sentence */
  hebrew: string;
}

export interface Option {
  wordId: string;
  label: string;
}

interface Base {
  id: string;
  wordId: string;
}

export interface SentenceQuestion extends Base {
  kind: 'choice';
  mode: 'sentence';
  before: string;
  after: string;
  hint: string;
  translation?: string;
  source: 'lesson' | 'ai';
  options: Option[];
  answerIndex: number;
}

export interface MeaningQuestion extends Base {
  kind: 'choice';
  mode: 'meaning';
  prompt: string;
  options: Option[];
  answerIndex: number;
}

export interface TypingQuestion extends Base {
  kind: 'typing';
  mode: 'h2t' | 't2h';
  prompt: string;
  expected: string;
  expectedKind: 'translit' | 'meaning';
}

export type Question = SentenceQuestion | MeaningQuestion | TypingQuestion;

export interface RoundConfig {
  size: number;
  mode: RoundMode;
}

export type Rng = () => number;

/** mulberry32 – tiny seedable PRNG so tests can be deterministic */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** One entry per word id – the game loop must never see a word twice. */
export function uniqueById(words: readonly Word[]): Word[] {
  const seen = new Set<string>();
  return words.filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true)));
}

/** Which words to practise: overdue first, then unseen, then the rest by weakest box. */
export function pickWords(pool: readonly Word[], progress: ProgressMap, size: number, now = Date.now(), rng: Rng = Math.random): Word[] {
  const ranked = shuffle(uniqueById(pool), rng).sort((a, b) => priority(progress[a.id], now) - priority(progress[b.id], now));
  return ranked.slice(0, size);
}

function sameWordish(a: Word, b: Word): boolean {
  const ta = expandVariants(a.translit).map(normalizeText);
  const tb = expandVariants(b.translit).map(normalizeText);
  return ta.some((x) => tb.includes(x)) || meaningKey(a.hebrew) === meaningKey(b.hebrew);
}

/** Three wrong answers that cannot be mistaken for the right one (no same word, no same meaning). */
export function pickDistractors(word: Word, near: readonly Word[], all: readonly Word[], n = 3, rng: Rng = Math.random): Word[] {
  const out: Word[] = [];
  const labels = new Set<string>([normalizeText(word.translit)]);
  for (const list of [shuffle(near, rng), shuffle(all, rng)]) {
    for (const c of list) {
      if (out.length >= n) return out;
      if (c.id === word.id || sameWordish(word, c)) continue;
      const lab = normalizeText(c.translit);
      if (labels.has(lab)) continue;
      labels.add(lab);
      out.push(c);
    }
  }
  return out;
}

function options(word: Word, distractors: Word[], rng: Rng) {
  const opts: Option[] = shuffle([word, ...distractors], rng).map((w) => ({ wordId: w.id, label: w.translit }));
  return { options: opts, answerIndex: opts.findIndex((o) => o.wordId === word.id) };
}

/** Try to build a fill-in-the-blank question from the word's lesson sentences (or a given AI one). */
export function sentenceQuestion(word: Word, distractors: Word[], rng: Rng, ai?: AiSentence, id = word.id): SentenceQuestion | null {
  const o = (extra: Omit<SentenceQuestion, 'id' | 'wordId' | 'kind' | 'mode' | 'options' | 'answerIndex' | 'hint'>): SentenceQuestion => ({
    id,
    wordId: word.id,
    kind: 'choice',
    mode: 'sentence',
    hint: word.hebrew,
    ...options(word, distractors, rng),
    ...extra,
  });

  if (ai) return o({ before: ai.before, after: ai.after, translation: ai.hebrew, source: 'ai' });

  const located = shuffle(word.sentences, rng)
    .map((s) => ({ s, m: locateInSentence(s.text, s.target) ?? locateInSentence(s.text, word.translit) }))
    // a sentence that is nothing but the word gives no context to guess from
    .find((x) => x.m && normalizeText(x.s.text.slice(0, x.m.baseStart) + x.s.text.slice(x.m.baseEnd)).length > 0);
  if (!located || !located.m) return null;
  // The blank covers only the base word: any attached prefix ("בְּ") or suffix stays visible in the
  // sentence, so the button can show the dictionary form without giving the answer away.
  const { before, after } = blankAround(located.s.text, located.m);
  return o({ before, after, source: 'lesson' });
}

export function meaningQuestion(word: Word, distractors: Word[], rng: Rng, id = word.id): MeaningQuestion {
  return { id, wordId: word.id, kind: 'choice', mode: 'meaning', prompt: word.hebrew, ...options(word, distractors, rng) };
}

export function typingQuestion(word: Word, mode: 'h2t' | 't2h', id = word.id): TypingQuestion {
  return mode === 'h2t'
    ? { id, wordId: word.id, kind: 'typing', mode, prompt: word.hebrew, expected: word.translit, expectedKind: 'translit' }
    : { id, wordId: word.id, kind: 'typing', mode, prompt: word.translit, expected: word.hebrew, expectedKind: 'meaning' };
}

export function buildQuestion(
  word: Word,
  pool: readonly Word[],
  all: readonly Word[],
  progress: ProgressMap,
  mode: RoundMode,
  rng: Rng = Math.random,
  ai?: AiSentence,
  index = 0,
): Question {
  const id = `${index}:${word.id}`;
  const distractors = () => pickDistractors(word, pool, all, 3, rng);
  const choice = (): Question => {
    if ((ai || word.sentences.length) && (ai || rng() < 0.65)) {
      const q = sentenceQuestion(word, distractors(), rng, ai, id);
      if (q) return q;
    }
    return meaningQuestion(word, distractors(), rng, id);
  };

  if (mode === 'choice') return choice();
  if (mode === 'typing-h2t') return typingQuestion(word, 'h2t', id);
  if (mode === 'typing-t2h') return typingQuestion(word, 't2h', id);

  // mixed: the stronger the word, the more active the recall
  const box = progress[word.id]?.box ?? 1;
  const seen = (progress[word.id]?.lastSeen ?? 0) > 0;
  if (!seen || box <= 1) return choice();
  if (box === 2) return rng() < 0.5 ? typingQuestion(word, 'h2t', id) : choice();
  return typingQuestion(word, rng() < 0.5 ? 'h2t' : 't2h', id);
}

export function buildRound(
  pool: readonly Word[],
  all: readonly Word[],
  progress: ProgressMap,
  cfg: RoundConfig,
  opts: { rng?: Rng; now?: number; ai?: Record<string, AiSentence>; picked?: readonly Word[] } = {},
): Question[] {
  const rng = opts.rng ?? Math.random;
  const words = opts.picked ?? pickWords(pool, progress, cfg.size, opts.now ?? Date.now(), rng);
  return shuffle(words, rng).map((w, i) => buildQuestion(w, pool, all, progress, cfg.mode, rng, opts.ai?.[w.id], i));
}

export interface Verdict {
  correct: boolean;
  grade: GradeResult | 'choice';
}

export function checkChoice(q: SentenceQuestion | MeaningQuestion, picked: number): Verdict {
  return { correct: picked === q.answerIndex, grade: 'choice' };
}

export function checkTyping(q: TypingQuestion, typed: string): Verdict {
  const grade = gradeTyped(typed, q.expected, q.expectedKind);
  return { correct: grade !== 'wrong', grade };
}

export interface RoundSummary {
  total: number;
  correct: number;
  mistakes: number;
  /** 100% score: every question answered, zero mistakes */
  perfect: boolean;
}

export function summarize(results: readonly boolean[], total: number): RoundSummary {
  const correct = results.filter(Boolean).length;
  const mistakes = results.length - correct;
  return { total, correct, mistakes, perfect: total > 0 && results.length === total && mistakes === 0 };
}

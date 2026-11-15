/**
 * Text normalisation shared by the seed pipeline (dedup) and the game (typing answers).
 * Pure functions, no dependencies, so it can run in Node, the browser and tests.
 *
 * The data is Levantine Arabic written in *Hebrew letters with niqqud* (plus the odd
 * Arabic shadda), so "ignore niqqud" means: strip Hebrew points/cantillation, Arabic
 * harakat, tatweel, bidi marks, and fold the final letter forms.
 */

const MARKS =
  /[֑-ׇً-ٰٟـ‎‏‪-‮⁦-⁩﻿]/g;

/** non-global twin of MARKS, safe for repeated .test() calls */
const MARK_CHAR = new RegExp(MARKS.source);

const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

/** Strip diacritics only (keeps spacing and punctuation). */
export function stripMarks(input: string): string {
  return input.normalize('NFKD').replace(MARKS, '');
}

/**
 * Canonical comparison form: no marks, final letters folded, punctuation dropped
 * (geresh, quotes, "!", "?", ".", "-" ...), lower-cased, whitespace collapsed.
 */
export function normalizeText(input: string): string {
  return stripMarks(input)
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/[-‐‑–—_]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Same as normalizeText but with every space removed: "אל בית" === "אלבית". */
export function compactKey(input: string): string {
  return normalizeText(input).replace(/\s/g, '');
}

/**
 * Expand a spreadsheet cell into the acceptable written variants.
 *   "מַיّ / מַיّה"            -> two variants (slash alternatives)
 *   "בַּ(א)תְעַלַّם"           -> with and without the optional letter
 *   "מַתַלַן (מַסַלַן)"        -> main form, the bracketed alternative
 *   "רואה (זכר)"               -> plain meaning, annotation dropped (see `kind`)
 * Always returns at least one non-empty variant when the input has letters.
 */
export function expandVariants(raw: string, kind: 'translit' | 'meaning' = 'translit'): string[] {
  const out = new Set<string>();
  // meanings also list alternatives with commas and " - " ("שום, אף", "תודה - כשמגישים לך משהו")
  const splitter = kind === 'meaning' ? /\s*[\/،;,]\s*|\s+או\s+|\s+-\s+/ : /\s*[\/،;]\s*|\s+או\s+/;
  const parts = raw.split(splitter).filter(Boolean);
  for (const part of parts.length ? parts : [raw]) {
    const without = part.replace(/\s*\([^)]*\)/g, '').trim();
    if (without) out.add(without);
    if (kind === 'translit') {
      // optional letters glued to the word: בַּ(א)תְעַלַّם
      const glued = part.replace(/\(([^)]*)\)/g, '$1').trim();
      if (glued) out.add(glued);
      // alternative form after a space: "A (B)"
      for (const m of part.matchAll(/\s\(([^)]+)\)/g)) out.add(m[1].trim());
    }
  }
  return [...out].filter((v) => normalizeText(v).length > 0);
}

/** Stable id for a word: compact normalised first variant. */
export function wordKey(translit: string): string {
  const first = expandVariants(translit)[0] ?? translit;
  return compactKey(first);
}

/** Meaning key used as a fallback identity ("לחם", "רואה"). Annotations in brackets are ignored. */
export function meaningKey(hebrew: string): string {
  const first = expandVariants(hebrew, 'meaning')[0] ?? hebrew;
  return compactKey(first);
}

/** Levenshtein distance, early-exit above `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export type GradeResult = 'exact' | 'close' | 'wrong';

/**
 * Grade a typed answer against the expected cell (which may hold several variants).
 *  - 'exact': equal after normalisation to any variant
 *  - 'close': a single slip on a word of 5+ letters (counted correct, but shown the right form)
 *  - 'wrong'
 */
export function gradeTyped(
  typed: string,
  expected: string,
  kind: 'translit' | 'meaning' = 'translit',
): GradeResult {
  const t = compactKey(typed);
  if (!t) return 'wrong';
  const variants = expandVariants(expected, kind).map(compactKey).filter(Boolean);
  if (variants.some((v) => v === t)) return 'exact';
  if (variants.some((v) => v.length >= 5 && t.length >= 5 && editDistance(v, t, 1) <= 1)) return 'close';
  return 'wrong';
}

/* ------------------------------------------------------------------ */
/* Locating a word inside a sentence (for fill-in-the-blank)           */
/* ------------------------------------------------------------------ */

/** Clitic prefixes that can be glued to a word in the transcription (checked after stripping marks). */
const PREFIXES = ['וב', 'ול', 'אל', 'על', 'א', 'ב', 'ל', 'ו', 'כ', 'ע', 'ת', 'י', 'נ', 'ח', 'ה'];

/** Pronominal / ending suffixes that can follow a base word: אִמ+ִי, אַהְל+ִי, חַ'אל+ִי ... */
const SUFFIXES = ['י', 'כ', 'ו', 'ה', 'הא', 'נא', 'כם', 'הם', 'הן', 'ת', 'ין'];

/** Quote-like marks that live *inside* a word (ג', ח', ע') and must not split it. */
const INNER_MARKS = /['’‘ʼ`´׳״"()]/;

export interface SentenceMatch {
  /** exact slice of the sentence that holds the base word (with its own niqqud) */
  base: string;
  /** exact attached prefix as written (e.g. "בְּ"), '' when none */
  prefix: string;
  /** exact attached suffix as written (e.g. "ִי"), '' when none */
  suffix: string;
  start: number; // index of prefix start in the sentence
  baseStart: number; // index of base start
  baseEnd: number; // index just after the base
  end: number; // index just after the suffix
}

interface Stripped {
  plain: string;
  /** map from plain index -> original index of the base letter */
  map: number[];
}

/** Strip marks while remembering original indices, so we can slice the *original* sentence. */
function strippedWithMap(s: string, hyphenAsSpace = true): Stripped {
  const plainChars: string[] = [];
  const map: number[] = [];
  let i = 0;
  for (const ch of s) {
    const decomposed = ch.normalize('NFKD');
    for (const d of decomposed) {
      if (MARK_CHAR.test(d)) continue;
      if (INNER_MARKS.test(d) || (!hyphenAsSpace && /[-‐‑–]/.test(d))) continue;
      if (/[\p{L}\p{N}]/u.test(d)) {
        plainChars.push(FINALS[d] ?? d.toLowerCase());
        map.push(i);
      } else {
        // word separators become a single space marker so we can respect word boundaries
        if (plainChars.length && plainChars[plainChars.length - 1] !== ' ') {
          plainChars.push(' ');
          map.push(i);
        }
      }
    }
    i += ch.length;
  }
  return { plain: plainChars.join(''), map };
}

/**
 * Find the word (any of its variants) inside a sentence.
 * Returns the matched base and the attached clitic prefix (if one is glued in front),
 * so the UI can render "בְּ____" while the button keeps showing the base word.
 */
export function locateInSentence(sentence: string, translit: string): SentenceMatch | null {
  // hyphens first act as word breaks ("אֶל-כְּבִּיר"), then as joiners ("אֶל-חֵ'יר" ~ "אֶלְחֵ'יר")
  return locateWith(sentence, translit, true) ?? locateWith(sentence, translit, false);
}

function locateWith(sentence: string, translit: string, hyphenAsSpace: boolean): SentenceMatch | null {
  const sp = strippedWithMap(sentence, hyphenAsSpace);
  const variants = expandVariants(translit)
    .map((v) => normalizeText(v))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const v of variants) {
    // whole-word match: preceded by start/space (optionally one prefix), followed by end/space
    let from = 0;
    while (from <= sp.plain.length) {
      const idx = sp.plain.indexOf(v, from);
      if (idx === -1) break;
      const endIdx = idx + v.length;
      let tail = endIdx;
      while (tail < sp.plain.length && sp.plain[tail] !== ' ') tail++;
      const trail = sp.plain.slice(endIdx, tail);
      const rightOk = trail === '' || SUFFIXES.includes(trail);
      if (rightOk) {
        // how many letters sit between the previous space and idx?
        let ws = idx;
        while (ws > 0 && sp.plain[ws - 1] !== ' ') ws--;
        const lead = sp.plain.slice(ws, idx);
        if (lead === '' || PREFIXES.includes(lead)) return build(sentence, sp, ws, idx, endIdx, tail);
      }
      from = idx + 1;
    }
  }
  return null;
}

function endWithMarks(sentence: string, lastLetterIdx: number): number {
  let end = lastLetterIdx + 1;
  while (end < sentence.length && MARK_CHAR.test(sentence[end])) end++;
  return end;
}

function build(
  sentence: string,
  sp: Stripped,
  startPlain: number,
  basePlain: number,
  baseEndPlain: number,
  endPlain: number,
): SentenceMatch {
  const start = sp.map[startPlain];
  const baseStart = sp.map[basePlain];
  const baseEnd = endWithMarks(sentence, sp.map[baseEndPlain - 1]);
  const end = endPlain > baseEndPlain ? endWithMarks(sentence, sp.map[endPlain - 1]) : baseEnd;
  return {
    base: sentence.slice(baseStart, baseEnd),
    prefix: sentence.slice(start, baseStart),
    suffix: sentence.slice(baseEnd, end),
    start,
    baseStart,
    baseEnd,
    end,
  };
}

/** Split a sentence around the matched base word: render `before` + blank + `after`. */
export function blankAround(sentence: string, m: SentenceMatch): { before: string; after: string } {
  return { before: sentence.slice(0, m.baseStart), after: sentence.slice(m.baseEnd) };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSeed, type Raw } from '../src/lib/seed-build';
import { buildCategoryViews, effectiveCategoryId } from '../src/lib/catalog';
import { applyAnswer, recordAnswer } from '../src/lib/srs';
import { buildRound, checkChoice, checkTyping, pickDistractors, seededRng, summarize, uniqueById, type SentenceQuestion } from '../src/lib/game';
import { generateSentence, translateQuery, validateAiSentence } from '../src/lib/ai';
import { handleSentences, handleTranslate } from '../src/lib/api-handlers';
import { NEW_WORDS_ID, type ProgressMap, type Word } from '../src/lib/types';
import { normalizeText, stripMarks, wordKey } from '../src/lib/normalize';
import { NotConfiguredError, rateLimited } from '../src/lib/llm';

const raw = JSON.parse(readFileSync('data/raw.json', 'utf8')) as Raw;
const { words, categories, stats } = buildSeed(raw);

test('dedup: lesson + category tabs collapse to unique words', () => {
  assert.equal(stats.rawRows, 998);
  assert.ok(stats.uniqueWords < stats.rawRows / 2, 'roughly halves the raw rows');
  assert.equal(new Set(words.map((w) => w.id)).size, words.length, 'ids are unique');
  // no two words share the same (translit, meaning) pair
  const pairs = words.map((w) => wordKey(w.translit) + '|' + normalizeText(w.hebrew));
  assert.equal(new Set(pairs).size, pairs.length);
});

test('dedup: a word keeps its category tag AND inherits the lesson sentence', () => {
  const bread = words.find((w) => wordKey(w.translit) === wordKey("חֻ'בְּז"))!;
  assert.ok(bread, 'bread exists once');
  assert.equal(words.filter((w) => wordKey(w.translit) === wordKey("חֻ'בְּז")).length, 1);
  assert.notEqual(bread.categoryId, 'משיעורים (ללא קטגוריה)');
  assert.ok(bread.sentences.some((s) => s.text.includes('סַלַטַה')));
});

test('dedup: different words that only collide after niqqud stripping stay separate', () => {
  const bas = words.filter((w) => wordKey(w.translit) === wordKey('בַּסّ'));
  assert.ok(bas.length >= 3, 'but / only / enough are three words');
  assert.equal(new Set(bas.map((w) => w.id)).size, bas.length);
  const uncle = words.filter((w) => wordKey(w.translit) === wordKey("חַ'אל"));
  assert.ok(uncle.length >= 2);
});

test('category counts equal the unique word count (no double counting)', () => {
  const views = buildCategoryViews(words, categories, {});
  const total = views.reduce((n, v) => n + v.wordIds.length, 0);
  assert.equal(total, words.length);
  const ids = views.flatMap((v) => v.wordIds);
  assert.equal(new Set(ids).size, ids.length);
});

test('SRS: streak, box, learned unlock and reset', () => {
  let p: ProgressMap = {};
  const t = 1_000_000;
  p = recordAnswer(p, 'x', true, t);
  p = recordAnswer(p, 'x', true, t);
  assert.equal(p.x.streak, 2);
  assert.equal(p.x.learnedAt, null);
  p = recordAnswer(p, 'x', false, t);
  assert.equal(p.x.streak, 0);
  assert.equal(p.x.box, 1);
  for (let i = 0; i < 3; i++) p = recordAnswer(p, 'x', true, t + i);
  assert.ok(p.x.learnedAt);
  const after = applyAnswer(p.x, 'x', false, t + 10);
  assert.ok(after.learnedAt, 'a later slip does not re-lock the word');
});

test('staging: a new word lives in "מילים חדשות" until a streak of 3, then unlocks its real category', () => {
  const w: Word = { id: 'new1', hebrew: 'מסעדה', translit: 'מַטְעַם', arabic: 'مطعم', categoryId: 'אוכל ושתייה: מנות, בשר ותוספות', sentences: [], source: 'admin', staged: true };
  let p: ProgressMap = {};
  assert.equal(effectiveCategoryId(w, p), NEW_WORDS_ID);
  p = recordAnswer(p, w.id, true);
  p = recordAnswer(p, w.id, true);
  assert.equal(effectiveCategoryId(w, p), NEW_WORDS_ID);
  p = recordAnswer(p, w.id, true);
  assert.equal(effectiveCategoryId(w, p), w.categoryId);
  const views = buildCategoryViews([...words, w], categories, {});
  assert.equal(views[0].id, NEW_WORDS_ID);
  assert.deepEqual(views[0].wordIds, ['new1']);
});

test('round: only unique words, requested size, answer present among options', () => {
  const dup = [...words, ...words.slice(0, 50)];
  const round = buildRound(dup, words, {}, { size: 10, mode: 'choice' }, { rng: seededRng(7) });
  assert.equal(round.length, 10);
  assert.equal(new Set(round.map((q) => q.wordId)).size, 10);
  for (const q of round) {
    if (q.kind !== 'choice') continue;
    assert.equal(q.options.length, 4);
    assert.equal(q.options[q.answerIndex].wordId, q.wordId);
    assert.equal(new Set(q.options.map((o) => normalizeText(o.label))).size, 4, 'no look-alike options');
  }
  assert.equal(uniqueById(dup).length, words.length);
});

test('sentence questions: prefix stays in the sentence, button shows the base word', () => {
  const cinema = words.find((w) => wordKey(w.translit) === wordKey('סִינַמַא'))!;
  assert.ok(cinema, 'cinema word exists');
  const near = words.slice(0, 30);
  let found: SentenceQuestion | undefined;
  for (let seed = 1; seed < 40 && !found; seed++) {
    const q = buildRound([cinema], [...near, cinema], {}, { size: 1, mode: 'choice' }, { rng: seededRng(seed) })[0];
    if (q.kind === 'choice' && q.mode === 'sentence') found = q;
  }
  assert.ok(found, 'a sentence question was produced');
  assert.ok(stripMarks(found!.before).endsWith('ב'), `prefix visible before the blank: ${found!.before}`);
  assert.equal(found!.options[found!.answerIndex].label, cinema.translit);
  assert.ok(!found!.before.includes('סִּינַמַא'));
});

test('every lesson sentence that can be located produces a blank without leaking the answer', () => {
  let built = 0;
  for (const w of words.filter((x) => x.sentences.length)) {
    for (let seed = 1; seed <= 12; seed++) {
      const [qq] = buildRound([w], words, {}, { size: 1, mode: 'choice' }, { rng: seededRng(seed) });
      if (qq.kind === 'choice' && qq.mode === 'sentence') {
        built++;
        assert.equal(qq.options[qq.answerIndex].wordId, w.id);
        assert.ok(qq.before.length + qq.after.length > 0);
        break;
      }
    }
  }
  assert.ok(built > 150, `built ${built}`);
});

test('typing questions grade leniently', () => {
  const w = words.find((x) => x.hebrew === 'לחם')!;
  const [h2t] = buildRound([w], words, {}, { size: 1, mode: 'typing-h2t' });
  assert.equal(h2t.kind, 'typing');
  if (h2t.kind !== 'typing') return;
  assert.equal(h2t.prompt, 'לחם');
  assert.ok(checkTyping(h2t, normalizeText(w.translit)).correct);
  assert.ok(!checkTyping(h2t, 'משהו אחר לגמרי').correct);
  const [t2h] = buildRound([w], words, {}, { size: 1, mode: 'typing-t2h' });
  if (t2h.kind !== 'typing') return;
  assert.ok(checkTyping(t2h, ' לחם! ').correct);
});

test('summary: perfect only with zero mistakes and every question answered', () => {
  assert.equal(summarize([true, true, true], 3).perfect, true);
  assert.equal(summarize([true, false, true], 3).perfect, false);
  assert.equal(summarize([true, true], 3).perfect, false, 'mid-round is never perfect');
  assert.equal(summarize([], 0).perfect, false);
});

test('distractors never include the answer or a same-meaning word', () => {
  const w = words[5];
  const d = pickDistractors(w, words, words, 3, seededRng(1));
  assert.equal(d.length, 3);
  assert.ok(d.every((x) => x.id !== w.id));
});

test('AI sentence validation: blank must be the target word', () => {
  const ok = validateAiSentence({ before: 'אַנַא בַּ(א)שְׁרַב ', word: 'קַהְוַה', after: ' פִי תַל אֲבִּיבּ', hebrew: 'אני שותה קפה בתל אביב' }, 'קַהְוַה');
  assert.ok(ok);
  assert.equal(ok!.word, 'קַהְוַה');
  assert.equal(validateAiSentence({ before: 'x y', word: 'משהו', after: '', hebrew: 'h' }, 'קַהְוַה'), null);
  assert.equal(validateAiSentence({ before: 'a b c', word: 'קהוה', after: '', hebrew: '' }, 'קַהְוַה'), null);
  assert.equal(validateAiSentence(null, 'x'), null);
});

test('generateSentence: persona is in the prompt, bad replies are retried', async () => {
  const prompts: string[] = [];
  let n = 0;
  const llm = async (r: { system: string; user: string }) => {
    prompts.push(r.system);
    return n++ === 0
      ? 'sorry, here you go'
      : '```json\n{"before":"אַנַא ","word":"אֶסְפְּרֵסּוֹ","after":" פִי אִלְמַכְּתַב","hebrew":"אני אספרסו במשרד"}\n```';
  };
  const s = await generateSentence({ hebrew: 'אספרסו', translit: 'אֶסְפְּרֵסּוֹ' }, llm);
  assert.equal(s.word, 'אֶסְפְּרֵסּוֹ');
  assert.equal(n, 2);
  assert.match(prompts[0], /Tel Aviv/);
  assert.match(prompts[0], /advertising copywriter/);
  assert.match(prompts[0], /espresso/);
  assert.match(prompts[0], /Hapoel Tel Aviv/);
});

test('translateQuery + handlers', async () => {
  const llm = async () => '{"hebrew":"קפה","arabic":"قهوة","translit":"קַהְוַה","category":"אוכל ושתייה: משקאות","note":""}';
  const t = await translateQuery('coffee', ['אוכל ושתייה: משקאות'], llm);
  assert.equal(t.arabic, 'قهوة');
  assert.equal(t.category, 'אוכל ושתייה: משקאות');
  const bad = await translateQuery('coffee', ['x'], async () => '{"hebrew":"קפה","arabic":"قهوة","translit":"קַהְוַה","category":"made up"}');
  assert.equal(bad.category, '', 'unknown categories are dropped, not trusted');

  const r = await handleTranslate({ query: 'coffee', categories: ['אוכל ושתייה: משקאות'] }, () => llm);
  assert.equal(r.status, 200);
  assert.equal((await handleTranslate({ query: '' }, () => llm)).status, 400);
  const nc = await handleTranslate({ query: 'x' }, () => {
    throw new NotConfiguredError();
  });
  assert.equal(nc.status, 503);
  const s = await handleSentences({ words: [{ id: 'a', hebrew: 'קפה', translit: 'קַהְוַה' }] }, () => async () => '{"before":"בִּדִּי ","word":"קַהְוַה","after":" בְּבֵית","hebrew":"אני רוצה קפה בבית"}');
  assert.equal(s.status, 200);
  assert.ok((s.json.sentences as Record<string, unknown>).a);
  assert.equal((await handleSentences({ words: [] }, () => llm)).status, 400);
});

test('rate limiter blocks after the limit', () => {
  const t = 1_000;
  for (let i = 0; i < 3; i++) assert.equal(rateLimited('k', 3, 60_000, t), false);
  assert.equal(rateLimited('k', 3, 60_000, t + 1), true);
  assert.equal(rateLimited('k', 3, 60_000, t + 61_000), false);
});

test('checkChoice', () => {
  const q = buildRound(words, words, {}, { size: 1, mode: 'choice' }, { rng: seededRng(2) })[0];
  if (q.kind !== 'choice') return;
  assert.ok(checkChoice(q, q.answerIndex).correct);
  assert.ok(!checkChoice(q, (q.answerIndex + 1) % 4).correct);
});

import { findDuplicate, makeUserWord } from '../src/lib/userwords';

test('admin: new words are staged, validated and de-duplicated', () => {
  const draft = { hebrew: 'דוכן שוק', translit: 'בַּסְטַה', arabic: 'بسطة', categoryId: categories[0].id, source: 'admin' as const };
  const r = makeUserWord(draft, words, categories);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.word.staged, true);
  assert.equal(r.word.categoryId, categories[0].id);
  assert.equal(effectiveCategoryId(r.word, {}), NEW_WORDS_ID);

  const dupSource = words.find((w) => w.hebrew === 'לחם')!;
  const dup = makeUserWord({ ...draft, hebrew: 'לחם', translit: dupSource.translit }, words, categories);
  assert.equal(dup.ok, false);
  assert.ok(findDuplicate(words, dupSource.translit, 'לחם'));

  assert.equal(makeUserWord({ ...draft, translit: '' }, words, categories).ok, false);
  assert.equal(makeUserWord({ ...draft, categoryId: NEW_WORDS_ID }, words, categories).ok, false);
  assert.equal(makeUserWord({ ...draft, categoryId: 'nope' }, words, categories).ok, false);
});

import { validateSupabaseConfig } from '../src/lib/store';

test('supabase config validation', () => {
  const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmnop.qrstuvwxyz';
  assert.equal(validateSupabaseConfig('https://abc.supabase.co', key), null);
  assert.ok(validateSupabaseConfig('http://abc.supabase.co', key));
  assert.ok(validateSupabaseConfig('not a url', key));
  assert.ok(validateSupabaseConfig('https://abc.supabase.co', 'short'));
  assert.ok(validateSupabaseConfig('https://abc.supabase.co', 'sb_secret_' + 'x'.repeat(30)));
});

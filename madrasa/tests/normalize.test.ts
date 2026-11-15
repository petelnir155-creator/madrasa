import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankAround, compactKey, expandVariants, gradeTyped, locateInSentence, normalizeText, wordKey } from '../src/lib/normalize';

test('normalizeText ignores niqqud, spaces, punctuation, final letters', () => {
  assert.equal(normalizeText("חֻ'בְּז"), 'חבז');
  assert.equal(normalizeText('  סַאכֵּן!  '), normalizeText('סאכן'));
  assert.equal(normalizeText('מַיّ'), 'מי');
  assert.equal(compactKey('אֶל-בֵּית'), compactKey('אל בית'));
  assert.equal(compactKey('אִנְתֵ?'), compactKey('אנתה').slice(0, 3));
});

test('shadda typo and sofit variants share a key', () => {
  assert.equal(wordKey('סֻכַّר'), wordKey('סֻכַּר'));
  assert.equal(wordKey('סַאכֵּן'), wordKey('סאכן'));
  assert.equal(normalizeText('אַמֵירְכַּא'), normalizeText('אמירכא'));
});

test('expandVariants handles slashes, optional letters and alternatives', () => {
  assert.deepEqual(expandVariants('מַיّ / מַיّה').map(normalizeText), ['מי', 'מיה']);
  const optional = expandVariants('בַּ(א)תְעַלַּם').map(normalizeText);
  assert.ok(optional.includes(normalizeText('בתעלם')) && optional.includes(normalizeText('באתעלם')));
  const alt = expandVariants('מַתַלַן (מַסַלַן)').map(normalizeText);
  assert.ok(alt.includes(normalizeText('מתלן')) && alt.includes(normalizeText('מסלן')));
  assert.deepEqual(expandVariants('שום, אף', 'meaning'), ['שום', 'אף']);
});

test('gradeTyped: lenient on niqqud/spaces/punctuation, strict on wrong words', () => {
  assert.equal(gradeTyped('חבז', "חֻ'בְּז"), 'exact');
  assert.equal(gradeTyped("  חֻ'בְּז  ", "חֻ'בְּז"), 'exact');
  assert.equal(gradeTyped('סאכן', 'סַאכֵּן'), 'exact');
  assert.equal(gradeTyped('מיה', 'מַיّ / מַיّה'), 'exact');
  assert.equal(gradeTyped('לחם', 'לחם', 'meaning'), 'exact');
  assert.equal(gradeTyped('גדול!', 'גדול', 'meaning'), 'exact');
  assert.equal(gradeTyped('שום', 'שום, אף', 'meaning'), 'exact');
  assert.equal(gradeTyped('אל בית', 'אֶל-בֵּית'), 'exact');
  assert.equal(gradeTyped('', 'לחם', 'meaning'), 'wrong');
  assert.equal(gradeTyped('חלב', 'לחם', 'meaning'), 'wrong');
  assert.equal(gradeTyped('אנא', 'אִנְתֵ'), 'wrong');
});

test('gradeTyped: one slip on a long word is "close" (still correct), short words stay strict', () => {
  assert.equal(gradeTyped('סאמעת', 'סַאמְעַאת'), 'close');
  assert.equal(gradeTyped('שב', 'שם'), 'wrong');
});

test('locateInSentence: plain word, prefix kept visible', () => {
  const s = "בִּדִּי סַלַטַה מַע חֻ'בְּז";
  const m = locateInSentence(s, "חֻ'בְּז")!;
  assert.equal(m.base, "חֻ'בְּז");
  assert.equal(m.prefix, '');

  const s2 = 'אַנַא שַׁאיִף פִילְם בַּסִּינַמַא';
  const m2 = locateInSentence(s2, 'סִינַמַא')!;
  assert.equal(m2.prefix, 'בַּ');
  assert.equal(m2.base, 'סִּינַמַא');
  const { before, after } = blankAround(s2, m2);
  assert.equal(before, 'אַנַא שַׁאיִף פִילְם בַּ'); // the prefix stays visible: בַּ____
  assert.equal(after, '');
});

test('locateInSentence: suffix and hyphen cases, no false hit inside a longer word', () => {
  const m = locateInSentence('אִמִּי סַאכְּנֵה פִי אריאל', 'אִם')!;
  assert.equal(m.suffix, 'י');
  assert.equal(m.base, 'אִמִּ');
  assert.equal(locateInSentence('אַנַא רַאיֵח', 'אַנ'), null);
  const hy = locateInSentence('אַנַא רַאיֵח עַ-ל-עַ\'דַא', "עַ'דַא")!;
  assert.equal(hy.base, "עַ'דַא");
});

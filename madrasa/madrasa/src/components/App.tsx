'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import seedData from '@/data/seed.json';
import { buildCategoryViews, mergeWords } from '@/lib/catalog';
import { buildRound, pickWords, type AiSentence, type Question, type RoundMode, type RoundSummary } from '@/lib/game';
import { isLearned, recordAnswer } from '@/lib/srs';
import { createStore, LocalStore, type Store } from '@/lib/store';
import { makeUserWord } from '@/lib/userwords';
import { NEW_WORDS_ID, type Category, type ProgressMap, type Word, type WordSource } from '@/lib/types';
import { Admin } from './Admin';
import { CategoryGroups } from './CategoryGroups';
import { LayoutGrid, Loader, Lock, Play, Sparkles, ShieldCheck, BookOpen, Keyboard, ListChecks, Clock } from './icons';
import { Results } from './Results';
import { Round } from './Round';
import { SearchBar, type AddResult } from './Search';

const seed = seedData as unknown as { words: Word[]; categories: Category[] };

type View = 'home' | 'round' | 'results' | 'admin';

const MODES: { id: RoundMode; label: string; Icon: typeof ListChecks }[] = [
  { id: 'mixed', label: 'מעורב', Icon: LayoutGrid },
  { id: 'choice', label: 'בחירה מרובה', Icon: ListChecks },
  { id: 'typing-h2t', label: 'עברית לתעתיק', Icon: Keyboard },
  { id: 'typing-t2h', label: 'תעתיק לעברית', Icon: Keyboard },
];

interface RoundState {
  questions: Question[];
  pool: Word[];
  label: string;
}

async function fetchAiSentences(words: Word[]): Promise<{ map: Record<string, AiSentence>; notice?: string }> {
  const map: Record<string, AiSentence> = {};
  try {
    for (let i = 0; i < words.length; i += 10) {
      const chunk = words.slice(i, i + 10).map((w) => ({ id: w.id, hebrew: w.hebrew, translit: w.translit, arabic: w.arabic }));
      const res = await fetch('/api/sentence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ words: chunk }),
        signal: AbortSignal.timeout(25_000),
      });
      if (res.status === 503) return { map, notice: 'משפטי AI כבויים: לא הוגדר מפתח API בשרת. ממשיכים עם משפטי השיעורים.' };
      if (!res.ok) return { map, notice: 'לא הצלחנו ליצור משפטי AI. ממשיכים עם משפטי השיעורים.' };
      const data = (await res.json()) as { sentences?: Record<string, AiSentence> };
      Object.assign(map, data.sentences ?? {});
    }
    return { map };
  } catch {
    return { map, notice: 'משפטי AI לא זמינים כרגע. ממשיכים עם משפטי השיעורים.' };
  }
}

export function App() {
  const [ready, setReady] = useState(false);
  const [store, setStore] = useState<Store | null>(null);
  const [words, setWords] = useState<Word[]>(seed.words);
  const [categories, setCategories] = useState<Category[]>(seed.categories);
  const [progress, setProgress] = useState<ProgressMap>({});
  const progressRef = useRef<ProgressMap>({});
  const [view, setView] = useState<View>('home');
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState<RoundMode>('mixed');
  const [size, setSize] = useState(10);
  const [useAi, setUseAi] = useState(false);
  const [starting, setStarting] = useState(false);
  const [round, setRound] = useState<RoundState | null>(null);
  const [summary, setSummary] = useState<RoundSummary | null>(null);
  const [mistakeIds, setMistakeIds] = useState<string[]>([]);

  useEffect(() => {
    let off = false;
    (async () => {
      let s: Store;
      let d;
      try {
        s = await createStore();
        d = await s.load();
      } catch (e) {
        console.error(e);
        s = new LocalStore();
        d = await s.load();
        const why = e instanceof Error ? e.message : String(e);
        if (!off) setNotice(`החיבור ל-Supabase נכשל (${why}). עובדים מקומית. אפשר להזין מפתחות במסך הניהול ולבדוק חיבור.`);
      }
      if (off) return;
      setStore(s);
      if (d.db) {
        setWords(d.db.words);
        setCategories(d.db.categories);
      } else {
        setWords(mergeWords(seed.words, d.userWords));
      }
      progressRef.current = d.progress;
      setProgress(d.progress);
      setReady(true);
    })();
    return () => {
      off = true;
    };
  }, []);

  const wordsById = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);
  const userWords = useMemo(() => words.filter((w) => w.source !== 'seed'), [words]);
  const views = useMemo(() => buildCategoryViews(words, categories, progress), [words, categories, progress]);
  const allCategories = useMemo(() => [{ id: NEW_WORDS_ID, name: NEW_WORDS_ID, group: NEW_WORDS_ID }, ...categories], [categories]);
  const learnedCount = useMemo(() => words.filter((w) => isLearned(progress[w.id])).length, [words, progress]);
  const dueCount = useMemo(() => {
    const now = Date.now();
    return Object.values(progress).filter((p) => p.lastSeen > 0 && p.dueAt <= now).length;
  }, [progress]);

  const onAnswer = useCallback(
    (wordId: string, correct: boolean) => {
      const next = recordAnswer(progressRef.current, wordId, correct);
      progressRef.current = next;
      setProgress(next);
      store?.saveProgress(next[wordId], next).catch((e) => console.error('save progress failed', e));
    },
    [store],
  );

  const addWord = useCallback(
    async (d: { hebrew: string; translit: string; arabic: string; categoryId: string }, source: WordSource): Promise<AddResult> => {
      const res = makeUserWord({ ...d, source }, words, categories);
      if (!res.ok) return { ok: false, error: res.error };
      try {
        const saved = await (store ?? new LocalStore()).addWord(res.word);
        setWords((w) => [...w, saved]);
        return { ok: true };
      } catch (e) {
        console.error(e);
        return { ok: false, error: 'השמירה נכשלה' };
      }
    },
    [store, words, categories],
  );

  const removeWord = useCallback(
    async (id: string) => {
      await store?.removeWord(id);
      setWords((w) => w.filter((x) => x.id !== id));
      const { [id]: _gone, ...rest } = progressRef.current;
      progressRef.current = rest;
      setProgress(rest);
    },
    [store],
  );

  const startRound = useCallback(
    async (pool: Word[], label: string) => {
      if (!pool.length) {
        setNotice('אין מילים בקטגוריה הזו עדיין.');
        return;
      }
      setNotice('');
      setStarting(true);
      const picked = pickWords(pool, progressRef.current, size);
      let ai: Record<string, AiSentence> = {};
      if (useAi && (mode === 'mixed' || mode === 'choice')) {
        const r = await fetchAiSentences(picked);
        ai = r.map;
        if (r.notice) setNotice(r.notice);
      }
      const questions = buildRound(pool, words, progressRef.current, { size, mode }, { ai, picked });
      setRound({ questions, pool, label });
      setSummary(null);
      setView('round');
      setStarting(false);
    },
    [mode, size, useAi, words],
  );

  const grouped = useMemo(() => {
    const m = new Map<string, typeof views>();
    for (const v of views) {
      if (v.id === NEW_WORDS_ID) continue;
      (m.get(v.group) ?? m.set(v.group, []).get(v.group)!).push(v);
    }
    return [...m.entries()];
  }, [views]);

  if (!ready) {
    return (
      <main className="shell center">
        <Loader className="spin" size={32} />
      </main>
    );
  }

  const staging = views.find((v) => v.id === NEW_WORDS_ID)!;
  const poolOf = (ids: string[]) => ids.map((id) => wordsById.get(id)!).filter(Boolean);

  return (
    <main className="shell">
      <header className="top">
        <h1>
          <BookOpen /> הערבית המדוברת של ניר
        </h1>
        <nav className="tabs" aria-label="ניווט">
          <button className={`tab ${view === 'home' || view === 'round' || view === 'results' ? 'active' : ''}`} onClick={() => setView('home')} data-testid="nav-home">
            <LayoutGrid /> תרגול
          </button>
          <button className={`tab ${view === 'admin' ? 'active' : ''}`} onClick={() => setView('admin')} data-testid="nav-admin">
            <ShieldCheck /> ניהול
          </button>
        </nav>
      </header>

      {view !== 'round' && <SearchBar words={words} categories={allCategories} onAdd={(d, s) => addWord(d, s)} />}

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      {view === 'home' && (
        <>
          <div className="stats" data-testid="stats">
            <div className="stat">
              <strong data-testid="word-count">{words.length}</strong>
              <span>מילים ייחודיות</span>
            </div>
            <div className="stat">
              <strong>{learnedCount}</strong>
              <span>נלמדו</span>
            </div>
            <div className="stat">
              <strong>{dueCount}</strong>
              <span>לחזרה</span>
            </div>
          </div>

          <div className="card setup">
            <div className="chips" role="radiogroup" aria-label="מצב משחק">
              {MODES.map(({ id, label, Icon }) => (
                <button key={id} role="radio" aria-checked={mode === id} className={`chip-btn ${mode === id ? 'on' : ''}`} onClick={() => setMode(id)} data-testid={`mode-${id}`}>
                  <Icon /> {label}
                </button>
              ))}
            </div>
            <div className="setup-row">
              <label className="inline">
                שאלות בסבב
                <select value={size} onChange={(e) => setSize(Number(e.target.value))} data-testid="size">
                  {[5, 10, 15, 20].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`toggle ${mode === 'typing-h2t' || mode === 'typing-t2h' ? 'disabled' : ''}`}>
                <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} disabled={mode === 'typing-h2t' || mode === 'typing-t2h'} data-testid="ai-toggle" />
                <Sparkles /> משפטי AI מותאמים אישית
              </label>
            </div>
            <button className="btn primary big" disabled={starting} onClick={() => startRound(words, 'חזרה חכמה')} data-testid="smart-review">
              {starting ? <Loader className="spin" /> : <Play />} חזרה חכמה
              <span className="sub">
                <Clock /> מילים לחזרה ומילים חדשות מכל הקטגוריות
              </span>
            </button>
          </div>

          <button className="card cat staging" onClick={() => startRound(poolOf(staging.wordIds), NEW_WORDS_ID)} disabled={starting} data-testid="cat-new-words">
            <div className="cat-title">
              <Lock /> {NEW_WORDS_ID}
            </div>
            <div className="muted small">{staging.wordIds.length} מילים · נפתחות לקטגוריה שלהן אחרי 3 תשובות נכונות ברצף</div>
          </button>

          <CategoryGroups groups={grouped} disabled={starting} onStart={(v) => startRound(poolOf(v.wordIds), v.name)} />
        </>
      )}

      {view === 'round' && round && (
        <Round
          key={round.questions.map((q) => q.id).join('|')}
          questions={round.questions}
          wordsById={wordsById}
          onAnswer={onAnswer}
          onFinish={(s, ids) => {
            setSummary(s);
            setMistakeIds(ids);
            setView('results');
          }}
          onExit={() => setView('home')}
        />
      )}

      {view === 'results' && summary && round && (
        <Results
          summary={summary}
          mistakes={mistakeIds.map((id) => wordsById.get(id)).filter((w): w is Word => !!w)}
          onAgain={() => startRound(round.pool, round.label)}
          onHome={() => setView('home')}
        />
      )}

      {view === 'admin' && <Admin storeKind={store?.kind ?? 'local'} categories={allCategories} userWords={userWords} progress={progress} onAdd={(d, s) => addWord(d, s as 'admin')} onRemove={removeWord} />}
    </main>
  );
}

'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { checkChoice, checkTyping, summarize, type Question, type RoundSummary, type Verdict } from '@/lib/game';
import type { Word } from '@/lib/types';
import { ArrowLeft, Check, Keyboard, ListChecks, Sparkles, X } from './icons';

interface Props {
  questions: Question[];
  wordsById: Map<string, Word>;
  onAnswer: (wordId: string, correct: boolean) => void;
  onFinish: (summary: RoundSummary, mistakeWordIds: string[]) => void;
  onExit: () => void;
}

type OptState = 'idle' | 'correct' | 'wrong' | 'dim';

/** physical feedback: wrong = quick horizontal shake, right = scale-up with a green glow */
const feedbackVariants = {
  idle: { x: 0, scale: 1, boxShadow: '0 0 0 0 rgba(52,211,153,0)' },
  correct: {
    x: 0,
    scale: [1, 1.07, 1.03],
    boxShadow: ['0 0 0 0 rgba(52,211,153,0)', '0 0 30px 6px rgba(52,211,153,0.55)', '0 0 18px 3px rgba(52,211,153,0.4)'],
    transition: { duration: 0.5, ease: 'easeOut' as const },
  },
  wrong: { x: [0, -10, 10, -8, 8, -4, 4, 0], scale: 1, transition: { duration: 0.45 } },
  dim: { x: 0, scale: 0.98, opacity: 0.45 },
};

export function Round({ questions, wordsById, onAnswer, onFinish, onExit }: Props) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const q = questions[index];
  const word = wordsById.get(q.wordId);
  const answered = verdict !== null;

  const record = (v: Verdict) => {
    setVerdict(v);
    setResults((r) => [...r, v.correct]);
    if (!v.correct) setMistakes((m) => [...m, q.wordId]);
    onAnswer(q.wordId, v.correct);
  };

  const advance = () => {
    if (index + 1 >= questions.length) {
      onFinish(summarize(results, questions.length), mistakes);
      return;
    }
    setIndex(index + 1);
    setVerdict(null);
    setPicked(null);
    setTyped('');
  };

  useEffect(() => {
    if (q.kind === 'typing' && !answered) inputRef.current?.focus();
  }, [index, q.kind, answered]);

  useEffect(() => {
    if (!answered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.repeat) advance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const choose = (i: number) => {
    if (answered || q.kind === 'typing') return;
    setPicked(i);
    record(checkChoice(q, i));
  };

  const submitTyped = (e: FormEvent) => {
    e.preventDefault();
    if (answered || q.kind !== 'typing' || !typed.trim()) return;
    record(checkTyping(q, typed));
  };

  const optState = (i: number): OptState => {
    if (!answered || q.kind === 'typing') return 'idle';
    if (i === q.answerIndex) return 'correct';
    if (i === picked) return 'wrong';
    return 'dim';
  };

  const cardState = !answered ? 'idle' : verdict!.correct ? 'correct' : 'wrong';

  return (
    <section className="round" aria-live="polite">
      <header className="round-head">
        <button className="btn ghost" onClick={onExit} aria-label="יציאה מהסבב">
          <X /> יציאה
        </button>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={index + (answered ? 1 : 0)}>
          <motion.div className="progress-fill" animate={{ width: `${((index + (answered ? 1 : 0)) / questions.length) * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
        </div>
        <span className="counter" data-testid="counter">
          {index + 1}/{questions.length}
        </span>
      </header>

      <AnimatePresence mode="wait">
        <motion.div
          key={q.id}
          className="card question"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2 }}
        >
          {q.kind === 'choice' && q.mode === 'sentence' && (
            <>
              <p className="label">
                <ListChecks /> השלימו את המשפט
                {q.source === 'ai' && (
                  <span className="chip accent">
                    <Sparkles /> משפט אישי
                  </span>
                )}
              </p>
              <p className="sentence" data-testid="sentence">
                {q.before}
                <span className="blank" aria-label="מילה חסרה">
                  {answered ? <span className="blank-filled">{q.options[q.answerIndex].label}</span> : '     '}
                </span>
                {q.after}
              </p>
              <p className="hint">פירוש המילה החסרה: {q.hint}</p>
              {q.translation && answered && <p className="hint">תרגום: {q.translation}</p>}
            </>
          )}

          {q.kind === 'choice' && q.mode === 'meaning' && (
            <>
              <p className="label">
                <ListChecks /> איך אומרים בערבית?
              </p>
              <p className="prompt">{q.prompt}</p>
            </>
          )}

          {q.kind === 'typing' && (
            <>
              <p className="label">
                <Keyboard /> {q.mode === 'h2t' ? 'כתבו את התעתיק באותיות עבריות' : 'כתבו את הפירוש בעברית'}
              </p>
              <p className={q.mode === 'h2t' ? 'prompt' : 'prompt translit'}>{q.prompt}</p>
              {q.mode === 't2h' && word?.arabic && <p className="arabic">{word.arabic}</p>}
            </>
          )}

          {q.kind === 'choice' ? (
            <div className="options" role="group" aria-label="תשובות">
              {q.options.map((o, i) => (
                <motion.button
                  key={o.wordId}
                  className={`option ${optState(i)}`}
                  variants={feedbackVariants}
                  animate={optState(i)}
                  whileTap={answered ? undefined : { scale: 0.97 }}
                  disabled={answered}
                  onClick={() => choose(i)}
                  data-testid={`option-${i}`}
                  data-correct={i === q.answerIndex ? 'true' : 'false'}
                >
                  {o.label}
                  {optState(i) === 'correct' && <Check />}
                  {optState(i) === 'wrong' && <X />}
                </motion.button>
              ))}
            </div>
          ) : (
            <form onSubmit={submitTyped} className="typing">
              <motion.div className="input-wrap" variants={feedbackVariants} animate={cardState}>
                <input
                  ref={inputRef}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  disabled={answered}
                  dir="rtl"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="הקלידו כאן"
                  aria-label="התשובה שלכם"
                  data-testid="typing-input"
                />
              </motion.div>
              {!answered && (
                <button className="btn primary" type="submit" disabled={!typed.trim()}>
                  בדיקה
                </button>
              )}
            </form>
          )}

          {answered && (
            <motion.div
              className={`feedback ${verdict!.correct ? 'good' : 'bad'}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              data-testid="feedback"
            >
              <strong>
                {verdict!.correct ? (verdict!.grade === 'close' ? 'כמעט מושלם' : 'נכון') : 'לא נכון'}
              </strong>
              {(!verdict!.correct || verdict!.grade === 'close') && word && (
                <span className="answer">
                  {q.kind === 'typing' && q.mode === 't2h' ? word.hebrew : word.translit}
                  {word.arabic ? ` · ${word.arabic}` : ''}
                  {q.kind !== 'typing' || q.mode === 'h2t' ? ` · ${word.hebrew}` : ''}
                </span>
              )}
              <button className="btn primary" onClick={advance} autoFocus data-testid="continue">
                {index + 1 >= questions.length ? 'סיום' : 'המשך'} <ArrowLeft />
              </button>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

'use client';

import { motion } from 'framer-motion';
import type { RoundSummary } from '@/lib/game';
import type { Word } from '@/lib/types';
import { Confetti } from './Confetti';
import { LayoutGrid, RotateCcw, Trophy } from './icons';

/** The perfect-round banner. Shown ONLY from here (end of a round) and ONLY for a 100% score. */
export const PERFECT_TEXT = 'כֻּלّ אִלְאִחְתִרָאם!';

interface Props {
  summary: RoundSummary;
  mistakes: Word[];
  onAgain: () => void;
  onHome: () => void;
}

export function Results({ summary, mistakes, onAgain, onHome }: Props) {
  const pct = summary.total ? Math.round((summary.correct / summary.total) * 100) : 0;
  return (
    <section className="results" data-testid="results">
      {summary.perfect && <Confetti />}
      <motion.div
        className={`card result-card ${summary.perfect ? 'perfect' : ''}`}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
      >
        {summary.perfect ? (
          <motion.div
            className="perfect-banner"
            data-testid="perfect-popup"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, boxShadow: ['0 0 0 0 rgba(245,197,66,0)', '0 0 40px 8px rgba(245,197,66,0.45)', '0 0 22px 4px rgba(245,197,66,0.3)'] }}
            transition={{ type: 'spring', stiffness: 200, damping: 12, boxShadow: { duration: 1.2 } }}
          >
            <Trophy size={40} />
            <span className="perfect-text">{PERFECT_TEXT}</span>
          </motion.div>
        ) : (
          <h2 className="result-title">סיימתם את הסבב</h2>
        )}
        <p className="score" data-testid="score">
          {summary.correct} מתוך {summary.total} נכונות ({pct}%)
        </p>

        {mistakes.length > 0 && (
          <div className="mistakes">
            <h3>כדאי לחזור על</h3>
            <ul>
              {mistakes.map((w) => (
                <li key={w.id}>
                  <span className="translit">{w.translit}</span>
                  <span className="muted">
                    {w.hebrew}
                    {w.arabic ? ` · ${w.arabic}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="actions">
          <button className="btn primary" onClick={onAgain}>
            <RotateCcw /> סבב נוסף
          </button>
          <button className="btn ghost" onClick={onHome}>
            <LayoutGrid /> לקטגוריות
          </button>
        </div>
      </motion.div>
    </section>
  );
}

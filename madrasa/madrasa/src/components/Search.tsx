'use client';

import { useMemo, useState } from 'react';
import { normalizeText } from '@/lib/normalize';
import { NEW_WORDS_ID, type Category, type Word } from '@/lib/types';
import { Check, Languages, Loader, Plus, Search as SearchIcon, Sparkles, X } from './icons';

export interface AddResult {
  ok: boolean;
  error?: string;
}

interface Props {
  words: Word[];
  categories: Category[];
  onAdd: (d: { hebrew: string; translit: string; arabic: string; categoryId: string }, source: 'search') => Promise<AddResult>;
}

interface Translation {
  hebrew: string;
  arabic: string;
  translit: string;
  category: string;
  note: string;
}

const FALLBACK_CATEGORY = 'מושגים: כללי וחיי היומיום';

export function SearchBar({ words, categories, onAdd }: Props) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<Translation | null>(null);
  const [cat, setCat] = useState('');
  const [added, setAdded] = useState(false);

  const real = useMemo(() => categories.filter((c) => c.id !== NEW_WORDS_ID), [categories]);
  const q = normalizeText(query);
  const hits = useMemo(() => {
    if (q.length < 1) return [];
    return words
      .filter((w) => [w.hebrew, w.translit, w.arabic].some((f) => f && normalizeText(f).includes(q)))
      .slice(0, 8);
  }, [q, words]);

  const reset = () => {
    setResult(null);
    setState('idle');
    setMessage('');
    setAdded(false);
  };

  const translate = async () => {
    if (query.trim().length < 2) return;
    reset();
    setState('loading');
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), categories: real.map((c) => c.id) }),
      });
      const data = (await res.json()) as { result?: Translation; error?: string };
      if (!res.ok || !data.result) {
        setState('error');
        setMessage(
          data.error === 'not_configured'
            ? 'לא הוגדר מפתח API בשרת (ANTHROPIC_API_KEY או OPENAI_API_KEY).'
            : data.error === 'rate_limited'
              ? 'יותר מדי בקשות, נסו שוב בעוד דקה.'
              : 'לא הצלחנו לתרגם. נסו ניסוח אחר.',
        );
        return;
      }
      setResult(data.result);
      setCat(data.result.category || (real.some((c) => c.id === FALLBACK_CATEGORY) ? FALLBACK_CATEGORY : real[0]?.id ?? ''));
      setState('done');
    } catch {
      setState('error');
      setMessage('אין חיבור לשרת.');
    }
  };

  const add = async () => {
    if (!result) return;
    const r = await onAdd({ hebrew: result.hebrew, translit: result.translit, arabic: result.arabic, categoryId: cat }, 'search');
    if (r.ok) setAdded(true);
    else setMessage(r.error ?? 'לא ניתן להוסיף');
  };

  return (
    <div className="search">
      <div className="search-box">
        <SearchIcon />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            reset();
          }}
          onKeyDown={(e) => e.key === 'Enter' && hits.length === 0 && translate()}
          placeholder="חיפוש במילון או תרגום (עברית / English)"
          aria-label="חיפוש"
          data-testid="search-input"
        />
        {query && (
          <button className="icon-btn" onClick={() => { setQuery(''); reset(); }} aria-label="ניקוי חיפוש">
            <X />
          </button>
        )}
      </div>

      {query.trim() && (
        <div className="card search-panel" data-testid="search-panel">
          {hits.length > 0 ? (
            <ul className="hits">
              {hits.map((w) => (
                <li key={w.id}>
                  <span className="translit">{w.translit}</span>
                  <span className="arabic-sm">{w.arabic}</span>
                  <span className="muted">{w.hebrew}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">לא נמצא במילון שלכם.</p>
          )}

          <button className="btn subtle" onClick={translate} disabled={state === 'loading' || query.trim().length < 2} data-testid="translate-btn">
            {state === 'loading' ? <Loader className="spin" /> : <Languages />} תרגום לערבית מדוברת (AI)
          </button>

          {state === 'error' && <p className="error">{message}</p>}

          {result && state === 'done' && (
            <div className="translation" data-testid="translation">
              <div className="t-main">
                <span className="translit big">{result.translit}</span>
                <span className="arabic-sm">{result.arabic}</span>
                <span className="muted">{result.hebrew}</span>
                {result.note && <span className="hint">{result.note}</span>}
              </div>
              <div className="t-actions">
                <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="קטגוריה" disabled={added}>
                  {real.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button className={`btn ${added ? 'ok' : 'primary'} icon-only`} onClick={add} disabled={added} aria-label="הוספה ל״מילים חדשות״" data-testid="add-translation">
                  {added ? <Check /> : <Plus />}
                </button>
              </div>
              {added && (
                <p className="ok-text">
                  <Sparkles /> נוסף ל״מילים חדשות״. תשתחרר לקטגוריה לאחר 3 תשובות נכונות ברצף.
                </p>
              )}
              {!added && message && <p className="error">{message}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { clearSupabaseConfig, loadSupabaseConfig, saveSupabaseConfig, validateSupabaseConfig } from '@/lib/store';
import { isLearned } from '@/lib/srs';
import { LEARN_STREAK, NEW_WORDS_ID, type Category, type ProgressMap, type Word } from '@/lib/types';
import type { AddResult } from './Search';
import { Check, Loader, Lock, Plus, Trash, Unlock } from './icons';

interface Props {
  storeKind: 'local' | 'supabase';
  categories: Category[];
  userWords: Word[];
  progress: ProgressMap;
  onAdd: (d: { hebrew: string; translit: string; arabic: string; categoryId: string }, source: 'admin') => Promise<AddResult>;
  onRemove: (id: string) => void;
}

function SupabaseSettings({ storeKind }: { storeKind: 'local' | 'supabase' }) {
  const found = loadSupabaseConfig();
  const [url, setUrl] = useState(found?.config.url ?? '');
  const [key, setKey] = useState(found?.config.anonKey ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const check = async () => {
    const bad = validateSupabaseConfig(url, key);
    if (bad) return setMsg({ ok: false, text: bad });
    setBusy(true);
    setMsg(null);
    const { testSupabaseConnection } = await import('@/lib/supabase-store');
    const r = await testSupabaseConnection({ url: url.trim().replace(/\/+$/, ''), anonKey: key.trim() });
    setMsg({ ok: r.ok, text: r.message });
    setBusy(false);
  };
  const save = () => {
    const bad = validateSupabaseConfig(url, key);
    if (bad) return setMsg({ ok: false, text: bad });
    saveSupabaseConfig({ url, anonKey: key });
    window.location.reload();
  };
  const clear = () => {
    clearSupabaseConfig();
    window.location.reload();
  };

  return (
    <div className="card form" data-testid="supabase-settings">
      <h2>חיבור Supabase</h2>
      <p className="muted">
        מצב נוכחי: {storeKind === 'supabase' ? 'מחובר ל-Supabase' : 'מקומי (localStorage)'}
        {found ? (found.source === 'manual' ? ' · מפתחות שהוזנו כאן (גוברים על Vercel)' : ' · מפתחות מ-Vercel') : ''}
      </p>
      <label>
        Supabase URL
        <input value={url} onChange={(e) => { setUrl(e.target.value); setMsg(null); }} dir="ltr" placeholder="https://xxxx.supabase.co" autoComplete="off" data-testid="sb-url" />
      </label>
      <label>
        Anon Key (public)
        <input value={key} onChange={(e) => { setKey(e.target.value); setMsg(null); }} dir="ltr" autoComplete="off" spellCheck={false} data-testid="sb-key" />
      </label>
      <p className="muted small">המפתחות נשמרים רק בדפדפן הזה. השתמשו במפתח ה-anon/publishable בלבד, לא ב-service role.</p>
      <div className="actions">
        <button type="button" className="btn" onClick={check} disabled={busy} data-testid="sb-test">
          {busy ? <Loader className="spin" /> : <Check />} בדיקת חיבור
        </button>
        <button type="button" className="btn primary" onClick={save} data-testid="sb-save">
          שמירה וטעינה מחדש
        </button>
        {found?.source === 'manual' && (
          <button type="button" className="btn ghost" onClick={clear} data-testid="sb-clear">
            ניקוי
          </button>
        )}
      </div>
      {msg && (
        <p className={msg.ok ? 'ok-text' : 'error'} role="status" data-testid="sb-msg">
          {msg.text}
        </p>
      )}
    </div>
  );
}

export function Admin({ storeKind, categories, userWords, progress, onAdd, onRemove }: Props) {
  const real = categories.filter((c) => c.id !== NEW_WORDS_ID);
  const [form, setForm] = useState({ hebrew: '', translit: '', arabic: '', categoryId: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setMsg(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await onAdd(form, 'admin');
    if (r.ok) {
      setForm((f) => ({ ...f, hebrew: '', translit: '', arabic: '' }));
      setMsg({ ok: true, text: 'נוספה ל״מילים חדשות״' });
    } else {
      setMsg({ ok: false, text: r.error ?? 'שגיאה' });
    }
  };

  return (
    <section className="admin">
      <form className="card form" onSubmit={submit} data-testid="admin-form">
        <h2>הוספת מילה</h2>
        <p className="muted">
          מילה חדשה נכנסת ל״מילים חדשות״ ונשארת שם עד {LEARN_STREAK} תשובות נכונות ברצף, ואז היא נפתחת בקטגוריה שבחרתם.
        </p>
        <label>
          עברית (פירוש)
          <input value={form.hebrew} onChange={set('hebrew')} dir="rtl" required data-testid="f-hebrew" />
        </label>
        <label>
          תעתיק (באותיות עבריות)
          <input value={form.translit} onChange={set('translit')} dir="rtl" required data-testid="f-translit" />
        </label>
        <label>
          ערבית
          <input value={form.arabic} onChange={set('arabic')} dir="rtl" lang="ar" data-testid="f-arabic" />
        </label>
        <label>
          קטגוריה
          <select value={form.categoryId} onChange={set('categoryId')} required data-testid="f-category">
            <option value="" disabled>
              בחרו קטגוריה
            </option>
            {real.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn primary" type="submit" data-testid="f-submit">
          <Plus /> הוספה
        </button>
        {msg && (
          <p className={msg.ok ? 'ok-text' : 'error'} role="status">
            {msg.ok && <Check />} {msg.text}
          </p>
        )}
      </form>

      <div className="card">
        <h2>המילים שהוספתי ({userWords.length})</h2>
        {userWords.length === 0 && <p className="muted">עדיין לא הוספתם מילים.</p>}
        <ul className="user-words">
          {userWords.map((w) => {
            const p = progress[w.id];
            const learned = isLearned(p);
            return (
              <li key={w.id}>
                <div>
                  <span className="translit">{w.translit}</span> <span className="muted">{w.hebrew}</span>
                  <div className="muted small">
                    {learned ? (
                      <>
                        <Unlock /> נפתחה: {w.categoryId}
                      </>
                    ) : (
                      <>
                        <Lock /> ״מילים חדשות״ · רצף {Math.min(p?.streak ?? 0, LEARN_STREAK)}/{LEARN_STREAK} · תיפתח ב: {w.categoryId}
                      </>
                    )}
                  </div>
                </div>
                <button className="icon-btn" onClick={() => onRemove(w.id)} aria-label={`מחיקת ${w.hebrew}`}>
                  <Trash />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <SupabaseSettings storeKind={storeKind} />
    </section>
  );
}

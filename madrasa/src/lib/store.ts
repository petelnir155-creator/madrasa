import type { Category, ProgressMap, Word, WordProgress } from './types';

/**
 * Persistence boundary. The UI only talks to `Store`; swapping localStorage for Supabase is a
 * one-line change in `createStore()`.
 */
export interface LoadedData {
  /** present when the DB already holds the words (Supabase mode); otherwise the bundled seed is used */
  db?: { words: Word[]; categories: Category[] };
  userWords: Word[];
  progress: ProgressMap;
}

export interface Store {
  readonly kind: 'local' | 'supabase';
  load(): Promise<LoadedData>;
  addWord(word: Word): Promise<Word>;
  removeWord(id: string): Promise<void>;
  saveProgress(entry: WordProgress, all: ProgressMap): Promise<void>;
}

const KEY_WORDS = 'madrasa.v1.userWords';
const KEY_PROGRESS = 'madrasa.v1.progress';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota: progress simply will not persist */
  }
}

export class LocalStore implements Store {
  readonly kind = 'local' as const;
  async load(): Promise<LoadedData> {
    return { userWords: read<Word[]>(KEY_WORDS, []), progress: read<ProgressMap>(KEY_PROGRESS, {}) };
  }
  async addWord(word: Word) {
    write(KEY_WORDS, [...read<Word[]>(KEY_WORDS, []), word]);
    return word;
  }
  async removeWord(id: string) {
    write(KEY_WORDS, read<Word[]>(KEY_WORDS, []).filter((w) => w.id !== id));
    const p = read<ProgressMap>(KEY_PROGRESS, {});
    delete p[id];
    write(KEY_PROGRESS, p);
  }
  async saveProgress(_entry: WordProgress, all: ProgressMap) {
    write(KEY_PROGRESS, all);
  }
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}
export type ConfigSource = 'manual' | 'env';

const KEY_CONFIG = 'madrasa.v1.supabaseConfig';

/** Returns a readable error, or null when the pair looks valid. */
export function validateSupabaseConfig(url: string, anonKey: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:') return 'ה-URL חייב להתחיל ב-https://';
  } catch {
    return 'ה-URL אינו תקין (צריך להיות כמו https://xxxx.supabase.co)';
  }
  const k = anonKey.trim();
  if (k.length < 20 || /\s/.test(k)) return 'ה-Anon Key נראה לא תקין';
  if (k.startsWith('sb_secret_') || /service_role/i.test(k)) return 'זה מפתח סודי (service role). השתמשו רק ב-Anon / publishable key.';
  return null;
}

/** A key typed into the app wins over Vercel env vars, so a bad env setup can be bypassed. */
export function loadSupabaseConfig(): { config: SupabaseConfig; source: ConfigSource } | null {
  const manual = read<Partial<SupabaseConfig> | null>(KEY_CONFIG, null);
  if (manual?.url && manual.anonKey) return { config: { url: manual.url, anonKey: manual.anonKey }, source: 'manual' };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) return { config: { url, anonKey }, source: 'env' };
  return null;
}

export function saveSupabaseConfig(c: SupabaseConfig) {
  write(KEY_CONFIG, { url: c.url.trim().replace(/\/+$/, ''), anonKey: c.anonKey.trim() });
}

export function clearSupabaseConfig() {
  try {
    window.localStorage.removeItem(KEY_CONFIG);
  } catch {
    /* ignore */
  }
}

export async function createStore(): Promise<Store> {
  const found = loadSupabaseConfig();
  if (found) {
    const { SupabaseStore } = await import('./supabase-store');
    return new SupabaseStore(found.config);
  }
  return new LocalStore();
}

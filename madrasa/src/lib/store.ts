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

export function supabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function createStore(): Promise<Store> {
  if (supabaseConfigured()) {
    const { SupabaseStore } = await import('./supabase-store');
    return new SupabaseStore();
  }
  return new LocalStore();
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LoadedData, Store } from './store';
import type { Category, ProgressMap, Sentence, Word, WordProgress } from './types';

/**
 * Supabase-backed store (groundwork – see supabase/migrations/0001_init.sql).
 * Uses anonymous auth so each visitor gets private progress rows protected by RLS.
 * NOTE: written against the schema but not yet exercised against a live project.
 */
interface WordRow {
  id: string;
  hebrew: string;
  translit: string;
  arabic: string;
  category_id: string;
  source: Word['source'];
  staged: boolean;
  created_by: string | null;
  sentences?: { text: string; target: string; lesson: number | null }[];
}
interface ProgressRow {
  word_id: string;
  streak: number;
  correct: number;
  wrong: number;
  box: number;
  due_at: string;
  last_seen: string | null;
  learned_at: string | null;
}

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (s: string | null) => (s ? Date.parse(s) : 0);

function toWord(r: WordRow): Word {
  const sentences: Sentence[] = (r.sentences ?? []).map((s) => ({ text: s.text, target: s.target, lesson: s.lesson ?? undefined }));
  return { id: r.id, hebrew: r.hebrew, translit: r.translit, arabic: r.arabic, categoryId: r.category_id, sentences, source: r.source, staged: r.staged };
}

export class SupabaseStore implements Store {
  readonly kind = 'supabase' as const;
  private client?: SupabaseClient;
  private userId?: string;

  private async db(): Promise<{ client: SupabaseClient; userId: string }> {
    if (this.client && this.userId) return { client: this.client, userId: this.userId };
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    let { data } = await client.auth.getSession();
    if (!data.session) {
      const res = await client.auth.signInAnonymously();
      if (res.error || !res.data.session) throw new Error(`Supabase auth failed: ${res.error?.message ?? 'no session'}`);
      data = { session: res.data.session };
    }
    const userId = data.session!.user.id;
    this.client = client;
    this.userId = userId;
    return { client, userId };
  }

  async load(): Promise<LoadedData> {
    const { client, userId } = await this.db();
    const [cats, words, prog] = await Promise.all([
      client.from('categories').select('id,name,grp,sort_order').order('sort_order'),
      client.from('words').select('*, sentences(text,target,lesson)'),
      client.from('user_progress').select('*').eq('user_id', userId),
    ]);
    if (cats.error) throw cats.error;
    if (words.error) throw words.error;
    if (prog.error) throw prog.error;

    const progress: ProgressMap = {};
    for (const r of (prog.data ?? []) as ProgressRow[]) {
      progress[r.word_id] = {
        wordId: r.word_id,
        streak: r.streak,
        correct: r.correct,
        wrong: r.wrong,
        box: r.box,
        dueAt: ms(r.due_at),
        lastSeen: ms(r.last_seen),
        learnedAt: r.learned_at ? ms(r.learned_at) : null,
      };
    }
    const all = ((words.data ?? []) as WordRow[]).map(toWord);
    const categories: Category[] = ((cats.data ?? []) as { id: string; name: string; grp: string }[]).map((c) => ({ id: c.id, name: c.name, group: c.grp }));
    // empty DB (seed.sql not run yet) -> let the app fall back to the bundled seed
    return { db: all.length ? { words: all, categories } : undefined, userWords: [], progress };
  }

  async addWord(word: Word): Promise<Word> {
    const { client, userId } = await this.db();
    // ids are global in the DB; namespace user words so two users can add the same word
    const id = `${word.id}@${userId.slice(0, 8)}`;
    const { error } = await client.from('words').insert({
      id,
      hebrew: word.hebrew,
      translit: word.translit,
      arabic: word.arabic,
      category_id: word.categoryId,
      source: word.source,
      staged: word.staged,
      created_by: userId,
    });
    if (error) throw error;
    return { ...word, id };
  }

  async removeWord(id: string) {
    const { client } = await this.db();
    const { error } = await client.from('words').delete().eq('id', id);
    if (error) throw error;
  }

  async saveProgress(p: WordProgress, _all: ProgressMap) {
    const { client, userId } = await this.db();
    const { error } = await client.from('user_progress').upsert({
      user_id: userId,
      word_id: p.wordId,
      streak: p.streak,
      correct: p.correct,
      wrong: p.wrong,
      box: p.box,
      due_at: iso(p.dueAt),
      last_seen: p.lastSeen ? iso(p.lastSeen) : null,
      learned_at: p.learnedAt ? iso(p.learnedAt) : null,
    });
    if (error) throw error;
  }
}

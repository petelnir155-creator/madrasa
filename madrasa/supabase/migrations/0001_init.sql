-- Madrasa: words, categories, per-user SRS progress.
-- Run in the Supabase SQL editor (or `supabase db push`), then run supabase/seed.sql.
-- Enable Authentication > Providers > "Anonymous sign-ins" so the app can give every
-- visitor a private progress row without a login screen (swap for email/OAuth later).

create table if not exists public.categories (
  id          text primary key,
  name        text not null,
  grp         text not null,
  sort_order  int  not null default 0
);

create table if not exists public.words (
  id           text primary key,
  hebrew       text not null,
  translit     text not null,
  arabic       text not null default '',
  category_id  text not null references public.categories(id) on update cascade,
  source       text not null default 'seed' check (source in ('seed', 'admin', 'search')),
  -- staged words sit in the "new words" bucket until the user's streak reaches 3
  staged       boolean not null default false,
  created_by   uuid references auth.users(id) on delete cascade,   -- null = bundled seed word
  created_at   timestamptz not null default now()
);
create index if not exists words_category_idx on public.words(category_id);
create index if not exists words_created_by_idx on public.words(created_by);

create table if not exists public.sentences (
  id       bigint generated always as identity primary key,
  word_id  text not null references public.words(id) on delete cascade,
  text     text not null,
  target   text not null,          -- the word exactly as written in this sentence
  lesson   smallint
);
create index if not exists sentences_word_idx on public.sentences(word_id);

create table if not exists public.user_progress (
  user_id     uuid not null references auth.users(id) on delete cascade,
  word_id     text not null references public.words(id) on delete cascade,
  streak      int  not null default 0,
  correct     int  not null default 0,
  wrong       int  not null default 0,
  box         int  not null default 1 check (box between 1 and 5),
  due_at      timestamptz not null default now(),
  last_seen   timestamptz,
  learned_at  timestamptz,         -- set once the streak first reaches 3; unlocks staged words
  primary key (user_id, word_id)
);
create index if not exists user_progress_due_idx on public.user_progress(user_id, due_at);

-- ---------- Row level security ----------
alter table public.categories    enable row level security;
alter table public.words         enable row level security;
alter table public.sentences     enable row level security;
alter table public.user_progress enable row level security;

create policy "categories are public" on public.categories for select using (true);

create policy "read seed + own words" on public.words
  for select using (created_by is null or created_by = auth.uid());
create policy "insert own words" on public.words
  for insert with check (created_by = auth.uid() and source <> 'seed');
create policy "update own words" on public.words
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "delete own words" on public.words
  for delete using (created_by = auth.uid());

create policy "read sentences of visible words" on public.sentences
  for select using (exists (
    select 1 from public.words w
    where w.id = word_id and (w.created_by is null or w.created_by = auth.uid())
  ));
create policy "write sentences of own words" on public.sentences
  for all using (exists (select 1 from public.words w where w.id = word_id and w.created_by = auth.uid()))
  with check (exists (select 1 from public.words w where w.id = word_id and w.created_by = auth.uid()));

create policy "own progress" on public.user_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

# הערבית המדוברת של ניר (Madrasa)

Levantine Arabic study app: spaced repetition, active recall (typing) and a dictionary/translate bar. All questions come from the word list only (no AI in the game loop). Next.js (App Router) + TypeScript. Data storage works with **localStorage out of the box** and is ready to move to **Supabase**.

## Quick start

```bash
npm install
cp .env.example .env.local     # add ANTHROPIC_API_KEY (or OPENAI_API_KEY) for AI features
npm run dev                    # http://localhost:3000
npm test                       # unit tests (normalisation, dedup, game engine, SRS, AI validation)
```

Without an API key everything works except the "translate" button, which shows a clear message. The API key is used only by `/api/translate`.

## Git + GitHub + Vercel (exact commands)

Run from the project folder (the one containing `package.json`):

```bash
git init -b main
git add .
git commit -m "Madrasa: Next.js app, unique-word dataset, SRS, typing modes, AI sentences, Supabase schema"

# create an empty repo on github.com first (no README/license), then:
git remote add origin https://github.com/<YOUR_USER>/madrasa.git
git push -u origin main
```

With the GitHub CLI instead of the website:

```bash
gh repo create madrasa --private --source=. --remote=origin --push
```

Deploy (CI/CD on every push):

1. vercel.com → **Add New → Project** → import the GitHub repo (framework is auto-detected as Next.js).
2. **Settings → Environment Variables**: add `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`), and later the two `NEXT_PUBLIC_SUPABASE_*` values.
3. Deploy. Every push to `main` ships to production, every PR gets a preview URL. (Netlify works the same way with its Next.js runtime.)

`.env*` is git-ignored – never commit keys. `NEXT_PUBLIC_*` values are visible in the browser by design; the LLM keys have no such prefix and only exist on the server.

## Moving to Supabase

1. Create a project at supabase.com.
2. **Authentication → Providers → Anonymous sign-ins → enable** (gives every visitor a private account with no login screen; replace with email/OAuth later).
3. SQL editor: run `supabase/migrations/0001_init.sql`, then `supabase/seed.sql` (436 words, 53 categories, 270 sentence-linked words, generated from the Excel).
4. Put `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` / Vercel.

Schema: `categories`, `words` (+ `staged`, `created_by`), `sentences`, `user_progress` (per-user SRS: streak, box, due_at, learned_at). Row-level security: everyone reads the seed words, users only see/modify their own added words and their own progress.

The app talks to storage only through the `Store` interface (`src/lib/store.ts`); `createStore()` picks Supabase when the env vars exist, otherwise localStorage. **The Supabase store has not been run against a live project yet** – expect to fix small things on first connect.

## Data pipeline

```
data/madrasa.xlsx --(npm run extract)--> data/raw.json --(npm run seed)--> src/data/seed.json + supabase/seed.sql
```

`npm run extract` needs Python with `openpyxl`. `npm run seed` runs the dedup (`src/lib/seed-build.ts`).

**Deduplication.** The category tabs and lesson tabs are merged into one unique word list (998 raw rows → 436 words). Identity is the transliteration key (niqqud/spaces/punctuation ignored, all written variants like `בַּ(א)תְעַלַּם` or `מַיّ / מַיّה` considered) **and** a compatible meaning. Translit alone is not enough: after niqqud is stripped, `בַּסّ` is "but", "only" and "enough", and `חַ'אל`/`חַאל` are "uncle"/"state" – those stay separate words. Each unique word keeps its category tag and inherits every lesson sentence. Category counts are derived from this list, never stored.

The lesson tab `אותיות וחוקים` (alphabet table) is not word data and is not imported.

## How the features map to the code

| Feature | Where |
|---|---|
| Unique words, category tag + lesson sentence | `src/lib/seed-build.ts`, `src/lib/catalog.ts` |
| Prefix fix: sentence keeps `בְּ____`, button shows the base word | `locateInSentence` / `blankAround` in `src/lib/normalize.ts`, `sentenceQuestion` in `src/lib/game.ts` |
| Admin add + staging `מילים חדשות` (unlock at streak 3) | `src/lib/userwords.ts`, `src/lib/catalog.ts`, `src/lib/srs.ts`, `src/components/Admin.tsx` |
| Search + AI translate + quick `+` | `src/components/Search.tsx`, `src/app/api/translate/route.ts`, `src/lib/ai.ts` |
| Typing modes + lenient grading | `gradeTyped` in `src/lib/normalize.ts`, `src/components/Round.tsx` |
| lucide icons (one stroke weight), framer-motion feedback | `src/components/icons.tsx`, `src/components/Round.tsx` |
| Perfect-round popup + confetti (end of round, zero mistakes only) | `src/components/Results.tsx`, `summarize()` in `src/lib/game.ts` |

Grading ignores niqqud, extra spaces, geresh/quotes/punctuation and final-letter forms; any listed alternative (`a / b`, optional `(א)`) is accepted. A single slip on a word of 5+ letters counts as correct ("close") and shows the right spelling.

## Things worth knowing

- `/api/translate` has only a small in-memory rate limit. Before sharing the URL publicly, add auth (e.g. require a Supabase session) or they can spend your API credits.
- Words are not imported from your old localStorage; progress starts fresh under keys `madrasa.v1.*`.

# The Daily

Tiny doses of text, once a day. Each **pack** (like `/drama`) serves one line a day to everyone, and people can score it, leave a review, submit new lines and pitch new packs.

Built with Next.js and Postgres. Phone first.

## What's where

| Page | What it does |
|---|---|
| `/` | Your followed packs with today's line, the top 3 most-wanted pitches, and a link to pitch a pack |
| `/[pack]` | Today's line, copy & share, score + review, field reports, submit a line |
| `/[pack]/reports` | All of today's reviews, sortable |
| `/explore` | Search live packs and the pile |
| `/pitch` | Pitch a new pack (100+ lines, paste or `.txt`) |
| `/colours` | The 10-colour cycle packs are given |
| `/admin` | Approve lines and pitches, launch packs, create your own packs |

How it behaves:

- A new daily starts at **midnight UTC**. Lines that have never been shown go first; once all are used, the oldest come back.
- Reviews post right away. Submitted lines and pitches wait for you in `/admin`.
- Follows and upvotes need no account: they're kept in the visitor's cookies.
- Spam protection: a hidden honeypot field and per-IP limits (5 reviews / 10 min, 5 lines / hour, 3 pitches / hour). IPs are stored only as salted hashes.
- Wrap words in `*asterisks*` in a line to highlight them.

## Run it locally

Needs Node 22.18+.

```bash
npm install
cp .env.example .env.local   # set ADMIN_PASSWORD
npm run dev
```

With no `DATABASE_URL`, the app uses a built-in Postgres (PGlite) stored in `./.pglite`, and applies the migration files on first use. Open `/admin` → **New pack** to create your first pack.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run lint` | Strict TypeScript check |
| `npm test` | Unit tests (data layer runs against an in-memory Postgres) |
| `npm run test:e2e` | Builds, starts the app and runs the full journey on a phone and a desktop browser |
| `npm run db:migrate` | Applies pending files in `migrations/` to `DATABASE_URL` (or the local database) |

## Database

Three tables (plus `schema_migrations`). Full definitions with comments are in `migrations/0001_init.sql`.

| Table | One row per | Key columns |
|---|---|---|
| `packs` | pack, from pitch to live | `slug`, `status` (pending → pile → live, or rejected), `description`, `noun`, `meter_label`, `accent`, `background`, `author`, `votes`, `followers`, `launched_on`, `created_at` |
| `entries` | line | `pack_slug`, `body`, `author`, `level` (1–5), `status` (pending, approved, rejected), `shown_on` (the day it was the daily), `created_at` |
| `reviews` | score / review | `pack_slug`, `day`, `score` (1–5), `name`, `body` (empty = rating only), `created_at` |

- Nothing is deleted: rejected packs and lines stay with status `rejected`. A rejected pack's name stays taken.
- Who follows or upvoted what is kept in the visitor's cookies (`td_follows`, `td_votes`); the tables keep counts only.
- Each table has an `ip_hash` (salted hash, never the IP) for spam limits.

## Database changes

Migrations are plain SQL files in `migrations/`, named `0001_init.sql`, `0002_….sql` and so on. Each runs once, in order, and is recorded in a `schema_migrations` table.

To change the schema: add the next numbered file, then push. On `main`, CI applies it to production after the tests pass. Keep changes additive (new tables or columns) so the live site keeps working while Vercel deploys the new code.

## Deploy (Vercel + Neon)

1. **Neon**: create a project at [neon.tech](https://neon.tech), in region AWS US East (N. Virginia) to sit next to Vercel's default. Click **Connect** and copy the connection string (`postgresql://…?sslmode=require`).
2. **GitHub secret**: in this repo, go to **Settings → Environments → New environment**, name it `production`, and add a secret `DATABASE_URL` with the Neon string. CI uses it to run migrations.
3. **Vercel**: **Add New → Project**, import this repo. Under **Environment Variables** add:
   - `DATABASE_URL`: the same Neon string
   - `ADMIN_PASSWORD`: your password for `/admin`
   - `SESSION_SECRET`: a long random string (`openssl rand -base64 32`)
4. **First migration**: push to `main` (or run the CI workflow by hand from the Actions tab). The `migrate` job creates the tables.
5. Deploy, open `/admin`, sign in and create your first pack.

If you change an environment variable in Vercel later, redeploy for it to take effect.

## CI

`.github/workflows/ci.yml` runs on every push and pull request:

1. `npm audit` (fails on any known vulnerability)
2. Type check
3. Unit tests
4. Production build
5. End-to-end tests in Chromium, phone and desktop sizes
6. On `main` only, after all of the above: apply database migrations to production

// All database reads and writes. Every function takes the Db so tests
// can run against a fresh in-memory database.
import type { Db } from "./db.ts";
import { nextTone, type Tone } from "./palette.ts";

export type PackStatus = "pending" | "pile" | "live" | "rejected";

export type Pack = {
  slug: string;
  status: PackStatus;
  description: string;
  noun: string;
  meterLabel: string;
  accent: string | null;
  background: string | null;
  author: string | null;
  votes: number;
  followers: number;
  launchedOn: string | null;
  createdAt: number;
};

/** A pack that is live always has its colours and launch day. */
export type LivePack = Pack & { status: "live"; accent: string; background: string; launchedOn: string };

/** A line's readers' rating: average score across every day it's been shown. */
export type LineRating = { avgScore: number | null; ratings: number };

export type Daily = { entryId: number; body: string; author: string | null } & LineRating;

const LINE_RATING = `(SELECT round(avg(r.score), 1)::float8 FROM reviews r WHERE r.entry_id = e.id) AS "avgScore",
  (SELECT count(*)::int FROM reviews r WHERE r.entry_id = e.id) AS ratings`;

export type Report = { id: number; score: number; name: string | null; body: string; createdAt: number };

export type RatingSummary = { count: number; average: number; counts: [number, number, number, number, number] };

export type PendingLine = { id: number; packSlug: string; body: string; author: string | null; createdAt: number };

const PACK_COLUMNS = `slug, status, description, noun, meter_label AS "meterLabel", accent, background, author,
  votes, followers, launched_on::text AS "launchedOn", (extract(epoch FROM created_at) * 1000)::float8 AS "createdAt"`;

function likePattern(q: string): string {
  return `%${q.toLowerCase().replace(/[%_\\]/g, "\\$&")}%`;
}

// ---------- packs ----------

export async function getPack(db: Db, slug: string): Promise<Pack | null> {
  const rows = await db.query<Pack>(`SELECT ${PACK_COLUMNS} FROM packs WHERE slug = $1`, [slug]);
  return rows[0] ?? null;
}

export async function getLivePack(db: Db, slug: string): Promise<LivePack | null> {
  const pack = await getPack(db, slug);
  return pack?.status === "live" ? (pack as LivePack) : null;
}

/** Live packs, most followed first. Optional search over name and description. */
export async function listLivePacks(db: Db, q = ""): Promise<LivePack[]> {
  return db.query<LivePack>(
    `SELECT ${PACK_COLUMNS} FROM packs
     WHERE status = 'live' AND ($1 = '%%' OR lower(slug) LIKE $1 OR lower(description) LIKE $1)
     ORDER BY followers DESC, created_at ASC`,
    [likePattern(q)],
  );
}

/** Live packs by name, in the order given (the order they were followed). */
export async function livePacksBySlugs(db: Db, slugs: string[]): Promise<LivePack[]> {
  if (!slugs.length) return [];
  const rows = await db.query<LivePack>(`SELECT ${PACK_COLUMNS} FROM packs WHERE status = 'live' AND slug = ANY($1)`, [slugs]);
  const bySlug = new Map(rows.map((p) => [p.slug, p]));
  return slugs.map((s) => bySlug.get(s)).filter((p): p is LivePack => Boolean(p));
}

/** The pile: approved pitches, most upvoted first. */
export async function listPile(db: Db, opts: { q?: string; limit?: number } = {}): Promise<Pack[]> {
  return db.query<Pack>(
    `SELECT ${PACK_COLUMNS} FROM packs
     WHERE status = 'pile' AND ($1 = '%%' OR lower(slug) LIKE $1 OR lower(description) LIKE $1)
     ORDER BY votes DESC, created_at ASC LIMIT $2`,
    [likePattern(opts.q ?? ""), opts.limit ?? 50],
  );
}

export async function listPacksByStatus(db: Db, status: PackStatus): Promise<Pack[]> {
  return db.query<Pack>(
    `SELECT ${PACK_COLUMNS} FROM packs WHERE status = $1 ORDER BY ${status === "pile" ? "votes DESC, " : ""}created_at ASC LIMIT 100`,
    [status],
  );
}

export async function countLivePacks(db: Db): Promise<number> {
  const rows = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM packs WHERE status = 'live'`);
  return rows[0]?.n ?? 0;
}

/** +1 / -1 on a live pack's follower count. Who follows what is kept in cookies. */
export async function changeFollowers(db: Db, slug: string, delta: 1 | -1): Promise<boolean> {
  const rows = await db.query(
    `UPDATE packs SET followers = GREATEST(followers + $2, 0) WHERE slug = $1 AND status = 'live' RETURNING 1`,
    [slug, delta],
  );
  return rows.length > 0;
}

/** +1 / -1 on a pile pack's votes. Who voted is kept in cookies. */
export async function changeVotes(db: Db, slug: string, delta: 1 | -1): Promise<boolean> {
  const rows = await db.query(
    `UPDATE packs SET votes = GREATEST(votes + $2, 0) WHERE slug = $1 AND status = 'pile' RETURNING 1`,
    [slug, delta],
  );
  return rows.length > 0;
}

// ---------- the daily pick ----------

async function readPick(db: Db, slug: string, day: string): Promise<Daily | null> {
  const rows = await db.query<Daily>(
    `SELECT e.id AS "entryId", e.body, e.author, ${LINE_RATING} FROM entries e WHERE e.pack_slug = $1 AND e.shown_on = $2`,
    [slug, day],
  );
  return rows[0] ?? null;
}

/**
 * Today's line for a pack. Chosen once per day and stamped with the
 * date, so everyone sees the same one. Lines never shown come first;
 * once every line has been used, the least recently shown come back.
 */
export async function getDaily(db: Db, slug: string, day: string): Promise<Daily | null> {
  const existing = await readPick(db, slug, day);
  if (existing) return existing;
  try {
    await db.query(
      `UPDATE entries SET shown_on = $2
       WHERE id = (
         SELECT id FROM entries
         WHERE pack_slug = $1 AND status = 'approved' AND (shown_on IS NULL OR shown_on < $2)
         ORDER BY shown_on ASC NULLS FIRST, random()
         LIMIT 1
       )`,
      [slug, day],
    );
  } catch {
    // Another request picked today's line at the same moment. Use theirs.
  }
  return readPick(db, slug, day);
}

/** How many approved lines have never been the daily. */
export async function unusedLineCount(db: Db, slug: string): Promise<number> {
  const rows = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM entries WHERE pack_slug = $1 AND status = 'approved' AND shown_on IS NULL`,
    [slug],
  );
  return rows[0]?.n ?? 0;
}

// ---------- reviews ----------

export async function ratingSummary(db: Db, slug: string, day: string): Promise<RatingSummary> {
  const rows = await db.query<{ score: number; n: number }>(
    `SELECT score::int AS score, count(*)::int AS n FROM reviews WHERE pack_slug = $1 AND day = $2 GROUP BY score`,
    [slug, day],
  );
  const counts: RatingSummary["counts"] = [0, 0, 0, 0, 0];
  let total = 0;
  let sum = 0;
  for (const r of rows) {
    counts[r.score - 1] = r.n;
    total += r.n;
    sum += r.score * r.n;
  }
  return { count: total, average: total ? Math.round((sum / total) * 10) / 10 : 0, counts };
}

export type ReportSort = "new" | "high" | "low";

const REPORT_ORDER: Record<ReportSort, string> = {
  new: "created_at DESC, id DESC",
  high: "score DESC, created_at DESC, id DESC",
  low: "score ASC, created_at DESC, id DESC",
};

/** Reviews that came with words. Ratings without text only count toward the score. */
export async function listReports(
  db: Db,
  slug: string,
  day: string,
  opts: { sort?: ReportSort; limit?: number } = {},
): Promise<{ reports: Report[]; total: number }> {
  const sort = opts.sort ?? "new";
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 200);
  const reports = await db.query<Report>(
    `SELECT id, score::int AS score, name, body, (extract(epoch FROM created_at) * 1000)::float8 AS "createdAt"
     FROM reviews WHERE pack_slug = $1 AND day = $2 AND body IS NOT NULL
     ORDER BY ${REPORT_ORDER[sort]} LIMIT $3`,
    [slug, day, limit],
  );
  const total = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM reviews WHERE pack_slug = $1 AND day = $2 AND body IS NOT NULL`,
    [slug, day],
  );
  return { reports, total: total[0]?.n ?? 0 };
}

export async function addReview(
  db: Db,
  r: { slug: string; day: string; entryId: number; score: number; name: string | null; body: string | null; ipHash: string },
): Promise<void> {
  await db.query(
    `INSERT INTO reviews (pack_slug, day, entry_id, score, name, body, ip_hash) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [r.slug, r.day, r.entryId, r.score, r.name, r.body, r.ipHash],
  );
}

// ---------- lines ----------

async function insertLines(
  db: Db,
  slug: string,
  lines: string[],
  opts: { author: string | null; status: "pending" | "approved"; ipHash: string | null },
): Promise<void> {
  for (let i = 0; i < lines.length; i += 200) {
    const chunk = lines.slice(i, i + 200);
    const values = chunk.map((_, j) => `($1, $2, $3, $4, $${j + 5})`).join(", ");
    await db.query(
      `INSERT INTO entries (pack_slug, author, status, ip_hash, body) VALUES ${values} ON CONFLICT DO NOTHING`,
      [slug, opts.author, opts.status, opts.ipHash, ...chunk],
    );
  }
}

/** A reader's line for a live pack. Waits for admin approval. */
export async function addLine(
  db: Db,
  l: { slug: string; body: string; author: string | null; ipHash: string },
): Promise<"ok" | "duplicate" | "missing"> {
  if (!(await getLivePack(db, l.slug))) return "missing";
  const rows = await db.query(
    `INSERT INTO entries (pack_slug, body, author, ip_hash) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id`,
    [l.slug, l.body, l.author, l.ipHash],
  );
  return rows.length ? "ok" : "duplicate";
}

/** Lines waiting for approval on live packs (pitch lines are reviewed with their pitch). */
export async function listPendingLines(db: Db): Promise<PendingLine[]> {
  return db.query<PendingLine>(
    `SELECT e.id, e.pack_slug AS "packSlug", e.body, e.author, (extract(epoch FROM e.created_at) * 1000)::float8 AS "createdAt"
     FROM entries e JOIN packs p ON p.slug = e.pack_slug AND p.status = 'live'
     WHERE e.status = 'pending' ORDER BY e.created_at ASC LIMIT 100`,
  );
}

/** All lines of a pack, for reviewing a pitch. */
export async function packLines(db: Db, slug: string): Promise<string[]> {
  const rows = await db.query<{ body: string }>(`SELECT body FROM entries WHERE pack_slug = $1 ORDER BY id`, [slug]);
  return rows.map((r) => r.body);
}

/** Approves a pending line, optionally with fixed-up text. */
export async function approveLine(db: Db, id: number, body?: string): Promise<"ok" | "duplicate"> {
  try {
    await db.query(`UPDATE entries SET status = 'approved', body = COALESCE($2, body) WHERE id = $1 AND status = 'pending'`, [
      id,
      body ?? null,
    ]);
    return "ok";
  } catch (e) {
    if (isUniqueViolation(e)) return "duplicate";
    throw e;
  }
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505";
}

export type EditableLine = { id: number; body: string; status: "pending" | "approved" | "rejected"; shownOn: string | null } & LineRating;

/** Every line of a pack, for the admin editor. Newest last. */
export async function listPackLines(db: Db, slug: string): Promise<EditableLine[]> {
  return db.query<EditableLine>(
    `SELECT e.id, e.body, e.status, e.shown_on::text AS "shownOn", ${LINE_RATING} FROM entries e WHERE e.pack_slug = $1 ORDER BY e.id`,
    [slug],
  );
}

/** Fixes a line's text. */
export async function updateLine(db: Db, id: number, edit: { body: string }): Promise<"ok" | "duplicate" | "missing"> {
  try {
    const rows = await db.query(`UPDATE entries SET body = $2 WHERE id = $1 RETURNING 1`, [id, edit.body]);
    return rows.length ? "ok" : "missing";
  } catch (e) {
    if (isUniqueViolation(e)) return "duplicate";
    throw e;
  }
}

/** Fixes a pack's wording. The name (address) can't change. */
export async function updatePack(
  db: Db,
  slug: string,
  edit: { description: string; noun: string; meterLabel: string; author: string | null },
): Promise<boolean> {
  const rows = await db.query(
    `UPDATE packs SET description = $2, noun = $3, meter_label = $4, author = $5 WHERE slug = $1 RETURNING 1`,
    [slug, edit.description, edit.noun, edit.meterLabel, edit.author],
  );
  return rows.length > 0;
}

/** Rejected lines are kept (so they can't be resubmitted), just never shown. */
export async function rejectLine(db: Db, id: number): Promise<void> {
  await db.query(`UPDATE entries SET status = 'rejected' WHERE id = $1 AND status = 'pending'`, [id]);
}

// ---------- pitches, the pile and launching ----------

export type NewPack = {
  slug: string;
  description: string;
  noun: string;
  meterLabel: string;
  author: string | null;
  lines: string[];
};

/** A reader's pitch: a pending pack plus its lines, waiting for admin. */
export async function addPitch(
  db: Db,
  p: NewPack & { ipHash: string },
): Promise<"ok" | "duplicate" | "taken" | "unavailable"> {
  const inserted = await db.query(
    `INSERT INTO packs (slug, description, noun, meter_label, author, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING 1`,
    [p.slug, p.description, p.noun, p.meterLabel, p.author, p.ipHash],
  );
  if (!inserted.length) {
    const status = (await getPack(db, p.slug))?.status;
    return status === "live" ? "taken" : status === "rejected" ? "unavailable" : "duplicate";
  }
  // Lines carry no IP so a pitch doesn't count against the per-line spam limit.
  await insertLines(db, p.slug, p.lines, { author: p.author, status: "pending", ipHash: null });
  return "ok";
}

/** Moves a pending pitch into the public pile. */
export async function moveToPile(db: Db, slug: string): Promise<void> {
  await db.query(`UPDATE packs SET status = 'pile' WHERE slug = $1 AND status = 'pending'`, [slug]);
}

/** Rejecting a pitch (pending or in the pile) keeps it, and its lines, marked rejected. */
export async function rejectPitch(db: Db, slug: string): Promise<void> {
  const rows = await db.query(
    `UPDATE packs SET status = 'rejected' WHERE slug = $1 AND status IN ('pending', 'pile') RETURNING 1`,
    [slug],
  );
  if (rows.length) await db.query(`UPDATE entries SET status = 'rejected' WHERE pack_slug = $1 AND status = 'pending'`, [slug]);
}

/** Makes a pile pack live: sets its colours and approves all its lines. */
export async function launchPack(db: Db, slug: string, opts: { day: string; tone?: Tone }): Promise<boolean> {
  const t = opts.tone ?? nextTone(await countLivePacks(db));
  const rows = await db.query(
    `UPDATE packs SET status = 'live', accent = $2, background = $3, launched_on = $4
     WHERE slug = $1 AND status = 'pile' RETURNING 1`,
    [slug, t.accent, t.background, opts.day],
  );
  if (!rows.length) return false;
  await db.query(`UPDATE entries SET status = 'approved' WHERE pack_slug = $1 AND status = 'pending'`, [slug]);
  return true;
}

/** Admin's own pack: live straight away, lines approved. */
export async function createPack(db: Db, p: NewPack & { day: string; tone?: Tone }): Promise<"ok" | "taken"> {
  const t = p.tone ?? nextTone(await countLivePacks(db));
  const inserted = await db.query(
    `INSERT INTO packs (slug, status, description, noun, meter_label, author, accent, background, launched_on)
     VALUES ($1, 'live', $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING RETURNING 1`,
    [p.slug, p.description, p.noun, p.meterLabel, p.author, t.accent, t.background, p.day],
  );
  if (!inserted.length) return "taken";
  await insertLines(db, p.slug, p.lines, { author: p.author, status: "approved", ipHash: null });
  return "ok";
}

// ---------- spam protection ----------

const RATE_TABLES = { reviews: "reviews", entries: "entries", packs: "packs" } as const;

/** How many rows this IP added to a table in the last few minutes. */
export async function recentCount(db: Db, table: keyof typeof RATE_TABLES, ipHash: string, minutes: number): Promise<number> {
  const rows = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${RATE_TABLES[table]} WHERE ip_hash = $1 AND created_at > now() - make_interval(mins => $2)`,
    [ipHash, minutes],
  );
  return rows[0]?.n ?? 0;
}

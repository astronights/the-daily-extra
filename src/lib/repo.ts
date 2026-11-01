// All database reads and writes. Every function takes the Db so tests
// can run against a fresh in-memory database.
import type { Db } from "./db.ts";
import { nextColor } from "./palette.ts";

export type Pack = {
  slug: string;
  description: string;
  noun: string;
  meterLabel: string;
  color: number;
  credit: string | null;
  launchedOn: string;
  followers: number;
};

export type Daily = { entryId: number; body: string; credit: string | null; level: number; day: string };

export type Report = { id: number; score: number; name: string | null; body: string; createdAt: number };

export type RatingSummary = { count: number; average: number; counts: [number, number, number, number, number] };

export type PileItem = {
  id: number;
  slug: string;
  description: string;
  votes: number;
  voted: boolean;
};

export type PendingLine = {
  id: number;
  packSlug: string;
  body: string;
  credit: string | null;
  createdAt: number;
};

export type PitchRow = {
  id: number;
  slug: string;
  description: string;
  noun: string;
  meterLabel: string;
  lines: string[];
  credit: string | null;
  votes: number;
  createdAt: number;
};

const PACK_COLUMNS = `p.slug, p.description, p.noun, p.meter_label AS "meterLabel", p.color::int AS color, p.credit,
  p.launched_on::text AS "launchedOn",
  (SELECT count(*)::int FROM follows f WHERE f.pack_slug = p.slug) AS followers`;

// ---------- packs ----------

export async function getPack(db: Db, slug: string): Promise<Pack | null> {
  const rows = await db.query<Pack>(`SELECT ${PACK_COLUMNS} FROM packs p WHERE p.slug = $1`, [slug]);
  return rows[0] ?? null;
}

/** Live packs, most followed first. Optional search over name and description. */
export async function listPacks(db: Db, q = ""): Promise<Pack[]> {
  const like = `%${q.toLowerCase().replace(/[%_\\]/g, "\\$&")}%`;
  return db.query<Pack>(
    `SELECT ${PACK_COLUMNS} FROM packs p
     WHERE $1 = '%%' OR lower(p.slug) LIKE $1 OR lower(p.description) LIKE $1
     ORDER BY followers DESC, p.created_at ASC`,
    [like],
  );
}

export async function followedPacks(db: Db, voter: string): Promise<Pack[]> {
  return db.query<Pack>(
    `SELECT ${PACK_COLUMNS} FROM packs p JOIN follows mine ON mine.pack_slug = p.slug AND mine.voter = $1
     ORDER BY mine.created_at ASC`,
    [voter],
  );
}

export async function isFollowing(db: Db, voter: string, slug: string): Promise<boolean> {
  const rows = await db.query(`SELECT 1 FROM follows WHERE voter = $1 AND pack_slug = $2`, [voter, slug]);
  return rows.length > 0;
}

/** Follows or unfollows. Returns whether the voter now follows the pack. */
export async function toggleFollow(db: Db, voter: string, slug: string): Promise<boolean> {
  const removed = await db.query(`DELETE FROM follows WHERE voter = $1 AND pack_slug = $2 RETURNING 1`, [voter, slug]);
  if (removed.length) return false;
  const added = await db.query(
    `INSERT INTO follows (voter, pack_slug) SELECT $1, slug FROM packs WHERE slug = $2 ON CONFLICT DO NOTHING RETURNING 1`,
    [voter, slug],
  );
  return added.length > 0;
}

// ---------- the daily pick ----------

async function readPick(db: Db, slug: string, day: string): Promise<Daily | null> {
  const rows = await db.query<Daily>(
    `SELECT e.id AS "entryId", e.body, e.credit, e.level::int AS level, d.day::text AS day
     FROM daily_picks d JOIN entries e ON e.id = d.entry_id
     WHERE d.pack_slug = $1 AND d.day = $2`,
    [slug, day],
  );
  return rows[0] ?? null;
}

/**
 * Today's line for a pack. Chosen once per day and stored, so everyone
 * sees the same one. Lines never shown come first; once every line has
 * been used, the least recently shown come back around.
 */
export async function getDaily(db: Db, slug: string, day: string, random: () => number = Math.random): Promise<Daily | null> {
  const existing = await readPick(db, slug, day);
  if (existing) return existing;

  const candidates = await db.query<{ id: number; last: string | null }>(
    `SELECT e.id, (SELECT max(d.day)::text FROM daily_picks d WHERE d.entry_id = e.id) AS last
     FROM entries e
     WHERE e.pack_slug = $1 AND e.status = 'approved'
     ORDER BY last ASC NULLS FIRST, e.id ASC
     LIMIT 200`,
    [slug],
  );
  if (!candidates.length) return null;
  const oldest = candidates[0].last;
  const pool = candidates.filter((c) => c.last === oldest);
  const choice = pool[Math.floor(random() * pool.length)] ?? pool[0];

  await db.query(`INSERT INTO daily_picks (pack_slug, day, entry_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [
    slug,
    day,
    choice.id,
  ]);
  return readPick(db, slug, day);
}

/** How many approved lines a pack has left before it starts repeating. */
export async function unusedLineCount(db: Db, slug: string): Promise<number> {
  const rows = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM entries e
     WHERE e.pack_slug = $1 AND e.status = 'approved'
       AND NOT EXISTS (SELECT 1 FROM daily_picks d WHERE d.entry_id = e.id)`,
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
  r: { slug: string; day: string; score: number; name: string | null; body: string | null; ipHash: string },
): Promise<void> {
  await db.query(
    `INSERT INTO reviews (pack_slug, day, score, name, body, ip_hash) VALUES ($1, $2, $3, $4, $5, $6)`,
    [r.slug, r.day, r.score, r.name, r.body, r.ipHash],
  );
}

// ---------- submitted lines ----------

export async function addLine(
  db: Db,
  l: { slug: string; body: string; credit: string | null; ipHash: string },
): Promise<"ok" | "duplicate"> {
  const rows = await db.query(
    `INSERT INTO entries (pack_slug, body, credit, ip_hash) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id`,
    [l.slug, l.body, l.credit, l.ipHash],
  );
  return rows.length ? "ok" : "duplicate";
}

export async function listPendingLines(db: Db): Promise<PendingLine[]> {
  return db.query<PendingLine>(
    `SELECT id, pack_slug AS "packSlug", body, credit, (extract(epoch FROM created_at) * 1000)::float8 AS "createdAt"
     FROM entries WHERE status = 'pending' ORDER BY created_at ASC LIMIT 100`,
  );
}

export async function moderateLine(db: Db, id: number, decision: "approved" | "rejected", level: number): Promise<void> {
  await db.query(`UPDATE entries SET status = $2, level = $3 WHERE id = $1 AND status = 'pending'`, [id, decision, level]);
}

// ---------- pitches and the pile ----------

export async function addPitch(
  db: Db,
  p: { slug: string; description: string; noun: string; meterLabel: string; lines: string[]; credit: string | null; ipHash: string },
): Promise<"ok" | "duplicate" | "taken"> {
  if (await getPack(db, p.slug)) return "taken";
  const rows = await db.query(
    `INSERT INTO pitches (slug, description, noun, meter_label, lines, credit, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING RETURNING id`,
    [p.slug, p.description, p.noun, p.meterLabel, p.lines.join("\n"), p.credit, p.ipHash],
  );
  return rows.length ? "ok" : "duplicate";
}

/** Public pile: pitches you approved, most upvoted first. */
export async function listPile(db: Db, voter: string | null, opts: { q?: string; limit?: number } = {}): Promise<PileItem[]> {
  const like = `%${(opts.q ?? "").toLowerCase().replace(/[%_\\]/g, "\\$&")}%`;
  return db.query<PileItem>(
    `SELECT p.id, p.slug, p.description,
       (SELECT count(*)::int FROM pitch_votes v WHERE v.pitch_id = p.id) AS votes,
       EXISTS (SELECT 1 FROM pitch_votes v WHERE v.pitch_id = p.id AND v.voter = $1) AS voted
     FROM pitches p
     WHERE p.status = 'pile' AND ($2 = '%%' OR lower(p.slug) LIKE $2 OR lower(p.description) LIKE $2)
     ORDER BY votes DESC, p.created_at ASC
     LIMIT $3`,
    [voter ?? "", like, opts.limit ?? 50],
  );
}

/** Upvotes or removes the upvote. Only pitches in the pile can be voted on. */
export async function toggleVote(db: Db, pitchId: number, voter: string): Promise<boolean> {
  const removed = await db.query(`DELETE FROM pitch_votes WHERE pitch_id = $1 AND voter = $2 RETURNING 1`, [pitchId, voter]);
  if (removed.length) return false;
  const added = await db.query(
    `INSERT INTO pitch_votes (pitch_id, voter) SELECT id, $2 FROM pitches WHERE id = $1 AND status = 'pile'
     ON CONFLICT DO NOTHING RETURNING 1`,
    [pitchId, voter],
  );
  return added.length > 0;
}

export async function listPitches(db: Db, status: "pending" | "pile"): Promise<PitchRow[]> {
  const rows = await db.query<Omit<PitchRow, "lines"> & { lines: string }>(
    `SELECT p.id, p.slug, p.description, p.noun, p.meter_label AS "meterLabel", p.lines, p.credit,
       (SELECT count(*)::int FROM pitch_votes v WHERE v.pitch_id = p.id) AS votes,
       (extract(epoch FROM p.created_at) * 1000)::float8 AS "createdAt"
     FROM pitches p WHERE p.status = $1
     ORDER BY ${status === "pile" ? "votes DESC, " : ""}p.created_at ASC LIMIT 100`,
    [status],
  );
  return rows.map((r) => ({ ...r, lines: r.lines.split("\n") }));
}

export async function setPitchStatus(db: Db, id: number, status: "pile" | "rejected"): Promise<void> {
  await db.query(`UPDATE pitches SET status = $2 WHERE id = $1 AND status IN ('pending', 'pile')`, [id, status]);
}

export type NewPack = {
  slug: string;
  description: string;
  noun: string;
  meterLabel: string;
  credit: string | null;
  lines: string[];
  /** Palette index. Omit to take the next colour in the cycle. */
  color?: number | null;
  launchedOn: string;
};

/** Creates a live pack with its lines already approved. */
export async function createPack(db: Db, p: NewPack): Promise<"ok" | "taken"> {
  const count = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM packs`);
  const color = p.color ?? nextColor(count[0]?.n ?? 0);
  const inserted = await db.query(
    `INSERT INTO packs (slug, description, noun, meter_label, color, credit, launched_on)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING RETURNING 1`,
    [p.slug, p.description, p.noun, p.meterLabel, color, p.credit, p.launchedOn],
  );
  if (!inserted.length) return "taken";

  for (let i = 0; i < p.lines.length; i += 200) {
    const chunk = p.lines.slice(i, i + 200);
    const values = chunk.map((_, j) => `($1, $2, $${j + 3}, 'approved')`).join(", ");
    await db.query(`INSERT INTO entries (pack_slug, credit, body, status) VALUES ${values} ON CONFLICT DO NOTHING`, [
      p.slug,
      p.credit,
      ...chunk,
    ]);
  }
  return "ok";
}

/**
 * Turns a pile pitch into a live pack. Its lines become the pack's
 * approved lines (credited to the pitcher) and it gets the next colour
 * in the cycle unless one is given.
 */
export async function launchPitch(
  db: Db,
  id: number,
  opts: { day: string; color?: number | null },
): Promise<"ok" | "missing" | "taken"> {
  const rows = await db.query<{ slug: string; description: string; noun: string; meterLabel: string; lines: string; credit: string | null }>(
    `SELECT slug, description, noun, meter_label AS "meterLabel", lines, credit FROM pitches WHERE id = $1 AND status = 'pile'`,
    [id],
  );
  const p = rows[0];
  if (!p) return "missing";
  const result = await createPack(db, {
    ...p,
    lines: p.lines.split("\n").filter(Boolean),
    color: opts.color,
    launchedOn: opts.day,
  });
  if (result === "ok") await db.query(`UPDATE pitches SET status = 'launched' WHERE id = $1`, [id]);
  return result;
}

// ---------- spam protection ----------

const RATE_TABLES = { reviews: "reviews", entries: "entries", pitches: "pitches" } as const;

/** How many rows this IP added to a table in the last few minutes. */
export async function recentCount(db: Db, table: keyof typeof RATE_TABLES, ipHash: string, minutes: number): Promise<number> {
  const rows = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${RATE_TABLES[table]} WHERE ip_hash = $1 AND created_at > now() - make_interval(mins => $2)`,
    [ipHash, minutes],
  );
  return rows[0]?.n ?? 0;
}

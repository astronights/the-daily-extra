import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "../src/lib/db.ts";
import { runMigrations } from "../src/lib/migrations.ts";
import { PALETTE } from "../src/lib/palette.ts";
import * as repo from "../src/lib/repo.ts";

const DAY = "2026-11-01";
const lines = (n: number, prefix = "line") => Array.from({ length: n }, (_, i) => `${prefix} number ${i + 1} is here`);
const DRAMA_LINES = 30;
const pitch = { slug: "excuses", description: "An excuse a day", noun: "excuse", meterLabel: "Believability", author: "@bail", ipHash: "x" };

let db: Db;

beforeEach(async () => {
  db = await createPgliteDb();
  await runMigrations(db);
  await repo.createPack(db, {
    slug: "drama",
    description: "Start a little chaos",
    noun: "drama",
    meterLabel: "Spice",
    author: null,
    lines: lines(DRAMA_LINES, "drama"),
    day: DAY,
  });
});

const day = (offset: number) => new Date(Date.UTC(2026, 10, 1 + offset)).toISOString().slice(0, 10);

async function tableNames(d: Db): Promise<string[]> {
  const rows = await d.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
  );
  return rows.map((r) => r.table_name);
}

describe("migrations", () => {
  it("create the three tables, no data, and skip files that already ran", async () => {
    const fresh = await createPgliteDb();
    expect(await runMigrations(fresh)).toEqual(["0001_init.sql", "0002_ratings_set_level.sql"]);
    expect(await runMigrations(fresh)).toEqual([]);
    expect(await tableNames(fresh)).toEqual(["entries", "packs", "reviews", "schema_migrations"]);
    expect(await repo.listLivePacks(fresh)).toEqual([]);
  });

  it("index the lookups the site makes", async () => {
    const rows = await db.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`);
    const names = rows.map((r) => r.indexname);
    for (const idx of [
      "packs_status_followers_idx",
      "packs_status_votes_idx",
      "packs_ip_recent_idx",
      "entries_pack_body_uniq",
      "entries_pack_day_uniq",
      "entries_rotation_idx",
      "entries_pending_idx",
      "entries_ip_recent_idx",
      "reviews_pack_day_idx",
      "reviews_ip_recent_idx",
      "reviews_entry_idx",
    ]) {
      expect(names).toContain(idx);
    }
  });
});

describe("createPack", () => {
  it("creates a live pack with approved lines and the first colours", async () => {
    const pack = await repo.getLivePack(db, "drama");
    expect(pack).toMatchObject({ status: "live", noun: "drama", meterLabel: "Spice", accent: PALETTE[0].accent, background: PALETTE[0].background, launchedOn: DAY });
    expect(await repo.unusedLineCount(db, "drama")).toBe(DRAMA_LINES);
    const again = await repo.createPack(db, { ...pitch, slug: "drama", lines: [], day: DAY });
    expect(again).toBe("taken");
  });

  it("gives the next pack the next colour", async () => {
    await repo.createPack(db, { ...pitch, lines: lines(100), day: DAY });
    expect((await repo.getPack(db, "excuses"))?.accent).toBe(PALETTE[1].accent);
  });
});

describe("getDaily", () => {
  it("picks one line per day and keeps it", async () => {
    const a = await repo.getDaily(db, "drama", DAY);
    const b = await repo.getDaily(db, "drama", DAY);
    expect(a).not.toBeNull();
    expect(b?.entryId).toBe(a?.entryId);
  });

  it("does not repeat until every line has been used, then recycles the oldest", async () => {
    const seen: number[] = [];
    for (let i = 0; i < DRAMA_LINES; i++) seen.push((await repo.getDaily(db, "drama", day(i)))!.entryId);
    expect(new Set(seen).size).toBe(DRAMA_LINES);
    expect(await repo.unusedLineCount(db, "drama")).toBe(0);
    const next = await repo.getDaily(db, "drama", day(DRAMA_LINES));
    expect(next?.entryId).toBe(seen[0]);
  });

  it("returns null when a pack has no approved lines", async () => {
    expect(await repo.getDaily(db, "nope", DAY)).toBeNull();
  });
});

describe("reviews", () => {
  it("summarise scores and list only reviews with text", async () => {
    const { entryId } = (await repo.getDaily(db, "drama", DAY))!;
    await repo.addReview(db, { slug: "drama", day: DAY, entryId, score: 5, name: "a", body: "wild", ipHash: "x" });
    await repo.addReview(db, { slug: "drama", day: DAY, entryId, score: 2, name: null, body: null, ipHash: "x" });
    await repo.addReview(db, { slug: "drama", day: DAY, entryId, score: 4, name: null, body: "fine", ipHash: "y" });

    expect(await repo.ratingSummary(db, "drama", DAY)).toEqual({ count: 3, average: 3.7, counts: [0, 1, 0, 1, 1] });
    expect((await repo.listReports(db, "drama", DAY)).total).toBe(2);
    expect((await repo.listReports(db, "drama", DAY, { sort: "high" })).reports.map((r) => r.score)).toEqual([5, 4]);
    expect((await repo.listReports(db, "drama", DAY, { sort: "low", limit: 1 })).reports.map((r) => r.score)).toEqual([4]);
  });

  it("count recent posts per IP for rate limiting", async () => {
    const { entryId } = (await repo.getDaily(db, "drama", DAY))!;
    await repo.addReview(db, { slug: "drama", day: DAY, entryId, score: 3, name: null, body: null, ipHash: "ip1" });
    await repo.addReview(db, { slug: "drama", day: DAY, entryId, score: 3, name: null, body: null, ipHash: "ip1" });
    expect(await repo.recentCount(db, "reviews", "ip1", 10)).toBe(2);
    expect(await repo.recentCount(db, "reviews", "ip2", 10)).toBe(0);
  });

  it("set each line's meter from its ratings, across every day it's shown", async () => {
    const first = (await repo.getDaily(db, "drama", DAY))!;
    expect(first).toMatchObject({ avgScore: null, ratings: 0 });
    await repo.addReview(db, { slug: "drama", day: DAY, entryId: first.entryId, score: 5, name: null, body: null, ipHash: "a" });
    await repo.addReview(db, { slug: "drama", day: DAY, entryId: first.entryId, score: 4, name: null, body: null, ipHash: "b" });
    expect(await repo.getDaily(db, "drama", DAY)).toMatchObject({ avgScore: 4.5, ratings: 2 });

    // Use up every line so the first one comes back around; its ratings come with it.
    for (let i = 1; i <= DRAMA_LINES; i++) await repo.getDaily(db, "drama", day(i));
    const back = (await repo.getDaily(db, "drama", day(DRAMA_LINES)))!;
    expect(back.entryId).toBe(first.entryId);
    await repo.addReview(db, { slug: "drama", day: day(DRAMA_LINES), entryId: back.entryId, score: 3, name: null, body: null, ipHash: "c" });
    expect(await repo.getDaily(db, "drama", day(DRAMA_LINES))).toMatchObject({ avgScore: 4, ratings: 3 });
    // Today's verdict still only counts today's reviews.
    expect((await repo.ratingSummary(db, "drama", day(DRAMA_LINES))).count).toBe(1);
  });
});

describe("submitted lines", () => {
  it("queue, block duplicates, and join the rotation once approved", async () => {
    expect(await repo.addLine(db, { slug: "drama", body: "Who is Kevin?", author: "@me", ipHash: "x" })).toBe("ok");
    expect(await repo.addLine(db, { slug: "drama", body: "who is kevin?", author: null, ipHash: "x" })).toBe("duplicate");
    expect(await repo.addLine(db, { slug: "nope", body: "Who is Kevin?", author: null, ipHash: "x" })).toBe("missing");
    const [pending] = await repo.listPendingLines(db);
    expect(pending).toMatchObject({ packSlug: "drama", body: "Who is Kevin?", author: "@me" });

    await repo.approveLine(db, pending.id);
    expect(await repo.unusedLineCount(db, "drama")).toBe(DRAMA_LINES + 1);
    expect(await repo.listPendingLines(db)).toHaveLength(0);
  });

  it("keep rejected lines so they can't be resubmitted", async () => {
    await repo.addLine(db, { slug: "drama", body: "Bad line here", author: null, ipHash: "x" });
    const [pending] = await repo.listPendingLines(db);
    await repo.rejectLine(db, pending.id);
    expect(await repo.listPendingLines(db)).toHaveLength(0);
    expect(await repo.packLines(db, "drama")).toContain("Bad line here");
    expect(await repo.addLine(db, { slug: "drama", body: "Bad line here", author: null, ipHash: "x" })).toBe("duplicate");
  });
});

describe("followers and votes (counts only)", () => {
  it("change follower counts on live packs, never below zero", async () => {
    expect(await repo.changeFollowers(db, "drama", 1)).toBe(true);
    expect(await repo.changeFollowers(db, "drama", 1)).toBe(true);
    expect((await repo.getPack(db, "drama"))?.followers).toBe(2);
    await repo.changeFollowers(db, "drama", -1);
    await repo.changeFollowers(db, "drama", -1);
    await repo.changeFollowers(db, "drama", -1);
    expect((await repo.getPack(db, "drama"))?.followers).toBe(0);
    expect(await repo.changeFollowers(db, "nope", 1)).toBe(false);
  });

  it("finds followed packs in cookie order", async () => {
    await repo.createPack(db, { ...pitch, lines: lines(100), day: DAY });
    expect((await repo.livePacksBySlugs(db, ["excuses", "gone", "drama"])).map((p) => p.slug)).toEqual(["excuses", "drama"]);
  });
});

describe("pitches, the pile and launching", () => {
  it("move a pitch from pending to the pile to live", async () => {
    expect(await repo.addPitch(db, { ...pitch, lines: lines(120) })).toBe("ok");
    expect(await repo.addPitch(db, { ...pitch, lines: lines(120) })).toBe("duplicate");
    expect(await repo.addPitch(db, { ...pitch, slug: "drama", lines: lines(120) })).toBe("taken");

    // Pitch lines wait with the pitch, not in the line queue, and don't count toward spam limits.
    expect(await repo.listPendingLines(db)).toHaveLength(0);
    expect(await repo.packLines(db, "excuses")).toHaveLength(120);
    expect(await repo.recentCount(db, "entries", "x", 60)).toBe(0);
    expect(await repo.recentCount(db, "packs", "x", 60)).toBe(1);

    expect((await repo.listPacksByStatus(db, "pending")).map((p) => p.slug)).toEqual(["excuses"]);
    expect(await repo.changeVotes(db, "excuses", 1)).toBe(false); // not in the pile yet
    expect(await repo.getLivePack(db, "excuses")).toBeNull();

    await repo.moveToPile(db, "excuses");
    expect(await repo.changeVotes(db, "excuses", 1)).toBe(true);
    expect(await repo.changeVotes(db, "excuses", 1)).toBe(true);
    expect((await repo.listPile(db))[0]).toMatchObject({ slug: "excuses", votes: 2 });
    expect(await repo.listPile(db, { q: "nothing-matches" })).toHaveLength(0);

    expect(await repo.launchPack(db, "excuses", { day: DAY, tone: PALETTE[7] })).toBe(true);
    expect(await repo.getLivePack(db, "excuses")).toMatchObject({ accent: PALETTE[7].accent, background: PALETTE[7].background, author: "@bail", launchedOn: DAY });
    expect(await repo.unusedLineCount(db, "excuses")).toBe(120);
    expect(await repo.listPile(db)).toHaveLength(0);
    expect(await repo.launchPack(db, "excuses", { day: DAY })).toBe(false);
    expect((await repo.listLivePacks(db, "excuse")).map((p) => p.slug)).toEqual(["excuses"]);
  });

  it("keep rejected pitches, and their names stay taken", async () => {
    await repo.addPitch(db, { ...pitch, lines: lines(100) });
    await repo.rejectPitch(db, "excuses");
    expect(await repo.getPack(db, "excuses")).toMatchObject({ status: "rejected" });
    expect(await repo.packLines(db, "excuses")).toHaveLength(100);
    expect(await repo.listPacksByStatus(db, "pending")).toHaveLength(0);
    expect(await repo.addPitch(db, { ...pitch, lines: lines(100) })).toBe("unavailable");
    expect(await repo.launchPack(db, "excuses", { day: DAY })).toBe(false);
  });
});

describe("admin edits", () => {
  it("fix a pack's wording but not its name", async () => {
    expect(await repo.updatePack(db, "drama", { description: "Fixed typo", noun: "fight", meterLabel: "Toxicity", author: "@sam" })).toBe(true);
    expect(await repo.getPack(db, "drama")).toMatchObject({ slug: "drama", description: "Fixed typo", noun: "fight", meterLabel: "Toxicity", author: "@sam" });
    expect(await repo.updatePack(db, "nope", { description: "x", noun: "x", meterLabel: "x", author: null })).toBe(false);
  });

  it("fix a line's text, refusing duplicates", async () => {
    const [first, second] = await repo.listPackLines(db, "drama");
    expect(await repo.updateLine(db, first.id, { body: "Fixed the typo" })).toBe("ok");
    expect((await repo.listPackLines(db, "drama"))[0]).toMatchObject({ body: "Fixed the typo" });
    expect(await repo.updateLine(db, second.id, { body: "FIXED the typo" })).toBe("duplicate");
    expect(await repo.updateLine(db, 999999, { body: "Nope" })).toBe("missing");
  });

  it("can fix a submitted line while approving it", async () => {
    await repo.addLine(db, { slug: "drama", body: "Who is kevn?", author: null, ipHash: "x" });
    const [pending] = await repo.listPendingLines(db);
    expect(await repo.approveLine(db, pending.id, "Who is Kevin?")).toBe("ok");
    expect((await repo.listPackLines(db, "drama")).at(-1)).toMatchObject({ body: "Who is Kevin?", status: "approved" });
  });
});

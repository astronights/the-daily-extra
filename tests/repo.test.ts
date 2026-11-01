import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "../src/lib/db.ts";
import { runMigrations } from "../src/lib/migrations.ts";
import * as repo from "../src/lib/repo.ts";

const DAY = "2026-11-01";
let db: Db;

const lines = (n: number, prefix = "line") => Array.from({ length: n }, (_, i) => `${prefix} number ${i + 1} is here`);
const DRAMA_LINES = 30;

beforeEach(async () => {
  db = await createPgliteDb();
  await runMigrations(db);
  await repo.createPack(db, {
    slug: "drama",
    description: "Start a little chaos",
    noun: "drama",
    meterLabel: "Spice",
    credit: null,
    lines: lines(DRAMA_LINES, "drama"),
    launchedOn: DAY,
  });
});

describe("migrations", () => {
  it("start with no packs, and skip files that already ran", async () => {
    const fresh = await createPgliteDb();
    expect(await runMigrations(fresh)).toEqual(["0001_init.sql"]);
    expect(await runMigrations(fresh)).toEqual([]);
    expect(await repo.listPacks(fresh)).toEqual([]);
  });
});

describe("createPack", () => {
  it("creates a live pack with approved lines and the first colour", async () => {
    const pack = await repo.getPack(db, "drama");
    expect(pack).toMatchObject({ slug: "drama", noun: "drama", meterLabel: "Spice", color: 0, followers: 0 });
    expect(await repo.unusedLineCount(db, "drama")).toBe(DRAMA_LINES);
    expect(await repo.createPack(db, { ...pack!, lines: [], launchedOn: DAY })).toBe("taken");
  });
});

describe("getDaily", () => {
  it("picks one line per day and keeps it", async () => {
    const a = await repo.getDaily(db, "drama", DAY, () => 0.5);
    const b = await repo.getDaily(db, "drama", DAY, () => 0.1);
    expect(a).not.toBeNull();
    expect(b?.entryId).toBe(a?.entryId);
    expect(a?.day).toBe(DAY);
  });

  it("does not repeat until every line has been used", async () => {
    const seen = new Set<number>();
    for (let i = 0; i < DRAMA_LINES; i++) {
      const day = new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10);
      const pick = await repo.getDaily(db, "drama", day);
      seen.add(pick!.entryId);
    }
    expect(seen.size).toBe(DRAMA_LINES);
    expect(await repo.unusedLineCount(db, "drama")).toBe(0);
    // Day after the last: comes back around to an old line.
    expect(await repo.getDaily(db, "drama", "2027-06-01")).not.toBeNull();
  });

  it("returns null for a pack with no approved lines", async () => {
    expect(await repo.getDaily(db, "nope", DAY)).toBeNull();
  });
});

describe("reviews", () => {
  it("summarises scores and lists only reviews with text", async () => {
    await repo.getDaily(db, "drama", DAY);
    await repo.addReview(db, { slug: "drama", day: DAY, score: 5, name: "a", body: "wild", ipHash: "x" });
    await repo.addReview(db, { slug: "drama", day: DAY, score: 2, name: null, body: null, ipHash: "x" });
    await repo.addReview(db, { slug: "drama", day: DAY, score: 4, name: null, body: "fine", ipHash: "y" });

    const s = await repo.ratingSummary(db, "drama", DAY);
    expect(s).toEqual({ count: 3, average: 3.7, counts: [0, 1, 0, 1, 1] });

    const newest = await repo.listReports(db, "drama", DAY);
    expect(newest.total).toBe(2);
    const high = await repo.listReports(db, "drama", DAY, { sort: "high" });
    expect(high.reports.map((r) => r.score)).toEqual([5, 4]);
    const low = await repo.listReports(db, "drama", DAY, { sort: "low", limit: 1 });
    expect(low.reports.map((r) => r.score)).toEqual([4]);
  });

  it("counts recent posts per IP for rate limiting", async () => {
    await repo.getDaily(db, "drama", DAY);
    await repo.addReview(db, { slug: "drama", day: DAY, score: 3, name: null, body: null, ipHash: "ip1" });
    await repo.addReview(db, { slug: "drama", day: DAY, score: 3, name: null, body: null, ipHash: "ip1" });
    expect(await repo.recentCount(db, "reviews", "ip1", 10)).toBe(2);
    expect(await repo.recentCount(db, "reviews", "ip2", 10)).toBe(0);
  });
});

describe("submitted lines", () => {
  it("queues a line, rejects duplicates, and adds it to the rotation once approved", async () => {
    expect(await repo.addLine(db, { slug: "drama", body: "Who is Kevin?", credit: "@me", ipHash: "x" })).toBe("ok");
    expect(await repo.addLine(db, { slug: "drama", body: "who is kevin?", credit: null, ipHash: "x" })).toBe("duplicate");
    const [pending] = await repo.listPendingLines(db);
    expect(pending).toMatchObject({ packSlug: "drama", body: "Who is Kevin?", credit: "@me" });

    const before = await repo.unusedLineCount(db, "drama");
    await repo.moderateLine(db, pending.id, "approved", 5);
    expect(await repo.unusedLineCount(db, "drama")).toBe(before + 1);
    expect(await repo.listPendingLines(db)).toHaveLength(0);
  });
});

describe("follows", () => {
  it("toggles follows and counts followers", async () => {
    expect(await repo.toggleFollow(db, "v1", "drama")).toBe(true);
    expect(await repo.toggleFollow(db, "v2", "drama")).toBe(true);
    expect((await repo.getPack(db, "drama"))?.followers).toBe(2);
    expect((await repo.followedPacks(db, "v1")).map((p) => p.slug)).toEqual(["drama"]);
    expect(await repo.toggleFollow(db, "v1", "drama")).toBe(false);
    expect(await repo.isFollowing(db, "v1", "drama")).toBe(false);
    expect(await repo.toggleFollow(db, "v1", "missing-pack")).toBe(false);
  });
});

describe("pitches, the pile and launching", () => {
  const pitch = { slug: "excuses", description: "An excuse a day", noun: "excuse", meterLabel: "Believability", credit: "@bail", ipHash: "x" };

  it("moves a pitch from pending to the pile to a live pack", async () => {
    expect(await repo.addPitch(db, { ...pitch, lines: lines(120) })).toBe("ok");
    expect(await repo.addPitch(db, { ...pitch, slug: "EXCUSES", lines: lines(120) })).toBe("duplicate");
    expect(await repo.addPitch(db, { ...pitch, slug: "drama", lines: lines(120) })).toBe("taken");

    const [pending] = await repo.listPitches(db, "pending");
    expect(pending.lines).toHaveLength(120);
    expect(await repo.listPile(db, null)).toHaveLength(0);

    // Votes only count once it is in the pile.
    expect(await repo.toggleVote(db, pending.id, "v1")).toBe(false);
    await repo.setPitchStatus(db, pending.id, "pile");
    expect(await repo.toggleVote(db, pending.id, "v1")).toBe(true);
    expect(await repo.toggleVote(db, pending.id, "v2")).toBe(true);
    const pile = await repo.listPile(db, "v1");
    expect(pile[0]).toMatchObject({ slug: "excuses", votes: 2, voted: true });
    expect(await repo.listPile(db, "v1", { q: "nothing-matches" })).toHaveLength(0);
    expect(await repo.toggleVote(db, pending.id, "v1")).toBe(false);

    expect(await repo.launchPitch(db, pending.id, { day: DAY })).toBe("ok");
    const pack = await repo.getPack(db, "excuses");
    expect(pack).toMatchObject({ noun: "excuse", meterLabel: "Believability", color: 1, credit: "@bail", launchedOn: DAY });
    expect(await repo.unusedLineCount(db, "excuses")).toBe(120);
    expect(await repo.listPile(db, null)).toHaveLength(0);
    expect(await repo.launchPitch(db, pending.id, { day: DAY })).toBe("missing");
    expect((await repo.listPacks(db, "excuse")).map((p) => p.slug)).toEqual(["excuses"]);
  });

  it("uses a chosen colour when given", async () => {
    await repo.addPitch(db, { ...pitch, lines: lines(100) });
    const [p] = await repo.listPitches(db, "pending");
    await repo.setPitchStatus(db, p.id, "pile");
    await repo.launchPitch(db, p.id, { day: DAY, color: 7 });
    expect((await repo.getPack(db, "excuses"))?.color).toBe(7);
  });
});

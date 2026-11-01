import { describe, expect, it } from "vitest";
import { adminToken, hashIp, safeEqual } from "../src/lib/crypto.ts";
import { formatCountdown, formatDay, formatIssue, issueNumber, msUntilNextDay, timeAgo, utcDay } from "../src/lib/dates.ts";
import { PALETTE, nextColor, tone, toneStyle } from "../src/lib/palette.ts";
import { splitStatements } from "../src/lib/db.ts";
import {
  highlightParts,
  isBot,
  normalizeSlug,
  parseLine,
  parsePitch,
  parseReview,
  plainText,
  splitLines,
} from "../src/lib/validation.ts";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const many = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`).join("\n");

describe("dates", () => {
  const t = new Date("2026-11-01T10:17:52Z");
  it("uses UTC days", () => {
    expect(utcDay(t)).toBe("2026-11-01");
    expect(utcDay(new Date("2026-11-01T23:59:59Z"))).toBe("2026-11-01");
  });
  it("counts down to midnight UTC", () => {
    expect(formatCountdown(msUntilNextDay(t))).toBe("13:42:08");
    expect(formatCountdown(-5)).toBe("00:00:00");
  });
  it("numbers issues from launch day", () => {
    expect(issueNumber("2026-11-01", "2026-11-01")).toBe(1);
    expect(issueNumber("2026-10-19", "2026-11-01")).toBe(14);
    expect(formatIssue(14)).toBe("No. 014");
  });
  it("formats days and relative times", () => {
    expect(formatDay("2026-11-01")).toBe("Sun · Nov 1 2026");
    const now = Date.parse("2026-11-01T12:00:00Z");
    expect(timeAgo(now - 30_000, now)).toBe("just now");
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5m ago");
    expect(timeAgo(now - 2 * 3_600_000, now)).toBe("2h ago");
    expect(timeAgo(now - 3 * 86_400_000, now)).toBe("3d ago");
  });
});

describe("palette", () => {
  it("has 10 tones and cycles", () => {
    expect(PALETTE).toHaveLength(10);
    expect(nextColor(0)).toBe(0);
    expect(nextColor(10)).toBe(0);
    expect(nextColor(13)).toBe(3);
    expect(tone(11)).toBe(PALETTE[1]);
    expect(toneStyle(0)["--accent"]).toBe("#D6114A");
  });

  it("every accent passes 4.5:1 contrast with white text", () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const t of PALETTE) {
      expect(1.05 / (lum(t.accent) + 0.05), t.name).toBeGreaterThanOrEqual(4.5);
      expect((lum(t.ground) + 0.05) / (lum(t.text) + 0.05), t.name).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("validation", () => {
  it("parses reviews", () => {
    expect(parseReview(form({ score: "4", body: "  so   good ", name: "" }))).toEqual({ ok: true, value: { score: 4, name: null, body: "so good" } });
    expect(parseReview(form({ score: "6" }))).toMatchObject({ ok: false, errors: { score: expect.any(String) } });
    expect(parseReview(form({ score: "3", body: "x".repeat(501) }))).toMatchObject({ ok: false, errors: { body: expect.any(String) } });
  });

  it("parses submitted lines", () => {
    expect(parseLine(form({ body: "u up?" }))).toMatchObject({ ok: false, errors: { body: "Give us a bit more than that." } });
    expect(parseLine(form({ body: "Why is your phone face down?", credit: "@me" }))).toEqual({
      ok: true,
      value: { body: "Why is your phone face down?", credit: "@me" },
    });
  });

  it("splits pasted lines, dropping blanks and duplicates", () => {
    expect(splitLines("a\r\n\n  b  \nA\n b\nc   d")).toEqual(["a", "b", "c d"]);
  });

  it("normalises pack names", () => {
    expect(normalizeSlug(" /Bad Excuses ")).toBe("bad-excuses");
    expect(normalizeSlug("a__b--c")).toBe("a-b-c");
  });

  it("needs 100+ lines and a valid name to pitch", () => {
    const base = { slug: "excuses", description: "An excuse a day", noun: "Excuse", meterLabel: "Believability" };
    expect(parsePitch(form({ ...base, lines: many(100) }))).toMatchObject({ ok: true, value: { slug: "excuses", noun: "excuse" } });
    expect(parsePitch(form({ ...base, lines: many(99) }))).toMatchObject({ ok: false, errors: { lines: expect.stringContaining("You have 99") } });
    expect(parsePitch(form({ ...base, lines: many(1001) }))).toMatchObject({ ok: false, errors: { lines: expect.any(String) } });
    expect(parsePitch(form({ ...base, slug: "admin", lines: many(100) }))).toMatchObject({ ok: false, errors: { slug: expect.any(String) } });
    expect(parsePitch(form({ ...base, slug: "a", lines: many(100) }))).toMatchObject({ ok: false, errors: { slug: expect.any(String) } });
    const long = `${many(100)}\n${"x".repeat(201)}`;
    expect(parsePitch(form({ ...base, lines: long }))).toMatchObject({ ok: false, errors: { lines: "Line 101 is over 200 characters." } });
  });

  it("spots bots by the hidden field", () => {
    expect(isBot(form({ website: "spam.example" }))).toBe(true);
    expect(isBot(form({}))).toBe(false);
  });

  it("handles *highlights*", () => {
    expect(highlightParts("who is *Sam Gym* then")).toEqual([
      { text: "who is ", mark: false },
      { text: "Sam Gym", mark: true },
      { text: " then", mark: false },
    ]);
    expect(plainText("who is *Sam Gym* then")).toBe("who is Sam Gym then");
  });
});

describe("crypto", () => {
  it("hashes IPs and compares tokens safely", () => {
    expect(hashIp("s", "1.2.3.4")).toHaveLength(32);
    expect(hashIp("s", "1.2.3.4")).not.toBe(hashIp("t", "1.2.3.4"));
    expect(safeEqual(adminToken("s", "pw"), adminToken("s", "pw"))).toBe(true);
    expect(safeEqual(adminToken("s", "pw"), adminToken("s", "other"))).toBe(false);
    expect(safeEqual("a", "ab")).toBe(false);
  });
});

describe("splitStatements", () => {
  it("splits a migration into statements and drops comments", () => {
    expect(splitStatements("-- hi\nCREATE TABLE a (x int);\n\nCREATE INDEX b ON a (x);\n")).toEqual(["CREATE TABLE a (x int)", "CREATE INDEX b ON a (x)"]);
  });
});

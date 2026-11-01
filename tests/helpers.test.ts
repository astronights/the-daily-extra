import { describe, expect, it } from "vitest";
import { adminToken, hashIp, safeEqual } from "../src/lib/crypto.ts";
import { formatCountdown, formatDay, formatIssue, issueNumber, msUntilNextDay, timeAgo, utcDay } from "../src/lib/dates.ts";
import { PALETTE, nextTone, tone, toneStyle } from "../src/lib/palette.ts";
import { parseList, toggleInList } from "../src/lib/cookie-list.ts";
import { splitStatements } from "../src/lib/db.ts";
import {
  highlightParts,
  isBot,
  normalizeSlug,
  parseLine,
  parseLineEdit,
  parsePackEdit,
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
    expect(nextTone(0)).toBe(PALETTE[0]);
    expect(nextTone(10)).toBe(PALETTE[0]);
    expect(nextTone(13)).toBe(PALETTE[3]);
    expect(tone(11)).toBe(PALETTE[1]);
    expect(toneStyle("#6A2AE0", "#F3EEFF")).toEqual({ "--accent": "#6A2AE0", "--accent-text": "#6A2AE0", "--ground": "#F3EEFF" });
    expect(toneStyle(null, null)["--accent"]).toBe("#D6114A");
  });

  it("every accent passes 4.5:1 with white text, and as text on its background", () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const t of PALETTE) {
      expect(1.05 / (lum(t.accent) + 0.05), t.name).toBeGreaterThanOrEqual(4.5);
      expect((lum(t.background) + 0.05) / (lum(t.accent) + 0.05), t.name).toBeGreaterThanOrEqual(4.5);
      expect(t.accent).toMatch(/^#[0-9A-F]{6}$/);
      expect(t.background).toMatch(/^#[0-9A-F]{6}$/);
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

  it("needs 30+ lines and a valid name to pitch", () => {
    const base = { slug: "excuses", description: "An excuse a day", noun: "Excuse", meterLabel: "Believability" };
    expect(parsePitch(form({ ...base, lines: many(100) }))).toMatchObject({ ok: true, value: { slug: "excuses", noun: "excuse" } });
    expect(parsePitch(form({ ...base, lines: many(29) }))).toMatchObject({ ok: false, errors: { lines: expect.stringContaining("You have 29") } });
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

describe("cookie lists", () => {
  it("parse safely and toggle", () => {
    expect(parseList("drama,excuses,drama,Bad Name,,x")).toEqual(["drama", "excuses", "x"]);
    expect(parseList(undefined)).toEqual([]);
    expect(toggleInList(["drama"], "excuses")).toEqual({ list: ["drama", "excuses"], added: true });
    expect(toggleInList(["drama", "excuses"], "drama")).toEqual({ list: ["excuses"], added: false });
  });
});

describe("admin edit validation", () => {
  it("checks pack edits", () => {
    expect(parsePackEdit(form({ description: "A fight a day", noun: "Fight", meterLabel: "Toxicity", credit: "" }))).toEqual({
      ok: true,
      value: { description: "A fight a day", noun: "fight", meterLabel: "Toxicity", author: null },
    });
    expect(parsePackEdit(form({ description: "x", noun: "", meterLabel: "Toxicity" }))).toMatchObject({ ok: false });
  });
  it("checks line edits", () => {
    expect(parseLineEdit(form({ body: "  fixed   line ", level: "4" }))).toEqual({ ok: true, value: { body: "fixed line", level: 4 } });
    expect(parseLineEdit(form({ body: "", level: "4" }))).toMatchObject({ ok: false, errors: { body: expect.any(String) } });
    expect(parseLineEdit(form({ body: "ok", level: "9" }))).toMatchObject({ ok: false, errors: { level: expect.any(String) } });
  });
});

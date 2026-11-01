// Form parsing and validation. Returns either clean values or
// field-level error messages to show next to the inputs.

export type FieldErrors = Record<string, string>;
export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export const LIMITS = {
  name: 40,
  review: 500,
  lineMin: 10,
  lineMax: 200,
  /** Entries with line breaks (bullets, lists) get more room. */
  multiLineMax: 500,
  descriptionMin: 5,
  descriptionMax: 120,
  wordMax: 20,
  pitchLinesMin: 30,
  pitchLinesMax: 1000,
} as const;

/** Addresses a pack can never take, because the site uses them. */
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "explore",
  "pitch",
  "colours",
  "colors",
  "about",
  "reports",
  "static",
  "public",
]);

function text(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

function optional(value: string): string | null {
  return value === "" ? null : value;
}

export function intIn(raw: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

/** Bots fill in every field, including the hidden "website" one. */
export function isBot(form: FormData): boolean {
  return text(form, "website") !== "";
}

export type ReviewInput = { score: number; name: string | null; body: string | null };

export function parseReview(form: FormData): Parsed<ReviewInput> {
  const errors: FieldErrors = {};
  const score = intIn(text(form, "score"), 1, 5);
  const name = text(form, "name");
  const body = text(form, "body");
  if (score === null) errors.score = "Pick a score from 1 to 5.";
  if (name.length > LIMITS.name) errors.name = `Keep your name under ${LIMITS.name} characters.`;
  if (body.length > LIMITS.review) errors.body = `Keep it under ${LIMITS.review} characters.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { score: score!, name: optional(name), body: optional(body) } };
}

/**
 * Tidies one entry but keeps its line breaks: trims each line, squeezes
 * repeated spaces, drops empty lines inside it. "•" bullets become "- ".
 */
export function cleanEntry(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((l) => l.replace(/[^\S\n]+/g, " ").trim().replace(/^[•·*]\s+/, "- "))
    .filter(Boolean)
    .join("\n");
}

/** Longest allowed entry: more room when it spans several lines. */
export function maxLength(entry: string): number {
  return entry.includes("\n") ? LIMITS.multiLineMax : LIMITS.lineMax;
}

/** The text of a multi-line field, tidied with cleanEntry. */
function entryText(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? cleanEntry(v) : "";
}

export type LineInput = { body: string; credit: string | null };

export function parseLine(form: FormData): Parsed<LineInput> {
  const errors: FieldErrors = {};
  const body = entryText(form, "body");
  const credit = text(form, "credit");
  if (body.length < LIMITS.lineMin) errors.body = "Give us a bit more than that.";
  else if (body.length > maxLength(body)) errors.body = `Keep it under ${maxLength(body)} characters.`;
  if (credit.length > LIMITS.name) errors.credit = `Keep your handle under ${LIMITS.name} characters.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { body, credit: optional(credit) } };
}

/** "/Bad Excuses " -> "bad-excuses" */
export function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

/** How pasted text is split into entries. */
export type EntryFormat = "lines" | "blocks";

export function entryFormat(raw: unknown): EntryFormat {
  return raw === "blocks" ? "blocks" : "lines";
}

/**
 * Splits pasted text into entries, dropping blanks and case-insensitive
 * duplicates. Used in the browser (live counter) and on the server, so
 * both count the same way.
 *   "lines":  one entry per line
 *   "blocks": entries separated by a blank line; each can span lines
 */
export function splitEntries(raw: string, format: EntryFormat = "lines"): string[] {
  const parts = format === "blocks" ? raw.split(/\r?\n[^\S\r\n]*\r?\n/) : raw.split(/\r?\n/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const clean = format === "blocks" ? cleanEntry(part) : part.replace(/\s+/g, " ").trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

/** One entry per line. */
export function splitLines(raw: string): string[] {
  return splitEntries(raw, "lines");
}

export type PitchInput = {
  slug: string;
  description: string;
  noun: string;
  meterLabel: string;
  lines: string[];
  credit: string | null;
};

export function parsePitch(form: FormData): Parsed<PitchInput> {
  const errors: FieldErrors = {};
  const slug = normalizeSlug(text(form, "slug"));
  const description = text(form, "description");
  const noun = text(form, "noun").toLowerCase();
  const meterLabel = text(form, "meterLabel");
  const credit = text(form, "credit");
  const rawLines = form.get("lines");
  const lines = splitEntries(typeof rawLines === "string" ? rawLines : "", entryFormat(form.get("format")));

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 24) {
    errors.slug = "Use 2–24 letters, numbers or dashes.";
  } else if (RESERVED_SLUGS.has(slug)) {
    errors.slug = "That name is used by the site itself. Try another.";
  }
  if (description.length < LIMITS.descriptionMin) errors.description = "Tell us what it does.";
  else if (description.length > LIMITS.descriptionMax)
    errors.description = `Keep it under ${LIMITS.descriptionMax} characters.`;
  if (!noun) errors.noun = "What's one of these called?";
  else if (noun.length > LIMITS.wordMax) errors.noun = `Keep it under ${LIMITS.wordMax} characters.`;
  if (!meterLabel) errors.meterLabel = "What should each one be rated on?";
  else if (meterLabel.length > LIMITS.wordMax) errors.meterLabel = `Keep it under ${LIMITS.wordMax} characters.`;
  if (lines.length < LIMITS.pitchLinesMin) {
    errors.lines = `We need at least ${LIMITS.pitchLinesMin} different lines. You have ${lines.length}.`;
  } else if (lines.length > LIMITS.pitchLinesMax) {
    errors.lines = `Up to ${LIMITS.pitchLinesMax} lines per pitch.`;
  } else {
    const long = lines.findIndex((l) => l.length > maxLength(l));
    if (long !== -1) errors.lines = `Entry ${long + 1} is over ${maxLength(lines[long])} characters.`;
  }
  if (credit.length > LIMITS.name) errors.credit = `Keep your handle under ${LIMITS.name} characters.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { slug, description, noun, meterLabel, lines, credit: optional(credit) } };
}

export type PackEdit = { description: string; noun: string; meterLabel: string; author: string | null };

/** Admin fixing a pack's wording. Same rules as a pitch, minus name and lines. */
export function parsePackEdit(form: FormData): Parsed<PackEdit> {
  const errors: FieldErrors = {};
  const description = text(form, "description");
  const noun = text(form, "noun").toLowerCase();
  const meterLabel = text(form, "meterLabel");
  const author = text(form, "credit");
  if (description.length < LIMITS.descriptionMin) errors.description = "Tell us what it does.";
  else if (description.length > LIMITS.descriptionMax) errors.description = `Keep it under ${LIMITS.descriptionMax} characters.`;
  if (!noun || noun.length > LIMITS.wordMax) errors.noun = `1–${LIMITS.wordMax} characters.`;
  if (!meterLabel || meterLabel.length > LIMITS.wordMax) errors.meterLabel = `1–${LIMITS.wordMax} characters.`;
  if (author.length > LIMITS.name) errors.credit = `Keep it under ${LIMITS.name} characters.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { description, noun, meterLabel, author: optional(author) } };
}

/** Admin fixing a line: text 1–200 characters. */
export function parseLineEdit(form: FormData): Parsed<{ body: string }> {
  const body = entryText(form, "body");
  if (!body) return { ok: false, errors: { body: "The line can't be empty." } };
  if (body.length > maxLength(body)) return { ok: false, errors: { body: `Keep it under ${maxLength(body)} characters.` } };
  return { ok: true, value: { body } };
}

export type BodyBlock = { kind: "text"; text: string } | { kind: "list"; items: string[] };

/**
 * Groups an entry's lines for display: runs of "- " lines become a
 * bulleted list, every other line is its own line of text.
 */
export function bodyBlocks(body: string): BodyBlock[] {
  const blocks: BodyBlock[] = [];
  for (const line of body.split("\n")) {
    const bullet = /^- (.*)$/.exec(line);
    const last = blocks[blocks.length - 1];
    if (bullet) {
      if (last?.kind === "list") last.items.push(bullet[1]);
      else blocks.push({ kind: "list", items: [bullet[1]] });
    } else {
      blocks.push({ kind: "text", text: line });
    }
  }
  return blocks;
}

/** Splits "a *b* c" into plain and highlighted parts. */
export function highlightParts(body: string): Array<{ text: string; mark: boolean }> {
  return body
    .split(/\*([^*]+)\*/)
    .map((part, i) => ({ text: part, mark: i % 2 === 1 }))
    .filter((p) => p.text !== "");
}

/** The message as it should be sent: highlight markers removed. */
export function plainText(body: string): string {
  return body.replace(/\*([^*]+)\*/g, "$1");
}

// Form parsing and validation. Returns either clean values or
// field-level error messages to show next to the inputs.

export type FieldErrors = Record<string, string>;
export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export const LIMITS = {
  name: 40,
  review: 500,
  lineMin: 10,
  lineMax: 200,
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

export type LineInput = { body: string; credit: string | null };

export function parseLine(form: FormData): Parsed<LineInput> {
  const errors: FieldErrors = {};
  const body = text(form, "body");
  const credit = text(form, "credit");
  if (body.length < LIMITS.lineMin) errors.body = "Give us a bit more than that.";
  else if (body.length > LIMITS.lineMax) errors.body = `Keep it under ${LIMITS.lineMax} characters.`;
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

/**
 * Splits pasted text into lines: trims each, drops blanks and
 * case-insensitive duplicates. Used in the browser (live counter) and
 * on the server, so both count the same way.
 */
export function splitLines(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const clean = line.replace(/\s+/g, " ").trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
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
  const lines = splitLines(typeof rawLines === "string" ? rawLines : "");

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
    const long = lines.findIndex((l) => l.length > LIMITS.lineMax);
    if (long !== -1) errors.lines = `Line ${long + 1} is over ${LIMITS.lineMax} characters.`;
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
  const body = text(form, "body");
  if (!body) return { ok: false, errors: { body: "The line can't be empty." } };
  if (body.length > LIMITS.lineMax) return { ok: false, errors: { body: `Keep it under ${LIMITS.lineMax} characters.` } };
  return { ok: true, value: { body } };
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

// Form parsing and validation. Returns either clean values or
// field-level error messages to show next to the inputs.

export type FieldErrors = Record<string, string>;
export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export const LIMITS = {
  name: 40,
  review: 500,
  entryMin: 10,
  entryMax: 200,
  descriptionMin: 5,
  descriptionMax: 120,
  sampleMax: 200,
  samplesMax: 5,
} as const;

/** URLs that a pack can never take. */
export const RESERVED_SLUGS = new Set(["admin", "api", "about", "static", "public", "favicon.ico", "robots.txt", "sitemap.xml"]);

function text(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

function optional(value: string): string | null {
  return value === "" ? null : value;
}

function intIn(raw: string, min: number, max: number): number | null {
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

export type EntryInput = { body: string; credit: string | null; spice: number };

export function parseEntry(form: FormData): Parsed<EntryInput> {
  const errors: FieldErrors = {};
  const body = text(form, "body");
  const credit = text(form, "credit");
  const spiceRaw = text(form, "spice");
  const spice = spiceRaw === "" ? 3 : intIn(spiceRaw, 1, 5);
  if (body.length < LIMITS.entryMin) errors.body = "Give us a bit more than that.";
  else if (body.length > LIMITS.entryMax) errors.body = `Keep it under ${LIMITS.entryMax} characters.`;
  if (credit.length > LIMITS.name) errors.credit = `Keep your handle under ${LIMITS.name} characters.`;
  if (spice === null) errors.spice = "Spice goes from 1 to 5.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { body, credit: optional(credit), spice: spice! } };
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

export type PitchInput = { slug: string; description: string; samples: string[]; credit: string | null };

export function parsePitch(form: FormData): Parsed<PitchInput> {
  const errors: FieldErrors = {};
  const slug = normalizeSlug(text(form, "slug"));
  const description = text(form, "description");
  const credit = text(form, "credit");
  const rawSamples = form.get("samples");
  const samples = (typeof rawSamples === "string" ? rawSamples : "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 24) {
    errors.slug = "Use 2–24 letters, numbers or dashes.";
  } else if (RESERVED_SLUGS.has(slug)) {
    errors.slug = "That name is taken by the site itself. Try another.";
  }
  if (description.length < LIMITS.descriptionMin) errors.description = "Tell us what it does.";
  else if (description.length > LIMITS.descriptionMax)
    errors.description = `Keep it under ${LIMITS.descriptionMax} characters.`;
  if (samples.length > LIMITS.samplesMax) errors.samples = `Up to ${LIMITS.samplesMax} sample lines.`;
  else if (samples.some((s) => s.length > LIMITS.sampleMax))
    errors.samples = `Each line has to be under ${LIMITS.sampleMax} characters.`;
  if (credit.length > LIMITS.name) errors.credit = `Keep your handle under ${LIMITS.name} characters.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { slug, description, samples, credit: optional(credit) } };
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

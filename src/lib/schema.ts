// Database schema and starter content. Kept free of imports so the
// migrate script can load it directly with Node.

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS packs (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  tagline     TEXT NOT NULL,
  accent      TEXT NOT NULL DEFAULT '#D6114A',
  launched_on DATE NOT NULL,
  sort        INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS entries (
  id         SERIAL PRIMARY KEY,
  pack_slug  TEXT NOT NULL REFERENCES packs(slug),
  body       TEXT NOT NULL,
  credit     TEXT,
  spice      SMALLINT NOT NULL DEFAULT 3 CHECK (spice BETWEEN 1 AND 5),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  ip_hash    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS entries_body_uniq ON entries (pack_slug, lower(body));
CREATE INDEX IF NOT EXISTS entries_status_idx ON entries (pack_slug, status);

CREATE TABLE IF NOT EXISTS daily_picks (
  pack_slug TEXT NOT NULL REFERENCES packs(slug),
  day       DATE NOT NULL,
  entry_id  INT  NOT NULL REFERENCES entries(id),
  PRIMARY KEY (pack_slug, day)
);

CREATE TABLE IF NOT EXISTS reviews (
  id         SERIAL PRIMARY KEY,
  pack_slug  TEXT NOT NULL,
  day        DATE NOT NULL,
  score      SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  name       TEXT,
  body       TEXT,
  ip_hash    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (pack_slug, day) REFERENCES daily_picks (pack_slug, day)
);
CREATE INDEX IF NOT EXISTS reviews_day_idx ON reviews (pack_slug, day, created_at DESC);

CREATE TABLE IF NOT EXISTS pack_suggestions (
  id          SERIAL PRIMARY KEY,
  slug        TEXT NOT NULL,
  description TEXT NOT NULL,
  samples     TEXT NOT NULL DEFAULT '',
  credit      TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  ip_hash     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pack_suggestions_slug_uniq ON pack_suggestions (lower(slug));

CREATE TABLE IF NOT EXISTS suggestion_votes (
  suggestion_id INT  NOT NULL REFERENCES pack_suggestions(id) ON DELETE CASCADE,
  voter         TEXT NOT NULL,
  PRIMARY KEY (suggestion_id, voter)
);
`;

export const SEED_PACKS = [
  {
    slug: "drama",
    name: "Drama",
    tagline: "One message a day to start a little chaos in your relationship. Then rate how it went.",
    accent: "#D6114A",
    launchedOn: "2026-11-01",
    sort: 0,
  },
];

// [line, spice]. Wrap words in *asterisks* to highlight them.
export const SEED_DRAMA: Array<[string, number]> = [
  ["So who is *‘Sam Gym’* in your contacts, and why is there a heart next to their name?", 4],
  ["Why is my name saved as just my first name in your phone? Am I a plumber?", 3],
  ["Why does your ex still follow *my dog's* Instagram?", 4],
  ["Rank my friends. Out loud. Right now.", 5],
  ["You said ‘love you’ to the pizza guy. Explain.", 3],
  ["Who taught you to load the dishwasher like that? Was it your *ex*?", 4],
  ["If we broke up, who gets the friends? Think carefully.", 5],
  ["Be honest: what was your first impression of me? Your *real* one.", 3],
  ["Name one thing your ex did better than me. You have ten seconds.", 5],
  ["Why does your mum still have a photo of your ex on the fridge?", 4],
  ["You liked a photo from 2017 on someone's profile. Whose? *Why were you there?*", 5],
  ["Who is this ‘work wife’ everyone keeps mentioning?", 4],
  ["When you say ‘I'm fine’, what percentage of fine are we talking?", 2],
  ["You've said ‘interesting’ four times today and meant none of them.", 2],
  ["Why do you always take the *good* pillow?", 2],
  ["Did you or did you not finish the show without me?", 3],
  ["Your phone is face-down on the table. Again. Interesting choice.", 4],
  ["Who were you texting with that little smile just now?", 4],
  ["Why did you introduce me as ‘this is…’ and then just stop?", 3],
  ["Do you like my cooking, or do you like *not cooking*?", 3],
  ["Your mum likes me more than she likes you. We should talk about that.", 2],
  ["You ordered for me without asking. Do you think I'm *predictable*?", 2],
  ["Remember what you said at that wedding in 2022? Because I do.", 4],
  ["Why do you text your best friend faster than you text me?", 4],
  ["Which of my friends would you date if we broke up? Don't think, just answer.", 5],
  ["You paused our show to reply to someone. Who was worth it?", 3],
  ["Why is there a *second* toothbrush in your bathroom cupboard?", 5],
  ["You never asked about my dream from Tuesday. I told you it was important.", 2],
  ["Be honest. Who was your hall pass in 2019, and are they still?", 3],
  ["Why do you call your sister more than you call me?", 3],
];

/** Parameterised statements that insert the starter content. Safe to run again. */
export function seedStatements(): Array<{ text: string; params: unknown[] }> {
  const statements: Array<{ text: string; params: unknown[] }> = SEED_PACKS.map((p) => ({
    text: `INSERT INTO packs (slug, name, tagline, accent, launched_on, sort)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (slug) DO NOTHING`,
    params: [p.slug, p.name, p.tagline, p.accent, p.launchedOn, p.sort],
  }));

  const values: string[] = [];
  const params: unknown[] = [];
  SEED_DRAMA.forEach(([body, spice], i) => {
    values.push(`('drama', $${i * 2 + 1}, $${i * 2 + 2}, 'approved')`);
    params.push(body, spice);
  });
  statements.push({
    text: `INSERT INTO entries (pack_slug, body, spice, status) VALUES ${values.join(", ")} ON CONFLICT DO NOTHING`,
    params,
  });
  return statements;
}

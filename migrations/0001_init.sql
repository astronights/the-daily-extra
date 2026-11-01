-- Initial schema: packs, lines, daily picks, reviews, follows, pitches.
CREATE TABLE IF NOT EXISTS packs (
  slug        TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  noun        TEXT NOT NULL,
  meter_label TEXT NOT NULL,
  color       SMALLINT NOT NULL DEFAULT 0,
  credit      TEXT,
  launched_on DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entries (
  id         SERIAL PRIMARY KEY,
  pack_slug  TEXT NOT NULL REFERENCES packs(slug),
  body       TEXT NOT NULL,
  credit     TEXT,
  level      SMALLINT NOT NULL DEFAULT 3 CHECK (level BETWEEN 1 AND 5),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  ip_hash    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS entries_body_uniq ON entries (pack_slug, lower(body));
CREATE INDEX IF NOT EXISTS entries_status_idx ON entries (status, created_at);

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

CREATE TABLE IF NOT EXISTS follows (
  voter      TEXT NOT NULL,
  pack_slug  TEXT NOT NULL REFERENCES packs(slug),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (voter, pack_slug)
);
CREATE INDEX IF NOT EXISTS follows_pack_idx ON follows (pack_slug);

CREATE TABLE IF NOT EXISTS pitches (
  id          SERIAL PRIMARY KEY,
  slug        TEXT NOT NULL,
  description TEXT NOT NULL,
  noun        TEXT NOT NULL,
  meter_label TEXT NOT NULL,
  lines       TEXT NOT NULL,
  credit      TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'pile', 'rejected', 'launched')),
  ip_hash     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pitches_slug_uniq ON pitches (lower(slug));

CREATE TABLE IF NOT EXISTS pitch_votes (
  pitch_id INT  NOT NULL REFERENCES pitches(id) ON DELETE CASCADE,
  voter    TEXT NOT NULL,
  PRIMARY KEY (pitch_id, voter)
);

-- Initial schema: packs, entries (lines), reviews.
-- Follows and upvotes live in each visitor's cookies; the tables keep counts only.
-- Nothing is deleted: rejected packs and lines are kept with status 'rejected'.

-- One row per pack, from pitch to live.
--   pending: pitched, waiting for admin
--   pile:    approved idea, public for upvotes, no page yet
--   live:    has a page and a daily line
--   rejected: turned down; kept for the record, and its name stays taken
CREATE TABLE IF NOT EXISTS packs (
  slug        TEXT PRIMARY KEY CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'pile', 'live', 'rejected')),
  description TEXT NOT NULL,
  noun        TEXT NOT NULL,
  meter_label TEXT NOT NULL,
  accent      TEXT CHECK (accent ~ '^#[0-9A-F]{6}$'),
  background  TEXT CHECK (background ~ '^#[0-9A-F]{6}$'),
  author      TEXT,
  votes       INT NOT NULL DEFAULT 0 CHECK (votes >= 0),
  followers   INT NOT NULL DEFAULT 0 CHECK (followers >= 0),
  launched_on DATE,
  ip_hash     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Live packs by popularity; the pile by votes.
CREATE INDEX IF NOT EXISTS packs_status_followers_idx ON packs (status, followers DESC);
CREATE INDEX IF NOT EXISTS packs_status_votes_idx ON packs (status, votes DESC);
-- Spam limit: recent pitches per IP.
CREATE INDEX IF NOT EXISTS packs_ip_recent_idx ON packs (ip_hash, created_at);

-- One row per line.
--   pending:  waiting for admin (or part of a pitch not yet launched)
--   approved: in the daily rotation
--   rejected: turned down; kept so the same line can't be resubmitted
-- shown_on is the day it was the daily; at most one line per pack per day.
CREATE TABLE IF NOT EXISTS entries (
  id         SERIAL PRIMARY KEY,
  pack_slug  TEXT NOT NULL REFERENCES packs(slug) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  author     TEXT,
  level      SMALLINT NOT NULL DEFAULT 3 CHECK (level BETWEEN 1 AND 5),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  shown_on   DATE,
  ip_hash    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- No duplicate lines within a pack (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS entries_pack_body_uniq ON entries (pack_slug, lower(body));
-- Today's line lookup, and only one line per pack per day.
CREATE UNIQUE INDEX IF NOT EXISTS entries_pack_day_uniq ON entries (pack_slug, shown_on) WHERE shown_on IS NOT NULL;
-- Picking the next line: never shown first, then least recently shown.
CREATE INDEX IF NOT EXISTS entries_rotation_idx ON entries (pack_slug, shown_on NULLS FIRST) WHERE status = 'approved';
-- Admin queue and pitch lines.
CREATE INDEX IF NOT EXISTS entries_pending_idx ON entries (pack_slug, created_at) WHERE status = 'pending';
-- Spam limit: recent lines per IP.
CREATE INDEX IF NOT EXISTS entries_ip_recent_idx ON entries (ip_hash, created_at);

-- A score (and optional review) for one pack's daily on one day.
CREATE TABLE IF NOT EXISTS reviews (
  id         SERIAL PRIMARY KEY,
  pack_slug  TEXT NOT NULL REFERENCES packs(slug) ON DELETE CASCADE,
  day        DATE NOT NULL,
  score      SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  name       TEXT,
  body       TEXT,
  ip_hash    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- A day's reviews, newest first; also used for the score summary.
CREATE INDEX IF NOT EXISTS reviews_pack_day_idx ON reviews (pack_slug, day, created_at DESC);
-- Spam limit: recent reviews per IP.
CREATE INDEX IF NOT EXISTS reviews_ip_recent_idx ON reviews (ip_hash, created_at);

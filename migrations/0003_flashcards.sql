-- Flashcard packs: each entry has a front (body) and a back revealed on tap.
--   kind 'lines': one line a day (the default, as before)
--   kind 'cards': one flashcard a day
ALTER TABLE packs ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'lines' CHECK (kind IN ('lines', 'cards'));

-- The answer side of a flashcard. Empty for line packs.
ALTER TABLE entries ADD COLUMN IF NOT EXISTS back TEXT;

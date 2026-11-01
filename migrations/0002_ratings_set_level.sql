-- A line's meter now comes from readers' ratings instead of a level set by hand.
-- Reviews record which line they rated, so a line's average follows it across
-- every day it's shown.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS entry_id INT REFERENCES entries(id) ON DELETE CASCADE;

-- Link existing reviews to the line that was shown that day.
UPDATE reviews r SET entry_id = e.id
FROM entries e
WHERE r.entry_id IS NULL AND e.pack_slug = r.pack_slug AND e.shown_on = r.day;

-- A line's average rating.
CREATE INDEX IF NOT EXISTS reviews_entry_idx ON reviews (entry_id);

ALTER TABLE entries DROP COLUMN IF EXISTS level;

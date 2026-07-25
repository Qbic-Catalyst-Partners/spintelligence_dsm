-- Rename ticketing_system.screen_submission_frequency columns to match the UI labels:
-- frequency (day-window, e.g. Daily=1/Weekly=7) -> range
-- occurrences (required count, e.g. 4)          -> frequency
-- A temp name is needed since both columns are swapping names.
-- Run this against both the local Postgres database and Supabase.

ALTER TABLE ticketing_system.screen_submission_frequency
  RENAME COLUMN occurrences TO frequency_new;

ALTER TABLE ticketing_system.screen_submission_frequency
  RENAME COLUMN frequency TO range;

ALTER TABLE ticketing_system.screen_submission_frequency
  RENAME COLUMN frequency_new TO frequency;

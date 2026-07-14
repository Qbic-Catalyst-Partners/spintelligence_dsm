-- Remove drum range columns from autoconer.count_wise_cuts.
-- Run this against both the local Postgres database and Supabase.

ALTER TABLE autoconer.count_wise_cuts
  DROP COLUMN IF EXISTS drum_from,
  DROP COLUMN IF EXISTS drum_to;

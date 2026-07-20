-- Rename cvd column to cvp in autoconer.count_wise_cuts to match the UI field name.
-- Run this against both the local Postgres database and Supabase.

ALTER TABLE autoconer.count_wise_cuts
  RENAME COLUMN cvd TO cvp;

-- ============================================================================
-- FULL PRODUCTION WIPE — keep only ADMIN001 / Hency Belix in users.user_details
--
-- DO NOT RUN THIS UNTIL YOU HAVE:
--   1. A verified, restorable pg_dump of BOTH databases (primary + Supabase
--      mirror) taken in the last few minutes. Not "a backup exists somewhere"
--      — actually test-restore it or at minimum confirm file size/row counts
--      look sane. Example:
--        pg_dump "$DATABASE_URL"          -Fc -f primary_backup.dump
--        pg_dump "$DATABASE_URL_SUPABASE" -Fc -f supabase_backup.dump
--   2. Confirmed the row you want to keep actually exists (see STEP 0 below —
--      as of this writing, "Hency Belix" / ADMIN001 was NOT found in this
--      repo's data or code, only as an unrelated placeholder value). If the
--      row doesn't exist, this script creates it from the fallback values
--      below — EDIT THOSE VALUES FIRST.
--   3. Run this against ONE database at a time, reviewing output each time.
--      Run it manually in the Supabase SQL editor / psql — do not wire it
--      into the app.
--   4. Confirmed no one is actively using the app during this run — it drops
--      every ticket, notification, QC entry, threshold, role assignment,
--      activity log, etc. across every schema.
--
-- This truncates ALL tables in ALL non-system schemas, then restores exactly
-- one row in users.user_details. Everything else — tickets, QC data,
-- thresholds, notifications, logs, roles, departments — is gone.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- STEP 0: Preserve the one row to keep (or fall back to hardcoded values if
-- it doesn't exist yet). EDIT THE FALLBACK VALUES to match your real admin
-- record before running.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE keep_admin AS
SELECT *
FROM users.user_details
WHERE employee_id = 'ADMIN001'
LIMIT 1;

-- Sanity check: fail loudly instead of silently wiping everyone if the
-- target admin doesn't exist and you haven't supplied fallback values.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM keep_admin) THEN
    RAISE EXCEPTION
      'No existing user with employee_id = ADMIN001 found. Edit STEP 0B below with real values, comment out this RAISE, then re-run.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- STEP 1: Truncate every table in every application schema, resetting
-- identities and cascading through FKs. Adjust the schema exclusion list if
-- you have schemas that should NOT be touched (e.g. a reporting/analytics
-- schema you want to keep).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname NOT IN (
      'pg_catalog', 'information_schema',
      -- Supabase-managed system schemas — never truncate these
      'auth', 'storage', 'realtime', 'extensions', 'graphql', 'graphql_public',
      'pgbouncer', 'supabase_functions', 'supabase_migrations', 'vault',
      'pgsodium', 'pgsodium_masks', 'net', 'cron'
    )
  LOOP
    EXECUTE format('TRUNCATE TABLE %I.%I RESTART IDENTITY CASCADE', r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Reset every standalone sequence too (RESTART IDENTITY above only resets
-- sequences owned by a truncated column's default; free-standing sequences
-- like ticketing_system.ticket_seq are not attached to any column and need
-- this separate pass).
DO $$
DECLARE
  s RECORD;
BEGIN
  FOR s IN
    SELECT sequence_schema, sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema NOT IN ('pg_catalog', 'information_schema')
  LOOP
    EXECUTE format('ALTER SEQUENCE %I.%I RESTART WITH 1', s.sequence_schema, s.sequence_name);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- STEP 2: Restore the single admin row.
-- If keep_admin had a row, re-insert it verbatim (same id, so any code that
-- hardcodes an admin id keeps working). Otherwise insert the fallback values
-- — EDIT THESE before running if STEP 0's RAISE was commented out.
-- ---------------------------------------------------------------------------
INSERT INTO users.user_details
SELECT * FROM keep_admin
WHERE EXISTS (SELECT 1 FROM keep_admin);

-- Fallback path (only reached if you commented out the STEP 0 RAISE and
-- keep_admin was empty) — EDIT before uncommenting:
-- INSERT INTO users.user_details
--   (full_name, first_name, last_name, email, phone, password_hash,
--    employee_id, role, department, designation, level, account_status)
-- SELECT
--   'Hency Belix', 'Hency', 'Belix', 'REPLACE_EMAIL@example.com', 'REPLACE_PHONE',
--   crypt('REPLACE_PASSWORD', gen_salt('bf')), -- requires pgcrypto, or hash via bcrypt in app
--   'ADMIN001', 'Admin', 'REPLACE_DEPT', 'Administrator', 'L3', 'Active'
-- WHERE NOT EXISTS (SELECT 1 FROM keep_admin);

-- ---------------------------------------------------------------------------
-- STEP 3: Verify before committing.
-- ---------------------------------------------------------------------------
-- SELECT * FROM users.user_details;   -- should be exactly 1 row, ADMIN001
-- SELECT schemaname, relname, n_live_tup
--   FROM pg_stat_user_tables ORDER BY 1,2;  -- eyeball everything else is 0

-- Only after visually confirming the output of the SELECTs above:
COMMIT;
-- If anything looks wrong, run ROLLBACK; instead of COMMIT;

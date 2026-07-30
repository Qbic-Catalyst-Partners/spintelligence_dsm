-- ============================================================================
-- PRODUCTION WIPE — keep users.* and rbac.* intact, truncate everything else
--
-- DO NOT RUN THIS UNTIL YOU HAVE:
--   1. A verified, restorable pg_dump of the production database taken in the
--      last few minutes. Not "a backup exists somewhere" — actually confirm
--      file size / row counts look sane:
--        pg_dump "$DATABASE_URL" -Fc -f pre_wipe_backup_$(date +%Y%m%d_%H%M).dump
--   2. Confirmed no one is actively using the app during this run — it drops
--      every ticket, notification, QC entry, threshold, activity log, HVI/OCR
--      record, notebook submission, report, etc. across every non-excluded
--      schema. Only users.* and rbac.* survive.
--   3. Run this manually in the Supabase SQL editor / psql, reviewing output
--      each time — do not wire it into the app.
--
-- What is preserved: users.user_details, users.email_verification_logs,
-- users.delegations, users.supervisor_assignments,
-- users.dashboard_builder_configs, users.user_dashboard_pages, and all of
-- rbac.* (role_details, screens, role_screens, departments, role_departments).
--
-- What is wiped: everything in ticketing_system.* (tickets, approvals,
-- notifications, notebooks, thresholds/config, activity + ticket logs,
-- glossary/FAQ content, snapshots), every process-stage schema (blowroom,
-- carding, drawframe, simplex, autoconer, spinning, wrapping,
-- process_parameters, reports), hvi_records, ocr_machine_records, and any
-- other table not in users/rbac/Supabase-managed system schemas.
-- Sequences for wiped schemas are reset to start at 1. Sequences belonging to
-- users/rbac are left untouched so existing kept IDs are never reused.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- STEP 1: Truncate every table in every schema EXCEPT users, rbac, and
-- Supabase-managed system schemas. CASCADE only reaches tables that reference
-- the ones being truncated — since users.* / rbac.* are never truncated here,
-- CASCADE cannot reach into them.
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
      -- kept intact
      'users', 'rbac',
      -- Supabase-managed system schemas — never truncate these
      'auth', 'storage', 'realtime', 'extensions', 'graphql', 'graphql_public',
      'pgbouncer', 'supabase_functions', 'supabase_migrations', 'vault',
      'pgsodium', 'pgsodium_masks', 'net', 'cron'
    )
  LOOP
    EXECUTE format('TRUNCATE TABLE %I.%I RESTART IDENTITY CASCADE', r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- STEP 2: Reset standalone sequences (not owned by any truncated column's
-- default, e.g. ticketing_system.ticket_seq) to start at 1. Sequences living
-- in users/rbac schemas are explicitly excluded so kept rows' IDs are never
-- collided with.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  s RECORD;
BEGIN
  FOR s IN
    SELECT sequence_schema, sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema NOT IN (
      'pg_catalog', 'information_schema', 'users', 'rbac',
      'auth', 'storage', 'realtime', 'extensions', 'graphql', 'graphql_public',
      'pgbouncer', 'supabase_functions', 'supabase_migrations', 'vault',
      'pgsodium', 'pgsodium_masks', 'net', 'cron'
    )
  LOOP
    EXECUTE format('ALTER SEQUENCE %I.%I RESTART WITH 1', s.sequence_schema, s.sequence_name);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- STEP 3: Verify before committing.
-- ---------------------------------------------------------------------------
-- SELECT count(*) FROM users.user_details;      -- should be unchanged from before the run
-- SELECT count(*) FROM rbac.role_details;        -- should be unchanged from before the run
-- SELECT schemaname, relname, n_live_tup
--   FROM pg_stat_user_tables
--   WHERE schemaname NOT IN ('users','rbac')
--   ORDER BY 1,2;                                 -- eyeball everything else is 0

-- Only after visually confirming the output of the SELECTs above:
COMMIT;
-- If anything looks wrong, run ROLLBACK; instead of COMMIT;

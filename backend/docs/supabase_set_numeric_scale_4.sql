-- Run this in Supabase SQL Editor.
-- Purpose: change numeric columns to scale 4 across non-system schemas.
-- It skips identity/serial-like and generated columns to avoid key breakage.

DO $$
DECLARE
  rec RECORD;
  target_precision INT;
BEGIN
  FOR rec IN
    SELECT
      c.table_schema,
      c.table_name,
      c.column_name,
      c.numeric_precision,
      c.numeric_scale
    FROM information_schema.columns c
    WHERE c.data_type = 'numeric'
      AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
      AND c.is_generated = 'NEVER'
      AND c.identity_generation IS NULL
      AND c.column_name !~* '(^id$|_id$|id_)'
  LOOP
    target_precision := COALESCE(rec.numeric_precision, 20);
    IF target_precision < 6 THEN
      target_precision := 6;
    END IF;

    -- already at scale 4
    IF COALESCE(rec.numeric_scale, 0) = 4 THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I TYPE numeric(%s,4) USING ROUND(%I::numeric, 4)',
      rec.table_schema,
      rec.table_name,
      rec.column_name,
      target_precision,
      rec.column_name
    );
  END LOOP;
END $$;

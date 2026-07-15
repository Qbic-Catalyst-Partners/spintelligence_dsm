-- Add missing rbac.screens (and the "Process Parameter" department) so the
-- role Screen Access panel shows Wheel Change / U% / Nati / PP screens per department.
--
-- Idempotent & duplicate-safe: each screen is inserted only if no screen with the
-- same normalized name already exists in that department. Re-running is harmless.
--
-- Department ids (existing): Spinning=1, Mixing=2, Carding=10, Autoconer=11,
-- Blowroom=12, Comber=13, Drawframe=14, Simplex=15.

BEGIN;

-- Normalizer matching the frontend/panel logic:
-- lowercase, & -> and, % -> " percent ", -/_ -> space, collapse whitespace.
CREATE OR REPLACE FUNCTION pg_temp.norm_screen(txt text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
           regexp_replace(
             replace(replace(lower(btrim(coalesce(txt, ''))), '&', 'and'), '%', ' percent '),
             '[-_]', ' ', 'g'),
           '\s+', ' ', 'g')
$$;

-- 1) Ensure the "Process Parameter" department exists.
INSERT INTO rbac.departments (name, is_active)
SELECT 'Process Parameter', true
WHERE NOT EXISTS (
  SELECT 1 FROM rbac.departments
  WHERE pg_temp.norm_screen(name) = pg_temp.norm_screen('Process Parameter')
);

-- 2) Insert missing screens. Uses a values list of (department_name, screen_name);
--    resolves department_id by normalized name and skips any screen that already
--    exists (by normalized name) within that department.
WITH desired(dept_name, screen_name) AS (
  VALUES
    -- Mixing
    ('Mixing', 'AFIS-6 Cotton Data Entry'),
    ('Mixing', 'AFIS-6 MMF Data Entry'),
    ('Mixing', 'Openness Data Entry'),
    -- Carding
    ('Carding', 'Thick place & CV'),
    ('Carding', 'Individual Card performance Data'),
    ('Carding', 'Card DFK Data'),
    ('Carding', 'WheelChange'),
    ('Carding', 'Individual Card Waste Study'),
    -- Comber
    ('Comber', 'Comber Lap 1mCV Data Entry'),
    ('Comber', 'Nati Data Entry'),
    ('Comber', 'U% Data Entry'),
    ('Comber', 'Comber Nolis %'),
    -- Drawframe
    ('Drawframe', '1 Yard / Half Yard CV Entry'),
    ('Drawframe', 'U% Data Entry'),
    ('Drawframe', 'A%'),
    ('Drawframe', 'Wheel Change'),
    -- Simplex  (SMXCots Change Data Entry already exists as a typo'd row id 21 -> skipped by norm match)
    ('Simplex', 'SMXCots Change Data Entry'),
    ('Simplex', 'U% Data Entry'),
    ('Simplex', 'Wheel Change'),
    ('Simplex', 'Stretch %'),
    -- Spinning  (Lycra out of Centering ~ existing "LYCRA CENTERING" differs by norm -> WILL insert; review)
    ('Spinning', 'Lycra out of Centering'),
    ('Spinning', 'Wheel Change'),
    -- Autoconer  (Lycra% Checking ~ existing "LYCRA CHECKING" -> norm matches "lycra checking" vs "lycra  percent  checking"? differs -> WILL insert; review)
    ('Autoconer', 'Lycra% Checking'),
    ('Autoconer', 'CSP Parameter Entries'),
    ('Autoconer', 'U% Parameter Entries'),
    -- Process Parameter
    ('Process Parameter', 'Mixing - PP'),
    ('Process Parameter', 'Blow Room - PP'),
    ('Process Parameter', 'Carding - PP'),
    ('Process Parameter', 'Simplex - PP'),
    ('Process Parameter', 'Spinning - PP'),
    ('Process Parameter', 'Autoconer - PP'),
    ('Process Parameter', 'PP - Breaker Drawing'),
    ('Process Parameter', 'PP - Finisher Drawing'),
    ('Process Parameter', 'PP - Autoconer Q2'),
    ('Process Parameter', 'PP - Autoconer Q3')
),
resolved AS (
  SELECT d.id AS department_id, x.screen_name
  FROM desired x
  JOIN rbac.departments d
    ON pg_temp.norm_screen(d.name) = pg_temp.norm_screen(x.dept_name)
)
INSERT INTO rbac.screens (name, is_active, department_id)
SELECT r.screen_name, true, r.department_id
FROM resolved r
WHERE NOT EXISTS (
  SELECT 1 FROM rbac.screens s
  WHERE s.department_id = r.department_id
    AND pg_temp.norm_screen(s.name) = pg_temp.norm_screen(r.screen_name)
);

-- Review the result before committing:
--   SELECT s.id, s.name, d.name AS department
--   FROM rbac.screens s JOIN rbac.departments d ON d.id = s.department_id
--   ORDER BY d.name, s.name;

COMMIT;

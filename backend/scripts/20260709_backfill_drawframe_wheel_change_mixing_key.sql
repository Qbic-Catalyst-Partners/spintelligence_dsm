-- Backfills the canonical rows.mixing JSONB key on existing
-- drawframe.wheel_change rows so the mixing-based auto-population lookup
-- (GET /drawframe/wheel-change/:type filtering on rows->'mixing') also
-- matches entries saved before that filter existed.
--
-- Every Draw Frame sub-type stores its Mixing parameter under its own
-- type-specific key instead of the canonical "mixing" key (only TD7/TD9
-- already use "mixing" natively):
--   type1              -> milling
--   type2, type3       -> mixing (already canonical, no-op)
--   finisher_type1_lrsb -> lrsbMixing
--   type2_d40          -> d40Mixing
--   type3_d50_d55      -> d50Mixing
--   type4_ldf3s        -> ldf3sMixing
--
-- Safe to re-run: only fills rows.mixing when it's missing, and only from
-- the matching sub-type's own key.

UPDATE drawframe.wheel_change
SET rows = jsonb_set(rows, '{mixing}', rows->'milling')
WHERE wheel_change_type = 'type1'
  AND rows ? 'milling'
  AND NOT (rows ? 'mixing');

UPDATE drawframe.wheel_change
SET rows = jsonb_set(rows, '{mixing}', rows->'lrsbMixing')
WHERE wheel_change_type = 'finisher_type1_lrsb'
  AND rows ? 'lrsbMixing'
  AND NOT (rows ? 'mixing');

UPDATE drawframe.wheel_change
SET rows = jsonb_set(rows, '{mixing}', rows->'d40Mixing')
WHERE wheel_change_type = 'type2_d40'
  AND rows ? 'd40Mixing'
  AND NOT (rows ? 'mixing');

UPDATE drawframe.wheel_change
SET rows = jsonb_set(rows, '{mixing}', rows->'d50Mixing')
WHERE wheel_change_type = 'type3_d50_d55'
  AND rows ? 'd50Mixing'
  AND NOT (rows ? 'mixing');

UPDATE drawframe.wheel_change
SET rows = jsonb_set(rows, '{mixing}', rows->'ldf3sMixing')
WHERE wheel_change_type = 'type4_ldf3s'
  AND rows ? 'ldf3sMixing'
  AND NOT (rows ? 'mixing');

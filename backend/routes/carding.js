const express = require('express');
const router = express.Router();
const client = require('../connection');
const { resolveOrCreateProcessParameterEntryId, getCountNameConflict, InvalidProcessParameterEntryIdError } = require('../utils/processParameterEntryId');
const { recordPpNotebookSubmission } = require('./submittedNotebooks.routes');
const sqlServer = require('../config/sqlserver');
const sqlServerPrep = require('../config/sqlserverPrep');
const { fetchPrepVarieties, sendPrepVarietyDropdown } = require('../utils/prepVariety');
const { sendUqcMasterData } = require('./uqcMasterData');
const { createEmployeeMasterDropdown } = require('../utils/employeeMaster');
const MSSQL_THRESHOLD_TABLE = String(process.env.MSSQL_THRESHOLD_TABLE || 'dbo.threshold_master').trim();
const SCREEN_ID_PREFIXES = {
  card_thick_place: 'CT',
  between_within_card: 'CB',
  nati_data_entry: 'NAT',
  uqc: 'CU',
  dfk_pressure: 'CD',
  // qc_header (Process Parameter) intentionally has no prefix here — it must only ever
  // surface the real, stored PP-000n entry_id, never a synthesized fallback id, since a
  // fabricated id collides with the shared Process Parameter scheme.
  card_change_control: 'CC',
  card_waste_study: 'CW',
  wrapping_carding_notebook: 'WR'
};

const formatScreenEntryId = (screenKey, rawId) => {
  const prefix = SCREEN_ID_PREFIXES[screenKey];
  const numericId = Number(rawId);
  if (!prefix || !Number.isFinite(numericId)) return null;
  const value = `${prefix}-${String(Math.trunc(numericId)).padStart(4, '0')}`;
  return screenKey === 'nati_data_entry' ? value : `#${value}`;
};

const createNatiDataEntryId = async () => {
  const result = await client.query(`
    SELECT COALESCE(
      MAX(NULLIF(regexp_replace(entry_id, '\\D', '', 'g'), '')::bigint),
      0
    ) AS max_number
    FROM carding.nati_data_entry
  `);

  const nextNumber = Number(result.rows[0]?.max_number || 0) + 1;
  return `NAT-${String(nextNumber).padStart(4, '0')}`;
};

const createUqcEntryId = async () => {
  const result = await client.query(`
    SELECT COALESCE(
      MAX(NULLIF(regexp_replace(entry_id, '\\D', '', 'g'), '')::bigint),
      0
    ) AS max_number
    FROM carding.u_data_entry
  `);

  const nextNumber = Number(result.rows[0]?.max_number || 0) + 1;
  return `UQ-${String(nextNumber).padStart(4, '0')}`;
};

const withScreenEntryId = (screenKey, record, idField = 'id') => {
  if (!record || typeof record !== 'object') return record;
  if (record.entry_id) return { ...record };
  const entry_id = formatScreenEntryId(screenKey, record[idField]);
  return entry_id ? { ...record, entry_id } : { ...record };
};
const isUniqueViolation = (err) => err && err.code === '23505';
const ALLOWED_SHIFT_TYPES = new Set(['Shift 1', 'Shift 2', 'Shift 3']);
const CDG_MACHINE_REGEX = /^CDG[-\s]?\d+/i;
let cardWasteTypeMasterReady = false;
let cardingEntryIdMigrationReady = false;

const migrateCardingScreenEntryIds = async () => {
  if (cardingEntryIdMigrationReady) return;

  await client.query(`
    UPDATE carding.nati_data_entry
       SET entry_id = 'NAT-' || LPAD(id::text, 4, '0')
     WHERE entry_id IS NULL
        OR BTRIM(entry_id) = ''
        OR entry_id !~ '^NAT-[0-9]+$'
  `);

  await client.query(`
    UPDATE carding.card_thick_place_header
       SET entry_id = '#CT-' || LPAD(id::text, 4, '0'),
           entry_code = '#CT-' || LPAD(id::text, 4, '0')
     WHERE entry_id IS NULL
        OR BTRIM(entry_id) = ''
        OR entry_id !~ '^#CT-[0-9]+$'
        OR entry_code IS NULL
        OR BTRIM(entry_code) = ''
        OR entry_code !~ '^#CT-[0-9]+$'
  `);

  cardingEntryIdMigrationReady = true;
};

const withoutCardWasteStudyIds = (record) => {
  if (!record || typeof record !== 'object') return record;
  const { lot_no, waste_study_id, ...rest } = record;
  return rest;
};

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const percentOf = (part, total) => {
  const partNum = toNumberOrNull(part);
  const totalNum = toNumberOrNull(total);
  if (partNum === null || totalNum === null || totalNum === 0) return null;
  return Number(((partNum / totalNum) * 100).toFixed(4));
};

const toDecimal4OrNull = (value) => {
  const numeric = toNumberOrNull(value);
  return numeric === null ? null : Number(numeric.toFixed(4));
};

const normalizeWasteType = (value) => {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text || null;
};

const fetchCdgDenominationMeta = async (machineName) => {
  const machine = String(machineName || '').trim();
  if (!machine) return null;
  if (!CDG_MACHINE_REGEX.test(machine)) return null;

  const result = await client.query(
    `
    SELECT
      tm.machine_name,
      tm.input_field,
      tm.parameter_name,
      tm.threshold_value,
      tm.plus_threshold,
      tm.minus_threshold,
      tm.actual_value,
      tm.updated_at,
      COALESCE(
        tm.threshold_value::text,
        tm.plus_threshold::text,
        tm.minus_threshold::text,
        tm.actual_value
      ) AS resolved_value
    FROM ticketing_system.threshold_master tm
    WHERE LOWER(TRIM(COALESCE(tm.machine_name, ''))) = LOWER(TRIM($1))
      AND (
        LOWER(COALESCE(tm.input_field, '')) LIKE '%total%denomination%'
        OR LOWER(COALESCE(tm.parameter_name, '')) LIKE '%total%denomination%'
        OR LOWER(COALESCE(tm.input_field, '')) LIKE '%total%spdl%'
        OR LOWER(COALESCE(tm.parameter_name, '')) LIKE '%total%spdl%'
      )
      AND tm.is_active = true
    ORDER BY tm.updated_at DESC, tm.id DESC
    LIMIT 1
    `,
    [machine]
  );

  if (!result.rows.length) return null;
  return result.rows[0];
};

const getPrepMixingDropdown = async (req, res, next) => {
  try {
    if (!sqlServerPrep.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server PREP database is not configured on backend' });
    }

    const prefix = String(req.query.variety_prefix || req.query.prefix || req.query.q || '').trim();
    const data = await fetchPrepVarieties(sqlServerPrep, prefix);

    return res.status(200).json({
      source: 'sqlserver',
      database: process.env.MSSQL_PREP_DATABASE || 'dsmprojects',
      table: 'dbo.prepvariety',
      data,
      mixing_names: data.map((row) => row.variety_name),
      values: data.map((row) => row.variety_name),
      options: [
        { text: '-- Select Mixing --', value: '' },
        ...data.map((row) => ({
          text: row.variety_name,
          label: row.variety_name,
          value: row.variety_name,
          var_code: row.var_code,
          variety_name: row.variety_name
        }))
      ]
    });
  } catch (error) {
    next(error);
  }
};

const ensureCardingEntryIdColumns = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS carding.carding_change_request (
      id BIGSERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      test_no INTEGER,
      entry_date DATE NOT NULL,
      cdo_no TEXT,
      cdg_no_proposed TEXT[],
      mixing_existing TEXT,
      mixing_proposed TEXT,
      blend_percent_existing TEXT,
      blend_percent_proposed TEXT,
      del_hank_existing NUMERIC(10,3),
      del_hank_proposed NUMERIC(10,3),
      feed_weight_existing NUMERIC(10,3),
      feed_weight_proposed NUMERIC(10,3),
      speed_existing NUMERIC(10,2),
      speed_proposed NUMERIC(10,2),
      licker_in_speed_1_existing NUMERIC(10,2),
      licker_in_speed_1_proposed NUMERIC(10,2),
      licker_in_speed_2_existing NUMERIC(10,2),
      licker_in_speed_2_proposed NUMERIC(10,2),
      cylinder_speed_existing NUMERIC(10,2),
      cylinder_speed_proposed NUMERIC(10,2),
      flats_speed_mm_min_existing NUMERIC(10,3),
      flats_speed_mm_min_proposed NUMERIC(10,3),
      feed_plate_to_licker_in_existing NUMERIC(10,3),
      feed_plate_to_licker_in_proposed NUMERIC(10,3),
      sfl_existing NUMERIC(10,3),
      sfl_proposed NUMERIC(10,3),
      sfd_existing NUMERIC(10,3),
      sfd_proposed NUMERIC(10,3),
      top_roller_dia_existing NUMERIC(10,3),
      top_roller_dia_proposed NUMERIC(10,3),
      top_roll_press_existing NUMERIC(10,3),
      top_roll_press_proposed NUMERIC(10,3),
      type2 TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`
    ALTER TABLE carding.nati_data_entry
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    ALTER TABLE carding.nati_data_entry
      DROP COLUMN IF EXISTS nati_id;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS nati_data_entry_entry_id_uq
    ON carding.nati_data_entry (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    ALTER TABLE carding.u_data_entry
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    ALTER TABLE carding.u_data_entry
      ADD COLUMN IF NOT EXISTS shift TEXT;
  `);
  await client.query(`
    ALTER TABLE carding.u_data_entry
      ALTER COLUMN shift TYPE TEXT USING NULLIF(BTRIM(shift::text), '');
  `);
  await client.query(`
    UPDATE carding.u_data_entry
       SET shift = CASE
         WHEN shift IS NULL THEN NULL
         WHEN LOWER(BTRIM(shift)) IN ('halfnight', 'half-night') THEN 'Half Night'
         WHEN LOWER(BTRIM(shift)) IN ('fullnight', 'full-night') THEN 'Full Night'
         ELSE BTRIM(shift)
       END
     WHERE shift IS NOT NULL;
  `);
  await client.query(`
    ALTER TABLE carding.u_data_entry
      DROP COLUMN IF EXISTS department;
  `);
  await client.query(`
    WITH ranked AS (
      SELECT
        ctid,
        entry_id,
        row_number() OVER (
          PARTITION BY COALESCE(BTRIM(entry_id), '')
          ORDER BY COALESCE(created_at, NOW()), ctid
        ) AS dup_rank,
        row_number() OVER (ORDER BY COALESCE(created_at, NOW()), ctid) AS seq_no
      FROM carding.u_data_entry
    )
    UPDATE carding.u_data_entry u
       SET entry_id = 'UQ-' || LPAD(ranked.seq_no::text, 4, '0')
      FROM ranked
     WHERE u.ctid = ranked.ctid
       AND (
         ranked.entry_id IS NULL
         OR BTRIM(ranked.entry_id) = ''
         OR ranked.dup_rank > 1
       );
  `);
  await client.query(`
    DROP INDEX IF EXISTS carding.u_data_entry_entry_id_uq;
  `);
  await client.query(`
    CREATE UNIQUE INDEX u_data_entry_entry_id_uq
    ON carding.u_data_entry (entry_id);
  `);

  await client.query(`
    ALTER TABLE carding.card_dfk_pressure_checking
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    ALTER TABLE carding.card_dfk_pressure_checking
      ALTER COLUMN dfk TYPE TEXT USING dfk::text,
      ALTER COLUMN ccd TYPE TEXT USING ccd::text,
      ALTER COLUMN icfd_1 TYPE TEXT USING icfd_1::text,
      ALTER COLUMN lt TYPE TEXT USING lt::text,
      ALTER COLUMN cds TYPE TEXT USING cds::text,
      ALTER COLUMN silver_draft TYPE TEXT USING silver_draft::text,
      ALTER COLUMN icfd_2 TYPE TEXT USING icfd_2::text,
      ALTER COLUMN idf_in TYPE TEXT USING idf_in::text,
      ALTER COLUMN idf_out TYPE TEXT USING idf_out::text,
      ALTER COLUMN al_on TYPE TEXT USING al_on::text;
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS card_dfk_pressure_checking_entry_id_idx
    ON carding.card_dfk_pressure_checking (entry_id);
  `);

  await client.query(`
    ALTER TABLE carding.carding_change_request
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS carding_change_request_entry_id_uq
    ON carding.carding_change_request (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  // cdg_no_proposed used to be a single machine name; the frontend now lets
  // the operator pick several, so the column needs to hold an array. Existing
  // scalar values are wrapped into a single-element array rather than lost.
  // The type check keeps this migration idempotent - re-running ALTER ...
  // TYPE TEXT[] on an already-array column would wrap it a second time.
  const cdgNoProposedType = await client.query(`
    SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'carding' AND table_name = 'carding_change_request' AND column_name = 'cdg_no_proposed'
  `);
  if (cdgNoProposedType.rows[0]?.data_type !== 'ARRAY') {
    await client.query(`
      ALTER TABLE carding.carding_change_request
        ALTER COLUMN cdg_no_proposed TYPE TEXT[]
        USING (CASE WHEN cdg_no_proposed IS NULL THEN NULL ELSE ARRAY[cdg_no_proposed] END);
    `);
  }
  await client.query(`
    ALTER TABLE carding.carding_change_request
      ADD COLUMN IF NOT EXISTS licker_in_speed_2_existing NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS licker_in_speed_2_proposed NUMERIC(10,2);
  `);

  await client.query(`
    ALTER TABLE carding.carding_qc_header
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS carding_qc_header_entry_id_uq
    ON carding.carding_qc_header (entry_id)
    WHERE entry_id IS NOT NULL;
  `);
};

const ensureCardingChangeTables = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS carding.carding_change_request (
      id BIGSERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      test_no INTEGER,
      entry_date DATE NOT NULL,
      cdo_no TEXT,
      cdg_no_proposed TEXT[],
      mixing_existing TEXT,
      mixing_proposed TEXT,
      blend_percent_existing TEXT,
      blend_percent_proposed TEXT,
      del_hank_existing NUMERIC(10,3),
      del_hank_proposed NUMERIC(10,3),
      feed_weight_existing NUMERIC(10,3),
      feed_weight_proposed NUMERIC(10,3),
      speed_existing NUMERIC(10,2),
      speed_proposed NUMERIC(10,2),
      licker_in_speed_1_existing NUMERIC(10,2),
      licker_in_speed_1_proposed NUMERIC(10,2),
      licker_in_speed_2_existing NUMERIC(10,2),
      licker_in_speed_2_proposed NUMERIC(10,2),
      cylinder_speed_existing NUMERIC(10,2),
      cylinder_speed_proposed NUMERIC(10,2),
      flats_speed_mm_min_existing NUMERIC(10,3),
      flats_speed_mm_min_proposed NUMERIC(10,3),
      feed_plate_to_licker_in_existing NUMERIC(10,3),
      feed_plate_to_licker_in_proposed NUMERIC(10,3),
      sfl_existing NUMERIC(10,3),
      sfl_proposed NUMERIC(10,3),
      sfd_existing NUMERIC(10,3),
      sfd_proposed NUMERIC(10,3),
      cylinder_to_flats_existing NUMERIC(10,3),
      cylinder_to_flats_proposed NUMERIC(10,3),
      cylinder_in_doffer_existing NUMERIC(10,3),
      cylinder_in_doffer_proposed NUMERIC(10,3),
      web_speed_draft_mw_v4_existing NUMERIC(10,3),
      web_speed_draft_mw_v4_proposed NUMERIC(10,3),
      lc_wing_setting_existing NUMERIC(10,3),
      lc_wing_setting_proposed NUMERIC(10,3),
      rr_rk_beater_speed_existing NUMERIC(10,2),
      rr_rk_beater_speed_proposed NUMERIC(10,2),
      remarks TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`
    ALTER TABLE carding.carding_change_request
      ADD COLUMN IF NOT EXISTS operator TEXT,
      ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved',
      ADD COLUMN IF NOT EXISTS review_remarks TEXT,
      ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
  `);
};

let cardWasteStudyReady = false;
const ensureCardWasteStudyTable = async () => {
  if (cardWasteStudyReady) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS carding.card_waste_study (
      id BIGSERIAL PRIMARY KEY,
      entry_id TEXT,
      waste_study_id TEXT,
      date DATE,
      variety TEXT,
      study_type TEXT,
      carding_production_kg NUMERIC(12,4),
      type_entries NUMERIC(12,4),
      flat_speed NUMERIC(12,4),
      delivery_speed NUMERIC(12,4),
      wing1_speed NUMERIC(12,4),
      wing2_speed NUMERIC(12,4),
      lickerin_speed_1 NUMERIC(12,4),
      lickerin_speed_2 NUMERIC(12,4),
      lickerin_speed_3 NUMERIC(12,4),
      mc_no TEXT,
      mc_production NUMERIC(12,4),
      waste_type TEXT,
      waste_kg NUMERIC(12,4),
      waste_percent NUMERIC(12,4),
      overall_percent NUMERIC(12,4),
      remarks TEXT,
      entry_type TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    ALTER TABLE carding.card_waste_study
      ADD COLUMN IF NOT EXISTS entry_id TEXT,
      ADD COLUMN IF NOT EXISTS entry_type TEXT;
  `);

  await client.query(`
    ALTER TABLE carding.card_waste_study
      DROP COLUMN IF EXISTS lot_no;
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS carding.card_waste_study_type_rows (
      id BIGSERIAL PRIMARY KEY,
      study_id BIGINT NOT NULL REFERENCES carding.card_waste_study(id) ON DELETE CASCADE,
      row_no INTEGER NOT NULL,
      cylinder_speed NUMERIC(12,4),
      lickerin_speed NUMERIC(12,4),
      lickerin_speed_1 NUMERIC(12,4),
      lickerin_speed_2 NUMERIC(12,4),
      lickerin_speed_3 NUMERIC(12,4),
      flat_speed NUMERIC(12,4),
      doffer_speed NUMERIC(12,4),
      delivery_speed NUMERIC(12,4),
      wing_setting_1 NUMERIC(12,4),
      wing_setting_2 NUMERIC(12,4),
      mc_no TEXT,
      mc_production NUMERIC(12,4),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    ALTER TABLE carding.card_waste_study_type_rows
      ADD COLUMN IF NOT EXISTS lickerin_speed_1 NUMERIC(12,4),
      ADD COLUMN IF NOT EXISTS lickerin_speed_2 NUMERIC(12,4),
      ADD COLUMN IF NOT EXISTS lickerin_speed_3 NUMERIC(12,4);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS carding.card_waste_study_waste_rows (
      id BIGSERIAL PRIMARY KEY,
      study_id BIGINT NOT NULL REFERENCES carding.card_waste_study(id) ON DELETE CASCADE,
      row_no INTEGER NOT NULL,
      waste_type TEXT,
      waste_kgs_value NUMERIC(12,4),
      waste_kgs_percent NUMERIC(12,4),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS card_waste_study_type_rows_study_id_idx
    ON carding.card_waste_study_type_rows (study_id)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS card_waste_study_waste_rows_study_id_idx
    ON carding.card_waste_study_waste_rows (study_id)
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS card_waste_study_waste_study_id_uq
    ON carding.card_waste_study (waste_study_id)
    WHERE waste_study_id IS NOT NULL;
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS card_waste_study_entry_id_uq
    ON carding.card_waste_study (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  // Resync id sequences in case rows were ever inserted with explicit ids
  // (e.g. data import/restore), which leaves nextval() behind MAX(id) and
  // causes spurious duplicate-key errors on the next insert.
  for (const table of ['card_waste_study', 'card_waste_study_type_rows', 'card_waste_study_waste_rows']) {
    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('carding.${table}', 'id'),
        GREATEST(
          (SELECT COALESCE(MAX(id), 0) FROM carding.${table}),
          (SELECT last_value FROM carding.${table}_id_seq)
        ),
        true
      );
    `);
  }

  cardWasteStudyReady = true;
};

// Fixed, locked list of Individual Card Waste Study waste types
// (see scripts/20260711_reset_carding_waste_study.sql). No free-text/custom
// waste types are accepted; only these are valid.
const CARD_WASTE_TYPES = [
  'Luckerin waste',
  'Flat waste',
  'Fan waste',
  'Micro dust SFL top',
  'Micro dust SFL bottom',
  'Micro dust SFD top',
  'Micro dust SFD bottom',
  'Sliver waste',
  'Lap waste',
];
const CARD_WASTE_TYPE_KEYS = new Set(CARD_WASTE_TYPES.map((w) => w.toLowerCase()));
const isValidCardWasteType = (wasteType) => {
  const normalized = normalizeWasteType(wasteType);
  return !!normalized && CARD_WASTE_TYPE_KEYS.has(normalized.toLowerCase());
};
// "Overall" is a summary/totals row, not a real waste type — exclude it from validation
// and from the waste-type master table.
const isOverallWasteRow = (wasteType) =>
  normalizeWasteType(wasteType)?.toLowerCase() === 'overall';

const ensureCardWasteTypeMasterTable = async () => {
  if (cardWasteTypeMasterReady) return;

  await client.query(`
    CREATE TABLE IF NOT EXISTS carding.card_waste_type_master (
      id BIGSERIAL PRIMARY KEY,
      waste_type TEXT NOT NULL,
      waste_type_key TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    ALTER TABLE carding.card_waste_type_master
      ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS card_waste_type_master_waste_type_key_uq
    ON carding.card_waste_type_master (waste_type_key)
    WHERE waste_type_key IS NOT NULL;
  `);

  for (let i = 0; i < CARD_WASTE_TYPES.length; i++) {
    const wasteType = CARD_WASTE_TYPES[i];
    await client.query(
      `INSERT INTO carding.card_waste_type_master (waste_type, waste_type_key, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (waste_type_key) WHERE waste_type_key IS NOT NULL
       DO UPDATE SET waste_type = EXCLUDED.waste_type, sort_order = EXCLUDED.sort_order`,
      [wasteType, wasteType.toLowerCase(), i + 1]
    );
  }

  // Drop any legacy/custom waste types outside the fixed list.
  await client.query(
    `DELETE FROM carding.card_waste_type_master WHERE waste_type_key <> ALL($1::text[])`,
    [CARD_WASTE_TYPES.map((w) => w.toLowerCase())]
  );

  cardWasteTypeMasterReady = true;
};

const upsertCardWasteType = async (wasteType) => {
  await ensureCardWasteTypeMasterTable();

  if (!isValidCardWasteType(wasteType)) return null;
  const normalizedWasteType = normalizeWasteType(wasteType);
  const wasteTypeKey = normalizedWasteType.toLowerCase();

  const result = await client.query(
    `INSERT INTO carding.card_waste_type_master (waste_type, waste_type_key, sort_order)
     VALUES (
       $1,
       $2,
       COALESCE((SELECT MAX(sort_order) FROM carding.card_waste_type_master), 0) + 1
     )
     ON CONFLICT (waste_type_key)
     DO UPDATE SET waste_type = EXCLUDED.waste_type
     RETURNING id, waste_type, waste_type_key, created_at`,
    [normalizedWasteType, wasteTypeKey]
  );

  return result.rows[0] || null;
};

const fetchCardWasteTypes = async (prefix = '') => {
  await ensureCardWasteTypeMasterTable();

  const result = await client.query(
    `SELECT id, waste_type, created_at
     FROM carding.card_waste_type_master
     WHERE ($1 = '' OR waste_type ILIKE $2)
     ORDER BY sort_order`,
    [prefix, `%${prefix}%`]
  );

  return result.rows || [];
};

let cardThickPlaceReady = false;
const ensureCardThickPlaceTables = async () => {
  if (cardThickPlaceReady) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS carding.card_thick_place_header (
      id BIGSERIAL PRIMARY KEY,
      entry_id TEXT,
      entry_code TEXT,
      entry_date DATE NOT NULL,
      entry_time TIME,
      remarks TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS carding.card_thick_place_values (
      id BIGSERIAL PRIMARY KEY,
      header_id BIGINT NOT NULL REFERENCES carding.card_thick_place_header(id) ON DELETE CASCADE,
      machine TEXT NOT NULL,
      cv_value NUMERIC(12,4),
      cv_5m_value NUMERIC(12,4),
      unit TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    ALTER TABLE carding.card_thick_place_values
      ADD COLUMN IF NOT EXISTS cv_5m_value NUMERIC(12,4);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS card_thick_place_values_header_id_idx
    ON carding.card_thick_place_values (header_id)
  `);

  await client.query(`
    ALTER TABLE carding.card_thick_place_header
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS card_thick_place_header_entry_code_uq
    ON carding.card_thick_place_header (entry_code)
    WHERE entry_code IS NOT NULL;
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS card_thick_place_header_entry_id_uq
    ON carding.card_thick_place_header (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  // Resync the id sequences in case rows were ever inserted with explicit ids
  // (e.g. data import/restore), which leaves nextval() behind MAX(id) and
  // causes spurious duplicate-key errors on the next insert.
  await client.query(`
    SELECT setval(
      pg_get_serial_sequence('carding.card_thick_place_header', 'id'),
      GREATEST(
        (SELECT COALESCE(MAX(id), 0) FROM carding.card_thick_place_header),
        (SELECT last_value FROM carding.card_thick_place_header_id_seq)
      ),
      true
    );
  `);

  await client.query(`
    SELECT setval(
      pg_get_serial_sequence('carding.card_thick_place_values', 'id'),
      GREATEST(
        (SELECT COALESCE(MAX(id), 0) FROM carding.card_thick_place_values),
        (SELECT last_value FROM carding.card_thick_place_values_id_seq)
      ),
      true
    );
  `);

  cardThickPlaceReady = true;
};

router.get('/thresholds', async (req, res, next) => {
  try {
    const { management_field, erp_product_code, machine_name, parameters } = req.query;

    if (!management_field || !erp_product_code || !machine_name) {
      return res.status(400).json({
        message: 'management_field, erp_product_code and machine_name are required'
      });
    }

    const parameterList = parameters
      ? String(parameters).split(',').map((v) => v.trim()).filter(Boolean)
      : [];

    let query = `
      SELECT parameter_name, threshold_value, is_active, updated_at
      FROM ticketing_system.threshold_master
      WHERE management_field = $1
        AND erp_product_code = $2
        AND machine_name = $3
        AND is_active = true
    `;
    const values = [management_field, erp_product_code, machine_name];

    if (parameterList.length) {
      query += ` AND parameter_name = ANY($4::text[])`;
      values.push(parameterList);
    }

    query += ` ORDER BY parameter_name`;
    const result = await client.query(query, values);

    res.status(200).json({
      management_field,
      erp_product_code,
      machine_name,
      thresholds: result.rows
    });
  } catch (error) {
    next(error);
  }
});

router.get('/master/machines', async (req, res, next) => {
  try {
    const prefix = String(req.query.prefix || '').trim();
    const likeToken = `%${prefix}%`;

    if (!sqlServer.hasSqlServerEnv()) {
      const fallback = await client.query(
        `SELECT mccode, mcname, deptcode, deptname
         FROM ticketing_system.mc_master
         WHERE ($1::text = '' OR mcname ILIKE $2)
         ORDER BY deptname, mcname`,
        [prefix, likeToken]
      );

      return res.status(200).json({
        source: 'postgres-fallback',
        data: fallback.rows.map((r) => ({
          mc_no: String(r.mccode || '').trim(),
          mc_name: String(r.mcname || '').trim(),
          dept_code: String(r.deptcode || '').trim(),
          dept_name: String(r.deptname || '').trim()
        })).filter((r) => r.mc_name),
        names: fallback.rows.map((r) => r.mcname).filter(Boolean)
      });
    }

    const result = await sqlServer.query(
      `SELECT
         CAST(m.MCCODE AS VARCHAR(50)) AS mc_no,
         LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) AS mc_name,
         CAST(m.DEPTCODE AS VARCHAR(50)) AS dept_code,
         LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) AS dept_name
       FROM dbo.MCMASTER m
       JOIN dbo.dept_mai d ON m.DEPTCODE = d.DEPTCODE
       WHERE m.compcode = '1'
         AND m.mcclose = '0'
         AND (@prefix = '' OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @machinePrefix)
       ORDER BY d.DEPTNAME, m.MCNAME`,
      { prefix, machinePrefix: likeToken }
      );

    res.status(200).json({
      source: 'sqlserver',
      data: (result.recordset || []).map((r) => ({
        mc_no: String(r.mc_no || '').trim(),
        mc_name: String(r.mc_name || '').trim(),
        dept_code: String(r.dept_code || '').trim(),
        dept_name: String(r.dept_name || '').trim()
      })).filter((r) => r.mc_name),
      names: (result.recordset || []).map((r) => r.mc_name).filter(Boolean)
    });
  } catch (error) {
    next(error);
  }
});

const getMasterVarieties = sendPrepVarietyDropdown(sqlServerPrep, 'carding');

router.get('/master/varieties', getMasterVarieties);

const fetchCountMaster = async (prefix = '') => {
  const result = await sqlServer.query(
    `SELECT TOP 100
       MIN(LTRIM(RTRIM(CAST(cntcode AS VARCHAR(50))))) AS count_code,
       LTRIM(RTRIM(REPLACE(REPLACE(CAST(cntname AS VARCHAR(255)), CHAR(13), ''), CHAR(10), ''))) AS count_name
     FROM dbo.Depot_CountMaster
     WHERE LTRIM(RTRIM(CAST(cntname AS VARCHAR(255)))) <> ''
       AND (@prefix = '' OR LTRIM(RTRIM(CAST(cntname AS VARCHAR(255)))) LIKE @prefixLike)
     GROUP BY LTRIM(RTRIM(REPLACE(REPLACE(CAST(cntname AS VARCHAR(255)), CHAR(13), ''), CHAR(10), '')))
     ORDER BY MIN(CASE WHEN ISNUMERIC(CAST(cntcode AS VARCHAR(50))) = 1 THEN CAST(cntcode AS INT) ELSE 2147483647 END), count_name`,
    { prefix, prefixLike: `%${prefix}%` }
  );

  return result.recordset || [];
};

const getCountMasterDropdown = async (req, res, next) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const prefix = String(req.query.count_prefix || req.query.prefix || '').trim();
    const data = await fetchCountMaster(prefix);
    const options = [
      { text: '-- Select Count Name --', value: '' },
      ...data.map((count) => ({
        text: count.count_name,
        label: count.count_name,
        value: count.count_name,
        count_code: count.count_code,
        count_name: count.count_name
      }))
    ];

    return res.status(200).json({
      source: 'sqlserver',
      table: 'Depot_CountMaster',
      data,
      count_names: data.map((r) => r.count_name),
      names: data.map((r) => r.count_name),
      values: data.map((r) => r.count_name),
      options
    });
  } catch (error) {
    console.error('Error fetching carding count names from SQL Server:', error);
    next(error);
  }
};

const getEmployeeMasterDropdown = createEmployeeMasterDropdown(sqlServer, 'carding');

const getCdgMasterDropdown = async (req, res, next) => {
  try {
    const prefix = String(req.query.prefix || '').trim();
    const likeToken = `%${prefix}%`;

    if (!sqlServer.hasSqlServerEnv()) {
      const fallback = await client.query(
        `SELECT DISTINCT mcname
         FROM ticketing_system.mc_master
         WHERE mcname IS NOT NULL
           AND TRIM(mcname) <> ''
           AND UPPER(TRIM(mcname)) LIKE 'CDG-%'
           AND ($1::text = '' OR mcname ILIKE $2)
         ORDER BY mcname`,
        [prefix, likeToken]
      );

      const values = fallback.rows
        .map((r) => String(r.mcname || '').trim())
        .filter(Boolean);

      return res.status(200).json({
        source: 'postgres-fallback',
        data: values.map((v) => ({ cdg_no: v })),
        values,
        options: [
          { text: '-- Select CDG No. --', value: '' },
          ...values.map((v) => ({ text: v, value: v }))
        ]
      });
    }

    const result = await sqlServer.query(
      `SELECT DISTINCT
         LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) AS cdg_no
       FROM dbo.MCMASTER m
       WHERE m.compcode = '1'
         AND LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) <> ''
         AND UPPER(LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255))))) LIKE 'CDG-%'
         AND (@prefix = '' OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @prefixLike)
       ORDER BY cdg_no`,
      { prefix, prefixLike: likeToken }
    );

    const values = (result.recordset || [])
      .map((r) => String(r.cdg_no || '').trim())
      .filter(Boolean);

    return res.status(200).json({
      source: 'sqlserver',
      data: values.map((v) => ({ cdg_no: v })),
      values,
      options: [
        { text: '-- Select CDG No. --', value: '' },
        ...values.map((v) => ({ text: v, value: v }))
      ]
    });
  } catch (error) {
    next(error);
  }
};

const getCardingDepartmentCdgDropdown = async (req, res, next) => {
  try {
    const prefix = String(req.query.prefix || '').trim();
    const department = String(req.query.department || 'Carding').trim() || 'Carding';
    const likeToken = `%${prefix}%`;

    if (!sqlServer.hasSqlServerEnv()) {
      const fallback = await client.query(
        `SELECT DISTINCT mcname
         FROM ticketing_system.mc_master
         WHERE mcname IS NOT NULL
           AND TRIM(mcname) <> ''
           AND UPPER(TRIM(mcname)) LIKE 'CDG-%'
           AND ($1::text = '' OR mcname ILIKE $2)
           AND UPPER(LTRIM(RTRIM(deptname))) = UPPER(LTRIM(RTRIM($3)))
         ORDER BY mcname`,
        [prefix, likeToken, department]
      );

      const values = fallback.rows
        .map((r) => String(r.mcname || '').trim())
        .filter(Boolean);

      return res.status(200).json({
        source: 'postgres-fallback',
        department,
        data: values.map((v) => ({ cdg_no: v })),
        values,
        options: [
          { text: '-- Select CDG No. --', value: '' },
          ...values.map((v) => ({ text: v, value: v }))
        ]
      });
    }

    const result = await sqlServer.query(
      `SELECT DISTINCT
         LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) AS cdg_no
       FROM dbo.MCMASTER m
       JOIN dbo.dept_mai d ON m.DEPTCODE = d.DEPTCODE
       WHERE m.compcode = '1'
         AND LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) <> ''
         AND UPPER(LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255))))) LIKE 'CDG-%'
         AND (@prefix = '' OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @prefixLike)
         AND UPPER(LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255))))) = UPPER(LTRIM(RTRIM(@department)))
       ORDER BY cdg_no`,
      { prefix, prefixLike: likeToken, department }
    );

    const values = (result.recordset || [])
      .map((r) => String(r.cdg_no || '').trim())
      .filter(Boolean);

    return res.status(200).json({
      source: 'sqlserver',
      department,
      data: values.map((v) => ({ cdg_no: v })),
      values,
      options: [
        { text: '-- Select CDG No. --', value: '' },
        ...values.map((v) => ({ text: v, value: v }))
      ]
    });
  } catch (error) {
    next(error);
  }
};

const getCardWasteTypeDropdown = async (req, res, next) => {
  try {
    const prefix = String(req.query.prefix || req.query.q || req.query.waste_type || '').trim();
    const data = await fetchCardWasteTypes(prefix);

    return res.status(200).json({
      source: 'postgres',
      table: 'carding.card_waste_type_master',
      data,
      waste_types: data.map((row) => row.waste_type),
      values: data.map((row) => row.waste_type),
      options: [
        { text: '-- Select Waste Type --', value: '' },
        ...data.map((row) => ({
          text: row.waste_type,
          label: row.waste_type,
          value: row.waste_type,
          waste_type: row.waste_type
        }))
      ]
    });
  } catch (error) {
    next(error);
  }
};

router.get('/master/counts', getCountMasterDropdown);
router.get('/master/count-dropdown', getCountMasterDropdown);
router.get('/master/count-names', getCountMasterDropdown);
router.get('/master/waste-types', getCardWasteTypeDropdown);
router.get('/master/waste-type-dropdown', getCardWasteTypeDropdown);
router.get('/master/mixings', getPrepMixingDropdown);
router.get('/master/mixing-dropdown', getPrepMixingDropdown);
router.get('/master/employees', getEmployeeMasterDropdown);
router.get('/master/employee-dropdown', getEmployeeMasterDropdown);
router.get('/master/employee-names', getEmployeeMasterDropdown);
router.get('/master/user-names', getEmployeeMasterDropdown);

router.post('/qc-header', async (req, res, next) => {
  try {
    await ensureCardingEntryIdColumns();
    const {
      count_name,
      consignee_name,
      creation_date,
      machine_no,
      lickerin_speed,
      cylinder_speed,
      flats_speed,
      delivery_speed,
      draft_speed,
      tension_draft,
      delivery_hank,
      setting,
      feed_roll_to_lickerin,
      lickerin_to_cylinder,
      cylinder_to_flats,
      cylinder_to_doffer,
      sfl,
      sfd,
      lickerin,
      cylinder,
      doffer,
      flats
    } = req.body;
    let entry_id;
    try {
      entry_id = await resolveOrCreateProcessParameterEntryId(req.body.entry_id, { forceNew: req.body.force_new === true || req.body.force_new === 'true' });
    } catch (idErr) {
      if (idErr instanceof InvalidProcessParameterEntryIdError) {
        return res.status(400).json({ message: idErr.message });
      }
      throw idErr;
    }
    const type = String(req.body.type || req.body.process || req.body.process_parameter || 'Process Parameter').trim() || 'Process Parameter';

    if (!count_name || !consignee_name || !creation_date) {
      return res.status(400).json({ message: 'count_name, consignee_name and creation_date are required' });
    }

    const conflictingCountName = await getCountNameConflict(entry_id, count_name);
    if (conflictingCountName) {
      return res.status(409).json({ message: `This PP id (${entry_id}) already uses count name "${conflictingCountName}". All sub-departments under a PP id must use the same count name.` });
    }

    const result = await client.query(
      `INSERT INTO carding.carding_qc_header (
        entry_id, type, count_name, consignee_name, creation_date,
        machine_no, lickerin_speed, cylinder_speed, flats_speed,
        delivery_speed, draft_speed, tension_draft, delivery_hank,
        setting, feed_roll_to_lickerin, lickerin_to_cylinder,
        cylinder_to_flats, cylinder_to_doffer,
        sfl, sfd, lickerin, cylinder, doffer, flats
      )
      VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,
        $10,$11,$12,$13,
        $14,$15,$16,
        $17,$18,
        $19,$20,$21,$22,$23,$24
      )
      RETURNING *`,
      [
        entry_id, type, count_name, consignee_name, creation_date,
        machine_no, lickerin_speed, cylinder_speed, flats_speed,
        delivery_speed, draft_speed, tension_draft, delivery_hank,
        setting, feed_roll_to_lickerin, lickerin_to_cylinder,
        cylinder_to_flats, cylinder_to_doffer,
        sfl, sfd, lickerin, cylinder, doffer, flats
      ]
    );

    recordPpNotebookSubmission({
      notebook: 'Carding QC Header',
      department: 'Carding',
      entryId: entry_id,
      sourceSchema: 'carding',
      sourceTable: 'carding_qc_header',
      submittedByUserId: req.user?.id,
      submittedByName: req.user?.employee_id,
      submittedPayload: { count_name, consignee_name, creation_date, machine_no }
    }).catch((err) => console.warn('[pp-notebook-log] Carding QC Header failed:', err.message));

    res.status(201).json({
      message: 'Carding QC entry created successfully',
      data: result.rows[0],
      entry_id,
      process_parameter_id: entry_id
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(error);
  }
});

router.get('/qc-header', async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT *
       FROM carding.carding_qc_header
       ORDER BY creation_date DESC
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const totalResult = await client.query(
      `SELECT COUNT(*) FROM carding.carding_qc_header`
    );

    res.status(200).json({
      data: result.rows,
      total: parseInt(totalResult.rows[0].count),
      page: pageNum,
      limit: limitNum
    });
  } catch (error) {
    next(error);
  }
});

router.put('/qc-header/:qc_id', async (req, res, next) => {
  try {
    const qc_id = parseInt(req.params.qc_id, 10);

    if (!Number.isInteger(qc_id) || qc_id <= 0) {
      return res.status(400).json({ message: 'Invalid ID supplied' });
    }

    const {
      type,
      count_name,
      consignee_name,
      creation_date,
      machine_no,
      lickerin_speed,
      cylinder_speed,
      flats_speed,
      delivery_speed,
      draft_speed,
      tension_draft,
      delivery_hank,
      setting,
      feed_roll_to_lickerin,
      lickerin_to_cylinder,
      cylinder_to_flats,
      cylinder_to_doffer,
      sfl,
      sfd,
      lickerin,
      cylinder,
      doffer,
      flats
    } = req.body;

    if (!count_name || !consignee_name || !creation_date) {
      return res.status(400).json({ message: 'count_name, consignee_name and creation_date are required' });
    }

    const result = await client.query(
      `UPDATE carding.carding_qc_header
       SET type=$1,
           count_name=$2,
           consignee_name=$3,
           creation_date=$4,
           machine_no=$5,
           lickerin_speed=$6,
           cylinder_speed=$7,
           flats_speed=$8,
           delivery_speed=$9,
           draft_speed=$10,
           tension_draft=$11,
           delivery_hank=$12,
           setting=$13,
           feed_roll_to_lickerin=$14,
           lickerin_to_cylinder=$15,
           cylinder_to_flats=$16,
           cylinder_to_doffer=$17,
           sfl=$18,
           sfd=$19,
           lickerin=$20,
           cylinder=$21,
           doffer=$22,
           flats=$23
       WHERE qc_id=$24
       RETURNING *`,
      [
        type, count_name, consignee_name, creation_date,
        machine_no, lickerin_speed, cylinder_speed, flats_speed,
        delivery_speed, draft_speed, tension_draft, delivery_hank,
        setting, feed_roll_to_lickerin, lickerin_to_cylinder,
        cylinder_to_flats, cylinder_to_doffer,
        sfl, sfd, lickerin, cylinder, doffer, flats,
        qc_id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Carding QC entry not found' });
    }

    res.status(200).json({
      message: 'Carding QC entry updated successfully',
      data: result.rows[0],
      entry_id: result.rows[0].entry_id,
      process_parameter_id: result.rows[0].entry_id
    });
  } catch (error) {
    next(error);
  }
});

router.get('/nati/master/counts', getCountMasterDropdown);
router.get('/nati/master/count-dropdown', getCountMasterDropdown);
router.get('/nati/master/count-names', getCountMasterDropdown);
router.get('/nati/master/cdg-nos', getCardingDepartmentCdgDropdown);
router.get('/nati/master/mc-nos', getCardingDepartmentCdgDropdown);
router.get('/nati/master/waste-types', getCardWasteTypeDropdown);
router.get('/nati/master/waste-type-dropdown', getCardWasteTypeDropdown);
router.get('/nati/master/employees', getEmployeeMasterDropdown);
router.get('/nati/master/employee-dropdown', getEmployeeMasterDropdown);
router.get('/nati/master/employee-names', getEmployeeMasterDropdown);
router.get('/change-control/master/counts', getCountMasterDropdown);
router.get('/change-control/master/count-dropdown', getCountMasterDropdown);
router.get('/change-control/master/count-names', getCountMasterDropdown);
router.get('/change-control/master/cdg-nos', getCdgMasterDropdown);
router.get('/change-control/master/varieties', getPrepMixingDropdown);
router.get('/change-control/master/dropdown', getPrepMixingDropdown);
router.get('/change-control/master/mixings', getPrepMixingDropdown);
router.get('/change-control/master/mixing-dropdown', getPrepMixingDropdown);
router.get('/change-control/master/employees', getEmployeeMasterDropdown);
router.get('/change-control/master/employee-dropdown', getEmployeeMasterDropdown);
router.get('/change-control/master/employee-names', getEmployeeMasterDropdown);
router.get('/card-waste-study/master/waste-types', getCardWasteTypeDropdown);
router.get('/card-waste-study/master/waste-type-dropdown', getCardWasteTypeDropdown);

const getMasterDepartments = async (req, res) => {
  try {
    const prefix = String(req.query.prefix || '').trim();
    const likeToken = `%${prefix}%`;

    if (!sqlServer.hasSqlServerEnv()) {
      const fallback = await client.query(
        `SELECT DISTINCT deptcode, deptname
         FROM ticketing_system.mc_master
         WHERE deptname IS NOT NULL
           AND TRIM(deptname) <> ''
           AND ($1::text = '' OR deptname ILIKE $2)
         ORDER BY deptname`,
        [prefix, likeToken]
      );

      const data = fallback.rows.map((r) => ({
        dept_code: String(r.deptcode || '').trim(),
        dept_name: String(r.deptname || '').trim()
      })).filter((r) => r.dept_name);

      return res.status(200).json({
        source: 'postgres-fallback',
        data,
        names: data.map((r) => r.dept_name)
      });
    }

    const result = await sqlServer.query(
      `SELECT DISTINCT
         CAST(d.DEPTCODE AS VARCHAR(50)) AS dept_code,
         LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) AS dept_name
       FROM dbo.dept_mai d
       WHERE LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) <> ''
         AND (@prefix = '' OR LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) LIKE @deptPrefix)
       ORDER BY dept_name`,
      { prefix, deptPrefix: likeToken }
    );

    const data = (result.recordset || []).map((r) => ({
      dept_code: String(r.dept_code || '').trim(),
      dept_name: String(r.dept_name || '').trim()
    })).filter((r) => r.dept_name);

    return res.status(200).json({
      source: 'sqlserver',
      data,
      names: data.map((r) => r.dept_name)
    });
  } catch (err) {
    console.error('Error fetching carding departments from SQL Server:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

router.get('/master/departments', getMasterDepartments);

const getMasterMcNos = async (req, res, next) => {
  try {
    const prefix = String(req.query.prefix || '').trim();
    const department = String(req.query.department || '').trim();
    const departmentCode = String(req.query.department_code || '').trim();
    const likeToken = `%${prefix}%`;

    if (!sqlServer.hasSqlServerEnv()) {
      const fallback = await client.query(
        `SELECT mccode, mcname, deptcode, deptname
         FROM ticketing_system.mc_master
         WHERE ($1::text = '' OR mccode::text ILIKE $2)
           AND ($3::text = '' OR deptname ILIKE $4)
           AND ($5::text = '' OR deptcode::text = $5)
         ORDER BY mccode`,
        [prefix, likeToken, department, `%${department}%`, departmentCode]
      );

      const data = fallback.rows.map((r) => ({
        mc_no: String(r.mccode || '').trim(),
        mc_name: String(r.mcname || '').trim(),
        dept_code: String(r.deptcode || '').trim(),
        dept_name: String(r.deptname || '').trim()
      })).filter((r) => r.mc_no);

      return res.status(200).json({
        source: 'postgres-fallback',
        data,
        values: data.map((r) => r.mc_no)
      });
    }

    const result = await sqlServer.query(
      `SELECT
         CAST(m.MCCODE AS VARCHAR(50)) AS mc_no,
         LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) AS mc_name,
         CAST(m.DEPTCODE AS VARCHAR(50)) AS dept_code,
         LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) AS dept_name
       FROM dbo.MCMASTER m
       JOIN dbo.dept_mai d ON m.DEPTCODE = d.DEPTCODE
       WHERE m.compcode = '1'
         AND (@prefix = '' OR CAST(m.MCCODE AS VARCHAR(50)) LIKE @mcNoPrefix)
         AND (@department = '' OR LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) LIKE @departmentLike)
         AND (@departmentCode = '' OR CAST(d.DEPTCODE AS VARCHAR(50)) = @departmentCode)
       ORDER BY CASE WHEN ISNUMERIC(CAST(m.MCCODE AS VARCHAR(50))) = 1 THEN CAST(m.MCCODE AS INT) ELSE 2147483647 END, m.MCCODE`,
      {
        prefix,
        mcNoPrefix: likeToken,
        department,
        departmentLike: `%${department}%`,
        departmentCode
      }
    );

    const data = (result.recordset || []).map((r) => ({
      mc_no: String(r.mc_no || '').trim(),
      mc_name: String(r.mc_name || '').trim(),
      dept_code: String(r.dept_code || '').trim(),
      dept_name: String(r.dept_name || '').trim()
    })).filter((r) => r.mc_no);

    return res.status(200).json({
      source: 'sqlserver',
      data,
      values: data.map((r) => r.mc_no)
    });
  } catch (error) {
    next(error);
  }
};

router.get('/master/mc-nos', getMasterMcNos);

const getRingFrameCheckerNames = async (req, res, next) => {
  try {
    const prefix = String(req.query.prefix || '').trim();
    const likeToken = `%${prefix}%`;

    const result = await client.query(
      `SELECT DISTINCT TRIM(checker_name) AS checker_name
       FROM spinning.ring_frame_inspections
       WHERE checker_name IS NOT NULL
         AND TRIM(checker_name) <> ''
         AND ($1::text = '' OR checker_name ILIKE $2)
       ORDER BY checker_name`,
      [prefix, likeToken]
    );

    const values = result.rows
      .map((row) => String(row.checker_name || '').trim())
      .filter(Boolean);

    return res.status(200).json({
      source: 'postgres',
      data: values.map((checker_name) => ({ checker_name })),
      names: values,
      values,
      options: [
        { text: '-- Select Checker Name --', value: '' },
        ...values.map((value) => ({ text: value, value }))
      ]
    });
  } catch (error) {
    next(error);
  }
};

const parseNotebookDate = (value) => {
  const text = String(value || '').trim();
  if (!text) return null;

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    return text;
  }

  const match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (!match) return null;

  const [, day, month, year] = match;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const toNullableNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const ensureWrappingCardingNotebookTable = async () => {
  await client.query(`CREATE SCHEMA IF NOT EXISTS wrapping`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS wrapping.carding_notebook (
      id BIGSERIAL PRIMARY KEY,
      entry_id TEXT,
      serial_no INTEGER,
      date_text TEXT,
      entry_date DATE,
      source_id TEXT,
      mac_name TEXT,
      shift TEXT,
      std_hank TEXT,
      avg_hank NUMERIC(12,4),
      sd NUMERIC(12,4),
      cv TEXT,
      user_name TEXT,
      remark TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    ALTER TABLE wrapping.carding_notebook
      ADD COLUMN IF NOT EXISTS entry_id TEXT,
      ADD COLUMN IF NOT EXISTS serial_no INTEGER,
      ADD COLUMN IF NOT EXISTS date_text TEXT,
      ADD COLUMN IF NOT EXISTS entry_date DATE,
      ADD COLUMN IF NOT EXISTS source_id TEXT,
      ADD COLUMN IF NOT EXISTS mac_name TEXT,
      ADD COLUMN IF NOT EXISTS shift TEXT,
      ADD COLUMN IF NOT EXISTS std_hank TEXT,
      ADD COLUMN IF NOT EXISTS avg_hank NUMERIC(12,4),
      ADD COLUMN IF NOT EXISTS sd NUMERIC(12,4),
      ADD COLUMN IF NOT EXISTS cv TEXT,
      ADD COLUMN IF NOT EXISTS user_name TEXT,
      ADD COLUMN IF NOT EXISTS remark TEXT;
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS wrapping_carding_notebook_entry_id_uq
    ON wrapping.carding_notebook (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS wrapping_carding_notebook_entry_date_idx
    ON wrapping.carding_notebook (entry_date DESC, id DESC);
  `);
};

router.get('/master/checker-names', getRingFrameCheckerNames);
router.get('/master/checker-name', getRingFrameCheckerNames);
router.get('/checker-names', getRingFrameCheckerNames);
router.get('/checker-name', getRingFrameCheckerNames);
router.get('/ring-frame/checker-names', getRingFrameCheckerNames);
router.get('/ring-frame/checker-name', getRingFrameCheckerNames);
router.get('/ring-frame-log-book/checker-names', getRingFrameCheckerNames);
router.get('/ring-frame-log-book/checker-name', getRingFrameCheckerNames);
router.get('/ring-frame-logbook/checker-names', getRingFrameCheckerNames);
router.get('/ring-frame-logbook/checker-name', getRingFrameCheckerNames);

// UQC-specific aliases for frontend compatibility
const getCommonUqcMasterData = (req, res, next) => sendUqcMasterData(req, res, next, sqlServer, {
  varietySqlServer: sqlServerPrep
});
const getCardingUqcMasterData = (req, res, next) => sendUqcMasterData(req, res, next, sqlServer, {
  varietySqlServer: sqlServerPrep,
  mcNoFilter: 'cdg'
});
router.get('/master/dropdown', getCardingUqcMasterData);
router.get('/uqc/master/varieties', getCommonUqcMasterData);
router.get('/uqc/master/departments', getCommonUqcMasterData);
router.get('/uqc/master/mc-nos', getCardingUqcMasterData);
router.get('/uqc/master/cdg-nos', getCardingUqcMasterData);
router.get('/uqc/master/waste-types', getCardWasteTypeDropdown);
router.get('/uqc/master/waste-type-dropdown', getCardWasteTypeDropdown);
router.get('/uqc/master/mixings', getPrepMixingDropdown);
router.get('/uqc/master/mixing-dropdown', getPrepMixingDropdown);
// Nati-specific aliases for frontend compatibility
router.get('/nati/master/varieties', getMasterVarieties);
router.get('/nati/master/departments', getMasterDepartments);
router.get('/nati/master/cdg-nos', getCardingDepartmentCdgDropdown);
router.get('/nati/master/dropdown', getCommonUqcMasterData);
router.get('/uqc/master/dropdown', getCardingUqcMasterData);
router.get('/uqc/master/dropdown-legacy', async (req, res, next) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const varietyPrefix = String(req.query.variety_prefix || req.query.prefix || '').trim();
    const departmentPrefix = String(req.query.department_prefix || req.query.prefix || '').trim();
    const mcNoPrefix = String(req.query.mc_no_prefix || req.query.prefix || '').trim();
    const department = String(req.query.department || '').trim();
    const departmentCode = String(req.query.department_code || '').trim();

    const [varieties, departmentResult, mcResult] = await Promise.all([
      fetchPrepVarieties(sqlServerPrep, varietyPrefix),
      sqlServer.query(
        `SELECT DISTINCT
           CAST(d.DEPTCODE AS VARCHAR(50)) AS dept_code,
           LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) AS dept_name
         FROM dbo.dept_mai d
         WHERE LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) <> ''
           AND (@prefix = '' OR LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) LIKE @deptPrefix)
         ORDER BY dept_name`,
        { prefix: departmentPrefix, deptPrefix: `%${departmentPrefix}%` }
      ),
      sqlServer.query(
        `SELECT
           CAST(m.MCCODE AS VARCHAR(50)) AS mc_no,
           LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) AS mc_name,
           CAST(m.DEPTCODE AS VARCHAR(50)) AS dept_code,
           LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) AS dept_name
         FROM dbo.MCMASTER m
         JOIN dbo.dept_mai d ON m.DEPTCODE = d.DEPTCODE
         WHERE m.compcode = '1'
           AND (@prefix = '' OR CAST(m.MCCODE AS VARCHAR(50)) LIKE @mcNoPrefix)
           AND (@department = '' OR LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) LIKE @departmentLike)
           AND (@departmentCode = '' OR CAST(d.DEPTCODE AS VARCHAR(50)) = @departmentCode)
         ORDER BY CASE WHEN ISNUMERIC(CAST(m.MCCODE AS VARCHAR(50))) = 1 THEN CAST(m.MCCODE AS INT) ELSE 2147483647 END, m.MCCODE`,
        {
          prefix: mcNoPrefix,
          mcNoPrefix: `%${mcNoPrefix}%`,
          department,
          departmentLike: `%${department}%`,
          departmentCode
        }
      )
    ]);

    const departments = (departmentResult.recordset || []).map((r) => ({
      dept_code: String(r.dept_code || '').trim(),
      dept_name: String(r.dept_name || '').trim()
    })).filter((r) => r.dept_name);

    const mcNos = (mcResult.recordset || []).map((r) => ({
      mc_no: String(r.mc_no || '').trim(),
      mc_name: String(r.mc_name || '').trim(),
      dept_code: String(r.dept_code || '').trim(),
      dept_name: String(r.dept_name || '').trim()
    })).filter((r) => r.mc_no && /^CDG[-\s]?\d+/i.test(r.mc_name || r.mc_no));

    const shifts = [
      { value: 'General', label: 'General' },
      { value: 'Day', label: 'Day' },
      { value: 'Halfnight', label: 'Halfnight' },
      { value: 'Fullnight', label: 'Fullnight' }
    ];

    const shiftOptions = [
      { text: '-- Select Shift --', value: '' },
      ...shifts.map((s) => ({ text: s.label, value: s.value }))
    ];

    const varietyOptions = [
      { text: '-- Select Variety --', value: '' },
      ...varieties.map((v) => ({ text: v.variety_name, value: v.variety_name }))
    ];

    const departmentOptions = [
      { text: '-- Select Department --', value: '' },
      ...departments.map((d) => ({ text: d.dept_name, value: d.dept_name }))
    ];

    const mcNoOptions = [
      { text: '-- Select MC No. --', value: '' },
      ...mcNos.map((m) => ({ text: m.mc_name || m.mc_no, value: m.mc_name || m.mc_no }))
    ];

    return res.status(200).json({
      source: 'sqlserver:dsmprojects+erp',
      variety_source: 'dsmprojects.dbo.prepvariety',
      variety_database: process.env.MSSQL_PREP_DATABASE || 'dsmprojects',
      variety_table: 'dbo.prepvariety',
      shifts,
      shift_values: shifts.map((s) => s.value),
      varieties,
      variety_names: varieties.map((r) => r.variety_name),
      departments,
      department_names: departments.map((r) => r.dept_name),
      mc_nos: mcNos,
      mc_no_values: mcNos.map((r) => r.mc_no),
      options: {
        shift: shiftOptions,
        variety: varietyOptions,
        department: departmentOptions,
        mc_no: mcNoOptions
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/master/cdg-denominations', async (req, res, next) => {
  try {
    const machineName = String(req.query.machine_name || '').trim();

    if (!machineName) {
      return res.status(400).json({ message: 'machine_name is required' });
    }
    if (!/^CDG[-\s]?\d+/i.test(machineName)) {
      return res.status(400).json({ message: 'machine_name must be in CDG-xx format' });
    }

    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const result = await sqlServer.query(
      `SELECT TOP 1
         machine_name,
         input_field,
         parameter_name,
         threshold_value,
         plus_threshold,
         minus_threshold,
         actual_value,
         updated_at
       FROM ${MSSQL_THRESHOLD_TABLE}
       WHERE LOWER(LTRIM(RTRIM(ISNULL(machine_name, '')))) = LOWER(LTRIM(RTRIM(@machineName)))
         AND (
           LOWER(ISNULL(input_field, '')) LIKE '%total%denomination%'
           OR LOWER(ISNULL(parameter_name, '')) LIKE '%total%denomination%'
           OR LOWER(ISNULL(input_field, '')) LIKE '%total%spdl%'
           OR LOWER(ISNULL(parameter_name, '')) LIKE '%total%spdl%'
         )
         AND ISNULL(is_active, 1) = 1
       ORDER BY updated_at DESC, id DESC`,
      { machineName }
    );

    const row = result.recordset && result.recordset[0];
    if (!row) {
      return res.status(404).json({
        machine_name: machineName,
        message: 'No total/denomination value found for this machine'
      });
    }

    const resolved = row.threshold_value ?? row.plus_threshold ?? row.minus_threshold ?? row.actual_value;
    const numeric = Number(resolved);
    res.status(200).json({
      machine_name: row.machine_name || machineName,
      total_denomination: Number.isFinite(numeric) ? Math.trunc(numeric) : resolved,
      source: {
        input_field: row.input_field,
        parameter_name: row.parameter_name,
        updated_at: row.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

const saveWrappingCardingNotebook = async (req, res, next) => {
  try {
    await ensureWrappingCardingNotebookTable();

    const inputRows = Array.isArray(req.body?.rows)
      ? req.body.rows
      : Array.isArray(req.body?.data)
        ? req.body.data
        : [req.body || {}];

    const rows = inputRows.filter((row) => row && typeof row === 'object');
    if (!rows.length) {
      return res.status(400).json({ message: 'rows are required' });
    }

    await client.query('BEGIN');

    const savedRows = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const dateText = String(row.date_text ?? row.date ?? row.Date ?? '').trim();
      const entryDate = parseNotebookDate(row.entry_date ?? row.date ?? row.Date ?? dateText);

      const result = await client.query(
        `INSERT INTO wrapping.carding_notebook (
          entry_id, serial_no, date_text, entry_date, source_id, mac_name,
          shift, std_hank, avg_hank, sd, cv, user_name, remark
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *`,
        [
          row.entry_id ?? null,
          toNullableNumber(row.serial_no ?? row.s_no ?? row.sno ?? row['S.No'] ?? row.SNo ?? (index + 1)),
          dateText || null,
          entryDate,
          row.source_id ?? row.id_no ?? row.sourceId ?? row.ID ?? row.id_value ?? row.notebook_id ?? null,
          row.mac_name ?? row.machine_name ?? row.macName ?? row['Mac Name'] ?? null,
          row.shift ?? row.Shift ?? null,
          row.std_hank ?? row.standard_hank ?? row['Std. Hank'] ?? row.stdHank ?? null,
          toNullableNumber(row.avg_hank ?? row.average_hank ?? row['Avg. Hank'] ?? row.avgHank),
          toNullableNumber(row.sd ?? row.SD),
          row.cv ?? row.CV ?? null,
          row.user_name ?? row.user ?? row.User ?? null,
          row.remark ?? row.remarks ?? row.Remark ?? null
        ]
      );
      savedRows.push(withScreenEntryId('wrapping_carding_notebook', result.rows[0]));
    }

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Wrapping carding notebook data saved successfully',
      data: savedRows,
      count: savedRows.length
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(error);
  }
};

const getWrappingCardingNotebook = async (req, res, next) => {
  try {
    await ensureWrappingCardingNotebookTable();

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 50);
    const offset = (page - 1) * limit;
    const machine = String(req.query.mac_name || req.query.machine_name || '').trim();
    const shift = String(req.query.shift || '').trim();

    const filters = [];
    const values = [];

    if (machine) {
      values.push(`%${machine}%`);
      filters.push(`mac_name ILIKE $${values.length}`);
    }

    if (shift) {
      values.push(shift);
      filters.push(`shift = $${values.length}`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const limitParam = values.length + 1;
    const offsetParam = values.length + 2;

    const result = await client.query(
      `SELECT *
       FROM wrapping.carding_notebook
       ${whereClause}
       ORDER BY COALESCE(entry_date, created_at::date) DESC, id DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...values, limit, offset]
    );

    const countResult = await client.query(
      `SELECT COUNT(*)
       FROM wrapping.carding_notebook
       ${whereClause}`,
      values
    );

    return res.status(200).json({
      page,
      limit,
      total: parseInt(countResult.rows[0].count, 10),
      data: result.rows.map((row) => withScreenEntryId('wrapping_carding_notebook', row))
    });
  } catch (error) {
    next(error);
  }
};

router.post('/wrapping-carding-notebook', saveWrappingCardingNotebook);
router.get('/wrapping-carding-notebook', getWrappingCardingNotebook);
router.post('/wrapping/carding-notebook', saveWrappingCardingNotebook);
router.get('/wrapping/carding-notebook', getWrappingCardingNotebook);
router.post('/carding-notebook/wrapping', saveWrappingCardingNotebook);
router.get('/carding-notebook/wrapping', getWrappingCardingNotebook);

/**
 * @swagger
 * tags:
 *   name: Carding
 *   description: Carding Department APIs
 */

/**
 * @swagger
 * /carding/card-thick-place:
 *   post:
 *     summary: Create a new Card Thick Place CV entry
 *     tags: [Carding]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entry_date
 *               - entry_time
 *               - machine
 *               - cv_value
 *               - unit
 *             properties:
 *               entry_date:
 *                 type: string
 *                 format: date
 *               entry_time:
 *                 type: string
 *                 format: time
 *               machine:
 *                 type: string
 *                 example: CDG-01
 *               cv_value:
 *                 type: number
 *                 example: 3.245
 *               unit:
 *                 type: string
 *                 example: 5m CV
 *     responses:
 *       201:
 *         description: Card CV data created successfully
 *       500:
 *         description: Server error
 */
router.post('/card-thick-place', async (req, res) => {
    try {
        await ensureCardThickPlaceTables();
        const { entry_date, date, entry_time, remarks, entries, machine, cv_value, cv_5m, five_m_cv, unit } = req.body;
        const resolvedEntryDate = entry_date || date || new Date().toISOString().slice(0, 10);

        const normalizedEntries = Array.isArray(entries)
          ? entries
          : (machine ? [{ machine, cv_value, cv_5m, five_m_cv, unit }] : []);

        if (!normalizedEntries.length) {
          return res.status(400).json({ message: 'entries are required' });
        }

        await client.query('BEGIN');

        const headerResult = await client.query(
          `INSERT INTO carding.card_thick_place_header
           (entry_date, entry_time, remarks)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [resolvedEntryDate, entry_time || null, remarks || null]
        );

        const header = headerResult.rows[0];
        const generatedEntryId = formatScreenEntryId('card_thick_place', header.id);

        const updatedHeaderResult = await client.query(
          `UPDATE carding.card_thick_place_header
              SET entry_id = $1,
                  entry_code = $1
            WHERE id = $2
            RETURNING *`,
          [generatedEntryId, header.id]
        );

        const savedHeader = updatedHeaderResult.rows[0];

        for (let i = 0; i < normalizedEntries.length; i++) {
          const row = normalizedEntries[i] || {};
          if (!row.machine) continue;
          await client.query(
            `INSERT INTO carding.card_thick_place_values
             (header_id, machine, cv_value, cv_5m_value, unit)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              header.id,
              row.machine,
              row.cv_value ?? null,
              row.cv_5m ?? row.five_m_cv ?? null,
              row.unit ?? null
            ]
          );
        }

        await client.query('COMMIT');

        res.status(201).json({
          message: 'Card CV data created successfully',
          data: withScreenEntryId('card_thick_place', savedHeader),
          entry_id: generatedEntryId,
          values_count: normalizedEntries.length
        });
    } catch (err) {
        await client.query('ROLLBACK');
        if (isUniqueViolation(err)) {
          console.error('Duplicate key on card thick place insert:', err.constraint || err.message);
          return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
        }
        console.error('Error inserting card thick place CV data:', err);
        res.status(500).json({ message: 'Server error' });
    }
});


/**
 * @swagger
 * /carding/card-thick-place:
 *   get:
 *     summary: Get Card Thick Place CV entries with pagination
 *     tags: [Carding]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Card CV data retrieved successfully
 *       500:
 *         description: Server error
 */

router.get('/card-thick-place', async (req, res) => {
    try {
        await ensureCardThickPlaceTables();

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const headerResult = await client.query(
          `SELECT *
           FROM carding.card_thick_place_header
           ORDER BY entry_date DESC, entry_time DESC NULLS LAST, id DESC
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        );

        const countResult = await client.query(
          `SELECT COUNT(*) FROM carding.card_thick_place_header`
        );

        const headers = headerResult.rows;
        const headerIds = headers.map((r) => r.id);
        let values = [];

        if (headerIds.length) {
          const valuesResult = await client.query(
            `SELECT *
             FROM carding.card_thick_place_values
             WHERE header_id = ANY($1::bigint[])
             ORDER BY header_id, machine`,
            [headerIds]
          );
          values = valuesResult.rows;
        }

        res.status(200).json({
          page,
          limit,
          total: parseInt(countResult.rows[0].count, 10),
          data: headers.map((h) => ({
            ...withScreenEntryId('card_thick_place', h),
            entries: values.filter((v) => v.header_id === h.id)
          }))
        });
    }
    catch (err) {
        console.error('Error fetching card thick place CV data:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @swagger
 * /carding/between-within-card:
 *   post:
 *     summary: Save complete Carding Inspection (Inspection + Sample Weight + Hank)
 *     description: 
 *       This API saves the full inspection record in a single transaction.
 *       It inserts data into inspections, sample_weights, and hanks tables.
 *       If any step fails, the entire transaction is rolled back.
 *     tags: [Carding]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type_category
 *               - inspection_type
 *               - mc_name
 *               - inspection_date
 *               - sample_weights
 *               - hanks
 *             properties:
 *               type_category:
 *                 type: string
 *                 example: Between & Within Card Data Entry
 *               inspection_type:
 *                 type: string
 *                 example: Within
 *               mc_name:
 *                 type: string
 *                 example: CDG-05
 *               inspection_date:
 *                 type: string
 *                 format: date
 *                 example: 2026-03-23
 *               sample_weights:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 5
 *                 items:
 *                   type: number
 *                 example: [4.5, 4.6, 4.4]
 *               hanks:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 5
 *                 items:
 *                   type: number
 *                 example: [1.2, 1.3, 1.1]
 *     responses:
 *       201:
 *         description: Record saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Saved successfully
 *                 inspection_id:
 *                   type: string
 *                   example: BW-1700000000000
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             examples:
 *               invalidSample:
 *                 summary: Invalid sample weights
 *                 value:
 *                   message: Invalid sample weights
 *               invalidHanks:
 *                 summary: Invalid hanks
 *                 value:
 *                   message: Invalid hanks
 *       500:
 *         description: Server error or transaction failure
 *         content:
 *           application/json:
 *             example:
 *               message: Save failed
 */

function toFiniteNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function getBwcArrays(body = {}) {
    if (Array.isArray(body.sample_weights) || Array.isArray(body.hanks)) {
        return {
            sample_weights: Array.isArray(body.sample_weights)
                ? body.sample_weights.map(toFiniteNumberOrNull).filter((v) => v !== null)
                : body.sample_weights,
            hanks: Array.isArray(body.hanks)
                ? body.hanks.map(toFiniteNumberOrNull).filter((v) => v !== null)
                : body.hanks,
        };
    }

    const rows = Array.isArray(body.values)
        ? body.values
        : Array.isArray(body.manual_json)
            ? body.manual_json
            : [];
    const row = rows[0] || {};
    const sample_weights = [];
    const hanks = [];

    for (let i = 1; i <= 100; i += 1) {
        const sampleWeight = toFiniteNumberOrNull(row[`Sample Weight ${i}`]);
        const hank = toFiniteNumberOrNull(row[`Hank ${i}`]);
        if (sampleWeight !== null && hank !== null) {
            sample_weights.push(sampleWeight);
            hanks.push(hank);
        }
    }

    return { sample_weights, hanks };
}

function createBetweenWithinEntryId() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `#CB-${timestamp}${suffix}`;
}

const ensureBetweenWithinCardColumns = async () => {
    await client.query(`
        ALTER TABLE carding.inspections
            ADD COLUMN IF NOT EXISTS test_id TEXT;
    `);
};

function createCardingQcHeaderEntryId() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `#CQ-${timestamp}${suffix}`;
}

router.post('/between-within-card', async (req, res) => {
    try {
        await ensureBetweenWithinCardColumns();

        const {
            type_category,
            inspection_type,
            mc_name,
            inspection_date,
            test_id,
        } = req.body;
        const entry_id = String(req.body.entry_id || '').trim() || createBetweenWithinEntryId();
        const resolvedInspectionDate = String(inspection_date || '').trim() || null;
        const resolvedTestId = String(test_id || '').trim() || null;
        const { sample_weights, hanks } = getBwcArrays(req.body);

        if (!Array.isArray(sample_weights) || sample_weights.length === 0 || sample_weights.length > 100) {
            return res.status(400).json({ message: "Invalid sample weights" });
        }

        if (!Array.isArray(hanks) || hanks.length === 0 || hanks.length > 100) {
            return res.status(400).json({ message: "Invalid hanks" });
        }

        if (sample_weights.length !== hanks.length) {
            return res.status(400).json({ message: "sample_weights and hanks length must match" });
        }

        const id = entry_id;
        const num_entries = sample_weights.length;

        await client.query('BEGIN');

        await client.query(
            `INSERT INTO carding.inspections
            (id, type_category, inspection_type, mc_name, inspection_date, num_entries, test_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [id, type_category, inspection_type, mc_name, resolvedInspectionDate, num_entries, resolvedTestId]
        );

        for (let i = 0; i < sample_weights.length; i++) {
            await client.query(
                `INSERT INTO carding.sample_weights 
                (inspection_id, entry_no, value)
                VALUES ($1,$2,$3)`,
                [id, i + 1, sample_weights[i]]
            );
        }

        for (let i = 0; i < hanks.length; i++) {
            await client.query(
                `INSERT INTO carding.hanks 
                (inspection_id, entry_no, value)
                VALUES ($1,$2,$3)`,
                [id, i + 1, hanks[i]]
            );
        }

        await client.query('COMMIT');

        res.status(201).json({
            message: "Saved successfully",
            inspection_id: id,
            entry_id: id
        });

    } catch (err) {
        await client.query('ROLLBACK');
        if (isUniqueViolation(err)) {
            return res.status(409).json({ message: "Duplicate entry_id. Please use a unique ID." });
        }
        console.error(err);
        res.status(500).json({ message: 'Save failed' });
    }
});

router.get('/card-thick-place/denominations', async (req, res, next) => {
  try {
    const machine_name = String(req.query.machine_name || '').trim();
    if (!machine_name) {
      return res.status(400).json({ message: 'machine_name is required' });
    }
    if (!CDG_MACHINE_REGEX.test(machine_name)) {
      return res.status(400).json({ message: 'machine_name must be in CDG-xx format' });
    }

    const row = await fetchCdgDenominationMeta(machine_name);
    if (!row) {
      return res.status(404).json({
        machine_name,
        message: 'No total/denomination value found for this machine'
      });
    }

    const numericValue = Number(row.resolved_value);
    res.status(200).json({
      machine_name,
      total_denomination: Number.isFinite(numericValue) ? Math.trunc(numericValue) : row.resolved_value,
      source: {
        input_field: row.input_field,
        parameter_name: row.parameter_name,
        updated_at: row.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /carding/between-within-card:
 *   get:
 *     summary: Get all Carding inspection records with pagination
 *     description: 
 *       This API fetches all inspection records with pagination, including:
 *       - Inspection details
 *       - Sample weight values
 *       - Hank values
 *       - Calculated statistics (Avg, Max, Min, Range, SD, CV)
 *     tags: [Carding]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Successfully retrieved inspection records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       type_category:
 *                         type: string
 *                       inspection_type:
 *                         type: string
 *                       mc_name:
 *                         type: string
 *                       inspection_date:
 *                         type: string
 *                         format: date
 *                       num_entries:
 *                         type: integer
 *                       sample_weights:
 *                         type: array
 *                         items:
 *                           type: number
 *                         example: [4.5, 4.6, 4.4]
 *                       hanks:
 *                         type: array
 *                         items:
 *                           type: number
 *                         example: [1.2, 1.3, 1.1]
 *                       sw_avg:
 *                         type: number
 *                       sw_max:
 *                         type: number
 *                       sw_min:
 *                         type: number
 *                       sw_range:
 *                         type: number
 *                       sw_sd:
 *                         type: number
 *                       sw_cv:
 *                         type: number
 *                       h_avg:
 *                         type: number
 *                       h_max:
 *                         type: number
 *                       h_min:
 *                         type: number
 *                       h_range:
 *                         type: number
 *                       h_sd:
 *                         type: number
 *                       h_cv:
 *                         type: number
 *       500:
 *         description: Server error
 */
router.get('/between-within-card', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const dataQuery = `
            SELECT 
                i.*,

                sw.avg AS sw_avg,
                sw.max AS sw_max,
                sw.min AS sw_min,
                sw.range AS sw_range,
                sw.sd AS sw_sd,
                sw.cv AS sw_cv,

                h.avg AS h_avg,
                h.max AS h_max,
                h.min AS h_min,
                h.range AS h_range,
                h.sd AS h_sd,
                h.cv AS h_cv,

                -- Sample Weight values
                (SELECT json_agg(value ORDER BY entry_no)
                 FROM carding.sample_weights 
                 WHERE inspection_id = i.id) AS sample_weights,

                -- Hank values
                (SELECT json_agg(value ORDER BY entry_no)
                 FROM carding.hanks 
                 WHERE inspection_id = i.id) AS hanks

            FROM carding.inspections i
            LEFT JOIN carding.sample_weight_stats sw 
                ON i.id = sw.inspection_id
            LEFT JOIN carding.hank_stats h 
                ON i.id = h.inspection_id
            ORDER BY i.inspection_date DESC
            LIMIT $1 OFFSET $2
        `;

        const countQuery = `
            SELECT COUNT(*) FROM carding.inspections
        `;

        const dataResult = await client.query(dataQuery, [limit, offset]);
        const countResult = await client.query(countQuery);

        const total = parseInt(countResult.rows[0].count);

        res.status(200).json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            data: dataResult.rows.map((row) => ({ ...row, entry_id: row.id }))
        });

    } catch (err) {
        console.error('Error fetching inspections:', err);
        res.status(500).json({ message: "Server error" });
    }
});


/**
 * @swagger
 * /carding/nati-data-entry:
 *   post:
 *     summary: Create Nati Data Entry
 *     tags: [Carding]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             type: "Daily"
 *             nati_id: 101
 *             entry_date: "2026-03-26"
 *             variety: "Cotton"
 *             entries:
 *               - mc_no: 1
 *                 ratio_size_1: 10
 *                 ratio_size_07: 7
 *                 ratio_size_05: 5
 *     responses:
 *       201:
 *         description: Nati entry created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Nati entry created
 *                 qc_id:
 *                   type: integer
 *                   example: 123
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Entries required
 *       500:
 *         description: Server error
 */
router.post('/nati-data-entry', async (req, res) => {
    try {
        await ensureCardingEntryIdColumns();
        await migrateCardingScreenEntryIds();
        const { type, entry_date, variety, entries } = req.body;

        if (!entries || !entries.length) {
            return res.status(400).json({ message: 'Entries required' });
        }

        let entry_id = '';
        let qc_id = null;

        for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
                await client.query('BEGIN');

                await client.query('LOCK TABLE carding.nati_data_entry IN SHARE ROW EXCLUSIVE MODE');
                entry_id = await createNatiDataEntryId();

                const main = await client.query(
                    `INSERT INTO carding.nati_data_entry
                    (entry_id, type, entry_date, variety)
                    VALUES ($1,$2,$3,$4)
                    RETURNING id`,
                    [entry_id, type, entry_date, variety]
                );

                qc_id = main.rows[0].id;

                await client.query(
                    `INSERT INTO carding.neps_details
                    (qc_id, mc_no, ratio_size_1, ratio_size_07, ratio_size_05)
                    SELECT 
                        $1, mc_no, r1, r07, r05
                    FROM unnest(
                        $2::int[],
                        $3::numeric[],
                        $4::numeric[],
                        $5::numeric[]
                    ) AS t(mc_no, r1, r07, r05)`,
                    [
                        qc_id,
                        entries.map(e => e.mc_no),
                        entries.map(e => e.ratio_size_1),
                        entries.map(e => e.ratio_size_07),
                        entries.map(e => e.ratio_size_05)
                    ]
                );

                await client.query('COMMIT');
                break;
            } catch (err) {
                await client.query('ROLLBACK');
                if (!isUniqueViolation(err) || attempt === 3) throw err;
            }
        }

        res.status(201).json({
            message: 'Nati entry created',
            qc_id,
            entry_id
        });

    } catch (err) {
        await client.query('ROLLBACK');
        if (isUniqueViolation(err)) {
            return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
        }
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});


/**
 * @swagger
 * /carding/nati-data-entry:
 *   get:
 *     summary: Get Nati entries
 *     tags: [Carding]
 *     responses:
 *       200:
 *         description: List of nati entries retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 123
 *                   type:
 *                     type: string
 *                     example: Daily
 *                   nati_id:
 *                     type: integer
 *                     example: 101
 *                   entry_date:
 *                     type: string
 *                     format: date
 *                     example: 2026-03-26
 *                   variety:
 *                     type: string
 *                     example: Cotton
 *                   entries:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         mc_no:
 *                           type: integer
 *                           example: 1
 *                         ratio_size_1:
 *                           type: number
 *                           example: 10
 *                         ratio_size_07:
 *                           type: number
 *                           example: 7
 *                         ratio_size_05:
 *                           type: number
 *                           example: 5
 *       500:
 *         description: Server error
 */
router.get('/nati-data-entry', async (req, res) => {
    try {
        await ensureCardingEntryIdColumns();
        await migrateCardingScreenEntryIds();
        const result = await client.query(`
            SELECT 
                qc.id,
                qc.entry_id,
                qc.type,
                qc.entry_date,
                qc.variety,
                qc.created_at,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'mc_no', n.mc_no,
                            'ratio_size_1', n.ratio_size_1,
                            'ratio_size_07', n.ratio_size_07,
                            'ratio_size_05', n.ratio_size_05
                        )
                    ) FILTER (WHERE n.mc_no IS NOT NULL),
                    '[]'
                ) AS entries
            FROM carding.nati_data_entry qc
            LEFT JOIN carding.neps_details n
            ON qc.id = n.qc_id
            GROUP BY qc.id
            ORDER BY qc.entry_date DESC
        `);

        res.json(result.rows.map((row) => {
            const record = withScreenEntryId('nati_data_entry', row);
            return {
                ...record,
                entry_code: record.entry_id,
                display_entry_id: record.entry_id
            };
        }));

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @swagger
 * /carding/uqc:
 *   post:
 *     summary: Create UQC (U% Data Entry)
 *     tags: [Carding]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entry_type
 *               - entry_date
 *             properties:
 *               entry_type:
 *                 type: string
 *                 example: "U% Data Entry"
 *               entry_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-03-30"
 *               shift:
 *                 type: string
 *                 example: "Shift A"
 *               variety:
 *                 type: string
 *                 example: "Cotton"
 *               mc_no:
 *                 type: string
 *                 example: "MC-01"
 *               u_percent:
 *                 type: number
 *                 example: 12.5
 *               cvm:
 *                 type: number
 *                 example: 3.2
 *               cvm_1m:
 *                 type: number
 *                 example: 2.8
 *               cvm_3m:
 *                 type: number
 *                 example: 3.5
 *               remarks:
 *                 type: string
 *                 example: "Normal"
 *     responses:
 *       201:
 *         description: UQC entry created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post('/uqc', async (req, res) => {
    try {
        await ensureCardingEntryIdColumns();

        const {
            entry_type,
            entry_date,
            shift,
            variety,
            mc_no,
            u_percent,
            cvm,
            cvm_1m,
            cvm_3m,
            remarks
        } = req.body;
        const requestedEntryId = String(req.body.entry_id || '').trim();

        // ✅ Validation
        if (!entry_type || !entry_date) {
            return res.status(400).json({
                message: "entry_type and entry_date are required"
            });
        }

        if (shift && !ALLOWED_SHIFT_TYPES.has(String(shift).trim())) {
            return res.status(400).json({
                message: "shift must be one of: Shift 1, Shift 2, Shift 3"
            });
        }

        // ✅ Handle numeric safely
        const toNumber = (val) =>
            val === "" || val === undefined ? null : val;

        let entry_id = requestedEntryId;
        let result;

        for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
                await client.query('BEGIN');
                await client.query('LOCK TABLE carding.u_data_entry IN SHARE ROW EXCLUSIVE MODE');

                entry_id = requestedEntryId || await createUqcEntryId();

                result = await client.query(
                    `INSERT INTO carding.u_data_entry
                    (entry_id, entry_type, entry_date, shift, variety, mc_no,
                     u_percent, cvm, cvm_1m, cvm_3m, remarks)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                    ON CONFLICT (entry_id) DO UPDATE SET
                      entry_type = EXCLUDED.entry_type,
                      entry_date = EXCLUDED.entry_date,
                      shift = EXCLUDED.shift,
                      variety = EXCLUDED.variety,
                      mc_no = EXCLUDED.mc_no,
                      u_percent = EXCLUDED.u_percent,
                      cvm = EXCLUDED.cvm,
                      cvm_1m = EXCLUDED.cvm_1m,
                      cvm_3m = EXCLUDED.cvm_3m,
                      remarks = EXCLUDED.remarks
                    RETURNING *`,
                    [
                        entry_id,
                        entry_type,
                        entry_date,
                        shift,
                        variety,
                        mc_no,
                        toNumber(u_percent),
                        toNumber(cvm),
                        toNumber(cvm_1m),
                        toNumber(cvm_3m),
                        remarks
                    ]
                );

                await client.query('COMMIT');
                break;
            } catch (err) {
                await client.query('ROLLBACK');
                if (!isUniqueViolation(err) || requestedEntryId || attempt === 3) throw err;
            }
        }

        res.status(201).json({
            message: "UQC entry created successfully",
            data: withScreenEntryId('uqc', result.rows[0])
        });

    } catch (err) {
        if (isUniqueViolation(err)) {
            return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
        }
        console.error('❌ UQC INSERT ERROR:', err);
        res.status(500).json({
            message: 'Server error',
            error: err.message
        });
    }
});


/**
 * @swagger
 * /carding/uqc:
 *   get:
 *     summary: Get UQC entries with pagination
 *     tags: [Carding]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *     responses:
 *       200:
 *         description: List of UQC entries
 *       500:
 *         description: Server error
 */
router.get('/uqc', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const dataQuery = `
            SELECT *
            FROM carding.u_data_entry
            ORDER BY entry_date DESC
            LIMIT $1 OFFSET $2
        `;

        const countQuery = `
            SELECT COUNT(*) FROM carding.u_data_entry
        `;

        const params = [limit, offset];
        const countParams = [];

        const dataResult = await client.query(dataQuery, params);
        const countResult = await client.query(countQuery, countParams);

        const total = parseInt(countResult.rows[0].count);

        res.json({
            page,
            limit,
            global: true,
            total,
            totalPages: Math.ceil(total / limit),
            data: dataResult.rows.map((row) => withScreenEntryId('uqc', row))
        });

    } catch (err) {
        console.error('❌ UQC FETCH ERROR:', err);
        res.status(500).json({
            message: 'Server error',
            error: err.message
        });
    }
});

// Dedicated global U% endpoint
router.get('/uqc/global', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const dataResult = await client.query(
      `SELECT *
       FROM carding.u_data_entry
       ORDER BY entry_date DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await client.query(
      `SELECT COUNT(*) FROM carding.u_data_entry`
    );

    const total = parseInt(countResult.rows[0].count, 10);
    res.json({
      page,
      limit,
      global: true,
      total,
      totalPages: Math.ceil(total / limit),
      data: dataResult.rows.map((row) => withScreenEntryId('uqc', row))
    });
  } catch (err) {
    console.error('❌ UQC GLOBAL FETCH ERROR:', err);
    res.status(500).json({
      message: 'Server error',
      error: err.message
    });
  }
});
/**
 * @swagger
 * /carding/dfk-pressure:
 *   post:
 *     summary: Save DFK Pressure Checking data (multiple machines)
 *     tags: [Carding]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             entry_id: "CD-0001"
 *             inspection_type: "Card DFK Pressure Checking"
 *             entry_date: "2026-03-30"
 *             data:
 *               - machine_name: "CDG-01"
 *                 dfk: "60/100"
 *                 ccd: "60/100"
 *                 icfd_1: "60/100"
 *                 lt: "60/100"
 *                 cds: "60/100"
 *                 silver_draft: "60/100"
 *                 icfd_2: "60/100"
 *                 idf_in: "60/100"
 *                 idf_out: "60/100"
 *                 al_on: "60/100"
 *               - machine_name: "CDG-02"
 *                 dfk: "60/100"
 *                 ccd: "60/100"
 *                 icfd_1: "60/100"
 *                 lt: "60/100"
 *                 cds: "60/100"
 *                 silver_draft: "60/100"
 *                 icfd_2: "60/100"
 *                 idf_in: "60/100"
 *                 idf_out: "60/100"
 *                 al_on: "60/100"
 *     responses:
 *       201:
 *         description: DFK pressure data saved successfully
 *       500:
 *         description: Server error
 */
router.post('/dfk-pressure', async (req, res) => {
    try {
        await ensureCardingEntryIdColumns();
        const { entry_id, inspection_type, entry_date, data } = req.body;

        if (!entry_id) {
            return res.status(400).json({ message: "entry_id is required" });
        }

        if (!data || !data.length) {
            return res.status(400).json({ message: "No data provided" });
        }

        await client.query('BEGIN');

        for (const row of data) {
            await client.query(
                `INSERT INTO carding.card_dfk_pressure_checking
                (entry_id, inspection_type, entry_date, machine_name,
                 dfk, ccd, icfd_1, lt, cds,
                 silver_draft, icfd_2, idf_in, idf_out, al_on)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
                [
                    entry_id,
                    inspection_type,
                    entry_date,
                    row.machine_name,
                    row.dfk ?? null,
                    row.ccd ?? null,
                    row.icfd_1 ?? null,
                    row.lt ?? null,
                    row.cds ?? null,
                    row.silver_draft ?? null,
                    row.icfd_2 ?? null,
                    row.idf_in ?? null,
                    row.idf_out ?? null,
                    row.al_on ?? null
                ]
            );
        }

        await client.query('COMMIT');

        res.status(201).json({ message: "Saved successfully", entry_id });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Insert Error:", err);

        res.status(500).json({ message: "Save failed" });
    }
});

/**
 * @swagger
 * /carding/dfk-pressure:
 *   get:
 *     summary: Get DFK Pressure Checking records with pagination
 *     description: Fetch paginated list of DFK pressure checking data ordered by latest entry date.
 *     tags: [Carding]
 *     parameters:
 *       - in: query
 *         name: page
 *         required: false
 *         description: Page number
 *         schema:
 *           type: integer
 *           default: 1
 *           example: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Number of records per page
 *         schema:
 *           type: integer
 *           default: 10
 *           example: 10
 *     responses:
 *       200:
 *         description: Successfully retrieved DFK pressure data
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 1
 *                   inspection_type:
 *                     type: string
 *                     example: Card DFK Pressure Checking
 *                   entry_date:
 *                     type: string
 *                     format: date
 *                     example: 2026-03-30
 *                   machine_name:
 *                     type: string
 *                     example: CDG-01
 *                   dfk:
 *                     type: string
 *                     example: "60/100"
 *                   ccd:
 *                     type: string
 *                     example: "60/100"
 *                   icfd_1:
 *                     type: string
 *                     example: "60/100"
 *                   lt:
 *                     type: string
 *                     example: "60/100"
 *                   cds:
 *                     type: string
 *                     example: "60/100"
 *                   silver_draft:
 *                     type: string
 *                     example: "60/100"
 *                   icfd_2:
 *                     type: string
 *                     example: "60/100"
 *                   idf_in:
 *                     type: string
 *                     example: "60/100"
 *                   idf_out:
 *                     type: string
 *                     example: "60/100"
 *                   al_on:
 *                     type: string
 *                     example: "60/100"
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *                     example: 2026-03-30T10:00:00Z
 *       500:
 *         description: Server error
 */
router.get('/dfk-pressure', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const result = await client.query(
            `SELECT *
             FROM carding.card_dfk_pressure_checking
             ORDER BY entry_date DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        res.json(result.rows.map((row) => withScreenEntryId('dfk_pressure', row)));

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * @swagger
 * /carding/qc-header:
 *   post:
 *     summary: Create Carding QC entry
 *     tags: [Carding]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - count_name
 *               - consignee_name
 *               - creation_date
 *             properties:
 *               type:
 *                 type: string
 *                 example: Process Parameter
 *               count_name:
 *                 type: string
 *               consignee_name:
 *                 type: string
 *               creation_date:
 *                 type: string
 *                 format: date
 *               machine_no:
 *                 type: number
 *               lickerin_speed:
 *                 type: number
 *               cylinder_speed:
 *                 type: number
 *               flats_speed:
 *                 type: number
 *               delivery_speed:
 *                 type: number
 *               draft_speed:
 *                 type: number
 *               tension_draft:
 *                 type: number
 *               delivery_hank:
 *                 type: number
 *               setting:
 *                 type: string
 *               feed_roll_to_lickerin:
 *                 type: number
 *               lickerin_to_cylinder:
 *                 type: number
 *               cylinder_to_flats:
 *                 type: number
 *               cylinder_to_doffer:
 *                 type: number
 *               sfl:
 *                 type: number
 *               sfd:
 *                 type: number
 *               lickerin:
 *                 type: number
 *               cylinder:
 *                 type: number
 *               doffer:
 *                 type: number
 *               flats:
 *                 type: number
 *     responses:
 *       201:
 *         description: Carding QC entry created successfully
 *       500:
 *         description: Server error
 */
router.post('/qc-header', async (req, res, next) => {
  try {
    await ensureCardingEntryIdColumns();
    const {
      entry_id,
      type,
      count_name,
      consignee_name,
      creation_date,
      machine_no,
      lickerin_speed,
      cylinder_speed,
      flats_speed,
      delivery_speed,
      draft_speed,
      tension_draft,
      delivery_hank,
      setting,
      feed_roll_to_lickerin,
      lickerin_to_cylinder,
      cylinder_to_flats,
      cylinder_to_doffer,
      sfl,
      sfd,
      lickerin,
      cylinder,
      doffer,
      flats
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    const result = await client.query(
      `INSERT INTO carding.carding_qc_header (
        entry_id, type, count_name, consignee_name, creation_date,
        machine_no, lickerin_speed, cylinder_speed, flats_speed,
        delivery_speed, draft_speed, tension_draft, delivery_hank,
        setting, feed_roll_to_lickerin, lickerin_to_cylinder,
        cylinder_to_flats, cylinder_to_doffer,
        sfl, sfd, lickerin, cylinder, doffer, flats
      )
      VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,
        $10,$11,$12,$13,
        $14,$15,$16,
        $17,$18,
        $19,$20,$21,$22,$23,$24
      )
      RETURNING *`,
      [
        entry_id, type, count_name, consignee_name, creation_date,
        machine_no, lickerin_speed, cylinder_speed, flats_speed,
        delivery_speed, draft_speed, tension_draft, delivery_hank,
        setting, feed_roll_to_lickerin, lickerin_to_cylinder,
        cylinder_to_flats, cylinder_to_doffer,
        sfl, sfd, lickerin, cylinder, doffer, flats
      ]
    );

    res.status(201).json({
      message: 'Carding QC entry created successfully',
      data: withScreenEntryId('qc_header', result.rows[0])
    });

  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(error);
  }
});

/**
 * @swagger
 * /carding/qc-header:
 *   get:
 *     summary: Get Carding QC entries
 *     tags: [Carding]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Carding QC data retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/qc-header', async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT *
       FROM carding.carding_qc_header
       ORDER BY creation_date DESC
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const totalResult = await client.query(
      `SELECT COUNT(*) FROM carding.carding_qc_header`
    );

    res.status(200).json({
      data: result.rows.map((row) => withScreenEntryId('qc_header', row)),
      total: parseInt(totalResult.rows[0].count),
      page: pageNum,
      limit: limitNum
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /carding/qc-header/{id}:
 *   put:
 *     summary: Update Carding QC entry
 *     tags: [Carding]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - count_name
 *               - consignee_name
 *               - creation_date
 *             properties:
 *               type:
 *                 type: string
 *               count_name:
 *                 type: string
 *               consignee_name:
 *                 type: string
 *               creation_date:
 *                 type: string
 *                 format: date
 *               machine_no:
 *                 type: number
 *               lickerin_speed:
 *                 type: number
 *               cylinder_speed:
 *                 type: number
 *               flats_speed:
 *                 type: number
 *               delivery_speed:
 *                 type: number
 *               draft_speed:
 *                 type: number
 *               tension_draft:
 *                 type: number
 *               delivery_hank:
 *                 type: number
 *               setting:
 *                 type: string
 *               feed_roll_to_lickerin:
 *                 type: number
 *               lickerin_to_cylinder:
 *                 type: number
 *               cylinder_to_flats:
 *                 type: number
 *               cylinder_to_doffer:
 *                 type: number
 *               sfl:
 *                 type: number
 *               sfd:
 *                 type: number
 *               lickerin:
 *                 type: number
 *               cylinder:
 *                 type: number
 *               doffer:
 *                 type: number
 *               flats:
 *                 type: number
 *     responses:
 *       200:
 *         description: Carding QC entry updated successfully
 *       400:
 *         description: Invalid ID supplied
 *       404:
 *         description: Carding QC entry not found
 *       500:
 *         description: Server error
 */
router.put('/qc-header/:qc_id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.qc_id, 10);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid ID supplied' });
    }

    const {
      entry_id,
      type,
      count_name,
      consignee_name,
      creation_date,
      machine_no,
      lickerin_speed,
      cylinder_speed,
      flats_speed,
      delivery_speed,
      draft_speed,
      tension_draft,
      delivery_hank,
      setting,
      feed_roll_to_lickerin,
      lickerin_to_cylinder,
      cylinder_to_flats,
      cylinder_to_doffer,
      sfl,
      sfd,
      lickerin,
      cylinder,
      doffer,
      flats
    } = req.body;

    const currentResult = await client.query(
      `SELECT entry_id FROM carding.carding_qc_header WHERE qc_id = $1`,
      [id]
    );

    if (currentResult.rowCount === 0) {
      return res.status(404).json({ message: 'Carding QC entry not found' });
    }

    const requestedEntryId = String(entry_id || '').trim();
    const currentEntryId = String(currentResult.rows[0].entry_id || '').trim();

    if (requestedEntryId && requestedEntryId !== currentEntryId) {
      const insertResult = await client.query(
        `INSERT INTO carding.carding_qc_header (
          entry_id, type, count_name, consignee_name, creation_date,
          machine_no, lickerin_speed, cylinder_speed, flats_speed,
          delivery_speed, draft_speed, tension_draft, delivery_hank,
          setting, feed_roll_to_lickerin, lickerin_to_cylinder,
          cylinder_to_flats, cylinder_to_doffer,
          sfl, sfd, lickerin, cylinder, doffer, flats
        )
        VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,$8,$9,
          $10,$11,$12,$13,
          $14,$15,$16,
          $17,$18,
          $19,$20,$21,$22,$23,$24
        )
        RETURNING *`,
        [
          requestedEntryId, type, count_name, consignee_name, creation_date,
          machine_no, lickerin_speed, cylinder_speed, flats_speed,
          delivery_speed, draft_speed, tension_draft, delivery_hank,
          setting, feed_roll_to_lickerin, lickerin_to_cylinder,
          cylinder_to_flats, cylinder_to_doffer,
          sfl, sfd, lickerin, cylinder, doffer, flats
        ]
      );

      return res.status(201).json({
        message: 'Carding QC entry created successfully',
        data: withScreenEntryId('qc_header', insertResult.rows[0])
      });
    }

    const result = await client.query(
      `UPDATE carding.carding_qc_header
       SET type = $1,
           count_name = $2,
           consignee_name = $3,
           creation_date = $4,
           machine_no = $5,
           lickerin_speed = $6,
           cylinder_speed = $7,
           flats_speed = $8,
           delivery_speed = $9,
           draft_speed = $10,
           tension_draft = $11,
           delivery_hank = $12,
           setting = $13,
           feed_roll_to_lickerin = $14,
           lickerin_to_cylinder = $15,
           cylinder_to_flats = $16,
           cylinder_to_doffer = $17,
           sfl = $18,
           sfd = $19,
           lickerin = $20,
           cylinder = $21,
           doffer = $22,
           flats = $23
       WHERE qc_id = $24
       RETURNING *`,
      [
        type,
        count_name,
        consignee_name,
        creation_date,
        machine_no,
        lickerin_speed,
        cylinder_speed,
        flats_speed,
        delivery_speed,
        draft_speed,
        tension_draft,
        delivery_hank,
        setting,
        feed_roll_to_lickerin,
        lickerin_to_cylinder,
        cylinder_to_flats,
        cylinder_to_doffer,
        sfl,
        sfd,
        lickerin,
        cylinder,
        doffer,
        flats,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Carding QC entry not found' });
    }

    res.status(200).json({
      message: 'Carding QC entry updated successfully',
      data: withScreenEntryId('qc_header', result.rows[0])
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /carding/change-control:
 *   post:
 *     summary: Create carding change control entry (existing vs proposed)
 *     tags: [Carding]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - entry_date
 *             properties:
 *               type:
 *                 type: string
 *                 example: Wheel Change
 *               test_no:
 *                 type: integer
 *                 example: 3
 *               entry_date:
 *                 type: string
 *                 format: date
 *                 example: 2026-04-21
 *               cdo_no:
 *                 type: string
 *                 example: CDO-17
 *               cdg_no_proposed:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["CDG-01", "CDG-03"]
 *               remarks:
 *                 type: string
 *                 example: Trial planned for evening shift
 *               mixing_existing:
 *                 type: string
 *                 example: 60:40
 *               mixing_proposed:
 *                 type: string
 *                 example: 70:30
 *               blend_percent_existing:
 *                 type: string
 *                 example: "42/58"
 *               blend_percent_proposed:
 *                 type: string
 *                 example: "45/55"
 *               del_hank_existing:
 *                 type: number
 *                 format: float
 *               del_hank_proposed:
 *                 type: number
 *                 format: float
 *               feed_weight_existing:
 *                 type: number
 *                 format: float
 *               feed_weight_proposed:
 *                 type: number
 *                 format: float
 *               speed_existing:
 *                 type: number
 *                 format: float
 *               speed_proposed:
 *                 type: number
 *                 format: float
 *               licker_in_speed_1_existing:
 *                 type: number
 *                 format: float
 *               licker_in_speed_1_proposed:
 *                 type: number
 *                 format: float
 *               licker_in_speed_2_existing:
 *                 type: number
 *                 format: float
 *               licker_in_speed_2_proposed:
 *                 type: number
 *                 format: float
 *               cylinder_speed_existing:
 *                 type: number
 *                 format: float
 *               cylinder_speed_proposed:
 *                 type: number
 *                 format: float
 *               flats_speed_mm_min_existing:
 *                 type: number
 *                 format: float
 *               flats_speed_mm_min_proposed:
 *                 type: number
 *                 format: float
 *               feed_plate_to_licker_in_existing:
 *                 type: number
 *                 format: float
 *               feed_plate_to_licker_in_proposed:
 *                 type: number
 *                 format: float
 *               sfl_existing:
 *                 type: number
 *                 format: float
 *               sfl_proposed:
 *                 type: number
 *                 format: float
 *               sfd_existing:
 *                 type: number
 *                 format: float
 *               sfd_proposed:
 *                 type: number
 *                 format: float
 *               cylinder_to_flats_existing:
 *                 type: number
 *                 format: float
 *               cylinder_to_flats_proposed:
 *                 type: number
 *                 format: float
 *               cylinder_in_doffer_existing:
 *                 type: number
 *                 format: float
 *               cylinder_in_doffer_proposed:
 *                 type: number
 *                 format: float
 *               web_speed_draft_mw_v4_existing:
 *                 type: number
 *                 format: float
 *               web_speed_draft_mw_v4_proposed:
 *                 type: number
 *                 format: float
 *               lc_wing_setting_existing:
 *                 type: number
 *                 format: float
 *               lc_wing_setting_proposed:
 *                 type: number
 *                 format: float
 *               rr_rk_beater_speed_existing:
 *                 type: number
 *                 format: float
 *               rr_rk_beater_speed_proposed:
 *                 type: number
 *                 format: float
 *     responses:
 *       201:
 *         description: Carding change control entry created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post('/change-control', async (req, res, next) => {
  try {
    await ensureCardingChangeTables();
    await ensureCardingEntryIdColumns();

    const {
      entry_id,
      type,
      test_no,
      entry_date,
      cdo_no,
      cdg_no_proposed,
      mixing_existing,
      mixing_proposed,
      blend_percent_existing,
      blend_percent_proposed,
      del_hank_existing,
      del_hank_proposed,
      feed_weight_existing,
      feed_weight_proposed,
      speed_existing,
      speed_proposed,
      licker_in_speed_1_existing,
      licker_in_speed_1_proposed,
      licker_in_speed_2_existing,
      licker_in_speed_2_proposed,
      cylinder_speed_existing,
      cylinder_speed_proposed,
      flats_speed_mm_min_existing,
      flats_speed_mm_min_proposed,
      feed_plate_to_licker_in_existing,
      feed_plate_to_licker_in_proposed,
      sfl_existing,
      sfl_proposed,
      sfd_existing,
      sfd_proposed,
      cylinder_to_flats_existing,
      cylinder_to_flats_proposed,
      cylinder_in_doffer_existing,
      cylinder_in_doffer_proposed,
      web_speed_draft_mw_v4_existing,
      web_speed_draft_mw_v4_proposed,
      lc_wing_setting_existing,
      lc_wing_setting_proposed,
      rr_rk_beater_speed_existing,
      rr_rk_beater_speed_proposed,
      remarks,
      operator,
      approval_status: requestedApprovalStatus,
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    if (!type || !entry_date) {
      return res.status(400).json({
        message: 'type and entry_date are required'
      });
    }

    // Every submission lands as 'pending' unless the payload explicitly says
    // 'approved' - anything else (missing, typo'd) awaits L2 review.
    const approval_status = String(requestedApprovalStatus || '').trim().toLowerCase() === 'approved'
      ? 'approved'
      : 'pending';

    const cdgNoProposedArray = Array.isArray(cdg_no_proposed)
      ? cdg_no_proposed.map((v) => String(v).trim()).filter(Boolean)
      : (cdg_no_proposed ? [String(cdg_no_proposed).trim()].filter(Boolean) : []);

    const result = await client.query(
      `INSERT INTO carding.carding_change_request
       (
         entry_id,
         type, test_no, entry_date, cdo_no, cdg_no_proposed,
         mixing_existing, mixing_proposed,
         blend_percent_existing, blend_percent_proposed,
         del_hank_existing, del_hank_proposed,
         feed_weight_existing, feed_weight_proposed,
         speed_existing, speed_proposed,
         licker_in_speed_1_existing, licker_in_speed_1_proposed,
         licker_in_speed_2_existing, licker_in_speed_2_proposed,
         cylinder_speed_existing, cylinder_speed_proposed,
         flats_speed_mm_min_existing, flats_speed_mm_min_proposed,
         feed_plate_to_licker_in_existing, feed_plate_to_licker_in_proposed,
         sfl_existing, sfl_proposed,
         sfd_existing, sfd_proposed,
         cylinder_to_flats_existing, cylinder_to_flats_proposed,
         cylinder_in_doffer_existing, cylinder_in_doffer_proposed,
         web_speed_draft_mw_v4_existing, web_speed_draft_mw_v4_proposed,
         lc_wing_setting_existing, lc_wing_setting_proposed,
         rr_rk_beater_speed_existing, rr_rk_beater_speed_proposed,
         remarks, operator, approval_status
       )
       VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8,
         $9, $10,
         $11, $12,
         $13, $14,
         $15, $16,
         $17, $18,
         $19, $20,
         $21, $22,
         $23, $24,
         $25, $26,
         $27, $28,
         $29, $30,
         $31, $32,
         $33, $34,
         $35, $36,
         $37, $38,
         $39, $40,
         $41, $42, $43
       )
       RETURNING *`,
      [
        entry_id,
        type,
        toNullableNumber(test_no),
        entry_date,
        cdo_no ?? null,
        cdgNoProposedArray.length ? cdgNoProposedArray : null,
        mixing_existing ?? null,
        mixing_proposed ?? null,
        blend_percent_existing ?? null,
        blend_percent_proposed ?? null,
        toNullableNumber(del_hank_existing),
        toNullableNumber(del_hank_proposed),
        toNullableNumber(feed_weight_existing),
        toNullableNumber(feed_weight_proposed),
        toNullableNumber(speed_existing),
        toNullableNumber(speed_proposed),
        toNullableNumber(licker_in_speed_1_existing),
        toNullableNumber(licker_in_speed_1_proposed),
        toNullableNumber(licker_in_speed_2_existing),
        toNullableNumber(licker_in_speed_2_proposed),
        toNullableNumber(cylinder_speed_existing),
        toNullableNumber(cylinder_speed_proposed),
        toNullableNumber(flats_speed_mm_min_existing),
        toNullableNumber(flats_speed_mm_min_proposed),
        toNullableNumber(feed_plate_to_licker_in_existing),
        toNullableNumber(feed_plate_to_licker_in_proposed),
        toNullableNumber(sfl_existing),
        toNullableNumber(sfl_proposed),
        toNullableNumber(sfd_existing),
        toNullableNumber(sfd_proposed),
        toNullableNumber(cylinder_to_flats_existing),
        toNullableNumber(cylinder_to_flats_proposed),
        toNullableNumber(cylinder_in_doffer_existing),
        toNullableNumber(cylinder_in_doffer_proposed),
        toNullableNumber(web_speed_draft_mw_v4_existing),
        toNullableNumber(web_speed_draft_mw_v4_proposed),
        toNullableNumber(lc_wing_setting_existing),
        toNullableNumber(lc_wing_setting_proposed),
        toNullableNumber(rr_rk_beater_speed_existing),
        toNullableNumber(rr_rk_beater_speed_proposed),
        remarks ?? null,
        operator ?? null,
        approval_status
      ]
    );

    res.status(201).json({
      message: 'Carding change control entry created successfully',
      data: withScreenEntryId('card_change_control', result.rows[0])
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(error);
  }
});

/**
 * @swagger
 * /carding/change-control:
 *   get:
 *     summary: Get carding change control entries with table lines
 *     tags: [Carding]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Carding change control entries retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/change-control', async (req, res, next) => {
  try {
    await ensureCardingChangeTables();

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);
    const offset = (page - 1) * limit;
    const approvalStatus = String(req.query.approval_status || req.query.approvalStatus || req.query.status || '').trim().toLowerCase();

    const headerResult = await client.query(
      `SELECT *
       FROM carding.carding_change_request
       WHERE ($3::text = '' OR LOWER(TRIM(COALESCE(approval_status, 'approved'))) = $3)
       ORDER BY entry_date DESC, id DESC
       OFFSET $1 LIMIT $2`,
      [offset, limit, approvalStatus]
    );

    const countResult = await client.query(
      `SELECT COUNT(*)
       FROM carding.carding_change_request
       WHERE ($1::text = '' OR LOWER(TRIM(COALESCE(approval_status, 'approved'))) = $1)`,
      [approvalStatus]
    );

    const data = headerResult.rows.map((row) => ({
      ...withScreenEntryId('card_change_control', row)
    }));

    res.status(200).json({
      page,
      limit,
      total: parseInt(countResult.rows[0].count, 10),
      data
    });
  } catch (error) {
    next(error);
  }
});

// Change-control approvals flip data other screens may treat as the trusted
// record, so approval/rejection is restricted to L2 reviewers server-side.
// Admin accounts (role "admin" or employee_id like ADMIN001) get the same
// access as L2.
const isCardingAdminReviewer = (req) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  if (role === 'admin') return true;

  const employeeId = String(req.user?.employee_id || '').trim().toLowerCase();
  return /^admin\s*0*\d+$/.test(employeeId);
};

const parseCardingPositiveInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const getCardingReviewerLevel = async (req) => {
  const tokenLevel = String(req.user?.level || '').trim().toUpperCase();
  if (tokenLevel === 'L1' || tokenLevel === 'L2' || tokenLevel === 'L3') return tokenLevel;

  const requesterId = parseCardingPositiveInt(req.user?.id);
  if (!requesterId) return null;

  const result = await client.query(
    `SELECT COALESCE(level, '') AS level
     FROM users.user_details
     WHERE id = $1`,
    [requesterId]
  );
  const level = String(result.rows[0]?.level || '').trim().toUpperCase();
  return level === 'L1' || level === 'L2' || level === 'L3' ? level : null;
};

const requireCardingL2Reviewer = async (req, res) => {
  if (isCardingAdminReviewer(req)) return true;

  const level = await getCardingReviewerLevel(req);
  if (level !== 'L2') {
    res.status(403).json({ message: 'Only L2 reviewers can access change control approvals' });
    return false;
  }
  return true;
};

/**
 * @swagger
 * /carding/change-control/approvals:
 *   get:
 *     summary: Pending (or approved/rejected) change control entries
 *     tags: [Carding Change Control Approvals]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           default: pending
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/change-control/approvals', async (req, res, next) => {
  try {
    if (!(await requireCardingL2Reviewer(req, res))) return;

    await ensureCardingChangeTables();
    const status = String(req.query.approval_status || req.query.approvalStatus || req.query.status || 'pending').trim().toLowerCase();

    const result = await client.query(
      `SELECT *
       FROM carding.carding_change_request
       WHERE LOWER(TRIM(COALESCE(approval_status, 'approved'))) = $1
       ORDER BY created_at DESC NULLS LAST, id DESC`,
      [status]
    );

    const data = result.rows.map((row) => withScreenEntryId('card_change_control', row));

    res.json({ data, total: data.length, status });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /carding/change-control/approvals/{id}/approve:
 *   post:
 *     summary: Approve a pending change control entry
 *     tags: [Carding Change Control Approvals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Entry approved
 *       404:
 *         description: Entry not found
 */
router.post('/change-control/approvals/:id/approve', async (req, res, next) => {
  try {
    if (!(await requireCardingL2Reviewer(req, res))) return;

    const id = parseCardingPositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'id must be a numeric change control entry id' });
    }

    const reviewerLabel = String(req.user?.employee_id || req.user?.name || req.user?.username || req.user?.id || '').trim();

    const result = await client.query(
      `UPDATE carding.carding_change_request
       SET approval_status = 'approved',
           reviewed_by = $2,
           reviewed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, reviewerLabel || null]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Change control entry not found' });
    }

    res.json({
      message: 'Change control entry approved',
      data: withScreenEntryId('card_change_control', result.rows[0])
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /carding/change-control/approvals/{id}/reject:
 *   post:
 *     summary: Reject a pending change control entry
 *     tags: [Carding Change Control Approvals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Entry rejected
 *       404:
 *         description: Entry not found
 */
router.post('/change-control/approvals/:id/reject', async (req, res, next) => {
  try {
    if (!(await requireCardingL2Reviewer(req, res))) return;

    const id = parseCardingPositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'id must be a numeric change control entry id' });
    }

    const reason = String(req.body?.reason || req.body?.remarks || req.body?.review_remarks || '').trim() || null;
    const reviewerLabel = String(req.user?.employee_id || req.user?.name || req.user?.username || req.user?.id || '').trim();

    const result = await client.query(
      `UPDATE carding.carding_change_request
       SET approval_status = 'rejected',
           review_remarks = $2,
           reviewed_by = $3,
           reviewed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, reason, reviewerLabel || null]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Change control entry not found' });
    }

    res.json({
      message: 'Change control entry rejected',
      data: withScreenEntryId('card_change_control', result.rows[0])
    });
  } catch (err) {
    next(err);
  }
});

router.post('/card-waste-study', async (req, res, next) => {
  try {
    await ensureCardWasteStudyTable();

    const {
      type,
      entry_id,
      waste_study_id,
      date,
      entry_date,
      variety,
      study_type,
      carding_production_kg,
      type_entries,
      type_rows,
      waste_rows,
      waste_type,
      waste_kg,
      waste_percent,
      overall_percent,
      remarks
    } = req.body;
    const resolvedDate = date || entry_date || new Date().toISOString().slice(0, 10);
    const normalizedWasteRows = Array.isArray(waste_rows) ? waste_rows : [];
    const normalizedTypeRows = Array.isArray(type_rows) ? type_rows : (Array.isArray(type_entries) ? type_entries : []);

    if (!study_type) {
      return res.status(400).json({ message: 'study_type is required' });
    }
    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }
    if (!['Type 1', 'Type 2', 'Type 3'].includes(study_type)) {
      return res.status(400).json({ message: "study_type must be 'Type 1', 'Type 2', or 'Type 3'" });
    }
    if (normalizedWasteRows.length > 25) {
      return res.status(400).json({ message: 'No. of waste types must be 25 or less' });
    }
    const invalidWasteType = [waste_type, ...normalizedWasteRows.map((row) => row?.waste_type)]
      .find((wt) => wt && !isOverallWasteRow(wt) && !isValidCardWasteType(wt));
    if (invalidWasteType) {
      return res.status(400).json({
        message: `Invalid waste_type "${invalidWasteType}". Must be one of: ${CARD_WASTE_TYPES.join(', ')}`
      });
    }

    const productionValue = toDecimal4OrNull(carding_production_kg);
    const mcProductionTotal = normalizedTypeRows.reduce(
      (sum, row) => sum + (toDecimal4OrNull(row?.mc_production) || 0),
      0
    );
    if (productionValue !== null && normalizedTypeRows.length && Number(mcProductionTotal.toFixed(4)) !== productionValue) {
      return res.status(400).json({
        message: 'Sum of MC Production must match Carding Production (Kgs)'
      });
    }

    const wasteKgValue = toDecimal4OrNull(waste_kg) ??
      normalizedWasteRows.reduce((sum, row) => sum + (toDecimal4OrNull(row?.waste_kgs_value ?? row?.waste_kg) || 0), 0);
    const wastePercentValue = toDecimal4OrNull(waste_percent) ?? percentOf(wasteKgValue, productionValue);
    const overallPercentValue = toDecimal4OrNull(overall_percent) ?? wastePercentValue;

    await client.query('BEGIN');
    if (waste_type && !isOverallWasteRow(waste_type)) {
      await upsertCardWasteType(waste_type);
    }
    for (const row of normalizedWasteRows) {
      if (row?.waste_type && !isOverallWasteRow(row.waste_type)) {
        await upsertCardWasteType(row.waste_type);
      }
    }

    const existingLookup = await client.query(
      `SELECT id FROM carding.card_waste_study WHERE entry_id = $1 LIMIT 1`,
      [entry_id]
    );
    const existingId = existingLookup.rowCount > 0 ? existingLookup.rows[0].id : null;

    const studyValues = [
      entry_id || null,
      null,
      resolvedDate,
      variety,
      type || 'Card Waste Study',
      study_type,
      productionValue,
      normalizedTypeRows.length || toDecimal4OrNull(type_entries),
      normalizeWasteType(waste_type),
      wasteKgValue,
      wastePercentValue,
      overallPercentValue,
      remarks
    ];

    let study;
    if (existingId) {
      const result = await client.query(
        `UPDATE carding.card_waste_study SET
          entry_id = $1, waste_study_id = $2, date = $3, variety = $4, entry_type = $5, study_type = $6,
          carding_production_kg = $7, type_entries = $8,
          waste_type = $9, waste_kg = $10, waste_percent = $11, overall_percent = $12,
          remarks = $13
        WHERE id = $14
        RETURNING *`,
        [...studyValues, existingId]
      );
      study = result.rows[0];
      await client.query(`DELETE FROM carding.card_waste_study_type_rows WHERE study_id = $1`, [existingId]);
      await client.query(`DELETE FROM carding.card_waste_study_waste_rows WHERE study_id = $1`, [existingId]);
    } else {
      const result = await client.query(
        `INSERT INTO carding.card_waste_study (
          entry_id, waste_study_id, date, variety, entry_type, study_type,
          carding_production_kg, type_entries,
          waste_type, waste_kg, waste_percent, overall_percent,
          remarks
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
        )
        RETURNING *`,
        studyValues
      );
      study = result.rows[0];
    }

    for (let i = 0; i < normalizedTypeRows.length; i++) {
      const row = normalizedTypeRows[i] || {};
      await client.query(
        `INSERT INTO carding.card_waste_study_type_rows
         (study_id, row_no, cylinder_speed, lickerin_speed, lickerin_speed_1, lickerin_speed_2, lickerin_speed_3, flat_speed, doffer_speed, delivery_speed, wing_setting_1, wing_setting_2, mc_no, mc_production)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          study.id,
          row.row_no ?? (i + 1),
          toDecimal4OrNull(row.cylinder_speed),
          toDecimal4OrNull(row.lickerin_speed),
          toDecimal4OrNull(row.lickerin_speed_1),
          toDecimal4OrNull(row.lickerin_speed_2),
          toDecimal4OrNull(row.lickerin_speed_3),
          toDecimal4OrNull(row.flat_speed),
          toDecimal4OrNull(row.doffer_speed),
          toDecimal4OrNull(row.delivery_speed),
          toDecimal4OrNull(row.wing_setting_1),
          toDecimal4OrNull(row.wing_setting_2),
          row.mc_no ?? null,
          toDecimal4OrNull(row.mc_production)
        ]
      );
    }

    for (let i = 0; i < normalizedWasteRows.length; i++) {
      const row = normalizedWasteRows[i] || {};
      await client.query(
        `INSERT INTO carding.card_waste_study_waste_rows
         (study_id, row_no, waste_type, waste_kgs_value, waste_kgs_percent)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          study.id,
          row.row_no ?? (i + 1),
          normalizeWasteType(row.waste_type),
          toDecimal4OrNull(row.waste_kgs_value ?? row.waste_kg),
          toDecimal4OrNull(row.waste_kgs_percent ?? row.waste_percent) ??
            percentOf(row.waste_kgs_value ?? row.waste_kg, productionValue)
        ]
      );
    }

    await client.query('COMMIT');

    res.status(existingId ? 200 : 201).json({
      message: existingId ? 'Card waste study updated successfully' : 'Card waste study created successfully',
      data: withoutCardWasteStudyIds(withScreenEntryId('card_waste_study', study))
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(error)) {
      console.error('Duplicate key on card waste study insert:', error.constraint || error.message);
      return res.status(409).json({ message: 'Duplicate waste study ID. Please use a unique ID.' });
    }
    next(error);
  }
});

router.get('/card-waste-study', async (req, res, next) => {
  try {
    await ensureCardWasteStudyTable();

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);
    const offset = (page - 1) * limit;

    const result = await client.query(
      `SELECT *
       FROM carding.card_waste_study
       ORDER BY date DESC, id DESC
       OFFSET $1 LIMIT $2`,
      [offset, limit]
    );

    const totalResult = await client.query(
      `SELECT COUNT(*) FROM carding.card_waste_study`
    );

    const studies = result.rows;
    const studyIds = studies.map((r) => r.id);
    let typeRows = [];
    let wasteRows = [];

    if (studyIds.length) {
      const typeRowsResult = await client.query(
        `SELECT *
         FROM carding.card_waste_study_type_rows
         WHERE study_id = ANY($1::bigint[])
         ORDER BY study_id, row_no`,
        [studyIds]
      );
      typeRows = typeRowsResult.rows;

      const wasteRowsResult = await client.query(
        `SELECT *
         FROM carding.card_waste_study_waste_rows
         WHERE study_id = ANY($1::bigint[])
         ORDER BY study_id, row_no`,
        [studyIds]
      );
      wasteRows = wasteRowsResult.rows;
    }

    res.status(200).json({
      page,
      limit,
      total: parseInt(totalResult.rows[0].count, 10),
      data: studies.map((row) => ({
        ...withoutCardWasteStudyIds(withScreenEntryId('card_waste_study', row)),
        type_rows: typeRows.filter((t) => t.study_id === row.id),
        waste_rows: wasteRows.filter((w) => w.study_id === row.id)
      }))
    });
  } catch (error) {
    next(error);
  }
});

///////////////////////////////////////////////////////////
///////////////////// NRE% DATA ENTRY API ///////////////////
///////////////////////////////////////////////////////////

let cardingNreTableReady = false;
const ensureCardingNreTable = async () => {
  if (cardingNreTableReady) return;

  await client.query(`CREATE SCHEMA IF NOT EXISTS carding;`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS carding.nre (
      id bigserial PRIMARY KEY,
      entry_id varchar(20) UNIQUE,
      machine_model varchar(50),
      mc_name varchar(100),
      cylinder_specs varchar(255),
      cylinder_tonnage_1 numeric(10,2),
      cylinder_tonnage_2 numeric(10,2),
      doffer_specs varchar(255),
      doffer_tonnage_1 numeric(10,2),
      doffer_tonnage_2 numeric(10,2),
      flat_specs varchar(255),
      flat_tonnage_1 numeric(10,2),
      flat_tonnage_2 numeric(10,2),
      lickerin_specs varchar(255),
      lickerin_tonnage_1 numeric(10,2),
      lickerin_tonnage_2 numeric(10,2),
      silver_hank numeric(10,2),
      delivery_mtr_min numeric(10,2),
      fibre_nep_gms_card_mat numeric(10,2),
      fibre_nep_gms_silver numeric(10,2),
      carding_nre_percent numeric(10,2),
      created_at timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  cardingNreTableReady = true;
};

/**
 * @swagger
 * /carding/nre:
 *   post:
 *     summary: Create Carding NRE% entry
 *     tags: [Carding]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             entry_id: "CNRE-0001"
 *             machine_model: "DK-803"
 *             mc_name: "CDG-03"
 *             cylinder_specs: ""
 *             cylinder_tonnage_1: ""
 *             cylinder_tonnage_2: ""
 *             doffer_specs: ""
 *             doffer_tonnage_1: ""
 *             doffer_tonnage_2: ""
 *             flat_specs: ""
 *             flat_tonnage_1: ""
 *             flat_tonnage_2: ""
 *             lickerin_specs: ""
 *             lickerin_tonnage_1: ""
 *             lickerin_tonnage_2: ""
 *             silver_hank: ""
 *             delivery_mtr_min: ""
 *             fibre_nep_gms_card_mat: ""
 *             fibre_nep_gms_silver: ""
 *             carding_nre_percent: ""
 *     responses:
 *       201:
 *         description: Carding NRE% entry created successfully
 *       500:
 *         description: Server error
 */
router.post('/nre', async (req, res, next) => {
  try {
    await ensureCardingNreTable();

    const {
      entry_id,
      machine_model,
      mc_name,
      cylinder_specs,
      cylinder_tonnage_1,
      cylinder_tonnage_2,
      doffer_specs,
      doffer_tonnage_1,
      doffer_tonnage_2,
      flat_specs,
      flat_tonnage_1,
      flat_tonnage_2,
      lickerin_specs,
      lickerin_tonnage_1,
      lickerin_tonnage_2,
      silver_hank,
      delivery_mtr_min,
      fibre_nep_gms_card_mat,
      fibre_nep_gms_silver,
      carding_nre_percent
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    const result = await client.query(
      `INSERT INTO carding.nre (
        entry_id, machine_model, mc_name,
        cylinder_specs, cylinder_tonnage_1, cylinder_tonnage_2,
        doffer_specs, doffer_tonnage_1, doffer_tonnage_2,
        flat_specs, flat_tonnage_1, flat_tonnage_2,
        lickerin_specs, lickerin_tonnage_1, lickerin_tonnage_2,
        silver_hank, delivery_mtr_min,
        fibre_nep_gms_card_mat, fibre_nep_gms_silver, carding_nre_percent
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *`,
      [
        entry_id || null,
        machine_model,
        mc_name,
        cylinder_specs,
        toNumberOrNull(cylinder_tonnage_1),
        toNumberOrNull(cylinder_tonnage_2),
        doffer_specs,
        toNumberOrNull(doffer_tonnage_1),
        toNumberOrNull(doffer_tonnage_2),
        flat_specs,
        toNumberOrNull(flat_tonnage_1),
        toNumberOrNull(flat_tonnage_2),
        lickerin_specs,
        toNumberOrNull(lickerin_tonnage_1),
        toNumberOrNull(lickerin_tonnage_2),
        toNumberOrNull(silver_hank),
        toNumberOrNull(delivery_mtr_min),
        toNumberOrNull(fibre_nep_gms_card_mat),
        toNumberOrNull(fibre_nep_gms_silver),
        toNumberOrNull(carding_nre_percent)
      ]
    );

    res.status(201).json({
      message: 'Carding NRE% data created successfully',
      data: withScreenEntryId('nre', result.rows[0])
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    console.error('Error inserting Carding NRE% data:', err);
    next(err);
  }
});

router.get('/nre', async (req, res, next) => {
  try {
    await ensureCardingNreTable();

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;

    const result = await client.query(
      `SELECT * FROM carding.nre
       ORDER BY id DESC
       OFFSET $1 LIMIT $2`,
      [offset, limit]
    );

    const totalResult = await client.query(`SELECT COUNT(*) FROM carding.nre`);

    res.status(200).json({
      page,
      limit,
      total: parseInt(totalResult.rows[0].count, 10),
      data: result.rows.map((row) => withScreenEntryId('nre', row))
    });
  } catch (err) {
    console.error('Error fetching Carding NRE% data:', err);
    next(err);
  }
});

module.exports = router;


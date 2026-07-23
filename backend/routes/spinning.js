const express = require('express');
const router = express.Router();
const client = require('../connection');
const sqlServer = require('../config/sqlserver');
const { dedupeVarieties } = require('../utils/variety');
const { createEmployeeMasterDropdown } = require('../utils/employeeMaster');
const {
  ensureProcessParameterMasterTable,
  refreshProcessParameterStatus
} = require('./processParameters');
const SCREEN_ID_PREFIXES = {
  speed_checking: 'SSC',
  cots_checking: 'SCT',
  lycra_missing: 'SLM',
  bottom_apron_checking: 'SBA',
  lycra_centering: 'SLC',
  rsm_lycra_online: 'SRO',
  rsm_lycra_offline: 'SRF',
  ring_frame: 'SRI',
  count_change: 'SCC',
  qc: 'SQC',
  wheel_change_type1: 'SW1',
  wheel_change_type2: 'SW2',
  wheel_change_type3: 'SW3'
};

const formatScreenEntryId = (screenKey, rawId) => {
  const prefix = SCREEN_ID_PREFIXES[screenKey];
  if (rawId === undefined || rawId === null || String(rawId).trim() === '') return null;
  const numericId = Number(rawId);
  if (!prefix || !Number.isFinite(numericId)) return null;
  return `#${prefix}-${String(Math.trunc(numericId)).padStart(4, '0')}`;
};

const withScreenEntryId = (screenKey, record, idField = 'id') => {
  if (!record || typeof record !== 'object') return record;
  if (record.entry_id) return { ...record };
  const entry_id = formatScreenEntryId(screenKey, record[idField]);
  return entry_id ? { ...record, entry_id } : { ...record };
};

const withoutTestNumber = (record = {}) => {
  const { test_no, test_number, ...rest } = record;
  return rest;
};

const isUniqueViolation = (err) => err && err.code === '23505';
const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const calculateCsp = (count, strength) => {
  const countValue = toNumberOrNull(count);
  const strengthValue = toNumberOrNull(strength);
  if (countValue === null || strengthValue === null) return null;
  return Number((countValue * strengthValue).toFixed(4));
};

const parseWholeNumberInRange = (value, { fieldName, min = 0, max = 650 }) => {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) {
    return { error: `${fieldName} must be a whole number between ${min} and ${max}` };
  }

  const number = Number(text);
  if (!Number.isInteger(number) || number < min || number > max) {
    return { error: `${fieldName} must be a whole number between ${min} and ${max}` };
  }

  return { value: number };
};

const RING_FRAME_CHECKER_NAMES = [
  'GAYATHIRI',
  'KALAI SELVI .G',
  'LAKSHMIYAYI',
  'MONICA',
  'NANDHA KUMAR',
  'NEELA GOVINTHARAJAN',
  'NITHYA MURUGESAN',
  'RAJESH GANGULY.S',
  'SELVARANI SURESHKUM',
  'THILAGAVATHI KALIYAPPAN'
];

const BOTTOM_APRON_EMPLOYEE_NAMES = [
  'Neela',
  'Nithya',
  'Kalaiselvi',
  'Gayathri',
  'Thilagavathi',
  'Rajesh Ganguly'
];

const DEFAULT_RING_FRAME_SHIFTS = [
  { shift_code: '1', shift_name: '1', shift_hours: 8 },
  { shift_code: '2', shift_name: '2', shift_hours: 8 },
  { shift_code: '3', shift_name: '3', shift_hours: 8 }
];

const toIntegerOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.trunc(numeric);
};

const toBooleanOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'checked', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'n', 'unchecked', 'off'].includes(text)) return false;
  return null;
};

const normalizeFormValue = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '--Select--') return null;
    return trimmed;
  }
  return value;
};

const firstFormValue = (payload, keys) => {
  for (const key of keys) {
    const value = normalizeFormValue(payload[key]);
    if (value !== null) return value;
  }
  return null;
};

const withFieldAliases = (payload, aliasMap) => {
  const normalized = { ...payload };

  for (const [field, aliases] of Object.entries(aliasMap)) {
    const value = firstFormValue(payload, [field, ...aliases]);
    if (value !== null) {
      normalized[field] = value;
    }
  }

  return normalized;
};

const ensureRingFrameLogBookTables = async () => {
  await ensureSpinningEntryIdColumns();

  await client.query(`
    CREATE TABLE IF NOT EXISTS spinning.ring_frame_checkers (
      id BIGSERIAL PRIMARY KEY,
      checker_name TEXT NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const checkerName of RING_FRAME_CHECKER_NAMES) {
    await client.query(
      `INSERT INTO spinning.ring_frame_checkers (checker_name)
       VALUES ($1)
       ON CONFLICT (checker_name) DO NOTHING`,
      [checkerName]
    );
  }

  await client.query(`
    ALTER TABLE spinning.ring_frame_rows
      ADD COLUMN IF NOT EXISTS bobbin_checked BOOLEAN;
  `);

  await client.query(`
    ALTER TABLE spinning.ring_frame_summary
      ADD COLUMN IF NOT EXISTS out_of_center_ac INTEGER,
      ADD COLUMN IF NOT EXISTS out_of_center_rf INTEGER,
      ADD COLUMN IF NOT EXISTS lycra_missing_ac INTEGER,
      ADD COLUMN IF NOT EXISTS lycra_missing_rf INTEGER,
      ADD COLUMN IF NOT EXISTS fault_cops_ac NUMERIC,
      ADD COLUMN IF NOT EXISTS fault_cops_rf NUMERIC,
      ADD COLUMN IF NOT EXISTS total_cops_ac NUMERIC,
      ADD COLUMN IF NOT EXISTS total_cops_rf NUMERIC;
  `);
};

const normalizeRingFrameRow = (row = {}) => ({
  mc_no: row.mc_no ?? row.mcNo ?? row.machine_no ?? row['Mc No'] ?? null,
  lycra: row.lycra ?? row.Lycra ?? row.txtLycra ?? null,
  bobbin_color: row.bobbin_color ?? row.bobbinColor ?? row['Bobbin Color'] ?? null,
  bobbin_checked: toBooleanOrNull(row.bobbin_checked ?? row.bobbin ?? row.chkBobbin ?? row.bobbinColorChecked),
  spindle_1: row.spindle_1 ?? row.position_1 ?? row.d1 ?? row['1'] ?? null,
  spindle_2: row.spindle_2 ?? row.position_2 ?? row.d2 ?? row['2'] ?? null,
  spindle_3: row.spindle_3 ?? row.position_3 ?? row.d3 ?? row['3'] ?? null,
  spindle_4: row.spindle_4 ?? row.position_4 ?? row.d4 ?? row['4'] ?? null,
  spindle_5: row.spindle_5 ?? row.position_5 ?? row.d5 ?? row['5'] ?? null,
  spindle_6: row.spindle_6 ?? row.position_6 ?? row.d6 ?? row['6'] ?? null,
  lycra_missing: row.lycra_missing ?? row.lycraMissing ?? row.txtLM ?? row['Lycra Missing'] ?? null,
  guide_roll_lapping: row.guide_roll_lapping ?? row.guideRollLapping ?? row.txtGR ?? row['Guide Roll Lapping'] ?? null,
  others: row.others ?? row.txtOthers ?? row.Others ?? null,
  total: row.total ?? row.txtTotal ?? row.Total ?? null
});

const normalizeRingFrameSummary = (summary = {}) => ({
  out_of_center: summary.out_of_center ?? summary.out_of_center_rf ?? summary.txtocrf ?? null,
  out_of_center_ac: toIntegerOrNull(summary.out_of_center_ac ?? summary.txtocac),
  out_of_center_rf: toIntegerOrNull(summary.out_of_center_rf ?? summary.txtocrf ?? summary.out_of_center),
  lycra_missing: summary.lycra_missing ?? summary.lycra_missing_rf ?? summary.txtlmrf ?? null,
  lycra_missing_ac: toIntegerOrNull(summary.lycra_missing_ac ?? summary.txtlmac),
  lycra_missing_rf: toIntegerOrNull(summary.lycra_missing_rf ?? summary.txtlmrf ?? summary.lycra_missing),
  fault_cops: summary.fault_cops ?? summary.txtftc ?? null,
  fault_cops_ac: summary.fault_cops_ac ?? null,
  fault_cops_rf: summary.fault_cops_rf ?? null,
  total_cops: summary.total_cops ?? summary.txttcop ?? null,
  total_cops_ac: summary.total_cops_ac ?? null,
  total_cops_rf: summary.total_cops_rf ?? null,
  comments: summary.comments ?? summary.comment ?? summary.txtdesc ?? null
});

// These tables store their submission timestamp as `timestamp WITHOUT time zone` (some under
// `created_at`, the older ones under `createdat` with no separator) with a bare default — on this
// DB, that silently writes a different offset than what gets displayed back, shifting "Created
// At" by several hours (sometimes onto the wrong calendar day) in Custom Report. Same root cause
// and same fix as every other department's equivalent tables: convert to timestamptz so new rows
// store an unambiguous absolute instant.
const ensureSpinningTimestampColumnsHaveTimezone = async () => {
  const tablesAndColumn = [
    ['spinning.speed_checking', 'createdat'],
    ['spinning.cots_checking', 'createdat'],
    ['spinning.lycra_missing', 'createdat'],
    ['spinning.bottom_apron_checking', 'createdat'],
    ['spinning.lycra_centering', 'createdat'],
    ['spinning.rsm_and_lycrasensor_cheking_online', 'createdat'],
    ['spinning.rsm_and_lycrasensor_cheking_offline', 'createdat'],
    ['spinning.ring_frame_inspections', 'created_at'],
    ['spinning.count_change_inspections', 'created_at'],
    ['spinning.spinning_qc_header', 'created_at'],
    ['spinning.wheel_change_inspection', 'created_at'],
    ['spinning.wheel_change_inspection', 'updated_at'],
    ['spinning.wheel_change_v2', 'created_at'],
    ['spinning.wheel_change_v2', 'updated_at'],
    ['spinning.wheel_change', 'created_at'],
    ['spinning.wheel_change', 'updated_at']
  ];
  for (const [tableName, column] of tablesAndColumn) {
    const [schemaName, relationName] = tableName.split('.');
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = '${schemaName}' AND table_name = '${relationName}' AND column_name = '${column}'
            AND data_type = 'timestamp without time zone'
        ) THEN
          ALTER TABLE ${tableName}
            ALTER COLUMN ${column} TYPE timestamptz USING ${column} AT TIME ZONE 'UTC';
          ALTER TABLE ${tableName}
            ALTER COLUMN ${column} SET DEFAULT now();
        END IF;
      END $$;
    `);
  }
};

const ensureSpinningEntryIdColumns = async () => {
  await ensureSpinningTimestampColumnsHaveTimezone();
  const tables = [
    'spinning.speed_checking',
    'spinning.cots_checking',
    'spinning.lycra_missing',
    'spinning.bottom_apron_checking',
    'spinning.lycra_centering',
    'spinning.RSM_and_lycrasensor_cheking_online',
    'spinning.RSM_and_lycrasensor_cheking_offline',
    'spinning.ring_frame_inspections',
    'spinning.count_change_inspections',
    'spinning.spinning_qc_header',
    'spinning.wheel_change_inspection',
    'spinning.wheel_change_v2',
    'spinning.wheel_change'
  ];

  for (const tableName of tables) {
    const indexName = tableName.split('.').pop().toLowerCase() + '_entry_id_uq';
    await client.query(`
      ALTER TABLE ${tableName}
        ADD COLUMN IF NOT EXISTS entry_id TEXT;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${indexName}
      ON ${tableName} (entry_id)
      WHERE entry_id IS NOT NULL;
    `);
  }

  // EmployeeName is dropped outright below on every Spinning checking table that has it —
  // no route in this codebase (frontend or backend) has ever collected or read this field, and
  // Ring Frame Log Book was asked to be the only Spinning screen that keeps a person's name
  // (via its own separate Checker Name field on ring_frame_inspections, untouched here).
  for (const tableName of [
    'spinning.speed_checking',
    'spinning.lycra_missing',
    'spinning.bottom_apron_checking',
    'spinning.lycra_centering',
    'spinning.RSM_and_lycrasensor_cheking_online',
    'spinning.RSM_and_lycrasensor_cheking_offline',
    'spinning.cots_checking'
  ]) {
    await client.query(`
      DO $$
      DECLARE
        col_name text;
      BEGIN
        SELECT column_name INTO col_name
        FROM information_schema.columns
        WHERE table_schema = lower(split_part('${tableName}', '.', 1))
          AND table_name = lower(split_part('${tableName}', '.', 2))
          AND column_name ILIKE 'employeename';
        IF col_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE %s DROP COLUMN %I', '${tableName}', col_name);
        END IF;
      END $$;
    `);
  }

  // LHS_Value/RHS_Value were originally required scalar columns on all six
  // checking screens; LHS/RHS is now always submitted as a free-form
  // comma-separated spindle list (lhs_values/rhs_values below), so the old
  // scalar columns are dropped outright rather than just relaxed to nullable.
  for (const tableName of [
    'spinning.speed_checking',
    'spinning.cots_checking',
    'spinning.bottom_apron_checking',
    'spinning.lycra_centering',
    'spinning.RSM_and_lycrasensor_cheking_online',
    'spinning.RSM_and_lycrasensor_cheking_offline'
  ]) {
    await client.query(`
      DO $$
      DECLARE
        col_name text;
      BEGIN
        SELECT column_name INTO col_name
        FROM information_schema.columns
        WHERE table_schema = lower(split_part('${tableName}', '.', 1))
          AND table_name = lower(split_part('${tableName}', '.', 2))
          AND column_name ILIKE 'lhs_value';
        IF col_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE %s DROP COLUMN %I', '${tableName}', col_name);
        END IF;

        SELECT column_name INTO col_name
        FROM information_schema.columns
        WHERE table_schema = lower(split_part('${tableName}', '.', 1))
          AND table_name = lower(split_part('${tableName}', '.', 2))
          AND column_name ILIKE 'rhs_value';
        IF col_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE %s DROP COLUMN %I', '${tableName}', col_name);
        END IF;
      END $$;
    `);
  }

  // LHS/RHS moved from a single scalar value to a free-form list of spindle
  // readings on these six checking screens. Each row stays a single
  // submission (JSONB list + a denormalized count column) so Custom Report
  // stays a flat, one-row-per-submission table — a normalized child table
  // (spindle_readings, tried first) required a join that multiplied each
  // submission into one row per reading and made reports collapse/duplicate
  // visually, which is worse for this use case than the simpler JSONB blob.
  const lhsRhsArrayTables = [
    'spinning.speed_checking',
    'spinning.cots_checking',
    'spinning.bottom_apron_checking',
    'spinning.lycra_centering',
    'spinning.RSM_and_lycrasensor_cheking_online',
    'spinning.RSM_and_lycrasensor_cheking_offline'
  ];
  for (const tableName of lhsRhsArrayTables) {
    await client.query(`
      ALTER TABLE ${tableName}
        ADD COLUMN IF NOT EXISTS lhs_values JSONB,
        ADD COLUMN IF NOT EXISTS rhs_values JSONB,
        ADD COLUMN IF NOT EXISTS lhs_spindle_count INTEGER,
        ADD COLUMN IF NOT EXISTS rhs_spindle_count INTEGER;
    `);
  }

  await client.query(`DROP TABLE IF EXISTS spinning.spindle_readings`);

  // "Type 2" is a fault-subtype dropdown added only to the four apron/lycra/RSM
  // screens, not COTS or Speed Checking — kept in its own table (rather than a
  // column on each of those four tables) since it's conceptually a separate
  // fault classification, not part of the core measurement row.
  await client.query(`
    CREATE TABLE IF NOT EXISTS spinning.type2_faults (
      id BIGSERIAL PRIMARY KEY,
      checking_type TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      type2 TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'spinning'
          AND table_name = 'cots_checking'
          AND column_name = 'employeename'
      ) THEN
        ALTER TABLE spinning.cots_checking ALTER COLUMN EmployeeName DROP NOT NULL;
      END IF;
    END $$;
  `);

  // Consignee Name sits alongside Count From on every wheel-change type's
  // Existing/Proposed columns, and is required (together with Count) to look
  // up the matching PP ID's approval status before a first-time wheel change
  // can be submitted (see GET /wheel-change/pp-approval-status below).
  for (const tableName of [
    'spinning.wheel_change_inspection',
    'spinning.wheel_change_v2',
    'spinning.wheel_change'
  ]) {
    await client.query(`
      ALTER TABLE ${tableName}
        ADD COLUMN IF NOT EXISTS consignee_name_existing VARCHAR(200),
        ADD COLUMN IF NOT EXISTS consignee_name_proposed VARCHAR(200),
        ADD COLUMN IF NOT EXISTS consumed_pp_entry_id TEXT;
    `);
  }
  // consumed_pp_entry_id records which PP id's one-time Wheel Change slot
  // this row spent when it was saved (see the pp-approval-status gate and
  // the POST /wheel-change/type1-3 handlers below) - needed so a later
  // rejection of this Wheel Change knows exactly which PP to revert back to
  // Active.

  // Which L1 submitted each entry — needed so an L2's approvals queue can be
  // scoped to just the L1 employees assigned to them (users.supervisor_assignments)
  // rather than every submission across the whole plant. L3/Admin bypass this
  // scoping entirely (see resolveApprovalVisibilityScope below).
  for (const tableName of [
    'spinning.wheel_change_inspection',
    'spinning.wheel_change_v2',
    'spinning.wheel_change',
    'spinning.spinning_qc_header'
  ]) {
    await client.query(`
      ALTER TABLE ${tableName}
        ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER;
    `);
  }

  await client.query(`
    ALTER TABLE spinning.wheel_change
      ADD COLUMN IF NOT EXISTS bdw_existing VARCHAR(100),
      ADD COLUMN IF NOT EXISTS bdw_proposed VARCHAR(100),
      ADD COLUMN IF NOT EXISTS dca_existing VARCHAR(100),
      ADD COLUMN IF NOT EXISTS dca_proposed VARCHAR(100),
      ADD COLUMN IF NOT EXISTS dcb_existing NUMERIC,
      ADD COLUMN IF NOT EXISTS dcb_proposed NUMERIC,
      ADD COLUMN IF NOT EXISTS dfc_existing VARCHAR(100),
      ADD COLUMN IF NOT EXISTS dfc_proposed VARCHAR(100),
      ADD COLUMN IF NOT EXISTS dc_existing VARCHAR(100),
      ADD COLUMN IF NOT EXISTS dc_proposed VARCHAR(100),
      ADD COLUMN IF NOT EXISTS tcw_existing VARCHAR(100),
      ADD COLUMN IF NOT EXISTS tcw_proposed VARCHAR(100),
      ADD COLUMN IF NOT EXISTS tw_existing VARCHAR(100),
      ADD COLUMN IF NOT EXISTS tw_proposed VARCHAR(100),
      ADD COLUMN IF NOT EXISTS total_draft_existing NUMERIC,
      ADD COLUMN IF NOT EXISTS total_draft_proposed NUMERIC;
  `);

  await client.query(`DROP TABLE IF EXISTS spinning.wheel_change_type4`);

  for (const tableName of [
    'spinning.wheel_change_inspection',
    'spinning.wheel_change_v2',
    'spinning.wheel_change'
  ]) {
    await client.query(`
      ALTER TABLE ${tableName}
        ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
        ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS review_remarks TEXT;
    `);
    // ADD COLUMN IF NOT EXISTS above is a no-op once the column already
    // exists, so a stale/incorrect default from an older migration would
    // otherwise persist forever. Force it explicitly on every startup.
    await client.query(`
      ALTER TABLE ${tableName} ALTER COLUMN approval_status SET DEFAULT 'pending';
    `);
  }

  // "Slub Partcy Code" was a typo of "Slub Party Code" — rename the existing column (preserving
  // its data) rather than adding a new one, guarded so it only runs once per environment.
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'spinning' AND table_name = 'spinning_qc_header' AND column_name = 'slub_partcy_code'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'spinning' AND table_name = 'spinning_qc_header' AND column_name = 'slub_party_code'
      ) THEN
        ALTER TABLE spinning.spinning_qc_header RENAME COLUMN slub_partcy_code TO slub_party_code;
      END IF;
    END $$;
  `);

  await client.query(`
    ALTER TABLE spinning.spinning_qc_header
      ADD COLUMN IF NOT EXISTS slub_party_code TEXT,
      ADD COLUMN IF NOT EXISTS slub_mtr NUMERIC,
      ADD COLUMN IF NOT EXISTS pause_min NUMERIC,
      ADD COLUMN IF NOT EXISTS pause_max NUMERIC,
      ADD COLUMN IF NOT EXISTS slub_min NUMERIC,
      ADD COLUMN IF NOT EXISTS slub_max NUMERIC,
      ADD COLUMN IF NOT EXISTS thickness_min NUMERIC,
      ADD COLUMN IF NOT EXISTS thickness_max NUMERIC,
      ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS review_remarks TEXT;
  `);
  // NOTE: approval_status/reviewed_by/reviewed_at/review_remarks above are no
  // longer what gates Wheel Change - that moved to a single approval on the
  // whole PP id (process_parameters.master.status, see processParameters.js
  // and GET /wheel-change/pp-approval-status below). These columns are kept
  // only because dropping them would lose historical data already recorded
  // under the old per-row model; nothing new writes to them.
  // ADD COLUMN IF NOT EXISTS above is a no-op once the column already exists,
  // so a stale/incorrect default from an older migration would otherwise
  // persist forever. Force it explicitly on every startup, same as the
  // wheel-change tables' approval_status default.
  await client.query(`
    ALTER TABLE spinning.spinning_qc_header ALTER COLUMN approval_status SET DEFAULT 'pending';
  `);
};

// Writes the Type-2 fault-subtype value into its own table for a given
// checking screen + submission, replacing any prior value for that
// (checking_type, entry_id) — used on every save so edits to an existing
// entry_id don't leave a stale row behind. Caller is expected to be inside a
// transaction alongside the parent row insert.
const replaceType2Fault = async (checkingType, entryId, type2Value) => {
  await client.query(
    `DELETE FROM spinning.type2_faults WHERE checking_type = $1 AND entry_id = $2`,
    [checkingType, entryId]
  );
  if (!type2Value) return;
  await client.query(
    `INSERT INTO spinning.type2_faults (checking_type, entry_id, type2) VALUES ($1,$2,$3)`,
    [checkingType, entryId, type2Value]
  );
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

const getSpinningMachines = async (req, res, next) => {
  try {
    const prefix = String(req.query.prefix || '').trim();
    const deptCode = String(req.query.dept_code || '').trim();
    const deptName = String(req.query.dept_name || req.query.department || '').trim();
    const likeToken = `%${prefix}%`;

    if (!sqlServer.hasSqlServerEnv()) {
      const fallback = await client.query(
        `SELECT mccode, mcname, deptcode, deptname
         FROM ticketing_system.mc_master
         WHERE ($1::text = '' OR mccode::text ILIKE $2 OR mcname ILIKE $2)
           AND ($3::text = '' OR deptcode::text = $3)
           AND ($4::text = '' OR deptname ILIKE $5)
         ORDER BY deptname, mccode`,
        [prefix, likeToken, deptCode, deptName, `%${deptName}%`]
      );

      const data = fallback.rows.map((r) => ({
        mc_no: String(r.mccode || '').trim(),
        mc_name: String(r.mcname || '').trim(),
        dept_code: String(r.deptcode || '').trim(),
        dept_name: String(r.deptname || '').trim()
      })).filter((r) => r.mc_no || r.mc_name);

      return res.status(200).json({
        source: 'postgres-fallback',
        data,
        machine_numbers: data.map((r) => r.mc_no || r.mc_name),
        names: data.map((r) => r.mc_name || r.mc_no)
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
         AND (@prefix = '' OR CAST(m.MCCODE AS VARCHAR(50)) LIKE @machinePrefix OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @machinePrefix)
         AND (@deptCode = '' OR CAST(m.DEPTCODE AS VARCHAR(50)) = @deptCode)
         AND (@deptName = '' OR LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) LIKE @deptNameLike)
       ORDER BY d.DEPTNAME, CASE WHEN ISNUMERIC(CAST(m.MCCODE AS VARCHAR(50))) = 1 THEN CAST(m.MCCODE AS INT) ELSE 2147483647 END, m.MCNAME`,
      {
        prefix,
        machinePrefix: likeToken,
        deptCode,
        deptName,
        deptNameLike: `%${deptName}%`
      }
    );

    const data = (result.recordset || []).map((r) => ({
      mc_no: String(r.mc_no || '').trim(),
      mc_name: String(r.mc_name || '').trim(),
      dept_code: String(r.dept_code || '').trim(),
      dept_name: String(r.dept_name || '').trim()
    })).filter((r) => r.mc_no || r.mc_name);

    return res.status(200).json({
      source: 'sqlserver',
      data,
      machine_numbers: data.map((r) => r.mc_no || r.mc_name),
      names: data.map((r) => r.mc_name || r.mc_no)
    });
  } catch (error) {
    next(error);
  }
};

const fetchSpinningVarieties = async (prefix = '') => {
  const likeToken = `%${prefix}%`;
  const result = await sqlServer.query(
    `SELECT
       MIN(CAST(v.VARCODE AS VARCHAR(50))) AS var_code,
       LTRIM(RTRIM(CAST(v.VARNAME AS VARCHAR(255)))) AS variety_name
     FROM dbo.VARIETY v
     WHERE v.compcode = '1'
       AND LTRIM(RTRIM(CAST(v.VARNAME AS VARCHAR(255)))) <> ''
       AND (@prefix = '' OR LTRIM(RTRIM(CAST(v.VARNAME AS VARCHAR(255)))) LIKE @varietyPrefix)
     GROUP BY LTRIM(RTRIM(CAST(v.VARNAME AS VARCHAR(255))))
     ORDER BY MIN(CASE WHEN ISNUMERIC(CAST(v.VARCODE AS VARCHAR(50))) = 1 THEN CAST(v.VARCODE AS INT) ELSE 2147483647 END), variety_name`,
    { prefix, varietyPrefix: likeToken }
  );

  return dedupeVarieties(result.recordset || []);
};

const buildVarietyOptions = (varieties, placeholder = '-- Select Variety --') => [
  { text: placeholder, label: placeholder, value: '' },
  ...varieties.map((v) => ({
    text: v.variety_name,
    label: v.variety_name,
    value: v.variety_name
  }))
];

const buildCountNameRows = (counts) => counts.map((row) => ({
  cntcode: row.var_code,
  cntname: row.variety_name,
  var_code: row.var_code,
  variety_name: row.variety_name
}));

const quoteSqlServerIdentifier = (value) => {
  const text = String(value || '').trim();
  if (!text || !/^[\w\s.-]+$/.test(text)) return null;
  return `[${text.replace(/]/g, ']]')}]`;
};

const isInvalidSqlServerObjectName = (err) => {
  const errorText = String(err?.message || err?.originalError?.message || '');
  return err?.number === 208
    || err?.originalError?.info?.number === 208
    || /Invalid object name/i.test(errorText);
};

const getSpinningVarieties = async (req, res) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const prefix = String(req.query.variety_prefix || req.query.prefix || '').trim();
    const data = await fetchSpinningVarieties(prefix);

    return res.status(200).json({
      source: 'sqlserver',
      data,
      // Backward-compatible keys for older dropdown code that was wired to machine endpoints.
      machine_numbers: data.map((r) => r.variety_name),
      names: data.map((r) => r.variety_name),
      variety_names: data.map((r) => r.variety_name),
      values: data.map((r) => r.variety_name),
      options: buildVarietyOptions(data)
    });
  } catch (err) {
    console.error('Error fetching spinning varieties from SQL Server:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const fetchCountChangeCountNames = async ({ prefix = '' } = {}) => {
  const result = await sqlServer.query(
    `SELECT
       MIN(LTRIM(RTRIM(CAST(cntcode AS VARCHAR(50))))) AS var_code,
       LTRIM(RTRIM(REPLACE(REPLACE(CAST(cntname AS VARCHAR(255)), CHAR(13), ''), CHAR(10), ''))) AS variety_name
     FROM dbo.Depot_CountMaster
     WHERE LTRIM(RTRIM(CAST(cntname AS VARCHAR(255)))) <> ''
       AND (@prefix = '' OR LTRIM(RTRIM(CAST(cntname AS VARCHAR(255)))) LIKE @prefixLike)
     GROUP BY LTRIM(RTRIM(REPLACE(REPLACE(CAST(cntname AS VARCHAR(255)), CHAR(13), ''), CHAR(10), '')))
     ORDER BY MIN(CASE WHEN ISNUMERIC(CAST(cntcode AS VARCHAR(50))) = 1 THEN CAST(cntcode AS INT) ELSE 2147483647 END), variety_name`,
    {
      prefix,
      prefixLike: `%${prefix}%`
    }
  );

  return dedupeVarieties(result.recordset || []);
};

const getCountChangeCountNames = async (req, res) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const prefix = String(req.query.count_prefix || req.query.prefix || '').trim();
    const data = await fetchCountChangeCountNames({ prefix });
    const countOptions = buildVarietyOptions(data, '-- Select Count --');
    const countRows = buildCountNameRows(data);

    return res.status(200).json({
      source: 'sqlserver',
      count_database: null,
      count_table: 'dbo.Depot_CountMaster',
      data,
      count_options: countRows,
      counts: data,
      count_names: data.map((r) => r.variety_name),
      variety_names: data.map((r) => r.variety_name),
      names: data.map((r) => r.variety_name),
      values: data.map((r) => r.variety_name),
      count_name_from: countOptions,
      count_name_to: countOptions,
      options: countOptions,
      dropdown_options: {
        count_name_from: countOptions,
        count_name_to: countOptions
      }
    });
  } catch (err) {
    console.error('Error fetching count-change count names from SQL Server:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const toDropdownOptions = (values, placeholder) => [
  { text: placeholder, value: '' },
  ...values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .map((value) => ({ text: value, value }))
];

const numberRange = (start, end) => Array.from(
  { length: end - start + 1 },
  (_, index) => String(start + index)
);

const WHEEL_CHANGE_TYPE3_RF_NOS = [
  1, 2, 3, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 20, 24
].map((value) => `R/F NO ${String(value).padStart(2, '0')}`);

const SPINNING_LYCRA_MACHINE_OPTIONS = [
  ...Array.from({ length: 25 }, (_, index) => {
    const value = String(index + 1).padStart(2, '0');
    return { value, label: value, text: value };
  }),
  { value: 'All Ring frames', label: 'All Lycra frame', text: 'All Lycra frame' }
];

const WHEEL_CHANGE_DROPDOWN_VALUES = {
  bdw: numberRange(40, 68),
  dca: ['0', '35', '43', '53', '67', '82'],
  dfc: ['0', '132', '133', '134', '135'],
  dc: ['0', ...numberRange(30, 70)],
  tcw: ['36/88', '47/77', '53/71', '65/59'],
  tw: []
};

const formatRfMachineName = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';

  const rfMatch = text.match(/\bR\s*\/?\s*F\s*(?:NO\.?|NUMBER|#)?\s*0*(\d{1,3})\b/i);
  if (rfMatch) {
    return `R/F NO ${String(Number(rfMatch[1])).padStart(2, '0')}`;
  }

  return text;
};

const getRfMachineValue = (row = {}) => formatRfMachineName(row.rf_name || row.rf_no || '');

const getSpinningLycraMachineNumbers = async (req, res, next) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const prefix = String(req.query.prefix || req.query.machine_prefix || '').trim();
    const deptCode = String(req.query.dept_code || '').trim();
    const deptName = String(req.query.dept_name || req.query.department || 'Spinning').trim() || 'Spinning';
    const likeToken = `%${prefix}%`;

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
         AND (@prefix = '' OR CAST(m.MCCODE AS VARCHAR(50)) LIKE @machinePrefix OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @machinePrefix)
         AND (@deptCode = '' OR CAST(m.DEPTCODE AS VARCHAR(50)) = @deptCode)
         AND (@deptName = '' OR LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) LIKE @deptNameLike)
       ORDER BY d.DEPTNAME, CASE WHEN ISNUMERIC(CAST(m.MCCODE AS VARCHAR(50))) = 1 THEN CAST(m.MCCODE AS INT) ELSE 2147483647 END, m.MCNAME`,
      {
        prefix,
        machinePrefix: likeToken,
        deptCode,
        deptName,
        deptNameLike: `%${deptName}%`
      }
    );

    const data = (result.recordset || []).map((r) => ({
      mc_no: String(r.mc_no || '').trim(),
      mc_name: String(r.mc_name || '').trim(),
      machine_no: String(r.mc_no || '').trim(),
      machine_number: String(r.mc_no || '').trim(),
      label: String(r.mc_name || r.mc_no || '').trim(),
      text: String(r.mc_name || r.mc_no || '').trim(),
      value: String(r.mc_no || r.mc_name || '').trim()
    })).filter((row) => row.value);

    const options = [
      { text: '-- Select MC No --', label: '-- Select MC No --', value: '' },
      ...data.map((row) => ({
        text: row.text,
        label: row.label,
        value: row.value,
        mc_no: row.mc_no,
        mc_name: row.mc_name
      }))
    ];

    return res.status(200).json({
      source: 'sqlserver',
      data,
      machine_numbers: data.map((row) => row.value),
      machine_nos: data.map((row) => row.value),
      mc_nos: data.map((row) => row.value),
      names: data.map((row) => row.label),
      values: data.map((row) => row.value),
      options
    });
  } catch (error) {
    next(error);
  }
};

const normalizeWheelChangeMachineRow = (row = {}) => {
  const machine = String(row.mc_no || row.machine_no || row.full_mc_no || '').trim();
  return {
    ...row,
    machine_no: row.machine_no || machine,
    machine_no_existing: row.machine_no_existing || machine,
    machine_no_proposed: row.machine_no_proposed || machine,
    machine_number_existing: row.machine_number_existing || machine,
    machine_number_proposed: row.machine_number_proposed || machine,
    mc_no_existing: row.mc_no_existing || row.mc_no || machine,
    mc_no_proposed: row.mc_no_proposed || row.mc_no || machine
  };
};

const withWheelChangeMachineAliases = (record, sourceField) => {
  const row = normalizeWheelChangeMachineRow(record);
  const machineNo = row.machine_no || row[sourceField] || row.mc_no || row.rf_no || row.fr_no || null;
  if (!machineNo) return row;

  return {
    ...row,
    machine_no: machineNo,
    machine_no_existing: row.machine_no_existing || machineNo,
    machine_no_proposed: row.machine_no_proposed || machineNo,
    machine_number_existing: row.machine_number_existing || machineNo,
    machine_number_proposed: row.machine_number_proposed || machineNo,
    display_machine_no: machineNo
  };
};

const getWheelChangeMasterDropdown = async (req, res, next) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const varietyPrefix = String(req.query.variety_prefix || req.query.prefix || req.query.count_prefix || '').trim();
    const rfPrefix = String(req.query.rf_prefix || process.env.SPINNING_RF_PREFIX || 'RF').trim();
    const rfSearchPrefix = String(req.query.rf_search || req.query.rf_no_prefix || '').trim();
    const deptCode = String(req.query.dept_code || '').trim();
    const deptName = String(req.query.dept_name || req.query.department || '').trim();
    const rfLike = `%${rfPrefix}%`;
    const rfAltLike = rfPrefix.replace(/[\/\s.-]/g, '').toUpperCase() === 'RF' ? '%R/F%' : rfLike;

    const countRows = await fetchCountChangeCountNames({ prefix: varietyPrefix });
    const [rfResult] = await Promise.all([
      sqlServer.query(
        `SELECT
           CAST(m.MCCODE AS VARCHAR(50)) AS rf_no,
           LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) AS rf_name,
           CAST(m.DEPTCODE AS VARCHAR(50)) AS dept_code,
           LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) AS dept_name
         FROM dbo.MCMASTER m
         JOIN dbo.dept_mai d ON m.DEPTCODE = d.DEPTCODE
         WHERE m.compcode = '1'
           AND m.mcclose = '0'
           AND (@prefix = '' OR CAST(m.MCCODE AS VARCHAR(50)) LIKE @machinePrefix OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @machinePrefix)
           AND (@rfPrefix = '' OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @rfLike OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @rfAltLike)
           AND (@deptCode = '' OR CAST(m.DEPTCODE AS VARCHAR(50)) = @deptCode)
           AND (@deptName = '' OR LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) LIKE @deptNameLike)
         ORDER BY CASE WHEN ISNUMERIC(CAST(m.MCCODE AS VARCHAR(50))) = 1 THEN CAST(m.MCCODE AS INT) ELSE 2147483647 END, m.MCNAME`,
        {
          prefix: rfSearchPrefix,
          machinePrefix: `%${rfSearchPrefix}%`,
          rfPrefix,
          rfLike,
          rfAltLike,
          deptCode,
          deptName,
          deptNameLike: `%${deptName}%`
        }
      )
    ]);

    const varieties = countRows;
    const rfNos = (rfResult.recordset || []).map((r) => {
      const rfName = formatRfMachineName(r.rf_name);
      return {
        mc_code: rfName,
        raw_mc_code: String(r.rf_no || '').trim(),
        raw_rf_name: String(r.rf_name || '').trim(),
        rf_name: rfName,
        rf_no: rfName,
        rf_value: rfName,
        dept_code: String(r.dept_code || '').trim(),
        dept_name: String(r.dept_name || '').trim()
      };
    }).filter((r) => r.rf_name);

    const varietyOptions = [
      { text: '-- Select Variety --', value: '' },
      ...varieties.map((v) => ({ text: v.variety_name, value: v.variety_name }))
    ];
    const rfOptions = rfNos.length
      ? [
        { text: '-- Select RF No --', value: '' },
        ...rfNos.map((r) => ({
          text: r.rf_name,
          label: r.rf_name,
          value: getRfMachineValue(r),
          mc_code: r.mc_code,
          machine_name: r.rf_name
        }))
      ]
      : toDropdownOptions(WHEEL_CHANGE_TYPE3_RF_NOS, '-- Select RF No --');

    const bdwOptions = toDropdownOptions(WHEEL_CHANGE_DROPDOWN_VALUES.bdw, '-- Select BDW --');
    const dcaOptions = toDropdownOptions(WHEEL_CHANGE_DROPDOWN_VALUES.dca, '-- Select DCA --');
    const dfcOptions = toDropdownOptions(WHEEL_CHANGE_DROPDOWN_VALUES.dfc, '-- Select DFC --');
    const dcOptions = toDropdownOptions(WHEEL_CHANGE_DROPDOWN_VALUES.dc, '-- Select DC --');
    const tcwOptions = toDropdownOptions(WHEEL_CHANGE_DROPDOWN_VALUES.tcw, '-- Select TCW --');
    const twOptions = toDropdownOptions(WHEEL_CHANGE_DROPDOWN_VALUES.tw, '-- Select TW --');

    return res.status(200).json({
      source: 'sqlserver',
      count_table: 'dbo.Depot_CountMaster',
      varieties,
      variety_names: varieties.map((r) => r.variety_name),
      rf_nos: rfNos,
      fr_nos: rfNos.map(getRfMachineValue).filter(Boolean),
      fm_nos: rfNos.map(getRfMachineValue).filter(Boolean),
      default_fr_nos: WHEEL_CHANGE_TYPE3_RF_NOS,
      dropdown_values: WHEEL_CHANGE_DROPDOWN_VALUES,
      machine_no_existing: rfNos,
      machine_no_proposed: rfNos,
      options: {
        variety: varietyOptions,
        count_from: varietyOptions,
        count_from_existing: varietyOptions,
        count_from_proposed: varietyOptions,
        machine_no_existing: rfOptions,
        machine_no_proposed: rfOptions,
        rf_no: rfOptions,
        rf_no_existing: rfOptions,
        rf_no_proposed: rfOptions,
        fr_no: rfOptions,
        fr_no_existing: rfOptions,
        fr_no_proposed: rfOptions,
        fm_no: rfOptions,
        fm_no_existing: rfOptions,
        fm_no_proposed: rfOptions,
        bdw: bdwOptions,
        bdw_existing: bdwOptions,
        bdw_proposed: bdwOptions,
        dca: dcaOptions,
        dca_existing: dcaOptions,
        dca_proposed: dcaOptions,
        dfc: dfcOptions,
        dfc_existing: dfcOptions,
        dfc_proposed: dfcOptions,
        dc: dcOptions,
        dc_existing: dcOptions,
        dc_proposed: dcOptions,
        tcw: tcwOptions,
        tcw_existing: tcwOptions,
        tcw_proposed: tcwOptions,
        tw: twOptions,
        tw_existing: twOptions,
        tw_proposed: twOptions
      }
    });
  } catch (error) {
    next(error);
  }
};

const fetchLatestWheelChangeByVariety = async (tableName, variety, fields, approvalStatus = 'approved') => {
  const selectedVariety = String(variety || '').trim();
  if (!selectedVariety) return null;

  const fieldClauses = fields
    .map((field) => `LOWER(TRIM(COALESCE(${field}::text, ''))) = LOWER(TRIM($1))`)
    .join(' OR ');

  const result = await client.query(
    `SELECT *
     FROM ${tableName}
     WHERE (${fieldClauses})
       AND approval_status = $2
     ORDER BY created_at DESC NULLS LAST, id DESC
     LIMIT 1`,
    [selectedVariety, approvalStatus]
  );

  return result.rows[0] || null;
};

// Mirrors fetchLatestWheelChangeByVariety, but scoped to a Machine No. (R/F
// No.) instead of a variety — used so the Existing column can carry forward
// as soon as Type + Machine No. are picked, without waiting for Count From.
const fetchLatestWheelChangeByMachine = async (tableName, machineField, machineNumber, approvalStatus = 'approved') => {
  const selectedMachine = String(machineNumber || '').trim();
  if (!selectedMachine) return null;

  const result = await client.query(
    `SELECT *
     FROM ${tableName}
     WHERE LOWER(TRIM(COALESCE(${machineField}::text, ''))) = LOWER(TRIM($1))
       AND approval_status = $2
     ORDER BY created_at DESC NULLS LAST, id DESC
     LIMIT 1`,
    [selectedMachine, approvalStatus]
  );

  return result.rows[0] || null;
};

const getCountChangeMasterDropdown = async (req, res, next) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const prefix = String(req.query.variety_prefix || req.query.count_prefix || req.query.prefix || '').trim();
    const varieties = await fetchCountChangeCountNames({ prefix });
    const countOptions = buildVarietyOptions(varieties, '-- Select Count --');
    const countRows = buildCountNameRows(varieties);

    return res.status(200).json({
      source: 'sqlserver',
      count_database: null,
      count_table: 'dbo.Depot_CountMaster',
      data: varieties,
      count_options: countRows,
      counts: varieties,
      varieties,
      count_names: varieties.map((r) => r.variety_name),
      variety_names: varieties.map((r) => r.variety_name),
      names: varieties.map((r) => r.variety_name),
      values: varieties.map((r) => r.variety_name),
      count_name_from: countOptions,
      count_name_to: countOptions,
      options: {
        count_name_from: countOptions,
        count_name_to: countOptions,
        count_from: countOptions,
        count_to: countOptions,
        variety: countOptions
      },
      dropdown_options: {
        count_name_from: countOptions,
        count_name_to: countOptions,
        count_from: countOptions,
        count_to: countOptions,
        variety: countOptions
      }
    });
  } catch (error) {
    next(error);
  }
};

const getEmployeeMasterDropdown = createEmployeeMasterDropdown(sqlServer, 'spinning');

const buildBottomApronEmployeeOptions = (employees) => [
  { text: '-- Select Employee --', label: '-- Select Employee --', value: '' },
  ...employees.map((employee) => ({
    text: employee.employee_name,
    label: employee.employee_name,
    value: employee.employee_name,
    employee_code: employee.employee_code,
    employee_name: employee.employee_name,
    checker_name: employee.employee_name,
    empl_no: employee.employee_code,
    name: employee.employee_name
  }))
];

const getBottomApronEmployeeDropdown = async (req, res, next) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const prefix = String(
      req.query.employee_prefix ||
      req.query.checker_prefix ||
      req.query.operator_prefix ||
      req.query.user_prefix ||
      req.query.prefix ||
      ''
    ).trim();
    const params = {
      prefix,
      prefixLike: `%${prefix}%`
    };
    BOTTOM_APRON_EMPLOYEE_NAMES.forEach((name, index) => {
      params[`name${index}`] = `%${name}%`;
    });

    const nameConditions = BOTTOM_APRON_EMPLOYEE_NAMES
      .map((_, index) => `LTRIM(RTRIM(CAST(e.Name AS VARCHAR(255)))) LIKE @name${index}`)
      .join(' OR ');
    const orderCases = BOTTOM_APRON_EMPLOYEE_NAMES
      .map((_, index) => `WHEN LTRIM(RTRIM(CAST(e.Name AS VARCHAR(255)))) LIKE @name${index} THEN ${index}`)
      .join(' ');

    const result = await sqlServer.query(
      `SELECT TOP 100
         CAST(e.Emplno AS VARCHAR(50)) AS employee_code,
         LTRIM(RTRIM(CAST(e.Name AS VARCHAR(255)))) AS employee_name
       FROM dbo.EMPLOYEEMAS e
       WHERE e.DateOfReleave = CONVERT(datetime, '9999-01-01 00:00:00.000', 121)
         AND LTRIM(RTRIM(CAST(e.Name AS VARCHAR(255)))) <> ''
         AND (${nameConditions})
         AND (
           @prefix = ''
           OR LTRIM(RTRIM(CAST(e.Name AS VARCHAR(255)))) LIKE @prefixLike
           OR CAST(e.Emplno AS VARCHAR(50)) LIKE @prefixLike
         )
       ORDER BY
         CASE ${orderCases} ELSE 999 END,
         LTRIM(RTRIM(CAST(e.Name AS VARCHAR(255))))`,
      params
    );

    const data = result.recordset || [];
    const options = buildBottomApronEmployeeOptions(data);
    const names = data.map((row) => row.employee_name);

    return res.status(200).json({
      source: 'sqlserver',
      table: 'EMPLOYEEMAS',
      active_filter: "DateOfReleave = '9999-01-01 00:00:00.000'",
      allowed_names: BOTTOM_APRON_EMPLOYEE_NAMES,
      data,
      employees: data,
      employee_names: names,
      checker_names: names,
      checked_by_names: names,
      operator_names: names,
      user_names: names,
      names,
      values: names,
      options,
      dropdown_options: {
        employee_name: options,
        checker_name: options,
        checked_by: options,
        checkedBy: options,
        employeename: options,
        operator_name: options,
        user_name: options
      }
    });
  } catch (error) {
    console.error('Error fetching spinning bottom apron employees from SQL Server:', error);
    next(error);
  }
};

router.get('/master/machines', getSpinningMachines);
router.get('/master/varieties', getSpinningVarieties);
router.get('/master/counts', getCountChangeCountNames);
router.get('/master/count-dropdown', getCountChangeCountNames);
router.get('/master/count-names', getCountChangeCountNames);
router.get('/master/employees', getEmployeeMasterDropdown);
router.get('/master/employee-dropdown', getEmployeeMasterDropdown);
router.get('/master/employee-names', getEmployeeMasterDropdown);
router.get('/master/user-names', getEmployeeMasterDropdown);
router.get('/master/operator-names', getEmployeeMasterDropdown);
router.get('/bottom-apron-checking/master/employees', getBottomApronEmployeeDropdown);
router.get('/bottom-apron-checking/master/employee-dropdown', getBottomApronEmployeeDropdown);
router.get('/bottom-apron-checking/master/employee-names', getBottomApronEmployeeDropdown);
router.get('/bottom-apron-checking/master/operator-names', getBottomApronEmployeeDropdown);
router.get('/bottom-apron-checking/master/user-names', getBottomApronEmployeeDropdown);
router.get('/bottom-apron-checking/master/checkers', getBottomApronEmployeeDropdown);
router.get('/bottom-apron-checking/master/checker-dropdown', getBottomApronEmployeeDropdown);
router.get('/bottom-apron-checking/master/checker-names', getBottomApronEmployeeDropdown);
router.get('/bottom-apron-checking/master/checked-by', getBottomApronEmployeeDropdown);
router.get('/bottom-apron-checking/master/checked-by-dropdown', getBottomApronEmployeeDropdown);
router.get('/bottom-apron-checking/master/checked-by-names', getBottomApronEmployeeDropdown);
router.get('/bottom-apron-checking/employees', getBottomApronEmployeeDropdown);
router.get('/bottom-apron-checking/employee-dropdown', getBottomApronEmployeeDropdown);
router.get('/bottom-apron-checking/employee-names', getBottomApronEmployeeDropdown);
router.get('/bottom-apron-checking/operator-names', getBottomApronEmployeeDropdown);
router.get('/bottom-apron-checking/checkers', getBottomApronEmployeeDropdown);
router.get('/bottom-apron-checking/checker-dropdown', getBottomApronEmployeeDropdown);
router.get('/bottom-apron-checking/checker-names', getBottomApronEmployeeDropdown);
router.get('/bottom-apron-checking/checked-by', getBottomApronEmployeeDropdown);
router.get('/cots-checking/machines', getSpinningVarieties);
router.get('/cots-checking/master/machines', getSpinningVarieties);
router.get('/cots-checking/varieties', getSpinningVarieties);
router.get('/cots-checking/master/varieties', getSpinningVarieties);
router.get('/cots-checking/master/counts', getCountChangeCountNames);
router.get('/cots-checking/master/count-dropdown', getCountChangeCountNames);
router.get('/cots-checking/master/count-names', getCountChangeCountNames);
router.get('/count-change/varieties', getCountChangeCountNames);
router.get('/count-change/master/varieties', getCountChangeCountNames);
router.get('/count-change/count-names', getCountChangeCountNames);
router.get('/count-change/count-dropdown', getCountChangeCountNames);
router.get('/count-change/master/counts', getCountChangeCountNames);
router.get('/count-change/master/count-dropdown', getCountChangeCountNames);
router.get('/count-change/master/count-names', getCountChangeCountNames);
router.get('/count-change/dropdown', getCountChangeMasterDropdown);
router.get('/count-change/master/dropdown', getCountChangeMasterDropdown);
router.get('/wheel-change/varieties', getSpinningVarieties);
router.get('/wheel-change/master/varieties', getSpinningVarieties);
router.get('/wheel-change/type1/varieties', getSpinningVarieties);
router.get('/wheel-change/type1/master/varieties', getSpinningVarieties);
router.get('/wheel-change/type2/varieties', getSpinningVarieties);
router.get('/wheel-change/type2/master/varieties', getSpinningVarieties);
router.get('/wheel-change/type3/varieties', getSpinningVarieties);
router.get('/wheel-change/type3/master/varieties', getSpinningVarieties);
router.get('/wheel-change/count-names', getCountChangeCountNames);
router.get('/wheel-change/count-dropdown', getCountChangeCountNames);
router.get('/wheel-change/master/counts', getCountChangeCountNames);
router.get('/wheel-change/master/count-dropdown', getCountChangeCountNames);
router.get('/wheel-change/master/count-names', getCountChangeCountNames);
router.get('/wheel-change/master/employees', getEmployeeMasterDropdown);
router.get('/wheel-change/master/employee-dropdown', getEmployeeMasterDropdown);
router.get('/wheel-change/master/employee-names', getEmployeeMasterDropdown);
router.get('/wheel-change/dropdown', getWheelChangeMasterDropdown);
router.get('/wheel-change/master/dropdown', getWheelChangeMasterDropdown);
router.get('/wheel-change/type1/dropdown', getWheelChangeMasterDropdown);
router.get('/wheel-change/type1/master/dropdown', getWheelChangeMasterDropdown);
router.get('/wheel-change/type2/dropdown', getWheelChangeMasterDropdown);
router.get('/wheel-change/type2/master/dropdown', getWheelChangeMasterDropdown);
router.get('/wheel-change/type3/dropdown', getWheelChangeMasterDropdown);
router.get('/wheel-change/type3/master/dropdown', getWheelChangeMasterDropdown);

const getCountChangeRfNos = async (req, res, next) => {
  try {
    const prefix = String(req.query.prefix || '').trim();
    const rfPrefix = String(req.query.rf_prefix || process.env.SPINNING_RF_PREFIX || 'RF').trim();
    const deptCode = String(req.query.dept_code || '').trim();
    const deptName = String(req.query.dept_name || req.query.department || '').trim();
    const likeToken = `%${prefix}%`;
    const rfLike = `%${rfPrefix}%`;
    const rfAltLike = rfPrefix.replace(/[\/\s.-]/g, '').toUpperCase() === 'RF' ? '%R/F%' : rfLike;

    if (!sqlServer.hasSqlServerEnv()) {
      const fallback = await client.query(
        `SELECT mccode, mcname, deptcode, deptname
         FROM ticketing_system.mc_master
         WHERE ($1::text = '' OR mccode::text ILIKE $2 OR mcname ILIKE $2)
           AND ($3::text = '' OR mcname ILIKE $4 OR mcname ILIKE $8)
           AND ($5::text = '' OR deptcode::text = $5)
           AND ($6::text = '' OR deptname ILIKE $7)
         ORDER BY mccode`,
        [prefix, likeToken, rfPrefix, rfLike, deptCode, deptName, `%${deptName}%`, rfAltLike]
      );

    const data = fallback.rows.map((r) => {
      const rfName = formatRfMachineName(r.mcname);
      return {
        mc_code: rfName,
        raw_mc_code: String(r.mccode || '').trim(),
        raw_rf_name: String(r.mcname || '').trim(),
        rf_name: rfName,
        rf_no: rfName,
        rf_value: rfName,
        dept_code: String(r.deptcode || '').trim(),
        dept_name: String(r.deptname || '').trim()
      };
    }).filter((r) => r.rf_name);

      const rfValues = data.map(getRfMachineValue).filter(Boolean);

      return res.status(200).json({
        source: 'postgres-fallback',
        rf_prefix: rfPrefix,
        data,
        machine_numbers: rfValues,
        rf_numbers: rfValues,
        rf_nos: rfValues,
        r_f_nos: rfValues,
        fm_nos: rfValues,
        fr_nos: rfValues,
        names: data.map((r) => r.rf_name || r.rf_no),
        values: rfValues,
        options: [
          { text: '-- Select RF No --', value: '' },
          ...data.map((r) => ({
            text: r.rf_name,
            label: r.rf_name,
            value: getRfMachineValue(r),
            mc_code: r.mc_code,
            machine_name: r.rf_name
          }))
        ]
      });
    }

    const result = await sqlServer.query(
      `SELECT
         CAST(m.MCCODE AS VARCHAR(50)) AS rf_no,
         LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) AS rf_name,
         CAST(m.DEPTCODE AS VARCHAR(50)) AS dept_code,
         LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) AS dept_name
       FROM dbo.MCMASTER m
       JOIN dbo.dept_mai d ON m.DEPTCODE = d.DEPTCODE
       WHERE m.compcode = '1'
         AND m.mcclose = '0'
         AND (@prefix = '' OR CAST(m.MCCODE AS VARCHAR(50)) LIKE @machinePrefix OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @machinePrefix)
         AND (@rfPrefix = '' OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @rfLike OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @rfAltLike)
         AND (@deptCode = '' OR CAST(m.DEPTCODE AS VARCHAR(50)) = @deptCode)
         AND (@deptName = '' OR LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) LIKE @deptNameLike)
       ORDER BY CASE WHEN ISNUMERIC(CAST(m.MCCODE AS VARCHAR(50))) = 1 THEN CAST(m.MCCODE AS INT) ELSE 2147483647 END, m.MCNAME`,
      {
        prefix,
        machinePrefix: likeToken,
        rfPrefix,
        rfLike,
        rfAltLike,
        deptCode,
        deptName,
        deptNameLike: `%${deptName}%`
      }
    );

    const data = (result.recordset || []).map((r) => {
      const rfName = formatRfMachineName(r.rf_name);
      return {
        mc_code: rfName,
        raw_mc_code: String(r.rf_no || '').trim(),
        raw_rf_name: String(r.rf_name || '').trim(),
        rf_name: rfName,
        rf_no: rfName,
        rf_value: rfName,
        dept_code: String(r.dept_code || '').trim(),
        dept_name: String(r.dept_name || '').trim()
      };
    }).filter((r) => r.rf_name);

    const rfValues = data.map(getRfMachineValue).filter(Boolean);

    return res.status(200).json({
      source: 'sqlserver',
      rf_prefix: rfPrefix,
      data,
      machine_numbers: rfValues,
      rf_numbers: rfValues,
      rf_nos: rfValues,
      r_f_nos: rfValues,
      fm_nos: rfValues,
      fr_nos: rfValues,
      names: data.map((r) => r.rf_name || r.rf_no),
      values: rfValues,
      options: [
        { text: '-- Select RF No --', value: '' },
        ...data.map((r) => ({
          text: r.rf_name,
          label: r.rf_name,
          value: getRfMachineValue(r),
          mc_code: r.mc_code,
          machine_name: r.rf_name
        }))
      ]
    });
  } catch (error) {
    next(error);
  }
};

const hasPostgresTable = async (tableName) => {
  const result = await client.query('SELECT to_regclass($1) IS NOT NULL AS exists', [tableName]);
  return Boolean(result.rows[0]?.exists);
};

router.get('/count-change/rf-nos', getCountChangeRfNos);
router.get('/count-change/master/rf-nos', getCountChangeRfNos);
router.get('/count-change/machines', getCountChangeRfNos);
router.get('/count-change/rfs', getCountChangeRfNos);
router.get('/wheel-change/rf-nos', getCountChangeRfNos);
router.get('/wheel-change/rf-no', getCountChangeRfNos);
router.get('/wheel-change/rf-numbers', getCountChangeRfNos);
router.get('/wheel-change/rf-number', getCountChangeRfNos);
router.get('/wheel-change/r-f-nos', getCountChangeRfNos);
router.get('/wheel-change/r-f-no', getCountChangeRfNos);
router.get('/wheel-change/master/rf-nos', getCountChangeRfNos);
router.get('/wheel-change/master/rf-numbers', getCountChangeRfNos);
router.get('/wheel-change/rfs', getCountChangeRfNos);
router.get('/wheel-change/machines', getCountChangeRfNos);
router.get('/wheel-change/fm-nos', getCountChangeRfNos);
router.get('/wheel-change/fr-nos', getCountChangeRfNos);
router.get('/wheel-change/type1/rf-nos', getCountChangeRfNos);
router.get('/wheel-change/type1/rf-numbers', getCountChangeRfNos);
router.get('/wheel-change/type1/master/rf-nos', getCountChangeRfNos);
router.get('/wheel-change/type1/fm-nos', getCountChangeRfNos);
router.get('/wheel-change/type2/rf-nos', getCountChangeRfNos);
router.get('/wheel-change/type2/rf-numbers', getCountChangeRfNos);
router.get('/wheel-change/type2/master/rf-nos', getCountChangeRfNos);
router.get('/wheel-change/type2/fm-nos', getCountChangeRfNos);
router.get('/wheel-change/type3/rf-nos', getCountChangeRfNos);
router.get('/wheel-change/type3/rf-numbers', getCountChangeRfNos);
router.get('/wheel-change/type3/master/rf-nos', getCountChangeRfNos);
router.get('/wheel-change/type3/fr-nos', getCountChangeRfNos);

router.get('/master/machine-numbers', getSpinningLycraMachineNumbers);
router.get('/master/machine-nos', getSpinningLycraMachineNumbers);
router.get('/master/mc-nos', getSpinningLycraMachineNumbers);
router.get('/machine-numbers', getSpinningLycraMachineNumbers);
router.get('/machine-nos', getSpinningLycraMachineNumbers);
router.get('/mc-nos', getSpinningLycraMachineNumbers);
router.get('/ring-frame/machine-numbers', getSpinningLycraMachineNumbers);
router.get('/ring-frame/machine-nos', getSpinningLycraMachineNumbers);
router.get('/ring-frame/mc-nos', getSpinningLycraMachineNumbers);
router.get('/ring-frame/master/machine-numbers', getSpinningLycraMachineNumbers);
router.get('/ring-frame/master/machine-nos', getSpinningLycraMachineNumbers);
router.get('/ring-frame/master/mc-nos', getSpinningLycraMachineNumbers);
router.get('/lycra-missing/machine-numbers', getSpinningLycraMachineNumbers);
router.get('/lycra-missing/master/machine-numbers', getSpinningLycraMachineNumbers);
router.get('/lycra-missing/master/mc-nos', getSpinningLycraMachineNumbers);
router.get('/lycra-centering/machine-numbers', getSpinningLycraMachineNumbers);
router.get('/lycra-centering/master/machine-numbers', getSpinningLycraMachineNumbers);
router.get('/lycra-centering/master/mc-nos', getSpinningLycraMachineNumbers);
router.get('/rsm-lycra-online/machine-numbers', getSpinningLycraMachineNumbers);
router.get('/rsm-lycra-online/master/machine-numbers', getSpinningLycraMachineNumbers);
router.get('/rsm-lycra-online/master/mc-nos', getSpinningLycraMachineNumbers);
router.get('/rsm-lycra-offline/machine-numbers', getSpinningLycraMachineNumbers);
router.get('/rsm-lycra-offline/master/machine-numbers', getSpinningLycraMachineNumbers);
router.get('/rsm-lycra-offline/master/mc-nos', getSpinningLycraMachineNumbers);

/**
 * @swagger
 * /spinning/speed-checking:
 *   post:
 *     summary: Create speed-checking record
 *     tags:
 *       - Spinning
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inspectiondate
 *               - machineno
 *               - employeename
 *               - display_speed
 *               - spindle_speed
 *               - lhs_value
 *               - rhs_value
 *             properties:
 *               inspectiondate:
 *                 type: string
 *                 format: date
 *               machineno:
 *                 type: integer
 *               employeename:
 *                 type: string
 *               display_speed:
 *                 type: number
 *               spindle_speed:
 *                 type: number
 *               lhs_value:
 *                 type: number
 *               rhs_value:
 *                 type: number
 *               difference:
 *                 type: number
 *                 description: Auto calculated (lhs_value - rhs_value)
 *               lhs_textremarks:
 *                 type: string
 *               lhs_audio:
 *                 type: string
 *                 description: Base64 encoded audio
 *               rhs_textremarks:
 *                 type: string
 *               rhs_audio:
 *                 type: string
 *                 description: Base64 encoded audio
 *     responses:
 *       201:
 *         description: Record created successfully
 *       500:
 *         description: Internal server error
 */

router.post('/speed-checking', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const {
      entry_id,
      inspectiondate,
      machineno,
      display_speed,
      spindle_speed,
      lhs_values,
      rhs_values,
      difference: payloadDifference,
      lhs_textremarks,
      lhs_audio,
      rhs_textremarks,
      rhs_audio
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    const hasLhsValues = Array.isArray(lhs_values);
    const hasRhsValues = Array.isArray(rhs_values);
    // Difference is computed on the frontend from Display/Spindle Speed
    // (LHS/RHS is a free-form spindle list, not a pair of numbers to subtract).
    const difference = payloadDifference ?? null;

    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO spinning.speed_checking
      (entry_id, InspectionDate, MachineNo,
       Display_Speed, Spindle_Speed,
       Difference,
       lhs_values, rhs_values, lhs_spindle_count, rhs_spindle_count,
       LHS_TextRemarks, LHS_Audio,
       RHS_TextRemarks, RHS_Audio)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *;
    `, [
      entry_id,
      inspectiondate,
      machineno,
      display_speed,
      spindle_speed,
      difference,
      hasLhsValues ? JSON.stringify(lhs_values) : null,
      hasRhsValues ? JSON.stringify(rhs_values) : null,
      hasLhsValues ? lhs_values.length : null,
      hasRhsValues ? rhs_values.length : null,
      lhs_textremarks || null,
      lhs_audio ? Buffer.from(lhs_audio, 'base64') : null,
      rhs_textremarks || null,
      rhs_audio ? Buffer.from(rhs_audio, 'base64') : null
    ]);

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Record created successfully',
      data: result.rows[0]
    });

  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(err);
  }
});

/**
 * @swagger
 * /spinning/speed-checking:
 *   get:
 *     summary: Get all speed-checking records
 *     tags:
 *       - Spinning
 *     responses:
 *       200:
 *         description: List of records
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /spinning/speed-checking:
 *   get:
 *     summary: Get all speed-checking records
 *     tags:
 *       - Spinning
 *     responses:
 *       200:
 *         description: List of records
 *       500:
 *         description: Internal server error
 */

router.get('/speed-checking', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const result = await client.query(`
      SELECT
        entry_id AS id,
        entry_id,
        InspectionDate,
        MachineNo,
        Display_Speed,
        Spindle_Speed,
        lhs_values,
        rhs_values,
        lhs_spindle_count,
        rhs_spindle_count,
        Difference,
        LHS_TextRemarks,
        encode(LHS_Audio, 'base64') AS LHS_Audio,
        RHS_TextRemarks,
        encode(RHS_Audio, 'base64') AS RHS_Audio,
        CreatedAt
      FROM spinning.speed_checking
      ORDER BY CreatedAt DESC;
    `);

    res.json({
      count: result.rowCount,
      data: result.rows.map((row) => withScreenEntryId('speed_checking', row))
    });

  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /spinning/cots-checking:
 *   post:
 *     summary: Create COTS-Checking record
 *     tags:
 *       - Spinning
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inspectiondate
 *               - machineno
 *               - lhs_value
 *               - rhs_value
 *             properties:
 *               inspectiondate:
 *                 type: string
 *                 format: date
 *               machineno:
 *                 type: integer
 *               lhs_value:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 650
 *               rhs_value:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 650
 *               lhs_textremarks:
 *                 type: string
 *               lhs_audio:
 *                 type: string
 *                 description: Base64 encoded audio
 *               rhs_textremarks:
 *                 type: string
 *               rhs_audio:
 *                 type: string
 *                 description: Base64 encoded audio
 *     responses:
 *       201:
 *         description: Record created successfully
 *       500:
 *         description: Internal server error
 */
router.post('/cots-checking', async (req, res, next) =>{
    try {
    await ensureSpinningEntryIdColumns();
    const {
      entry_id,
      inspectiondate,
      machineno,
      lhs_values,
      rhs_values,
      lhs_textremarks,
      lhs_audio,
      rhs_textremarks,
      rhs_audio
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    const hasLhsValues = Array.isArray(lhs_values);
    const hasRhsValues = Array.isArray(rhs_values);

    // Each spindle reading in the comma-separated list is range-checked individually.
    const measurementErrors = [];

    if (hasLhsValues) {
      for (const item of lhs_values) {
        const parsed = parseWholeNumberInRange(item, { fieldName: 'lhs_value' });
        if (parsed.error) measurementErrors.push(parsed.error);
      }
    }

    if (hasRhsValues) {
      for (const item of rhs_values) {
        const parsed = parseWholeNumberInRange(item, { fieldName: 'rhs_value' });
        if (parsed.error) measurementErrors.push(parsed.error);
      }
    }

    if (measurementErrors.length) {
      return res.status(400).json({
        message: 'Side measurements must be whole numbers between 0 and 650',
        errors: measurementErrors
      });
    }

    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO spinning.cots_checking
      (entry_id, InspectionDate, MachineNo,
       lhs_values, rhs_values, lhs_spindle_count, rhs_spindle_count,
       LHS_TextRemarks, LHS_Audio,
       RHS_TextRemarks, RHS_Audio)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *;
    `, [
      entry_id,
      inspectiondate,
      machineno,
      hasLhsValues ? JSON.stringify(lhs_values) : null,
      hasRhsValues ? JSON.stringify(rhs_values) : null,
      hasLhsValues ? lhs_values.length : null,
      hasRhsValues ? rhs_values.length : null,
      lhs_textremarks || null,
      lhs_audio ? Buffer.from(lhs_audio, 'base64') : null,
      rhs_textremarks || null,
      rhs_audio ? Buffer.from(rhs_audio, 'base64') : null
    ]);

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Record created successfully',
      data: result.rows[0]
    });

  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(err);
  }
});


/**
 * @swagger
 * /spinning/cots-checking:
 *   get:
 *     summary: Get all COTS-Checking records
 *     tags:
 *       - Spinning
 *     responses:
 *       200:
 *         description: List of records
 *       500:
 *         description: Internal server error
 */
router.get('/cots-checking', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const result = await client.query(`
      SELECT
        entry_id AS id,
        entry_id,
        InspectionDate,
        MachineNo,
        lhs_values,
        rhs_values,
        lhs_spindle_count,
        rhs_spindle_count,
        LHS_TextRemarks,
        encode(LHS_Audio, 'base64') as LHS_Audio,
        RHS_TextRemarks,
        encode(RHS_Audio, 'base64') as RHS_Audio,
        CreatedAt
      FROM spinning.cots_checking
      ORDER BY CreatedAt DESC;
    `);

    res.json({
      count: result.rowCount,
      data: result.rows.map((row) => withScreenEntryId('cots_checking', row))
    });

  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /spinning/lycra-missing:
 *   post:
 *     summary: Create lycra-missing record
 *     tags:
 *       - Spinning
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inspectiondate
 *               - machineno
 *               - employeename
 *               - lhs_value
 *               - rhs_value
 *             properties:
 *               inspectiondate:
 *                 type: string
 *                 format: date
 *               machineno:
 *                 type: integer
 *               employeename:
 *                 type: string
 *               lhs_value:
 *                 type: number
 *               rhs_value:
 *                 type: number
 *               lhs_textremarks:
 *                 type: string
 *               lhs_audio:
 *                 type: string
 *                 description: Base64 encoded audio
 *               rhs_textremarks:
 *                 type: string
 *               rhs_audio:
 *                 type: string
 *                 description: Base64 encoded audio
 *     responses:
 *       201:
 *         description: Record created successfully
 *       500:
 *         description: Internal server error
 */
router.post('/lycra-missing', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const {
      entry_id,
      inspectiondate,
      machineno,
      lhs_value,
      rhs_value,
      lhs_textremarks,
      lhs_audio,
      rhs_textremarks,
      rhs_audio
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    const result = await client.query(`
      INSERT INTO spinning.lycra_missing
      (entry_id, InspectionDate, MachineNo,
       LHS_Value, RHS_Value,
       LHS_TextRemarks, LHS_Audio,
       RHS_TextRemarks, RHS_Audio)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *;
    `, [
      entry_id,
      inspectiondate,
      machineno,
      lhs_value,
      rhs_value,
      lhs_textremarks || null,
      lhs_audio ? Buffer.from(lhs_audio, 'base64') : null,
      rhs_textremarks || null,
      rhs_audio ? Buffer.from(rhs_audio, 'base64') : null
    ]);

    res.status(201).json({
      message: 'Record created successfully',
      data: result.rows[0]
    });

  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(err);
  }
});


/**
 * @swagger
 * /spinning/lycra-missing:
 *   get:
 *     summary: Get all lycra-missing records
 *     tags:
 *       - Spinning
 *     responses:
 *       200:
 *         description: List of records
 *       500:
 *         description: Internal server error
 */
router.get('/lycra-missing', async (req, res, next) => {
  try {
    const result = await client.query(`
      SELECT 
        entry_id AS id,
        entry_id,
        InspectionDate,
        MachineNo,
        LHS_Value,
        RHS_Value,
        LHS_TextRemarks,
        encode(LHS_Audio, 'base64') as LHS_Audio,
        RHS_TextRemarks,
        encode(RHS_Audio, 'base64') as RHS_Audio,
        CreatedAt
      FROM spinning.lycra_missing
      ORDER BY CreatedAt DESC;
    `);

    res.json({
      count: result.rowCount,
      data: result.rows.map((row) => withScreenEntryId('lycra_missing', row))
    });

  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /spinning/bottom-apron-checking:
 *   post:
 *     summary: Create bottom-apron-checking record
 *     tags:
 *       - Spinning
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inspectiondate
 *               - machineno
 *               - employeename
 *               - lhs_value
 *               - rhs_value
 *             properties:
 *               inspectiondate:
 *                 type: string
 *                 format: date
 *               machineno:
 *                 type: integer
 *               employeename:
 *                 type: string
 *               lhs_value:
 *                 type: number
 *               rhs_value:
 *                 type: number
 *               lhs_textremarks:
 *                 type: string
 *               lhs_audio:
 *                 type: string
 *                 description: Base64 encoded audio
 *               rhs_textremarks:
 *                 type: string
 *               rhs_audio:
 *                 type: string
 *                 description: Base64 encoded audio
 *     responses:
 *       201:
 *         description: Record created successfully
 *       500:
 *         description: Internal server error
 */
router.post('/bottom-apron-checking', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const {
      entry_id,
      inspectiondate,
      machineno,
      lhs_values,
      rhs_values,
      type2,
      lhs_textremarks,
      lhs_audio,
      rhs_textremarks,
      rhs_audio
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    const hasLhsValues = Array.isArray(lhs_values);
    const hasRhsValues = Array.isArray(rhs_values);

    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO spinning.bottom_apron_checking
      (entry_id, InspectionDate, MachineNo,
       lhs_values, rhs_values, lhs_spindle_count, rhs_spindle_count,
       LHS_TextRemarks, LHS_Audio,
       RHS_TextRemarks, RHS_Audio)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *;
    `, [
      entry_id,
      inspectiondate,
      machineno,
      hasLhsValues ? JSON.stringify(lhs_values) : null,
      hasRhsValues ? JSON.stringify(rhs_values) : null,
      hasLhsValues ? lhs_values.length : null,
      hasRhsValues ? rhs_values.length : null,
      lhs_textremarks || null,
      lhs_audio ? Buffer.from(lhs_audio, 'base64') : null,
      rhs_textremarks || null,
      rhs_audio ? Buffer.from(rhs_audio, 'base64') : null
    ]);

    await replaceType2Fault('bottom_apron_checking', entry_id, type2);

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Record created successfully',
      data: result.rows[0]
    });

  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(err);
  }
});


/**
 * @swagger
 * /spinning/bottom-apron-checking:
 *   get:
 *     summary: Get all bottom-apron-checking records
 *     tags:
 *       - Spinning
 *     responses:
 *       200:
 *         description: List of records
 *       500:
 *         description: Internal server error
 */
router.get('/bottom-apron-checking', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const result = await client.query(`
      SELECT
        h.entry_id AS id,
        h.entry_id,
        h.InspectionDate,
        h.MachineNo,
        h.lhs_values,
        h.rhs_values,
        h.lhs_spindle_count,
        h.rhs_spindle_count,
        t2.type2,
        h.LHS_TextRemarks,
        encode(h.LHS_Audio, 'base64') as LHS_Audio,
        h.RHS_TextRemarks,
        encode(h.RHS_Audio, 'base64') as RHS_Audio,
        h.CreatedAt
      FROM spinning.bottom_apron_checking h
      LEFT JOIN spinning.type2_faults t2 ON t2.checking_type = 'bottom_apron_checking' AND t2.entry_id = h.entry_id
      ORDER BY h.CreatedAt DESC;
    `);

    res.json({
      count: result.rowCount,
      data: result.rows.map((row) => withScreenEntryId('bottom_apron_checking', row))
    });

  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /spinning/lycra-centering:
 *   post:
 *     summary: Create lycra-centering record
 *     tags:
 *       - Spinning
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inspectiondate
 *               - machineno
 *               - employeename
 *               - lhs_value
 *               - rhs_value
 *             properties:
 *               inspectiondate:
 *                 type: string
 *                 format: date
 *               machineno:
 *                 type: integer
 *               employeename:
 *                 type: string
 *               lhs_value:
 *                 type: number
 *               rhs_value:
 *                 type: number
 *               lhs_textremarks:
 *                 type: string
 *               lhs_audio:
 *                 type: string
 *                 description: Base64 encoded audio
 *               rhs_textremarks:
 *                 type: string
 *               rhs_audio:
 *                 type: string
 *                 description: Base64 encoded audio
 *     responses:
 *       201:
 *         description: Record created successfully
 *       500:
 *         description: Internal server error
 */
router.post('/lycra-centering', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const {
      entry_id,
      inspectiondate,
      machineno,
      lhs_values,
      rhs_values,
      type2,
      lhs_textremarks,
      lhs_audio,
      rhs_textremarks,
      rhs_audio
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    const hasLhsValues = Array.isArray(lhs_values);
    const hasRhsValues = Array.isArray(rhs_values);

    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO spinning.lycra_centering
      (entry_id, InspectionDate, MachineNo,
       lhs_values, rhs_values, lhs_spindle_count, rhs_spindle_count,
       LHS_TextRemarks, LHS_Audio,
       RHS_TextRemarks, RHS_Audio)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *;
    `, [
      entry_id,
      inspectiondate,
      machineno,
      hasLhsValues ? JSON.stringify(lhs_values) : null,
      hasRhsValues ? JSON.stringify(rhs_values) : null,
      hasLhsValues ? lhs_values.length : null,
      hasRhsValues ? rhs_values.length : null,
      lhs_textremarks || null,
      lhs_audio ? Buffer.from(lhs_audio, 'base64') : null,
      rhs_textremarks || null,
      rhs_audio ? Buffer.from(rhs_audio, 'base64') : null
    ]);

    await replaceType2Fault('lycra_centering', entry_id, type2);

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Record created successfully',
      data: result.rows[0]
    });

  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(err);
  }
});


/**
 * @swagger
 * /spinning/lycra-centering:
 *   get:
 *     summary: Get all lycra-centering records
 *     tags:
 *       - Spinning
 *     responses:
 *       200:
 *         description: List of records
 *       500:
 *         description: Internal server error
 */
router.get('/lycra-centering', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const result = await client.query(`
      SELECT
        h.entry_id AS id,
        h.entry_id,
        h.InspectionDate,
        h.MachineNo,
        h.lhs_values,
        h.rhs_values,
        h.lhs_spindle_count,
        h.rhs_spindle_count,
        t2.type2,
        h.LHS_TextRemarks,
        encode(h.LHS_Audio, 'base64') as LHS_Audio,
        h.RHS_TextRemarks,
        encode(h.RHS_Audio, 'base64') as RHS_Audio,
        h.CreatedAt
      FROM spinning.lycra_centering h
      LEFT JOIN spinning.type2_faults t2 ON t2.checking_type = 'lycra_centering' AND t2.entry_id = h.entry_id
      ORDER BY h.CreatedAt DESC;
    `);

    res.json({
      count: result.rowCount,
      data: result.rows.map((row) => withScreenEntryId('lycra_centering', row))
    });

  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /spinning/rsm-lycra-online:
 *   post:
 *     summary: Create RSM and Lycra Sensor Checking Online record
 *     tags:
 *       - Spinning
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inspectiondate
 *               - machineno
 *               - employeename
 *               - lhs_value
 *               - rhs_value
 *             properties:
 *               inspectiondate:
 *                 type: string
 *                 format: date
 *               machineno:
 *                 type: integer
 *               employeename:
 *                 type: string
 *               lhs_value:
 *                 type: number
 *               rhs_value:
 *                 type: number
 *               lhs_textremarks:
 *                 type: string
 *               lhs_audio:
 *                 type: string
 *                 description: Base64 encoded audio
 *               rhs_textremarks:
 *                 type: string
 *               rhs_audio:
 *                 type: string
 *                 description: Base64 encoded audio
 *     responses:
 *       201:
 *         description: Record created successfully
 *       500:
 *         description: Internal server error
 */
router.post('/rsm-lycra-online', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const {
      entry_id,
      inspectiondate,
      machineno,
      lhs_values,
      rhs_values,
      type2,
      lhs_textremarks,
      lhs_audio,
      rhs_textremarks,
      rhs_audio
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    const hasLhsValues = Array.isArray(lhs_values);
    const hasRhsValues = Array.isArray(rhs_values);

    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO spinning.RSM_and_lycrasensor_cheking_online
      (entry_id, InspectionDate, MachineNo,
       lhs_values, rhs_values, lhs_spindle_count, rhs_spindle_count,
       LHS_TextRemarks, LHS_Audio,
       RHS_TextRemarks, RHS_Audio)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *;
    `, [
      entry_id,
      inspectiondate,
      machineno,
      hasLhsValues ? JSON.stringify(lhs_values) : null,
      hasRhsValues ? JSON.stringify(rhs_values) : null,
      hasLhsValues ? lhs_values.length : null,
      hasRhsValues ? rhs_values.length : null,
      lhs_textremarks || null,
      lhs_audio ? Buffer.from(lhs_audio, 'base64') : null,
      rhs_textremarks || null,
      rhs_audio ? Buffer.from(rhs_audio, 'base64') : null
    ]);

    await replaceType2Fault('rsm_lycra_online', entry_id, type2);

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Record created successfully',
      data: result.rows[0]
    });

  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(err);
  }
});


/**
 * @swagger
 * /spinning/rsm-lycra-online:
 *   get:
 *     summary: Get all RSM and Lycra Sensor Checking Online records
 *     tags:
 *       - Spinning
 *     responses:
 *       200:
 *         description: List of records
 *       500:
 *         description: Internal server error
 */
router.get('/rsm-lycra-online', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const result = await client.query(`
      SELECT
        h.entry_id AS id,
        h.entry_id,
        h.InspectionDate,
        h.MachineNo,
        h.lhs_values,
        h.rhs_values,
        h.lhs_spindle_count,
        h.rhs_spindle_count,
        t2.type2,
        h.LHS_TextRemarks,
        encode(h.LHS_Audio, 'base64') as LHS_Audio,
        h.RHS_TextRemarks,
        encode(h.RHS_Audio, 'base64') as RHS_Audio,
        h.CreatedAt
      FROM spinning.RSM_and_lycrasensor_cheking_online h
      LEFT JOIN spinning.type2_faults t2 ON t2.checking_type = 'rsm_lycra_online' AND t2.entry_id = h.entry_id
      ORDER BY h.CreatedAt DESC;
    `);

    res.json({
      count: result.rowCount,
      data: result.rows.map((row) => withScreenEntryId('rsm_lycra_online', row))
    });

  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /spinning/rsm-lycra-offline:
 *   post:
 *     summary: Create RSM and Lycra Sensor Checking Offline record
 *     tags:
 *       - Spinning
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inspectiondate
 *               - machineno
 *               - employeename
 *               - lhs_value
 *               - rhs_value
 *             properties:
 *               inspectiondate:
 *                 type: string
 *                 format: date
 *               machineno:
 *                 type: integer
 *               employeename:
 *                 type: string
 *               lhs_value:
 *                 type: number
 *               rhs_value:
 *                 type: number
 *               lhs_textremarks:
 *                 type: string
 *               lhs_audio:
 *                 type: string
 *                 description: Base64 encoded audio
 *               rhs_textremarks:
 *                 type: string
 *               rhs_audio:
 *                 type: string
 *                 description: Base64 encoded audio
 *     responses:
 *       201:
 *         description: Record created successfully
 *       500:
 *         description: Internal server error
 */
router.post('/rsm-lycra-offline', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const {
      entry_id,
      inspectiondate,
      machineno,
      lhs_values,
      rhs_values,
      type2,
      lhs_textremarks,
      lhs_audio,
      rhs_textremarks,
      rhs_audio
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    const hasLhsValues = Array.isArray(lhs_values);
    const hasRhsValues = Array.isArray(rhs_values);

    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO spinning.RSM_and_lycrasensor_cheking_offline
      (entry_id, InspectionDate, MachineNo,
       lhs_values, rhs_values, lhs_spindle_count, rhs_spindle_count,
       LHS_TextRemarks, LHS_Audio,
       RHS_TextRemarks, RHS_Audio)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *;
    `, [
      entry_id,
      inspectiondate,
      machineno,
      hasLhsValues ? JSON.stringify(lhs_values) : null,
      hasRhsValues ? JSON.stringify(rhs_values) : null,
      hasLhsValues ? lhs_values.length : null,
      hasRhsValues ? rhs_values.length : null,
      lhs_textremarks || null,
      lhs_audio ? Buffer.from(lhs_audio, 'base64') : null,
      rhs_textremarks || null,
      rhs_audio ? Buffer.from(rhs_audio, 'base64') : null
    ]);

    await replaceType2Fault('rsm_lycra_offline', entry_id, type2);

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Record created successfully',
      data: result.rows[0]
    });

  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(err);
  }
});


/**
 * @swagger
 * /spinning/rsm-lycra-offline:
 *   get:
 *     summary: Get all RSM and Lycra Sensor Checking Offline records
 *     tags:
 *       - Spinning
 *     responses:
 *       200:
 *         description: List of records
 *       500:
 *         description: Internal server error
 */
router.get('/rsm-lycra-offline', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const result = await client.query(`
      SELECT
        h.entry_id AS id,
        h.entry_id,
        h.InspectionDate,
        h.MachineNo,
        h.lhs_values,
        h.rhs_values,
        h.lhs_spindle_count,
        h.rhs_spindle_count,
        t2.type2,
        h.LHS_TextRemarks,
        encode(h.LHS_Audio, 'base64') as LHS_Audio,
        h.RHS_TextRemarks,
        encode(h.RHS_Audio, 'base64') as RHS_Audio,
        h.CreatedAt
      FROM spinning.RSM_and_lycrasensor_cheking_offline h
      LEFT JOIN spinning.type2_faults t2 ON t2.checking_type = 'rsm_lycra_offline' AND t2.entry_id = h.entry_id
      ORDER BY h.CreatedAt DESC;
    `);

    res.json({
      count: result.rowCount,
      data: result.rows.map((row) => withScreenEntryId('rsm_lycra_offline', row))
    });

  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /spinning/ring-frame:
 *   post:
 *     summary: Save Ring Frame Inspection (Header + Rows + Summary)
 *     tags: [Spinning]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             inspection_type: "Ring Frame"
 *             entry_date: "2026-03-05"
 *             shift: "A"
 *             checker_name: "John"
 *             rows:
 *               - mc_no: 1
 *                 lycra: "Yes"
 *                 bobbin_color: "Red"
 *                 spindle_1: "OK"
 *                 spindle_2: "OK"
 *                 spindle_3: "OK"
 *                 spindle_4: "OK"
 *                 spindle_5: "OK"
 *                 spindle_6: "OK"
 *                 lycra_missing: "No"
 *                 guide_roll_lapping: "No"
 *                 others: "None"
 *                 total: "0"
 *             summary:
 *               out_of_center: 2
 *               lycra_missing: 1
 *               fault_cops: 3
 *               total_cops: 100
 *               comments: "Normal"
 *     responses:
 *      201:
 *       description: Record created successfully
 *     400:
 *      description: Bad request (e.g. missing required fields)
 */

router.post('/ring-frame', async (req, res) => {
  try {
    await ensureRingFrameLogBookTables();
    const {
      entry_id,
      inspection_type,
      entry_date,
      shift,
      checker_name,
      rows,
      summary
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    if (!inspection_type || !entry_date) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    await client.query('BEGIN');

    // ✅ 1. Insert Header
    const inspectionResult = await client.query(`
      INSERT INTO spinning.ring_frame_inspections
      (entry_id, inspection_type, entry_date, shift, checker_name)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id
    `, [entry_id, inspection_type, entry_date, shift, checker_name]);

    const inspection_id = inspectionResult.rows[0].id;

    // ✅ 2. Insert Rows
    if (rows && rows.length > 0) {
      for (const row of rows) {
        const normalizedRow = normalizeRingFrameRow(row);
        await client.query(`
          INSERT INTO spinning.ring_frame_rows
          (inspection_id, mc_no, lycra, bobbin_color, bobbin_checked,
           spindle_1, spindle_2, spindle_3, spindle_4, spindle_5, spindle_6,
           lycra_missing, guide_roll_lapping, others, total)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        `, [
          inspection_id,
          normalizedRow.mc_no,
          normalizedRow.lycra,
          normalizedRow.bobbin_color,
          normalizedRow.bobbin_checked,
          normalizedRow.spindle_1,
          normalizedRow.spindle_2,
          normalizedRow.spindle_3,
          normalizedRow.spindle_4,
          normalizedRow.spindle_5,
          normalizedRow.spindle_6,
          normalizedRow.lycra_missing,
          normalizedRow.guide_roll_lapping,
          normalizedRow.others,
          normalizedRow.total
        ]);
      }
    }

    // ✅ 3. Insert Summary
    if (summary) {
      const normalizedSummary = normalizeRingFrameSummary(summary);
      await client.query(`
        INSERT INTO spinning.ring_frame_summary
        (inspection_id, out_of_center, out_of_center_ac, out_of_center_rf,
         lycra_missing, lycra_missing_ac, lycra_missing_rf,
         fault_cops, fault_cops_ac, fault_cops_rf,
         total_cops, total_cops_ac, total_cops_rf, comments)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      `, [
        inspection_id,
        normalizedSummary.out_of_center,
        normalizedSummary.out_of_center_ac,
        normalizedSummary.out_of_center_rf,
        normalizedSummary.lycra_missing,
        normalizedSummary.lycra_missing_ac,
        normalizedSummary.lycra_missing_rf,
        normalizedSummary.fault_cops,
        normalizedSummary.fault_cops_ac,
        normalizedSummary.fault_cops_rf,
        normalizedSummary.total_cops,
        normalizedSummary.total_cops_ac,
        normalizedSummary.total_cops_rf,
        normalizedSummary.comments
      ]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: "Saved successfully",
      inspection_id,
      entry_id
    });

  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    console.error("❌ Insert Error:", err);

    res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
});

const getRingFrameCheckerNames = async (req, res, next) => {
  try {
    await ensureRingFrameLogBookTables();
    const prefix = String(req.query.prefix || '').trim();
    const likeToken = `%${prefix}%`;
    const checkerParams = Object.fromEntries(
      RING_FRAME_CHECKER_NAMES.map((name, index) => [`checker${index}`, name.toUpperCase()])
    );

    const postgresResult = await client.query(
      `SELECT checker_name
       FROM (
         SELECT checker_name
         FROM spinning.ring_frame_checkers
         WHERE is_active = TRUE
         UNION
         SELECT DISTINCT TRIM(checker_name) AS checker_name
         FROM spinning.ring_frame_inspections
         WHERE checker_name IS NOT NULL
           AND TRIM(checker_name) <> ''
       ) names
       WHERE ($1::text = '' OR checker_name ILIKE $2)
       ORDER BY checker_name`,
      [prefix, likeToken]
    );

    const postgresValues = postgresResult.rows
      .map((row) => String(row.checker_name || '').trim())
      .filter(Boolean);

    let sqlServerValues = [];
    if (sqlServer.hasSqlServerEnv()) {
      try {
        const sqlResult = await sqlServer.query(
          `SELECT DISTINCT LTRIM(RTRIM(CAST(NAME AS VARCHAR(255)))) AS checker_name
           FROM dbo.EMPLOYEEMAS_MAI
           WHERE NAME IS NOT NULL
             AND LTRIM(RTRIM(CAST(NAME AS VARCHAR(255)))) <> ''
             AND UPPER(LTRIM(RTRIM(CAST(NAME AS VARCHAR(255))))) IN (${RING_FRAME_CHECKER_NAMES.map((_, index) => `@checker${index}`).join(', ')})
             AND (@prefix = '' OR LTRIM(RTRIM(CAST(NAME AS VARCHAR(255)))) LIKE @checkerPrefix)
           ORDER BY checker_name`,
          { prefix, checkerPrefix: likeToken, ...checkerParams }
        );
        sqlServerValues = (sqlResult.recordset || [])
          .map((row) => String(row.checker_name || '').trim())
          .filter(Boolean);
      } catch (sqlError) {
        console.error('Error fetching ring-frame checker names from SQL Server:', sqlError);
      }
    }

    const values = Array.from(new Set([...sqlServerValues, ...postgresValues]))
      .sort((a, b) => a.localeCompare(b));

    return res.status(200).json({
      source: sqlServerValues.length ? 'sqlserver+postgres' : 'postgres',
      data: values.map((checker_name) => ({ checker_name })),
      names: values,
      checker_names: values,
      check_names: values,
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

const getRingFrameShifts = async (req, res, next) => {
  try {
    const prefix = String(req.query.prefix || '').trim();
    const likeToken = `%${prefix}%`;
    let shifts = [];

    if (sqlServer.hasSqlServerEnv()) {
      try {
        const result = await sqlServer.query(
          `SELECT shift_code, shift_name, shift_hours
           FROM (
             SELECT
               CAST(SHIFTCODE AS VARCHAR(50)) AS shift_code,
               CAST(SHIFTCODE AS VARCHAR(50)) AS shift_name,
               SHIFTHRS AS shift_hours,
               CASE
                 WHEN ISNUMERIC(CAST(SHIFTCODE AS VARCHAR(50))) = 1 THEN CAST(SHIFTCODE AS INT)
                 ELSE 2147483647
               END AS shift_sort
             FROM dbo.MASSHIFT
             WHERE compcode = '1'
               AND (@prefix = ''
                 OR CAST(SHIFTCODE AS VARCHAR(50)) LIKE @shiftPrefix
                 OR CAST(SHIFTHRS AS VARCHAR(50)) LIKE @shiftPrefix)
             GROUP BY SHIFTCODE, SHIFTHRS
           ) shifts
           ORDER BY shift_sort, shift_name`,
          { prefix, shiftPrefix: likeToken }
        );

        shifts = (result.recordset || []).map((row) => ({
          shift_code: String(row.shift_code || '').trim(),
          shift_name: String(row.shift_name || row.shift_code || '').trim(),
          shift_hours: toIntegerOrNull(row.shift_hours)
        })).filter((row) => row.shift_code || row.shift_name);
      } catch (sqlError) {
        console.error('Error fetching ring-frame shifts from SQL Server:', sqlError);
      }
    }

    if (!shifts.length) {
      shifts = DEFAULT_RING_FRAME_SHIFTS.filter((shift) => (
        !prefix
        || shift.shift_code.includes(prefix)
        || shift.shift_name.toLowerCase().includes(prefix.toLowerCase())
      ));
    }

    const values = shifts.map((shift) => shift.shift_code || shift.shift_name).filter(Boolean);

    return res.status(200).json({
      source: shifts.length && sqlServer.hasSqlServerEnv() ? 'sqlserver' : 'default',
      data: shifts,
      shifts,
      shift_names: shifts.map((shift) => shift.shift_name),
      shift_codes: shifts.map((shift) => shift.shift_code),
      names: shifts.map((shift) => shift.shift_name),
      values,
      options: [
        { text: '-- Select Shift --', value: '' },
        ...shifts.map((shift) => ({
          text: shift.shift_name,
          value: shift.shift_code || shift.shift_name
        }))
      ]
    });
  } catch (error) {
    next(error);
  }
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
router.get('/master/shifts', getRingFrameShifts);
router.get('/master/shift', getRingFrameShifts);
router.get('/shifts', getRingFrameShifts);
router.get('/shift', getRingFrameShifts);
router.get('/ring-frame/shifts', getRingFrameShifts);
router.get('/ring-frame/shift', getRingFrameShifts);
router.get('/ring-frame-log-book/shifts', getRingFrameShifts);
router.get('/ring-frame-log-book/shift', getRingFrameShifts);
router.get('/ring-frame-logbook/shifts', getRingFrameShifts);
router.get('/ring-frame-logbook/shift', getRingFrameShifts);


/**
 * @swagger
 * /spinning/ring-frame:
 *   get:
 *     summary: Get all Ring Frame Inspections with Rows & Summary
 *     tags: [Spinning]
 *     responses:
 *       201:
 *         description: Record created successfully
 *       500:
 *         description: Internal server error
 */
router.get('/ring-frame', async (req, res) => {
  try {
    await ensureRingFrameLogBookTables();

    const result = await client.query(`
      SELECT 
        i.*,

        -- Rows (ordered by insertion order, i.e. the same top-to-bottom order the form was
        -- filled in, so "Row 1" in Custom Report always means the first machine row entered)
        COALESCE(
          json_agg(
            jsonb_build_object(
              'mc_no', r.mc_no,
              'lycra', r.lycra,
              'bobbin_color', r.bobbin_color,
              'bobbin_checked', r.bobbin_checked,
              'spindle_1', r.spindle_1,
              'spindle_2', r.spindle_2,
              'spindle_3', r.spindle_3,
              'spindle_4', r.spindle_4,
              'spindle_5', r.spindle_5,
              'spindle_6', r.spindle_6,
              'lycra_missing', r.lycra_missing,
              'guide_roll_lapping', r.guide_roll_lapping,
              'others', r.others,
              'total', r.total
            ) ORDER BY r.id
          ) FILTER (WHERE r.id IS NOT NULL), '[]'
        ) AS rows,

        -- Summary
        json_build_object(
          'out_of_center', s.out_of_center,
          'out_of_center_ac', s.out_of_center_ac,
          'out_of_center_rf', s.out_of_center_rf,
          'lycra_missing', s.lycra_missing,
          'lycra_missing_ac', s.lycra_missing_ac,
          'lycra_missing_rf', s.lycra_missing_rf,
          'fault_cops', s.fault_cops,
          'fault_cops_ac', s.fault_cops_ac,
          'fault_cops_rf', s.fault_cops_rf,
          'total_cops', s.total_cops,
          'total_cops_ac', s.total_cops_ac,
          'total_cops_rf', s.total_cops_rf,
          'comments', s.comments
        ) AS summary

      FROM spinning.ring_frame_inspections i
      LEFT JOIN spinning.ring_frame_rows r
        ON i.id = r.inspection_id
      LEFT JOIN spinning.ring_frame_summary s
        ON i.id = s.inspection_id

      GROUP BY i.id, s.id
      ORDER BY i.created_at DESC;
    `);

    res.json({
      count: result.rowCount,
      data: result.rows.map((row) => withScreenEntryId('ring_frame', row))
    });

  } catch (err) {
    console.error("❌ Fetch Error:", err);

    res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
});

/**
 * GET /spinning/ring-frame/master-data
 * Returns shift options and checker name options for Ring Frame UI dropdowns
 */
router.get('/ring-frame/master-data', async (req, res) => {
  try {
    // Static fallback shifts — can be replaced by DB-driven values later
    const shifts = [
      { value: 'A', label: 'A' },
      { value: 'B', label: 'B' },
      { value: 'C', label: 'C' }
    ];

    // Fetch checker names from Postgres users table
    const checkerResult = await client.query(`
      SELECT DISTINCT COALESCE(full_name, '') AS full_name
      FROM users.user_details
      WHERE COALESCE(full_name, '') <> ''
      ORDER BY full_name
    `);

    const checkerOptions = [{ text: '-- Select Checker --', value: '' }, ...checkerResult.rows.map((r) => ({ text: String(r.full_name).trim(), value: String(r.full_name).trim() }))];

    res.json({
      source: 'postgres',
      shifts,
      shift_values: shifts.map((s) => s.value),
      options: {
        shift: [{ text: '-- Select Shift --', value: '' }, ...shifts.map((s) => ({ text: s.label, value: s.value }))],
        checker_name: checkerOptions
      },
      checker_names: checkerResult.rows.map((r) => String(r.full_name).trim())
    });
  } catch (err) {
    console.error('❌ ring-frame master-data error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/**
 * @swagger
 * /spinning/count-change:
 *   post:
 *     summary: Create Count Change Inspection with Readings
 *     tags: [Spinning]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             type: "Count Change"
 *             entry_date: "2026-03-05"
 *             rf_no: 1
 *             lycra_draft: 3.7
 *             count_name_from: "10 BLACK POLY VISCOSE"
 *             count_name_to: "10 BLACK POLY VISCOSE"
 *             readings:
 *               - reading_no: 1
 *                 reading_value: 5
 *                 count: 10.23
 *                 cv_percent: 11.46
 *                 strength: 250
 *                 mean: 279.67
 *                 cv_percent_2: 13.42
 *                 csp: 2861.02
 *     responses:
 *       201:
 *         description: Created successfully
 */

router.post('/count-change', async (req, res) => {
  try {
    await ensureSpinningEntryIdColumns();
    const {
      entry_id,
      type,
      entry_date,
      lycra_draft,
      count_name_from,
      count_name_to,
      readings
    } = req.body;
    const rf_no = req.body.rf_no ?? req.body.rf ?? req.body.RF ?? req.body.machine_no ?? req.body.machine;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    if (!entry_date || !readings || !readings.length) {
      return res.status(400).json({ message: "Required fields missing" });
    }
    if (rf_no === undefined || rf_no === null || String(rf_no).trim() === '') {
      return res.status(400).json({ message: 'rf_no is required' });
    }

    // ✅ Start transaction
    await client.query('BEGIN');

    // ✅ Insert header
    const inspectionResult = await client.query(`
      INSERT INTO spinning.count_change_inspections
      (entry_id, type, entry_date, rf_no, lycra_draft, count_name_from, count_name_to, no_of_readings)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id
    `, [
      entry_id,
      type,
      entry_date,
      rf_no,
      lycra_draft,
      count_name_from,
      count_name_to,
      readings.length
    ]);

    const inspection_id = inspectionResult.rows[0].id;

    // ✅ Insert readings
    for (const row of readings) {
      const resolvedCsp = toNumberOrNull(row.csp) ?? calculateCsp(row.count, row.strength);
      await client.query(`
        INSERT INTO spinning.count_change_readings
        (inspection_id, reading_no, reading_value, count, cv_percent, strength, mean, cv_percent_2, csp)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        inspection_id,
        row.reading_no,
        row.reading_value,
        row.count,
        row.cv_percent,
        row.strength,
        row.mean,
        row.cv_percent_2,
        resolvedCsp
      ]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: "Inspection created successfully",
      inspection_id,
      entry_id
    });

  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


/**
 * @swagger
 * /spinning/count-change:
 *   get:
 *     summary: Get all Count Change Inspections with Readings
 *     tags: [Spinning]
 *     responses:
 *       200:
 *         description: List of inspections
 */

router.get('/count-change', async (req, res) => {
  try {
    await ensureSpinningEntryIdColumns();
    const hasMcMaster = await hasPostgresTable('ticketing_system.mc_master');
    const rfSelect = hasMcMaster
      ? `,
        NULLIF(TRIM(COALESCE(m.mcname::text, '')), '') AS rf_name,
        NULLIF(TRIM(COALESCE(m.deptcode::text, '')), '') AS rf_dept_code,
        NULLIF(TRIM(COALESCE(m.deptname::text, '')), '') AS rf_dept_name`
      : '';
    const rfJoin = hasMcMaster
      ? `
      LEFT JOIN ticketing_system.mc_master m
      ON TRIM(m.mccode::text) = TRIM(i.rf_no::text)`
      : '';

    const result = await client.query(`
      SELECT 
        i.*${rfSelect},
        json_agg(
          json_build_object(
            'reading_no', r.reading_no,
            'reading_value', r.reading_value,
            'count', r.count,
            'cv_percent', r.cv_percent,
            'strength', r.strength,
            'mean', r.mean,
            'cv_percent_2', r.cv_percent_2,
            'csp', r.csp
          )
        ) AS readings
      FROM spinning.count_change_inspections i
      ${rfJoin}
      LEFT JOIN spinning.count_change_readings r
      ON i.id = r.inspection_id
      GROUP BY i.id
      ${hasMcMaster ? ', m.mcname, m.deptcode, m.deptname' : ''}
      ORDER BY i.created_at DESC;
    `);

    res.json({
      count: result.rowCount,
      data: result.rows.map((row) => {
        return withScreenEntryId('count_change', withoutTestNumber(row));
      })
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * @swagger
 * /spinning/qc:
 *   post:
 *     summary: Create Spinning QC entry
 *     tags: [Spinning]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - count_name
 *               - consignee_name
 *               - creation_date
 *             properties:
 *               count_name:
 *                 type: string
 *               consignee_name:
 *                 type: string
 *               creation_date:
 *                 type: string
 *                 format: date
 *               machine_no:
 *                 type: integer
 *               bottom_roll_setting:
 *                 type: string
 *               top_roll_setting:
 *                 type: string
 *               break_draft:
 *                 type: number
 *               total_draft:
 *                 type: number
 *               tpi_tm:
 *                 type: string
 *               spacer:
 *                 type: string
 *               traveller:
 *                 type: string
 *               speed:
 *                 type: integer
 *               make:
 *                 type: string
 *               denier:
 *                 type: number
 *               merge_no:
 *                 type: string
 *               lycra_draft:
 *                 type: number
 *               lycra_percent:
 *                 type: number
 *               slub_party_code:
 *                 type: string
 *               slub_mtr:
 *                 type: number
 *               pause_min:
 *                 type: number
 *               pause_max:
 *                 type: number
 *               slub_min:
 *                 type: number
 *               slub_max:
 *                 type: number
 *               thickness_min:
 *                 type: number
 *               thickness_max:
 *                 type: number
 *     responses:
 *       201:
 *         description: Spinning QC created successfully
 *       500:
 *         description: Server error
 */

router.post('/qc', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const {
      entry_id,
      count_name,
      consignee_name,
      creation_date,
      machine_no,
      bottom_roll_setting,
      top_roll_setting,
      break_draft,
      total_draft,
      tpi_tm,
      spacer,
      traveller,
      speed,
      make,
      denier,
      merge_no,
      lycra_draft,
      lycra_percent,
      slub_party_code,
      slub_mtr,
      pause_min,
      pause_max,
      slub_min,
      slub_max,
      thickness_min,
      thickness_max
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    const result = await client.query(
      `INSERT INTO spinning.spinning_qc_header (
        entry_id,
        count_name,
        consignee_name,
        creation_date,
        machine_no,
        bottom_roll_setting,
        top_roll_setting,
        break_draft,
        total_draft,
        tpi_tm,
        spacer,
        traveller,
        speed,
        make,
        denier,
        merge_no,
        lycra_draft,
        lycra_percent,
        slub_party_code,
        slub_mtr,
        pause_min,
        pause_max,
        slub_min,
        slub_max,
        thickness_min,
        thickness_max,
        created_by_user_id
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,
        $19,$20,$21,$22,$23,$24,$25,$26,$27
      )
      RETURNING *`,
      [
        entry_id,
        count_name,
        consignee_name,
        creation_date,
        machine_no,
        bottom_roll_setting,
        top_roll_setting,
        break_draft,
        total_draft,
        tpi_tm,
        spacer,
        traveller,
        speed,
        make,
        denier,
        merge_no,
        lycra_draft,
        lycra_percent,
        slub_party_code,
        slub_mtr,
        pause_min,
        pause_max,
        slub_min,
        slub_max,
        thickness_min,
        thickness_max,
        req.user?.id ?? null
      ]
    );

    res.status(201).json({
      message: 'Spinning QC created successfully',
      data: result.rows[0]
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
 * /spinning/qc:
 *   get:
 *     summary: Get Spinning QC entries
 *     tags: [Spinning]
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
 *         description: Data fetched successfully
 *       500:
 *         description: Server error
 */

router.get('/qc', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const { page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT *
       FROM spinning.spinning_qc_header
       ORDER BY qc_id DESC
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const total = await client.query(
      `SELECT COUNT(*) FROM spinning.spinning_qc_header`
    );

    res.status(200).json({
      data: result.rows.map((row) => withScreenEntryId('qc', row, 'qc_id')),
      total: parseInt(total.rows[0].count),
      page: pageNum,
      limit: limitNum
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /spinning/qc/{qc_id}:
 *   put:
 *     summary: Update Spinning QC entry
 *     tags: [Spinning]
 *     parameters:
 *       - in: path
 *         name: qc_id
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
 *               - count_name
 *               - consignee_name
 *               - creation_date
 *             properties:
 *               count_name:
 *                 type: string
 *               consignee_name:
 *                 type: string
 *               creation_date:
 *                 type: string
 *                 format: date
 *               machine_no:
 *                 type: integer
 *               bottom_roll_setting:
 *                 type: string
 *               top_roll_setting:
 *                 type: string
 *               break_draft:
 *                 type: number
 *               total_draft:
 *                 type: number
 *               tpi_tm:
 *                 type: string
 *               spacer:
 *                 type: string
 *               traveller:
 *                 type: string
 *               speed:
 *                 type: integer
 *               make:
 *                 type: string
 *               denier:
 *                 type: number
 *               merge_no:
 *                 type: string
 *               lycra_draft:
 *                 type: number
 *               lycra_percent:
 *                 type: number
 *               slub_party_code:
 *                 type: string
 *               slub_mtr:
 *                 type: number
 *               pause_min:
 *                 type: number
 *               pause_max:
 *                 type: number
 *               slub_min:
 *                 type: number
 *               slub_max:
 *                 type: number
 *               thickness_min:
 *                 type: number
 *               thickness_max:
 *                 type: number
 *     responses:
 *       200:
 *         description: Spinning QC updated successfully
 *       400:
 *         description: Invalid QC ID supplied
 *       404:
 *         description: Spinning QC entry not found
 *       500:
 *         description: Server error
 */
// Editing and resaving a PP entry (rejected, approved, or still pending) always
// resets it to 'pending' and clears the prior review - any change means it
// needs a fresh L2 look, and this is also how a rejected entry gets
// resubmitted (the operator picks it from Saved Versions, fixes the values
// L2 flagged, and saves - no separate "resubmit" endpoint needed).
router.put('/qc/:qc_id', async (req, res, next) => {
  try {
    const qc_id = parseInt(req.params.qc_id, 10);

    if (!Number.isInteger(qc_id) || qc_id <= 0) {
      return res.status(400).json({ message: 'Invalid QC ID supplied' });
    }

    const {
      count_name,
      consignee_name,
      creation_date,
      machine_no,
      bottom_roll_setting,
      top_roll_setting,
      break_draft,
      total_draft,
      tpi_tm,
      spacer,
      traveller,
      speed,
      make,
      denier,
      merge_no,
      lycra_draft,
      lycra_percent,
      slub_party_code,
      slub_mtr,
      pause_min,
      pause_max,
      slub_min,
      slub_max,
      thickness_min,
      thickness_max
    } = req.body;

    const result = await client.query(
      `UPDATE spinning.spinning_qc_header
       SET count_name = $1,
           consignee_name = $2,
           creation_date = $3,
           machine_no = $4,
           bottom_roll_setting = $5,
           top_roll_setting = $6,
           break_draft = $7,
           total_draft = $8,
           tpi_tm = $9,
           spacer = $10,
           traveller = $11,
           speed = $12,
           make = $13,
           denier = $14,
           merge_no = $15,
           lycra_draft = $16,
           lycra_percent = $17,
           slub_party_code = $18,
           slub_mtr = $19,
           pause_min = $20,
           pause_max = $21,
           slub_min = $22,
           slub_max = $23,
           thickness_min = $24,
           thickness_max = $25,
           approval_status = 'pending',
           reviewed_by = NULL,
           reviewed_at = NULL,
           review_remarks = NULL
       WHERE qc_id = $26
       RETURNING *`,
      [
        count_name,
        consignee_name,
        creation_date,
        machine_no,
        bottom_roll_setting,
        top_roll_setting,
        break_draft,
        total_draft,
        tpi_tm,
        spacer,
        traveller,
        speed,
        make,
        denier,
        merge_no,
        lycra_draft,
        lycra_percent,
        slub_party_code,
        slub_mtr,
        pause_min,
        pause_max,
        slub_min,
        slub_max,
        thickness_min,
        thickness_max,
        qc_id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Spinning QC entry not found' });
    }

    res.status(200).json({
      message: 'Spinning QC updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

const insertWheelChangeEntry = async (tableName, fields, payload) => {
  const columns = fields.join(', ');
  const values = fields.map((_, index) => `$${index + 1}`).join(', ');
  const queryValues = fields.map((field) => normalizeFormValue(payload[field]));

  return client.query(
    `INSERT INTO ${tableName} (${columns}) VALUES (${values}) RETURNING *`,
    queryValues
  );
};

const withWheelChangeRfNumber = (payload, targetField) => ({
  ...payload,
  [targetField]: payload[targetField]
    ?? payload.rf_no
    ?? payload.rfNo
    ?? payload.rf_number
    ?? payload.rfNumber
    ?? payload.r_f_no
    ?? payload.rFNo
    ?? payload.machine_no
    ?? payload.machine
});

const withWheelChangeRfAliases = (screenKey, record, sourceField) => {
  const row = withScreenEntryId(screenKey, record);
  const rfNo = row.rf_no ?? row[sourceField] ?? row.rf_number ?? row.r_f_no ?? null;
  return rfNo ? { ...row, rf_no: rfNo, rf_number: rfNo, r_f_no: rfNo } : row;
};

const withWheelChangeType3Aliases = (record) => {
  const row = withWheelChangeRfAliases('wheel_change_type3', record, 'fr_no');
  return {
    ...row,
    bdw_existing: row.bdw_existing ?? row.edw_existing ?? null,
    bdw_proposed: row.bdw_proposed ?? row.edw_proposed ?? null,
    edw_existing: row.edw_existing ?? row.bdw_existing ?? null,
    edw_proposed: row.edw_proposed ?? row.bdw_proposed ?? null
  };
};

const normalizeWheelChangeType3Payload = (payload) => {
  const d = withFieldAliases(payload, {
    test_no: ['testNo', 'testno', 'txttestno'],
    date: ['entry_date', 'entryDate', 'txtEntryDate'],
    fr_no: ['fr', 'frNo', 'r_f_no', 'rFNo', 'rf_no', 'rfNo', 'rf_number', 'machine_no', 'machine'],
    count_from_existing: ['countfrom_existing', 'countfrom', 'count_from', 'ddlcountfrom'],
    count_from_proposed: ['countfrom_proposed', 'countfromp', 'count_to', 'ddlcountfromp'],
    lycra_type_existing: ['lycratype_existing', 'lycratype', 'lycra_type'],
    lycra_type_proposed: ['lycratype_proposed', 'lycratypep'],
    lycra_draft_existing: ['lycradraft_existing', 'lycradraft', 'lycra_draft'],
    lycra_draft_proposed: ['lycradraft_proposed', 'lycradraftp'],
    slub_code_existing: ['slubcode_existing', 'slubcode', 'slub_code'],
    slub_code_proposed: ['slubcode_proposed', 'slubcodep'],
    ramp_existing: ['ramp'],
    ramp_proposed: ['rampp'],
    offset_on_off_existing: ['offset_existing', 'offset_on_off', 'offset'],
    offset_on_off_proposed: ['offset_proposed', 'offset_on_offp', 'offsetp'],
    cop_core_condition_existing: ['copconcondition_existing', 'copconcondition', 'cop_or_cone_condition_existing'],
    cop_core_condition_proposed: ['copconcondition_proposed', 'copconconditionp', 'cop_or_cone_condition_proposed'],
    product_qty_existing: ['prodqty_existing', 'prodqty', 'product_qty'],
    product_qty_proposed: ['prodqty_proposed', 'prodqtyp'],
    roving_hank_existing: ['rovinghank_existing', 'rovinghank', 'roving_hank'],
    roving_hank_proposed: ['rovinghank_proposed', 'rovinghankp'],
    bdw_existing: ['edw_existing', 'bdw'],
    bdw_proposed: ['edw_proposed', 'bdwp'],
    bd_existing: ['bd'],
    bd_proposed: ['bdp'],
    dca_existing: ['dca', 'ddldca'],
    dca_proposed: ['dcap', 'ddldcap'],
    dcb_existing: ['dcb'],
    dcb_proposed: ['dcbp'],
    dfc_existing: ['dfc', 'ddldfc'],
    dfc_proposed: ['dfcp', 'ddldfcp'],
    dc_existing: ['dc', 'ddldc'],
    dc_proposed: ['dcp', 'ddldcp'],
    tcw_existing: ['tcw', 'ddltcw'],
    tcw_proposed: ['tcwp', 'ddltcwp'],
    tw_existing: ['tw', 'ddltw'],
    tw_proposed: ['twp', 'ddltwp'],
    tpi_tm_existing: ['tpitm_existing', 'tpitm', 'tpi_tpm_existing'],
    tpi_tm_proposed: ['tpitm_proposed', 'tpitmp', 'tpi_tpm_proposed'],
    travelers_no_existing: ['travellers_no_existing', 'travellers_no', 'trvellersno_existing', 'trvellersno'],
    travelers_no_proposed: ['travellers_no_proposed', 'travellers_nop', 'trvellersno_proposed', 'trvellersnop'],
    spacer_existing: ['spacer'],
    spacer_proposed: ['spacerp'],
    cop_weight_existing: ['copweight_existing', 'copweight', 'cop_weight'],
    cop_weight_proposed: ['copweight_proposed', 'copweightp'],
    speed_initial_existing: ['speedstart_existing', 'speedstart', 'speed_initial'],
    speed_initial_proposed: ['speedstart_proposed', 'speedstartp'],
    speed_max_existing: ['speedmax_existing', 'speedmax', 'speed_max'],
    speed_max_proposed: ['speedmax_proposed', 'speedmaxp'],
    empties_colour_existing: ['emptycolour_existing', 'emptycolour', 'empires_colour_existing'],
    empties_colour_proposed: ['emptycolour_proposed', 'emptycolourp', 'empires_colour_proposed'],
    total_draft_existing: ['totaldraft_existing', 'totaldraft', 'total_draft'],
    total_draft_proposed: ['totaldraft_proposed', 'totaldraftp']
  });

  return {
    ...d,
    edw_existing: d.edw_existing ?? d.bdw_existing ?? null,
    edw_proposed: d.edw_proposed ?? d.bdw_proposed ?? null,
    bdw_existing: d.bdw_existing ?? d.edw_existing ?? null,
    bdw_proposed: d.bdw_proposed ?? d.edw_proposed ?? null
  };
};

/**
 * @swagger
 * /spinning/wheel-change/type1:
 *   post:
 *     summary: Create Wheel Change Type1 entry
 *     tags: [Wheel Change Type1]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [wheel_change_type, test_no, date]
 *             properties:
 *               type: { type: string, example: Wheel Change }
 *               wheel_change_type: { type: string }
 *               test_no: { type: string }
 *               date: { type: string, format: date }
 *               fm_no: { type: string }
 *               count_from_existing: { type: string }
 *               count_from_proposed: { type: string }
 *               lycra_type_existing: { type: string }
 *               lycra_type_proposed: { type: string }
 *               lycra_draft_existing: { type: number }
 *               lycra_draft_proposed: { type: number }
 *               slub_code_existing: { type: string }
 *               slub_code_proposed: { type: string }
 *               range_existing: { type: string }
 *               range_proposed: { type: string }
 *               offset_existing: { type: string }
 *               offset_proposed: { type: string }
 *               core_condition_existing: { type: string }
 *               core_condition_proposed: { type: string }
 *               production_existing: { type: number }
 *               production_proposed: { type: number }
 *               roving_hank_existing: { type: number }
 *               roving_hank_proposed: { type: number }
 *               eow_existing: { type: string }
 *               eow_proposed: { type: string }
 *               epi_existing: { type: number }
 *               epi_proposed: { type: number }
 *               dca_existing: { type: string }
 *               dca_proposed: { type: string }
 *               dcb_existing: { type: number }
 *               dcb_proposed: { type: number }
 *               dfc_existing: { type: string }
 *               dfc_proposed: { type: string }
 *               dc_existing: { type: string }
 *               dc_proposed: { type: string }
 *               tcw_existing: { type: string }
 *               tcw_proposed: { type: string }
 *               tw_existing: { type: string }
 *               tw_proposed: { type: string }
 *               tpm_existing: { type: number }
 *               tpm_proposed: { type: number }
 *               travelers_no_existing: { type: string }
 *               travelers_no_proposed: { type: string }
 *               spacer_existing: { type: string }
 *               spacer_proposed: { type: string }
 *               cop_weight_existing: { type: number }
 *               cop_weight_proposed: { type: number }
 *               speed_front_existing: { type: number }
 *               speed_front_proposed: { type: number }
 *               speed_rpm_existing: { type: number }
 *               speed_rpm_proposed: { type: number }
 *               empires_colour_existing: { type: string }
 *               empires_colour_proposed: { type: string }
 *               total_draft_existing: { type: number }
 *               total_draft_proposed: { type: number }
 *     responses:
 *       201:
 *         description: Created successfully
 *       400:
 *         description: Required fields missing
 */
router.post('/wheel-change/type1', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    await ensureProcessParameterMasterTable();
    const d = { ...withWheelChangeRfNumber(req.body, 'fm_no'), created_by_user_id: req.user?.id ?? null };
    const type1Fields = [
      'entry_id',
      'type',
      'wheel_change_type',
      'test_no',
      'date',
      'fm_no',
      'created_by_user_id',
      'count_from_existing',
      'count_from_proposed',
      'consignee_name_existing',
      'consignee_name_proposed',
      'lycra_type_existing',
      'lycra_type_proposed',
      'lycra_draft_existing',
      'lycra_draft_proposed',
      'slub_code_existing',
      'slub_code_proposed',
      'range_existing',
      'range_proposed',
      'offset_existing',
      'offset_proposed',
      'core_condition_existing',
      'core_condition_proposed',
      'production_existing',
      'production_proposed',
      'roving_hank_existing',
      'roving_hank_proposed',
      'eow_existing',
      'eow_proposed',
      'epi_existing',
      'epi_proposed',
      'dca_existing',
      'dca_proposed',
      'dcb_existing',
      'dcb_proposed',
      'dfc_existing',
      'dfc_proposed',
      'dc_existing',
      'dc_proposed',
      'tcw_existing',
      'tcw_proposed',
      'tw_existing',
      'tw_proposed',
      'tpm_existing',
      'tpm_proposed',
      'travelers_no_existing',
      'travelers_no_proposed',
      'spacer_existing',
      'spacer_proposed',
      'cop_weight_existing',
      'cop_weight_proposed',
      'speed_front_existing',
      'speed_front_proposed',
      'speed_rpm_existing',
      'speed_rpm_proposed',
      'empires_colour_existing',
      'empires_colour_proposed',
      'total_draft_existing',
      'total_draft_proposed',
      'operator',
      'remarks'
    ];

    if (!d.entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    if (!d.wheel_change_type || !d.test_no || !d.date) {
      return res.status(400).json({ message: 'Required fields missing' });
    }

    if (!(await findActivePpForCombo(d.count_from_proposed, d.consignee_name_proposed))) {
      return res.status(409).json({
        message: 'No Active PP id found for this Count + Consignee Name combination. A Wheel Change can only be entered once the matching PP id has been approved.'
      });
    }

    const result = await insertWheelChangeEntry(
      'spinning.wheel_change_inspection',
      type1Fields,
      d
    );
    const savedRow = await consumeAndStampWheelChangeRow('spinning.wheel_change_inspection', result.rows[0]);

    res.status(201).json({
      message: 'Type1 created',
      data: savedRow
    });

  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(err);
  }
});

// Custom Report's "Wheel Change" report type was pointed at this plain /wheel-change endpoint,
// but it never existed — only the 3 type-specific endpoints below did, each backed by its own
// table with its own distinct column set (76/68/68 columns, different names/order), so a SQL
// UNION isn't possible — fetch each separately and merge in JS instead.
router.get('/wheel-change', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const [type1, type2, type3] = await Promise.all([
      client.query(`SELECT * FROM spinning.wheel_change_inspection`),
      client.query(`SELECT * FROM spinning.wheel_change_v2`),
      client.query(`SELECT * FROM spinning.wheel_change`)
    ]);
    const rows = [
      ...type1.rows.map((row) => ({ ...row, wheel_change_type: row.wheel_change_type || 'type1' })),
      ...type2.rows.map((row) => ({ ...row, wheel_change_type: row.wheel_change_type || 'type2' })),
      ...type3.rows.map((row) => ({ ...row, wheel_change_type: row.wheel_change_type || 'type3' }))
    ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    res.status(200).json({ data: rows });
  } catch (error) {
    console.error('Spinning combined wheel change fetch error:', error);
    next(error);
  }
});

/**
 * @swagger
 * /spinning/wheel-change/type1:
 *   get:
 *     summary: Get all Type1 entries
 *     tags: [Wheel Change Type1]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/wheel-change/type1', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const variety = String(req.query.variety || req.query.variety_name || req.query.mixing || '').trim();
    const machineNo = String(req.query.fm_no || req.query.machine_no || req.query.mc_no || '').trim();
    const approvalStatus = String(req.query.approval_status || req.query.status || '').trim();
    const result = await client.query(
      `SELECT *
       FROM spinning.wheel_change_inspection
       WHERE ($1::text = '' OR LOWER(TRIM(COALESCE(count_from_existing::text, ''))) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(count_from_proposed::text, ''))) = LOWER(TRIM($1)))
         AND ($2::text = '' OR approval_status = $2)
         AND ($3::text = '' OR LOWER(TRIM(COALESCE(fm_no::text, ''))) = LOWER(TRIM($3)))
       ORDER BY created_at DESC`,
      [variety, approvalStatus, variety ? '' : machineNo]
    );
    const latestRecord = variety
      ? await fetchLatestWheelChangeByVariety('spinning.wheel_change_inspection', variety, ['count_from_existing', 'count_from_proposed'], approvalStatus || 'approved')
      : machineNo
        ? await fetchLatestWheelChangeByMachine('spinning.wheel_change_inspection', 'fm_no', machineNo, approvalStatus || 'approved')
        : null;

    res.json({
      data: result.rows.map((row) => withWheelChangeMachineAliases(withWheelChangeRfAliases('wheel_change_type1', row, 'fm_no'), 'fm_no')),
      latest_record: latestRecord ? withWheelChangeMachineAliases(withWheelChangeRfAliases('wheel_change_type1', latestRecord, 'fm_no'), 'fm_no') : null
    });

  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /spinning/wheel-change/type2:
 *   post:
 *     summary: Create Wheel Change Type2 entry
 *     tags: [Wheel Change Type2]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [wheel_change_type, test_no, date]
 *             properties:
 *               type: { type: string, example: Wheel Change }
 *               wheel_change_type: { type: string }
 *               test_no: { type: string }
 *               date: { type: string, format: date }
 *               fm_no: { type: string }
 *               count_from_existing: { type: string }
 *               count_from_proposed: { type: string }
 *               lycra_type_existing: { type: string }
 *               lycra_type_proposed: { type: string }
 *               lycra_draft_existing: { type: number }
 *               lycra_draft_proposed: { type: number }
 *               slub_code_existing: { type: string }
 *               slub_code_proposed: { type: string }
 *               ramp_existing: { type: string }
 *               ramp_proposed: { type: string }
 *               offset_existing: { type: string }
 *               offset_proposed: { type: string }
 *               core_condition_existing: { type: string }
 *               core_condition_proposed: { type: string }
 *               production_existing: { type: number }
 *               production_proposed: { type: number }
 *               roving_hank_existing: { type: number }
 *               roving_hank_proposed: { type: number }
 *               back_roll_wheel_existing: { type: string }
 *               back_roll_wheel_proposed: { type: string }
 *               change_pinion_existing: { type: string }
 *               change_pinion_proposed: { type: string }
 *               edw_existing: { type: string }
 *               edw_proposed: { type: string }
 *               ed_existing: { type: number }
 *               ed_proposed: { type: number }
 *               b_existing: { type: string }
 *               b_proposed: { type: string }
 *               a_existing: { type: number }
 *               a_proposed: { type: number }
 *               d_existing: { type: string }
 *               d_proposed: { type: string }
 *               c_existing: { type: number }
 *               c_proposed: { type: number }
 *               tpi_tpm_existing: { type: number }
 *               tpi_tpm_proposed: { type: number }
 *               winding_kf_existing: { type: number }
 *               winding_kf_proposed: { type: number }
 *               ratchet_wheel_existing: { type: string }
 *               ratchet_wheel_proposed: { type: string }
 *               travelers_no_existing: { type: string }
 *               travelers_no_proposed: { type: string }
 *               spacer_existing: { type: string }
 *               spacer_proposed: { type: string }
 *               speed_spindle_existing: { type: number }
 *               speed_spindle_proposed: { type: number }
 *               speed_main_existing: { type: number }
 *               speed_main_proposed: { type: number }
 *               empires_colour_existing: { type: string }
 *               empires_colour_proposed: { type: string }
 *               total_draft_existing: { type: number }
 *               total_draft_proposed: { type: number }
 *     responses:
 *       201:
 *         description: Created successfully
 *       400:
 *         description: Required fields missing
 */
router.post('/wheel-change/type2', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    await ensureProcessParameterMasterTable();
    const d = { ...withWheelChangeRfNumber(req.body, 'fm_no'), created_by_user_id: req.user?.id ?? null };
    const type2Fields = [
      'entry_id',
      'type',
      'wheel_change_type',
      'test_no',
      'date',
      'fm_no',
      'created_by_user_id',
      'count_from_existing',
      'count_from_proposed',
      'consignee_name_existing',
      'consignee_name_proposed',
      'lycra_type_existing',
      'lycra_type_proposed',
      'lycra_draft_existing',
      'lycra_draft_proposed',
      'slub_code_existing',
      'slub_code_proposed',
      'ramp_existing',
      'ramp_proposed',
      'offset_existing',
      'offset_proposed',
      'core_condition_existing',
      'core_condition_proposed',
      'production_existing',
      'production_proposed',
      'roving_hank_existing',
      'roving_hank_proposed',
      'back_roll_wheel_existing',
      'back_roll_wheel_proposed',
      'change_pinion_existing',
      'change_pinion_proposed',
      'edw_existing',
      'edw_proposed',
      'ed_existing',
      'ed_proposed',
      'b_existing',
      'b_proposed',
      'a_existing',
      'a_proposed',
      'd_existing',
      'd_proposed',
      'c_existing',
      'c_proposed',
      'tpi_tpm_existing',
      'tpi_tpm_proposed',
      'winding_kf_existing',
      'winding_kf_proposed',
      'ratchet_wheel_existing',
      'ratchet_wheel_proposed',
      'travelers_no_existing',
      'travelers_no_proposed',
      'spacer_existing',
      'spacer_proposed',
      'speed_spindle_existing',
      'speed_spindle_proposed',
      'speed_main_existing',
      'speed_main_proposed',
      'empires_colour_existing',
      'empires_colour_proposed',
      'total_draft_existing',
      'total_draft_proposed',
      'operator',
      'remarks'
    ];

    if (!d.entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    if (!d.wheel_change_type || !d.test_no || !d.date) {
      return res.status(400).json({ message: 'Required fields missing' });
    }

    if (!(await findActivePpForCombo(d.count_from_proposed, d.consignee_name_proposed))) {
      return res.status(409).json({
        message: 'No Active PP id found for this Count + Consignee Name combination. A Wheel Change can only be entered once the matching PP id has been approved.'
      });
    }

    const result = await insertWheelChangeEntry(
      'spinning.wheel_change_v2',
      type2Fields,
      d
    );
    const savedRow = await consumeAndStampWheelChangeRow('spinning.wheel_change_v2', result.rows[0]);

    res.status(201).json({
      message: 'Type2 created',
      data: savedRow
    });

  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(err);
  }
});

/**
 * @swagger
 * /spinning/wheel-change/type2:
 *   get:
 *     summary: Get all Type2 entries
 *     tags: [Wheel Change Type2]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/wheel-change/type2', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const variety = String(req.query.variety || req.query.variety_name || req.query.mixing || '').trim();
    const machineNo = String(req.query.fm_no || req.query.machine_no || req.query.mc_no || '').trim();
    const approvalStatus = String(req.query.approval_status || req.query.status || '').trim();
    const result = await client.query(
      `SELECT *
       FROM spinning.wheel_change_v2
       WHERE ($1::text = '' OR LOWER(TRIM(COALESCE(count_from_existing::text, ''))) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(count_from_proposed::text, ''))) = LOWER(TRIM($1)))
         AND ($2::text = '' OR approval_status = $2)
         AND ($3::text = '' OR LOWER(TRIM(COALESCE(fm_no::text, ''))) = LOWER(TRIM($3)))
       ORDER BY created_at DESC`,
      [variety, approvalStatus, variety ? '' : machineNo]
    );
    const latestRecord = variety
      ? await fetchLatestWheelChangeByVariety('spinning.wheel_change_v2', variety, ['count_from_existing', 'count_from_proposed'], approvalStatus || 'approved')
      : machineNo
        ? await fetchLatestWheelChangeByMachine('spinning.wheel_change_v2', 'fm_no', machineNo, approvalStatus || 'approved')
        : null;

    res.json({
      data: result.rows.map((row) => withWheelChangeMachineAliases(withWheelChangeRfAliases('wheel_change_type2', row, 'fm_no'), 'fm_no')),
      latest_record: latestRecord ? withWheelChangeMachineAliases(withWheelChangeRfAliases('wheel_change_type2', latestRecord, 'fm_no'), 'fm_no') : null
    });

  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /spinning/wheel-change/type3:
 *   post:
 *     summary: Create Wheel Change Type3 entry
 *     tags: [Wheel Change Type3]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [wheel_change_type, test_no, date]
 *             properties:
 *               type: { type: string, example: Wheel Change }
 *               wheel_change_type: { type: string }
 *               test_no: { type: string }
 *               date: { type: string, format: date }
 *               fr_no: { type: string }
 *               count_from_existing: { type: string }
 *               count_from_proposed: { type: string }
 *               lycra_type_existing: { type: string }
 *               lycra_type_proposed: { type: string }
 *               lycra_draft_existing: { type: number }
 *               lycra_draft_proposed: { type: number }
 *               slub_code_existing: { type: string }
 *               slub_code_proposed: { type: string }
 *               ramp_existing: { type: string }
 *               ramp_proposed: { type: string }
 *               offset_on_off_existing: { type: string }
 *               offset_on_off_proposed: { type: string }
 *               cop_core_condition_existing: { type: string }
 *               cop_core_condition_proposed: { type: string }
 *               product_qty_existing: { type: number }
 *               product_qty_proposed: { type: number }
 *               roving_hank_existing: { type: number }
 *               roving_hank_proposed: { type: number }
 *               bdw_existing: { type: string }
 *               bdw_proposed: { type: string }
 *               edw_existing: { type: string }
 *               edw_proposed: { type: string }
 *               bd_existing: { type: number }
 *               bd_proposed: { type: number }
 *               dca_existing: { type: string }
 *               dca_proposed: { type: string }
 *               dcb_existing: { type: number }
 *               dcb_proposed: { type: number }
 *               dfc_existing: { type: string }
 *               dfc_proposed: { type: string }
 *               dc_existing: { type: string }
 *               dc_proposed: { type: string }
 *               tcw_existing: { type: string }
 *               tcw_proposed: { type: string }
 *               tw_existing: { type: string }
 *               tw_proposed: { type: string }
 *               tpi_tm_existing: { type: number }
 *               tpi_tm_proposed: { type: number }
 *               travelers_no_existing: { type: string }
 *               travelers_no_proposed: { type: string }
 *               spacer_existing: { type: string }
 *               spacer_proposed: { type: string }
 *               cop_weight_existing: { type: number }
 *               cop_weight_proposed: { type: number }
 *               speed_initial_existing: { type: number }
 *               speed_initial_proposed: { type: number }
 *               speed_max_existing: { type: number }
 *               speed_max_proposed: { type: number }
 *               total_draft_existing: { type: number }
 *               total_draft_proposed: { type: number }
 *               empties_colour_existing: { type: string }
 *               empties_colour_proposed: { type: string }
 *     responses:
 *       201:
 *         description: Created successfully
 *       400:
 *         description: Required fields missing
 */
router.post('/wheel-change/type3', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    await ensureProcessParameterMasterTable();
    const d = {
      ...normalizeWheelChangeType3Payload(withWheelChangeRfNumber(req.body, 'fr_no')),
      created_by_user_id: req.user?.id ?? null
    };
    const type3Fields = [
      'entry_id',
      'type',
      'wheel_change_type',
      'test_no',
      'date',
      'fr_no',
      'created_by_user_id',
      'count_from_existing',
      'count_from_proposed',
      'consignee_name_existing',
      'consignee_name_proposed',
      'lycra_type_existing',
      'lycra_type_proposed',
      'lycra_draft_existing',
      'lycra_draft_proposed',
      'slub_code_existing',
      'slub_code_proposed',
      'ramp_existing',
      'ramp_proposed',
      'offset_on_off_existing',
      'offset_on_off_proposed',
      'cop_core_condition_existing',
      'cop_core_condition_proposed',
      'product_qty_existing',
      'product_qty_proposed',
      'roving_hank_existing',
      'roving_hank_proposed',
      'bdw_existing',
      'bdw_proposed',
      'edw_existing',
      'edw_proposed',
      'bd_existing',
      'bd_proposed',
      'dca_existing',
      'dca_proposed',
      'dcb_existing',
      'dcb_proposed',
      'dfc_existing',
      'dfc_proposed',
      'dc_existing',
      'dc_proposed',
      'tcw_existing',
      'tcw_proposed',
      'tw_existing',
      'tw_proposed',
      'tpi_tm_existing',
      'tpi_tm_proposed',
      'travelers_no_existing',
      'travelers_no_proposed',
      'spacer_existing',
      'spacer_proposed',
      'cop_weight_existing',
      'cop_weight_proposed',
      'speed_initial_existing',
      'speed_initial_proposed',
      'speed_max_existing',
      'speed_max_proposed',
      'total_draft_existing',
      'total_draft_proposed',
      'empties_colour_existing',
      'empties_colour_proposed',
      'operator',
      'remarks'
    ];

    if (!d.entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    if (!d.wheel_change_type || !d.test_no || !d.date) {
      return res.status(400).json({ message: 'Required fields missing' });
    }

    if (!(await findActivePpForCombo(d.count_from_proposed, d.consignee_name_proposed))) {
      return res.status(409).json({
        message: 'No Active PP id found for this Count + Consignee Name combination. A Wheel Change can only be entered once the matching PP id has been approved.'
      });
    }

    const result = await insertWheelChangeEntry(
      'spinning.wheel_change',
      type3Fields,
      d
    );
    const savedRow = await consumeAndStampWheelChangeRow('spinning.wheel_change', result.rows[0]);

    res.status(201).json({
      message: 'Type3 created',
      data: savedRow
    });

  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(err);
  }
});

/**
 * @swagger
 * /spinning/wheel-change/type3:
 *   get:
 *     summary: Get all Type3 entries
 *     tags: [Wheel Change Type3]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/wheel-change/type3', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const variety = String(req.query.variety || req.query.variety_name || req.query.mixing || '').trim();
    const machineNo = String(req.query.fr_no || req.query.fm_no || req.query.machine_no || req.query.mc_no || '').trim();
    const approvalStatus = String(req.query.approval_status || req.query.status || '').trim();
    const result = await client.query(
      `SELECT *
       FROM spinning.wheel_change
       WHERE ($1::text = '' OR LOWER(TRIM(COALESCE(count_from_existing::text, ''))) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(count_from_proposed::text, ''))) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(bdw_existing::text, ''))) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(bdw_proposed::text, ''))) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(edw_existing::text, ''))) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(edw_proposed::text, ''))) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(dfc_existing::text, ''))) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(dfc_proposed::text, ''))) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(dc_existing::text, ''))) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(dc_proposed::text, ''))) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(tcw_existing::text, ''))) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(tcw_proposed::text, ''))) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(tw_existing::text, ''))) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(tw_proposed::text, ''))) = LOWER(TRIM($1)))
         AND ($2::text = '' OR approval_status = $2)
         AND ($3::text = '' OR LOWER(TRIM(COALESCE(fr_no::text, ''))) = LOWER(TRIM($3)))
       ORDER BY created_at DESC`,
      [variety, approvalStatus, variety ? '' : machineNo]
    );
    const latestRecord = variety
      ? await fetchLatestWheelChangeByVariety(
        'spinning.wheel_change',
        variety,
        [
          'count_from_existing',
          'count_from_proposed',
          'bdw_existing',
          'bdw_proposed',
          'edw_existing',
          'edw_proposed',
          'dfc_existing',
          'dfc_proposed',
          'dc_existing',
          'dc_proposed',
          'tcw_existing',
          'tcw_proposed',
          'tw_existing',
          'tw_proposed'
        ],
        approvalStatus || 'approved'
      )
      : machineNo
        ? await fetchLatestWheelChangeByMachine('spinning.wheel_change', 'fr_no', machineNo, approvalStatus || 'approved')
        : null;

    res.json({
      data: result.rows.map((row) => withWheelChangeMachineAliases(withWheelChangeType3Aliases(row), 'fr_no')),
      latest_record: latestRecord ? withWheelChangeMachineAliases(withWheelChangeType3Aliases(latestRecord), 'fr_no') : null
    });

  } catch (err) {
    next(err);
  }
});

const WHEEL_CHANGE_APPROVAL_TABLES = {
  type1: 'spinning.wheel_change_inspection',
  type2: 'spinning.wheel_change_v2',
  type3: 'spinning.wheel_change'
};

// Same table supervisorAssignments.routes.js owns (L1 employee -> L2
// supervisor). Guarded here too since this route may run before that
// router's own migration has ever fired on a fresh environment.
const ensureSupervisorAssignmentsTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users.supervisor_assignments (
      id bigserial PRIMARY KEY,
      supervisor_user_id integer NOT NULL REFERENCES users.user_details(id) ON DELETE CASCADE,
      employee_user_id integer NOT NULL REFERENCES users.user_details(id) ON DELETE CASCADE,
      is_active boolean NOT NULL DEFAULT true,
      assigned_at timestamptz NOT NULL DEFAULT now(),
      assigned_by integer REFERENCES users.user_details(id),
      UNIQUE (supervisor_user_id, employee_user_id)
    )
  `);
};

const isFullAccessRequest = (req) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  return role === 'admin' || role === 'super admin' || role === 'superadmin';
};

// WC Approvals visibility: L5 and Admin see every submission, no
// restrictions (L5/MD/Admin took over the "sees everything" role L3 used to
// have - L3 has no part in this flow now). An L2 only sees submissions from
// the L1 employees assigned to them (users.supervisor_assignments) - an L2
// with nobody assigned sees nothing, rather than silently falling back to
// "see everything". L4 also gets unrestricted access here (on top of their
// separate PP approval queue, not instead of it) - Wheel Change is
// something L4 co-manages alongside L5/Admin. Any other level (L1, L3,
// etc.) sees nothing (enforced on the frontend too, but re-checked here).
const resolveApprovalVisibilityScope = async (req) => {
  if (isFullAccessRequest(req)) return { unrestricted: true, allowedUserIds: [] };

  const level = String(req.user?.level || '').trim().toUpperCase();
  if (level === 'L5' || level === 'L4') return { unrestricted: true, allowedUserIds: [] };

  if (level === 'L2') {
    await ensureSupervisorAssignmentsTable();
    const supervisorUserId = req.user?.id;
    if (!supervisorUserId) return { unrestricted: false, allowedUserIds: [] };
    const result = await client.query(
      `SELECT employee_user_id FROM users.supervisor_assignments
       WHERE supervisor_user_id = $1 AND is_active = true`,
      [supervisorUserId]
    );
    return { unrestricted: false, allowedUserIds: result.rows.map((row) => row.employee_user_id) };
  }

  return { unrestricted: false, allowedUserIds: [] };
};

const applyApprovalVisibilityScope = (rows, scope) =>
  scope.unrestricted
    ? rows
    : rows.filter((row) => scope.allowedUserIds.includes(row.created_by_user_id));

router.get('/wheel-change/approvals', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const status = String(req.query.status ?? '').trim();
    const whereClause = status ? 'WHERE approval_status = $1' : '';
    const scope = await resolveApprovalVisibilityScope(req);

    const results = await Promise.all(
      Object.entries(WHEEL_CHANGE_APPROVAL_TABLES).map(([type, tableName]) =>
        client.query(
          `SELECT * FROM ${tableName} ${whereClause} ORDER BY created_at DESC, id DESC`,
          status ? [status] : []
        ).then((result) => result.rows.map((row) => ({ ...row, id: `${type}:${row.id}`, wheel_change_type: type })))
      )
    );

    const rows = results.flat();

    // The operator field is free text typed at submit time and can be
    // blank; fall back to the submitting user's actual name via
    // created_by_user_id rather than showing "-" when that happens.
    const submitterIds = Array.from(
      new Set(
        rows
          .filter((row) => !String(row.operator || '').trim() && row.created_by_user_id)
          .map((row) => row.created_by_user_id)
      )
    );
    const nameById = new Map();
    if (submitterIds.length) {
      const namesResult = await client.query(
        `SELECT id, full_name FROM users.user_details WHERE id = ANY($1::int[])`,
        [submitterIds]
      );
      namesResult.rows.forEach((user) => nameById.set(user.id, user.full_name));
    }

    const data = applyApprovalVisibilityScope(rows, scope)
      .map((row) => ({
        ...row,
        operator: String(row.operator || '').trim() || nameById.get(row.created_by_user_id) || null,
      }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.status(200).json({ data });
  } catch (error) {
    console.error('Spinning wheel change approvals fetch error:', error);
    next(error);
  }
});

const resolveWheelChangeApprovalTable = (compositeId) => {
  const [type, rawId] = String(compositeId ?? '').split(':');
  const tableName = WHEEL_CHANGE_APPROVAL_TABLES[type];
  const id = parseInt(rawId, 10);
  if (!tableName || !Number.isInteger(id) || id <= 0) return null;
  return { tableName, id, type };
};

// Finds the currently-Active PP id for this Count + Consignee, if any.
const findActivePpForCombo = async (countName, consigneeName) => {
  const trimmedCount = String(countName || '').trim();
  const trimmedConsignee = String(consigneeName || '').trim();
  if (!trimmedCount || !trimmedConsignee) return null;

  const result = await client.query(
    `SELECT h.entry_id
     FROM spinning.spinning_qc_header h
     JOIN process_parameters.master m ON m.entry_id = h.entry_id
     WHERE LOWER(TRIM(COALESCE(h.count_name, ''))) = LOWER(TRIM($1))
       AND LOWER(TRIM(COALESCE(h.consignee_name, ''))) = LOWER(TRIM($2))
       AND m.status = 'active'
     ORDER BY h.created_at DESC
     LIMIT 1`,
    [trimmedCount, trimmedConsignee]
  );
  return result.rows[0]?.entry_id || null;
};

// Spends the one Wheel Change use an Active PP unlocks for this Count +
// Consignee - flips that PP id from active to inactive. Called right after a
// Wheel Change row is saved (not on its later approval - see the PP lifecycle
// notes on process_parameters.master). Returns the consumed entry_id (or
// null if there was no Active PP to consume, which shouldn't happen given
// the pp-approval-status gate, but isn't fatal if it does).
const consumeActivePpForWheelChange = async (countName, consigneeName) => {
  const entryId = await findActivePpForCombo(countName, consigneeName);
  if (!entryId) return null;

  const result = await client.query(
    `UPDATE process_parameters.master SET status = 'inactive', updated_at = NOW()
     WHERE entry_id = $1 AND status = 'active'
     RETURNING entry_id`,
    [entryId]
  );
  return result.rows[0]?.entry_id || null;
};

// Reverses consumeActivePpForWheelChange - if the Wheel Change that consumed
// a PP id gets rejected, that PP goes back to Active so the operator can
// retry against it instead of it being wasted.
const restorePpAfterWheelChangeRejection = async (entryId) => {
  if (!entryId) return;
  await client.query(
    `UPDATE process_parameters.master SET status = 'active', updated_at = NOW()
     WHERE entry_id = $1 AND status = 'inactive'`,
    [entryId]
  );
};

// Called right after a Wheel Change row is inserted (type1-4) - consumes the
// Active PP for its Count + Consignee (flips it to Inactive) and stamps
// consumed_pp_entry_id on the row so a later rejection knows what to revert.
// Returns the row as saved (with consumed_pp_entry_id filled in if a PP was
// consumed).
const consumeAndStampWheelChangeRow = async (tableName, row) => {
  const consumedEntryId = await consumeActivePpForWheelChange(row.count_from_proposed, row.consignee_name_proposed);
  if (!consumedEntryId) return row;

  const result = await client.query(
    `UPDATE ${tableName} SET consumed_pp_entry_id = $1 WHERE id = $2 RETURNING *`,
    [consumedEntryId, row.id]
  );
  return result.rows[0] || row;
};

router.post('/wheel-change/approvals/:id/approve', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const resolved = resolveWheelChangeApprovalTable(req.params.id);
    if (!resolved) {
      return res.status(400).json({ message: 'Invalid ID supplied' });
    }
    const reviewedBy = String(req.body?.department ?? req.body?.reviewed_by ?? '').trim() || null;
    const result = await client.query(
      `UPDATE ${resolved.tableName}
       SET approval_status = 'approved', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [reviewedBy, resolved.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.status(200).json({
      message: 'Spinning wheel change entry approved',
      data: { ...result.rows[0], id: `${resolved.type}:${result.rows[0].id}`, wheel_change_type: resolved.type }
    });
  } catch (error) {
    console.error('Spinning wheel change approve error:', error);
    next(error);
  }
});

router.post('/wheel-change/approvals/:id/reject', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    await ensureProcessParameterMasterTable();
    const resolved = resolveWheelChangeApprovalTable(req.params.id);
    if (!resolved) {
      return res.status(400).json({ message: 'Invalid ID supplied' });
    }
    const reviewedBy = String(req.body?.department ?? req.body?.reviewed_by ?? '').trim() || null;
    const reason = String(req.body?.reason ?? '').trim() || null;
    const result = await client.query(
      `UPDATE ${resolved.tableName}
       SET approval_status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), review_remarks = $2
       WHERE id = $3
       RETURNING *`,
      [reviewedBy, reason, resolved.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    const rejectedRow = result.rows[0];
    await restorePpAfterWheelChangeRejection(rejectedRow.consumed_pp_entry_id);

    res.status(200).json({
      message: 'Spinning wheel change entry rejected',
      data: { ...rejectedRow, id: `${resolved.type}:${rejectedRow.id}`, wheel_change_type: resolved.type }
    });
  } catch (error) {
    console.error('Spinning wheel change reject error:', error);
    next(error);
  }
});

// PP (Process Parameter) approvals queue for Spinning — mirrors the Wheel
// Change approvals list/approve/reject shape (see /wheel-change/approvals
// above) so it can be plugged into the same generic ApprovalsQueueView on
// the frontend. Each spinning_qc_header row is one PP entry, identified by
// its shared entry_id (PP-000N) plus Count + Consignee Name.
router.get('/qc/approvals', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const status = String(req.query.status ?? '').trim();
    const whereClause = status ? 'WHERE h.approval_status = $1' : '';
    const scope = await resolveApprovalVisibilityScope(req);

    // spinning_qc_header has no operator/created_by name column of its own
    // (unlike the wheel-change tables) - resolve the submitting L1's name
    // from created_by_user_id instead so the approvals list isn't stuck
    // showing "-" for Operator.
    const result = await client.query(
      `SELECT h.*, u.full_name AS submitted_by_name, u.employee_id AS submitted_by_employee_id
       FROM spinning.spinning_qc_header h
       LEFT JOIN users.user_details u ON u.id = h.created_by_user_id
       ${whereClause}
       ORDER BY h.created_at DESC, h.qc_id DESC`,
      status ? [status] : []
    );

    const data = applyApprovalVisibilityScope(result.rows, scope).map((row) => ({
      ...row,
      id: row.qc_id,
      title: row.entry_id || `Spinning PP #${row.qc_id}`,
      department: 'Spinning',
      operator: row.submitted_by_name || null,
    }));

    res.status(200).json({ data });
  } catch (error) {
    console.error('Spinning PP approvals fetch error:', error);
    next(error);
  }
});

router.post('/qc/:id/approve', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const qcId = parseInt(req.params.id, 10);
    if (!Number.isInteger(qcId) || qcId <= 0) {
      return res.status(400).json({ message: 'Invalid ID supplied' });
    }
    const reviewedBy = String(req.body?.department ?? req.body?.reviewed_by ?? '').trim() || null;
    const result = await client.query(
      `UPDATE spinning.spinning_qc_header
       SET approval_status = 'approved', reviewed_by = $1, reviewed_at = NOW()
       WHERE qc_id = $2
       RETURNING *`,
      [reviewedBy, qcId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Spinning QC entry not found' });
    }
    res.status(200).json({ message: 'Spinning QC entry approved', data: { ...result.rows[0], id: result.rows[0].qc_id } });
  } catch (error) {
    next(error);
  }
});

router.post('/qc/:id/reject', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    const qcId = parseInt(req.params.id, 10);
    if (!Number.isInteger(qcId) || qcId <= 0) {
      return res.status(400).json({ message: 'Invalid ID supplied' });
    }
    const reviewedBy = String(req.body?.department ?? req.body?.reviewed_by ?? '').trim() || null;
    const reason = String(req.body?.reason ?? '').trim() || null;
    const result = await client.query(
      `UPDATE spinning.spinning_qc_header
       SET approval_status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), review_remarks = $2
       WHERE qc_id = $3
       RETURNING *`,
      [reviewedBy, reason, qcId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Spinning QC entry not found' });
    }
    res.status(200).json({ message: 'Spinning QC entry rejected', data: { ...result.rows[0], id: result.rows[0].qc_id } });
  } catch (error) {
    next(error);
  }
});

// Wheel Change gate: a Wheel Change proposal for a given Count + Consignee
// Name is only allowed while there's an Active PP id for that same
// combination (see the 4-stage PP lifecycle in processParameters.js:
// in_progress -> pending_approval -> active -> inactive). Active is reached
// only via a single L4/L5/Admin approval on the whole PP id, once every
// department has submitted - not a per-row check on Spinning alone.
router.get('/wheel-change/pp-approval-status', async (req, res, next) => {
  try {
    await ensureSpinningEntryIdColumns();
    await ensureProcessParameterMasterTable();
    const countName = String(req.query.count_name || req.query.countName || req.query.count || '').trim();
    const consigneeName = String(req.query.consignee_name || req.query.consigneeName || req.query.consignee || '').trim();

    if (!countName || !consigneeName) {
      return res.status(400).json({ message: 'count_name and consignee_name are required' });
    }

    const anySubmitted = await client.query(
      `SELECT 1 FROM spinning.spinning_qc_header
       WHERE LOWER(TRIM(COALESCE(count_name, ''))) = LOWER(TRIM($1))
         AND LOWER(TRIM(COALESCE(consignee_name, ''))) = LOWER(TRIM($2))
       LIMIT 1`,
      [countName, consigneeName]
    );

    const activeEntryId = await findActivePpForCombo(countName, consigneeName);

    res.status(200).json({
      count_name: countName,
      consignee_name: consigneeName,
      exists: anySubmitted.rowCount > 0,
      fully_approved: Boolean(activeEntryId),
      pp_id: activeEntryId
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;



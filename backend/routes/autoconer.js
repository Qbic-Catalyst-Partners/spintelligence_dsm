const express = require('express');
const router = express.Router();
const client = require('../connection');
const sqlServer = require('../config/sqlserver');
const { createEmployeeMasterDropdown } = require('../utils/employeeMaster');
const { resolveOrCreateProcessParameterEntryId, getCountNameConflict } = require('../utils/processParameterEntryId');
const SCREEN_ID_PREFIXES = {
  process: 'AP',
  q2: 'A2',
  q3: 'A3',
  q4: 'A4'
};

const AUTOCONER_SCREEN_SLUGS = [
  'process',
  'process-parameter',
  'process_parameter',
  'q2',
  'q3',
  'q4',
  'pp-q2',
  'pp-q3',
  'pp-q4',
  'ppq2',
  'ppq3',
  'ppq4',
  'pp-autoconer-q2',
  'pp-autoconer-q3',
  'pp-autoconer-q4',
  'ppautoconerq2',
  'ppautoconerq3',
  'ppautoconerq4',
  'autoconer-q2',
  'autoconer-q3',
  'autoconer-q4',
  'autoconerq2inspection',
  'autoconerq3inspection',
  'autoconerq4inspection',
  'inspection-data-entry',
  'inspectiondataentry',
  'cone-density',
  'conedensity',
  'splice-strength',
  'drum-wise',
  'count-wise-cuts',
  'lycra-checking',
  'cone-packing-audit'
];

const formatScreenEntryId = (screenKey, rawId) => {
  const prefix = SCREEN_ID_PREFIXES[screenKey];
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

const isUniqueViolation = (err) => err && err.code === '23505';

const fetchCountMaster = async (prefix = '') => {
  const result = await sqlServer.query(
    `SELECT
       MIN(LTRIM(RTRIM(CAST(cntcode AS VARCHAR(50))))) AS cntcode,
       LTRIM(RTRIM(REPLACE(REPLACE(CAST(cntname AS VARCHAR(255)), CHAR(13), ''), CHAR(10), ''))) AS cntname
     FROM dbo.Depot_CountMaster
     WHERE LTRIM(RTRIM(CAST(cntname AS VARCHAR(255)))) <> ''
       AND (@prefix = '' OR LTRIM(RTRIM(CAST(cntname AS VARCHAR(255)))) LIKE @prefixLike)
     GROUP BY LTRIM(RTRIM(REPLACE(REPLACE(CAST(cntname AS VARCHAR(255)), CHAR(13), ''), CHAR(10), '')))
     ORDER BY MIN(CASE WHEN ISNUMERIC(CAST(cntcode AS VARCHAR(50))) = 1 THEN CAST(cntcode AS INT) ELSE 2147483647 END), cntname`,
    { prefix, prefixLike: `%${prefix}%` }
  );

  return (result.recordset || [])
    .map((row) => ({
      cntcode: row.cntcode ? String(row.cntcode).trim() : null,
      cntname: row.cntname ? String(row.cntname).trim() : null
    }))
    .filter((row) => row.cntcode && row.cntname);
};

const fetchPostgresCountMaster = async () => {
  const result = await client.query(
    `SELECT count_name
     FROM autoconer.count_master
     WHERE count_name IS NOT NULL AND BTRIM(count_name) <> ''
     ORDER BY count_name`
  );
  return result.rows
    .map((row) => (row.count_name ? String(row.count_name).trim() : null))
    .filter(Boolean)
    .map((cntname) => ({ cntcode: cntname, cntname }));
};

const getCountMasterDropdown = async (req, res, next) => {
  try {
    const prefix = String(req.query.count_prefix || req.query.prefix || '').trim();
    const countOptions = sqlServer.hasSqlServerEnv()
      ? await fetchCountMaster(prefix)
      : await fetchPostgresCountMaster();
    const options = [
      { text: '-- Select Count Name --', value: '' },
      ...countOptions.map((count) => ({
        text: count.cntname,
        label: count.cntname,
        value: count.cntname,
        cntcode: count.cntcode,
        count_code: count.cntcode,
        cntname: count.cntname,
        count_name: count.cntname
      }))
    ];

    return res.status(200).json({
      source: sqlServer.hasSqlServerEnv() ? 'sqlserver' : 'postgres',
      table: sqlServer.hasSqlServerEnv() ? 'Depot_CountMaster' : 'autoconer.count_master',
      count_options: countOptions,
      count_names: countOptions.map((row) => row.cntname),
      names: countOptions.map((row) => row.cntname),
      values: countOptions.map((row) => row.cntname),
      options
    });
  } catch (error) {
    console.error('Error fetching Autoconer count names from SQL Server:', error);
    next(error);
  }
};

const getEmployeeMasterDropdown = createEmployeeMasterDropdown(sqlServer, 'autoconer');

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toBooleanOrNull = (value) => {
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return null;
};

const trimOrNull = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
};

const toDateOnlyOrNull = (value) => {
  const text = trimOrNull(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const calculateBreakPerLakh = ({ noOfCuts, totalLengthMeter, readings = [] }) => {
  const cuts = toNumberOrNull(noOfCuts);
  let meters = toNumberOrNull(totalLengthMeter);

  if ((!meters || meters <= 0) && Array.isArray(readings)) {
    meters = readings.reduce((sum, row) => {
      const lengthMeter = toNumberOrNull(
        row.length_meter ?? row.length_mtr ?? row.length_per_meter ?? row.meter
      );
      if (lengthMeter && lengthMeter > 0) return sum + lengthMeter;

      const lengthMm = toNumberOrNull(row.length_mm);
      if (lengthMm && lengthMm > 0) return sum + (lengthMm / 1000);

      return sum;
    }, 0);
  }

  if (!cuts || cuts <= 0 || !meters || meters <= 0) return null;
  return Number(((cuts * 100000) / meters).toFixed(4));
};

const calculateBreakPerMillionMeter = ({ totalCones, totalLength }) => {
  const cones = toNumberOrNull(totalCones);
  const length = toNumberOrNull(totalLength);
  if (!cones || cones <= 0 || !length || length <= 0) return null;
  return Number(((cones * 1000000) / length).toFixed(4));
};

const ensureRewindingStudyTables = async () => {
  const studyExistsResult = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'autoconer'
        AND table_name = 'rewinding_study'
    ) AS exists
  `);
  const inspectionsExistsResult = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'autoconer'
        AND table_name = 'rewinding_study_inspections'
    ) AS exists
  `);

  if (!studyExistsResult.rows[0].exists) {
    await client.query(`
      CREATE TABLE autoconer.rewinding_study (
        id BIGSERIAL PRIMARY KEY,
        entry_date DATE NOT NULL,
        type TEXT NOT NULL,
        machine_name TEXT,
        count_name TEXT,
        cntcode TEXT,
        cone_tip TEXT,
        drum_from INTEGER,
        drum_to INTEGER,
        drum_no INTEGER,
        no_of_cones NUMERIC(18,4),
        actual_count NUMERIC(18,4),
        weight NUMERIC(18,4),
        no_of_cuts NUMERIC(18,4),
        break_per_lakh NUMERIC(18,4),
        remarks TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  if (!inspectionsExistsResult.rows[0].exists) {
    await client.query(`
      CREATE TABLE autoconer.rewinding_study_inspections (
        id BIGSERIAL PRIMARY KEY,
        rewinding_study_id BIGINT NOT NULL REFERENCES autoconer.rewinding_study(id) ON DELETE CASCADE,
        reading_number INTEGER NOT NULL,
        short_cut TEXT,
        short_name TEXT,
        fault_percent NUMERIC(18,8),
        length_mm NUMERIC(18,4),
        weight NUMERIC(18,4),
        break_per_meter NUMERIC(18,4),
        percent_yarn NUMERIC(18,8),
        appearance_ok BOOLEAN,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  await client.query(`
    ALTER TABLE IF EXISTS autoconer.rewinding_study_inspections
    DROP COLUMN IF EXISTS drum_no
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS rewinding_study_inspections_parent_idx
    ON autoconer.rewinding_study_inspections (rewinding_study_id, reading_number)
  `);
};

const normalizeRewindingInspection = (inspection, index) => {
  const readingNumber = toNumberOrNull(inspection?.reading_number);
  const faultPercent = toNumberOrNull(inspection?.fault_percent);
  const lengthMm = toNumberOrNull(inspection?.length_mm);
  const rowWeight = toNumberOrNull(inspection?.weight);
  const breakPerMeter = toNumberOrNull(inspection?.break_per_meter);
  const percentYarn = toNumberOrNull(inspection?.percent_yarn);
  const appearanceOk = toBooleanOrNull(inspection?.appearance_ok);

  if (!Number.isFinite(readingNumber)) {
    return { error: `drum_inspections[${index}].reading_number is required and must be numeric` };
  }
  if (faultPercent === null) {
    return { error: `drum_inspections[${index}].fault_percent is required and must be numeric` };
  }
  if (!Number.isFinite(faultPercent)) {
    return { error: `drum_inspections[${index}].fault_percent must be numeric when provided` };
  }
  if (lengthMm === null) {
    return { error: `drum_inspections[${index}].length_mm is required and must be numeric` };
  }
  if (!Number.isFinite(lengthMm)) {
    return { error: `drum_inspections[${index}].length_mm must be numeric when provided` };
  }
  if (rowWeight === null) {
    return { error: `drum_inspections[${index}].weight is required and must be numeric` };
  }
  if (!Number.isFinite(rowWeight)) {
    return { error: `drum_inspections[${index}].weight must be numeric when provided` };
  }
  if (breakPerMeter === null) {
    return { error: `drum_inspections[${index}].break_per_meter is required and must be numeric` };
  }
  if (!Number.isFinite(breakPerMeter)) {
    return { error: `drum_inspections[${index}].break_per_meter must be numeric when provided` };
  }
  if (percentYarn === null) {
    return { error: `drum_inspections[${index}].percent_yarn is required and must be numeric` };
  }
  if (!Number.isFinite(percentYarn)) {
    return { error: `drum_inspections[${index}].percent_yarn must be numeric when provided` };
  }
  if (appearanceOk === null) {
    return { error: `drum_inspections[${index}].appearance_ok is required and must be boolean` };
  }

  return {
    reading_number: Math.trunc(readingNumber),
    short_cut: trimOrNull(inspection?.short_cut),
    short_name: trimOrNull(inspection?.short_name),
    fault_percent: faultPercent,
    length_mm: lengthMm,
    weight: rowWeight,
    break_per_meter: breakPerMeter,
    percent_yarn: percentYarn,
    appearance_ok: appearanceOk
  };
};

const mapRewindingRow = (row) => ({
  id: row.id,
  rewinding_study_id: row.rewinding_study_id,
  reading_number: row.reading_number,
  short_cut: row.short_cut,
  short_name: row.short_name,
  fault_percent: row.fault_percent !== null && row.fault_percent !== undefined ? Number(row.fault_percent) : null,
  length_mm: row.length_mm !== null && row.length_mm !== undefined ? Number(row.length_mm) : null,
  weight: row.weight !== null && row.weight !== undefined ? Number(row.weight) : null,
  break_per_meter: row.break_per_meter !== null && row.break_per_meter !== undefined ? Number(row.break_per_meter) : null,
  percent_yarn: row.percent_yarn !== null && row.percent_yarn !== undefined ? Number(row.percent_yarn) : null,
  appearance_ok: row.appearance_ok
});

const fetchAutoconerConsigneeOptions = async () => {
  const result = await client.query(`
    SELECT DISTINCT consignee_name
    FROM (
      SELECT consignee_name FROM autoconer.autoconer_process_parameter
      WHERE consignee_name IS NOT NULL AND BTRIM(consignee_name) <> ''
      UNION
      SELECT consignee_name FROM autoconer.autoconer_q2_inspection
      WHERE consignee_name IS NOT NULL AND BTRIM(consignee_name) <> ''
      UNION
      SELECT consignee_name FROM autoconer.autoconer_q3_inspection
      WHERE consignee_name IS NOT NULL AND BTRIM(consignee_name) <> ''
      UNION
      SELECT consignee_name FROM autoconer.autoconer_q4_inspection
      WHERE consignee_name IS NOT NULL AND BTRIM(consignee_name) <> ''
    ) t
    ORDER BY consignee_name
  `);

  return result.rows
    .map((row) => {
      const value = row.consignee_name ? String(row.consignee_name).trim() : null;
      return value ? { value, label: value, text: value, consignee_name: value } : null;
    })
    .filter(Boolean);
};

const sendAutoconerConsigneeDropdown = async (_req, res, next) => {
  try {
    const options = await fetchAutoconerConsigneeOptions();
    return res.status(200).json({
      data: options,
      options,
      consignee_options: options,
      consignee_names: options.map((row) => row.value),
      values: options.map((row) => row.value),
      names: options.map((row) => row.value)
    });
  } catch (error) {
    return next(error);
  }
};

const sendAutoconerMasterData = async (req, res, next) => {
  try {
    const payload = await fetchAutoconerMasterData(req.query);
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
};

const sendAutoconerMachineDropdown = async (req, res, next) => {
  try {
    const payload = await fetchAutoconerMasterData(req.query);
    const options = payload.autoconer_options || [];
    return res.status(200).json({
      source: payload.source,
      data: options,
      options,
      autoconer_options: options,
      machine_options: options,
      autoconer_nos: options.map((row) => row.value),
      machine_names: options.map((row) => row.value),
      mc_names: options.map((row) => row.value),
      values: options.map((row) => row.value),
      names: options.map((row) => row.value)
    });
  } catch (error) {
    return next(error);
  }
};

// These tables store their submission timestamp as `timestamp WITHOUT time zone` with a bare
// default — on this DB, that silently writes a different offset than what gets displayed back,
// shifting "Created At" by several hours (sometimes onto the wrong calendar day) in Custom Report.
// Same root cause and same fix as every other department's equivalent tables: convert to
// timestamptz so new rows store an unambiguous absolute instant. (rewinding_study's own CREATE
// TABLE statement already declares TIMESTAMPTZ, but that only applies to a fresh table — this
// one was created earlier under the old plain-timestamp definition, so it still needs the same
// ALTER here.)
const ensureAutoconerTimestampColumnsHaveTimezone = async () => {
  const tablesAndColumn = [
    ['autoconer.autoconer_process_parameter', 'created_at'],
    ['autoconer.autoconer_process_parameter', 'updated_at'],
    ['autoconer.autoconer_q2_inspection', 'created_at'],
    ['autoconer.autoconer_q2_inspection', 'updated_at'],
    ['autoconer.autoconer_q3_inspection', 'created_at'],
    ['autoconer.autoconer_q3_inspection', 'updated_at'],
    ['autoconer.cone_density', 'created_at'],
    ['autoconer.cone_density_notebook', 'created_at'],
    ['autoconer.cone_density_notebook', 'updated_at'],
    ['autoconer.cone_density_notebook_drums', 'created_at'],
    ['autoconer.cone_packing_audit', 'created_at'],
    ['autoconer.count_wise_cuts', 'created_at'],
    ['autoconer.drum_readings', 'created_at'],
    ['autoconer.drum_wise', 'created_at'],
    ['autoconer.inspection_data_entry', 'created_at'],
    ['autoconer.inspections', 'created_at'],
    ['autoconer.lycra_checking_inspections', 'created_at'],
    ['autoconer.parameter_entries', 'created_at'],
    ['autoconer.parameter_entries', 'updated_at'],
    ['autoconer.rewinding_study', 'created_at']
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

const ensureAutoconerEntryIdColumns = async () => {
  await ensureAutoconerTimestampColumnsHaveTimezone();
  await client.query(`
    ALTER TABLE autoconer.autoconer_process_parameter
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS autoconer_process_parameter_entry_id_uq
    ON autoconer.autoconer_process_parameter (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    ALTER TABLE autoconer.autoconer_q2_inspection
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS autoconer_q2_inspection_entry_id_uq
    ON autoconer.autoconer_q2_inspection (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    ALTER TABLE autoconer.autoconer_q3_inspection
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS autoconer_q3_inspection_entry_id_uq
    ON autoconer.autoconer_q3_inspection (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  // Autoconer Q4 notebook — unlike q2/q3 (created manually in the DB before this codebase
  // adopted the "ensure*" idempotent-migration convention), this table is created here so the
  // feature works out of the box against any database, with no manual provisioning step.
  await client.query(`
    CREATE TABLE IF NOT EXISTS autoconer.autoconer_q4_inspection (
      id SERIAL PRIMARY KEY,
      entry_id TEXT,
      count_name VARCHAR(100) NOT NULL,
      consignee_name VARCHAR(100) NOT NULL,
      creation_date DATE NOT NULL,
      nsl1 NUMERIC(6,2), nsl2 NUMERIC(6,2), nsl3 NUMERIC(6,2), nsl4 NUMERIC(6,2), nsl5 NUMERIC(6,2), nsl6 NUMERIC(6,2), nsl7 NUMERIC(6,2),
      t1 NUMERIC(6,2), t2 NUMERIC(6,2), t3 NUMERIC(6,2), t4 NUMERIC(6,2), t5 NUMERIC(6,2),
      pf_sensing NUMERIC(6,2),
      pf_no_of_periods INTEGER,
      oc NUMERIC(6,2), cp NUMERIC(6,2), cm NUMERIC(6,2), ccp1 NUMERIC(6,2), ccp2 NUMERIC(6,2), ccm1 NUMERIC(6,2), ccm2 NUMERIC(6,2),
      jp1 NUMERIC(6,2), jp2 NUMERIC(6,2), jp3 NUMERIC(6,2), jp4 NUMERIC(6,2), jp5 NUMERIC(6,2), jp6 NUMERIC(6,2), jp7 NUMERIC(6,2),
      jp_clearing NUMERIC(6,2), jp_u_percent NUMERIC(6,2), jp_jm NUMERIC(6,2),
      fd1 NUMERIC(6,2), fd2 NUMERIC(6,2), fd3 NUMERIC(6,2), fd4 NUMERIC(6,2), fd5 NUMERIC(6,2), fd6 NUMERIC(6,2),
      reference_length NUMERIC(6,2),
      suction NUMERIC(6,2),
      measurement NUMERIC(6,2),
      upper_limit NUMERIC(6,2),
      lower_limit NUMERIC(6,2),
      action VARCHAR(255),
      suction_status VARCHAR(255),
      blocking VARCHAR(255),
      x_status VARCHAR(10) DEFAULT 'On',
      dp_plus_30 NUMERIC(6,2),
      sm_minus_30 NUMERIC(6,2),
      cdp1 NUMERIC(6,2), cdp2 NUMERIC(6,2), cdm1 NUMERIC(6,2), cdm2 NUMERIC(6,2),
      nsl_max_event NUMERIC(6,2),
      t_max_event NUMERIC(6,2),
      fd_max_events NUMERIC(6,2),
      fl_max_events NUMERIC(6,2),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS autoconer_q4_inspection_entry_id_uq
    ON autoconer.autoconer_q4_inspection (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    ALTER TABLE autoconer.lycra_checking_inspections
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS lycra_checking_inspections_entry_id_uq
    ON autoconer.lycra_checking_inspections (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  // Neither table was ever given a real PRIMARY KEY (just a plain `id` column) — harmless until
  // GET /lycra-checking's GROUP BY i.id, s.id runs, since without a declared primary key Postgres
  // can't apply the functional-dependency rule that normally lets `i.*`/`s.*` be selected once
  // grouped by their own id, and instead rejects the whole query with "column ... must appear in
  // the GROUP BY clause" — meaning this route has been failing outright on every fetch.
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conrelid = 'autoconer.lycra_checking_inspections'::regclass AND contype = 'p'
      ) THEN
        ALTER TABLE autoconer.lycra_checking_inspections ADD PRIMARY KEY (id);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conrelid = 'autoconer.lycra_checking_summary'::regclass AND contype = 'p'
      ) THEN
        ALTER TABLE autoconer.lycra_checking_summary ADD PRIMARY KEY (id);
      END IF;
    END $$;
  `);

  await client.query(`
    ALTER TABLE autoconer.drum_wise
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS drum_wise_entry_id_uq
    ON autoconer.drum_wise (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  // cone_density was never given a real PRIMARY KEY either (same root cause as
  // lycra_checking above) — GET /cone-density's `GROUP BY cd.id` with `cd.*` selected
  // fails with "column cd.test_no must appear in the GROUP BY clause" without it,
  // so the Cone Density screen 500s on every fetch.
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conrelid = 'autoconer.cone_density'::regclass AND contype = 'p'
      ) THEN
        ALTER TABLE autoconer.cone_density ADD PRIMARY KEY (id);
      END IF;
    END $$;
  `);

  await client.query(`
    ALTER TABLE autoconer.inspections
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS autoconer_inspections_entry_id_uq
    ON autoconer.inspections (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    ALTER TABLE autoconer.cone_density
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS cone_density_entry_id_uq
    ON autoconer.cone_density (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    ALTER TABLE autoconer.cone_packing_audit
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS cone_packing_audit_entry_id_uq
    ON autoconer.cone_packing_audit (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    ALTER TABLE autoconer.parameter_entries
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS parameter_entries_entry_id_uq
    ON autoconer.parameter_entries (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    ALTER TABLE autoconer.count_wise_cuts
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS count_wise_cuts_entry_id_uq
    ON autoconer.count_wise_cuts (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  // cone_density_notebook already has an entry_id column (it's the table the Cone Density screen
  // actually reads/writes via /cone-density-notebook, unlike the older, effectively unused
  // /cone-density + autoconer.cone_density pairing above) but never had a uniqueness guard.
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS cone_density_notebook_entry_id_uq
    ON autoconer.cone_density_notebook (entry_id)
    WHERE entry_id IS NOT NULL;
  `);
};

router.get('/thresholds', async (req, res, next) => {
  try {
    const {
      management_field,
      erp_product_code,
      machine_name,
      parameters
    } = req.query;

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

/**
 * @swagger
 * /autoconer/lycra-checking:
 *   post:
 *     summary: Save Lycra Checking Inspection (Header + Readings + Summary)
 *     tags: [Autoconer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             inspection_type: "Lycra Checking"
 *             test_no: 1
 *             entry_date: "2026-03-05"
 *             lycra_draft: 3.07
 *             count_name: "10 BLACK POLY 70D SPX YARN"
 *             no_of_readings: 3
 *             lycra_weight: 0.0329
 *             fabric_weight: 0.5141
 *             total_weight: 0.5470
 *             lycra_percent: 6.01
 *             readings:
 *               - reading_no: 1
 *                 length_mm: 216
 *               - reading_no: 2
 *                 length_mm: 220
 *               - reading_no: 3
 *                 length_mm: 218
 *             summary:
 *               avg_length: 218.56
 *               lycra_weight: 0.0329
 *               fabric_weight: 0.5141
 *               total_weight: 0.5470
 *               lycra_percent: 6.01
 *     responses:
 *       201:
 *         description: Saved successfully
 *       500:
 *         description: Server error
 */
router.post('/lycra-checking', async (req, res) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const {
      entry_id,
      inspection_type,
      test_no,
      entry_date,
      lycra_draft,
      count_name,
      no_of_readings,
      lycra_weight,
      fabric_weight,
      total_weight,
      lycra_percent,
      readings,
      summary
    } = req.body;

    if (!inspection_type || !entry_date) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    await client.query('BEGIN');

    // ✅ 1. Insert Header
    const header = await client.query(`
            INSERT INTO autoconer.lycra_checking_inspections
            (entry_id, inspection_type, test_no, entry_date, lycra_draft,
             count_name, no_of_readings,
             lycra_weight, fabric_weight, total_weight, lycra_percent)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            RETURNING id
        `, [
      entry_id || null,
      inspection_type,
      test_no,
      entry_date,
      lycra_draft,
      count_name,
      no_of_readings,
      lycra_weight,
      fabric_weight,
      total_weight,
      lycra_percent
    ]);

    const inspection_id = header.rows[0].id;

    // ✅ 2. Insert Readings
    if (readings && readings.length > 0) {
      for (const row of readings) {
        await client.query(`
                    INSERT INTO autoconer.lycra_checking_readings
                    (inspection_id, reading_no, length_mm,
                     lycra_weight, fabric_weight, total_weight, lycra_percent)
                    VALUES ($1,$2,$3,$4,$5,$6,$7)
                `, [
          inspection_id,
          row.reading_no,
          row.length_mm,
          row.lycra_weight || 0,
          row.fabric_weight || 0,
          row.total_weight || 0,
          row.lycra_percent || 0
        ]);
      }
    }

    // ✅ 3. Insert Summary
    if (summary) {
      await client.query(`
                INSERT INTO autoconer.lycra_checking_summary
                (inspection_id, avg_length, lycra_weight, fabric_weight, total_weight, lycra_percent)
                VALUES ($1,$2,$3,$4,$5,$6)
            `, [
        inspection_id,
        summary.avg_length,
        summary.lycra_weight,
        summary.fabric_weight,
        summary.total_weight,
        summary.lycra_percent
      ]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: "Saved successfully",
      inspection_id
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error("❌ Insert Error:", err);

    res.status(500).json({
      message: "Server error"
    });
  }
});

/**
 * @swagger
 * /autoconer/lycra-checking:
 *   get:
 *     summary: Get all Lycra Checking records
 *     tags: [Autoconer]
 *     responses:
 *       200:
 *         description: List of inspections
 */
router.get('/lycra-checking', async (req, res) => {
  try {
    await ensureAutoconerEntryIdColumns();

    const result = await client.query(`
            SELECT
                i.*,

                -- Readings (ordered by insertion order — DISTINCT alone sorts by the aggregated
                -- value, not insertion order, so "Reading 1" could silently show a different row
                -- than the first one actually entered)
                COALESCE(
                    json_agg(
                        jsonb_build_object(
                            'reading_no', r.reading_no,
                            'length_mm', r.length_mm,
                            'lycra_weight', r.lycra_weight,
                            'fabric_weight', r.fabric_weight,
                            'total_weight', r.total_weight,
                            'lycra_percent', r.lycra_percent
                        ) ORDER BY r.id
                    ) FILTER (WHERE r.id IS NOT NULL), '[]'
                ) AS readings,

                -- Summary
                json_build_object(
                    'avg_length', s.avg_length,
                    'lycra_weight', s.lycra_weight,
                    'fabric_weight', s.fabric_weight,
                    'total_weight', s.total_weight,
                    'lycra_percent', s.lycra_percent
                ) AS summary

            FROM autoconer.lycra_checking_inspections i
            LEFT JOIN autoconer.lycra_checking_readings r
                ON i.id = r.inspection_id
            LEFT JOIN autoconer.lycra_checking_summary s
                ON i.id = s.inspection_id

            GROUP BY i.id, s.id
            ORDER BY i.created_at DESC
        `);

    res.status(200).json({
      count: result.rowCount,
      data: result.rows
    });

  } catch (err) {
    console.error("❌ Fetch Error:", err);

    res.status(500).json({
      message: "Server error"
    });
  }
});

/**
 * @swagger
 * /autoconer/count-wise-cuts:
 *   post:
 *     summary: Save Count Wise Cuts Record
 *     tags: [Autoconer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             inspection_type: "Count Wise Cuts Record"
 *             entry_date: "2026-03-05"
 *             machine_no: "MC-01"
 *             count_name: "40s Cotton"
 *             cone_tip: "Standard"
 *             lot_no: "LOT123"
 *             frame_no: "FR01"
 *             yf: 1
 *             yj: 2
 *             n: 3
 *             s: 4
 *             l: 5
 *     responses:
 *       201:
 *         description: Saved successfully
 *       500:
 *         description: Server error
 */

router.post('/count-wise-cuts', async (req, res) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const { drum_from, drum_to, ...data } = req.body;

    const columns = Object.keys(data);
    const values = Object.values(data);

    const placeholders = columns.map((_, i) => `$${i + 1}`);

    const query = `
            INSERT INTO autoconer.count_wise_cuts (${columns.join(',')})
            VALUES (${placeholders.join(',')})
            RETURNING *;
        `;

    const result = await client.query(query, values);

    res.status(201).json({
      message: "Saved successfully",
      data: result.rows[0]
    });

  } catch (err) {
    console.error("❌ Insert Error:", err);
    res.status(500).json({ message: "Save failed" });
  }
});

/**
 * @swagger
 * /autoconer/count-wise-cuts:
 *   get:
 *     summary: Get all Count Wise Cuts records
 *     tags: [Autoconer]
 *     responses:
 *       200:
 *         description: List of records
 */

router.get('/count-wise-cuts', async (req, res) => {
  try {
    const result = await client.query(
      `SELECT * FROM autoconer.count_wise_cuts ORDER BY id DESC`
    );

    res.json(result.rows);

  } catch (err) {
    console.error("❌ Fetch Error:", err);
    res.status(500).json({ message: "Fetch failed" });
  }
});

/**
 * @swagger
 * /autoconer/drum-wise:
 *   post:
 *     summary: Create a new drum-wise inspection
 *     tags: [Autoconer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - test_no
 *               - entry_date
 *               - type
 *               - drum_from
 *               - drum_to
 *               - drum_inspections
 *             properties:
 *               test_no:
 *                 type: integer
 *                 example: 1
 *               entry_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-04-04"
 *               type:
 *                 type: string
 *                 example: "Drum Inspection"
 *               drum_from:
 *                 type: integer
 *                 example: 1
 *               drum_to:
 *                 type: integer
 *                 example: 10
 *               remarks:
 *                 type: string
 *                 example: "Normal inspection"
 *               drum_inspections:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - drum_no
 *                     - appearance_ok
 *                   properties:
 *                     drum_no:
 *                       type: integer
 *                       example: 1
 *                     appearance_ok:
 *                       type: boolean
 *                       example: true
 *     responses:
 *       201:
 *         description: Drum-wise inspection created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Drum-wise inspection created successfully
 *                 drum_wise_id:
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
 *                   example: Drum inspections required
 *       500:
 *         description: Server error
 */
router.post('/drum-wise', async (req, res) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const {
      entry_id,
      test_no,
      entry_date,
      type,
      machine_code,
      count_name,
      drum_from,
      drum_to,
      remarks,
      drum_inspections
    } = req.body;

    if (!drum_inspections || !drum_inspections.length) {
      return res.status(400).json({ message: 'Drum inspections required' });
    }

    await client.query('BEGIN');

    // The form only ever has the machine/count CODE strings available (not the internal
    // autoconer.machine/count_master serial ids), so it also sends machine_code/count_name as
    // plain text — but this insert only ever wrote machine_id/count_id (which the form can't
    // correctly populate anyway, since Number("AC03") is NaN), leaving both permanently null and
    // "Auto Coner No."/"Count Name" always blank in Custom Report. Persist the plain-text columns
    // that drum_wise already has for exactly this purpose.
    const drumWiseResult = await client.query(
      `INSERT INTO autoconer.drum_wise
            (entry_id, test_no, entry_date, type, machine_code, count_name, drum_from, drum_to, remarks)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id`,
      [entry_id || null, test_no, entry_date, type, machine_code || null, count_name || null, drum_from, drum_to, remarks]
    );

    const drum_wise_id = drumWiseResult.rows[0].id;

    for (const inspection of drum_inspections) {
      await client.query(
        `INSERT INTO autoconer.drum_inspection
                (drum_wise_id, drum_no, appearance_ok)
                VALUES ($1, $2, $3)`,
        [drum_wise_id, inspection.drum_no, inspection.appearance_ok]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Drum-wise inspection created successfully',
      drum_wise_id
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating drum-wise inspection:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /autoconer/drum-wise:
 *   get:
 *     summary: Get all drum-wise inspections with pagination
 *     tags: [Autoconer]
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
 *         description: List of drum-wise inspections retrieved successfully
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
 *                         type: integer
 *                       test_no:
 *                         type: integer
 *                       entry_date:
 *                         type: string
 *                         format: date
 *                       type:
 *                         type: string
 *                       drum_from:
 *                         type: integer
 *                       drum_to:
 *                         type: integer
 *                       remarks:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       machine_code:
 *                         type: string
 *                       count_name:
 *                         type: string
 *                       drum_inspections:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             drum_no:
 *                               type: integer
 *                             appearance_ok:
 *                               type: boolean
 *                             appearance_ok_count:
 *                               type: integer
 *                             appearance_not_ok_count:
 *                               type: integer
 *       500:
 *         description: Server error
 */
router.get('/drum-wise', async (req, res) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // dw.machine_code/dw.count_name are the plain-text values the form actually sends and are now
    // actually persisted (see POST above) — prefer them, falling back to the machine_id/count_id
    // join only in case that ever gets populated by some other means.
    const dataQuery = `
            SELECT
                dw.id,
                dw.entry_id,
                dw.test_no,
                dw.entry_date,
                dw.type,
                dw.drum_from,
                dw.drum_to,
                dw.remarks,
                dw.created_at,
                COALESCE(dw.machine_code, m.machine_code) AS machine_code,
                COALESCE(dw.count_name, cm.count_name) AS count_name,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'drum_no', di.drum_no,
                            'appearance_ok', di.appearance_ok,
                            'appearance_ok_count', vds.appearance_ok,
                            'appearance_not_ok_count', vds.appearance_not_ok
                        ) ORDER BY di.id
                    ) FILTER (WHERE di.id IS NOT NULL),
                    '[]'
                ) AS drum_inspections
            FROM autoconer.drum_wise dw
            LEFT JOIN autoconer.machine m ON dw.machine_id = m.id
            LEFT JOIN autoconer.count_master cm ON dw.count_id = cm.id
            LEFT JOIN autoconer.drum_inspection di ON dw.id = di.drum_wise_id
            LEFT JOIN autoconer.v_drum_summary vds ON dw.id = vds.drum_wise_id AND di.drum_no = vds.drum_no
            GROUP BY dw.id, m.machine_code, cm.count_name
            ORDER BY dw.entry_date DESC, dw.created_at DESC
            LIMIT $1 OFFSET $2
        `;

    const countQuery = `SELECT COUNT(*) FROM autoconer.drum_wise`;

    const dataResult = await client.query(dataQuery, [limit, offset]);
    const countResult = await client.query(countQuery);

    const total = parseInt(countResult.rows[0].count);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: dataResult.rows
    });

  } catch (err) {
    console.error('Error fetching drum-wise inspections:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

/**
 * @swagger
 * /autoconer/splice-strength:
 *   post:
 *     summary: Create a new inspection with drum readings
 *     tags: [Autoconer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - test_no
 *               - inspection_date
 *               - drum_readings
 *             properties:
 *               type:
 *                 type: string
 *                 example: "Splice Strength Test"
 *               test_no:
 *                 type: integer
 *                 example: 1
 *               inspection_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-04-04"
 *               count_name:
 *                 type: string
 *                 example: "Cotton 20s"
 *               auto_coner_no:
 *                 type: string
 *                 example: "AC-01"
 *               drum_from:
 *                 type: integer
 *                 example: 1
 *               drum_to:
 *                 type: integer
 *                 example: 10
 *               cone_tip:
 *                 type: string
 *                 example: "Standard"
 *               csp_value:
 *                 type: number
 *                 example: 150.00
 *               average:
 *                 type: number
 *                 example: 12.3456
 *               drum_readings:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - drum_no
 *                     - reading_number
 *                     - splice_strength
 *                     - parent_yarn
 *                     - percent_yarn
 *                   properties:
 *                     drum_no:
 *                       type: integer
 *                       example: 1
 *                     reading_number:
 *                       type: integer
 *                       example: 1
 *                     splice_strength:
 *                       type: number
 *                       example: 10.5
 *                     parent_yarn:
 *                       type: number
 *                       example: 15.2
 *                     percent_yarn:
 *                       type: number
 *                       example: 8.3
 *     responses:
 *       201:
 *         description: Inspection created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Inspection created successfully
 *                 inspection_id:
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
 *                   example: Drum readings required
 *       500:
 *         description: Server error
 */
router.post('/splice-strength', async (req, res) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const {
      entry_id,
      type,
      test_no,
      inspection_date,
      count_name,
      auto_coner_no,
      drum_from,
      drum_to,
      cone_tip,
      csp_value,
      average,
      drum_readings
    } = req.body;

    if (!drum_readings || !drum_readings.length) {
      return res.status(400).json({ message: 'Drum readings required' });
    }

    const parsedTestNo = Number(test_no);
    if (test_no === undefined || test_no === null || test_no === '' || !Number.isFinite(parsedTestNo)) {
      return res.status(400).json({ message: 'Test No must be a number' });
    }

    await client.query('BEGIN');

    const inspectionResult = await client.query(
      `INSERT INTO autoconer.inspections
            (entry_id, type, test_no, inspection_date, count_name, auto_coner_no, drum_from, drum_to, cone_tip, csp_value, average)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id`,
      [entry_id || null, type, parsedTestNo, inspection_date, count_name, auto_coner_no, drum_from, drum_to, cone_tip, csp_value, average]
    );

    const inspection_id = inspectionResult.rows[0].id;

    for (const reading of drum_readings) {
      await client.query(
        `INSERT INTO autoconer.drum_readings
                (inspection_id, drum_no, reading_number, splice_strength, parent_yarn, percent_yarn)
                VALUES ($1, $2, $3, $4, $5, $6)`,
        [inspection_id, reading.drum_no, reading.reading_number, reading.splice_strength, reading.parent_yarn, reading.percent_yarn]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Inspection created successfully',
      inspection_id
    });

  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    console.error('Error creating inspection:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/**
 * @swagger
 * /autoconer/splice-strength:
 *   get:
 *     summary: Get all inspections with pagination
 *     tags: [Autoconer]
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
 *         description: List of inspections retrieved successfully
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
 *                         type: integer
 *                       type:
 *                         type: string
 *                       test_no:
 *                         type: integer
 *                       inspection_date:
 *                         type: string
 *                         format: date
 *                       count_name:
 *                         type: string
 *                       auto_coner_no:
 *                         type: string
 *                       drum_from:
 *                         type: integer
 *                       drum_to:
 *                         type: integer
 *                       cone_tip:
 *                         type: string
 *                       csp_value:
 *                         type: number
 *                       average:
 *                         type: number
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       avg_splice_strength:
 *                         type: number
 *                       avg_parent_yarn:
 *                         type: number
 *                       avg_percent_yarn:
 *                         type: number
 *                       total_readings:
 *                         type: integer
 *                       drum_readings:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             drum_no:
 *                               type: integer
 *                             reading_number:
 *                               type: integer
 *                             splice_strength:
 *                               type: number
 *                             parent_yarn:
 *                               type: number
 *                             percent_yarn:
 *                               type: number
 *       500:
 *         description: Server error
 */
router.get('/splice-strength', async (req, res) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const dataQuery = `
            SELECT
                i.*,
                s.avg_splice_strength,
                s.avg_parent_yarn,
                s.avg_percent_yarn,
                s.total_readings,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'drum_no', d.drum_no,
                            'reading_number', d.reading_number,
                            'splice_strength', d.splice_strength,
                            'parent_yarn', d.parent_yarn,
                            'percent_yarn', d.percent_yarn
                        ) ORDER BY d.id
                    ) FILTER (WHERE d.id IS NOT NULL),
                    '[]'
                ) AS drum_readings
            FROM autoconer.inspections i
            LEFT JOIN autoconer.inspection_summary s ON i.id = s.id
            LEFT JOIN autoconer.drum_readings d ON i.id = d.inspection_id
            GROUP BY i.id, s.avg_splice_strength, s.avg_parent_yarn, s.avg_percent_yarn, s.total_readings
            ORDER BY i.inspection_date DESC, i.created_at DESC
            LIMIT $1 OFFSET $2
        `;

    const countQuery = `SELECT COUNT(*) FROM autoconer.inspections`;

    const dataResult = await client.query(dataQuery, [limit, offset]);
    const countResult = await client.query(countQuery);

    const total = parseInt(countResult.rows[0].count);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: dataResult.rows
    });

  } catch (err) {
    console.error('Error fetching inspections:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /autoconer/inspection-data-entry:
 *   post:
 *     summary: Create a new inspection data entry with readings
 *     tags: [Autoconer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entry_id
 *               - entry_date
 *               - count_name
 *               - actual_count
 *               - auto_coner_no
 *               - cone_tip
 *               - readings
 *             properties:
 *               entry_id:
 *                 type: string
 *                 example: "ARW-0002"
 *               entry_date:
 *                 type: string
 *                 format: date
 *               type:
 *                 type: string
 *                 example: "Rewinding Study"
 *               count_name:
 *                 type: string
 *               actual_count:
 *                 type: number
 *               auto_coner_no:
 *                 type: string
 *               cone_tip:
 *                 type: string
 *               no_of_cuts:
 *                 type: integer
 *               break_per_million_meter:
 *                 type: number
 *               remarks:
 *                 type: string
 *               readings:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Inspection data entry created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post('/inspection-data-entry', async (req, res) => {
  try {
    const {
      entry_id,
      entry_date,
      type,
      count_name,
      actual_count,
      auto_coner_no,
      cone_tip,
      no_of_cuts,
      break_per_million_meter,
      remarks,
      readings
    } = req.body;

    if (!entry_id || !entry_date || !count_name || actual_count == null || !auto_coner_no || !cone_tip) {
      return res.status(400).json({ message: 'Required fields missing' });
    }
    if (!readings || !readings.length) {
      return res.status(400).json({ message: 'Readings required' });
    }

    await client.query('BEGIN');
    const headerResult = await client.query(
      `INSERT INTO autoconer.inspection_data_entry
        (entry_id, entry_date, type, count_name, actual_count, auto_coner_no, cone_tip, no_of_cuts, break_per_million_meter, remarks)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id`,
      [entry_id, entry_date, type || 'Rewinding Study', count_name, actual_count, auto_coner_no, cone_tip, no_of_cuts ?? 0, break_per_million_meter ?? 0, remarks]
    );

    const inspection_data_entry_id = headerResult.rows[0].id;
    for (const reading of readings) {
      await client.query(
        `INSERT INTO autoconer.inspection_data_entry_readings
          (inspection_data_entry_id, drum_no, no_of_cones, fault_name, no_of_faults, percent_fault, weight, length_meters)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [inspection_data_entry_id, reading.drum_no, reading.no_of_cones, reading.fault_name, reading.no_of_faults, reading.percent_fault, reading.weight, reading.length_meters]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ message: 'Inspection data entry created successfully', inspection_data_entry_id, entry_id });
  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    console.error('Error creating inspection data entry:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /autoconer/inspection-data-entry:
 *   get:
 *     summary: Get all inspection data entries with pagination
 *     tags: [Autoconer]
 */
router.get('/inspection-data-entry', async (req, res) => {
  try {
    await ensureRewindingStudyTables();
    await ensureAutoconerEntryIdColumns();
    const fetchAll = String(req.query.all || '').toLowerCase() === 'true';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const dataQueryBase = `
      SELECT
        ide.*,
        COALESCE(
          json_agg(
            json_build_object(
              'drum_no', r.drum_no,
              'no_of_cones', r.no_of_cones,
              'fault_name', r.fault_name,
              'no_of_faults', r.no_of_faults,
              'percent_fault', r.percent_fault,
              'weight', r.weight,
              'length_meters', r.length_meters
            ) ORDER BY r.id
          ) FILTER (WHERE r.id IS NOT NULL),
          '[]'
        ) AS readings
      FROM autoconer.inspection_data_entry ide
      LEFT JOIN autoconer.inspection_data_entry_readings r ON ide.id = r.inspection_data_entry_id
      GROUP BY ide.id
      ORDER BY ide.entry_date DESC, ide.created_at DESC
    `;
    const dataQuery = fetchAll ? dataQueryBase : `${dataQueryBase} LIMIT $1 OFFSET $2`;
    const countQuery = `SELECT COUNT(*) FROM autoconer.inspection_data_entry`;
    const dataResult = fetchAll ? await client.query(dataQuery) : await client.query(dataQuery, [limit, offset]);
    const countResult = await client.query(countQuery);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      page: fetchAll ? 1 : page,
      limit: fetchAll ? total : limit,
      total,
      totalPages: fetchAll ? 1 : Math.ceil(total / limit),
      data: dataResult.rows.map((row) => ({
        ...row,
        drum_inspections: row.readings,
        readings: row.readings
      }))
    });
  } catch (err) {
    console.error('Error fetching inspection data entries:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/rewinding-study/:id', async (req, res) => {
  try {
    await ensureRewindingStudyTables();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: 'id must be numeric' });
    }

    const studyResult = await client.query(
      `SELECT * FROM autoconer.rewinding_study WHERE id = $1`,
      [id]
    );
    if (!studyResult.rows.length) {
      return res.status(404).json({ message: 'Rewinding study not found' });
    }

    const inspectionResult = await client.query(
      `SELECT *
       FROM autoconer.rewinding_study_inspections
       WHERE rewinding_study_id = $1
       ORDER BY reading_number ASC, id ASC`,
      [id]
    );

    return res.json({
      success: true,
      data: {
        ...studyResult.rows[0],
        drum_inspections: inspectionResult.rows.map(mapRewindingRow),
        readings: inspectionResult.rows.map(mapRewindingRow)
      }
    });
  } catch (err) {
    console.error('Error fetching rewinding study by id:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /autoconer/cone-density:
 *   post:
 *     summary: Create a new cone density record with readings
 *     tags: [Autoconer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - test_no
 *               - entry_date
 *               - drum_from
 *               - drum_to
 *               - cone_readings
 *             properties:
 *               test_no:
 *                 type: integer
 *                 example: 1
 *               entry_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-04-04"
 *               type:
 *                 type: string
 *                 example: "Cone Density"
 *               machine_name:
 *                 type: string
 *                 example: "AC01"
 *               count_name:
 *                 type: string
 *                 example: "Cotton 20s"
 *               cone_tip:
 *                 type: string
 *                 example: "Red"
 *               base_dia_e:
 *                 type: number
 *                 example: 12.50
 *               nose_dia_e:
 *                 type: number
 *                 example: 8.25
 *               drum_from:
 *                 type: integer
 *                 example: 1
 *               drum_to:
 *                 type: integer
 *                 example: 10
 *               weight:
 *                 type: number
 *                 example: 250.50
 *               no_of_cuts:
 *                 type: integer
 *                 example: 5
 *               remarks:
 *                 type: string
 *                 example: "Normal"
 *               cone_readings:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - drum_no
 *                     - short_cut
 *                     - short_name
 *                   properties:
 *                     drum_no:
 *                       type: integer
 *                       example: 1
 *                     reading_number:
 *                       type: integer
 *                       example: 1
 *                     short_cut:
 *                       type: string
 *                       example: "L"
 *                     short_name:
 *                       type: string
 *                       example: "B1"
 *                     fault_percent:
 *                       type: number
 *                       example: 0.50
 *                     length_mm:
 *                       type: number
 *                       example: 120.25
 *                     weight:
 *                       type: number
 *                       example: 8.50
 *                     break_per_meter:
 *                       type: number
 *                       example: 0.1234
 *                     density:
 *                       type: number
 *                       example: 1.234
 *                     hardness:
 *                       type: number
 *                       example: 5.678
 *     responses:
 *       201:
 *         description: Cone density record created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Cone density record created successfully
 *                 cone_density_id:
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
 *                   example: Cone readings required
 *       500:
 *         description: Server error
 */
router.post('/cone-density', async (req, res) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const {
      entry_id,
      test_no,
      entry_date,
      type,
      machine_name,
      count_name,
      cone_tip,
      base_dia_e,
      nose_dia_e,
      drum_from,
      drum_to,
      weight,
      no_of_cuts,
      remarks,
      cone_readings
    } = req.body;

    if (!cone_readings || !cone_readings.length) {
      return res.status(400).json({ message: 'Cone readings required' });
    }

    await client.query('BEGIN');

    const coneDensityResult = await client.query(
      `INSERT INTO autoconer.cone_density
            (entry_id, test_no, entry_date, type, machine_name, count_name, cone_tip, base_dia_e, nose_dia_e, drum_from, drum_to, weight, no_of_cuts, remarks)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            RETURNING id`,
      [entry_id || null, test_no, entry_date, type, machine_name, count_name, cone_tip, base_dia_e, nose_dia_e, drum_from, drum_to, weight, no_of_cuts, remarks]
    );

    const cone_density_id = coneDensityResult.rows[0].id;

    for (const reading of cone_readings) {
      await client.query(
        `INSERT INTO autoconer.cone_density_readings
                (cone_density_id, drum_no, base_dia_e, nose_dia_e, base_dia, nose_dia, cone_weight, cone_traverse, density, hardness)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          cone_density_id,
          reading.drum_no,
          reading.base_dia_e,
          reading.nose_dia_e,
          reading.base_dia,
          reading.nose_dia,
          reading.weight,
          reading.cone_traverse,
          reading.density,
          reading.hardness
        ]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Cone density record created successfully',
      cone_density_id
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating cone density record:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /autoconer/cone-density:
 *   get:
 *     summary: Get all cone density records with pagination
 *     tags: [Autoconer]
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
 *         description: List of cone density records retrieved successfully
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
 *                         type: integer
 *                       test_no:
 *                         type: integer
 *                       entry_date:
 *                         type: string
 *                         format: date
 *                       type:
 *                         type: string
 *                       machine_name:
 *                         type: string
 *                       count_name:
 *                         type: string
 *                       cone_tip:
 *                         type: string
 *                       base_dia_e:
 *                         type: number
 *                       nose_dia_e:
 *                         type: number
 *                       drum_from:
 *                         type: integer
 *                       drum_to:
 *                         type: integer
 *                       weight:
 *                         type: number
 *                       no_of_cuts:
 *                         type: integer
 *                       remarks:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       readings:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             drum_no:
 *                               type: integer
 *                             base_dia_e:
 *                               type: number
 *                             nose_dia_e:
 *                               type: number
 *                             base_dia:
 *                               type: number
 *                             nose_dia:
 *                               type: number
 *                             cone_weight:
 *                               type: number
 *                             cone_traverse:
 *                               type: number
 *                             density:
 *                               type: number
 *                             hardness:
 *                               type: number
 *       500:
 *         description: Server error
 */
router.get('/cone-density', async (req, res) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const fetchAll = String(req.query.all || '').toLowerCase() === 'true';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const dataQueryBase = `
            SELECT
                cd.*,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'drum_no', cdr.drum_no,
                            'base_dia_e', cdr.base_dia_e,
                            'nose_dia_e', cdr.nose_dia_e,
                            'base_dia', cdr.base_dia,
                            'nose_dia', cdr.nose_dia,
                            'cone_weight', cdr.cone_weight,
                            'cone_traverse', cdr.cone_traverse,
                            'density', cdr.density,
                            'hardness', cdr.hardness
                        ) ORDER BY cdr.id
                    ) FILTER (WHERE cdr.id IS NOT NULL),
                    '[]'
                ) AS readings
            FROM autoconer.cone_density cd
            LEFT JOIN autoconer.cone_density_readings cdr ON cd.id = cdr.cone_density_id
            GROUP BY cd.id
            ORDER BY cd.entry_date DESC, cd.created_at DESC
        `;
    const dataQuery = fetchAll ? dataQueryBase : `${dataQueryBase} LIMIT $1 OFFSET $2`;

    const countQuery = `SELECT COUNT(*) FROM autoconer.cone_density`;

    const dataResult = fetchAll
      ? await client.query(dataQuery)
      : await client.query(dataQuery, [limit, offset]);
    const countResult = await client.query(countQuery);

    const total = parseInt(countResult.rows[0].count);

    res.json({
      page: fetchAll ? 1 : page,
      limit: fetchAll ? total : limit,
      total,
      totalPages: fetchAll ? 1 : Math.ceil(total / limit),
      data: dataResult.rows
    });

  } catch (err) {
    console.error('Error fetching cone density records:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /autoconer/inspection-data-entry/master-data:
 *   get:
 *     summary: Get Count Name and Autoconer No options for Inspection Data Entry
 *     tags: [Autoconer]
 *     responses:
 *       200:
 *         description: Master data fetched successfully
 *       500:
 *         description: Server error
 */
router.get('/inspection-data-entry/master-data', async (req, res) => {
  try {
    const payload = await fetchAutoconerMasterData(req.query);
    res.json(payload);
  } catch (err) {
    console.error('Error fetching inspection data entry master data:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /autoconer/cone-density/master-data:
 *   get:
 *     summary: Get Count Name and Autoconer No options for Cone Density
 *     tags: [Autoconer]
 *     responses:
 *       200:
 *         description: Master data fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count_names:
 *                   type: array
 *                   items:
 *                     type: string
 *                 autoconer_nos:
 *                   type: array
 *                   items:
 *                     type: string
 *       500:
 *         description: Server error
 */
const fetchAutoconerMasterData = async (query = {}) => {
  if (sqlServer.hasSqlServerEnv()) {
    const [countResult, machineResult] = await Promise.all([
      fetchCountMaster(String(query.count_prefix || query.prefix || '').trim()),
      sqlServer.query(`
        SELECT DISTINCT
          REPLACE(LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))), ' ', '') AS autoconer_no
        FROM dbo.MCMASTER m
        JOIN dbo.dept_mai d ON m.DEPTCODE = d.DEPTCODE
        WHERE m.compcode = '1'
          AND (
            LOWER(LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255))))) LIKE '%autoconer%'
            OR LOWER(LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255))))) LIKE '%autocone%'
          )
          AND LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) <> ''
        ORDER BY autoconer_no
      `)
    ]);

    const countOptions = countResult;

    const autoconerOptions = (machineResult.recordset || [])
      .map((row) => {
        const value = row.autoconer_no ? String(row.autoconer_no).trim() : null;
        return value ? { value, label: value } : null;
      })
      .filter(Boolean);

    const consigneeOptions = await fetchAutoconerConsigneeOptions();

    return {
      source: 'sqlserver',
      count_options: countOptions,
      autoconer_options: autoconerOptions,
      consignee_options: consigneeOptions,
      count_names: countOptions.map((row) => row.cntname),
      autoconer_nos: autoconerOptions.map((row) => row.value),
      consignee_names: consigneeOptions.map((row) => row.value),
      options: {
        count_name: countOptions.map((row) => ({
          text: row.cntname,
          label: row.cntname,
          value: row.cntname,
          cntcode: row.cntcode
        })),
        autoconer_no: autoconerOptions,
        consignee_name: consigneeOptions
      }
    };
  }

  const countNameQuery = `
    SELECT count_name
    FROM autoconer.count_master
    WHERE count_name IS NOT NULL AND BTRIM(count_name) <> ''
    ORDER BY count_name
  `;

  const autoconerNoQuery = `
    SELECT DISTINCT autoconer_no
    FROM (
      SELECT machine_no AS autoconer_no
      FROM autoconer.autoconer_process_parameter
      WHERE machine_no IS NOT NULL AND BTRIM(machine_no) <> ''
      UNION
      SELECT machine_name AS autoconer_no
      FROM autoconer.cone_density
      WHERE machine_name IS NOT NULL AND BTRIM(machine_name) <> ''
    ) t
    ORDER BY autoconer_no
  `;

  const [countNameResult, autoconerNoResult, consigneeOptions] = await Promise.all([
    client.query(countNameQuery),
    client.query(autoconerNoQuery),
    fetchAutoconerConsigneeOptions()
  ]);

  const countOptions = countNameResult.rows
    .map((row) => {
      const cntname = row.count_name ? String(row.count_name).trim() : null;
      return cntname ? { cntcode: cntname, cntname } : null;
    })
    .filter(Boolean);

  const autoconerOptions = autoconerNoResult.rows
    .map((row) => {
      const value = row.autoconer_no ? String(row.autoconer_no).trim() : null;
      return value ? { value, label: value } : null;
    })
    .filter(Boolean);

  return {
    source: 'postgres',
    count_options: countOptions,
    autoconer_options: autoconerOptions,
    consignee_options: consigneeOptions,
    count_names: countOptions.map((row) => row.cntname),
    autoconer_nos: autoconerOptions.map((row) => row.value),
    consignee_names: consigneeOptions.map((row) => row.value),
    options: {
      count_name: countOptions.map((row) => ({
        text: row.cntname,
        label: row.cntname,
        value: row.cntname,
        cntcode: row.cntcode
      })),
      autoconer_no: autoconerOptions,
      consignee_name: consigneeOptions
    }
  };
};

router.get('/cone-density/master-data', async (req, res) => {
  try {
    const payload = await fetchAutoconerMasterData(req.query);
    res.json(payload);
  } catch (err) {
    console.error('Error fetching cone density master data:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Legacy alias for clients that use "conedensity" as one word.
router.get('/conedensity/master-data', async (req, res) => {
  try {
    const payload = await fetchAutoconerMasterData(req.query);
    res.json(payload);
  } catch (err) {
    console.error('Error fetching cone density master data:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Cone Density's actual notebook screen (frontend/src/views/autoconer/ConeDensity.jsx) submits to
// and fetches from /cone-density-notebook — not /cone-density above, which is a separate, older
// table (autoconer.cone_density/cone_density_readings) with almost no real data. This route never
// existed at all, so every Cone Density submission from the real form has been failing outright,
// and Custom Report's fetch for this screen returned nothing. autoconer.cone_density_notebook and
// cone_density_notebook_drums already exist with the right columns (created for this purpose
// earlier) — just needed the routes wired up.
router.post('/cone-density-notebook', async (req, res) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const {
      entry_id,
      entry_date,
      type,
      count_name,
      cntcode,
      auto_coner_no,
      drum_from,
      drum_to,
      cone_tip,
      remarks,
      drums
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }
    if (!drums || !drums.length) {
      return res.status(400).json({ message: 'Drum readings required' });
    }

    await client.query('BEGIN');

    const headerResult = await client.query(
      `INSERT INTO autoconer.cone_density_notebook
        (entry_id, entry_date, type, count_name, cntcode, auto_coner_no, drum_from, drum_to, cone_tip, remarks)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id`,
      [entry_id, entry_date, type || 'Cone Density', count_name, cntcode || null, auto_coner_no, drum_from, drum_to, cone_tip, remarks || null]
    );
    const notebook_id = headerResult.rows[0].id;

    for (const drum of drums) {
      await client.query(
        `INSERT INTO autoconer.cone_density_notebook_drums
          (notebook_id, drum_no, base_dia_e_d1, nose_dia_e_d2, base_dia_i_d3, nose_dia_i_d4,
           slant_height_b1, vertical_height_b2, cone_weight_gms, volume_cm3, density_gms_cm3,
           gms_litre, winding_speed_m_min, cn_tension, tensioner_rpm, tensioner_force,
           n_cradle_pressure, remarks)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          notebook_id,
          drum.drum_no,
          drum.base_dia_e_d1,
          drum.nose_dia_e_d2,
          drum.base_dia_i_d3,
          drum.nose_dia_i_d4,
          drum.slant_height_b1,
          drum.vertical_height_b2,
          drum.cone_weight_gms,
          drum.volume_cm3,
          drum.density_gms_cm3,
          drum.gms_litre,
          drum.winding_speed_m_min,
          drum.cn_tension,
          drum.tensioner_rpm,
          drum.tensioner_force,
          drum.n_cradle_pressure,
          drum.remarks || null
        ]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Cone density record created successfully', notebook_id, entry_id });
  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    console.error('Error creating cone density notebook record:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/cone-density-notebook', async (req, res) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const fetchAll = String(req.query.all || '').toLowerCase() === 'true';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const dataQueryBase = `
      SELECT
        cdn.*,
        COALESCE(
          json_agg(
            json_build_object(
              'drum_no', cdnd.drum_no,
              'base_dia_e_d1', cdnd.base_dia_e_d1,
              'nose_dia_e_d2', cdnd.nose_dia_e_d2,
              'base_dia_i_d3', cdnd.base_dia_i_d3,
              'nose_dia_i_d4', cdnd.nose_dia_i_d4,
              'slant_height_b1', cdnd.slant_height_b1,
              'vertical_height_b2', cdnd.vertical_height_b2,
              'cone_weight_gms', cdnd.cone_weight_gms,
              'volume_cm3', cdnd.volume_cm3,
              'density_gms_cm3', cdnd.density_gms_cm3,
              'gms_litre', cdnd.gms_litre,
              'winding_speed_m_min', cdnd.winding_speed_m_min,
              'cn_tension', cdnd.cn_tension,
              'tensioner_rpm', cdnd.tensioner_rpm,
              'tensioner_force', cdnd.tensioner_force,
              'n_cradle_pressure', cdnd.n_cradle_pressure,
              'remarks', cdnd.remarks
            ) ORDER BY cdnd.id
          ) FILTER (WHERE cdnd.id IS NOT NULL),
          '[]'
        ) AS drums
      FROM autoconer.cone_density_notebook cdn
      LEFT JOIN autoconer.cone_density_notebook_drums cdnd ON cdn.id = cdnd.notebook_id
      GROUP BY cdn.id
      ORDER BY cdn.entry_date DESC, cdn.created_at DESC
    `;
    const dataQuery = fetchAll ? dataQueryBase : `${dataQueryBase} LIMIT $1 OFFSET $2`;
    const countQuery = `SELECT COUNT(*) FROM autoconer.cone_density_notebook`;

    const dataResult = fetchAll ? await client.query(dataQuery) : await client.query(dataQuery, [limit, offset]);
    const countResult = await client.query(countQuery);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      page: fetchAll ? 1 : page,
      limit: fetchAll ? total : limit,
      total,
      totalPages: fetchAll ? 1 : Math.ceil(total / limit),
      data: dataResult.rows
    });
  } catch (err) {
    console.error('Error fetching cone density notebook records:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Shared master-data endpoint for screens needing Count Name + Autoconer No.
router.get('/master-data', async (req, res) => {
  try {
    const payload = await fetchAutoconerMasterData(req.query);
    res.json(payload);
  } catch (err) {
    console.error('Error fetching autoconer master data:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/master/counts', getCountMasterDropdown);
router.get('/master/count-dropdown', getCountMasterDropdown);
router.get('/master/count-names', getCountMasterDropdown);
router.get('/master/dropdown', sendAutoconerMasterData);
router.get('/count-master', getCountMasterDropdown);
router.get('/master/machines', sendAutoconerMachineDropdown);
router.get('/master/machine-names', sendAutoconerMachineDropdown);
router.get('/master/mc-names', sendAutoconerMachineDropdown);
router.get('/master/mc-nos', sendAutoconerMachineDropdown);
router.get('/master/autoconer-nos', sendAutoconerMachineDropdown);
router.get('/master/autoconer-numbers', sendAutoconerMachineDropdown);
router.get('/master/auto-coner-nos', sendAutoconerMachineDropdown);
router.get('/master/auto-coner-numbers', sendAutoconerMachineDropdown);
router.get('/master/employees', getEmployeeMasterDropdown);
router.get('/master/employee-dropdown', getEmployeeMasterDropdown);
router.get('/master/employee-names', getEmployeeMasterDropdown);
router.get('/master/user-names', getEmployeeMasterDropdown);
router.get('/master/operator-names', getEmployeeMasterDropdown);
router.get('/master/consignees', sendAutoconerConsigneeDropdown);
router.get('/master/consignee-names', sendAutoconerConsigneeDropdown);
router.get('/master/consignee-dropdown', sendAutoconerConsigneeDropdown);
router.get('/employee-master', getEmployeeMasterDropdown);

for (const screenSlug of AUTOCONER_SCREEN_SLUGS) {
  router.get(`/${screenSlug}/master-data`, sendAutoconerMasterData);
  router.get(`/${screenSlug}/master/dropdown`, sendAutoconerMasterData);
  router.get(`/${screenSlug}/master/counts`, getCountMasterDropdown);
  router.get(`/${screenSlug}/master/count-dropdown`, getCountMasterDropdown);
  router.get(`/${screenSlug}/master/count-names`, getCountMasterDropdown);
  router.get(`/${screenSlug}/master/machines`, sendAutoconerMachineDropdown);
  router.get(`/${screenSlug}/master/machine-names`, sendAutoconerMachineDropdown);
  router.get(`/${screenSlug}/master/mc-names`, sendAutoconerMachineDropdown);
  router.get(`/${screenSlug}/master/mc-nos`, sendAutoconerMachineDropdown);
  router.get(`/${screenSlug}/master/autoconer-nos`, sendAutoconerMachineDropdown);
  router.get(`/${screenSlug}/master/autoconer-numbers`, sendAutoconerMachineDropdown);
  router.get(`/${screenSlug}/master/auto-coner-nos`, sendAutoconerMachineDropdown);
  router.get(`/${screenSlug}/master/auto-coner-numbers`, sendAutoconerMachineDropdown);
  router.get(`/${screenSlug}/master/employees`, getEmployeeMasterDropdown);
  router.get(`/${screenSlug}/master/employee-dropdown`, getEmployeeMasterDropdown);
  router.get(`/${screenSlug}/master/employee-names`, getEmployeeMasterDropdown);
  router.get(`/${screenSlug}/master/user-names`, getEmployeeMasterDropdown);
  router.get(`/${screenSlug}/master/operator-names`, getEmployeeMasterDropdown);
  router.get(`/${screenSlug}/master/consignees`, sendAutoconerConsigneeDropdown);
  router.get(`/${screenSlug}/master/consignee-names`, sendAutoconerConsigneeDropdown);
  router.get(`/${screenSlug}/master/consignee-dropdown`, sendAutoconerConsigneeDropdown);
}

// Screen-specific aliases for client integration convenience.
router.get('/splice-strength/master-data', async (req, res) => {
  try {
    const payload = await fetchAutoconerMasterData(req.query);
    res.json(payload);
  } catch (err) {
    console.error('Error fetching splice strength master data:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/drum-wise/master-data', async (req, res) => {
  try {
    const payload = await fetchAutoconerMasterData(req.query);
    res.json(payload);
  } catch (err) {
    console.error('Error fetching drum-wise master data:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/count-wise-cuts/master-data', async (req, res) => {
  try {
    const payload = await fetchAutoconerMasterData(req.query);
    res.json(payload);
  } catch (err) {
    console.error('Error fetching count-wise-cuts master data:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/lycra-checking/master-data', async (req, res) => {
  try {
    const payload = await fetchAutoconerMasterData(req.query);
    res.json(payload);
  } catch (err) {
    console.error('Error fetching lycra checking master data:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/cone-packing-audit/master-data', async (req, res) => {
  try {
    const payload = await fetchAutoconerMasterData(req.query);
    res.json(payload);
  } catch (err) {
    console.error('Error fetching cone packing audit master data:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/process-parameter/master-data', async (req, res) => {
  try {
    const payload = await fetchAutoconerMasterData(req.query);
    res.json(payload);
  } catch (err) {
    console.error('Error fetching autoconer process parameter master data:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/process_parameter/master-data', async (req, res) => {
  try {
    const payload = await fetchAutoconerMasterData(req.query);
    res.json(payload);
  } catch (err) {
    console.error('Error fetching autoconer process parameter master data:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/q2/master-data', async (req, res) => {
  try {
    const payload = await fetchAutoconerMasterData(req.query);
    res.json(payload);
  } catch (err) {
    console.error('Error fetching autoconer Q2 master data:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
router.get('/q2/master/consignees', sendAutoconerConsigneeDropdown);
router.get('/q2/master/consignee-names', sendAutoconerConsigneeDropdown);
router.get('/q2/master/consignee-dropdown', sendAutoconerConsigneeDropdown);

router.get('/q3/master-data', async (req, res) => {
  try {
    const payload = await fetchAutoconerMasterData(req.query);
    res.json(payload);
  } catch (err) {
    console.error('Error fetching autoconer Q3 master data:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
router.get('/q3/master/consignees', sendAutoconerConsigneeDropdown);
router.get('/q3/master/consignee-names', sendAutoconerConsigneeDropdown);
router.get('/q3/master/consignee-dropdown', sendAutoconerConsigneeDropdown);

router.get('/q4/master-data', async (req, res) => {
  try {
    const payload = await fetchAutoconerMasterData(req.query);
    res.json(payload);
  } catch (err) {
    console.error('Error fetching autoconer Q4 master data:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
router.get('/q4/master/consignees', sendAutoconerConsigneeDropdown);
router.get('/q4/master/consignee-names', sendAutoconerConsigneeDropdown);
router.get('/q4/master/consignee-dropdown', sendAutoconerConsigneeDropdown);

/**
 * @swagger
 * /autoconer/cone-packing-audit:
 *   post:
 *     summary: Create a new cone packing audit
 *     tags: [Autoconer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inspection_date
 *               - packed_date
 *               - cone_readings
 *               - drum_entries
 *             properties:
 *               inspection_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-04-04"
 *               packed_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-04-05"
 *               count_name:
 *                 type: string
 *                 example: "Cotton 20s"
 *               gross_weight_std:
 *                 type: number
 *                 example: 250.00
 *               gross_weight_actual:
 *                 type: number
 *                 example: 248.75
 *               box_colour:
 *                 type: string
 *                 example: "White"
 *               cone_colour:
 *                 type: string
 *                 example: "Blue"
 *               gum_tape_colour:
 *                 type: string
 *                 example: "Red"
 *               count_label:
 *                 type: boolean
 *                 example: true
 *               cone_damage:
 *                 type: boolean
 *                 example: false
 *               cover_missing:
 *                 type: boolean
 *                 example: false
 *               cone_hardness:
 *                 type: boolean
 *                 example: true
 *               stap_cone:
 *                 type: boolean
 *                 example: false
 *               disk:
 *                 type: boolean
 *                 example: false
 *               barcode:
 *                 type: boolean
 *                 example: true
 *               center_pad:
 *                 type: string
 *                 example: "Yes"
 *               net_weight:
 *                 type: number
 *                 example: 240.50
 *               tare_weight:
 *                 type: number
 *                 example: 2.50
 *               strap_colour:
 *                 type: string
 *                 example: "Black"
 *               drum_entries:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - drum_no
 *                     - gross_weight
 *                     - average
 *                   properties:
 *                     drum_no:
 *                       type: integer
 *                       example: 1
 *                     gross_weight:
 *                       type: number
 *                       example: 10.25
 *                     average:
 *                       type: number
 *                       example: 10.00
 *               cone_readings:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - reading_number
 *                     - percent_yarn
 *                   properties:
 *                     reading_number:
 *                       type: integer
 *                       example: 1
 *                     percent_yarn:
 *                       type: number
 *                       example: 99.50
 *     responses:
 *       201:
 *         description: Cone packing audit created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Cone packing audit created successfully
 *                 audit_id:
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
 *                   example: Drum entries and cone readings required
 *       500:
 *         description: Server error
 */
router.post('/cone-packing-audit', async (req, res) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const {
      entry_id,
      inspection_date,
      packed_date,
      count_name,
      gross_weight_std,
      gross_weight_actual,
      box_colour,
      cone_colour,
      gum_tape_colour,
      count_label,
      cone_damage,
      cover_missing,
      cone_hardness,
      stap_cone,
      disk,
      barcode,
      center_pad,
      net_weight,
      tare_weight,
      strap_colour,
      drum_entries,
      cone_readings
    } = req.body;

    if (!drum_entries || !drum_entries.length || !cone_readings || !cone_readings.length) {
      return res.status(400).json({ message: 'Drum entries and cone readings required' });
    }

    await client.query('BEGIN');

    const auditResult = await client.query(
      `INSERT INTO autoconer.cone_packing_audit
            (entry_id, inspection_date, packed_date, count_name, gross_weight_std, gross_weight_actual,
             box_colour, cone_colour, gum_tape_colour, count_label, cone_damage,
             cover_missing, cone_hardness, stap_cone, disk, barcode, center_pad,
             net_weight, tare_weight, strap_colour)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
            RETURNING id`,
      [
        entry_id || null,
        inspection_date,
        packed_date,
        count_name,
        gross_weight_std,
        gross_weight_actual,
        box_colour,
        cone_colour,
        gum_tape_colour,
        count_label,
        cone_damage,
        cover_missing,
        cone_hardness,
        stap_cone,
        disk,
        barcode,
        center_pad,
        net_weight,
        tare_weight,
        strap_colour
      ]
    );

    const audit_id = auditResult.rows[0].id;

    for (const entry of drum_entries) {
      await client.query(
        `INSERT INTO autoconer.drum_entries
                (audit_id, drum_no, gross_weight, average)
                VALUES ($1,$2,$3,$4)`,
        [audit_id, entry.drum_no, entry.gross_weight, entry.average]
      );
    }

    for (const reading of cone_readings) {
      await client.query(
        `INSERT INTO autoconer.yarn_readings
                (audit_id, reading_number, percent_yarn)
                VALUES ($1,$2,$3)`,
        [audit_id, reading.reading_number, reading.percent_yarn]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Cone packing audit created successfully',
      audit_id
    });

  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    console.error('Error creating cone packing audit:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/**
 * @swagger
 * /autoconer/cone-packing-audit:
 *   get:
 *     summary: Get all cone packing audits with pagination
 *     tags: [Autoconer]
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
 *         description: List of cone packing audits retrieved successfully
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
 *                         type: integer
 *                       inspection_date:
 *                         type: string
 *                         format: date
 *                       packed_date:
 *                         type: string
 *                         format: date
 *                       count_name:
 *                         type: string
 *                       gross_weight_std:
 *                         type: number
 *                       gross_weight_actual:
 *                         type: number
 *                       box_colour:
 *                         type: string
 *                       cone_colour:
 *                         type: string
 *                       gum_tape_colour:
 *                         type: string
 *                       count_label:
 *                         type: boolean
 *                       cone_damage:
 *                         type: boolean
 *                       cover_missing:
 *                         type: boolean
 *                       cone_hardness:
 *                         type: boolean
 *                       stap_cone:
 *                         type: boolean
 *                       disk:
 *                         type: boolean
 *                       barcode:
 *                         type: boolean
 *                       center_pad:
 *                         type: string
 *                       net_weight:
 *                         type: number
 *                       tare_weight:
 *                         type: number
 *                       strap_colour:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       drum_entries:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             drum_no:
 *                               type: integer
 *                             gross_weight:
 *                               type: number
 *                             average:
 *                               type: number
 *                       yarn_readings:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             reading_number:
 *                               type: integer
 *                             percent_yarn:
 *                               type: number
 *       500:
 *         description: Server error
 */
router.get('/cone-packing-audit', async (req, res) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Two separate one-to-many child tables (drum_entries, yarn_readings) joined straight onto the
    // same parent row would fan out into a cross product (2 drum entries x 2 yarn readings = 4
    // rows before grouping), which is why the old query needed `json_agg(DISTINCT ...)` to collapse
    // the duplicates back down — but DISTINCT sorts by the aggregated value itself, not insertion
    // order, so "Reading 1"/"Drum 1" could silently show the wrong row. Aggregate each child table
    // independently in its own LATERAL subquery first, so there's no fan-out and no need for
    // DISTINCT, and order each list by its own row id.
    const dataQuery = `
            SELECT
                cpa.*,
                COALESCE(de_agg.drum_entries, '[]') AS drum_entries,
                COALESCE(yr_agg.yarn_readings, '[]') AS yarn_readings
            FROM autoconer.cone_packing_audit cpa
            LEFT JOIN LATERAL (
              SELECT json_agg(
                jsonb_build_object('drum_no', de.drum_no, 'gross_weight', de.gross_weight, 'average', de.average)
                ORDER BY de.id
              ) AS drum_entries
              FROM autoconer.drum_entries de
              WHERE de.audit_id = cpa.id
            ) de_agg ON true
            LEFT JOIN LATERAL (
              SELECT json_agg(
                jsonb_build_object('reading_number', yr.reading_number, 'percent_yarn', yr.percent_yarn)
                ORDER BY yr.id
              ) AS yarn_readings
              FROM autoconer.yarn_readings yr
              WHERE yr.audit_id = cpa.id
            ) yr_agg ON true
            ORDER BY cpa.created_at DESC
            LIMIT $1 OFFSET $2
        `;

    const countQuery = `SELECT COUNT(*) FROM autoconer.cone_packing_audit`;

    const dataResult = await client.query(dataQuery, [limit, offset]);
    const countResult = await client.query(countQuery);

    const total = parseInt(countResult.rows[0].count);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: dataResult.rows
    });

  } catch (err) {
    console.error('Error fetching cone packing audits:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /autoconer/parameter-entries:
 *   post:
 *     summary: Create Parameter Entry (Screen 1 or Screen 2)
 *     tags: [Autoconer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             inspection_type: "CSP Parameter Entries"
 *             entry_date: "2026-03-05"
 *             count_name: "12 RECYCLE COTTON"
 *             act_count: 11.93
 *             strength: 302.40
 *             count_cv: 1.62
 *             strength_cv: 4.23
 *             csp: 3608.54
 *             cone_color: "White"
 *             u: 10.2
 *             cvm: 2.1
 *     responses:
 *       201:
 *         description: Entry created
 *       500:
 *         description: Server error
 */
router.post('/parameter-entries', async (req, res) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const data = req.body;

    let phase = 'pending';

    const hasCSP = data.act_count != null || data.strength != null;
    const hasQuality = data.cone_color != null || data.u != null;

    if (hasCSP && hasQuality) phase = 'completed';
    else if (hasCSP) phase = 'csp_entered';
    else if (hasQuality) phase = 'quality_entered';

    const result = await client.query(
      `INSERT INTO autoconer.parameter_entries (
        entry_id,
        inspection_type,
        entry_date,
        count_name,

        act_count,
        strength,
        count_cv,
        strength_cv,
        csp,

        cone_color,
        u,
        cvm,

        cv_1m,
        cv_3m,
        cv_10m,
        br_1_5mm,
        cvb,

        thin_minus_50,
        thick_plus_50,
        neps_plus_200,
        total_1,

        thin_minus_40,
        thick_plus_35,
        thick_plus_70,
        neps_plus_140,
        total_2,

        thin_minus_30,
        neps_plus_400,

        inspection_phase,
        payload
      )
      VALUES (
        $1,$2,$3,
        $4,
        $5,$6,$7,$8,$9,
        $10,$11,$12,
        $13,$14,$15,$16,$17,
        $18,$19,$20,$21,
        $22,$23,$24,$25,$26,
        $27,$28,
        $29,$30
      )
      RETURNING *`,
      [
        data.entry_id || null,
        data.inspection_type,
        data.entry_date,
        data.count_name,

        data.act_count,
        data.strength,
        data.count_cv,
        data.strength_cv,
        data.csp,

        data.cone_color,
        data.u,
        data.cvm,

        data.cv_1m,
        data.cv_3m,
        data.cv_10m,
        data.br_1_5mm,
        data.cvb,

        data.thin_minus_50,
        data.thick_plus_50,
        data.neps_plus_200,
        data.total_1,

        data.thin_minus_40,
        data.thick_plus_35,
        data.thick_plus_70,
        data.neps_plus_140,
        data.total_2,

        data.thin_minus_30,
        data.neps_plus_400,

        phase,
        data.payload || null
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /autoconer/parameter-entries/{id}:
 *   put:
 *     summary: Update Parameter Entry (Complete remaining fields)
 *     tags: [Autoconer]
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
 *           example:
 *             cone_color: "White"
 *             u: 10.5
 *             cvm: 2.2
 *             cv_1m: 1.1
 *             cv_3m: 1.3
 *             cv_10m: 1.5
 *     responses:
 *       200:
 *         description: Entry updated
 *       404:
 *         description: Not found
 */
router.put('/parameter-entries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const existing = await client.query(
      `SELECT * FROM autoconer.parameter_entries WHERE id=$1`,
      [id]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ message: "Not found" });
    }

    const old = existing.rows[0];
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined && v !== null)
    );
    const merged = { ...old, ...cleanData };

    const hasCSP = merged.act_count != null && merged.strength != null;
    const hasQuality = merged.cone_color != null || merged.u != null;

    let phase = 'pending';
    if (hasCSP && hasQuality) phase = 'completed';
    else if (hasCSP) phase = 'csp_entered';
    else if (hasQuality) phase = 'quality_entered';

    const result = await client.query(
      `UPDATE autoconer.parameter_entries SET
        count_name=$1,
        act_count=$2,
        strength=$3,
        count_cv=$4,
        strength_cv=$5,
        csp=$6,
        cone_color=$7,
        u=$8,
        cvm=$9,
        cv_1m=$10,
        cv_3m=$11,
        cv_10m=$12,
        br_1_5mm=$13,
        cvb=$14,
        thin_minus_50=$15,
        thick_plus_50=$16,
        neps_plus_200=$17,
        total_1=$18,
        thin_minus_40=$19,
        thick_plus_35=$20,
        thick_plus_70=$21,
        neps_plus_140=$22,
        total_2=$23,
        thin_minus_30=$24,
        neps_plus_400=$25,
        inspection_phase=$26,
        updated_at=CURRENT_TIMESTAMP
    WHERE id=$27
    RETURNING *`,
      [
        merged.count_name,
        merged.act_count,
        merged.strength,
        merged.count_cv,
        merged.strength_cv,
        merged.csp,
        merged.cone_color,
        merged.u,
        merged.cvm,
        merged.cv_1m,
        merged.cv_3m,
        merged.cv_10m,
        merged.br_1_5mm,
        merged.cvb,
        merged.thin_minus_50,
        merged.thick_plus_50,
        merged.neps_plus_200,
        merged.total_1,
        merged.thin_minus_40,
        merged.thick_plus_35,
        merged.thick_plus_70,
        merged.neps_plus_140,
        merged.total_2,
        merged.thin_minus_30,
        merged.neps_plus_400,
        phase,
        id
      ]
    );

    res.json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /autoconer/parameter-entries:
 *   get:
 *     summary: Get All Parameter Entries
 *     tags: [Autoconer]
 *     responses:
 *       200:
 *         description: List of entries
 */
router.get('/parameter-entries', async (req, res) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const result = await client.query(
      `SELECT * FROM autoconer.parameter_entries ORDER BY id DESC`
    );

    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /autoconer/parameter-entries/pending-csp:
 *   get:
 *     summary: Get entries pending for CSP (Screen 1)
 *     tags: [Autoconer]
 *     responses:
 *       200:
 *         description: Successfully fetched pending CSP entries
 *         content:
 *           application/json:
 *             example:
 *               - id: 102
 *                 inspection_phase: "quality_entered"
 *                 cone_color: "White"
 *                 u: 10.2
 *       500:
 *         description: Internal server error
 */
router.get('/parameter-entries/pending-csp', async (req, res) => {
  try {
    const result = await client.query(
      `SELECT * FROM autoconer.parameter_entries
             WHERE inspection_phase='quality_entered'
             ORDER BY id DESC`
    );

    res.json(result.rows);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /autoconer/parameter-entries/pending-quality:
 *   get:
 *     summary: Get entries pending for Quality (Screen 2)
 *     tags: [Autoconer]
 *     responses:
 *       200:
 *         description: Successfully fetched pending Quality entries
 *         content:
 *           application/json:
 *             example:
 *               - id: 103
 *                 inspection_phase: "csp_entered"
 *                 act_count: 11.93
 *                 strength: 302.40
 *       500:
 *         description: Internal server error
 */
router.get('/parameter-entries/pending-quality', async (req, res) => {
  try {
    const result = await client.query(
      `SELECT * FROM autoconer.parameter_entries
             WHERE inspection_phase='csp_entered'
             ORDER BY id DESC`
    );

    res.json(result.rows);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /autoconer/process:
 *   post:
 *     summary: Create Autoconer Process Parameter entry
 *     tags: [Autoconer]
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
 *                 example: "40s Cotton"
 *               consignee_name:
 *                 type: string
 *                 example: "ABC Mills"
 *               creation_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-04-15"
 *               machine_no:
 *                 type: string
 *                 example: "AUTO-01"
 *               drum_no:
 *                 type: string
 *                 example: "DR-10"
 *               speed:
 *                 type: number
 *                 example: 1200
 *               p_cone_identification:
 *                 type: string
 *                 example: "Cone-A"
 *               cone_weight:
 *                 type: number
 *                 example: 1.25
 *               initial_winding_tension:
 *                 type: number
 *                 example: 15
 *               standard_winding_tension:
 *                 type: number
 *                 example: 14
 *               touch_winding_tension:
 *                 type: number
 *                 example: 13
 *               t_release_add_tension:
 *                 type: number
 *                 example: 2
 *               tension_release_end_yarn_layer:
 *                 type: number
 *                 example: 5
 *               tension_release_decrease_ratio:
 *                 type: number
 *                 example: 0.8
 *               tension_release_valid_yarn_layer:
 *                 type: number
 *                 example: 6
 *               splicing_setting:
 *                 type: string
 *                 example: "Standard"
 *               water_on_off:
 *                 type: string
 *                 example: "ON"
 *               splicing_length_adjust_parameter:
 *                 type: number
 *                 example: 3.5
 *               splicing_nozzle:
 *                 type: string
 *                 example: "Nozzle-A"
 *               cradle_pressure:
 *                 type: number
 *                 example: 10
 *               cone_density:
 *                 type: number
 *                 example: 0.45
 *               cone_cops:
 *                 type: string
 *                 example: "Cone"
 *     responses:
 *       201:
 *         description: Autoconer entry created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Autoconer entry created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     ins_code:
 *                       type: string
 *                       example: "PP001"
 *                     type:
 *                       type: string
 *                       example: "Process Parameter"
 *                     count_name:
 *                       type: string
 *                       example: "40s Cotton"
 *                     consignee_name:
 *                       type: string
 *                       example: "ABC Mills"
 *                     creation_date:
 *                       type: string
 *                       format: date
 *                       example: "2026-04-15"
 *                     machine_no:
 *                       type: string
 *                     drum_no:
 *                       type: string
 *                     speed:
 *                       type: number
 *                     p_cone_identification:
 *                       type: string
 *                     cone_weight:
 *                       type: number
 *                     initial_winding_tension:
 *                       type: number
 *                     standard_winding_tension:
 *                       type: number
 *                     touch_winding_tension:
 *                       type: number
 *                     t_release_add_tension:
 *                       type: number
 *                     tension_release_end_yarn_layer:
 *                       type: number
 *                     tension_release_decrease_ratio:
 *                       type: number
 *                     tension_release_valid_yarn_layer:
 *                       type: number
 *                     splicing_setting:
 *                       type: string
 *                     water_on_off:
 *                       type: string
 *                     splicing_length_adjust_parameter:
 *                       type: number
 *                     splicing_nozzle:
 *                       type: string
 *                     cradle_pressure:
 *                       type: number
 *                     cone_density:
 *                       type: number
 *                     cone_cops:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid input (missing required fields)
 *       500:
 *         description: Server error
 */
router.post('/process', async (req, res, next) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const data = req.body;

    if (!data.count_name || !data.consignee_name || !data.creation_date) {
      return res.status(400).json({
        message: 'count_name, consignee_name and creation_date are required'
      });
    }

    // Reconciles the client-previewed entry_id against the backend's global PP
    // sequence (advancing it if this is the first save to claim it), instead of
    // trusting it verbatim - otherwise the sequence never moves and every
    // department keeps previewing/claiming the same "next" PP id.
    const resolvedEntryId = await resolveOrCreateProcessParameterEntryId(data.entry_id);

    const conflictingCountName = await getCountNameConflict(resolvedEntryId, data.count_name);
    if (conflictingCountName) {
      return res.status(409).json({ message: `This PP id (${resolvedEntryId}) already uses count name "${conflictingCountName}". All sub-departments under a PP id must use the same count name.` });
    }

    const result = await client.query(
      `INSERT INTO autoconer.autoconer_process_parameter (
        entry_id,
        count_name, consignee_name, creation_date,
        machine_no, drum_no,
        speed, p_cone_identification, cone_weight, initial_winding_tension,
        standard_winding_tension, touch_winding_tension, t_release_add_tension,
        tension_release_end_yarn_layer, tension_release_decrease_ratio, tension_release_valid_yarn_layer,
        splicing_setting, water_on_off, splicing_length_adjust_parameter, splicing_nozzle,
        cradle_pressure, cone_density, cone_cops
      )
      VALUES (
        $1,$2,$3,$4,
        $5,$6,
        $7,$8,$9,$10,
        $11,$12,$13,
        $14,$15,$16,
        $17,$18,$19,$20,
        $21,$22,$23
      )
      RETURNING *`,
      [
        resolvedEntryId,
        data.count_name,
        data.consignee_name,
        data.creation_date,
        data.machine_no,
        data.drum_no,
        data.speed,
        data.p_cone_identification,
        data.cone_weight,
        data.initial_winding_tension,
        data.standard_winding_tension,
        data.touch_winding_tension,
        data.t_release_add_tension,
        data.tension_release_end_yarn_layer,
        data.tension_release_decrease_ratio,
        data.tension_release_valid_yarn_layer,
        data.splicing_setting,
        data.water_on_off,
        data.splicing_length_adjust_parameter,
        data.splicing_nozzle,
        data.cradle_pressure,
        data.cone_density,
        data.cone_cops
      ]
    );

    res.status(201).json({
      message: 'Autoconer entry created successfully',
      data: withScreenEntryId('process', result.rows[0])
    });

  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    console.error(error);
    next(error);
  }
});

/**
 * @swagger
 * /autoconer/process:
 *   get:
 *     summary: Get all Autoconer entries
 *     tags: [Autoconer]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: Autoconer data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       ins_code:
 *                         type: string
 *                         example: "PP001"
 *                       type:
 *                         type: string
 *                         example: "Process Parameter"
 *                       count_name:
 *                         type: string
 *                         example: "40s Cotton"
 *                       consignee_name:
 *                         type: string
 *                         example: "ABC Mills"
 *                       creation_date:
 *                         type: string
 *                         format: date
 *                         example: "2026-04-15"
 *                       machine_no:
 *                         type: string
 *                         example: "AUTO-01"
 *                       drum_no:
 *                         type: string
 *                         example: "DR-10"
 *                       speed:
 *                         type: number
 *                         example: 1200
 *                       p_cone_identification:
 *                         type: string
 *                         example: "Cone-A"
 *                       cone_weight:
 *                         type: number
 *                         example: 1.25
 *                       initial_winding_tension:
 *                         type: number
 *                         example: 15
 *                       standard_winding_tension:
 *                         type: number
 *                         example: 14
 *                       touch_winding_tension:
 *                         type: number
 *                         example: 13
 *                       t_release_add_tension:
 *                         type: number
 *                         example: 2
 *                       tension_release_end_yarn_layer:
 *                         type: number
 *                         example: 5
 *                       tension_release_decrease_ratio:
 *                         type: number
 *                         example: 0.8
 *                       tension_release_valid_yarn_layer:
 *                         type: number
 *                         example: 6
 *                       splicing_setting:
 *                         type: string
 *                         example: "Standard"
 *                       water_on_off:
 *                         type: string
 *                         example: "ON"
 *                       splicing_length_adjust_parameter:
 *                         type: number
 *                         example: 3.5
 *                       splicing_nozzle:
 *                         type: string
 *                         example: "Nozzle-A"
 *                       cradle_pressure:
 *                         type: number
 *                         example: 10
 *                       cone_density:
 *                         type: number
 *                         example: 0.45
 *                       cone_cops:
 *                         type: string
 *                         example: "Cone"
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *                   example: 25
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 10
 *       500:
 *         description: Server error
 */
router.get('/process', async (req, res, next) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT *
       FROM autoconer.autoconer_process_parameter
       ORDER BY creation_date DESC
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const totalResult = await client.query(
      `SELECT COUNT(*) FROM autoconer.autoconer_process_parameter`
    );

    res.status(200).json({
      data: result.rows.map((row) => withScreenEntryId('process', row)),
      total: parseInt(totalResult.rows[0].count),
      page: pageNum,
      limit: limitNum
    });

  } catch (error) {
    console.error(error);
    next(error);
  }
});

/**
 * @swagger
 * /autoconer/process/{id}:
 *   put:
 *     summary: Update Autoconer Process Parameter entry
 *     tags: [Autoconer]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Autoconer Entry ID
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
 *                 example: "40s Cotton"
 *               consignee_name:
 *                 type: string
 *                 example: "ABC Mills"
 *               creation_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-04-15"
 *               machine_no:
 *                 type: string
 *                 example: "AUTO-01"
 *               drum_no:
 *                 type: string
 *                 example: "DR-10"
 *               speed:
 *                 type: number
 *                 example: 1200
 *               p_cone_identification:
 *                 type: string
 *                 example: "Cone-A"
 *               cone_weight:
 *                 type: number
 *                 example: 1.25
 *               initial_winding_tension:
 *                 type: number
 *                 example: 15
 *               standard_winding_tension:
 *                 type: number
 *                 example: 14
 *               touch_winding_tension:
 *                 type: number
 *                 example: 13
 *               t_release_add_tension:
 *                 type: number
 *                 example: 2
 *               tension_release_end_yarn_layer:
 *                 type: number
 *                 example: 5
 *               tension_release_decrease_ratio:
 *                 type: number
 *                 example: 0.8
 *               tension_release_valid_yarn_layer:
 *                 type: number
 *                 example: 6
 *               splicing_setting:
 *                 type: string
 *                 example: "Standard"
 *               water_on_off:
 *                 type: string
 *                 example: "ON"
 *               splicing_length_adjust_parameter:
 *                 type: number
 *                 example: 3.5
 *               splicing_nozzle:
 *                 type: string
 *                 example: "Nozzle-A"
 *               cradle_pressure:
 *                 type: number
 *                 example: 10
 *               cone_density:
 *                 type: number
 *                 example: 0.45
 *               cone_cops:
 *                 type: string
 *                 example: "Cone"
 *     responses:
 *       200:
 *         description: Autoconer entry updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     ins_code:
 *                       type: string
 *                       example: "PP001"
 *                     type:
 *                       type: string
 *                       example: "Process Parameter"
 *                     count_name:
 *                       type: string
 *                       example: "40s Cotton"
 *                     consignee_name:
 *                       type: string
 *                       example: "ABC Mills"
 *                     creation_date:
 *                       type: string
 *                       format: date
 *                     machine_no:
 *                       type: string
 *                     drum_no:
 *                       type: string
 *                     speed:
 *                       type: number
 *                     p_cone_identification:
 *                       type: string
 *                     cone_weight:
 *                       type: number
 *                     initial_winding_tension:
 *                       type: number
 *                     standard_winding_tension:
 *                       type: number
 *                     touch_winding_tension:
 *                       type: number
 *                     t_release_add_tension:
 *                       type: number
 *                     tension_release_end_yarn_layer:
 *                       type: number
 *                     tension_release_decrease_ratio:
 *                       type: number
 *                     tension_release_valid_yarn_layer:
 *                       type: number
 *                     splicing_setting:
 *                       type: string
 *                     water_on_off:
 *                       type: string
 *                     splicing_length_adjust_parameter:
 *                       type: number
 *                     splicing_nozzle:
 *                       type: string
 *                     cradle_pressure:
 *                       type: number
 *                     cone_density:
 *                       type: number
 *                     cone_cops:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid input or ID
 *       404:
 *         description: Entry not found
 *       500:
 *         description: Server error
 */

router.put('/process/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const data = req.body;

    if (!id || id <= 0) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    const result = await client.query(
      `UPDATE autoconer.autoconer_process_parameter
       SET count_name=$1,
           consignee_name=$2,
           creation_date=$3,
           machine_no=$4,
           drum_no=$5,
           speed=$6,
           p_cone_identification=$7,
           cone_weight=$8,
           initial_winding_tension=$9,
           standard_winding_tension=$10,
           touch_winding_tension=$11,
           t_release_add_tension=$12,
           tension_release_end_yarn_layer=$13,
           tension_release_decrease_ratio=$14,
           tension_release_valid_yarn_layer=$15,
           splicing_setting=$16,
           water_on_off=$17,
           splicing_length_adjust_parameter=$18,
           splicing_nozzle=$19,
           cradle_pressure=$20,
           cone_density=$21,
           cone_cops=$22,
           updated_at = CURRENT_TIMESTAMP
       WHERE id=$23
       RETURNING *`,
      [
        data.count_name,
        data.consignee_name,
        data.creation_date,
        data.machine_no,
        data.drum_no,
        data.speed,
        data.p_cone_identification,
        data.cone_weight,
        data.initial_winding_tension,
        data.standard_winding_tension,
        data.touch_winding_tension,
        data.t_release_add_tension,
        data.tension_release_end_yarn_layer,
        data.tension_release_decrease_ratio,
        data.tension_release_valid_yarn_layer,
        data.splicing_setting,
        data.water_on_off,
        data.splicing_length_adjust_parameter,
        data.splicing_nozzle,
        data.cradle_pressure,
        data.cone_density,
        data.cone_cops,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.status(200).json({
      message: 'Updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error(error);
    next(error);
  }
});

/**
 * @swagger
 * /autoconer/q2:
 *   post:
 *     summary: Create Autoconer Q2 Inspection entry
 *     tags: [Autoconer]
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
 *                 example: "40s Cotton"
 *               consignee_name:
 *                 type: string
 *                 example: "ABC Mills"
 *               creation_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-04-15"
 *     responses:
 *       201:
 *         description: Q2 entry created successfully
 *       400:
 *         description: Invalid input
 */
router.post('/q2', async (req, res, next) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const data = req.body;

    if (!data.count_name || !data.consignee_name || !data.creation_date) {
      return res.status(400).json({
        message: 'count_name, consignee_name and creation_date are required'
      });
    }

    // Reconciles the client-previewed entry_id against the backend's global PP
    // sequence (advancing it if this is the first save to claim it), instead of
    // trusting it verbatim - otherwise the sequence never moves and every
    // department keeps previewing/claiming the same "next" PP id.
    const resolvedEntryId = await resolveOrCreateProcessParameterEntryId(data.entry_id);

    const conflictingCountName = await getCountNameConflict(resolvedEntryId, data.count_name);
    if (conflictingCountName) {
      return res.status(409).json({ message: `This PP id (${resolvedEntryId}) already uses count name "${conflictingCountName}". All sub-departments under a PP id must use the same count name.` });
    }

    const result = await client.query(
      `INSERT INTO autoconer.autoconer_q2_inspection (
        entry_id,
        count_name, consignee_name, creation_date,
        n_value, s_value, l_value,
        lh1, lh2, lh3, lh4, lh5, lh6,
        tht, th1, th2, th3, th4, th5, th6,
        cp, cm, ccp, ccm, pc,
        fault_distance, no_of_faults, jp, jm, up, fl,
        flh1, flh2, flh3, flh4,
        fd, fdh1, fdh2, fdh3, fdh4, fdh5,
        reference_length, measurement, upper_alarm_limit, lower_alarm_limit, action
      )
      VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,
        $8,$9,$10,$11,$12,$13,
        $14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,
        $26,$27,$28,$29,$30,$31,
        $32,$33,$34,$35,
        $36,$37,$38,$39,$40,$41,
        $42,$43,$44,$45,$46
      )
      RETURNING *`,
      [
        resolvedEntryId,
        data.count_name, data.consignee_name, data.creation_date,
        data.n_value, data.s_value, data.l_value,
        data.lh1, data.lh2, data.lh3, data.lh4, data.lh5, data.lh6,
        data.tht, data.th1, data.th2, data.th3, data.th4, data.th5, data.th6,
        data.cp, data.cm, data.ccp, data.ccm, data.pc,
        data.fault_distance, data.no_of_faults, data.jp, data.jm, data.up, data.fl,
        data.flh1, data.flh2, data.flh3, data.flh4,
        data.fd, data.fdh1, data.fdh2, data.fdh3, data.fdh4, data.fdh5,
        data.reference_length, data.measurement, data.upper_alarm_limit, data.lower_alarm_limit, data.action
      ]
    );

    res.status(201).json({
      message: 'Q2 entry created successfully',
      data: withScreenEntryId('q2', result.rows[0])
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
 * /autoconer/q2:
 *   get:
 *     summary: Get all Q2 inspection entries
 *     tags: [Autoconer]
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
 *         description: Data retrieved successfully
 */
router.get('/q2', async (req, res, next) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT *
       FROM autoconer.autoconer_q2_inspection
       ORDER BY creation_date DESC
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const total = await client.query(
      `SELECT COUNT(*) FROM autoconer.autoconer_q2_inspection`
    );

    res.status(200).json({
      data: result.rows.map((row) => withScreenEntryId('q2', row)),
      total: parseInt(total.rows[0].count),
      page: pageNum,
      limit: limitNum
    });

  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /autoconer/q2/{id}:
 *   put:
 *     summary: Update Q2 inspection entry
 *     tags: [Autoconer]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Q2 Entry ID
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
 *                 example: "40s Cotton"
 *               consignee_name:
 *                 type: string
 *                 example: "ABC Mills"
 *               creation_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-04-15"
 *               n_value:
 *                 type: number
 *                 example: 10
 *               s_value:
 *                 type: number
 *                 example: 20
 *               l_value:
 *                 type: number
 *                 example: 30
 *               lh1:
 *                 type: number
 *               lh2:
 *                 type: number
 *               lh3:
 *                 type: number
 *               lh4:
 *                 type: number
 *               lh5:
 *                 type: number
 *               lh6:
 *                 type: number
 *               tht:
 *                 type: number
 *               th1:
 *                 type: number
 *               th2:
 *                 type: number
 *               th3:
 *                 type: number
 *               th4:
 *                 type: number
 *               th5:
 *                 type: number
 *               th6:
 *                 type: number
 *               cp:
 *                 type: number
 *               cm:
 *                 type: number
 *               ccp:
 *                 type: number
 *               ccm:
 *                 type: number
 *               pc:
 *                 type: number
 *               fault_distance:
 *                 type: number
 *               no_of_faults:
 *                 type: integer
 *               jp:
 *                 type: number
 *               jm:
 *                 type: number
 *               up:
 *                 type: number
 *               fl:
 *                 type: number
 *               flh1:
 *                 type: number
 *               flh2:
 *                 type: number
 *               flh3:
 *                 type: number
 *               flh4:
 *                 type: number
 *               fd:
 *                 type: number
 *               fdh1:
 *                 type: number
 *               fdh2:
 *                 type: number
 *               fdh3:
 *                 type: number
 *               fdh4:
 *                 type: number
 *               fdh5:
 *                 type: number
 *               reference_length:
 *                 type: number
 *               measurement:
 *                 type: number
 *               upper_alarm_limit:
 *                 type: number
 *               lower_alarm_limit:
 *                 type: number
 *               action:
 *                 type: string
 *                 example: "OK"
 *     responses:
 *       200:
 *         description: Q2 entry updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     ins_code:
 *                       type: string
 *                       example: "PP001"
 *                     type:
 *                       type: string
 *                       example: "Autoconer Q2"
 *                     count_name:
 *                       type: string
 *                     consignee_name:
 *                       type: string
 *                     creation_date:
 *                       type: string
 *                       format: date
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid ID or input
 *       404:
 *         description: Entry not found
 *       500:
 *         description: Server error
 */
router.put('/q2/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const data = req.body;

    if (!id || id <= 0) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    const result = await client.query(
      `UPDATE autoconer.autoconer_q2_inspection
       SET count_name=$1,
           consignee_name=$2,
           creation_date=$3,
           n_value=$4, s_value=$5, l_value=$6,
           lh1=$7, lh2=$8, lh3=$9, lh4=$10, lh5=$11, lh6=$12,
           tht=$13, th1=$14, th2=$15, th3=$16, th4=$17, th5=$18, th6=$19,
           cp=$20, cm=$21, ccp=$22, ccm=$23, pc=$24,
           fault_distance=$25, no_of_faults=$26, jp=$27, jm=$28, up=$29, fl=$30,
           flh1=$31, flh2=$32, flh3=$33, flh4=$34,
           fd=$35, fdh1=$36, fdh2=$37, fdh3=$38, fdh4=$39, fdh5=$40,
           reference_length=$41, measurement=$42,
           upper_alarm_limit=$43, lower_alarm_limit=$44, action=$45,
           updated_at = CURRENT_TIMESTAMP
       WHERE id=$46
       RETURNING *`,
      [
        data.count_name, data.consignee_name, data.creation_date,
        data.n_value, data.s_value, data.l_value,
        data.lh1, data.lh2, data.lh3, data.lh4, data.lh5, data.lh6,
        data.tht, data.th1, data.th2, data.th3, data.th4, data.th5, data.th6,
        data.cp, data.cm, data.ccp, data.ccm, data.pc,
        data.fault_distance, data.no_of_faults, data.jp, data.jm, data.up, data.fl,
        data.flh1, data.flh2, data.flh3, data.flh4,
        data.fd, data.fdh1, data.fdh2, data.fdh3, data.fdh4, data.fdh5,
        data.reference_length, data.measurement,
        data.upper_alarm_limit, data.lower_alarm_limit, data.action,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.status(200).json({
      message: 'Updated successfully',
      data: result.rows[0]
    });

  } catch (err) {
    next(err);
  }
});
/**
 * @swagger
 * /autoconer/q3:
 *   post:
 *     summary: Create Autoconer Q3 entry
 *     tags: [Autoconer]
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
 *                 example: "40s Cotton"
 *               consignee_name:
 *                 type: string
 *                 example: "ABC Mills"
 *               creation_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-04-15"
 *               nsl1:
 *                 type: number
 *               nsl2:
 *                 type: number
 *               nsl3:
 *                 type: number
 *               nsl4:
 *                 type: number
 *               nsl5:
 *                 type: number
 *               nsl6:
 *                 type: number
 *               nsl7:
 *                 type: number
 *               t1:
 *                 type: number
 *               t2:
 *                 type: number
 *               t3:
 *                 type: number
 *               t4:
 *                 type: number
 *               t5:
 *                 type: number
 *               pf_sensing:
 *                 type: number
 *               pf_no_of_periods:
 *                 type: integer
 *               oc:
 *                 type: number
 *               cp:
 *                 type: number
 *               cm:
 *                 type: number
 *               ccp1:
 *                 type: number
 *               ccp2:
 *                 type: number
 *               ccm1:
 *                 type: number
 *               ccm2:
 *                 type: number
 *               jp1:
 *                 type: number
 *               jp2:
 *                 type: number
 *               jp3:
 *                 type: number
 *               jp4:
 *                 type: number
 *               jp5:
 *                 type: number
 *               jp6:
 *                 type: number
 *               jp7:
 *                 type: number
 *               jp_clearing:
 *                 type: number
 *               jp_u_percent:
 *                 type: number
 *               jp_jm:
 *                 type: number
 *               fd1:
 *                 type: number
 *               fd2:
 *                 type: number
 *               fd3:
 *                 type: number
 *               fd4:
 *                 type: number
 *               fd5:
 *                 type: number
 *               fd6:
 *                 type: number
 *               reference_length:
 *                 type: number
 *               suction:
 *                 type: number
 *               measurement:
 *                 type: number
 *               upper_limit:
 *                 type: number
 *               lower_limit:
 *                 type: number
 *               action:
 *                 type: string
 *               suction_status:
 *                 type: string
 *               blocking:
 *                 type: string
 *     responses:
 *       201:
 *         description: Q3 entry created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Q3 entry created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     ins_code:
 *                       type: string
 *                       example: "PP001"
 *                     type:
 *                       type: string
 *                       example: "PP-Autoconer Q3"
 *                     count_name:
 *                       type: string
 *                     consignee_name:
 *                       type: string
 *                     creation_date:
 *                       type: string
 *                       format: date
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.post('/q3', async (req, res, next) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const data = req.body;

    if (!data.count_name || !data.consignee_name || !data.creation_date) {
      return res.status(400).json({
        message: 'count_name, consignee_name and creation_date are required'
      });
    }

    // Reconciles the client-previewed entry_id against the backend's global PP
    // sequence (advancing it if this is the first save to claim it), instead of
    // trusting it verbatim - otherwise the sequence never moves and every
    // department keeps previewing/claiming the same "next" PP id.
    const resolvedEntryId = await resolveOrCreateProcessParameterEntryId(data.entry_id);

    const conflictingCountName = await getCountNameConflict(resolvedEntryId, data.count_name);
    if (conflictingCountName) {
      return res.status(409).json({ message: `This PP id (${resolvedEntryId}) already uses count name "${conflictingCountName}". All sub-departments under a PP id must use the same count name.` });
    }

    const result = await client.query(
      `INSERT INTO autoconer.autoconer_q3_inspection (
        entry_id,
        count_name, consignee_name, creation_date,
        nsl1, nsl2, nsl3, nsl4, nsl5, nsl6, nsl7,
        t1, t2, t3, t4, t5,
        pf_sensing, pf_no_of_periods,
        oc, cp, cm, ccp1, ccp2, ccm1, ccm2,
        jp1, jp2, jp3, jp4, jp5, jp6, jp7,
        jp_clearing, jp_u_percent, jp_jm,
        fd1, fd2, fd3, fd4, fd5, fd6,
        reference_length, suction, measurement, upper_limit, lower_limit,
        action, suction_status, blocking
      )
      VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,
        $17,$18,
        $19,$20,$21,$22,$23,$24,$25,
        $26,$27,$28,$29,$30,$31,$32,
        $33,$34,$35,
        $36,$37,$38,$39,$40,$41,
        $42,$43,$44,$45,$46,
        $47,$48,$49
      )
      RETURNING *`,
      [
        resolvedEntryId,
        data.count_name, data.consignee_name, data.creation_date,
        data.nsl1, data.nsl2, data.nsl3, data.nsl4, data.nsl5, data.nsl6, data.nsl7,
        data.t1, data.t2, data.t3, data.t4, data.t5,
        data.pf_sensing, data.pf_no_of_periods,
        data.oc, data.cp, data.cm, data.ccp1, data.ccp2, data.ccm1, data.ccm2,
        data.jp1, data.jp2, data.jp3, data.jp4, data.jp5, data.jp6, data.jp7,
        data.jp_clearing, data.jp_u_percent, data.jp_jm,
        data.fd1, data.fd2, data.fd3, data.fd4, data.fd5, data.fd6,
        data.reference_length, data.suction, data.measurement, data.upper_limit, data.lower_limit,
        data.action, data.suction_status, data.blocking
      ]
    );

    res.status(201).json({
      message: 'Q3 entry created successfully',
      data: withScreenEntryId('q3', result.rows[0])
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
 * /autoconer/q3:
 *   get:
 *     summary: Get all Autoconer Q3 entries
 *     tags: [Autoconer]
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
 *         description: Q3 data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       ins_code:
 *                         type: string
 *                       type:
 *                         type: string
 *                       count_name:
 *                         type: string
 *                       consignee_name:
 *                         type: string
 *                       creation_date:
 *                         type: string
 *                         format: date
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *                   example: 25
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 10
 *       500:
 *         description: Server error
 */
router.get('/q3', async (req, res, next) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT *
       FROM autoconer.autoconer_q3_inspection
       ORDER BY creation_date DESC
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const total = await client.query(
      `SELECT COUNT(*) FROM autoconer.autoconer_q3_inspection`
    );

    res.status(200).json({
      data: result.rows.map((row) => withScreenEntryId('q3', row)),
      total: parseInt(total.rows[0].count),
      page: pageNum,
      limit: limitNum
    });

  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /autoconer/q3/{id}:
 *   put:
 *     summary: Update Autoconer Q3 entry
 *     tags: [Autoconer]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Q3 Entry ID
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
 *     responses:
 *       200:
 *         description: Q3 entry updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     ins_code:
 *                       type: string
 *                     type:
 *                       type: string
 *                     count_name:
 *                       type: string
 *                     consignee_name:
 *                       type: string
 *                     creation_date:
 *                       type: string
 *                       format: date
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid ID or input
 *       404:
 *         description: Entry not found
 *       500:
 *         description: Server error
 */
router.put('/q3/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const data = req.body;

    if (!id || id <= 0) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    const result = await client.query(
      `UPDATE autoconer.autoconer_q3_inspection
       SET count_name=$1,
           consignee_name=$2,
           creation_date=$3,
           nsl1=$4, nsl2=$5, nsl3=$6, nsl4=$7, nsl5=$8, nsl6=$9, nsl7=$10,
           t1=$11, t2=$12, t3=$13, t4=$14, t5=$15,
           pf_sensing=$16, pf_no_of_periods=$17,
           oc=$18, cp=$19, cm=$20, ccp1=$21, ccp2=$22, ccm1=$23, ccm2=$24,
           jp1=$25, jp2=$26, jp3=$27, jp4=$28, jp5=$29, jp6=$30, jp7=$31,
           jp_clearing=$32, jp_u_percent=$33, jp_jm=$34,
           fd1=$35, fd2=$36, fd3=$37, fd4=$38, fd5=$39, fd6=$40,
           reference_length=$41, suction=$42, measurement=$43, upper_limit=$44, lower_limit=$45,
           action=$46, suction_status=$47, blocking=$48,
           updated_at = CURRENT_TIMESTAMP
       WHERE id=$49
       RETURNING *`,
      [
        data.count_name, data.consignee_name, data.creation_date,
        data.nsl1, data.nsl2, data.nsl3, data.nsl4, data.nsl5, data.nsl6, data.nsl7,
        data.t1, data.t2, data.t3, data.t4, data.t5,
        data.pf_sensing, data.pf_no_of_periods,
        data.oc, data.cp, data.cm, data.ccp1, data.ccp2, data.ccm1, data.ccm2,
        data.jp1, data.jp2, data.jp3, data.jp4, data.jp5, data.jp6, data.jp7,
        data.jp_clearing, data.jp_u_percent, data.jp_jm,
        data.fd1, data.fd2, data.fd3, data.fd4, data.fd5, data.fd6,
        data.reference_length, data.suction, data.measurement, data.upper_limit, data.lower_limit,
        data.action, data.suction_status, data.blocking,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.status(200).json({
      message: 'Updated successfully',
      data: result.rows[0]
    });

  } catch (err) {
    next(err);
  }
});

router.post('/q4', async (req, res, next) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const data = req.body;

    if (!data.count_name || !data.consignee_name || !data.creation_date) {
      return res.status(400).json({
        message: 'count_name, consignee_name and creation_date are required'
      });
    }

    const resolvedEntryId = await resolveOrCreateProcessParameterEntryId(data.entry_id);

    const conflictingCountName = await getCountNameConflict(resolvedEntryId, data.count_name);
    if (conflictingCountName) {
      return res.status(409).json({ message: `This PP id (${resolvedEntryId}) already uses count name "${conflictingCountName}". All sub-departments under a PP id must use the same count name.` });
    }

    const result = await client.query(
      `INSERT INTO autoconer.autoconer_q4_inspection (
        entry_id,
        count_name, consignee_name, creation_date,
        nsl1, nsl2, nsl3, nsl4, nsl5, nsl6, nsl7,
        t1, t2, t3, t4, t5,
        pf_sensing, pf_no_of_periods,
        oc, cp, cm, ccp1, ccp2, ccm1, ccm2,
        jp1, jp2, jp3, jp4, jp5, jp6, jp7,
        jp_clearing, jp_u_percent, jp_jm,
        fd1, fd2, fd3, fd4, fd5, fd6,
        reference_length, suction, measurement, upper_limit, lower_limit,
        action, suction_status, blocking, x_status,
        dp_plus_30, sm_minus_30, cdp1, cdp2, cdm1, cdm2,
        nsl_max_event, t_max_event, fd_max_events, fl_max_events
      )
      VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,
        $17,$18,
        $19,$20,$21,$22,$23,$24,$25,
        $26,$27,$28,$29,$30,$31,$32,
        $33,$34,$35,
        $36,$37,$38,$39,$40,$41,
        $42,$43,$44,$45,$46,
        $47,$48,$49,$50,
        $51,$52,$53,$54,$55,$56,
        $57,$58,$59,$60
      )
      RETURNING *`,
      [
        resolvedEntryId,
        data.count_name, data.consignee_name, data.creation_date,
        data.nsl1, data.nsl2, data.nsl3, data.nsl4, data.nsl5, data.nsl6, data.nsl7,
        data.t1, data.t2, data.t3, data.t4, data.t5,
        data.pf_sensing, data.pf_no_of_periods,
        data.oc, data.cp, data.cm, data.ccp1, data.ccp2, data.ccm1, data.ccm2,
        data.jp1, data.jp2, data.jp3, data.jp4, data.jp5, data.jp6, data.jp7,
        data.jp_clearing, data.jp_u_percent, data.jp_jm,
        data.fd1, data.fd2, data.fd3, data.fd4, data.fd5, data.fd6,
        data.reference_length, data.suction, data.measurement, data.upper_limit, data.lower_limit,
        data.action, data.suction_status, data.blocking, data.x_status,
        data.dp_plus_30, data.sm_minus_30, data.cdp1, data.cdp2, data.cdm1, data.cdm2,
        data.nsl_max_event, data.t_max_event, data.fd_max_events, data.fl_max_events
      ]
    );

    res.status(201).json({
      message: 'Q4 entry created successfully',
      data: withScreenEntryId('q4', result.rows[0])
    });

  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(err);
  }
});

router.get('/q4', async (req, res, next) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT *
       FROM autoconer.autoconer_q4_inspection
       ORDER BY creation_date DESC
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const total = await client.query(
      `SELECT COUNT(*) FROM autoconer.autoconer_q4_inspection`
    );

    res.status(200).json({
      data: result.rows.map((row) => withScreenEntryId('q4', row)),
      total: parseInt(total.rows[0].count),
      page: pageNum,
      limit: limitNum
    });

  } catch (err) {
    next(err);
  }
});

router.put('/q4/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const data = req.body;

    if (!id || id <= 0) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    const result = await client.query(
      `UPDATE autoconer.autoconer_q4_inspection
       SET count_name=$1,
           consignee_name=$2,
           creation_date=$3,
           nsl1=$4, nsl2=$5, nsl3=$6, nsl4=$7, nsl5=$8, nsl6=$9, nsl7=$10,
           t1=$11, t2=$12, t3=$13, t4=$14, t5=$15,
           pf_sensing=$16, pf_no_of_periods=$17,
           oc=$18, cp=$19, cm=$20, ccp1=$21, ccp2=$22, ccm1=$23, ccm2=$24,
           jp1=$25, jp2=$26, jp3=$27, jp4=$28, jp5=$29, jp6=$30, jp7=$31,
           jp_clearing=$32, jp_u_percent=$33, jp_jm=$34,
           fd1=$35, fd2=$36, fd3=$37, fd4=$38, fd5=$39, fd6=$40,
           reference_length=$41, suction=$42, measurement=$43, upper_limit=$44, lower_limit=$45,
           action=$46, suction_status=$47, blocking=$48, x_status=$49,
           dp_plus_30=$50, sm_minus_30=$51, cdp1=$52, cdp2=$53, cdm1=$54, cdm2=$55,
           nsl_max_event=$56, t_max_event=$57, fd_max_events=$58, fl_max_events=$59,
           updated_at = CURRENT_TIMESTAMP
       WHERE id=$60
       RETURNING *`,
      [
        data.count_name, data.consignee_name, data.creation_date,
        data.nsl1, data.nsl2, data.nsl3, data.nsl4, data.nsl5, data.nsl6, data.nsl7,
        data.t1, data.t2, data.t3, data.t4, data.t5,
        data.pf_sensing, data.pf_no_of_periods,
        data.oc, data.cp, data.cm, data.ccp1, data.ccp2, data.ccm1, data.ccm2,
        data.jp1, data.jp2, data.jp3, data.jp4, data.jp5, data.jp6, data.jp7,
        data.jp_clearing, data.jp_u_percent, data.jp_jm,
        data.fd1, data.fd2, data.fd3, data.fd4, data.fd5, data.fd6,
        data.reference_length, data.suction, data.measurement, data.upper_limit, data.lower_limit,
        data.action, data.suction_status, data.blocking, data.x_status,
        data.dp_plus_30, data.sm_minus_30, data.cdp1, data.cdp2, data.cdm1, data.cdm2,
        data.nsl_max_event, data.t_max_event, data.fd_max_events, data.fl_max_events,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.status(200).json({
      message: 'Updated successfully',
      data: result.rows[0]
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;


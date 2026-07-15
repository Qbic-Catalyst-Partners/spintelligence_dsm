const express = require("express");
const router = express.Router();
const client = require("../connection")
const sqlServer = require("../config/sqlserver");
const sqlServerPrep = require('../config/sqlserverPrep');
const { fetchPrepVarieties, isDatabaseAccessDenied } = require('../utils/prepVariety');
const { createEmployeeMasterDropdown } = require('../utils/employeeMaster');
const { resolveOrCreateProcessParameterEntryId, getCountNameConflict } = require('../utils/processParameterEntryId');
const { recordPpNotebookSubmission } = require('./submittedNotebooks.routes');
const SCREEN_ID_PREFIXES = {
  yarn_cv: 'DY',
  cots: 'DC',
  uqc: 'DU',
  header: 'DH',
  finisher: 'DF',
  wheel_change: 'AWH',
  wrapping_drawframe_notebook: 'WD',
  wrapping_a_percent: 'WA',
  wrapping_stretch_percent: 'WSP',
  wrapping_comber_noil_percent: 'WNP'
};

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
const DRAWFRAME_FR_ALLOWED_LIKE = [
  'FR%HSR%',
  'FR%D%',
  'FR%LRSB%',
  'FR%LDF%'
];
const DRAWFRAME_FR_FIXED_MACHINES = [
  'FR (HSR 1000-2)',
  'FR (HSR 1000-1)'
];
const ensurePrefix = (value, prefix) => {
  const text = String(value || '').trim();
  const cleanPrefix = String(prefix || '').trim();
  if (!text || !cleanPrefix) return text;
  if (text.toUpperCase().startsWith(cleanPrefix.toUpperCase())) return text;
  return `${cleanPrefix}${text}`;
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

const ensureWrappingDrawframeNotebookTable = async () => {
  await client.query(`CREATE SCHEMA IF NOT EXISTS wrapping`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS wrapping.drawframe_notebook (
      id BIGSERIAL PRIMARY KEY,
      entry_id TEXT,
      serial_no INTEGER,
      date_text TEXT,
      entry_date DATE,
      source_id TEXT,
      mac_name TEXT,
      shift TEXT,
      std_hank TEXT,
      avg_hank NUMERIC(12,3),
      sd NUMERIC(12,3),
      cv TEXT,
      user_name TEXT,
      remark TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    ALTER TABLE wrapping.drawframe_notebook
      ADD COLUMN IF NOT EXISTS entry_id TEXT,
      ADD COLUMN IF NOT EXISTS serial_no INTEGER,
      ADD COLUMN IF NOT EXISTS date_text TEXT,
      ADD COLUMN IF NOT EXISTS entry_date DATE,
      ADD COLUMN IF NOT EXISTS source_id TEXT,
      ADD COLUMN IF NOT EXISTS mac_name TEXT,
      ADD COLUMN IF NOT EXISTS shift TEXT,
      ADD COLUMN IF NOT EXISTS std_hank TEXT,
      ADD COLUMN IF NOT EXISTS avg_hank NUMERIC(12,3),
      ADD COLUMN IF NOT EXISTS sd NUMERIC(12,3),
      ADD COLUMN IF NOT EXISTS cv TEXT,
      ADD COLUMN IF NOT EXISTS user_name TEXT,
      ADD COLUMN IF NOT EXISTS remark TEXT;
  `);

  await client.query(`
    ALTER TABLE wrapping.drawframe_notebook
      DROP COLUMN IF EXISTS serial_no;
  `);
  await client.query(`
    ALTER TABLE wrapping.drawframe_notebook
      ALTER COLUMN avg_hank TYPE NUMERIC(12,3),
      ALTER COLUMN sd TYPE NUMERIC(12,3);
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS wrapping_drawframe_notebook_entry_id_uq
    ON wrapping.drawframe_notebook (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS wrapping_drawframe_notebook_entry_date_idx
    ON wrapping.drawframe_notebook (entry_date DESC, id DESC);
  `);
};

const ensureWrappingAPercentTable = async () => {
  await client.query(`CREATE SCHEMA IF NOT EXISTS wrapping`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS wrapping.a_percent (
      id BIGSERIAL PRIMARY KEY,
      entry_id TEXT,
      entry_type TEXT,
      schema_name TEXT,
      table_name TEXT,
      pdf_file TEXT,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      sample_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      summary_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      raw_ocr_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    ALTER TABLE wrapping.a_percent
      ADD COLUMN IF NOT EXISTS entry_id TEXT,
      ADD COLUMN IF NOT EXISTS entry_type TEXT,
      ADD COLUMN IF NOT EXISTS schema_name TEXT,
      ADD COLUMN IF NOT EXISTS table_name TEXT,
      ADD COLUMN IF NOT EXISTS pdf_file TEXT,
      ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS sample_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS summary_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS raw_ocr_rows JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS wrapping_a_percent_entry_id_uq
    ON wrapping.a_percent (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS wrapping_a_percent_created_at_idx
    ON wrapping.a_percent (created_at DESC, id DESC);
  `);
};

const ensureWrappingStretchPercentTable = async () => {
  await client.query(`CREATE SCHEMA IF NOT EXISTS wrapping`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS wrapping.stretch_percent (
      id BIGSERIAL PRIMARY KEY,
      entry_id TEXT,
      entry_type TEXT,
      schema_name TEXT,
      table_name TEXT,
      pdf_file TEXT,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      sample_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      summary_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      raw_ocr_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    ALTER TABLE wrapping.stretch_percent
      ADD COLUMN IF NOT EXISTS entry_id TEXT,
      ADD COLUMN IF NOT EXISTS entry_type TEXT,
      ADD COLUMN IF NOT EXISTS schema_name TEXT,
      ADD COLUMN IF NOT EXISTS table_name TEXT,
      ADD COLUMN IF NOT EXISTS pdf_file TEXT,
      ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS sample_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS summary_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS raw_ocr_rows JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS wrapping_stretch_percent_entry_id_uq
    ON wrapping.stretch_percent (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS wrapping_stretch_percent_created_at_idx
    ON wrapping.stretch_percent (created_at DESC, id DESC);
  `);
};

const ensureWrappingComberNoilPercentTable = async () => {
  await client.query(`CREATE SCHEMA IF NOT EXISTS wrapping`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS wrapping.comber_noil_percent (
      id BIGSERIAL PRIMARY KEY,
      entry_id TEXT,
      entry_type TEXT,
      schema_name TEXT,
      table_name TEXT,
      pdf_file TEXT,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      sample_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      summary_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      raw_ocr_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    ALTER TABLE wrapping.comber_noil_percent
      ADD COLUMN IF NOT EXISTS entry_id TEXT,
      ADD COLUMN IF NOT EXISTS entry_type TEXT,
      ADD COLUMN IF NOT EXISTS schema_name TEXT,
      ADD COLUMN IF NOT EXISTS table_name TEXT,
      ADD COLUMN IF NOT EXISTS pdf_file TEXT,
      ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS sample_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS summary_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS raw_ocr_rows JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS wrapping_comber_noil_percent_entry_id_uq
    ON wrapping.comber_noil_percent (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS wrapping_comber_noil_percent_created_at_idx
    ON wrapping.comber_noil_percent (created_at DESC, id DESC);
  `);
};

// These Draw Frame tables store created_at/updated_at as `timestamp WITHOUT time zone` with a
// bare CURRENT_TIMESTAMP default — on this DB, that silently writes a different offset than what
// gets displayed back, shifting "Created At" by several hours (sometimes onto the wrong calendar
// day) in Custom Report. Same root cause and same fix as Comber's equivalent tables: convert to
// timestamptz so new rows store an unambiguous absolute instant.
const ensureDrawframeTimestampColumnsHaveTimezone = async () => {
  const columnsByTable = {
    yarn_cv_percent: ['created_at'],
    yarn_cv_yard_results: ['created_at'],
    drawframe_qc_header: ['created_at'],
    cots_data_entry: ['created_at'],
    cots_breaker_data: ['created_at'],
    cots_finisher_data: ['created_at'],
    u_data_entry: ['created_at']
  };
  for (const [table, columns] of Object.entries(columnsByTable)) {
    for (const column of columns) {
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'drawframe' AND table_name = '${table}' AND column_name = '${column}'
              AND data_type = 'timestamp without time zone'
          ) THEN
            ALTER TABLE drawframe.${table}
              ALTER COLUMN ${column} TYPE timestamptz USING ${column} AT TIME ZONE 'UTC';
            ALTER TABLE drawframe.${table}
              ALTER COLUMN ${column} SET DEFAULT now();
          END IF;
        END $$;
      `);
    }
  }
};

const ensureDrawframeEntryIdColumns = async () => {
  await client.query(`CREATE SCHEMA IF NOT EXISTS drawframe`);
  await ensureDrawframeTimestampColumnsHaveTimezone();

  await client.query(`
    ALTER TABLE drawframe.yarn_cv_percent
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    ALTER TABLE drawframe.yarn_cv_percent
      ALTER COLUMN s_no DROP NOT NULL;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS yarn_cv_percent_entry_id_uq
    ON drawframe.yarn_cv_percent (entry_id)
    WHERE entry_id IS NOT NULL;
  `);
  // The form collects however many individual 1 Yard/1/2 Yard readings the user enters (N, not
  // fixed), used to compute the avg/hank/sd/cv summary stats — but only the summary was ever
  // saved, so Custom Report could never show the individual readings themselves.
  await client.query(`
    ALTER TABLE drawframe.yarn_cv_percent
      ADD COLUMN IF NOT EXISTS readings JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  await client.query(`
    ALTER TABLE drawframe.cots_data_entry
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    ALTER TABLE drawframe.cots_breaker_data
      ALTER COLUMN thick_place DROP NOT NULL;
  `);
  await client.query(`
    ALTER TABLE drawframe.cots_finisher_data
      ALTER COLUMN thick_place DROP NOT NULL;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS cots_data_entry_entry_id_uq
    ON drawframe.cots_data_entry (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    ALTER TABLE drawframe.u_data_entry
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS drawframe_u_data_entry_entry_id_uq
    ON drawframe.u_data_entry (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    ALTER TABLE drawframe.drawframe_qc_header
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS drawframe_qc_header_entry_id_uq
    ON drawframe.drawframe_qc_header (entry_id)
    WHERE entry_id IS NOT NULL;
  `);
  // PP - Finisher Drawing shares this table with PP - Breaker Drawing (distinguished by
  // entry_scope) but submits its own extra fields that Breaker doesn't have — add them so the
  // Finisher form's data actually gets saved instead of being silently dropped.
  await client.query(`
    ALTER TABLE drawframe.drawframe_qc_header
      ADD COLUMN IF NOT EXISTS insert_size NUMERIC,
      ADD COLUMN IF NOT EXISTS web_funnel_size NUMERIC,
      ADD COLUMN IF NOT EXISTS delivery_hank NUMERIC,
      ADD COLUMN IF NOT EXISTS scanning_rolls_size VARCHAR(255);
  `);
  // drawframe_qc_header never had its own "operator" column at all — PP Breaker/Finisher
  // Drawing's operator has always depended entirely on the separate submitted-notebook
  // recording flow, which has proven fragile (some entries never got recorded, leaving Operator
  // blank in Custom Report with no fallback). Persist it directly on the row too.
  await client.query(`
    ALTER TABLE drawframe.drawframe_qc_header
      ADD COLUMN IF NOT EXISTS operator TEXT;
  `);

  await client.query(`
    ALTER TABLE drawframe.finisher_drawing_inspection
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS finisher_drawing_inspection_entry_id_uq
    ON drawframe.finisher_drawing_inspection (entry_id)
    WHERE entry_id IS NOT NULL;
  `);
};

const ensureDrawframeWheelChangeTable = async () => {
  await client.query(`CREATE SCHEMA IF NOT EXISTS drawframe`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS drawframe.wheel_change (
      id BIGSERIAL PRIMARY KEY,
      entry_id TEXT,
      type TEXT NOT NULL DEFAULT 'Wheel Change',
      line_type TEXT,
      wheel_change_type TEXT,
      wheel_change_type_label TEXT,
      entry_date DATE,
      parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
      rows JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    ALTER TABLE drawframe.wheel_change
      ADD COLUMN IF NOT EXISTS entry_id TEXT,
      ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'Wheel Change',
      ADD COLUMN IF NOT EXISTS line_type TEXT,
      ADD COLUMN IF NOT EXISTS wheel_change_type TEXT,
      ADD COLUMN IF NOT EXISTS wheel_change_type_label TEXT,
      ADD COLUMN IF NOT EXISTS entry_date DATE,
      ADD COLUMN IF NOT EXISTS parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS rows JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS drawframe_wheel_change_entry_id_uq
    ON drawframe.wheel_change (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS drawframe_wheel_change_entry_date_idx
    ON drawframe.wheel_change (entry_date DESC, id DESC);
  `);
};

const normalizeJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
};

const normalizeJsonObject = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const normalizeWheelChangeParameters = (payload = {}) => {
  const parameters = normalizeJsonArray(payload.parameters ?? payload.parameter_rows ?? payload.parameterRows);
  if (parameters.length) return parameters;

  const rowMap = normalizeJsonObject(payload.rows);
  return Object.values(rowMap).filter((row) => row && typeof row === 'object');
};

const normalizeWheelChangeRows = (payload = {}, parameters = []) => {
  const rowMap = normalizeJsonObject(payload.rows);
  if (Object.keys(rowMap).length) return rowMap;

  return parameters.reduce((acc, row) => {
    if (row && typeof row === 'object' && row.key) {
      acc[row.key] = row;
    }
    return acc;
  }, {});
};

const hydrateWheelChangeRow = (row) => {
  const parameters = Array.isArray(row.parameters)
    ? row.parameters
    : normalizeWheelChangeParameters({ parameters: row.parameters, rows: row.rows });
  const rows = normalizeWheelChangeRows({ rows: row.rows }, parameters);
  return {
    ...row,
    parameters,
    rows
  };
};

const saveWrappingAPercent = async (req, res, next) => {
  try {
    await ensureWrappingAPercentTable();

    const payload = req.body || {};
    const sampleRows = normalizeJsonArray(payload.sample_rows ?? payload.sampleRows);
    const summaryRows = normalizeJsonArray(payload.summary_rows ?? payload.summaryRows);
    const rows = normalizeJsonArray(payload.rows);
    const rawOcrRows = normalizeJsonArray(payload.raw_ocr_rows ?? payload.rawOcrRows);

    if (!sampleRows.length && !summaryRows.length && !rows.length && !rawOcrRows.length) {
      return res.status(400).json({ message: 'OCR rows are required' });
    }

    const result = await client.query(
      `INSERT INTO wrapping.a_percent (
        entry_id, entry_type, schema_name, table_name, pdf_file,
        meta, sample_rows, summary_rows, rows, raw_ocr_rows
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb)
      RETURNING *`,
      [
        payload.entry_id ?? null,
        payload.entry_type ?? 'A%',
        payload.schema_name ?? 'wrapping',
        payload.table_name ?? 'a_percent',
        payload.pdf_file ?? payload.pdfFile ?? null,
        JSON.stringify(normalizeJsonObject(payload.meta)),
        JSON.stringify(sampleRows),
        JSON.stringify(summaryRows),
        JSON.stringify(rows),
        JSON.stringify(rawOcrRows)
      ]
    );

    return res.status(201).json({
      message: 'A% OCR data saved successfully',
      data: withScreenEntryId('wrapping_a_percent', result.rows[0])
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(error);
  }
};

const getWrappingAPercent = async (req, res, next) => {
  try {
    await ensureWrappingAPercentTable();

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 50);
    const offset = (page - 1) * limit;

    const result = await client.query(
      `SELECT *
       FROM wrapping.a_percent
       ORDER BY created_at DESC, id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await client.query(`SELECT COUNT(*) FROM wrapping.a_percent`);

    return res.status(200).json({
      page,
      limit,
      total: parseInt(countResult.rows[0].count, 10),
      data: result.rows.map((row) => withScreenEntryId('wrapping_a_percent', row))
    });
  } catch (error) {
    if (isDatabaseAccessDenied(error)) {
      const databaseName = process.env.MSSQL_PREP_DATABASE || 'dsmprojects';
      const userName = process.env.MSSQL_PREP_USER || process.env.MSSQL_USER || 'configured SQL user';
      return res.status(403).json({
        message: `SQL Server user "${userName}" does not have SELECT access to ${databaseName}.dbo.prepvariety`,
        required_permission: `GRANT SELECT ON ${databaseName}.dbo.prepvariety`,
        database: databaseName,
        table: 'dbo.prepvariety'
      });
    }
    next(error);
  }
};

const saveWrappingStretchPercent = async (req, res, next) => {
  try {
    await ensureWrappingStretchPercentTable();

    const payload = req.body || {};
    const sampleRows = normalizeJsonArray(payload.sample_rows ?? payload.sampleRows);
    const summaryRows = normalizeJsonArray(payload.summary_rows ?? payload.summaryRows);
    const rows = normalizeJsonArray(payload.rows);
    const rawOcrRows = normalizeJsonArray(payload.raw_ocr_rows ?? payload.rawOcrRows);

    if (!sampleRows.length && !summaryRows.length && !rows.length && !rawOcrRows.length) {
      return res.status(400).json({ message: 'OCR rows are required' });
    }

    const result = await client.query(
      `INSERT INTO wrapping.stretch_percent (
        entry_id, entry_type, schema_name, table_name, pdf_file,
        meta, sample_rows, summary_rows, rows, raw_ocr_rows
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb)
      RETURNING *`,
      [
        payload.entry_id ?? null,
        payload.entry_type ?? 'Stretch Percent',
        payload.schema_name ?? 'wrapping',
        payload.table_name ?? 'stretch_percent',
        payload.pdf_file ?? payload.pdfFile ?? null,
        JSON.stringify(normalizeJsonObject(payload.meta)),
        JSON.stringify(sampleRows),
        JSON.stringify(summaryRows),
        JSON.stringify(rows),
        JSON.stringify(rawOcrRows)
      ]
    );

    return res.status(201).json({
      message: 'Stretch Percent OCR data saved successfully',
      data: withScreenEntryId('wrapping_stretch_percent', result.rows[0])
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(error);
  }
};

const getWrappingStretchPercent = async (req, res, next) => {
  try {
    await ensureWrappingStretchPercentTable();

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 50);
    const offset = (page - 1) * limit;

    const result = await client.query(
      `SELECT *
       FROM wrapping.stretch_percent
       ORDER BY created_at DESC, id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await client.query(`SELECT COUNT(*) FROM wrapping.stretch_percent`);

    return res.status(200).json({
      page,
      limit,
      total: parseInt(countResult.rows[0].count, 10),
      data: result.rows.map((row) => withScreenEntryId('wrapping_stretch_percent', row))
    });
  } catch (error) {
    next(error);
  }
};

const saveWrappingComberNoilPercent = async (req, res, next) => {
  try {
    await ensureWrappingComberNoilPercentTable();

    const payload = req.body || {};
    const sampleRows = normalizeJsonArray(payload.sample_rows ?? payload.sampleRows);
    const summaryRows = normalizeJsonArray(payload.summary_rows ?? payload.summaryRows);
    const rows = normalizeJsonArray(payload.rows);
    const rawOcrRows = normalizeJsonArray(payload.raw_ocr_rows ?? payload.rawOcrRows);

    if (!sampleRows.length && !summaryRows.length && !rows.length && !rawOcrRows.length) {
      return res.status(400).json({ message: 'OCR rows are required' });
    }

    const result = await client.query(
      `INSERT INTO wrapping.comber_noil_percent (
        entry_id, entry_type, schema_name, table_name, pdf_file,
        meta, sample_rows, summary_rows, rows, raw_ocr_rows
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb)
      RETURNING *`,
      [
        payload.entry_id ?? null,
        payload.entry_type ?? 'Comber Noil Percent',
        payload.schema_name ?? 'wrapping',
        payload.table_name ?? 'comber_noil_percent',
        payload.pdf_file ?? payload.pdfFile ?? null,
        JSON.stringify(normalizeJsonObject(payload.meta)),
        JSON.stringify(sampleRows),
        JSON.stringify(summaryRows),
        JSON.stringify(rows),
        JSON.stringify(rawOcrRows)
      ]
    );

    return res.status(201).json({
      message: 'Comber Noil Percent OCR data saved successfully',
      data: withScreenEntryId('wrapping_comber_noil_percent', result.rows[0])
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(error);
  }
};

const getWrappingComberNoilPercent = async (req, res, next) => {
  try {
    await ensureWrappingComberNoilPercentTable();

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 50);
    const offset = (page - 1) * limit;

    const result = await client.query(
      `SELECT *
       FROM wrapping.comber_noil_percent
       ORDER BY created_at DESC, id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await client.query(`SELECT COUNT(*) FROM wrapping.comber_noil_percent`);

    return res.status(200).json({
      page,
      limit,
      total: parseInt(countResult.rows[0].count, 10),
      data: result.rows.map((row) => withScreenEntryId('wrapping_comber_noil_percent', row))
    });
  } catch (error) {
    next(error);
  }
};

const saveWrappingDrawframeNotebook = async (req, res, next) => {
  try {
    await ensureWrappingDrawframeNotebookTable();

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
        `INSERT INTO wrapping.drawframe_notebook (
          entry_id, date_text, entry_date, source_id, mac_name,
          shift, std_hank, avg_hank, sd, cv, user_name, remark
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *`,
        [
          row.entry_id ?? null,
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
      savedRows.push(withScreenEntryId('wrapping_drawframe_notebook', result.rows[0]));
    }

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Wrapping drawframe notebook data saved successfully',
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

const getWrappingDrawframeNotebook = async (req, res, next) => {
  try {
    await ensureWrappingDrawframeNotebookTable();

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
       FROM wrapping.drawframe_notebook
       ${whereClause}
       ORDER BY COALESCE(entry_date, created_at::date) DESC, id DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...values, limit, offset]
    );

    const countResult = await client.query(
      `SELECT COUNT(*)
       FROM wrapping.drawframe_notebook
       ${whereClause}`,
      values
    );

    return res.status(200).json({
      page,
      limit,
      total: parseInt(countResult.rows[0].count, 10),
      data: result.rows.map((row) => withScreenEntryId('wrapping_drawframe_notebook', row))
    });
  } catch (error) {
    next(error);
  }
};

router.post('/wrapping-drawframe-notebook', saveWrappingDrawframeNotebook);
router.get('/wrapping-drawframe-notebook', getWrappingDrawframeNotebook);
router.post('/wrapping/drawframe-notebook', saveWrappingDrawframeNotebook);
router.get('/wrapping/drawframe-notebook', getWrappingDrawframeNotebook);
router.post('/drawframe-notebook/wrapping', saveWrappingDrawframeNotebook);
router.get('/drawframe-notebook/wrapping', getWrappingDrawframeNotebook);

router.post('/a-percent', saveWrappingAPercent);
router.get('/a-percent', getWrappingAPercent);
router.post('/a-percent-inspection', saveWrappingAPercent);
router.get('/a-percent-inspection', getWrappingAPercent);
router.post('/wrapping/a-percent', saveWrappingAPercent);
router.get('/wrapping/a-percent', getWrappingAPercent);
router.post('/wrapping/drawframe/a-percent', saveWrappingAPercent);
router.get('/wrapping/drawframe/a-percent', getWrappingAPercent);

router.post('/stretch-percent', saveWrappingStretchPercent);
router.get('/stretch-percent', getWrappingStretchPercent);
router.post('/stretch-percent-inspection', saveWrappingStretchPercent);
router.get('/stretch-percent-inspection', getWrappingStretchPercent);
router.post('/stretch-percentage', saveWrappingStretchPercent);
router.get('/stretch-percentage', getWrappingStretchPercent);
router.post('/wrapping/stretch-percent', saveWrappingStretchPercent);
router.get('/wrapping/stretch-percent', getWrappingStretchPercent);
router.post('/wrapping/stretch-percentage', saveWrappingStretchPercent);
router.get('/wrapping/stretch-percentage', getWrappingStretchPercent);
router.post('/wrapping/drawframe/stretch-percent', saveWrappingStretchPercent);
router.get('/wrapping/drawframe/stretch-percent', getWrappingStretchPercent);

router.post('/comber-noil-percent', saveWrappingComberNoilPercent);
router.get('/comber-noil-percent', getWrappingComberNoilPercent);
router.post('/comber-noil-percent-inspection', saveWrappingComberNoilPercent);
router.get('/comber-noil-percent-inspection', getWrappingComberNoilPercent);
router.post('/noil-percent', saveWrappingComberNoilPercent);
router.get('/noil-percent', getWrappingComberNoilPercent);
router.post('/noils-percent', saveWrappingComberNoilPercent);
router.get('/noils-percent', getWrappingComberNoilPercent);
router.post('/wrapping/comber-noil-percent', saveWrappingComberNoilPercent);
router.get('/wrapping/comber-noil-percent', getWrappingComberNoilPercent);
router.post('/wrapping/noil-percent', saveWrappingComberNoilPercent);
router.get('/wrapping/noil-percent', getWrappingComberNoilPercent);
router.post('/wrapping/noils-percent', saveWrappingComberNoilPercent);
router.get('/wrapping/noils-percent', getWrappingComberNoilPercent);
router.post('/wrapping/drawframe/comber-noil-percent', saveWrappingComberNoilPercent);
router.get('/wrapping/drawframe/comber-noil-percent', getWrappingComberNoilPercent);

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
       FROM MCMASTER m
       JOIN dept_mai d ON m.DEPTCODE = d.DEPTCODE
       WHERE m.compcode = '1'
         AND m.mcclose = '0'
         AND (@prefix = '' OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @machinePrefix)
       ORDER BY d.DEPTNAME, m.MCNAME`,
      { prefix, machinePrefix: likeToken }
    );

    return res.status(200).json({
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

const getDrawframeMachineNumbers = async (req, res, next) => {
  try {
    const prefix = String(req.query.prefix || '').trim();
    const yarnCvPrefix = String(
      req.query.yarn_cv_prefix || process.env.DRAWFRAME_YARN_CV_PREFIX || 'FR'
    ).trim();
    const deptCode = String(req.query.dept_code || '').trim();
    const deptName = String(req.query.dept_name || '').trim();
    const likeToken = `%${prefix}%`;

    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const result = await sqlServer.query(
      `SELECT
         LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) AS machine_number,
         CAST(m.MCCODE AS VARCHAR(50)) AS mc_no,
         CAST(m.DEPTCODE AS VARCHAR(50)) AS dept_code,
         LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) AS dept_name
       FROM MCMASTER m
       JOIN dept_mai d ON m.DEPTCODE = d.DEPTCODE
       WHERE m.compcode = '1'
         AND m.mcclose = '0'
         AND (@prefix = '' OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @machinePrefix)
         AND (
           @yarnCvPrefix = ''
           OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @yarnCvLike
         )
         AND LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE 'FR%'
         AND (
           LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @frLike1
           OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @frLike2
           OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @frLike3
           OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @frLike4
         )
         AND (@deptCode = '' OR CAST(m.DEPTCODE AS VARCHAR(50)) = @deptCode)
         AND (@deptName = '' OR LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) = @deptName)
       ORDER BY d.DEPTNAME, m.MCCODE, m.MCNAME`,
      {
        prefix,
        machinePrefix: likeToken,
        yarnCvPrefix,
        yarnCvLike: `${yarnCvPrefix}%`,
        frLike1: DRAWFRAME_FR_ALLOWED_LIKE[0],
        frLike2: DRAWFRAME_FR_ALLOWED_LIKE[1],
        frLike3: DRAWFRAME_FR_ALLOWED_LIKE[2],
        frLike4: DRAWFRAME_FR_ALLOWED_LIKE[3],
        deptCode,
        deptName
      }
    );

    let data = (result.recordset || []).map((r) => ({
      machine_number: String(r.machine_number || '').trim(),
      mc_no: String(r.mc_no || '').trim(),
      dept_code: String(r.dept_code || '').trim(),
      dept_name: String(r.dept_name || '').trim()
    })).filter((r) => r.machine_number);

    const existing = new Set(data.map((r) => r.machine_number.toUpperCase()));
    for (const name of DRAWFRAME_FR_FIXED_MACHINES) {
      if (!existing.has(name.toUpperCase())) {
        data.push({
          machine_number: name,
          mc_no: '',
          dept_code: '',
          dept_name: ''
        });
      }
    }

    data.sort((a, b) => a.machine_number.localeCompare(b.machine_number, undefined, { sensitivity: 'base' }));

    return res.status(200).json({
      source: 'sqlserver',
      yarn_cv_prefix: yarnCvPrefix,
      machine_numbers: data.map((r) => r.machine_number),
      data
    });
  } catch (error) {
    next(error);
  }
};

router.get('/yarn-cv/machine-numbers', getDrawframeMachineNumbers);
router.get('/machine-numbers', getDrawframeMachineNumbers);

const getDrawframeUqcMasterDropdown = async (req, res, next) => {
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
           AND m.mcclose = '0'
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
    const mcNos = (mcResult.recordset || []).map((r) => {
      const mc_no = String(r.mc_no || '').trim();
      const mc_name = String(r.mc_name || '').trim();
      const full_mc_no = mc_no && mc_name ? `${mc_no}/${mc_name}` : mc_no || mc_name;
      return {
        mc_no,
        mc_name,
        full_mc_no,
        dept_code: String(r.dept_code || '').trim(),
        dept_name: String(r.dept_name || '').trim()
      };
    }).filter((r) => r.full_mc_no);

    const shifts = [
      { value: 'General', label: 'General' },
      { value: 'Day', label: 'Day' },
      { value: 'Halfnight', label: 'Halfnight' },
      { value: 'Fullnight', label: 'Fullnight' }
    ];

    const shiftOptions = [{ text: '-- Select Shift --', value: '' }, ...shifts.map((s) => ({ text: s.label, value: s.value }))];
    const varietyOptions = [{ text: '-- Select Variety --', value: '' }, ...varieties.map((v) => ({ text: v.variety_name, value: v.variety_name }))];
    const departmentOptions = [{ text: '-- Select Department --', value: '' }, ...departments.map((d) => ({ text: d.dept_name, value: d.dept_name }))];
    const mcNoOptions = [
      { text: '-- Select MC No. --', label: '-- Select MC No. --', value: '' },
      ...mcNos.map((m) => ({
        text: m.mc_name || m.full_mc_no,
        label: m.mc_name || m.full_mc_no,
        value: m.full_mc_no,
        mc_no: m.mc_no,
        mc_name: m.mc_name,
        full_mc_no: m.full_mc_no,
        dept_code: m.dept_code,
        dept_name: m.dept_name
      }))
    ];

    if (req.path.endsWith('/varieties')) {
      return res.status(200).json({
        source: 'sqlserver',
        database: process.env.MSSQL_PREP_DATABASE || 'dsmprojects',
        table: 'dbo.prepvariety',
        data: varieties,
        names: varieties.map((r) => r.variety_name),
        variety_names: varieties.map((r) => r.variety_name),
        values: varieties.map((r) => r.variety_name),
        options: varietyOptions
      });
    }

    if (req.path.endsWith('/departments')) {
      return res.status(200).json({
        source: 'sqlserver',
        data: departments,
        names: departments.map((r) => r.dept_name),
        department_names: departments.map((r) => r.dept_name),
        values: departments.map((r) => r.dept_name),
        options: departmentOptions
      });
    }

    const isMcNoRequest = ['/mc-nos', '/mc-no', '/machine-nos', '/machine-numbers']
      .some((suffix) => req.path.endsWith(suffix));

    if (isMcNoRequest) {
      return res.status(200).json({
        source: 'sqlserver',
        data: mcNos,
        names: mcNos.map((r) => r.mc_name || r.full_mc_no),
        mc_nos: mcNos,
        mc_no_values: mcNos.map((r) => r.full_mc_no),
        values: mcNos.map((r) => r.full_mc_no),
        options: mcNoOptions
      });
    }

    return res.status(200).json({
      source: 'sqlserver',
      variety_source: 'dsmprojects.dbo.prepvariety',
      shifts,
      shift_values: shifts.map((s) => s.value),
      varieties,
      variety_names: varieties.map((r) => r.variety_name),
      departments,
      department_names: departments.map((r) => r.dept_name),
      mc_nos: mcNos,
      mc_no_values: mcNos.map((r) => r.full_mc_no),
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
};

const getEmployeeMasterDropdown = createEmployeeMasterDropdown(sqlServer, 'drawframe');
const getDrawframePrepVarietyDropdown = async (req, res, next) => {
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
      varieties: data.map((row) => row.variety_name),
      variety_names: data.map((row) => row.variety_name),
      values: data.map((row) => row.variety_name),
      options: [
        { text: '-- Select Variety --', value: '' },
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
router.get('/master/dropdown', getDrawframeUqcMasterDropdown);
router.get('/master/varieties', getDrawframeUqcMasterDropdown);
router.get('/master/departments', getDrawframeUqcMasterDropdown);
router.get('/master/mc-nos', getDrawframeUqcMasterDropdown);
router.get('/master/mc-no', getDrawframeUqcMasterDropdown);
router.get('/master/machine-nos', getDrawframeUqcMasterDropdown);
router.get('/master/machine-numbers', getDrawframeUqcMasterDropdown);
router.get('/master/employees', getEmployeeMasterDropdown);
router.get('/master/employee-dropdown', getEmployeeMasterDropdown);
router.get('/master/employee-names', getEmployeeMasterDropdown);
router.get('/master/user-names', getEmployeeMasterDropdown);
router.get('/uqc/master/dropdown', getDrawframeUqcMasterDropdown);
router.get('/uqc/master/varieties', getDrawframeUqcMasterDropdown);
router.get('/uqc/master/departments', getDrawframeUqcMasterDropdown);
router.get('/uqc/master/mc-nos', getDrawframeUqcMasterDropdown);
router.get('/uqc/master/mc-no', getDrawframeUqcMasterDropdown);
router.get('/uqc/master/machine-nos', getDrawframeUqcMasterDropdown);
router.get('/uqc/master/machine-numbers', getDrawframeUqcMasterDropdown);
router.get('/uqc/master/employees', getEmployeeMasterDropdown);
router.get('/uqc/master/employee-dropdown', getEmployeeMasterDropdown);
router.get('/uqc/master/employee-names', getEmployeeMasterDropdown);
router.get('/wheel-change/master/varieties', getDrawframePrepVarietyDropdown);
router.get('/wheel-change/master/mixings', getDrawframePrepVarietyDropdown);
router.get('/wheel-change/master/mixing-dropdown', getDrawframePrepVarietyDropdown);
router.get('/wheel-change/master/dropdown', getDrawframePrepVarietyDropdown);

router.get('/cots/machine-numbers', async (req, res, next) => {
  try {
    const subType = String(req.query.sub_type || '').trim();
    const prefix = String(req.query.prefix || '').trim();
    const deptCode = String(req.query.dept_code || '').trim();
    const deptName = String(req.query.dept_name || '').trim();
    const likeToken = `%${prefix}%`;

    const breakerPrefix = String(process.env.DRAWFRAME_BREAKER_PREFIX || 'BR').trim();
    const finisherPrefix = String(process.env.DRAWFRAME_FINISHER_PREFIX || 'FR').trim();

    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    let typeFilter = '';
    const params = { prefix, machinePrefix: likeToken, deptCode, deptName };

    if (/^breaker$/i.test(subType)) {
      typeFilter = ` AND LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @typePrefix `;
      params.typePrefix = `${breakerPrefix}%`;
    } else if (/^finisher$/i.test(subType)) {
      typeFilter = `
        AND LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @typePrefix
        AND (
          LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @frLike1
          OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @frLike2
          OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @frLike3
          OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @frLike4
        )
      `;
      params.typePrefix = `${finisherPrefix}%`;
      params.frLike1 = DRAWFRAME_FR_ALLOWED_LIKE[0];
      params.frLike2 = DRAWFRAME_FR_ALLOWED_LIKE[1];
      params.frLike3 = DRAWFRAME_FR_ALLOWED_LIKE[2];
      params.frLike4 = DRAWFRAME_FR_ALLOWED_LIKE[3];
    }

    const baseQuery = `SELECT
         CAST(m.MCCODE AS VARCHAR(50)) AS mc_no,
         LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) AS mc_name,
         CAST(m.DEPTCODE AS VARCHAR(50)) AS dept_code,
         LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) AS dept_name
       FROM MCMASTER m
       JOIN dept_mai d ON m.DEPTCODE = d.DEPTCODE
       WHERE m.compcode = '1'
         AND m.mcclose = '0'
         AND (@prefix = '' OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @machinePrefix)
         AND (@deptCode = '' OR CAST(m.DEPTCODE AS VARCHAR(50)) = @deptCode)
         AND (@deptName = '' OR LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) = @deptName)
         %TYPE_FILTER%
       ORDER BY d.DEPTNAME, m.MCCODE, m.MCNAME`;

    let result = await sqlServer.query(
      baseQuery.replace('%TYPE_FILTER%', typeFilter),
      params
    );

    // Fallback for breaker: if SQL names are not BR-prefixed, fetch machines without type filter
    // and normalize display with BR prefix so UI still receives breaker machine numbers.
    if (/^breaker$/i.test(subType) && (!result.recordset || result.recordset.length === 0)) {
      result = await sqlServer.query(
        baseQuery.replace('%TYPE_FILTER%', ''),
        { prefix, machinePrefix: likeToken, deptCode, deptName }
      );
    }

    const isBreaker = /^breaker$/i.test(subType);
    let data = (result.recordset || []).map((r) => ({
      mc_no: String(r.mc_no || '').trim(),
      mc_name: isBreaker
        ? ensurePrefix(r.mc_name || r.mc_no, breakerPrefix)
        : String(r.mc_name || '').trim(),
      dept_code: String(r.dept_code || '').trim(),
      dept_name: String(r.dept_name || '').trim()
    })).filter((r) => r.mc_name);

    if (/^finisher$/i.test(subType)) {
      const existing = new Set(data.map((r) => r.mc_name.toUpperCase()));
      for (const name of DRAWFRAME_FR_FIXED_MACHINES) {
        if (!existing.has(name.toUpperCase())) {
          data.push({
            mc_no: '',
            mc_name: name,
            dept_code: '',
            dept_name: ''
          });
        }
      }
      data.sort((a, b) => a.mc_name.localeCompare(b.mc_name, undefined, { sensitivity: 'base' }));
    }

    return res.status(200).json({
      source: 'sqlserver',
      sub_type: subType || null,
      data,
      machine_numbers: data.map((r) => r.mc_name)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /drawframe/yarn-cv:
 *   post:
 *     summary: Create Yarn CV% entry with yard results
 *     description: Inserts Yarn CV% master data and corresponding 1 Yard and 1/2 Yard results
 *     tags: [Drawframe]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - entry_date
 *               - machine_number
 *               - num_readings
 *               - results
 *             properties:
 *               type:
 *                 type: string
 *                 example: Yarn CV% Calculation
 *               s_no:
 *                 type: string
 *                 example: DF-001
 *               entry_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-03-31"
 *               machine_number:
 *                 type: string
 *                 example: DF-01
 *               remarks:
 *                 type: string
 *                 example: Sample test
 *               num_readings:
 *                 type: integer
 *                 example: 2
 *               results:
 *                 type: object
 *                 required:
 *                   - avg_1yd
 *                   - hank_1yd
 *                   - sd_1yd
 *                   - cv_1yd
 *                   - avg_half
 *                   - hank_half
 *                   - sd_half
 *                   - cv_half
 *                 properties:
 *                   avg_1yd:
 *                     type: number
 *                     format: float
 *                     example: 5.305
 *                   hank_1yd:
 *                     type: number
 *                     format: float
 *                     example: 1.204
 *                   sd_1yd:
 *                     type: number
 *                     format: float
 *                     example: 0.157
 *                   cv_1yd:
 *                     type: number
 *                     format: float
 *                     example: 2.804
 *                   avg_half:
 *                     type: number
 *                     format: float
 *                     example: 2.654
 *                   hank_half:
 *                     type: number
 *                     format: float
 *                     example: 0.604
 *                   sd_half:
 *                     type: number
 *                     format: float
 *                     example: 0.103
 *                   cv_half:
 *                     type: number
 *                     format: float
 *                     example: 3.208
 *           example:
 *             type: Yarn CV% Calculation
 *             s_no: DF-001
 *             entry_date: "2026-03-31"
 *             machine_number: DF-01
 *             remarks: Sample test
 *             num_readings: 2
 *             results:
 *               avg_1yd: 5.305
 *               hank_1yd: 1.204
 *               sd_1yd: 0.157
 *               cv_1yd: 2.804
 *               avg_half: 2.654
 *               hank_half: 0.604
 *               sd_half: 0.103
 *               cv_half: 3.208
 *     responses:
 *       201:
 *         description: Yarn CV% entry saved successfully
 *         content:
 *           application/json:
 *             example:
 *               message: Saved successfully
 *               qc_id: 1
 *       400:
 *         description: Bad request (missing or invalid fields)
 *       500:
 *         description: Server error
 */
router.post('/yarn-cv', async (req, res) => {
    try {
        await ensureDrawframeEntryIdColumns();
        const {
            entry_id,
            type,
            s_no,
            entry_date,
            machine_number,
            remarks,
            num_readings,
            readings,
            results
        } = req.body;

        if (!entry_id) {
            return res.status(400).json({ message: "entry_id is required and must be unique" });
        }

        await client.query('BEGIN');

        const qc = await client.query(
            `INSERT INTO drawframe.yarn_cv_percent
            (entry_id, type, s_no, entry_date, machine_number, remarks, num_readings, readings)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
            RETURNING id`,
            [entry_id, type, s_no, entry_date, machine_number, remarks, num_readings, JSON.stringify(readings || {})]
        );

        const qc_id = qc.rows[0].id;

        await client.query(
            `INSERT INTO drawframe.yarn_cv_yard_results
            (qc_id, avg_1yd, hank_1yd, sd_1yd, cv_1yd,
             avg_half, hank_half, sd_half, cv_half)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
                qc_id,
                results.avg_1yd,
                results.hank_1yd,
                results.sd_1yd,
                results.cv_1yd,
                results.avg_half,
                results.hank_half,
                results.sd_half,
                results.cv_half
            ]
        );

        await client.query('COMMIT');

        res.status(201).json({
            message: "Saved successfully",
            qc_id,
            entry_id
        });

    } catch (err) {
        await client.query('ROLLBACK');
        if (isUniqueViolation(err)) {
            return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
        }
        console.error(err);
        res.status(500).json({ message: "Save failed" });
    }
});

/**
 * @swagger
 * /drawframe/yarn-cv:
 *   get:
 *     summary: Get all Yarn CV% entries with results
 *     tags: [Drawframe]
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
 *       500:
 *         description: Server error
 */
router.get('/yarn-cv', async (req, res) => {
    try {
        await ensureDrawframeEntryIdColumns();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const result = await client.query(
            `SELECT 
                qc.*,

                r.avg_1yd,
                r.hank_1yd,
                r.sd_1yd,
                r.cv_1yd,
                r.avg_half,
                r.hank_half,
                r.sd_half,
                r.cv_half

             FROM drawframe.yarn_cv_percent qc
             LEFT JOIN drawframe.yarn_cv_yard_results r
             ON qc.id = r.qc_id

             ORDER BY qc.entry_date DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        res.json(result.rows.map((row) => withScreenEntryId('yarn_cv', row)));

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * @swagger
 * /drawframe/cots:
 *   post:
 *     summary: Create Cots Data Entry (Breaker / Finisher)
 *     tags: [Drawframe]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
*           example:
*             entry_date: "2026-04-01"
*             shift: "General"
*             sub_type: "Breaker"
*             machines:
*               - mc_name: "MC-1"
*                 fan_waste: 10
*                 cot_change: 5
*                 stripper_w: 3
*               - mc_name: "MC-2"
*                 fan_waste: 11
*                 cot_change: 6
*                 stripper_w: 4
 *     responses:
 *       201:
 *         description: Saved successfully
 *       500:
 *         description: Server error
 */
router.post('/cots', async (req, res) => {
    try {
        await ensureDrawframeEntryIdColumns();
        const { entry_id, entry_date, shift, sub_type, machines } = req.body;

        if (!entry_id) {
            return res.status(400).json({ message: "entry_id is required and must be unique" });
        }

        await client.query('BEGIN');

        const entry = await client.query(
            `INSERT INTO drawframe.cots_data_entry
            (entry_id, entry_date, shift, sub_type)
            VALUES ($1,$2,$3,$4)
            RETURNING id`,
            [entry_id, entry_date, shift, sub_type]
        );

        const createdEntryId = entry.rows[0].id;

        for (let m of machines) {
            if (sub_type === 'Breaker') {
                await client.query(
                    `INSERT INTO drawframe.cots_breaker_data
                    (entry_id, mc_name, fan_waste, cot_change, stripper_w)
                    VALUES ($1,$2,$3,$4,$5)`,
                    [
                        createdEntryId,
                        ensurePrefix(m.mc_name, process.env.DRAWFRAME_BREAKER_PREFIX || 'BR'),
                        m.fan_waste,
                        m.cot_change,
                        m.stripper_w
                    ]
                );
            } else if (sub_type === 'Finisher') {
                await client.query(
                    `INSERT INTO drawframe.cots_finisher_data
                    (entry_id, mc_name, fan_waste, cot_change, stripper_w,
                     auto_level, silver_worn, main_tin, scanning)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                    [
                        createdEntryId,
                        m.mc_name,
                        m.fan_waste,
                        m.cot_change,
                        m.stripper_w,
                        m.auto_level,
                        m.silver_worn,
                        m.main_tin,
                        m.scanning
                    ]
                );
            }
        }

        await client.query('COMMIT');

        res.status(201).json({
            message: "Saved successfully",
            entry_id,
            screen_entry_id: formatScreenEntryId('cots', createdEntryId)
        });

    } catch (err) {
        await client.query('ROLLBACK');
        if (isUniqueViolation(err)) {
            return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
        }
        console.error(err);
        res.status(500).json({ message: "Save failed" });
    }
});

/**
 * @swagger
 * /drawframe/cots:
 *   get:
 *     summary: Get all Cots entries (Breaker / Finisher)
 *     tags: [Drawframe]
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
 *         description: List of Cots entries
 *         content:
 *           application/json:
 *             example:
 *               - id: 1
 *                 entry_date: "2026-04-01"
 *                 shift: "General"
 *                 sub_type: "Breaker"
 *                 created_at: "2026-04-01T10:00:00.000Z"
 *               - id: 2
 *                 entry_date: "2026-04-01"
 *                 shift: "General"
 *                 sub_type: "Finisher"
 *                 created_at: "2026-04-01T11:00:00.000Z"
 *       500:
 *         description: Server error
 */
router.get('/cots', async (req, res) => {
    try {
        await ensureDrawframeEntryIdColumns();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // Each submission's per-machine readings live in a separate child table
        // (cots_breaker_data / cots_finisher_data, keyed by this header row's own `id`), never
        // joined here before — every field the user actually enters per machine (Fan Waste, Cot
        // Change, Stripper Waste, Auto Leveller, Sliver Monitor, Mass Thick Place, Scanning Roller
        // Area) was silently absent from every response. LATERAL-join both (only one is ever
        // populated per row, per sub_type) so nothing is lost.
        const result = await client.query(
            `SELECT qc.*,
                COALESCE(qcb.machines, '[]'::json) AS breaker_machines,
                COALESCE(qcf.machines, '[]'::json) AS finisher_machines
             FROM drawframe.cots_data_entry qc
             LEFT JOIN LATERAL (
                SELECT json_agg(json_build_object(
                    'mc_name', b.mc_name,
                    'fan_waste', b.fan_waste,
                    'cot_change', b.cot_change,
                    'stripper_w', b.stripper_w,
                    'thick_place', b.thick_place
                )) AS machines
                FROM drawframe.cots_breaker_data b
                WHERE b.entry_id = qc.id
             ) qcb ON true
             LEFT JOIN LATERAL (
                SELECT json_agg(json_build_object(
                    'mc_name', f.mc_name,
                    'fan_waste', f.fan_waste,
                    'cot_change', f.cot_change,
                    'stripper_w', f.stripper_w,
                    'auto_level', f.auto_level,
                    'silver_worn', f.silver_worn,
                    'main_tin', f.main_tin,
                    'scanning', f.scanning
                )) AS machines
                FROM drawframe.cots_finisher_data f
                WHERE f.entry_id = qc.id
             ) qcf ON true
             ORDER BY qc.entry_date DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const rows = result.rows.map((row) => {
            const { breaker_machines, finisher_machines, ...header } = row;
            const machines = header.sub_type === 'Breaker'
                ? breaker_machines
                : header.sub_type === 'Finisher'
                    ? finisher_machines
                    : [];
            return withScreenEntryId('cots', { ...header, machines });
        });

        res.json(rows);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});


/**
 * @swagger
 * /drawframe/uqc:
 *   post:
 *     summary: Create UQC (U% Data Entry)
 *     tags: [Drawframe]
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
 *               department:
 *                 type: string
 *                 example: "drawframe"
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
        await ensureDrawframeEntryIdColumns();
        console.log("UQC BODY:", req.body);

        const {
            entry_id,
            entry_type,
            entry_date,
            shift,
            variety,
            department,
            mc_no,
            u_percent,
            cvm,
            cvm_1m,
            cvm_3m,
            remarks
        } = req.body;

        if (!entry_id) {
            return res.status(400).json({ message: "entry_id is required and must be unique" });
        }

        // ✅ Validation
        if (!entry_type || !entry_date) {
            return res.status(400).json({
                message: "entry_type and entry_date are required"
            });
        }

        // ✅ Handle numeric safely
        const toNumber = (val) =>
            val === "" || val === undefined ? null : val;

        const result = await client.query(
            `INSERT INTO drawframe.u_data_entry
            (entry_id, entry_type, entry_date, shift, variety, department, mc_no,
             u_percent, cvm, cvm_1m, cvm_3m, remarks)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING *`,
            [
                entry_id,
                entry_type,
                entry_date,
                shift,
                variety,
                department,
                mc_no,
                toNumber(u_percent),
                toNumber(cvm),
                toNumber(cvm_1m),
                toNumber(cvm_3m),
                remarks
            ]
        );

        res.status(201).json({
            message: "UQC entry created successfully",
            data: withScreenEntryId('uqc', result.rows[0]),
            entry_id
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
 * /drawframe/uqc:
 *   get:
 *     summary: Get UQC entries with pagination
 *     tags: [Drawframe]
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
        await ensureDrawframeEntryIdColumns();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const dataQuery = `
            SELECT *
            FROM drawframe.u_data_entry
            ORDER BY entry_date DESC
            LIMIT $1 OFFSET $2
        `;

        const countQuery = `
            SELECT COUNT(*) FROM drawframe.u_data_entry
        `;

        const dataResult = await client.query(dataQuery, [limit, offset]);
        const countResult = await client.query(countQuery);

        const total = parseInt(countResult.rows[0].count);

        res.json({
            page,
            limit,
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

/**
 * @swagger
 * /drawframe/header:
 *   post:
 *     summary: Create Drawframe QC Header entry
 *     tags: [Drawframe]
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
 *               type:
 *                 type: string
 *               count_name:
 *                 type: string
 *               consignee_name:
 *                 type: string
 *               creation_date:
 *                 type: string
 *                 format: date
 *               make:
 *                 type: string
 *               no_of_ends:
 *                 type: integer
 *               bottom_roll_setting:
 *                 type: string
 *               breaker_draft:
 *                 type: number
 *               total_draft:
 *                 type: number
 *               hank:
 *                 type: number
 *               web_tension_draft:
 *                 type: number
 *               trumpet_size:
 *                 type: number
 *               delivery_speed:
 *                 type: number
 *               pressure_bar:
 *                 type: string
 *     responses:
 *       201:
 *         description: Drawframe entry created successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */

router.post('/header', async (req, res, next) => {
  try {
    await ensureDrawframeEntryIdColumns();
    const {
      entry_id,
      type,
      entry_scope,
      count_name,
      consignee_name,
      creation_date,
      make,
      no_of_ends,
      bottom_roll_setting,
      breaker_draft,
      break_draft,
      total_draft,
      hank,
      web_tension_draft,
      trumpet_size,
      insert_size,
      web_funnel_size,
      delivery_hank,
      delivery_speed,
      pressure_bar,
      scanning_rolls_size,
      user_name
    } = req.body;

    // ✅ Required validation
    if (!count_name || !consignee_name || !creation_date) {
      return res.status(400).json({
        message: 'count_name, consignee_name and creation_date are required'
      });
    }

    const result = await client.query(
      `INSERT INTO drawframe.drawframe_qc_header (
        entry_id, type, entry_scope, count_name, consignee_name, creation_date,
        make, no_of_ends, bottom_roll_setting,
        breaker_draft, total_draft, hank,
        web_tension_draft, trumpet_size, insert_size, web_funnel_size, delivery_hank,
        delivery_speed, pressure_bar, scanning_rolls_size, operator
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,
        $10,$11,$12,
        $13,$14,$15,$16,$17,
        $18,$19,$20,$21
      )
      RETURNING *`,
      [
        entry_id || null,
        type,
        entry_scope || null,
        count_name,
        consignee_name,
        creation_date,
        make,
        no_of_ends,
        bottom_roll_setting,
        breaker_draft ?? break_draft ?? null,
        total_draft,
        hank,
        web_tension_draft,
        trumpet_size,
        insert_size,
        web_funnel_size,
        delivery_hank,
        delivery_speed,
        pressure_bar,
        scanning_rolls_size,
        user_name || null
      ]
    );

    res.status(201).json({
      message: 'Drawframe entry created successfully',
      data: withScreenEntryId('header', result.rows[0], 'ins_id')
    });

  } catch (error) {
    console.error(error);
    next(error);
  }
});

/**
 * @swagger
 * /drawframe/header:
 *   get:
 *     summary: Get all Drawframe QC Header entries
 *     tags: [Drawframe]
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
 *         description: Drawframe data retrieved successfully
 *       500:
 *         description: Server error
 */

router.get('/header', async (req, res, next) => {
  try {
    await ensureDrawframeEntryIdColumns();
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT *, breaker_draft AS break_draft
       FROM drawframe.drawframe_qc_header
       ORDER BY creation_date DESC
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const totalResult = await client.query(
      `SELECT COUNT(*) FROM drawframe.drawframe_qc_header`
    );

    res.status(200).json({
      data: result.rows.map((row) => withScreenEntryId('header', row, 'ins_id')),
      total: parseInt(totalResult.rows[0].count),
      page: pageNum,
      limit: limitNum
    });

  } catch (error) {
    console.error(error);
    next(error);
  }
});

const createDrawframeWheelChangeEntry = async (req, res, next, defaultWheelChangeType = null, defaultWheelChangeTypeLabel = null) => {
  try {
    await ensureDrawframeWheelChangeTable();

    const payload = req.body || {};
    const entry_id = String(payload.entry_id ?? payload.entryId ?? '').trim() || null;
    const type = String(payload.type ?? 'Wheel Change').trim() || 'Wheel Change';
    const line_type = String(payload.line_type ?? payload.lineType ?? '').trim() || null;
    const wheel_change_type = String(
      payload.wheel_change_type ?? payload.wheelChangeType ?? defaultWheelChangeType ?? ''
    ).trim() || null;
    const wheel_change_type_label = String(
      payload.wheel_change_type_label ?? payload.wheelChangeTypeLabel ?? defaultWheelChangeTypeLabel ?? ''
    ).trim() || null;
    const entry_date = parseNotebookDate(payload.entry_date ?? payload.entryDate ?? payload.date);
    const machine_no = String(payload.machine_no ?? payload.machineNo ?? '').trim() || null;
    const operator = String(payload.operator ?? '').trim() || null;
    const remarks = String(payload.remarks ?? '').trim() || null;
    const parameters = normalizeWheelChangeParameters(payload);
    const rows = normalizeWheelChangeRows(payload, parameters);

    if (!entry_date) {
      return res.status(400).json({ message: 'entry_date is required' });
    }

    const result = await client.query(
      `INSERT INTO drawframe.wheel_change (
         entry_id, type, line_type, wheel_change_type, wheel_change_type_label, entry_date, parameters, rows,
         machine_no, operator, remarks
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11)
       RETURNING *`,
      [
        entry_id,
        type,
        line_type,
        wheel_change_type,
        wheel_change_type_label,
        entry_date,
        JSON.stringify(parameters),
        JSON.stringify(rows),
        machine_no,
        operator,
        remarks
      ]
    );

    res.status(201).json({
      message: 'Drawframe wheel change entry created successfully',
      data: withScreenEntryId('wheel_change', hydrateWheelChangeRow(result.rows[0])),
      entry_id: result.rows[0].entry_id
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    console.error('Drawframe wheel change insert error:', error);
    next(error);
  }
};

const getDrawframeWheelChangeEntries = async (req, res, next, defaultWheelChangeType = null) => {
  try {
    await ensureDrawframeWheelChangeTable();

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;
    const requestedType = String(req.query.wheel_change_type ?? req.query.wheelChangeType ?? defaultWheelChangeType ?? '').trim();
    const whereClause = requestedType ? 'WHERE wheel_change_type = $3' : '';
    const queryParams = requestedType ? [limit, offset, requestedType] : [limit, offset];
    const countParams = requestedType ? [requestedType] : [];

    const [dataResult, totalResult] = await Promise.all([
      client.query(
        `SELECT *
         FROM drawframe.wheel_change
         ${whereClause}
         ORDER BY entry_date DESC NULLS LAST, id DESC
         LIMIT $1 OFFSET $2`,
        queryParams
      ),
      client.query(
        `SELECT COUNT(*) FROM drawframe.wheel_change ${requestedType ? 'WHERE wheel_change_type = $1' : ''}`,
        countParams
      )
    ]);

    const total = parseInt(totalResult.rows[0].count, 10) || 0;

    res.status(200).json({
      data: dataResult.rows.map((row) => withScreenEntryId('wheel_change', hydrateWheelChangeRow(row))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Drawframe wheel change fetch error:', error);
    next(error);
  }
};

router.post('/wheel-change', (req, res, next) => createDrawframeWheelChangeEntry(req, res, next));
router.get('/wheel-change', (req, res, next) => getDrawframeWheelChangeEntries(req, res, next));
router.post('/wheel-change/type1', (req, res, next) => createDrawframeWheelChangeEntry(req, res, next, 'type1', 'Type 1 (SB20)'));
router.get('/wheel-change/type1', (req, res, next) => getDrawframeWheelChangeEntries(req, res, next, 'type1'));
router.post('/wheel-change/type2', (req, res, next) => createDrawframeWheelChangeEntry(req, res, next, 'type2', 'Type 2 (TD7)'));
router.get('/wheel-change/type2', (req, res, next) => getDrawframeWheelChangeEntries(req, res, next, 'type2'));
router.post('/wheel-change/type3', (req, res, next) => createDrawframeWheelChangeEntry(req, res, next, 'type3', 'Type 3 (TD9)'));
router.get('/wheel-change/type3', (req, res, next) => getDrawframeWheelChangeEntries(req, res, next, 'type3'));
router.post('/wheel-change/finisher-type1-lrsb', (req, res, next) => createDrawframeWheelChangeEntry(req, res, next, 'finisher_type1_lrsb', 'Type 1 (LRSB)'));
router.get('/wheel-change/finisher-type1-lrsb', (req, res, next) => getDrawframeWheelChangeEntries(req, res, next, 'finisher_type1_lrsb'));
router.post('/wheel-change/type2-d40', (req, res, next) => createDrawframeWheelChangeEntry(req, res, next, 'type2_d40', 'Type 2 (D40)'));
router.get('/wheel-change/type2-d40', (req, res, next) => getDrawframeWheelChangeEntries(req, res, next, 'type2_d40'));
router.post('/wheel-change/type3-d50-d55', (req, res, next) => createDrawframeWheelChangeEntry(req, res, next, 'type3_d50_d55', 'Type 3 (D50/D55)'));
router.get('/wheel-change/type3-d50-d55', (req, res, next) => getDrawframeWheelChangeEntries(req, res, next, 'type3_d50_d55'));
router.post('/wheel-change/type4-ldf3s', (req, res, next) => createDrawframeWheelChangeEntry(req, res, next, 'type4_ldf3s', 'Type 4 (LDF3S)'));
router.get('/wheel-change/type4-ldf3s', (req, res, next) => getDrawframeWheelChangeEntries(req, res, next, 'type4_ldf3s'));

/**
 * @swagger
 * /drawframe/header/{ins_id}:
 *   put:
 *     summary: Update Drawframe QC Header entry
 *     tags: [Drawframe]
 *     parameters:
 *       - in: path
 *         name: ins_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Drawframe Header ID
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
 *               type:
 *                 type: string
 *               count_name:
 *                 type: string
 *               consignee_name:
 *                 type: string
 *               creation_date:
 *                 type: string
 *                 format: date
 *               make:
 *                 type: string
 *               no_of_ends:
 *                 type: integer
 *               bottom_roll_setting:
 *                 type: string
 *               breaker_draft:
 *                 type: number
 *               total_draft:
 *                 type: number
 *               hank:
 *                 type: number
 *               web_tension_draft:
 *                 type: number
 *               trumpet_size:
 *                 type: number
 *               delivery_speed:
 *                 type: number
 *               pressure_bar:
 *                 type: string
 *     responses:
 *       200:
 *         description: Drawframe entry updated successfully
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Entry not found
 *       500:
 *         description: Server error
 */

router.put('/header/:ins_id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.ins_id, 10);

    // ✅ ID validation
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: 'Invalid ID supplied'
      });
    }

    const {
      type,
      count_name,
      consignee_name,
      creation_date,
      make,
      no_of_ends,
      bottom_roll_setting,
      breaker_draft,
      break_draft,
      total_draft,
      hank,
      web_tension_draft,
      trumpet_size,
      insert_size,
      web_funnel_size,
      delivery_hank,
      delivery_speed,
      pressure_bar,
      scanning_rolls_size
    } = req.body;

    // ✅ Required validation
    if (!count_name || !consignee_name || !creation_date) {
      return res.status(400).json({
        message: 'count_name, consignee_name and creation_date are required'
      });
    }

    const entry_id = await resolveOrCreateProcessParameterEntryId(req.body.entry_id, { forceNew: req.body.force_new === true || req.body.force_new === 'true' });

    const conflictingCountName = await getCountNameConflict(entry_id, count_name);
    if (conflictingCountName) {
      return res.status(409).json({ message: `This PP id (${entry_id}) already uses count name "${conflictingCountName}". All sub-departments under a PP id must use the same count name.` });
    }

    // The Process Parameter matrix's "DF Breaker"/"DF Finisher" status columns split on this
    // column, not on `type` — without it every entry here is invisible to that "done" check
    // no matter what `type` says, even though the row itself saved fine.
    const entry_scope = String(type || '').toLowerCase().includes('finisher') ? 'finisher' : 'breaker';

    const result = await client.query(
      `INSERT INTO drawframe.drawframe_qc_header (
        entry_id, entry_scope, type, count_name, consignee_name, creation_date,
        make, no_of_ends, bottom_roll_setting,
        breaker_draft, total_draft, hank,
        web_tension_draft, trumpet_size, delivery_speed, pressure_bar
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,
        $10,$11,$12,
        $13,$14,$15,$16
      )
      RETURNING *`,
      [
        entry_id,
        entry_scope,
        type,
        count_name,
        consignee_name,
        creation_date,
        make,
        no_of_ends,
        bottom_roll_setting,
        breaker_draft,
        total_draft,
        hank,
        web_tension_draft,
        trumpet_size,
        delivery_speed,
        pressure_bar
      ]
    );

    // PP_SUB_DEPARTMENTS (ticketing_system's completion tracking) expects Breaker and
    // Finisher to be logged as two distinct notebooks — hardcoding 'Drawframe QC Header'
    // for both meant a real Finisher submission was indistinguishable from a Breaker one,
    // so the batch-completion checker could never see "Drawframe Finisher Drawing
    // Inspection" as actually done.
    recordPpNotebookSubmission({
      notebook: entry_scope === 'finisher' ? 'Drawframe Finisher Drawing Inspection' : 'Drawframe QC Header',
      department: 'Drawframe',
      entryId: entry_id,
      sourceSchema: 'drawframe',
      sourceTable: 'drawframe_qc_header',
      submittedByUserId: req.user?.id,
      submittedByName: req.user?.employee_id,
      submittedPayload: { count_name, consignee_name, creation_date }
    }).catch((err) => console.warn('[pp-notebook-log] Drawframe QC Header failed:', err.message));

    res.status(201).json({
      message: 'Drawframe entry created successfully',
      data: result.rows[0],
      entry_id,
      process_parameter_id: entry_id
    });

  } catch (error) {
    console.error(error);
    next(error);
  }
});

router.get('/header', async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT *
       FROM drawframe.drawframe_qc_header
       ORDER BY created_at DESC, ins_id DESC
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const totalResult = await client.query(
      `SELECT COUNT(*) FROM drawframe.drawframe_qc_header`
    );

    res.status(200).json({
      data: result.rows,
      total: parseInt(totalResult.rows[0].count),
      page: pageNum,
      limit: limitNum
    });

  } catch (error) {
    console.error(error);
    next(error);
  }
});

router.put('/header/:ins_id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.ins_id, 10);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: 'Invalid ID supplied'
      });
    }

    const {
      type,
      count_name,
      consignee_name,
      creation_date,
      make,
      no_of_ends,
      bottom_roll_setting,
      breaker_draft,
      total_draft,
      hank,
      web_tension_draft,
      trumpet_size,
      delivery_speed,
      pressure_bar
    } = req.body;

    if (!count_name || !consignee_name || !creation_date) {
      return res.status(400).json({
        message: 'count_name, consignee_name and creation_date are required'
      });
    }

    const result = await client.query(
      `UPDATE drawframe.drawframe_qc_header
       SET type = $1,
           entry_scope = $2,
           count_name = $3,
           consignee_name = $4,
           creation_date = $5,
           make = $6,
           no_of_ends = $7,
           bottom_roll_setting = $8,
           breaker_draft = $9,
           total_draft = $10,
           hank = $11,
           web_tension_draft = $12,
           trumpet_size = $13,
           insert_size = $14,
           web_funnel_size = $15,
           delivery_hank = $16,
           delivery_speed = $17,
           pressure_bar = $18,
           scanning_rolls_size = $19
       WHERE ins_id = $20
       RETURNING *`,
      [
        type,
        entry_scope || null,
        count_name,
        consignee_name,
        creation_date,
        make,
        no_of_ends,
        bottom_roll_setting,
        breaker_draft ?? break_draft ?? null,
        total_draft,
        hank,
        web_tension_draft,
        trumpet_size,
        insert_size,
        web_funnel_size,
        delivery_hank,
        delivery_speed,
        pressure_bar,
        scanning_rolls_size,
        id
      ]
    );

    // ✅ Not found
    if (result.rowCount === 0) {
      return res.status(404).json({
        message: 'Drawframe entry not found'
      });
    }

    // ✅ Success
    res.status(200).json({
      message: 'Drawframe entry updated successfully',
      data: withScreenEntryId('header', result.rows[0], 'ins_id')
    });

  } catch (error) {
    console.error(error);
    next(error);
  }
});

/**
 * @swagger
 * /drawframe/finisher:
 *   post:
 *     summary: Create Finisher Drawing Inspection entry
 *     tags: [Drawframe]
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
 *               make:
 *                 type: string
 *               no_of_ends:
 *                 type: integer
 *               bottom_roll_setting:
 *                 type: string
 *               break_draft:
 *                 type: number
 *               total_draft:
 *                 type: number
 *               web_tension_draft:
 *                 type: number
 *               trumpet_size:
 *                 type: number
 *               insert_size:
 *                 type: number
 *               web_funnel_size:
 *                 type: number
 *               delivery_hank:
 *                 type: number
 *               delivery_speed:
 *                 type: number
 *               pressure_bar:
 *                 type: string
 *               scanning_rolls_size:
 *                 type: string
 *     responses:
 *       201:
 *         description: Entry created successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */

router.post('/finisher', async (req, res, next) => {
  try {
    await ensureDrawframeEntryIdColumns();
    const data = req.body;

    if (!data.count_name || !data.consignee_name || !data.creation_date) {
      return res.status(400).json({
        message: 'count_name, consignee_name and creation_date are required'
      });
    }

    const result = await client.query(
      `INSERT INTO drawframe.finisher_drawing_inspection (
        entry_id, count_name, consignee_name, creation_date,
        make, no_of_ends, bottom_roll_setting,
        break_draft, total_draft, web_tension_draft,
        trumpet_size, insert_size, web_funnel_size,
        delivery_hank, delivery_speed,
        pressure_bar, scanning_rolls_size
      )
      VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,
        $8,$9,$10,
        $11,$12,$13,
        $14,$15,
        $16,$17
      )
      RETURNING *`,
      [
        data.entry_id || null,
        data.count_name,
        data.consignee_name,
        data.creation_date,
        data.make,
        data.no_of_ends,
        data.bottom_roll_setting,
        data.break_draft,
        data.total_draft,
        data.web_tension_draft,
        data.trumpet_size,
        data.insert_size,
        data.web_funnel_size,
        data.delivery_hank,
        data.delivery_speed,
        data.pressure_bar,
        data.scanning_rolls_size
      ]
    );

    res.status(201).json({
      message: 'Finisher entry created successfully',
      data: withScreenEntryId('finisher', result.rows[0])
    });

  } catch (error) {
    console.error(error);
    next(error);
  }
});

/**
 * @swagger
 * /drawframe/finisher:
 *   get:
 *     summary: Get all Finisher Drawing entries
 *     tags: [Drawframe]
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
 *       500:
 *         description: Server error
 */

router.get('/finisher', async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT *
       FROM drawframe.finisher_drawing_inspection
       ORDER BY creation_date DESC
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const totalResult = await client.query(
      `SELECT COUNT(*) FROM drawframe.finisher_drawing_inspection`
    );

    res.status(200).json({
      data: result.rows.map((row) => withScreenEntryId('finisher', row)),
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
 * /drawframe/finisher/{id}:
 *   put:
 *     summary: Update Finisher Drawing entry
 *     tags: [Drawframe]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Entry ID
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
 *         description: Updated successfully
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Entry not found
 *       500:
 *         description: Server error
 */

router.put('/finisher/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    if (!id || id <= 0) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    const data = req.body;

    if (!data.count_name || !data.consignee_name || !data.creation_date) {
      return res.status(400).json({
        message: 'count_name, consignee_name and creation_date are required'
      });
    }

    const result = await client.query(
      `UPDATE drawframe.finisher_drawing_inspection
       SET count_name=$1,
           consignee_name=$2,
           creation_date=$3,
           make=$4,
           no_of_ends=$5,
           bottom_roll_setting=$6,
           break_draft=$7,
           total_draft=$8,
           web_tension_draft=$9,
           trumpet_size=$10,
           insert_size=$11,
           web_funnel_size=$12,
           delivery_hank=$13,
           delivery_speed=$14,
           pressure_bar=$15,
           scanning_rolls_size=$16,
           updated_at = CURRENT_TIMESTAMP
       WHERE id=$17
       RETURNING *`,
      [
        data.count_name,
        data.consignee_name,
        data.creation_date,
        data.make,
        data.no_of_ends,
        data.bottom_roll_setting,
        data.break_draft,
        data.total_draft,
        data.web_tension_draft,
        data.trumpet_size,
        data.insert_size,
        data.web_funnel_size,
        data.delivery_hank,
        data.delivery_speed,
        data.pressure_bar,
        data.scanning_rolls_size,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.status(200).json({
      message: 'Finisher entry updated successfully',
      data: withScreenEntryId('finisher', result.rows[0])
    });

  } catch (error) {
    console.error(error);
    next(error);
  }
});

module.exports = router;    

const express = require('express');
const router = express.Router();
const client = require('../connection');
const { resolveOrCreateProcessParameterEntryId, getCountNameConflict } = require('../utils/processParameterEntryId');
const { recordPpNotebookSubmission } = require('./submittedNotebooks.routes');
const sqlServer = require('../config/sqlserver');
const sqlServerPrep = require('../config/sqlserverPrep');
const { fetchPrepVarieties, isDatabaseAccessDenied } = require('../utils/prepVariety');
const { createEmployeeMasterDropdown } = require('../utils/employeeMaster');
const SCREEN_ID_PREFIXES = {
  smx_cots_change: 'SX',
  study: 'SS',
  uqc: 'SU',
  // process_parameter intentionally has no prefix here — it must only ever surface the
  // real, stored PP-000n entry_id, never a synthesized fallback id, since a fabricated
  // id collides with the shared Process Parameter scheme.
  wrapping_simplex_notebook: 'WS'
};

const formatScreenEntryId = (screenKey, rawId) => {
  const prefix = SCREEN_ID_PREFIXES[screenKey];
  const numericId = Number(rawId);
  if (!prefix || !Number.isFinite(numericId)) return null;
  return `${prefix}-${String(Math.trunc(numericId)).padStart(4, '0')}`;
};

const withScreenEntryId = (screenKey, record, idField = 'id') => {
  if (!record || typeof record !== 'object') return record;
  const entry_id = formatScreenEntryId(screenKey, record[idField]);
  if (!entry_id) return { ...record };
  if (record.entry_id && String(record.entry_id).trim().toUpperCase() === entry_id.toUpperCase()) {
    return { ...record, entry_id };
  }
  return { ...record, entry_id };
};
const isUniqueViolation = (err) => err && err.code === '23505';
const toWholeNumberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
};
const parseBreakArray = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v ?? '').trim())
      .filter(Boolean);
  }
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  const unwrapped = raw.startsWith('{') && raw.endsWith('}')
    ? raw.slice(1, -1)
    : raw;
  return unwrapped
    .split(',')
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);
};
const toPgArrayLiteral = (items) => `{${items.join(',')}}`;
const normalizeBreakItemName = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  if (raw.toUpperCase() === 'SILVER BREAKS') return 'SLIVER BREAKS';
  return raw;
};
// Column order/labels mirror SMXBreaksStudyReport.jsx's breakColumns/breakRows exactly, so the
// pivoted keys line up with the "SMX Breaks Study Report" catalog entry in fieldCatalog.js.
const SMX_BREAK_CATEGORIES = [
  'Roving Breaks at Finger',
  'Roving Breaks at Front Roller Nip',
  'Roving Breaks at Between Flyer',
  'Undraft',
  'Top Roller Lapping',
  'Bottom Roller Lapping',
  'SLIVER BREAKS',
  'Can Exhaust',
  'Unknown Stop'
];
const SMX_LENGTH_BUCKETS = [
  '0-200', '201-400', '401-600', '601-800', '801-1000', '1001-1200', '1201-1400',
  '1401-1600', '1601-1800', '1801-2000', '2001-2200', '2201-2400', '2401-2600'
];
const SMX_PERCENT_CATEGORIES = SMX_BREAK_CATEGORIES.slice(0, SMX_BREAK_CATEGORIES.indexOf('SLIVER BREAKS') + 1);
const normalizeSmxLengthRange = (value) => String(value || '').replace(/\s*-\s*/g, '-').trim();
const countCommaEntries = (value) => parseBreakArray(value).length;

const buildSmxBreaksStudyRow = (header, items, otherRow) => {
  const cellByKey = new Map();
  (items || []).forEach((item) => {
    if (!item?.length_range) return;
    const category = normalizeBreakItemName(item.item_name);
    const bucket = normalizeSmxLengthRange(item.length_range);
    cellByKey.set(`${category}::${bucket}`, item.status_value);
  });

  // remarks is a ' | '-joined string: a leading JSON blob (tpi, tpm, mixing, etc — everything
  // the form's own remarks payload carries) followed by plain KEY:VALUE tags the backend itself
  // appends on write (S.NAME, START, END, TOTAL_MINUTES — see the /study POST handler). Start
  // Time in particular only ever lands in the KEY:VALUE tags, never in the JSON blob, so both
  // sources have to be parsed.
  let extra = {};
  const remarksSegments = String(otherRow?.remarks || '').split(' | ');
  try {
    extra = JSON.parse(remarksSegments[0]);
  } catch (_) {
    extra = {};
  }
  const remarksTags = {};
  remarksSegments.slice(1).forEach((segment) => {
    const separatorIndex = segment.indexOf(':');
    if (separatorIndex === -1) return;
    remarksTags[segment.slice(0, separatorIndex).trim().toUpperCase()] = segment.slice(separatorIndex + 1).trim();
  });

  const runningSpindles = Number(extra.running_spdl);
  const totalMinutes = Number(extra.total_time_in_mins ?? extra.total_time ?? remarksTags.TOTAL_MINUTES);

  const row = {
    id: header.id,
    entry_date: header.entry_date,
    created_at: header.created_at,
    'Simplex No.': header.s_no,
    Date: header.entry_date,
    'Sider Name': header.operator_name || remarksTags['S.NAME'] || null,
    'Start Time': extra.start_time ?? remarksTags.START ?? null,
    'End Time': extra.end_time ?? remarksTags.END ?? null,
    'Total Minutes': extra.total_time_in_mins ?? extra.total_time ?? remarksTags.TOTAL_MINUTES ?? null,
    TPI: extra.tpi ?? null,
    TPM: extra.tpm ?? null,
    'Average Speed': extra.average_speed ?? null,
    'Start HK': extra.start_hk ?? remarksTags.START_HK ?? null,
    'Finish HK': extra.finish_hk ?? remarksTags.FINISH_HK ?? null,
    Hank: extra.hank ?? null,
    Mixing: extra.mixing ?? null,
    'Roving HK': extra.roving_hk ?? null,
    'Doff Length': extra.doff_length ?? null,
    'RH%': extra.rh_percent ?? null,
    'TEMP%': extra.temp_percent ?? null,
    'Total Spindles': extra.total_spdl ?? null,
    'Running Spindles': extra.running_spdl ?? null,
    'Idle Spindles': extra.idle_spindles ?? null
  };

  const columnTotals = {};
  SMX_BREAK_CATEGORIES.forEach((category) => {
    let total = 0;
    SMX_LENGTH_BUCKETS.forEach((bucket) => {
      const raw = cellByKey.get(`${category}::${bucket}`);
      row[`Length ${bucket} - ${category}`] = raw ?? null;
      total += countCommaEntries(raw);
    });
    columnTotals[category] = total;
    row[`Total Breaks - ${category}`] = total;
  });

  const grandTotal = Object.values(columnTotals).reduce((sum, value) => sum + value, 0);
  row['Grand Total'] = grandTotal;

  SMX_PERCENT_CATEGORIES.forEach((category) => {
    const rate = Number.isFinite(runningSpindles) && runningSpindles > 0
      ? Number(((columnTotals[category] * 100) / runningSpindles).toFixed(2))
      : 0;
    row[`No. of Breaks per 100 Spindles / Hr - ${category}`] = rate;
  });

  const totalRate = Number.isFinite(runningSpindles) && runningSpindles > 0
    && Number.isFinite(totalMinutes) && totalMinutes > 0 && grandTotal > 0
    ? Number(((grandTotal * 100) / (runningSpindles * (totalMinutes / 60))).toFixed(2))
    : 0;
  row['Total No. of Breaks/100SH'] = totalRate;

  return row;
};

const parseHHMM = (value) => {
  const raw = String(value ?? '').trim();
  const m = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return { hhmm: `${m[1].padStart(2, '0')}:${m[2]}`, minutes: (Number(m[1]) * 60) + Number(m[2]) };
};
const diffMinutes = (startHHMM, endHHMM) => {
  const start = parseHHMM(startHHMM);
  const end = parseHHMM(endHHMM);
  if (!start || !end) return null;
  let diff = end.minutes - start.minutes;
  if (diff < 0) diff += 24 * 60;
  return diff;
};
const toWholePercent = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
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

const pickText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }
  if (typeof value === 'object') {
    return String(
      value.value ??
      value.label ??
      value.text ??
      value.name ??
      value.count_name ??
      value.consignee_name ??
      ''
    ).trim();
  }
  return String(value).trim();
};

const pickFirstText = (...values) => {
  for (const value of values) {
    const text = pickText(value);
    if (text) return text;
  }
  return '';
};

const ensureWrappingSimplexNotebookTable = async () => {
  await client.query(`CREATE SCHEMA IF NOT EXISTS wrapping`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS wrapping.simplex_notebook (
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
    ALTER TABLE wrapping.simplex_notebook
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
    CREATE UNIQUE INDEX IF NOT EXISTS wrapping_simplex_notebook_entry_id_uq
    ON wrapping.simplex_notebook (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS wrapping_simplex_notebook_entry_date_idx
    ON wrapping.simplex_notebook (entry_date DESC, id DESC);
  `);
};

const ensureSimplexNotebookTable = async () => {
  await client.query(`CREATE SCHEMA IF NOT EXISTS simplex`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS simplex.simplex_notebook (
      id BIGSERIAL PRIMARY KEY,
      entry_id TEXT,
      notebook_type TEXT,
      entry_date DATE,
      sap_no TEXT,
      proposed_sap_no TEXT,
      parameter_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      notes JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    ALTER TABLE simplex.simplex_notebook
      ADD COLUMN IF NOT EXISTS entry_id TEXT,
      ADD COLUMN IF NOT EXISTS notebook_type TEXT,
      ADD COLUMN IF NOT EXISTS entry_date DATE,
      ADD COLUMN IF NOT EXISTS sap_no TEXT,
      ADD COLUMN IF NOT EXISTS proposed_sap_no TEXT,
      ADD COLUMN IF NOT EXISTS parameter_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS notes JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS simplex_simplex_notebook_entry_id_uq
    ON simplex.simplex_notebook (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS simplex_simplex_notebook_entry_date_idx
    ON simplex.simplex_notebook (entry_date DESC, id DESC);
  `);
};

const ensureSimplexEntryIdColumns = async () => {
  await client.query(`
    ALTER TABLE IF EXISTS simplex.simplex_inspections
      ADD COLUMN IF NOT EXISTS entry_id text,
      ADD COLUMN IF NOT EXISTS type text,
      ADD COLUMN IF NOT EXISTS entry_date date,
      ADD COLUMN IF NOT EXISTS machine_name text;
  `);
  await client.query(`
    ALTER TABLE IF EXISTS simplex.simplex_inspections
      ALTER COLUMN s_no DROP NOT NULL;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS simplex_inspections_entry_id_uq
    ON simplex.simplex_inspections (entry_id)
    WHERE entry_id IS NOT NULL;
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS simplex.simplex_inspection_details (
      id BIGSERIAL PRIMARY KEY,
      inspection_id BIGINT NOT NULL,
      item_name TEXT,
      status_value TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    ALTER TABLE IF EXISTS simplex.simplex_inspection_details
      ADD COLUMN IF NOT EXISTS inspection_id BIGINT,
      ADD COLUMN IF NOT EXISTS item_name TEXT,
      ADD COLUMN IF NOT EXISTS status_value TEXT,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS simplex_inspection_details_inspection_id_idx
    ON simplex.simplex_inspection_details (inspection_id);
  `);
  await client.query(`
    ALTER TABLE IF EXISTS simplex.smx_breaks_study_header
      ADD COLUMN IF NOT EXISTS entry_id text;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS smx_breaks_study_header_entry_id_uq
    ON simplex.smx_breaks_study_header (entry_id)
    WHERE entry_id IS NOT NULL;
  `);
  await client.query(`
    ALTER TABLE IF EXISTS simplex.u_data_entry
      ADD COLUMN IF NOT EXISTS entry_id text;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS simplex_u_data_entry_entry_id_uq
    ON simplex.u_data_entry (entry_id)
    WHERE entry_id IS NOT NULL;
  `);
  await client.query(`
    ALTER TABLE IF EXISTS simplex.simplex_process_parameter
      ADD COLUMN IF NOT EXISTS entry_id text;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS simplex_process_parameter_entry_id_uq
    ON simplex.simplex_process_parameter (entry_id)
    WHERE entry_id IS NOT NULL;
  `);
};

const normalizeParameterRows = (value) => {
  if (Array.isArray(value)) {
    return value.map((row) => ({
      key: String(row?.key ?? row?.parameter ?? row?.name ?? row?.label ?? '').trim(),
      label: String(row?.label ?? row?.parameter ?? row?.name ?? row?.key ?? '').trim(),
      existing: row?.existing ?? row?.existing_value ?? row?.current ?? null,
      proposed: row?.proposed ?? row?.proposed_value ?? row?.target ?? null
    })).filter((row) => row.key || row.label || row.existing !== null || row.proposed !== null);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).map(([parameter, row]) => ({
      key: String(parameter).trim(),
      label: String(row?.label ?? parameter).trim(),
      existing: row?.existing ?? row?.existing_value ?? row?.current ?? null,
      proposed: row?.proposed ?? row?.proposed_value ?? row?.target ?? null
    }));
  }

  return [];
};

const saveSimplexNotebook = async (req, res, next) => {
  try {
    await ensureSimplexNotebookTable();

    const payload = req.body || {};
    const parameterRows = normalizeParameterRows(payload.parameter_rows ?? payload.rows ?? payload.parameters);
    const entryDate = parseNotebookDate(payload.entry_date ?? payload.date ?? payload.Date);
    const entryId = String(payload.entry_id ?? payload.entryId ?? '').trim();

    if (!entryId) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    const result = await client.query(
      `INSERT INTO simplex.simplex_notebook (
        entry_id, notebook_type, entry_date, sap_no, proposed_sap_no, parameter_rows, notes
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)
      RETURNING *`,
      [
        entryId,
        String(payload.notebook_type ?? payload.type ?? 'Simplex Notebook').trim(),
        entryDate,
        String(payload.sap_no ?? payload.sapNo ?? payload.sap_number ?? '').trim() || null,
        String(payload.proposed_sap_no ?? payload.proposedSapNo ?? payload.proposed_sap_number ?? '').trim() || null,
        JSON.stringify(parameterRows),
        JSON.stringify(payload.notes ?? payload.meta ?? {})
      ]
    );

    return res.status(201).json({
      message: 'Simplex notebook data saved successfully',
      data: result.rows[0]
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(error);
  }
};

const getSimplexNotebook = async (req, res, next) => {
  try {
    await ensureSimplexNotebookTable();

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const notebookType = String(req.query.notebook_type || req.query.type || '').trim();

    const filters = [];
    const values = [];

    if (notebookType) {
      values.push(notebookType);
      filters.push(`notebook_type = $${values.length}`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const limitParam = values.length + 1;
    const offsetParam = values.length + 2;

    const result = await client.query(
      `SELECT *
       FROM simplex.simplex_notebook
       ${whereClause}
       ORDER BY COALESCE(entry_date, created_at::date) DESC, id DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...values, limit, offset]
    );

    const countResult = await client.query(
      `SELECT COUNT(*)
       FROM simplex.simplex_notebook
       ${whereClause}`,
      values
    );

    return res.status(200).json({
      page,
      limit,
      total: parseInt(countResult.rows[0].count, 10),
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
};

const saveWrappingSimplexNotebook = async (req, res, next) => {
  try {
    await ensureWrappingSimplexNotebookTable();

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
        `INSERT INTO wrapping.simplex_notebook (
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
      savedRows.push(withScreenEntryId('wrapping_simplex_notebook', result.rows[0]));
    }

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Wrapping simplex notebook data saved successfully',
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

const getWrappingSimplexNotebook = async (req, res, next) => {
  try {
    await ensureWrappingSimplexNotebookTable();

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
       FROM wrapping.simplex_notebook
       ${whereClause}
       ORDER BY COALESCE(entry_date, created_at::date) DESC, id DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...values, limit, offset]
    );

    const countResult = await client.query(
      `SELECT COUNT(*)
       FROM wrapping.simplex_notebook
       ${whereClause}`,
      values
    );

    return res.status(200).json({
      page,
      limit,
      total: parseInt(countResult.rows[0].count, 10),
      data: result.rows.map((row) => withScreenEntryId('wrapping_simplex_notebook', row))
    });
  } catch (error) {
    next(error);
  }
};

router.post('/wrapping-simplex-notebook', saveWrappingSimplexNotebook);
router.get('/wrapping-simplex-notebook', getWrappingSimplexNotebook);
router.post('/wrapping/simplex-notebook', saveWrappingSimplexNotebook);
router.get('/wrapping/simplex-notebook', getWrappingSimplexNotebook);
router.post('/simplex-notebook/wrapping', saveWrappingSimplexNotebook);
router.get('/simplex-notebook/wrapping', getWrappingSimplexNotebook);
router.post('/notebook', saveSimplexNotebook);
router.get('/notebook', getSimplexNotebook);
router.post('/simplex-notebook', saveSimplexNotebook);
router.get('/simplex-notebook', getSimplexNotebook);
router.post('/notebook/simplex', saveSimplexNotebook);
router.get('/notebook/simplex', getSimplexNotebook);

const fetchCdgTotalSpdlFromDb = async (machineName) => {
  const machine = String(machineName || '').trim();
  if (!machine) return null;
  if (!/^CDG[-\s]?\d+/i.test(machine)) return null;

  const result = await client.query(
    `
    SELECT
      COALESCE(
        tm.threshold_value::text,
        tm.plus_threshold::text,
        tm.minus_threshold::text,
        tm.actual_value
      ) AS raw_value
    FROM ticketing_system.threshold_master tm
    WHERE LOWER(TRIM(COALESCE(tm.machine_name, ''))) = LOWER(TRIM($1))
      AND (
        LOWER(COALESCE(tm.input_field, '')) LIKE '%total%denomination%'
        OR LOWER(COALESCE(tm.parameter_name, '')) LIKE '%total%denomination%'
        OR LOWER(COALESCE(tm.input_field, '')) LIKE '%total%spdl%'
        OR LOWER(COALESCE(tm.parameter_name, '')) LIKE '%total%spdl%'
      )
    ORDER BY tm.updated_at DESC, tm.id DESC
    LIMIT 1
    `,
    [machine]
  );

  if (!result.rows.length) return null;
  const parsed = toWholeNumberOrNull(result.rows[0].raw_value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

const getSimplexUqcMasterDropdown = async (req, res, next) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const varietyPrefix = String(req.query.variety_prefix || req.query.prefix || '').trim();
    const departmentPrefix = String(req.query.department_prefix || req.query.prefix || '').trim();
    const mcNoPrefix = String(req.query.mc_no_prefix || req.query.prefix || '').trim();
    const department = String(req.query.department || '').trim();
    const departmentCode = String(req.query.department_code || req.query.dept_code || 'SIMPLEX').trim() || 'SIMPLEX';

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

    const simplexMachineFallback = mcNos.length
      ? mcNos
      : [{
        mc_no: 'SMX-01',
        mc_name: 'SMX - 01',
        full_mc_no: 'SMX-01/SMX - 01',
        dept_code: 'SIMPLEX',
        dept_name: department || 'SIMPLEX'
      }];

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
      ...simplexMachineFallback.map((m) => ({
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
      mc_nos: simplexMachineFallback,
      mc_no_values: simplexMachineFallback.map((r) => r.full_mc_no),
      options: {
        shift: shiftOptions,
        variety: varietyOptions,
        department: departmentOptions,
        mc_no: mcNoOptions
      }
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
    console.error('Error fetching simplex count names from SQL Server:', error);
    next(error);
  }
};

const getEmployeeMasterDropdown = createEmployeeMasterDropdown(sqlServer, 'simplex');

router.get('/master/dropdown', getSimplexUqcMasterDropdown);
router.get('/master-data', getSimplexUqcMasterDropdown);
router.get('/master/master-data', getSimplexUqcMasterDropdown);
router.get('/master/varieties', getSimplexUqcMasterDropdown);
router.get('/master/departments', getSimplexUqcMasterDropdown);
router.get('/master/mc-nos', getSimplexUqcMasterDropdown);
router.get('/master/mc-no', getSimplexUqcMasterDropdown);
router.get('/master/machine-nos', getSimplexUqcMasterDropdown);
router.get('/master/machine-numbers', getSimplexUqcMasterDropdown);
router.get('/master/counts', getCountMasterDropdown);
router.get('/master/count-dropdown', getCountMasterDropdown);
router.get('/master/count-names', getCountMasterDropdown);
router.get('/master/employees', getEmployeeMasterDropdown);
router.get('/master/employee-dropdown', getEmployeeMasterDropdown);
router.get('/master/employee-names', getEmployeeMasterDropdown);
router.get('/master/operator-names', getEmployeeMasterDropdown);
router.get('/master/user-names', getEmployeeMasterDropdown);
router.get('/uqc/master/dropdown', getSimplexUqcMasterDropdown);
router.get('/uqc/master-data', getSimplexUqcMasterDropdown);
router.get('/uqc/master/master-data', getSimplexUqcMasterDropdown);
router.get('/uqc/master/varieties', getSimplexUqcMasterDropdown);
router.get('/uqc/master/departments', getSimplexUqcMasterDropdown);
router.get('/uqc/master/mc-nos', getSimplexUqcMasterDropdown);
router.get('/uqc/master/mc-no', getSimplexUqcMasterDropdown);
router.get('/uqc/master/machine-nos', getSimplexUqcMasterDropdown);
router.get('/uqc/master/machine-numbers', getSimplexUqcMasterDropdown);
router.get('/uqc/master/counts', getCountMasterDropdown);
router.get('/uqc/master/count-dropdown', getCountMasterDropdown);
router.get('/uqc/master/count-names', getCountMasterDropdown);
router.get('/study/master/employees', getEmployeeMasterDropdown);
router.get('/study/master/employee-dropdown', getEmployeeMasterDropdown);
router.get('/study/master/operator-names', getEmployeeMasterDropdown);
router.get('/study/master-data', getSimplexUqcMasterDropdown);
router.get('/study/master/dropdown', getSimplexUqcMasterDropdown);
router.get('/SMXCotsChange/master/employees', getEmployeeMasterDropdown);
router.get('/SMXCotsChange/master/employee-dropdown', getEmployeeMasterDropdown);
router.get('/SMXCotsChange/master/operator-names', getEmployeeMasterDropdown);
router.get('/SMXCotsChange/master-data', getSimplexUqcMasterDropdown);
router.get('/SMXCotsChange/master/dropdown', getSimplexUqcMasterDropdown);

/**
 * @swagger
 * /simplex/SMXCotsChange:
 *   post:
 *     summary: Create Simplex inspection entry
 *     tags: [Simplex]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - entry_date
 *               - machine_name
 *               - items
 *             properties:
 *               type:
 *                 type: string
 *                 example: SMXCots Change Data Entry
 *               entry_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-04-01"
 *               machine_name:
 *                 type: string
 *                 example: MC-01
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     item_name:
 *                       type: string
 *                       example: Front Cots Damage
 *                     status_value:
 *                       type: string
 *                       example: Damaged
 *     responses:
 *       201:
 *         description: Saved successfully
 *         content:
 *           application/json:
 *             example:
 *               message: Saved successfully
 *               inspection_id: 1
 *       500:
 *         description: Server error
 */
const saveSimplexCotsChange = async (req, res) => {
  try {
    await ensureSimplexEntryIdColumns();
    const {
      entry_id,
      type,
      entry_date,
      machine_name,
      items
    } = req.body;

    if (!type || !entry_date || !machine_name || !Array.isArray(items) || !items.length) {
      return res.status(400).json({
        message: 'Missing required fields: type, entry_date, machine_name, items'
      });
    }

    await client.query('BEGIN');

    // ✅ Insert header
    const headerResult = await client.query(
      `INSERT INTO simplex.simplex_inspections
       (entry_id, type, entry_date, machine_name)
       VALUES ($1,$2,$3,$4)
       RETURNING id`,
      [entry_id || null, type, entry_date, machine_name]
    );

    const inspection_id = headerResult.rows[0].id;
    const normalizedItems = [];

    // ✅ Insert items
    for (const item of items) {
      const item_name = String(item?.item_name || '').trim();
      const status_value = item?.status_value ?? null;
      if (!item_name) {
        throw new Error('Each item must include item_name');
      }
      await client.query(
        `INSERT INTO simplex.simplex_inspection_details
         (inspection_id, item_name, status_value)
         VALUES ($1,$2,$3)`,
        [inspection_id, item_name, status_value]
      );
      normalizedItems.push({ item_name, status_value });
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Saved successfully',
      inspection_id,
      entry_id,
      type,
      entry_date,
      machine_name,
      items: normalizedItems
    });

  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    console.error(err);
    res.status(500).json({
      message: 'Save failed',
      error: err.message,
      code: err.code
    });
  }
};

router.post('/SMXCotsChange', saveSimplexCotsChange);
router.post('/smx-cots-change', saveSimplexCotsChange);
router.post('/smx-cotschange', saveSimplexCotsChange);
router.post('/cots-change', saveSimplexCotsChange);
router.post('/cots-change-data-entry', saveSimplexCotsChange);

/**
 * @swagger
 * /simplex/SMXCotsChange:
 *   get:
 *     summary: Get all Simplex inspections
 *     tags: [Simplex]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         example: 10
 *     responses:
 *       200:
 *         description: List of inspections
 *         content:
 *           application/json:
 *             example:
 *               total: 5
 *               page: 1
 *               limit: 10
 *               data:
 *                 - id: 1
 *                   type: SMXCots Change Data Entry
 *                   entry_date: "2026-04-01"
 *                   machine_name: MC-01
 *                   created_at: "2026-04-01T10:00:00.000Z"
 *                   items:
 *                     - item_name: Front Cots Damage
 *                       status_value: Damaged
 *       500:
 *         description: Server error
 */
const getSimplexCotsChange = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // ✅ Get total count
    const countResult = await client.query(
      `SELECT COUNT(*) FROM simplex.simplex_inspections`
    );

    const total = parseInt(countResult.rows[0].count);

    // ✅ Get data
    const result = await client.query(
      `SELECT si.id,
              si.type,
              si.entry_date,
              si.machine_name,
              si.created_at,
              COALESCE(items.items, '[]'::json) AS items
       FROM simplex.simplex_inspections si
       LEFT JOIN LATERAL (
         SELECT json_agg(
                  json_build_object(
                    'item_name', sid.item_name,
                    'status_value', sid.status_value
                  )
                  ORDER BY sid.id
                ) AS items
         FROM simplex.simplex_inspection_details sid
         WHERE sid.inspection_id = si.id
       ) items ON TRUE
       ORDER BY si.id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.status(200).json({
      total,
      page,
      limit,
      data: result.rows.map((row) => withScreenEntryId('smx_cots_change', {
        ...row,
        items: Array.isArray(row.items) ? row.items : []
      }))
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Fetch failed' });
  }
};

router.get('/SMXCotsChange', getSimplexCotsChange);
router.get('/smx-cots-change', getSimplexCotsChange);
router.get('/smx-cotschange', getSimplexCotsChange);
router.get('/cots-change', getSimplexCotsChange);
router.get('/cots-change-data-entry', getSimplexCotsChange);

const formatSimplexNo = (raw) => {
  const text = String(raw || '').trim();
  if (!text) return '';
  const cleaned = text.replace(/^SMX[\s-]*/i, '').trim();
  const numeric = cleaned.match(/^\d+$/);
  if (numeric) {
    return `SMX ${String(parseInt(cleaned, 10)).padStart(2, '0')}`;
  }
  return `SMX ${cleaned}`;
};
const DEFAULT_SIMPLEX_NUMBERS = Array.from({ length: 13 }, (_, i) => `SMX ${String(i + 1).padStart(2, '0')}`);

const getStudyMachineNamesFromSpxCots = async (req, res, next) => {
  try {
    const prefix = String(req.query.prefix || '').trim();
    const likeToken = `%${prefix}%`;

    const result = await client.query(
      `SELECT DISTINCT
          TRIM(s_no) AS s_no,
          TRIM(machine_name) AS machine_name
       FROM simplex.simplex_inspections
       WHERE COALESCE(TRIM(s_no), '') <> ''
         AND (
           $1::text = ''
           OR TRIM(s_no) ILIKE $2
           OR TRIM(machine_name) ILIKE $2
         )
       ORDER BY TRIM(s_no) ASC`,
      [prefix, likeToken]
    );

    const normalized = result.rows
      .map((r) => ({
        simplex_no: formatSimplexNo(r.s_no),
        s_no: String(r.s_no || '').trim(),
        machine_name: String(r.machine_name || '').trim()
      }))
      .filter((r) => r.simplex_no);

    const seen = new Set();
    const data = normalized.filter((r) => {
      const key = r.simplex_no.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (const simplexNo of DEFAULT_SIMPLEX_NUMBERS) {
      const key = simplexNo.toUpperCase();
      if (!seen.has(key)) {
        data.push({
          simplex_no: simplexNo,
          s_no: simplexNo.replace(/^SMX\s*/i, ''),
          machine_name: ''
        });
        seen.add(key);
      }
    }

    data.sort((a, b) => a.simplex_no.localeCompare(b.simplex_no, undefined, { numeric: true, sensitivity: 'base' }));

    return res.status(200).json({
      source: 'simplex.simplex_inspections',
      data,
      simplex_nos: data.map((r) => r.simplex_no),
      machine_names: data.map((r) => r.simplex_no)
    });
  } catch (error) {
    next(error);
  }
};

router.get('/study/machine-names', getStudyMachineNamesFromSpxCots);
router.get('/study/master/machine-names', getStudyMachineNamesFromSpxCots);


/**
 * @swagger
 * /simplex/study:
 *   post:
 *     summary: Create SMX Breaks Study Report
 *     tags: [Simplex]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
*             required:
*               - s_no
*               - entry_date
*               - machine_name
*               - operator_name
*             properties:
 *               s_no:
 *                 type: string
 *                 example: "1"
 *               entry_date:
 *                 type: string
 *                 format: date
 *               machine_name:
 *                 type: string
 *                 example: MC-01
 *               operator_name:
 *                 type: string
*               shift:
*                 type: string
*               inspection_items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     item_name:
 *                       type: string
 *                     status_value:
 *                       type: string
 *                     remarks:
 *                       type: string
 *               user_fiber_parameters:
 *                 type: object
 *                 properties:
 *                   A1: { type: string }
 *                   A2: { type: string }
 *                   A3: { type: string }
 *                   A4: { type: string }
 *                   B1: { type: string }
 *                   B2: { type: string }
 *                   B3: { type: string }
 *                   B4: { type: string }
 *                   C1: { type: string }
 *                   C2: { type: string }
 *                   C3: { type: string }
 *                   C4: { type: string }
 *                   D1: { type: string }
 *                   D2: { type: string }
 *                   D3: { type: string }
 *                   D4: { type: string }
 *               epi_parameters:
 *                 type: object
 *                 properties:
 *                   yarn_a1: { type: number }
 *                   yarn_a2: { type: number }
 *                   yarn_a3: { type: number }
 *                   yarn_a4: { type: number }
 *                   yarn_b1: { type: number }
 *                   yarn_b2: { type: number }
 *                   yarn_b3: { type: number }
 *                   yarn_b4: { type: number }
 *               other_field_values:
 *                 type: object
 *                 properties:
 *                   time: { type: string }
 *                   break_count: { type: number }
 *                   remarks: { type: string }
 *     responses:
 *       201:
 *         description: Report created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post('/study', async (req, res, next) => {
  try {
    await ensureSimplexEntryIdColumns();
    const {
      entry_id,
      s_no,
      entry_date,
      machine_name,
      operator_name,
      shift,
      inspection_items,
      items,
      user_fiber_parameters,
      epi_parameters,
      other_field_values
    } = req.body;
    // The current SMX Breaks Study Report form (SMXBreaksStudyReport.jsx) posts the break-matrix
    // cells under `items`, one row per (break category x length range) cell — `inspection_items`
    // is kept as an accepted alias for older/other callers that send one row per category.
    const breakMatrixItems = Array.isArray(inspection_items) ? inspection_items : items;
    const normalizedShift = String(shift || '').trim();

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    // Validation
    if (!s_no || !entry_date || !machine_name || !operator_name) {
      return res.status(400).json({
        message: 'Missing required fields: s_no, entry_date, machine_name, operator_name'
      });
    }
    await client.query('BEGIN');

    // Insert header
    const headerResult = await client.query(
      `INSERT INTO simplex.smx_breaks_study_header
       (entry_id, s_no, entry_date, machine_name, operator_name, shift)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [entry_id, s_no, entry_date, machine_name, operator_name, normalizedShift || null]
    );

    const study_id = headerResult.rows[0].id;

    // Each item is one (break category x length range) cell — item_name is the category,
    // length_range is the bucket (e.g. "0 - 200"), status_value is the cell's raw text (which
    // may itself be a comma-separated list of break events). Stored as-is; the report screen
    // (GET /list) derives all totals/rates fresh from these raw cells rather than from
    // pre-computed summary rows, so there's a single source of truth for the math.
    let grandTotalBreaks = 0;
    if (Array.isArray(breakMatrixItems)) {
      for (const item of breakMatrixItems) {
        const normalizedName = normalizeBreakItemName(item?.item_name);
        const lengthRange = item?.length_range ? String(item.length_range).trim() : null;
        const statusValue = item?.status_value === undefined || item?.status_value === null
          ? null
          : String(item.status_value);
        grandTotalBreaks += parseBreakArray(statusValue).length;
        await client.query(
          `INSERT INTO simplex.smx_breaks_inspection_items
           (study_id, item_name, status_value, remarks, length_range)
           VALUES ($1, $2, $3, $4, $5)`,
          [study_id, normalizedName, statusValue, item?.remarks || null, lengthRange]
        );
      }
    }

    const startTime = parseHHMM(req.body?.start_time || other_field_values?.start_time);
    const endTime = parseHHMM(req.body?.end_time || other_field_values?.end_time);
    const totalMinutes = diffMinutes(startTime?.hhmm, endTime?.hhmm);

    const providedTotalSpdl = toWholeNumberOrNull(req.body?.total_spdl ?? other_field_values?.total_spdl);
    const dbTotalSpdl = providedTotalSpdl ? null : await fetchCdgTotalSpdlFromDb(machine_name);
    const totalSpdl = providedTotalSpdl ?? dbTotalSpdl;
    const idleSpindles = toWholeNumberOrNull(req.body?.idle_spindles ?? req.body?.ideals ?? other_field_values?.idle_spindles ?? other_field_values?.ideals);
    const runningSpdl = (Number.isInteger(totalSpdl) && Number.isInteger(idleSpindles))
      ? Math.max(totalSpdl - idleSpindles, 0)
      : null;

    // Insert user fiber parameters
    if (user_fiber_parameters) {
      await client.query(
        `INSERT INTO simplex.smx_user_fiber_parameters
         (study_id, A1, A2, A3, A4, B1, B2, B3, B4, C1, C2, C3, C4, D1, D2, D3, D4)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          study_id,
          toWholeNumberOrNull(user_fiber_parameters.A1),
          toWholeNumberOrNull(user_fiber_parameters.A2),
          toWholeNumberOrNull(user_fiber_parameters.A3),
          toWholeNumberOrNull(user_fiber_parameters.A4),
          toWholeNumberOrNull(user_fiber_parameters.B1),
          toWholeNumberOrNull(user_fiber_parameters.B2),
          toWholeNumberOrNull(user_fiber_parameters.B3),
          toWholeNumberOrNull(user_fiber_parameters.B4),
          toWholeNumberOrNull(user_fiber_parameters.C1),
          toWholeNumberOrNull(user_fiber_parameters.C2),
          toWholeNumberOrNull(user_fiber_parameters.C3),
          toWholeNumberOrNull(user_fiber_parameters.C4),
          toWholeNumberOrNull(user_fiber_parameters.D1),
          toWholeNumberOrNull(user_fiber_parameters.D2),
          toWholeNumberOrNull(user_fiber_parameters.D3),
          toWholeNumberOrNull(user_fiber_parameters.D4)
        ]
      );
    }

    // Insert EPI parameters
    if (epi_parameters) {
      await client.query(
        `INSERT INTO simplex.smx_epi_parameters
         (study_id, yarn_a1, yarn_a2, yarn_a3, yarn_a4, yarn_b1, yarn_b2, yarn_b3, yarn_b4)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          study_id,
          toWholeNumberOrNull(epi_parameters.yarn_a1),
          toWholeNumberOrNull(epi_parameters.yarn_a2),
          toWholeNumberOrNull(epi_parameters.yarn_a3),
          toWholeNumberOrNull(epi_parameters.yarn_a4),
          toWholeNumberOrNull(epi_parameters.yarn_b1),
          toWholeNumberOrNull(epi_parameters.yarn_b2),
          toWholeNumberOrNull(epi_parameters.yarn_b3),
          toWholeNumberOrNull(epi_parameters.yarn_b4)
        ]
      );
    }

    // Insert other field values
    if (other_field_values) {
      const providedBreakArray = parseBreakArray(other_field_values.break_count);
      const computedBreakCount = providedBreakArray.length || grandTotalBreaks;
      const siderName = String(req.body?.s_name ?? other_field_values.s_name ?? other_field_values.sider_name ?? '').trim();
      // start_hk/finish_hk arrive only as top-level other_field_values fields (the form's own
      // JSON-stringified remarks blob doesn't include them), so — like START/END/TOTAL_MINUTES —
      // they have to be carried through as their own tag or they're lost on every submission.
      const startHkValue = toWholeNumberOrNull(other_field_values.start_hk);
      const finishHkValue = toWholeNumberOrNull(other_field_values.finish_hk);
      const remarksBlock = [
        other_field_values.remarks || null,
        siderName ? `S.NAME:${siderName}` : null,
        startTime?.hhmm ? `START:${startTime.hhmm}` : null,
        endTime?.hhmm ? `END:${endTime.hhmm}` : null,
        totalMinutes !== null ? `TOTAL_MINUTES:${totalMinutes}` : null,
        startHkValue !== null ? `START_HK:${startHkValue}` : null,
        finishHkValue !== null ? `FINISH_HK:${finishHkValue}` : null
      ].filter(Boolean).join(' | ') || null;
      await client.query(
        `INSERT INTO simplex.smx_other_field_values
         (study_id, time, break_count, remarks)
         VALUES ($1, $2, $3, $4)`,
        [
          study_id,
          startTime?.hhmm || other_field_values.time || null,
          toWholeNumberOrNull(computedBreakCount),
          remarksBlock
        ]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'SMX Breaks Study Report created successfully',
      study_id,
      entry_id,
      computed: {
        grand_total_breaks: grandTotalBreaks,
        total_time_minutes: totalMinutes,
        running_spdl: runningSpdl
      }
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
 * /simplex/list:
 *   get:
 *     summary: Get all SMX Breaks Study Reports
 *     tags: [Simplex]
 *     responses:
 *       200:
 *         description: List of study reports
 */
router.get('/list', async (req, res, next) => {
  try {
    const headerResult = await client.query(
      `SELECT * FROM simplex.smx_breaks_study_header ORDER BY entry_date DESC`
    );

    const studyIds = headerResult.rows.map((row) => row.id);
    const itemsByStudy = new Map();
    const otherByStudy = new Map();

    if (studyIds.length) {
      const itemsResult = await client.query(
        `SELECT * FROM simplex.smx_breaks_inspection_items WHERE study_id = ANY($1::int[])`,
        [studyIds]
      );
      itemsResult.rows.forEach((item) => {
        if (!itemsByStudy.has(item.study_id)) itemsByStudy.set(item.study_id, []);
        itemsByStudy.get(item.study_id).push(item);
      });

      const otherResult = await client.query(
        `SELECT DISTINCT ON (study_id) *
         FROM simplex.smx_other_field_values
         WHERE study_id = ANY($1::int[])
         ORDER BY study_id, id DESC`,
        [studyIds]
      );
      otherResult.rows.forEach((row) => otherByStudy.set(row.study_id, row));
    }

    const rows = headerResult.rows.map((header) =>
      withScreenEntryId(
        'study',
        buildSmxBreaksStudyRow(header, itemsByStudy.get(header.id), otherByStudy.get(header.id))
      )
    );

    res.status(200).json(rows);

  } catch (err) {
    next(err);
  }
});


/**
 * @swagger
 * /simplex/uqc:
 *   post:
 *     summary: Create UQC (U% Data Entry)
 *     tags: [Simplex]
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
 *                 example: "Simplex Department"
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
        await ensureSimplexEntryIdColumns();
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
            return res.status(400).json({ message: 'entry_id is required and must be unique' });
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
            `INSERT INTO simplex.u_data_entry
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
            data: withScreenEntryId('uqc', result.rows[0])
        });

    } catch (err) {
        console.error('❌ UQC INSERT ERROR:', err);
        res.status(500).json({
            message: 'Server error',
            error: err.message
        });
    }
});


/**
 * @swagger
 * /simplex/uqc:
 *   get:
 *     summary: Get UQC entries with pagination
 *     tags: [Simplex]
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
const getSimplexUqcEntries = async (req, res, { forceGlobal = false } = {}) => {
    try {
        await ensureSimplexEntryIdColumns();
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const fetchAll = String(req.query.all || '').toLowerCase() === 'true'
            || String(req.query.limit || '').toLowerCase() === 'all';
        const limit = fetchAll ? null : Math.max(1, parseInt(req.query.limit) || 10);
        const offset = limit ? (page - 1) * limit : 0;
        const department = String(req.query.department || '').trim();
        const globalMode = forceGlobal || String(req.query.global || '').toLowerCase() === 'true';
        const whereClause = (!globalMode && department) ? 'WHERE department ILIKE $1' : '';
        const baseParams = (!globalMode && department) ? [`%${department}%`] : [];

        const dataQuery = `
            SELECT *
            FROM simplex.u_data_entry
            ${whereClause}
            ORDER BY entry_date DESC
            ${limit ? `LIMIT $${baseParams.length + 1} OFFSET $${baseParams.length + 2}` : ''}
        `;

        const countQuery = `
            SELECT COUNT(*) FROM simplex.u_data_entry
            ${whereClause}
        `;

        const dataParams = limit ? [...baseParams, limit, offset] : baseParams;
        const dataResult = await client.query(dataQuery, dataParams);
        const countResult = await client.query(countQuery, baseParams);

        const total = parseInt(countResult.rows[0].count);

        res.json({
            page,
            limit: limit || 'all',
            global: globalMode || !department,
            department: department || null,
            total,
            totalPages: limit ? Math.ceil(total / limit) : 1,
            data: dataResult.rows.map((row) => withScreenEntryId('uqc', row))
        });

    } catch (err) {
        console.error('❌ UQC FETCH ERROR:', err);
        res.status(500).json({
            message: 'Server error',
            error: err.message
        });
    }
};

router.get('/uqc', getSimplexUqcEntries);

router.get('/uqc/global', async (req, res) => {
    return getSimplexUqcEntries(req, res, { forceGlobal: true });
});

router.post('/process_parameter', async (req, res, next) => {
  try {
    await ensureSimplexEntryIdColumns();
    const data = req.body;
    const entry_id = await resolveOrCreateProcessParameterEntryId(req.body.entry_id, { forceNew: req.body.force_new === true || req.body.force_new === 'true' });
    const count_name = pickFirstText(data.count_name, data.countName, data.count, data.count_value);
    const consignee_name = pickFirstText(data.consignee_name, data.consigneeName, data.consignee, data.consignee_value);
    const creation_date = pickFirstText(data.creation_date, data.creationDate, data.entry_date, data.entryDate, data.date);

    if (!count_name || !consignee_name || !creation_date) {
      return res.status(400).json({
        message: 'count_name, consignee_name and creation_date are required'
      });
    }

    const conflictingCountName = await getCountNameConflict(entry_id, count_name);
    if (conflictingCountName) {
      return res.status(409).json({ message: `This PP id (${entry_id}) already uses count name "${conflictingCountName}". All sub-departments under a PP id must use the same count name.` });
    }

    const result = await client.query(
      `INSERT INTO simplex.simplex_process_parameter (
        entry_id, type, count_name, consignee_name, creation_date,
        machine_no, make,
        delivery_hank, tpi_tm, speed,
        bottom_roller_setting, top_roller_setting,
        break_draft, total_draft, creel_draft,
        false_twist_grooves, spacer,
        top_arm_pressure, back_pressure, middle_pressure, front_pressure,
        coil_inch, lifter_combination_wheel, lifter_wheel, tension_wheel
      )
      VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,
        $8,$9,$10,
        $11,$12,
        $13,$14,$15,
        $16,$17,
        $18,$19,$20,$21,
        $22,$23,$24,$25
      )
      RETURNING *`,
      [
        entry_id,
        data.type || 'Process Parameter',
        count_name,
        consignee_name,
        creation_date,
        data.machine_no,
        data.make,
        data.delivery_hank,
        data.tpi_tm,
        data.speed,
        data.bottom_roller_setting,
        data.top_roller_setting,
        data.break_draft,
        data.total_draft,
        data.creel_draft,
        data.false_twist_grooves,
        data.spacer,
        data.top_arm_pressure,
        data.back_pressure,
        data.middle_pressure,
        data.front_pressure,
        data.coil_inch,
        data.lifter_combination_wheel,
        data.lifter_wheel,
        data.tension_wheel
      ]
    );

    recordPpNotebookSubmission({
      notebook: 'Simplex Process Parameter',
      department: 'Simplex',
      entryId: entry_id,
      sourceSchema: 'simplex',
      sourceTable: 'simplex_process_parameter',
      submittedByUserId: req.user?.id,
      submittedByName: req.user?.employee_id,
      submittedPayload: { count_name, consignee_name, creation_date }
    }).catch((err) => console.warn('[pp-notebook-log] Simplex Process Parameter failed:', err.message));

    res.status(201).json({
      message: 'Simplex entry created successfully',
      data: result.rows[0],
      entry_id,
      process_parameter_id: entry_id
    });

  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    console.error(error);
    next(error);
  }
});

router.get('/process_parameter', async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT *
       FROM simplex.simplex_process_parameter
       ORDER BY id DESC
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const totalResult = await client.query(
      `SELECT COUNT(*) FROM simplex.simplex_process_parameter`
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

router.put('/process_parameter/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const data = req.body;

    const currentResult = await client.query(
      `SELECT entry_id FROM simplex.simplex_process_parameter WHERE id = $1`,
      [id]
    );

    if (currentResult.rowCount === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    const requestedEntryId = String(data.entry_id || '').trim();
    const currentEntryId = String(currentResult.rows[0].entry_id || '').trim();

    if (requestedEntryId && requestedEntryId !== currentEntryId) {
      const insertResult = await client.query(
        `INSERT INTO simplex.simplex_process_parameter (
          entry_id, type, count_name, consignee_name, creation_date,
          machine_no, make,
          delivery_hank, tpi_tm, speed,
          bottom_roller_setting, top_roller_setting,
          break_draft, total_draft, creel_draft,
          false_twist_grooves, spacer,
          top_arm_pressure, back_pressure, middle_pressure, front_pressure,
          coil_inch, lifter_combination_wheel, lifter_wheel, tension_wheel
        )
        VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,
          $8,$9,$10,
          $11,$12,
          $13,$14,$15,
          $16,$17,
          $18,$19,$20,$21,
          $22,$23,$24,$25
        )
        RETURNING *`,
        [
          requestedEntryId,
          data.type || 'Process Parameter',
          data.count_name,
          data.consignee_name,
          data.creation_date,
          data.machine_no,
          data.make,
          data.delivery_hank,
          data.tpi_tm,
          data.speed,
          data.bottom_roller_setting,
          data.top_roller_setting,
          data.break_draft,
          data.total_draft,
          data.creel_draft,
          data.false_twist_grooves,
          data.spacer,
          data.top_arm_pressure,
          data.back_pressure,
          data.middle_pressure,
          data.front_pressure,
          data.coil_inch,
          data.lifter_combination_wheel,
          data.lifter_wheel,
          data.tension_wheel
        ]
      );

      return res.status(201).json({
        message: 'Simplex entry created successfully',
        data: withScreenEntryId('process_parameter', insertResult.rows[0])
      });
    }

    const result = await client.query(
      `UPDATE simplex.simplex_process_parameter
       SET type=$1,
           count_name=$2,
           consignee_name=$3,
           creation_date=$4,
           machine_no=$5,
           make=$6,
           delivery_hank=$7,
           tpi_tm=$8,
           speed=$9,
           bottom_roller_setting=$10,
           top_roller_setting=$11,
           break_draft=$12,
           total_draft=$13,
           creel_draft=$14,
           false_twist_grooves=$15,
           spacer=$16,
           top_arm_pressure=$17,
           back_pressure=$18,
           middle_pressure=$19,
           front_pressure=$20,
           coil_inch=$21,
           lifter_combination_wheel=$22,
           lifter_wheel=$23,
           tension_wheel=$24,
           updated_at = CURRENT_TIMESTAMP
       WHERE id=$25
       RETURNING *`,
      [
        data.type || 'Process Parameter',
        count_name,
        consignee_name,
        creation_date,
        data.machine_no,
        data.make,
        data.delivery_hank,
        data.tpi_tm,
        data.speed,
        data.bottom_roller_setting,
        data.top_roller_setting,
        data.break_draft,
        data.total_draft,
        data.creel_draft,
        data.false_twist_grooves,
        data.spacer,
        data.top_arm_pressure,
        data.back_pressure,
        data.middle_pressure,
        data.front_pressure,
        data.coil_inch,
        data.lifter_combination_wheel,
        data.lifter_wheel,
        data.tension_wheel,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.status(200).json({
      message: 'Updated successfully',
      data: result.rows[0],
      entry_id: result.rows[0].entry_id,
      process_parameter_id: result.rows[0].entry_id
    });

  } catch (error) {
    console.error(error);
    next(error);
  }
});

// ---------------------------------------------------------------------------
// Simplex Wheel Change (existing/proposed L2-approval workflow)
// ---------------------------------------------------------------------------
// Mirrors spinning's wheel-change pattern: an operator submits only the
// "Proposed" values, the backend fills in "Existing" from the last approved
// entry for that machine, the row sits as 'pending' until an L2 reviewer
// approves or rejects it, and a fresh submission for the same machine
// overrides whatever was still pending/rejected. Unlike spinning (which has
// fixed existing/proposed SQL columns), simplex has no predefined parameter
// list, so each parameter row is stored as JSON: { key, label, existing, proposed }.
const ensureSimplexWheelChangeTable = async () => {
  await client.query(`CREATE SCHEMA IF NOT EXISTS simplex`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS simplex.wheel_change (
      id BIGSERIAL PRIMARY KEY,
      entry_id TEXT,
      type TEXT NOT NULL DEFAULT 'Wheel Change',
      machine_no TEXT,
      wheel_change_type TEXT,
      wheel_change_type_label TEXT,
      entry_date DATE,
      parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
      rows JSONB NOT NULL DEFAULT '{}'::jsonb,
      operator TEXT,
      remarks TEXT,
      approval_status TEXT DEFAULT 'approved',
      review_remarks TEXT,
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    ALTER TABLE simplex.wheel_change
      ADD COLUMN IF NOT EXISTS entry_id TEXT,
      ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'Wheel Change',
      ADD COLUMN IF NOT EXISTS machine_no TEXT,
      ADD COLUMN IF NOT EXISTS wheel_change_type TEXT,
      ADD COLUMN IF NOT EXISTS wheel_change_type_label TEXT,
      ADD COLUMN IF NOT EXISTS entry_date DATE,
      ADD COLUMN IF NOT EXISTS parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS rows JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS operator TEXT,
      ADD COLUMN IF NOT EXISTS remarks TEXT,
      ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved',
      ADD COLUMN IF NOT EXISTS review_remarks TEXT,
      ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS simplex_wheel_change_entry_id_uq
    ON simplex.wheel_change (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS simplex_wheel_change_entry_date_idx
    ON simplex.wheel_change (entry_date DESC, id DESC);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS simplex_wheel_change_machine_no_idx
    ON simplex.wheel_change (machine_no, created_at DESC);
  `);
};

const normalizeSimplexJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
};

const normalizeSimplexJsonObject = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const normalizeSimplexWheelChangeParameters = (payload = {}) => {
  const parameters = normalizeSimplexJsonArray(payload.parameters ?? payload.parameter_rows ?? payload.parameterRows);
  if (parameters.length) return parameters;

  const rowMap = normalizeSimplexJsonObject(payload.rows);
  return Object.values(rowMap).filter((row) => row && typeof row === 'object');
};

const normalizeSimplexWheelChangeRows = (payload = {}, parameters = []) => {
  const rowMap = normalizeSimplexJsonObject(payload.rows);
  if (Object.keys(rowMap).length) return rowMap;

  return parameters.reduce((acc, row) => {
    if (row && typeof row === 'object' && row.key) {
      acc[row.key] = row;
    }
    return acc;
  }, {});
};

const hydrateSimplexWheelChangeRow = (row) => {
  const parameters = Array.isArray(row.parameters)
    ? row.parameters
    : normalizeSimplexWheelChangeParameters({ parameters: row.parameters, rows: row.rows });
  const rows = normalizeSimplexWheelChangeRows({ rows: row.rows }, parameters);
  return {
    ...row,
    parameters,
    rows
  };
};

// Only an L2-approved row counts as the trusted "existing" baseline for the
// next entry on the same machine - a still-pending proposal hasn't been
// verified yet.
const fetchLatestApprovedSimplexWheelChange = async (machineNo) => {
  const value = String(machineNo || '').trim();
  if (!value) return null;

  const result = await client.query(
    `SELECT *
     FROM simplex.wheel_change
     WHERE LOWER(TRIM(COALESCE(machine_no, ''))) = LOWER(TRIM($1))
       AND LOWER(TRIM(COALESCE(approval_status, 'approved'))) = 'approved'
     ORDER BY created_at DESC NULLS LAST, id DESC
     LIMIT 1`,
    [value]
  );

  return result.rows[0] || null;
};

// Carries each "Proposed" value from the last approved entry on this machine
// into the new entry's "Existing" field for the same parameter key, so the
// operator only has to type the new "Proposed" setting each time.
const withSimplexCarriedForwardExisting = (parameters, previousRow) => {
  if (!previousRow) return parameters;

  const previousRows = normalizeSimplexJsonObject(previousRow.rows);
  return parameters.map((param) => {
    if (!param || typeof param !== 'object' || !param.key) return param;
    const previous = previousRows[param.key];
    if (!previous) return param;
    return { ...param, existing: previous.proposed ?? param.existing ?? null };
  });
};

// A machine can only have one proposal awaiting/needing L2 attention at a
// time. Submitting a new entry for the same machine overrides whatever was
// still 'pending', or was 'rejected' by L2 (approved rows are never touched -
// they're the permanent record).
const supersedePendingSimplexWheelChangeEntry = async (machineNo) => {
  const value = String(machineNo || '').trim();
  if (!value) return;

  await client.query(
    `DELETE FROM simplex.wheel_change
     WHERE LOWER(TRIM(COALESCE(machine_no, ''))) = LOWER(TRIM($1))
       AND LOWER(TRIM(COALESCE(approval_status, 'approved'))) IN ('pending', 'rejected')`,
    [value]
  );
};

const createSimplexWheelChangeEntry = async (req, res, next, defaultWheelChangeType = null, defaultWheelChangeTypeLabel = null) => {
  try {
    await ensureSimplexWheelChangeTable();

    const payload = req.body || {};
    const entry_id = String(payload.entry_id ?? payload.entryId ?? '').trim() || null;
    const type = String(payload.type ?? 'Wheel Change').trim() || 'Wheel Change';
    const machine_no = String(payload.machine_no ?? payload.machineNo ?? payload.machine ?? '').trim() || null;
    const wheel_change_type = String(
      payload.wheel_change_type ?? payload.wheelChangeType ?? defaultWheelChangeType ?? ''
    ).trim() || null;
    const wheel_change_type_label = String(
      payload.wheel_change_type_label ?? payload.wheelChangeTypeLabel ?? defaultWheelChangeTypeLabel ?? ''
    ).trim() || null;
    const entry_date = parseNotebookDate(payload.entry_date ?? payload.entryDate ?? payload.date);
    const operator = String(payload.operator ?? payload.operator_name ?? payload.operatorName ?? '').trim() || null;
    const remarks = String(payload.remarks ?? payload.remark ?? payload.comments ?? '').trim() || null;

    if (!machine_no) {
      return res.status(400).json({ message: 'machine_no is required' });
    }

    let parameters = normalizeSimplexWheelChangeParameters(payload);
    const previousRow = await fetchLatestApprovedSimplexWheelChange(machine_no);
    parameters = withSimplexCarriedForwardExisting(parameters, previousRow);
    // Rebuild the "rows" keyed map from the (carry-forward-applied) parameters
    // rather than payload.rows verbatim - otherwise the stored rows map would
    // keep whatever stale "existing" the frontend originally submitted, even
    // though the parameters array now has the correct carried-forward value.
    const rows = parameters.reduce((acc, param) => {
      if (param && typeof param === 'object' && param.key) {
        acc[param.key] = param;
      }
      return acc;
    }, {});

    await supersedePendingSimplexWheelChangeEntry(machine_no);

    const result = await client.query(
      `INSERT INTO simplex.wheel_change (
         entry_id, type, machine_no, wheel_change_type, wheel_change_type_label, entry_date, parameters, rows,
         operator, remarks, approval_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, 'pending')
       RETURNING *`,
      [
        entry_id,
        type,
        machine_no,
        wheel_change_type,
        wheel_change_type_label,
        entry_date,
        JSON.stringify(parameters),
        JSON.stringify(rows),
        operator,
        remarks
      ]
    );

    res.status(201).json({
      message: 'Simplex wheel change entry created successfully',
      data: withScreenEntryId('wheel_change', hydrateSimplexWheelChangeRow(result.rows[0])),
      entry_id: result.rows[0].entry_id
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    console.error('Simplex wheel change insert error:', error);
    next(error);
  }
};

const getSimplexWheelChangeEntries = async (req, res, next, defaultWheelChangeType = null) => {
  try {
    await ensureSimplexWheelChangeTable();

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;
    const requestedType = String(req.query.wheel_change_type ?? req.query.wheelChangeType ?? defaultWheelChangeType ?? '').trim();
    const requestedMachineNo = String(req.query.machine_no ?? req.query.machineNo ?? '').trim();
    const requestedApprovalStatus = String(req.query.approval_status ?? req.query.approvalStatus ?? req.query.status ?? '').trim().toLowerCase();
    // The frontend looks up "what was last saved" by Mixing before a machine
    // is even picked, so the mixing value has to be matched inside the
    // rows.mixing JSONB blob (there's no dedicated mixing column).
    const requestedMixing = String(req.query.variety ?? req.query.variety_name ?? req.query.mixing ?? '').trim();

    const conditions = [];
    const filterParams = [];
    if (requestedType) {
      filterParams.push(requestedType);
      conditions.push(`wheel_change_type = $${filterParams.length}`);
    }
    if (requestedMachineNo) {
      filterParams.push(requestedMachineNo);
      conditions.push(`LOWER(TRIM(COALESCE(machine_no, ''))) = LOWER(TRIM($${filterParams.length}))`);
    }
    if (requestedApprovalStatus) {
      filterParams.push(requestedApprovalStatus);
      conditions.push(`LOWER(TRIM(COALESCE(approval_status, 'approved'))) = $${filterParams.length}`);
    }
    if (requestedMixing) {
      filterParams.push(requestedMixing);
      conditions.push(`(LOWER(TRIM(COALESCE(rows->'mixing'->>'existing', ''))) = LOWER(TRIM($${filterParams.length}))
        OR LOWER(TRIM(COALESCE(rows->'mixing'->>'proposed', ''))) = LOWER(TRIM($${filterParams.length})))`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [dataResult, totalResult] = await Promise.all([
      client.query(
        `SELECT *
         FROM simplex.wheel_change
         ${whereClause}
         ORDER BY entry_date DESC NULLS LAST, id DESC
         LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2}`,
        [...filterParams, limit, offset]
      ),
      client.query(
        `SELECT COUNT(*) FROM simplex.wheel_change ${whereClause}`,
        filterParams
      )
    ]);

    const total = parseInt(totalResult.rows[0].count, 10) || 0;

    res.status(200).json({
      data: dataResult.rows.map((row) => withScreenEntryId('wheel_change', hydrateSimplexWheelChangeRow(row))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Simplex wheel change fetch error:', error);
    next(error);
  }
};

router.post('/wheel-change', (req, res, next) => createSimplexWheelChangeEntry(req, res, next));
router.get('/wheel-change', (req, res, next) => getSimplexWheelChangeEntries(req, res, next));

// Wheel-change approvals flip data other screens may treat as the trusted
// record, so approval/rejection is restricted to L2 reviewers server-side.
// Admin accounts (role "admin" or employee_id like ADMIN001) get the same
// access as L2.
const isSimplexAdminReviewer = (req) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  if (role === 'admin') return true;

  const employeeId = String(req.user?.employee_id || '').trim().toLowerCase();
  return /^admin\s*0*\d+$/.test(employeeId);
};

const parseSimplexPositiveInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const getSimplexReviewerLevel = async (req) => {
  const tokenLevel = String(req.user?.level || '').trim().toUpperCase();
  if (tokenLevel === 'L1' || tokenLevel === 'L2' || tokenLevel === 'L3') return tokenLevel;

  const requesterId = parseSimplexPositiveInt(req.user?.id);
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

const requireSimplexL2Reviewer = async (req, res) => {
  if (isSimplexAdminReviewer(req)) return true;

  const level = await getSimplexReviewerLevel(req);
  if (level !== 'L2') {
    res.status(403).json({ message: 'Only L2 reviewers can access wheel change approvals' });
    return false;
  }
  return true;
};

/**
 * @swagger
 * /simplex/wheel-change/approvals:
 *   get:
 *     summary: Pending (or approved/rejected) simplex wheel change entries
 *     tags: [Simplex Wheel Change Approvals]
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
router.get('/wheel-change/approvals', async (req, res, next) => {
  try {
    if (!(await requireSimplexL2Reviewer(req, res))) return;

    await ensureSimplexWheelChangeTable();
    const status = String(req.query.approval_status || req.query.approvalStatus || req.query.status || 'pending').trim().toLowerCase();

    const result = await client.query(
      `SELECT *
       FROM simplex.wheel_change
       WHERE LOWER(TRIM(COALESCE(approval_status, 'approved'))) = $1
       ORDER BY created_at DESC NULLS LAST, id DESC`,
      [status]
    );

    const data = result.rows.map((row) => withScreenEntryId('wheel_change', hydrateSimplexWheelChangeRow(row)));

    res.json({ data, total: data.length, status });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /simplex/wheel-change/approvals/{id}/approve:
 *   post:
 *     summary: Approve a pending simplex wheel change entry
 *     tags: [Simplex Wheel Change Approvals]
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
router.post('/wheel-change/approvals/:id/approve', async (req, res, next) => {
  try {
    if (!(await requireSimplexL2Reviewer(req, res))) return;

    const id = parseSimplexPositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'id must be a numeric wheel change entry id' });
    }

    const reviewerLabel = String(req.user?.employee_id || req.user?.name || req.user?.username || req.user?.id || '').trim();

    const result = await client.query(
      `UPDATE simplex.wheel_change
       SET approval_status = 'approved',
           reviewed_by = $2,
           reviewed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, reviewerLabel || null]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Wheel change entry not found' });
    }

    res.json({
      message: 'Wheel change entry approved',
      data: withScreenEntryId('wheel_change', hydrateSimplexWheelChangeRow(result.rows[0]))
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /simplex/wheel-change/approvals/{id}/reject:
 *   post:
 *     summary: Reject a pending simplex wheel change entry
 *     tags: [Simplex Wheel Change Approvals]
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
router.post('/wheel-change/approvals/:id/reject', async (req, res, next) => {
  try {
    if (!(await requireSimplexL2Reviewer(req, res))) return;

    const id = parseSimplexPositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'id must be a numeric wheel change entry id' });
    }

    const reason = String(req.body?.reason || req.body?.remarks || req.body?.review_remarks || '').trim() || null;
    const reviewerLabel = String(req.user?.employee_id || req.user?.name || req.user?.username || req.user?.id || '').trim();

    const result = await client.query(
      `UPDATE simplex.wheel_change
       SET approval_status = 'rejected',
           review_remarks = $2,
           reviewed_by = $3,
           reviewed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, reason, reviewerLabel || null]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Wheel change entry not found' });
    }

    res.json({
      message: 'Wheel change entry rejected',
      data: withScreenEntryId('wheel_change', hydrateSimplexWheelChangeRow(result.rows[0]))
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

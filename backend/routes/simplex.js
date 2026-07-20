const express = require('express');
const router = express.Router();
const client = require('../connection');
const sqlServer = require('../config/sqlserver');
const sqlServerPrep = require('../config/sqlserverPrep');
const { fetchPrepVarieties, isDatabaseAccessDenied } = require('../utils/prepVariety');
const { createEmployeeMasterDropdown } = require('../utils/employeeMaster');
const { resolveOrCreateProcessParameterEntryId, getCountNameConflict } = require('../utils/processParameterEntryId');
const SCREEN_ID_PREFIXES = {
  smx_cots_change: 'SX',
  study: 'SS',
  uqc: 'SU',
  process_parameter: 'SP',
  wrapping_simplex_notebook: 'WS',
  simplex_wheel_change: 'SWC'
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
// These Simplex tables store created_at/updated_at as `timestamp WITHOUT time zone` with a bare
// CURRENT_TIMESTAMP default — on this DB, that silently writes a different offset than what gets
// displayed back, shifting "Created At" by several hours (sometimes onto the wrong calendar day)
// in Custom Report. Same root cause and same fix as Comber's/Draw Frame's equivalent tables:
// convert to timestamptz so new rows store an unambiguous absolute instant.
let simplexTimestampColumnsReady = false;
const ensureSimplexTimestampColumnsHaveTimezone = async () => {
  if (simplexTimestampColumnsReady) return;
  const columnsByTable = {
    simplex_inspections: ['created_at'],
    smx_breaks_study_header: ['created_at', 'updated_at'],
    u_data_entry: ['created_at'],
    simplex_process_parameter: ['created_at', 'updated_at']
  };
  for (const [table, columns] of Object.entries(columnsByTable)) {
    for (const column of columns) {
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'simplex' AND table_name = '${table}' AND column_name = '${column}'
              AND data_type = 'timestamp without time zone'
          ) THEN
            ALTER TABLE simplex.${table}
              ALTER COLUMN ${column} TYPE timestamptz USING ${column} AT TIME ZONE 'UTC';
            ALTER TABLE simplex.${table}
              ALTER COLUMN ${column} SET DEFAULT now();
          END IF;
        END $$;
      `);
    }
  }
  simplexTimestampColumnsReady = true;
};
const ALLOWED_SHIFT_TYPES = new Set(['General', 'Day', 'Half Night', 'Full Night']);
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
  await ensureSimplexTimestampColumnsHaveTimezone();
  await client.query(`
    ALTER TABLE IF EXISTS simplex.simplex_inspections
      ADD COLUMN IF NOT EXISTS entry_id text;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS simplex_inspections_entry_id_uq
    ON simplex.simplex_inspections (entry_id)
    WHERE entry_id IS NOT NULL;
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

// ---------------------------------------------------------------------------
// Simplex Wheel Change — the frontend (WheelChange.jsx) and its API client
// (fetchSimplexWheelChangeEntries/submitSimplexWheelChangeEntry/
// approve|rejectSimplexWheelChangeApproval) were fully built assuming a
// /simplex/wheel-change route family, but it was never implemented at all —
// every submission 404'd. Same entry_id/parameters/rows shape already used
// by Draw Frame's wheel_change table, plus the pending/approved/rejected
// approval workflow the frontend UI already expects (Overwrite Warning
// banners, Awaiting L2 / Rejected badges) — that workflow doesn't exist
// anywhere else in the backend yet either, so it's built fresh here.
const ensureSimplexWheelChangeTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS simplex.wheel_change (
      id BIGSERIAL PRIMARY KEY,
      entry_id TEXT,
      type TEXT NOT NULL DEFAULT 'Wheel Change',
      machine_no TEXT,
      proposed_sap_no TEXT,
      wheel_change_type TEXT,
      wheel_change_type_label TEXT,
      entry_date DATE,
      parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
      rows JSONB NOT NULL DEFAULT '{}'::jsonb,
      operator TEXT,
      remarks TEXT,
      approval_status TEXT NOT NULL DEFAULT 'approved',
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
      ADD COLUMN IF NOT EXISTS proposed_sap_no TEXT,
      ADD COLUMN IF NOT EXISTS wheel_change_type TEXT,
      ADD COLUMN IF NOT EXISTS wheel_change_type_label TEXT,
      ADD COLUMN IF NOT EXISTS entry_date DATE,
      ADD COLUMN IF NOT EXISTS parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS rows JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS operator TEXT,
      ADD COLUMN IF NOT EXISTS remarks TEXT,
      ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS review_remarks TEXT,
      ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
  // ADD COLUMN IF NOT EXISTS above is a no-op once the column already exists,
  // so a prior deploy's wrong default ('approved') would otherwise persist
  // forever. Force it explicitly on every startup.
  await client.query(`
    ALTER TABLE simplex.wheel_change ALTER COLUMN approval_status SET DEFAULT 'pending';
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS simplex_wheel_change_entry_id_uq
    ON simplex.wheel_change (entry_id)
    WHERE entry_id IS NOT NULL;
  `);
};

// Mirrors spinning.js's fetchLatestWheelChangeByMachine — scoped to the
// machine_no column so the Existing column can carry forward for Simplex as
// soon as SMX No. is picked, even before Mixing / Process is chosen. Once
// Mixing is selected, the mixing-scoped lookup (client-side, see
// WheelChange.jsx's loadLatestForMixing) takes over as the more specific
// match.
const fetchSimplexLatestWheelChangeByMachine = async (machineNumber, approvalStatus = 'approved') => {
  const selectedMachine = String(machineNumber || '').trim();
  if (!selectedMachine) return null;

  const result = await client.query(
    `SELECT *
     FROM simplex.wheel_change
     WHERE LOWER(TRIM(COALESCE(machine_no::text, ''))) = LOWER(TRIM($1))
       AND approval_status = $2
     ORDER BY created_at DESC NULLS LAST, id DESC
     LIMIT 1`,
    [selectedMachine, approvalStatus]
  );

  return result.rows[0] || null;
};

router.post('/wheel-change', async (req, res, next) => {
  try {
    await ensureSimplexWheelChangeTable();
    const payload = req.body || {};
    const entry_id = String(payload.entry_id ?? '').trim() || null;
    const type = String(payload.type ?? payload.notebook_type ?? 'Wheel Change').trim() || 'Wheel Change';
    const machine_no = String(payload.machine_no ?? payload.sap_no ?? '').trim() || null;
    const proposed_sap_no = String(payload.proposed_sap_no ?? payload.smxNoProposed ?? '').trim() || null;
    const wheel_change_type = String(payload.wheel_change_type ?? '').trim() || null;
    const wheel_change_type_label = String(payload.wheel_change_type_label ?? '').trim() || null;
    const entry_date = payload.entry_date ? String(payload.entry_date).slice(0, 10) : null;
    const parameters = normalizeParameterRows(payload.parameters ?? payload.rows);
    const rowsBlob = payload.rows && typeof payload.rows === 'object' ? payload.rows : {};
    const operator = String(payload.operator ?? '').trim() || null;
    const remarks = String(payload.remarks ?? '').trim() || null;
    const approval_status = String(payload.approval_status ?? 'pending').trim() || 'pending';

    if (!entry_date) {
      return res.status(400).json({ message: 'entry_date is required' });
    }

    const result = await client.query(
      `INSERT INTO simplex.wheel_change (
         entry_id, type, machine_no, proposed_sap_no, wheel_change_type, wheel_change_type_label, entry_date,
         parameters, rows, operator, remarks, approval_status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12)
       RETURNING *`,
      [
        entry_id, type, machine_no, proposed_sap_no, wheel_change_type, wheel_change_type_label, entry_date,
        JSON.stringify(parameters), JSON.stringify(rowsBlob), operator, remarks, approval_status
      ]
    );

    res.status(201).json({
      message: 'Simplex wheel change entry created successfully',
      data: withScreenEntryId('simplex_wheel_change', result.rows[0]),
      entry_id: result.rows[0].entry_id
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    console.error('Simplex wheel change insert error:', error);
    next(error);
  }
});

router.get('/wheel-change', async (req, res, next) => {
  try {
    await ensureSimplexWheelChangeTable();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;
    const approvalStatus = String(req.query.approval_status ?? '').trim();
    const variety = String(req.query.variety || req.query.variety_name || req.query.mixing || '').trim();
    const machineNo = String(req.query.machine_no || req.query.sap_no || req.query.smx_no || '').trim();
    const whereClause = approvalStatus ? 'WHERE approval_status = $3' : '';
    const queryParams = approvalStatus ? [limit, offset, approvalStatus] : [limit, offset];

    const result = await client.query(
      `SELECT * FROM simplex.wheel_change ${whereClause}
       ORDER BY entry_date DESC NULLS LAST, id DESC
       LIMIT $1 OFFSET $2`,
      queryParams
    );
    const totalResult = await client.query(
      `SELECT COUNT(*) FROM simplex.wheel_change ${approvalStatus ? 'WHERE approval_status = $1' : ''}`,
      approvalStatus ? [approvalStatus] : []
    );

    // Mixing/variety is stored inside the parameters JSONB blob rather than
    // its own column, so it's matched client-side (see WheelChange.jsx's
    // extractLatestNotebookEntryForMixing). Machine No. does have its own
    // column, so it can carry forward server-side as soon as SMX No. is
    // picked, before Mixing / Process is chosen — mirrors spinning.js's
    // fetchLatestWheelChangeByMachine fallback.
    const latestRecord = variety
      ? null
      : machineNo
        ? await fetchSimplexLatestWheelChangeByMachine(machineNo, approvalStatus || 'approved')
        : null;

    res.status(200).json({
      data: result.rows.map((row) => withScreenEntryId('simplex_wheel_change', row)),
      latest_record: latestRecord ? withScreenEntryId('simplex_wheel_change', latestRecord) : null,
      total: parseInt(totalResult.rows[0].count, 10) || 0,
      page,
      limit
    });
  } catch (error) {
    console.error('Simplex wheel change fetch error:', error);
    next(error);
  }
});

router.get('/wheel-change/approvals', async (req, res, next) => {
  try {
    await ensureSimplexWheelChangeTable();
    const status = String(req.query.status ?? '').trim();
    const whereClause = status ? 'WHERE approval_status = $1' : '';
    const result = await client.query(
      `SELECT * FROM simplex.wheel_change ${whereClause} ORDER BY created_at DESC, id DESC`,
      status ? [status] : []
    );
    res.status(200).json({ data: result.rows.map((row) => withScreenEntryId('simplex_wheel_change', row)) });
  } catch (error) {
    console.error('Simplex wheel change approvals fetch error:', error);
    next(error);
  }
});

router.post('/wheel-change/approvals/:id/approve', async (req, res, next) => {
  try {
    await ensureSimplexWheelChangeTable();
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid ID supplied' });
    }
    const reviewedBy = String(req.body?.department ?? req.body?.reviewed_by ?? '').trim() || null;
    const result = await client.query(
      `UPDATE simplex.wheel_change
       SET approval_status = 'approved', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [reviewedBy, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }
    res.status(200).json({
      message: 'Simplex wheel change entry approved',
      data: withScreenEntryId('simplex_wheel_change', result.rows[0])
    });
  } catch (error) {
    console.error('Simplex wheel change approve error:', error);
    next(error);
  }
});

router.post('/wheel-change/approvals/:id/reject', async (req, res, next) => {
  try {
    await ensureSimplexWheelChangeTable();
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid ID supplied' });
    }
    const reviewedBy = String(req.body?.department ?? req.body?.reviewed_by ?? '').trim() || null;
    const reason = String(req.body?.reason ?? '').trim() || null;
    const result = await client.query(
      `UPDATE simplex.wheel_change
       SET approval_status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), review_remarks = $2
       WHERE id = $3
       RETURNING *`,
      [reviewedBy, reason, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }
    res.status(200).json({
      message: 'Simplex wheel change entry rejected',
      data: withScreenEntryId('simplex_wheel_change', result.rows[0])
    });
  } catch (error) {
    console.error('Simplex wheel change reject error:', error);
    next(error);
  }
});

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
    `SELECT
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
router.get('/process_parameter/master/counts', getCountMasterDropdown);
router.get('/process_parameter/master/count-dropdown', getCountMasterDropdown);
router.get('/process_parameter/master/count-names', getCountMasterDropdown);
router.get('/process_parameter/master-data', getCountMasterDropdown);
router.get('/process_parameter/master/dropdown', getCountMasterDropdown);
router.get('/process-parameter/master/counts', getCountMasterDropdown);
router.get('/process-parameter/master/count-dropdown', getCountMasterDropdown);
router.get('/process-parameter/master/count-names', getCountMasterDropdown);
router.get('/process-parameter/master-data', getCountMasterDropdown);
router.get('/process-parameter/master/dropdown', getCountMasterDropdown);
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
 *               - s_no
 *               - entry_date
 *               - machine_name
 *               - items
 *             properties:
 *               type:
 *                 type: string
 *                 example: SMXCots Change Data Entry
 *               s_no:
 *                 type: string
 *                 example: "2"
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
 *                       example: Cots Damage
 *                     status_value:
 *                       type: string
 *                       example: OK
 *                     remarks:
 *                       type: string
 *                       example: Good condition
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
      s_no,
      entry_date,
      machine_name,
      items
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    await client.query('BEGIN');

    // ✅ Insert header
    const headerResult = await client.query(
      `INSERT INTO simplex.simplex_inspections
       (entry_id, type, s_no, entry_date, machine_name)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [entry_id, type, s_no, entry_date, machine_name]
    );

    const inspection_id = headerResult.rows[0].id;

    // ✅ Insert items
    for (const item of items) {
      await client.query(
        `INSERT INTO simplex.simplex_inspection_details
         (inspection_id, item_name, status_value, remarks)
         VALUES ($1,$2,$3,$4)`,
        [
          inspection_id,
          item.item_name,
          item.status_value,
          item.remarks
        ]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Saved successfully',
      inspection_id,
      entry_id
    });

  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    console.error(err);
    res.status(500).json({ message: 'Save failed' });
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
 *                   s_no: "2"
 *                   entry_date: "2026-04-01"
 *                   machine_name: MC-01
 *                   created_at: "2026-04-01T10:00:00.000Z"
 *       500:
 *         description: Server error
 */
const getSimplexCotsChange = async (req, res) => {
  try {
    await ensureSimplexEntryIdColumns();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // ✅ Get total count
    const countResult = await client.query(
      `SELECT COUNT(*) FROM simplex.simplex_inspections`
    );

    const total = parseInt(countResult.rows[0].count);

    // ✅ Get data — each submission's per-item damage checks live in a separate child table
    // (simplex_inspection_details, keyed by this header row's own `id`), never joined here
    // before, so every damage-check field (Front Cots Damage, Cradle Lifting, ...) was always
    // absent and showed as "-" in Custom Report. LATERAL-join it back into an `items` array.
    const result = await client.query(
      `SELECT si.*,
          COALESCE(items.items, '[]'::json) AS items
       FROM simplex.simplex_inspections si
       LEFT JOIN LATERAL (
          SELECT json_agg(json_build_object(
              'item_name', d.item_name,
              'status_value', d.status_value,
              'remarks', d.remarks
          )) AS items
          FROM simplex.simplex_inspection_details d
          WHERE d.inspection_id = si.id
       ) items ON true
       ORDER BY si.id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.status(200).json({
      total,
      page,
      limit,
      data: result.rows.map((row) => withScreenEntryId('smx_cots_change', row))
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
 *               - shift
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
 *                 enum: [A, B, C]
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
      user_fiber_parameters,
      epi_parameters,
      other_field_values
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    // Validation — the SMX Breaks Study Report form has no Shift field at all (only s_no,
    // entry_date, machine_name, operator_name are ever collected/sent), so requiring `shift`
    // here made every submission fail with a misleading "missing fields" message that also
    // named the 4 fields that actually were present. `shift`/`operator_name` are nullable in
    // the DB, so only the 3 truly-required fields are checked now.
    if (!s_no || !entry_date || !machine_name) {
      return res.status(400).json({
        message: 'Missing required fields: s_no, entry_date, machine_name'
      });
    }
    if (shift && !ALLOWED_SHIFT_TYPES.has(String(shift).trim())) {
      return res.status(400).json({
        message: 'shift must be one of: General, Day, Half Night, Full Night'
      });
    }

    await client.query('BEGIN');

    // Insert header
    const headerResult = await client.query(
      `INSERT INTO simplex.smx_breaks_study_header
       (entry_id, s_no, entry_date, machine_name, operator_name, shift)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [entry_id, s_no, entry_date, machine_name, operator_name, shift]
    );

    const study_id = headerResult.rows[0].id;

    const normalizedItems = [];
    const breakTotalsByColumn = [];
    let grandTotalBreaks = 0;
    let includeInGrandTotal = true;
    const STOP_AT = 'SLIVER BREAKS';

    // Insert inspection items
    let derivedBreakCount = 0;
    if (inspection_items && Array.isArray(inspection_items)) {
      for (const item of inspection_items) {
        const normalizedName = normalizeBreakItemName(item?.item_name);
        const breakArray = parseBreakArray(item?.status_value).map((v) => String(toWholeNumberOrNull(v) ?? 0));
        const columnTotal = breakArray.length;
        const statusValue = breakArray.length ? toPgArrayLiteral(breakArray) : toWholeNumberOrNull(item?.status_value);
        if (breakArray.length) derivedBreakCount += breakArray.length;
        if (includeInGrandTotal) {
          grandTotalBreaks += columnTotal;
          breakTotalsByColumn.push({ name: normalizedName, total: columnTotal });
          if (normalizedName.toUpperCase() === STOP_AT) includeInGrandTotal = false;
        }
        await client.query(
          `INSERT INTO simplex.smx_breaks_inspection_items
           (study_id, item_name, status_value, remarks)
           VALUES ($1, $2, $3, $4)`,
          [study_id, normalizedName, statusValue, item.remarks || null]
        );
        normalizedItems.push({ item_name: normalizedName, status_value: statusValue });
      }
    }

    const startTime = parseHHMM(req.body?.start_time || other_field_values?.start_time);
    const endTime = parseHHMM(req.body?.end_time || other_field_values?.end_time);
    const totalMinutes = diffMinutes(startTime?.hhmm, endTime?.hhmm);
    const totalHours = totalMinutes !== null ? (totalMinutes / 60) : null;

    const providedTotalSpdl = toWholeNumberOrNull(req.body?.total_spdl ?? other_field_values?.total_spdl);
    const dbTotalSpdl = providedTotalSpdl ? null : await fetchCdgTotalSpdlFromDb(machine_name);
    const totalSpdl = providedTotalSpdl ?? dbTotalSpdl;
    const idleSpindles = toWholeNumberOrNull(req.body?.idle_spindles ?? req.body?.ideals ?? other_field_values?.idle_spindles ?? other_field_values?.ideals);
    const runningSpdl = (Number.isInteger(totalSpdl) && Number.isInteger(idleSpindles))
      ? Math.max(totalSpdl - idleSpindles, 0)
      : null;

    const startHk = toWholeNumberOrNull(req.body?.start_hk ?? other_field_values?.start_hk);
    const finishHk = toWholeNumberOrNull(req.body?.finish_hk ?? other_field_values?.finish_hk);
    const hank = (Number.isInteger(startHk) && Number.isInteger(finishHk))
      ? (finishHk - startHk)
      : null;

    const overallBreakagePct = (runningSpdl && totalHours && totalHours > 0)
      ? toWholePercent((grandTotalBreaks / runningSpdl / totalHours) * 100)
      : 0;

    const derivedRows = [];
    if (hank !== null) derivedRows.push({ item_name: 'HANK', status_value: hank });
    if (startTime?.hhmm) derivedRows.push({ item_name: 'START TIME', status_value: startTime.hhmm });
    if (endTime?.hhmm) derivedRows.push({ item_name: 'END TIME', status_value: endTime.hhmm });
    if (totalMinutes !== null) derivedRows.push({ item_name: 'TOTAL TIME (MINUTES)', status_value: totalMinutes });
    if (Number.isInteger(idleSpindles)) derivedRows.push({ item_name: 'IDLE SPINDLES', status_value: idleSpindles });
    if (Number.isInteger(totalSpdl)) derivedRows.push({ item_name: 'TOTAL SPDL', status_value: totalSpdl });
    if (runningSpdl !== null) derivedRows.push({ item_name: 'RUNNING SPDL', status_value: runningSpdl });
    derivedRows.push({ item_name: 'TOTAL BREAKS (GRAND)', status_value: grandTotalBreaks });
    derivedRows.push({ item_name: 'OVERALL BREAKAGE (%)', status_value: overallBreakagePct });
    const hasTotalBreakPercentRow = [...normalizedItems, ...derivedRows].some((row) => {
      const name = String(row?.item_name || '').trim().toUpperCase();
      return name === 'TOTAL BREAK (%)' || name === 'TOTAL BREAK %' || name === 'TOTAL BREAKAGE (%)';
    });
    if (!hasTotalBreakPercentRow) {
      derivedRows.push({ item_name: 'TOTAL BREAK (%)', status_value: overallBreakagePct });
    }

    for (const col of breakTotalsByColumn) {
      const ratio = grandTotalBreaks > 0 ? toWholePercent((col.total / grandTotalBreaks) * 100) : 0;
      derivedRows.push({
        item_name: `${col.name} BREAKS (%)`,
        status_value: ratio
      });
    }

    for (const row of derivedRows) {
      await client.query(
        `INSERT INTO simplex.smx_breaks_inspection_items
         (study_id, item_name, status_value, remarks)
         VALUES ($1, $2, $3, $4)`,
        [study_id, row.item_name, String(row.status_value), 'derived']
      );
    }

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
      const computedBreakCount = providedBreakArray.length || grandTotalBreaks || derivedBreakCount;
      const siderName = String(req.body?.s_name ?? other_field_values.s_name ?? other_field_values.sider_name ?? '').trim();
      const remarksBlock = [
        other_field_values.remarks || null,
        siderName ? `S.NAME:${siderName}` : null,
        startTime?.hhmm ? `START:${startTime.hhmm}` : null,
        endTime?.hhmm ? `END:${endTime.hhmm}` : null,
        totalMinutes !== null ? `TOTAL_MINUTES:${totalMinutes}` : null
      ].filter(Boolean).join(' | ') || null;
      await client.query(
        `INSERT INTO simplex.smx_other_field_values
         (study_id, time, break_count, remarks)
         VALUES ($1, $2, $3, $4)`,
        [
          study_id,
          startTime?.hhmm && endTime?.hhmm ? `${startTime.hhmm}-${endTime.hhmm}` : other_field_values.time,
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
        running_spdl: runningSpdl,
        overall_breakage_percent: overallBreakagePct
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
    await ensureSimplexEntryIdColumns();
    const result = await client.query(
      `SELECT * FROM simplex.smx_breaks_study_header ORDER BY entry_date DESC`
    );

    res.status(200).json(result.rows.map((row) => withScreenEntryId('study', row)));

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

/**
 * @swagger
 * /simplex/process_parameter:
 *   post:
 *     summary: Create Simplex Process Parameter entry
 *     tags: [Simplex]
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
 *                 type: string
 *               make:
 *                 type: string
 *               delivery_hank:
 *                 type: number
 *               tpi_tm:
 *                 type: string
 *               speed:
 *                 type: number
 *               bottom_roller_setting:
 *                 type: string
 *               top_roller_setting:
 *                 type: string
 *               break_draft:
 *                 type: number
 *               total_draft:
 *                 type: number
 *               creel_draft:
 *                 type: number
 *               false_twist_grooves:
 *                 type: string
 *               spacer:
 *                 type: string
 *               top_arm_pressure:
 *                 type: number
 *               back_pressure:
 *                 type: string
 *               middle_pressure:
 *                 type: string
 *               front_pressure:
 *                 type: string
 *               coil_inch:
 *                 type: number
 *               lifter_combination_wheel:
 *                 type: string
 *               lifter_wheel:
 *                 type: string
 *               tension_wheel:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */

router.post('/process_parameter', async (req, res, next) => {
  try {
    await ensureSimplexEntryIdColumns();
    const data = req.body;

    if (!data.entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

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
        resolvedEntryId,
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

    res.status(201).json({
      message: 'Simplex entry created successfully',
      data: withScreenEntryId('process_parameter', result.rows[0])
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
 * /simplex/process_parameter:
 *   get:
 *     summary: Get all Simplex entries
 *     tags: [Simplex]
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

router.get('/process_parameter', async (req, res, next) => {
  try {
    await ensureSimplexEntryIdColumns();
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
      data: result.rows.map((row) => withScreenEntryId('process_parameter', row)),
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
 * /simplex/process_parameter/{id}:
 *   put:
 *     summary: Update Simplex entry
 *     tags: [Simplex]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Updated successfully
 *       404:
 *         description: Entry not found
 */

router.put('/process_parameter/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const data = req.body;

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
        data.tension_wheel,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.status(200).json({
      message: 'Updated successfully',
      data: withScreenEntryId('process_parameter', result.rows[0])
    });

  } catch (error) {
    console.error(error);
    next(error);
  }
});

module.exports = router;

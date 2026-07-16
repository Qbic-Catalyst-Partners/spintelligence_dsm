const express = require('express');
const router = express.Router();
const client = require('../connection');
const sqlServer = require('../config/sqlserver');
const { dedupeVarieties } = require('../utils/variety');
const { createEmployeeMasterDropdown } = require('../utils/employeeMaster');

const COTTON_HVI_PARAMETERS = [
  'sci',
  'span_length',
  'mic',
  'gtex',
  'maturity',
  'ur',
  'sfi',
  'elongation',
  'yellow_b',
  'trcnt',
  'trar',
  'trid',
  'trash_content_percentage',
  'invisible_loss_percentage',
  'rd',
  'colour_grade'
];

const SCREEN_NAMES = {
  cotton_hvi: 'Cotton HVI Data Entry',
  fibre: 'Fibre Data Entry',
  afis: 'AFIS Data Entry',
  moisture: 'Moisture Data Entry',
  openness: 'Openness Data Entry'
};

const MIXING_NOTEBOOK_SLUGS = [
  'cotton-hvi',
  'fibre',
  'afis',
  'moisture',
  'openness',
  'qc'
];

// Mixing screens now require a real, form-submitted entry_id on every new row (see the `!entry_id`
// 400 checks below), so this no longer fabricates a substitute ID from the row's numeric db id —
// legacy rows saved before that requirement just pass through with whatever entry_id they have
// (possibly none), rather than showing a synthesized value that was never actually submitted.
const withScreenEntryId = (screenKey, record) => {
  if (!record || typeof record !== 'object') return record;
  return { ...record };
};
const isUniqueViolation = (err) => err && err.code === '23505';
// mixing.mixing_qc_header appears to have been converted into a (non-updatable) view by a schema
// change made outside this codebase — Postgres reports that as either 42P16 ("cannot change name
// of view column ...", raised when this file's own ADD COLUMN setup step runs against it) or 42703
// (undefined column) once a query actually tries to read/write a column the view doesn't expose.
// Surface a clear, actionable message instead of a bare 500 when either hits this route.
const MIXING_QC_SCHEMA_ERROR_CODES = new Set(['42P16', '42703']);
const isMixingQcSchemaMismatch = (err) => err && MIXING_QC_SCHEMA_ERROR_CODES.has(err.code);
const sendMixingQcSchemaMismatchError = (res) =>
  res.status(503).json({
    message:
      'Mixing Process Parameter storage is out of sync with this server version (mixing.mixing_qc_header no longer matches the expected table shape). Contact an admin to reconcile the database schema before retrying.',
  });

const fetchMasterVarieties = async (prefix = '') => {
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

const toDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text;
};

const parseOptionalNumericField = (fieldName, value) => {
  if (value === null || value === undefined || value === '') return { value: null };
  const trimmed = typeof value === 'string' ? value.trim() : value;
  if (trimmed === '') return { value: null };
  const numericValue = Number(trimmed);
  if (!Number.isFinite(numericValue)) {
    return {
      error: `${fieldName} must be a valid number`
    };
  }
  return { value: numericValue };
};

const normalizeNumericFields = (source, fieldNames) => {
  const normalized = {};
  const errors = [];

  for (const fieldName of fieldNames) {
    const parsed = parseOptionalNumericField(fieldName, source[fieldName]);
    if (parsed.error) {
      errors.push({ field: fieldName, message: parsed.error, value: source[fieldName] });
    } else {
      normalized[fieldName] = parsed.value;
    }
  }

  return { normalized, errors };
};

const fetchLotMasterDetails = async (prefix = '', exactLotNo = '') => {
  const result = await sqlServer.query(
    `SELECT TOP 100
       LTRIM(RTRIM(CAST(l.lotno AS VARCHAR(100)))) AS lot_no,
       MAX(CAST(l.lotdate AS DATE)) AS lot_date,
       MAX(LTRIM(RTRIM(CAST(v.varname AS VARCHAR(255))))) AS variety,
       MAX(LTRIM(RTRIM(CAST(l.pinvno AS VARCHAR(100))))) AS invoice_no,
       MAX(CAST(l.pidate AS DATE)) AS invoice_date,
       MAX(LTRIM(RTRIM(CAST(lm.Party_Name AS VARCHAR(255))))) AS party_name
     FROM dbo.lotmaster l
     LEFT JOIN dbo.variety v ON l.varcode = v.varcode
     LEFT JOIN dbo.ledger_master lm ON l.Ledger_Code = lm.Ledger_Code
     WHERE LTRIM(RTRIM(CAST(l.lotno AS VARCHAR(100)))) <> ''
       AND (@exactLotNo = '' OR LTRIM(RTRIM(CAST(l.lotno AS VARCHAR(100)))) = @exactLotNo)
       AND (@prefix = '' OR LTRIM(RTRIM(CAST(l.lotno AS VARCHAR(100)))) LIKE @lotPrefix)
     GROUP BY LTRIM(RTRIM(CAST(l.lotno AS VARCHAR(100))))
     ORDER BY MAX(CAST(l.lotdate AS DATE)) DESC, lot_no`,
    { prefix, lotPrefix: `%${prefix}%`, exactLotNo }
  );

  return (result.recordset || []).map((row) => ({
    lot_no: row.lot_no,
    lot_date: toDateOnly(row.lot_date),
    date: toDateOnly(row.lot_date),
    variety: row.variety || '',
    invoice_no: row.invoice_no || '',
    invoice_date: toDateOnly(row.invoice_date),
    party_name: row.party_name || ''
  }));
};

const fetchCottonLotDetails = fetchLotMasterDetails;

const fetchPsfReceiptDetails = async (prefix = '', exactLotNo = '') => {
  const result = await sqlServer.query(
    `SELECT TOP 100
       LTRIM(RTRIM(CAST(p.lotno AS VARCHAR(100)))) AS lot_no,
       MAX(CAST(p.Lotdate AS DATE)) AS lot_date,
       MAX(LTRIM(RTRIM(CAST(v.varname AS VARCHAR(255))))) AS variety,
       MAX(LTRIM(RTRIM(CAST(p.refno AS VARCHAR(100))))) AS ref_no,
       MAX(LTRIM(RTRIM(CAST(p.Dcno AS VARCHAR(100))))) AS dc_no,
       MAX(CAST(p.DcDate AS DATE)) AS dc_date
     FROM dbo.PSF_Receipt p
     LEFT JOIN dbo.variety v ON p.varcode = v.varcode
     WHERE LTRIM(RTRIM(CAST(p.lotno AS VARCHAR(100)))) <> ''
       AND (@exactLotNo = '' OR LTRIM(RTRIM(CAST(p.lotno AS VARCHAR(100)))) = @exactLotNo)
       AND (@prefix = '' OR LTRIM(RTRIM(CAST(p.lotno AS VARCHAR(100)))) LIKE @lotPrefix)
     GROUP BY LTRIM(RTRIM(CAST(p.lotno AS VARCHAR(100))))
     ORDER BY MAX(CAST(p.Lotdate AS DATE)) DESC, lot_no`,
    { prefix, lotPrefix: `%${prefix}%`, exactLotNo }
  );

  return (result.recordset || []).map((row) => ({
    lot_no: row.lot_no,
    lot_date: toDateOnly(row.lot_date),
    date: toDateOnly(row.lot_date),
    variety: row.variety || '',
    ref_no: row.ref_no || '',
    dc_no: row.dc_no || '',
    dc_date: toDateOnly(row.dc_date),
    invoice_no: row.ref_no || row.dc_no || '',
    invoice_date: toDateOnly(row.dc_date)
  }));
};

const getMasterVarieties = async (req, res, next) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const prefix = String(req.query.variety_prefix || req.query.prefix || '').trim();
    const data = await fetchMasterVarieties(prefix);
    const options = [
      { text: '-- Select Variety --', value: '' },
      ...data.map((v) => ({ text: v.variety_name, value: v.variety_name }))
    ];

    return res.status(200).json({
      source: 'sqlserver',
      data,
      names: data.map((r) => r.variety_name),
      variety_names: data.map((r) => r.variety_name),
      options
    });
  } catch (error) {
    console.error('Error fetching mixing varieties from SQL Server:', error);
    next(error);
  }
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
    console.error('Error fetching count names from SQL Server:', error);
    next(error);
  }
};

const getLotMasterDropdown = async (req, res, next) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const prefix = String(req.query.lot_prefix || req.query.prefix || '').trim();
    const exactLotNo = String(req.query.lot_no || '').trim();
    const data = await fetchCottonLotDetails(prefix, exactLotNo);
    const options = [
      { text: '-- Select Lot No --', value: '' },
      ...data.map((lot) => ({
        text: lot.lot_no,
        label: lot.lot_no,
        value: lot.lot_no,
        variety: lot.variety,
        date: lot.date,
        lot_date: lot.lot_date,
        invoice_no: lot.invoice_no,
        invoice_date: lot.invoice_date,
        party_name: lot.party_name
      }))
    ];

    return res.status(200).json({
      source: 'sqlserver',
      data,
      lots: data,
      lot_numbers: data.map((r) => r.lot_no),
      values: data.map((r) => r.lot_no),
      options
    });
  } catch (error) {
    console.error('Error fetching lotmaster lots from SQL Server:', error);
    next(error);
  }
};

const getPsfReceiptDropdown = async (req, res, next) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const prefix = String(req.query.lot_prefix || req.query.prefix || '').trim();
    const exactLotNo = String(req.query.lot_no || '').trim();
    const data = await fetchPsfReceiptDetails(prefix, exactLotNo);
    const options = [
      { text: '-- Select Lot No --', value: '' },
      ...data.map((lot) => ({
        text: lot.lot_no,
        label: lot.lot_no,
        value: lot.lot_no,
        variety: lot.variety,
        date: lot.date,
        lot_date: lot.lot_date,
        invoice_no: lot.invoice_no,
        invoice_date: lot.invoice_date,
        ref_no: lot.ref_no,
        dc_no: lot.dc_no,
        dc_date: lot.dc_date
      }))
    ];

    return res.status(200).json({
      source: 'sqlserver',
      table: 'PSF_Receipt',
      data,
      lots: data,
      lot_numbers: data.map((r) => r.lot_no),
      values: data.map((r) => r.lot_no),
      options
    });
  } catch (error) {
    console.error('Error fetching PSF receipt lots from SQL Server:', error);
    next(error);
  }
};

const getCottonHviLotDropdown = getPsfReceiptDropdown;

const getPsfReceiptMasterDropdown = async (req, res, next) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const prefix = String(req.query.prefix || '').trim();
    const varietyPrefix = String(req.query.variety_prefix || '').trim();
    const lotPrefix = String(req.query.lot_prefix || '').trim();
    const exactLotNo = String(req.query.lot_no || '').trim();
    const [varieties, lots] = await Promise.all([
      fetchMasterVarieties(varietyPrefix || prefix),
      fetchPsfReceiptDetails(lotPrefix || prefix, exactLotNo)
    ]);

    const varietyOptions = [
      { text: '-- Select Variety --', value: '' },
      ...varieties.map((v) => ({ text: v.variety_name, value: v.variety_name }))
    ];
    const lotOptions = [
      { text: '-- Select Lot No --', value: '' },
      ...lots.map((lot) => ({
        text: lot.lot_no,
        label: lot.lot_no,
        value: lot.lot_no,
        variety: lot.variety,
        date: lot.date,
        lot_date: lot.lot_date,
        invoice_no: lot.invoice_no,
        invoice_date: lot.invoice_date,
        ref_no: lot.ref_no,
        dc_no: lot.dc_no,
        dc_date: lot.dc_date
      }))
    ];

    return res.status(200).json({
      source: 'sqlserver',
      table: 'PSF_Receipt',
      data: lots,
      lots,
      lot_numbers: lots.map((r) => r.lot_no),
      names: varieties.map((r) => r.variety_name),
      variety_names: varieties.map((r) => r.variety_name),
      values: lots.map((r) => r.lot_no),
      options: {
        lot_no: lotOptions,
        lot: lotOptions,
        variety: varietyOptions
      }
    });
  } catch (error) {
    console.error('Error fetching PSF receipt master dropdown from SQL Server:', error);
    next(error);
  }
};

const getCottonHviMasterDropdown = async (req, res, next) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const prefix = String(req.query.prefix || '').trim();
    const varietyPrefix = String(req.query.variety_prefix || '').trim();
    const lotPrefix = String(req.query.lot_prefix || '').trim();
    const exactLotNo = String(req.query.lot_no || '').trim();
    const [varietiesResult, lotsResult] = await Promise.allSettled([
      fetchMasterVarieties(varietyPrefix || prefix),
      fetchPsfReceiptDetails(lotPrefix || prefix, exactLotNo)
    ]);

    if (varietiesResult.status === 'rejected') {
      throw varietiesResult.reason;
    }

    if (lotsResult.status === 'rejected') {
      console.warn('Cotton HVI PSF receipt lots unavailable; returning variety dropdown only:', lotsResult.reason?.message || lotsResult.reason);
    }

    const varieties = varietiesResult.value || [];
    const lots = lotsResult.status === 'fulfilled' ? lotsResult.value || [] : [];

    const varietyOptions = [
      { text: '-- Select Variety --', value: '' },
      ...varieties.map((v) => ({ text: v.variety_name, value: v.variety_name }))
    ];
    const lotOptions = [
      { text: '-- Select Lot No --', value: '' },
      ...lots.map((lot) => ({
        text: lot.lot_no,
        label: lot.lot_no,
        value: lot.lot_no,
        variety: lot.variety,
        date: lot.date,
        lot_date: lot.lot_date,
        invoice_no: lot.invoice_no,
        invoice_date: lot.invoice_date
      }))
    ];

    return res.status(200).json({
      source: lotsResult.status === 'fulfilled' ? 'sqlserver' : 'sqlserver-partial',
      warnings: lotsResult.status === 'rejected'
        ? [{ field: 'lot_no', message: 'Cotton HVI PSF receipt lots are unavailable; varieties were loaded' }]
        : [],
      data: lots,
      lots,
      lot_numbers: lots.map((r) => r.lot_no),
      names: varieties.map((r) => r.variety_name),
      variety_names: varieties.map((r) => r.variety_name),
      values: lots.map((r) => r.lot_no),
      options: {
        lot_no: lotOptions,
        lot: lotOptions,
        variety: varietyOptions
      }
    });
  } catch (error) {
    console.error('Error fetching Cotton HVI master dropdown from SQL Server:', error);
    next(error);
  }
};

const getMixingQcMasterDropdown = async (req, res, next) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const prefix = String(req.query.prefix || '').trim();
    const countPrefix = String(req.query.count_prefix || '').trim();
    const counts = await fetchCountMaster(countPrefix || prefix);
    const countOptions = [
      { text: '-- Select Count Name --', value: '' },
      ...counts.map((count) => ({
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
      data: counts,
      counts,
      count_names: counts.map((r) => r.count_name),
      names: counts.map((r) => r.count_name),
      values: counts.map((r) => r.count_name),
      options: {
        count_name: countOptions,
        count: countOptions
      }
    });
  } catch (error) {
    console.error('Error fetching Mixing QC count dropdown from SQL Server:', error);
    next(error);
  }
};

const getEmployeeMasterDropdown = createEmployeeMasterDropdown(sqlServer, 'mixing');

// openness_inspection stores its submission timestamp as `timestamp WITHOUT time zone` with a bare
// default — on this DB, that silently writes a different offset than what gets displayed back,
// shifting "Created At" by several hours. Same root cause and same fix as every other
// department's equivalent tables: convert to timestamptz so new rows store an unambiguous instant.
const ensureMixingTimestampColumnsHaveTimezone = async () => {
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'mixing' AND table_name = 'openness_inspection' AND column_name = 'created_at'
          AND data_type = 'timestamp without time zone'
      ) THEN
        ALTER TABLE mixing.openness_inspection
          ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
        ALTER TABLE mixing.openness_inspection
          ALTER COLUMN created_at SET DEFAULT now();
      END IF;
    END $$;
  `);
};

// This is one-time idempotent schema setup (add-column-if-not-exists, drop+recreate a view),
// not per-request work — it used to run on every single POST to a Mixing route, which under
// concurrent requests raced on the view's DROP/CREATE and intermittently failed with
// "duplicate key value violates unique constraint pg_type_typname_nsp_index". Memoizing to a
// single shared promise means every caller awaits the same one-time run instead of each
// kicking off its own.
let ensureMixingEntryIdColumnsPromise = null;
const ensureMixingEntryIdColumns = () => {
  if (!ensureMixingEntryIdColumnsPromise) {
    ensureMixingEntryIdColumnsPromise = ensureMixingEntryIdColumnsImpl().catch((err) => {
      ensureMixingEntryIdColumnsPromise = null;
      throw err;
    });
  }
  return ensureMixingEntryIdColumnsPromise;
};

const runMixingSchemaStep = async (label, fn) => {
  try {
    await fn();
  } catch (err) {
    console.error(`Mixing schema step "${label}" failed:`, err);
    throw err;
  }
};

const ensureMixingEntryIdColumnsImpl = async () => {
  await runMixingSchemaStep('timestamp columns', () => ensureMixingTimestampColumnsHaveTimezone());

  await runMixingSchemaStep('cotton_hvi_data_entry columns', async () => {
    await client.query(`
      ALTER TABLE mixing.cotton_hvi_data_entry
        ADD COLUMN IF NOT EXISTS entry_id TEXT,
        ADD COLUMN IF NOT EXISTS operator TEXT;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS cotton_hvi_data_entry_entry_id_uq
      ON mixing.cotton_hvi_data_entry (entry_id)
      WHERE entry_id IS NOT NULL;
    `);
    await client.query(`
      WITH numbered AS (
        SELECT
          ctid,
          ROW_NUMBER() OVER (ORDER BY inspection_date, invoice_date, lot_no, invoice_no, ctid) AS rn
        FROM mixing.cotton_hvi_data_entry
        WHERE entry_id IS NULL OR BTRIM(entry_id) = ''
      )
      UPDATE mixing.cotton_hvi_data_entry t
      SET entry_id = LPAD(numbered.rn::text, 4, '0')
      FROM numbered
      WHERE t.ctid = numbered.ctid;
    `);
  });

  await runMixingSchemaStep('fibre_data_entry columns', async () => {
    await client.query(`
      ALTER TABLE mixing.fibre_data_entry
        ADD COLUMN IF NOT EXISTS entry_id TEXT;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS fibre_data_entry_entry_id_uq
      ON mixing.fibre_data_entry (entry_id)
      WHERE entry_id IS NOT NULL;
    `);
  });

  await runMixingSchemaStep('afis_data_entry columns', async () => {
    await client.query(`
      ALTER TABLE mixing.afis_data_entry
        ADD COLUMN IF NOT EXISTS entry_id TEXT;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS afis_data_entry_entry_id_uq
      ON mixing.afis_data_entry (entry_id)
      WHERE entry_id IS NOT NULL;
    `);
  });

  await runMixingSchemaStep('moisture_data_entry columns', async () => {
    await client.query(`
      ALTER TABLE mixing.moisture_data_entry
        ADD COLUMN IF NOT EXISTS entry_id TEXT;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS moisture_data_entry_entry_id_uq
      ON mixing.moisture_data_entry (entry_id)
      WHERE entry_id IS NOT NULL;
    `);
  });

  await runMixingSchemaStep('openness_inspection columns', async () => {
    await client.query(`
      ALTER TABLE mixing.openness_inspection
        ADD COLUMN IF NOT EXISTS entry_id TEXT,
        ADD COLUMN IF NOT EXISTS br_line TEXT;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS openness_inspection_entry_id_uq
      ON mixing.openness_inspection (entry_id)
      WHERE entry_id IS NOT NULL;
    `);
    // The form sends beater_type/beater_speed_rpm per entry, but these columns never existed on
    // openness_entries — the values were silently dropped on every submission (never inserted,
    // never selectable), leaving "Entry N - Beater Type"/"Entry N - Beater Speed (RPM)" blank in
    // Custom Report even though every other per-entry field worked.
    await client.query(`
      ALTER TABLE mixing.openness_entries
        ADD COLUMN IF NOT EXISTS beater_type TEXT,
        ADD COLUMN IF NOT EXISTS beater_speed_rpm NUMERIC;
    `);
  });

  await runMixingSchemaStep('mixing_qc_header columns', async () => {
    await client.query(`
      ALTER TABLE mixing.mixing_qc_header
        ADD COLUMN IF NOT EXISTS entry_id TEXT,
        ADD COLUMN IF NOT EXISTS operator TEXT;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS mixing_qc_header_entry_id_uq
      ON mixing.mixing_qc_header (entry_id)
      WHERE entry_id IS NOT NULL;
    `);
  });

  await runMixingSchemaStep('afis6_cotton_data_entry index', () => client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS afis6_cotton_data_entry_entry_id_uq
    ON mixing.afis6_cotton_data_entry (entry_id)
    WHERE entry_id IS NOT NULL;
  `));
  await runMixingSchemaStep('afis6_mmf_data_entry index', () => client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS afis6_mmf_data_entry_entry_id_uq
    ON mixing.afis6_mmf_data_entry (entry_id)
    WHERE entry_id IS NOT NULL;
  `));
};

const normalizeKey = (value) => String(value || '').toLowerCase().replace(/\s+/g, '_');
const resolveFieldValue = (obj, fieldName) => {
  if (!obj || typeof obj !== 'object') return undefined;
  const target = normalizeKey(fieldName);
  const key = Object.keys(obj).find((k) => normalizeKey(k) === target);
  return key ? obj[key] : undefined;
};

const evaluateBreach = (actualRaw, rule) => {
  const actual = Number(actualRaw);
  const condition = String(rule?.condition_level || 'More Than').toLowerCase();
  const plus = Number(rule?.plus_threshold);
  const minus = Number(rule?.minus_threshold);
  const baseline = Number(rule?.actual_value);

  if (!Number.isFinite(actual)) return null;
  if (condition === 'more than') {
    if (!Number.isFinite(plus)) return null;
    return actual > plus;
  }
  if (condition === 'less than') {
    if (!Number.isFinite(minus)) return null;
    return actual < minus;
  }
  if (condition === 'more and less than') {
    if (!Number.isFinite(baseline) || !Number.isFinite(plus) || !Number.isFinite(minus)) return null;
    const min = baseline - minus;
    const max = baseline + plus;
    return actual <= min || actual >= max;
  }
  return null;
};

const deriveSeverity = (missingCount, breachCount) => {
  if (missingCount > 0) return 'High';
  if (breachCount >= 3) return 'High';
  if (breachCount >= 1) return 'Medium';
  return 'Low';
};

const autoCreateTicket = async ({
  screenKey,
  machine_name,
  department,
  sub_department,
  user_name,
  values
}) => {
  if (!machine_name || !department || !sub_department) return null;

  const paramNames = Object.keys(values || {});
  if (!paramNames.length) return null;

  const thresholdsRes = await client.query(
    `SELECT input_field, condition_level, plus_threshold, minus_threshold, actual_value,
            approval_l1_user_id, approval_l2_user_id, approval_l3_user_id
     FROM ticketing_system.threshold_master
     WHERE department = $1
       AND sub_department = $2
       AND input_screen = $3
       AND machine_name = $4
       AND is_active = true`,
    [department, sub_department, SCREEN_NAMES[screenKey], machine_name]
  );

  if (!thresholdsRes.rows.length) return null;

  const rules = {};
  for (const row of thresholdsRes.rows) {
    rules[row.input_field] = row;
  }

  const missingFields = [];
  const breaches = [];

  for (const field of paramNames) {
    const actual = resolveFieldValue(values, field);
    const rule = resolveFieldValue(rules, field);
    if (!rule) continue;

    if (actual === null || actual === undefined || (typeof actual === 'string' && actual.trim() === '')) {
      missingFields.push(field);
      continue;
    }

    const isBreached = evaluateBreach(actual, rule);
    if (isBreached) {
      breaches.push({
        field,
        actual_value: Number(actual),
        condition_level: rule.condition_level,
        plus_threshold: rule.plus_threshold,
        minus_threshold: rule.minus_threshold,
        baseline_actual_value: rule.actual_value
      });
    }
  }

  let ticketReason = null;
  if (missingFields.length && breaches.length) ticketReason = 'BOTH';
  else if (missingFields.length) ticketReason = 'MISSING_VALUE';
  else if (breaches.length) ticketReason = 'THRESHOLD_BREACH';
  if (!ticketReason) return null;

  const thresholdPayload = {};
  for (const [k, v] of Object.entries(rules)) {
    thresholdPayload[k] = {
      condition_level: v.condition_level,
      plus_threshold: v.plus_threshold,
      minus_threshold: v.minus_threshold,
      actual_value: v.actual_value
    };
  }

  const severity = deriveSeverity(missingFields.length, breaches.length);
  const approvalL1UserIds = Array.from(
    new Set(
      thresholdsRes.rows
        .map((row) => Number(row.approval_l1_user_id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );
  const approvalL2UserIds = Array.from(
    new Set(
      thresholdsRes.rows
        .map((row) => Number(row.approval_l2_user_id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );
  const approvalL3UserIds = Array.from(
    new Set(
      thresholdsRes.rows
        .map((row) => Number(row.approval_l3_user_id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );
  const result = await client.query(
    `INSERT INTO ticketing_system.operator_tickets
     (ticket_id, user_name, machine_name, parameter_name, actual_value, threshold_value, severity, status, created_at, management_field, erp_product_code, ticket_reason, violation_details, approval_l1_user_id, approval_l2_user_id, approval_l3_user_id, approval_l1_user_ids, approval_l2_user_ids, approval_l3_user_ids)
     VALUES ('TK-' || LPAD(nextval('"ticketing_system"."ticket_seq"')::text, 4, '0'), $1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, 'Open', CURRENT_TIMESTAMP, $7, $8, $9, $10::jsonb, $11, $12, $13, $14::int[], $15::int[], $16::int[])
     RETURNING *`,
    [
      user_name || 'ERP System',
      machine_name,
      JSON.stringify(paramNames),
      JSON.stringify(values),
      JSON.stringify(thresholdPayload),
      severity,
      department,
      sub_department,
      ticketReason,
      JSON.stringify({ missing_fields: missingFields, threshold_breaches: breaches }),
      approvalL1UserIds[0] || null,
      approvalL2UserIds[0] || null,
      approvalL3UserIds[0] || null,
      approvalL1UserIds,
      approvalL2UserIds,
      approvalL3UserIds
    ]
  );

  return result.rows[0];
};

const getThresholds = async ({ management_field, erp_product_code, machine_name, parameters = [] }) => {
  if (!management_field || !erp_product_code || !machine_name) return [];

  let query = `
    SELECT parameter_name, threshold_value, is_active, updated_at
    FROM ticketing_system.threshold_master
    WHERE management_field = $1
      AND erp_product_code = $2
      AND machine_name = $3
      AND is_active = true
  `;
  const values = [management_field, erp_product_code, machine_name];

  if (parameters.length) {
    query += ` AND parameter_name = ANY($4::text[])`;
    values.push(parameters);
  }

  query += ` ORDER BY parameter_name`;
  const result = await client.query(query, values);
  return result.rows;
};

router.get('/cotton-hvi/thresholds', async (req, res, next) => {
  try {
    const {
      management_field,
      erp_product_code,
      machine_name = 'Cotton HVI Data Entry'
    } = req.query;

    if (!management_field || !erp_product_code) {
      return res.status(400).json({
        message: 'management_field and erp_product_code are required'
      });
    }

    const rows = await getThresholds({
      management_field,
      erp_product_code,
      machine_name,
      parameters: COTTON_HVI_PARAMETERS
    });

    const map = {};
    for (const row of rows) map[row.parameter_name] = Number(row.threshold_value);

    const fields = COTTON_HVI_PARAMETERS.map((name) => ({
      parameter_name: name,
      threshold_value: Object.prototype.hasOwnProperty.call(map, name) ? map[name] : null
    }));

    res.status(200).json({
      management_field,
      erp_product_code,
      machine_name,
      fields
    });
  } catch (error) {
    next(error);
  }
});

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

    const rows = await getThresholds({
      management_field,
      erp_product_code,
      machine_name,
      parameters: parameterList
    });

    res.status(200).json({
      management_field,
      erp_product_code,
      machine_name,
      thresholds: rows
    });
  } catch (error) {
    next(error);
  }
});

router.get('/master/varieties', getMasterVarieties);
router.get('/master/dropdown', getMasterVarieties);
router.get('/master/counts', getCountMasterDropdown);
router.get('/master/count-dropdown', getCountMasterDropdown);
router.get('/master/count-names', getCountMasterDropdown);
router.get('/master/employees', getEmployeeMasterDropdown);
router.get('/master/employee-dropdown', getEmployeeMasterDropdown);
router.get('/master/employee-names', getEmployeeMasterDropdown);
router.get('/master/user-names', getEmployeeMasterDropdown);

router.get('/cotton-hvi/master/dropdown', getCottonHviMasterDropdown);
router.get('/cotton-hvi/master-data', getCottonHviMasterDropdown);
router.get('/cotton-hvi/master/master-data', getCottonHviMasterDropdown);
router.get('/cotton-hvi/dropdown', getCottonHviMasterDropdown);

for (const notebookSlug of MIXING_NOTEBOOK_SLUGS.filter((slug) => !['cotton-hvi', 'fibre', 'qc'].includes(slug))) {
  router.get(`/${notebookSlug}/master/varieties`, getMasterVarieties);
  router.get(`/${notebookSlug}/master/dropdown`, getMasterVarieties);
}

router.get('/cotton-hvi/master/varieties', getMasterVarieties);
router.get('/cotton-hvi/master/lots', getCottonHviLotDropdown);
router.get('/cotton-hvi/master/lot-dropdown', getCottonHviLotDropdown);
router.get('/cotton-hvi/lots', getCottonHviLotDropdown);
router.get('/fibre/master/dropdown', getPsfReceiptMasterDropdown);
router.get('/fibre/master/varieties', getMasterVarieties);
router.get('/fibre/master/lots', getPsfReceiptDropdown);
router.get('/fibre/master/lot-dropdown', getPsfReceiptDropdown);
router.get('/fibre/lots', getPsfReceiptDropdown);
router.get('/mmf-hvi/master/dropdown', getPsfReceiptMasterDropdown);
router.get('/mmf-hvi/master/varieties', getMasterVarieties);
router.get('/mmf-hvi/master/lots', getPsfReceiptDropdown);
router.get('/mmf-hvi/master/lot-dropdown', getPsfReceiptDropdown);
router.get('/mmf-hvi/lots', getPsfReceiptDropdown);
router.get('/moisture/master/lots', getLotMasterDropdown);
router.get('/moisture/master/lot-dropdown', getLotMasterDropdown);
router.get('/moisture/lots', getLotMasterDropdown);
router.get('/qc/master/dropdown', getMixingQcMasterDropdown);
router.get('/qc/master/counts', getCountMasterDropdown);
router.get('/qc/master/count-dropdown', getCountMasterDropdown);
router.get('/qc/master/count-names', getCountMasterDropdown);
router.get('/qc/master/employees', getEmployeeMasterDropdown);
router.get('/qc/master/employee-dropdown', getEmployeeMasterDropdown);
router.get('/qc/master/employee-names', getEmployeeMasterDropdown);
router.get('/qc/master/user-names', getEmployeeMasterDropdown);

/**
 * @swagger
 * /mixing/cotton-hvi:
 *   post:
 *     summary: Create a new Cotton HVI data entry
 *     tags: [Mixing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inspection_date
 *               - lot_no
 *               - variety
 *               - invoice_no
 *               - invoice_date
 *             properties:
 *               inspection_date:
 *                 type: string
 *                 format: date
 *               lot_no:
 *                 type: string
 *               variety:
 *                 type: string
 *               invoice_no:
 *                 type: string
 *               invoice_date:
 *                 type: string
 *                 format: date
 *               sci:
 *                 type: number
 *               span_length:
 *                 type: number
 *               mic:
 *                 type: number
 *               gtex:
 *                 type: number
 *               maturity:
 *                 type: number
 *               ur:
 *                 type: number
 *               sfi:
 *                 type: number
 *               elongation:
 *                 type: number
 *               yellow_b:
 *                 type: number
 *               trcnt:
 *                 type: number
 *               trar:
 *                 type: number
 *               trid:
 *                 type: number
 *               trash_content_percentage:
 *                 type: number
 *               invisible_loss_percentage:
 *                 type: number
 *               rd:
 *                 type: number
 *               colour_grade:
 *                 type: number
 *     responses:
 *       201:
 *         description: Cotton HVI data created successfully
 *       500:
 *         description: Server error
 */
router.post('/cotton-hvi', async (req, res, next) => {
  try {
    await ensureMixingEntryIdColumns();
    const {
      entry_id,
      inspection_date,
      lot_no,
      variety,
      invoice_no,
      invoice_date,
      sci,
      span_length,
      mic,
      gtex,
      maturity,
      ur,
      sfi,
      elongation,
      yellow_b,
      trcnt,
      trar,
      trid,
      trash_content_percentage,
      invisible_loss_percentage,
      rd,
      colour_grade,
      user_name
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    const numericFields = normalizeNumericFields(req.body, COTTON_HVI_PARAMETERS);
    if (numericFields.errors.length) {
      return res.status(400).json({
        message: 'Cotton HVI numeric fields must contain valid numbers',
        errors: numericFields.errors
      });
    }
    const numericValues = numericFields.normalized;

    const result = await client.query(
      `INSERT INTO mixing.cotton_hvi_data_entry (
        entry_id,
        inspection_date,
        lot_no,
        variety,
        invoice_no,
        invoice_date,
        sci,
        span_length,
        mic,
        gtex,
        maturity,
        ur,
        sfi,
        elongation,
        yellow_b,
        trcnt,
        trar,
        trid,
        trash_content_percentage,
        invisible_loss_percentage,
        rd,
        colour_grade,
        operator
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,
        $17,$18,$19,$20,$21,$22,$23
      )
      RETURNING *`,
      [
        entry_id,
        inspection_date,
        lot_no,
        variety,
        invoice_no,
        invoice_date,
        numericValues.sci,
        numericValues.span_length,
        numericValues.mic,
        numericValues.gtex,
        numericValues.maturity,
        numericValues.ur,
        numericValues.sfi,
        numericValues.elongation,
        numericValues.yellow_b,
        numericValues.trcnt,
        numericValues.trar,
        numericValues.trid,
        numericValues.trash_content_percentage,
        numericValues.invisible_loss_percentage,
        numericValues.rd,
        numericValues.colour_grade,
        user_name || null
      ]
    );

    const ticket = await autoCreateTicket({
      screenKey: 'cotton_hvi',
      machine_name: req.body.machine_name || SCREEN_NAMES.cotton_hvi,
      department: req.body.department || req.body.management_field,
      sub_department: req.body.sub_department || req.body.erp_product_code,
      user_name: req.body.user_name,
      values: {
        sci: numericValues.sci,
        span_length: numericValues.span_length,
        mic: numericValues.mic,
        gtex: numericValues.gtex,
        maturity: numericValues.maturity,
        ur: numericValues.ur,
        sfi: numericValues.sfi,
        elongation: numericValues.elongation,
        yellow_b: numericValues.yellow_b,
        trcnt: numericValues.trcnt,
        trar: numericValues.trar,
        trid: numericValues.trid,
        trash_content_percentage: numericValues.trash_content_percentage,
        invisible_loss_percentage: numericValues.invisible_loss_percentage,
        rd: numericValues.rd,
        colour_grade: numericValues.colour_grade
      }
    });

    res.status(201).json({
      message: 'Cotton HVI data created successfully',
      data: withScreenEntryId('cotton_hvi', result.rows[0]),
      ticket
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
 * /mixing/cotton-hvi:
 *   get:
 *     summary: Get Cotton HVI data entries with pagination
 *     tags: [Mixing]
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
 *         description: Cotton HVI data retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/cotton-hvi', async (req, res, next) => {
  try {
    await ensureMixingEntryIdColumns();
    const { page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT *
       FROM mixing.cotton_hvi_data_entry
       ORDER BY inspection_date DESC
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const totalResult = await client.query(
      `SELECT COUNT(*) FROM mixing.cotton_hvi_data_entry`
    );

    res.status(200).json({
      data: result.rows.map((row) => withScreenEntryId('cotton_hvi', row)),
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
 * /mixing/fibre:
 *   post:
 *     summary: Create a new Fibre data entry
 *     tags: [Mixing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inspection_date
 *               - lot_no
 *               - variety
 *               - invoice_no
 *               - invoice_date
 *             properties:
 *               inspection_date:
 *                 type: string
 *                 format: date
 *               lot_no:
 *                 type: string
 *               variety:
 *                 type: string
 *               invoice_no:
 *                 type: string
 *               invoice_date:
 *                 type: string
 *                 format: date
 *               cut_length:
 *                 type: number
 *               length_cv:
 *                 type: number
 *               mean_denier:
 *                 type: number
 *               cv_per_denier:
 *                 type: number
 *               tenacity:
 *                 type: number
 *               cv_per_tenacity:
 *                 type: number
 *               elongation:
 *                 type: number
 *               cv_per_elongation:
 *                 type: number
 *               crimp:
 *                 type: number
 *               whiteness_index:
 *                 type: number
 *               spin_finish:
 *                 type: number
 *     responses:
 *       201:
 *         description: Fibre data created successfully
 *       500:
 *         description: Server error
 */
router.post('/fibre', async (req, res, next) => {
  try {
    await ensureMixingEntryIdColumns();
    const {
      entry_id,
      inspection_date,
      lot_no,
      variety,
      invoice_no,
      invoice_date,
      cut_length,
      length_cv,
      mean_denier,
      cv_per_denier,
      tenacity,
      cv_per_tenacity,
      elongation,
      cv_per_elongation,
      crimp,
      whiteness_index,
      spin_finish,
      user_name
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    // mixing.fibre_data_entry already has its own "operator" column, but this insert never wrote
    // to it — user_name was only ever forwarded to autoCreateTicket, not persisted on the row
    // itself. Custom Report's Operator resolution checks the row's own operator column directly,
    // so persist it here rather than relying solely on the (separately fragile) submitted-notebook
    // recording flow.
    const result = await client.query(
      `INSERT INTO mixing.fibre_data_entry (
        entry_id, inspection_date, lot_no, variety, invoice_no, invoice_date,
        cut_length, length_cv, mean_denier, cv_per_denier,
        tenacity, cv_per_tenacity, elongation, cv_per_elongation,
        crimp, whiteness_index, spin_finish, operator
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,
        $11,$12,$13,$14,
        $15,$16,$17,$18
      )
      RETURNING *`,
      [
        entry_id,
        inspection_date,
        lot_no,
        variety,
        invoice_no,
        invoice_date,
        cut_length,
        length_cv,
        mean_denier,
        cv_per_denier,
        tenacity,
        cv_per_tenacity,
        elongation,
        cv_per_elongation,
        crimp,
        whiteness_index,
        spin_finish,
        user_name || null
      ]
    );

    const ticket = await autoCreateTicket({
      screenKey: 'fibre',
      machine_name: req.body.machine_name || SCREEN_NAMES.fibre,
      department: req.body.department || req.body.management_field,
      sub_department: req.body.sub_department || req.body.erp_product_code,
      user_name: req.body.user_name,
      values: { cut_length, length_cv, mean_denier, cv_per_denier, tenacity, cv_per_tenacity, elongation, cv_per_elongation, crimp, whiteness_index, spin_finish }
    });

    res.status(201).json({
      message: 'Fibre data created successfully',
      data: withScreenEntryId('fibre', result.rows[0]),
      ticket
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
 * /mixing/fibre:
 *   get:
 *     summary: Get Fibre data entries with pagination
 *     tags: [Mixing]
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
 *         description: Fibre data retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/fibre', async (req, res, next) => {
  try {
    await ensureMixingEntryIdColumns();
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT *
       FROM mixing.fibre_data_entry
       ORDER BY inspection_date DESC
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const totalResult = await client.query(
      `SELECT COUNT(*) FROM mixing.fibre_data_entry`
    );

    res.status(200).json({
      data: result.rows.map((row) => withScreenEntryId('fibre', row)),
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
 * /mixing/afis:
 *   post:
 *     summary: Create a new AFIS data entry
 *     tags: [Mixing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inspection_date
 *               - lot_no
 *               - variety
 *               - invoice_no
 *               - invoice_date
 *             properties:
 *               inspection_date:
 *                 type: string
 *                 format: date
 *               lot_no:
 *                 type: string
 *               variety:
 *                 type: string
 *               invoice_no:
 *                 type: string
 *               invoice_date:
 *                 type: string
 *                 format: date
 *               uql:
 *                 type: number
 *               l5:
 *                 type: number
 *               sfc_n:
 *                 type: number
 *               ifc:
 *                 type: number
 *               fibre_neps_gms:
 *                 type: number
 *               sfc_w:
 *                 type: number
 *               maturity:
 *                 type: number
 *               fineness:
 *                 type: number
 *               scn_gms:
 *                 type: number
 *     responses:
 *       201:
 *         description: AFIS data created successfully
 *       500:
 *         description: Server error
 */
router.post('/afis', async (req, res, next) => {
  try {
    await ensureMixingEntryIdColumns();
    const {
      entry_id,
      inspection_date,
      lot_no,
      variety,
      invoice_no,
      invoice_date,
      uql,
      l5,
      sfc_n,
      ifc,
      fibre_neps_gms,
      sfc_w,
      maturity,
      fineness,
      scn_gms,
      user_name
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    // mixing.afis_data_entry already has its own "operator" column, but this insert never wrote to
    // it — user_name was only ever forwarded to autoCreateTicket, not persisted on the row itself.
    // Same fix as Fibre Data Entry: persist it directly so Custom Report's Operator resolution
    // (which checks the row's own operator column first) works reliably.
    const result = await client.query(
      `INSERT INTO mixing.afis_data_entry (
        entry_id, inspection_date, lot_no, variety, invoice_no, invoice_date,
        uql, l5, sfc_n, ifc, fibre_neps_gms,
        sfc_w, maturity, fineness, scn_gms, operator
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16
      )
      RETURNING *`,
      [
        entry_id,
        inspection_date,
        lot_no,
        variety,
        invoice_no,
        invoice_date,
        uql,
        l5,
        sfc_n,
        ifc,
        fibre_neps_gms,
        sfc_w,
        maturity,
        fineness,
        scn_gms,
        user_name || null
      ]
    );

    const ticket = await autoCreateTicket({
      screenKey: 'afis',
      machine_name: req.body.machine_name || SCREEN_NAMES.afis,
      department: req.body.department || req.body.management_field,
      sub_department: req.body.sub_department || req.body.erp_product_code,
      user_name: req.body.user_name,
      values: { uql, l5, sfc_n, ifc, fibre_neps_gms, sfc_w, maturity, fineness, scn_gms }
    });

    res.status(201).json({
      message: 'AFIS data created successfully',
      data: withScreenEntryId('afis', result.rows[0]),
      ticket
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
 * /mixing/afis:
 *   get:
 *     summary: Get AFIS data entries with pagination
 *     tags: [Mixing]
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
 *         description: AFIS data retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/afis', async (req, res, next) => {
  try {
    await ensureMixingEntryIdColumns();
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT *
       FROM mixing.afis_data_entry
       ORDER BY inspection_date DESC
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const totalResult = await client.query(
      `SELECT COUNT(*) FROM mixing.afis_data_entry`
    );

    res.status(200).json({
      data: result.rows.map((row) => withScreenEntryId('afis', row)),
      total: parseInt(totalResult.rows[0].count),
      page: pageNum,
      limit: limitNum
    });

  } catch (error) {
    next(error);
  }
});

// Mixing's "AFIS-6 Cotton" and "AFIS-6 MMF" screens post to /mixing/afis6-cotton and
// /mixing/afis6-mmf (see frontend/src/apis/mixing.js) — but neither route ever existed, so both
// screens have been failing outright with "API not found" on every submission and every Custom
// Report fetch, even though their backing tables (mixing.afis6_cotton_data_entry/
// afis6_mmf_data_entry) already exist with the right columns (including entry_id and operator).
router.post('/afis6-cotton', async (req, res, next) => {
  try {
    await ensureMixingEntryIdColumns();
    const {
      entry_id, inspection_date, lot_no, variety, invoice_date, mc_name,
      blow_room, carding, breaker_drawing, finisher_drawing, comber,
      scp_nep_count, l_w_mm, l_w_cv, sfc_w_percent, uql_w_mm,
      l_n_mm, l_n_cv_percent, sfc_n_percent, five_pct_l_n_mm,
      user_name
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    const result = await client.query(
      `INSERT INTO mixing.afis6_cotton_data_entry (
        entry_id, inspection_date, lot_no, variety, invoice_date, mc_name,
        blow_room, carding, breaker_drawing, finisher_drawing, comber,
        scp_nep_count, l_w_mm, l_w_cv, sfc_w_percent, uql_w_mm,
        l_n_mm, l_n_cv_percent, sfc_n_percent, five_pct_l_n_mm, operator
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      RETURNING *`,
      [
        entry_id, inspection_date, lot_no, variety, invoice_date, mc_name,
        blow_room, carding, breaker_drawing, finisher_drawing, comber,
        scp_nep_count, l_w_mm, l_w_cv, sfc_w_percent, uql_w_mm,
        l_n_mm, l_n_cv_percent, sfc_n_percent, five_pct_l_n_mm, user_name || null
      ]
    );

    res.status(201).json({
      message: 'AFIS-6 Cotton data created successfully',
      data: withScreenEntryId('afis6_cotton', result.rows[0])
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(error);
  }
});

router.get('/afis6-cotton', async (req, res, next) => {
  try {
    await ensureMixingEntryIdColumns();
    const { page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT * FROM mixing.afis6_cotton_data_entry ORDER BY inspection_date DESC, created_at DESC OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );
    const totalResult = await client.query(`SELECT COUNT(*) FROM mixing.afis6_cotton_data_entry`);

    res.status(200).json({
      data: result.rows.map((row) => withScreenEntryId('afis6_cotton', row)),
      total: parseInt(totalResult.rows[0].count),
      page: pageNum,
      limit: limitNum
    });
  } catch (error) {
    next(error);
  }
});

router.post('/afis6-mmf', async (req, res, next) => {
  try {
    await ensureMixingEntryIdColumns();
    const {
      entry_id, inspection_date, machine_name, material_class, comment,
      total_nep_count_g, total_nep_mean_size_um, cut_length_n_mm,
      l_n_cv_percent, sfc_n_percent, five_pct_l_n_mm,
      fineness_den, fineness_cv_percent,
      long_fiber_gt_46_80_percent, long_fiber_count_gt_46_80,
      user_name
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    const result = await client.query(
      `INSERT INTO mixing.afis6_mmf_data_entry (
        entry_id, inspection_date, machine_name, material_class, comment,
        total_nep_count_g, total_nep_mean_size_um, cut_length_n_mm,
        l_n_cv_percent, sfc_n_percent, five_pct_l_n_mm,
        fineness_den, fineness_cv_percent,
        long_fiber_gt_46_80_percent, long_fiber_count_gt_46_80, operator
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`,
      [
        entry_id, inspection_date, machine_name, material_class, comment,
        total_nep_count_g, total_nep_mean_size_um, cut_length_n_mm,
        l_n_cv_percent, sfc_n_percent, five_pct_l_n_mm,
        fineness_den, fineness_cv_percent,
        long_fiber_gt_46_80_percent, long_fiber_count_gt_46_80, user_name || null
      ]
    );

    res.status(201).json({
      message: 'AFIS-6 MMF data created successfully',
      data: withScreenEntryId('afis6_mmf', result.rows[0])
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(error);
  }
});

router.get('/afis6-mmf', async (req, res, next) => {
  try {
    await ensureMixingEntryIdColumns();
    const { page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT * FROM mixing.afis6_mmf_data_entry ORDER BY inspection_date DESC, created_at DESC OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );
    const totalResult = await client.query(`SELECT COUNT(*) FROM mixing.afis6_mmf_data_entry`);

    res.status(200).json({
      data: result.rows.map((row) => withScreenEntryId('afis6_mmf', row)),
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
 * /mixing/moisture:
 *   post:
 *     summary: Create a new Moisture data entry
 *     tags: [Mixing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inspection_date
 *               - party_lot_no
 *               - variety
 *               - party_name
 *               - pr_no
 *             properties:
 *               inspection_date:
 *                 type: string
 *                 format: date
 *               party_lot_no:
 *                 type: string
 *               variety:
 *                 type: string
 *               party_name:
 *                 type: string
 *               pr_no:
 *                 type: string
 *               value1:
 *                 type: number
 *               value2:
 *                 type: number
 *               value3:
 *                 type: number
 *               value4:
 *                 type: number
 *               value5:
 *                 type: number
 *               value6:
 *                 type: number
 *               value7:
 *                 type: number
 *               value8:
 *                 type: number
 *               value9:
 *                 type: number
 *               value10:
 *                 type: number
 *               average:
 *                 type: number
 *     responses:
 *       201:
 *         description: Moisture data created successfully
 *       500:
 *         description: Server error
 */
router.post('/moisture', async (req, res, next) => {
  try {
    await ensureMixingEntryIdColumns();
    const {
      entry_id,
      inspection_date,
      party_lot_no,
      variety,
      party_name,
      pr_no,
      value1,
      value2,
      value3,
      value4,
      value5,
      value6,
      value7,
      value8,
      value9,
      value10,
      average,
      user_name
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    // mixing.moisture_data_entry already has its own "operator" column, but this insert never
    // wrote to it — same fix as Fibre/AFIS Data Entry: persist user_name directly so Custom
    // Report's Operator resolution (which checks the row's own operator column first) works.
    const result = await client.query(
      `INSERT INTO mixing.moisture_data_entry (
        entry_id, inspection_date, party_lot_no, variety, party_name, pr_no,
        value1, value2, value3, value4, value5,
        value6, value7, value8, value9, value10, average, operator
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,$17,$18
      )
      RETURNING *`,
      [
        entry_id,
        inspection_date,
        party_lot_no,
        variety,
        party_name,
        pr_no,
        value1,
        value2,
        value3,
        value4,
        value5,
        value6,
        value7,
        value8,
        value9,
        value10,
        average,
        user_name || null
      ]
    );

    const ticket = await autoCreateTicket({
      screenKey: 'moisture',
      machine_name: req.body.machine_name || SCREEN_NAMES.moisture,
      department: req.body.department || req.body.management_field,
      sub_department: req.body.sub_department || req.body.erp_product_code,
      user_name: req.body.user_name,
      values: { value1, value2, value3, value4, value5, value6, value7, value8, value9, value10, average }
    });

    res.status(201).json({
      message: 'Moisture data created successfully',
      data: withScreenEntryId('moisture', result.rows[0]),
      ticket
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
 * /mixing/moisture:
 *   get:
 *     summary: Get Moisture data entries with pagination
 *     tags: [Mixing]
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
 *         description: Moisture data retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/moisture', async (req, res, next) => {
  try {
    await ensureMixingEntryIdColumns();
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT *
       FROM mixing.moisture_data_entry
       ORDER BY inspection_date DESC
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const totalResult = await client.query(
      `SELECT COUNT(*) FROM mixing.moisture_data_entry`
    );

    res.status(200).json({
      data: result.rows.map((row) => withScreenEntryId('moisture', row)),
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
 * /mixing/openness:
 *   post:
 *     summary: Create Openness Inspection with Entries
 *     tags: [Mixing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inspection_date
 *               - actual_specific_volume_target
 *               - no_of_entries
 *               - entries
 *             properties:
 *               inspection_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-03-20"
 *               mixing:
 *                 type: string
 *                 example: "Line 1"
 *               actual_specific_volume_target:
 *                 type: number
 *                 example: 2.5
 *               no_of_entries:
 *                 type: integer
 *                 example: 15
 *               entries:
 *                 type: array
 *                 description: Total entries (auto divided into 3 stages)
 *                 items:
 *                   type: object
 *                   required:
 *                     - machine_name
 *                     - weight
 *                     - volume_1
 *                     - volume_2
 *                     - apparent_specific_volume
 *                     - actual_op_value
 *                   properties:
 *                     machine_name:
 *                       type: string
 *                       example: "Machine 1"
 *                     weight:
 *                       type: number
 *                       example: 10
 *                     volume_1:
 *                       type: number
 *                       example: 20
 *                     volume_2:
 *                       type: number
 *                       example: 22
 *                     apparent_specific_volume:
 *                       type: number
 *                       example: 2.1
 *                     actual_op_value:
 *                       type: number
 *                       example: 85
 *     responses:
 *       201:
 *         description: Openness created successfully
 *       500:
 *         description: Server error
 */

router.post('/openness', async (req, res, next) => {
  try {
    await ensureMixingEntryIdColumns();
    const {
      entry_id,
      inspection_date,
      mixing,
      br_line,
      actual_specific_volume_target,
      no_of_entries,
      entries,
      user_name
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    if (!entries || entries.length === 0) {
      return res.status(400).json({ error: "Entries required" });
    }

    await client.query('BEGIN');

    // mixing.openness_inspection already has its own "operator" column, but this insert never
    // wrote to it — same fix as Fibre/AFIS/Moisture Data Entry: persist user_name directly so
    // Custom Report's Operator resolution (which checks the row's own operator column first) works.
    const inspectionResult = await client.query(
      `INSERT INTO mixing.openness_inspection
      (entry_id, inspection_date, mixing, br_line, actual_specific_volume_target, no_of_entries, operator)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id, entry_id`,
      [
        entry_id,
        inspection_date,
        mixing,
        br_line || null,
        actual_specific_volume_target,
        no_of_entries,
        user_name || null
      ]
    );

    const inspectionId = inspectionResult.rows[0].id;
    const savedEntryId = inspectionResult.rows[0].entry_id;
    const perStage = no_of_entries / 3;
    for (let i = 0; i < entries.length; i++) {
      const entryNo = i + 1;
      const stageNo = Math.ceil(entryNo / perStage);
      const e = entries[i];
      const volume1 = Number(e.volume_1);
      const volume2 = Number(e.volume_2);
      const providedAverageVolume = Number(e.average_volume);
      const averageVolume = Number.isFinite(providedAverageVolume)
        ? providedAverageVolume
        : Number.isFinite(volume1) && Number.isFinite(volume2)
          ? (volume1 + volume2) / 2
          : null;

      await client.query(
        `INSERT INTO mixing.openness_entries
        (inspection_id, entry_no, stage_no, machine_name,
         beater_type, beater_speed_rpm,
         weight, volume_1, volume_2,
         apparent_specific_volume, actual_op_value)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          inspectionId,
          entryNo,
          stageNo,
          e.machine_name,
          e.beater_type,
          e.beater_speed_rpm,
          e.weight,
          e.volume_1,
          e.volume_2,
          e.apparent_specific_volume,
          e.actual_op_value
        ]
      );
    }

    await client.query('COMMIT');

    let ticket = null;
    if (Array.isArray(entries) && entries.length) {
      const values = {};
      entries.forEach((e, idx) => {
        values[`entry_${idx + 1}_actual_op_value`] = e.actual_op_value;
      });
      ticket = await autoCreateTicket({
        screenKey: 'openness',
        machine_name: req.body.machine_name || SCREEN_NAMES.openness,
        department: req.body.department || req.body.management_field,
        sub_department: req.body.sub_department || req.body.erp_product_code,
        user_name: req.body.user_name,
        values
      });
    }

    res.status(201).json({
      message: "Openness created successfully",
      inspection_id: inspectionId,
      entry_id: savedEntryId,
      ticket
    });

  } catch (error) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    next(error);
  }
});


/**
 * @swagger
 * /mixing/openness:
 *   get:
 *     summary: Get Openness Data (Inspection + Entries + Stage Stats + Overall)
 *     tags: [Mixing]
 *     responses:
 *       200:
 *         description: Data fetched successfully
 *       500:
 *         description: Server error
 */

router.get('/openness', async (req, res, next) => {
  try {
    await ensureMixingEntryIdColumns();

    const inspections = await client.query(
      `SELECT *
       FROM mixing.openness_inspection
       ORDER BY inspection_date DESC`
    );

    const result = [];

    for (const ins of inspections.rows) {

      const entries = await client.query(
        `SELECT entry_no, stage_no, machine_name,
                beater_type, beater_speed_rpm,
                weight, volume_1, volume_2,
                apparent_specific_volume, actual_op_value
         FROM mixing.openness_entries
         WHERE inspection_id = $1
         ORDER BY entry_no`,
        [ins.id]
      );

      const stageStats = await client.query(
        `SELECT *
         FROM mixing.openness_stage_stats
         WHERE inspection_id = $1
         ORDER BY stage_no`,
        [ins.id]
      );

      const overall = await client.query(
        `SELECT *
         FROM mixing.openness_overall_stats
         WHERE inspection_id = $1`,
        [ins.id]
      );

      result.push({
        inspection: withScreenEntryId('openness', ins),
        entries: entries.rows,
        stage_stats: stageStats.rows,
        overall: overall.rows[0] || null
      });
    }

    res.status(200).json(result);

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /mixing/qc:
 *   post:
 *     summary: Create Mixing QC entry with blends
 *     tags: [Mixing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - consignee_name
 *               - count_name
 *               - creation_date
 *               - blends
 *             properties:
 *               process_parameter:
 *                 type: string
 *                 example: Mixing
 *               consignee_name:
 *                 type: string
 *               count_name:
 *                 type: string
 *               creation_date:
 *                 type: string
 *                 format: date
 *               status:
 *                 type: string
 *                 enum: [DONE, UNDONE]
 *               blends:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - blend_no
 *                     - percentage
 *                   properties:
 *                     blend_no:
 *                       type: integer
 *                     percentage:
 *                       type: number
 *                     lot_no:
 *                       type: string
 *                     cut_length:
 *                       type: string
 *                     tenacity:
 *                       type: number
 *                     elongation:
 *                       type: number
 *                     merge_no:
 *                       type: string
 *     responses:
 *       201:
 *         description: Mixing QC created successfully
 *       500:
 *         description: Server error
 */

router.post('/qc', async (req, res, next) => {
  try {
    await ensureMixingEntryIdColumns();
    const {
      entry_id,
      consignee_name,
      count_name,
      creation_date,
      status = 'UNDONE',
      blends,
      user_name
    } = req.body;

    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    if (!Array.isArray(blends) || !blends.length) {
      return res.status(400).json({ error: 'Entries required' });
    }

    // 1?????? Insert Header
    const headerResult = await client.query(
      `INSERT INTO mixing.mixing_qc_header
      (entry_id, consignee_name, count_name, creation_date, status, operator)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING qc_id, param_id, entry_id`,
      [entry_id, consignee_name, count_name, creation_date, status, user_name || null]
    );

    const qc_id = headerResult.rows[0].qc_id;

    // 2?????? Insert Blends
    for (const b of blends) {
      await client.query(
        `INSERT INTO mixing.mixing_qc_blends
        (qc_id, blend_no, percentage, lot_no, cut_length, tenacity, elongation, merge_no)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          qc_id,
          b.blend_no,
          b.percentage,
          b.lot_no,
          b.cut_length,
          b.tenacity,
          b.elongation,
          b.merge_no
        ]
      );
    }

    res.status(201).json({
      message: 'Mixing QC created successfully',
      qc_id,
      entry_id: headerResult.rows[0].entry_id,
      param_id: headerResult.rows[0].param_id
    });

  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    if (isMixingQcSchemaMismatch(error)) {
      return sendMixingQcSchemaMismatchError(res);
    }
    next(error);
  }
});

/**
 * @swagger
 * /mixing/qc:
 *   get:
 *     summary: Get Mixing QC entries with blends
 *     tags: [Mixing]
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
router.get('/qc', async (req, res, next) => {
  try {
    // This route SELECTs h.operator, which only exists after ensureMixingEntryIdColumns() has run.
    // Every other mixing route calls it first; this one didn't, so a fresh deploy (or any process
    // that hits GET /qc before a POST /qc/cotton-hvi/etc. has run) would 500 with
    // "column h.operator does not exist".
    await ensureMixingEntryIdColumns();
    const { page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT
        h.qc_id,
        h.param_id,
        h.entry_id,
        h.consignee_name,
        h.count_name,
        h.creation_date,
        h.status,
        h.operator,
        h.created_at,

        COALESCE(
          json_agg(
            json_build_object(
              'blend_id', b.blend_id,
              'blend_no', b.blend_no,
              'percentage', b.percentage,
              'lot_no', b.lot_no,
              'cut_length', b.cut_length,
              'tenacity', b.tenacity,
              'elongation', b.elongation,
              'merge_no', b.merge_no
            )
          ) FILTER (WHERE b.blend_id IS NOT NULL),
          '[]'
        ) AS blends

      FROM mixing.mixing_qc_header h
      LEFT JOIN mixing.mixing_qc_blends b
        ON h.qc_id = b.qc_id

      GROUP BY h.qc_id
      ORDER BY h.qc_id DESC
      OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const totalResult = await client.query(
      `SELECT COUNT(*) FROM mixing.mixing_qc_header`
    );

    res.status(200).json({
      data: result.rows,
      total: parseInt(totalResult.rows[0].count),
      page: pageNum,
      limit: limitNum
    });

  } catch (error) {
    if (isMixingQcSchemaMismatch(error)) {
      return sendMixingQcSchemaMismatchError(res);
    }
    next(error);
  }
});

/**
 * @swagger
 * /mixing/qc/{qc_id}:
 *   put:
 *     summary: Update Mixing QC entry with blends
 *     tags: [Mixing]
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
 *             properties:
 *               consignee_name:
 *                 type: string
 *               count_name:
 *                 type: string
 *               creation_date:
 *                 type: string
 *                 format: date
 *               status:
 *                 type: string
 *                 enum: [DONE, UNDONE]
 *               blends:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     blend_no:
 *                       type: integer
 *                     percentage:
 *                       type: number
 *                     lot_no:
 *                       type: string
 *                     cut_length:
 *                       type: string
 *                     tenacity:
 *                       type: number
 *                     elongation:
 *                       type: number
 *                     merge_no:
 *                       type: string
 *     responses:
 *       200:
 *         description: Updated successfully
 *       500:
 *         description: Server error
 */
router.put('/qc/:qc_id', async (req, res, next) => {
  try {
    // This route's UPDATE writes to mixing_qc_header.operator, which only exists after
    // ensureMixingEntryIdColumns() has run. Every other mixing route calls it first; this one
    // didn't, so it would 500 with "column operator does not exist" until some other mixing route
    // happened to run first in the process lifetime.
    await ensureMixingEntryIdColumns();
    const { qc_id } = req.params;

    const {
      consignee_name,
      count_name,
      creation_date,
      status,
      blends,
      user_name
    } = req.body;

    if (!Array.isArray(blends) || !blends.length) {
      return res.status(400).json({ error: 'Entries required' });
    }

    // 1?????? Update Header
    await client.query(
      `UPDATE mixing.mixing_qc_header
       SET consignee_name = $1,
           count_name = $2,
           creation_date = $3,
           status = $4,
           operator = COALESCE($6, operator)
       WHERE qc_id = $5`,
      [consignee_name, count_name, creation_date, status, qc_id, user_name || null]
    );

    // 2?????? Delete old blends (simple approach)
    await client.query(
      `DELETE FROM mixing.mixing_qc_blends
       WHERE qc_id = $1`,
      [qc_id]
    );

    // 3?????? Insert new blends
    for (const b of blends) {
      await client.query(
        `INSERT INTO mixing.mixing_qc_blends
        (qc_id, blend_no, percentage, lot_no, cut_length, tenacity, elongation, merge_no)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          qc_id,
          b.blend_no ?? 0,
          b.percentage ?? 0,
          b.lot_no ?? '',
          b.cut_length ?? '',
          b.tenacity ?? 0,
          b.elongation ?? 0,
          b.merge_no ?? ''
        ]
      );
    }

    res.status(200).json({
      message: 'Mixing QC updated successfully',
      qc_id
    });

  } catch (error) {
    if (isMixingQcSchemaMismatch(error)) {
      return sendMixingQcSchemaMismatchError(res);
    }
    next(error);
  }
});

module.exports = router;


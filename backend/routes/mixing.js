const express = require('express');
const router = express.Router();
const client = require('../connection');
const { resolveOrCreateProcessParameterEntryId, getCountNameConflict } = require('../utils/processParameterEntryId');
const { recordPpNotebookSubmission } = require('./submittedNotebooks.routes');
const sqlServer = require('../config/sqlserver');
const { dedupeVarieties } = require('../utils/variety');
const { createEmployeeMasterDropdown } = require('../utils/employeeMaster');

// Drops blend rows the user never actually filled in (frontend grid ships
// unfilled rows padded with 0/blank defaults) so only entered rows are saved.
const hasBlendData = (b) =>
  Boolean(
    (b.percentage !== undefined && b.percentage !== null && b.percentage !== 0 && b.percentage !== '') ||
    (b.lot_no && String(b.lot_no).trim()) ||
    (b.cut_length !== undefined && b.cut_length !== null && b.cut_length !== 0 && b.cut_length !== '') ||
    (b.tenacity !== undefined && b.tenacity !== null && b.tenacity !== 0 && b.tenacity !== '') ||
    (b.elongation !== undefined && b.elongation !== null && b.elongation !== 0 && b.elongation !== '') ||
    (b.merge_no && String(b.merge_no).trim())
  );

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
  afis6_cotton: 'AFIS-6 Cotton Data Entry',
  afis6_mmf: 'AFIS-6 MMF Data Entry',
  moisture: 'Moisture Data Entry',
  openness: 'Openness Data Entry'
};

const SCREEN_ID_PREFIXES = {
  cotton_hvi: 'CH',
  fibre: 'FB',
  afis: 'AF',
  afis6_cotton: 'AFIC',
  afis6_mmf: 'AFIC',
  moisture: 'MO',
  openness: 'OP'
};

const MIXING_NOTEBOOK_SLUGS = [
  'cotton-hvi',
  'fibre',
  'afis',
  'afis6-cotton',
  'afis6-mmf',
  'moisture',
  'openness'
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
const persistMixingEntryId = async (tableName, screenKey, row) => {
  if (!row || row.entry_id || row.id == null) return row;

  const entryId = formatScreenEntryId(screenKey, row.id);
  if (!entryId) return row;

  const updated = await client.query(
    `UPDATE ${tableName}
     SET entry_id = $1
     WHERE id = $2
     RETURNING *`,
    [entryId, row.id]
  );

  return updated.rows[0] || { ...row, entry_id: entryId };
};
const isUniqueViolation = (err) => err && err.code === '23505';

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
       MAX(LTRIM(RTRIM(CAST(lm.Ledger_Name AS VARCHAR(255))))) AS party_name
     FROM dbo.lotmaster l
     LEFT JOIN dbo.variety v ON l.varcode = v.varcode
     LEFT JOIN dbo.ledger_master lm ON l.ledgercode = lm.Ledger_Code
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

const getCottonHviLotDropdown = getLotMasterDropdown;

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
      fetchCottonLotDetails(lotPrefix || prefix, exactLotNo)
    ]);

    if (varietiesResult.status === 'rejected') {
      throw varietiesResult.reason;
    }

    if (lotsResult.status === 'rejected') {
      console.warn('Cotton HVI lotmaster lots unavailable; returning variety dropdown only:', lotsResult.reason?.message || lotsResult.reason);
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
        ? [{ field: 'lot_no', message: 'Cotton HVI lotmaster lots are unavailable; varieties were loaded' }]
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

const getEmployeeMasterDropdown = createEmployeeMasterDropdown(sqlServer, 'mixing');

const ensureMixingEntryIdColumns = async () => {
  await client.query(`
    ALTER TABLE mixing.cotton_hvi_data_entry
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
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

  await client.query(`
    ALTER TABLE mixing.fibre_data_entry
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS fibre_data_entry_entry_id_uq
    ON mixing.fibre_data_entry (entry_id)
    WHERE entry_id IS NOT NULL;
  `);
  await client.query(`
    WITH existing_max AS (
      SELECT COALESCE(MAX(NULLIF(regexp_replace(entry_id, '\\D', '', 'g'), '')::int), 0) AS max_no
      FROM mixing.fibre_data_entry
      WHERE entry_id ~ '^#FB-\\d+$'
    ),
    numbered AS (
      SELECT ctid, ROW_NUMBER() OVER (ORDER BY ctid) AS rn
      FROM mixing.fibre_data_entry
      WHERE entry_id IS NULL OR BTRIM(entry_id) = ''
    )
    UPDATE mixing.fibre_data_entry t
    SET entry_id = '#FB-' || LPAD((numbered.rn + existing_max.max_no)::text, 4, '0')
    FROM numbered, existing_max
    WHERE t.ctid = numbered.ctid;
  `);

  await client.query(`
    ALTER TABLE mixing.afis_data_entry
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS afis_data_entry_entry_id_uq
    ON mixing.afis_data_entry (entry_id)
    WHERE entry_id IS NOT NULL;
  `);
  await client.query(`
    WITH existing_max AS (
      SELECT COALESCE(MAX(NULLIF(regexp_replace(entry_id, '\\D', '', 'g'), '')::int), 0) AS max_no
      FROM mixing.afis_data_entry
      WHERE entry_id ~ '^#AF-\\d+$'
    ),
    numbered AS (
      SELECT ctid, ROW_NUMBER() OVER (ORDER BY ctid) AS rn
      FROM mixing.afis_data_entry
      WHERE entry_id IS NULL OR BTRIM(entry_id) = ''
    )
    UPDATE mixing.afis_data_entry t
    SET entry_id = '#AF-' || LPAD((numbered.rn + existing_max.max_no)::text, 4, '0')
    FROM numbered, existing_max
    WHERE t.ctid = numbered.ctid;
  `);

  await client.query(`
    ALTER TABLE mixing.afis6_cotton_data_entry
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS afis6_cotton_data_entry_entry_id_uq
    ON mixing.afis6_cotton_data_entry (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    ALTER TABLE mixing.afis6_mmf_data_entry
      ADD COLUMN IF NOT EXISTS entry_id TEXT,
      ADD COLUMN IF NOT EXISTS material_class VARCHAR(255),
      ADD COLUMN IF NOT EXISTS comment VARCHAR(255);
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS afis6_mmf_data_entry_entry_id_uq
    ON mixing.afis6_mmf_data_entry (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    ALTER TABLE mixing.moisture_data_entry
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS moisture_data_entry_entry_id_uq
    ON mixing.moisture_data_entry (entry_id)
    WHERE entry_id IS NOT NULL;
  `);
  await client.query(`
    WITH existing_max AS (
      SELECT COALESCE(MAX(NULLIF(regexp_replace(entry_id, '\\D', '', 'g'), '')::int), 0) AS max_no
      FROM mixing.moisture_data_entry
      WHERE entry_id ~ '^#MO-\\d+$'
    ),
    numbered AS (
      SELECT ctid, ROW_NUMBER() OVER (ORDER BY ctid) AS rn
      FROM mixing.moisture_data_entry
      WHERE entry_id IS NULL OR BTRIM(entry_id) = ''
    )
    UPDATE mixing.moisture_data_entry t
    SET entry_id = '#MO-' || LPAD((numbered.rn + existing_max.max_no)::text, 4, '0')
    FROM numbered, existing_max
    WHERE t.ctid = numbered.ctid;
  `);

  await client.query(`
    ALTER TABLE mixing.openness_inspection
      ADD COLUMN IF NOT EXISTS entry_id TEXT,
      ADD COLUMN IF NOT EXISTS br_line_no VARCHAR(100);
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS openness_inspection_entry_id_uq
    ON mixing.openness_inspection (entry_id)
    WHERE entry_id IS NOT NULL;
  `);
  await client.query(`
    ALTER TABLE mixing.mixing_qc_header
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS mixing_qc_header_entry_id_uq
    ON mixing.mixing_qc_header (entry_id)
    WHERE entry_id IS NOT NULL;
  `);
  await client.query(`
    ALTER TABLE mixing.openness_entries
      ADD COLUMN IF NOT EXISTS beater_type VARCHAR(100),
      ADD COLUMN IF NOT EXISTS beater_speed_rpm NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS average_volume NUMERIC(12,3);
  `);

  // Dashboard/report widgets need a single table+date-column source per screen.
  // Openness and Mixing QC are header+child splits, so flatten them into views.
  await client.query(`
    CREATE OR REPLACE VIEW mixing.openness_dashboard_entries AS
    SELECT
      i.id AS inspection_id,
      i.inspection_date,
      i.br_line_no,
      i.actual_specific_volume_target,
      i.no_of_entries,
      i.entry_id,
      e.entry_no,
      e.stage_no,
      e.machine_name,
      e.weight,
      e.volume_1,
      e.volume_2,
      e.average_volume,
      e.apparent_specific_volume,
      e.actual_op_value,
      e.beater_type,
      e.beater_speed_rpm
    FROM mixing.openness_inspection i
    JOIN mixing.openness_entries e ON e.inspection_id = i.id;
  `);
  await client.query(`
    CREATE OR REPLACE VIEW mixing.mixing_qc_dashboard_entries AS
    SELECT
      h.qc_id,
      h.param_id,
      h.entry_id,
      h.consignee_name,
      h.count_name,
      h.creation_date,
      h.status,
      b.blend_no,
      b.percentage,
      b.lot_no,
      b.cut_length,
      b.tenacity,
      b.elongation,
      b.merge_no
    FROM mixing.mixing_qc_header h
    LEFT JOIN mixing.mixing_qc_blends b ON b.qc_id = h.qc_id;
  `);
};

ensureMixingEntryIdColumns().catch((err) => {
  console.warn('[mixing.js] Startup schema/view sync failed (non-fatal):', err.message);
});

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
  const fallbackThreshold = Number(rule?.threshold_value);
  const effectivePlus = Number.isFinite(plus) ? plus : fallbackThreshold;
  const effectiveMinus = Number.isFinite(minus) ? minus : fallbackThreshold;
  const baseline = Number(rule?.actual_value);

  if (!Number.isFinite(actual)) return null;
  if (condition === 'more than') {
    if (!Number.isFinite(effectivePlus)) return null;
    return actual > effectivePlus;
  }
  if (condition === 'less than') {
    if (!Number.isFinite(effectiveMinus)) return null;
    return actual < effectiveMinus;
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
  if (!machine_name) return null;

  const paramNames = Object.keys(values || {});
  if (!paramNames.length) return null;

  const thresholdParams = [SCREEN_NAMES[screenKey], machine_name];
  const thresholdFilters = [
    `lower(trim(COALESCE(input_screen, machine_name, ''))) = lower(trim($1))`,
    `lower(trim(COALESCE(machine_name, ''))) = lower(trim($2))`
  ];

  if (department) {
    thresholdParams.push(department);
    thresholdFilters.push(`lower(trim(COALESCE(department, management_field, ''))) = lower(trim($${thresholdParams.length}))`);
  }

  if (sub_department) {
    thresholdParams.push(sub_department);
    thresholdFilters.push(`lower(trim(COALESCE(sub_department, erp_product_code, ''))) = lower(trim($${thresholdParams.length}))`);
  }

  const thresholdsRes = await client.query(
    `SELECT input_field, condition_level, plus_threshold, minus_threshold, threshold_value, actual_value,
            department, management_field, sub_department, erp_product_code,
            approval_l1_user_id, approval_l2_user_id, approval_l3_user_id
     FROM ticketing_system.threshold_master
     WHERE ${thresholdFilters.join(' AND ')}
       AND is_active = true
     ORDER BY
       CASE
         WHEN ${department ? `lower(trim(COALESCE(department, management_field, ''))) = lower(trim($${thresholdParams.length - (sub_department ? 1 : 0)}))` : 'true'}
          AND ${sub_department ? `lower(trim(COALESCE(sub_department, erp_product_code, ''))) = lower(trim($${thresholdParams.length}))` : 'true'}
         THEN 0 ELSE 1
       END,
       input_field`,
    thresholdParams
  );

  if (!thresholdsRes.rows.length) return null;

  const resolvedDepartment =
    department ||
    thresholdsRes.rows[0].department ||
    thresholdsRes.rows[0].management_field ||
    null;
  const resolvedSubDepartment =
    sub_department ||
    thresholdsRes.rows[0].sub_department ||
    thresholdsRes.rows[0].erp_product_code ||
    null;

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
      resolvedDepartment,
      resolvedSubDepartment,
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
    WHERE lower(trim(COALESCE(management_field, department, ''))) = lower(trim($1))
      AND lower(trim(COALESCE(erp_product_code, sub_department, ''))) = lower(trim($2))
      AND lower(trim(COALESCE(machine_name, input_screen, ''))) = lower(trim($3))
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
router.get('/qc/master/count-names', getCountMasterDropdown);
router.get('/qc/master/dropdown', getMasterVarieties);
router.get('/qc/master/counts', getCountMasterDropdown);
router.get('/master/employees', getEmployeeMasterDropdown);
router.get('/master/employee-dropdown', getEmployeeMasterDropdown);
router.get('/master/employee-names', getEmployeeMasterDropdown);
router.get('/master/user-names', getEmployeeMasterDropdown);

router.get('/cotton-hvi/master/dropdown', getCottonHviMasterDropdown);
router.get('/cotton-hvi/master-data', getCottonHviMasterDropdown);
router.get('/cotton-hvi/master/master-data', getCottonHviMasterDropdown);
router.get('/cotton-hvi/dropdown', getCottonHviMasterDropdown);

for (const notebookSlug of MIXING_NOTEBOOK_SLUGS.filter((slug) => !['cotton-hvi', 'fibre'].includes(slug))) {
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
      colour_grade
    } = req.body;

    const resolvedEntryId = String(entry_id || '').trim() || null;

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
        colour_grade
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,
        $17,$18,$19,$20,$21,$22
      )
      RETURNING *`,
      [
        resolvedEntryId,
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
        numericValues.colour_grade
      ]
    );

    const persistedRow = await persistMixingEntryId('mixing.cotton_hvi_data_entry', 'cotton_hvi', result.rows[0]);

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
      data: withScreenEntryId('cotton_hvi', persistedRow),
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
    const {
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
      spin_finish
    } = req.body;

    const result = await client.query(
      `INSERT INTO mixing.fibre_data_entry (
        inspection_date, lot_no, variety, invoice_no, invoice_date,
        cut_length, length_cv, mean_denier, cv_per_denier,
        tenacity, cv_per_tenacity, elongation, cv_per_elongation,
        crimp, whiteness_index, spin_finish
      )
      VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,
        $10,$11,$12,$13,
        $14,$15,$16
      )
      RETURNING *`,
      [
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
        spin_finish
      ]
    );

    const persistedRow = await persistMixingEntryId('mixing.fibre_data_entry', 'fibre', result.rows[0]);

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
      data: withScreenEntryId('fibre', persistedRow),
      ticket
    });

  } catch (error) {
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
    const {
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
      scn_gms
    } = req.body;

    const result = await client.query(
      `INSERT INTO mixing.afis_data_entry (
        inspection_date, lot_no, variety, invoice_no, invoice_date,
        uql, l5, sfc_n, ifc, fibre_neps_gms,
        sfc_w, maturity, fineness, scn_gms
      )
      VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,
        $11,$12,$13,$14
      )
      RETURNING *`,
      [
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
        scn_gms
      ]
    );

    const persistedRow = await persistMixingEntryId('mixing.afis_data_entry', 'afis', result.rows[0]);

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
      data: withScreenEntryId('afis', persistedRow),
      ticket
    });

  } catch (error) {
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

/**
 * @swagger
 * /mixing/afis6-cotton:
 *   post:
 *     summary: Create a new AFIS-6 Cotton data entry
 *     tags: [Mixing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               entry_id:
 *                 type: string
 *               lot_no:
 *                 type: string
 *               variety:
 *                 type: string
 *               invoice_date:
 *                 type: string
 *                 format: date
 *               mc_name:
 *                 type: string
 *               blow_room:
 *                 type: string
 *               carding:
 *                 type: string
 *               breaker_drawing:
 *                 type: string
 *               finisher_drawing:
 *                 type: string
 *               comber:
 *                 type: string
 *               scp_nep_count:
 *                 type: number
 *               l_w_mm:
 *                 type: number
 *               l_w_cv:
 *                 type: number
 *               sfc_w_percent:
 *                 type: number
 *               uql_w_mm:
 *                 type: number
 *               l_n_mm:
 *                 type: number
 *               l_n_cv_percent:
 *                 type: number
 *               sfc_n_percent:
 *                 type: number
 *               five_pct_l_n_mm:
 *                 type: number
 *     responses:
 *       201:
 *         description: AFIS-6 Cotton data created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post('/afis6-cotton', async (req, res, next) => {
  try {
    await ensureMixingEntryIdColumns();

    const NUMERIC_FIELDS = [
      'scp_nep_count',
      'l_w_mm',
      'l_w_cv',
      'sfc_w_percent',
      'uql_w_mm',
      'l_n_mm',
      'l_n_cv_percent',
      'sfc_n_percent',
      'five_pct_l_n_mm',
      'sc_nep_count_g',
      'crimp_percent'
    ];

    const { normalized, errors } = normalizeNumericFields(req.body, NUMERIC_FIELDS);
    if (errors.length) {
      return res.status(400).json({ message: 'Validation error', errors });
    }

    const entry_id = String(req.body.entry_id || '').trim() || null;
    const lot_no = String(req.body.lot_no || '').trim() || null;
    const variety = String(req.body.variety || '').trim() || null;
    const mc_name = String(req.body.mc_name || '').trim() || null;
    const blow_room = String(req.body.blow_room || '').trim() || null;
    const carding = String(req.body.carding || '').trim() || null;
    const breaker_drawing = String(req.body.breaker_drawing || '').trim() || null;
    const finisher_drawing = String(req.body.finisher_drawing || '').trim() || null;
    const comber = String(req.body.comber || '').trim() || null;
    const inspection_date = toDateOnly(req.body.inspection_date) || toDateOnly(new Date());
    const invoice_date = toDateOnly(req.body.invoice_date);

    const result = await client.query(
      `INSERT INTO mixing.afis6_cotton_data_entry (
        entry_id, inspection_date, lot_no, variety, invoice_date,
        mc_name, blow_room, carding, breaker_drawing, finisher_drawing, comber,
        scp_nep_count,
        l_w_mm, l_w_cv, sfc_w_percent, uql_w_mm,
        l_n_mm, l_n_cv_percent, sfc_n_percent, five_pct_l_n_mm,
        sc_nep_count_g, crimp_percent
      )
      VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,$11,
        $12,
        $13,$14,$15,$16,
        $17,$18,$19,$20,
        $21,$22
      )
      RETURNING *`,
      [
        entry_id,
        inspection_date,
        lot_no,
        variety,
        invoice_date,
        mc_name,
        blow_room,
        carding,
        breaker_drawing,
        finisher_drawing,
        comber,
        normalized.scp_nep_count,
        normalized.l_w_mm,
        normalized.l_w_cv,
        normalized.sfc_w_percent,
        normalized.uql_w_mm,
        normalized.l_n_mm,
        normalized.l_n_cv_percent,
        normalized.sfc_n_percent,
        normalized.five_pct_l_n_mm,
        normalized.sc_nep_count_g,
        normalized.crimp_percent
      ]
    );

    const row = await persistMixingEntryId(
      'mixing.afis6_cotton_data_entry',
      'afis6_cotton',
      result.rows[0]
    );

    const ticket = await autoCreateTicket({
      screenKey: 'afis6_cotton',
      machine_name: req.body.machine_name || SCREEN_NAMES.afis6_cotton,
      department: req.body.department || req.body.management_field,
      sub_department: req.body.sub_department || req.body.erp_product_code,
      user_name: req.body.user_name,
      values: normalized
    });

    res.status(201).json({
      message: 'AFIS-6 Cotton data created successfully',
      data: withScreenEntryId('afis6_cotton', row),
      ticket
    });

  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id, please retry' });
    }
    next(error);
  }
});

/**
 * @swagger
 * /mixing/afis6-cotton:
 *   get:
 *     summary: Get AFIS-6 Cotton data entries with pagination
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
 *         description: AFIS-6 Cotton data retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/afis6-cotton', async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT *
       FROM mixing.afis6_cotton_data_entry
       ORDER BY inspection_date DESC, id DESC
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const totalResult = await client.query(
      `SELECT COUNT(*) FROM mixing.afis6_cotton_data_entry`
    );

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

/**
 * @swagger
 * /mixing/afis6-mmf:
 *   post:
 *     summary: Create a new AFIS-6 MMF data entry
 *     tags: [Mixing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               entry_id:
 *                 type: string
 *               machine_name:
 *                 type: string
 *               material_class:
 *                 type: string
 *               comment:
 *                 type: string
 *               lot_no:
 *                 type: string
 *               variety:
 *                 type: string
 *               invoice_date:
 *                 type: string
 *                 format: date
 *               mc_name:
 *                 type: string
 *               blow_room:
 *                 type: string
 *               carding:
 *                 type: string
 *               breaker_drawing:
 *                 type: string
 *               finisher_drawing:
 *                 type: string
 *               comber:
 *                 type: string
 *               total_nep_count_g:
 *                 type: number
 *               total_nep_mean_size_um:
 *                 type: number
 *               fiber_nep_count_g:
 *                 type: number
 *               fiber_nep_mean_size_um:
 *                 type: number
 *               sc_nep_count_g:
 *                 type: number
 *               sc_nep_mean_size_um:
 *                 type: number
 *               l_w_mm:
 *                 type: number
 *               l_w_cv:
 *                 type: number
 *               sfc_w_percent:
 *                 type: number
 *               uql_w_mm:
 *                 type: number
 *               l_n_mm:
 *                 type: number
 *               l_n_cv_percent:
 *                 type: number
 *               sfc_n_percent:
 *                 type: number
 *               five_pct_l_n_mm:
 *                 type: number
 *               fitness_index:
 *                 type: number
 *               maturity_ratio_mat1:
 *                 type: number
 *               ifc_percent:
 *                 type: number
 *               fifty_pct_l_n_mm:
 *                 type: number
 *               cut_length_n_mm:
 *                 type: number
 *               fineness_den:
 *                 type: number
 *               fineness_cv_percent:
 *                 type: number
 *               long_fiber_gt_46_80_percent:
 *                 type: number
 *               long_fiber_count_gt_46_80:
 *                 type: number
 *     responses:
 *       201:
 *         description: AFIS-6 MMF data created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post('/afis6-mmf', async (req, res, next) => {
  try {
    await ensureMixingEntryIdColumns();

    const NUMERIC_FIELDS = [
      'total_nep_count_g',
      'total_nep_mean_size_um',
      'fiber_nep_count_g',
      'fiber_nep_mean_size_um',
      'sc_nep_count_g',
      'sc_nep_mean_size_um',
      'l_w_mm',
      'l_w_cv',
      'sfc_w_percent',
      'uql_w_mm',
      'l_n_mm',
      'l_n_cv_percent',
      'sfc_n_percent',
      'five_pct_l_n_mm',
      'fitness_index',
      'maturity_ratio_mat1',
      'ifc_percent',
      'fifty_pct_l_n_mm',
      'cut_length_n_mm',
      'fineness_den',
      'fineness_cv_percent',
      'long_fiber_gt_45_60_percent',
      'long_fiber_count_gt_45_60',
      'crimp_percent'
    ];

    const { normalized, errors } = normalizeNumericFields(req.body, NUMERIC_FIELDS);
    if (errors.length) {
      return res.status(400).json({ message: 'Validation error', errors });
    }

    const entry_id = String(req.body.entry_id || '').trim() || null;
    const machine_name = req.body.machine_name || null;
    const material_class = String(req.body.material_class || '').trim() || null;
    const comment = String(req.body.comment || '').trim() || null;
    const lot_no = String(req.body.lot_no || '').trim() || null;
    const variety = String(req.body.variety || '').trim() || null;
    const mc_name = String(req.body.mc_name || '').trim() || null;
    const blow_room = String(req.body.blow_room || '').trim() || null;
    const carding = String(req.body.carding || '').trim() || null;
    const breaker_drawing = String(req.body.breaker_drawing || '').trim() || null;
    const finisher_drawing = String(req.body.finisher_drawing || '').trim() || null;
    const comber = String(req.body.comber || '').trim() || null;
    const inspection_date = toDateOnly(req.body.inspection_date) || toDateOnly(new Date());
    const invoice_date = toDateOnly(req.body.invoice_date);

    const result = await client.query(
      `INSERT INTO mixing.afis6_mmf_data_entry (
        entry_id, inspection_date, machine_name, material_class, comment, lot_no, variety, invoice_date,
        mc_name, blow_room, carding, breaker_drawing, finisher_drawing, comber,
        total_nep_count_g, total_nep_mean_size_um,
        fiber_nep_count_g, fiber_nep_mean_size_um,
        sc_nep_count_g, sc_nep_mean_size_um,
        l_w_mm, l_w_cv, sfc_w_percent, uql_w_mm,
        l_n_mm, l_n_cv_percent, sfc_n_percent, five_pct_l_n_mm,
        fitness_index, maturity_ratio_mat1, ifc_percent, fifty_pct_l_n_mm,
        cut_length_n_mm, fineness_den, fineness_cv_percent,
        long_fiber_gt_45_60_percent, long_fiber_count_gt_45_60,
        crimp_percent
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,
        $9,$10,$11,$12,$13,$14,
        $15,$16,
        $17,$18,
        $19,$20,$21,$22,
        $23,$24,$25,$26,
        $27,$28,$29,$30,
        $31,$32,$33,
        $34,$35,
        $36
      )
      RETURNING *`,
      [
        entry_id,
        inspection_date,
        machine_name,
        material_class,
        comment,
        lot_no,
        variety,
        invoice_date,
        mc_name,
        blow_room,
        carding,
        breaker_drawing,
        finisher_drawing,
        comber,
        normalized.total_nep_count_g,
        normalized.total_nep_mean_size_um,
        normalized.fiber_nep_count_g,
        normalized.fiber_nep_mean_size_um,
        normalized.sc_nep_count_g,
        normalized.sc_nep_mean_size_um,
        normalized.l_w_mm,
        normalized.l_w_cv,
        normalized.sfc_w_percent,
        normalized.uql_w_mm,
        normalized.l_n_mm,
        normalized.l_n_cv_percent,
        normalized.sfc_n_percent,
        normalized.five_pct_l_n_mm,
        normalized.fitness_index,
        normalized.maturity_ratio_mat1,
        normalized.ifc_percent,
        normalized.fifty_pct_l_n_mm,
        normalized.cut_length_n_mm,
        normalized.fineness_den,
        normalized.fineness_cv_percent,
        normalized.long_fiber_gt_45_60_percent,
        normalized.long_fiber_count_gt_45_60,
        normalized.crimp_percent
      ]
    );

    const row = await persistMixingEntryId(
      'mixing.afis6_mmf_data_entry',
      'afis6_mmf',
      result.rows[0]
    );

    const ticket = await autoCreateTicket({
      screenKey: 'afis6_mmf',
      machine_name: req.body.machine_name || SCREEN_NAMES.afis6_mmf,
      department: req.body.department || req.body.management_field,
      sub_department: req.body.sub_department || req.body.erp_product_code,
      user_name: req.body.user_name,
      values: normalized
    });

    res.status(201).json({
      message: 'AFIS-6 MMF data created successfully',
      data: withScreenEntryId('afis6_mmf', row),
      ticket
    });

  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id, please retry' });
    }
    next(error);
  }
});

/**
 * @swagger
 * /mixing/afis6-mmf:
 *   get:
 *     summary: Get AFIS-6 MMF data entries with pagination
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
 *         description: AFIS-6 MMF data retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/afis6-mmf', async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT *
       FROM mixing.afis6_mmf_data_entry
       ORDER BY inspection_date DESC, id DESC
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const totalResult = await client.query(
      `SELECT COUNT(*) FROM mixing.afis6_mmf_data_entry`
    );

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
    const {
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
      average
    } = req.body;

    const result = await client.query(
      `INSERT INTO mixing.moisture_data_entry (
        inspection_date, party_lot_no, variety, party_name, pr_no,
        value1, value2, value3, value4, value5,
        value6, value7, value8, value9, value10, average
      )
      VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16
      )
      RETURNING *`,
      [
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
        average
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
 *               br_line_no:
 *                 type: string
 *                 example: "BR 04(TD 7-3)"
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
 *                     beater_type:
 *                       type: string
 *                       example: "Blade"
 *                     beater_speed_rpm:
 *                       type: number
 *                       example: 850
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
      inspection_date,
      br_line_no,
      actual_specific_volume_target,
      no_of_entries,
      entries
    } = req.body;

    if (!entries || entries.length === 0) {
      return res.status(400).json({ error: "Entries required" });
    }

    await client.query('BEGIN');

    const inspectionResult = await client.query(
      `INSERT INTO mixing.openness_inspection
      (inspection_date, br_line_no, actual_specific_volume_target, no_of_entries)
      VALUES ($1,$2,$3,$4)
      RETURNING *`,
      [
        inspection_date,
        br_line_no || null,
        actual_specific_volume_target,
        no_of_entries
      ]
    );

    const inspectionId = inspectionResult.rows[0].id;
    const perStage = no_of_entries / 3;
    for (let i = 0; i < entries.length; i++) {
      const entryNo = i + 1;
      const stageNo = Math.ceil(entryNo / perStage);
      const e = entries[i];
      const volume1 = Number(e.volume_1);
      const volume2 = Number(e.volume_2);
      const averageVolume = Number.isFinite(volume1) && Number.isFinite(volume2)
        ? (volume1 + volume2) / 2
        : null;

      await client.query(
        `INSERT INTO mixing.openness_entries
        (inspection_id, entry_no, stage_no, machine_name,
         weight, volume_1, volume_2, average_volume,
         apparent_specific_volume, actual_op_value,
         beater_type, beater_speed_rpm)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          inspectionId,
          entryNo,
          stageNo,
          e.machine_name,
          e.weight,
          e.volume_1,
          e.volume_2,
          averageVolume,
          e.apparent_specific_volume,
          e.actual_op_value,
          e.beater_type,
          e.beater_speed_rpm
        ]
      );
    }

    const persistedInspection = await persistMixingEntryId(
      'mixing.openness_inspection',
      'openness',
      inspectionResult.rows[0]
    );

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
      entry_id: persistedInspection.entry_id || formatScreenEntryId('openness', inspectionId),
      br_line_no: persistedInspection.br_line_no,
      ticket
    });

  } catch (error) {
    await client.query('ROLLBACK');
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

    const inspections = await client.query(
      `SELECT *
       FROM mixing.openness_inspection
       ORDER BY inspection_date DESC`
    );

    const result = [];

    for (const ins of inspections.rows) {

      const entries = await client.query(
        `SELECT entry_no, stage_no, machine_name,
                weight, volume_1, volume_2, average_volume,
                apparent_specific_volume, actual_op_value,
                beater_type, beater_speed_rpm
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

      const inspectionRow = withScreenEntryId('openness', ins);
      const overallRow = overall.rows[0] || null;

      const numericValues = (key) => entries.rows
        .map((row) => Number(row[key]))
        .filter((value) => Number.isFinite(value));
      const average = (values) => values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

      result.push({
        ...inspectionRow,
        entries: entries.rows,
        stage_stats: stageStats.rows,
        overall_avg_weight: average(numericValues('weight')),
        overall_avg_volume: average(numericValues('average_volume')),
        overall_avg_apparent_specific_volume: overallRow?.avg_apparent_specific_volume ?? null,
        overall_avg_actual_op_value: overallRow?.avg_actual_op_value ?? null,
        overall_max_actual_op_value: overallRow?.max_actual_op_value ?? null,
        overall_min_actual_op_value: overallRow?.min_actual_op_value ?? null,
        overall_range_actual_op_value: overallRow?.range_actual_op_value ?? null,
        overall_sd_actual_op_value: overallRow?.sd_actual_op_value ?? null,
        overall_cv_actual_op_value: overallRow?.cv_actual_op_value ?? null,
        inspection: inspectionRow,
        overall: overallRow
      });
    }

    res.status(200).json(result);

  } catch (error) {
    next(error);
  }
});

router.post('/qc', async (req, res, next) => {
  try {
    await ensureMixingEntryIdColumns();
    const {
      consignee_name,
      count_name,
      creation_date,
      status = 'UNDONE',
      blends
    } = req.body;

    const entry_id = await resolveOrCreateProcessParameterEntryId(req.body.entry_id, { forceNew: req.body.force_new === true || req.body.force_new === 'true' });

    const conflictingCountName = await getCountNameConflict(entry_id, count_name);
    if (conflictingCountName) {
      return res.status(409).json({ message: `This PP id (${entry_id}) already uses count name "${conflictingCountName}". All sub-departments under a PP id must use the same count name.` });
    }

    const headerResult = await client.query(
      `INSERT INTO mixing.mixing_qc_header
      (entry_id, consignee_name, count_name, creation_date, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING qc_id, param_id, entry_id`,
      [entry_id, consignee_name, count_name, creation_date, status]
    );

    const qc_id = headerResult.rows[0].qc_id;

    for (const b of (blends || []).filter(hasBlendData)) {
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

    recordPpNotebookSubmission({
      notebook: 'Mixing QC Header',
      department: 'Mixing',
      entryId: entry_id,
      sourceSchema: 'mixing',
      sourceTable: 'mixing_qc_header',
      sourceRecordId: String(qc_id),
      submittedByUserId: req.user?.id,
      submittedByName: req.user?.employee_id,
      submittedPayload: { count_name, consignee_name, creation_date }
    }).catch((err) => console.warn('[pp-notebook-log] Mixing QC Header failed:', err.message));

    res.status(201).json({
      message: 'Mixing QC created successfully',
      qc_id,
      entry_id,
      process_parameter_id: entry_id,
      param_id: headerResult.rows[0].param_id
    });

  } catch (error) {
    next(error);
  }
});

router.get('/qc', async (req, res, next) => {
  try {
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
    next(error);
  }
});

router.put('/qc/:qc_id', async (req, res, next) => {
  try {
    const { qc_id } = req.params;

    const {
      consignee_name,
      count_name,
      creation_date,
      status,
      blends
    } = req.body;

    await client.query(
      `UPDATE mixing.mixing_qc_header
       SET consignee_name = $1,
           count_name = $2,
           creation_date = $3,
           status = $4
       WHERE qc_id = $5`,
      [consignee_name, count_name, creation_date, status, qc_id]
    );

    await client.query(
      `DELETE FROM mixing.mixing_qc_blends
       WHERE qc_id = $1`,
      [qc_id]
    );

    for (const b of (blends || []).filter(hasBlendData)) {
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

    const updated = await client.query(
      `SELECT qc_id, entry_id FROM mixing.mixing_qc_header WHERE qc_id = $1`,
      [qc_id]
    );

    res.status(200).json({
      message: 'Mixing QC updated successfully',
      qc_id,
      entry_id: updated.rows[0]?.entry_id,
      process_parameter_id: updated.rows[0]?.entry_id
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
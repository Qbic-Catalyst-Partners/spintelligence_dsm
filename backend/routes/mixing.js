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

const SCREEN_ID_PREFIXES = {
  cotton_hvi: 'CH',
  fibre: 'FB',
  afis: 'AF',
  moisture: 'MO',
  openness: 'OP'
  // qc (Process Parameter) intentionally has no prefix here — it must only ever surface
  // the real, stored PP-000n entry_id, never a synthesized fallback id, since a fabricated
  // id collides with the shared Process Parameter scheme.
};

const MIXING_NOTEBOOK_SLUGS = [
  'cotton-hvi',
  'fibre',
  'afis',
  'moisture',
  'openness',
  'qc'
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
       MAX(CAST(l.pidate AS DATE)) AS invoice_date
     FROM dbo.lotmaster l
     LEFT JOIN dbo.variety v ON l.varcode = v.varcode
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
    invoice_date: toDateOnly(row.invoice_date)
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
        invoice_date: lot.invoice_date
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
    ALTER TABLE mixing.afis_data_entry
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS afis_data_entry_entry_id_uq
    ON mixing.afis_data_entry (entry_id)
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
    ALTER TABLE mixing.openness_inspection
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
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
      colour_grade
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
        numericValues.colour_grade
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
    const {
      inspection_date,
      mixing,
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
      (inspection_date, mixing, actual_specific_volume_target, no_of_entries)
      VALUES ($1,$2,$3,$4)
      RETURNING id`,
      [
        inspection_date,
        mixing,
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

      await client.query(
        `INSERT INTO mixing.openness_entries
        (inspection_id, entry_no, stage_no, machine_name,
         weight, volume_1, volume_2,
         apparent_specific_volume, actual_op_value)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          inspectionId,
          entryNo,
          stageNo,
          e.machine_name,
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
      entry_id: formatScreenEntryId('openness', inspectionId),
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
    const {
      entry_id,
      consignee_name,
      count_name,
      creation_date,
      status = 'UNDONE',
      blends
    } = req.body;

    // 1?????? Insert Header
    const headerResult = await client.query(
      `INSERT INTO mixing.mixing_qc_header
      (entry_id, consignee_name, count_name, creation_date, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING qc_id, entry_id, param_id`,
      [entry_id || null, consignee_name, count_name, creation_date, status]
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
    const { page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT
        h.qc_id,
        h.entry_id,
        h.param_id,
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
    const { qc_id } = req.params;

    const {
      entry_id,
      consignee_name,
      count_name,
      creation_date,
      status,
      blends
    } = req.body;

    const currentResult = await client.query(
      `SELECT entry_id FROM mixing.mixing_qc_header WHERE qc_id = $1`,
      [qc_id]
    );

    if (currentResult.rowCount === 0) {
      return res.status(404).json({ message: 'Mixing QC entry not found' });
    }

    const requestedEntryId = String(entry_id || '').trim();
    const currentEntryId = String(currentResult.rows[0].entry_id || '').trim();

    let targetQcId = qc_id;
    let createdNewRow = false;

    if (requestedEntryId && requestedEntryId !== currentEntryId) {
      const insertResult = await client.query(
        `INSERT INTO mixing.mixing_qc_header
         (entry_id, consignee_name, count_name, creation_date, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING qc_id, entry_id, param_id`,
        [requestedEntryId, consignee_name, count_name, creation_date, status]
      );
      targetQcId = insertResult.rows[0].qc_id;
      createdNewRow = true;
    } else {
      // 1?????? Update Header
      await client.query(
        `UPDATE mixing.mixing_qc_header
         SET consignee_name = $1,
             count_name = $2,
             creation_date = $3,
             status = $4
         WHERE qc_id = $5`,
        [consignee_name, count_name, creation_date, status, qc_id]
      );

      // 2?????? Delete old blends (simple approach)
      await client.query(
        `DELETE FROM mixing.mixing_qc_blends
         WHERE qc_id = $1`,
        [qc_id]
      );
    }

    // 3?????? Insert new blends
    for (const b of blends) {
      await client.query(
        `INSERT INTO mixing.mixing_qc_blends
        (qc_id, blend_no, percentage, lot_no, cut_length, tenacity, elongation, merge_no)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          targetQcId,
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

    res.status(createdNewRow ? 201 : 200).json({
      message: createdNewRow ? 'Mixing QC created successfully' : 'Mixing QC updated successfully',
      qc_id: targetQcId,
      entry_id: requestedEntryId || currentEntryId
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;


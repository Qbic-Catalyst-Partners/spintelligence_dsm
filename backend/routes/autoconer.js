const express = require('express');
const router = express.Router();
const client = require('../connection');
const sqlServer = require('../config/sqlserver');
const { createEmployeeMasterDropdown } = require('../utils/employeeMaster');
const { resolveOrCreateProcessParameterEntryId, getCountNameConflict } = require('../utils/processParameterEntryId');
const { recordPpNotebookSubmission } = require('./submittedNotebooks.routes');
const SCREEN_ID_PREFIXES = {
  // process/q2/q3 (Process Parameter screens) intentionally have no prefix here — they
  // must only ever surface the real, stored PP-000n entry_id, never a synthesized fallback
  // id, since a fabricated id collides with the shared Process Parameter scheme.
};

const AUTOCONER_SCREEN_SLUGS = [
  'q2',
  'q3',
  'pp-q2',
  'pp-q3',
  'ppq2',
  'ppq3',
  'pp-autoconer-q2',
  'pp-autoconer-q3',
  'ppautoconerq2',
  'ppautoconerq3',
  'autoconer-q2',
  'autoconer-q3',
  'autoconerq2inspection',
  'autoconerq3inspection',
  'inspection-data-entry',
  'inspectiondataentry',
  'splice-strength',
  'drum-wise',
  'count-wise-cuts',
  'lycra-checking',
  'cone-packing-audit',
  'cone-density',
  'conedensity',
  'cone-density-notebook',
  'conedensitynotebook'
];

const formatScreenEntryId = (screenKey, rawId) => {
  const prefix = SCREEN_ID_PREFIXES[screenKey];
  const numericId = Number(rawId);
  if (!prefix || !Number.isFinite(numericId)) return null;
  return `${prefix}-${String(Math.trunc(numericId)).padStart(4, '0')}`;
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
    `SELECT TOP 100
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

const getCountMasterDropdown = async (req, res, next) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const prefix = String(req.query.count_prefix || req.query.prefix || '').trim();
    const countOptions = await fetchCountMaster(prefix);
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
      source: 'sqlserver',
      table: 'Depot_CountMaster',
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

const normalizeConeDensityNotebookPayload = (body = {}) => {
  const payload = body && typeof body === 'object' ? body : {};
  const drums = Array.isArray(payload.drums)
    ? payload.drums
    : Array.isArray(payload.cone_readings)
      ? payload.cone_readings
      : [];

  return {
    entry_id: trimOrNull(payload.entry_id ?? payload.entryId),
    entry_date: toDateOnlyOrNull(payload.entry_date ?? payload.entryDate),
    type: trimOrNull(payload.type) || 'Cone Density Notebook',
    count_name: trimOrNull(payload.count_name ?? payload.countName),
    cntcode: trimOrNull(payload.cntcode ?? payload.cntCode),
    auto_coner_no: trimOrNull(payload.auto_coner_no ?? payload.autoConerNo),
    drum_from: toNumberOrNull(payload.drum_from ?? payload.drumFrom),
    drum_to: toNumberOrNull(payload.drum_to ?? payload.drumTo),
    cone_tip: trimOrNull(payload.cone_tip ?? payload.coneTip),
    remarks: trimOrNull(payload.remarks),
    drums
  };
};

const coneDensityDrumValues = (notebookId, drum = {}) => {
  const values = [
    notebookId,
    toNumberOrNull(drum.drum_no ?? drum.drumNo),
    toNumberOrNull(drum.base_dia_e_d1 ?? drum.baseDiaED1),
    toNumberOrNull(drum.nose_dia_e_d2 ?? drum.noseDiaED2),
    toNumberOrNull(drum.base_dia_i_d3 ?? drum.baseDiaID3),
    toNumberOrNull(drum.nose_dia_i_d4 ?? drum.noseDiaID4),
    toNumberOrNull(drum.slant_height_b1 ?? drum.slantHeightB1),
    toNumberOrNull(drum.vertical_height_b2 ?? drum.verticalHeightB2),
    toNumberOrNull(drum.cone_weight_gms ?? drum.coneWeightGms),
    toNumberOrNull(drum.volume_cm3 ?? drum.volumeCm3),
    toNumberOrNull(drum.density_gms_cm3 ?? drum.densityGmsCm3),
    toNumberOrNull(drum.gms_litre ?? drum.gmsLitre),
    toNumberOrNull(drum.winding_speed_m_min ?? drum.windingSpeedMMin),
    toNumberOrNull(drum.cn_tension ?? drum.cnTension),
    toNumberOrNull(drum.tensioner_rpm ?? drum.tensionerRpm),
    toNumberOrNull(drum.tensioner_force ?? drum.tensionerForce),
    toNumberOrNull(drum.n_cradle_pressure ?? drum.nCradlePressure),
    trimOrNull(drum.remarks)
  ];

  return values;
};

const ensureConeDensityNotebookTables = async () => {
  await client.query(`CREATE SCHEMA IF NOT EXISTS autoconer`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS autoconer.cone_density_notebook (
      id BIGSERIAL PRIMARY KEY,
      entry_id TEXT NOT NULL UNIQUE,
      entry_date DATE NOT NULL,
      type TEXT NOT NULL DEFAULT 'Cone Density Notebook',
      count_name TEXT,
      cntcode TEXT,
      auto_coner_no TEXT,
      drum_from INTEGER NOT NULL,
      drum_to INTEGER NOT NULL,
      cone_tip TEXT,
      remarks TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    ALTER TABLE autoconer.cone_density_notebook
      ADD COLUMN IF NOT EXISTS entry_id TEXT,
      ADD COLUMN IF NOT EXISTS entry_date DATE,
      ADD COLUMN IF NOT EXISTS type TEXT,
      ADD COLUMN IF NOT EXISTS count_name TEXT,
      ADD COLUMN IF NOT EXISTS cntcode TEXT,
      ADD COLUMN IF NOT EXISTS auto_coner_no TEXT,
      ADD COLUMN IF NOT EXISTS drum_from INTEGER,
      ADD COLUMN IF NOT EXISTS drum_to INTEGER,
      ADD COLUMN IF NOT EXISTS cone_tip TEXT,
      ADD COLUMN IF NOT EXISTS remarks TEXT,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS autoconer_cone_density_notebook_entry_id_uq
    ON autoconer.cone_density_notebook (entry_id)
    WHERE entry_id IS NOT NULL
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS autoconer_cone_density_notebook_entry_date_idx
    ON autoconer.cone_density_notebook (entry_date DESC, created_at DESC)
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS autoconer.cone_density_notebook_drums (
      id BIGSERIAL PRIMARY KEY,
      notebook_id BIGINT NOT NULL REFERENCES autoconer.cone_density_notebook(id) ON DELETE CASCADE,
      drum_no INTEGER NOT NULL,
      base_dia_e_d1 NUMERIC(18,4),
      nose_dia_e_d2 NUMERIC(18,4),
      base_dia_i_d3 NUMERIC(18,4),
      nose_dia_i_d4 NUMERIC(18,4),
      slant_height_b1 NUMERIC(18,4),
      vertical_height_b2 NUMERIC(18,4),
      cone_weight_gms NUMERIC(18,4),
      volume_cm3 NUMERIC(18,4),
      density_gms_cm3 NUMERIC(18,8),
      gms_litre NUMERIC(18,4),
      winding_speed_m_min NUMERIC(18,4),
      cn_tension NUMERIC(18,4),
      tensioner_rpm NUMERIC(18,4),
      tensioner_force NUMERIC(18,4),
      n_cradle_pressure NUMERIC(18,4),
      remarks TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (notebook_id, drum_no)
    )
  `);

  await client.query(`
    ALTER TABLE autoconer.cone_density_notebook_drums
      ADD COLUMN IF NOT EXISTS notebook_id BIGINT,
      ADD COLUMN IF NOT EXISTS drum_no INTEGER,
      ADD COLUMN IF NOT EXISTS base_dia_e_d1 NUMERIC(18,4),
      ADD COLUMN IF NOT EXISTS nose_dia_e_d2 NUMERIC(18,4),
      ADD COLUMN IF NOT EXISTS base_dia_i_d3 NUMERIC(18,4),
      ADD COLUMN IF NOT EXISTS nose_dia_i_d4 NUMERIC(18,4),
      ADD COLUMN IF NOT EXISTS slant_height_b1 NUMERIC(18,4),
      ADD COLUMN IF NOT EXISTS vertical_height_b2 NUMERIC(18,4),
      ADD COLUMN IF NOT EXISTS cone_weight_gms NUMERIC(18,4),
      ADD COLUMN IF NOT EXISTS volume_cm3 NUMERIC(18,4),
      ADD COLUMN IF NOT EXISTS density_gms_cm3 NUMERIC(18,8),
      ADD COLUMN IF NOT EXISTS gms_litre NUMERIC(18,4),
      ADD COLUMN IF NOT EXISTS winding_speed_m_min NUMERIC(18,4),
      ADD COLUMN IF NOT EXISTS cn_tension NUMERIC(18,4),
      ADD COLUMN IF NOT EXISTS tensioner_rpm NUMERIC(18,4),
      ADD COLUMN IF NOT EXISTS tensioner_force NUMERIC(18,4),
      ADD COLUMN IF NOT EXISTS n_cradle_pressure NUMERIC(18,4),
      ADD COLUMN IF NOT EXISTS remarks TEXT,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS autoconer_cone_density_notebook_drums_notebook_drum_uq
    ON autoconer.cone_density_notebook_drums (notebook_id, drum_no)
  `);
};

const coneDensitySelect = `
  SELECT
    n.*,
    COALESCE(
      (
        SELECT json_agg(
          jsonb_build_object(
            'drum_no', d.drum_no,
            'base_dia_e_d1', d.base_dia_e_d1,
            'nose_dia_e_d2', d.nose_dia_e_d2,
            'base_dia_i_d3', d.base_dia_i_d3,
            'nose_dia_i_d4', d.nose_dia_i_d4,
            'slant_height_b1', d.slant_height_b1,
            'vertical_height_b2', d.vertical_height_b2,
            'cone_weight_gms', d.cone_weight_gms,
            'volume_cm3', d.volume_cm3,
            'density_gms_cm3', d.density_gms_cm3,
            'gms_litre', d.gms_litre,
            'winding_speed_m_min', d.winding_speed_m_min,
            'cn_tension', d.cn_tension,
            'tensioner_rpm', d.tensioner_rpm,
            'tensioner_force', d.tensioner_force,
            'n_cradle_pressure', d.n_cradle_pressure,
            'remarks', d.remarks
          )
          ORDER BY d.drum_no ASC, d.id ASC
        )
        FROM autoconer.cone_density_notebook_drums d
        WHERE d.notebook_id = n.id
      ),
      '[]'
    ) AS drums
  FROM autoconer.cone_density_notebook n
`;

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

const ensureInspectionDataEntryTables = async () => {
  const entryExistsResult = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'autoconer'
        AND table_name = 'inspection_data_entry'
    ) AS exists
  `);
  const readingsExistsResult = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'autoconer'
        AND table_name = 'inspection_data_entry_readings'
    ) AS exists
  `);

  if (!entryExistsResult.rows[0].exists) {
    await client.query(`
      CREATE TABLE autoconer.inspection_data_entry (
        id SERIAL PRIMARY KEY,
        entry_id VARCHAR(50) NOT NULL UNIQUE,
        entry_date DATE NOT NULL,
        type VARCHAR(100) NOT NULL DEFAULT 'Rewinding Study',
        count_name VARCHAR(255) NOT NULL,
        actual_count NUMERIC(12, 4) NOT NULL,
        auto_coner_no VARCHAR(100) NOT NULL,
        cone_tip VARCHAR(255) NOT NULL,
        no_of_cuts INTEGER NOT NULL DEFAULT 0,
        break_per_million_meter NUMERIC(14, 4) NOT NULL DEFAULT 0,
        remarks TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  if (!readingsExistsResult.rows[0].exists) {
    await client.query(`
      CREATE TABLE autoconer.inspection_data_entry_readings (
        id SERIAL PRIMARY KEY,
        inspection_data_entry_id INTEGER NOT NULL REFERENCES autoconer.inspection_data_entry(id) ON DELETE CASCADE,
        drum_no INTEGER,
        no_of_cones INTEGER,
        fault_name VARCHAR(255),
        no_of_faults INTEGER,
        percent_fault NUMERIC(14, 4),
        weight NUMERIC(14, 4),
        length_meters NUMERIC(14, 4)
      )
    `);
  }

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_inspection_data_entry_entry_date
      ON autoconer.inspection_data_entry (entry_date DESC, created_at DESC)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_inspection_data_entry_readings_parent
      ON autoconer.inspection_data_entry_readings (inspection_data_entry_id)
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

const ensureAutoconerEntryIdColumns = async () => {
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
};

// When one of Q2/Q3 is submitted for a PP id, the other is required too, so it
// gets auto-submitted with all measurement fields defaulted to 0 unless it has
// already been saved for that entry_id.
const autoFillSiblingAutoconerInspection = async ({ entry_id, count_name, consignee_name, creation_date, source }) => {
  const sibling = source === 'q2'
    ? { table: 'autoconer.autoconer_q3_inspection', screen: 'q3', numericColumns: [
        'nsl1', 'nsl2', 'nsl3', 'nsl4', 'nsl5', 'nsl6', 'nsl7',
        't1', 't2', 't3', 't4', 't5',
        'pf_sensing', 'pf_no_of_periods',
        'oc', 'cp', 'cm', 'ccp1', 'ccp2', 'ccm1', 'ccm2',
        'jp1', 'jp2', 'jp3', 'jp4', 'jp5', 'jp6', 'jp7',
        'jp_clearing', 'jp_u_percent', 'jp_jm',
        'fd1', 'fd2', 'fd3', 'fd4', 'fd5', 'fd6',
        'reference_length', 'suction', 'measurement', 'upper_limit', 'lower_limit',
      ], textColumns: ['action', 'suction_status', 'blocking'] }
    : { table: 'autoconer.autoconer_q2_inspection', screen: 'q2', numericColumns: [
        'n_value', 's_value', 'l_value',
        'lh1', 'lh2', 'lh3', 'lh4', 'lh5', 'lh6',
        'tht', 'th1', 'th2', 'th3', 'th4', 'th5', 'th6',
        'cp', 'cm', 'ccp', 'ccm', 'pc',
        'fault_distance', 'no_of_faults', 'jp', 'jm', 'up', 'fl',
        'flh1', 'flh2', 'flh3', 'flh4',
        'fd', 'fdh1', 'fdh2', 'fdh3', 'fdh4', 'fdh5',
        'reference_length', 'measurement', 'upper_alarm_limit', 'lower_alarm_limit',
      ], textColumns: ['action'] };

  const existing = await client.query(
    `SELECT id FROM ${sibling.table} WHERE entry_id = $1`,
    [entry_id]
  );
  if (existing.rowCount > 0) return null;

  const columns = ['entry_id', 'count_name', 'consignee_name', 'creation_date', ...sibling.numericColumns, ...sibling.textColumns];
  const values = [
    entry_id, count_name, consignee_name, creation_date,
    ...sibling.numericColumns.map(() => 0),
    ...sibling.textColumns.map(() => null),
  ];
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');

  const result = await client.query(
    `INSERT INTO ${sibling.table} (${columns.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (entry_id) WHERE entry_id IS NOT NULL DO NOTHING
     RETURNING *`,
    values
  );

  return result.rows[0] ? withScreenEntryId(sibling.screen, result.rows[0]) : null;
};

const createProcessParameterEntry = async (req, res, next) => {
  try {
    await ensureAutoconerEntryIdColumns();
    const data = req.body;
    const entry_id = await resolveOrCreateProcessParameterEntryId(data.entry_id, { forceNew: data.force_new === true || data.force_new === 'true' });

    if (!data.count_name || !data.consignee_name || !data.creation_date) {
      return res.status(400).json({
        message: 'count_name, consignee_name and creation_date are required'
      });
    }

    const conflictingCountName = await getCountNameConflict(entry_id, data.count_name);
    if (conflictingCountName) {
      return res.status(409).json({ message: `This PP id (${entry_id}) already uses count name "${conflictingCountName}". All sub-departments under a PP id must use the same count name.` });
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
        entry_id,
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

    recordPpNotebookSubmission({
      notebook: 'Autoconer Process Parameter',
      department: 'Autoconer',
      entryId: entry_id,
      sourceSchema: 'autoconer',
      sourceTable: 'autoconer_process_parameter',
      submittedByUserId: req.user?.id,
      submittedByName: req.user?.employee_id,
      submittedPayload: { count_name: data.count_name, consignee_name: data.consignee_name, creation_date: data.creation_date }
    }).catch((err) => console.warn('[pp-notebook-log] Autoconer Process Parameter failed:', err.message));

    res.status(201).json({
      message: 'Autoconer entry created successfully',
      data: { ...result.rows[0], entry_id },
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
};

const listProcessParameterEntries = async (req, res, next) => {
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
      data: result.rows,
      total: parseInt(totalResult.rows[0].count),
      page: pageNum,
      limit: limitNum
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
};

const updateProcessParameterEntry = async (req, res, next) => {
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
      data: result.rows[0],
      entry_id: result.rows[0].entry_id,
      process_parameter_id: result.rows[0].entry_id
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
};

router.post('/process', createProcessParameterEntry);
router.post('/process-parameter', createProcessParameterEntry);
router.post('/process_parameter', createProcessParameterEntry);
router.get('/process', listProcessParameterEntries);
router.get('/process-parameter', listProcessParameterEntries);
router.get('/process_parameter', listProcessParameterEntries);
router.put('/process/:id', updateProcessParameterEntry);
router.put('/process-parameter/:id', updateProcessParameterEntry);
router.put('/process_parameter/:id', updateProcessParameterEntry);

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
    const {
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
            (inspection_type, test_no, entry_date, lycra_draft,
             count_name, no_of_readings,
             lycra_weight, fabric_weight, total_weight, lycra_percent)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING id
        `, [
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
    const filterDate = req.query.date || new Date().toISOString().slice(0, 10);

    const result = await client.query(`
            SELECT
                i.*,

                -- Readings
                COALESCE(
                    (
                      SELECT json_agg(
                          jsonb_build_object(
                              'reading_no', r.reading_no,
                              'length_mm', r.length_mm,
                              'lycra_weight', r.lycra_weight,
                              'fabric_weight', r.fabric_weight,
                              'total_weight', r.total_weight,
                              'lycra_percent', r.lycra_percent
                          )
                      )
                      FROM autoconer.lycra_checking_readings r
                      WHERE r.inspection_id = i.id
                    ), '[]'
                ) AS readings,

                -- Summary
                (
                  SELECT json_build_object(
                      'avg_length', s.avg_length,
                      'lycra_weight', s.lycra_weight,
                      'fabric_weight', s.fabric_weight,
                      'total_weight', s.total_weight,
                      'lycra_percent', s.lycra_percent
                  )
                  FROM autoconer.lycra_checking_summary s
                  WHERE s.inspection_id = i.id
                ) AS summary

            FROM autoconer.lycra_checking_inspections i
            WHERE i.entry_date::date = $1::date
            ORDER BY i.created_at DESC
        `, [filterDate]);

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

const COUNT_WISE_CUTS_COLUMNS = [
  'inspection_type', 'entry_date', 'machine_no', 'count_name',
  'drum_from', 'drum_to', 'cone_tip', 'lot_no', 'frame_no',
  'yf', 'yj', 'n', 's', 'l', 't', 'cp', 'cm', 'ccp', 'ccm', 'pc', 'fd', 'jp', 'jm', 'cvd',
  'a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4', 'c1', 'c2', 'c3', 'c4', 'd1', 'd2', 'd3', 'd4',
  'e', 'f', 'g', 'h1', 'h2', 'l1', 'l2'
];

router.post('/count-wise-cuts', async (req, res) => {
  try {
    const data = {};
    for (const key of COUNT_WISE_CUTS_COLUMNS) {
      if (req.body[key] !== undefined) {
        data[key] = req.body[key];
      }
    }

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
    const {
      test_no,
      entry_date,
      type,
      machine_id,
      count_id,
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

    const drumWiseResult = await client.query(
      `INSERT INTO autoconer.drum_wise
            (test_no, entry_date, type, machine_id, count_id, machine_code, count_name, drum_from, drum_to, remarks)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id`,
      [test_no, entry_date, type, machine_id ?? null, count_id ?? null, machine_code ?? null, count_name ?? null, drum_from, drum_to, remarks]
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const dataQuery = `
            SELECT
                dw.id,
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
                        )
                    ) FILTER (WHERE di.id IS NOT NULL),
                    '[]'
                ) AS drum_inspections
            FROM autoconer.drum_wise dw
            LEFT JOIN autoconer.machine m ON dw.machine_id = m.id
            LEFT JOIN autoconer.count_master cm ON dw.count_id = cm.id
            LEFT JOIN autoconer.drum_inspection di ON dw.id = di.drum_wise_id
            LEFT JOIN autoconer.v_drum_summary vds ON dw.id = vds.drum_wise_id AND di.drum_no = vds.drum_no
            GROUP BY dw.id, dw.machine_code, dw.count_name, m.machine_code, cm.count_name
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
    const {
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

    await client.query('BEGIN');

    const inspectionResult = await client.query(
      `INSERT INTO autoconer.inspections
            (type, test_no, inspection_date, count_name, auto_coner_no, drum_from, drum_to, cone_tip, csp_value, average)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id`,
      [type, test_no, inspection_date, count_name, auto_coner_no, drum_from, drum_to, cone_tip, csp_value, average]
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
    console.error('Error creating inspection:', err);
    res.status(500).json({ message: 'Server error' });
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
                    (
                      SELECT json_agg(
                        json_build_object(
                          'drum_no', d.drum_no,
                          'reading_number', d.reading_number,
                          'splice_strength', d.splice_strength,
                          'parent_yarn', d.parent_yarn,
                          'percent_yarn', d.percent_yarn
                        )
                      )
                      FROM autoconer.drum_readings d
                      WHERE d.inspection_id = i.id
                    ),
                    '[]'
                ) AS drum_readings
            FROM autoconer.inspections i
            LEFT JOIN autoconer.inspection_summary s ON i.id = s.id
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

router.post('/cone-density-notebook', async (req, res) => {
  try {
    await ensureConeDensityNotebookTables();
    const data = normalizeConeDensityNotebookPayload(req.body);

    if (!data.entry_id || !data.entry_date || !data.drum_from || !data.drum_to) {
      return res.status(400).json({
        message: 'entry_id, entry_date, drum_from and drum_to are required'
      });
    }

    if (data.drum_to < data.drum_from) {
      return res.status(400).json({ message: 'drum_to must be greater than or equal to drum_from' });
    }

    if (!data.drums.length) {
      return res.status(400).json({ message: 'At least one drum reading is required' });
    }

    const invalidDrum = data.drums.find((drum) => {
      const drumNo = toNumberOrNull(drum.drum_no ?? drum.drumNo);
      return !drumNo || drumNo < data.drum_from || drumNo > data.drum_to;
    });

    if (invalidDrum) {
      return res.status(400).json({
        message: 'Each drum must have a valid drum_no within drum_from and drum_to'
      });
    }

    await client.query('BEGIN');

    const notebookResult = await client.query(
      `INSERT INTO autoconer.cone_density_notebook
        (entry_id, entry_date, type, count_name, cntcode, auto_coner_no, drum_from, drum_to, cone_tip, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        data.entry_id,
        data.entry_date,
        data.type,
        data.count_name,
        data.cntcode,
        data.auto_coner_no,
        data.drum_from,
        data.drum_to,
        data.cone_tip,
        data.remarks
      ]
    );

    const notebookId = notebookResult.rows[0].id;
    for (const drum of data.drums) {
      await client.query(
        `INSERT INTO autoconer.cone_density_notebook_drums (
          notebook_id, drum_no,
          base_dia_e_d1, nose_dia_e_d2, base_dia_i_d3, nose_dia_i_d4,
          slant_height_b1, vertical_height_b2, cone_weight_gms,
          volume_cm3, density_gms_cm3, gms_litre,
          winding_speed_m_min, cn_tension, tensioner_rpm, tensioner_force,
          n_cradle_pressure, remarks
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        coneDensityDrumValues(notebookId, drum)
      );
    }

    const saved = await client.query(
      `${coneDensitySelect}
       WHERE n.id = $1
       GROUP BY n.id`,
      [notebookId]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Cone density notebook created successfully',
      data: saved.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) {
      return res.status(409).json({ message: 'Duplicate entry_id or drum_no. Please use unique values.' });
    }
    console.error('Error creating cone density notebook:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/cone-density-notebook', async (req, res) => {
  try {
    await ensureConeDensityNotebookTables();
    const fetchAll = String(req.query.all || '').toLowerCase() === 'true';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const dataQueryBase = `
      ${coneDensitySelect}
      GROUP BY n.id
      ORDER BY n.entry_date DESC, n.created_at DESC
    `;
    const dataResult = fetchAll
      ? await client.query(dataQueryBase)
      : await client.query(`${dataQueryBase} LIMIT $1 OFFSET $2`, [limit, offset]);
    const countResult = await client.query(`SELECT COUNT(*) FROM autoconer.cone_density_notebook`);
    const total = parseInt(countResult.rows[0].count);

    return res.json({
      page: fetchAll ? 1 : page,
      limit: fetchAll ? total : limit,
      total,
      totalPages: fetchAll ? 1 : Math.ceil(total / limit),
      data: dataResult.rows
    });
  } catch (err) {
    console.error('Error fetching cone density notebooks:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/cone-density-notebook/:id', async (req, res) => {
  try {
    await ensureConeDensityNotebookTables();
    const id = parseInt(req.params.id);

    if (!id || id <= 0) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    const result = await client.query(
      `${coneDensitySelect}
       WHERE n.id = $1
       GROUP BY n.id`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Cone density notebook not found' });
    }

    return res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('Error fetching cone density notebook:', err);
    return res.status(500).json({ message: 'Server error' });
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
    await ensureInspectionDataEntryTables();
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
    res.status(201).json({ message: 'Inspection data entry created successfully', inspection_data_entry_id });
  } catch (err) {
    await client.query('ROLLBACK');
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
    await ensureInspectionDataEntryTables();
    const fetchAll = String(req.query.all || '').toLowerCase() === 'true';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const dataQueryBase = `
      SELECT
        ide.*,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'drum_no', r.drum_no,
                'no_of_cones', r.no_of_cones,
                'fault_name', r.fault_name,
                'no_of_faults', r.no_of_faults,
                'percent_fault', r.percent_fault,
                'weight', r.weight,
                'length_meters', r.length_meters
              )
            )
            FROM autoconer.inspection_data_entry_readings r
            WHERE r.inspection_data_entry_id = ide.id
          ),
          '[]'
        ) AS readings
      FROM autoconer.inspection_data_entry ide
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
    const {
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
            (test_no, entry_date, type, machine_name, count_name, cone_tip, base_dia_e, nose_dia_e, drum_from, drum_to, weight, no_of_cuts, remarks)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            RETURNING id`,
      [test_no, entry_date, type, machine_name, count_name, cone_tip, base_dia_e, nose_dia_e, drum_from, drum_to, weight, no_of_cuts, remarks]
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
    const fetchAll = String(req.query.all || '').toLowerCase() === 'true';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const dataQueryBase = `
            SELECT
                cd.*,
                COALESCE(
                    (
                      SELECT json_agg(
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
                        )
                      )
                      FROM autoconer.cone_density_readings cdr
                      WHERE cdr.cone_density_id = cd.id
                    ),
                    '[]'
                ) AS readings
            FROM autoconer.cone_density cd
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
    SELECT DISTINCT count_name
    FROM autoconer.autoconer_process_parameter
    WHERE count_name IS NOT NULL AND BTRIM(count_name) <> ''
    ORDER BY count_name
  `;

  const autoconerNoQuery = `
    SELECT DISTINCT machine_no AS autoconer_no
    FROM autoconer.autoconer_process_parameter
    WHERE machine_no IS NOT NULL AND BTRIM(machine_no) <> ''
    ORDER BY machine_no
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
    const {
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
            (inspection_date, packed_date, count_name, gross_weight_std, gross_weight_actual,
             box_colour, cone_colour, gum_tape_colour, count_label, cone_damage,
             cover_missing, cone_hardness, stap_cone, disk, barcode, center_pad,
             net_weight, tare_weight, strap_colour)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
            RETURNING id`,
      [
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
    console.error('Error creating cone packing audit:', err);
    res.status(500).json({ message: 'Server error' });
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const dataQuery = `
            SELECT
                cpa.*,
                COALESCE(
                    (
                      SELECT json_agg(
                        jsonb_build_object(
                          'drum_no', de.drum_no,
                          'gross_weight', de.gross_weight,
                          'average', de.average
                        )
                        ORDER BY de.drum_no ASC, de.id ASC
                      )
                      FROM autoconer.drum_entries de
                      WHERE de.audit_id = cpa.id
                    ),
                    '[]'
                ) AS drum_entries,
                COALESCE(
                    (
                      SELECT json_agg(
                        jsonb_build_object(
                          'reading_number', yr.reading_number,
                          'percent_yarn', yr.percent_yarn
                        )
                        ORDER BY yr.reading_number ASC, yr.id ASC
                      )
                      FROM autoconer.yarn_readings yr
                      WHERE yr.audit_id = cpa.id
                    ),
                    '[]'
                ) AS yarn_readings
            FROM autoconer.cone_packing_audit cpa
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
    const data = req.body;

    let phase = 'pending';

    const hasCSP = data.act_count != null || data.strength != null;
    const hasQuality = data.cone_color != null || data.u != null;

    if (hasCSP && hasQuality) phase = 'completed';
    else if (hasCSP) phase = 'csp_entered';
    else if (hasQuality) phase = 'quality_entered';

    const result = await client.query(
      `INSERT INTO autoconer.parameter_entries (
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
        $4,$5,$6,$7,$8,
        $9,$10,$11,
        $12,$13,$14,$15,$16,
        $17,$18,$19,$20,
        $21,$22,$23,$24,$25,
        $26,$27,
        $28,$29
      )
      RETURNING *`,
      [
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
        data.entry_id || null,
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

    const currentResult = await client.query(
      `SELECT entry_id FROM autoconer.autoconer_process_parameter WHERE id = $1`,
      [id]
    );

    if (currentResult.rowCount === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    const requestedEntryId = String(data.entry_id || '').trim();
    const currentEntryId = String(currentResult.rows[0].entry_id || '').trim();

    if (requestedEntryId && requestedEntryId !== currentEntryId) {
      const insertResult = await client.query(
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
          requestedEntryId,
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

      return res.status(201).json({
        message: 'Autoconer entry created successfully',
        data: withScreenEntryId('process', insertResult.rows[0])
      });
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
    const entry_id = await resolveOrCreateProcessParameterEntryId(data.entry_id, { forceNew: data.force_new === true || data.force_new === 'true' });

    if (!data.count_name || !data.consignee_name || !data.creation_date) {
      return res.status(400).json({
        message: 'count_name, consignee_name and creation_date are required'
      });
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
        entry_id,
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

    recordPpNotebookSubmission({
      notebook: 'Autoconer Q2 Inspection',
      department: 'Autoconer',
      entryId: entry_id,
      sourceSchema: 'autoconer',
      sourceTable: 'autoconer_q2_inspection',
      submittedByUserId: req.user?.id,
      submittedByName: req.user?.employee_id,
      submittedPayload: { count_name: data.count_name, consignee_name: data.consignee_name, creation_date: data.creation_date }
    }).catch((err) => console.warn('[pp-notebook-log] Autoconer Q2 Inspection failed:', err.message));

    const autoFilledQ3 = await autoFillSiblingAutoconerInspection({
      entry_id,
      count_name: data.count_name,
      consignee_name: data.consignee_name,
      creation_date: data.creation_date,
      source: 'q2'
    });
    if (autoFilledQ3) {
      recordPpNotebookSubmission({
        notebook: 'Autoconer Q3 Inspection',
        department: 'Autoconer',
        entryId: entry_id,
        sourceSchema: 'autoconer',
        sourceTable: 'autoconer_q3_inspection',
        submittedByUserId: req.user?.id,
        submittedByName: req.user?.employee_id,
        submittedPayload: { count_name: data.count_name, consignee_name: data.consignee_name, creation_date: data.creation_date, autoFilled: true }
      }).catch((err) => console.warn('[pp-notebook-log] Autoconer Q3 Inspection (auto-fill) failed:', err.message));
    }

    res.status(201).json({
      message: 'Q2 entry created successfully',
      data: withScreenEntryId('q2', result.rows[0]),
      entry_id,
      process_parameter_id: entry_id,
      auto_filled_q3: autoFilledQ3
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

    const currentResult = await client.query(
      `SELECT entry_id FROM autoconer.autoconer_q2_inspection WHERE id = $1`,
      [id]
    );

    if (currentResult.rowCount === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    const requestedEntryId = String(data.entry_id || '').trim();
    const currentEntryId = String(currentResult.rows[0].entry_id || '').trim();

    if (requestedEntryId && requestedEntryId !== currentEntryId) {
      const insertResult = await client.query(
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
          requestedEntryId,
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

      return res.status(201).json({
        message: 'Q2 entry created successfully',
        data: withScreenEntryId('q2', insertResult.rows[0])
      });
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
    const entry_id = await resolveOrCreateProcessParameterEntryId(data.entry_id, { forceNew: data.force_new === true || data.force_new === 'true' });

    if (!data.count_name || !data.consignee_name || !data.creation_date) {
      return res.status(400).json({
        message: 'count_name, consignee_name and creation_date are required'
      });
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
        entry_id,
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

    recordPpNotebookSubmission({
      notebook: 'Autoconer Q3 Inspection',
      department: 'Autoconer',
      entryId: entry_id,
      sourceSchema: 'autoconer',
      sourceTable: 'autoconer_q3_inspection',
      submittedByUserId: req.user?.id,
      submittedByName: req.user?.employee_id,
      submittedPayload: { count_name: data.count_name, consignee_name: data.consignee_name, creation_date: data.creation_date }
    }).catch((err) => console.warn('[pp-notebook-log] Autoconer Q3 Inspection failed:', err.message));

    const autoFilledQ2 = await autoFillSiblingAutoconerInspection({
      entry_id,
      count_name: data.count_name,
      consignee_name: data.consignee_name,
      creation_date: data.creation_date,
      source: 'q3'
    });
    if (autoFilledQ2) {
      recordPpNotebookSubmission({
        notebook: 'Autoconer Q2 Inspection',
        department: 'Autoconer',
        entryId: entry_id,
        sourceSchema: 'autoconer',
        sourceTable: 'autoconer_q2_inspection',
        submittedByUserId: req.user?.id,
        submittedByName: req.user?.employee_id,
        submittedPayload: { count_name: data.count_name, consignee_name: data.consignee_name, creation_date: data.creation_date, autoFilled: true }
      }).catch((err) => console.warn('[pp-notebook-log] Autoconer Q2 Inspection (auto-fill) failed:', err.message));
    }

    res.status(201).json({
      message: 'Q3 entry created successfully',
      data: withScreenEntryId('q3', result.rows[0]),
      entry_id,
      process_parameter_id: entry_id,
      auto_filled_q2: autoFilledQ2
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

    const currentResult = await client.query(
      `SELECT entry_id FROM autoconer.autoconer_q3_inspection WHERE id = $1`,
      [id]
    );

    if (currentResult.rowCount === 0) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    const requestedEntryId = String(data.entry_id || '').trim();
    const currentEntryId = String(currentResult.rows[0].entry_id || '').trim();

    if (requestedEntryId && requestedEntryId !== currentEntryId) {
      const insertResult = await client.query(
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
          requestedEntryId,
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

      return res.status(201).json({
        message: 'Q3 entry created successfully',
        data: withScreenEntryId('q3', insertResult.rows[0])
      });
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

module.exports = router;


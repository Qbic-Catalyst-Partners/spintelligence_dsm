const express = require('express');
const router = express.Router();
const client = require('../connection');
const sqlServer = require('../config/sqlserver');
const sqlServerPrep = require('../config/sqlserverPrep');
const { sendPrepVarietyDropdown } = require('../utils/prepVariety');
const { createEmployeeMasterDropdown } = require('../utils/employeeMaster');
const SCREEN_ID_PREFIXES = {
  sync: 'BS',
  drop_test: 'BD',
  br_waste_study: 'BW'
  // header (Process Parameter) intentionally has no prefix here — it must only ever
  // surface the real, stored PP-000n entry_id, never a synthesized fallback id, since a
  // fabricated id collides with the shared Process Parameter scheme.
};

const BLOWROOM_NOTEBOOK_SLUGS = [
  'sync',
  'drop-test',
  'br-waste-study'
];

const BLOWROOM_BR_MACHINES = [
  'BR 01(SB20)',
  'BR 02(TD 7-1)',
  'BR 03(TD 7-2)',
  'BR 04(TD 7-3)',
  'BR 05(TD 7-4)',
  'BR 06(TD 7-5)',
  'BR 07(TD 7-6)',
  'BR 08(TD 7-6)',
  'BR 09(TD 7-6)'
];

const getBlowroomBrMachineDropdown = async (req, res) => {
  const prefix = String(req.query.prefix || req.query.machine_prefix || req.query.q || '').trim().toLowerCase();
  const data = BLOWROOM_BR_MACHINES
    .filter((name) => !prefix || name.toLowerCase().includes(prefix))
    .map((name, index) => ({
      id: index + 1,
      machine_name: name,
      mc_name: name,
      label: name,
      text: name,
      value: name
    }));

  res.status(200).json({
    source: 'static',
    data,
    machines: data,
    machine_names: data.map((row) => row.machine_name),
    mc_names: data.map((row) => row.mc_name),
    values: data.map((row) => row.value),
    options: [
      { text: '-- Select MC Name --', value: '' },
      ...data
    ]
  });
};

const formatScreenEntryId = (screenKey, rawId) => {
  const prefix = SCREEN_ID_PREFIXES[screenKey];
  const numericId = Number(rawId);
  if (!prefix || !Number.isFinite(numericId)) return null;
  const width = 4;
  const separator = '-';
  return `${prefix}${separator}${String(Math.trunc(numericId)).padStart(width, '0')}`;
};

const withScreenEntryId = (screenKey, record, idField = 'id') => {
  if (!record || typeof record !== 'object') return record;
  if (record.entry_id) return { ...record };
  const entry_id = formatScreenEntryId(screenKey, record[idField]);
  return entry_id ? { ...record, entry_id } : { ...record };
};
const withProcessParameterId = (record) => {
  const row = record && typeof record === 'object' ? { ...record } : record;
  const storedId = String(row?.entry_id || '').trim();
  const paramId = storedId || formatScreenEntryId('header', row?.br_id);
  return {
    ...row,
    original_entry_id: row?.entry_id || null,
    entry_id: paramId,
    param_id: paramId,
    parameter_id: paramId,
    process_parameter_id: paramId,
    display_entry_id: paramId
  };
};
const withoutDropId = (record) => {
  if (!record || typeof record !== 'object') return record;
  const { drop_id, ...rest } = record;
  return rest;
};
const isUniqueViolation = (err) => err && err.code === '23505';

const getDropTestParentId = (body) => {
  const directId = String(body.drop_id || body.drop_test_id || '').trim();
  if (directId) return directId;

  const entryId = String(body.entry_id || '').trim();
  if (!entryId) return null;

  return entryId.replace(/-\d{1,2}$/, '');
};

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(String(value).replace(/,/g, '').replace(/%/g, '').trim());
  return Number.isFinite(numeric) ? numeric : null;
};

const toDecimal4OrNull = (value) => {
  const numeric = toNumberOrNull(value);
  return numeric === null ? null : Number(numeric.toFixed(4));
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;

  const dmyMatch = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text;
};

const percentOf = (part, total) => {
  const partNum = toNumberOrNull(part);
  const totalNum = toNumberOrNull(total);
  if (partNum === null || totalNum === null || totalNum === 0) return null;
  return Number(((partNum / totalNum) * 100).toFixed(4));
};

const normalizeWasteType = (value) => {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text || null;
};

const BR_WASTE_TYPE_CLEANUP_PREFIXES = ['fla', 'flat str', 'flat stri'];

const ensureBlowroomWasteTypeMasterTable = async () => {
  if (brWasteTypeMasterReady) return;

  await client.query(`CREATE SCHEMA IF NOT EXISTS blowroom;`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS blowroom.br_waste_type_master (
      id bigserial PRIMARY KEY,
      waste_type varchar(120) NOT NULL,
      waste_type_key varchar(120) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS br_waste_type_master_waste_type_key_uq
    ON blowroom.br_waste_type_master (waste_type_key);
  `);

  for (const prefix of BR_WASTE_TYPE_CLEANUP_PREFIXES) {
    await client.query(
      `DELETE FROM blowroom.br_waste_type_master
       WHERE LOWER(TRIM(waste_type)) = $1
          OR LOWER(TRIM(waste_type)) LIKE $2`,
      [prefix, `${prefix}%`]
    );
  }

  brWasteTypeMasterReady = true;
};

const upsertBlowroomWasteType = async (wasteType) => {
  await ensureBlowroomWasteTypeMasterTable();

  const normalizedWasteType = normalizeWasteType(wasteType);
  if (!normalizedWasteType) return null;
  if (normalizedWasteType.length < 5) return null;

  const wasteTypeKey = normalizedWasteType.toLowerCase();
  const result = await client.query(
    `INSERT INTO blowroom.br_waste_type_master (waste_type, waste_type_key)
     VALUES ($1, $2)
     ON CONFLICT (waste_type_key)
     DO UPDATE SET waste_type = EXCLUDED.waste_type
     RETURNING id, waste_type, waste_type_key, created_at`,
    [normalizedWasteType, wasteTypeKey]
  );

  return result.rows[0] || null;
};

const fetchBlowroomWasteTypes = async (prefix = '') => {
  await ensureBlowroomWasteTypeMasterTable();

  const result = await client.query(
    `SELECT id, waste_type, created_at
     FROM blowroom.br_waste_type_master
     WHERE ($1 = '' OR waste_type ILIKE $2)
     ORDER BY waste_type`,
    [prefix, `%${prefix}%`]
  );

  return result.rows || [];
};

let syncStatsReady = false;
let brWasteStudyReady = false;
let brWasteTypeMasterReady = false;

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

const getMasterVarieties = sendPrepVarietyDropdown(sqlServerPrep, 'blowroom');

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
    console.error('Error fetching blowroom count names from SQL Server:', error);
    next(error);
  }
};

const getBlowroomHeaderMasterDropdown = async (req, res, next) => {
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
    console.error('Error fetching blowroom header count dropdown from SQL Server:', error);
    next(error);
  }
};

const getEmployeeMasterDropdown = createEmployeeMasterDropdown(sqlServer, 'blowroom');

const getBlowroomWasteTypeDropdown = async (req, res, next) => {
  try {
    const prefix = String(req.query.prefix || req.query.q || req.query.waste_type || '').trim();
    const data = await fetchBlowroomWasteTypes(prefix);

    return res.status(200).json({
      source: 'postgres',
      table: 'blowroom.br_waste_type_master',
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

const ensureBlowroomEntryIdColumns = async () => {
  await client.query(`
    ALTER TABLE blowroom.blow_room_sync
      ADD COLUMN IF NOT EXISTS entry_id varchar(80);
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS blow_room_sync_entry_id_uq
    ON blowroom.blow_room_sync (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    ALTER TABLE blowroom.drop_test
      ADD COLUMN IF NOT EXISTS entry_id varchar(80);
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS drop_test_entry_id_uq
    ON blowroom.drop_test (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    ALTER TABLE blowroom.blowroom_header
      ADD COLUMN IF NOT EXISTS entry_id varchar(80);
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS blowroom_header_entry_id_uq
    ON blowroom.blowroom_header (entry_id)
    WHERE entry_id IS NOT NULL;
  `);
};

const ensureSyncStatsView = async () => {
  if (syncStatsReady) return;

  // Recreate view to avoid CREATE OR REPLACE column-rename errors
  // when a previous version exists with different column names.
  await client.query(`DROP VIEW IF EXISTS blowroom.sync_stats`);

  await client.query(`
    CREATE OR REPLACE VIEW blowroom.sync_stats AS
    SELECT
      sync_id,
      ROUND(AVG(value_a), 4) AS value_a_avg,
      MIN(value_a) AS value_a_min,
      MAX(value_a) AS value_a_max,
      ROUND(MAX(value_a) - MIN(value_a), 4) AS value_a_range,
      ROUND(AVG(value_b), 4) AS value_b_avg,
      MIN(value_b) AS value_b_min,
      MAX(value_b) AS value_b_max,
      ROUND(MAX(value_b) - MIN(value_b), 4) AS value_b_range,
      ROUND(AVG(value_c), 4) AS value_c_avg,
      MIN(value_c) AS value_c_min,
      MAX(value_c) AS value_c_max,
      ROUND(MAX(value_c) - MIN(value_c), 4) AS value_c_range,
      ROUND(AVG(sync_percentage), 4) AS sync_percentage_avg,
      MIN(sync_percentage) AS sync_percentage_min,
      MAX(sync_percentage) AS sync_percentage_max,
      ROUND(MAX(sync_percentage) - MIN(sync_percentage), 4) AS sync_percentage_range
    FROM blowroom.blow_room_sync_entries
    GROUP BY sync_id
  `);

  syncStatsReady = true;
};

const ensureBrWasteStudyTables = async () => {
  if (brWasteStudyReady) return;

  await client.query(`CREATE SCHEMA IF NOT EXISTS blowroom;`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS blowroom.br_waste_study (
      id bigserial PRIMARY KEY,
      entry_id varchar(80),
      waste_study_id varchar(80),
      date date NOT NULL,
      variety varchar(120),
      study_type varchar(20) NOT NULL CHECK (study_type IN ('Type 1', 'Type 2', 'Type 3')),
      carding_production_kg numeric(12,2),
      type_entries integer,
      waste_type varchar(120),
      waste_kg numeric(12,2),
      waste_percent numeric(8,2),
      overall_percent numeric(8,2),
      remarks text,
      entry_type varchar(120),
      created_at timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    ALTER TABLE blowroom.br_waste_study
      ADD COLUMN IF NOT EXISTS entry_id varchar(80),
      ADD COLUMN IF NOT EXISTS entry_type varchar(120),
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT NOW();
  `);

  await client.query(`
    ALTER TABLE blowroom.br_waste_study
      DROP COLUMN IF EXISTS lot_no;
  `);

  await client.query(`
    ALTER TABLE blowroom.br_waste_study
      ALTER COLUMN carding_production_kg TYPE numeric(12,4),
      ALTER COLUMN waste_kg TYPE numeric(12,4),
      ALTER COLUMN waste_percent TYPE numeric(12,4),
      ALTER COLUMN overall_percent TYPE numeric(12,4);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS blowroom.br_waste_study_type_rows (
      id bigserial PRIMARY KEY,
      study_id bigint NOT NULL REFERENCES blowroom.br_waste_study(id) ON DELETE CASCADE,
      row_no integer NOT NULL,
      cylinder_speed numeric(12,4),
      lickerin_speed numeric(12,4),
      flat_speed numeric(12,4),
      doffer_speed numeric(12,4),
      delivery_speed numeric(12,4),
      wing_setting_1 numeric(12,4),
      wing_setting_2 numeric(12,4),
      mc_no varchar(80),
      mc_production numeric(12,4),
      created_at timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    ALTER TABLE blowroom.br_waste_study_type_rows
      ALTER COLUMN cylinder_speed TYPE numeric(12,4),
      ALTER COLUMN lickerin_speed TYPE numeric(12,4),
      ALTER COLUMN flat_speed TYPE numeric(12,4),
      ALTER COLUMN doffer_speed TYPE numeric(12,4),
      ALTER COLUMN delivery_speed TYPE numeric(12,4),
      ALTER COLUMN wing_setting_1 TYPE numeric(12,4),
      ALTER COLUMN wing_setting_2 TYPE numeric(12,4),
      ALTER COLUMN mc_production TYPE numeric(12,4);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS blowroom.br_waste_study_waste_rows (
      id bigserial PRIMARY KEY,
      study_id bigint NOT NULL REFERENCES blowroom.br_waste_study(id) ON DELETE CASCADE,
      row_no integer NOT NULL,
      waste_type varchar(120),
      waste_kgs_value numeric(12,4),
      waste_kgs_percent numeric(12,4),
      created_at timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    ALTER TABLE blowroom.br_waste_study_waste_rows
      ALTER COLUMN waste_kgs_value TYPE numeric(12,4),
      ALTER COLUMN waste_kgs_percent TYPE numeric(12,4);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS br_waste_study_type_rows_study_id_idx
    ON blowroom.br_waste_study_type_rows (study_id);
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS br_waste_study_waste_rows_study_id_idx
    ON blowroom.br_waste_study_waste_rows (study_id);
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS br_waste_study_waste_study_id_uq
    ON blowroom.br_waste_study (waste_study_id)
    WHERE waste_study_id IS NOT NULL;
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS br_waste_study_entry_id_uq
    ON blowroom.br_waste_study (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  brWasteStudyReady = true;
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

router.get('/master/varieties', getMasterVarieties);
router.get('/master/dropdown', getMasterVarieties);
router.get('/master/counts', getCountMasterDropdown);
router.get('/master/count-dropdown', getCountMasterDropdown);
router.get('/master/count-names', getCountMasterDropdown);
router.get('/master/waste-types', getBlowroomWasteTypeDropdown);
router.get('/master/waste-type-dropdown', getBlowroomWasteTypeDropdown);
router.get('/master/machines', getBlowroomBrMachineDropdown);
router.get('/master/machine-names', getBlowroomBrMachineDropdown);
router.get('/master/mc-names', getBlowroomBrMachineDropdown);
router.get('/master/mc-nos', getBlowroomBrMachineDropdown);
router.get('/master/employees', getEmployeeMasterDropdown);
router.get('/master/employee-dropdown', getEmployeeMasterDropdown);
router.get('/master/employee-names', getEmployeeMasterDropdown);
router.get('/master/user-names', getEmployeeMasterDropdown);
router.get('/master/checked-by', getEmployeeMasterDropdown);
router.get('/master/checked-by-dropdown', getEmployeeMasterDropdown);
router.get('/master/checked-by-names', getEmployeeMasterDropdown);
router.get('/header/master/dropdown', getBlowroomHeaderMasterDropdown);
router.get('/header/master/counts', getCountMasterDropdown);
router.get('/header/master/count-dropdown', getCountMasterDropdown);
router.get('/header/master/count-names', getCountMasterDropdown);
router.get('/header/master/waste-types', getBlowroomWasteTypeDropdown);
router.get('/header/master/waste-type-dropdown', getBlowroomWasteTypeDropdown);
router.get('/header/master/employees', getEmployeeMasterDropdown);
router.get('/header/master/employee-dropdown', getEmployeeMasterDropdown);
router.get('/header/master/employee-names', getEmployeeMasterDropdown);
router.get('/header/master/checked-by', getEmployeeMasterDropdown);
router.get('/header/master/checked-by-dropdown', getEmployeeMasterDropdown);
router.get('/header/master/checked-by-names', getEmployeeMasterDropdown);

for (const notebookSlug of BLOWROOM_NOTEBOOK_SLUGS) {
  router.get(`/${notebookSlug}/master/varieties`, getMasterVarieties);
  router.get(`/${notebookSlug}/master/dropdown`, getMasterVarieties);
  router.get(`/${notebookSlug}/master/counts`, getCountMasterDropdown);
  router.get(`/${notebookSlug}/master/count-dropdown`, getCountMasterDropdown);
  router.get(`/${notebookSlug}/master/count-names`, getCountMasterDropdown);
  router.get(`/${notebookSlug}/master/waste-types`, getBlowroomWasteTypeDropdown);
  router.get(`/${notebookSlug}/master/waste-type-dropdown`, getBlowroomWasteTypeDropdown);
  router.get(`/${notebookSlug}/master/machines`, getBlowroomBrMachineDropdown);
  router.get(`/${notebookSlug}/master/machine-names`, getBlowroomBrMachineDropdown);
  router.get(`/${notebookSlug}/master/mc-names`, getBlowroomBrMachineDropdown);
  router.get(`/${notebookSlug}/master/mc-nos`, getBlowroomBrMachineDropdown);
  router.get(`/${notebookSlug}/master/employees`, getEmployeeMasterDropdown);
  router.get(`/${notebookSlug}/master/employee-dropdown`, getEmployeeMasterDropdown);
  router.get(`/${notebookSlug}/master/employee-names`, getEmployeeMasterDropdown);
  router.get(`/${notebookSlug}/master/checked-by`, getEmployeeMasterDropdown);
  router.get(`/${notebookSlug}/master/checked-by-dropdown`, getEmployeeMasterDropdown);
  router.get(`/${notebookSlug}/master/checked-by-names`, getEmployeeMasterDropdown);
}

router.post('/master/waste-types', async (req, res, next) => {
  try {
    const wasteType = req.body?.waste_type || req.body?.value || req.body?.text;
    const saved = await upsertBlowroomWasteType(wasteType);

    if (!saved) {
      return res.status(400).json({ message: 'waste_type is required' });
    }

    return res.status(201).json({
      message: 'Waste type saved successfully',
      data: saved
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * tags:
 *   - name: Blowroom
 *     description: Blowroom APIs
 */


/**
 * @swagger
 * /blowroom/sync:
 *   post:
 *     summary: Create Blowroom Sync Entry
 *     tags: [Blowroom]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entry_id
 *               - inspection_date
 *               - line_no
 *               - variety
 *               - checked_by
 *               - beater
 *               - total_time
 *               - entries
 *             properties:
 *               entry_id:
 *                 type: string
 *               inspection_date:
 *                 type: string
 *                 format: date
 *               line_no:
 *                 type: string
 *               variety:
 *                 type: string
 *               checked_by:
 *                 type: string
 *               beater:
 *                 type: string
 *               total_time:
 *                 type: string
 *                 example: "00:10:00"
 *               entries:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - value_a
 *                     - value_b
 *                     - value_c
 *                     - sync_percentage
 *                   properties:
 *                     value_a:
 *                       type: number
 *                       example: 10
 *                     value_b:
 *                       type: number
 *                       example: 20
 *                     value_c:
 *                       type: number
 *                       example: 30
 *                     sync_percentage:
 *                       type: number
 *                       example: 90
 *     responses:
 *       201:
 *         description: Sync created successfully
 *       500:
 *         description: Server error
 */

router.post('/sync', async (req, res, next) => {
  try {
    await ensureBlowroomEntryIdColumns();
    const {
      entry_id,
      inspection_date,
      line_no,
      variety,
      checked_by,
      beater,
      total_time,
      entries
    } = req.body;
    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    const syncRes = await client.query(
      `INSERT INTO blowroom.blow_room_sync
      (entry_id, inspection_date, line_no, variety, checked_by, beater, total_time, number_of_entries)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id`,
      [entry_id, inspection_date, line_no, variety, checked_by, beater, total_time, entries.length]
    );

    const syncId = syncRes.rows[0].id;

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];

      await client.query(
        `INSERT INTO blowroom.blow_room_sync_entries
        (sync_id, entry_no, value_a, value_b, value_c, sync_percentage)
        VALUES ($1,$2,$3,$4,$5,$6)`,
        [syncId, i + 1, e.value_a, e.value_b, e.value_c, e.sync_percentage]
      );
    }

    res.status(201).json({
      message: "Sync created",
      syncId,
      entry_id
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
 * /blowroom/sync:
 *   get:
 *     summary: Get Openness Data (Blowroom)
 *     tags: [Blowroom]
 *     responses:
 *       200:
 *         description: Data fetched successfully
 */

router.get('/sync', async (req, res, next) => {
  try {
    await ensureSyncStatsView();

    const result = await client.query(`
      SELECT s.*, st.*
      FROM blowroom.blow_room_sync s
      LEFT JOIN blowroom.sync_stats st
      ON s.id = st.sync_id
      ORDER BY s.inspection_date DESC
    `);

    res.json(result.rows.map((row) => withScreenEntryId('sync', row)));

  } catch (err) {
    next(err);
  }
});


/**
 * @swagger
 * /blowroom/drop-test:
 *   post:
 *     summary: Create a new Drop Test entry
 *     tags: [Blowroom]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entry_id
 *               - date
 *               - variety
 *               - tuft_no
 *               - display_weight
 *               - actual_weight
 *             properties:
 *               entry_id:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *               variety:
 *                 type: string
 *               blend:
 *                 type: string
 *               tuft_no:
 *                 type: integer
 *               tuft_variety:
 *                 type: string
 *               display_weight:
 *                 type: number
 *               actual_weight:
 *                 type: number
 *               difference:
 *                 type: number
 *               ratio_percent:
 *                 type: number
 *     responses:
 *       201:
 *         description: Drop test created successfully
 *       500:
 *         description: Server error
 */

router.post('/drop-test', async (req, res, next) => {
  try {
    await ensureBlowroomEntryIdColumns();

    const {
      entry_id,
      date,
      variety,
      blend,
      tuft_no,
      tuft_variety,
      display_weight,
      actual_weight,
      difference,
      ratio_percent
    } = req.body;
    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }
    const dropId = getDropTestParentId(req.body);
    if (!dropId) {
      return res.status(400).json({ message: 'drop_id is required for drop test entries' });
    }

    const displayWeightValue = toNumberOrNull(display_weight);
    const actualWeightValue = toNumberOrNull(actual_weight);
    const differenceValue = toNumberOrNull(difference) ??
      (displayWeightValue !== null && actualWeightValue !== null
        ? Number((actualWeightValue - displayWeightValue).toFixed(4))
        : null);
    const ratioPercentValue = toNumberOrNull(ratio_percent) ??
      percentOf(differenceValue, displayWeightValue);

    const result = await client.query(
      `INSERT INTO blowroom.drop_test (
        drop_id, entry_id, date, variety, blend,
        tuft_no, tuft_variety,
        display_weight, actual_weight,
        difference, ratio_percent
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        dropId,
        entry_id,
        date,
        variety,
        blend,
        toNumberOrNull(tuft_no),
        tuft_variety,
        displayWeightValue,
        actualWeightValue,
        differenceValue,
        ratioPercentValue
      ]
    );

    res.status(201).json({
      message: 'Drop test created successfully',
      data: withoutDropId(withScreenEntryId('drop_test', result.rows[0]))
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
 * /blowroom/drop-test:
 *   get:
 *     summary: Get Drop Test entries with pagination
 *     tags: [Blowroom]
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
 *         description: Drop test data retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/drop-test', async (req, res, next) => {
  try {

    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT *
       FROM blowroom.drop_test
       ORDER BY date DESC
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const totalResult = await client.query(
      `SELECT COUNT(*) FROM blowroom.drop_test`
    );

    res.status(200).json({
      data: result.rows.map((row) => withoutDropId(withScreenEntryId('drop_test', row))),
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
 * /blowroom/br-waste-study:
 *   post:
 *     summary: Create BR Waste Study entry
 *     tags: [Blowroom]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entry_id
 *               - date
 *               - variety
 *               - carding_production_kg
 *               - type_entries
 *               - waste_type
 *               - waste_kg
 *             properties:
 *               entry_id:
 *                 type: string
 *               waste_study_id:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *               variety:
 *                 type: string
 *               study_type:
 *                 type: string
 *               carding_production_kg:
 *                 type: number
 *               type_entries:
 *                 type: number
 *               flat_speed:
 *                 type: number
 *               delivery_speed:
 *                 type: number
 *               wing1_speed:
 *                 type: number
 *               wing2_speed:
 *                 type: number
 *               lickerin_speed_1:
 *                 type: number
 *               lickerin_speed_2:
 *                 type: number
 *               lickerin_speed_3:
 *                 type: number
 *               mc_no:
 *                 type: string
 *               mc_production:
 *                 type: number
 *               waste_type:
 *                 type: string
 *               waste_kg:
 *                 type: number
 *               waste_percent:
 *                 type: number
 *               overall_percent:
 *                 type: number
 *               remarks:
 *                 type: string
 *     responses:
 *       201:
 *         description: Waste study created successfully
 *       500:
 *         description: Server error
 */
router.post('/br-waste-study', async (req, res, next) => {
  try {
    await ensureBrWasteStudyTables();

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

    const resolvedDate = toDateOrNull(date || entry_date || req.body.inspection_date);

    if (!resolvedDate || !study_type) {
      return res.status(400).json({ message: 'date and study_type are required' });
    }
    if (!entry_id && !waste_study_id) {
      return res.status(400).json({ message: 'entry_id (or waste_study_id) is required and must be unique' });
    }
    if (!['Type 1', 'Type 2', 'Type 3'].includes(study_type)) {
      return res.status(400).json({ message: "study_type must be 'Type 1', 'Type 2', or 'Type 3'" });
    }

    const normalizedWasteRows = Array.isArray(waste_rows) ? waste_rows : [];
    if (normalizedWasteRows.length > 25) {
      return res.status(400).json({ message: 'No. of waste types must be 25 or less' });
    }
    const productionValue = toNumberOrNull(carding_production_kg);
    const wasteKgValue = toDecimal4OrNull(waste_kg) ??
      normalizedWasteRows.reduce((sum, row) => sum + (toDecimal4OrNull(row?.waste_kgs_value ?? row?.waste_kg) || 0), 0);
    const wastePercentValue = toDecimal4OrNull(waste_percent) ?? percentOf(wasteKgValue, productionValue);
    const providedOverallPercent = toDecimal4OrNull(overall_percent);
    const overallPercentValue = providedOverallPercent && providedOverallPercent > 0
      ? providedOverallPercent
      : wastePercentValue;

    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO blowroom.br_waste_study (
        entry_id, waste_study_id, date, variety, entry_type, study_type,
        carding_production_kg, type_entries,
        waste_type, waste_kg, waste_percent, overall_percent,
        remarks
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
      )
      RETURNING *`,
      [
        entry_id || waste_study_id || null,
        waste_study_id || entry_id || null,
        resolvedDate,
        variety || null,
        type || null,
        study_type,
        productionValue, Array.isArray(type_entries) ? type_entries.length : toNumberOrNull(type_entries),
        waste_type, wasteKgValue, wastePercentValue, overallPercentValue,
        remarks
      ]
    );

    const study = result.rows[0];
    const normalizedTypeRows = Array.isArray(type_rows) ? type_rows : (Array.isArray(type_entries) ? type_entries : []);

    const wasteTypesToSave = [
      waste_type,
      ...normalizedWasteRows.map((row) => row?.waste_type)
    ];

    for (const wasteType of wasteTypesToSave) {
      await upsertBlowroomWasteType(wasteType);
    }

    for (let i = 0; i < normalizedTypeRows.length; i++) {
      const row = normalizedTypeRows[i] || {};
      await client.query(
        `INSERT INTO blowroom.br_waste_study_type_rows
         (study_id, row_no, cylinder_speed, lickerin_speed, flat_speed, doffer_speed, delivery_speed, wing_setting_1, wing_setting_2, mc_no, mc_production)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          study.id,
          row.row_no ?? (i + 1),
          toNumberOrNull(row.cylinder_speed),
          toNumberOrNull(row.lickerin_speed),
          toNumberOrNull(row.flat_speed),
          toNumberOrNull(row.doffer_speed),
          toNumberOrNull(row.delivery_speed),
          toNumberOrNull(row.wing_setting_1),
          toNumberOrNull(row.wing_setting_2),
          row.mc_no ?? null,
          toNumberOrNull(row.mc_production)
        ]
      );
    }

    for (let i = 0; i < normalizedWasteRows.length; i++) {
      const row = normalizedWasteRows[i] || {};
      await client.query(
        `INSERT INTO blowroom.br_waste_study_waste_rows
         (study_id, row_no, waste_type, waste_kgs_value, waste_kgs_percent)
         VALUES ($1,$2,$3,$4,$5)`,
        [
        study.id,
        row.row_no ?? (i + 1),
        row.waste_type ?? null,
        toDecimal4OrNull(row.waste_kgs_value ?? row.waste_kg),
        toDecimal4OrNull(row.waste_kgs_percent ?? row.waste_percent) ??
            percentOf(row.waste_kgs_value ?? row.waste_kg, productionValue)
      ]
    );
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Waste study created successfully',
      data: withScreenEntryId('br_waste_study', study)
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate waste study ID. Please use a unique ID.' });
    }
    next(error);
  }});

/**xing
 * @swagger
 * /blowroom/br-waste-study:
 *   get:
 *     summary: Get BR Waste Study entries with pagination
 *     tags: [Blowroom]
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
 *         description: Waste study data retrieved successfully
 *       500:
 *         description: Server error
 */

router.get('/br-waste-study', async (req, res, next) => {
  try {
    await ensureBrWasteStudyTables();

    const { page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const offset = (pageNum - 1) * limitNum;
    
    const result = await client.query(
      `SELECT *
      FROM blowroom.br_waste_study
      ORDER BY date DESC
      OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const totalResult = await client.query(
      `SELECT COUNT(*) FROM blowroom.br_waste_study`
    );
    const studies = result.rows;
    const studyIds = studies.map((r) => r.id);
    let typeRows = [];
    let wasteRows = [];

    if (studyIds.length) {
      const typeRowsResult = await client.query(
        `SELECT * FROM blowroom.br_waste_study_type_rows
         WHERE study_id = ANY($1::bigint[])
         ORDER BY study_id, row_no`,
        [studyIds]
      );
      typeRows = typeRowsResult.rows;

      const wasteRowsResult = await client.query(
        `SELECT * FROM blowroom.br_waste_study_waste_rows
         WHERE study_id = ANY($1::bigint[])
         ORDER BY study_id, row_no`,
        [studyIds]
      );
      wasteRows = wasteRowsResult.rows;
    }

    res.status(200).json({
      data: studies.map((row) => ({
        ...withScreenEntryId('br_waste_study', row),
        type_rows: typeRows.filter((t) => t.study_id === row.id),
        waste_rows: wasteRows.filter((w) => w.study_id === row.id)
      })),
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
 * /blowroom/header:
 *   post:
 *     summary: Create Blowroom production entry
 *     tags: [Blowroom]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entry_id
 *               - count_name
 *               - consignee_name
 *               - creation_date
 *             properties:
 *               entry_id:
 *                 type: string
 *               count_name:
 *                 type: string
 *               consignee_name:
 *                 type: string
 *               creation_date:
 *                 type: string
 *                 format: date
 *               line_numbers:
 *                 type: number
 *               rotary_beater_speed:
 *                 type: number
 *               depth:
 *                 type: number
 *               mpm_delivery_speed:
 *                 type: number
 *               mpm_delivery_pascals:
 *                 type: number
 *               condensor_speed:
 *                 type: number
 *               rk_feed_roll_beater:
 *                 type: number
 *               rk_beater_speed:
 *                 type: number
 *               flexi_to_feed_roll_beater:
 *                 type: number
 *               flexi_beater_speed:
 *                 type: number
 *               scutcher_no:
 *                 type: number
 *               rk_mo_speed:
 *                 type: number
 *               kb_speed:
 *                 type: number
 *               grid_bar:
 *                 type: number
 *               lap_weight:
 *                 type: number
 *               uniclean:
 *                 type: number
 *               srs:
 *                 type: number
 *               rk_flexi:
 *                 type: number
 *     responses:
 *       201:
 *         description: Blowroom entry created successfully
 *       500:
 *         description: Server error
 */

router.post('/header', async (req, res, next) => {
  try {
    await ensureBlowroomEntryIdColumns();
    const {
      entry_id,
      count_name,
      consignee_name,
      creation_date,
      line_numbers,
      rotary_beater_speed,
      depth,
      mpm_delivery_speed,
      mpm_delivery_pascals,
      condensor_speed,
      rk_feed_roll_beater,
      rk_beater_speed,
      flexi_to_feed_roll_beater,
      flexi_beater_speed,
      scutcher_no,
      rk_mo_speed,
      kb_speed,
      grid_bar,
      lap_weight,
      uniclean,
      srs,
      rk_flexi
    } = req.body;
    if (!entry_id) {
      return res.status(400).json({ message: 'entry_id is required and must be unique' });
    }

    const result = await client.query(
      `INSERT INTO blowroom.blowroom_header (
        entry_id, count_name, consignee_name, creation_date,
        line_numbers, rotary_beater_speed, depth,
        mpm_delivery_speed, mpm_delivery_pascals,
        condensor_speed, rk_feed_roll_beater, rk_beater_speed,
        flexi_to_feed_roll_beater, flexi_beater_speed,
        scutcher_no, rk_mo_speed, kb_speed,
        grid_bar, lap_weight, uniclean, srs, rk_flexi
      )
      VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,
        $8,$9,
        $10,$11,$12,
        $13,$14,
        $15,$16,$17,
        $18,$19,$20,$21,$22
      )
      RETURNING *`,
      [
        entry_id, count_name, consignee_name, creation_date,
        line_numbers, rotary_beater_speed, depth,
        mpm_delivery_speed, mpm_delivery_pascals,
        condensor_speed, rk_feed_roll_beater, rk_beater_speed,
        flexi_to_feed_roll_beater, flexi_beater_speed,
        scutcher_no, rk_mo_speed, kb_speed,
        grid_bar, lap_weight, uniclean, srs, rk_flexi
      ]
    );

    res.status(201).json({
      message: 'Blowroom entry created successfully',
      data: withProcessParameterId(result.rows[0])
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
 * /blowroom/header:
 *   get:
 *     summary: Get Blowroom production entries
 *     tags: [Blowroom]
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
 *         description: Blowroom data retrieved successfully
 *       500:
 *         description: Server error
 */

router.get('/header', async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const offset = (pageNum - 1) * limitNum;

    const result = await client.query(
      `SELECT *
       FROM blowroom.blowroom_header
       ORDER BY creation_date DESC
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const totalResult = await client.query(
      `SELECT COUNT(*) FROM blowroom.blowroom_header`
    );

    res.status(200).json({
      data: result.rows.map((row) => withProcessParameterId(row)),
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
 * /blowroom/header/{br_id}:
 *   put:
 *     summary: Update Blowroom production entry
 *     tags: [Blowroom]
 *     parameters:
 *       - in: path
 *         name: br_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Blowroom header ID
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
 *               line_numbers:
 *                 type: number
 *               rotary_beater_speed:
 *                 type: number
 *               depth:
 *                 type: number
 *               mpm_delivery_speed:
 *                 type: number
 *               mpm_delivery_pascals:
 *                 type: number
 *               condensor_speed:
 *                 type: number
 *               rk_feed_roll_beater:
 *                 type: number
 *               rk_beater_speed:
 *                 type: number
 *               flexi_to_feed_roll_beater:
 *                 type: number
 *               flexi_beater_speed:
 *                 type: number
 *               scutcher_no:
 *                 type: number
 *               rk_mo_speed:
 *                 type: number
 *               kb_speed:
 *                 type: number
 *               grid_bar:
 *                 type: number
 *               lap_weight:
 *                 type: number
 *               uniclean:
 *                 type: number
 *               srs:
 *                 type: number
 *               rk_flexi:
 *                 type: number
 *     responses:
 *       200:
 *         description: Blowroom entry updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Blowroom entry updated successfully
 *                 data:
 *                   type: object
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Blowroom entry not found
 *       500:
 *         description: Server error
 */

router.put('/header/:br_id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.br_id, 10);

    // ✅ ID validation
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid ID supplied' });
    }

    const {
      entry_id,
      count_name,
      consignee_name,
      creation_date,
      line_numbers,
      rotary_beater_speed,
      depth,
      mpm_delivery_speed,
      mpm_delivery_pascals,
      condensor_speed,
      rk_feed_roll_beater,
      rk_beater_speed,
      flexi_to_feed_roll_beater,
      flexi_beater_speed,
      scutcher_no,
      rk_mo_speed,
      kb_speed,
      grid_bar,
      lap_weight,
      uniclean,
      srs,
      rk_flexi
    } = req.body;

    // ✅ Required field validation
    if (!count_name || !consignee_name || !creation_date) {
      return res.status(400).json({
        message: 'count_name, consignee_name and creation_date are required'
      });
    }

    const currentResult = await client.query(
      `SELECT entry_id
       FROM blowroom.blowroom_header
       WHERE br_id = $1`,
      [id]
    );

    if (currentResult.rowCount === 0) {
      return res.status(404).json({
        message: 'Blowroom entry not found'
      });
    }

    const requestedEntryId = String(entry_id || '').trim();
    const currentEntryId = String(currentResult.rows[0].entry_id || '').trim();

    if (requestedEntryId && requestedEntryId !== currentEntryId) {
      const insertResult = await client.query(
        `INSERT INTO blowroom.blowroom_header (
          entry_id, count_name, consignee_name, creation_date,
          line_numbers, rotary_beater_speed, depth,
          mpm_delivery_speed, mpm_delivery_pascals,
          condensor_speed, rk_feed_roll_beater, rk_beater_speed,
          flexi_to_feed_roll_beater, flexi_beater_speed,
          scutcher_no, rk_mo_speed, kb_speed,
          grid_bar, lap_weight, uniclean, srs, rk_flexi
        )
        VALUES (
          $1,$2,$3,$4,
          $5,$6,$7,
          $8,$9,
          $10,$11,$12,
          $13,$14,
          $15,$16,$17,
          $18,$19,$20,$21,$22
        )
        RETURNING *`,
        [
          requestedEntryId,
          count_name,
          consignee_name,
          creation_date,
          line_numbers,
          rotary_beater_speed,
          depth,
          mpm_delivery_speed,
          mpm_delivery_pascals,
          condensor_speed,
          rk_feed_roll_beater,
          rk_beater_speed,
          flexi_to_feed_roll_beater,
          flexi_beater_speed,
          scutcher_no,
          rk_mo_speed,
          kb_speed,
          grid_bar,
          lap_weight,
          uniclean,
          srs,
          rk_flexi
        ]
      );

      return res.status(201).json({
        message: 'Blowroom entry created successfully',
        data: withProcessParameterId(insertResult.rows[0])
      });
    }

    const result = await client.query(
      `UPDATE blowroom.blowroom_header
       SET count_name = $1,
           consignee_name = $2,
           creation_date = $3,
           line_numbers = $4,
           rotary_beater_speed = $5,
           depth = $6,
           mpm_delivery_speed = $7,
           mpm_delivery_pascals = $8,
           condensor_speed = $9,
           rk_feed_roll_beater = $10,
           rk_beater_speed = $11,
           flexi_to_feed_roll_beater = $12,
           flexi_beater_speed = $13,
           scutcher_no = $14,
           rk_mo_speed = $15,
           kb_speed = $16,
           grid_bar = $17,
           lap_weight = $18,
           uniclean = $19,
           srs = $20,
           rk_flexi = $21
       WHERE br_id = $22
       RETURNING *`,
      [
        count_name,
        consignee_name,
        creation_date,
        line_numbers,
        rotary_beater_speed,
        depth,
        mpm_delivery_speed,
        mpm_delivery_pascals,
        condensor_speed,
        rk_feed_roll_beater,
        rk_beater_speed,
        flexi_to_feed_roll_beater,
        flexi_beater_speed,
        scutcher_no,
        rk_mo_speed,
        kb_speed,
        grid_bar,
        lap_weight,
        uniclean,
        srs,
        rk_flexi,
        id
      ]
    );

    // ✅ Not found case
    if (result.rowCount === 0) {
      return res.status(404).json({
        message: 'Blowroom entry not found'
      });
    }

    // ✅ Success response
    res.status(200).json({
      message: 'Blowroom entry updated successfully',
      data: withProcessParameterId(result.rows[0])
    });

  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
    }
    console.error(error); // helpful for debugging
    next(error);
  }
});

module.exports = router;

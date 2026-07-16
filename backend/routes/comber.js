const express = require('express');
const router = express.Router();
const client = require('../connection');
const sqlServer = require('../config/sqlserver');
const sqlServerPrep = require('../config/sqlserverPrep');
const { fetchPrepVarieties, sendPrepVarietyDropdown, isDatabaseAccessDenied } = require('../utils/prepVariety');
const { createEmployeeMasterDropdown } = require('../utils/employeeMaster');
const SCREEN_ID_PREFIXES = {
  lap_cv: 'CL',
  nati_data_entry: 'CN',
  uqc: 'CU',
  nre_data_entry: 'CNR',
  efficiency_data_entry: 'CEF'
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

// `id` on these tables was never given a PRIMARY KEY, so the GET routes' `GROUP BY qc.id`
// (selecting other qc.* columns via functional dependency) fail with "must appear in the GROUP
// BY clause" on every request. Add the missing PK (id is a NOT NULL serial with no duplicates)
// so those report queries can actually run.
const ensureComberPrimaryKeys = async () => {
  const tables = ['ribbon_lap_cv_qc'];
  for (const table of tables) {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'comber.${table}'::regclass AND contype = 'p'
        ) THEN
          ALTER TABLE comber.${table} ADD PRIMARY KEY (id);
        END IF;
      END $$;
    `);
  }
};

// Ribbon Lap CV1M/Nati/U% store created_at/updated_at as `timestamp WITHOUT time zone`
// (CURRENT_TIMESTAMP default), unlike Comber NRE%/Efficiency's `timestamp WITH time zone` — on
// this DB, a "without time zone" default silently gets written using a different offset than the
// session's own display timezone, so Custom Report's "Created At" comes out shifted by several
// hours (sometimes onto the wrong calendar day) for these three screens while NRE%/Efficiency
// display correctly. Converting the column type to timestamptz makes new rows store an
// unambiguous absolute instant, matching NRE%/Efficiency's already-correct behavior.
const ensureComberTimestampColumnsHaveTimezone = async () => {
  const columnsByTable = {
    ribbon_lap_cv_qc: ['created_at', 'updated_at'],
    nati_data_entry: ['created_at', 'updated_at'],
    u_data_entry: ['created_at']
  };
  for (const [table, columns] of Object.entries(columnsByTable)) {
    for (const column of columns) {
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'comber' AND table_name = '${table}' AND column_name = '${column}'
              AND data_type = 'timestamp without time zone'
          ) THEN
            ALTER TABLE comber.${table}
              ALTER COLUMN ${column} TYPE timestamptz USING ${column} AT TIME ZONE 'UTC';
            ALTER TABLE comber.${table}
              ALTER COLUMN ${column} SET DEFAULT now();
          END IF;
        END $$;
      `);
    }
  }
};

const ensureComberEntryIdColumns = async () => {
  await ensureComberPrimaryKeys();
  await ensureComberTimestampColumnsHaveTimezone();
  await client.query(`
    ALTER TABLE comber.ribbon_lap_cv_qc
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ribbon_lap_cv_qc_entry_id_uq
    ON comber.ribbon_lap_cv_qc (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    ALTER TABLE comber.nati_data_entry
      ADD COLUMN IF NOT EXISTS entry_id TEXT,
      ADD COLUMN IF NOT EXISTS operator TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS comber_nati_data_entry_entry_id_uq
    ON comber.nati_data_entry (entry_id)
    WHERE entry_id IS NOT NULL;
  `);

  await client.query(`
    ALTER TABLE comber.u_data_entry
      ADD COLUMN IF NOT EXISTS entry_id TEXT;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS comber_u_data_entry_entry_id_uq
    ON comber.u_data_entry (entry_id)
    WHERE entry_id IS NOT NULL;
  `);
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

const getMasterVarieties = sendPrepVarietyDropdown(sqlServerPrep, 'comber');

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
    console.error('Error fetching comber count names from SQL Server:', error);
    next(error);
  }
};

const getEmployeeMasterDropdown = createEmployeeMasterDropdown(sqlServer, 'comber');

const getRibbonLapMachineDropdown = async (req, res, next) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const prefix = String(req.query.prefix || req.query.mc_no_prefix || req.query.machine_prefix || 'CBR').trim();
    const department = String(req.query.department || 'Comber').trim();
    const departmentLike = department ? `%${department}%` : '%Comber%';
    const machinePrefix = `${prefix || 'CBR'}%`;

    const result = await sqlServer.query(
      `SELECT
         CAST(m.MCCODE AS VARCHAR(50)) AS mc_code,
         LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) AS mc_no,
         LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) AS mc_name,
         CAST(m.DEPTCODE AS VARCHAR(50)) AS dept_code,
         LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) AS dept_name
       FROM dbo.MCMASTER m
       JOIN dbo.dept_mai d ON m.DEPTCODE = d.DEPTCODE
       WHERE m.compcode = '1'
         AND UPPER(LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255))))) LIKE UPPER(@departmentLike)
         AND UPPER(LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255))))) LIKE UPPER(@machinePrefix)
       ORDER BY CASE WHEN ISNUMERIC(CAST(m.MCCODE AS VARCHAR(50))) = 1 THEN CAST(m.MCCODE AS INT) ELSE 2147483647 END, m.MCNAME`,
      {
        departmentLike,
        machinePrefix
      }
    );

    const data = (result.recordset || []).map((row) => ({
      mc_code: String(row.mc_code || '').trim(),
      mc_no: String(row.mc_no || '').trim(),
      mc_name: String(row.mc_name || '').trim(),
      dept_code: String(row.dept_code || '').trim(),
      dept_name: String(row.dept_name || '').trim()
    })).filter((row) => row.mc_no || row.mc_name);

    const options = [
      { text: '-- Select MC No. --', value: '' },
      ...data.map((row) => ({
        text: row.mc_no || row.mc_name,
        label: row.mc_no || row.mc_name,
        value: row.mc_no || row.mc_name,
        mc_code: row.mc_code,
        mc_no: row.mc_no,
        mc_name: row.mc_name,
        dept_name: row.dept_name
      }))
    ];

    return res.status(200).json({
      source: 'sqlserver',
      department: department || 'Comber',
      prefix: prefix || 'CBR',
      data,
      mc_nos: data,
      mc_no_values: data.map((row) => row.mc_no || row.mc_name),
      values: data.map((row) => row.mc_no || row.mc_name),
      options
    });
  } catch (error) {
    next(error);
  }
};

router.get('/master/varieties', getMasterVarieties);
router.get('/master/dropdown', getMasterVarieties);
router.get('/master/counts', getCountMasterDropdown);
router.get('/master/count-dropdown', getCountMasterDropdown);
router.get('/master/count-names', getCountMasterDropdown);
router.get('/master/mc-nos', getRibbonLapMachineDropdown);
router.get('/master/mc-no', getRibbonLapMachineDropdown);
router.get('/master/machine-nos', getRibbonLapMachineDropdown);
router.get('/master/machine-numbers', getRibbonLapMachineDropdown);
router.get('/master/employees', getEmployeeMasterDropdown);
router.get('/master/employee-dropdown', getEmployeeMasterDropdown);
router.get('/master/employee-names', getEmployeeMasterDropdown);
router.get('/master/user-names', getEmployeeMasterDropdown);
router.get('/lap-cv/master/varieties', getMasterVarieties);
router.get('/lap-cv/master/dropdown', getMasterVarieties);
router.get('/lap-cv/master/counts', getCountMasterDropdown);
router.get('/lap-cv/master/count-dropdown', getCountMasterDropdown);
router.get('/lap-cv/master/count-names', getCountMasterDropdown);
router.get('/lap-cv/master/mc-nos', getRibbonLapMachineDropdown);
router.get('/lap-cv/master/mc-no', getRibbonLapMachineDropdown);
router.get('/lap-cv/master/machine-nos', getRibbonLapMachineDropdown);
router.get('/lap-cv/master/machine-numbers', getRibbonLapMachineDropdown);
router.get('/ribbon-lap-cv/master/varieties', getMasterVarieties);
router.get('/ribbon-lap-cv/master/dropdown', getMasterVarieties);
router.get('/ribbon-lap-cv/master/counts', getCountMasterDropdown);
router.get('/ribbon-lap-cv/master/count-dropdown', getCountMasterDropdown);
router.get('/ribbon-lap-cv/master/count-names', getCountMasterDropdown);
router.get('/ribbon-lap-cv/master/mc-nos', getRibbonLapMachineDropdown);
router.get('/ribbon-lap-cv/master/mc-no', getRibbonLapMachineDropdown);
router.get('/ribbon-lap-cv/master/machine-nos', getRibbonLapMachineDropdown);
router.get('/ribbon-lap-cv/master/machine-numbers', getRibbonLapMachineDropdown);
router.get('/uqc/master/counts', getCountMasterDropdown);
router.get('/uqc/master/count-dropdown', getCountMasterDropdown);
router.get('/uqc/master/count-names', getCountMasterDropdown);

router.get('/uqc/master/dropdown', async (req, res, next) => {
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

    const mcNos = (mcResult.recordset || []).map((r) => ({
      mc_no: String(r.mc_no || '').trim(),
      mc_name: String(r.mc_name || '').trim(),
      dept_code: String(r.dept_code || '').trim(),
      dept_name: String(r.dept_name || '').trim()
    })).filter((r) => r.mc_no);

    const shifts = [
      { value: 'Shift 1', label: 'Shift 1' },
      { value: 'Shift 2', label: 'Shift 2' },
      { value: 'Shift 3', label: 'Shift 3' }
    ];

    const shiftOptions = [{ text: '-- Select Shift --', value: '' }, ...shifts.map((s) => ({ text: s.label, value: s.value }))];
    const varietyOptions = [{ text: '-- Select Variety --', value: '' }, ...varieties.map((v) => ({ text: v.variety_name, value: v.variety_name }))];
    const departmentOptions = [{ text: '-- Select Department --', value: '' }, ...departments.map((d) => ({ text: d.dept_name, value: d.dept_name }))];
    const mcNoOptions = [{ text: '-- Select MC No. --', value: '' }, ...mcNos.map((m) => ({ text: m.mc_name || m.mc_no, value: m.mc_name || m.mc_no }))];

    return res.status(200).json({
      source: 'sqlserver',
      shifts,
      shift_values: shifts.map((s) => s.value),
      varieties,
      variety_names: varieties.map((r) => r.variety_name),
      departments,
      department_names: departments.map((r) => r.dept_name),
      mc_nos: mcNos,
      mc_no_values: mcNos.map((r) => r.mc_no),
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
});

router.get('/nati/master/varieties', async (req, res) => {
  try {
    if (!sqlServerPrep.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const prefix = String(req.query.variety_prefix || req.query.prefix || '').trim();
    const data = await fetchPrepVarieties(sqlServerPrep, prefix);

    return res.status(200).json({
      source: 'sqlserver',
      database: process.env.MSSQL_PREP_DATABASE || 'dsmprojects',
      table: 'dbo.prepvariety',
      data,
      names: data.map((r) => r.variety_name),
      variety_names: data.map((r) => r.variety_name),
      values: data.map((r) => r.variety_name),
      options: [
        { text: '-- Select Variety --', label: '-- Select Variety --', value: '' },
        ...data.map((v) => ({ text: v.variety_name, label: v.variety_name, value: v.variety_name }))
      ]
    });
  } catch (err) {
    if (isDatabaseAccessDenied(err)) {
      const databaseName = process.env.MSSQL_PREP_DATABASE || 'dsmprojects';
      const userName = process.env.MSSQL_PREP_USER || process.env.MSSQL_USER || 'configured SQL user';
      return res.status(403).json({
        message: `SQL Server user "${userName}" does not have SELECT access to ${databaseName}.dbo.prepvariety`,
        required_permission: `GRANT SELECT ON ${databaseName}.dbo.prepvariety`,
        database: databaseName,
        table: 'dbo.prepvariety'
      });
    }

    console.error('Error fetching comber nati prep varieties from SQL Server:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/nati/master/counts', getCountMasterDropdown);
router.get('/nati/master/count-dropdown', getCountMasterDropdown);
router.get('/nati/master/count-names', getCountMasterDropdown);
router.get('/nati/master/employees', getEmployeeMasterDropdown);
router.get('/nati/master/employee-dropdown', getEmployeeMasterDropdown);
router.get('/nati/master/employee-names', getEmployeeMasterDropdown);

router.get('/nati/master/departments', async (req, res) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const prefix = String(req.query.prefix || '').trim();
    const likeToken = `%${prefix}%`;

    const result = await sqlServer.query(
      `SELECT DISTINCT
         CAST(d.DEPTCODE AS VARCHAR(50)) AS dept_code,
         LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) AS dept_name
       FROM dbo.dept_mai d
       WHERE LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) <> ''
         AND (@prefix = '' OR LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) LIKE @deptPrefix)
       ORDER BY dept_name`,
      { prefix, deptPrefix: likeToken }
    );

    const data = (result.recordset || []).map((r) => ({
      dept_code: String(r.dept_code || '').trim(),
      dept_name: String(r.dept_name || '').trim()
    })).filter((r) => r.dept_name);

    return res.status(200).json({
      source: 'sqlserver',
      data,
      names: data.map((r) => r.dept_name)
    });
  } catch (err) {
    console.error('Error fetching comber nati departments from SQL Server:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/nati/master/mc-nos', async (req, res, next) => {
  try {
    const prefix = String(req.query.prefix || '').trim();
    const department = String(req.query.department || 'Comber').trim() || 'Comber';
    const departmentCode = String(req.query.department_code || '').trim();
    const includeAll = String(req.query.include_all || '').toLowerCase() === 'true';
    const likeToken = `%${prefix}%`;

    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
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
         AND (@includeAll = 1 OR UPPER(LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255))))) LIKE UPPER(@departmentLike))
         AND (@prefix = '' OR CAST(m.MCCODE AS VARCHAR(50)) LIKE @mcNoPrefix)
         AND (@department = '' OR LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) LIKE @departmentLike)
         AND (@departmentCode = '' OR CAST(d.DEPTCODE AS VARCHAR(50)) = @departmentCode)
       ORDER BY CASE WHEN ISNUMERIC(CAST(m.MCCODE AS VARCHAR(50))) = 1 THEN CAST(m.MCCODE AS INT) ELSE 2147483647 END, m.MCCODE`,
      {
        prefix,
        includeAll: includeAll ? 1 : 0,
        mcNoPrefix: likeToken,
        department,
        departmentLike: `%${department}%`,
        departmentCode
      }
    );

    const data = (result.recordset || []).map((r) => ({
      mc_no: String(r.mc_no || '').trim(),
      mc_name: String(r.mc_name || '').trim(),
      dept_code: String(r.dept_code || '').trim(),
      dept_name: String(r.dept_name || '').trim()
    })).filter((r) => r.mc_no);

    return res.status(200).json({
      source: 'sqlserver',
      department,
      data,
      mc_nos: data,
      values: data.map((r) => r.mc_no),
      options: [
        { text: '-- Select MC No. --', value: '' },
        ...data.map((r) => ({
          text: r.mc_no || r.mc_name,
          label: r.mc_no || r.mc_name,
          value: r.mc_no || r.mc_name,
          mc_no: r.mc_no,
          mc_name: r.mc_name,
          dept_name: r.dept_name
        }))
      ]
    });
  } catch (error) {
    next(error);
  }
});

///////////////////////////////////////////////////////////
//////////////////// HELPER FUNCTION //////////////////////
///////////////////////////////////////////////////////////

const withTransaction = async (callback) => {
    try {
        await client.query('BEGIN');
        const result = await callback();
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
};

///////////////////////////////////////////////////////////
///////////////////// SWAGGER TAG /////////////////////////
///////////////////////////////////////////////////////////

/**
 * @swagger
 * tags:
 *   name: Comber
 *   description: Comber Department APIs
 */

///////////////////////////////////////////////////////////
///////////////////// LAP CV API //////////////////////////
///////////////////////////////////////////////////////////

/**
 * @swagger
 * /comber/lap-cv:
 *   post:
 *     summary: Create Ribbon Lap CV entry
 *     tags: [Comber]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             record_date: "2026-03-26"
 *             machine_name: "M1"
 *             variety: "Cotton"
 *             type: "Type A"
 *             lap_weight: 20
 *             samples: [1.2, 1.5, 1.3]
 *             average: 1.33
 *             minimum: 1.2
 *             maximum: 1.5
 *             std_deviation: 0.15
 *             cv_percent: 5
 *     responses:
 *       201:
 *         description: Lap CV entry created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Lap CV created
 *                 qc_id:
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
 *                   example: Samples required
 *       500:
 *         description: Server error
 */
router.post('/lap-cv', async (req, res) => {
    try {
        await ensureComberEntryIdColumns();
        const {
            entry_id,
            record_date,
            machine_name,
            variety,
            type,
            lap_weight,
            lap_length,
            grams_per_meter,
            samples,
            average,
            minimum,
            maximum,
            std_deviation,
            cv_percent
        } = req.body;

        if (!entry_id) {
            return res.status(400).json({ message: 'entry_id is required and must be unique' });
        }

        if (!samples || !samples.length) {
            return res.status(400).json({ message: 'Samples required' });
        }

        const qc_id = await withTransaction(async () => {

            const main = await client.query(
                `INSERT INTO comber.ribbon_lap_cv_qc
                (entry_id, entry_type, sample_count, record_date, machine_name, variety, type, lap_weight,
                 lap_length, grams_per_meter, average, minimum, maximum, std_deviation, cv_percent)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
                RETURNING id`,
                [
                    entry_id,
                    'Ribbon Lap CV Data Entry',
                    samples.length,
                    record_date,
                    machine_name,
                    variety,
                    type,
                    lap_weight,
                    lap_length,
                    grams_per_meter,
                    average,
                    minimum,
                    maximum,
                    std_deviation,
                    cv_percent
                ]
            );

            const qc_id = main.rows[0].id;

            await client.query(
                `INSERT INTO comber.ribbon_lap_samples (qc_id, sample_no, sample_value)
                 SELECT $1, s_no, s_val
                 FROM unnest($2::int[], $3::numeric[]) AS t(s_no, s_val)`,
                [
                    qc_id,
                    samples.map((_, i) => i + 1),
                    samples
                ]
            );

            return qc_id;
        });

        res.status(201).json({
            message: 'Lap CV created',
            qc_id,
            entry_id
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});


/**
 * @swagger
 * /comber/lap-cv:
 *   get:
 *     summary: Get Lap CV entries
 *     tags: [Comber]
 *     responses:
 *       200:
 *         description: List of lap CV entries retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 123
 *                   entry_type:
 *                     type: string
 *                     example: Ribbon Lap CV Data Entry
 *                   sample_count:
 *                     type: integer
 *                     example: 3
 *                   record_date:
 *                     type: string
 *                     format: date
 *                     example: 2026-03-26
 *                   machine_name:
 *                     type: string
 *                     example: M1
 *                   variety:
 *                     type: string
 *                     example: Cotton
 *                   type:
 *                     type: string
 *                     example: Type A
 *                   lap_weight:
 *                     type: number
 *                     example: 20
 *                   average:
 *                     type: number
 *                     example: 1.33
 *                   minimum:
 *                     type: number
 *                     example: 1.2
 *                   maximum:
 *                     type: number
 *                     example: 1.5
 *                   std_deviation:
 *                     type: number
 *                     example: 0.15
 *                   cv_percent:
 *                     type: number
 *                     example: 5
 *                   samples:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         sample_no:
 *                           type: integer
 *                           example: 1
 *                         sample_value:
 *                           type: number
 *                           example: 1.2
 *       500:
 *         description: Server error
 */
router.get('/lap-cv', async (req, res) => {
    try {
        await ensureComberEntryIdColumns();
        const result = await client.query(`
            SELECT
                qc.*,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'sample_no', s.sample_no,
                            'value', s.sample_value
                        )
                    ) FILTER (WHERE s.sample_no IS NOT NULL),
                    '[]'
                ) AS samples
            FROM comber.ribbon_lap_cv_qc qc
            LEFT JOIN comber.ribbon_lap_samples s
            ON qc.id = s.qc_id
            GROUP BY qc.id
            ORDER BY qc.record_date DESC
        `);

        res.json(result.rows.map((row) => withScreenEntryId('lap_cv', row)));

    } catch (err) {
        if (isUniqueViolation(err)) {
            return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
        }
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @swagger
 * /comber/nati-data-entry:
 *   post:
 *     summary: Create Nati Data Entry
 *     tags: [Comber]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             type: "Daily"
 *             entry_date: "2026-03-26"
 *             variety: "Cotton"
 *             entries:
 *               - mc_no: 1
 *                 ratio_size_1: 10
 *                 ratio_size_07: 7
 *                 ratio_size_05: 5
 *     responses:
 *       201:
 *         description: Nati entry created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Nati entry created
 *                 qc_id:
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
 *                   example: Entries required
 *       500:
 *         description: Server error
 */
router.post('/nati-data-entry', async (req, res) => {
    try {
        await ensureComberEntryIdColumns();
        const { entry_id, type, entry_date, variety, entries, user_name } = req.body;

        if (!entry_id) {
            return res.status(400).json({ message: 'entry_id is required and must be unique' });
        }

        if (!entries || !entries.length) {
            return res.status(400).json({ message: 'Entries required' });
        }

        const qc_id = await withTransaction(async () => {

            const main = await client.query(
                `INSERT INTO comber.nati_data_entry
                (entry_id, type, entry_date, variety, operator)
                VALUES ($1,$2,$3,$4,$5)
                RETURNING id`,
                [entry_id, type, entry_date, variety, user_name || null]
            );

            const qc_id = main.rows[0].id;

            await client.query(
                `INSERT INTO comber.neps_details
                (qc_id, mc_no, ratio_size_1, ratio_size_07, ratio_size_05)
                SELECT 
                    $1, mc_no, r1, r07, r05
                FROM unnest(
                    $2::int[],
                    $3::numeric[],
                    $4::numeric[],
                    $5::numeric[]
                ) AS t(mc_no, r1, r07, r05)`,
                [
                    qc_id,
                    entries.map(e => e.mc_no),
                    entries.map(e => e.ratio_size_1),
                    entries.map(e => e.ratio_size_07),
                    entries.map(e => e.ratio_size_05)
                ]
            );

            return qc_id;
        });

        res.status(201).json({
            message: 'Nati entry created',
            qc_id,
            entry_id
        });

    } catch (err) {
        if (isUniqueViolation(err)) {
            return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
        }
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});


/**
 * @swagger
 * /comber/nati-data-entry:
 *   get:
 *     summary: Get Nati entries
 *     tags: [Comber]
 *     responses:
 *       200:
 *         description: List of nati entries retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 123
 *                   type:
 *                     type: string
 *                     example: Daily
 *                   entry_date:
 *                     type: string
 *                     format: date
 *                     example: 2026-03-26
 *                   variety:
 *                     type: string
 *                     example: Cotton
 *                   entries:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         mc_no:
 *                           type: integer
 *                           example: 1
 *                         ratio_size_1:
 *                           type: number
 *                           example: 10
 *                         ratio_size_07:
 *                           type: number
 *                           example: 7
 *                         ratio_size_05:
 *                           type: number
 *                           example: 5
 *       500:
 *         description: Server error
 */
router.get('/nati-data-entry', async (req, res) => {
    try {
        await ensureComberEntryIdColumns();
        const result = await client.query(`
            SELECT
                qc.id,
                qc.entry_id,
                qc.type,
                qc.entry_date,
                qc.variety,
                qc.operator,
                qc.created_at,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'mc_no', n.mc_no,
                            'ratio_size_1', n.ratio_size_1,
                            'ratio_size_07', n.ratio_size_07,
                            'ratio_size_05', n.ratio_size_05
                        )
                    ) FILTER (WHERE n.mc_no IS NOT NULL),
                    '[]'
                ) AS entries
            FROM comber.nati_data_entry qc
            LEFT JOIN comber.neps_details n
            ON qc.id = n.qc_id
            GROUP BY qc.id
            ORDER BY qc.entry_date DESC
        `);

        res.json(result.rows.map((row) => withScreenEntryId('nati_data_entry', row)));

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Comber NRE% has a fully-formed frontend (comberNreDataEntry.jsx) and its own DB table
// (comber.nre_data_entry, with entry_id/unique-index already in place) but was never given a
// backend route at all — every submission fell through to Express's default 404, which the
// frontend's error handling shows as the generic "Invalid payload data." fallback message.
router.post('/nre', async (req, res) => {
    try {
        const {
            entry_id,
            type,
            silver_hank,
            delivery_mtr_min,
            comber_neps_min,
            feed_mm_per_nep,
            fiber_nep_in_comber_lap_gms,
            fiber_nep_gms_in_silver,
            comber_nre_percent
        } = req.body;

        if (!entry_id) {
            return res.status(400).json({ message: 'entry_id is required and must be unique' });
        }

        const result = await client.query(
            `INSERT INTO comber.nre_data_entry
            (entry_id, type, silver_hank, delivery_mtr_min, comber_neps_min, feed_mm_per_nep,
             fiber_nep_in_comber_lap_gms, fiber_nep_gms_in_silver, comber_nre_percent)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING *`,
            [
                entry_id,
                type,
                silver_hank,
                delivery_mtr_min,
                comber_neps_min,
                feed_mm_per_nep,
                fiber_nep_in_comber_lap_gms,
                fiber_nep_gms_in_silver,
                comber_nre_percent
            ]
        );

        res.status(201).json({
            message: 'Comber NRE% entry created',
            data: withScreenEntryId('nre_data_entry', result.rows[0])
        });
    } catch (err) {
        if (isUniqueViolation(err)) {
            return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
        }
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/nre', async (req, res) => {
    try {
        const result = await client.query(`
            SELECT *
            FROM comber.nre_data_entry
            ORDER BY created_at DESC
        `);

        res.json(result.rows.map((row) => withScreenEntryId('nre_data_entry', row)));

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Comber Efficiency has the same gap as Comber NRE% above — a complete frontend and its own DB
// table (comber.efficiency_data_entry, entry_id/unique-index already in place) but no backend
// route, so every submission 404'd and showed as "Invalid payload data." on the frontend.
router.post('/efficiency', async (req, res) => {
    try {
        const {
            entry_id,
            type,
            mc_name,
            span_length_50_lap,
            span_length_50_sliver,
            combining_efficiency_formula
        } = req.body;

        if (!entry_id) {
            return res.status(400).json({ message: 'entry_id is required and must be unique' });
        }

        const result = await client.query(
            `INSERT INTO comber.efficiency_data_entry
            (entry_id, type, mc_name, span_length_50_lap, span_length_50_sliver, combining_efficiency_formula)
            VALUES ($1,$2,$3,$4,$5,$6)
            RETURNING *`,
            [
                entry_id,
                type,
                mc_name,
                span_length_50_lap,
                span_length_50_sliver,
                combining_efficiency_formula
            ]
        );

        res.status(201).json({
            message: 'Comber Efficiency entry created',
            data: withScreenEntryId('efficiency_data_entry', result.rows[0])
        });
    } catch (err) {
        if (isUniqueViolation(err)) {
            return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
        }
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/efficiency', async (req, res) => {
    try {
        const result = await client.query(`
            SELECT *
            FROM comber.efficiency_data_entry
            ORDER BY created_at DESC
        `);

        res.json(result.rows.map((row) => withScreenEntryId('efficiency_data_entry', row)));

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});


/**
 * @swagger
 * /comber/uqc:
 *   post:
 *     summary: Create UQC (U% Data Entry)
 *     tags: [Comber]
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
 *                 example: "Comber"
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
        await ensureComberEntryIdColumns();
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
            `INSERT INTO comber.u_data_entry
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
        if (isUniqueViolation(err)) {
            return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
        }
        console.error('UQC INSERT ERROR:', err);
        res.status(500).json({
            message: 'Server error',
            error: err.message
        });
    }
});


/**
 * @swagger
 * /comber/uqc:
 *   get:
 *     summary: Get UQC entries with pagination
 *     tags: [Comber]
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
        await ensureComberEntryIdColumns();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const dataQuery = `
            SELECT *
            FROM comber.u_data_entry
            ORDER BY entry_date DESC
            LIMIT $1 OFFSET $2
        `;

        const countQuery = `
            SELECT COUNT(*) FROM comber.u_data_entry
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


module.exports = router;





const express = require('express');
const router = express.Router();
const client = require('../connection');
const sqlServer = require('../config/sqlserver');
const { dedupeVarieties } = require('../utils/variety');
const { createEmployeeMasterDropdown } = require('../utils/employeeMaster');

const mapMachineRows = (rows = []) =>
  rows
    .map((r) => ({
      mc_no: String(r.mc_no || '').trim(),
      mc_name: String(r.mc_name || '').trim(),
      dept_code: String(r.dept_code || '').trim(),
      dept_name: String(r.dept_name || '').trim()
    }))
    .filter((r) => r.mc_name);

const mapCountRows = (rows = []) =>
  rows
    .map((r) => ({
      count_code: String(r.count_code || r.count_name || '').trim(),
      count_name: String(r.count_name || '').trim()
    }))
    .filter((r) => r.count_name);

const buildCountDropdownPayload = (source, data) => {
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

  return {
    source,
    table: source === 'sqlserver' ? 'Depot_CountMaster' : 'trials.trials',
    data,
    count_names: data.map((r) => r.count_name),
    names: data.map((r) => r.count_name),
    values: data.map((r) => r.count_name),
    options
  };
};

const fetchSavedTrialCountMaster = async (prefix = '') => {
  const likeToken = `%${prefix}%`;
  const result = await client.query(
    `SELECT DISTINCT BTRIM(count_name) AS count_name
     FROM trials.trials
     WHERE count_name IS NOT NULL
       AND BTRIM(count_name) <> ''
       AND ($1::text = '' OR count_name ILIKE $2)
     ORDER BY count_name
     LIMIT 100`,
    [prefix, likeToken]
  );

  return mapCountRows(result.rows);
};

const fetchSavedTrialMachines = async ({ prefix = '', department = '' } = {}) => {
  const likeToken = `%${prefix}%`;
  const deptToken = `%${department}%`;
  const result = await client.query(
    `SELECT mccode, mcname, deptcode, deptname
     FROM ticketing_system.mc_master
     WHERE ($1::text = '' OR mccode::text ILIKE $2 OR mcname ILIKE $2)
       AND ($3::text = '' OR deptname ILIKE $4)
     ORDER BY deptname, mcname
     LIMIT 100`,
    [prefix, likeToken, department, deptToken]
  );

  return mapMachineRows(result.rows);
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
    const prefix = String(req.query.count_prefix || req.query.prefix || '').trim();

    if (!sqlServer.hasSqlServerEnv()) {
      const data = await fetchSavedTrialCountMaster(prefix);
      return res.status(200).json(buildCountDropdownPayload('postgres-fallback', data));
    }

    const data = mapCountRows(await fetchCountMaster(prefix));
    return res.status(200).json(buildCountDropdownPayload('sqlserver', data));
  } catch (error) {
    console.error('Error fetching trials count names from SQL Server:', error);
    next(error);
  }
};

const getEmployeeMasterDropdown = createEmployeeMasterDropdown(sqlServer, 'trials');

const ensureTrialsColumns = async () => {
  await client.query(`
    ALTER TABLE trials.trials
      ADD COLUMN IF NOT EXISTS entry_time TIME,
      ADD COLUMN IF NOT EXISTS mc_no VARCHAR(100),
      ADD COLUMN IF NOT EXISTS product VARCHAR(100),
      ADD COLUMN IF NOT EXISTS trial_type VARCHAR(100),
      ADD COLUMN IF NOT EXISTS raw_material_mixing VARCHAR(255),
      ADD COLUMN IF NOT EXISTS yarn_remarks TEXT,
      ADD COLUMN IF NOT EXISTS jm DECIMAL(6,2),
      ADD COLUMN IF NOT EXISTS cvb DECIMAL(6,2),
      ADD COLUMN IF NOT EXISTS fl_cut DECIMAL(6,2),
      ADD COLUMN IF NOT EXISTS fd_cut DECIMAL(6,2),
      ADD COLUMN IF NOT EXISTS df_drg_mc_no VARCHAR(100),
      ADD COLUMN IF NOT EXISTS df_finish_u_percent DECIMAL(6,2),
      ADD COLUMN IF NOT EXISTS df_cvim DECIMAL(6,2),
      ADD COLUMN IF NOT EXISTS df_cvb DECIMAL(6,2),
      ADD COLUMN IF NOT EXISTS smx_no VARCHAR(100),
      ADD COLUMN IF NOT EXISTS spl_no VARCHAR(100),
      ADD COLUMN IF NOT EXISTS roving_percent DECIMAL(6,2),
      ADD COLUMN IF NOT EXISTS smx_cvim DECIMAL(6,2);
  `);
  await client.query(`
    ALTER TABLE trials.trials
      ALTER COLUMN trial_id_name DROP NOT NULL;
  `);
  await client.query(`
    ALTER TABLE trials.trials
      ALTER COLUMN count_name TYPE VARCHAR(255),
      ALTER COLUMN user_id TYPE VARCHAR(255),
      ALTER COLUMN trial_id_name TYPE VARCHAR(255),
      ALTER COLUMN type TYPE VARCHAR(255),
      ALTER COLUMN nature TYPE VARCHAR(255),
      ALTER COLUMN spinning_machine TYPE VARCHAR(255),
      ALTER COLUMN unit_no TYPE VARCHAR(255),
      ALTER COLUMN autoconer_machine TYPE VARCHAR(255);
  `);
};

/**
 * @swagger
 * tags:
 *   name: Individual Card performance Data
 *   description: Individual Card performance Data (Carding Trials) APIs
 */


/**
 * @swagger
 * /trials:
 *   post:
 *     summary: Create a new Individual Card performance Data entry
 *     tags: [Individual Card performance Data]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - date
 *               - spinning_machine
 *               - count_name
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *               entry_date:
 *                 type: string
 *                 format: date
 *                 description: Alias for date
 *               time:
 *                 type: string
 *               entry_time:
 *                 type: string
 *                 description: Alias for time
 *               mc_no:
 *                 type: string
 *               spinning_machine:
 *                 type: string
 *               autoconer_machine:
 *                 type: string
 *               count_name:
 *                 type: string
 *               product:
 *                 type: string
 *               purpose:
 *                 type: string
 *               trial_id_name:
 *                 type: string
 *               type:
 *                 type: string
 *               entry_type:
 *                 type: string
 *                 description: Alias for type
 *               trial_type:
 *                 type: string
 *               nature:
 *                 type: string
 *               unit_no:
 *                 type: string
 *               raw_material:
 *                 type: string
 *               mixing:
 *                 type: string
 *               raw_material_mixing:
 *                 type: string
 *               yarn_remarks:
 *                 type: string
 *               cvb:
 *                 type: number
 *               fl_cut:
 *                 type: number
 *               fd_cut:
 *                 type: number
 *               jm:
 *                 type: number
 *               df_drg_mc_no:
 *                 type: string
 *               df_finish_u_percent:
 *                 type: number
 *               df_cvim:
 *                 type: number
 *               df_cvb:
 *                 type: number
 *               smx_no:
 *                 type: string
 *               spl_no:
 *                 type: string
 *               roving_percent:
 *                 type: number
 *               smx_cvim:
 *                 type: number
 *     responses:
 *       201:
 *         description: Individual Card performance Data entry created successfully
 *       500:
 *         description: Server error
 */

const toNumberOrNull = (value) =>
    value === '' || value === null || typeof value === 'undefined' ? null : value;

let trialsEntryIdColumnReady = false;
const ensureTrialsEntryIdColumn = async () => {
    if (trialsEntryIdColumnReady) return;
    await client.query(`
        ALTER TABLE trials.trials
            ADD COLUMN IF NOT EXISTS entry_id TEXT;
    `);
    await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS trials_trials_entry_id_uq
        ON trials.trials (entry_id)
        WHERE entry_id IS NOT NULL;
    `);
    trialsEntryIdColumnReady = true;
};

router.post('/', async (req, res) => {

    try {

<<<<<<< HEAD
        await ensureTrialsEntryIdColumn();

        const data = req.body;
=======
        await ensureTrialsColumns();

        const raw = req.body;
        const data = Object.fromEntries(
            Object.entries(raw).map(([key, value]) => [key, value === '' ? null : value])
        );
        const entryDate = data.date ?? data.entry_date;
        const entryTime = data.time ?? data.entry_time;
        const entryType = data.type ?? data.entry_type;
>>>>>>> b1d24e10695c71395ee88867c7bef650d3242cfa

        if (!data.entry_id) {
            return res.status(400).json({ message: 'entry_id is required and must be unique' });
        }

        const result = await client.query(
            `INSERT INTO trials.trials(
                entry_id,
                date,
<<<<<<< HEAD
=======
                entry_time,
>>>>>>> b1d24e10695c71395ee88867c7bef650d3242cfa
                mc_no,
                spinning_machine,
                autoconer_machine,
                count_name,
                product,
<<<<<<< HEAD
                trial_type,
=======
                purpose,
                trial_id_name,
>>>>>>> b1d24e10695c71395ee88867c7bef650d3242cfa
                type,
                trial_type,
                nature,
<<<<<<< HEAD
                entry_time,
=======
                unit_no,
                raw_material,
                mixing,
>>>>>>> b1d24e10695c71395ee88867c7bef650d3242cfa
                raw_material_mixing,
                yarn_results,
                yarn_remarks,
                user_id,
                u_percent,
                cvm,
                cvm_cv_percent,
                cvm_10mtr,
                dr_1_5m,
                thin_minus_50,
                thick_plus_50,
                neps_plus_200,
                total_regular,
                thin_minus_40,
                thick_plus_35,
                neps_plus_140,
                total_hs,
                thin_minus_30,
                yarn_count,
                csp,
                total_cuts,
                neps_cuts,
                shorts_cuts,
                long_cuts,
                thin_cuts,
                cp,
                cm,
                ccp,
                ccm,
                jp,
                jm,
                a1,
                a2,
                a3,
                a4,
                b1,
                b2,
                b3,
                b4,
                c1,
                c2,
                c3,
                c4,
                d1,
                d2,
                d3,
                d4,
                e,
                f,
                g,
                h1,
                h2,
                l1,
                l2,
                cvb,
                fl_cut,
                fd_cut,
<<<<<<< HEAD
=======
                user_id,
                u_percent,
                cvm,
                cvm_cv_percent,
                cvm_10mtr,
                dr_1_5m,
                thin_minus_50,
                thick_plus_50,
                neps_plus_200,
                total_regular,
                thin_minus_40,
                thick_plus_35,
                neps_plus_140,
                total_hs,
                thin_minus_30,
                yarn_count,
                csp,
                yarn_remarks,
>>>>>>> b1d24e10695c71395ee88867c7bef650d3242cfa
                df_drg_mc_no,
                df_finish_u_percent,
                df_cvim,
                df_cvb,
                smx_no,
                spl_no,
                roving_percent,
                smx_cvim
            )
            VALUES(
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
                $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
                $41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
                $51,$52,$53,$54,$55,$56,$57,$58,$59,$60,
                $61,$62,$63,$64,$65,$66,$67,$68,$69,$70,
<<<<<<< HEAD
                $71,$72,$73,$74,$75,$76
            )
            RETURNING *`,
            [
                data.entry_id,
                data.date,
=======
                $71,$72,$73,$74,$75,$76,$77,$78,$79,$80
            )
            RETURNING *`,
            [
                entryDate,
                entryTime,
>>>>>>> b1d24e10695c71395ee88867c7bef650d3242cfa
                data.mc_no,
                data.spinning_machine,
                data.autoconer_machine,
                data.count_name,
                data.product,
<<<<<<< HEAD
                data.trial_type,
                data.type,
                data.nature,
                data.entry_time || null,
                data.raw_material_mixing,
                data.yarn_results,
                data.yarn_remarks,
                data.user_id,
                toNumberOrNull(data.u_percent),
                toNumberOrNull(data.cvm),
                toNumberOrNull(data.cvm_cv_percent),
                toNumberOrNull(data.cvm_10mtr),
                toNumberOrNull(data.dr_1_5m),
                toNumberOrNull(data.thin_minus_50),
                toNumberOrNull(data.thick_plus_50),
                toNumberOrNull(data.neps_plus_200),
                toNumberOrNull(data.total_regular),
                toNumberOrNull(data.thin_minus_40),
                toNumberOrNull(data.thick_plus_35),
                toNumberOrNull(data.neps_plus_140),
                toNumberOrNull(data.total_hs),
                toNumberOrNull(data.thin_minus_30),
                toNumberOrNull(data.yarn_count),
                toNumberOrNull(data.csp),
                toNumberOrNull(data.total_cuts),
                toNumberOrNull(data.neps_cuts),
                toNumberOrNull(data.shorts_cuts),
                toNumberOrNull(data.long_cuts),
                toNumberOrNull(data.thin_cuts),
                toNumberOrNull(data.cp),
                toNumberOrNull(data.cm),
                toNumberOrNull(data.ccp),
                toNumberOrNull(data.ccm),
                toNumberOrNull(data.jp),
                toNumberOrNull(data.jm),
                toNumberOrNull(data.a1),
                toNumberOrNull(data.a2),
                toNumberOrNull(data.a3),
                toNumberOrNull(data.a4),
                toNumberOrNull(data.b1),
                toNumberOrNull(data.b2),
                toNumberOrNull(data.b3),
                toNumberOrNull(data.b4),
                toNumberOrNull(data.c1),
                toNumberOrNull(data.c2),
                toNumberOrNull(data.c3),
                toNumberOrNull(data.c4),
                toNumberOrNull(data.d1),
                toNumberOrNull(data.d2),
                toNumberOrNull(data.d3),
                toNumberOrNull(data.d4),
                toNumberOrNull(data.e),
                toNumberOrNull(data.f),
                toNumberOrNull(data.g),
                toNumberOrNull(data.h1),
                toNumberOrNull(data.h2),
                toNumberOrNull(data.l1),
                toNumberOrNull(data.l2),
                toNumberOrNull(data.cvb),
                toNumberOrNull(data.fl_cut),
                toNumberOrNull(data.fd_cut),
                data.df_drg_mc_no,
                toNumberOrNull(data.df_finish_u_percent),
                toNumberOrNull(data.df_cvim),
                toNumberOrNull(data.df_cvb),
                data.smx_no,
                data.spl_no,
                toNumberOrNull(data.roving_percent),
                toNumberOrNull(data.smx_cvim)
=======
                data.purpose,
                data.trial_id_name,
                entryType,
                data.trial_type,
                data.nature,
                data.unit_no,
                data.raw_material,
                data.mixing,
                data.raw_material_mixing,
                data.yarn_results,
                data.total_cuts,
                data.neps_cuts,
                data.shorts_cuts,
                data.long_cuts,
                data.thin_cuts,
                data.cp,
                data.cm,
                data.ccp,
                data.ccm,
                data.jp,
                data.jm,
                data.a1,
                data.a2,
                data.a3,
                data.a4,
                data.b1,
                data.b2,
                data.b3,
                data.b4,
                data.c1,
                data.c2,
                data.c3,
                data.c4,
                data.d1,
                data.d2,
                data.d3,
                data.d4,
                data.e,
                data.f,
                data.g,
                data.h1,
                data.h2,
                data.l1 ?? data.i1,
                data.l2 ?? data.i2,
                data.cvb ?? data.cvp,
                data.fl_cut,
                data.fd_cut,
                data.user_id,
                data.u_percent,
                data.cvm,
                data.cvm_cv_percent,
                data.cvm_10mtr,
                data.dr_1_5m,
                data.thin_minus_50,
                data.thick_plus_50,
                data.neps_plus_200,
                data.total_regular,
                data.thin_minus_40,
                data.thick_plus_35,
                data.neps_plus_140,
                data.total_hs,
                data.thin_minus_30,
                data.yarn_count,
                data.csp,
                data.yarn_remarks,
                data.df_drg_mc_no,
                data.df_finish_u_percent,
                data.df_cvim,
                data.df_cvb,
                data.smx_no,
                data.spl_no,
                data.roving_percent,
                data.smx_cvim
>>>>>>> b1d24e10695c71395ee88867c7bef650d3242cfa
            ]
        );

        res.status(201).json(result.rows[0]);

    } catch (err) {

        if (err && err.code === '23505') {
            return res.status(409).json({ message: 'Duplicate entry_id. Please use a unique ID.' });
        }
        console.error('Error inserting trial data:', err);
        res.status(500).json({ message: 'Server error' });

    }

});


/**
 * @swagger
 * /trials:
 *   get:
 *     summary: Get Individual Card performance Data with pagination
 *     tags: [Individual Card performance Data]
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
 *         description: Individual Card performance Data retrieved successfully
 *       500:
 *         description: Server error
 */

router.get('/', async (req, res) => {

    try {

        await ensureTrialsEntryIdColumn();

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const result = await client.query(
            `SELECT * FROM trials.trials
             ORDER BY date DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        res.status(200).json(result.rows);

    } catch (err) {

        console.error('Error fetching trials:', err);
        res.status(500).json({ message: 'Server error' });

    }

});

/**
 * @swagger
 * /trials/master/spinning-machines:
 *   get:
 *     summary: Get spinning machine names for Trials form
 *     tags: [Individual Card performance Data]
 *     parameters:
 *       - in: query
 *         name: prefix
 *         schema:
 *           type: string
 *         description: Optional machine-name contains filter
 *     responses:
 *       200:
 *         description: Spinning machines fetched successfully
 *       503:
 *         description: SQL Server config missing
 *       500:
 *         description: Server error
 */
router.get('/master/counts', getCountMasterDropdown);
router.get('/master/count-dropdown', getCountMasterDropdown);
router.get('/master/count-names', getCountMasterDropdown);
router.get('/master/employees', getEmployeeMasterDropdown);
router.get('/master/employee-dropdown', getEmployeeMasterDropdown);
router.get('/master/employee-names', getEmployeeMasterDropdown);
router.get('/master/user-names', getEmployeeMasterDropdown);

router.get('/master/spinning-machines', async (req, res) => {
  try {
    const prefix = String(req.query.prefix || '').trim();

    if (!sqlServer.hasSqlServerEnv()) {
      const data = await fetchSavedTrialMachines({ prefix, department: 'spinning' });
      return res.status(200).json({
        source: 'postgres-fallback',
        data,
        machine_names: data.map((r) => r.mc_name),
        names: data.map((r) => r.mc_name)
      });
    }

    const likeToken = `%${prefix}%`;

    const result = await sqlServer.query(
      `SELECT
         CAST(m.MCCODE AS VARCHAR(50)) AS mc_no,
         LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) AS mc_name,
         CAST(m.DEPTCODE AS VARCHAR(50)) AS dept_code,
         LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) AS dept_name
       FROM dbo.MCMASTER m
       JOIN dbo.dept_mai d ON m.DEPTCODE = d.DEPTCODE
       WHERE m.compcode = '1'
         AND LOWER(LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255))))) LIKE '%spinning%'
         AND (@prefix = '' OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @machinePrefix)
       ORDER BY m.MCNAME`,
      { prefix, machinePrefix: likeToken }
    );

    const data = mapMachineRows(result.recordset || []);
    return res.status(200).json({
      source: 'sqlserver',
      data,
      machine_names: data.map((r) => r.mc_name),
      names: data.map((r) => r.mc_name)
    });
  } catch (err) {
    console.error('Error fetching spinning machines from SQL Server:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /trials/master/autoconer-machines:
 *   get:
 *     summary: Get autoconer machine names for Trials form
 *     tags: [Individual Card performance Data]
 *     parameters:
 *       - in: query
 *         name: prefix
 *         schema:
 *           type: string
 *         description: Optional machine-name contains filter
 *     responses:
 *       200:
 *         description: Autoconer machines fetched successfully
 *       503:
 *         description: SQL Server config missing
 *       500:
 *         description: Server error
 */
router.get('/master/autoconer-machines', async (req, res) => {
  try {
    const prefix = String(req.query.prefix || '').trim();

    if (!sqlServer.hasSqlServerEnv()) {
      const data = await fetchSavedTrialMachines({ prefix, department: 'autocon' });
      return res.status(200).json({
        source: 'postgres-fallback',
        data,
        machine_names: data.map((r) => r.mc_name),
        names: data.map((r) => r.mc_name)
      });
    }

    const likeToken = `%${prefix}%`;

    const result = await sqlServer.query(
      `SELECT
         CAST(m.MCCODE AS VARCHAR(50)) AS mc_no,
         LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) AS mc_name,
         CAST(m.DEPTCODE AS VARCHAR(50)) AS dept_code,
         LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) AS dept_name
       FROM dbo.MCMASTER m
       JOIN dbo.dept_mai d ON m.DEPTCODE = d.DEPTCODE
       WHERE m.compcode = '1'
         AND (
           LOWER(LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255))))) LIKE '%autoconer%'
           OR LOWER(LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255))))) LIKE '%autocone%'
         )
         AND (@prefix = '' OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @machinePrefix)
       ORDER BY m.MCNAME`,
      { prefix, machinePrefix: likeToken }
    );

    const data = mapMachineRows(result.recordset || []);
    return res.status(200).json({
      source: 'sqlserver',
      data,
      machine_names: data.map((r) => r.mc_name),
      names: data.map((r) => r.mc_name)
    });
  } catch (err) {
    console.error('Error fetching autoconer machines from SQL Server:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /trials/master/varieties:
 *   get:
 *     summary: Get variety names for Trials/Nati Data Entry form
 *     tags: [Individual Card performance Data]
 *     parameters:
 *       - in: query
 *         name: prefix
 *         schema:
 *           type: string
 *         description: Optional variety-name contains filter
 *     responses:
 *       200:
 *         description: Variety names fetched successfully
 *       503:
 *         description: SQL Server config missing
 *       500:
 *         description: Server error
 */
router.get('/master/varieties', async (req, res) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const prefix = String(req.query.prefix || '').trim();
    const likeToken = `%${prefix}%`;

    const result = await sqlServer.query(
      `SELECT\n         MIN(CAST(v.VARCODE AS VARCHAR(50))) AS var_code,\n         LTRIM(RTRIM(CAST(v.VARNAME AS VARCHAR(255)))) AS variety_name\n       FROM dbo.VARIETY v\n       WHERE v.compcode = '1'\n         AND LTRIM(RTRIM(CAST(v.VARNAME AS VARCHAR(255)))) <> ''\n         AND (@prefix = '' OR LTRIM(RTRIM(CAST(v.VARNAME AS VARCHAR(255)))) LIKE @varietyPrefix)\n       GROUP BY LTRIM(RTRIM(CAST(v.VARNAME AS VARCHAR(255))))\n       ORDER BY MIN(CASE WHEN ISNUMERIC(CAST(v.VARCODE AS VARCHAR(50))) = 1 THEN CAST(v.VARCODE AS INT) ELSE 2147483647 END), variety_name`,
      { prefix, varietyPrefix: likeToken }
    );

    const data = dedupeVarieties(result.recordset || []);

    return res.status(200).json({
      source: 'sqlserver',
      data,
      names: data.map((r) => r.variety_name)
    });
  } catch (err) {
    console.error('Error fetching variety names from SQL Server:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;


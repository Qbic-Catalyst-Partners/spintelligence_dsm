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

/**
 * @swagger
 * tags:
 *   name: Trials
 *   description: Trials Department APIs
 */


/**
 * @swagger
 * /trials:
 *   post:
 *     summary: Create a new Trial entry
 *     tags: [Trials]
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
 *               - trial_id_name
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *               spinning_machine:
 *                 type: string
 *               autoconer_machine:
 *                 type: string
 *               count_name:
 *                 type: string
 *               purpose:
 *                 type: string
 *               trial_id_name:
 *                 type: string
 *               type:
 *                 type: string
 *               nature:
 *                 type: string
 *               unit_no:
 *                 type: string
 *               raw_material:
 *                 type: string
 *               mixing:
 *                 type: string
 *     responses:
 *       201:
 *         description: Trial created successfully
 *       500:
 *         description: Server error
 */

router.post('/', async (req, res) => {

    try {

        const data = req.body;

        const result = await client.query(
            `INSERT INTO trials.trials(
                date,
                spinning_machine,
                autoconer_machine,
                count_name,
                purpose,
                trial_id_name,
                type,
                nature,
                unit_no,
                raw_material,
                mixing,
                yarn_results,
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
                cvp,
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
                csp
            )
            VALUES(
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
                $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
                $41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
                $51,$52,$53,$54,$55,$56,$57,$58,$59,$60,
                $61,$62,$63,$64
            )
            RETURNING *`,
            [
                data.date,
                data.spinning_machine,
                data.autoconer_machine,
                data.count_name,
                data.purpose,
                data.trial_id_name,
                data.type,
                data.nature,
                data.unit_no,
                data.raw_material,
                data.mixing,
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
                data.l1,
                data.l2,
                data.cvp,
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
                data.csp
            ]
        );

        res.status(201).json(result.rows[0]);

    } catch (err) {

        console.error('Error inserting trial data:', err);
        res.status(500).json({ message: 'Server error' });

    }

});


/**
 * @swagger
 * /trials:
 *   get:
 *     summary: Get Trials with pagination
 *     tags: [Trials]
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
 *         description: Trials retrieved successfully
 *       500:
 *         description: Server error
 */

router.get('/', async (req, res) => {

    try {

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
 *     tags: [Trials]
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
 *     tags: [Trials]
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
 *     tags: [Trials]
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


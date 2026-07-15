const { dedupeVarieties } = require('../utils/variety');
const { fetchPrepVarieties, isDatabaseAccessDenied } = require('../utils/prepVariety');

const UQC_SHIFTS = [
  { value: 'General', label: 'General' },
  { value: 'Day', label: 'Day' },
  { value: 'Halfnight', label: 'Halfnight' },
  { value: 'Fullnight', label: 'Fullnight' }
];

const toOption = (text, value = text) => ({ text, label: text, value });

const fetchErpVarieties = async (sqlServer, prefix) => {
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
    { prefix, varietyPrefix: `%${prefix}%` }
  );

  return dedupeVarieties(result.recordset || []);
};

const getUqcMasterData = async (sqlServer, query = {}, options = {}) => {
  if (!sqlServer.hasSqlServerEnv()) {
    const error = new Error('SQL Server is not configured on backend');
    error.statusCode = 503;
    throw error;
  }

  const varietyPrefix = String(query.variety_prefix || query.prefix || '').trim();
  const departmentPrefix = String(query.department_prefix || query.prefix || '').trim();
  const mcNoPrefix = String(query.mc_no_prefix || query.prefix || '').trim();
  const department = String(query.department || '').trim();
  const departmentCode = String(query.department_code || '').trim();

  const varietyPromise = options.varietySqlServer
    ? fetchPrepVarieties(options.varietySqlServer, varietyPrefix)
    : fetchErpVarieties(sqlServer, varietyPrefix);

  const [varieties, departmentResult, mcResult] = await Promise.all([
    varietyPromise,
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
         AND (@prefix = '' OR CAST(m.MCCODE AS VARCHAR(50)) LIKE @mcNoPrefix OR LTRIM(RTRIM(CAST(m.MCNAME AS VARCHAR(255)))) LIKE @mcNoPrefix)
         AND (@department = '' OR LTRIM(RTRIM(CAST(d.DEPTNAME AS VARCHAR(255)))) LIKE @departmentLike)
         AND (@departmentCode = '' OR CAST(m.DEPTCODE AS VARCHAR(50)) = @departmentCode)
       ORDER BY d.DEPTNAME, CASE WHEN ISNUMERIC(CAST(m.MCCODE AS VARCHAR(50))) = 1 THEN CAST(m.MCCODE AS INT) ELSE 2147483647 END, m.MCCODE`,
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
  })).filter((r) => r.mc_no || r.mc_name);

  const shiftOptions = [toOption('-- Select Shift --', ''), ...UQC_SHIFTS.map((s) => toOption(s.label, s.value))];
  const varietyOptions = [toOption('-- Select Variety --', ''), ...varieties.map((v) => toOption(v.variety_name))];
  const departmentOptions = [toOption('-- Select Department --', ''), ...departments.map((d) => toOption(d.dept_name))];
  const mcNoOptions = [toOption('-- Select MC No. --', ''), ...mcNos.map((m) => toOption(m.mc_name || m.mc_no))];

  return {
    source: options.varietySqlServer ? 'sqlserver:dsmprojects+erp' : 'sqlserver',
    variety_source: options.varietySqlServer ? 'dsmprojects.dbo.prepvariety' : 'erp.dbo.VARIETY',
    shifts: UQC_SHIFTS,
    shift_values: UQC_SHIFTS.map((s) => s.value),
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
  };
};

const sendUqcMasterData = async (req, res, next, sqlServer, options = {}) => {
  try {
    const payload = await getUqcMasterData(sqlServer, req.query, options);

    if (req.path.endsWith('/varieties')) {
      return res.status(200).json({
        source: payload.source,
        data: payload.varieties,
        names: payload.variety_names,
        variety_names: payload.variety_names,
        values: payload.variety_names,
        options: payload.options.variety
      });
    }

    if (req.path.endsWith('/departments')) {
      return res.status(200).json({
        source: payload.source,
        data: payload.departments,
        names: payload.department_names,
        department_names: payload.department_names,
        values: payload.department_names,
        options: payload.options.department
      });
    }

    if (req.path.endsWith('/mc-nos')) {
      const values = payload.mc_nos.map((r) => r.mc_name || r.mc_no);
      return res.status(200).json({
        source: payload.source,
        data: payload.mc_nos,
        names: values,
        mc_nos: payload.mc_nos,
        mc_no_values: payload.mc_no_values,
        values,
        options: payload.options.mc_no
      });
    }

    return res.status(200).json(payload);
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

    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

module.exports = {
  getUqcMasterData,
  sendUqcMasterData
};

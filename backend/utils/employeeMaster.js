const fetchActiveEmployees = async (sqlServer, prefix = '') => {
  const result = await sqlServer.query(
    `SELECT
       CAST(e.Emplno AS VARCHAR(50)) AS employee_code,
       LTRIM(RTRIM(CAST(e.Name AS VARCHAR(255)))) AS employee_name
     FROM dbo.EMPLOYEEMAS e
     WHERE e.DateOfReleave = CONVERT(datetime, '9999-01-01 00:00:00.000', 121)
       AND LTRIM(RTRIM(CAST(e.Name AS VARCHAR(255)))) <> ''
       AND (
         @prefix = ''
         OR LTRIM(RTRIM(CAST(e.Name AS VARCHAR(255)))) LIKE @prefixLike
         OR CAST(e.Emplno AS VARCHAR(50)) LIKE @prefixLike
       )
     ORDER BY LTRIM(RTRIM(CAST(e.Name AS VARCHAR(255))))`,
    { prefix, prefixLike: `%${prefix}%` }
  );

  return result.recordset || [];
};

const buildEmployeeOptions = (employees) => [
  { text: '-- Select Employee --', label: '-- Select Employee --', value: '' },
  ...employees.map((employee) => ({
    text: employee.employee_name,
    label: employee.employee_name,
    value: employee.employee_name,
    employee_code: employee.employee_code,
    employee_name: employee.employee_name,
    empl_no: employee.employee_code,
    name: employee.employee_name
  }))
];

const createEmployeeMasterDropdown = (sqlServer, moduleName = 'module') => async (req, res, next) => {
  try {
    if (!sqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const prefix = String(
      req.query.employee_prefix ||
      req.query.user_prefix ||
      req.query.operator_prefix ||
      req.query.checker_prefix ||
      req.query.prefix ||
      ''
    ).trim();
    const data = await fetchActiveEmployees(sqlServer, prefix);
    const options = buildEmployeeOptions(data);
    const names = data.map((row) => row.employee_name);

    return res.status(200).json({
      source: 'sqlserver',
      table: 'EMPLOYEEMAS',
      active_filter: "DateOfReleave = '9999-01-01 00:00:00.000'",
      data,
      employees: data,
      employee_names: names,
      user_names: names,
      operator_names: names,
      checker_names: names,
      checked_by_names: names,
      names,
      values: names,
      options,
      dropdown_options: {
        employee_name: options,
        user_name: options,
        operator_name: options,
        checker_name: options,
        checked_by: options,
        checkedBy: options,
        employeename: options
      }
    });
  } catch (error) {
    console.error(`Error fetching ${moduleName} employees from SQL Server:`, error);
    next(error);
  }
};

module.exports = {
  fetchActiveEmployees,
  createEmployeeMasterDropdown
};

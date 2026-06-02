import api from "./apiConfig";

const MODULE_ENDPOINTS = {
  autoconer: [
    "/autoconer/master/employee-dropdown",
    "/autoconer/master/employees",
    "/autoconer/master/employee-names",
  ],
  blowroom: [
    "/blowroom/master/employee-dropdown",
    "/blowroom/master/employees",
    "/blowroom/master/employee-names",
  ],
  "blowroom-checked-by": [
    "/blowroom/master/checked-by-dropdown",
    "/blowroom/sync/master/checked-by-dropdown",
    "/blowroom/drop-test/master/checked-by-dropdown",
    "/blowroom/br-waste-study/master/checked-by-dropdown",
    "/blowroom/master/employee-dropdown",
  ],
  carding: [
    "/carding/master/employee-dropdown",
    "/carding/master/employees",
    "/carding/master/employee-names",
  ],
  comber: [
    "/comber/master/employees",
    "/comber/master/employee-dropdown",
    "/comber/master/employee-names",
  ],
  drawframe: [
    "/drawframe/master/employee-dropdown",
    "/drawframe/master/employees",
    "/drawframe/master/employee-names",
  ],
  mixing: [
    "/mixing/master/employee-dropdown",
    "/mixing/master/employees",
    "/mixing/master/employee-names",
  ],
  simplex: [
    "/simplex/master/operator-names",
    "/simplex/master/employee-dropdown",
    "/simplex/master/employees",
    "/simplex/master/employee-names",
  ],
  spinning: [
    "/spinning/master/employee-names",
    "/spinning/master/employee-dropdown",
    "/spinning/master/employees",
    "/spinning/master/checker-names",
    "/spinning/master/operator-names",
  ],
  trials: [
    "/trials/master/employee-dropdown",
    "/trials/master/employees",
    "/trials/master/employee-names",
  ],
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const optionRowsFromOptions = (options = {}) => {
  if (Array.isArray(options)) return options;
  return [
    ...asArray(options.employee),
    ...asArray(options.employee_name),
    ...asArray(options.employees),
    ...asArray(options.user_name),
    ...asArray(options.user),
    ...asArray(options.operator_name),
    ...asArray(options.operator),
    ...asArray(options.checker_name),
    ...asArray(options.checker),
    ...asArray(options.checked_by),
    ...asArray(options.checkedBy),
    ...asArray(options.name),
  ];
};

export const normalizeEmployeeOptions = (payload = {}) => {
  const rows = [
    ...optionRowsFromOptions(payload.options),
    ...optionRowsFromOptions(payload.dropdown_options),
    ...asArray(payload.data),
    ...asArray(payload.employees),
    ...asArray(payload.employee_names),
    ...asArray(payload.user_names),
    ...asArray(payload.operator_names),
    ...asArray(payload.checker_names),
    ...asArray(payload.checked_by_names),
    ...asArray(payload.names),
    ...asArray(payload.values),
  ];
  const seen = new Set();

  return rows
    .map((row) => {
      const employeeName = String(
        row?.employee_name ??
          row?.employeeName ??
          row?.empname ??
          row?.EmpName ??
          row?.EMPNAME ??
          row?.user_name ??
          row?.operator_name ??
          row?.checker_name ??
          row?.checked_by ??
          row?.checkedBy ??
          row?.name ??
          row?.text ??
          row?.label ??
          row?.value ??
          row ??
          ""
      ).trim();
      const employeeCode = String(
        row?.employee_code ??
          row?.employeeCode ??
          row?.empcode ??
          row?.EmpCode ??
          row?.EMPCODE ??
          row?.code ??
          ""
      ).trim();

      return employeeName
        ? {
            employee_code: employeeCode,
            employee_name: employeeName,
            value: employeeName,
            label: employeeName,
          }
        : null;
    })
    .filter((option) => {
      const key = option?.employee_name?.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const fetchEmployeeOptions = async ({ module = "mixing", prefix = "" } = {}) => {
  const endpoints = MODULE_ENDPOINTS[module] || MODULE_ENDPOINTS.mixing;
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await api.get(
        endpoint,
        { prefix, employee_prefix: prefix, name_prefix: prefix },
        { skipGlobalErrorModal: true }
      );
      const options = normalizeEmployeeOptions(response.data);
      if (options.length || endpoint === endpoints[endpoints.length - 1]) return options;
    } catch (error) {
      lastError = error;
      if (error.response?.status && error.response.status !== 404) break;
    }
  }

  if (lastError?.response?.data) {
    throw new Error(
      lastError.response.data.message ||
        lastError.response.data.error ||
        "Failed to load employee names."
    );
  }
  throw new Error(lastError?.message || "Failed to load employee names.");
};

export const fetchEmployeeNames = async (params = {}) => {
  const options = await fetchEmployeeOptions(params);
  return options.map((option) => option.employee_name);
};

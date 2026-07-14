import apiConfig from "./apiConfig";

const extractErrorMessage = (error, fallbackMessage) => {
  const responseData = error?.response?.data;

  if (typeof responseData === "string") {
    const preMatch = responseData.match(/<pre>([\s\S]*?)<\/pre>/i);
    if (preMatch?.[1]) {
      return preMatch[1]
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, " ")
        .trim();
    }

    return responseData.trim() || fallbackMessage;
  }

  if (responseData?.message) {
    return responseData.message;
  }

  return error?.message || fallbackMessage;
};

const uniqueStrings = (values = []) =>
  Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));

const cleanMcNoLabel = (value) =>
  String(value || "")
    .trim()
    .replace(/^\d+\s*\/\s*/, "");

const normalizeOptionRows = (rows = []) =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => {
      if (typeof row === "string") {
        const value = row.trim();
        return value ? { value, label: value } : null;
      }

      const value = String(row?.value ?? row?.text ?? "").trim();
      const label = String(row?.text ?? row?.label ?? row?.value ?? "").trim();
      return value || label ? { value: value || label, label: label || value } : null;
    })
    .filter(Boolean);

const SIMPLEX_UQC_MASTER_DROPDOWN_ENDPOINTS = [
  "/simplex/uqc/master/dropdown",
  "/simplex/master/dropdown",
];

const SIMPLEX_UQC_MASTER_VARIETY_ENDPOINTS = [
  "/simplex/uqc/master/varieties",
  "/simplex/master/varieties",
];

const SIMPLEX_UQC_MASTER_DEPARTMENT_ENDPOINTS = [
  "/simplex/uqc/master/departments",
  "/simplex/master/departments",
];

const SIMPLEX_UQC_MASTER_MC_NO_ENDPOINTS = [
  "/simplex/uqc/master/mc-nos",
  "/simplex/master/mc-nos",
];

const pickFirstValue = (row, keys = []) => {
  if (!row || typeof row !== "object") return row;

  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return value;
    }
  }

  return row.value ?? row.text ?? row.label ?? row.name;
};

const mapRowsToValues = (rows = [], keys = []) =>
  uniqueStrings((Array.isArray(rows) ? rows : []).map((row) => pickFirstValue(row, keys)));

const normalizeDepartmentRows = (rows = []) =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => {
      if (typeof row === "string") {
        const deptName = row.trim();
        return deptName ? { dept_code: "", dept_name: deptName } : null;
      }

      const deptCode = String(row?.dept_code ?? row?.department_code ?? row?.DEPTCODE ?? "").trim();
      const deptName = String(
        row?.dept_name ??
          row?.deptname ??
          row?.DEPTNAME ??
          row?.department_name ??
          row?.department ??
          row?.DEPARTMENT ??
          row?.name ??
          row?.value ??
          ""
      ).trim();
      return deptName ? { dept_code: deptCode, dept_name: deptName } : null;
    })
    .filter(Boolean);

const normalizeMcNoRows = (rows = []) =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => {
      if (typeof row === "string") {
        const mcNo = row.trim();
        return mcNo
          ? {
              mc_no: mcNo,
              mc_name: cleanMcNoLabel(mcNo),
              dept_code: "",
              dept_name: "",
              value: mcNo,
              label: cleanMcNoLabel(mcNo),
            }
          : null;
      }

      const mcNo = String(
        row?.value ??
          row?.full_mc_no ??
          row?.fullMcNo ??
          row?.mc_full_no ??
          row?.mc_no_full ??
          row?.mc_no ??
          row?.mccode ??
          row?.MCCODE ??
          ""
      ).trim();
      const mcName = cleanMcNoLabel(
        row?.label ??
          row?.text ??
          row?.mc_name ??
          row?.mcname ??
          row?.MCNAME ??
          mcNo
      );
      const deptCode = String(row?.dept_code ?? row?.department_code ?? row?.DEPTCODE ?? "").trim();
      const deptName = String(row?.dept_name ?? row?.deptname ?? row?.DEPTNAME ?? "").trim();
      return mcNo
        ? {
            mc_no: mcNo,
            mc_name: mcName,
            dept_code: deptCode,
            dept_name: deptName,
            value: mcNo,
            label: mcName,
          }
        : null;
    })
    .filter(Boolean);

const normalizeCountRows = (rows = []) =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => {
      if (typeof row === "string") {
        const countName = row.trim();
        return countName ? { count_code: "", count_name: countName, value: countName, label: countName } : null;
      }

      const countCode = String(row?.count_code ?? row?.countCode ?? row?.cntcode ?? row?.code ?? "").trim();
      const countName = String(
        row?.count_name ?? row?.countName ?? row?.cntname ?? row?.name ?? row?.text ?? row?.label ?? row?.value ?? ""
      ).trim();
      return countName ? { count_code: countCode, count_name: countName, value: countName, label: countName } : null;
    })
    .filter(Boolean);

const normalizeCountPayload = (payload = {}) => {
  const options = payload.options || {};
  const rows = [
    ...(Array.isArray(options.count_name) ? options.count_name : []),
    ...(Array.isArray(options.count_names) ? options.count_names : []),
    ...(Array.isArray(payload.count_options) ? payload.count_options : []),
    ...(Array.isArray(payload.count_names) ? payload.count_names : []),
    ...(Array.isArray(payload.counts) ? payload.counts : []),
    ...(Array.isArray(payload.data) ? payload.data : []),
    ...(Array.isArray(payload) ? payload : []),
  ];
  const seen = new Set();
  return normalizeCountRows(rows).filter((row) => {
    if (seen.has(row.count_name)) return false;
    seen.add(row.count_name);
    return true;
  });
};

const mergeDepartmentRows = (...groups) => {
  const seen = new Set();
  return groups.flat().filter((row) => {
    const key = row?.dept_name;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const mergeMcNoRows = (...groups) => {
  const seen = new Set();
  return groups.flat().filter((row) => {
    const key = row?.mc_no;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const fetchFirstSimplexMasterPayload = async (endpoints, params) => {
  let lastError;

  for (const endpoint of endpoints) {
    try {
      const response = await apiConfig.get(endpoint, params, { skipGlobalErrorModal: true });
      return response?.data || {};
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

const SIMPLEX_NOTEBOOK_ENDPOINTS = [
  "/simplex/notebook",
  "/simplex/simplex-notebook",
  "/simplex/notebook/simplex",
];

const fetchFirstNotebookPayload = async (params = {}) => {
  let lastError;

  for (const endpoint of SIMPLEX_NOTEBOOK_ENDPOINTS) {
    try {
      const response = await apiConfig.get(endpoint, params, { skipGlobalErrorModal: true });
      return response?.data || {};
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

export const fetchSimplexWheelChangeNotebookEntries = async (params = {}) => {
  try {
    return await fetchFirstNotebookPayload(params);
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Unable to fetch simplex notebook entries."));
  }
};

export const submitSimplexWheelChangeNotebookEntry = async (payload) => {
  try {
    const response = await apiConfig.post("/simplex/notebook", payload);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Unable to submit simplex notebook entry."));
  }
};

/*
 * Dedicated simplex.wheel_change table (separate from the generic
 * /simplex/notebook catch-all above). JSONB parameters/rows blob, keyed by
 * machine_no for existing-value carry-forward and pending/rejected
 * supersede-on-resubmit, mirroring spinning/carding/drawframe.
 *
 * POST /simplex/wheel-change   requires entry_date, machine_no
 * GET  /simplex/wheel-change   ?machine_no=&wheel_change_type=&approval_status=
 * GET  /simplex/wheel-change/approvals            ?status=pending|approved
 * POST /simplex/wheel-change/approvals/:id/approve  body: { department }
 * POST /simplex/wheel-change/approvals/:id/reject   body: { department, reason }
 */
export const submitSimplexWheelChangeEntry = async (payload) => {
  try {
    const response = await apiConfig.post("/simplex/wheel-change", payload);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Unable to submit simplex wheel change entry."));
  }
};

export const fetchSimplexWheelChangeEntries = async (params = {}) => {
  try {
    const response = await apiConfig.get("/simplex/wheel-change", params, { skipGlobalErrorModal: true });
    return response?.data || {};
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Unable to fetch simplex wheel change entries."));
  }
};

export const fetchPendingSimplexWheelChangeApprovals = async (params = {}) => {
  try {
    const response = await apiConfig.get(
      "/simplex/wheel-change/approvals",
      { status: "pending", ...params },
      { skipGlobalErrorModal: true }
    );
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Unable to load pending simplex wheel change approvals."));
  }
};

export const fetchApprovedSimplexWheelChangeApprovals = async (params = {}) => {
  try {
    const response = await apiConfig.get(
      "/simplex/wheel-change/approvals",
      { status: "approved", ...params },
      { skipGlobalErrorModal: true }
    );
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Unable to load existing simplex wheel change approvals."));
  }
};

export const approveSimplexWheelChangeApproval = async (id, { department = "" } = {}) => {
  try {
    const response = await apiConfig.post(
      `/simplex/wheel-change/approvals/${encodeURIComponent(id)}/approve`,
      { department },
      { skipGlobalSuccessModal: true }
    );
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Unable to approve simplex wheel change entry."));
  }
};

export const rejectSimplexWheelChangeApproval = async (id, { department = "", reason = "" } = {}) => {
  try {
    const response = await apiConfig.post(
      `/simplex/wheel-change/approvals/${encodeURIComponent(id)}/reject`,
      { department, reason },
      { skipGlobalSuccessModal: true }
    );
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Unable to reject simplex wheel change entry."));
  }
};

export const submitSimplexUqcEntry = async (payload) => {
  try {
    const response = await apiConfig.post("/simplex/uqc", payload);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Invalid payload data."));
  }
};

export const submitSimplexStudyReportEntry = async (payload) => {
  try {
    const response = await apiConfig.post("/simplex/study", payload, {
      skipGlobalErrorModal: true,
    });
    return response.data;
  } catch (error) {
    const message = extractErrorMessage(error, "Invalid study report payload.");
    if (/shift must be one of:/i.test(message)) {
      throw new Error("Invalid study report payload.");
    }
    throw new Error(message);
  }
};

export const fetchSimplexStudyReportEntries = async () => {
  try {
    const response = await apiConfig.get("/simplex/list");
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Unable to fetch SMX Breaks Study Report entries."));
  }
};

export const submitSimplexCotsChangeEntry = async (payload) => {
  try {
    const response = await apiConfig.post("/simplex/SMXCotsChange", payload);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Invalid SMXCots Change payload."));
  }
};

export const submitSimplexProcessParameterEntry = async (payload) => {
  try {
    const response = await apiConfig.post("/simplex/process_parameter", payload);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Invalid simplex process parameter payload."));
  }
};

export const updateSimplexProcessParameterEntry = async (id, payload) => {
  try {
    const response = await apiConfig.put(`/simplex/process_parameter/${id}`, payload);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Unable to update simplex process parameter entry."));
  }
};

export const fetchSimplexProcessParameterEntries = async ({ page = 1, limit = 100 } = {}) => {
  try {
    const response = await apiConfig.get("/simplex/process_parameter", { page, limit });
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Unable to fetch simplex process parameter entries."));
  }
};

export const fetchSimplexUqcEntries = async ({ page = 1, limit = 10 } = {}) => {
  try {
    const response = await apiConfig.get("/simplex/uqc", { page, limit });
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Unable to fetch entries."));
  }
};

export const fetchSimplexCotsChangeEntries = async ({ page = 1, limit = 10 } = {}) => {
  try {
    const response = await apiConfig.get("/simplex/SMXCotsChange", { page, limit });
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Unable to fetch SMXCots Change entries."));
  }
};

export const fetchSimplexUqcMasterDropdown = async ({
  prefix = "",
  variety_prefix = "",
  department_prefix = "",
  mc_no_prefix = "",
  department_code = "",
} = {}) => {
  const params = {
    prefix,
    variety_prefix,
    department_prefix,
    mc_no_prefix,
    department_code,
  };
  let lastError;

  for (const endpoint of SIMPLEX_UQC_MASTER_DROPDOWN_ENDPOINTS) {
    try {
      const response = await apiConfig.get(endpoint, params, { skipGlobalErrorModal: true });
      const payload = response?.data || {};
      const options = payload.options || payload.dropdown_options || {};
      const optionShifts = normalizeOptionRows(options.shift || options.shifts);
      const optionVarieties = normalizeOptionRows(options.variety || options.varieties);
      const optionDepartments = normalizeOptionRows(options.department || options.departments);
      const optionMcNos = normalizeOptionRows(options.mc_no || options.mc_nos || options.machines);
      const departmentRows = mergeDepartmentRows(
        normalizeDepartmentRows(payload.departments),
        normalizeDepartmentRows(payload.data),
        optionDepartments.map((row) => ({ dept_code: "", dept_name: row.value }))
      );
      const mcNoRows = mergeMcNoRows(
        normalizeMcNoRows(payload.mc_nos),
        normalizeMcNoRows(payload.data),
        optionMcNos.map((row) => ({ mc_no: row.value, mc_name: row.label, dept_code: "", dept_name: "" }))
      );

      const dropdown = {
        shifts: uniqueStrings([
          ...(Array.isArray(payload.shifts)
            ? payload.shifts.map((row) => row?.value || row?.label || row?.shift_name || row?.SHIFTNAME || row)
            : []),
          ...optionShifts.map((row) => row.value),
        ]),
        varietyNames: uniqueStrings([
          ...(Array.isArray(payload.variety_names) ? payload.variety_names : []),
          ...(Array.isArray(payload.names) ? payload.names : []),
          ...(Array.isArray(payload.varieties)
            ? mapRowsToValues(payload.varieties, [
                "variety_name",
                "prep_variety_name",
                "VARIETY_NAME",
                "variety",
                "VARIETY",
                "name",
              ])
            : []),
          ...mapRowsToValues(payload.data, [
            "variety_name",
            "prep_variety_name",
            "VARIETY_NAME",
            "variety",
            "VARIETY",
            "name",
          ]),
          ...optionVarieties.map((row) => row.value),
        ]),
        departmentNames: uniqueStrings([
          ...(Array.isArray(payload.department_names) ? payload.department_names : []),
          ...departmentRows.map((row) => row.dept_name),
        ]),
        departments: departmentRows,
        mcNos: mergeMcNoRows(
          mcNoRows,
          normalizeMcNoRows(payload.mc_no_values)
        ),
        mcNoValues: uniqueStrings([
          ...(Array.isArray(payload.mc_no_values) ? payload.mc_no_values : []),
          ...mcNoRows.map((row) => row.mc_no),
        ]),
      };

      if (!dropdown.varietyNames.length) {
        const varietyPayload = await fetchFirstSimplexMasterPayload(
          SIMPLEX_UQC_MASTER_VARIETY_ENDPOINTS,
          params
        ).catch(() => null);
        dropdown.varietyNames = uniqueStrings([
         ...(Array.isArray(varietyPayload?.names) ? varietyPayload.names : []),
         ...(Array.isArray(varietyPayload?.variety_names) ? varietyPayload.variety_names : []),
          ...(Array.isArray(varietyPayload?.prep_variety_names) ? varietyPayload.prep_variety_names : []),
          ...mapRowsToValues(varietyPayload?.data, [
            "variety_name",
            "prep_variety_name",
            "VARIETY_NAME",
            "variety",
            "VARIETY",
            "name",
          ]),
        ]);
      }

      if (!dropdown.departmentNames.length) {
        const departmentPayload = await fetchFirstSimplexMasterPayload(
          SIMPLEX_UQC_MASTER_DEPARTMENT_ENDPOINTS,
          params
        ).catch(() => null);
        dropdown.departments = mergeDepartmentRows(
          normalizeDepartmentRows(departmentPayload?.data),
          normalizeDepartmentRows(departmentPayload?.departments),
          normalizeDepartmentRows(departmentPayload?.names),
          normalizeDepartmentRows(departmentPayload?.department_names)
        );
        dropdown.departmentNames = dropdown.departments.map((row) => row.dept_name);
      }

      if (!dropdown.mcNos.length) {
        const mcNoPayload = await fetchFirstSimplexMasterPayload(
          SIMPLEX_UQC_MASTER_MC_NO_ENDPOINTS,
          params
        ).catch(() => null);
        dropdown.mcNos = mergeMcNoRows(
          normalizeMcNoRows(mcNoPayload?.data),
          normalizeMcNoRows(mcNoPayload?.mc_nos),
          normalizeMcNoRows(mcNoPayload?.names),
          normalizeMcNoRows(mcNoPayload?.mc_no_values)
        );
        dropdown.mcNoValues = dropdown.mcNos.map((row) => row.mc_no);
      }

      if (dropdown.mcNos.length < 2) {
        const machineMaster = await fetchSimplexMachineMaster({
          department: department || "SIMPLEX",
          prefix,
        }).catch(() => []);
        dropdown.mcNos = mergeMcNoRows(
          dropdown.mcNos,
          normalizeMcNoRows(machineMaster)
        );
        dropdown.mcNoValues = dropdown.mcNos.map((row) => row.mc_no);
      }

      return dropdown;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(extractErrorMessage(lastError, "Unable to fetch Simplex UQC dropdown options."));
};

export const fetchSimplexStudyMachineNames = async ({ prefix = "" } = {}) => {
  const endpoints = ["/simplex/study/machine-names", "/simplex/study/master/machine-names"];
  let lastError;

  for (const endpoint of endpoints) {
    try {
      const response = await apiConfig.get(endpoint, { prefix });
      return response.data;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(extractErrorMessage(lastError, "Unable to fetch Simplex No options."));
};

export const fetchSimplexMachineMaster = async ({ department = "SIMPLEX", prefix = "" } = {}) => {
  const endpoints = ["/simplex/master/mc-nos", "/simplex/uqc/master/mc-nos", "/simplex/master/machine-numbers"];
  let lastError;

  const normalizeMachineRows = (payload = {}) => {
    const rows = [
      ...(Array.isArray(payload?.data) ? payload.data : []),
      ...(Array.isArray(payload?.mc_nos) ? payload.mc_nos : []),
      ...(Array.isArray(payload?.mc_no_values) ? payload.mc_no_values : []),
      ...(Array.isArray(payload?.machine_numbers) ? payload.machine_numbers : []),
      ...(Array.isArray(payload?.machine_nos) ? payload.machine_nos : []),
      ...(Array.isArray(payload?.machines) ? payload.machines : []),
      ...(Array.isArray(payload?.names) ? payload.names : []),
    ];

    const options = rows
      .map((row) => {
        if (typeof row === "string") {
          const value = row.trim();
          return value ? { value, label: value } : null;
        }

        const value = String(
          row?.mc_no ??
            row?.mcNo ??
            row?.machine_no ??
            row?.machineNo ??
            row?.machine_number ??
            row?.machineNumber ??
            row?.value ??
            row?.code ??
            ""
        ).trim();
        const label = String(row?.mc_name ?? row?.machine_name ?? row?.name ?? row?.label ?? row?.text ?? value).trim();
        const deptName = String(row?.dept_name ?? row?.department_name ?? row?.department ?? "").trim();
        const deptCode = String(row?.dept_code ?? row?.department_code ?? "").trim();
        return value ? { value, label: label || value, dept_name: deptName, dept_code: deptCode } : null;
      })
      .filter(Boolean);

    const seen = new Set();
    return options.filter((row) => {
      const key = row.value;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  for (const endpoint of endpoints) {
    try {
      const response = await apiConfig.get(
        endpoint,
        {
        },
        { skipGlobalErrorModal: true }
      );
      const options = normalizeMachineRows(response?.data || {});
      if (options.length || endpoint === endpoints[endpoints.length - 1]) {
        return options;
      }
    } catch (error) {
      lastError = error;
      if (error.response?.status && error.response.status !== 404) {
        break;
      }
    }
  }

  throw new Error(extractErrorMessage(lastError, "Unable to fetch Simplex machine master options."));
};

export const fetchSimplexCountOptions = async ({ prefix = "", screen = "master" } = {}) => {
  const screenEndpoints = {
    process_parameter: ["/simplex/process_parameter/master/count-dropdown"],
    master: ["/simplex/master/count-dropdown", "/simplex/master/counts", "/simplex/master/count-names"],
  };
  const endpoints = [
    ...(screenEndpoints[screen] || screenEndpoints.master),
    "/simplex/master/count-dropdown",
    "/simplex/master/counts",
    "/simplex/master/count-names",
  ];
  let lastError;

  for (const endpoint of endpoints) {
    try {
      const response = await apiConfig.get(endpoint, { prefix, count_prefix: prefix }, { skipGlobalErrorModal: true });
      const options = normalizeCountPayload(response?.data || {});
      if (options.length || endpoint === endpoints[endpoints.length - 1]) return options;
    } catch (error) {
      lastError = error;
      if (error.response?.status && error.response.status !== 404) {
        throw new Error(extractErrorMessage(error, "Unable to fetch Simplex count options."));
      }
    }
  }

  throw new Error(extractErrorMessage(lastError, "Unable to fetch Simplex count options."));
};

import apiConfig from "./apiConfig";

const getCardingApiErrorMessage = (error, fallbackMessage) => {
    const data = error.response?.data;
    if (!data) return error.message || fallbackMessage;

    const details = Array.isArray(data.details) ? data.details.join(", ") : data.details;
    return data.message || data.error || details || fallbackMessage;
};

export const submitCardingProcessParameterEntry = async (payload) => {
    try {
        const response = await apiConfig.post(
            "/carding/qc-header",
            payload
        );
        return response.data;
    } catch (error) {
        if (error.response?.data) {
            throw new Error(error.response.data.message || "Invalid payload data.");
        }
        throw new Error(error.message || "Server error occurred");
    }
};

export const updateCardingProcessParameterEntry = async (id, payload) => {
    try {
        const response = await apiConfig.put(`/carding/qc-header/${id}`, payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) {
            throw new Error(error.response.data.message || "Invalid payload data.");
        }
        throw new Error(error.message || "Server error occurred");
    }
};

export const getCardingProcessParameterEntries = async (params = {}) => {
    try {
        const response = await apiConfig.get("/carding/qc-header", params);
        return response.data;
    } catch (error) {
        if (error.response?.data) {
            throw new Error(error.response.data.message || "Unable to fetch entries.");
        }
        throw new Error(error.message || "Server error occurred");
    }
};

export const submitCardingDfkPressureEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/carding/dfk-pressure", payload);
        return response.data;
    } catch (error) {
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || "Invalid payload data.");
        }

        throw new Error(error.message || "Server error occurred");
    }
};

export const fetchCardingDfkPressureEntries = async ({ page = 1, limit = 10 } = {}) => {
    try {
        const response = await apiConfig.get("/carding/dfk-pressure", { page, limit });
        return response.data;
    } catch (error) {
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || "Unable to fetch entries.");
        }

        throw new Error(error.message || "Server error occurred");
    }
};

export const submitBetweenWithinCardEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/carding/between-within-card", payload);
        return response.data;
    } catch (error) {
        if (error.response && error.response.data) {
            const data = error.response.data;
            const details = Array.isArray(data.details) ? data.details.join(", ") : data.details;
            const message = data.message || data.error || details || "Invalid payload data.";
            throw new Error(`${message} (${error.response.status})`);
        }

        throw new Error(error.message || "Server error occurred");
    }
};

export const submitCardThickPlaceEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/carding/card-thick-place", payload);
        return response.data;
    } catch (error) {
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || "Invalid payload data.");
        }

        throw new Error(error.message || "Server error occurred");
    }
};

export const submitCardingNreEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/carding/nre", payload);
        return response.data;
    } catch (error) {
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || "Invalid payload data.");
        }

        throw new Error(error.message || "Server error occurred");
    }
};

export const submitNatiDataEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/carding/nati-data-entry", payload);
        return response.data;
    } catch (error) {
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || "Invalid payload data.");
        }
        throw new Error(error.message || "Server error occurred");
    }
};

export const submitTrialsDataEntry = async (payload) => {
    try {
        // trials.js is mounted at plain /trials (backend/server.js), never under /carding — this
        // wrong path meant every real submission from this form has been failing outright.
        const response = await apiConfig.post("/trials", payload);
        return response.data;
    } catch (error) {
        if (error.response) {
            const backendMessage =
                error.response.data?.message ||
                error.response.data?.error ||
                error.response.statusText;

            if (error.response.status === 404) {
                throw new Error(backendMessage || "Trials API endpoint not found.");
            }

            if (error.response.status === 400) {
                const missingFields = error.response.data?.missingFields;
                if (Array.isArray(missingFields) && missingFields.length) {
                    throw new Error(`${backendMessage || "Missing required fields"}: ${missingFields.join(", ")}`);
                }
                throw new Error(backendMessage || "Invalid payload data.");
            }

            throw new Error(backendMessage || `Request failed with status ${error.response.status}.`);
        }
        throw new Error(error.message || "Server error occurred");
    }
};

export const submitCardingUqcEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/carding/uqc", payload);
        return response.data;
    } catch (error) {
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || "Invalid payload data.");
        }
        throw new Error(error.message || "Server error occurred");
    }
};

export const submitCardingChangeControlEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/carding/change-control", payload);
        return response.data;
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Invalid payload data."));
    }
};

export const fetchCardingChangeControlEntries = async ({ page = 1, limit = 10, ...filters } = {}) => {
    try {
        const response = await apiConfig.get("/carding/change-control", { page, limit, ...filters });
        return response.data;
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Unable to fetch entries."));
    }
};

export const fetchCardingUqcEntries = async ({ page = 1, limit = 10, global = false, department = "" } = {}) => {
    try {
        const trimmedDepartment = String(department || "").trim();
        const shouldUseGlobalRoute = global === true || String(global).toLowerCase() === "true";
        const endpoint = shouldUseGlobalRoute ? "/carding/uqc/global" : "/carding/uqc";
        const params = shouldUseGlobalRoute
            ? { page, limit }
            : { page, limit, ...(trimmedDepartment ? { department: trimmedDepartment } : {}) };
        const response = await apiConfig.get(endpoint, params);
        return response.data;
    } catch (error) {
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || "Unable to fetch entries.");
        }
        throw new Error(error.message || "Server error occurred");
    }
};
const uniqueStrings = (values = []) => Array.from(new Set(values.map((v) => String(v || "").trim()).filter(Boolean)));

const normalizeCountPayload = (payload) => {
    const optionRows = Array.isArray(payload?.options?.count_name)
        ? payload.options.count_name
        : Array.isArray(payload?.options)
            ? payload.options
            : [];
    const rows = [
        ...(Array.isArray(payload?.count_options) ? payload.count_options : []),
        ...(Array.isArray(payload?.count_names) ? payload.count_names : []),
        ...(Array.isArray(payload?.counts) ? payload.counts : []),
        ...(Array.isArray(payload?.data) ? payload.data : []),
        ...(Array.isArray(payload) ? payload : []),
        ...optionRows,
    ];

    const seen = new Set();
    return rows
        .map((row) => {
            if (row && typeof row === "object") {
                const countName = String(
                    row.count_name ?? row.countName ?? row.cntname ?? row.name ?? row.text ?? row.label ?? row.value ?? ""
                ).trim();
                const countCode = String(row.count_code ?? row.countCode ?? row.cntcode ?? row.code ?? "").trim();
                return countName
                    ? {
                        count_code: countCode,
                        count_name: countName,
                        value: countName,
                        label: countName,
                    }
                    : null;
            }

            const countName = String(row || "").trim();
            return countName
                ? {
                    count_code: "",
                    count_name: countName,
                    value: countName,
                    label: countName,
                }
                : null;
        })
        .filter((count) => {
            if (!count || seen.has(count.count_name)) return false;
            seen.add(count.count_name);
            return true;
        });
};

const CARDING_DEPARTMENT_CODE = "CARDING";

export const fetchCardingCountOptions = async ({ prefix = "", screen = "qc-header" } = {}) => {
    const screenEndpoints = {
        trials: ["/trials/master/count-dropdown", "/trials/master/counts", "/trials/master/count-names"],
        header: [
            "/carding/header/master/dropdown",
            "/carding/header/master/count-dropdown",
        ],
        "qc-header": [
            "/carding/qc-header/master/dropdown",
            "/carding/qc-header/master/count-dropdown",
        ],
        nati: ["/carding/nati/master/count-dropdown"],
        "change-control": ["/carding/change-control/master/count-dropdown"],
    };
    const endpoints = [
        ...(screenEndpoints[screen] || screenEndpoints["qc-header"]),
        "/carding/master/count-dropdown",
        "/carding/master/counts",
        "/carding/master/count-names",
    ];
    let lastError = null;

    for (const endpoint of endpoints) {
        try {
            const response = await apiConfig.get(
                endpoint,
                { prefix, count_prefix: prefix },
                { skipGlobalErrorModal: true }
            );
            const options = normalizeCountPayload(response?.data);
            if (options.length || endpoint === endpoints[endpoints.length - 1]) return options;
        } catch (error) {
            lastError = error;
            if (error.response?.status && error.response.status !== 404) {
                throw new Error(getCardingApiErrorMessage(error, "Unable to fetch count options."));
            }
        }
    }

    throw new Error(getCardingApiErrorMessage(lastError || {}, "Unable to fetch count options."));
};

export const fetchCardingCountNames = async (params = {}) => {
    const rows = await fetchCardingCountOptions(params);
    return rows.map((row) => row.count_name).filter(Boolean);
};

export const submitCardWasteStudyEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/carding/card-waste-study", payload);
        return response.data;
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Invalid payload data."));
    }
};

export const fetchCardWasteStudyEntries = async ({ page = 1, limit = 50 } = {}) => {
    try {
        const response = await apiConfig.get("/carding/card-waste-study", { page, limit });
        return response.data;
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Unable to fetch entries."));
    }
};

export const submitWrappingCardingNotebookEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/carding/wrapping-carding-notebook", payload);
        return response.data;
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Invalid wrapping carding notebook payload."));
    }
};

export const fetchWrappingCardingNotebookEntries = async ({ page = 1, limit = 10 } = {}) => {
    try {
        const response = await apiConfig.get("/carding/wrapping-carding-notebook", { page, limit });
        return response.data;
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Unable to fetch wrapping carding notebook entries."));
    }
};

export const fetchCardingMasterMachines = async ({ prefix = "CDG" } = {}) => {
    try {
        const response = await apiConfig.get("/carding/master/machines", { prefix });
        const payload = response?.data;
        const namesList = Array.isArray(payload?.names) ? payload.names : [];
        if (namesList.length) {
            return uniqueStrings(namesList);
        }

        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        return uniqueStrings(rows
            .map((row) => row?.mc_name || row?.machine_name || row?.machine || row?.name || row)
            .map((name) => String(name || "").trim())
            .filter(Boolean));
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Unable to fetch machine options."));
    }
};

export const fetchCardingMasterWasteTypes = async () => {
    try {
        const response = await apiConfig.get("/carding/master/waste-types", {}, { skipGlobalErrorModal: true });
        const payload = response?.data;
        const rows = Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload?.rows)
                ? payload.rows
                : Array.isArray(payload?.options)
                    ? payload.options
                    : Array.isArray(payload)
                        ? payload
                        : [];

        return uniqueStrings(rows.map((row) =>
            row && typeof row === "object"
                ? row.waste_type_name ?? row.wasteTypeName ?? row.waste_type ?? row.wasteType ?? row.name ?? row.label ?? row.value ?? row.text
                : row
        ));
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Unable to fetch waste type options."));
    }
};

export const fetchCardingMasterMachineRows = async ({ prefix = "CDG" } = {}) => {
    try {
        const response = await apiConfig.get("/carding/master/machines", { prefix });
        const payload = response?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];

        return rows
            .map((row) => ({
                mc_no: String(row?.mc_no || row?.mccode || "").trim(),
                mc_name: String(row?.mc_name || row?.mcname || row?.name || "").trim(),
                dept_name: String(row?.dept_name || row?.deptname || "").trim(),
            }))
            .filter((row) => row.mc_no || row.mc_name);
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Unable to fetch machine options."));
    }
};

export const fetchCardingMasterVarieties = async ({ prefix = "" } = {}) => {
    try {
        const response = await apiConfig.get("/carding/master/varieties", { prefix });
        const payload = response?.data;
        const namesList = Array.isArray(payload?.names)
            ? payload.names
            : Array.isArray(payload?.variety_names)
                ? payload.variety_names
                : Array.isArray(payload?.prep_variety_names)
                    ? payload.prep_variety_names
                    : [];
        if (namesList.length) {
            return namesList.map((name) => String(name || "").trim()).filter(Boolean);
        }

        const optionGroups = payload?.options || payload?.dropdown_options || {};
        const optionRows = [
            ...(Array.isArray(optionGroups) ? optionGroups : []),
            ...(Array.isArray(optionGroups.variety) ? optionGroups.variety : []),
            ...(Array.isArray(optionGroups.varieties) ? optionGroups.varieties : []),
        ];
        const rows = [
            ...(Array.isArray(payload?.data) ? payload.data : []),
            ...(Array.isArray(payload?.varieties) ? payload.varieties : []),
            ...(Array.isArray(payload) ? payload : []),
            ...optionRows,
        ];
        return uniqueStrings(rows
            .map((row) => row?.variety_name || row?.prep_variety_name || row?.variety || row?.name || row?.text || row?.label || row?.value || row)
            .map((name) => String(name || "").trim())
            .filter(Boolean));
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Unable to fetch variety options."));
    }
};

export const fetchCardingCdgDenominations = async ({ machineName } = {}) => {
    try {
        const response = await apiConfig.get("/carding/master/cdg-denominations", { machine_name: machineName });
        return response.data;
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Unable to fetch denomination."));
    }
};

export const fetchCardingUqcMasterVarieties = async ({ prefix = "" } = {}) => {
    try {
        const response = await apiConfig.get("/carding/uqc/master/varieties", { prefix });
        const payload = response?.data;
        const namesList = Array.isArray(payload?.names) ? payload.names : [];
        if (namesList.length) return uniqueStrings(namesList);
        const optionGroups = payload?.options || payload?.dropdown_options || {};
        const optionRows = [
            ...(Array.isArray(optionGroups) ? optionGroups : []),
            ...(Array.isArray(optionGroups.variety) ? optionGroups.variety : []),
            ...(Array.isArray(optionGroups.varieties) ? optionGroups.varieties : []),
        ];
        const rows = [
            ...(Array.isArray(payload?.data) ? payload.data : []),
            ...(Array.isArray(payload?.varieties) ? payload.varieties : []),
            ...(Array.isArray(payload) ? payload : []),
            ...optionRows,
        ];
        return uniqueStrings(rows.map((row) => row?.variety_name || row?.prep_variety_name || row?.variety || row?.name || row?.text || row?.label || row?.value || row));
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Unable to fetch UQC variety options."));
    }
};

export const fetchCardingUqcMasterDepartments = async ({ prefix = "" } = {}) => {
    try {
        const response = await apiConfig.get("/carding/uqc/master/departments", { prefix });
        const payload = response?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        return rows
            .map((row) => ({
                dept_code: String(row?.dept_code || row?.department_code || "").trim(),
                dept_name: String(row?.dept_name || row?.department_name || row?.name || "").trim(),
            }))
            .filter((row) => row.dept_name);
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Unable to fetch UQC department options."));
    }
};

export const fetchCardingUqcMasterMcNos = async ({ prefix = "", department = "", department_code = "" } = {}) => {
    try {
        const response = await apiConfig.get(
            "/carding/uqc/master/mc-nos",
            { prefix, department, department_code: department_code || CARDING_DEPARTMENT_CODE }
        );
        const payload = response?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        return rows
            .map((row) => ({
                mc_no: String(row?.mc_no || row?.mccode || row?.value || "").trim(),
                mc_name: String(row?.mc_name || row?.mcname || "").trim(),
                dept_code: String(row?.dept_code || "").trim(),
                dept_name: String(row?.dept_name || "").trim(),
            }))
            .filter((row) => row.mc_no);
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Unable to fetch UQC MC No options."));
    }
};

export const fetchCardingNatiMasterMcNos = async ({ prefix = "", department = "", department_code = "" } = {}) => {
    try {
        const endpoints = [
            "/carding/nati/master/cdg-nos",
            "/carding/nati/master/mc-nos",
        ];
        let lastError = null;

        for (const endpoint of endpoints) {
            try {
                const response = await apiConfig.get(
                    endpoint,
                    { prefix, department, department_code: department_code || CARDING_DEPARTMENT_CODE },
                    { skipGlobalErrorModal: true }
                );
                const payload = response?.data;
                const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
                const normalized = rows
                    .map((row) => ({
                        mc_no: String(row?.mc_no || row?.mccode || row?.value || "").trim(),
                        mc_name: String(row?.mc_name || row?.mcname || "").trim(),
                        dept_code: String(row?.dept_code || "").trim(),
                        dept_name: String(row?.dept_name || "").trim(),
                    }))
                    .filter((row) => row.mc_no);
                if (normalized.length || endpoint === endpoints[endpoints.length - 1]) {
                    return normalized;
                }
            } catch (error) {
                lastError = error;
                if (error.response?.status && error.response.status !== 404) {
                    throw new Error(getCardingApiErrorMessage(error, "Unable to fetch Nati MC No options."));
                }
            }
        }

        throw lastError || new Error("Unable to fetch Nati MC No options.");
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Unable to fetch Nati MC No options."));
    }
};

export const fetchCardingUqcMasterDropdown = async ({
    prefix = "",
    variety_prefix = "",
    department_prefix = "",
    mc_no_prefix = "",
    department = "",
    department_code = "",
} = {}) => {
    const endpoints = ["/carding/uqc/master/dropdown", "/carding/master/dropdown"];
    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        const response = await apiConfig.get(
          endpoint,
          {
            prefix,
            variety_prefix,
            department_prefix,
            mc_no_prefix,
            department,
            department_code: department_code || CARDING_DEPARTMENT_CODE,
          },
          { skipGlobalErrorModal: true }
        );
        const payload = response?.data || {};
        const options = payload.options || payload.dropdown_options || {};

        const optionRowsToPairs = (rows = []) =>
            (Array.isArray(rows) ? rows : [])
                .map((row) => ({
                    value: String(row?.value || "").trim(),
                    label: String(row?.text || row?.label || row?.value || "").trim(),
                }))
                .filter((row) => row.value);

        const varieties = Array.isArray(payload.varieties)
            ? payload.varieties.map((row) => ({
                var_code: String(row?.var_code || "").trim(),
                variety_name: String(row?.variety_name || row?.prep_variety_name || row?.variety || row?.name || "").trim(),
            })).filter((row) => row.variety_name)
            : [];

        const departments = Array.isArray(payload.departments)
            ? payload.departments.map((row) => ({
                dept_code: String(row?.dept_code || row?.department_code || "").trim(),
                dept_name: String(row?.dept_name || row?.department_name || row?.name || "").trim(),
            })).filter((row) => row.dept_name)
            : [];

        const mcNos = Array.isArray(payload.mc_nos)
            ? payload.mc_nos.map((row) => ({
                mc_no: String(row?.mc_no || row?.mccode || row?.value || "").trim(),
                mc_name: String(row?.mc_name || row?.mcname || "").trim(),
                dept_code: String(row?.dept_code || "").trim(),
                dept_name: String(row?.dept_name || "").trim(),
            })).filter((row) => row.mc_no)
            : [];

        const shifts = Array.isArray(payload.shifts)
            ? payload.shifts.map((row) => ({
                value: String(row?.value || row?.label || "").trim(),
                label: String(row?.label || row?.value || "").trim(),
            })).filter((row) => row.value)
            : [];

        const optionVarieties = optionRowsToPairs(options.variety);
        const optionDepartments = optionRowsToPairs(options.department);
        const optionMcNos = optionRowsToPairs(options.mc_no);
        const optionShifts = optionRowsToPairs(options.shift);

        const normalizedVarieties = optionVarieties.length
            ? optionVarieties.map((row) => ({ var_code: "", variety_name: row.value }))
            : varieties;
        const normalizedDepartments = optionDepartments.length
            ? optionDepartments.map((row) => ({ dept_code: "", dept_name: row.value }))
            : departments;
        const normalizedMcNos = optionMcNos.length
            ? optionMcNos.map((row) => ({ mc_no: row.value, mc_name: row.label, dept_code: "", dept_name: "" }))
            : mcNos;
        const normalizedShifts = optionShifts.length ? optionShifts : shifts;

        return {
            shifts: normalizedShifts,
            varieties: normalizedVarieties,
            departments: normalizedDepartments,
            mcNos: normalizedMcNos,
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(getCardingApiErrorMessage(lastError, "Unable to fetch UQC dropdown options."));
};

const parseMachineNameList = (payload) => {
    const namesList = Array.isArray(payload?.names) ? payload.names : [];
    if (namesList.length) {
        return uniqueStrings(namesList);
    }

    const rows = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
            ? payload
            : [];

    return uniqueStrings(rows
        .map((row) => row?.mc_name || row?.machine_name || row?.machine || row?.name || row)
        .map((name) => String(name || "").trim())
        .filter(Boolean));
};

export const fetchTrialsSpinningMachines = async ({ prefix = "" } = {}) => {
    try {
        const response = await apiConfig.get("/trials/master/spinning-machines", { prefix });
        return parseMachineNameList(response?.data);
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Unable to fetch spinning machine options."));
    }
};

export const fetchTrialsAutoconerMachines = async ({ prefix = "" } = {}) => {
    try {
        const response = await apiConfig.get("/trials/master/autoconer-machines", { prefix });
        return parseMachineNameList(response?.data);
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Unable to fetch autoconer machine options."));
    }
};

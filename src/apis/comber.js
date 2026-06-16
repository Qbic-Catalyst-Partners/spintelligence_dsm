import apiConfig from "./apiConfig";

const extractApiError = (error, fallbackMessage) => {
    if (error?.response?.data?.message) {
        return error.response.data.message;
    }

    if (error?.request) {
        return "Network Error: unable to reach the API server. Check backend availability and API URL.";
    }

    return error?.message || fallbackMessage;
};

const uniqueStrings = (values) =>
    Array.from(new Set(
        values
            .map((value) => String(value || "").trim())
            .filter(Boolean)
    ));

const normalizeOptionRows = (rows = []) =>
    rows
        .map((row) => {
            if (typeof row === "string") {
                const value = row.trim();
                return value ? { label: value, value } : null;
            }

            const value = String(row?.value ?? row?.text ?? row?.label ?? "").trim();
            const label = String(row?.text ?? row?.label ?? row?.value ?? "").trim();
            if (!value && !label) return null;
            return { label: label || value, value: value || label };
        })
        .filter(Boolean);

const normalizeOptionValue = (row) => {
    if (row && typeof row === "object") {
        return {
            value: String(row.value ?? row.label ?? row.text ?? "").trim(),
            label: String(row.label ?? row.value ?? row.text ?? "").trim(),
        };
    }

    const value = String(row ?? "").trim();
    return { value, label: value };
};

const normalizeMachineRows = (rows = []) =>
    rows
        .map((row) => {
            if (typeof row === "string") {
                const value = row.trim();
                return value ? { mc_no: value, mc_name: value, dept_code: "", dept_name: "" } : null;
            }

            const mcNo = String(row?.mc_no ?? row?.mcNo ?? row?.value ?? row?.machine_no ?? row?.machineNo ?? "").trim();
            const mcName = String(row?.mc_name ?? row?.mcName ?? row?.label ?? row?.text ?? row?.machine_name ?? row?.machineName ?? mcNo ?? "").trim();
            if (!mcNo && !mcName) return null;

            return {
                mc_no: mcNo || mcName,
                mc_name: mcName || mcNo,
                dept_code: String(row?.dept_code ?? row?.deptCode ?? "").trim(),
                dept_name: String(row?.dept_name ?? row?.deptName ?? "").trim(),
            };
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
    return rows
        .map((row) => {
            if (row && typeof row === "object") {
                const countName = String(row.count_name ?? row.countName ?? row.cntname ?? row.name ?? row.text ?? row.label ?? row.value ?? "").trim();
                const countCode = String(row.count_code ?? row.countCode ?? row.cntcode ?? row.code ?? "").trim();
                return countName ? { count_code: countCode, count_name: countName, value: countName, label: countName } : null;
            }
            const countName = String(row || "").trim();
            return countName ? { count_code: "", count_name: countName, value: countName, label: countName } : null;
        })
        .filter((row) => {
            if (!row || seen.has(row.count_name)) return false;
            seen.add(row.count_name);
            return true;
        });
};

export const fetchComberCountOptions = async ({ prefix = "" } = {}) => {
    const endpoints = ["/comber/master/count-dropdown", "/comber/master/counts", "/comber/master/count-names"];
    let lastError = null;

    for (const endpoint of endpoints) {
        try {
            const response = await apiConfig.get(endpoint, { prefix, count_prefix: prefix }, { skipGlobalErrorModal: true });
            const options = normalizeCountPayload(response?.data || {});
            if (options.length || endpoint === endpoints[endpoints.length - 1]) return options;
        } catch (error) {
            lastError = error;
            if (error.response?.status && error.response.status !== 404) {
                throw new Error(extractApiError(error, "Unable to fetch Comber count options."));
            }
        }
    }

    throw new Error(extractApiError(lastError || {}, "Unable to fetch Comber count options."));
};

export const submitRibbonLapCVDataEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/comber/lap-cv", payload);
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
        const response = await apiConfig.post("/comber/nati-data-entry", payload);
        return response.data;
    } catch (error) {
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || "Invalid payload data.");
        }

        throw new Error(error.message || "Server error occurred");
    }
};

export const submitComberUqcEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/comber/uqc", payload);
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Invalid payload data."));
    }
};

export const fetchComberUqcEntries = async ({ page = 1, limit = 10 } = {}) => {
    try {
        const response = await apiConfig.get("/comber/uqc", { page, limit });
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Unable to fetch entries."));
    }
};

export const fetchComberMasterVarieties = async ({ prefix = "" } = {}) => {
    try {
        const response = await apiConfig.get("/comber/master/varieties", { prefix });
        const payload = response?.data;
        const namesList = Array.isArray(payload?.names)
            ? payload.names
            : Array.isArray(payload?.variety_names)
                ? payload.variety_names
                : Array.isArray(payload?.prep_variety_names)
                    ? payload.prep_variety_names
                    : [];
        if (namesList.length) {
            return uniqueStrings(namesList);
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
        return uniqueStrings(rows.map((row) => row?.variety_name || row?.prep_variety_name || row?.variety || row?.name || row?.text || row?.label || row?.value || row));
    } catch (error) {
        throw new Error(extractApiError(error, "Unable to fetch variety options."));
    }
};

export const fetchComberUqcMasterDropdown = async ({
    prefix = "",
    variety_prefix = "",
    department_prefix = "",
    mc_no_prefix = "",
    department = "",
    department_code = "",
} = {}) => {
    try {
        const response = await apiConfig.get("/comber/uqc/master/dropdown", {
            prefix,
            variety_prefix,
            department_prefix,
            mc_no_prefix,
            department,
            department_code,
        });

        const payload = response?.data || {};
        const optionGroups = payload.options || payload.dropdown_options || {};

        const shiftOptions = normalizeOptionRows(optionGroups.shift);
        const shifts = Array.isArray(payload.shifts) && payload.shifts.length
            ? payload.shifts
                .map((row) => {
                    const { value, label } = normalizeOptionValue(row);
                    return value ? { value, label: label || value } : null;
                })
                .filter(Boolean)
            : shiftOptions;

        const varieties = Array.isArray(payload.varieties) && payload.varieties.length
            ? payload.varieties
                .map((row) => ({
                    var_code: String(row?.var_code || "").trim(),
                    variety_name: String(row?.variety_name || row?.prep_variety_name || row?.variety || row?.name || row || "").trim(),
                }))
                .filter((row) => row.variety_name)
            : normalizeOptionRows(optionGroups.variety).map((row) => ({
                var_code: "",
                variety_name: row.value,
            }));

        const departments = Array.isArray(payload.departments) && payload.departments.length
            ? payload.departments
                .map((row) => ({
                    dept_code: String(row?.dept_code || "").trim(),
                    dept_name: String(row?.dept_name || row?.name || row || "").trim(),
                }))
                .filter((row) => row.dept_name)
            : normalizeOptionRows(optionGroups.department).map((row) => ({
                dept_code: "",
                dept_name: row.value,
            }));

        const mcNos = Array.isArray(payload.mc_nos) && payload.mc_nos.length
            ? payload.mc_nos
                .map((row) => ({
                    mc_no: String(row?.mc_no || row?.value || "").trim(),
                    mc_name: String(row?.mc_name || row?.label || row?.mc_no || "").trim(),
                    dept_code: String(row?.dept_code || "").trim(),
                    dept_name: String(row?.dept_name || "").trim(),
                }))
                .filter((row) => row.mc_no || row.mc_name)
            : normalizeOptionRows(optionGroups.mc_no).map((row) => ({
                mc_no: row.value,
                mc_name: row.label,
                dept_code: "",
                dept_name: "",
            }));

        return {
            shifts,
            varieties,
            varietyNames: uniqueStrings([
                ...(Array.isArray(payload.variety_names) ? payload.variety_names : []),
                ...varieties.map((row) => row.variety_name),
            ]),
            departments,
            departmentNames: uniqueStrings([
                ...(Array.isArray(payload.department_names) ? payload.department_names : []),
                ...departments.map((row) => row.dept_name),
            ]),
            mcNos,
        };
    } catch (error) {
        throw new Error(extractApiError(error, "Unable to fetch Comber U% dropdown options."));
    }
};

export const fetchComberRibbonLapMasterMcNos = async ({
    prefix = "",
    department = "Comber",
    department_code = "COMBER",
    include_all = true,
    screen = "ribbon-lap",
} = {}) => {
    const screenEndpoints = {
        "ribbon-lap": [
            "/comber/ribbon-lap/master/mc-nos",
            "/comber/ribbon-lap/master/machine-nos",
            "/comber/ribbon-lap/master/machine-numbers",
            "/comber/lap-cv/master/mc-nos",
            "/comber/lap-cv/master/machine-nos",
            "/comber/lap-cv/master/machine-numbers",
            "/comber/master/mc-nos",
            "/comber/master/machine-nos",
            "/comber/master/machine-numbers",
        ],
        "lap-cv": [
            "/comber/lap-cv/master/mc-nos",
            "/comber/lap-cv/master/machine-nos",
            "/comber/lap-cv/master/machine-numbers",
            "/comber/master/mc-nos",
            "/comber/master/machine-nos",
            "/comber/master/machine-numbers",
        ],
        master: [
            "/comber/master/mc-nos",
            "/comber/master/machine-nos",
            "/comber/master/machine-numbers",
        ],
    };

    let lastError = null;
    const endpoints = screenEndpoints[screen] || screenEndpoints["ribbon-lap"];
    const params = {
        prefix,
        mc_no_prefix: prefix,
        machine_prefix: prefix,
        department,
        department_code,
        include_all,
    };

    for (const endpoint of endpoints) {
        try {
            const response = await apiConfig.get(endpoint, params, { skipGlobalErrorModal: true });
            const payload = response?.data || {};
            const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload) ? payload : [];
            const options = normalizeMachineRows(rows);

            if (options.length || endpoint === endpoints[endpoints.length - 1]) {
                return options;
            }
        } catch (error) {
            lastError = error;
            if (error.response?.status && error.response.status !== 404) {
                throw new Error(extractApiError(error, "Unable to fetch Comber ribbon-lap machine options."));
            }
        }
    }

    throw new Error(extractApiError(lastError || {}, "Unable to fetch Comber ribbon-lap machine options."));
};

export const fetchComberNatiMasterMcNos = async ({
    prefix = "",
    department = "",
    department_code = "",
    include_all = true,
} = {}) => {
    try {
        const response = await apiConfig.get("/comber/nati/master/mc-nos", {
            prefix,
            department,
            department_code,
            include_all,
        });
        const payload = response?.data || {};
        const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload) ? payload : [];

        return rows
            .map((row) => ({
                mc_no: String(row?.mc_no || row?.value || row || "").trim(),
                mc_name: String(row?.mc_name || row?.label || "").trim(),
                dept_code: String(row?.dept_code || "").trim(),
                dept_name: String(row?.dept_name || "").trim(),
            }))
            .filter((row) => row.mc_no);
    } catch (error) {
        throw new Error(extractApiError(error, "Unable to fetch Comber Nati MC No options."));
    }
};

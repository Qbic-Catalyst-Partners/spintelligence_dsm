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

            const value = String(row?.value ?? row?.text ?? "").trim();
            const label = String(row?.text ?? row?.label ?? row?.value ?? "").trim();
            if (!value && !label) return null;
            return { label: label || value, value: value || label };
        })
        .filter(Boolean);

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
        const namesList = Array.isArray(payload?.names) ? payload.names : [];
        if (namesList.length) {
            return uniqueStrings(namesList);
        }

        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        return uniqueStrings(rows.map((row) => row?.variety_name || row?.name || row));
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
        const optionGroups = payload.options || {};

        const shiftOptions = normalizeOptionRows(optionGroups.shift);
        const shifts = Array.isArray(payload.shifts) && payload.shifts.length
            ? payload.shifts
                .map((row) => {
                    const value = String((row?.value ?? row?.label ?? row) || "").trim();
                    const label = String((row?.label ?? row?.value ?? row) || "").trim();
                    return value ? { value, label: label || value } : null;
                })
                .filter(Boolean)
            : shiftOptions;

        const varieties = Array.isArray(payload.varieties) && payload.varieties.length
            ? payload.varieties
                .map((row) => ({
                    var_code: String(row?.var_code || "").trim(),
                    variety_name: String(row?.variety_name || row?.name || row || "").trim(),
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

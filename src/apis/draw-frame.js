import apiConfig, { resolvedBaseUrl } from "./apiConfig";
import { emitGlobalSuccessModal } from "@/utils/globalSuccessModal";

const API_BASE_URL = resolvedBaseUrl;

const YARN_CV_BASE_URL =
    process.env.NEXT_PUBLIC_DRAWFRAME_SYNC_URL ||
    `${API_BASE_URL}/drawframe/yarn-cv`;

const COTS_BASE_URL =
    process.env.NEXT_PUBLIC_DRAWFRAME_COTS_URL ||
    `${API_BASE_URL}/drawframe/cots`;

const UQC_BASE_URL =
    process.env.NEXT_PUBLIC_DRAWFRAME_UQC_URL ||
    `${API_BASE_URL}/drawframe/uqc`;
const MACHINE_MASTER_BASE_URL =
    process.env.NEXT_PUBLIC_DRAWFRAME_MACHINE_MASTER_URL ||
    `${API_BASE_URL}/drawframe/yarn-cv/machine-numbers`;
const MACHINE_MASTER_FALLBACK_URL =
    process.env.NEXT_PUBLIC_DRAWFRAME_MACHINE_MASTER_FALLBACK_URL ||
    `${API_BASE_URL}/drawframe/machine-numbers`;
const COTS_MACHINE_MASTER_URL =
    process.env.NEXT_PUBLIC_DRAWFRAME_COTS_MACHINE_MASTER_URL ||
    `${API_BASE_URL}/drawframe/cots/machine-numbers`;

const parseJson = async (response) => response.json().catch(() => null);
const DRAW_FRAME_UQC_ENDPOINTS = ["/drawframe/uqc", "/draw-frame/uqc"];
const DRAW_FRAME_UQC_MASTER_DROPDOWN_ENDPOINTS = [
    "/drawframe/uqc/master/dropdown",
    "/drawframe/master/dropdown",
    "/draw-frame/uqc/master/dropdown",
];
const DRAW_FRAME_UQC_MASTER_VARIETY_ENDPOINTS = [
    "/drawframe/uqc/master/varieties",
    "/drawframe/master/varieties",
];
const DRAW_FRAME_UQC_MASTER_DEPARTMENT_ENDPOINTS = [
    "/drawframe/uqc/master/departments",
    "/drawframe/master/departments",
];
const DRAW_FRAME_UQC_MASTER_MC_NO_ENDPOINTS = [
    "/drawframe/uqc/master/mc-nos",
    "/drawframe/master/mc-nos",
];

const emitFetchSuccess = () => {
    emitGlobalSuccessModal({
        message: "Data Submitted",
    });
};

const buildFetchNetworkError = (endpoint) =>
    `Unable to reach ${endpoint}. Check backend availability and NEXT_PUBLIC_API_URL.`;

const extractApiError = (error, fallbackMessage) => {
    if (error?.response?.data?.message) {
        return error.response.data.message;
    }

    if (error?.request) {
        const method = String(error.config?.method || "request").toUpperCase();
        const path = error.config?.url || "unknown endpoint";
        const base = error.config?.baseURL || API_BASE_URL;
        const endpoint = `${base}${path.startsWith("/") ? path : `/${path}`}`;
        return `Unable to reach ${method} ${endpoint}`;
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

const pickFirstValue = (row, keys = []) => {
    if (!row || typeof row !== "object") return row;
    for (const key of keys) {
        const value = row[key];
        if (value !== undefined && value !== null && String(value).trim()) return value;
    }
    return row.value ?? row.text ?? row.label ?? row.name;
};

const mapRowsToValues = (rows = [], keys = []) =>
    uniqueStrings(
        (Array.isArray(rows) ? rows : [])
            .map((row) => pickFirstValue(row, keys))
    );

const fetchFirstDropdownPayload = async (endpoints, params) => {
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

export const submitDrawFrameYarnCvInspection = async (payload) => {
    try {
        const response = await fetch(YARN_CV_BASE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const data = await parseJson(response);

        if (!response.ok) {
            throw new Error(data?.message || "Failed to save draw frame sync data");
        }

        emitFetchSuccess(data);
        return data;
    } catch (error) {
        throw new Error(error.message === "Failed to fetch" ? buildFetchNetworkError(YARN_CV_BASE_URL) : error.message || "Server error occurred");
    }
};

export const submitDrawFrameCotsInspection = async (payload) => {
    try {
        const response = await fetch(COTS_BASE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const data = await parseJson(response);

        if (!response.ok) {
            throw new Error(data?.message || "Failed to save draw frame cots data");
        }

        emitFetchSuccess(data);
        return data;
    } catch (error) {
        throw new Error(error.message === "Failed to fetch" ? buildFetchNetworkError(COTS_BASE_URL) : error.message || "Server error occurred");
    }
};

export const fetchDrawFrameCotsEntries = async ({ page = 1, limit = 10 } = {}) => {
    try {
        const response = await fetch(`${COTS_BASE_URL}?page=${page}&limit=${limit}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });

        const data = await parseJson(response);

        if (!response.ok) {
            throw new Error(data?.message || "Failed to fetch draw frame cots entries");
        }

        return Array.isArray(data) ? data : [];
    } catch (error) {
        throw new Error(error.message === "Failed to fetch" ? buildFetchNetworkError(COTS_BASE_URL) : error.message || "Server error occurred");
    }
};

export const submitDrawFrameUqcInspection = async (payload) => {
    let lastError;

    for (const endpoint of DRAW_FRAME_UQC_ENDPOINTS) {
        try {
            const response = await apiConfig.post(endpoint, payload);
            return response.data;
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(extractApiError(lastError, "Failed to save draw frame UQC data"));
};

export const submitDrawFrameAPercentInspection = async (payload) => {
    const endpoints = [
        "/drawframe/a-percent",
        "/drawframe/a-percent-inspection",
        "/drawframe/wrapping/a-percent",
        "/drawframe/wrapping/drawframe/a-percent",
    ];
    let lastError;

    for (const endpoint of endpoints) {
        try {
            const response = await apiConfig.post(endpoint, payload);
            return response.data;
        } catch (error) {
            lastError = error;
            if (error.response?.status !== 404) break;
        }
    }

    throw new Error(extractApiError(lastError, "Failed to save draw frame A% data"));
};

export const fetchDrawFrameUqcEntries = async ({ page = 1, limit = 10 } = {}) => {
    let lastError;

    for (const endpoint of DRAW_FRAME_UQC_ENDPOINTS) {
        try {
            const response = await apiConfig.get(endpoint, { page, limit });
            return response.data;
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(extractApiError(lastError, "Failed to fetch draw frame UQC entries"));
};

export const fetchDrawFrameUqcMasterDropdown = async ({
    prefix = "",
    variety_prefix = "",
    department_prefix = "",
    mc_no_prefix = "",
    department = "",
    department_code = "",
} = {}) => {
    let lastError;
    const params = {
        prefix,
        variety_prefix,
        department_prefix,
        mc_no_prefix,
        department,
        department_code,
    };

    for (const endpoint of DRAW_FRAME_UQC_MASTER_DROPDOWN_ENDPOINTS) {
        try {
            const response = await apiConfig.get(endpoint, params, { skipGlobalErrorModal: true });
            const payload = response?.data || {};
            const options = payload.options || {};
            const optionShifts = normalizeOptionRows(options.shift || options.shifts);
            const optionVarieties = normalizeOptionRows(options.variety || options.varieties);
            const optionDepartments = normalizeOptionRows(options.department || options.departments);
            const optionMcNos = normalizeOptionRows(options.mc_no || options.mc_nos || options.machines);

            const shifts = Array.isArray(payload.shifts) && payload.shifts.length
                ? payload.shifts.map((row) => row?.value || row?.label || row).filter(Boolean)
                : optionShifts.map((row) => row.value);

            const varietyNames = uniqueStrings([
                ...(Array.isArray(payload.variety_names) ? payload.variety_names : []),
                ...(Array.isArray(payload.names) ? payload.names : []),
                ...(Array.isArray(payload.varieties)
                    ? mapRowsToValues(payload.varieties, [
                        "variety_name",
                        "VARIETY_NAME",
                        "variety",
                        "VARIETY",
                        "name",
                    ])
                    : []),
                ...mapRowsToValues(payload.data, [
                    "variety_name",
                    "VARIETY_NAME",
                    "variety",
                    "VARIETY",
                    "name",
                ]),
                ...optionVarieties.map((row) => row.value),
            ]);

            const departmentNames = uniqueStrings([
                ...(Array.isArray(payload.department_names) ? payload.department_names : []),
                ...(Array.isArray(payload.departments)
                    ? mapRowsToValues(payload.departments, [
                        "dept_name",
                        "deptname",
                        "DEPTNAME",
                        "department_name",
                        "department",
                        "DEPARTMENT",
                        "name",
                    ])
                    : []),
                ...mapRowsToValues(payload.data, [
                    "dept_name",
                    "deptname",
                    "DEPTNAME",
                    "department_name",
                    "department",
                    "DEPARTMENT",
                    "name",
                ]),
                ...optionDepartments.map((row) => row.value),
            ]);

            const mcNos = uniqueStrings([
                ...(Array.isArray(payload.mc_no_values) ? payload.mc_no_values : []),
                ...(Array.isArray(payload.mc_nos)
                    ? payload.mc_nos.map((row) => row?.mc_name || row?.mc_no || row?.value || row)
                    : []),
                ...optionMcNos.map((row) => row.value),
            ]);

            const dropdown = {
                shifts: uniqueStrings(shifts),
                varietyNames,
                departmentNames,
                mcNos,
            };

            if (!dropdown.varietyNames.length) {
                const varietyPayload = await fetchFirstDropdownPayload(DRAW_FRAME_UQC_MASTER_VARIETY_ENDPOINTS, params).catch(() => null);
                dropdown.varietyNames = uniqueStrings([
                    ...(Array.isArray(varietyPayload?.names) ? varietyPayload.names : []),
                    ...(Array.isArray(varietyPayload?.variety_names) ? varietyPayload.variety_names : []),
                    ...mapRowsToValues(varietyPayload?.data, [
                        "variety_name",
                        "VARIETY_NAME",
                        "variety",
                        "VARIETY",
                        "name",
                    ]),
                ]);
            }

            if (!dropdown.departmentNames.length) {
                const departmentPayload = await fetchFirstDropdownPayload(DRAW_FRAME_UQC_MASTER_DEPARTMENT_ENDPOINTS, params).catch(() => null);
                dropdown.departmentNames = uniqueStrings([
                    ...(Array.isArray(departmentPayload?.names) ? departmentPayload.names : []),
                    ...(Array.isArray(departmentPayload?.department_names) ? departmentPayload.department_names : []),
                    ...mapRowsToValues(departmentPayload?.data, [
                        "dept_name",
                        "deptname",
                        "DEPTNAME",
                        "department_name",
                        "department",
                        "DEPARTMENT",
                        "name",
                    ]),
                ]);
            }

            if (!dropdown.mcNos.length) {
                const mcNoPayload = await fetchFirstDropdownPayload(DRAW_FRAME_UQC_MASTER_MC_NO_ENDPOINTS, params).catch(() => null);
                dropdown.mcNos = uniqueStrings([
                    ...(Array.isArray(mcNoPayload?.names) ? mcNoPayload.names : []),
                    ...(Array.isArray(mcNoPayload?.mc_no_values) ? mcNoPayload.mc_no_values : []),
                    ...(Array.isArray(mcNoPayload?.mc_nos) ? mapRowsToValues(mcNoPayload.mc_nos, ["mc_no", "mc_name", "value"]) : []),
                    ...mapRowsToValues(mcNoPayload?.data, ["mc_no", "mc_name", "mccode", "value"]),
                ]);
            }

            return dropdown;
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(extractApiError(lastError, "Failed to fetch draw frame UQC dropdown options"));
};

export const submitDrawFrameHeaderEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/drawframe/header", payload);
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Failed to create draw frame header entry"));
    }
};

export const fetchDrawFrameHeaderEntries = async ({ page = 1, limit = 10 } = {}) => {
    try {
        const response = await apiConfig.get("/drawframe/header", { page, limit });
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Failed to fetch draw frame header entries"));
    }
};

export const submitDrawFrameFinisherEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/drawframe/finisher", payload);
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Failed to create draw frame finisher entry"));
    }
};

export const fetchDrawFrameFinisherEntries = async ({ page = 1, limit = 10 } = {}) => {
    try {
        const response = await apiConfig.get("/drawframe/finisher", { page, limit });
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Failed to fetch draw frame finisher entries"));
    }
};

export const fetchDrawFrameMachineMaster = async ({ prefix = "" } = {}) => {
    const query = prefix ? `?prefix=${encodeURIComponent(prefix)}` : "";
    const candidateUrls = [MACHINE_MASTER_BASE_URL, MACHINE_MASTER_FALLBACK_URL];
    let lastError = null;

    for (const baseUrl of candidateUrls) {
        try {
            const response = await fetch(`${baseUrl}${query}`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            const data = await parseJson(response);
            if (!response.ok) {
                lastError = new Error(data?.message || "Failed to fetch draw frame machine master");
                continue;
            }
            if (Array.isArray(data?.data)) return data.data;
            if (Array.isArray(data?.machine_numbers)) {
                return data.machine_numbers.map((machineNumber) => ({
                    machine_number: String(machineNumber || "").trim(),
                }));
            }
            return [];
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(extractApiError(lastError, "Failed to fetch draw frame machine master"));
};

export const fetchDrawFrameCotsMachineMaster = async ({ prefix = "", subType = "" } = {}) => {
    const queryParams = new URLSearchParams();
    if (prefix) queryParams.set("prefix", prefix);
    if (subType) queryParams.set("sub_type", subType);
    const query = queryParams.toString() ? `?${queryParams.toString()}` : "";

    const response = await fetch(`${COTS_MACHINE_MASTER_URL}${query}`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        },
    });
    const data = await parseJson(response);

    if (!response.ok) {
        throw new Error(data?.message || "Failed to fetch draw frame cots machine master");
    }

    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.machine_numbers)) {
        return data.machine_numbers.map((mcName) => ({
            mc_name: String(mcName || "").trim(),
        }));
    }
    return [];
};

export const updateDrawFrameHeaderEntry = async (insId, payload) => {
    try {
        const response = await apiConfig.put(`/drawframe/header/${insId}`, payload);
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Failed to update draw frame header entry"));
    }
};

export const updateDrawFrameFinisherEntry = async (id, payload) => {
    try {
        const response = await apiConfig.put(`/drawframe/finisher/${id}`, payload);
        return response.data;
    } catch (error) {
        throw new Error(extractApiError(error, "Failed to update draw frame finisher entry"));
    }
};

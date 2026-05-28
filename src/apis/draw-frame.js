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
    "/draw-frame/uqc/master/dropdown",
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

    for (const endpoint of DRAW_FRAME_UQC_MASTER_DROPDOWN_ENDPOINTS) {
        try {
            const response = await apiConfig.get(endpoint, {
                prefix,
                variety_prefix,
                department_prefix,
                mc_no_prefix,
                department,
                department_code,
            }, { skipGlobalErrorModal: true });

            const payload = response?.data || {};
            const options = payload.options || {};
            const optionShifts = normalizeOptionRows(options.shift);
            const optionVarieties = normalizeOptionRows(options.variety);
            const optionDepartments = normalizeOptionRows(options.department);
            const optionMcNos = normalizeOptionRows(options.mc_no);

            const shifts = Array.isArray(payload.shifts) && payload.shifts.length
                ? payload.shifts.map((row) => row?.value || row?.label || row).filter(Boolean)
                : optionShifts.map((row) => row.value);

            const varietyNames = uniqueStrings([
                ...(Array.isArray(payload.variety_names) ? payload.variety_names : []),
                ...(Array.isArray(payload.names) ? payload.names : []),
                ...(Array.isArray(payload.varieties)
                    ? payload.varieties.map((row) => row?.variety_name || row?.name || row)
                    : []),
                ...optionVarieties.map((row) => row.value),
            ]);

            const departmentNames = uniqueStrings([
                ...(Array.isArray(payload.department_names) ? payload.department_names : []),
                ...(Array.isArray(payload.departments)
                    ? payload.departments.map((row) => row?.dept_name || row?.department_name || row?.name || row)
                    : []),
                ...optionDepartments.map((row) => row.value),
            ]);

            const mcNos = uniqueStrings([
                ...(Array.isArray(payload.mc_no_values) ? payload.mc_no_values : []),
                ...(Array.isArray(payload.mc_nos)
                    ? payload.mc_nos.map((row) => row?.mc_name || row?.mc_no || row?.value || row)
                    : []),
                ...optionMcNos.map((row) => row.value),
            ]);

            return {
                shifts: uniqueStrings(shifts),
                varietyNames,
                departmentNames,
                mcNos,
            };
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

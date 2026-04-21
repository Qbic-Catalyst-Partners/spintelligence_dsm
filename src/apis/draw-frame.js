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

const parseJson = async (response) => response.json().catch(() => null);
const DRAW_FRAME_UQC_ENDPOINTS = ["/drawframe/uqc", "/draw-frame/uqc"];

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
            const response = await apiConfig.get(endpoint, {
                params: { page, limit },
            });
            return response.data;
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(extractApiError(lastError, "Failed to fetch draw frame UQC entries"));
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

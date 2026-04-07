import apiConfig from "./apiConfig";

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://192.168.1.8:4000";

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

const extractApiError = (error, fallbackMessage) => {
    if (error?.response?.data?.message) {
        return error.response.data.message;
    }

    if (error?.request) {
        return "Network Error: unable to reach the API server. Check backend availability and API URL.";
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

        return data;
    } catch (error) {
        throw new Error(error.message || "Server error occurred");
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

        return data;
    } catch (error) {
        throw new Error(error.message || "Server error occurred");
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
        throw new Error(error.message || "Server error occurred");
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

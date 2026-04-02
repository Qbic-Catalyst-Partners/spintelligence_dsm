const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://192.168.1.8:4000";

const YARN_CV_BASE_URL =
    process.env.NEXT_PUBLIC_DRAWFRAME_SYNC_URL ||
    `${API_BASE_URL}/drawframe/yarn-cv`;

const COTS_BASE_URL =
    process.env.NEXT_PUBLIC_DRAWFRAME_COTS_URL ||
    `${API_BASE_URL}/drawframe/cots`;

const parseJson = async (response) => response.json().catch(() => null);

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

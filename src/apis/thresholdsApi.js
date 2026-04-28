import apiConfig, { resolvedBaseUrl } from "./apiConfig";

export const fetchThresholdsAPI = async (params = {}) => {
    try {
        const response = await apiConfig.get("/operator-tickets/thresholds/list", params, {
            skipGlobalSuccessModal: true,
        });

        return Array.isArray(response?.data) ? response.data : [];
    } catch (error) {
        if (error.request) {
            throw new Error(
                `Network Error: unable to reach ${resolvedBaseUrl}/operator-tickets/thresholds/list. Check NEXT_PUBLIC_API_URL and backend availability.`
            );
        }

        throw error;
    }
};

export const saveThresholdAPI = async (payload) => {
    const response = await apiConfig.post("/operator-tickets/thresholds", payload);
    return response?.data;
};

export const saveThresholdsBulkAPI = async (payload) => {
    const thresholds = Array.isArray(payload?.thresholds) ? payload.thresholds : [];

    if (!thresholds.length) {
        return [];
    }

    const responses = await Promise.all(
        thresholds.map((threshold) => apiConfig.post("/operator-tickets/thresholds", threshold))
    );

    return responses.map((response) => response?.data);
};

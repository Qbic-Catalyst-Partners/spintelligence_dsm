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
    if (!thresholds.length) return [];

    const response = await apiConfig.post("/operator-tickets/thresholds/bulk", payload);
    return response?.data;
};

const getThresholdIdentifier = (threshold) =>
    threshold?.id ||
    threshold?._id ||
    threshold?.threshold_id ||
    threshold?.thresholdId ||
    null;

export const updateThresholdStatusAPI = async (threshold, isActive) => {
    const thresholdId = getThresholdIdentifier(threshold);

    if (!thresholdId) {
        throw new Error("Threshold id is required to update active or inactive status.");
    }

    const response = await apiConfig.patch(
        `/operator-tickets/thresholds/${encodeURIComponent(thresholdId)}/status`,
        { is_active: isActive }
    );
    return response?.data;
};

export const updateThresholdAPI = async (threshold, updates) => {
    const thresholdId = getThresholdIdentifier(threshold);

    if (!thresholdId) {
        throw new Error("Threshold id is required to edit threshold values.");
    }

    const response = await apiConfig.patch(
        `/operator-tickets/thresholds/${encodeURIComponent(thresholdId)}`,
        updates || {}
    );
    return response?.data;
};

export const deleteThresholdAPI = async (threshold) => {
    const thresholdId = getThresholdIdentifier(threshold);

    if (!thresholdId) {
        throw new Error("Threshold id is required to delete a threshold.");
    }

    const response = await apiConfig.delete(
        `/operator-tickets/thresholds/${encodeURIComponent(thresholdId)}`
    );
    return response?.data;
};

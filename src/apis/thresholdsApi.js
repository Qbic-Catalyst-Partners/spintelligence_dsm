import apiConfig from "./apiConfig";

export const fetchThresholdsAPI = async (params = {}) => {
    const response = await apiConfig.get("/operator-tickets/thresholds/list", params, {
        skipGlobalSuccessModal: true,
    });

    return Array.isArray(response?.data) ? response.data : [];
};

export const saveThresholdAPI = async (payload) => {
    const response = await apiConfig.post("/operator-tickets/thresholds", payload);
    return response?.data;
};

export const saveThresholdsBulkAPI = async (payload) => {
    const response = await apiConfig.post("/operator-tickets/thresholds", payload);
    return response?.data;
};

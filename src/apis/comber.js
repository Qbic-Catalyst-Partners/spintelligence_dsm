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

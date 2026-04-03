import apiConfig from "./apiConfig";

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
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || "Invalid payload data.");
        }

        throw new Error(error.message || "Server error occurred");
    }
};

export const fetchComberUqcEntries = async () => {
    try {
        const response = await apiConfig.get("/comber/uqc");
        const data = response.data;
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.data)) return data.data;
        return [];
    } catch (error) {
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || "Failed to fetch entries.");
        }

        throw new Error(error.message || "Server error occurred");
    }
};

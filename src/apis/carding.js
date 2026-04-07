import apiConfig from "./apiConfig";

export const submitCardingDfkPressureEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/carding/dfk-pressure", payload);
        return response.data;
    } catch (error) {
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || "Invalid payload data.");
        }

        throw new Error(error.message || "Server error occurred");
    }
};

export const fetchCardingDfkPressureEntries = async ({ page = 1, limit = 10 } = {}) => {
    try {
        const response = await apiConfig.get("/carding/dfk-pressure", {
            params: { page, limit },
        });
        return response.data;
    } catch (error) {
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || "Unable to fetch entries.");
        }

        throw new Error(error.message || "Server error occurred");
    }
};

export const submitBetweenWithinCardEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/carding/between-within-card", payload);
        return response.data;
    } catch (error) {
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || "Invalid payload data.");
        }

        throw new Error(error.message || "Server error occurred");
    }
};

export const submitCardThickPlaceEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/carding/card-thick-place", payload);
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
        const response = await apiConfig.post("/carding/nati-data", payload);
        return response.data;
    } catch (error) {
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || "Invalid payload data.");
        }
        throw new Error(error.message || "Server error occurred");
    }
};

export const submitTrialsDataEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/trials", payload);
        return response.data;
    } catch (error) {
        if (error.response) {
            const backendMessage =
                error.response.data?.message ||
                error.response.data?.error ||
                error.response.statusText;

            if (error.response.status === 404) {
                throw new Error(backendMessage || "Trials API endpoint not found.");
            }

            if (error.response.status === 400) {
                throw new Error(backendMessage || "Invalid payload data.");
            }

            throw new Error(backendMessage || `Request failed with status ${error.response.status}.`);
        }
        throw new Error(error.message || "Server error occurred");
    }
};

export const submitCardingUqcEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/carding/uqc", payload);
        return response.data;
    } catch (error) {
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || "Invalid payload data.");
        }
        throw new Error(error.message || "Server error occurred");
    }
};

export const fetchCardingUqcEntries = async ({ page = 1, limit = 10 } = {}) => {
    try {
        const response = await apiConfig.get("/carding/uqc", {
            params: { page, limit },
        });
        return response.data;
    } catch (error) {
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || "Unable to fetch entries.");
        }
        throw new Error(error.message || "Server error occurred");
    }
};

import apiConfig from "./apiConfig";

const getCardingApiErrorMessage = (error, fallbackMessage) => {
    const data = error.response?.data;
    if (!data) return error.message || fallbackMessage;

    const details = Array.isArray(data.details) ? data.details.join(", ") : data.details;
    return data.message || data.error || details || fallbackMessage;
};

export const submitCardingProcessParameterEntry = async (payload) => {
    try {
        const response = await apiConfig.post(
            "/carding/qc-header",
            payload
        );
        return response.data;
    } catch (error) {
        if (error.response?.data) {
            throw new Error(error.response.data.message || "Invalid payload data.");
        }
        throw new Error(error.message || "Server error occurred");
    }
};

export const updateCardingProcessParameterEntry = async (id, payload) => {
    try {
        const response = await apiConfig.put(`/carding/qc-header/${id}`, payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) {
            throw new Error(error.response.data.message || "Invalid payload data.");
        }
        throw new Error(error.message || "Server error occurred");
    }
};

export const getCardingProcessParameterEntries = async (params = {}) => {
    try {
        const response = await apiConfig.get("/carding/qc-header", params);
        return response.data;
    } catch (error) {
        if (error.response?.data) {
            throw new Error(error.response.data.message || "Unable to fetch entries.");
        }
        throw new Error(error.message || "Server error occurred");
    }
};

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
        const response = await apiConfig.get("/carding/dfk-pressure", { page, limit });
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
            const data = error.response.data;
            const details = Array.isArray(data.details) ? data.details.join(", ") : data.details;
            const message = data.message || data.error || details || "Invalid payload data.";
            throw new Error(`${message} (${error.response.status})`);
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
        const response = await apiConfig.post("/carding/trials", payload);
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
                const missingFields = error.response.data?.missingFields;
                if (Array.isArray(missingFields) && missingFields.length) {
                    throw new Error(`${backendMessage || "Missing required fields"}: ${missingFields.join(", ")}`);
                }
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

export const submitCardingChangeControlEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/carding/change-control", payload);
        return response.data;
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Invalid payload data."));
    }
};

export const fetchCardingChangeControlEntries = async ({ page = 1, limit = 10 } = {}) => {
    try {
        const response = await apiConfig.get("/carding/change-control", { page, limit });
        return response.data;
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Unable to fetch entries."));
    }
};

export const fetchCardingUqcEntries = async ({ page = 1, limit = 10 } = {}) => {
    try {
        const response = await apiConfig.get("/carding/uqc", { page, limit });
        return response.data;
    } catch (error) {
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || "Unable to fetch entries.");
        }
        throw new Error(error.message || "Server error occurred");
    }
};

export const submitCardWasteStudyEntry = async (payload) => {
    try {
        const response = await apiConfig.post("/carding/card-waste-study", payload);
        return response.data;
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Invalid payload data."));
    }
};

export const fetchCardWasteStudyEntries = async ({ page = 1, limit = 50 } = {}) => {
    try {
        const response = await apiConfig.get("/carding/card-waste-study", { page, limit });
        return response.data;
    } catch (error) {
        throw new Error(getCardingApiErrorMessage(error, "Unable to fetch entries."));
    }
};

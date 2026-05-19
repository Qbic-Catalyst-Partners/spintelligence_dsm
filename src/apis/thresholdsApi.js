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

const getThresholdIdentifier = (threshold) =>
    threshold?.id ||
    threshold?._id ||
    threshold?.threshold_id ||
    threshold?.thresholdId ||
    null;

const getBrowserToken = () =>
    typeof window !== "undefined"
        ? window.localStorage.getItem("token") || ""
        : "";

const parseApiResponse = async (response, fallbackMessage) => {
    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        throw new Error(
            data?.message ||
            `${fallbackMessage} Request failed with status ${response.status}.`
        );
    }

    return data;
};

export const updateThresholdStatusAPI = async (threshold, isActive) => {
    const thresholdId = getThresholdIdentifier(threshold);

    if (!thresholdId) {
        throw new Error("Threshold id is required to update active or inactive status.");
    }

    const token = getBrowserToken();

    const payload = {
        threshold,
        is_active: isActive,
        isActive,
        status: isActive ? "Active" : "Inactive",
    };

    const response = await fetch(`/api/thresholds/${encodeURIComponent(thresholdId)}/status`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
    });

    return parseApiResponse(response, "Unable to update threshold status.");
};

export const updateThresholdAPI = async (threshold, updates) => {
    const thresholdId = getThresholdIdentifier(threshold);

    if (!thresholdId) {
        throw new Error("Threshold id is required to edit threshold values.");
    }

    const token = getBrowserToken();
    const response = await fetch(`/api/thresholds/${encodeURIComponent(thresholdId)}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
            threshold,
            updates,
        }),
    });

    return parseApiResponse(response, "Unable to update threshold.");
};

export const deleteThresholdAPI = async (threshold) => {
    const thresholdId = getThresholdIdentifier(threshold);

    if (!thresholdId) {
        throw new Error("Threshold id is required to delete a threshold.");
    }

    const token = getBrowserToken();
    const response = await fetch(`/api/thresholds/${encodeURIComponent(thresholdId)}`, {
        method: "DELETE",
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });

    return parseApiResponse(response, "Unable to delete threshold.");
};

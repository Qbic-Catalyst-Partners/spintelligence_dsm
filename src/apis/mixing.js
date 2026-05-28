import apiConfig from './apiConfig';

const extractMixingApiError = (error, fallbackMessage) => {
    if (error?.response?.data?.message) {
        return error.response.data.message;
    }

    if (error?.response?.data?.error) {
        return error.response.data.error;
    }

    if (error?.request) {
        return "Network Error: unable to reach the API server. Check backend availability and API URL.";
    }

    return error?.message || fallbackMessage;
};

const uniqueStrings = (values = []) =>
    Array.from(new Set(
        values
            .map((value) => String(value || "").trim())
            .filter(Boolean)
    ));

export const fetchMixingMasterVarieties = async ({ prefix = "" } = {}) => {
    const parseVarietyPayload = (payload) => {
        const namesList = Array.isArray(payload?.names)
            ? payload.names
            : Array.isArray(payload?.variety_names)
                ? payload.variety_names
                : [];

        if (namesList.length) {
            return uniqueStrings(namesList);
        }

        const optionRows = Array.isArray(payload?.options) ? payload.options : [];
        const optionNames = optionRows
            .map((option) => option?.text || option?.label || option?.value)
            .filter((name) => String(name || "").trim() && !String(name).includes('-- Select'));
        if (optionNames.length) {
            return uniqueStrings(optionNames);
        }

        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        return uniqueStrings(rows.map((row) => row?.variety_name || row?.name || row));
    };

    const endpoints = [
        '/mixing/master/varieties',
        '/carding/master/varieties',
        '/comber/master/varieties',
    ];
    let lastError = null;

    try {
        for (const endpoint of endpoints) {
            try {
                const response = await apiConfig.get(
                    endpoint,
                    { prefix },
                    { skipGlobalErrorModal: true }
                );
                const options = parseVarietyPayload(response?.data);
                if (options.length || endpoint === endpoints[endpoints.length - 1]) {
                    return options;
                }
            } catch (error) {
                lastError = error;
                if (error?.response?.status && error.response.status !== 404) {
                    throw error;
                }
            }
        }

        return [];
    } catch (error) {
        throw new Error(extractMixingApiError(error || lastError, 'Unable to fetch mixing variety options.'));
    }
};

/* ===== Process Parameter ===== */
export const mixingProcessParameterDataEntry = async (payload) => {
    try {
        const response = await apiConfig.post('/mixing/qc', payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Invalid payload.');
        throw new Error(error.message || 'Server error occurred');
    }
};

export const updateMixingProcessParameterEntry = async (qcId, payload) => {
    try {
        const response = await apiConfig.put(`/mixing/qc/${qcId}`, payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Invalid payload.');
        throw new Error(error.message || 'Server error occurred');
    }
};

export const getMixingProcessParameterEntries = async (params = {}) => {
    try {
        const response = await apiConfig.get('/mixing/qc', params);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Failed to load Mixing QC entries.');
        throw new Error(error.message || 'Server error occurred');
    }
};

const fetchMixingEntries = async (endpoint, params = {}, fallbackMessage = 'Failed to load Mixing entries.') => {
    try {
        const response = await apiConfig.get(endpoint, params);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || fallbackMessage);
        throw new Error(error.message || 'Server error occurred');
    }
};

/* ===== Cotton HVI ===== */
export const mixingCottonHVIDataEntry = async (payload) => {
    try {
        const response = await apiConfig.post('/mixing/cotton-hvi', payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Invalid payload.');
        throw new Error(error.message || 'Server error occurred');
    }
};

export const fetchMixingCottonHviEntries = async (params = {}) =>
    fetchMixingEntries('/mixing/cotton-hvi', params, 'Failed to load Cotton HVI entries.');

/* ===== Fibre ===== */
export const mixingFibreDataEntry = async (payload) => {
    try {
        const response = await apiConfig.post('/mixing/fibre', payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Invalid payload.');
        throw new Error(error.message || 'Server error occurred');
    }
};

export const fetchMixingFibreEntries = async (params = {}) =>
    fetchMixingEntries('/mixing/fibre', params, 'Failed to load Fibre entries.');

/* ===== AFIS ===== */
export const mixingAfisDataEntry = async (payload) => {
    try {
        const response = await apiConfig.post('/mixing/afis', payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Invalid payload.');
        throw new Error(error.message || 'Server error occurred');
    }
};

export const fetchMixingAfisEntries = async (params = {}) =>
    fetchMixingEntries('/mixing/afis', params, 'Failed to load AFIS entries.');

/* ===== Moisture ===== */
export const mixingMoistureDataEntry = async (payload) => {
    try {
        const response = await apiConfig.post('/mixing/moisture', payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Invalid payload.');
        throw new Error(error.message || 'Server error occurred');
    }
};

export const fetchMixingMoistureEntries = async (params = {}) =>
    fetchMixingEntries('/mixing/moisture', params, 'Failed to load Moisture entries.');

/* ===== BR Waste Study ===== */
export const mixingBrWasteStudyEntry = async (payload) => {
    try {
        const response = await apiConfig.post('/mixing/br-waste', payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Invalid payload.');
        throw new Error(error.message || 'Server error occurred');
    }
};

/* ===== Drop Test (single tuft per call) ===== */
export const mixingDropTestDataEntry = async (payload) => {
    try {
        const response = await apiConfig.post('/mixing/drop-test', payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Invalid payload.');
        throw new Error(error.message || 'Server error occurred');
    }
};

/* ===== Openness ===== */
export const mixingOpennessDataEntry = async (payload) => {
    try {
        const response = await apiConfig.post('/mixing/openness', payload);
        return response.data;
    } catch (error) {
        if (error.response?.data) throw new Error(error.response.data.message || 'Invalid payload.');
        throw new Error(error.message || 'Server error occurred');
    }
};

export const fetchMixingOpennessEntries = async (params = {}) =>
    fetchMixingEntries('/mixing/openness', params, 'Failed to load Openness entries.');

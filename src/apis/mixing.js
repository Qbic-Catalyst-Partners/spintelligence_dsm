import apiConfig from './apiConfig';

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

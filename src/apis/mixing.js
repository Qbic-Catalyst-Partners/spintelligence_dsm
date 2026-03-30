import apiConfig from './apiConfig';

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

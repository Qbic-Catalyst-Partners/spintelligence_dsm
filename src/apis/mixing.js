import apiConfig from './apiConfig';
//url = `${process.env.REACT_APP_API_URL}/mixing/cotton-hvi`;

export const mixingCottonHVIDataEntry = async (payload) => {
    try {
        const response = await apiConfig.post('/mixing/cotton-hvi', payload);
        return response.data;
    } catch (error) {
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || 'Invalid Payload data.');
        }
        throw new Error(error.message || 'Server error occurred');
    }
};
import apiConfig from './apiConfig';

export const loginAPI = async (employee_id, password) => {
    try {
        const response = await apiConfig.post('/auth/login', { employee_id, password });
        return response.data;
    } catch (error) {
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || 'Invalid Employee ID or password.');
        }
        throw new Error(error.message || 'Server error occurred');
    }
};


export const getUserProfile = async (userId) => {
    try {
        const response = await apiConfig.get(`/users/${userId}`, { includeDetails: true });
        return response.data;
    } catch (error) {
        throw new Error(error.response?.data?.message || 'Failed to fetch user profile');
    }
};


export const uploadProfilePicture = async (userId, file) => {
    try {
        const formData = new FormData();
        formData.append('profilePicture', file);

        const response = await apiConfig.post(
            `/users/${userId}/picture`, 
            formData, 
            { 'Content-Type': 'multipart/form-data' } // Overrides default application/json
        );
        return response.data;
    } catch (error) {
        throw new Error(error.response?.data?.message || 'Failed to upload picture');
    }
};


export const CreateUserSettings = async (userId, settingsData) => {
    try {
        const response = await apiConfig.put(`/users/${userId}/settings`, settingsData);
        return response.data;
    } catch (error) {
        throw new Error(error.response?.data?.message || 'Failed to Create settings');
    }
};


export const deleteUserAccount = async (userId, reason) => {
    try {
        const response = await apiConfig.delete(`/users/${userId}`, { reason });
        return response.data;
    } catch (error) {
        throw new Error(error.response?.data?.message || 'Failed to delete account');
    }
};

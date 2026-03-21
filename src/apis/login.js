import apiConfig from './apiConfig';

/**
 * Standard POST request (already implemented)
 */
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

/**
 * SAMPLE: GET request with query parameters
 * Usage: getUserProfile(123) -> hits /users/123?includeDetails=true
 */
export const getUserProfile = async (userId) => {
    try {
        const response = await apiConfig.get(`/users/${userId}`, { includeDetails: true });
        return response.data;
    } catch (error) {
        throw new Error(error.response?.data?.message || 'Failed to fetch user profile');
    }
};

/**
 * SAMPLE: POST request with form data and custom headers (e.g. file upload)
 * Usage: uploadProfilePicture(123, fileObject)
 */
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

/**
 * SAMPLE: PUT request to update existing resource
 * Usage: updateUserSettings(123, { theme: 'dark' })
 */
export const updateUserSettings = async (userId, settingsData) => {
    try {
        const response = await apiConfig.put(`/users/${userId}/settings`, settingsData);
        return response.data;
    } catch (error) {
        throw new Error(error.response?.data?.message || 'Failed to update settings');
    }
};

/**
 * SAMPLE: DELETE request with query parameters (often used for soft-deletes or reasons)
 * Usage: deleteUserAccount(123, 'duplicate_account')
 */
export const deleteUserAccount = async (userId, reason) => {
    try {
        const response = await apiConfig.delete(`/users/${userId}`, { reason });
        return response.data;
    } catch (error) {
        throw new Error(error.response?.data?.message || 'Failed to delete account');
    }
};

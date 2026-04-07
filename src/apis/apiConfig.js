import axios from 'axios';
import { emitGlobalFailureModal } from "@/utils/globalFailureModal";

const resolvedBaseUrl = (
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'
).trim();

// Create the base Axios instance with default settings
const axiosInstance = axios.create({
    baseURL: resolvedBaseUrl,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to automatically add the Bearer token and any other globally required headers
axiosInstance.interceptors.request.use(
    (config) => {
        // Only run safely in the browser context (Next.js)
        if (typeof window !== 'undefined') {
            const token = localStorage.getItem('token');
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor for handling global errors (e.g., automatically logging out on 401)
axiosInstance.interceptors.response.use(
    (response) => response,
    (error) => {
        if (typeof window !== "undefined" && !error.config?.skipGlobalErrorModal) {
            const status = error.response?.status;
            const message =
                error.response?.data?.message ||
                error.response?.data?.error ||
                (status ? `Request failed with status ${status}` : "API is not responsive. Please try again.");

            emitGlobalFailureModal({ message, status });
        }

        return Promise.reject(error);
    }
);

// Export robust helper methods for dealing with payloads, query parameters, and custom headers
const apiConfig = {
    /**
     * Perform a GET request.
     * @param {string} url - API endpoint
     * @param {object} params - Query parameters to append to the URL (e.g., { page: 1, limit: 10 })
     * @param {object} customHeaders - Optional custom headers to merge for this specific call
     */
    get: (url, params = {}, customHeaders = {}) => {
        return axiosInstance.get(url, {
            params,
            headers: customHeaders,
        });
    },

    /**
     * Perform a POST request.
     * @param {string} url - API endpoint
     * @param {object} data - Payload data 
     * @param {object} customHeaders - Optional custom headers (like multipart/form-data)
     */
    post: (url, data = {}, customHeaders = {}) => {
        return axiosInstance.post(url, data, {
            headers: customHeaders,
        });
    },

    /**
     * Perform a PUT request.
     * @param {string} url - API endpoint
     * @param {object} data - Payload data 
     * @param {object} customHeaders - Optional custom headers
     */
    put: (url, data = {}, customHeaders = {}) => {
        return axiosInstance.put(url, data, {
            headers: customHeaders,
        });
    },

    /**
     * Perform a PATCH request.
     * @param {string} url - API endpoint
     * @param {object} data - Payload data 
     * @param {object} customHeaders - Optional custom headers
     */
    patch: (url, data = {}, customHeaders = {}) => {
        return axiosInstance.patch(url, data, {
            headers: customHeaders,
        });
    },

    /**
     * Perform a DELETE request.
     * @param {string} url - API endpoint
     * @param {object} params - Optional query parameters
     * @param {object} customHeaders - Optional custom headers
     */
    delete: (url, params = {}, customHeaders = {}) => {
        return axiosInstance.delete(url, {
            params,
            headers: customHeaders,
        });
    },
};

export default apiConfig;

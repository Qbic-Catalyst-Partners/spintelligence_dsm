import axios from 'axios';
import { emitGlobalFailureModal } from "@/utils/globalFailureModal";
import { emitGlobalSuccessModal } from "@/utils/globalSuccessModal";

let authToken = null;

const resolvedBaseUrl = (
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'
).trim();

export { resolvedBaseUrl };

const buildNetworkErrorMessage = (error) => {
    const method = String(error.config?.method || "request").toUpperCase();
    const path = error.config?.url || "unknown endpoint";
    const base = error.config?.baseURL || resolvedBaseUrl;
    const endpoint = `${base}${path.startsWith("/") ? path : `/${path}`}`;

    if (error.code === "ECONNABORTED") {
        return `Request timed out for ${method} ${endpoint}`;
    }

    if (error.message === "Network Error" || error.request) {
        return `Unable to reach ${method} ${endpoint}`;
    }

    return error.message || `Unable to complete ${method} ${endpoint}`;
};

const shouldShowGlobalErrorModal = (error) => {
    if (error.config?.skipGlobalErrorModal) {
        return false;
    }

    const status = error.response?.status;

    return !error.response || status === 404;
};

const shouldShowGlobalSuccessModal = (response) => {
    if (response.config?.skipGlobalSuccessModal) {
        return false;
    }

    const method = String(response.config?.method || "get").toLowerCase();
    if (!["post", "put", "patch", "delete"].includes(method)) {
        return false;
    }

    const path = String(response.config?.url || "");
    if (path.startsWith("/auth/")) {
        return false;
    }

    return response.status >= 200 && response.status < 300;
};

// Create the base Axios instance with default settings
const axiosInstance = axios.create({
    baseURL: resolvedBaseUrl,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const setAuthToken = (token) => {
    authToken = token || null;
};

const buildRequestConfig = (options = {}) => {
    if (!options || typeof options !== "object" || Array.isArray(options)) {
        return {};
    }

    const {
        headers,
        skipGlobalErrorModal,
        skipGlobalSuccessModal,
        successMessage,
        timeout,
        signal,
        ...rest
    } = options;

    const resolvedHeaders = headers ?? rest;
    const config = {};

    if (resolvedHeaders && Object.keys(resolvedHeaders).length > 0) {
        config.headers = resolvedHeaders;
    }

    if (typeof skipGlobalErrorModal !== "undefined") {
        config.skipGlobalErrorModal = skipGlobalErrorModal;
    }

    if (typeof skipGlobalSuccessModal !== "undefined") {
        config.skipGlobalSuccessModal = skipGlobalSuccessModal;
    }

    if (typeof successMessage !== "undefined") {
        config.successMessage = successMessage;
    }

    if (typeof timeout !== "undefined") {
        config.timeout = timeout;
    }

    if (typeof signal !== "undefined") {
        config.signal = signal;
    }

    return config;
};

// Request interceptor to automatically add the Bearer token and any other globally required headers
axiosInstance.interceptors.request.use(
    (config) => {
        if (authToken) {
            config.headers.Authorization = `Bearer ${authToken}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor for handling global errors (e.g., automatically logging out on 401)
axiosInstance.interceptors.response.use(
    (response) => {
        if (typeof window !== "undefined" && shouldShowGlobalSuccessModal(response)) {
            emitGlobalSuccessModal({
                message: "Data Submitted",
                status: response.status,
            });
        }

        return response;
    },
    (error) => {
        if (typeof window !== "undefined" && shouldShowGlobalErrorModal(error)) {
            const status = error.response?.status;
            const message =
                error.response?.data?.message ||
                error.response?.data?.error ||
                (status ? `Request failed with status ${status}` : buildNetworkErrorMessage(error));

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
            ...buildRequestConfig(customHeaders),
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
            ...buildRequestConfig(customHeaders),
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
            ...buildRequestConfig(customHeaders),
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
            ...buildRequestConfig(customHeaders),
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
            ...buildRequestConfig(customHeaders),
        });
    },
};

export default apiConfig;

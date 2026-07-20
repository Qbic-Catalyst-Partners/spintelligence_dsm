import axios from 'axios';
import { emitGlobalFailureModal } from "@/utils/globalFailureModal";
import { emitGlobalSuccessModal } from "@/utils/globalSuccessModal";

let authToken = null;
const AUTH_TOKEN_STORAGE_KEY = "token";

const getStoredAuthToken = () => {
    if (typeof window === "undefined") {
        return "";
    }

    return (
        window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ||
        window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ||
        ""
    );
};


const API_HOST = '187.127.135.236:4000';
const API_HTTPS_PATH = 'api.spintelligence-dsm.cloud'
const HTTP_BASE_URL = `http://${API_HOST}`;
const HTTPS_BASE_URL = `https://${API_HTTPS_PATH}`;

// No SSL termination exists on the backend yet, but once it does, matching the page's own
// protocol avoids the browser blocking API calls as mixed content on an https-served frontend —
// this works automatically with no env var needed. NEXT_PUBLIC_API_URL, if set, still overrides.
const detectDefaultBaseUrl = () => {
    if (typeof window !== 'undefined' && window.location?.protocol === 'https:') {
        return HTTPS_BASE_URL;
    }
    return HTTP_BASE_URL;
};

const resolvedBaseUrl = (
    process.env.NEXT_PUBLIC_API_URL || detectDefaultBaseUrl()
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

    return true;
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
        const token = authToken || getStoredAuthToken();
        if (token) {
            authToken = token;
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${token}`;
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
        const hasExplicitConfigShape =
            params &&
            typeof params === "object" &&
            !Array.isArray(params) &&
            (Object.prototype.hasOwnProperty.call(params, "params") ||
                Object.prototype.hasOwnProperty.call(params, "data"));

        const requestConfig = hasExplicitConfigShape
            ? {
                ...params,
                ...buildRequestConfig(customHeaders),
            }
            : {
                params,
                ...buildRequestConfig(customHeaders),
            };

        return axiosInstance.delete(url, requestConfig);
    },
};

export default apiConfig;

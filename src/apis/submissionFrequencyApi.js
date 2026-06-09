import apiConfig, { resolvedBaseUrl } from "./apiConfig";

const normalizeSubmissionFrequencyList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.configs)) return data.configs;
  if (Array.isArray(data?.thresholds)) return data.thresholds;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.configs)) return data.data.configs;
  if (Array.isArray(data?.data?.thresholds)) return data.data.thresholds;
  if (Array.isArray(data?.data?.rows)) return data.data.rows;
  return [];
};

export const fetchSubmissionFrequencyConfigsAPI = async () => {
  try {
    const response = await apiConfig.get(
      "/operator-tickets/submission-frequency",
      {},
      { skipGlobalSuccessModal: true }
    );
    return normalizeSubmissionFrequencyList(response?.data);
  } catch (error) {
    if (error.request) {
      throw new Error(
        `Network Error: unable to reach ${resolvedBaseUrl}/operator-tickets/submission-frequency.`
      );
    }
    throw error;
  }
};

export const saveSubmissionFrequencyConfigAPI = async (payload) => {
  const response = await apiConfig.post("/operator-tickets/submission-frequency", payload);
  return response?.data;
};

export const updateSubmissionFrequencyConfigAPI = async (id, payload) => {
  const response = await apiConfig.patch(
    `/operator-tickets/submission-frequency/${encodeURIComponent(id)}`,
    payload
  );
  return response?.data;
};

export const updateSubmissionFrequencyStatusAPI = async (id, is_active) => {
  const response = await apiConfig.patch(
    `/operator-tickets/submission-frequency/${encodeURIComponent(id)}/status`,
    { is_active }
  );
  return response?.data;
};

export const deleteSubmissionFrequencyConfigAPI = async (id) => {
  const response = await apiConfig.delete(
    `/operator-tickets/submission-frequency/${encodeURIComponent(id)}`
  );
  return response?.data;
};

export const runSubmissionFrequencyCheckAPI = async () => {
  const response = await apiConfig.post(
    "/operator-tickets/submission-frequency/check",
    {}
  );
  return response?.data;
};

export const runSubmissionFrequencyTatCheckAPI = async () => {
  const response = await apiConfig.post(
    "/operator-tickets/submission-frequency/tat/check",
    {}
  );
  return response?.data;
};


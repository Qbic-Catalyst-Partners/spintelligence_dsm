import apiConfig, { resolvedBaseUrl } from "./apiConfig";

export const fetchSubmissionFrequencyConfigsAPI = async () => {
  try {
    const response = await apiConfig.get(
      "/operator-tickets/submission-frequency",
      {},
      { skipGlobalSuccessModal: true }
    );
    return Array.isArray(response?.data?.configs) ? response.data.configs : [];
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


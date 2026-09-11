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
    // error.request is set whenever axios actually sent the request,
    // regardless of whether a response came back - error.response is what's
    // exclusively set when the server DID respond (e.g. a 401 on an expired
    // token). Checking error.request alone claimed "Network Error: unable to
    // reach" even when the server responded just fine but rejected the
    // request for an unrelated reason (auth expiry, validation, etc),
    // misdiagnosing every non-network failure as a connectivity problem.
    if (error.request && !error.response) {
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


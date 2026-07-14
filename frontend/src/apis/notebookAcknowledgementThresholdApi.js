import apiConfig, { resolvedBaseUrl } from "./apiConfig";

const normalizeThresholdList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.thresholds)) return data.thresholds;
  if (Array.isArray(data?.configs)) return data.configs;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.thresholds)) return data.data.thresholds;
  if (Array.isArray(data?.data?.configs)) return data.data.configs;
  if (Array.isArray(data?.data?.rows)) return data.data.rows;
  return [];
};

export const fetchNotebookAcknowledgementThresholdsAPI = async () => {
  try {
    const response = await apiConfig.get(
      "/submitted-notebooks/acknowledgement-thresholds",
      {},
      { skipGlobalSuccessModal: true }
    );
    return normalizeThresholdList(response?.data);
  } catch (error) {
    if (error.request) {
      throw new Error(
        `Network Error: unable to reach ${resolvedBaseUrl}/submitted-notebooks/acknowledgement-thresholds.`
      );
    }
    throw error;
  }
};

export const saveNotebookAcknowledgementThresholdAPI = async (payload) => {
  const response = await apiConfig.post(
    "/submitted-notebooks/acknowledgement-thresholds",
    payload
  );
  return response?.data;
};

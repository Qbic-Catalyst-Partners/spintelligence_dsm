import apiConfig, { resolvedBaseUrl } from "./apiConfig";

const normalizeRows = (data) => {
  const candidate = data?.rows || data?.data?.rows || data?.data;
  return Array.isArray(candidate) ? candidate : [];
};

export const fetchPpNotebookThresholdsAPI = async () => {
  try {
    const response = await apiConfig.get("/submitted-notebooks/pp-notebook-threshold", {}, { skipGlobalSuccessModal: true });
    return normalizeRows(response?.data);
  } catch (error) {
    if (error.request) {
      throw new Error(`Network Error: unable to reach ${resolvedBaseUrl}/submitted-notebooks/pp-notebook-threshold.`);
    }
    throw error;
  }
};

export const savePpNotebookThresholdAPI = async (payload) => {
  const response = await apiConfig.post("/submitted-notebooks/pp-notebook-threshold", payload);
  return response?.data;
};

export const deletePpNotebookThresholdAPI = async (id) => {
  const response = await apiConfig.delete(`/submitted-notebooks/pp-notebook-threshold/${encodeURIComponent(id)}`);
  return response?.data;
};

export const updatePpNotebookThresholdStatusAPI = async (id, isActive) => {
  const response = await apiConfig.patch(`/submitted-notebooks/pp-notebook-threshold/${encodeURIComponent(id)}/status`, {
    is_active: isActive,
  });
  return response?.data;
};

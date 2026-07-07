import apiConfig, { resolvedBaseUrl } from "./apiConfig";

const normalizeConfig = (data) => {
  const candidate =
    data?.config ||
    data?.data?.config ||
    data?.data ||
    data;

  return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : null;
};

export const fetchPpNotebookBatchConfigAPI = async () => {
  try {
    const response = await apiConfig.get(
      "/submitted-notebooks/pp-batch-config",
      {},
      { skipGlobalSuccessModal: true }
    );
    return normalizeConfig(response?.data);
  } catch (error) {
    if (error.request) {
      throw new Error(
        `Network Error: unable to reach ${resolvedBaseUrl}/submitted-notebooks/pp-batch-config.`
      );
    }
    throw error;
  }
};

export const savePpNotebookBatchConfigAPI = async (payload) => {
  const response = await apiConfig.post("/submitted-notebooks/pp-batch-config", payload);
  return response?.data;
};

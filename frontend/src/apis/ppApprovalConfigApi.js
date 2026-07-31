import apiConfig, { resolvedBaseUrl } from "./apiConfig";

const normalizeConfig = (data) => {
  const candidate = data?.config || data?.data?.config || data?.data;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : null;
};

export const fetchPpApprovalConfigAPI = async () => {
  try {
    const response = await apiConfig.get("/process-parameters/approval-config", {}, { skipGlobalSuccessModal: true });
    return normalizeConfig(response?.data);
  } catch (error) {
    if (error.request) {
      throw new Error(`Network Error: unable to reach ${resolvedBaseUrl}/process-parameters/approval-config.`);
    }
    throw error;
  }
};

export const savePpApprovalConfigAPI = async (payload) => {
  const response = await apiConfig.post("/process-parameters/approval-config", payload);
  return response?.data;
};

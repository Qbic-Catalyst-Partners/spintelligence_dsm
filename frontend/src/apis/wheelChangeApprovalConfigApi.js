import apiConfig, { resolvedBaseUrl } from "./apiConfig";

const normalizeConfig = (data) => {
  const candidate = data?.config || data?.data?.config || data?.data;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : null;
};

export const fetchWheelChangeApprovalConfigAPI = async () => {
  try {
    const response = await apiConfig.get("/spinning/wheel-change/approval-config", {}, { skipGlobalSuccessModal: true });
    return normalizeConfig(response?.data);
  } catch (error) {
    if (error.request) {
      throw new Error(`Network Error: unable to reach ${resolvedBaseUrl}/spinning/wheel-change/approval-config.`);
    }
    throw error;
  }
};

export const saveWheelChangeApprovalConfigAPI = async (payload) => {
  const response = await apiConfig.post("/spinning/wheel-change/approval-config", payload);
  return response?.data;
};

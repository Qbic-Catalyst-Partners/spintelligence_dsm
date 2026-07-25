import apiConfig, { resolvedBaseUrl } from "./apiConfig";

const normalizeConfig = (data) => {
  const candidate = data?.config || data?.data?.config || data?.data;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : null;
};

const normalizeConfigs = (data) => {
  const candidate = data?.configs || data?.data?.configs || data?.data;
  return Array.isArray(candidate) ? candidate : [];
};

export const fetchWheelChangeApprovalConfigAPI = async (department) => {
  try {
    const response = await apiConfig.get(
      "/spinning/wheel-change/approval-config",
      department ? { department } : {},
      { skipGlobalSuccessModal: true }
    );
    return normalizeConfig(response?.data);
  } catch (error) {
    if (error.request) {
      throw new Error(`Network Error: unable to reach ${resolvedBaseUrl}/spinning/wheel-change/approval-config.`);
    }
    throw error;
  }
};

export const fetchWheelChangeApprovalConfigListAPI = async () => {
  try {
    const response = await apiConfig.get("/spinning/wheel-change/approval-config/list", {}, { skipGlobalSuccessModal: true });
    return normalizeConfigs(response?.data);
  } catch (error) {
    if (error.request) {
      throw new Error(`Network Error: unable to reach ${resolvedBaseUrl}/spinning/wheel-change/approval-config/list.`);
    }
    throw error;
  }
};

export const saveWheelChangeApprovalConfigAPI = async (payload) => {
  const response = await apiConfig.post("/spinning/wheel-change/approval-config", payload);
  return response?.data;
};

export const updateWheelChangeApprovalConfigStatusAPI = async (department, isActive) => {
  const response = await apiConfig.patch(
    `/spinning/wheel-change/approval-config/${encodeURIComponent(department)}/status`,
    { is_active: isActive }
  );
  return response?.data;
};

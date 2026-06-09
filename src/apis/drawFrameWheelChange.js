import apiConfig from "./apiConfig";

const normalizeWheelChangeType = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const WHEEL_CHANGE_ENDPOINTS = {
  type1: "/drawframe/wheel-change/type1",
  type2: "/drawframe/wheel-change/type2",
  type3: "/drawframe/wheel-change/type3",
  finisher_type1_lrsb: "/drawframe/wheel-change/finisher-type1-lrsb",
  type2_d40: "/drawframe/wheel-change/type2-d40",
  type3_d50_d55: "/drawframe/wheel-change/type3-d50-d55",
  type4_ldf3s: "/drawframe/wheel-change/type4-ldf3s",
};

const getWheelChangeEndpoint = (wheelChangeType = "") => {
  const normalizedType = normalizeWheelChangeType(wheelChangeType);
  return WHEEL_CHANGE_ENDPOINTS[normalizedType] || "/drawframe/wheel-change";
};

const extractApiError = (error, fallbackMessage) => {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.response?.data?.error) return error.response.data.error;
  return error?.message || fallbackMessage;
};

export const submitDrawFrameWheelChangeEntry = async (payload) => {
  try {
    const response = await apiConfig.post(
      getWheelChangeEndpoint(payload?.wheel_change_type),
      payload
    );
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, "Failed to create draw frame wheel change entry"));
  }
};

export const fetchDrawFrameWheelChangeEntries = async ({
  page = 1,
  limit = 1,
  wheelChangeType = "",
} = {}) => {
  const normalizedType = normalizeWheelChangeType(wheelChangeType);

  try {
    const response = await apiConfig.get(
      getWheelChangeEndpoint(normalizedType),
      {
        page,
        limit,
        wheel_change_type: normalizedType || undefined,
      },
      { skipGlobalErrorModal: true }
    );
    return response.data;
  } catch (error) {
    throw new Error(extractApiError(error, "Failed to fetch draw frame wheel change entries"));
  }
};

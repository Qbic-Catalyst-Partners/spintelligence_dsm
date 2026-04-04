import apiConfig from "./apiConfig";

const getErrorMessage = (error, fallback) => {
  const responseData = error?.response?.data;
  if (typeof responseData === "string") {
    const preMatch = responseData.match(/<pre>([\s\S]*?)<\/pre>/i);
    if (preMatch?.[1]) {
      return preMatch[1]
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, " ")
        .trim();
    }
    return responseData.trim() || fallback;
  }
  if (responseData) {
    return responseData.message || fallback;
  }
  return error.message || fallback;
};

export const submitAutoconerLycraChecking = async (payload) => {
  try {
    const response = await apiConfig.post("/autoconer/lycra-checking", payload);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to save lycra checking."));
  }
};

export const fetchAutoconerLycraChecking = async () => {
  try {
    const response = await apiConfig.get("/autoconer/lycra-checking");
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to fetch lycra checking."));
  }
};

export const submitAutoconerCountWiseCuts = async (payload) => {
  try {
    const response = await apiConfig.post("/autoconer/count-wise-cuts", payload);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to save count wise cuts."));
  }
};

export const fetchAutoconerCountWiseCuts = async () => {
  try {
    const response = await apiConfig.get("/autoconer/count-wise-cuts");
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to fetch count wise cuts."));
  }
};

export const submitAutoconerSpliceStrength = async (payload) => {
  try {
    const response = await apiConfig.post("/autoconer/splice-strength", payload);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to save splice strength."));
  }
};

export const fetchAutoconerSpliceStrength = async ({ page = 1, limit = 10 } = {}) => {
  try {
    const response = await apiConfig.get("/autoconer/splice-strength", { page, limit });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to fetch splice strength."));
  }
};

export const submitAutoconerDrumWise = async (payload) => {
  try {
    const response = await apiConfig.post("/autoconer/drum-wise", payload);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to save drum wise inspection."));
  }
};

export const fetchAutoconerDrumWise = async ({ page = 1, limit = 10 } = {}) => {
  try {
    const response = await apiConfig.get("/autoconer/drum-wise", { page, limit });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to fetch drum wise inspection."));
  }
};

export const submitAutoconerRewindingStudy = async (payload) => {
  try {
    const response = await apiConfig.post("/autoconer/rewinding-study", payload);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Invalid rewinding study payload."));
  }
};

export const submitAutoconerConeDensity = async (payload) => {
  try {
    const response = await apiConfig.post("/autoconer/cone-density", payload);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Invalid cone density payload."));
  }
};

export const submitAutoconerConePackingAudit = async (payload) => {
  try {
    const response = await apiConfig.post("/autoconer/cone-packing-audit", payload);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Invalid cone packing audit payload."));
  }
};

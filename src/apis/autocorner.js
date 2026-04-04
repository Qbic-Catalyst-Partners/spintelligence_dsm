import apiConfig from "./apiConfig";

const extractErrorMessage = (error, fallbackMessage) => {
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

    return responseData.trim() || fallbackMessage;
  }

  if (responseData?.message) {
    return responseData.message;
  }

  return error?.message || fallbackMessage;
};

export const submitAutocornerRewindingStudyEntry = async (payload) => {
  try {
    const response = await apiConfig.post("/autoconer/rewinding-study", payload);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Invalid rewinding study payload."));
  }
};

export const submitAutocornerConeDensityEntry = async (payload) => {
  try {
    const response = await apiConfig.post("/autoconer/cone-density", payload);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Invalid cone density payload."));
  }
};

export const submitAutocornerConePackingAuditEntry = async (payload) => {
  try {
    const response = await apiConfig.post("/autoconer/cone-packing-audit", payload);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Invalid cone packing audit payload."));
  }
};

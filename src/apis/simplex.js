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

export const submitSimplexUqcEntry = async (payload) => {
  try {
    const response = await apiConfig.post("/simplex/uqc", payload);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Invalid payload data."));
  }
};

export const submitSimplexStudyReportEntry = async (payload) => {
  try {
    const response = await apiConfig.post("/simplex/study", payload);
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Invalid study report payload."));
  }
};

export const submitSimplexCotsChangeEntry = async (payload) => {
  const payloadVariants = [
    payload,
    {
      type: payload?.type,
      s_no: payload?.s_no,
      date: payload?.entry_date,
      machine_name: payload?.machine_name,
    },
    {
      type: payload?.type,
      s_no: payload?.s_no,
      entry_date: payload?.entry_date,
      mc_name: payload?.machine_name,
    },
    {
      type: payload?.type,
      s_no: payload?.s_no,
      date: payload?.entry_date,
      mc_name: payload?.machine_name,
    },
    {
      type: payload?.type,
      serial_no: payload?.s_no,
      date: payload?.entry_date,
      machine_name: payload?.machine_name,
    },
  ];

  let lastError;

  for (const candidate of payloadVariants) {
    try {
      const response = await apiConfig.post("/simplex/SMXCotsChange", candidate);
      return response.data;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(extractErrorMessage(lastError, "Invalid SMXCots Change payload."));
};

export const fetchSimplexUqcEntries = async ({ page = 1, limit = 10 } = {}) => {
  try {
    const response = await apiConfig.get("/simplex/uqc", { page, limit });
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Unable to fetch entries."));
  }
};

export const fetchSimplexCotsChangeEntries = async ({ page = 1, limit = 10 } = {}) => {
  try {
    const response = await apiConfig.get("/simplex/SMXCotsChange", { page, limit });
    return response.data;
  } catch (error) {
    throw new Error(extractErrorMessage(error, "Unable to fetch SMXCots Change entries."));
  }
};

import api from "./apiConfig";

// API endpoints map
const endpoints = {
  "Process Parameter": "/spinning/qc",
  "COTS Checking": "/spinning/cots-checking",
  "Count Change": "/spinning/count-change",
  "Ring Frame Log Book": "/spinning/ring-frame",
  "Speed Checking": "/spinning/speed-checking",
  "Lycra Missing": "/spinning/lycra-missing",
  "Bottom Apron Checking": "/spinning/bottom-apron-checking",
  "Lycra Centering": "/spinning/lycra-centering",
  "RSM & Lycrasensor Checking Online": "/spinning/rsm-lycra-online",
  "RSM & Lycrasensor Checking Offline": "/spinning/rsm-lycra-offline",
  "Wheel Change": "/spinning/wheel-change",
};

// POST API
export const saveSpinningRecord = async (type, payload) => {
  const endpoint = endpoints[type];
  if (!endpoint) throw new Error("Invalid checking type");

  try {
    const response = await api.post(endpoint, payload);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(
        error.response.data.message ||
          error.response.data.error ||
          "Invalid payload data."
      );
    }

    throw new Error(error.message || "Server error occurred");
  }
};

export const spinningProcessParameterDataEntry = async (payload) => {
  try {
    const response = await api.post("/spinning/qc", payload);
    return response.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Invalid payload.");
    }
    throw new Error(error.message || "Server error occurred");
  }
};

export const updateSpinningProcessParameterEntry = async (qcId, payload) => {
  try {
    const response = await api.put(`/spinning/qc/${qcId}`, payload);
    return response.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Invalid payload.");
    }
    throw new Error(error.message || "Server error occurred");
  }
};

export const getSpinningProcessParameterEntries = async (params = {}) => {
  try {
    const response = await api.get("/spinning/qc", params);
    return response.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(
        error.response.data.message || "Failed to load Spinning QC entries."
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
};

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

const resolveWheelChangeEndpoint = (endpoint, payload) => {
  const wheelType = String(payload?.wheel_change_type || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  const allowedTypes = new Set(["type1", "type2", "type3"]);

  if (!allowedTypes.has(wheelType)) {
    throw new Error("Invalid wheel change type. Use Type 1, Type 2, or Type 3.");
  }

  return `${endpoint}/${wheelType}`;
};

// POST API
export const saveSpinningRecord = async (type, payload) => {
  const baseEndpoint = endpoints[type];
  let endpoint = baseEndpoint;
  if (!baseEndpoint) throw new Error("Invalid checking type");

  if (type === "Wheel Change") {
    endpoint = resolveWheelChangeEndpoint(baseEndpoint, payload);
  }

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

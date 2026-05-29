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

export const fetchSpinningCotsCheckingMachines = async () => {
  const endpoints = [
    "/spinning/cots-checking/machines",
    "/spinning/cots-checking/master/machines",
    "/spinning/master/machines",
  ];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await api.get(
        endpoint,
        {},
        { skipGlobalErrorModal: true }
      );
      return response.data;
    } catch (error) {
      lastError = error;
      if (error.response?.status !== 404) {
        break;
      }
    }
  }

  try {
    throw lastError || new Error("Failed to load COTS Checking machines.");
  } catch (error) {
    if (error.response?.data) {
      throw new Error(
        error.response.data.message ||
          error.response.data.error ||
          "Failed to load COTS Checking machines."
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
};

export const fetchSpinningCountChangeRfNos = async (params = {}) => {
  const endpoints = [
    "/spinning/count-change/rf-nos",
    "/spinning/count-change/master/rf-nos",
    "/spinning/count-change/machines",
    "/spinning/count-change/rfs",
  ];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await api.get(
        endpoint,
        params,
        { skipGlobalErrorModal: true }
      );
      return response.data;
    } catch (error) {
      lastError = error;
      if (error.response?.status !== 404) {
        break;
      }
    }
  }

  try {
    throw lastError || new Error("Failed to load Count Change RF numbers.");
  } catch (error) {
    if (error.response?.data) {
      throw new Error(
        error.response.data.message ||
          error.response.data.error ||
          "Failed to load Count Change RF numbers."
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
};

const normalizeCountNameOptionRows = (rows = []) => {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const value = String(
        row?.value ??
        row?.count_name ??
        row?.countName ??
        row?.COUNT_NAME ??
        row?.COUNTNAME ??
        row?.variety_name ??
        row?.variety ??
        row?.VARIETY_NAME ??
        row?.VARIETY ??
        row?.name ??
        row?.label ??
        row?.text ??
        row ??
        ""
      ).trim();
      const label = String(
        row?.label ??
        row?.text ??
        row?.count_name ??
        row?.variety_name ??
        row?.VARIETY_NAME ??
        row?.name ??
        value
      ).trim();
      return value ? { value, label: label || value } : null;
    })
    .filter((option) => {
      if (!option || seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    });
};

const normalizeCountNameOptions = (payload = {}) => {
  const options = payload.options || {};
  const optionValues = Array.isArray(options)
    ? options
    : [
        ...(Array.isArray(options.count_name_from) ? options.count_name_from : []),
        ...(Array.isArray(options.count_name_to) ? options.count_name_to : []),
        ...(Array.isArray(options.count_names) ? options.count_names : []),
        ...(Array.isArray(options.varieties) ? options.varieties : []),
        ...(Array.isArray(options.variety) ? options.variety : []),
      ];
  const rows = [
    ...optionValues,
    ...(Array.isArray(payload.count_names) ? payload.count_names : []),
    ...(Array.isArray(payload.count_name_from) ? payload.count_name_from : []),
    ...(Array.isArray(payload.count_name_to) ? payload.count_name_to : []),
    ...(Array.isArray(payload.variety_names) ? payload.variety_names : []),
    ...(Array.isArray(payload.varieties) ? payload.varieties : []),
    ...(Array.isArray(payload.values) ? payload.values : []),
    ...(Array.isArray(payload.names) ? payload.names : []),
    ...(Array.isArray(payload.data) ? payload.data : []),
  ];

  return normalizeCountNameOptionRows(rows);
};

const normalizeCountChangeDropdownPayload = (payload = {}) => {
  const options = payload.options || {};
  const fallbackOptions = normalizeCountNameOptions(payload);
  const countNameFromOptions = normalizeCountNameOptionRows(options.count_name_from);
  const countNameToOptions = normalizeCountNameOptionRows(options.count_name_to);

  return {
    ...payload,
    countNameOptions: fallbackOptions,
    countNameFromOptions: countNameFromOptions.length ? countNameFromOptions : fallbackOptions,
    countNameToOptions: countNameToOptions.length ? countNameToOptions : fallbackOptions,
  };
};

export const fetchSpinningCountChangeDropdown = async (params = {}) => {
  const endpoints = [
    "/spinning/count-change/dropdown",
    "/spinning/count-change/master/dropdown",
    "/spinning/count-change/count-names",
    "/spinning/count-change/master/count-names",
    "/spinning/count-change/varieties",
    "/spinning/count-change/master/varieties",
  ];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await api.get(
        endpoint,
        params,
        { skipGlobalErrorModal: true }
      );
      const normalizedPayload = normalizeCountChangeDropdownPayload(response.data);
      if (
        normalizedPayload.countNameOptions.length ||
        normalizedPayload.countNameFromOptions.length ||
        normalizedPayload.countNameToOptions.length
      ) {
        return normalizedPayload;
      }
    } catch (error) {
      lastError = error;
      if (error.response?.status !== 404) {
        break;
      }
    }
  }

  try {
    throw lastError || new Error("Failed to load Count Change count names.");
  } catch (error) {
    if (error.response?.data) {
      throw new Error(
        error.response.data.message ||
          error.response.data.error ||
          "Failed to load Count Change count names."
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
};

export const fetchSpinningRingFrameCheckerNames = async (params = {}) => {
  const endpoints = [
    "/spinning/checker-names",
    "/spinning/checker-name",
    "/spinning/master/checker-names",
    "/spinning/ring-frame/checker-names",
    "/spinning/ring-frame-log-book/checker-names",
    "/spinning/ring-frame-logbook/checker-names",
    "/spinning/ring-frame/checker-name",
  ];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await api.get(
        endpoint,
        params,
        { skipGlobalErrorModal: true }
      );
      return response.data;
    } catch (error) {
      lastError = error;
      if (error.response?.status !== 404) {
        break;
      }
    }
  }

  try {
    throw lastError || new Error("Failed to load Ring Frame checker names.");
  } catch (error) {
    if (error.response?.data) {
      throw new Error(
        error.response.data.message ||
          error.response.data.error ||
          "Failed to load Ring Frame checker names."
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
};

export const fetchSpinningRingFrameShifts = async (params = {}) => {
  const endpoints = [
    "/spinning/shifts",
    "/spinning/shift",
    "/spinning/master/shifts",
    "/spinning/ring-frame/shifts",
    "/spinning/ring-frame-log-book/shifts",
    "/spinning/ring-frame-logbook/shifts",
  ];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await api.get(
        endpoint,
        params,
        { skipGlobalErrorModal: true }
      );
      return response.data;
    } catch (error) {
      lastError = error;
      if (error.response?.status !== 404) {
        break;
      }
    }
  }

  try {
    throw lastError || new Error("Failed to load Ring Frame shifts.");
  } catch (error) {
    if (error.response?.data) {
      throw new Error(
        error.response.data.message ||
          error.response.data.error ||
          "Failed to load Ring Frame shifts."
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
};

export const fetchSpinningWheelChangeRfNos = async (params = {}) => {
  const endpoints = [
    "/spinning/wheel-change/rf-nos",
    "/spinning/wheel-change/rf-numbers",
    "/spinning/wheel-change/master/rf-nos",
    "/spinning/wheel-change/machines",
    "/spinning/wheel-change/fm-nos",
    "/spinning/wheel-change/fr-nos",
    "/spinning/wheel-change/type1/rf-nos",
    "/spinning/wheel-change/type1/fm-nos",
    "/spinning/wheel-change/type2/rf-nos",
    "/spinning/wheel-change/type2/fm-nos",
    "/spinning/wheel-change/type3/rf-nos",
    "/spinning/wheel-change/type3/fr-nos",
  ];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await api.get(
        endpoint,
        params,
        { skipGlobalErrorModal: true }
      );
      return response.data;
    } catch (error) {
      lastError = error;
      if (error.response?.status !== 404) {
        break;
      }
    }
  }

  try {
    throw lastError || new Error("Failed to load Wheel Change RF numbers.");
  } catch (error) {
    if (error.response?.data) {
      throw new Error(
        error.response.data.message ||
          error.response.data.error ||
          "Failed to load Wheel Change RF numbers."
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
};

export const fetchSpinningWheelChangeDropdown = async (wheelType = "", params = {}) => {
  const normalizedType = String(wheelType || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  const typeEndpoint = ["type1", "type2", "type3"].includes(normalizedType)
    ? `/spinning/wheel-change/${normalizedType}/master/dropdown`
    : null;
  const endpoints = [
    typeEndpoint,
    "/spinning/wheel-change/dropdown",
    "/spinning/wheel-change/master/dropdown",
  ].filter(Boolean);
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await api.get(
        endpoint,
        params,
        { skipGlobalErrorModal: true }
      );
      return response.data;
    } catch (error) {
      lastError = error;
      if (error.response?.status !== 404) {
        break;
      }
    }
  }

  try {
    throw lastError || new Error("Failed to load Wheel Change dropdown options.");
  } catch (error) {
    if (error.response?.data) {
      throw new Error(
        error.response.data.message ||
          error.response.data.error ||
          "Failed to load Wheel Change dropdown options."
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
};

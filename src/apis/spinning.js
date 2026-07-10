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
  "Lycra Out of Centering": "/spinning/lycra-centering",
  "RSM & Lycrasensor Checking Online": "/spinning/rsm-lycra-online",
  "RSM & Lycrasensor Checking Offline": "/spinning/rsm-lycra-offline",
  "Wheel Change": "/spinning/wheel-change",
};

const resolveWheelChangeEndpoint = (endpoint, payload) => {
  // `wheel_change_sub_type` is an internal routing hint (Type 4 sends the
  // canonical "type4" here while `wheel_change_type` itself holds the
  // backend's expected "Wheel Change" label) — Type 1/2/3 don't set it, so
  // this falls back to reading `wheel_change_type` as before.
  const wheelType = String(payload?.wheel_change_sub_type || payload?.wheel_change_type || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  const allowedTypes = new Set(["type1", "type2", "type3", "type4"]);

  if (!allowedTypes.has(wheelType)) {
    throw new Error("Invalid wheel change type. Use Type 1, Type 2, Type 3, or Type 4.");
  }

  return `${endpoint}/${wheelType}`;
};

// POST API
export const saveSpinningRecord = async (type, payload) => {
  const baseEndpoint = endpoints[type];
  let endpoint = baseEndpoint;
  if (!baseEndpoint) throw new Error("Invalid checking type");

  let requestPayload = payload;
  if (type === "Wheel Change") {
    endpoint = resolveWheelChangeEndpoint(baseEndpoint, payload);
    if (payload && Object.prototype.hasOwnProperty.call(payload, "wheel_change_sub_type")) {
      const { wheel_change_sub_type, ...rest } = payload;
      requestPayload = rest;
    }
  }

  try {
    const response = await api.post(endpoint, requestPayload);
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
    "/spinning/count-change/rf-nos",
    "/spinning/count-change/master/rf-nos",
    "/spinning/count-change/machines",
    "/spinning/count-change/rfs",
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
        row?.cntname ??
        row?.count_code ??
        row?.count_name ??
        row?.countName ??
        row?.COUNT_NAME ??
        row?.COUNTNAME ??
        row?.variety_name ??
        row?.prep_variety_name ??
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
        row?.cntname ??
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
        ...(Array.isArray(options.count_name) ? options.count_name : []),
        ...(Array.isArray(options.count_names) ? options.count_names : []),
        ...(Array.isArray(options.varieties) ? options.varieties : []),
        ...(Array.isArray(options.variety) ? options.variety : []),
          ...(Array.isArray(options.prep_variety_names) ? options.prep_variety_names : []),
          ...(Array.isArray(options.prep_varieties) ? options.prep_varieties : []),
      ];
  const rows = [
    ...optionValues,
    ...(Array.isArray(payload.count_names) ? payload.count_names : []),
    ...(Array.isArray(payload.count_options) ? payload.count_options : []),
    ...(Array.isArray(payload.counts) ? payload.counts : []),
    ...(Array.isArray(payload.count_name_from) ? payload.count_name_from : []),
    ...(Array.isArray(payload.count_name_to) ? payload.count_name_to : []),
    ...(Array.isArray(payload.variety_names) ? payload.variety_names : []),
      ...(Array.isArray(payload.prep_variety_names) ? payload.prep_variety_names : []),
    ...(Array.isArray(payload.varieties) ? payload.varieties : []),
      ...(Array.isArray(payload.prep_varieties) ? payload.prep_varieties : []),
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

const normalizeMachineNumberOptionRows = (rows = []) => {
  const seen = new Set();

  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const value = String(
        row?.value ??
          row?.machine_no ??
          row?.machine_number ??
          row?.mc_no ??
          row?.code ??
          row ??
          ""
      ).trim();
      const label = String(
        row?.label ??
          row?.text ??
          row?.machine_name ??
          row?.mc_name ??
          row?.name ??
          value
      ).trim();
      const deptCode = String(
        row?.dept_code ??
          row?.department_code ??
          row?.dept ??
          row?.department ??
          ""
      ).trim();

      return value
        ? {
            value,
            label: [value, label && label !== value ? label : "", deptCode ? `Dept ${deptCode}` : ""]
              .filter(Boolean)
              .join(" - "),
            machineName: label,
            deptCode,
          }
        : null;
    })
    .filter((option) => {
      if (!option || seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    });
};

const normalizeWheelChangeDropdownPayload = (payload = {}) => {
  const options = payload.options || {};
  const existingMachineOptions = normalizeMachineNumberOptionRows(
    options.machine_no_existing ||
      options.existing_machine_options ||
      payload.machine_no_existing ||
      payload.existing_machine_options ||
      payload.machine_numbers ||
      payload.mc_nos ||
      []
  );
  const proposedMachineOptions = normalizeMachineNumberOptionRows(
    options.machine_no_proposed ||
      options.proposed_machine_options ||
      payload.machine_no_proposed ||
      payload.proposed_machine_options ||
      payload.machine_numbers ||
      payload.mc_nos ||
      []
  );

  return {
    ...payload,
    existingMachineOptions,
    proposedMachineOptions,
    machineNumberOptions:
      existingMachineOptions.length >= proposedMachineOptions.length
        ? existingMachineOptions
        : proposedMachineOptions,
  };
};

export const fetchSpinningCountChangeDropdown = async (params = {}) => {
  const endpoints = [
    "/spinning/count-change/master/count-dropdown",
    "/spinning/count-change/master/counts",
    "/spinning/count-change/master/count-names",
    "/spinning/count-change/dropdown",
    "/spinning/count-change/master/dropdown",
    "/spinning/count-change/count-names",
    "/spinning/count-change/master/count-names",
    "/spinning/count-change/varieties",
    "/spinning/count-change/master/varieties",
      "/spinning/wheel-change/master/varieties",
      "/spinning/wheel-change/varieties",
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

export const fetchSpinningMachineNumberOptions = async ({
  screen = "master",
  prefix = "",
  dept_code = "",
  department_code = "",
  department = "",
} = {}) => {
  const screenEndpoints = {
    "lycra-missing": ["/spinning/lycra-missing/master/mc-nos"],
    "lycra-centering": ["/spinning/lycra-centering/master/mc-nos"],
    "rsm-lycra-online": ["/spinning/rsm-lycra-online/master/mc-nos"],
    "rsm-lycra-offline": ["/spinning/rsm-lycra-offline/master/mc-nos"],
    "ring-frame": ["/spinning/ring-frame/master/mc-nos"],
    "wheel-change": [
      "/spinning/wheel-change/master/mc-nos",
      "/spinning/wheel-change/master/machine-numbers",
      "/spinning/master/mc-nos",
      "/spinning/master/machine-numbers",
    ],
    master: ["/spinning/master/mc-nos"],
  };
  const endpoints = [
    ...(screenEndpoints[screen] || screenEndpoints.master),
    "/spinning/master/mc-nos",
  ];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await api.get(
        endpoint,
        {
          prefix,
          mc_no_prefix: prefix,
          machine_prefix: prefix,
          dept_code,
          department_code,
          department,
        },
        { skipGlobalErrorModal: true }
      );
      const payload = response.data;
      const rows = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.mc_nos)
          ? payload.mc_nos
          : Array.isArray(payload?.machine_numbers)
            ? payload.machine_numbers
            : Array.isArray(payload)
              ? payload
              : [];

      if (rows.length || endpoint === endpoints[endpoints.length - 1]) {
        return payload;
      }
    } catch (error) {
      lastError = error;
      if (error.response?.status !== 404) {
        break;
      }
    }
  }

  try {
    throw lastError || new Error("Failed to load Spinning machine numbers.");
  } catch (error) {
    if (error.response?.data) {
      throw new Error(
        error.response.data.message ||
          error.response.data.error ||
          "Failed to load Spinning machine numbers."
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
};

export const fetchSpinningCountOptions = async ({ prefix = "", screen = "master" } = {}) => {
  const screenEndpoints = {
    "count-change": [
      "/spinning/count-change/master/count-dropdown",
      "/spinning/count-change/master/counts",
      "/spinning/count-change/master/count-names",
    ],
    "wheel-change": [
      "/spinning/wheel-change/master/count-dropdown",
      "/spinning/wheel-change/master/counts",
      "/spinning/wheel-change/master/count-names",
    ],
    master: [
      "/spinning/master/count-dropdown",
      "/spinning/master/counts",
      "/spinning/master/count-names",
    ],
  };
  const endpoints = [
    ...(screenEndpoints[screen] || screenEndpoints.master),
    "/spinning/master/count-dropdown",
    "/spinning/master/counts",
    "/spinning/master/count-names",
  ];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await api.get(endpoint, { prefix, count_prefix: prefix }, { skipGlobalErrorModal: true });
      const options = normalizeCountNameOptions(response.data);
      if (options.length || endpoint === endpoints[endpoints.length - 1]) return options;
    } catch (error) {
      lastError = error;
      if (error.response?.status && error.response.status !== 404) break;
    }
  }

  try {
    throw lastError || new Error("Failed to load Spinning count names.");
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || error.response.data.error || "Failed to load Spinning count names.");
    }
    throw new Error(error.message || "Server error occurred");
  }
};

export const fetchSpinningRingFrameCheckerNames = async (params = {}) => {
  const endpoints = [
    "/spinning/master/employee-names",
    "/spinning/master/employee-dropdown",
    "/spinning/master/employees",
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
      return normalizeWheelChangeDropdownPayload(response.data);
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
  const typeEndpoint = ["type1", "type2", "type3", "type4"].includes(normalizedType)
    ? `/spinning/wheel-change/${normalizedType}/master/dropdown`
    : null;
  const endpoints = [
    typeEndpoint,
    "/spinning/wheel-change/master/count-dropdown",
    "/spinning/wheel-change/master/counts",
    "/spinning/wheel-change/master/count-names",
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

// Backward-compatible alias for existing callers.
export const submitSpinningProcessParameterEntry =
  spinningProcessParameterDataEntry;

// "Latest" means most recently *entered* (submitted), not most recently
// *touched* — an older entry's updated_at can be bumped later than a newer
// entry's created_at simply because an L2 reviewer approved/rejected it
// after the fact, which would otherwise outrank the actual newest row.
const getRecordTimestamp = (record) => {
  const raw =
    record?.created_at ??
    record?.createdAt ??
    record?.created_time ??
    record?.createdTime ??
    record?.created_on ??
    record?.createdOn ??
    record?.entry_date ??
    record?.date ??
    record?.updated_at ??
    record?.updatedAt ??
    Object.entries(record || {}).find(([key, value]) => {
      if (!value) return false;
      const normalizedKey = String(key || "").toLowerCase();
      if (!/(created|updated|time|date)/.test(normalizedKey)) return false;
      return !Number.isNaN(new Date(value).getTime());
    })?.[1] ??
    null;
  const parsed = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : -Infinity;
};

// The backend's id column for these tables isn't consistently named "id" —
// fall back to any *_id-shaped numeric key so the recency tiebreaker still
// works when the field is e.g. type1_id/entry_id instead.
const getRecordId = (record) => {
  const direct = Number(record?.id);
  if (Number.isFinite(direct) && direct !== 0) return direct;
  const match = Object.entries(record || {}).find(([key, value]) => {
    if (!/(^|_)id$/i.test(key)) return false;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric !== 0;
  });
  return match ? Number(match[1]) : 0;
};

const normalizeWheelChangeLatestRecordPayload = (payload) => {
  const latestRecord = payload?.latest_record ?? payload?.latestRecord ?? null;

  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.rows)
      ? payload.rows
      : Array.isArray(payload)
        ? payload
        : [];

  // Filtered wheel-change queries (e.g. approval_status=approved) come back
  // as a single flat record object with no data/rows/latest_record wrapper
  // at all — the payload itself *is* the record. Only rows/latestRecord
  // cover the wrapped shapes above, so without this the payload is silently
  // dropped and the function returns null even though a real match exists.
  const isWrapperPayload =
    payload && typeof payload === "object" && !Array.isArray(payload) &&
    (Array.isArray(payload.data) || Array.isArray(payload.rows) || "latest_record" in payload || "latestRecord" in payload);
  const singleRecord =
    payload && typeof payload === "object" && !Array.isArray(payload) && !isWrapperPayload && Object.keys(payload).length
      ? payload
      : null;

  // Some endpoints don't guarantee newest-first ordering, and the backend's
  // own latest_record has been observed to lag behind the actual newest row
  // (e.g. it reflects the first entry ever saved for that variety instead of
  // the most recent). Don't trust either source blindly — pick whichever of
  // latest_record vs. the data/rows array is actually newest by timestamp.
  const candidates = [latestRecord, singleRecord, ...rows].filter(Boolean);
  if (!candidates.length) return null;

  const sortedByRecency = [...candidates].sort((a, b) => {
    const diff = getRecordTimestamp(b) - getRecordTimestamp(a);
    if (diff !== 0) return diff;
    return getRecordId(b) - getRecordId(a);
  });

  return sortedByRecency[0] || null;
};

export const fetchSpinningWheelChangeLatestRecord = async (wheelType = "", params = {}) => {
  const normalizedType = String(wheelType || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  const endpoints = ["type1", "type2", "type3", "type4"].includes(normalizedType)
    ? [`/spinning/wheel-change/${normalizedType}`]
    : [
        "/spinning/wheel-change/type1",
        "/spinning/wheel-change/type2",
        "/spinning/wheel-change/type3",
      ];

  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await api.get(endpoint, params, { skipGlobalErrorModal: true });
      const latestRecord = normalizeWheelChangeLatestRecordPayload(response.data);
      if (latestRecord || endpoint === endpoints[endpoints.length - 1]) {
        return latestRecord;
      }
    } catch (error) {
      lastError = error;
      if (error.response?.status !== 404) {
        break;
      }
    }
  }

  try {
    throw lastError || new Error("Failed to load Wheel Change latest record.");
  } catch (error) {
    if (error.response?.data) {
      throw new Error(
        error.response.data.message ||
          error.response.data.error ||
          "Failed to load Wheel Change latest record."
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
};

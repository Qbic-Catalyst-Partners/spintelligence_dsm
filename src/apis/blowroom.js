import apiConfig from "./apiConfig";

const BLOWROOM_SYNC_ENDPOINT = "/blowroom/sync";
const BLOWROOM_DROP_TEST_ENDPOINT = "/blowroom/drop-test";
const BLOWROOM_BR_WASTE_ENDPOINT = "/blowroom/br-waste-study";
const BLOWROOM_PROCESS_PARAMETER_ENDPOINT = "/blowroom/header";
const BLOWROOM_WASTE_TYPE_MASTER_ENDPOINT = "/blowroom/master/waste-types";
const BLOWROOM_WITHIN_LAP_CV_ENDPOINT = "/blowroom/within-lap-cv";
const BLOWROOM_BETWEEN_LAP_CV_ENDPOINT = "/blowroom/between-lap-cv";

const getBlowroomApiErrorMessage = (error, fallbackMessage) => {
  const data = error.response?.data;
  if (!data) return error.message || fallbackMessage;

  const details = Array.isArray(data.details) ? data.details.join(", ") : data.details;
  return data.message || data.error || details || fallbackMessage;
};

const uniqueStrings = (values = []) =>
  Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));

const parseVarietyPayload = (payload) => {
  const namesList = Array.isArray(payload?.names)
    ? payload.names
    : Array.isArray(payload?.variety_names)
      ? payload.variety_names
      : Array.isArray(payload?.prep_variety_names)
        ? payload.prep_variety_names
      : [];
  if (namesList.length) return uniqueStrings(namesList);

  const optionGroups = payload?.options || payload?.dropdown_options || {};
  const optionRows = Array.isArray(optionGroups)
    ? optionGroups
    : [
        ...(Array.isArray(optionGroups.variety) ? optionGroups.variety : []),
        ...(Array.isArray(optionGroups.varieties) ? optionGroups.varieties : []),
        ...(Array.isArray(optionGroups.variety_name) ? optionGroups.variety_name : []),
      ];
  const optionNames = optionRows
    .map((option) => option?.text || option?.label || option?.value)
    .filter((name) => String(name || "").trim() && !String(name).includes("-- Select"));
  if (optionNames.length) return uniqueStrings(optionNames);

  const rows = [
    ...(Array.isArray(payload?.data) ? payload.data : []),
    ...(Array.isArray(payload?.varieties) ? payload.varieties : []),
    ...(Array.isArray(payload) ? payload : []),
  ];
  return uniqueStrings(rows.map((row) => row?.variety_name || row?.prep_variety_name || row?.variety || row?.name || row));
};

const normalizeMachineRows = (rows = []) =>
  rows
    .map((row) => {
      if (typeof row === "string") {
        const value = row.trim();
        return value ? { value, label: value } : null;
      }

      const mcNo = String(row?.mc_no ?? row?.mcNo ?? row?.value ?? row?.machine_no ?? row?.machineNo ?? "").trim();
      const mcName = String(row?.mc_name ?? row?.mcName ?? row?.label ?? row?.text ?? row?.machine_name ?? row?.machineName ?? mcNo ?? "").trim();
      const name = mcName || mcNo;
      return name ? { value: name, label: name } : null;
    })
    .filter(Boolean);

const normalizeMasterNameRows = (payload) => {
  const rows = [
    ...(Array.isArray(payload?.data) ? payload.data : []),
    ...(Array.isArray(payload?.rows) ? payload.rows : []),
    ...(Array.isArray(payload?.options) ? payload.options : []),
    ...(Array.isArray(payload) ? payload : []),
  ];

  const seen = new Set();
  return rows
    .map((row) => {
      if (row && typeof row === "object") {
        const name = String(
          row.waste_type_name ??
          row.wasteTypeName ??
          row.waste_type ??
          row.wasteType ??
          row.name ??
          row.label ??
          row.value ??
          row.text ??
          ""
        ).trim();
        return name ? { value: name, label: name } : null;
      }

      const name = String(row || "").trim();
      return name ? { value: name, label: name } : null;
    })
    .filter((option) => {
      if (!option || seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    });
};

const normalizeCountPayload = (payload) => {
  const optionRows = Array.isArray(payload?.options?.count_name)
    ? payload.options.count_name
    : Array.isArray(payload?.options)
      ? payload.options
      : [];
  const rows = [
    ...(Array.isArray(payload?.count_options) ? payload.count_options : []),
    ...(Array.isArray(payload?.count_names) ? payload.count_names : []),
    ...(Array.isArray(payload?.counts) ? payload.counts : []),
    ...(Array.isArray(payload?.data) ? payload.data : []),
    ...(Array.isArray(payload) ? payload : []),
    ...optionRows,
  ];

  const seen = new Set();
  return rows
    .map((row) => {
      if (row && typeof row === "object") {
        const countName = String(
          row.count_name ?? row.countName ?? row.cntname ?? row.name ?? row.text ?? row.label ?? row.value ?? ""
        ).trim();
        const countCode = String(row.count_code ?? row.countCode ?? row.cntcode ?? row.code ?? "").trim();
        return countName
          ? {
              count_code: countCode,
              count_name: countName,
              value: countName,
              label: countName,
            }
          : null;
      }

      const countName = String(row || "").trim();
      return countName
        ? {
            count_code: "",
            count_name: countName,
            value: countName,
            label: countName,
          }
        : null;
    })
    .filter((count) => {
      if (!count || seen.has(count.count_name)) return false;
      seen.add(count.count_name);
      return true;
    });
};

export const fetchBlowroomMasterVarieties = async ({ prefix = "" } = {}) => {
  const endpoints = [
    "/blowroom/master/varieties",
    "/blowroom/master/dropdown",
  ];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const res = await apiConfig.get(
        endpoint,
        { prefix },
        { skipGlobalErrorModal: true }
      );
      const options = parseVarietyPayload(res.data);
      if (options.length || endpoint === endpoints[endpoints.length - 1]) return options;
    } catch (error) {
      lastError = error;
      if (error.response?.status && error.response.status !== 404) {
        throw new Error(getBlowroomApiErrorMessage(error, "Failed to fetch variety options"));
      }
    }
  }

  throw new Error(getBlowroomApiErrorMessage(lastError || {}, "Failed to fetch variety options"));
};

export const fetchBlowroomCountOptions = async ({ prefix = "", screen = "header" } = {}) => {
  const screenEndpoints = {
    sync: ["/blowroom/sync/master/count-dropdown"],
    "drop-test": ["/blowroom/drop-test/master/count-dropdown"],
    "br-waste-study": ["/blowroom/br-waste-study/master/count-dropdown"],
    header: [
      "/blowroom/header/master/dropdown",
      "/blowroom/header/master/count-dropdown",
      "/blowroom/header/master/counts",
      "/blowroom/header/master/count-names",
    ],
  };
  const endpoints = [
    ...(screenEndpoints[screen] || screenEndpoints.header),
    "/blowroom/master/count-dropdown",
    "/blowroom/master/counts",
    "/blowroom/master/count-names",
  ];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const res = await apiConfig.get(
        endpoint,
        { prefix, count_prefix: prefix },
        { skipGlobalErrorModal: true }
      );
      const options = normalizeCountPayload(res.data);
      if (options.length || endpoint === endpoints[endpoints.length - 1]) return options;
    } catch (error) {
      lastError = error;
      if (error.response?.status && error.response.status !== 404) {
        throw new Error(getBlowroomApiErrorMessage(error, "Failed to fetch count options"));
      }
    }
  }

  throw new Error(getBlowroomApiErrorMessage(lastError || {}, "Failed to fetch count options"));
};

export const fetchBlowroomMasterWasteTypes = async () => {
  const endpoints = [
    BLOWROOM_WASTE_TYPE_MASTER_ENDPOINT,
    `${BLOWROOM_WASTE_TYPE_MASTER_ENDPOINT}/dropdown`,
    `${BLOWROOM_WASTE_TYPE_MASTER_ENDPOINT}/list`,
  ];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const res = await apiConfig.get(
        endpoint,
        {},
        { skipGlobalErrorModal: true }
      );
      const options = normalizeMasterNameRows(res.data);
      if (options.length || endpoint === endpoints[endpoints.length - 1]) {
        return options;
      }
    } catch (error) {
      lastError = error;
      if (error.response?.status && error.response.status !== 404) {
        throw new Error(getBlowroomApiErrorMessage(error, "Failed to fetch waste type options"));
      }
    }
  }

  throw new Error(getBlowroomApiErrorMessage(lastError || {}, "Failed to fetch waste type options"));
};

export const fetchBlowroomLapCvMasterMcNos = async ({
  prefix = "BR",
  screen = "within-lap-cv",
} = {}) => {
  const screenEndpoints = {
    "within-lap-cv": [
      "/blowroom/within-lap-cv/master/mc-nos",
      "/blowroom/within-lap-cv/master/machine-nos",
      "/blowroom/master/mc-nos",
      "/blowroom/master/machine-nos",
    ],
    "between-lap-cv": [
      "/blowroom/between-lap-cv/master/mc-nos",
      "/blowroom/between-lap-cv/master/machine-nos",
      "/blowroom/master/mc-nos",
      "/blowroom/master/machine-nos",
    ],
  };
  const endpoints = screenEndpoints[screen] || screenEndpoints["within-lap-cv"];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const res = await apiConfig.get(
        endpoint,
        { prefix, mc_no_prefix: prefix, machine_prefix: prefix },
        { skipGlobalErrorModal: true }
      );
      const payload = res?.data || {};
      const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload) ? payload : [];
      const options = normalizeMachineRows(rows);
      if (options.length || endpoint === endpoints[endpoints.length - 1]) {
        return options;
      }
    } catch (error) {
      lastError = error;
      if (error.response?.status && error.response.status !== 404) {
        throw new Error(getBlowroomApiErrorMessage(error, "Failed to fetch machine options"));
      }
    }
  }

  throw new Error(getBlowroomApiErrorMessage(lastError || {}, "Failed to fetch machine options"));
};

export const saveBlowroomMasterWasteType = async (wasteTypeName) => {
  const name = String(wasteTypeName || "").trim();
  if (!name) {
    throw new Error("Waste type is required");
  }

  try {
    const res = await apiConfig.post(
      BLOWROOM_WASTE_TYPE_MASTER_ENDPOINT,
      { waste_type: name, waste_type_name: name, name },
      { skipGlobalSuccessModal: true }
    );
    return res.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(
        error.response.data.message ||
        error.response.data.error ||
        "Failed to save waste type"
      );
    }
    throw new Error(error.message || "Failed to save waste type");
  }
};

export const fetchBlowroomDataApi = async () => {
  try {
    const res = await apiConfig.get(BLOWROOM_SYNC_ENDPOINT);
    return res.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Failed to fetch data");
    }
    throw new Error(error.message || "Failed to fetch data");
  }
};

export const saveBlowroomDataApi = async (payload) => {
  try {
    const res = await apiConfig.post(BLOWROOM_SYNC_ENDPOINT, payload);
    return res.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Failed to save data");
    }
    throw new Error(error.message || "Failed to save data");
  }
};

export const saveBlowroomDropTestApi = async (payload) => {
  try {
    const res = await apiConfig.post(BLOWROOM_DROP_TEST_ENDPOINT, payload);
    return res.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Failed to save drop test data");
    }
    throw new Error(error.message || "Failed to save drop test data");
  }
};

export const saveBlowroomBrWasteApi = async (payload) => {
  try {
    const res = await apiConfig.post(BLOWROOM_BR_WASTE_ENDPOINT, payload);
    return res.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Failed to save waste study data");
    }
    throw new Error(error.message || "Failed to save waste study data");
  }
};

export const fetchBlowroomBrWasteApi = async ({ page = 1, limit = 50 } = {}) => {
  try {
    const res = await apiConfig.get(BLOWROOM_BR_WASTE_ENDPOINT, { page, limit });
    return res.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Failed to fetch waste study data");
    }
    throw new Error(error.message || "Failed to fetch waste study data");
  }
};

export const fetchBlowroomProcessParametersApi = async ({ page = 1, limit = 10 } = {}) => {
  try {
    const res = await apiConfig.get(BLOWROOM_PROCESS_PARAMETER_ENDPOINT, { page, limit });
    return res.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Failed to fetch process parameter entries");
    }
    throw new Error(error.message || "Failed to fetch process parameter entries");
  }
};

export const saveBlowroomProcessParameterApi = async (payload) => {
  try {
    const res = await apiConfig.post(BLOWROOM_PROCESS_PARAMETER_ENDPOINT, payload);
    return res.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Failed to save process parameter entry");
    }
    throw new Error(error.message || "Failed to save process parameter entry");
  }
};

export const saveBlowroomWithinLapCvApi = async (payload) => {
  try {
    const res = await apiConfig.post(BLOWROOM_WITHIN_LAP_CV_ENDPOINT, payload);
    return res.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Failed to save within lap CV data");
    }
    throw new Error(error.message || "Failed to save within lap CV data");
  }
};

export const saveBlowroomBetweenLapCvApi = async (payload) => {
  try {
    const res = await apiConfig.post(BLOWROOM_BETWEEN_LAP_CV_ENDPOINT, payload);
    return res.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Failed to save between lap CV data");
    }
    throw new Error(error.message || "Failed to save between lap CV data");
  }
};

export const updateBlowroomProcessParameterApi = async (id, payload) => {
  try {
    const res = await apiConfig.put(
      `${BLOWROOM_PROCESS_PARAMETER_ENDPOINT}/${encodeURIComponent(id)}`,
      payload
    );
    return res.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.message || "Failed to update process parameter entry");
    }
    throw new Error(error.message || "Failed to update process parameter entry");
  }
};

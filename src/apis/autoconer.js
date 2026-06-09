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

  return error?.message || fallback;
};

const shouldTryAlternateEndpoint = (error) => {
  const status = error?.response?.status;
  return status === 404 || status === 405 || !status;
};

const buildFallbackResponse = ({ paginated = false } = {}) =>
  paginated
    ? { data: [], page: 1, limit: 10, total: 0, totalPages: 0 }
    : { data: [] };

const normalizePayload = (value) => {
  if (Array.isArray(value)) {
    return value.map(normalizePayload);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, currentValue]) => [
        key,
        normalizePayload(currentValue),
      ])
    );
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    return null;
  }

  return value;
};

const removeEmptyValues = (value) => {
  if (Array.isArray(value)) {
    return value
      .map(removeEmptyValues)
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, currentValue]) => [key, removeEmptyValues(currentValue)])
        .filter(([, currentValue]) => currentValue !== undefined)
    );
  }

  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  return value;
};

const toNullableNumber = (value) => {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const buildAutoconerEndpoints = (path) => [
  `/autoconer/${path}`,
  `/api/autoconer/${path}`,
];

const silentRequestConfig = { skipGlobalErrorModal: true };

export const normalizeAutoconerCountOptions = (payload = {}) => {
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
    .map((item) => {
      if (item && typeof item === "object") {
        const label = String(
          item.count_name ??
            item.countName ??
            item.cntname ??
            item.name ??
            item.label ??
            item.text ??
            item.value ??
            ""
        ).trim();
        const code = String(item.count_code ?? item.countCode ?? item.cntcode ?? item.code ?? "").trim();
        return label ? { value: label, label, name: label, code, count_code: code, count_name: label } : null;
      }

      const label = String(item || "").trim();
      return label ? { value: label, label, name: label, code: "", count_code: "", count_name: label } : null;
    })
    .filter((item) => {
      if (!item || seen.has(item.value)) return false;
      seen.add(item.value);
      return true;
    });
};

export const normalizeAutoconerTextOptions = (payload = {}, keys = []) => {
  const optionRows = Array.isArray(payload?.options)
    ? payload.options
    : Object.values(payload?.options || {}).flatMap((value) => (Array.isArray(value) ? value : []));
  const rows = [
    ...(Array.isArray(payload?.data) ? payload.data : []),
    ...(Array.isArray(payload?.values) ? payload.values : []),
    ...(Array.isArray(payload?.items) ? payload.items : []),
    ...(Array.isArray(payload) ? payload : []),
    ...optionRows,
  ];

  const seen = new Set();
  return rows
    .map((item) => {
      if (item && typeof item === "object") {
        const label = String(
          keys.map((key) => item?.[key]).find((value) => String(value || "").trim()) ??
            item.name ??
            item.label ??
            item.text ??
            item.value ??
            ""
        ).trim();
        return label || null;
      }

      const label = String(item || "").trim();
      return label || null;
    })
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
};

const postAutoconer = async (path, payload, fallbackMessage) => {
  return postAutoconerCandidates(path, [payload], fallbackMessage);
};

const postAutoconerCandidates = async (path, payloadCandidates, fallbackMessage) => {
  const endpoints = buildAutoconerEndpoints(path);
  let lastError;

  for (const candidate of payloadCandidates) {
    const normalizedPayload = removeEmptyValues(normalizePayload(candidate));

    for (const endpoint of endpoints) {
      try {
        const response = await apiConfig.post(endpoint, normalizedPayload, silentRequestConfig);
        return response.data;
      } catch (error) {
        lastError = error;
        if (!shouldTryAlternateEndpoint(error)) {
          break;
        }
      }
    }
  }

  throw new Error(getErrorMessage(lastError, fallbackMessage));
};

const postAutoconerPathCandidates = async (paths, payloadCandidates, fallbackMessage) => {
  let lastError;

  for (const path of paths) {
    try {
      return await postAutoconerCandidates(path, payloadCandidates, fallbackMessage);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(getErrorMessage(lastError, fallbackMessage));
};

const getAutoconer = async (
  path,
  params,
  fallbackMessage,
  { suppressFailure = false, paginated = false } = {}
) => {
  const endpoints = buildAutoconerEndpoints(path);
  let lastError;

  for (const endpoint of endpoints) {
    try {
      const response = await apiConfig.get(endpoint, params, silentRequestConfig);
      return response.data;
    } catch (error) {
      lastError = error;
      if (!shouldTryAlternateEndpoint(error)) {
        break;
      }
    }
  }

  if (suppressFailure) {
    return buildFallbackResponse({ paginated });
  }

  throw new Error(getErrorMessage(lastError, fallbackMessage));
};

const getAutoconerPathCandidates = async (
  paths,
  params,
  fallbackMessage,
  { suppressFailure = false, paginated = false } = {}
) => {
  let lastError;

  for (const path of paths) {
    try {
      return await getAutoconer(path, params, fallbackMessage, {
        suppressFailure: false,
        paginated,
      });
    } catch (error) {
      lastError = error;
    }
  }

  if (suppressFailure) {
    return buildFallbackResponse({ paginated });
  }

  throw new Error(getErrorMessage(lastError, fallbackMessage));
};

export const submitAutoconerLycraChecking = async (payload) =>
  postAutoconer("lycra-checking", payload, "Unable to save lycra checking.");

export const fetchAutoconerLycraChecking = async () =>
  getAutoconer("lycra-checking", {}, "Unable to fetch lycra checking.", {
    suppressFailure: true,
  });

export const fetchAutoconerCountWiseCuts = async () =>
  getAutoconer("count-wise-cuts", {}, "Unable to fetch count wise cuts.", {
    suppressFailure: true,
  });

export const fetchAutoconerCountMaster = async ({ search = "", screen = "" } = {}) => {
  const normalizedScreen = String(screen || "").trim();
  const response = await getAutoconerPathCandidates(
    [
      ...(normalizedScreen
        ? [
            `${normalizedScreen}/master/count-names`,
            `${normalizedScreen}/master/count-dropdown`,
            `${normalizedScreen}/master/counts`,
            `${normalizedScreen}/master-data`,
          ]
        : []),
      "master/count-dropdown",
      "master/counts",
      "master/count-names",
      "count-master",
      "master-data",
    ],
    { search },
    "Unable to fetch Autoconer count master.",
    { suppressFailure: true }
  );

  return normalizeAutoconerCountOptions(response);
};

export const fetchAutoconerConsigneeMaster = async ({ search = "", screen = "" } = {}) => {
  const normalizedScreen = String(screen || "").trim();
  const response = await getAutoconerPathCandidates(
    [
      ...(normalizedScreen
        ? [
            `${normalizedScreen}/master/consignee-dropdown`,
            `${normalizedScreen}/master/consignees`,
            `${normalizedScreen}/master-data`,
          ]
        : []),
      "master/consignees",
      "master/consignee-dropdown",
      "master-data",
    ],
    { search },
    "Unable to fetch Autoconer consignee master.",
    { suppressFailure: true }
  );

  return normalizeAutoconerTextOptions(response, [
    "consignee_name",
    "consigneeName",
    "consignee",
    "name",
  ]);
};

export const fetchAutoconerMachineMaster = async ({ search = "" } = {}) =>
  getAutoconer(
    "master/machines",
    { search },
    "Unable to fetch Autoconer machine master.",
    { suppressFailure: true }
  );

export const fetchAutoconerParameterEntries = async () =>
  getAutoconer("parameter-entries", {}, "Unable to fetch parameter entries.", {
    suppressFailure: true,
  });

export const fetchAutoconerPendingCspParameterEntries = async () =>
  getAutoconer(
    "parameter-entries/pending-csp",
    {},
    "Unable to fetch pending CSP parameter entries.",
    { suppressFailure: true }
  );

export const fetchAutoconerPendingQualityParameterEntries = async () =>
  getAutoconer(
    "parameter-entries/pending-quality",
    {},
    "Unable to fetch pending quality parameter entries.",
    { suppressFailure: true }
  );

const buildParameterEntryPayload = (payload) => ({
  inspection_type: payload?.inspection_type,
  entry_date: payload?.entry_date,
  count_name: payload?.count_name,
  act_count: payload?.act_count,
  strength: payload?.strength,
  count_cv: payload?.count_cv,
  strength_cv: payload?.strength_cv,
  csp: payload?.csp,
  cone_color: payload?.cone_color,
  u: payload?.u,
  cvm: payload?.cvm,
  cv_1m: payload?.cv_1m,
  cv_3m: payload?.cv_3m,
  cv_10m: payload?.cv_10m,
  br_1_5mm: payload?.br_1_5mm,
  cvb: payload?.cvb,
  thin_minus_50: payload?.thin_minus_50,
  thick_plus_50: payload?.thick_plus_50,
  neps_plus_200: payload?.neps_plus_200,
  total_1: payload?.total_1,
  thin_minus_40: payload?.thin_minus_40,
  thick_plus_35: payload?.thick_plus_35,
  thick_plus_70: payload?.thick_plus_70,
  neps_plus_140: payload?.neps_plus_140,
  total_2: payload?.total_2,
  thin_minus_30: payload?.thin_minus_30,
  neps_plus_400: payload?.neps_plus_400,
  payload: payload?.payload || null,
});

export const submitAutoconerParameterEntry = async (payload) =>
  postAutoconer(
    "parameter-entries",
    buildParameterEntryPayload(payload),
    "Unable to save parameter entry."
  );

export const updateAutoconerParameterEntry = async (id, payload) => {
  const endpoints = buildAutoconerEndpoints(`parameter-entries/${id}`);
  let lastError;

  for (const endpoint of endpoints) {
    try {
      const response = await apiConfig.put(
        endpoint,
        removeEmptyValues(normalizePayload(buildParameterEntryPayload(payload))),
        silentRequestConfig
      );
      return response.data;
    } catch (error) {
      lastError = error;
      if (!shouldTryAlternateEndpoint(error)) {
        break;
      }
    }
  }

  throw new Error(getErrorMessage(lastError, "Unable to update parameter entry."));
};

export const submitAutoconerSpliceStrength = async (payload) =>
  postAutoconer("splice-strength", payload, "Unable to save splice strength.");

export const fetchAutoconerSpliceStrength = async ({
  page = 1,
  limit = 10,
} = {}) =>
  getAutoconer(
    "splice-strength",
    { page, limit },
    "Unable to fetch splice strength.",
    { suppressFailure: true, paginated: true }
  );

export const submitAutoconerDrumWise = async (payload) =>
  postAutoconer(
    "drum-wise",
    payload,
    "Unable to save drum wise inspection."
  );

export const fetchAutoconerDrumWise = async ({ page = 1, limit = 10 } = {}) =>
  getAutoconer(
    "drum-wise",
    { page, limit },
    "Unable to fetch drum wise inspection.",
    { suppressFailure: true, paginated: true }
  );

export const fetchAutoconerRewindingStudy = async ({
  page = 1,
  limit = 10,
} = {}) =>
  getAutoconer(
    "rewinding-study",
    { page, limit },
    "Unable to fetch rewinding study.",
    { suppressFailure: true, paginated: true }
  );

export const submitAutoconerRewindingStudy = async (payload) =>
  postAutoconer(
    "rewinding-study",
    payload,
    "Unable to save rewinding study."
  );

export const fetchAutoconerConeDensity = async ({
  page = 1,
  limit = 10,
} = {}) =>
  getAutoconer(
    "cone-density",
    { page, limit },
    "Unable to fetch cone density.",
    { suppressFailure: true, paginated: true }
  );

export const fetchAutoconerConeDensityMasterData = async () =>
  getAutoconerPathCandidates(
    ["cone-density/master-data", "conedensity/master-data", "master-data"],
    {},
    "Unable to fetch cone density master data.",
    { suppressFailure: true }
  );

export const fetchAutoconerSpliceStrengthMasterData = async () =>
  getAutoconerPathCandidates(
    ["splice-strength/master-data", "master-data"],
    {},
    "Unable to fetch splice strength master data.",
    { suppressFailure: true }
  );

export const fetchAutoconerDrumWiseMasterData = async () =>
  getAutoconerPathCandidates(
    ["drum-wise/master-data", "master-data"],
    {},
    "Unable to fetch drum wise master data.",
    { suppressFailure: true }
  );

export const fetchAutoconerRewindingStudyMasterData = async () =>
  getAutoconerPathCandidates(
    ["rewinding-study/master-data", "rewindingstudy/master-data", "master-data"],
    {},
    "Unable to fetch rewinding study master data.",
    { suppressFailure: true }
  );

export const fetchAutoconerCountWiseCutsMasterData = async () =>
  getAutoconerPathCandidates(
    ["count-wise-cuts/master-data", "master-data"],
    {},
    "Unable to fetch count wise cuts master data.",
    { suppressFailure: true }
  );

export const fetchAutoconerLycraCheckingMasterData = async () =>
  getAutoconerPathCandidates(
    ["lycra-checking/master-data", "master-data"],
    {},
    "Unable to fetch lycra checking master data.",
    { suppressFailure: true }
  );

export const fetchAutoconerConePackingAuditMasterData = async () =>
  getAutoconerPathCandidates(
    ["cone-packing-audit/master-data", "master-data"],
    {},
    "Unable to fetch cone packing audit master data.",
    { suppressFailure: true }
  );

export const submitAutoconerConeDensity = async (payload) =>
  {
    const sourceRows = payload?.cone_density_readings ?? payload?.cone_readings ?? [];
    const normalizedRows = Array.isArray(sourceRows)
      ? sourceRows.map((row) => ({
          ...row,
          // Backend variants read either `cone_weight` or `weight`.
          weight: row?.weight ?? row?.cone_weight ?? null,
          cone_weight: row?.cone_weight ?? row?.weight ?? null,
          // Preserve alternate traverse naming seen in older payloads.
          cone_traverse: row?.cone_traverse ?? row?.coneTrav ?? null,
        }))
      : [];

    const normalizedPayload = {
      ...payload,
      cone_density_readings: normalizedRows,
      cone_readings: normalizedRows,
    };

    return postAutoconerCandidates(
      "cone-density",
      [normalizedPayload],
      "Unable to save cone density."
    );
  };

export const fetchAutoconerConePackingAudit = async ({
  page = 1,
  limit = 10,
} = {}) =>
  getAutoconer(
    "cone-packing-audit",
    { page, limit },
    "Unable to fetch cone packing audit.",
    { suppressFailure: true, paginated: true }
  );

export const submitAutoconerCountWiseCuts = async (payload) => {
  const payloadCandidates = [
    payload,
    {
      ...payload,
      type: payload?.inspection_type,
      inspection_date: payload?.entry_date,
      machine_name: payload?.machine_no,
      count: payload?.count_name,
      crane_tip: payload?.cone_tip,
      drums_from_to:
        payload?.drum_from && payload?.drum_to
          ? `${payload.drum_from}-${payload.drum_to}`
          : undefined,
    },
    {
      ...payload,
      type: payload?.inspection_type,
      date: payload?.entry_date,
      machine_name: payload?.machine_no,
      count_name: payload?.count_name,
      crane_tip: payload?.cone_tip,
    },
  ];

  return postAutoconerCandidates(
    "count-wise-cuts",
    payloadCandidates,
    "Unable to save count wise cuts."
  );
};

export const submitAutoconerConePackingAudit = async (payload) =>
  postAutoconerCandidates(
    "cone-packing-audit",
    [
      payload,
      {
        ...payload,
        cone_readings: payload?.cone_readings ?? payload?.yarn_readings,
      },
      {
        ...payload,
        yarn_readings: payload?.yarn_readings ?? payload?.cone_readings,
        cone_readings: payload?.cone_readings ?? payload?.yarn_readings,
      },
    ],
    "Unable to save cone packing audit."
  );

export const fetchAutoconerProcessParameters = async ({
  page = 1,
  limit = 10,
} = {}) =>
  getAutoconer(
    "process",
    { page, limit },
    "Unable to fetch process parameter entries.",
    { suppressFailure: true, paginated: true }
  );

export const submitAutoconerProcessParameter = async (payload) =>
  postAutoconer("process", payload, "Unable to save process parameter entry.");

export const updateAutoconerProcessParameter = async (id, payload) => {
  const endpoints = buildAutoconerEndpoints(`process/${id}`);
  let lastError;

  for (const endpoint of endpoints) {
    try {
      const response = await apiConfig.put(
        endpoint,
        removeEmptyValues(normalizePayload(payload)),
        silentRequestConfig
      );
      return response.data;
    } catch (error) {
      lastError = error;
      if (!shouldTryAlternateEndpoint(error)) {
        break;
      }
    }
  }

  throw new Error(getErrorMessage(lastError, "Unable to update process parameter entry."));
};

export const fetchAutoconerQ2Entries = async ({
  page = 1,
  limit = 10,
} = {}) =>
  getAutoconer(
    "q2",
    { page, limit },
    "Unable to fetch Autoconer Q2 entries.",
    { suppressFailure: true, paginated: true }
  );

export const submitAutoconerQ2Entry = async (payload) =>
  postAutoconer("q2", payload, "Unable to save Autoconer Q2 entry.");

export const updateAutoconerQ2Entry = async (id, payload) => {
  const endpoints = buildAutoconerEndpoints(`q2/${id}`);
  let lastError;

  for (const endpoint of endpoints) {
    try {
      const response = await apiConfig.put(
        endpoint,
        removeEmptyValues(normalizePayload(payload)),
        silentRequestConfig
      );
      return response.data;
    } catch (error) {
      lastError = error;
      if (!shouldTryAlternateEndpoint(error)) {
        break;
      }
    }
  }

  throw new Error(getErrorMessage(lastError, "Unable to update Autoconer Q2 entry."));
};

export const fetchAutoconerQ3Entries = async ({
  page = 1,
  limit = 10,
} = {}) =>
  getAutoconer(
    "q3",
    { page, limit },
    "Unable to fetch Autoconer Q3 entries.",
    { suppressFailure: true, paginated: true }
  );

export const submitAutoconerQ3Entry = async (payload) =>
  postAutoconer("q3", payload, "Unable to save Autoconer Q3 entry.");

export const updateAutoconerQ3Entry = async (id, payload) => {
  const endpoints = buildAutoconerEndpoints(`q3/${id}`);
  let lastError;

  for (const endpoint of endpoints) {
    try {
      const response = await apiConfig.put(
        endpoint,
        removeEmptyValues(normalizePayload(payload)),
        silentRequestConfig
      );
      return response.data;
    } catch (error) {
      lastError = error;
      if (!shouldTryAlternateEndpoint(error)) {
        break;
      }
    }
  }

  throw new Error(getErrorMessage(lastError, "Unable to update Autoconer Q3 entry."));
};

export { toNullableNumber };

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
        const response = await apiConfig.post(endpoint, normalizedPayload);
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
      const response = await apiConfig.get(endpoint, params);
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
        removeEmptyValues(normalizePayload(buildParameterEntryPayload(payload)))
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
    {},
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
    {},
    "Unable to fetch cone density.",
    { suppressFailure: true, paginated: true }
  );

export const submitAutoconerConeDensity = async (payload) =>
  postAutoconerCandidates(
    "cone-density",
    [
      payload,
      {
        ...payload,
        cone_density_readings: payload?.cone_density_readings ?? payload?.cone_readings,
      },
    ],
    "Unable to save cone density."
  );

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

export { toNullableNumber };

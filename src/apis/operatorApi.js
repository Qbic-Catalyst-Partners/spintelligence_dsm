import apiConfig, { resolvedBaseUrl } from "./apiConfig";

const getTicketIdCandidates = (ticketId) => {
  const id = String(ticketId || "").trim();
  const withoutHash = id.replace(/^#/, "");
  const withHash = withoutHash ? `#${withoutHash}` : "";

  return Array.from(new Set([withoutHash, withHash].filter(Boolean)));
};

const getApiErrorMessage = (error, fallbackMessage) =>
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  fallbackMessage;

// GET Operator Tickets
export const getOperatorTickets = async (params = {}) => {
  try {
    const response = await apiConfig.get("/operator-tickets", params);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || "Failed to fetch operator tickets.");
    }
    if (error.request) {
      throw new Error(
        `Network Error: unable to reach ${resolvedBaseUrl}/operator-tickets. Check NEXT_PUBLIC_API_URL and backend availability.`
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
};

// GET Submission Ticketing table
export const getSubmissionTickets = async (params = {}) => {
  try {
    const response = await apiConfig.get("/operator-tickets/submission-ticketing", params);
    return response.data;
  } catch (error) {
    const status = error?.response?.status;
    const backendMessage =
      error?.response?.data?.message || error?.response?.data?.error || "";
    if (
      status === 404 &&
      /ticket not found/i.test(String(backendMessage))
    ) {
      return [];
    }
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || "Failed to fetch submission tickets.");
    }
    if (error.request) {
      throw new Error(
        `Network Error: unable to reach ${resolvedBaseUrl}/operator-tickets/submission-ticketing. Check NEXT_PUBLIC_API_URL and backend availability.`
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
};

// GET single ticket details
export const getOperatorTicketById = async (ticketId) => {
  const candidates = getTicketIdCandidates(ticketId);
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const response = await apiConfig.get(
        `/operator-tickets/${encodeURIComponent(candidate)}`,
        {},
        { skipGlobalErrorModal: true }
      );
      return response.data;
    } catch (error) {
      lastError = error;

      if (!error.response || ![400, 404].includes(error.response.status)) {
        break;
      }
    }
  }

  if (lastError?.request && !lastError?.response) {
    throw new Error(
      `Network Error: unable to reach ${resolvedBaseUrl}/operator-tickets/${encodeURIComponent(String(ticketId || ""))}. Check NEXT_PUBLIC_API_URL and backend availability.`
    );
  }

  throw new Error(getApiErrorMessage(lastError, "Failed to fetch ticket details."));
};

export const createOperatorTicket = async (payload) => {
  try {
    const response = await apiConfig.post("/operator-tickets", payload, {
      skipGlobalSuccessModal: true,
      skipGlobalErrorModal: true,
    });

    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.message || "Failed to create operator ticket."
    );
  }
};

const manualTicketInputScreenEndpoints = {
  "quality-control": {
    mixing: {
      "Process Parameter": "/mixing/qc",
      "Cotton HVI Data Entry": "/mixing/cotton-hvi",
      "Fibre Data Entry": "/mixing/fibre",
      "AFIS Data Entry": "/mixing/afis",
      "Moisture Data Entry": "/mixing/moisture",
      "Openness Data Entry": "/mixing/openness",
    },
    "blow-room": {
      "Blow Room Sync": "/blowroom/sync",
      "Process Parameter": "/blowroom/process-parameters",
      "BR Waste Study Entry": "/blowroom/br-waste-study",
      "Drop Test Data Entry": "/blowroom/drop-test",
    },
    carding: {
      "Process Parameter": "/carding/qc-header",
      "Between & Within Card Data Entry": "/carding/between-within-card",
      "Card Thick Place Entry": "/carding/card-thick-place",
      "Trials Data Entry Form": "/carding/trials",
      "Nati Data Entry": "/carding/nati-data",
      "U% Data Entry": "/carding/uqc",
      "Card DFK Pressure Checking": "/carding/dfk-pressure",
      WheelChange: "/carding/change-control",
      "Wheel Change": "/carding/change-control",
    },
    comber: {
      "Ribbon Lap CV Data Entry": "/comber/lap-cv",
      "Nati Data Entry": "/comber/nati-data-entry",
      "U% Data Entry": "/comber/uqc",
    },
    "draw-frame": {
      "Yarn CV% Calculation Form": "/drawframe/yarn-cv",
      "Draw Frame Cots Data Entry": "/drawframe/cots",
      "U% Data Entry": "/drawframe/uqc",
      "PP - Breaker Drawing": "/drawframe/header",
      "PP - Finisher Drawing": "/drawframe/finisher",
    },
    simplex: {
      "Process Parameter": "/simplex/process_parameter",
      "SMXCots Change Data Entry": "/simplex/SMXCotsChange",
      "SMX Breaks Study Report": "/simplex/study",
      "U% Data Entry": "/simplex/uqc",
    },
    spinning: {
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
    },
    autoconer: {
      "Process Parameter": "/autoconer/process-parameters",
      "PP - Autoconer Q2": "/autoconer/q2",
      "PP - Autoconer Q3": "/autoconer/q3",
      "Rewinding Study": "/autoconer/rewinding-study",
      "Cone Density": "/autoconer/cone-density",
      "Cone Packing Audit": "/autoconer/cone-packing-audit",
      "Lycra Checking": "/autoconer/lycra-checking",
      "Count Wise Cuts Record": "/autoconer/count-wise-cuts",
      "Splice Strength": "/autoconer/splice-strength",
      "Drum wise Appearance": "/autoconer/drum-wise-appearance",
      "CSP Parameter Entries": "/autoconer/parameter-entries/pending-csp",
      "U% Parameter Entries": "/autoconer/parameter-entries/pending-quality",
    },
  },
};

export const submitManualTicketInputScreen = async ({
  departmentSlug,
  subDepartmentSlug,
  inputScreen,
  payload,
}) => {
  const endpoint =
    manualTicketInputScreenEndpoints?.[departmentSlug]?.[subDepartmentSlug]?.[inputScreen];

  if (!endpoint) {
    return { skipped: true };
  }

  try {
    const response = await apiConfig.post(endpoint, payload, {
      skipGlobalSuccessModal: true,
      skipGlobalErrorModal: true,
    });
    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.message || `Failed to submit ${inputScreen} entry.`
    );
  }
};

// Submit ticket fix
export const submitOperatorTicket = async (ticketId, payload) => {
  const candidates = getTicketIdCandidates(ticketId);
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const response = await apiConfig.put(
        `/operator-tickets/submit/${encodeURIComponent(candidate)}`,
        {
          resolution_comment: payload?.resolution_comment ?? payload?.comment ?? "",
          operator_comment:
            payload?.operator_comment ?? payload?.resolution_comment ?? payload?.comment ?? "",
          comment: payload?.comment ?? payload?.resolution_comment ?? "",
        }
      );
      return response.data;
    } catch (error) {
      lastError = error;
      if (!error?.response || ![400, 404].includes(error.response.status)) {
        break;
      }
    }
  }

  throw new Error(lastError?.response?.data?.message || "Failed to submit ticket.");
};

export const updateOperatorTicketStatus = async (ticketId, status) => {
  const formattedId = String(ticketId || "").startsWith("#")
    ? String(ticketId)
    : `#${ticketId}`;
  const encodedId = encodeURIComponent(formattedId);
  const normalizedStatus = String(status || "").trim().toLowerCase();

  // Primary path for this backend: submit endpoint drives Open/Reopened -> In Progress.
  if (
    normalizedStatus === "in progress" ||
    normalizedStatus === "submit" ||
    normalizedStatus === "closed"
  ) {
    try {
      const submitted = await submitOperatorTicket(formattedId, {
        operator_comment: "Submitted from dashboard status update.",
        comment: "Submitted from dashboard status update.",
      });
      return submitted;
    } catch (_) {
      // Fall through to legacy endpoint attempts below.
    }
  }

  const requests = [
    {
      method: "put",
      url: `/operator-tickets/submit/${encodedId}`,
      data: {
        operator_comment: "Submitted from dashboard status update.",
        comment: "Submitted from dashboard status update.",
      },
    },
    {
      method: "patch",
      url: `/operator-tickets/status/${encodedId}`,
      data: { status },
    },
    {
      method: "put",
      url: `/operator-tickets/status/${encodedId}`,
      data: { status },
    },
    {
      method: "patch",
      url: `/operator-tickets/${encodedId}/status`,
      data: { status },
    },
    {
      method: "put",
      url: `/operator-tickets/${encodedId}/status`,
      data: { status },
    },
    {
      method: "patch",
      url: `/operator-tickets/${encodedId}`,
      data: { status },
    },
    {
      method: "put",
      url: `/operator-tickets/${encodedId}`,
      data: { status },
    },
    {
      method: "patch",
      url: `/operator-tickets/update-status`,
      data: { ticket_id: formattedId, status },
    },
    {
      method: "put",
      url: `/operator-tickets/update-status`,
      data: { ticket_id: formattedId, status },
    },
    {
      method: "post",
      url: `/operator-tickets/update-status`,
      data: { ticket_id: formattedId, status },
    },
    {
      method: "patch",
      url: `/operator-tickets/status`,
      data: { ticket_id: formattedId, status },
    },
    {
      method: "put",
      url: `/operator-tickets/status`,
      data: { ticket_id: formattedId, status },
    },
    {
      method: "post",
      url: `/operator-tickets/status`,
      data: { ticket_id: formattedId, status },
    },
  ];

  let lastError = null;
  for (const request of requests) {
    try {
      const method = String(request.method || "patch").toLowerCase();
      const response = await apiConfig[method](request.url, request.data, {
        skipGlobalErrorModal: true,
      });
      return response.data;
    } catch (error) {
      lastError = error;
      if (error?.response?.status !== 404) {
        throw new Error(
          error?.response?.data?.message || "Failed to update ticket status."
        );
      }
    }
  }

  throw new Error(
    lastError?.response?.data?.message ||
      lastError?.response?.data?.error ||
      "Failed to update ticket status."
  );
};

export const getOperatorTicketTimeline = async (ticketId) => {
  const candidates = getTicketIdCandidates(ticketId);
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const response = await apiConfig.get(
        `/operator-tickets/${encodeURIComponent(candidate)}/timeline`,
        {},
        { skipGlobalErrorModal: true }
      );
      return response.data;
    } catch (error) {
      lastError = error;
      if (!error.response || ![400, 404].includes(error.response.status)) {
        break;
      }
    }
  }

  throw new Error(getApiErrorMessage(lastError, "Failed to fetch ticket timeline."));
};

export const assignOperatorTicket = async (ticketId, userId) => {
  const formattedId = String(ticketId || "").trim();
  const response = await apiConfig.put(
    `/operator-tickets/${encodeURIComponent(formattedId)}/assign`,
    { user_id: userId }
  );
  return response?.data;
};

export const getOperatorWorkflowGuide = async () => {
  const response = await apiConfig.get("/operator-tickets/workflow/guide");
  return response?.data;
};

export const fetchThresholdApproverOptions = async () => {
  const response = await apiConfig.get(
    "/operator-tickets/thresholds/approver-options",
    {},
    { skipGlobalSuccessModal: true }
  );
  return response?.data || { l1_users: [], l2_users: [] };
};

export const saveThresholdsBulk = async (payload) => {
  const response = await apiConfig.post("/operator-tickets/thresholds/bulk", payload || {});
  return response?.data;
};

export const uploadThresholdCsv = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiConfig.post("/operator-tickets/thresholds/upload-csv", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response?.data;
};

export const runSubmissionFrequencyTatCheck = async () => {
  const response = await apiConfig.post("/operator-tickets/submission-frequency/tat/check", {});
  return response?.data;
};

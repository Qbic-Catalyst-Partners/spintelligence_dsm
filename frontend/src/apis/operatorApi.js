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

const getOperatorApiErrorMessage = (error, fallbackMessage) => {
  const status = error?.response?.status;
  const backendMessage = getApiErrorMessage(error, fallbackMessage);

  if (status) {
    return `${backendMessage} (${status})`;
  }

  return backendMessage;
};

const isFallbackStatusUpdateError = (status) =>
  [400, 404, 405, 422].includes(Number(status));

// GET Operator Tickets
export const getOperatorTickets = async (params = {}) => {
  try {
    const response = await apiConfig.get("/operator-tickets", params, {
      skipGlobalErrorModal: true,
    });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(
        error.response.data.message || "Failed to fetch operator tickets."
      );
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
    const response = await apiConfig.get("/operator-tickets/submission-ticketing", params, {
      skipGlobalErrorModal: true,
    });
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

// GET Process Parameter Ticketing table (PP_NOTEBOOK_INCOMPLETE tickets)
export const getProcessParameterTickets = async (params = {}) => {
  try {
    const response = await apiConfig.get("/operator-tickets/process-parameter-ticketing", params, {
      skipGlobalErrorModal: true,
    });
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
      throw new Error(error.response.data.message || "Failed to fetch process parameter tickets.");
    }
    if (error.request) {
      throw new Error(
        `Network Error: unable to reach ${resolvedBaseUrl}/operator-tickets/process-parameter-ticketing. Check NEXT_PUBLIC_API_URL and backend availability.`
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
  const rawId = formattedId.replace(/^#/, "");
  const encodedId = encodeURIComponent(formattedId);
  const encodedRawId = encodeURIComponent(rawId);
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const statusPayloads = [
    { status },
    { ticket_status: status },
    { ticket_id: formattedId, status },
    { ticket_id: rawId, status },
    { id: formattedId, status },
    { id: rawId, status },
  ];

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
      method: "put",
      url: `/operator-tickets/submit/${encodedRawId}`,
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
      method: "patch",
      url: `/operator-tickets/status/${encodedRawId}`,
      data: { status },
    },
    {
      method: "put",
      url: `/operator-tickets/status/${encodedId}`,
      data: { status },
    },
    {
      method: "put",
      url: `/operator-tickets/status/${encodedRawId}`,
      data: { status },
    },
    {
      method: "patch",
      url: `/operator-tickets/${encodedId}/status`,
      data: { status },
    },
    {
      method: "patch",
      url: `/operator-tickets/${encodedRawId}/status`,
      data: { status },
    },
    {
      method: "put",
      url: `/operator-tickets/${encodedId}/status`,
      data: { status },
    },
    {
      method: "put",
      url: `/operator-tickets/${encodedRawId}/status`,
      data: { status },
    },
    {
      method: "patch",
      url: `/operator-tickets/${encodedId}`,
      data: { status },
    },
    {
      method: "patch",
      url: `/operator-tickets/${encodedRawId}`,
      data: { status },
    },
    {
      method: "put",
      url: `/operator-tickets/${encodedId}`,
      data: { status },
    },
    {
      method: "put",
      url: `/operator-tickets/${encodedRawId}`,
      data: { status },
    },
    ...["patch", "put", "post"].flatMap((method) =>
      statusPayloads.map((data) => ({
        method,
        url: `/operator-tickets/update-status`,
        data,
      }))
    ),
    ...["patch", "put", "post"].flatMap((method) =>
      statusPayloads.map((data) => ({
        method,
        url: `/operator-tickets/status`,
        data,
      }))
    ),
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
      if (!isFallbackStatusUpdateError(error?.response?.status)) {
        throw new Error(
          error?.response?.data?.message ||
            error?.response?.data?.error ||
            "Failed to update ticket status."
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

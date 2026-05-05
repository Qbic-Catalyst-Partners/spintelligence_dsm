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
  try {
    const formattedId = ticketId.startsWith("#")
      ? ticketId
      : `#${ticketId}`;

    const response = await apiConfig.put(
      `/operator-tickets/submit/${encodeURIComponent(formattedId)}`,
      payload
    );

    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.message || "Failed to submit ticket."
    );
  }
};

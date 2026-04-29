import apiConfig, { resolvedBaseUrl } from "./apiConfig";

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
  try {
    const response = await apiConfig.get(`/operator-tickets/${encodeURIComponent(ticketId)}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || "Failed to fetch ticket details.");
    }
    if (error.request) {
      throw new Error(
        `Network Error: unable to reach ${resolvedBaseUrl}/operator-tickets/${encodeURIComponent(ticketId)}. Check NEXT_PUBLIC_API_URL and backend availability.`
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
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

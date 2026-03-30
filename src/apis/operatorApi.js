import apiConfig from "./apiConfig";

// GET Operator Tickets
export const getOperatorTickets = async (params = {}) => {
  try {
    const response = await apiConfig.get("/operator-tickets", { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || "Failed to fetch operator tickets.");
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
    throw new Error(error.message || "Server error occurred");
  }
};
// ================= ✅ SUBMIT FIX (IMPORTANT) =================
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
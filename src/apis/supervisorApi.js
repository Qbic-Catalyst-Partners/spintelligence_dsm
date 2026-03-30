import apiConfig from "./apiConfig";

// ✅ FETCH ALL SUPERVISOR TICKETS
export const fetchSupervisorTicketsApi = async () => {
  try {
    const response = await apiConfig.get("/operator-tickets");
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(
        error.response.data.message || "Failed to fetch tickets"
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
};

// ✅ FETCH SINGLE TICKET DETAILS
export const fetchTicketDetailsApi = async (ticketId) => {
  try {
    const encodeId = encodeURIComponent(`#${ticketId}`);

    const response = await apiConfig.get(
      `/operator-tickets/${encodeId}`
    );

    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(
        error.response.data.message || "Failed to fetch ticket details"
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
};

// ✅ APPROVE TICKET
export const approveTicketApi = async (ticketId) => {
  try {
    const encodeId = encodeURIComponent(`#${ticketId}`);

    const response = await apiConfig.patch(
      `/api/supervisor-tickets/tickets/approve?ticketId=${encodeId}`,
      {
        status: "APPROVED",
      }
    );

    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(
        error.response.data.message || "Failed to approve ticket"
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
};

// ✅ REJECT TICKET
export const rejectTicketApi = async (ticketId, reason) => {
  try {
    const encodeId = encodeURIComponent(`#${ticketId}`);

    const response = await apiConfig.patch(
      `/api/supervisor-tickets/tickets/reject?ticketId=${encodeId}`,
      {
        reason, 
      }
    );

    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(
        error.response.data.message || "Failed to reject ticket"
      );
    }
    throw new Error(error.message || "Server error occurred");
  }
};
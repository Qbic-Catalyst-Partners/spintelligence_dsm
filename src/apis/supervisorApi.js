import apiConfig from "./apiConfig";
import { getOperatorTicketById } from "./operatorApi";

const formatTicketId = (ticketId) => {
  const id = String(ticketId || "").trim();
  return id.startsWith("#") ? id : `#${id}`;
};

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
    return await getOperatorTicketById(ticketId);
  } catch (error) {
    throw new Error(error.message || "Failed to fetch ticket details");
  }
};

// ✅ APPROVE TICKET
export const approveTicketApi = async (ticketId) => {
  try {
    const encodeId = encodeURIComponent(formatTicketId(ticketId));

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
    const encodeId = encodeURIComponent(formatTicketId(ticketId));

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

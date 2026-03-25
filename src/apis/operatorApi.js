import api from "./apiConfig";

// GET Operator Tickets
export const getOperatorTickets = (params = {}) => {
  return api.get("/operator-tickets", { params });
};

// GET single ticket details
export const getOperatorTicketById = (ticketId) => {
  return api.get(`/operator-tickets/${encodeURIComponent(ticketId)}`);
};
export const TICKET_STATUS_OPTIONS = ["Open", "In Progress", "Submit"];
export const REOPENED_TICKET_STATUS_OPTIONS = [
  "Reopened",
  "In Progress",
  "Submit",
];
export const SUPERVISOR_VISIBLE_STATUS_OPTIONS = [
  "Open",
  "In Progress",
  "Submit",
  "Reopened",
];

export const getStoredTicketStatus = (ticketId) => {
  void ticketId;
  return "";
};

export const setStoredTicketStatus = (ticketId, status) => {
  void ticketId;
  void status;
};

export const applyStoredTicketStatus = (ticket) => {
  return ticket;
};

export const applyStoredTicketStatuses = (tickets) =>
  (Array.isArray(tickets) ? tickets : []).map((ticket) =>
    applyStoredTicketStatus(ticket)
  );

export const getStatusClassKey = (status) =>
  String(status || "").toLowerCase().replace(/\s+/g, "-");

export const getOperatorStatusOptions = (status) =>
{
  const normalizedStatus = String(status || "").trim();
  const normalizedStatusKey = normalizedStatus.toLowerCase();
  const baseOptions =
    normalizedStatusKey === "reopened"
      ? REOPENED_TICKET_STATUS_OPTIONS
      : TICKET_STATUS_OPTIONS;

  if (!normalizedStatus) {
    return baseOptions;
  }

  const exists = baseOptions.some(
    (option) => String(option || "").trim().toLowerCase() === normalizedStatusKey
  );

  return exists ? baseOptions : [normalizedStatus, ...baseOptions];
};

export const isSupervisorVisibleTicket = (ticket) =>
  String(ticket?.status || "").trim().toUpperCase() !== "APPROVED";

export const getSupervisorStatusLabel = (status) =>
  String(status || "").trim().toLowerCase() === "submit"
    ? "Closed"
    : status;

export const getOperatorStatusLabel = (status) =>
  String(status || "").trim().toLowerCase() === "submit"
    ? "Closed"
    : status;

export const getTicketStatusLabel = (status) =>
  String(status || "").trim().toLowerCase() === "submit"
    ? "Closed"
    : status;

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
  "Closed",
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

// Once a ticket has been submitted (Submit) or closed by L2 (Closed), L1 can no
// longer change its status - it's locked pending/after L2 review.
export const isTicketLockedForOperator = (status) =>
  ["submit", "closed"].includes(String(status || "").trim().toLowerCase());

// A ticket stays viewable (clickable in the L1 list) while it's pending L2 review
// ("Submit") so the operator can check on it - only "Closed" (already approved) is
// fully locked out of the list.
export const isTicketHiddenFromOperatorList = (status) =>
  String(status || "").trim().toLowerCase() === "closed";

export const getOperatorStatusOptions = (status) => {
  const normalizedStatus = String(status || "").trim();
  const normalizedStatusKey = normalizedStatus.toLowerCase();

  if (isTicketLockedForOperator(normalizedStatusKey)) {
    return [normalizedStatus];
  }

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

export const getSupervisorStatusLabel = (status) => status;

export const getOperatorStatusLabel = (status) => status;

export const getTicketStatusLabel = (status) => status;

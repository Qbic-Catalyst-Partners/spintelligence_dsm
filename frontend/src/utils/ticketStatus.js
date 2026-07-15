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

// TAT escalation drives who a ticket is visible to: it starts at L1 (only the
// operator sees it), moves to L2 once the operator submits or L1's TAT lapses,
// and moves to L3 only if L2's TAT also lapses. A reject resets this back to
// L1 server-side, which is what hides a Reopened ticket from L2 again.
export const getTatCurrentLevel = (ticket) =>
  String(
    ticket?.tat_current_level ??
      ticket?.tatCurrentLevel ??
      ticket?.current_tat_level ??
      ""
  )
    .trim()
    .toUpperCase();

export const isSupervisorVisibleTicket = (ticket) => {
  if (String(ticket?.status || "").trim().toUpperCase() === "APPROVED") return false;

  const level = getTatCurrentLevel(ticket);
  // No tat_current_level on this ticket (older/unmigrated ticket types) — fall
  // back to showing it rather than hiding tickets we can't classify.
  if (!level) return true;

  return level !== "L1";
};

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

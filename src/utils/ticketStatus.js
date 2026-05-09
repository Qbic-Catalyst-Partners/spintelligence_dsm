export const TICKET_STATUS_OPTIONS = ["Open", "In Progress", "Submit"];
export const REOPENED_TICKET_STATUS_OPTIONS = [
  "Reopened",
  "In Progress",
  "Submit",
];
export const SUPERVISOR_VISIBLE_STATUS_OPTIONS = [
  ...TICKET_STATUS_OPTIONS,
  "Reopened",
];

const STORAGE_KEY = "spintelligenceTicketStatusOverrides";

const normalizeTicketId = (ticketId) =>
  String(ticketId || "").replace(/^#/, "").trim();

const readStatusMap = () => {
  if (typeof window === "undefined") return {};

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : {};
    return parsedValue && typeof parsedValue === "object" ? parsedValue : {};
  } catch {
    return {};
  }
};

const writeStatusMap = (statusMap) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(statusMap));
  } catch {
    // Ignore storage failures and keep the in-memory UI responsive.
  }
};

export const getStoredTicketStatus = (ticketId) => {
  const normalizedId = normalizeTicketId(ticketId);
  if (!normalizedId) return "";

  return readStatusMap()[normalizedId] || "";
};

export const setStoredTicketStatus = (ticketId, status) => {
  const normalizedId = normalizeTicketId(ticketId);
  if (!normalizedId) return;

  const statusMap = readStatusMap();
  statusMap[normalizedId] = status;
  writeStatusMap(statusMap);
};

export const applyStoredTicketStatus = (ticket) => {
  if (!ticket) return ticket;

  const storedStatus = getStoredTicketStatus(ticket.ticket_id || ticket.id);
  return storedStatus ? { ...ticket, status: storedStatus } : ticket;
};

export const applyStoredTicketStatuses = (tickets) =>
  (Array.isArray(tickets) ? tickets : []).map((ticket) =>
    applyStoredTicketStatus(ticket)
  );

export const getStatusClassKey = (status) =>
  String(status || "").toLowerCase().replace(/\s+/g, "-");

export const getOperatorStatusOptions = (status) =>
  String(status || "").trim().toLowerCase() === "reopened"
    ? REOPENED_TICKET_STATUS_OPTIONS
    : TICKET_STATUS_OPTIONS;

export const isSupervisorVisibleTicket = (ticket) =>
  String(ticket?.status || "").trim().toUpperCase() !== "APPROVED";

export const getSupervisorStatusLabel = (status) =>
  String(status || "").trim().toLowerCase() === "submit"
    ? "Submitted"
    : status;

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
  "Overdue",
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

const RESOLVED_STATUS_KEYS = new Set(["closed", "approved", "submit", "acknowledged", "resolved"]);

const normalizeLevel = (value) => String(value || "").trim().toUpperCase();

export const getResolutionSlaHours = (ticket, slaRecords = []) => {
  const level = normalizeLevel(ticket?.tat_current_level || ticket?.tatCurrentLevel || "L1");
  const record = (Array.isArray(slaRecords) ? slaRecords : []).find(
    (item) => normalizeLevel(item?.level) === level && item?.is_active !== false
  );
  const hours = Number(record?.resolution_hours);
  return Number.isFinite(hours) && hours > 0 ? hours : null;
};

export const isTicketOverdueBySla = (ticket, slaRecords = [], now = Date.now()) => {
  if (!ticket) return false;
  const status = String(ticket?.status || "").trim().toLowerCase();
  if (RESOLVED_STATUS_KEYS.has(status)) return false;

  const hours = getResolutionSlaHours(ticket, slaRecords);
  if (!hours) return false;

  const createdAt = new Date(ticket?.created_at || ticket?.createdAt);
  if (Number.isNaN(createdAt.getTime())) return false;

  const ageHours = (Number(now) - createdAt.getTime()) / (1000 * 60 * 60);
  return ageHours > hours;
};

export const applyTicketOverdueStatus = (ticket, slaRecords = [], now = Date.now()) => {
  if (!ticket) return ticket;
  if (!isTicketOverdueBySla(ticket, slaRecords, now)) return ticket;

  return {
    ...ticket,
    status: "Overdue",
    ticket_status: "Overdue",
    isOverdue: true,
  };
};

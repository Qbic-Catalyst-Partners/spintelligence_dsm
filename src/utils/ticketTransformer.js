export const getTicketParameterKey = (parameterName) =>
  String(parameterName || "").toLowerCase().trim();

export const formatTicketIdForDisplay = (ticketId) => {
  const rawId = String(ticketId || "").trim();
  if (!rawId) return "-";

  const normalizedId = rawId.replace(/^#/, "");
  const numericPart = normalizedId.match(/\d+$/)?.[0];

  if (!numericPart) {
    return rawId.startsWith("#") ? rawId : `#${rawId}`;
  }

  return `#TK-${numericPart.padStart(4, "0")}`;
};

const toParameterList = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
};

export const getTicketParameterNames = (ticket) => {
  const fromParameterName = toParameterList(ticket?.parameter_name);
  const fromActualValue =
    ticket?.actual_value && typeof ticket.actual_value === "object" && !Array.isArray(ticket.actual_value)
      ? Object.keys(ticket.actual_value)
      : [];

  const seen = new Set();
  return [...fromParameterName, ...fromActualValue].filter((name) => {
    const normalized = getTicketParameterKey(name);
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
};

export const getTicketValueForParameter = (source, parameterName) => {
  if (!source || !parameterName) return "-";

  if (typeof source !== "object" || Array.isArray(source)) {
    return source;
  }

  const directMatch = source[parameterName];
  if (directMatch !== undefined && directMatch !== null) {
    return directMatch;
  }

  const normalizedParameter = getTicketParameterKey(parameterName);
  const matchedKey = Object.keys(source).find(
    (key) => getTicketParameterKey(key) === normalizedParameter
  );

  return matchedKey ? source[matchedKey] : "-";
};

export const formatThresholdValue = (value) => {
  if (value === null || typeof value === "undefined") {
    return "-";
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const plusThreshold = value.plus_threshold ?? "-";
  const minusThreshold = value.minus_threshold ?? "-";

  return `+:${plusThreshold}/-:${minusThreshold}`;
};

export const formatStandardValue = (value) => {
  if (value === null || typeof value === "undefined") {
    return "-";
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const actualValue = value.actual_value ?? "-";
  return actualValue;
};

export const transformTicket = (ticket) => {
  const createdDate = new Date(ticket.created_at);
  const parameterNames = getTicketParameterNames(ticket);
  const parameter = parameterNames[0] || "-";
  const actual = getTicketValueForParameter(ticket.actual_value, parameter);
  const thresholdSource = getTicketValueForParameter(ticket.threshold_value, parameter);
  const threshold = formatThresholdValue(thresholdSource);
  const standard = formatStandardValue(thresholdSource);

  return {
    ...ticket,
    id: ticket.ticket_id,
    ticket_id: ticket.ticket_id,
    created_at: ticket.created_at,

    machine: ticket.machine_name,
    machine_name: ticket.machine_name,

    parameter,
    parameter_name: parameterNames,

    actual,
    standard,
    threshold,

    actual_value: ticket.actual_value,
    threshold_value: ticket.threshold_value,

    severity: ticket.severity,
    status: ticket.status,

    description: ticket.description || "",

    rawCreatedAt: createdDate,
    createdAt: createdDate.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
  };
};

export const transformTicketWithDescription = (ticket) => {
  return {
    ...transformTicket(ticket),
    description: ticket.description || "",
  };
};

export const getTicketParameterKey = (parameterName) =>
  String(parameterName || "").toLowerCase().trim();

export const getTicketValueForParameter = (source, parameterName) => {
  if (!source || !parameterName) return "-";

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
  const parameter = ticket.parameter_name?.[0] || "-";
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
    parameter_name: ticket.parameter_name,

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

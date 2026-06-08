export const getTicketParameterKey = (parameterName) =>
  String(parameterName || "").toLowerCase().trim();

const tryParseJsonObject = (value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

export const isSubmissionFrequencyParameterName = (parameterName) =>
  getTicketParameterKey(parameterName) === "submission_frequency";

export const isNotebookAcknowledgementParameterName = (parameterName) => {
  const parameterKey = getTicketParameterKey(parameterName).replace(/[\s-]+/g, "_");
  return (
    parameterKey === "pending_acknowledgement" ||
    parameterKey === "acknowledgement_pending" ||
    parameterKey === "notebook_acknowledgement" ||
    parameterKey === "submitted_notebook_acknowledgement" ||
    parameterKey.includes("acknowledgement")
  );
};

export const formatTicketIdForDisplay = (ticketId) => {
  const rawId = String(ticketId || "").trim();
  if (!rawId) return "-";

  const normalizedId = rawId.replace(/^#/, "");
  const numericPart = normalizedId.match(/\d+$/)?.[0];

  if (!numericPart) {
    return rawId.startsWith("#") ? rawId : `#${rawId}`;
  }

  return `#TK-${numericPart.padStart(3, "0")}`;
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

const getObjectKeys = (value) => {
  const normalized = tryParseJsonObject(value);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return [];
  }
  return Object.keys(normalized);
};

export const getTicketParameterNames = (ticket) => {
  const fromParameterName = toParameterList(ticket?.parameter_name);
  const fromActualValue = getObjectKeys(ticket?.actual_value);
  const fromThresholdValue = getObjectKeys(ticket?.threshold_value);

  const seen = new Set();
  return [...fromParameterName, ...fromActualValue, ...fromThresholdValue].filter((name) => {
    const normalized = getTicketParameterKey(name);
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
};

export const isSubmissionTicketRecord = (ticket) => {
  const notebookType = String(
    ticket?.notebook_type ||
    ticket?.notebookType ||
    ticket?.notebook ||
    ticket?.machine_name ||
    ticket?.machine ||
    ""
  ).toLowerCase();

  if (notebookType.includes("submission")) {
    return true;
  }

  const statusText = String(
    ticket?.status ||
    ticket?.ticket_status ||
    ticket?.current_status ||
    ticket?.state ||
    ""
  ).toLowerCase();
  const descriptionText = String(ticket?.description || ticket?.message || "").toLowerCase();

  if (
    statusText.includes("pending acknowledgement") ||
    descriptionText.includes("pending acknowledgement") ||
    descriptionText.includes("acknowledgement")
  ) {
    return true;
  }

  return getTicketParameterNames(ticket).some(
    (parameterName) =>
      isSubmissionFrequencyParameterName(parameterName) ||
      isNotebookAcknowledgementParameterName(parameterName)
  );
};

export const getTicketValueForParameter = (source, parameterName) => {
  if (!source || !parameterName) return "-";
  const normalizedSource = tryParseJsonObject(source);

  if (typeof normalizedSource !== "object" || Array.isArray(normalizedSource)) {
    return normalizedSource;
  }

  const directMatch = normalizedSource[parameterName];
  if (directMatch !== undefined && directMatch !== null) {
    return directMatch;
  }

  const normalizedParameter = getTicketParameterKey(parameterName);
  const matchedKey = Object.keys(normalizedSource).find(
    (key) => getTicketParameterKey(key) === normalizedParameter
  );

  return matchedKey ? normalizedSource[matchedKey] : "-";
};

export const formatThresholdValue = (value) => {
  if (value === null || typeof value === "undefined") {
    return "-";
  }
  const normalizedValue = tryParseJsonObject(value);

  if (typeof normalizedValue !== "object" || Array.isArray(normalizedValue)) {
    return normalizedValue;
  }

  const plusThreshold =
    normalizedValue.plus_threshold ??
    normalizedValue.positive_tolerance ??
    normalizedValue.upper_threshold ??
    normalizedValue.max_tolerance ??
    "-";
  const minusThreshold =
    normalizedValue.minus_threshold ??
    normalizedValue.negative_tolerance ??
    normalizedValue.lower_threshold ??
    normalizedValue.min_tolerance ??
    "-";

  return `+:${plusThreshold}/-:${minusThreshold}`;
};

export const formatStandardValue = (value) => {
  if (value === null || typeof value === "undefined") {
    return "-";
  }
  const normalizedValue = tryParseJsonObject(value);

  if (typeof normalizedValue !== "object" || Array.isArray(normalizedValue)) {
    return normalizedValue;
  }

  const actualValue =
    normalizedValue.standard_value ??
    normalizedValue.actual_value ??
    normalizedValue.target_value ??
    normalizedValue.nominal_value ??
    "-";
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

  const resolvedStatus =
    ticket?.status ??
    ticket?.ticket_status ??
    ticket?.current_status ??
    ticket?.state ??
    "";

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
    status: resolvedStatus,

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

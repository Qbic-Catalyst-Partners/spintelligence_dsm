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

// Generic notebook-header labels like "Spinning QC Header" / "Mixing QC Header" are
// not a real measured field, so they should never be treated as a threshold breach.
export const isGenericQcHeaderParameterName = (parameterName) =>
  /qc\s*header$/i.test(String(parameterName || "").trim());

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

const fieldLabel = (item) =>
  String(item?.label || item?.name || item?.parameter || item?.field_name || item || "").trim();

const fieldsToObject = (fields, valueKeys = ["value", "actual_value", "submitted_value"]) => {
  if (!Array.isArray(fields)) return {};

  return fields.reduce((acc, field) => {
    const key = fieldLabel(field);
    if (!key) return acc;

    const valueKey = valueKeys.find((candidate) =>
      field?.[candidate] !== undefined && field?.[candidate] !== null
    );
    acc[key] = valueKey
      ? field[valueKey]
      : {
          standard_value: field?.standard_value,
          plus_threshold: field?.plus_threshold,
          minus_threshold: field?.minus_threshold,
          upper_threshold: field?.upper_threshold,
          lower_threshold: field?.lower_threshold,
        };
    return acc;
  }, {});
};

const firstDisplayValue = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() && String(value).trim() !== "-") {
      return value;
    }
  }
  return "-";
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
  const fromSubmittedFields = [
    ...(Array.isArray(ticket?.submitted_notebook_fields) ? ticket.submitted_notebook_fields : []),
    ...(Array.isArray(ticket?.submitted_fields) ? ticket.submitted_fields : []),
  ].map(fieldLabel);
  const fromThresholdFields = (Array.isArray(ticket?.threshold_fields) ? ticket.threshold_fields : [])
    .map(fieldLabel);
  const fromParameters = (Array.isArray(ticket?.parameters) ? ticket.parameters : [])
    .map(fieldLabel);

  const seen = new Set();
  return [
    ...fromParameterName,
    ...fromActualValue,
    ...fromThresholdValue,
    ...fromSubmittedFields,
    ...fromThresholdFields,
    ...fromParameters,
  ].filter((name) => {
    const normalized = getTicketParameterKey(name);
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
};

export const isSubmissionTicketRecord = (ticket) => {
  const discriminator = String(
    ticket?.ticket_type ||
    ticket?.source ||
    ""
  ).toLowerCase();

  if (discriminator === "threshold") {
    return false;
  }

  if (discriminator === "submission" || discriminator === "manual") {
    return discriminator === "submission";
  }

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

const hasMeaningfulValue = (value) => {
  if (value === undefined || value === null) return false;

  if (typeof value === "object") {
    return Object.values(value).some(
      (nested) => nested !== undefined && nested !== null && String(nested).trim() !== ""
    );
  }

  const text = String(value).trim();
  return text !== "" && text !== "-";
};

// Some backend flows raise notebook-header tickets with a generic parameter
// label (e.g. "Spinning QC Header") but no actual/threshold values attached.
// Those aren't real threshold breaches, so exclude them from the Threshold tab.
export const ticketHasThresholdBreachData = (ticket) => {
  const parameterNames = getTicketParameterNames(ticket);
  if (!parameterNames.length) return false;

  return parameterNames.some((parameterName) => {
    const actualValue = getTicketValueForParameter(ticket?.actual_value, parameterName);
    const thresholdValue = getTicketValueForParameter(ticket?.threshold_value, parameterName);
    return hasMeaningfulValue(actualValue) || hasMeaningfulValue(thresholdValue);
  });
};

const DISMISSED_THRESHOLD_TICKET_IDS_KEY = "dismissedThresholdTicketIds";
const THRESHOLD_TICKET_RESET_DONE_KEY = "thresholdTicketOneTimeResetDone";

export const getTicketRecordId = (ticket) =>
  String(ticket?.ticket_id ?? ticket?.id ?? ticket?._id ?? "").trim();

const loadDismissedThresholdTicketIds = () => {
  if (typeof window === "undefined") return new Set();

  try {
    const raw = window.localStorage.getItem(DISMISSED_THRESHOLD_TICKET_IDS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
};

const saveDismissedThresholdTicketIds = (ids) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(DISMISSED_THRESHOLD_TICKET_IDS_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore storage failures (e.g. private browsing quota)
  }
};

// One-time cleanup: the first time this runs in a browser, whatever threshold
// tickets are currently visible get permanently dismissed (they were noise from
// before the QC-Header/breach-data filtering existed). Anything created after
// this point is unaffected and displays normally.
export const applyOneTimeThresholdTicketReset = (thresholdTickets) => {
  if (typeof window === "undefined") {
    return thresholdTickets;
  }

  const alreadyDone = window.localStorage.getItem(THRESHOLD_TICKET_RESET_DONE_KEY) === "true";
  const dismissedIds = loadDismissedThresholdTicketIds();

  if (!alreadyDone) {
    thresholdTickets.forEach((ticket) => {
      const id = getTicketRecordId(ticket);
      if (id) dismissedIds.add(id);
    });
    saveDismissedThresholdTicketIds(dismissedIds);

    try {
      window.localStorage.setItem(THRESHOLD_TICKET_RESET_DONE_KEY, "true");
    } catch {
      // ignore storage failures
    }

    return [];
  }

  return thresholdTickets.filter((ticket) => !dismissedIds.has(getTicketRecordId(ticket)));
};

export const isThresholdTicketRecord = (ticket) => {
  if (isSubmissionTicketRecord(ticket)) {
    return false;
  }

  const parameterNames = getTicketParameterNames(ticket);
  if (parameterNames.length && parameterNames.every(isGenericQcHeaderParameterName)) {
    return false;
  }

  return ticketHasThresholdBreachData(ticket);
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
  const submittedFields = ticket?.submitted_notebook_fields || ticket?.submitted_fields;
  const actualValue = Object.keys(fieldsToObject(submittedFields)).length
    ? fieldsToObject(submittedFields)
    : ticket.actual_value;
  const thresholdValue = Object.keys(fieldsToObject(ticket?.threshold_fields, [
    "threshold_value",
    "value",
    "standard_value",
    "actual_value",
  ])).length
    ? fieldsToObject(ticket?.threshold_fields, [
        "threshold_value",
        "value",
        "standard_value",
        "actual_value",
      ])
    : ticket.threshold_value;
  const parameterNames = getTicketParameterNames(ticket);
  const parameter = parameterNames[0] || "-";
  const actual = firstDisplayValue(
    getTicketValueForParameter(actualValue, parameter),
    ticket?.actual,
    ticket?.actualValue
  );
  const thresholdSource = getTicketValueForParameter(thresholdValue, parameter);
  const threshold = firstDisplayValue(
    formatThresholdValue(thresholdSource),
    ticket?.threshold,
    ticket?.thresholdValue
  );
  const standard = firstDisplayValue(
    formatStandardValue(thresholdSource),
    ticket?.standard,
    ticket?.standard_value,
    ticket?.standardValue
  );
  const notebookType = firstDisplayValue(
    ticket?.notebook_type,
    ticket?.notebookType,
    ticket?.notebook,
    ticket?.machine_name,
    ticket?.machine
  );

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
    notebookType,
    notebook_type: notebookType,
    notebook: notebookType,

    parameter,
    parameter_name: parameterNames,

    actual,
    standard,
    threshold,

    actual_value: actualValue,
    threshold_value: thresholdValue,

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

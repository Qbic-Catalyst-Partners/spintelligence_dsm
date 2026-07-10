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

const getViolationDetails = (ticket) => {
  const parsed = tryParseJsonObject(ticket?.violation_details);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
};

// PP batch-completion tickets (one entry_id spanning up to 10 department screens) carry a
// distinctive violation_details shape regardless of how the backend's category/ticket_type
// wording has shifted across iterations — `missing_screens` is the most reliable signal.
export const isPpBatchCompletionTicketRecord = (ticket) => {
  const violationDetails = getViolationDetails(ticket);
  const category = String(violationDetails?.category || "").toLowerCase();
  const ticketType = String(violationDetails?.ticket_type || "").toLowerCase();
  const hasMissingScreens =
    Array.isArray(violationDetails?.missing_screens) && violationDetails.missing_screens.length > 0;

  return (
    hasMissingScreens ||
    category.includes("missed_frequency") ||
    category.includes("batch") ||
    ticketType.includes("pp_notebook") ||
    ticketType.includes("batch")
  );
};

export const isSubmissionFrequencyTicketRecord = (ticket) => {
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

  return getTicketParameterNames(ticket).some(isSubmissionFrequencyParameterName);
};

// Notebook Acknowledgement tickets: a submitted notebook that L2 hasn't acknowledged within
// its configured window. Moved here (was previously local to SupervisorDashboard.js only) so
// every consumer — both dashboards and both detail pages — agrees on what counts as one.
export const isNotebookAcknowledgementTicketRecord = (ticket) => {
  // PP batch-completion tickets reuse the generic ticket_reason="MISSING_VALUE" shape, which
  // would otherwise also match the "missing_value" text check below — exclude them first.
  if (isPpBatchCompletionTicketRecord(ticket)) return false;

  const actionMode = String(ticket?.action_mode || ticket?.actionMode || "").trim().toUpperCase();
  if (actionMode === "ACKNOWLEDGE") return true;

  const violationDetails = getViolationDetails(ticket);
  const violationTicketType = violationDetails?.ticket_type || violationDetails?.ticketType || "";
  const violationActionType = violationDetails?.action_type || violationDetails?.actionType || "";
  const violationText = String(
    [violationTicketType, violationActionType, violationDetails?.category, violationDetails?.reason]
      .join(" ")
  ).trim().toLowerCase();

  if (violationText.includes("notebook_ack_overdue") || violationText.includes("acknowledge_only")) {
    return true;
  }

  const parameterNames = Array.isArray(ticket?.parameter_name)
    ? ticket.parameter_name
    : [ticket?.parameter_name, ticket?.parameter].filter(Boolean);
  const typeText = String(
    [
      ticket?.ticket_type,
      ticket?.ticketType,
      ticket?.acknowledgement_ticket_type,
      ticket?.notebook_type,
      ticket?.notebookType,
      ticket?.notebook,
      ticket?.machine_name,
      ticket?.description,
      ticket?.message,
      ticket?.ticket_reason,
      ticket?.ticketReason,
    ].join(" ")
  ).trim().toLowerCase();
  const isReviewType = String(ticket?.ticket_type || ticket?.ticketType || "").trim().toLowerCase() === "review";
  const statusText = String(
    ticket?.status || ticket?.ticket_status || ticket?.current_status || ticket?.state || ""
  ).trim().toLowerCase();

  return (
    isReviewType ||
    typeText.includes("acknowledge") ||
    typeText.includes("acknowledgement") ||
    typeText.includes("missing_value") ||
    statusText.includes("pending approval") ||
    statusText.includes("pending acknowledgement") ||
    parameterNames.some(isNotebookAcknowledgementParameterName)
  );
};

export const TICKET_KIND = {
  THRESHOLD: "threshold",
  SUBMISSION_FREQUENCY: "submission_frequency",
  NOTEBOOK_ACK: "notebook_ack",
  PP_BATCH: "pp_batch",
};

const EXPLICIT_TICKET_KIND_KEYS = {
  threshold: TICKET_KIND.THRESHOLD,
  submission_frequency: TICKET_KIND.SUBMISSION_FREQUENCY,
  notebook_ack: TICKET_KIND.NOTEBOOK_ACK,
  pp_batch: TICKET_KIND.PP_BATCH,
};

// Single source of truth for "what kind of ticket is this." Manual tickets can carry an
// explicit ticket_kind (stamped by OperatorCreateTicket.jsx) which is trusted first since
// it's authoritative; system-generated tickets never carry that field and fall through to
// the same heuristics every dashboard/detail view used to re-derive independently.
export const getTicketKind = (ticket) => {
  const explicitKind = EXPLICIT_TICKET_KIND_KEYS[String(ticket?.ticket_kind || "").trim().toLowerCase()];
  if (explicitKind) return explicitKind;

  if (isPpBatchCompletionTicketRecord(ticket)) return TICKET_KIND.PP_BATCH;
  if (isNotebookAcknowledgementTicketRecord(ticket)) return TICKET_KIND.NOTEBOOK_ACK;
  if (isSubmissionFrequencyTicketRecord(ticket)) return TICKET_KIND.SUBMISSION_FREQUENCY;
  return TICKET_KIND.THRESHOLD;
};

export const isSubmissionTicketRecord = (ticket) => getTicketKind(ticket) !== TICKET_KIND.THRESHOLD;

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

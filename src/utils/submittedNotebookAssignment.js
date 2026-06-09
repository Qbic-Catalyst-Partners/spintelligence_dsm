const parseJsonValue = (value) => {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed || !["{", "["].includes(trimmed[0])) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

export const normalizeNameList = (value) => {
  const parsed = parseJsonValue(value);

  if (Array.isArray(parsed)) {
    return parsed
      .flatMap((item) => {
        if (!item || typeof item !== "object") return item;
        return item.name || item.full_name || item.fullName || item.employee_id || item.employeeId || item.id || "";
      })
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  if (typeof parsed === "string") {
    return parsed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (parsed && typeof parsed === "object") {
    return normalizeNameList(
      parsed.name || parsed.full_name || parsed.fullName || parsed.employee_id || parsed.employeeId || parsed.id
    );
  }

  return parsed === undefined || parsed === null || parsed === "" ? [] : [String(parsed).trim()];
};

export const normalizeLookupValue = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const normalizeMatchValue = (value) =>
  normalizeLookupValue(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(data entry|department|notebook|log book|logbook|entry)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const compactMatchValue = (value) => normalizeMatchValue(value).replace(/\s+/g, "");

const valuesMatch = (left, right) => {
  const leftValue = normalizeMatchValue(left);
  const rightValue = normalizeMatchValue(right);
  if (!leftValue || !rightValue) return false;
  if (leftValue === rightValue) return true;

  const leftCompact = compactMatchValue(left);
  const rightCompact = compactMatchValue(right);
  return (
    Boolean(leftCompact && rightCompact) &&
    (leftCompact === rightCompact ||
      leftCompact.includes(rightCompact) ||
      rightCompact.includes(leftCompact))
  );
};

const getFirstValue = (...values) =>
  values.find((value) => String(value ?? "").trim()) || "";

const getNestedPayload = (notebook) => {
  const direct =
    notebook?.submitted_fields ||
    notebook?.submittedFields ||
    notebook?.input_fields ||
    notebook?.inputFields ||
    notebook?.fields ||
    notebook?.form_data ||
    notebook?.formData ||
    notebook?.payload ||
    {};

  const parsed = parseJsonValue(direct);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
};

const getNotebookDepartment = (notebook) => {
  const payload = getNestedPayload(notebook);
  return getFirstValue(notebook?.department, payload?.department);
};

const getNotebookSubDepartment = (notebook) => {
  const payload = getNestedPayload(notebook);
  return getFirstValue(
    notebook?.sub_department,
    notebook?.subDepartment,
    payload?.sub_department,
    payload?.subDepartment
  );
};

const getNotebookScreenName = (notebook) => {
  const payload = getNestedPayload(notebook);
  return getFirstValue(
    notebook?.notebook_name,
    notebook?.notebookName,
    notebook?.input_screen,
    notebook?.inputScreen,
    notebook?.screen_name,
    notebook?.screenName,
    notebook?.title,
    payload?.notebook_name,
    payload?.notebookName,
    payload?.input_screen,
    payload?.inputScreen,
    payload?.screen_name,
    payload?.screenName,
    payload?.type,
    payload?.entry_type
  );
};

const getThresholdScreenName = (threshold) =>
  getFirstValue(
    threshold?.screen_name,
    threshold?.screenName,
    threshold?.notebook_name,
    threshold?.notebookName,
    threshold?.notebook,
    threshold?.input_screen,
    threshold?.inputScreen,
    threshold?.title
  );

const getActiveValue = (item) => item?.is_active ?? item?.isActive ?? item?.status !== "inactive";

export const getUserIdentityValues = (user) =>
  [
    user?.id,
    user?.user_id,
    user?.userId,
    user?.employee_id,
    user?.employeeId,
    user?.emp_id,
    user?.name,
    user?.full_name,
    user?.fullName,
    user?.username,
    user?.email,
  ]
    .map(normalizeLookupValue)
    .filter(Boolean);

export const getSubmittedNotebookApproverValues = (notebook) =>
  [
    ...normalizeNameList(notebook?.approval_l2),
    ...normalizeNameList(notebook?.approval_l2_name),
    ...normalizeNameList(notebook?.approval_l2_names),
    ...normalizeNameList(notebook?.approval_l2_user_id),
    ...normalizeNameList(notebook?.approval_l2_user_ids),
    ...normalizeNameList(notebook?.approval_l2_ids),
    ...normalizeNameList(notebook?.l2_approver_user_id),
    ...normalizeNameList(notebook?.l2_approver_user_ids),
    ...normalizeNameList(notebook?.l2ApproverUserIds),
    ...normalizeNameList(notebook?.l2_approver_names),
    ...normalizeNameList(notebook?.l2ApproverNames),
  ]
    .map(normalizeLookupValue)
    .filter(Boolean);

const getThresholdScore = (notebook, threshold) => {
  if (!threshold || getActiveValue(threshold) === false) return 0;

  const notebookDepartment = getNotebookDepartment(notebook);
  const notebookSubDepartment = getNotebookSubDepartment(notebook);
  const notebookScreenName = getNotebookScreenName(notebook);
  const thresholdDepartment = threshold?.department || threshold?.department_name || threshold?.departmentName || "";
  const thresholdSubDepartment =
    threshold?.sub_department || threshold?.subDepartment || threshold?.sub_department_name || "";
  const thresholdScreenName = getThresholdScreenName(threshold);

  if (thresholdDepartment && notebookDepartment && !valuesMatch(notebookDepartment, thresholdDepartment)) {
    return 0;
  }

  if (thresholdSubDepartment && notebookSubDepartment && !valuesMatch(notebookSubDepartment, thresholdSubDepartment)) {
    return 0;
  }

  if (thresholdScreenName && notebookScreenName && !valuesMatch(notebookScreenName, thresholdScreenName)) {
    return 0;
  }

  let score = 0;
  if (thresholdDepartment && notebookDepartment) score += 2;
  if (thresholdSubDepartment && notebookSubDepartment) score += 3;
  if (thresholdScreenName && notebookScreenName) score += 5;

  return score;
};

export const findSubmittedNotebookAssignment = (notebook, thresholds = []) =>
  thresholds
    .map((threshold, index) => ({
      threshold,
      index,
      score: getThresholdScore(notebook, threshold),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.threshold || null;

export const enrichSubmittedNotebookWithAssignment = (notebook, thresholds = []) => {
  const assignment = findSubmittedNotebookAssignment(notebook, thresholds);
  if (!assignment) return notebook;

  const l2Ids = normalizeNameList(
    assignment.approval_l2_user_id || assignment.approval_l2_user_ids || assignment.approval_l2_ids || assignment.approval_l2
  );
  const l2Names = normalizeNameList(
    assignment.approval_l2_name || assignment.approval_l2_names || assignment.l2_approver_names
  );

  return {
    ...notebook,
    approval_l2: l2Ids.length ? l2Ids.join(", ") : notebook?.approval_l2,
    approval_l2_name: l2Names.length ? l2Names.join(", ") : notebook?.approval_l2_name,
    approval_l2_user_id: l2Ids[0] || notebook?.approval_l2_user_id,
    approval_l2_names: l2Names.length ? l2Names : notebook?.approval_l2_names,
    acknowledge_within_hours:
      assignment.acknowledge_within_hours ??
      assignment.acknowledgeWithinHours ??
      assignment.ack_hours ??
      notebook?.acknowledge_within_hours,
  };
};

export const isSubmittedNotebookAssignedToUser = (notebook, user, { allowUnassigned = true } = {}) => {
  const approverValues = getSubmittedNotebookApproverValues(notebook);
  if (!approverValues.length) return allowUnassigned;

  const userValues = getUserIdentityValues(user);
  return userValues.some((userValue) => approverValues.includes(userValue));
};

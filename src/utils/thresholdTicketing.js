import { createOperatorTicket } from "@/apis/operatorApi";
import { fetchThresholdsAPI } from "@/apis/thresholdsApi";

const getCurrentAuthUser = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawUser =
      window.sessionStorage.getItem("authUser") ||
      window.localStorage.getItem("authUser");
    return rawUser ? JSON.parse(rawUser) : null;
  } catch {
    return null;
  }
};

const getCurrentTicketUser = () => {
  const user = getCurrentAuthUser();
  const storedUserId =
    typeof window !== "undefined"
      ? window.sessionStorage.getItem("authUserId") || window.localStorage.getItem("authUserId")
      : null;

  if (!user || typeof user !== "object") {
    return { userId: storedUserId || null, userName: null };
  }

  return {
    userId:
      storedUserId ||
      user.id ||
      user.user_id ||
      user.userId ||
      user.employee_id ||
      user.employeeId ||
      null,
    userName:
      user.full_name ||
      user.fullName ||
      user.name ||
      user.username ||
      user.employee_id ||
      user.employeeId ||
      null,
  };
};

const normalizeText = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/%/g, " percent ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseNumericValue = (value) => {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const buildObjectKey = (label) =>
  String(label ?? "")
    .toLowerCase()
    .trim();

const buildFieldAliases = (fieldName) => {
  const raw = String(fieldName || "").trim();
  if (!raw) return [];

  const lower = raw.toLowerCase();
  const snake = lower.replace(/\s+/g, "_");
  const compact = lower.replace(/\s+/g, "");

  return Array.from(new Set([raw, lower, snake, compact]));
};

const normalizeConditionLevel = (value) =>
  String(value ?? "More and Less Than").trim().toLowerCase();

const normalizeConditionKey = (value) =>
  normalizeConditionLevel(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

const toServerConditionLabel = (value) => {
  const normalized = normalizeConditionKey(value);

  if (normalized === "more than") {
    return "More Than";
  }

  if (normalized === "less than") {
    return "Less Than";
  }

  return "More and Less Than";
};

const resolveViolation = ({
  conditionLevel,
  actualValue,
  targetValue,
  plusTolerance,
  minusTolerance,
}) => {
  const normalizedCondition = normalizeConditionKey(conditionLevel);

  if (normalizedCondition === "less than") {
    const limit = minusTolerance ?? targetValue;
    if (limit === null) {
      return null;
    }

    return actualValue < limit
      ? { violated: true, referenceValue: limit }
      : { violated: false, referenceValue: limit };
  }

  if (normalizedCondition === "more than") {
    const limit = plusTolerance ?? targetValue;
    if (limit === null) {
      return null;
    }

    return actualValue > limit
      ? { violated: true, referenceValue: limit }
      : { violated: false, referenceValue: limit };
  }

  if (targetValue === null || plusTolerance === null || minusTolerance === null) {
    return null;
  }

  const minValue = targetValue - minusTolerance;
  const maxValue = targetValue + plusTolerance;

  return actualValue <= minValue || actualValue >= maxValue
    ? {
        violated: true,
        minValue,
        maxValue,
      }
    : {
        violated: false,
        minValue,
        maxValue,
      };
};

const getSeverity = (actualValue, minValue, maxValue, toleranceSpan) => {
  if (toleranceSpan <= 0) {
    return "Low";
  }

  const distance =
    actualValue < minValue ? minValue - actualValue : actualValue - maxValue;
  const ratio = distance / toleranceSpan;

  if (ratio >= 1) {
    return "High";
  }

  if (ratio >= 0.5) {
    return "Medium";
  }

  return "Low";
};

export const createThresholdViolationTickets = async ({
  department,
  subDepartment,
  screenName,
  machineName,
  values = [],
}) => {
  const { userId, userName } = getCurrentTicketUser();
  const safeUserName = String(userName || userId || "System User").trim();
  let thresholds = await fetchThresholdsAPI({
    department,
    sub_department: subDepartment,
    input_screen: screenName,
    machine_name: machineName,
  });

  if ((!Array.isArray(thresholds) || thresholds.length === 0) && machineName) {
    thresholds = await fetchThresholdsAPI({
      department,
      sub_department: subDepartment,
      input_screen: screenName,
    });
  }

  if (!Array.isArray(thresholds) || thresholds.length === 0) {
    return [];
  }

  const thresholdMap = new Map(
    thresholds
      .filter((item) => item?.is_active !== false)
      .map((item) => [
        normalizeText(item?.input_field || item?.parameter_name),
        item,
      ])
  );

  const violations = values
    .map((item) => {
      const label = item?.label || "";
      const threshold = thresholdMap.get(normalizeText(label));

      if (!threshold) {
        return null;
      }

      const actualValue = parseNumericValue(item?.value);
      const targetValue = parseNumericValue(threshold?.actual_value);
      const plusTolerance = parseNumericValue(
        threshold?.plus_threshold ?? threshold?.positive_tolerance
      );
      const minusTolerance = parseNumericValue(
        threshold?.minus_threshold ?? threshold?.negative_tolerance
      );
      const conditionLevel = threshold?.condition_level || threshold?.comparison_operator;

      if (actualValue === null) {
        return null;
      }

      const violationCheck = resolveViolation({
        conditionLevel: normalizeConditionLevel(conditionLevel),
        actualValue,
        targetValue,
        plusTolerance,
        minusTolerance,
      });

      if (!violationCheck?.violated) {
        return null;
      }

      return {
        label,
        ticketField:
          String(threshold?.input_field || threshold?.parameter_name || label).trim(),
        actualValue,
        conditionLevel: toServerConditionLabel(
          threshold?.condition_level || threshold?.comparison_operator
        ),
        thresholdValue: {
          condition_level: toServerConditionLabel(
            threshold?.condition_level || threshold?.comparison_operator
          ),
          actual_value: targetValue,
          plus_threshold: plusTolerance,
          minus_threshold: minusTolerance,
        },
        severity: getSeverity(
          actualValue,
          violationCheck.minValue ?? violationCheck.referenceValue ?? targetValue,
          violationCheck.maxValue ?? violationCheck.referenceValue ?? targetValue,
          Math.max(plusTolerance ?? 0, minusTolerance ?? 0)
        ),
      };
    })
    .filter(Boolean);

  if (!violations.length) {
    return [];
  }

  const actualValues = {};
  const thresholdValues = {};
  const parameterNameSet = new Set();

  violations.forEach((violation) => {
    const ticketField = violation.ticketField || violation.label;
    parameterNameSet.add(ticketField);
    const aliases = buildFieldAliases(ticketField);
    aliases.forEach((alias) => {
      actualValues[alias] = violation.actualValue;
      thresholdValues[alias] = violation.thresholdValue;
    });
  });
  const parameterNames = Array.from(parameterNameSet);

  try {
    const createdTicket = await createOperatorTicket({
      user_id: userId,
      user_name: safeUserName,
      department,
      management_field: department,
      sub_department: subDepartment,
      erp_product_code: subDepartment,
      input_screen: screenName,
      machine_name: machineName || screenName,
      parameter_name: parameterNames,
      actual_value: actualValues,
      threshold_value: thresholdValues,
      status: "Open",
      description: `System generated alert: ${parameterNames.length} threshold breach(es) detected.`,
    });

    return [createdTicket];
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    if (
      message.includes("no violations found") ||
      message.includes("threshold breach")
    ) {
      return [];
    }
    throw error;
  }
};

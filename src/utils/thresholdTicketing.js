import { createOperatorTicket } from "@/apis/operatorApi";
import { fetchThresholdsAPI } from "@/apis/thresholdsApi";

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

const normalizeConditionLevel = (value) =>
  String(value ?? "More and Less Than").trim().toLowerCase();

const resolveViolation = ({
  conditionLevel,
  actualValue,
  targetValue,
  plusTolerance,
  minusTolerance,
}) => {
  if (conditionLevel === "less than") {
    const limit = minusTolerance ?? targetValue;
    if (limit === null) {
      return null;
    }

    return actualValue < limit
      ? { violated: true, referenceValue: limit }
      : { violated: false, referenceValue: limit };
  }

  if (conditionLevel === "more than") {
    const limit = plusTolerance ?? targetValue;
    if (limit === null) {
      return null;
    }

    return actualValue > limit
      ? { violated: true, referenceValue: limit }
      : { violated: false, referenceValue: limit };
  }

  const minValue =
    minusTolerance === null || targetValue === null
      ? targetValue
      : targetValue - minusTolerance;
  const maxValue =
    plusTolerance === null || targetValue === null
      ? targetValue
      : targetValue + plusTolerance;

  if (minValue === null || maxValue === null) {
    return null;
  }

  return actualValue < minValue || actualValue > maxValue
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
  const thresholds = await fetchThresholdsAPI({
    department,
    sub_department: subDepartment,
    input_screen: screenName,
    machine_name: machineName,
  });

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

      if (actualValue === null || targetValue === null) {
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
        actualValue,
        conditionLevel: threshold?.condition_level || "More and Less Than",
        thresholdValue: {
          condition_level: threshold?.condition_level || "More and Less Than",
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

  return Promise.all(
    violations.map((violation) =>
      createOperatorTicket({
        department_name: department,
        sub_department_name: subDepartment,
        input_screen_name: screenName,
        machine_name: machineName || screenName,
        parameter_name: [violation.label],
        actual_value: {
          [buildObjectKey(violation.label)]: violation.actualValue,
        },
        threshold_value: {
          [buildObjectKey(violation.label)]: violation.thresholdValue,
        },
        status: "Open",
        description: `System generated alert: ${violation.label} exceeded the configured threshold.`,
      })
    )
  );
};

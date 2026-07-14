const DASH_PLACEHOLDER_PATTERN = /^[-\u2013\u2014\u2212]+$/;

export const isDashPlaceholder = (value) =>
  typeof value === "string" && DASH_PLACEHOLDER_PATTERN.test(value.trim());

export const blankDashPlaceholder = (value) => (isDashPlaceholder(value) ? "" : value);

export const normalizeOcrDisplayValue = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return blankDashPlaceholder(JSON.stringify(value));
  return blankDashPlaceholder(String(value).trim());
};

export const normalizeOcrDisplayRow = (row = {}) => {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  return Object.entries(row).reduce((acc, [key, value]) => {
    acc[key] = normalizeOcrDisplayValue(value);
    return acc;
  }, {});
};

const buildNumericPattern = ({ precision = null, scale = null, integerOnly = false } = {}) => {
  const maxIntegerDigits =
    typeof precision === "number" && typeof scale === "number"
      ? Math.max(1, precision - scale)
      : typeof precision === "number"
        ? precision
        : null;
  const maxDecimalDigits = integerOnly ? 0 : Math.max(0, Number(scale) || 0);

  return { maxIntegerDigits, maxDecimalDigits };
};

export const sanitizeNumericInput = (value, config = {}) => {
  if (value === null || value === undefined) return "";

  const { maxIntegerDigits, maxDecimalDigits } = buildNumericPattern(config);
  const raw = String(value).replace(/[^\d.]/g, "");

  if (!raw) return "";

  const [integerPart = "", ...decimalParts] = raw.split(".");
  const safeIntegerPart =
    maxIntegerDigits === null ? integerPart : integerPart.slice(0, maxIntegerDigits);

  if (config.integerOnly || maxDecimalDigits === 0) {
    return safeIntegerPart;
  }

  const joinedDecimal = decimalParts.join("");
  const safeDecimalPart =
    maxDecimalDigits === null ? joinedDecimal : joinedDecimal.slice(0, maxDecimalDigits);

  if (raw.startsWith(".")) {
    return safeDecimalPart ? `0.${safeDecimalPart}` : "0.";
  }

  if (raw.includes(".")) {
    return `${safeIntegerPart}.${safeDecimalPart}`;
  }

  return safeIntegerPart;
};

export const sanitizeIntegerInput = (value, maxDigits = null) =>
  sanitizeNumericInput(value, { integerOnly: true, precision: maxDigits });

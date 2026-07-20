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

export const sanitizeBlendPercentInput = (value) => {
  if (value === null || value === undefined) return "";

  const raw = String(value).replace(/[^\d/\s.]/g, "");
  if (!raw) return "";

  return raw.replace(/\s+/g, "");
};

export const sanitizeIntegerInput = (value, maxDigits = null) =>
  sanitizeNumericInput(value, { integerOnly: true, precision: maxDigits });

// Spindle numbers on Spinning's LHS/RHS fields are physical spindle positions — 0 isn't a valid
// spindle, so it must never be typable, but "10", "20", "100" etc. are legitimate and must keep
// their own zero digits. Strip only zeros that make the whole segment equal to zero (a leading
// run of zeros with nothing non-zero after them), not zeros that are part of a larger number.
const sanitizeSpindleSegment = (segment) => {
  const digitsOnly = segment.replace(/\D/g, "");
  if (!digitsOnly) return "";
  const withoutLeadingZeros = digitsOnly.replace(/^0+/, "");
  return withoutLeadingZeros;
};

export const sanitizeSpindleNumberInput = (value) => sanitizeSpindleSegment(String(value ?? ""));

// The comma-separated spindle list (e.g. "1,22,33,44") is typed as free text — sanitize each
// segment independently so a 0 can never be typed in any position while the user is still mid-way
// through typing a later number (which would otherwise have its own leading zeros stripped too
// early, e.g. typing "10" one keystroke at a time).
export const sanitizeSpindleListInput = (value) => {
  if (value === null || typeof value === "undefined") return "";
  const raw = String(value);
  const endsWithComma = /,\s*$/.test(raw);
  const segments = raw.split(",").map((segment) => segment.replace(/[^\d]/g, ""));
  const sanitizedSegments = segments
    .map((segment, index) => {
      const isLastSegment = index === segments.length - 1;
      // Don't strip a segment's leading zeros while it's still being typed (the last segment,
      // when the input doesn't end in a trailing comma) — "10" typed as "1" then "10" would
      // otherwise have its "1" prematurely treated as a standalone zero-only segment and dropped.
      // A single "0" with nothing else typed yet is the one exception: it can never become a
      // valid spindle number just by appending more zeros, so block it immediately too.
      if (isLastSegment && !endsWithComma && segment !== "0") return segment;
      return sanitizeSpindleSegment(segment);
    })
    // A zero-only segment (e.g. the middle "0" in "1,0,22") sanitizes to "", which would
    // otherwise leave a dangling ",," in the field — drop it so the list stays clean, unless it's
    // the last, still-being-typed segment (that empty slot is where the user is about to type).
    .filter((segment, index) => segment !== "" || index === segments.length - 1);
  return sanitizedSegments.join(",");
};

export const sanitizeDrumRangeInput = (value, { min = 1, max = 100, maxDigits = 3 } = {}) => {
  if (value === null || value === undefined) return "";

  const raw = String(value).replace(/\D/g, "");
  if (!raw) return "";

  const normalized = raw.replace(/^0+(?=\d)/, "");
  if (!normalized) return "";

  const numericValue = Number(normalized);
  if (!Number.isFinite(numericValue)) return "";

  if (numericValue < min) return String(min);
  if (numericValue > max) return String(max);

  return String(numericValue).slice(0, maxDigits);
};

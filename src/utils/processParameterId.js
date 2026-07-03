const parseParamId = (value) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const match = normalized.match(/^([A-Za-z]+)[-\s_]?(\d+)$/);
  if (!match) return null;

  return {
    prefix: match[1].toUpperCase(),
    number: Number(match[2]),
    width: match[2].length,
  };
};

export const normalizeProcessParameterId = (value, fallbackPrefix = "PP", fallbackWidth = 4) => {
  const parsed = parseParamId(value);
  if (!parsed) return "";
  return `${parsed.prefix || fallbackPrefix}-${String(parsed.number).padStart(parsed.width || fallbackWidth, "0")}`;
};

export const getInitialProcessParameterId = (fallbackPrefix = "PP", fallbackWidth = 4) =>
  `${String(fallbackPrefix).toUpperCase()}-${String(1).padStart(fallbackWidth, "0")}`;


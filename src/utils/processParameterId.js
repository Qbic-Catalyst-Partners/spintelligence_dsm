export const normalizeProcessParameterId = (value) => {
  const raw = String(value ?? "").trim().toUpperCase();

  if (!raw) return "";

  // Already canonical: PP-0019
  const canonical = raw.match(/^PP-(\d+)$/);
  if (canonical) {
    return `PP-${canonical[1].padStart(4, "0")}`;
  }

  // Legacy format: PP019
  const legacy = raw.match(/^PP(\d+)$/);
  if (legacy) {
    return `PP-${legacy[1].padStart(4, "0")}`;
  }

  return raw;
};



export const coerceProcessParameterId = normalizeProcessParameterId;

export const resolveProcessParameterDisplayId = (entry = {}, fallback = "") =>
  normalizeProcessParameterId(
    entry?.entry_id ??
    entry?.entryId ??
    entry?.process_parameter_id ??
    entry?.param_id ??
    entry?.id ??
    fallback
  );

const GLOBAL_PROCESS_PARAMETER_COUNTER_KEY = "pp-global-id-counter";

export const reserveGlobalProcessParameterId = async (fallbackPrefix = "PP", fallbackWidth = 4) => {
  const prefix = String(fallbackPrefix || "PP").trim().toUpperCase();
  const width = Number(fallbackWidth) || 4;

  if (typeof window === "undefined") {
    return `${prefix}-${String(1).padStart(width, "0")}`;
  }

  try {
    const current = Number(window.localStorage.getItem(GLOBAL_PROCESS_PARAMETER_COUNTER_KEY)) || 0;
    const next = current + 1;
    window.localStorage.setItem(GLOBAL_PROCESS_PARAMETER_COUNTER_KEY, String(next));
    return `${prefix}-${String(next).padStart(width, "0")}`;
  } catch {
    return `${prefix}-${String(1).padStart(width, "0")}`;
  }
};


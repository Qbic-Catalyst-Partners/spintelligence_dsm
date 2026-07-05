import { readProcessParameterRegistry } from "@/utils/processParameterRegistry";

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

const extractSequence = (value) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return 0;
  const match = normalized.match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) || 0 : 0;
};

export const reserveGlobalProcessParameterId = async (fallbackPrefix = "PP", fallbackWidth = 4) => {
  const prefix = String(fallbackPrefix || "PP").trim().toUpperCase();
  const width = Number(fallbackWidth) || 4;
  const registry = readProcessParameterRegistry();
  const highestSequence = registry.reduce((max, row) => {
    const displayId = String(row?.displayId || row?.entryId || row?.id || "").trim().toUpperCase();
    // Ignore legacy/foreign IDs (e.g. "#MQ-0001") that don't use this prefix — only
    // count real "PP-000N" rows so the next reserved ID reflects how many PP entries exist.
    if (!displayId.startsWith(`${prefix}-`)) return max;
    const candidate = extractSequence(displayId);
    return candidate > max ? candidate : max;
  }, 0);
  const nextSequence = Math.max(1, highestSequence + 1);
  return `${prefix}-${String(nextSequence).padStart(width, "0")}`;
};


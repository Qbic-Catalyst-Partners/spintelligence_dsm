import { readProcessParameterRegistry } from "@/utils/processParameterRegistry";
import { fetchNextProcessParameterId } from "@/apis/processParameter";

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

// The backend enforces that any PP id a client submits must fall within the
// range it has actually issued (see resolveOrCreateProcessParameterEntryId in
// backend/utils/processParameterEntryId.js) - anything else is rejected with
// "Invalid or unrecognized Process Parameter ID". This must therefore always
// ask the server for the next id rather than guessing locally; a client-side
// counter (e.g. localStorage) inevitably drifts from the server's sequence
// and produces ids the backend then rejects.
export const reserveGlobalProcessParameterId = async (fallbackPrefix = "PP", fallbackWidth = 4) => {
  const serverNextId = await fetchNextProcessParameterId();
  if (serverNextId) {
    return normalizeProcessParameterId(serverNextId);
  }

  // Backend unreachable - fall back to a local best-effort guess so the form
  // isn't completely blocked. This may still be rejected by the backend once
  // reachable again, since it isn't guaranteed to match the real sequence.
  const prefix = String(fallbackPrefix || "PP").trim().toUpperCase();
  const width = Number(fallbackWidth) || 4;

  const registry = readProcessParameterRegistry();
  const highestSequence = registry.reduce((max, row) => {
    const displayId = String(row?.displayId || row?.entryId || row?.id || "").trim().toUpperCase();
    if (!displayId.startsWith(`${prefix}-`)) return max;
    const candidate = extractSequence(displayId);
    return candidate > max ? candidate : max;
  }, 0);

  const nextSequence = Math.max(1, highestSequence + 1);
  return `${prefix}-${String(nextSequence).padStart(width, "0")}`;
};


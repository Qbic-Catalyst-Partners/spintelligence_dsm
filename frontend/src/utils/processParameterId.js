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

// Most department save routes put entry_id at the top level of the response
// body, but Autoconer's (/process, /q2, /q3) nest the saved row under `data`
// (e.g. { message, data: { entry_id, ... } }) — check both shapes so callers
// don't have to know which backend convention they're talking to.
export const resolveProcessParameterDisplayId = (entry = {}, fallback = "") =>
  normalizeProcessParameterId(
    entry?.entry_id ??
    entry?.entryId ??
    entry?.process_parameter_id ??
    entry?.param_id ??
    entry?.id ??
    entry?.data?.entry_id ??
    entry?.data?.entryId ??
    entry?.data?.process_parameter_id ??
    entry?.data?.param_id ??
    entry?.data?.id ??
    fallback
  );

const extractSequence = (value) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return 0;
  const match = normalized.match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) || 0 : 0;
};

const GLOBAL_PROCESS_PARAMETER_COUNTER_KEY = "pp-global-id-counter";

// The real, collision-free next PP id lives in the backend's global sequence
// (process_parameters.entry_id_sequences, via GET /process-parameters/next-id)
// — every department's save already reconciles against that same sequence
// server-side. The local registry/localStorage counter below has no idea what
// other departments/browsers have already claimed, so it's kept only as a
// last-resort fallback if the backend call fails (e.g. offline), not as the
// primary source of truth.
export const reserveGlobalProcessParameterId = async (fallbackPrefix = "PP", fallbackWidth = 4) => {
  const prefix = String(fallbackPrefix || "PP").trim().toUpperCase();
  const width = Number(fallbackWidth) || 4;

  if (prefix === "PP") {
    const backendNextId = await fetchNextProcessParameterId();
    if (backendNextId) return backendNextId;
  }

  const registry = readProcessParameterRegistry();
  const highestSequence = registry.reduce((max, row) => {
    const displayId = String(row?.displayId || row?.entryId || row?.id || "").trim().toUpperCase();
    if (!displayId.startsWith(`${prefix}-`)) return max;
    const candidate = extractSequence(displayId);
    return candidate > max ? candidate : max;
  }, 0);

  let nextSequence = Math.max(1, highestSequence + 1);

  if (typeof window !== "undefined") {
    try {
      const stored = Number(window.localStorage.getItem(GLOBAL_PROCESS_PARAMETER_COUNTER_KEY)) || 0;
      nextSequence = Math.max(nextSequence, stored + 1);
      window.localStorage.setItem(GLOBAL_PROCESS_PARAMETER_COUNTER_KEY, String(nextSequence));
    } catch {
      // fall back to the registry-based sequence when storage is unavailable
    }
  }

  return `${prefix}-${String(nextSequence).padStart(width, "0")}`;
};


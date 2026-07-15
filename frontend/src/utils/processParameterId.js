import { readProcessParameterRegistry } from "@/utils/processParameterRegistry";
import { fetchNextProcessParameterId } from "@/apis/processParameter";
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

const GLOBAL_PROCESS_PARAMETER_COUNTER_KEY = "pp-global-id-counter";

// The real, collision-free next PP id lives in the backend's global sequence
// (process_parameters.entry_id_sequences, via GET /process-parameters/next-id)
// — every department's save already reconciles against that same sequence
// server-side. The local registry/localStorage counter below has no idea what
// other departments/browsers have already claimed, so it's kept only as a
// last-resort fallback if the backend call fails (e.g. offline), not as the
// primary source of truth.
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

  const nextSequence = Math.max(1, highestSequence + 1);
  return `${prefix}-${String(nextSequence).padStart(width, "0")}`;
};


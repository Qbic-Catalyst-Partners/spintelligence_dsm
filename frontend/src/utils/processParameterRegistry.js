import { resolveProcessParameterDisplayId } from "@/utils/processParameterId";
import { clearLocalEntries } from "@/utils/localProcessParameterStore";

const REGISTRY_KEY = "process-parameter-registry";
const GLOBAL_ID_COUNTER_KEY = "pp-global-id-counter";
const LOCAL_NAMESPACES = ["draw-frame-breaker", "draw-frame-finisher", "spinning"];

const safeRead = () => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(REGISTRY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const safeWrite = (value) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(value));
  } catch {
    // ignore storage failures
  }
};

const normalizeRow = (row) => ({
  displayId: String(row?.displayId || row?.entryId || row?.id || "").trim(),
  statuses: Array.isArray(row?.statuses) ? row.statuses.slice(0, 10) : [],
  countName: String(row?.countName || "").trim(),
  consigneeName: String(row?.consigneeName || "").trim(),
});

export const readProcessParameterRegistry = () => safeRead().map(normalizeRow).filter((row) => row.displayId);

export const writeProcessParameterRegistry = (rows = []) => {
  const normalized = Array.from(
    new Map(rows.map((row) => [String(row?.displayId || row?.entryId || row?.id || "").trim(), normalizeRow(row)]))
  ).map(([, row]) => row).filter((row) => row.displayId);
  safeWrite(normalized);
  return normalized;
};

// A PP id's count name and consignee name are fixed by whichever sub-department entry set
// them first — every other sub-department under the same PP id must reuse both.
export const registerProcessParameterId = (response, _department = "", countName = "", consigneeName = "") => {
  const displayId = resolveProcessParameterDisplayId(response);
  if (!displayId) return "";

  const current = readProcessParameterRegistry();
  const existingIndex = current.findIndex((row) => row.displayId === displayId);
  const existingCountName = current[existingIndex]?.countName || "";
  const existingConsigneeName = current[existingIndex]?.consigneeName || "";
  const nextRow = {
    displayId,
    statuses: current[existingIndex]?.statuses || [],
    countName: existingCountName || String(countName || "").trim(),
    consigneeName: existingConsigneeName || String(consigneeName || "").trim(),
  };
  if (existingIndex >= 0) current[existingIndex] = nextRow;
  else current.unshift(nextRow);
  writeProcessParameterRegistry(current);
  return displayId;
};

export const getProcessParameterCountName = (displayId) => {
  const normalized = String(displayId || "").trim();
  if (!normalized) return "";
  const row = readProcessParameterRegistry().find((item) => item.displayId === normalized);
  return row?.countName || "";
};

export const getProcessParameterConsigneeName = (displayId) => {
  const normalized = String(displayId || "").trim();
  if (!normalized) return "";
  const row = readProcessParameterRegistry().find((item) => item.displayId === normalized);
  return row?.consigneeName || "";
};

export const removeProcessParameterId = (displayId) => {
  const normalized = String(displayId || "").trim();
  if (!normalized) return;
  const current = readProcessParameterRegistry();
  writeProcessParameterRegistry(current.filter((row) => row.displayId !== normalized));
};

export const readProcessParameterBatchDisplayId = () => "";
export const markProcessParameterBatchColumn = () => {};

// Clears everything this browser tracks locally about process parameters: the matrix
// registry/status cache, the next-id counter, and the locally-stored Draw Frame/Spinning
// entries (those departments don't have a backend yet, so this is their only copy).
// This does NOT delete backend records for Mixing/Blow Room/Carding/Simplex/Autoconer/Q2/Q3
// — those live in the database and must be removed there for "Create New PP" to truly
// start from PP-0001 again.
export const resetProcessParameterLocalState = () => {
  safeWrite([]);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(GLOBAL_ID_COUNTER_KEY);
    } catch {
      // ignore storage failures
    }
  }
  LOCAL_NAMESPACES.forEach(clearLocalEntries);
};

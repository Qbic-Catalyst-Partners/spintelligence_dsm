import { resolveProcessParameterDisplayId } from "@/utils/processParameterId";

const REGISTRY_KEY = "process-parameter-registry";

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
});

export const readProcessParameterRegistry = () => safeRead().map(normalizeRow).filter((row) => row.displayId);

export const writeProcessParameterRegistry = (rows = []) => {
  const normalized = Array.from(
    new Map(rows.map((row) => [String(row?.displayId || row?.entryId || row?.id || "").trim(), normalizeRow(row)]))
  ).map(([, row]) => row).filter((row) => row.displayId);
  safeWrite(normalized);
  return normalized;
};

export const registerProcessParameterId = (response, _department = "") => {
  const displayId = resolveProcessParameterDisplayId(response);
  if (!displayId) return "";

  const current = readProcessParameterRegistry();
  const existingIndex = current.findIndex((row) => row.displayId === displayId);
  const nextRow = { displayId, statuses: current[existingIndex]?.statuses || [] };
  if (existingIndex >= 0) current[existingIndex] = nextRow;
  else current.unshift(nextRow);
  writeProcessParameterRegistry(current);
  return displayId;
};

export const removeProcessParameterId = (displayId) => {
  const normalized = String(displayId || "").trim();
  if (!normalized) return;
  const current = readProcessParameterRegistry();
  writeProcessParameterRegistry(current.filter((row) => row.displayId !== normalized));
};

export const readProcessParameterBatchDisplayId = () => "";
export const markProcessParameterBatchColumn = () => {};

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
  countName: String(row?.countName || "").trim(),
});

export const readProcessParameterRegistry = () => safeRead().map(normalizeRow).filter((row) => row.displayId);

export const writeProcessParameterRegistry = (rows = []) => {
  const normalized = Array.from(
    new Map(rows.map((row) => [String(row?.displayId || row?.entryId || row?.id || "").trim(), normalizeRow(row)]))
  ).map(([, row]) => row).filter((row) => row.displayId);
  safeWrite(normalized);
  return normalized;
};

// A PP id's count name is fixed by whichever sub-department entry set it first — every
// other sub-department under the same PP id must reuse it (consignee name stays independent).
export const registerProcessParameterId = (response, _department = "", countName = "") => {
  const displayId = resolveProcessParameterDisplayId(response);
  if (!displayId) return "";

  const current = readProcessParameterRegistry();
  const existingIndex = current.findIndex((row) => row.displayId === displayId);
  const existingCountName = current[existingIndex]?.countName || "";
  const nextRow = {
    displayId,
    statuses: current[existingIndex]?.statuses || [],
    countName: existingCountName || String(countName || "").trim(),
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

export const removeProcessParameterId = (displayId) => {
  const normalized = String(displayId || "").trim();
  if (!normalized) return;
  const current = readProcessParameterRegistry();
  writeProcessParameterRegistry(current.filter((row) => row.displayId !== normalized));
};

export const readProcessParameterBatchDisplayId = () => "";
export const markProcessParameterBatchColumn = () => {};

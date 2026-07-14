const STORE_PREFIX = "process-parameter-local::";

const safeRead = (key) => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const safeWrite = (key, value) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage failures (quota exceeded, private browsing, etc.)
  }
};

const extractSequence = (value) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return 0;
  const match = normalized.match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) || 0 : 0;
};

const entryIdOf = (row) => row?.entry_id || row?.entryId || row?.id || "";

export const loadLocalEntries = (namespace) => safeRead(`${STORE_PREFIX}${namespace}`);

export const reserveLocalEntryId = (namespace, { prefix = "PP", width = 4 } = {}) => {
  const entries = loadLocalEntries(namespace);
  const highest = entries.reduce((max, row) => {
    const candidate = extractSequence(entryIdOf(row));
    return candidate > max ? candidate : max;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(width, "0")}`;
};

export const saveLocalEntry = (namespace, entry) => {
  const entries = loadLocalEntries(namespace);
  const id = entryIdOf(entry);
  const index = entries.findIndex((row) => entryIdOf(row) === id);
  const stamped = { ...entry, updated_at: new Date().toISOString() };
  if (index >= 0) entries[index] = { ...entries[index], ...stamped };
  else entries.unshift(stamped);
  safeWrite(`${STORE_PREFIX}${namespace}`, entries);
  return stamped;
};

export const removeLocalEntriesByParamId = (namespace, paramId) => {
  const normalizedTarget = String(paramId || "").trim().toUpperCase();
  if (!normalizedTarget) return;
  const entries = loadLocalEntries(namespace);
  const next = entries.filter(
    (row) => String(row?.param_id || "").trim().toUpperCase() !== normalizedTarget
  );
  safeWrite(`${STORE_PREFIX}${namespace}`, next);
};

export const clearLocalEntries = (namespace) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${STORE_PREFIX}${namespace}`);
  } catch {
    // ignore storage failures
  }
};

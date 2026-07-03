const PROCESS_PARAMETER_REGISTRY_KEY = "pp-created-registry";
const MATRIX_COLUMN_COUNT = 10;

const createBlankStatuses = () => Array.from({ length: MATRIX_COLUMN_COUNT }, () => false);

const normalizeBatch = (row = {}) => ({
  displayId: String(row?.displayId || row?.id || "").trim(),
  statuses: Array.isArray(row?.statuses) ? row.statuses.slice(0, MATRIX_COLUMN_COUNT) : createBlankStatuses(),
  sources: Array.isArray(row?.sources) ? row.sources : [],
  createdAt: row?.createdAt || new Date().toISOString(),
});

export const readProcessParameterRegistry = () => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PROCESS_PARAMETER_REGISTRY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeBatch) : [];
  } catch {
    return [];
  }
};

export const writeProcessParameterRegistry = (rows) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROCESS_PARAMETER_REGISTRY_KEY, JSON.stringify(rows || []));
  } catch {}
};

const appendOrReplaceBatch = (rows, batchRow) => {
  const nextRows = [...rows];
  const index = nextRows.findIndex((row) => row.displayId === batchRow.displayId);

  if (index >= 0) {
    const current = normalizeBatch(nextRows[index]);
    const mergedSources = Array.from(
      new Set([...(current.sources || []), ...(batchRow.sources || [])].filter(Boolean))
    );
    nextRows[index] = { ...current, ...batchRow, sources: mergedSources };
    return nextRows;
  }

  return [...nextRows, normalizeBatch(batchRow)];
};

export const registerProcessParameterId = (payload, source, options = {}) => {
  if (typeof window === "undefined") return "";

  const id = String(
    payload?.entry_id ||
      payload?.param_id ||
      payload?.process_parameter_id ||
      payload?.qc_id ||
      payload?.id ||
      ""
  ).trim();
  if (!id) return "";

  try {
    const existing = readProcessParameterRegistry();
    const displayId = String(options?.displayId || id).trim();

    const nextRows = appendOrReplaceBatch(
      existing,
      {
        displayId,
        statuses: createBlankStatuses(),
        sources: [String(source || "").trim()].filter(Boolean),
        createdAt: new Date().toISOString(),
      },
    ).slice(0, 10);

    writeProcessParameterRegistry(nextRows);
    return displayId;
  } catch {
    return "";
  }
};

export const readProcessParameterBatchDisplayId = () => {
  const [first] = readProcessParameterRegistry();
  return String(first?.displayId || "").trim();
};

export const markProcessParameterBatchColumn = (displayId, columnIndex, isDone = true) => {
  if (typeof window === "undefined") return;
  const normalizedDisplayId = String(displayId || "").trim();
  if (!normalizedDisplayId || columnIndex < 0 || columnIndex >= MATRIX_COLUMN_COUNT) return;

  const existing = readProcessParameterRegistry();
  const rowIndex = existing.findIndex((row) => String(row?.displayId || "").trim() === normalizedDisplayId);
  const nextRows = [...existing];
  const baseRow = rowIndex >= 0 ? normalizeBatch(nextRows[rowIndex]) : normalizeBatch({ displayId: normalizedDisplayId });
  const nextStatuses = [...baseRow.statuses];
  nextStatuses[columnIndex] = isDone;
  const nextRow = {
    ...baseRow,
    displayId: normalizedDisplayId,
    statuses: nextStatuses,
    createdAt: baseRow.createdAt || new Date().toISOString(),
  };

  if (rowIndex >= 0) nextRows[rowIndex] = nextRow;
  else nextRows.unshift(nextRow);

  writeProcessParameterRegistry(nextRows.slice(0, 10));
};

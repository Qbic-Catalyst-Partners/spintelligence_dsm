import apiConfig from "@/apis/apiConfig";

export const FIELD_WIDGET_TYPE = "field_metric";
export const getDashboardWidgetsStorageKey = (userId) =>
  `spintelligenceDashboardWidgets:${userId || "default"}`;

export const readStoredDashboardWidgets = (userId) => {
  if (typeof window === "undefined") return [];

  try {
    const rawValue = window.localStorage.getItem(getDashboardWidgetsStorageKey(userId));
    const widgets = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(widgets) ? widgets : [];
  } catch {
    return [];
  }
};

export const writeStoredDashboardWidgets = (userId, widgets) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      getDashboardWidgetsStorageKey(userId),
      JSON.stringify(Array.isArray(widgets) ? widgets : [])
    );
  } catch {
    // Storage can fail in private mode; backend save remains the primary path.
  }
};

export const DASHBOARD_CHART_TYPES = [
  { key: "line", label: "Line Chart" },
  { key: "bar", label: "Bar Chart" },
  { key: "area", label: "Area Chart" },
  { key: "timeline", label: "Timeline Chart" },
  { key: "average", label: "Avg Chart" },
  { key: "value", label: "Value Card" },
];

const screenEndpoints = {
  "Quality Control": {
    Mixing: {
      "Process Parameter": "/mixing/qc",
      "Cotton HVI Data Entry": "/mixing/cotton-hvi",
      "Fibre Data Entry": "/mixing/fibre",
      "AFIS Data Entry": "/mixing/afis",
      "Moisture Data Entry": "/mixing/moisture",
      "Openness Data Entry": "/mixing/openness",
    },
    "Blow Room": {
      "Blow Room Sync": "/blowroom/sync",
      "Process Parameter": "/blowroom/process-parameters",
      "BR Waste Study Entry": "/blowroom/br-waste-study",
      "Drop Test Data Entry": "/blowroom/drop-test",
    },
    Carding: {
      "Process Parameter": "/carding/process-parameters",
      "Between & Within Card Data Entry": "/carding/between-within-card",
      "Card Thick Place Entry": "/carding/card-thick-place",
      "Trials Data Entry Form": "/carding/trials",
      "Nati Data Entry": "/carding/nati-data",
      "U% Data Entry": "/carding/uqc",
      "Card DFK Pressure Checking": "/carding/dfk-pressure",
    },
    Comber: {
      "Ribbon Lap CV Data Entry": "/comber/lap-cv",
      "Nati Data Entry": "/comber/nati-data-entry",
      "U% Data Entry": "/comber/uqc",
    },
    "Draw Frame": {
      "Yarn CV% Calculation Form": "/drawframe/yarn-cv",
      "Draw Frame Cots Data Entry": "/drawframe/cots",
      "U% Data Entry": "/drawframe/uqc",
      "PP - Breaker Drawing": "/drawframe/header",
      "PP - Finisher Drawing": "/drawframe/finisher",
    },
    Simplex: {
      "Process Parameter": "/simplex/process-parameters",
      "SMXCots Change Data Entry": "/simplex/cots-change",
      "SMX Breaks Study Report": "/simplex/study",
      "U% Data Entry": "/simplex/uqc",
    },
    Spinning: {
      "Process Parameter": "/spinning/qc",
      "COTS Checking": "/spinning/cots-checking",
      "Count Change": "/spinning/count-change",
      "Ring Frame Log Book": "/spinning/ring-frame",
      "Speed Checking": "/spinning/speed-checking",
      "Lycra Missing": "/spinning/lycra-missing",
      "Bottom Apron Checking": "/spinning/bottom-apron-checking",
      "Lycra Centering": "/spinning/lycra-centering",
      "RSM & Lycrasensor Checking Online": "/spinning/rsm-lycra-online",
      "RSM & Lycrasensor Checking Offline": "/spinning/rsm-lycra-offline",
      "Wheel Change": "/spinning/wheel-change",
    },
    Autoconer: {
      "Process Parameter": "/autoconer/process-parameters",
      "PP - Autoconer Q2": "/autoconer/q2",
      "PP - Autoconer Q3": "/autoconer/q3",
      "Rewinding Study": "/autoconer/rewinding-study",
      "Cone Density": "/autoconer/cone-density",
      "Cone Packing Audit": "/autoconer/cone-packing-audit",
      "Lycra Checking": "/autoconer/lycra-checking",
      "Count Wise Cuts Record": "/autoconer/count-wise-cuts",
      "Splice Strength": "/autoconer/splice-strength",
      "Drum wise Appearance": "/autoconer/drum-wise-appearance",
      "CSP Parameter Entries": "/autoconer/parameter-entries/pending-csp",
      "U% Parameter Entries": "/autoconer/parameter-entries/pending-quality",
    },
  },
};

const isRecordObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);

const findRowsArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!isRecordObject(value)) return null;

  for (const key of ["data", "rows", "entries", "records", "result", "items"]) {
    const nestedRows = findRowsArray(value[key]);
    if (nestedRows) return nestedRows;
  }

  return null;
};

const flattenRecord = (record, prefix = "") => {
  if (!isRecordObject(record)) return {};

  return Object.entries(record).reduce((flat, [key, value]) => {
    const flatKey = prefix ? `${prefix}_${key}` : key;
    if (Array.isArray(value)) return flat;
    if (isRecordObject(value)) return { ...flat, ...flattenRecord(value, flatKey) };
    flat[flatKey] = value;
    return flat;
  }, {});
};

export const normalizeDashboardRows = (response) => {
  const rows = findRowsArray(response) || [];
  return rows.flatMap((row) => {
    if (!isRecordObject(row)) return row;
    const nestedArrays = Object.entries(row).filter(
      ([, value]) => Array.isArray(value) && value.some((item) => isRecordObject(item))
    );
    if (!nestedArrays.length) return flattenRecord(row);

    const parent = flattenRecord(row);
    return nestedArrays.flatMap(([, value]) =>
      value.map((item) => ({ ...parent, ...flattenRecord(item) }))
    );
  });
};

export const getDashboardRowDate = (row) =>
  row?.inspection_date ||
  row?.creation_date ||
  row?.invoice_date ||
  row?.entry_date ||
  row?.record_date ||
  row?.date ||
  row?.created_at;

const normalizeKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

export const getDashboardFieldValue = (row, fieldName) => {
  if (!row || !fieldName) return null;
  if (row[fieldName] !== undefined) return row[fieldName];

  const target = normalizeKey(fieldName);
  const matchedKey = Object.keys(row).find((key) => normalizeKey(key) === target);
  return matchedKey ? row[matchedKey] : null;
};

const toNumber = (value) => {
  if (value === null || typeof value === "undefined" || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const getDateKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

export const filterRowsByDateRange = (rows, startDate, endDate) =>
  (Array.isArray(rows) ? rows : []).filter((row) => {
    const rawDate = getDashboardRowDate(row);
    if (!rawDate) return true;
    const rowDate = new Date(rawDate);
    if (Number.isNaN(rowDate.getTime())) return true;

    const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
    const end = endDate ? new Date(`${endDate}T23:59:59`) : null;
    return (!start || rowDate >= start) && (!end || rowDate <= end);
  });

const buildDaySeries = (rows, fieldName, startDate, endDate) => {
  const dates = filterRowsByDateRange(rows, startDate, endDate)
    .map((row) => getDateKey(getDashboardRowDate(row)))
    .filter(Boolean);

  const fallbackEnd = endDate || new Date().toISOString().slice(0, 10);
  const fallbackStart =
    startDate ||
    (() => {
      const date = new Date(`${fallbackEnd}T00:00:00`);
      date.setDate(date.getDate() - 6);
      return date.toISOString().slice(0, 10);
    })();

  const first = dates.length ? dates.sort()[0] : fallbackStart;
  const last = dates.length ? dates.sort()[dates.length - 1] : fallbackEnd;
  const days = [];
  const cursor = new Date(`${first}T00:00:00`);
  const lastDate = new Date(`${last}T00:00:00`);

  while (cursor <= lastDate && days.length < 31) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days.map((key) => {
    const rowsForDay = filterRowsByDateRange(rows, startDate, endDate).filter(
      (row) => getDateKey(getDashboardRowDate(row)) === key
    );
    const numericValues = rowsForDay
      .map((row) => toNumber(getDashboardFieldValue(row, fieldName)))
      .filter((value) => value !== null);
    const sum = numericValues.reduce((total, value) => total + value, 0);

    return {
      label: new Date(`${key}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      value: numericValues.length ? Number((sum / numericValues.length).toFixed(2)) : 0,
      count: rowsForDay.length,
    };
  });
};

export const buildFieldWidgetData = (widget, rows, startDate, endDate) => {
  const fieldName = widget?.input_field || widget?.field_name;
  const filteredRows = filterRowsByDateRange(rows, startDate, endDate);
  const numericValues = filteredRows
    .map((row) => toNumber(getDashboardFieldValue(row, fieldName)))
    .filter((value) => value !== null);
  const latestRow = [...filteredRows].reverse().find((row) => {
    const value = getDashboardFieldValue(row, fieldName);
    return value !== null && typeof value !== "undefined" && value !== "";
  });
  const latestValue = latestRow ? getDashboardFieldValue(latestRow, fieldName) : "-";
  const sum = numericValues.reduce((total, value) => total + value, 0);
  const average = numericValues.length ? Number((sum / numericValues.length).toFixed(2)) : 0;
  const max = numericValues.length ? Math.max(...numericValues) : 0;
  const min = numericValues.length ? Math.min(...numericValues) : 0;

  return {
    latestValue,
    average,
    max,
    min,
    count: filteredRows.length,
    series: buildDaySeries(filteredRows, fieldName, startDate, endDate),
  };
};

export const fetchRowsForDashboardWidget = async (widget) => {
  const endpoint =
    widget?.endpoint ||
    screenEndpoints?.[widget?.department]?.[widget?.sub_department]?.[
      widget?.input_screen || widget?.screen_name
    ];

  if (!endpoint) return [];

  const response = await apiConfig.get(
    endpoint,
    { page: 1, limit: 500 },
    { skipGlobalErrorModal: true }
  );

  return normalizeDashboardRows(response?.data);
};

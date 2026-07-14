import apiConfig from "@/apis/apiConfig";
import {
  getCardingProcessParameterEntries,
  fetchCardingUqcEntries,
  fetchCardingDfkPressureEntries,
  fetchCardingChangeControlEntries,
} from "@/apis/carding";

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
      "AFIS-6 Cotton Data Entry": "/mixing/afis6-cotton",
      "AFIS-6 MMF Data Entry": "/mixing/afis6-mmf",
      "Cotton HVI Data Entry": "/mixing/cotton-hvi",
      "Fibre Data Entry": "/mixing/fibre",
      "AFIS Data Entry": "/mixing/afis",
      "Moisture Data Entry": "/mixing/moisture",
      "Openness Data Entry": "/mixing/openness",
    },
    "Blow Room": {
      "Blow Room Sync": "/blowroom/sync",
      "Process Parameter": "/blowroom/header",
      "BR Waste Study T-1": "/blowroom/br-waste-study",
      "BR Waste Study T-2": "/blowroom/br-waste-study",
      "BR Waste Study T-3": "/blowroom/br-waste-study",
      "Drop Test Data Entry": "/blowroom/drop-test",
      "B/R CV1M Data Entry Within Lap": "/blowroom/within-lap-cv",
      "B/R Between Lap CV%": "/blowroom/between-lap-cv",
    },
    Carding: {
      "Process Parameter": "/carding/qc-header",
      "Between & Within Card Data Entry": "/carding/between-within-card",
    "Thick place & CV": "/carding/card-thick-place",
      "Carding NRE%": "/carding/nre",
      "Nati Data Entry": "/carding/nati-data-entry",
      "U% Data Entry": "/carding/uqc",
      "Card DFK Data": "/carding/dfk-pressure",
      "Card Waste Study T-1": "/carding/card-waste-study",
      "Card Waste Study T-2": "/carding/card-waste-study",
      "Card Waste Study T-3": "/carding/card-waste-study",
      "Wheel Change": "/carding/change-control",
    },
    "Individual Card Performance": {
      "Individual Card performance Data": "/carding/trials",
    },
    Comber: {
      "Ribbon Lap CV1M Data Entry": "/comber/lap-cv",
      "Nati Data Entry": "/comber/nati-data-entry",
      "U% Data Entry": "/comber/uqc",
      "Comber Nolis %": "/drawframe/comber-noil-percent",
      "Comber NRE%": "/comber/nre",
      "Comber Efficiency": "/comber/efficiency",
    },
    "Draw Frame": {
      "1 Yard / Half Yard CV Entry": "/drawframe/yarn-cv",
      "Draw Frame Cots Data Entry": "/drawframe/cots",
      "U% Data Entry": "/drawframe/uqc",
      "PP - Breaker Drawing": "/drawframe/header",
      "PP - Finisher Drawing": "/drawframe/finisher",
      "Wheel Change Type-1 (SB20)": "/drawframe/wheel-change/type1",
      "Wheel Change Type-2 (TD7)": "/drawframe/wheel-change/type2",
      "Wheel Change Type-3 (TD9)": "/drawframe/wheel-change/type3",
      "Wheel Change Type-1 (LRSB)": "/drawframe/wheel-change/finisher-type1-lrsb",
      "Wheel Change Type-2 (D40)": "/drawframe/wheel-change/type2-d40",
      "Wheel Change Type-3 (D50/D55)": "/drawframe/wheel-change/type3-d50-d55",
      "Wheel Change Type-4 (LDF3S)": "/drawframe/wheel-change/type4-ldf3s",
    },
    Simplex: {
      "Process Parameter": "/simplex/process_parameter",
      "SMXCots Change Data Entry": "/simplex/cots-change",
      "SMX Breaks Study Report": "/simplex/list",
      "U% Data Entry": "/simplex/uqc",
      "Wheel Change": "/simplex/wheel-change",
    },
    Spinning: {
      "Process Parameter": "/spinning/qc",
      "COTS Checking": "/spinning/cots-checking",
      "Count Change": "/spinning/count-change",
      "Ring Frame Log Book": "/spinning/ring-frame",
      "Speed Checking": "/spinning/speed-checking",
      "Lycra Missing": "/spinning/lycra-missing",
      "Bottom Apron Checking": "/spinning/bottom-apron-checking",
      "Lycra Out of Centering": "/spinning/lycra-centering",
      "RSM & Lycrasensor Checking Online": "/spinning/rsm-lycra-online",
      "RSM & Lycrasensor Checking Offline": "/spinning/rsm-lycra-offline",
      "Wheel Change": "/spinning/wheel-change",
    },
    Autoconer: {
      "Process Parameter": "/autoconer?type=Process%20Parameter",
      "PP - Autoconer Q2": "/autoconer?type=PP%20-%20Autoconer%20Q2",
      "PP - Autoconer Q3": "/autoconer?type=PP%20-%20Autoconer%20Q3",
      "Rewinding Study": "/autoconer/rewinding-study",
      "Cone Density": "/autoconer/cone-density",
      "Cone Packing Audit": "/autoconer/cone-packing-audit",
      "Lycra % Checking": "/autoconer/lycra-checking",
      "Count Wise Cuts Record": "/autoconer/count-wise-cuts",
      "Splice Strength": "/autoconer/splice-strength",
      "Drum wise Appearance": "/autoconer/drum-wise-appearance",
      "CSP Parameter Entries": "/autoconer/parameter-entries/pending-csp",
      "U% Parameter Entries": "/autoconer/parameter-entries/pending-quality",
    },
  },
};

const screenFetchers = {
  "Quality Control": {
    Carding: {
      "Process Parameter": getCardingProcessParameterEntries,
      "U% Data Entry": fetchCardingUqcEntries,
      "Card DFK Data": fetchCardingDfkPressureEntries,
      "Wheel Change": fetchCardingChangeControlEntries,
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
    if (Array.isArray(value)) {
      if (value.some(isRecordObject)) return flat;
      flat[flatKey] = value;
      return flat;
    }
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
    const maxLength = Math.max(...nestedArrays.map(([, value]) => value.length));

    return Array.from({ length: maxLength }, (_, index) =>
      nestedArrays.reduce(
        (merged, [, value]) => ({ ...merged, ...flattenRecord(value[index]) }),
        parent
      )
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

const BR_WASTE_STUDY_TYPE_BY_SCREEN = {
  "BR Waste Study T-1": "Type 1",
  "BR Waste Study T-2": "Type 2",
  "BR Waste Study T-3": "Type 3",
  "Card Waste Study T-1": "Type 1",
  "Card Waste Study T-2": "Type 2",
  "Card Waste Study T-3": "Type 3",
};

export const fetchRowsForDashboardWidget = async (widget) => {
  const screenName = widget?.input_screen || widget?.screen_name;
  const fetcher =
    screenFetchers?.[widget?.department]?.[widget?.sub_department]?.[screenName];
  const endpoint =
    widget?.endpoint ||
    screenEndpoints?.[widget?.department]?.[widget?.sub_department]?.[screenName];
  const brWasteStudyType = BR_WASTE_STUDY_TYPE_BY_SCREEN[screenName];

  if (fetcher) {
    const rows = normalizeDashboardRows(await fetcher({ page: 1, limit: 500 }));
    return brWasteStudyType
      ? rows.filter((row) => row?.study_type === brWasteStudyType)
      : rows;
  }

  const fallbackParams = {
    department: widget?.department,
    subDepartment: widget?.sub_department || widget?.subDepartment,
    sub_department: widget?.sub_department || widget?.subDepartment,
    reportType: widget?.input_screen || widget?.screen_name,
    report_type: widget?.input_screen || widget?.screen_name,
    input_screen: widget?.input_screen || widget?.screen_name,
    page: 1,
    limit: 500,
  };

  const fetchFallbackRows = async () => {
    if (!fallbackParams.department || !fallbackParams.subDepartment || !fallbackParams.reportType) return [];
    const response = await apiConfig.get(
      "/reports/general-report/data",
      fallbackParams,
      { skipGlobalErrorModal: true }
    );
    return normalizeDashboardRows(response?.data);
  };

  if (!endpoint) return fetchFallbackRows();

  try {
    const response = await apiConfig.get(
      endpoint,
      { page: 1, limit: 500 },
      { skipGlobalErrorModal: true }
    );

    const rows = normalizeDashboardRows(response?.data);
    return brWasteStudyType
      ? rows.filter((row) => row?.study_type === brWasteStudyType)
      : rows;
  } catch (error) {
    if (error?.response?.status === 404) {
      return fetchFallbackRows();
    }
    throw error;
  }
};

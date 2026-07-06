const isPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const toLookupKey = (key) => String(key || "").toLowerCase().replace(/[^a-z0-9%]+/g, "");

const stringifyValue = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim();
};

const TESTER_LABELS = ["Tester Name", "Tester", "User"];
const TESTER_STOP_LABELS = [
  "Total Test",
  "Number of Entries",
  "Std. Noils",
  "Noils",
  "Std. Stretch",
  "Stretch",
  "Standard A",
  "A%",
  "Remark",
  "Sample No",
  "Sliver Wt",
  "Noils Wt",
  "Test ID",
  "Count System",
  "Machine",
  "Length Unit",
  "Length",
  "Shift",
  "Process",
  "Date",
  "Average Weight",
  "Weight",
  "Range",
  "SD",
  "CV",
];
const TESTER_STOP_PATTERN = TESTER_STOP_LABELS.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

const cleanTesterValue = (value = "") => {
  let v = String(value || "").replace(/\s+/g, " ").trim();

  // Remove any trailing stop-label and optional colon/contents (existing behavior)
  v = v.replace(new RegExp(`\\s+\\b(?:${TESTER_STOP_PATTERN})\\b\\s*(?:[:\\-].*)?$`, "i"), "");

  // Remove common inline fragments like "Shift: Shift-1 Process" or "Shift-1 Process"
  // - remove any 'Shift' label with following tokens up to an optional 'Process'
  v = v.replace(/\bShift\b\s*[:\-]?\s*[^,;\n]+(?:\s*Process\b)?/gi, "");

  // Remove any stray 'Process' words left behind
  v = v.replace(/\bProcess\b/gi, "");

  return String(v || "").replace(/\s+/g, " ").trim();
};

export const getExactTesterValueFromRow = (row) =>
  String(row?.Tester ?? row?.tester ?? row?.tester_name ?? row?.testerName ?? "").replace(/\s+/g, " ").trim();

export const getTesterValueFromRow = (row) =>
  cleanTesterValue(row?.Tester ?? row?.tester ?? row?.tester_name ?? row?.testerName ?? "");

export const extractTesterFromText = (text = "") => {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return "";

  const patterns = [
    new RegExp(
      `(?:tester(?:\\s*name)?|user)\\s*[:\\-]?\\s*([A-Za-z][A-Za-z0-9 .,'/-]{1,80}?)(?=\\s+\\b(?:${TESTER_STOP_PATTERN})\\b\\s*(?:[:\\-]|$)|$)`,
      "i"
    ),
    new RegExp(
      `(?:tester(?:\\s*name)?|user)\\s*[:\\-]?\\s*([A-Za-z][A-Za-z0-9 .,'/-]{1,80}?)(?=\\s+(?:${TESTER_STOP_PATTERN})\\b|$)`,
      "i"
    ),
    /([A-Za-z][A-Za-z0-9 .,'/-]{1,80})\s*(?:tester(?:\s*name)?|user)\b/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    const value = cleanTesterValue(match?.[1] || "");
    if (value) return value;
  }

  return "";
};

const valueAfterLabel = (cells, label) => {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\s*${escapedLabel}\\s*(?:[:\\-]\\s*)?(.*)$`, "i");
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index];
    const match = String(cell || "").match(pattern);
    if (match) {
      const captured = cleanTesterValue(match[1] || "");
      if (captured) return captured;
      const nextValue = cells.slice(index + 1).find((item) => String(item || "").trim());
      if (nextValue) return cleanTesterValue(nextValue);
    }
  }
  return "";
};

const extractLabelValue = (text = "", labels = []) => {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return "";

  for (const label of labels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = source.match(new RegExp(`\\b${escapedLabel}\\b\\s*(?:[:\\-]\\s*)?(.+)$`, "i"));
    const value = cleanTesterValue(match?.[1] || "");
    if (value) return value;
  }

  return "";
};

const getLineText = (line) =>
  Array.isArray(line?.cells) ? line.cells.map(stringifyValue).join(" ").replace(/\s+/g, " ").trim() : "";

export const extractTesterFromLines = (lines = []) => {
  const flatLines = Array.isArray(lines) ? lines : [];
  const lineTexts = flatLines.map(getLineText).filter(Boolean);
  const allCells = flatLines.flatMap((line) => line?.cells || []);

  for (const label of TESTER_LABELS) {
    const lineValue = lineTexts.find((text) => {
      const value = extractLabelValue(text, [label]);
      return value;
    });
    if (lineValue) {
      const extracted = extractLabelValue(lineValue, [label]);
      if (extracted) return extracted;
    }

    const cellValue = valueAfterLabel(allCells, label);
    if (cellValue) return cellValue;
  }

  const headerFooterLines = [
    ...lineTexts.slice(0, 6),
    ...lineTexts.slice(-6),
  ];

  for (const text of headerFooterLines) {
    const value = extractTesterFromText(text);
    if (value) return value;
    const direct = extractLabelValue(text, TESTER_LABELS);
    if (direct) return direct;
  }

  for (let index = 0; index < lineTexts.length; index += 1) {
    const text = lineTexts[index];
    if (!/(tester(?:\s*name)?|user)/i.test(text)) continue;

    const directValue = extractLabelValue(text, TESTER_LABELS);
    if (directValue) return directValue;

    const nextLine = lineTexts[index + 1] || "";
    if (nextLine && !/(total test|number of entries|std\.?|noils|sample no|sliver wt|remark)/i.test(nextLine)) {
      return cleanTesterValue(nextLine);
    }
  }

  return "";
};

export const mergeTesterIntoRows = (rows = [], tester = "") => {
  if (!tester) return rows;

  let patched = false;
  let sawMetaRow = false;
  const nextRows = rows.map((row) => {
    if (!isPlainObject(row)) return row;
    const rowType = String(row["Row Type"] || row.row_type || row.type || "").trim().toLowerCase();
    const isMetaRow =
      rowType === "meta" ||
      (!rowType && !String(row["Sample No"] || row["Sample No."] || row["Label"] || "").trim());
    if (isMetaRow) sawMetaRow = true;
    if (!isMetaRow || getTesterValueFromRow(row)) return row;

    patched = true;
    const existingKey = Object.keys(row).find((key) => toLookupKey(key) === toLookupKey("Tester"));
    return {
      ...row,
      [existingKey || "Tester"]: tester,
    };
  });

  if (patched) return nextRows;

  if (!sawMetaRow) {
    return [{ "Row Type": "Meta", Tester: tester }, ...rows];
  }

  return rows.map((row, index) => {
    if (index !== 0 || !isPlainObject(row) || getTesterValueFromRow(row)) return row;
    return { ...row, Tester: tester };
  });
};

export const getFieldValueFromRow = (row, aliases = []) => {
  for (const alias of aliases) {
    const value = stringifyValue(row?.[alias]);
    if (value) return value;
  }
  return "";
};

export const mergeFieldIntoRows = (rows = [], fieldName = "", value = "", aliases = [fieldName]) => {
  if (!value) return rows;

  let patched = false;
  let sawMetaRow = false;
  const nextRows = rows.map((row) => {
    if (!isPlainObject(row)) return row;
    const rowType = String(row["Row Type"] || row.row_type || row.type || "").trim().toLowerCase();
    const isMetaRow =
      rowType === "meta" ||
      (!rowType && !String(row["Sample No"] || row["Sample No."] || row["Label"] || "").trim());
    if (isMetaRow) sawMetaRow = true;
    if (!isMetaRow || getFieldValueFromRow(row, aliases)) return row;

    patched = true;
    const existingKey = Object.keys(row).find((key) => toLookupKey(key) === toLookupKey(fieldName));
    return {
      ...row,
      [existingKey || fieldName]: value,
    };
  });

  if (patched) return nextRows;

  if (!sawMetaRow) {
    return [{ "Row Type": "Meta", [fieldName]: value }, ...rows];
  }

  return rows.map((row, index) => {
    if (index !== 0 || !isPlainObject(row) || getFieldValueFromRow(row, aliases)) return row;
    return { ...row, [fieldName]: value };
  });
};

export const getTesterFromResult = (result = {}) =>
  extractTesterFromText(result?.raw_text || result?.text || "") ||
  extractTesterFromLines(result?.raw_lines || result?.lines || []);

export const getExactTesterFromResult = (result = {}) =>
  String(result?.meta?.tester ?? result?.Tester ?? result?.tester ?? "").replace(/\s+/g, " ").trim();

/**
 * Comprehensive tester extraction from OCR result with multiple fallback sources
 * Priority: structured rows → extracted text → raw text parsing
 */
export const getTesterFromOcrResult = (result = {}, structuredRows = []) => {
  // 1. Try to get tester from structured rows (preferred)
  for (const row of structuredRows) {
    if (!isPlainObject(row)) continue;
    const testerValue = getTesterValueFromRow(row);
    if (testerValue) return testerValue;
  }

  // 2. Try extracting from raw text with patterns
  const rawText = result?.raw_text || result?.text || "";
  if (rawText) {
    const extractedTester = extractTesterFromText(rawText);
    if (extractedTester) return extractedTester;
  }

  // 3. Try from parsed lines (for PDF header/footer extraction)
  if (result?.raw_lines || result?.lines) {
    const testerFromLines = extractTesterFromLines(result?.raw_lines || result?.lines);
    if (testerFromLines) return testerFromLines;
  }

  return "";
};

/**
 * Backfill tester value into rows from multiple sources with fallback
 * Ensures Meta row has tester value for display
 */
export const backfillTesterInRows = (rows = [], result = {}) => {
  const tester = getTesterFromOcrResult(result, rows);
  if (!tester) return rows;

  return mergeTesterIntoRows(rows, tester);
};

/**
 * Backfill tester into meta object from OCR result with comprehensive extraction
 */
export const backfillTesterInMeta = (meta = {}, result = {}, rawText = "") => {
  if (meta?.tester) return meta;

  const tester = getTesterFromOcrResult(result, []) || 
                 extractTesterFromText(rawText);
  
  return tester ? { ...meta, tester } : meta;
};

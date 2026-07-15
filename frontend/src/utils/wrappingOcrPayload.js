import { normalizeOcrDisplayRow, normalizeOcrDisplayValue } from "@/utils/ocrDisplayValues";

const isPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const toLookupKey = (key) => String(key || "").toLowerCase().replace(/[^a-z0-9%]+/g, "");

const FIELD_ALIASES = {
  "Row Type": ["Row Type", "row_type", "type", "Type"],
  "Table No": ["Table No", "Table No.", "Table Number", "table_no"],
  "Label": ["Label", "Summary", "Metric"],
  "Test ID": ["Test ID", "Test Id", "test_id"],
  "Total Test": ["Total Test", "Total Tests", "total_test"],
  "Number of Entries (N)": ["Number of Entries (N)", "Number of Entries", "Entries", "N", "number_of_entries"],
  "Length": ["Length", "length"],
  "Tester": ["Tester", "Tester Name", "tester", "tester_name", "testerName", "user", "User"],
  "Std. Noils %": ["Std. Noils %", "Std Noils %", "Std. Nolis %", "Standard Noils %", "std_noils_percent"],
  "Noils %": ["Noils %", "Nolis %", "noils_percent"],
  "Sample No": ["Sample No", "Sample No.", "Sample Number", "sample_no"],
  "Sliver Wt": ["Sliver Wt", "Sliver Weight", "sliver_wt"],
  "Noils Wt": ["Noils Wt", "Noils Weight", "Nolis Wt", "noils_wt"],
  "Std. Stretch %": ["Std. Stretch %", "Std Stretch %", "Standard Stretch %", "std_stretch_percent"],
  "Stretch %": ["Stretch %", "stretch_percent"],
  "Remark": ["Remark", "Remarks", "remark"],
  "Initial Bobbin": ["Initial Bobbin", "Initial Bobbin Wt", "Initial Bobbin Weight", "initial_bobbin"],
  "Full Bobbin": ["Full Bobbin", "Full Bobbin Wt", "Full Bobbin Weight", "full_bobbin"],
};

export const getWrappingOcrValue = (row, field) => {
  if (!isPlainObject(row)) return "";
  const wanted = (FIELD_ALIASES[field] || [field]).map(toLookupKey);
  const key = Object.keys(row).find((item) => wanted.includes(toLookupKey(item)));
  return key ? normalizeOcrDisplayValue(row[key]) : "";
};

export const inferWrappingOcrRowType = (row) => {
  const explicit = getWrappingOcrValue(row, "Row Type").toLowerCase();
  if (explicit === "meta" || explicit === "sample" || explicit === "summary") return explicit;
  if (getWrappingOcrValue(row, "Sample No")) return "sample";
  if (getWrappingOcrValue(row, "Label")) return "summary";
  const hasMetaValue = [
    "Test ID",
    "Total Test",
    "Number of Entries (N)",
    "Length",
    "Tester",
    "Std. Noils %",
    "Noils %",
    "Std. Stretch %",
    "Stretch %",
    "Remark",
  ].some((field) => getWrappingOcrValue(row, field));
  return hasMetaValue ? "meta" : "";
};

export const groupWrappingOcrRowsByTable = (rows = []) =>
  rows.reduce((acc, row) => {
    const tableNo = getWrappingOcrValue(row, "Table No") || "1";
    if (!acc[tableNo]) acc[tableNo] = [];
    acc[tableNo].push(row);
    return acc;
  }, {});

const stripInternalRowFields = (row = {}) => {
  if (!isPlainObject(row)) return row;
  return Object.entries(normalizeOcrDisplayRow(row)).reduce((acc, [key, value]) => {
    if (key.startsWith("__")) return acc;
    acc[key] = value;
    return acc;
  }, {});
};

const normalizedRows = (rows = []) =>
  rows.filter(isPlainObject).map((row) => stripInternalRowFields(row));

const buildMeta = (row = {}) => ({
  table_no: getWrappingOcrValue(row, "Table No"),
  test_id: getWrappingOcrValue(row, "Test ID"),
  total_test: getWrappingOcrValue(row, "Total Test"),
  number_of_entries: getWrappingOcrValue(row, "Number of Entries (N)"),
  length: getWrappingOcrValue(row, "Length"),
  tester: getWrappingOcrValue(row, "Tester"),
  std_noils_percent: getWrappingOcrValue(row, "Std. Noils %"),
  noils_percent: getWrappingOcrValue(row, "Noils %"),
  std_stretch_percent: getWrappingOcrValue(row, "Std. Stretch %"),
  stretch_percent: getWrappingOcrValue(row, "Stretch %"),
  remark: getWrappingOcrValue(row, "Remark"),
});

const stripEmpty = (value) =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== ""));

const buildNoilsSample = (row) =>
  stripEmpty({
    sample_no: getWrappingOcrValue(row, "Sample No"),
    sliver_wt: getWrappingOcrValue(row, "Sliver Wt"),
    noils_wt: getWrappingOcrValue(row, "Noils Wt"),
    noils_percent: getWrappingOcrValue(row, "Noils %"),
  });

const buildNoilsSummary = (row) =>
  stripEmpty({
    label: getWrappingOcrValue(row, "Label"),
    sliver_wt: getWrappingOcrValue(row, "Sliver Wt"),
    noils_wt: getWrappingOcrValue(row, "Noils Wt"),
    noils_percent: getWrappingOcrValue(row, "Noils %"),
  });

const buildStretchSample = (row) =>
  stripEmpty({
    sample_no: getWrappingOcrValue(row, "Sample No"),
    initial_bobbin: getWrappingOcrValue(row, "Initial Bobbin"),
    full_bobbin: getWrappingOcrValue(row, "Full Bobbin"),
  });

const buildStretchSummary = (row) =>
  stripEmpty({
    label: getWrappingOcrValue(row, "Label"),
    initial_bobbin: getWrappingOcrValue(row, "Initial Bobbin"),
    full_bobbin: getWrappingOcrValue(row, "Full Bobbin"),
  });

export const buildWrappingOcrPayload = ({
  docType = "",
  entryId = "",
  file = null,
  rows = [],
  selectedType = "",
} = {}) => {
  const normalizedDocType = String(docType || "").trim().toLowerCase();
  const cleanRows = normalizedRows(rows);
  const metaRows = cleanRows.filter((row) => inferWrappingOcrRowType(row) === "meta");
  const sampleRows = cleanRows.filter((row) => inferWrappingOcrRowType(row) === "sample");
  const summaryRows = cleanRows.filter((row) => inferWrappingOcrRowType(row) === "summary");
  const firstMeta = buildMeta(metaRows[0] || {});
  const isNoils = normalizedDocType === "noils" || normalizedDocType === "noil";
  const tables =
    normalizedDocType === "strech" || normalizedDocType === "stretch"
      ? Object.entries(groupWrappingOcrRowsByTable(cleanRows)).map(([tableNo, tableRows]) => {
          const tableMeta = buildMeta(tableRows.find((row) => inferWrappingOcrRowType(row) === "meta") || {});
          return stripEmpty({
            table_no: tableNo,
            ...tableMeta,
            samples: tableRows.filter((row) => inferWrappingOcrRowType(row) === "sample").map(buildStretchSample),
            summaries: tableRows.filter((row) => inferWrappingOcrRowType(row) === "summary").map(buildStretchSummary),
          });
        })
      : [];

  return stripEmpty({
    entry_id: entryId,
    entry_type: selectedType,
    doc_type: normalizedDocType,
    report_type: normalizedDocType,
    filename: file?.name || "",
    pdf_file: file?.name || "",
    ...firstMeta,
    ocr_json: cleanRows,
    manual_json: cleanRows,
    rows: cleanRows,
    meta: stripEmpty(firstMeta),
    samples: isNoils ? sampleRows.map(buildNoilsSample) : sampleRows.map(buildStretchSample),
    summaries: isNoils ? summaryRows.map(buildNoilsSummary) : summaryRows.map(buildStretchSummary),
    tables,
  });
};

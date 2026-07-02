import { useMemo, useRef, useState } from "react";
import { FiFile, FiRefreshCw, FiUpload } from "react-icons/fi";

import { runOcrJsonForDocument } from "@/apis/ocrApi";
import { normalizeOcrDisplayRow, normalizeOcrDisplayValue } from "@/utils/ocrDisplayValues";

const normalizeCell = (value) => {
  return normalizeOcrDisplayValue(value);
};

const stringifyCell = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim();
};

const isPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const toLookupKey = (key) => String(key || "").toLowerCase().replace(/[^a-z0-9%]+/g, "");

const getValue = (row, aliases) => {
  if (!isPlainObject(row)) return "";
  const wanted = aliases.map(toLookupKey);
  const key = Object.keys(row).find((item) => wanted.includes(toLookupKey(item)));
  return key ? stringifyCell(row[key]) : "";
};

const setCanonicalValue = (row, field, value) => {
  const aliases = FIELD_ALIASES[field] || [field];
  const wanted = aliases.map(toLookupKey);
  const existingKey = Object.keys(row).find((item) => wanted.includes(toLookupKey(item)));
  return {
    ...row,
    [existingKey || field]: value,
  };
};

const rowsFromArrayTable = (table = []) => {
  if (!Array.isArray(table) || !table.length) return [];
  if (table.every(isPlainObject)) return table;

  const arrayRows = table.filter(Array.isArray);
  if (!arrayRows.length) return [];

  const headers = arrayRows[0].map(normalizeCell).map((header, index) => header || `Column ${index + 1}`);
  return arrayRows
    .slice(1)
    .map((row) =>
      headers.reduce((acc, header, index) => {
        acc[header] = normalizeCell(row[index]);
        return acc;
      }, {})
    )
    .filter((row) => Object.values(row).some(Boolean));
};

const KNOWN_FIELDS = [
  "Row Type",
  "Table No",
  "Label",
  "Sample No",
  "Sliver Wt",
  "Noils Wt",
  "Noils %",
  "Initial Bobbin",
  "Full Bobbin",
  "Test ID",
  "Total Test",
  "Number of Entries (N)",
  "Length",
  "Tester",
  "Std. Noils %",
  "Std. Stretch %",
  "Stretch %",
  "Remark",
];

const hasKnownField = (row) => KNOWN_FIELDS.some((field) => getValue(row, FIELD_ALIASES[field] || [field]));

const hasNestedRowContainer = (value) =>
  isPlainObject(value) && ["rows", "data", "table", "tables"].some((key) => Array.isArray(value[key]));

const collectRows = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    const directRows = rowsFromArrayTable(value);
    if (directRows.length && directRows.some(hasKnownField) && !directRows.some(hasNestedRowContainer)) return directRows;
    return value.flatMap((item) => collectRows(item));
  }
  if (!isPlainObject(value)) return [];
  if (hasNestedRowContainer(value)) {
    return [value.rows, value.data, value.table, value.tables].flatMap((item) => collectRows(item));
  }
  if (hasKnownField(value)) return [value];
  return Object.values(value).flatMap((item) => collectRows(item));
};

const getOcrTableRows = (result = {}) => {
  const rowSources = [
    result.raw_tables,
    result.extracted_tables,
    result.data,
    result.json_output,
    result.result?.raw_tables,
    result.result?.extracted_tables,
    result.result?.data,
    result.result?.json_output,
  ];

  const firstNonEmptySource = rowSources.find((source) => Array.isArray(source) && source.length);
  return firstNonEmptySource ? collectRows(firstNonEmptySource) : [];
};

const hasSourceRows = (value) => {
  if (!value) return false;
  if (Array.isArray(value)) {
    return value.length > 0 && (value.some(isPlainObject) || value.some(Array.isArray) || value.some(hasSourceRows));
  }
  if (!isPlainObject(value)) return false;
  return [value.rows, value.data, value.table, value.tables].some(hasSourceRows);
};

const hasOcrResponseRows = (result = {}) => {
  const rowSources = [
    result.raw_tables,
    result.extracted_tables,
    result.data,
    result.json_output,
    result.result?.raw_tables,
    result.result?.extracted_tables,
    result.result?.data,
    result.result?.json_output,
  ];

  return rowSources.some(hasSourceRows);
};

const FIELD_ALIASES = {
  "Row Type": ["Row Type", "row_type", "type", "Type"],
  "Label": ["Label", "Summary", "Metric"],
  "Sample No": ["Sample No", "Sample No.", "Sample Number"],
  "Sliver Wt": ["Sliver Wt", "Sliver Weight"],
  "Noils Wt": ["Noils Wt", "Noils Weight", "Nolis Wt"],
  "Noils %": ["Noils %", "Nolis %"],
  "Initial Bobbin": ["Initial Bobbin", "Initial Bobbin Wt", "Initial Bobbin Weight"],
  "Full Bobbin": ["Full Bobbin", "Full Bobbin Wt", "Full Bobbin Weight"],
  "Table No": ["Table No", "Table No.", "Table Number"],
  "Test ID": ["Test ID", "Test Id"],
  "Total Test": ["Total Test", "Total Tests"],
  "Number of Entries (N)": ["Number of Entries (N)", "Number of Entries", "N"],
  "Length": ["Length"],
  "Tester": ["Tester", "Tester Name", "tester", "tester_name", "User"],
  "Std. Noils %": ["Std. Noils %", "Std Noils %", "Std. Nolis %", "std_noils_percent"],
  "Std. Stretch %": ["Std. Stretch %", "Std Stretch %", "std_stretch_percent"],
  "Stretch %": ["Stretch %", "stretch_percent"],
  "Remark": ["Remark", "Remarks", "remark"],
};

const getField = (row, field) => getValue(row, FIELD_ALIASES[field] || [field]);

const inferRowKind = (row) => {
  const explicit = getField(row, "Row Type").toLowerCase();
  if (explicit === "meta" || explicit === "sample" || explicit === "summary") return explicit;
  if (getField(row, "Sample No")) return "sample";
  if (getField(row, "Label")) return "summary";
  const hasMetaValue = [
    "Test ID",
    "Total Test",
    "Number of Entries (N)",
    "Length",
    "Tester",
    "Std. Noils %",
    "Std. Stretch %",
    "Stretch %",
    "Remark",
  ].some((field) => getField(row, field));
  if (hasMetaValue) return "meta";
  return "";
};

const rowKindIs = (row, type) => inferRowKind(row) === type.toLowerCase();

const isRenderableOcrRow = (row) => ["meta", "sample", "summary"].includes(inferRowKind(row));

const groupByTableNo = (rows) =>
  rows.reduce((acc, row) => {
    const tableNo = getField(row, "Table No") || "1";
    if (!acc[tableNo]) acc[tableNo] = [];
    acc[tableNo].push(row);
    return acc;
  }, {});

const REPORT_CONFIG = {
  noils: {
    title: "Comber Noils",
    docType: "noils",
    sampleColumns: ["Sample No", "Sliver Wt", "Noils Wt", "Noils %"],
    summaryColumns: ["Label", "Sliver Wt", "Noils Wt", "Noils %"],
    metaFields: ["Total Test", "Number of Entries (N)", "Tester", "Std. Noils %", "Noils %"],
  },
  strech: {
    title: "Stretch",
    docType: "strech",
    sampleColumns: ["Sample No", "Initial Bobbin", "Full Bobbin"],
    summaryColumns: ["Label", "Initial Bobbin", "Full Bobbin"],
    metaFields: ["Table No", "Test ID", "Total Test", "Number of Entries (N)", "Length", "Tester", "Std. Stretch %", "Stretch %", "Remark"],
  },
};

const prepareRows = (rows, config, reportType) => {
  const prepared = rows
    .filter((row) => isPlainObject(row))
    .filter(isRenderableOcrRow)
    .map((row, index) => ({
      ...normalizeOcrDisplayRow(row),
      __ocrRowId: row.__ocrRowId || `ocr-row-${index}`,
    }));

  if (reportType === "strech") {
    const groups = groupByTableNo(prepared);
    Object.entries(groups).forEach(([tableNo, groupRows]) => {
      if (!groupRows.some((row) => rowKindIs(row, "Meta"))) {
        prepared.push({
          __ocrRowId: `ocr-meta-${tableNo}`,
          "Row Type": "Meta",
          "Table No": tableNo,
        });
      }
    });
  } else if (!prepared.some((row) => rowKindIs(row, "Meta"))) {
    prepared.unshift({
      __ocrRowId: "ocr-meta",
      "Row Type": "Meta",
    });
  }

  return prepared;
};

function FieldInput({ value, onChange, readOnly = false }) {
  return (
    <input
      readOnly={readOnly}
      value={stringifyCell(value)}
      onChange={(event) => onChange?.(event.target.value)}
      style={{ width: "100%", height: 34, border: "1px solid #dbe3ef", borderRadius: 6, padding: "0 9px", color: "#111827", background: readOnly ? "#f8fafc" : "#fff", boxSizing: "border-box" }}
    />
  );
}

function MetaFields({ rows, fields, onCellChange }) {
  const metaRow = rows.find((row) => rowKindIs(row, "Meta")) || rows[0] || {};
  return (
    <section style={{ border: "1px solid #dbe3ef", borderRadius: 8, background: "#fff", padding: 14 }}>
      <div style={{ fontWeight: 800, color: "#111827", marginBottom: 12 }}>Meta</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        {fields.map((field) => (
          <label key={field} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>{field}</span>
            <FieldInput value={getField(metaRow, field)} onChange={(value) => onCellChange(metaRow.__ocrRowId, field, value)} />
          </label>
        ))}
      </div>
    </section>
  );
}

function DataTable({ title, rows, columns, onCellChange }) {
  return (
    <section style={{ border: "1px solid #dbe3ef", borderRadius: 8, background: "#fff", overflowX: "auto" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid #e5eaf1", fontWeight: 800, color: "#111827" }}>
        {title}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: columns.length * 150 }}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} style={{ textAlign: "left", padding: "10px 12px", color: "#334155", fontSize: 12, borderBottom: "1px solid #dbe3ef" }}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => (
                <td key={column} style={{ padding: "9px 12px", borderBottom: "1px solid #edf2f7", color: "#0f172a", fontSize: 13 }}>
                  <FieldInput value={getField(row, column)} onChange={(value) => onCellChange(row.__ocrRowId, column, value)} />
                </td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length} style={{ padding: 14, color: "#64748b", fontSize: 13 }}>
                No rows found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

export default function OcrMachineJsonScreen({ reportType }) {
  const config = REPORT_CONFIG[reportType] || REPORT_CONFIG.noils;
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [allRows, setAllRows] = useState([]);

  const sampleRows = useMemo(
    () => allRows.filter((row) => rowKindIs(row, "Sample")),
    [allRows, config.sampleColumns]
  );
  const summaryRows = useMemo(
    () => allRows.filter((row) => rowKindIs(row, "Summary")),
    [allRows, config.summaryColumns]
  );
  const stretchGroups = useMemo(() => groupByTableNo(allRows), [allRows]);

  const handleCellChange = (rowId, field, value) => {
    setAllRows((current) =>
      current.map((row) => (row.__ocrRowId === rowId ? setCanonicalValue(row, field, value) : row))
    );
  };

  const clear = () => {
    setFile(null);
    setMessage("");
    setIsError(false);
    setAllRows([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleRunOcr = async () => {
    if (!file || isRunning) return;
    setIsRunning(true);
    setMessage(`Running ${config.title} OCR...`);
    setIsError(false);
    setAllRows([]);
    try {
      const result = await runOcrJsonForDocument({ file, docType: config.docType });
      const extractedRows = getOcrTableRows(result);
      const nextRows = extractedRows.length ? prepareRows(extractedRows, config, reportType) : [];
      const responseHasRows = hasOcrResponseRows(result);
      setAllRows(nextRows);
      setMessage(
        nextRows.length
          ? "OCR completed. Extracted values are ready."
          : responseHasRows
            ? "OCR completed. Rows were returned, but none were marked Meta, Sample, or Summary."
            : "OCR completed, but no OCR table rows were returned."
      );
      setIsError(!responseHasRows);
    } catch (error) {
      setMessage(error?.message || "OCR failed. Please try again.");
      setIsError(true);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f6f7f9", padding: "28px 32px 32px", boxSizing: "border-box" }}>
      <main style={{ width: "100%", maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <h1 style={{ margin: 0, color: "#111827", fontSize: 26, lineHeight: 1.2, fontWeight: 800 }}>
          {config.title} OCR
        </h1>

        {!allRows.length ? (
          <section style={{ minHeight: 258, border: "1px solid #dbe3ef", borderRadius: 8, background: "#fff", display: "grid", placeItems: "center", textAlign: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <FiFile style={{ color: "#9ca3af", fontSize: 36, marginBottom: 18 }} />
              <div style={{ color: "#111827", fontSize: 15, fontWeight: 800, marginBottom: 28 }}>
                {file ? file.name : "Select the Report PDF"}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                {!file ? (
                  <button type="button" onClick={() => inputRef.current?.click()} style={primaryButtonStyle}>
                    <FiUpload />
                    Browse File
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={clear} disabled={isRunning} style={secondaryButtonStyle}>
                      Cancel
                    </button>
                    <button type="button" onClick={handleRunOcr} disabled={isRunning} style={{ ...primaryButtonStyle, background: isRunning ? "#94a3b8" : "#3D539F" }}>
                      <FiRefreshCw />
                      {isRunning ? "Running..." : "Run OCR"}
                    </button>
                  </>
                )}
              </div>
              <input ref={inputRef} hidden type="file" accept=".pdf,application/pdf" onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setAllRows([]);
                setMessage("");
                setIsError(false);
              }} />
            </div>
          </section>
        ) : null}

        {allRows.length ? (
          <>
            {reportType === "strech" ? (
              Object.entries(stretchGroups).map(([tableNo, groupRows]) => (
                <div key={tableNo} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <MetaFields rows={groupRows} fields={config.metaFields} onCellChange={handleCellChange} />
                  <DataTable title={`Table ${tableNo} - Sample Rows`} rows={groupRows.filter((row) => rowKindIs(row, "Sample"))} columns={config.sampleColumns} onCellChange={handleCellChange} />
                  <DataTable title={`Table ${tableNo} - Summary Rows`} rows={groupRows.filter((row) => rowKindIs(row, "Summary"))} columns={config.summaryColumns} onCellChange={handleCellChange} />
                </div>
              ))
            ) : (
              <>
                <MetaFields rows={allRows} fields={config.metaFields} onCellChange={handleCellChange} />
                <DataTable title="Sample Rows" rows={sampleRows} columns={config.sampleColumns} onCellChange={handleCellChange} />
                <DataTable title="Summary Rows" rows={summaryRows} columns={config.summaryColumns} onCellChange={handleCellChange} />
              </>
            )}

            <div>
              <button type="button" onClick={clear} style={secondaryButtonStyle}>Clear</button>
            </div>
          </>
        ) : null}

        {message ? (
          <div style={{ color: isError ? "#b91c1c" : "#166534", fontSize: 13, fontWeight: 700 }}>
            {message}
          </div>
        ) : null}
      </main>
    </div>
  );
}

const primaryButtonStyle = {
  border: 0,
  borderRadius: 7,
  background: "#3D539F",
  color: "#fff",
  minWidth: 130,
  height: 42,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
};

const secondaryButtonStyle = {
  border: "1px solid #dbe3ef",
  borderRadius: 7,
  background: "#fff",
  color: "#334155",
  minWidth: 110,
  height: 42,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { MdInsertDriveFile } from "react-icons/md";

import { submitWrappingOcrPercentInspection } from "@/apis/draw-frame";
import { runOcrForDocument, runOcrJsonForDocument } from "@/apis/ocrApi";
import styles from "@/styles/draw-frame.module.css";
import { normalizeOcrDisplayRow, normalizeOcrDisplayValue } from "@/utils/ocrDisplayValues";
import { buildWrappingOcrPayload } from "@/utils/wrappingOcrPayload";

const isPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const normalizeCell = (value) => {
  return normalizeOcrDisplayValue(value);
};

const toLookupKey = (key) => String(key || "").toLowerCase().replace(/[^a-z0-9%]+/g, "");

const FIELD_ALIASES = {
  "Row Type": ["Row Type", "row_type", "type", "Type"],
  "Table No": ["Table No", "Table No.", "Table Number", "table_no"],
  "Label": ["Label", "Summary", "Metric"],
  "Test ID": ["Test ID", "Test Id", "test_id"],
  "Total Test": ["Total Test", "Total Tests", "total_test"],
  "Number of Entries (N)": ["Number of Entries (N)", "Number of Entries", "Entries", "N"],
  "Length": ["Length"],
  "Tester": ["Tester", "Tester Name", "tester", "tester_name", "User"],
  "Std. Noils %": ["Std. Noils %", "Std Noils %", "Std. Nolis %", "Standard Noils %", "std_noils_percent"],
  "Noils %": ["Noils %", "Nolis %", "noils_percent"],
  "Sample No": ["Sample No", "Sample No.", "Sample Number", "sample_no"],
  "Sliver Wt": ["Sliver Wt", "Sliver Weight", "sliver_wt"],
  "Noils Wt": ["Noils Wt", "Noils Weight", "Nolis Wt", "noils_wt"],
  "Std. Stretch %": ["Std. Stretch %", "Std Stretch %", "Standard Stretch %", "std_stretch_percent"],
  "Stretch %": ["Stretch %", "stretch_percent"],
  "Remark": ["Remark", "Remarks", "remark"],
  "Initial Bobbin": ["Initial Bobbin", "Initial Bobbin Wt", "Initial Bobbin Weight"],
  "Full Bobbin": ["Full Bobbin", "Full Bobbin Wt", "Full Bobbin Weight"],
};

const OCR_DOC_COLUMNS = {
  noils: [
    "Row Type",
    "Table No",
    "Label",
    "Total Test",
    "Number of Entries (N)",
    "Tester",
    "Std. Noils %",
    "Noils %",
    "Sample No",
    "Sliver Wt",
    "Noils Wt",
  ],
  strech: [
    "Row Type",
    "Table No",
    "Label",
    "Test ID",
    "Total Test",
    "Number of Entries (N)",
    "Length",
    "Tester",
    "Std. Stretch %",
    "Stretch %",
    "Remark",
    "Sample No",
    "Initial Bobbin",
    "Full Bobbin",
  ],
};

const getAliasedValue = (row, field) => {
  if (!isPlainObject(row)) return "";
  const wanted = (FIELD_ALIASES[field] || [field]).map(toLookupKey);
  const key = Object.keys(row).find((item) => wanted.includes(toLookupKey(item)));
  return key ? normalizeCell(row[key]) : "";
};

const inferRowType = (row) => {
  const explicit = getAliasedValue(row, "Row Type").toLowerCase();
  if (explicit === "meta" || explicit === "sample" || explicit === "summary") return explicit[0].toUpperCase() + explicit.slice(1);
  if (getAliasedValue(row, "Sample No")) return "Sample";
  if (getAliasedValue(row, "Label")) return "Summary";
  if (
    [
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
    ].some((field) => getAliasedValue(row, field))
  ) {
    return "Meta";
  }
  return "";
};

const OCR_REPORT_CONFIG = {
  noils: {
    sampleColumns: ["Sample No", "Sliver Wt", "Noils Wt", "Noils %"],
    summaryColumns: ["Label", "Sliver Wt", "Noils Wt", "Noils %"],
    metaFields: ["Total Test", "Number of Entries (N)", "Tester", "Std. Noils %", "Noils %"],
  },
  strech: {
    sampleColumns: ["Sample No", "Initial Bobbin", "Full Bobbin"],
    summaryColumns: ["Label", "Initial Bobbin", "Full Bobbin"],
    metaFields: ["Table No", "Test ID", "Total Test", "Number of Entries (N)", "Length", "Tester", "Std. Stretch %", "Stretch %", "Remark"],
  },
};

const rowKindIs = (row, type) => inferRowType(row).toLowerCase() === type.toLowerCase();

const isRenderableOcrRow = (row) => ["Meta", "Sample", "Summary"].includes(inferRowType(row));

const groupByTableNo = (items) =>
  items.reduce((acc, row) => {
    const tableNo = getAliasedValue(row, "Table No") || "1";
    if (!acc[tableNo]) acc[tableNo] = [];
    acc[tableNo].push(row);
    return acc;
  }, {});

const setCanonicalValue = (row, field, value) => {
  const wanted = (FIELD_ALIASES[field] || [field]).map(toLookupKey);
  const existingKey = Object.keys(row).find((key) => wanted.includes(toLookupKey(key)));
  return {
    ...row,
    [existingKey || field]: value,
  };
};

const prepareOcrRows = (sourceRows = [], docType) => {
  const prepared = sourceRows
    .filter(isPlainObject)
    .filter(isRenderableOcrRow)
    .map((row, index) => ({
      ...normalizeOcrDisplayRow(row),
      __ocrRowId: row.__ocrRowId || `ocr-row-${index}`,
    }));

  if (!prepared.length) return [];

  if (docType === "strech") {
    const groups = groupByTableNo(prepared);
    Object.entries(groups).forEach(([tableNo, groupRows]) => {
      if (!groupRows.some((row) => rowKindIs(row, "Meta"))) {
        prepared.unshift({
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

const buildOcrPreviewItems = ({ docType, file, rows = [], config }) => {
  const items = [
    { label: "PDF File", value: file?.name || "-" },
    { label: "OCR Rows", value: rows.length ? String(rows.length) : "-" },
  ];
  const addValue = (label, value) => {
    items.push({ label, value: value || "-" });
  };
  const addMetaValues = (metaRow, prefix = "") => {
    config.metaFields.forEach((field) => {
      if (field === "Table No" && prefix) return;
      addValue(`${prefix}${field}`, getAliasedValue(metaRow, field));
    });
  };
  const addRowValues = (row, rowLabel, columns) => {
    columns.forEach((field) => {
      addValue(`${rowLabel} - ${field}`, getAliasedValue(row, field));
    });
  };

  if (docType === "strech") {
    Object.entries(groupByTableNo(rows)).forEach(([tableNo, groupRows]) => {
      const metaRow = groupRows.find((row) => rowKindIs(row, "Meta")) || {};
      addMetaValues(metaRow, `Table ${tableNo} `);
      groupRows.filter((row) => rowKindIs(row, "Sample")).forEach((row, index) => {
        const sampleNo = getAliasedValue(row, "Sample No") || String(index + 1);
        addRowValues(row, `Table ${tableNo} Sample ${sampleNo}`, config.sampleColumns);
      });
      groupRows.filter((row) => rowKindIs(row, "Summary")).forEach((row, index) => {
        const label = getAliasedValue(row, "Label") || String(index + 1);
        addRowValues(row, `Table ${tableNo} Summary ${label}`, config.summaryColumns);
      });
    });
    return items;
  }

  const metaRow = rows.find((row) => rowKindIs(row, "Meta")) || {};
  addMetaValues(metaRow);
  rows.filter((row) => rowKindIs(row, "Sample")).forEach((row, index) => {
    const sampleNo = getAliasedValue(row, "Sample No") || String(index + 1);
    addRowValues(row, `Sample ${sampleNo}`, config.sampleColumns);
  });
  rows.filter((row) => rowKindIs(row, "Summary")).forEach((row, index) => {
    const label = getAliasedValue(row, "Label") || String(index + 1);
    addRowValues(row, `Summary ${label}`, config.summaryColumns);
  });

  return items;
};

function OcrFieldInput({ value, onChange, readOnly = false }) {
  return (
    <input
      readOnly={readOnly}
      value={normalizeOcrDisplayValue(value)}
      onChange={(event) => onChange?.(event.target.value)}
      style={{
        width: "100%",
        height: 34,
        border: "1px solid #dbe3ef",
        borderRadius: 6,
        padding: "0 9px",
        color: "#111827",
        background: readOnly ? "#f8fafc" : "#fff",
        boxSizing: "border-box",
      }}
    />
  );
}

function OcrMetaFields({ rows, fields, onCellChange }) {
  const metaRow = rows.find((row) => rowKindIs(row, "Meta")) || rows[0] || {};
  return (
    <section style={{ border: "1px solid #dbe3ef", borderRadius: 8, background: "#fff", padding: 14 }}>
      <div style={{ fontWeight: 800, color: "#111827", marginBottom: 12 }}>Meta</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        {fields.map((field) => (
          <label key={field} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>{field}</span>
            <OcrFieldInput
              value={getAliasedValue(metaRow, field)}
              onChange={(value) => onCellChange(metaRow.__ocrRowId, field, value)}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function OcrDataTable({ title, rows, columns, onCellChange, emptyText = "No rows found." }) {
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
          {rows.length ? rows.map((row) => (
            <tr key={row.__ocrRowId}>
              {columns.map((column) => (
                <td key={column} style={{ padding: "9px 12px", borderBottom: "1px solid #edf2f7", color: "#0f172a", fontSize: 13 }}>
                  <OcrFieldInput
                    value={getAliasedValue(row, column)}
                    onChange={(value) => onCellChange(row.__ocrRowId, column, value)}
                  />
                </td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length} style={{ padding: 14, color: "#64748b", fontSize: 13 }}>
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

const rowsFromArrayTable = (table = []) => {
  if (!Array.isArray(table) || !table.length) return [];
  if (table.every(isPlainObject)) return table;

  const arrayRows = table.filter(Array.isArray);
  if (!arrayRows.length) return [];

  const firstRow = arrayRows[0].map(normalizeCell);
  const hasHeader = firstRow.some((cell) => /[a-zA-Z%]/.test(cell));
  const headers = (hasHeader ? firstRow : arrayRows[0].map((_, index) => `Column ${index + 1}`)).map(
    (header, index) => header || `Column ${index + 1}`
  );
  const dataRows = hasHeader ? arrayRows.slice(1) : arrayRows;

  return dataRows
    .map((row) =>
      headers.reduce((acc, header, index) => {
        acc[header] = normalizeCell(row[index]);
        return acc;
      }, {})
    )
    .filter((row) => Object.values(row).some(Boolean));
};

const hasReadableRowFields = (row) => {
  if (!isPlainObject(row)) return false;
  return Object.keys(row).some((key) => {
    const value = row[key];
    return value !== null && value !== undefined && value !== "" && !Array.isArray(value) && !isPlainObject(value);
  });
};

const hasNestedRowContainer = (value) =>
  isPlainObject(value) && ["rows", "data", "table", "tables"].some((key) => Array.isArray(value[key]));

const collectRows = (value) => {
  const directRows = rowsFromArrayTable(value);
  if (directRows.length && directRows.some(hasReadableRowFields) && !directRows.some(hasNestedRowContainer)) return directRows;
  if (Array.isArray(value)) return value.flatMap(collectRows);
  if (!isPlainObject(value)) return [];
  if (hasNestedRowContainer(value)) {
    return [value.rows, value.data, value.table, value.tables].flatMap(collectRows);
  }
  if (hasReadableRowFields(value)) return [value];
  return Object.values(value).flatMap(collectRows);
};

const collectStructuredRows = (result = {}) => {
  const candidates = [
    result?.raw_tables,
    result?.extracted_tables,
    result?.data,
    result?.json_output,
    result?.result?.raw_tables,
    result?.result?.extracted_tables,
    result?.result?.data,
    result?.result?.json_output,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || !candidate.length) continue;
    const rows = collectRows(candidate);
    return rows;
  }

  return [];
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
  const candidates = [
    result?.raw_tables,
    result?.extracted_tables,
    result?.data,
    result?.json_output,
    result?.result?.raw_tables,
    result?.result?.extracted_tables,
    result?.result?.data,
    result?.result?.json_output,
  ];

  return candidates.some(hasSourceRows);
};

const looksLikeHeader = (line = "") =>
  /[a-zA-Z%]/.test(line) || /^n\s*[-+]?\s*\d+$/i.test(line) || /^s\.?\s*no\.?$/i.test(line);

const isLikelyValue = (line = "") =>
  /^[-+]?\d+(?:\.\d+)?(?:\([^)]*\))?$/.test(line) ||
  /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(line) ||
  /^[A-Z]?\d{1,4}$/i.test(line);

const parseVerticalRawTextTable = (lines = []) => {
  const headerStart = lines.findIndex((line, index) => {
    if (!looksLikeHeader(line)) return false;
    const next = lines.slice(index + 1, index + 8);
    return next.filter(looksLikeHeader).length >= 1 && next.some(isLikelyValue);
  });

  if (headerStart === -1) return [];

  const headers = [];
  let cursor = headerStart;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (headers.length >= 2 && isLikelyValue(line) && !looksLikeHeader(line)) break;
    if (!looksLikeHeader(line)) break;
    headers.push(line);
    cursor += 1;
    if (headers.length >= 10) break;
  }

  if (headers.length < 2) return [];

  const rows = [];
  while (cursor + headers.length - 1 < lines.length) {
    const chunk = lines.slice(cursor, cursor + headers.length);
    if (!chunk.some(Boolean)) break;
    rows.push(
      headers.reduce((acc, header, index) => {
        acc[header] = chunk[index] || "";
        return acc;
      }, {})
    );
    cursor += headers.length;
  }

  return rows.filter((row) => Object.values(row).some(Boolean));
};

const parseRawTextRows = (rawText = "") => {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const verticalRows = parseVerticalRawTextTable(lines);
  if (verticalRows.length) return verticalRows;

  const splitRows = lines
    .map((line) => line.split(/\s{2,}|\t+/).map(normalizeCell).filter(Boolean))
    .filter((parts) => parts.length > 1);
  const tableRows = rowsFromArrayTable(splitRows);
  if (tableRows.length) return tableRows;

  return lines.map((line, index) => ({ "S.No": index + 1, Text: line }));
};

const getOcrRows = (result = {}) => {
  const structuredRows = collectStructuredRows(result);
  if (structuredRows.length) return structuredRows;
  return parseRawTextRows(result?.raw_text || result?.text || "");
};

const canonicalizeOcrRows = (sourceRows, docType) => {
  const canonicalColumns = OCR_DOC_COLUMNS[docType];
  if (!canonicalColumns) return sourceRows;

  return sourceRows
    .filter(isPlainObject)
    .map((row) => {
      const mapped = {};
      canonicalColumns.forEach((field) => {
        const value = field === "Row Type" ? getAliasedValue(row, field) || inferRowType(row) : getAliasedValue(row, field);
        if (value) mapped[field] = value;
      });
      Object.entries(row).forEach(([key, value]) => {
        const isCanonical = canonicalColumns.some((field) =>
          (FIELD_ALIASES[field] || [field]).map(toLookupKey).includes(toLookupKey(key))
        );
        if (!isCanonical && value !== null && value !== undefined && value !== "") {
          mapped[key] = normalizeCell(value);
        }
      });
      return normalizeOcrDisplayRow(mapped);
    })
    .filter((row) => Object.values(row).some(Boolean));
};

const PdfOcrTableEntry = forwardRef(function PdfOcrTableEntry(
  {
    selectedType,
    onTypeChange,
    typeOptions = [],
    docType,
    tableTitle = "PDF Values",
    entryId = "",
  },
  ref
) {
  const fileInputRef = useRef(null);
  const config = OCR_REPORT_CONFIG[docType];
  const [file, setFile] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState({});

  const sampleRows = useMemo(() => rows.filter((row) => rowKindIs(row, "Sample")), [rows]);
  const summaryRows = useMemo(() => rows.filter((row) => rowKindIs(row, "Summary")), [rows]);
  const stretchGroups = useMemo(() => groupByTableNo(rows), [rows]);

  const clear = () => {
    setFile(null);
    setIsRunning(false);
    setMessage("");
    setRows([]);
    setErrors({});
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const validate = () => {
    const nextErrors = {};
    if (!file) nextErrors.file = true;
    if (!rows.length) nextErrors.rows = true;
    setErrors(nextErrors);
    if (file && !rows.length) setMessage("Please run OCR before saving.");
    return Object.keys(nextErrors).length === 0;
  };

  const getPreviewData = () => buildOcrPreviewItems({ docType, file, rows, config });

  useImperativeHandle(ref, () => ({
    clear,
    validate,
    getPreviewData,
    submit: async () => {
      if (!validate()) return false;
      try {
        await submitWrappingOcrPercentInspection(
          docType,
          buildWrappingOcrPayload({ docType, entryId, file, rows, selectedType })
        );
        return true;
      } catch (error) {
        setMessage(error?.message || "Unable to save OCR data.");
        return false;
      }
    },
  }));

  const handleFileChange = (event) => {
    setFile(event.target.files?.[0] || null);
    setRows([]);
    setMessage("");
    setErrors({});
  };

  const handleRunOcr = async () => {
    if (!file || isRunning) return;
    setIsRunning(true);
    setRows([]);
    setMessage("Running OCR...");
    try {
      let result = docType === "noils" || docType === "strech"
        ? await runOcrJsonForDocument({ file, docType })
        : await runOcrForDocument({ file, docType });
      let nextRows = prepareOcrRows(canonicalizeOcrRows(getOcrRows(result), docType), docType);
      let responseHasRows = hasOcrResponseRows(result);

      // If main endpoint returned no rows or signalled table-detection failure, try JSON endpoint fallback
      const serverMsg = String(result?.message || result?.error || "");
      const detectedFailure = /could not detect/i.test(serverMsg);

      if (!nextRows.length) {
        try {
          const fallback = await runOcrJsonForDocument({ file, docType });
          const fallbackRows = prepareOcrRows(canonicalizeOcrRows(getOcrRows(fallback), docType), docType);
          responseHasRows = responseHasRows || hasOcrResponseRows(fallback);
          if (fallbackRows.length) {
            result = fallback;
            nextRows = fallbackRows;
          } else if (detectedFailure) {
            setMessage("OCR completed, but the OCR engine could not detect a table structure.");
          }
        } catch (fallbackErr) {
          if (detectedFailure) {
            setMessage("OCR completed, but the OCR engine could not detect a table structure.");
          }
        }
      }

      setRows(nextRows);
      if (nextRows.length) {
        setMessage("OCR completed. Extracted values are ready.");
      } else if (!responseHasRows && !/could not detect/i.test(String(result?.message || ""))) {
        setMessage("OCR completed, but no table rows were returned.");
      } else if (!/could not detect/i.test(String(result?.message || ""))) {
        setMessage("OCR completed. Rows were returned, but no readable fields were found.");
      }
    } catch (error) {
      setMessage(error?.message || "OCR failed. Please try again.");
    } finally {
      setIsRunning(false);
    }
  };

  const handleCellChange = (rowId, field, value) => {
    setRows((current) =>
      current.map((row) => (row.__ocrRowId === rowId ? setCanonicalValue(row, field, value) : row))
    );
  };

  return (
    <div className={styles.aPercentWrap}>
      <div className={`${styles.field} ${styles.aPercentTypeField}`}>
        <label className={styles.label}>Type</label>
        <select
          value={selectedType}
          onChange={(event) => onTypeChange?.(event.target.value)}
          className={styles.select}
        >
          {typeOptions.map((option) => {
            const value = typeof option === "string" ? option : option.name;
            const label = typeof option === "string" ? option : option.displayName ?? option.name;
            return (
              <option key={value} value={value}>
                {label}
              </option>
            );
          })}
        </select>
      </div>

      <div className={styles.aPercentUploadCard}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className={styles.aPercentFileInput}
          onChange={handleFileChange}
        />
        <MdInsertDriveFile className={styles.aPercentFileIcon} aria-hidden="true" />
        <p className={styles.aPercentUploadTitle}>{file?.name || "Select the PDF File"}</p>
        {file ? (
          <>
            <div className={styles.aPercentOcrActions}>
              <button
                type="button"
                className={styles.aPercentCancelButton}
                onClick={clear}
                disabled={isRunning}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.aPercentRunOcrButton}
                onClick={handleRunOcr}
                disabled={isRunning}
              >
                {isRunning ? "Running..." : "Run OCR"}
              </button>
            </div>
            {message ? <p className={styles.aPercentOcrMessage}>{message}</p> : null}
          </>
        ) : (
          <button
            type="button"
            className={styles.aPercentBrowseButton}
            onClick={() => fileInputRef.current?.click()}
          >
            Browse File
          </button>
        )}
        {errors.file ? <p className={styles.aPercentError}>Please select a PDF file.</p> : null}
      </div>

      {rows.length > 0 ? (
        <div className={styles.aPercentTableSection}>
          <div className={styles.aPercentTableHeader}>
            <h3 className={styles.aPercentTableTitle}>{tableTitle}</h3>
            <span className={styles.aPercentTableCount}>
              {rows.length} {rows.length === 1 ? "row" : "rows"}
            </span>
          </div>
          {config ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {docType === "strech" ? (
                Object.entries(stretchGroups).map(([tableNo, groupRows]) => (
                  <div key={tableNo} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <OcrMetaFields rows={groupRows} fields={config.metaFields} onCellChange={handleCellChange} />
                    <OcrDataTable
                      title={`Table ${tableNo} - Sample Rows`}
                      rows={groupRows.filter((row) => rowKindIs(row, "Sample"))}
                      columns={config.sampleColumns}
                      onCellChange={handleCellChange}
                      emptyText="No sample rows found."
                    />
                    <OcrDataTable
                      title={`Table ${tableNo} - Summary Rows`}
                      rows={groupRows.filter((row) => rowKindIs(row, "Summary"))}
                      columns={config.summaryColumns}
                      onCellChange={handleCellChange}
                      emptyText="No summary rows found."
                    />
                  </div>
                ))
              ) : (
                <>
                  <OcrMetaFields rows={rows} fields={config.metaFields} onCellChange={handleCellChange} />
                  <OcrDataTable
                    title="Sample Rows"
                    rows={sampleRows}
                    columns={config.sampleColumns}
                    onCellChange={handleCellChange}
                    emptyText="No sample rows found."
                  />
                  <OcrDataTable
                    title="Summary Rows"
                    rows={summaryRows}
                    columns={config.summaryColumns}
                    onCellChange={handleCellChange}
                    emptyText="No summary rows found."
                  />
                </>
              )}
            </div>
          ) : (
            <p className={styles.aPercentEmptyTable}>OCR returned rows without readable fields.</p>
          )}
        </div>
      ) : null}
    </div>
  );
});

export default PdfOcrTableEntry;

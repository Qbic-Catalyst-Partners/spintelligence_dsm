import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { MdInsertDriveFile } from "react-icons/md";

import { submitWrappingOcrPercentInspection } from "@/apis/draw-frame";
import { runOcrForDocument, runOcrJsonForDocument } from "@/apis/ocrApi";
import styles from "@/styles/draw-frame.module.css";

const isPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const normalizeCell = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim();
};

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

const collectRows = (value) => {
  const directRows = rowsFromArrayTable(value);
  if (directRows.length) return directRows;
  if (Array.isArray(value)) return value.flatMap(collectRows);
  if (!isPlainObject(value)) return [];
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
    result?.rows,
    result?.table,
    result?.tables,
  ];

  for (const candidate of candidates) {
    const rows = collectRows(candidate);
    if (rows.length) return rows;
  }

  return [];
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

const cleanOcrRow = (row = {}) => {
  const { __ocrRowId, ...rest } = row;
  return rest;
};

const getReportTableName = (docType) => {
  const normalized = String(docType || "").toLowerCase();
  if (normalized === "noils" || normalized === "noil") return "comber_noil_percent";
  return "stretch_percent";
};

const getReportEntryType = (docType, selectedType) => {
  if (selectedType) return selectedType;
  const normalized = String(docType || "").toLowerCase();
  if (normalized === "noils" || normalized === "noil") return "Comber Nolis %";
  return "Stretch %";
};

const buildWrappingOcrPayload = ({ docType, entryId, file, rows, selectedType }) => {
  const cleanRows = rows.map(cleanOcrRow);
  const metaRows = rows.filter((row) => rowKindIs(row, "Meta"));
  const sampleRows = rows.filter((row) => rowKindIs(row, "Sample"));
  const summaryRows = rows.filter((row) => rowKindIs(row, "Summary"));

  return {
    entry_id: entryId,
    entry_type: getReportEntryType(docType, selectedType),
    schema_name: "wrapping",
    table_name: getReportTableName(docType),
    pdf_file: file?.name || "",
    meta: {
      pdf_file: file?.name || "",
      row_count: cleanRows.length,
      meta_row_count: metaRows.length,
      sample_row_count: sampleRows.length,
      summary_row_count: summaryRows.length,
      rows: metaRows.map(cleanOcrRow),
    },
    sample_rows: sampleRows.map(cleanOcrRow),
    summary_rows: summaryRows.map(cleanOcrRow),
    rows: cleanRows,
    raw_ocr_rows: cleanRows,
  };
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
  const [file, setFile] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState({});

  const columns = useMemo(() => {
    const seen = new Set();
    const nextColumns = [];
    rows.forEach((row) => {
      if (!isPlainObject(row)) return;
      Object.keys(row).forEach((key) => {
        if (seen.has(key)) return;
        seen.add(key);
        nextColumns.push(key);
      });
    });
    return nextColumns;
  }, [rows]);

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

  const getPreviewData = () => [
    { label: "PDF File", value: file?.name || "-" },
    { label: "OCR Rows", value: rows.length ? String(rows.length) : "-" },
  ];

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
      let nextRows = getOcrRows(result);

      // If main endpoint returned no rows or signalled table-detection failure, try JSON endpoint fallback
      const serverMsg = String(result?.message || result?.error || "");
      const detectedFailure = /could not detect/i.test(serverMsg);

      if (!nextRows.length) {
        try {
          const fallback = await runOcrJsonForDocument({ file, docType });
          const fallbackRows = getOcrRows(fallback);
          if (fallbackRows.length) {
            result = fallback;
            nextRows = fallbackRows;
            setMessage("OCR completed using JSON fallback; extracted values are ready.");
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
      if (!nextRows.length && !/could not detect/i.test(String(result?.message || ""))) {
        setMessage("OCR completed, but no table rows were returned.");
      }
    } catch (error) {
      setMessage(error?.message || "OCR failed. Please try again.");
    } finally {
      setIsRunning(false);
    }
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
          {columns.length > 0 ? (
            <div className={styles.aPercentTableScroll}>
              <table className={styles.aPercentTable}>
                <thead>
                  <tr>
                    <th>S.No</th>
                    {columns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={`${docType}-ocr-row-${rowIndex}`}>
                      <td>{rowIndex + 1}</td>
                      {columns.map((column) => (
                        <td key={`${rowIndex}-${column}`}>
                          {row?.[column] === null || row?.[column] === undefined || row?.[column] === ""
                            ? "-"
                            : String(row[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
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

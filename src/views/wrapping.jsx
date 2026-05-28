import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { FiFile, FiRefreshCw, FiUpload } from "react-icons/fi";
import Footer from "@/components/Footer";
import { runOcrForDocument } from "@/apis/ocrApi";

const wrappingTypes = ["Carding", "Drawing", "Simplex"];
const MACHINE_FIELDS = [
  "S.No",
  "Date",
  "ID",
  "Mac Name",
  "Shift",
  "Std. Hank",
  "Avg. Hank",
  "SD",
  "CV",
  "User",
  "Remark",
];
const OCR_TABLE_COLUMN_WIDTHS = {
  "S.No": 46,
  Date: 118,
  ID: 96,
  "Mac Name": 104,
  Shift: 88,
  "Std. Hank": 118,
  "Avg. Hank": 104,
  SD: 88,
  CV: 112,
  User: 120,
  Remark: 120,
};
const WRAPPING_SAVE_ENDPOINTS = {
  carding: "/carding/wrapping-carding-notebook",
  drawing: "/drawframe/wrapping-drawframe-notebook",
  simplex: "/simplex/wrapping-simplex-notebook",
};

const API_BASE = (process.env.NEXT_PUBLIC_OCR_API_URL || process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

const toDocType = (type) => String(type || "Carding").trim().toLowerCase();

function Wrapping({ fixedType = "", backPath = "/departments/quality-control", title = "Quality Control - Wrapping Notebook" }) {
  const router = useRouter();
  const inputRef = useRef(null);
  const initialType = wrappingTypes.find((type) => toDocType(type) === toDocType(fixedType)) || wrappingTypes[0];
  const [selectedType, setSelectedType] = useState(initialType);
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState([]);
  const [ocrJson, setOcrJson] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isErrorMessage, setIsErrorMessage] = useState(false);
  const docType = useMemo(() => toDocType(selectedType), [selectedType]);

  useEffect(() => {
    if (fixedType) return;
    if (!router.isReady) return;
    const requestedDocType = typeof router.query.docType === "string" ? router.query.docType.toLowerCase() : "";
    const nextType = wrappingTypes.find((type) => toDocType(type) === requestedDocType);
    if (nextType) setSelectedType(nextType);
  }, [fixedType, router.isReady, router.query.docType]);

  useEffect(() => {
    if (!fixedType) return;
    const nextType = wrappingTypes.find((type) => toDocType(type) === toDocType(fixedType));
    if (nextType) setSelectedType(nextType);
  }, [fixedType]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("ocr_prefill");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw);
      const screen = String(payload?.screen || "").toLowerCase();
      if (!screen.includes("wrapping") || !["carding", "drawing", "simplex"].includes(payload?.docType)) return;
      const nextType = wrappingTypes.find((type) => toDocType(type) === payload.docType);
      const nextRows = Array.isArray(payload?.result?.json_output)
        ? payload.result.json_output
        : payload?.values
          ? [payload.values]
          : [];
      if (nextType) setSelectedType(nextType);
      setRows(nextRows);
      setOcrJson(nextRows);
      setMessage(nextRows.length ? `Loaded ${nextRows.length} OCR row(s) from ${nextType || "wrapping"} upload.` : "");
      window.localStorage.removeItem("ocr_prefill");
    } catch {}
  }, []);

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0] || null;
    setFile(nextFile);
    setMessage(nextFile ? nextFile.name : "");
    setIsErrorMessage(false);
    setRows([]);
    setOcrJson([]);
  };

  const handleClear = () => {
    setFile(null);
    setMessage("");
    setIsErrorMessage(false);
    setRows([]);
    setOcrJson([]);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const updateCell = (rowIndex, field, value) => {
    setRows((current) =>
      current.map((row, index) => (index === rowIndex ? { ...row, [field]: value } : row))
    );
  };

  const handleRunOcr = async () => {
    if (!file) {
      setMessage("Please select a PDF or image file before running OCR.");
      setIsErrorMessage(true);
      return;
    }
    setIsRunning(true);
    setMessage(`Running ${selectedType} OCR...`);
    setIsErrorMessage(false);
    setRows([]);
    setOcrJson([]);
    try {
      const result = await runOcrForDocument({ file, docType });
      const extractedRows = Array.isArray(result?.json_output) ? result.json_output : [];
      setRows(extractedRows);
      setOcrJson(extractedRows);
      setMessage(
        extractedRows.length
          ? `Extracted ${extractedRows.length} ${selectedType.toLowerCase()} row(s). Review and save.`
          : "No rows were extracted. Check the report quality or document type."
      );
      setIsErrorMessage(!extractedRows.length);
    } catch (error) {
      setMessage(`OCR failed: ${error.message || "Unknown error"}`);
      setIsErrorMessage(true);
    } finally {
      setIsRunning(false);
    }
  };

  const handleSave = async () => {
    if (!rows.length) {
      setMessage("Run OCR and review at least one row before saving.");
      setIsErrorMessage(true);
      return;
    }
    setIsSaving(true);
    setMessage("Saving OCR rows...");
    setIsErrorMessage(false);
    try {
      const saveEndpoint = WRAPPING_SAVE_ENDPOINTS[docType] || "/ocr-machine/api/save";
      const response = await fetch(`${API_BASE}${saveEndpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file?.name || "",
          doc_type: docType,
          mc_name: rows.find((row) => String(row["Mac Name"] || "").trim())?.["Mac Name"] || "",
          ocr_json: ocrJson,
          manual_json: rows,
          rows,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || `Server error ${response.status}`);
      setMessage(`Saved ${selectedType} OCR record #${payload.id}.`);
    } catch (error) {
      setMessage(`Save failed: ${error.message || "Unknown error"}`);
      setIsErrorMessage(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f6f7f9",
        padding: "28px 32px 32px",
        boxSizing: "border-box",
      }}
    >
      <main style={{ width: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
        <h1 style={{ margin: 0, color: "#111827", fontSize: 26, lineHeight: 1.2, fontWeight: 800 }}>
          {title}
        </h1>

        {!fixedType ? <label style={{ display: "block", width: 270 }}>
          <span style={{ display: "block", marginBottom: 10, color: "#111827", fontSize: 13, fontWeight: 700 }}>
            Type
          </span>
          <select
            value={selectedType}
            onChange={(event) => {
              setSelectedType(event.target.value);
              setRows([]);
              setOcrJson([]);
              setMessage("");
              setIsErrorMessage(false);
            }}
            style={{
              width: "100%",
              height: 44,
              border: "1px solid #dbe3ef",
              borderRadius: 7,
              background: "#fff",
              color: "#1f2937",
              padding: "0 14px",
              fontSize: 14,
              fontWeight: 600,
              boxSizing: "border-box",
            }}
          >
            {wrappingTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label> : null}

        {rows.length === 0 ? (
          <section
            style={{
              minHeight: 258,
              border: "1px solid #dbe3ef",
              borderRadius: 8,
              background: "#fff",
              display: "grid",
              placeItems: "center",
              textAlign: "center",
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <FiFile style={{ color: "#9ca3af", fontSize: 36, marginBottom: 18 }} />
              <div style={{ color: "#111827", fontSize: 15, fontWeight: 800, marginBottom: 28 }}>
                {file ? file.name : "Select the Report PDF or Image"}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                {!file ? (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    style={{
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
                    }}
                  >
                    <FiUpload />
                    Browse File
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleClear}
                      style={{
                        border: "1px solid #dbe3ef",
                        borderRadius: 7,
                        background: "#fff",
                        color: "#334155",
                        minWidth: 130,
                        height: 42,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleRunOcr}
                      disabled={isRunning}
                      style={{
                        border: 0,
                        borderRadius: 7,
                        background: isRunning ? "#94a3b8" : "#3D539F",
                        color: "#fff",
                        minWidth: 130,
                        height: 42,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: isRunning ? "not-allowed" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 7,
                      }}
                    >
                      <FiRefreshCw />
                      {isRunning ? "Running..." : "Run OCR"}
                    </button>
                  </>
                )}
              </div>
              <input
                ref={inputRef}
                hidden
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={handleFileChange}
              />
            </div>
          </section>
        ) : null}

        {rows.length > 0 ? (
          <section style={{ overflowX: "auto", border: "1px solid #dbe3ef", borderRadius: 8, background: "#fff" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980, tableLayout: "fixed" }}>
              <colgroup>
                {MACHINE_FIELDS.map((field) => (
                  <col key={field} style={{ width: OCR_TABLE_COLUMN_WIDTHS[field] || 96 }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {MACHINE_FIELDS.map((field) => (
                    <th key={field} style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #dbe3ef", color: "#334155", fontSize: 12 }}>
                      {field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {MACHINE_FIELDS.map((field) => (
                      <td key={field} style={{ padding: 6, borderBottom: "1px solid #edf2f7" }}>
                        <input
                          value={row[field] || ""}
                          onChange={(event) => updateCell(rowIndex, field, event.target.value)}
                          style={{ width: "100%", height: 28, border: "1px solid #dbe3ef", borderRadius: 6, padding: field === "S.No" ? "0 6px" : "0 7px", boxSizing: "border-box", fontSize: 12 }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {message ? (
          <div style={{ color: isErrorMessage ? "#b91c1c" : "#166534", fontSize: 13, fontWeight: 600 }}>
            {message}
          </div>
        ) : null}

        <Footer
          onBack={() => router.push(backPath)}
          onClear={handleClear}
          onSave={handleSave}
          saveLabel={isSaving ? "Saving..." : "Save Record"}
          disabled={isSaving || isRunning}
        />
      </main>
    </div>
  );
}

export default Wrapping;

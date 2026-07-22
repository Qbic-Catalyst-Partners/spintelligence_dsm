import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { runOcrForDocument } from "@/apis/ocrApi";

const HVI_LABEL_MAP = [
  { label: "SCI",  field: "SCI" },
  { label: "SL2",  field: "Span Length (2.5%)" },
  { label: "Mic",  field: "Mic" },
  { label: "Mat",  field: "Maturity" },
  { label: "UR",   field: "UR" },
  { label: "Str",  field: "Elongation" },
  { label: "+b",   field: "Yellow + B" },
  { label: "Rd",   field: "RD" },
];

const extractHviFields = (rawText, fields = []) => {
  if (!rawText) return {};
  const lines = rawText.split("\n").map((s) => s.trim());
  const isNumericLine = (s) => /^[0-9]/.test(s) && !/[A-Za-z]/.test(s) && !isNaN(parseFloat(s));

  const numericAverageAt = (labelIdx) => {
    const nums = [];
    for (let i = labelIdx + 1; i < lines.length && nums.length < 12; i++) {
      const line = lines[i];
      if (/^\[/.test(line) || /^\(/.test(line)) continue;
      if (isNumericLine(line)) nums.push(line);
      else if (nums.length > 0) break;
    }
    return nums[4] ?? nums[nums.length - 1] ?? "";
  };

  const gradeMode = (labelIdx) => {
    const grades = [];
    for (let i = labelIdx + 1; i < lines.length && grades.length < 8; i++) {
      const line = lines[i];
      if (/^\d+-\d+$/.test(line)) grades.push(line);
      else if (grades.length > 0) break;
    }
    if (!grades.length) return "";
    const counts = {};
    grades.forEach((g) => { counts[g] = (counts[g] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  };

  const result = {};
  HVI_LABEL_MAP.forEach(({ label, field }) => {
    if (fields.length && !fields.includes(field)) return;
    const idx = lines.indexOf(label);
    if (idx !== -1) result[field] = numericAverageAt(idx);
  });

  const cGrdIdx = lines.indexOf("CGrd");
  if (cGrdIdx !== -1 && (!fields.length || fields.includes("Colour Grade"))) {
    result["Colour Grade"] = gradeMode(cGrdIdx);
  }

  return result;
};

const FIELD_ALIASES_BY_TYPE = {
  hvi: {
    "Variety": ["variety", "Variety"],
    "Invoice No": ["invoice_no", "invoiceNo", "Invoice No"],
    "Invoice Date": ["invoice_date", "invoiceDate", "Invoice Date"],
    "SCI": ["sci", "SCI"],
    "Span Length (2.5%)": ["span_length", "spanLength", "Span Length (2.5%)", "SL2", "SL 2.5%", "SL 2.5"],
    "Mic": ["mic", "Mic"],
    "GTEX": ["gtex", "GTEX"],
    "Maturity": ["maturity", "Maturity", "Mat"],
    "UR": ["ur", "UR"],
    "SFI": ["sfi", "SFI"],
    "Elongation": ["elongation", "Elongation", "Str"],
    "Yellow + B": ["yellow_b", "yellowB", "Yellow + B", "+b", "Yellow+B"],
    "TrCnt": ["trcnt", "trCnt", "TrCnt"],
    "TrAr": ["trar", "trAr", "TrAr"],
    "TrID": ["trid", "trID", "TrID"],
    "Invisible Loss %": ["invisible_loss_percentage", "invisibleLossPercent", "Invisible Loss %"],
    "Trash Content %": ["trash_content_percentage", "trashContentPercent", "Trash Content %"],
    "RD": ["rd", "RD", "Rd"],
    "Colour Grade": ["colour_grade", "colourGrade", "Colour Grade", "CGrd"],
  },
  afis: {
    "Variety": ["variety", "Variety"],
    "Invoice No": ["invoice_no", "invoiceNo", "Invoice No"],
    "Invoice Date": ["invoice_date", "invoiceDate", "Invoice Date"],
    "UQL": ["uql", "UQL"],
    "L5%": ["l5", "L5%", "L5"],
    "SFC(N)": ["sfc_n", "sfcN", "SFC(N)", "SFC(n)"],
    "IFC %": ["ifc", "IFC %", "IFC"],
    "Fibre Neps Gms": ["fibre_neps_gms", "fibreNepsGms", "Fibre Neps Gms", "Neps Gms", "Neps/gm"],
    "SFC(W)": ["sfc_w", "sfcW", "SFC(W)", "SFC(w)"],
    "Maturity": ["maturity", "Maturity"],
    "Fineness": ["fineness", "Fineness"],
    "SCN/gm": ["scn_gms", "scnGms", "SCN/gm", "SCN gm", "SCN Gms"],
  },
};

const buildCanonicalFormValues = (row, docType) => {
  const aliasMap = FIELD_ALIASES_BY_TYPE[docType];
  if (!aliasMap) return row || {};
  const result = {};
  Object.entries(aliasMap).forEach(([canonicalLabel, aliases]) => {
    result[canonicalLabel] = getValueFromRow(row, aliases) || "";
  });
  return result;
};

const DOC_TYPES = [
  { label: "HVI Data Entry", value: "hvi" },
  { label: "AFIS Data Entry", value: "afis" },
  { label: "Between & Within Card Data Entry", value: "bwc" },
  { label: "Carding Wrapping", value: "carding" },
  { label: "Drawing Wrapping", value: "drawing" },
  { label: "Simplex Wrapping", value: "simplex" },
];
const MACHINE_DOC_TYPES = new Set(["carding", "drawing", "simplex"]);
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

const BWC_ENTRY_COUNT = 100;
const BWC_SUBMIT_ENTRY_COUNT = 100;
const BWC_FIELDS = [
  ...Array.from({ length: BWC_ENTRY_COUNT }, (_, i) => `Sample Weight ${i + 1}`),
  ...Array.from({ length: BWC_ENTRY_COUNT }, (_, i) => `Hank ${i + 1}`),
];

const toLookupKey = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const getValueFromRow = (row, aliases = []) => {
  if (!row || typeof row !== "object" || Array.isArray(row)) return "";
  const wanted = aliases.map(toLookupKey);
  const key = Object.keys(row).find((item) => wanted.includes(toLookupKey(item)));
  return key ? String(row[key] ?? "").trim() : "";
};

const normalizeDateForInput = (value) => {
  const text = String(value || "").trim();
  const match = text.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  return "";
};

const formatDateForDisplay = (value) => {
  const normalized = normalizeDateForInput(value);
  if (!normalized) return String(value || "").trim();
  const [year, month, day] = normalized.split("-");
  return `${day}-${month}-${year}`;
};

const extractTextMatch = (text, patterns = []) => {
  const source = String(text || "");
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return String(match[1]).trim();
  }
  return "";
};

const getRowCandidateValues = (rows = [], aliases = []) => {
  for (const row of rows) {
    const value = getValueFromRow(row, aliases);
    if (value) return value;
  }
  return "";
};

const extractMachinePrefill = (result = {}) => {
  const rows = Array.isArray(result?.json_output)
    ? result.json_output
    : Array.isArray(result?.raw_tables)
      ? result.raw_tables
      : Array.isArray(result?.data)
        ? result.data
        : [];
  const firstRow = rows.find((row) => row && typeof row === "object" && !Array.isArray(row)) || {};
  const rawText = String(result?.raw_text || result?.text || "");
  const testId =
    getValueFromRow(firstRow, ["Test ID", "Test Id", "test_id", "ID", "id", "entry_id", "entryId"]) ||
    (rawText.match(/test\s*id\s*[:\-]?\s*([^\r\n]+)/i)?.[1] || "").trim();
  const reportDate =
    getValueFromRow(firstRow, ["Report Date", "Date", "date", "entry_date", "entryDate"]) ||
    (rawText.match(/date\s*[:\-]?\s*([0-9]{2}-[0-9]{2}-[0-9]{4})/i)?.[1] || "").trim();
  const normalizedDate = normalizeDateForInput(reportDate);

  return {
    "Test ID": testId,
    "Report Date": normalizedDate || reportDate,
    ID: testId,
    Date: normalizedDate || reportDate,
  };
};

const getBwcReviewFields = (count) =>
  Array.from({ length: Math.min(Math.max(1, Number(count) || 1), BWC_ENTRY_COUNT) }, (_, i) => [
    `Sample Weight ${i + 1}`,
    `Hank ${i + 1}`,
  ]).flat();

function countBwcEntries(values = {}) {
  let count = 0;
  for (let i = 1; i <= BWC_ENTRY_COUNT; i += 1) {
    const sampleWeight = String(values[`Sample Weight ${i}`] || "").trim();
    const hank = String(values[`Hank ${i}`] || "").trim();
    if (sampleWeight || hank) count = i;
  }
  return count;
}

function normalizeBwcValues(source = {}) {
  const values = {};
  BWC_FIELDS.forEach((field) => {
    values[field] = source[field] ?? "";
  });

  const sampleValues = [];
  for (let i = 1; i <= BWC_ENTRY_COUNT; i += 1) {
    const value = String(values[`Sample Weight ${i}`] || "").trim();
    if (!value) break;
    sampleValues.push(value);
  }

  const hasHankValues = Array.from({ length: BWC_ENTRY_COUNT }, (_, i) =>
    String(values[`Hank ${i + 1}`] || "").trim()
  ).some(Boolean);

  if (!hasHankValues && sampleValues.length > 1 && sampleValues.length % 2 === 0) {
    const half = sampleValues.length / 2;
    for (let i = 1; i <= BWC_ENTRY_COUNT; i += 1) {
      values[`Sample Weight ${i}`] = i <= half ? sampleValues[i - 1] : "";
      values[`Hank ${i}`] = i <= half ? sampleValues[half + i - 1] : "";
    }
  }

  return values;
}

const extractBwcMeta = (rows = [], rawText = "") => {
  const testId =
    getRowCandidateValues(rows, ["Test ID", "Test Id", "test_id", "ID", "id", "entry_id", "entryId"]) ||
    extractTextMatch(rawText, [
      /test\s*id\s*[:\-]?\s*([^\r\n]+)/i,
      /test\s*id\s+([A-Za-z0-9._/-]+)/i,
    ]);

  const inspectionDateRaw =
    getRowCandidateValues(rows, ["Inspection Date", "inspection_date", "Date", "date", "Report Date", "report_date", "entry_date"]) ||
    extractTextMatch(rawText, [
      /inspection\s*date\s*[:\-]?\s*([^\r\n]+)/i,
      /report\s*date\s*[:\-]?\s*([^\r\n]+)/i,
      /\bdate\s*[:\-]?\s*([0-9]{2}-[0-9]{2}-[0-9]{4})/i,
    ]);

  return {
    machineName:
      getRowCandidateValues(rows, ["Machine Name", "MC Name", "mc_name", "machine_name", "machine"]) ||
      extractTextMatch(rawText, [/machine\s*name\s*[:\-]?\s*([^\r\n]+)/i, /mc\s*name\s*[:\-]?\s*([^\r\n]+)/i]),
    inspectionType:
      getRowCandidateValues(rows, ["Inspection Type", "inspection_type"]) ||
      extractTextMatch(rawText, [/inspection\s*type\s*[:\-]?\s*([^\r\n]+)/i]),
    inspectionDate: normalizeDateForInput(inspectionDateRaw),
    testId,
  };
};

export default function OcrMachinePage() {
  const router = useRouter();
  const [docType, setDocType] = useState("hvi");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [rows, setRows] = useState([]);
  const [formValues, setFormValues] = useState({});
  const [saved, setSaved] = useState(false);
  const [lastOcrResult, setLastOcrResult] = useState(null);
  const returnTo = typeof router.query.returnTo === "string" ? router.query.returnTo : "";
  const requestedDocType = typeof router.query.docType === "string" ? router.query.docType.toLowerCase() : "";
  const queryMcName = typeof router.query.mc_name === "string" ? router.query.mc_name : "";
  const queryInspectionType = typeof router.query.inspection_type === "string" ? router.query.inspection_type : "";
  const queryInspectionDate = typeof router.query.inspection_date === "string" ? router.query.inspection_date : "";
  const queryScreen = typeof router.query.screen === "string" ? router.query.screen : "";
  const [meta, setMeta] = useState({
    mc_name: "",
    inspection_type: "",
    inspection_date: "",
    test_id: "",
  });
  const [isDark, setIsDark] = useState(false);
  const inferredDocType = useMemo(() => {
    if (requestedDocType === "afis" || requestedDocType === "hvi" || requestedDocType === "bwc" || MACHINE_DOC_TYPES.has(requestedDocType)) return requestedDocType;
    const haystack = [
      returnTo,
      typeof router.query.type === "string" ? router.query.type : "",
      typeof router.query.type_category === "string" ? router.query.type_category : "",
      typeof router.query.screen === "string" ? router.query.screen : "",
    ]
      .join(" ")
      .toLowerCase();
    if (haystack.includes("between") && haystack.includes("within") && haystack.includes("card")) return "bwc";
    if (haystack.includes("carding")) return "carding";
    if (haystack.includes("drawing")) return "drawing";
    if (haystack.includes("simplex")) return "simplex";
    if (haystack.includes("afis")) return "afis";
    return "hvi";
  }, [requestedDocType, returnTo, router.query.screen, router.query.type, router.query.type_category]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const readTheme = () => {
      const rootTheme = document.documentElement.getAttribute("data-theme");
      const bodyTheme = document.body?.getAttribute("data-theme");
      setIsDark(rootTheme === "dark" || bodyTheme === "dark");
    };
    readTheme();
    const observer = new MutationObserver(readTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setDocType(inferredDocType);
  }, [inferredDocType]);

  useEffect(() => {
    setMeta((prev) => ({
      ...prev,
      mc_name: queryMcName || prev.mc_name,
      inspection_type: queryInspectionType || prev.inspection_type,
      inspection_date: queryInspectionDate || prev.inspection_date,
    }));
  }, [queryInspectionDate, queryInspectionType, queryMcName]);

  const step = useMemo(() => {
    if (rows.length > 0) return 3;
    if (loading || file) return 2;
    return 1;
  }, [file, loading, rows.length]);

  const docTypeLabel = useMemo(() => {
    if (queryScreen) return queryScreen;
    if (docType !== "bwc") return DOC_TYPES.find((d) => d.value === docType)?.label || "HVI Data Entry";
    const inspection = (meta.inspection_type || queryInspectionType || "").trim();
    if (!inspection) return "Between & Within Card Data Entry";
    return `${inspection} Card Data Entry`;
  }, [docType, meta.inspection_type, queryInspectionType, queryScreen]);

  const runOcr = async () => {
    if (!file) return;
    setSaved(false);
    setLoading(true);
    setLogs([]);
    setRows([]);
    setLastOcrResult(null);
    try {
      const result = await runOcrForDocument({ file, docType });
      setLastOcrResult(result || null);
      const parsed = Array.isArray(result?.json_output)
        ? result.json_output
        : Array.isArray(result?.raw_tables)
          ? result.raw_tables
          : Array.isArray(result?.data)
            ? result.data
            : [];
      // const firstHasData = rawParsed[0] && Object.keys(rawParsed[0]).length > 0;
      // const parsed = firstHasData
      //   ? rawParsed
      //   : (() => {
      //       const extracted = extractHviFields(result?.raw_text, result?.fields || []);
      //       return Object.keys(extracted).length > 0 ? [extracted] : rawParsed;
      //     })();
      if (docType === "bwc") {
        const rawText = String(result?.raw_text || "").toLowerCase();
        const looksLikeHviReport =
          rawText.includes("hvi1000") ||
          rawText.includes("systemtesting-individual tests") ||
          rawText.includes("uster");
        if (looksLikeHviReport) {
          setRows([]);
          setFormValues({});
          setLogs((prev) => [
            ...prev,
            "Uploaded PDF appears to be an HVI report. Please upload a Between/Within Card report for BWC.",
          ]);
          return;
        }
      }
      setRows(parsed);
      if (docType === "bwc") {
        const meta = extractBwcMeta(parsed, result?.raw_text || result?.text || "");
        const first = parsed[0] || {};
        setFormValues(normalizeBwcValues(first));
        setMeta((prev) => ({
          ...prev,
          mc_name: meta.machineName || prev.mc_name,
          inspection_type: meta.inspectionType || prev.inspection_type,
          inspection_date: meta.inspectionDate || prev.inspection_date,
          test_id: meta.testId || prev.test_id,
        }));
      } else if (MACHINE_DOC_TYPES.has(docType)) {
        const first = parsed[0] || {};
        const machineValues = MACHINE_FIELDS.reduce((acc, field) => {
          acc[field] = first[field] ?? "";
          return acc;
        }, {});
        setFormValues({
          ...machineValues,
          ...(docType === "carding" ? extractMachinePrefill(result) : {}),
        });
      } else if (docType === "hvi" || docType === "afis") {
        const first = parsed[0] || {};
        setFormValues(buildCanonicalFormValues(first, docType));
      } else {
        const first = parsed[0] || {};
        setFormValues(first);
      }
    } catch (e) {
      const isNetworkFailure = e instanceof TypeError && /fetch/i.test(e.message || "");
      const msg = isNetworkFailure
        ? "Network error calling OCR API route. Check backend availability."
        : e.message || "OCR failed";
      setLogs((prev) => [...prev, msg]);
    } finally {
      setLoading(false);
    }
  };


  const stepColor = (idx) => (step === idx ? "#3f56a9" : "#cfd4dd");
  const stepTextColor = (idx) => (step === idx ? "#3f56a9" : "#94a3b8");
  const colors = isDark
    ? {
        pageBg: "#0b1220",
        cardBg: "#111827",
        cardBorder: "#374151",
        heading: "#f8fafc",
        muted: "#94a3b8",
        panelBg: "#0f172a",
        panelBorder: "#475569",
        fieldBg: "#1f2937",
        fieldBorder: "#4b5563",
        fieldText: "#f8fafc",
        cancelBg: "#111827",
        cancelBorder: "#6b7280",
        cancelText: "#f3f4f6",
        success: "#22c55e",
      }
    : {
        pageBg: "rgba(100, 116, 139, 0.65)",
        cardBg: "#ffffff",
        cardBorder: "#e2e8f0",
        heading: "#0f172a",
        muted: "#94a3b8",
        panelBg: "transparent",
        panelBorder: "#94a3b8",
        fieldBg: "#f8fafc",
        fieldBorder: "#d1d5db",
        fieldText: "#0f172a",
        cancelBg: "#ffffff",
        cancelBorder: "#9ca3af",
        cancelText: "#111827",
        success: "#166534",
      };

  return (
    <div style={{ minHeight: "100vh", background: colors.pageBg, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, paddingTop: 0, fontFamily: "Segoe UI, sans-serif" }}>
      <div style={{ width: "min(680px, calc(100vw - 24px))", background: colors.cardBg, borderRadius: 10, border: `1px solid ${colors.cardBorder}`, padding: "22px 24px", transform: "translateY(-36px)" }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, marginBottom: 22 }}>
          {["Upload", "Extract", "Review"].map((label, i) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 700, color: stepTextColor(i + 1) }}>
                <span style={{ width: 28, height: 28, borderRadius: 999, display: "grid", placeItems: "center", background: stepColor(i + 1), color: step === i + 1 ? "#fff" : "#64748b", fontSize: 14, fontWeight: 700 }}>
                  {i + 1}
                </span>
                {label}
              </div>
              {i < 2 ? (
                <span
                  style={{
                    width: 36,
                    height: 2,
                    background: step >= i + 2 ? "#3f56a9" : "#cfd4dd",
                    borderRadius: 99,
                  }}
                />
              ) : null}
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 36 / 2.2, fontWeight: 700, color: colors.heading }}>{rows.length > 0 ? "Review & Edit" : "Upload Report PDF"}</h2>
          <div style={{ marginTop: 2, fontWeight: 700, fontSize: 18, color: colors.heading }}>
            {docTypeLabel}
          </div>
        </div>

        <div style={{ background: colors.panelBg, border: `1px dashed ${colors.panelBorder}`, borderRadius: 10, minHeight: rows.length > 0 ? 270 : 220, padding: 20 }}>
          {!file ? (
            <label style={{ display: "grid", placeItems: "center", textAlign: "center", cursor: "pointer", minHeight: 175 }}>
              <div style={{ marginBottom: 8, color: "#9aa5b5" }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 16V4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M7 11L12 16L17 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 19H19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </div>
              <div style={{ fontSize: 38 / 2.2, fontWeight: 700, color: colors.heading }}>Drop or Select the PDF from Computer</div>
              <span style={{ background: "#445bb2", color: "#fff", borderRadius: 8, padding: "10px 22px", display: "inline-block", fontWeight: 700, fontSize: 14 }}>Browse File</span>
              <input hidden type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: "center", minHeight: 175, display: "grid", alignContent: "center" }}>
              <div style={{ color: "#9aa5b5", display: "grid", placeItems: "center" }}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 16V4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M7 11L12 16L17 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 19H19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </div>
              <div style={{ fontWeight: 700, marginTop: 8 }}>{file.name}</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16 }}>
                <button onClick={() => { setFile(null); setLogs([]); }} style={{ border: `1px solid ${colors.cancelBorder}`, background: colors.cancelBg, color: colors.cancelText, borderRadius: 8, padding: "8px 20px", fontWeight: 600 }}>Cancel</button>
                <button onClick={runOcr} disabled={loading} style={{ border: "none", background: "#445bb2", color: "#fff", borderRadius: 8, padding: "8px 22px", fontWeight: 700 }}>
                  {loading ? "Running..." : "Run OCR"}
                </button>
              </div>
              {logs.length > 0 ? <div style={{ marginTop: 10, fontSize: 12, color: colors.muted }}>{logs[logs.length - 1]}</div> : null}
            </div>
          ) : (
            <div>
              {docType === "bwc" ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 10 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 11, color: colors.muted, fontWeight: 600 }}>Machine Name</span>
                    <input
                      value={meta.mc_name}
                      onChange={(e) => setMeta((prev) => ({ ...prev, mc_name: e.target.value }))}
                      style={{ height: 32, borderRadius: 6, border: `1px solid ${colors.fieldBorder}`, background: colors.fieldBg, color: colors.fieldText, padding: "0 8px", fontSize: 12 }}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 11, color: colors.muted, fontWeight: 600 }}>Inspection Type</span>
                    <input
                      value={meta.inspection_type}
                      onChange={(e) => setMeta((prev) => ({ ...prev, inspection_type: e.target.value }))}
                      style={{ height: 32, borderRadius: 6, border: `1px solid ${colors.fieldBorder}`, background: colors.fieldBg, color: colors.fieldText, padding: "0 8px", fontSize: 12 }}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 11, color: colors.muted, fontWeight: 600 }}>Inspection Date</span>
                    <input
                      type="date"
                      value={meta.inspection_date}
                      onChange={(e) => setMeta((prev) => ({ ...prev, inspection_date: e.target.value }))}
                      style={{ height: 32, borderRadius: 6, border: `1px solid ${colors.fieldBorder}`, background: colors.fieldBg, color: colors.fieldText, padding: "0 8px", fontSize: 12 }}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 11, color: colors.muted, fontWeight: 600 }}>Test ID</span>
                    <input
                      value={meta.test_id}
                      onChange={(e) => setMeta((prev) => ({ ...prev, test_id: e.target.value }))}
                      style={{ height: 32, borderRadius: 6, border: `1px solid ${colors.fieldBorder}`, background: colors.fieldBg, color: colors.fieldText, padding: "0 8px", fontSize: 12 }}
                    />
                  </label>
                </div>
              ) : null}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                {(docType === "bwc" ? getBwcReviewFields(countBwcEntries(formValues)) : MACHINE_DOC_TYPES.has(docType) ? MACHINE_FIELDS : Object.keys(formValues)).map((key) => (
                  <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 11, color: colors.muted, fontWeight: 600 }}>{key}</span>
                    <input
                      value={formValues[key] ?? ""}
                      onChange={(e) => setFormValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      style={{ height: 32, borderRadius: 6, border: `1px solid ${colors.fieldBorder}`, background: colors.fieldBg, color: colors.fieldText, padding: "0 8px", fontSize: 12 }}
                    />
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
                <button onClick={() => { setRows([]); setFormValues({}); }} style={{ border: `1px solid ${colors.cancelBorder}`, background: colors.cancelBg, color: colors.cancelText, borderRadius: 8, padding: "8px 20px", fontWeight: 600 }}>Cancel</button>
                <button
                  onClick={() => {
                    const fallbackTarget = MACHINE_DOC_TYPES.has(docType)
                      ? `/departments/quality-control/wrapping?docType=${encodeURIComponent(docType)}`
                      : docType === "afis" ? "/mixing?type=AFIS%20Data%20Entry" : "/mixing?type=Cotton%20HVI%20Data%20Entry";
                    const target = returnTo || fallbackTarget;
                    const normalizedScreen = queryScreen || target.replace(/^\/+/, "").toLowerCase();
                    const screenValue = queryScreen || (target.startsWith("/mixing") ? "Cotton HVI Data Entry" : normalizedScreen);
                    window.localStorage.setItem(
                      "ocr_prefill",
                        JSON.stringify({
                          screen: screenValue,
                          docType,
                      values: docType === "bwc"
                          ? {
                              ...formValues,
                              "Machine Name": meta.mc_name,
                              "Inspection Type": meta.inspection_type,
                              "Inspection Date": formatDateForDisplay(meta.inspection_date),
                              "Test ID": meta.test_id,
                              num_entries: Math.min(countBwcEntries(formValues), BWC_SUBMIT_ENTRY_COUNT),
                          }
                          : formValues,
                        result: {
                          json_output: rows,
                          raw_text: lastOcrResult?.raw_text || lastOcrResult?.text || "",
                        },
                      })
                    );
                    const returnTarget = returnTo === "/mixing" && queryScreen ? `/mixing?type=${encodeURIComponent(queryScreen)}` : target;
                    router.push(returnTarget);
                  }}
                  style={{ border: "none", background: "#445bb2", color: "#fff", borderRadius: 8, padding: "8px 18px", fontWeight: 700 }}
                >
                  Use as Input Screen
                </button>
              </div>
              {saved ? <div style={{ marginTop: 8, color: colors.success, fontWeight: 600, fontSize: 12 }}>Saved successfully.</div> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


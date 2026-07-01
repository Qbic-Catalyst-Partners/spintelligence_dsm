import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { MdInsertDriveFile, MdOutlineEditNote } from "react-icons/md";

import Footer from "@/components/Footer";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import PreviewModal from "@/components/PreviewModal";
import SearchableSelect from "@/components/SearchableSelect";
import SuccessModal from "@/components/SuccessModal";
import { runOcrForDocument } from "@/apis/ocrApi";
import DrawFrameHeaderEntry from "@/views/draw-frame/DrawFrameHeaderEntry";
import WheelChange from "@/views/draw-frame/WheelChange";
import { cvMachineOptions } from "@/views/draw-frame/constants";
import {
  fetchDrawFrameCotsMachineMaster,
  fetchDrawFrameMachineMaster,
  fetchDrawFrameUqcMasterDropdown,
  submitDrawFrameAPercentInspection,
} from "@/apis/draw-frame";
import { submitDrawFrameWheelChangeEntry } from "@/apis/drawFrameWheelChange";
import {
  clearDrawFrameState,
  fetchDrawFrameCotsEntries,
  fetchDrawFrameUqcEntries,
  submitDrawFrameCotsInspection,
  submitDrawFrameUqcInspection,
  submitDrawFrameYarnCvInspection,
} from "@/store/slices/draw-frame";
import styles from "@/styles/draw-frame.module.css";
import uPercentStyles from "@/styles/u%dataentry.module.css";
import { sanitizeNumericInput } from "@/utils/inputValidation";
import { filterOptionsByDepartmentAccess } from "@/utils/screenAccess";
import { formatEntryId } from "@/utils/entryIds";
import { recordSubmittedNotebook } from "@/utils/submittedNotebookRecorder";
import useDatabaseEntryId from "@/hooks/useDatabaseEntryId";
import { useThemeMode } from "@/utils/useThemeMode";
import { normalizeOcrDisplayRow, normalizeOcrDisplayValue } from "@/utils/ocrDisplayValues";

const today = new Date().toISOString().split("T")[0];

const primaryTypeOptions = [
  { id: 1, name: "1 Yard / Half Yard CV Entry", aliases: ["1 Yard / Half Yard CV Entry"] },
  { id: 2, name: "Draw Frame Cots Data Entry", aliases: ["Draw Frame Cots Data Entry", "Drawframe Cots Data Entry"] },
  { id: 3, name: "U% Data Entry", aliases: ["U% Data Entry", "U Percent Data Entry", "U% Checking"] },
  {
    id: 4,
    name: "PP - Breaker Drawing",
    aliases: ["PP - Breaker Drawing", "Process Parameter", "Draw Frame QC Header Entry", "Drawframe Header Entry"],
  },
  {
    id: 5,
    name: "PP - Finisher Drawing",
    aliases: ["PP - Finisher Drawing", "Finisher Drawing"],
  },
  { id: 6, name: "A%", aliases: ["A%", "A Percent", "A% Data Entry"] },
  { id: 7, name: "Wheel Change", aliases: ["Wheel Change", "WHEEL CHANGE"] },
];

export const DRAW_FRAME_INPUT_SCREEN_COUNT = primaryTypeOptions.length;
const DRAW_FRAME_ENTRY_SEQ_KEY = "drawframe_entry_sequence";
const DRAW_FRAME_YARN_CV_PREFIX = String(
  process.env.NEXT_PUBLIC_DRAWFRAME_YARN_CV_PREFIX || process.env.NEXT_PUBLIC_DRAWFRAME_YARN_CV_PDF_PREFIX || "YAR"
).trim().toUpperCase() || "YAR";
const DRAW_FRAME_YARN_CV_DEPARTMENT_CODE = String(
  process.env.NEXT_PUBLIC_DRAWFRAME_YARN_CV_DEPARTMENT_CODE || "15"
).trim();
const DRAW_FRAME_ENTRY_ID_CONFIG = {
  "1 Yard / Half Yard CV Entry": { prefix: DRAW_FRAME_YARN_CV_PREFIX, width: 4, routePath: "/drawframe/yarn-cv" },
  "Yarn CV% Calculation Form": { prefix: "YCV" },
  "Draw Frame Cots Data Entry": { prefix: "DRC", width: 4, routePath: "/drawframe/cots" },
  "U% Data Entry": { prefix: "DUP", width: 4, routePath: "/drawframe/uqc" },
  // Keep breaker and finisher on separate sequence scopes so they do not share storage identity.
  "PP - Breaker Drawing": { prefix: "PP", width: 4, routePath: "/drawframe/header?scope=breaker" },
  "PP - Finisher Drawing": { prefix: "PP", width: 4, routePath: "/drawframe/finisher?scope=finisher" },
  "A%": { prefix: "DAP", width: 4, routePath: "/drawframe/a-percent" },
  "Wheel Change": { prefix: "DWC", width: 4, routePath: "/drawframe/wheel-change" },
};

const getDrawFrameEntryConfig = (type = "") =>
  DRAW_FRAME_ENTRY_ID_CONFIG[type] || { prefix: "DRA" };

const normalizeTypeName = (value = "") =>
  String(value).trim().toLowerCase();
const getTypeName = (value = "") => String(value?.name ?? value ?? "").trim();

const getDrawFrameUniqueId = (sequence, type = "") => {
  const config = getDrawFrameEntryConfig(type);
  return formatEntryId({
    prefix: config.prefix,
    sequence,
    width: config.width || 3,
  });
};

const STATIC_BR_COTS_MACHINE_NAMES = [
  "BR 01(SB20)",
  "BR 02(TD 7-1)",
  "BR 03(TD 7-2)",
  "BR 04(TD 7-3)",
  "BR 05(TD 7-4)",
  "BR 06(TD 7-5)",
  "BR 07(TD 7-6)",
  "BR 08(TD 7-6)",
  "BR 09(TD 7-6)",
];
const STATIC_FR_MACHINE_NAMES = ["FR (HSR 1000-2)", "FR (HSR 1000-1)"];

const processTypeOptions = ["Breaker", "Finisher"];
const shiftOptions = ["General", "A Shift", "B Shift", "C Shift"];
const STATIC_SHIFT_OPTIONS = [
  { value: "General", label: "General" },
  { value: "Day", label: "Day" },
  { value: "Halfnight", label: "Halfnight" },
  { value: "Fullnight", label: "Fullnight" },
];
const STATIC_DEPARTMENT_OPTIONS = [
  { dept_code: "BR", dept_name: "Br drawing" },
  { dept_code: "FR", dept_name: "Fr drawing" },
  { dept_code: "CD", dept_name: "Carding" },
  { dept_code: "SX", dept_name: "Simplx" },
  { dept_code: "CB", dept_name: "Comber" },
];
const STATIC_MC_NO_OPTIONS = [
  "CDG-01","CDG-02","CDG-03","CDG-04","CDG-05","CDG-06","CDG-07","CDG-08","CDG-09","CDG-10",
  "CDG-11","CDG-12","CDG-13","CDG-14","CDG-15","CDG-16","CDG-17","CDG-18","CDG-19","CDG-20",
  "CDG-21","CDG-22","CDG-23","CDG-24","CDG-25","CDG-26","CDG-27",
  "SMX-01","SMX-02","SMX-03","SMX-04","SMX-05","SMX-06","SMX-07","SMX-08","SMX-09","SMX-10","SMX-11","SMX-12","SMX-13",
  "CBR-01","CBR-02","CBR-03","CBR-04","CBR-05","CBR-06",
  "FR HSR1000-1","FR HSR1000-2","FR D40","FR D50-1","FR D50-2","FR D45-1","FR D45-2","FR D45-3","FR D45-4","FR LRSB 581-1","FR LRSB 581-2","FR LDF3","FR D55-1",
  "BR SB-20","BR TD7-1","BR TD7-2","BR TD7-3","BR TD7-4","BR TD7-5","BR TD7-6",
].map((mc_no) => ({ mc_no }));
const U_PERCENT_NUMERIC_FIELDS = ["uPercent", "cvm", "oneMeterCvm", "threeMeterCvm"];
const A_PERCENT_TABLE_COLUMNS = [
  { key: "sampleNo", label: "Sample No" },
  { key: "nMinus1", label: "N-1" },
  { key: "n", label: "N" },
  { key: "nPlus1", label: "N+1" },
];
const A_PERCENT_SUMMARY_ROWS = new Set(["Average Weight", "Weight (Max)", "Weight (Min)", "Range", "Hank", "SD", "CV"]);
const A_PERCENT_META_FIELDS = [
  { key: "entryId", label: "Entry ID" },
  { key: "pdfFile", label: "PDF File" },
  { key: "reportTitle", label: "Report" },
  { key: "testId", label: "Test ID" },
  { key: "machine", label: "Machine" },
  { key: "countSystem", label: "Count System" },
  { key: "lengthUnit", label: "Length Unit" },
  { key: "length", label: "Length" },
  { key: "totalTest", label: "Total Test" },
  { key: "standardAPercent", label: "Standard A%" },
  { key: "aPercentNMinus1", label: "A% (N-1)" },
  { key: "aPercentNPlus1", label: "A% (N+1)" },
  { key: "date", label: "Date" },
  { key: "tester", label: "Tester" },
  { key: "shift", label: "Shift" },
  { key: "process", label: "Process" },
  { key: "remark", label: "Remark" },
];
const BREAKER_PREFIXES = String(process.env.NEXT_PUBLIC_DRAWFRAME_BREAKER_PREFIXES || "DFB,BR")
  .split(",")
  .map((v) => v.trim().toUpperCase())
  .filter(Boolean);
const FINISHER_PREFIXES = String(
  process.env.NEXT_PUBLIC_DRAWFRAME_FINISHER_PREFIXES || "DFF,FR"
)
  .split(",")
  .map((v) => v.trim().toUpperCase())
  .filter(Boolean);

const createMachineEntry = (machineName = "") => ({
  machineName,
  mcNo: "",
  fanWaste: "",
  cotChange: "",
  stripperWaste: "",
  thickPlace: "",
  autoLevel: "",
  silverMon: "",
  massThick: "",
  scanningR: "",
});

const matchesCotsTypePrefix = (machineName, processType) => {
  const normalized = String(machineName || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
  if (!normalized) return false;
  if (processType === "Breaker") {
    return BREAKER_PREFIXES.some((prefix) => normalized.startsWith(prefix.replace(/[^A-Z0-9]+/g, "")));
  }
  if (processType === "Finisher") {
    return FINISHER_PREFIXES.some((prefix) => normalized.startsWith(prefix.replace(/[^A-Z0-9]+/g, "")));
  }
  return true;
};

const getMachineCardDefaults = () => [];

const formatMetric = (value) => (Number.isFinite(value) ? value.toFixed(3) : "");
const formatHank = (value) => (Number.isFinite(value) ? value.toFixed(4) : "");

const emptyMetric = () => ({
  avg: "",
  hank: "",
  sd: "",
  cv: "",
});

const calculateStats = (values, hankNumerator) => {
  const numericValues = values.map(Number).filter((value) => Number.isFinite(value));
  if (!numericValues.length) return emptyMetric();

  const avg = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
  const variance =
    numericValues.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / numericValues.length;
  const sd = Math.sqrt(variance);
  const hank = avg > 0 ? hankNumerator / avg : NaN;
  const cv = avg > 0 ? (sd / avg) * 100 : NaN;

  return {
    avg: formatMetric(avg),
    hank: formatHank(hank),
    sd: formatMetric(sd),
    cv: formatMetric(cv),
  };
};

const mergeUniqueMachineNames = (names = [], staticNames = []) => {
  const seen = new Set();
  const merged = [];
  [...names, ...staticNames].forEach((name) => {
    const clean = String(name || "").trim();
    if (!clean) return;
    const key = clean.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(clean);
  });
  return merged;
};

const getObjectValueByAliases = (row, aliases = []) => {
  if (!row || typeof row !== "object" || Array.isArray(row)) return "";
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const aliasKey = String(alias).trim().toLowerCase();
    const match = entries.find(([key]) => String(key).trim().toLowerCase() === aliasKey);
    if (match) return match[1];
  }
  return "";
};

const normalizeAPercentJsonRows = (rows = []) =>
  rows
    .map((row) => {
      const sampleNo = getObjectValueByAliases(row, [
        "Sample No",
        "SampleNo",
        "Sample",
        "S.No",
        "S No",
        "s_no",
        "sample_no",
        "Label",
        "Summary",
        "Metric",
      ]);
      const nMinus1 = getObjectValueByAliases(row, ["N-1", "N - 1", "N_minus_1", "n_minus_1", "n-1"]);
      const n = getObjectValueByAliases(row, ["N", "n"]);
      const nPlus1 = getObjectValueByAliases(row, ["N+1", "N + 1", "N_plus_1", "n_plus_1", "n+1"]);

      return {
        sampleNo: normalizeOcrDisplayValue(sampleNo),
        nMinus1: normalizeOcrDisplayValue(nMinus1),
        n: normalizeOcrDisplayValue(n),
        nPlus1: normalizeOcrDisplayValue(nPlus1),
      };
    })
    .filter((row) => row.sampleNo || row.nMinus1 || row.n || row.nPlus1);

const isPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const normalizeCell = (value) => {
  return normalizeOcrDisplayValue(value);
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

const collectStructuredRows = (result = {}) => {
  const candidates = [
    result?.json_output,
    result?.rows,
    result?.data,
    result?.table,
    result?.tables,
    result?.extracted_tables,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || !candidate.length) continue;
    const directRows = rowsFromArrayTable(candidate);
    if (directRows.length) return directRows;

    for (const nested of candidate) {
      const nestedRows = rowsFromArrayTable(nested?.rows || nested?.data || nested?.table || nested);
      if (nestedRows.length) return nestedRows;
    }
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

const getOcrRowsFromGeneral = (result = {}) => {
  const structuredRows = collectStructuredRows(result);
  if (structuredRows.length) return structuredRows;
  return parseRawTextRows(result?.raw_text || result?.text || "");
};

const normalizeAPercentRowLabel = (value = "") => {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  const compact = clean.replace(/\s+/g, "").toLowerCase();
  if (!clean) return "";
  if (/^\d{1,3}$/.test(clean)) return clean;
  if (compact === "averageweight") return "Average Weight";
  if (/^weight\(?max\)?$/i.test(compact)) return "Weight (Max)";
  if (/^weight\(?min\)?$/i.test(compact)) return "Weight (Min)";
  if (compact === "range") return "Range";
  if (compact === "hank") return "Hank";
  if (compact === "sd") return "SD";
  if (compact === "cv") return "CV";
  return "";
};

const parseAPercentRawTextRows = (rawText = "") => {
  const rows = [];
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  lines.forEach((line) => {
    const match = line.match(
      /^(Average\s*Weight|Weight\s*\(Max\)|Weight\s*\(Min\)|Range|Hank|SD|CV|\d{1,3})\s+(\S+)\s+(\S+)\s+(\S+)$/i
    );
    if (!match) return;
    rows.push({
      sampleNo: normalizeAPercentRowLabel(match[1]),
      nMinus1: normalizeOcrDisplayValue(match[2]),
      n: normalizeOcrDisplayValue(match[3]),
      nPlus1: normalizeOcrDisplayValue(match[4]),
    });
  });

  if (rows.length) return rows;

  const sampleHeaderIndex = lines.findIndex((line) => /^sample\s*no$/i.test(line));
  if (sampleHeaderIndex === -1) return [];

  let cursor = sampleHeaderIndex + 1;
  while (cursor < lines.length && /^(n\s*-?\s*1|n|n\s*\+?\s*1)$/i.test(lines[cursor])) {
    cursor += 1;
  }

  while (cursor < lines.length) {
    const sampleNo = normalizeAPercentRowLabel(lines[cursor]);
    if (!sampleNo) {
      cursor += 1;
      continue;
    }

    const nMinus1 = lines[cursor + 1] || "";
    const n = lines[cursor + 2] || "";
    const nPlus1 = lines[cursor + 3] || "";
    if (!nMinus1 || !n || !nPlus1) break;

    rows.push({
      sampleNo,
      nMinus1: normalizeOcrDisplayValue(nMinus1),
      n: normalizeOcrDisplayValue(n),
      nPlus1: normalizeOcrDisplayValue(nPlus1),
    });
    cursor += 4;
  }

  return rows;
};

const getAPercentRowsFromOcrResult = (result, parsedRows = []) => {
  const jsonRows = normalizeAPercentJsonRows(parsedRows);
  if (jsonRows.length) return jsonRows;

  const rawTextRows = parseAPercentRawTextRows(result?.raw_text || result?.text || "");
  if (rawTextRows.length) return rawTextRows;

  const generalRows = getOcrRowsFromGeneral(result);
  const normalizedGeneralRows = normalizeAPercentJsonRows(generalRows);
  return normalizedGeneralRows.length ? normalizedGeneralRows : generalRows;
};

const firstTextLine = (lines = [], pattern) => lines.find((line) => pattern.test(line)) || "";

const getLabelValue = (text = "", label = "") => {
  const pattern = new RegExp(`(?:^|\\|)\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*([^|]*)`, "i");
  return normalizeOcrDisplayValue(text.match(pattern)?.[1] || "");
};

const getAPercentMetaFromOcrResult = (result = {}, rows = [], fileName = "", entryId = "") => {
  const rawLines = String(result?.raw_text || result?.text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const allText = rawLines.join(" | ");
  const structuredRows = getOcrRowsFromGeneral(result);
  const metaRow =
    structuredRows.find((row) => String(getObjectValueByAliases(row, ["Row Type", "row_type", "type"])).trim().toLowerCase() === "meta") ||
    {};
  const rowValue = (aliases) => normalizeOcrDisplayValue(getObjectValueByAliases(metaRow, aliases));

  return {
    entryId,
    pdfFile: fileName,
    reportTitle: normalizeOcrDisplayValue(firstTextLine(rawLines, /A%\s*Report/i)) || rowValue(["Report", "Report Title"]),
    testId: getLabelValue(allText, "Test ID") || rowValue(["Test ID", "Test Id", "test_id"]),
    machine: getLabelValue(allText, "Machine") || rowValue(["Machine", "Machine Name", "machine"]),
    countSystem: getLabelValue(allText, "Count System") || rowValue(["Count System", "count_system"]),
    lengthUnit: getLabelValue(allText, "Length Unit") || rowValue(["Length Unit", "length_unit"]),
    length: getLabelValue(allText, "Length") || rowValue(["Length"]),
    totalTest: getLabelValue(allText, "Total Test") || rowValue(["Total Test", "Total Tests", "total_test"]) || (rows.length ? String(rows.length) : ""),
    standardAPercent: getLabelValue(allText, "Standard A%") || rowValue(["Standard A%", "Std. A%", "standard_a_percent"]),
    aPercentNMinus1: getLabelValue(allText, "A% (N-1)") || rowValue(["A% (N-1)", "A Percent N-1", "a_percent_n_minus_1"]),
    aPercentNPlus1: getLabelValue(allText, "A% (N+1)") || rowValue(["A% (N+1)", "A Percent N+1", "a_percent_n_plus_1"]),
    date: getLabelValue(allText, "Date") || rowValue(["Date", "entry_date"]),
    tester: getLabelValue(allText, "Tester") || rowValue(["Tester", "User"]),
    shift: getLabelValue(allText, "Shift") || rowValue(["Shift"]),
    process: getLabelValue(allText, "Process") || rowValue(["Process"]),
    remark: getLabelValue(allText, "Remark") || rowValue(["Remark", "Remarks"]),
  };
};

const buildAPercentPayload = ({ entryId = "", file = null, rows = [], rawRows = [], meta = {} } = {}) => ({
  entry_id: entryId,
  filename: file?.name || meta.pdfFile || "",
  pdf_file: file?.name || meta.pdfFile || "",
  report_title: meta.reportTitle || "",
  test_id: meta.testId || "",
  machine: meta.machine || "",
  count_system: meta.countSystem || "",
  length_unit: meta.lengthUnit || "",
  length: meta.length || "",
  total_test: meta.totalTest || "",
  standard_a_percent: meta.standardAPercent || "",
  a_percent_n_minus_1: meta.aPercentNMinus1 || "",
  a_percent_n_plus_1: meta.aPercentNPlus1 || "",
  entry_date: meta.date || "",
  tester: meta.tester || "",
  shift: meta.shift || "",
  process: meta.process || "",
  remark: meta.remark || "",
  ocr_json: rawRows.length ? rawRows : rows,
  manual_json: rows,
  rows,
  meta,
});

function APercentFieldInput({ value, onChange, readOnly = false }) {
  return (
    <input
      readOnly={readOnly}
      value={value ?? ""}
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

function APercentMetaFields({ meta, onMetaChange }) {
  return (
    <section style={{ border: "1px solid #dbe3ef", borderRadius: 8, background: "#fff", padding: 14 }}>
      <div style={{ fontWeight: 800, color: "#111827", marginBottom: 12 }}>Meta</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        {A_PERCENT_META_FIELDS.map((field) => (
          <label key={field.key} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>{field.label}</span>
            <APercentFieldInput value={meta[field.key]} onChange={(value) => onMetaChange(field.key, value)} />
          </label>
        ))}
      </div>
    </section>
  );
}

function APercentDataTable({ title, rows, columns, onCellChange, emptyText }) {
  return (
    <section style={{ border: "1px solid #dbe3ef", borderRadius: 8, background: "#fff", overflowX: "auto" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid #e5eaf1", fontWeight: 800, color: "#111827" }}>
        {title}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: columns.length * 150 }}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} style={{ textAlign: "left", padding: "10px 12px", color: "#334155", fontSize: 12, borderBottom: "1px solid #dbe3ef" }}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => (
            <tr key={row.__rowIndex}>
              {columns.map((column) => (
                <td key={column.key} style={{ padding: "9px 12px", borderBottom: "1px solid #edf2f7", color: "#0f172a", fontSize: 13 }}>
                  <APercentFieldInput
                    value={row[column.key] ?? ""}
                    onChange={(value) => onCellChange(row.__rowIndex, column.key, value)}
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

function DrawFrame() {
  const currentDateLabel = new Date().toLocaleDateString("en-IN");
  const router = useRouter();
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth?.user);
  const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
  const requestedType = Array.isArray(router.query.type) ? router.query.type[0] : router.query.type;
  const isProcessParameterRequest = ["process parameter", "pp - breaker drawing", "pp - finisher drawing"].includes(
    normalizeTypeName(requestedType)
  );
  const fullTypeOptions = filterOptionsByDepartmentAccess(
    primaryTypeOptions,
    accessByDepartment,
    user,
    "Draw Frame"
  );
  const typeOptions = isProcessParameterRequest
    ? fullTypeOptions.filter((option) => option.name === "PP - Breaker Drawing" || option.name === "PP - Finisher Drawing")
    : fullTypeOptions.filter((option) => option.name !== "PP - Breaker Drawing" && option.name !== "PP - Finisher Drawing");
  const { actionLoading, actionSuccess, cotsEntries, uqcEntries, listLoading, error } = useSelector(
    (state) =>
      state.drawFrame ?? {
        actionLoading: false,
        actionSuccess: false,
        cotsEntries: [],
        uqcEntries: [],
        listLoading: false,
        error: null,
      }
  );

  const { isDarkMode } = useThemeMode();

  const entryTableTheme = {
    surface: isDarkMode ? "#050505" : "#ffffff",
    header: isDarkMode ? "#1f2937" : "#f3f4f6",
    rowEven: isDarkMode ? "#111827" : "#ffffff",
    rowOdd: isDarkMode ? "#0f172a" : "#f9fafb",
    border: isDarkMode ? "#374151" : "#e0e0e0",
    cellBorder: isDarkMode ? "#374151" : "#eef1f6",
    title: isDarkMode ? "#f8fafc" : "#16233b",
    headText: isDarkMode ? "#e2e8f0" : "#6b7280",
    text: isDarkMode ? "#f8fafc" : "#374151",
    muted: isDarkMode ? "#9ca3af" : "#6b7280",
    accent: isDarkMode ? "#60a5fa" : "#1d4ed8",
  };

  const [form, setForm] = useState({
    type: typeOptions[0]?.name || "",
    date: today,
    shift: "General",
    processType: "Breaker",
    machineNumber: "",
    remarks: "",
    readingCount: 5,
  });

  const [machineEntries, setMachineEntries] = useState([]);
  const [oneYardReadings, setOneYardReadings] = useState([]);
  const [halfYardReadings, setHalfYardReadings] = useState([]);
  const [oneYardMetrics, setOneYardMetrics] = useState([]);
  const [halfYardMetrics, setHalfYardMetrics] = useState([]);
  const [hasCalculated, setHasCalculated] = useState(false);
  const [errors, setErrors] = useState({});
  const [showPreview, setShowPreview] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const successHandledRef = useRef(false);
  const [wheelChangeSaving, setWheelChangeSaving] = useState(false);
  const [entrySeq, setEntrySeq] = useState(1);
  const cvMachineDropdownRef = useRef(null);
  const wheelChangeRef = useRef(null);
  const aPercentFileInputRef = useRef(null);
  const [machineNameOptions, setMachineNameOptions] = useState([]);
  const [yarnCvMachineOptions, setYarnCvMachineOptions] = useState([]);
  const [machineMasterByName, setMachineMasterByName] = useState({});
  const [aPercentFile, setAPercentFile] = useState(null);
  const [aPercentOcrBusy, setAPercentOcrBusy] = useState(false);
  const [aPercentOcrMessage, setAPercentOcrMessage] = useState("");
  const [aPercentOcrRows, setAPercentOcrRows] = useState([]);
  const [aPercentRawOcrRows, setAPercentRawOcrRows] = useState([]);
  const [aPercentOcrMeta, setAPercentOcrMeta] = useState({});
  const [uPercentForm, setUPercentForm] = useState({
    date: today,
    shift: "",
    variety: "",
    department: "",
    mcNo: "",
    uPercent: "",
    cvm: "",
    oneMeterCvm: "",
    threeMeterCvm: "",
    remarks: "",
  });
  const [uPercentShiftOptions, setUPercentShiftOptions] = useState(STATIC_SHIFT_OPTIONS.map((option) => option.value));
  const [uPercentVarietyOptions, setUPercentVarietyOptions] = useState([]);
  const [uPercentDepartmentOptions, setUPercentDepartmentOptions] = useState(
    STATIC_DEPARTMENT_OPTIONS.map((item) => item.dept_name)
  );
  const [uPercentMcNoOptions, setUPercentMcNoOptions] = useState(
    STATIC_MC_NO_OPTIONS.map((item) => item.mc_no)
  );
  const isUPercentEntry = form.type === "U% Data Entry";
  const isAPercentEntry = form.type === "A%";
  const isWheelChangeEntry = form.type === "Wheel Change";
  const isHeaderEntry =
    form.type === "PP - Breaker Drawing" || form.type === "PP - Finisher Drawing";
  const { entryId, reserveEntryId } = useDatabaseEntryId({
    department: "Draw Frame",
    typeName: form.type,
    config: {
      ...getDrawFrameEntryConfig(form.type),
      scope: form.type === "PP - Finisher Drawing" ? "finisher" : form.type === "PP - Breaker Drawing" ? "breaker" : "",
    },
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedSequence = Number(window.localStorage.getItem(DRAW_FRAME_ENTRY_SEQ_KEY));
    if (Number.isFinite(storedSequence) && storedSequence > 0) {
      setEntrySeq(storedSequence);
    }
  }, []);

  useEffect(() => {
    if (!typeOptions.some((option) => option.name === form.type)) {
      setForm((current) => ({
        ...current,
        type: typeOptions[0]?.name || "",
      }));
    }
  }, [form.type, typeOptions]);

  useEffect(() => {
    if (!requestedType || !typeOptions.length) return;

    const normalizedRequest = normalizeTypeName(requestedType);
    const matchedType = typeOptions.find((option) => {
      const names = [option.name, ...(option.aliases || [])].map(normalizeTypeName);
      return names.includes(normalizedRequest);
    });

    if (matchedType && matchedType.name !== form.type) {
      setForm((current) => ({
        ...current,
        type: matchedType.name,
        processType: matchedType.name === "PP - Finisher Drawing" ? "Finisher" : current.processType,
      }));
    }
  }, [form.type, requestedType, typeOptions]);

  useEffect(() => {
    let isMounted = true;

    const loadYarnCvMachineNames = async () => {
      try {
        const machines = await fetchDrawFrameMachineMaster({
          departmentCode: DRAW_FRAME_YARN_CV_DEPARTMENT_CODE,
        });
        if (!isMounted) return;
        const names = [];
        const nextMasterByName = {};
        machines.forEach((item) => {
          const machineName = normalizeMachineName(item);
          const mcNo = String(item?.mc_no || item?.machine_no || item?.machineNo || item?.mcNo || "").trim();
          if (!machineName) return;
          names.push(machineName);
          nextMasterByName[machineName] = { mcNo: mcNo || machineName };
        });
        setYarnCvMachineOptions(mergeUniqueMachineNames(names, cvMachineOptions));
        setMachineMasterByName(nextMasterByName);
      } catch (_error) {
        if (isMounted) {
          setYarnCvMachineOptions(mergeUniqueMachineNames([], cvMachineOptions));
          setMachineMasterByName({});
        }
      }
    };

    loadYarnCvMachineNames();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (form.type !== "Draw Frame Cots Data Entry") return;
    let isMounted = true;

    const loadCotsMachineNames = async () => {
      if (form.processType === "Breaker") {
        setMachineNameOptions([...STATIC_BR_COTS_MACHINE_NAMES]);
        return;
      }

      try {
        const machines = await fetchDrawFrameCotsMachineMaster({ subType: form.processType });
        const rawNames = machines
          .map((item) => String(item?.mc_name || item?.machine_number || "").trim())
          .filter(Boolean);
        const filteredNames = rawNames.filter((name) => matchesCotsTypePrefix(name, form.processType));
        const names = filteredNames.length ? filteredNames : rawNames;
        if (!isMounted) return;
        if (names.length) {
          const nextNames =
            form.processType === "Finisher"
              ? mergeUniqueMachineNames(names, STATIC_FR_MACHINE_NAMES)
              : names;
          setMachineNameOptions(nextNames);
          return;
        }
        const fallbackMachines = await fetchDrawFrameMachineMaster();
        const fallbackRawNames = fallbackMachines
          .map((item) => String(item?.mc_name || item?.machine_number || "").trim())
          .filter(Boolean);
        const filteredFallbackNames = fallbackRawNames.filter((name) =>
          matchesCotsTypePrefix(name, form.processType)
        );
        const fallbackNames = filteredFallbackNames.length ? filteredFallbackNames : fallbackRawNames;
        const nextFallbackNames =
          form.processType === "Finisher"
            ? mergeUniqueMachineNames(fallbackNames, STATIC_FR_MACHINE_NAMES)
            : fallbackNames;
        setMachineNameOptions(nextFallbackNames);
      } catch (_error) {
        if (!isMounted) return;
        try {
          const fallbackMachines = await fetchDrawFrameMachineMaster();
          const fallbackRawNames = fallbackMachines
            .map((item) => String(item?.mc_name || item?.machine_number || "").trim())
            .filter(Boolean);
          const filteredFallbackNames = fallbackRawNames.filter((name) =>
            matchesCotsTypePrefix(name, form.processType)
          );
          const fallbackNames = filteredFallbackNames.length ? filteredFallbackNames : fallbackRawNames;
          const nextFallbackNames =
            form.processType === "Finisher"
              ? mergeUniqueMachineNames(fallbackNames, STATIC_FR_MACHINE_NAMES)
              : fallbackNames;
          setMachineNameOptions(nextFallbackNames);
        } catch (_fallbackError) {
          setMachineNameOptions(
            form.processType === "Finisher" ? [...STATIC_FR_MACHINE_NAMES] : [...STATIC_BR_COTS_MACHINE_NAMES]
          );
        }
      }
    };

    loadCotsMachineNames();
    return () => {
      isMounted = false;
    };
  }, [form.type, form.processType]);

  useEffect(() => {
    if (!isUPercentEntry) return;

    let isMounted = true;
    fetchDrawFrameUqcMasterDropdown()
      .then((dropdown) => {
        if (!isMounted) return;
        setUPercentShiftOptions(dropdown.shifts?.length ? dropdown.shifts : STATIC_SHIFT_OPTIONS.map((option) => option.value));
        setUPercentVarietyOptions(dropdown.varietyNames?.length ? dropdown.varietyNames : []);
        setUPercentDepartmentOptions(
          dropdown.departmentNames?.length
            ? dropdown.departmentNames
            : STATIC_DEPARTMENT_OPTIONS.map((item) => item.dept_name)
        );
        setUPercentMcNoOptions(
          dropdown.mcNos?.length
            ? dropdown.mcNos
            : STATIC_MC_NO_OPTIONS.map((item) => item.mc_no)
        );
      })
      .catch(() => {
        if (!isMounted) return;
        setUPercentShiftOptions(STATIC_SHIFT_OPTIONS.map((option) => option.value));
        setUPercentVarietyOptions([]);
        setUPercentDepartmentOptions(STATIC_DEPARTMENT_OPTIONS.map((item) => item.dept_name));
        setUPercentMcNoOptions(STATIC_MC_NO_OPTIONS.map((item) => item.mc_no));
      });

    return () => {
      isMounted = false;
    };
  }, [isUPercentEntry]);

  const handleFormChange = (field, value) => {
    const normalizedValue = field === "type" ? getTypeName(value) : value;
    const nextValue = field === "readingCount" ? Number(value) || 0 : normalizedValue;
    setForm((current) => ({
      ...current,
      [field]: nextValue,
      ...(field === "type"
        ? {
            processType: nextValue === "PP - Finisher Drawing" ? "Finisher" : "Breaker",
          }
        : {}),
    }));
    setErrors((prev) => {
      if (!prev.header?.[field]) return prev;
      const nextHeader = { ...(prev.header || {}) };
      delete nextHeader[field];
      return { ...prev, header: nextHeader };
    });

    if (field === "type") {
      const nextRoute = getDrawFrameEntryConfig(nextValue)?.routePath;
      if (nextRoute && nextRoute !== router.asPath.split("?")[0]) {
        router.push(nextRoute);
      }
    }
  };

  const handleMachineChange = (index, field, value) => {
    setMachineEntries((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
              ...(field === "machineName"
                ? { mcNo: machineMasterByName[value]?.mcNo || item.mcNo || "" }
                : {}),
            }
          : item
      )
    );
    setErrors((prev) => {
      const machineErrs = prev.machines ? [...prev.machines] : [];
      if (machineErrs[index]?.[field]) {
        const nextMachineErr = { ...(machineErrs[index] || {}) };
        delete nextMachineErr[field];
        machineErrs[index] = nextMachineErr;
        return { ...prev, machines: machineErrs };
      }
      return prev;
    });
  };

  const handleReadingChange = (setter, errorKey, index, value) => {
    const nextValue = sanitizeNumericInput(value, { precision: 10, scale: 3 });
    setter((current) => current.map((item, itemIndex) => (itemIndex === index ? nextValue : item)));
    setHasCalculated(false);
    setOneYardMetrics([]);
    setHalfYardMetrics([]);
    setErrors((prev) => {
      const nextHeader = { ...(prev.header || {}) };
      delete nextHeader.calculation;
      const arr = prev[errorKey] ? [...prev[errorKey]] : [];
      if (!arr[index]?.reading) return { ...prev, header: nextHeader };
      const nextReadingErr = { ...(arr[index] || {}) };
      delete nextReadingErr.reading;
      arr[index] = nextReadingErr;
      return { ...prev, header: nextHeader, [errorKey]: arr };
    });
  };

  const handleGenerate = () => {
    const count = Math.max(Number(form.readingCount) || 0, 0);
    setOneYardReadings(Array.from({ length: count }, () => ""));
    setHalfYardReadings(Array.from({ length: count }, () => ""));
    setOneYardMetrics([]);
    setHalfYardMetrics([]);
    setHasCalculated(false);
    setErrors((prev) => {
      const nextHeader = { ...(prev.header || {}) };
      delete nextHeader.readingCount;
      delete nextHeader.calculation;
      return { ...prev, header: nextHeader, oneYard: [], halfYard: [] };
    });
  };

  const handleUPercentChange = (field, value) => {
    const nextValue = U_PERCENT_NUMERIC_FIELDS.includes(field)
      ? sanitizeNumericInput(value, { precision: 10, scale: 2 })
      : value;

    setUPercentForm((current) => ({
      ...current,
      [field]: nextValue,
    }));
    setErrors((prev) => {
      if (!prev.uPercent?.[field]) return prev;
      const nextUPercent = { ...(prev.uPercent || {}) };
      delete nextUPercent[field];
      return { ...prev, uPercent: nextUPercent };
    });
  };

  const handleAPercentFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setAPercentFile(file);
    setAPercentOcrMessage("");
    setAPercentOcrRows([]);
    setAPercentRawOcrRows([]);
    setAPercentOcrMeta({});
    setErrors((prev) => {
      if (!prev.aPercent?.file) return prev;
      const nextAPercent = { ...(prev.aPercent || {}) };
      delete nextAPercent.file;
      return { ...prev, aPercent: nextAPercent };
    });
  };

  const clearAPercentFile = () => {
    setAPercentFile(null);
    setAPercentOcrBusy(false);
    setAPercentOcrMessage("");
    setAPercentOcrRows([]);
    setAPercentRawOcrRows([]);
    setAPercentOcrMeta({});
    if (aPercentFileInputRef.current) {
      aPercentFileInputRef.current.value = "";
    }
    setErrors((prev) => ({ ...prev, aPercent: {} }));
  };

  const handleAPercentRunOcr = async () => {
    if (!aPercentFile || aPercentOcrBusy) return;
    setAPercentOcrBusy(true);
    setAPercentOcrMessage("Running OCR...");
    setAPercentOcrRows([]);
    setAPercentRawOcrRows([]);
    try {
      const result = await runOcrForDocument({ file: aPercentFile, docType: "a_percent" });
      const parsedRows = Array.isArray(result?.json_output) ? result.json_output : [];
      const aPercentRows = getAPercentRowsFromOcrResult(result, parsedRows).map(normalizeOcrDisplayRow);
      const aPercentMeta = getAPercentMetaFromOcrResult(result, aPercentRows, aPercentFile?.name || "", entryId);
      setAPercentOcrRows(aPercentRows);
      setAPercentRawOcrRows(parsedRows);
      setAPercentOcrMeta(aPercentMeta);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "ocr_prefill",
          JSON.stringify({
            screen: "draw-frame",
            docType: "a_percent",
            values: aPercentRows[0] || {},
            meta: aPercentMeta,
            result: { ...result, json_output: aPercentRows, meta: aPercentMeta },
          })
        );
      }
      setAPercentOcrMessage(
        aPercentRows.length ? "OCR completed. Extracted values are ready." : "OCR completed, but no table rows were returned."
      );
    } catch (ocrError) {
      setAPercentOcrMessage(ocrError?.message || "OCR failed. Please try again.");
    } finally {
      setAPercentOcrBusy(false);
    }
  };

  const aPercentRowsWithIndex = useMemo(
    () => aPercentOcrRows.map((row, index) => ({ ...row, __rowIndex: index })),
    [aPercentOcrRows]
  );
  const aPercentSampleRows = useMemo(
    () =>
      aPercentRowsWithIndex.filter((row) => {
        const label = String(row.sampleNo || "").trim();
        return label && !A_PERCENT_SUMMARY_ROWS.has(label);
      }),
    [aPercentRowsWithIndex]
  );
  const aPercentSummaryRows = useMemo(
    () =>
      aPercentRowsWithIndex.filter((row) =>
        A_PERCENT_SUMMARY_ROWS.has(String(row.sampleNo || "").trim())
      ),
    [aPercentRowsWithIndex]
  );
  const aPercentMeta = useMemo(
    () => ({
      entryId,
      pdfFile: aPercentFile?.name || "",
      ...aPercentOcrMeta,
    }),
    [aPercentFile?.name, aPercentOcrMeta, entryId]
  );

  const handleAPercentOcrCellChange = (rowIndex, field, value) => {
    setAPercentOcrRows((current) =>
      current.map((row, index) => (index === rowIndex ? { ...row, [field]: value } : row))
    );
  };

  const handleAPercentOcrMetaChange = (field, value) => {
    setAPercentOcrMeta((current) => ({ ...current, [field]: value }));
  };

  const handleCalculate = () => {
    const count = Math.max(form.readingCount || 0, oneYardReadings.length, halfYardReadings.length);
    const oneErrors = [];
    const halfErrors = [];

    Array.from({ length: count }).forEach((_, index) => {
      if (oneYardReadings[index] === "") oneErrors[index] = { reading: true };
      if (halfYardReadings[index] === "") halfErrors[index] = { reading: true };
    });

    if (oneErrors.some(Boolean) || halfErrors.some(Boolean)) {
      setErrors((prev) => ({ ...prev, oneYard: oneErrors, halfYard: halfErrors }));
      setHasCalculated(false);
      setOneYardMetrics([]);
      setHalfYardMetrics([]);
      return;
    }

    setOneYardMetrics([calculateStats(oneYardReadings, 0.54)]);
    setHalfYardMetrics([calculateStats(halfYardReadings, 0.27)]);
    setErrors((prev) => {
      const nextHeader = { ...(prev.header || {}) };
      delete nextHeader.calculation;
      return { ...prev, header: nextHeader, oneYard: [], halfYard: [] };
    });
    setHasCalculated(true);
  };

  const handleClear = () => {
    setForm({
      type: "1 Yard / Half Yard CV Entry",
      date: today,
      shift: "General",
      processType: "Breaker",
      serialNumber: "",
      machineNumber: "",
      remarks: "",
      readingCount: 5,
    });
    setMachineEntries([]);
    setOneYardReadings([]);
    setHalfYardReadings([]);
    setOneYardMetrics([]);
    setHalfYardMetrics([]);
    setHasCalculated(false);
    clearAPercentFile();
    setUPercentForm({
      date: today,
      shift: "",
      variety: "",
      department: "",
      mcNo: "",
      uPercent: "",
      cvm: "",
      oneMeterCvm: "",
      threeMeterCvm: "",
      remarks: "",
    });
    setErrors({});
    wheelChangeRef.current?.clear?.();
    dispatch(clearDrawFrameState());
  };

  const handleSuccessClose = () => {
    setShowSuccess(false);
    successHandledRef.current = false;
    handleClear();
    dispatch(clearDrawFrameState());
  };

  const showSuccessOnce = () => {
    if (successHandledRef.current) return;
    successHandledRef.current = true;
    setShowSuccess(true);
  };

  useEffect(() => {
    if (form.type !== "Draw Frame Cots Data Entry") return;
    setMachineEntries((current) => {
      const names = machineNameOptions;

      return names.map((machineName, index) => ({
        ...createMachineEntry(machineName),
        ...current[index],
        machineName,
      }));
    });
  }, [form.processType, form.type, machineNameOptions]);

  useEffect(() => {
    if (form.type === "Draw Frame Cots Data Entry") {
      dispatch(fetchDrawFrameCotsEntries({ page: 1, limit: 10 }));
    }
    if (form.type === "U% Data Entry") {
      dispatch(fetchDrawFrameUqcEntries({ page: 1, limit: 10 }));
    }
  }, [dispatch, form.type]);

  const validate = () => {
    const isCots = form.type === "Draw Frame Cots Data Entry";
    const headerErrors = {};
    const machineErrors = [];
    const oneErrors = [];
    const halfErrors = [];

    if (form.type === "U% Data Entry") {
      if (!uPercentForm.date) headerErrors.date = true;

      const uPercentErrors = {};
      if (!uPercentForm.shift) uPercentErrors.shift = true;
      if (!uPercentForm.variety) uPercentErrors.variety = true;
      if (!uPercentForm.department) uPercentErrors.department = true;
      if (!uPercentForm.mcNo) uPercentErrors.mcNo = true;
      if (!uPercentForm.uPercent) uPercentErrors.uPercent = true;
      if (!uPercentForm.cvm) uPercentErrors.cvm = true;
      if (!uPercentForm.oneMeterCvm) uPercentErrors.oneMeterCvm = true;
      if (!uPercentForm.threeMeterCvm) uPercentErrors.threeMeterCvm = true;
      if (!uPercentForm.remarks.trim()) uPercentErrors.remarks = true;

      const hasErrors =
        Object.keys(headerErrors).length > 0 || Object.keys(uPercentErrors).length > 0;

      setErrors({
        header: headerErrors,
        uPercent: uPercentErrors,
        machines: [],
        oneYard: [],
        halfYard: [],
      });

      return !hasErrors;
    }

    if (form.type === "A%") {
      const aPercentErrors = {};
      if (!aPercentFile) aPercentErrors.file = true;
      if (!aPercentOcrRows.length) aPercentErrors.ocrRows = true;

      setErrors({
        header: {},
        aPercent: aPercentErrors,
        machines: [],
        oneYard: [],
        halfYard: [],
      });

      const isValid = Object.keys(aPercentErrors).length === 0;
      if (!isValid && aPercentFile && !aPercentOcrRows.length) {
        setAPercentOcrMessage("Please run OCR before saving A% data.");
      }
      return isValid;
    }

    if (isWheelChangeEntry) {
      return wheelChangeRef.current?.validate?.() ?? true;
    }

    if (isHeaderEntry) {
      return false;
    }

    if (isCots) {
      if (!form.date) headerErrors.date = true;
      if (!form.shift) headerErrors.shift = true;
      if (!form.processType) headerErrors.processType = true;

      machineEntries.forEach((item) => {
        const errs = {};
        if (!item.machineName.trim()) errs.machineName = true;
        if (item.fanWaste === "") errs.fanWaste = true;
        if (item.cotChange === "") errs.cotChange = true;
        if (item.stripperWaste === "") errs.stripperWaste = true;
        if (form.processType === "Finisher") {
          if (item.autoLevel === "") errs.autoLevel = true;
          if (item.silverMon === "") errs.silverMon = true;
          if (item.massThick === "") errs.massThick = true;
          if (item.scanningR === "") errs.scanningR = true;
        }
        machineErrors.push(errs);
      });
    } else {
      if (!form.date.trim()) headerErrors.date = true;
      if (!form.machineNumber.trim()) headerErrors.machineNumber = true;
      if (!form.remarks.trim()) headerErrors.remarks = true;
      if (!form.readingCount || form.readingCount <= 0) headerErrors.readingCount = true;

      const ensureMetricCount = Math.max(form.readingCount || 0, 1);
      const paddedOne = oneYardReadings.length ? oneYardReadings : Array.from({ length: ensureMetricCount }, () => "");
      const paddedHalf = halfYardReadings.length ? halfYardReadings : Array.from({ length: ensureMetricCount }, () => "");

      paddedOne.forEach((value) => {
        oneErrors.push(value === "" ? { reading: true } : {});
      });
      paddedHalf.forEach((value) => {
        halfErrors.push(value === "" ? { reading: true } : {});
      });
      if (!hasCalculated || !oneYardMetrics[0]?.cv || !halfYardMetrics[0]?.cv) {
        headerErrors.calculation = true;
      }
    }

    const hasErrors =
      Object.keys(headerErrors).length > 0 ||
      machineErrors.some((m) => Object.keys(m).length) ||
      oneErrors.some((m) => Object.keys(m).length) ||
      halfErrors.some((m) => Object.keys(m).length);

    setErrors({
      header: headerErrors,
      machines: machineErrors,
      oneYard: oneErrors,
      halfYard: halfErrors,
    });

    return !hasErrors;
  };

  const buildPreviewItems = useMemo(() => {
    const items = [];
    if (form.type === "Draw Frame Cots Data Entry") {
      items.push({ label: "Type", value: form.type });
      items.push({ label: "Date", value: form.date });
      items.push({ label: "Shift", value: form.shift });
      items.push({ label: "Process Type", value: form.processType });
      machineEntries.forEach((m, idx) => {
        items.push({ label: `Machine ${idx + 1}`, value: m.machineName });
        items.push({ label: "Fan Waste", value: m.fanWaste || "-" });
        items.push({ label: "Cot Change", value: m.cotChange || "-" });
        items.push({ label: "Stripper Waste", value: m.stripperWaste || "-" });
        if (form.processType === "Finisher") {
          items.push({ label: "Auto Level", value: m.autoLevel || "-" });
          items.push({ label: "Silver Monitor", value: m.silverMon || "-" });
          items.push({ label: "Mass Thick Place", value: m.massThick || "-" });
          items.push({ label: "Scanning Roller", value: m.scanningR || "-" });
        }
      });
    } else if (form.type === "U% Data Entry") {
      items.push({ label: "Type", value: form.type });
      items.push({ label: "Date", value: uPercentForm.date });
      items.push({ label: "Shift", value: uPercentForm.shift });
      items.push({ label: "Variety", value: uPercentForm.variety });
      items.push({ label: "Department", value: uPercentForm.department });
      items.push({ label: "MC No.", value: uPercentForm.mcNo });
      items.push({ label: "U%", value: uPercentForm.uPercent });
      items.push({ label: "CV in Metres", value: uPercentForm.cvm });
      items.push({ label: "1m CV in Metres", value: uPercentForm.oneMeterCvm });
      items.push({ label: "3m CV in Metres", value: uPercentForm.threeMeterCvm });
      items.push({ label: "Remarks", value: uPercentForm.remarks });
    } else if (form.type === "A%") {
      items.push({ label: "Type", value: form.type });
      items.push({ label: "Entry ID", value: entryId });
      items.push({ label: "PDF File", value: aPercentFile?.name || "-" });
      items.push({ label: "Sample Rows", value: aPercentOcrRows.filter((row) => !A_PERCENT_SUMMARY_ROWS.has(row.sampleNo)).length });
      items.push({ label: "Summary Rows", value: aPercentOcrRows.filter((row) => A_PERCENT_SUMMARY_ROWS.has(row.sampleNo)).length });
    } else if (isWheelChangeEntry) {
      items.push(...(wheelChangeRef.current?.getPreviewData?.() || []));
    } else if (!isHeaderEntry) {
      items.push({ label: "Type", value: form.type });
      items.push({ label: "Date", value: form.date });
      items.push({ label: "Machine Number", value: form.machineNumber });
      items.push({ label: "Remarks", value: form.remarks });
      items.push({ label: "Number of Readings (N)", value: form.readingCount });
      const ensureMetricCount = Math.max(form.readingCount || 0, oneYardReadings.length, halfYardReadings.length, 1);
      const paddedOne = oneYardReadings.length ? oneYardReadings : Array.from({ length: ensureMetricCount }, () => "");
      const paddedHalf = halfYardReadings.length ? halfYardReadings : Array.from({ length: ensureMetricCount }, () => "");

      Array.from({ length: ensureMetricCount }).forEach((_, idx) => {
        items.push({ label: `Reading ${idx + 1} - 1 Yard`, value: paddedOne[idx] || "-" });
        items.push({ label: `Reading ${idx + 1} - 1/2 Yard`, value: paddedHalf[idx] || "-" });
      });
      items.push({ label: "AVG (1Y)", value: oneYardMetrics[0]?.avg || "-" });
      items.push({ label: "HANK (1Y)", value: oneYardMetrics[0]?.hank || "-" });
      items.push({ label: "SD (1Y)", value: oneYardMetrics[0]?.sd || "-" });
      items.push({ label: "CV% (1Y)", value: oneYardMetrics[0]?.cv || "-" });
      items.push({ label: "AVG (1/2Y)", value: halfYardMetrics[0]?.avg || "-" });
      items.push({ label: "HANK (1/2Y)", value: halfYardMetrics[0]?.hank || "-" });
      items.push({ label: "SD (1/2Y)", value: halfYardMetrics[0]?.sd || "-" });
      items.push({ label: "CV% (1/2Y)", value: halfYardMetrics[0]?.cv || "-" });
    }
    return items;
  }, [aPercentFile, aPercentOcrRows, entryId, form, isHeaderEntry, isWheelChangeEntry, machineEntries, oneYardReadings, halfYardReadings, oneYardMetrics, halfYardMetrics, uPercentForm]);

  const handleSubmit = async () => {
    const isCots = form.type === "Draw Frame Cots Data Entry";
    
    if (!validate()) return;

    if (form.type === "U% Data Entry") {
      dispatch(
        submitDrawFrameUqcInspection({
          entry_id: entryId,
          entry_type: form.type,
          entry_date: uPercentForm.date,
          shift: uPercentForm.shift,
          variety: uPercentForm.variety,
          department: uPercentForm.department,
          mc_no: uPercentForm.mcNo,
          u_percent: uPercentForm.uPercent,
          cvm: uPercentForm.cvm,
          cvm_1m: uPercentForm.oneMeterCvm,
          cvm_3m: uPercentForm.threeMeterCvm,
          remarks: uPercentForm.remarks,
        })
      ).then((result) => {
        if (submitDrawFrameUqcInspection.fulfilled.match(result)) {
          recordSubmittedNotebook({
            department: "Quality Control",
            subDepartment: "Draw Frame",
            notebookName: form.type,
            entryId,
            previewItems: buildPreviewItems,
            user,
            extra: {
              submitted_fields: {
                entry_id: entryId,
                entry_type: form.type,
                entry_date: uPercentForm.date,
                shift: uPercentForm.shift,
                variety: uPercentForm.variety,
                department: uPercentForm.department,
                mc_no: uPercentForm.mcNo,
                u_percent: uPercentForm.uPercent,
                cvm: uPercentForm.cvm,
                cvm_1m: uPercentForm.oneMeterCvm,
                cvm_3m: uPercentForm.threeMeterCvm,
                remarks: uPercentForm.remarks,
              },
            },
          }).catch((error) => console.error("Submitted notebook creation failed:", error));
          dispatch(fetchDrawFrameUqcEntries({ page: 1, limit: 10 }));
        }
      });
      return;
    }

    if (form.type === "A%") {
      try {
        await submitDrawFrameAPercentInspection(buildAPercentPayload({
          entryId,
          file: aPercentFile,
          rows: aPercentOcrRows,
          rawRows: aPercentRawOcrRows,
          meta: aPercentMeta,
        }));
        await recordSubmittedNotebook({
          department: "Quality Control",
          subDepartment: "Draw Frame",
          notebookName: form.type,
          entryId,
          previewItems: buildPreviewItems,
          user,
          extra: {
            submitted_fields: buildAPercentPayload({
              entryId,
              file: aPercentFile,
              rows: aPercentOcrRows,
              rawRows: aPercentRawOcrRows,
              meta: aPercentMeta,
            }),
          },
        });
        reserveEntryId();
        showSuccessOnce();
      } catch (submitError) {
        setAPercentOcrMessage(submitError?.message || "Unable to save A% data.");
      }
      return;
    }

    if (isWheelChangeEntry) {
      const payload = wheelChangeRef.current?.getPayload?.() || {};
      const wheelChangePreviewItems = wheelChangeRef.current?.getPreviewData?.() || [];
      setWheelChangeSaving(true);
      try {
        await submitDrawFrameWheelChangeEntry(payload);
        await recordSubmittedNotebook({
          department: "Quality Control",
          subDepartment: "Draw Frame",
          notebookName: form.type,
          entryId,
          previewItems: wheelChangePreviewItems,
          user,
          extra: {
            submitted_fields: payload,
          },
        }).catch((error) => console.error("Submitted notebook creation failed:", error));
        reserveEntryId();
        await wheelChangeRef.current?.loadLatestSaved?.();
        showSuccessOnce();
      } catch (submitError) {
        setErrors((current) => ({
          ...current,
          wheelChange: submitError?.message || "Unable to save draw frame wheel change data.",
        }));
      } finally {
        setWheelChangeSaving(false);
      }
      return;
    }

    const payload = isCots
      ? {
          entry_id: entryId,
          sub_type: form.processType,
          entry_date: form.date,
          shift: form.shift,
          machines: machineEntries.map((item) => ({
            mc_name: item.machineName,
            mc_no: item.mcNo || item.machineName,
            fan_waste: Number(item.fanWaste) || 0,
            cot_change: Number(item.cotChange) || 0,
            stripper_w: Number(item.stripperWaste) || 0,
            thick_place: Number(item.thickPlace) || 0,
            auto_level: Number(item.autoLevel) || 0,
            silver_worn: Number(item.silverMon) || 0,
            main_tin: Number(item.massThick) || 0,
            scanning: Number(item.scanningR) || 0,
          })),
        }
      : {
        entry_id: entryId,
        type: form.type,
        entry_date: form.date,
          machine_number: form.machineNumber,
          remarks: form.remarks,
          num_readings: Number(form.readingCount),
          results: {
            avg_1yd: Number(oneYardMetrics[0]?.avg) || 0,
            hank_1yd: Number(oneYardMetrics[0]?.hank) || 0,
            sd_1yd: Number(oneYardMetrics[0]?.sd) || 0,
            cv_1yd: Number(oneYardMetrics[0]?.cv) || 0,
            avg_half: Number(halfYardMetrics[0]?.avg) || 0,
            hank_half: Number(halfYardMetrics[0]?.hank) || 0,
            sd_half: Number(halfYardMetrics[0]?.sd) || 0,
            cv_half: Number(halfYardMetrics[0]?.cv) || 0,
          },
        };

    dispatch(isCots ? submitDrawFrameCotsInspection(payload) : submitDrawFrameYarnCvInspection(payload))
      .then((result) => {
        const fulfilled = isCots
          ? submitDrawFrameCotsInspection.fulfilled.match(result)
          : submitDrawFrameYarnCvInspection.fulfilled.match(result);
        if (!fulfilled) return;
        recordSubmittedNotebook({
          department: "Quality Control",
          subDepartment: "Draw Frame",
          notebookName: form.type,
          entryId,
          previewItems: buildPreviewItems,
          user,
          extra: {
            submitted_fields: payload,
          },
        }).catch((error) => console.error("Submitted notebook creation failed:", error));
      });
  };

  const openPreview = () => {
    if (!validate()) return;
    setPreviewItems(isWheelChangeEntry ? wheelChangeRef.current?.getPreviewData?.() || [] : buildPreviewItems);
    setShowPreview(true);
  };

  useEffect(() => {
    if (actionSuccess) {
      reserveEntryId();
      if (form.type === "Draw Frame Cots Data Entry") {
        dispatch(fetchDrawFrameCotsEntries({ page: 1, limit: 10 }));
      }
      if (form.type === "U% Data Entry") {
        dispatch(fetchDrawFrameUqcEntries({ page: 1, limit: 10 }));
      }
      showSuccessOnce();
    }
  }, [actionSuccess, dispatch, form.type, reserveEntryId]);

  const formatListDate = (value) => {
    if (!value) return "-";
    const dateValue = new Date(value);
    return Number.isNaN(dateValue.getTime()) ? "-" : dateValue.toLocaleDateString("en-GB");
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Quality Control - Draw Frame Notebook</h1>
          <div className="mt-2 text-right text-base font-semibold text-slate-600">Current Date: {currentDateLabel}</div>
        </div>

        {isHeaderEntry ? (
          <DrawFrameHeaderEntry
            entryId={entryId}
            typeOptions={typeOptions}
            selectedType={form.type}
            onTypeChange={(value) => handleFormChange("type", value)}
          />
        ) : isWheelChangeEntry ? (
          <div className={`${styles.card} ${styles.inspectionCard}`}>
            <div className={styles.cardBody}>
              <WheelChange
                ref={wheelChangeRef}
                selectedTypeName={form.type}
                typeOptions={typeOptions}
                entryId={entryId}
                onTypeChange={(value) => handleFormChange("type", value)}
              />

              {error ? <p className={styles.messageError}>{error}</p> : null}
              {errors.wheelChange ? <p className={styles.messageError}>{errors.wheelChange}</p> : null}
            </div>

            <Footer
              onBack={() => router.push("/departments/quality-control")}
              onClear={handleClear}
              onSave={openPreview}
              saveLabel={actionLoading || wheelChangeSaving ? "Submitting..." : "Save Record"}
              disabled={actionLoading || wheelChangeSaving}
            />
          </div>
        ) : isAPercentEntry ? (
          <div className={styles.aPercentWrap}>
            <div className={`${styles.field} ${styles.aPercentTypeField}`}>
              <label className={styles.label}>Type</label>
              <select
                value={form.type}
                onChange={(e) => handleFormChange("type", e.target.value)}
                className={styles.select}
              >
                {typeOptions.map((option) => (
                  <option key={option.id} value={option.name}>
                    {option.displayName ?? option.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.aPercentUploadCard}>
              <input
                ref={aPercentFileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className={styles.aPercentFileInput}
                onChange={handleAPercentFileChange}
              />
              <MdInsertDriveFile className={styles.aPercentFileIcon} aria-hidden="true" />
              <p className={styles.aPercentUploadTitle}>
                {aPercentFile?.name || "Select the PDF File"}
              </p>
              {aPercentFile ? (
                <>
                  <div className={styles.aPercentOcrActions}>
                    <button
                      type="button"
                      className={styles.aPercentCancelButton}
                      onClick={clearAPercentFile}
                      disabled={aPercentOcrBusy}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={styles.aPercentRunOcrButton}
                      onClick={handleAPercentRunOcr}
                      disabled={aPercentOcrBusy}
                    >
                      {aPercentOcrBusy ? "Running..." : "Run OCR"}
                    </button>
                  </div>
                  {aPercentOcrMessage ? (
                    <p className={styles.aPercentOcrMessage}>{aPercentOcrMessage}</p>
                  ) : null}
                </>
              ) : (
                <button
                  type="button"
                  className={styles.aPercentBrowseButton}
                  onClick={() => aPercentFileInputRef.current?.click()}
                >
                  Browse File
                </button>
              )}
              {errors.aPercent?.file ? (
                <p className={styles.aPercentError}>Please select a PDF file.</p>
              ) : null}
            </div>

            {aPercentOcrRows.length > 0 ? (
              <div className={styles.aPercentTableSection}>
                <div className={styles.aPercentTableHeader}>
                  <h3 className={styles.aPercentTableTitle}>PDF Values</h3>
                  <span className={styles.aPercentTableCount}>
                    {aPercentOcrRows.length} {aPercentOcrRows.length === 1 ? "row" : "rows"}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <APercentMetaFields meta={aPercentMeta} onMetaChange={handleAPercentOcrMetaChange} />
                  <APercentDataTable
                    title="Sample Rows"
                    rows={aPercentSampleRows}
                    columns={A_PERCENT_TABLE_COLUMNS}
                    onCellChange={handleAPercentOcrCellChange}
                    emptyText="No sample rows found."
                  />
                  <APercentDataTable
                    title="Summary Rows"
                    rows={aPercentSummaryRows}
                    columns={[
                      { key: "sampleNo", label: "Label" },
                      ...A_PERCENT_TABLE_COLUMNS.slice(1),
                    ]}
                    onCellChange={handleAPercentOcrCellChange}
                    emptyText="No summary rows found."
                  />
                </div>
              </div>
            ) : null}

            <div className={styles.aPercentFooter}>
              <button
                type="button"
                className={styles.aPercentBackButton}
                onClick={() => router.push("/departments/quality-control")}
              >
                <span aria-hidden="true">←</span>
                Back to Dashboard
              </button>

              <div className={styles.aPercentActions}>
                <button
                  type="button"
                  className={styles.aPercentClearButton}
                  onClick={clearAPercentFile}
                >
                  Clear Form
                </button>
                <button type="button" className={styles.aPercentSaveButton} onClick={openPreview}>
                  Save Record
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className={`${styles.card} ${styles.inspectionCard}`}>
            <div className={styles.cardBody}>
              <div className={styles.sectionHeader}>
                <MdOutlineEditNote className={styles.sectionIcon} />
                <h2 className={styles.sectionTitle}>Inspection Data Entry</h2>
                <InputScreenUploadButton className="ml-auto" />
              </div>
              <div className={styles.sectionDivider} />

              {!typeOptions.length ? (
                <div className={styles.messageInfo}>
                  No accessible input screens are available for this department.
                </div>
              ) : null}

              {isUPercentEntry ? (
              <div className={uPercentStyles.formGrid}>
                <div className={uPercentStyles.field}>
                  <label>Type</label>
                  <select value={form.type} onChange={(e) => handleFormChange("type", e.target.value)}>
                    {typeOptions.map((option) => (
                      <option key={option.id} value={option.name}>
                        {option.displayName ?? option.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={uPercentStyles.field}>
                  <label>Entry ID</label>
                  <input type="text" value={entryId} readOnly disabled className={errors.header?.date ? uPercentStyles.errorField : ""} />
                </div>

                <div className={uPercentStyles.field}>
                  <label>Shift</label>
                  <SearchableSelect
                    value={uPercentForm.shift}
                    onChange={(value) => handleUPercentChange("shift", value)}
                    className={errors.uPercent?.shift ? uPercentStyles.errorField : ""}
                    options={uPercentShiftOptions}
                    placeholder="-- Select Shift --"
                    ariaLabel="Shift"
                  />
                </div>

                <div className={uPercentStyles.field}>
                  <label>Variety</label>
                  <SearchableSelect
                    value={uPercentForm.variety}
                    onChange={(value) => handleUPercentChange("variety", value)}
                    options={uPercentVarietyOptions}
                    placeholder="-- Select Variety --"
                    className={errors.uPercent?.variety ? uPercentStyles.errorField : ""}
                    ariaLabel="Variety"
                  />
                </div>

                <div className={uPercentStyles.field}>
                  <label>Department</label>
                  <SearchableSelect
                    value={uPercentForm.department}
                    onChange={(value) => handleUPercentChange("department", value)}
                    className={errors.uPercent?.department ? uPercentStyles.errorField : ""}
                    options={uPercentDepartmentOptions}
                    placeholder="Select Department"
                    ariaLabel="Department"
                  />
                </div>

                <div className={uPercentStyles.field}>
                  <label>MC No.</label>
                  <SearchableSelect
                    value={uPercentForm.mcNo}
                    onChange={(value) => handleUPercentChange("mcNo", value)}
                    options={uPercentMcNoOptions}
                    placeholder="-- Select MC No. --"
                    className={errors.uPercent?.mcNo ? uPercentStyles.errorField : ""}
                    ariaLabel="MC Number"
                  />
                </div>

                <div className={uPercentStyles.field}>
                  <label>U%</label>
                  <input
                    value={uPercentForm.uPercent}
                    onChange={(e) => handleUPercentChange("uPercent", e.target.value)}
                    className={errors.uPercent?.uPercent ? uPercentStyles.errorField : ""}
                  />
                </div>

                <div className={uPercentStyles.field}>
                  <label>CV in Metres</label>
                  <input
                    value={uPercentForm.cvm}
                    onChange={(e) => handleUPercentChange("cvm", e.target.value)}
                    className={errors.uPercent?.cvm ? uPercentStyles.errorField : ""}
                  />
                </div>

                <div className={uPercentStyles.field}>
                  <label>1m CV in Metres</label>
                  <input
                    value={uPercentForm.oneMeterCvm}
                    onChange={(e) => handleUPercentChange("oneMeterCvm", e.target.value)}
                    className={errors.uPercent?.oneMeterCvm ? uPercentStyles.errorField : ""}
                  />
                </div>

                <div className={uPercentStyles.field}>
                  <label>3m CV in Metres</label>
                  <input
                    value={uPercentForm.threeMeterCvm}
                    onChange={(e) => handleUPercentChange("threeMeterCvm", e.target.value)}
                    className={errors.uPercent?.threeMeterCvm ? uPercentStyles.errorField : ""}
                  />
                </div>

                <div className={`${uPercentStyles.field} ${uPercentStyles.fullWidth} ${uPercentStyles.remarksWide}`}>
                  <label>Remarks</label>
                  <textarea
                    rows={3}
                    value={uPercentForm.remarks}
                    onChange={(e) => handleUPercentChange("remarks", e.target.value)}
                    className={errors.uPercent?.remarks ? uPercentStyles.errorField : ""}
                  />
                </div>
              </div>
              ) : (
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.label}>Type</label>
                <select
                  value={form.type}
                  onChange={(e) => handleFormChange("type", e.target.value)}
                  className={styles.select}
                >
                  {typeOptions.map((option) => (
                    <option key={option.id} value={option.name}>
                      {option.displayName ?? option.name}
                    </option>
                  ))}
                </select>
              </div>

              {form.type === "Draw Frame Cots Data Entry" ? (
                <>
                  <div className={styles.field}>
                    <label className={styles.label}>Entry ID</label>
                    <input type="text" value={entryId} readOnly disabled className={`${styles.input} ${errors.header?.date ? styles.inputError : ""}`} />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Shift</label>
                    <select
                      value={form.shift}
                      onChange={(e) => handleFormChange("shift", e.target.value)}
                      className={`${styles.select} ${errors.header?.shift ? styles.inputError : ""}`}
                    >
                      {shiftOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Type</label>
                    <select
                      value={form.processType}
                      onChange={(e) => handleFormChange("processType", e.target.value)}
                      className={`${styles.select} ${errors.header?.processType ? styles.inputError : ""}`}
                    >
                      {processTypeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) :(
                <>
                  <div className={styles.field}>
                    <label className={styles.label}>Entry ID</label>
                    <input type="text" value={entryId} readOnly disabled className={`${styles.input} ${errors.header?.date ? styles.inputError : ""}`} />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Machine Number</label>
                    <SearchableSelect
                      value={form.machineNumber}
                      onChange={(value) => handleFormChange("machineNumber", value)}
                      options={yarnCvMachineOptions}
                      placeholder="Select Machine Number"
                      className={`${styles.select} ${errors.header?.machineNumber ? styles.inputError : ""}`}
                      ariaLabel="Machine Number"
                    />
                  </div>

                  <div className={`${styles.field} ${styles.fieldWide}`}>
                    <label className={styles.label}>Remarks</label>
                    <textarea
                      rows={4}
                      value={form.remarks}
                      onChange={(e) => handleFormChange("remarks", e.target.value)}
                      className={`${styles.textarea} ${errors.header?.remarks ? styles.inputError : ""}`}
                    />
                  </div>

                  <div className={styles.fieldActions}>
                    <div className={`${styles.field} ${styles.fieldGrow}`}>
                      <label className={styles.label}>Number of Readings (N)</label>
                      <input
                      type="number"
                      min="1"
                      value={form.readingCount}
                      onChange={(e) => handleFormChange("readingCount", e.target.value)}
                      className={`${styles.input} ${errors.header?.readingCount ? styles.inputError : ""}`}
                    />
                    </div>
                    <button
                      type="button"
                      onClick={handleGenerate}
                      className={`${styles.button} ${styles.generateButton}`}
                    >
                      Generate
                    </button>
                  </div>
                </>
              )}
            </div>
            )}

            {isHeaderEntry ? null : form.type === "Draw Frame Cots Data Entry" ? (
              <div className={styles.machineSection}>
                <h3 className={styles.machineSectionTitle}>Machine-Specific Data</h3>

                <div className={styles.machineCardList}>
                  {machineEntries.map((machine, index) => (
                    <div key={`machine-card-${machine.machineName || "unknown"}-${index}`} className={styles.machineCard}>
                      <div className={styles.machineNameRow}>
                        <label className={styles.machineNameLabel}>MC No :</label>
                        <div style={{ minWidth: 220, flex: 1 }}>
                          <span className={styles.machineNameValue}>{machine.machineName}</span>
                        </div>
                      </div>

                      <div className={styles.machineGrid}>
                        <div className={styles.field}>
                          <label className={styles.label}>Fan Waste</label>
                          <input
                            value={machine.fanWaste}
                            onChange={(e) => handleMachineChange(index, "fanWaste", e.target.value)}
                            className={`${styles.input} ${
                              errors.machines?.[index]?.fanWaste ? styles.inputError : ""
                            }`}
                          />
                        </div>

                        <div className={styles.field}>
                          <label className={styles.label}>Cot Change</label>
                          <input
                            value={machine.cotChange}
                            onChange={(e) => handleMachineChange(index, "cotChange", e.target.value)}
                            className={`${styles.input} ${
                              errors.machines?.[index]?.cotChange ? styles.inputError : ""
                            }`}
                          />
                        </div>

                        <div className={styles.field}>
                          <label className={styles.label}>Stripper Waste</label>
                          <input
                            value={machine.stripperWaste}
                            onChange={(e) => handleMachineChange(index, "stripperWaste", e.target.value)}
                            className={`${styles.input} ${
                              errors.machines?.[index]?.stripperWaste ? styles.inputError : ""
                            }`}
                          />
                        </div>

                        {form.processType === "Finisher" ? (
                          <>
                            <div className={styles.field}>
                              <label className={styles.label}>Auto Level</label>
                                <input
                                  value={machine.autoLevel}
                                  onChange={(e) => handleMachineChange(index, "autoLevel", e.target.value)}
                                  className={`${styles.input} ${
                                    errors.machines?.[index]?.autoLevel ? styles.inputError : ""
                                  }`}
                                />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Silver Monitor</label>
                                <input
                                  value={machine.silverMon}
                                  onChange={(e) => handleMachineChange(index, "silverMon", e.target.value)}
                                  className={`${styles.input} ${
                                    errors.machines?.[index]?.silverMon ? styles.inputError : ""
                                  }`}
                                />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Mass Thick Place</label>
                                <input
                                  value={machine.massThick}
                                  onChange={(e) => handleMachineChange(index, "massThick", e.target.value)}
                                  className={`${styles.input} ${
                                    errors.machines?.[index]?.massThick ? styles.inputError : ""
                                  }`}
                                />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Scanning Roller</label>
                                <input
                                  value={machine.scanningR}
                                  onChange={(e) => handleMachineChange(index, "scanningR", e.target.value)}
                                  className={`${styles.input} ${
                                    errors.machines?.[index]?.scanningR ? styles.inputError : ""
                                  }`}
                                />
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            ) : form.type === "U% Data Entry" ? null : (
              <>
                {oneYardReadings.length > 0 ? (
                  <div className={styles.readingsSection}>
                    <h3 className={styles.readingsTitle}>Enter Readings:</h3>
                    <div className={styles.readingsTable}>
                      <div className={styles.readingsHeader}>
                        <span>S.No</span>
                        <span>1 Yard Reading</span>
                        <span>1/2 Yard Reading</span>
                      </div>
                      {oneYardReadings.map((value, index) => (
                        <div key={`cv-reading-${index}`} className={styles.readingsRow}>
                          <span className={styles.readingSerial}>{index + 1}</span>
                          <input
                            value={value}
                            onChange={(e) =>
                              handleReadingChange(setOneYardReadings, "oneYard", index, e.target.value)
                            }
                            placeholder="Enter 1 Yard reading"
                            className={`${styles.readingInput} ${
                              errors.oneYard?.[index]?.reading ? styles.inputError : ""
                            }`}
                          />
                          <input
                            value={halfYardReadings[index] || ""}
                            onChange={(e) =>
                              handleReadingChange(setHalfYardReadings, "halfYard", index, e.target.value)
                            }
                            placeholder="Enter 1/2 Yard reading"
                            className={`${styles.readingInput} ${
                              errors.halfYard?.[index]?.reading ? styles.inputError : ""
                            }`}
                          />
                        </div>
                      ))}
                    </div>

                    <div className={styles.calculateWrap}>
                      <button
                        type="button"
                        onClick={handleCalculate}
                        className={`${styles.button} ${styles.calculateButton}`}
                      >
                        Calculate CV%
                      </button>
                    </div>
                    {errors.header?.calculation ? (
                      <p className={styles.messageError}>Please calculate CV% before saving.</p>
                    ) : null}
                  </div>
                ) : null}

                {oneYardReadings.length > 0 ? (
                  <div className={styles.resultsWrap}>
                    <div className={styles.resultCard}>
                      <div className={styles.resultSection}>
                        <h4 className={styles.resultTitle}>Calculation Results - 1 yard Readings</h4>
                        <div className={styles.metricsGrid}>
                          <div className={styles.field}>
                            <label className={styles.label}>AVG (1 Yard)</label>
                            <input readOnly value={oneYardMetrics[0]?.avg || ""} className={styles.metricInput} />
                          </div>
                          <div className={styles.field}>
                            <label className={styles.label}>HANK (1 Yard)</label>
                            <input readOnly value={oneYardMetrics[0]?.hank || ""} className={styles.metricInput} />
                          </div>
                          <div className={styles.field}>
                            <label className={styles.label}>SD (1 Yard)</label>
                            <input readOnly value={oneYardMetrics[0]?.sd || ""} className={styles.metricInput} />
                          </div>
                          <div className={styles.field}>
                            <label className={styles.label}>CV% (1 Yard)</label>
                            <input readOnly value={oneYardMetrics[0]?.cv || ""} className={styles.metricInput} />
                          </div>
                        </div>
                      </div>

                      <div className={styles.resultSection}>
                        <h4 className={styles.resultTitle}>Calculation Results - 1/2 yard Readings</h4>
                        <div className={styles.metricsGrid}>
                          <div className={styles.field}>
                            <label className={styles.label}>AVG (1/2 Yard)</label>
                            <input readOnly value={halfYardMetrics[0]?.avg || ""} className={styles.metricInput} />
                          </div>
                          <div className={styles.field}>
                            <label className={styles.label}>HANK (1/2 Yard)</label>
                            <input readOnly value={halfYardMetrics[0]?.hank || ""} className={styles.metricInput} />
                          </div>
                          <div className={styles.field}>
                            <label className={styles.label}>SD (1/2 Yard)</label>
                            <input readOnly value={halfYardMetrics[0]?.sd || ""} className={styles.metricInput} />
                          </div>
                          <div className={styles.field}>
                            <label className={styles.label}>CV% (1/2 Yard)</label>
                            <input readOnly value={halfYardMetrics[0]?.cv || ""} className={styles.metricInput} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
              )}

              {error ? <p className={styles.messageError}>{error}</p> : null}
            </div>

            <Footer
              onBack={() => router.push("/departments/quality-control")}
              onClear={handleClear}
              onSave={openPreview}
              saveLabel={actionLoading ? "Submitting..." : "Save Record"}
              disabled={actionLoading}
            />
          </div>
        )}
        {form.type === "U% Data Entry" && (
  <div
    className={uPercentStyles.tableSection}
    style={{
      background: entryTableTheme.surface,
      padding: "16px",
      borderRadius: "12px",
      boxShadow: isDarkMode ? "0 0 0 rgba(0,0,0,0)" : "0 2px 8px rgba(0,0,0,0.06)",
    }}
  >
    <h3
      style={{
        color: entryTableTheme.title,
      }}
    >
      Last 10 Entries
    </h3>

    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "14px",
      }}
    >
      <thead style={{ backgroundColor: entryTableTheme.header }}>
        <tr>
          {[
            "Date",
            "Shift",
            "Variety",
            "Department",
            "MC No.",
            "U%",
            "CVM",
            "1mCVM",
            "3mCVM",
            "Remarks",
          ].map((head) => (
            <th
              key={head}
              style={{
                padding: "12px 10px",
                textAlign: "left",
                fontWeight: "600",
                color: entryTableTheme.headText,
                borderBottom: `2px solid ${entryTableTheme.border}`,
                whiteSpace: "nowrap",
              }}
            >
              {head}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {listLoading ? (
          <tr>
            <td colSpan={10} style={{ padding: "14px", color: entryTableTheme.muted, backgroundColor: entryTableTheme.rowEven }}>
              Loading entries...
            </td>
          </tr>
        ) : uqcEntries.length ? uqcEntries.map((entry, i) => (
          <tr
            key={entry.id || i}
            style={{
              backgroundColor: i % 2 === 0 ? entryTableTheme.rowEven : entryTableTheme.rowOdd,
            }}
          >
            {[
              entry.entry_date
                ? new Date(entry.entry_date).toLocaleDateString("en-GB")
                : "-",
              entry.shift || "-",
              entry.variety || "-",
              entry.department || "-",
              entry.mc_no || "-",
              entry.u_percent || "-",
              entry.cvm || "-",
              entry.cvm_1m || "-",
              entry.cvm_3m || "-",
              entry.remarks || "-",
            ].map((cell, idx) => (
              <td
                key={idx}
                style={{
                  padding: "10px",
                  borderBottom: `1px solid ${entryTableTheme.cellBorder}`,
                  color: idx === 5 ? entryTableTheme.accent : entryTableTheme.text,
                  fontWeight: idx === 5 ? "600" : "400",
                  backgroundColor: "transparent",
                }}
              >
                {cell}
              </td>
            ))}
          </tr>
        )) : (
          <tr>
            <td colSpan={10} style={{ padding: "14px", color: entryTableTheme.muted, backgroundColor: entryTableTheme.rowEven }}>
              No entries found.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
)}
      </div>

      <PreviewModal
        open={showPreview}
        title="Quality Control - Draw Frame Notebook"
        subtitle="Preview"
        items={previewItems}
        typeValue={form.type}
        onCancel={() => setShowPreview(false)}
        onConfirm={() => {
          setShowPreview(false);
          handleSubmit();
        }}
        confirmLabel="Submit"
      />

      <SuccessModal
        open={showSuccess}
        message="Data Submitted"
        typeValue={form.type}
        onClose={handleSuccessClose}
        closeLabel="OK"
      />
    </div>
  );
}

export default DrawFrame;

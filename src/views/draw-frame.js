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
import Wrapping from "@/views/wrapping";
import { fetchDrawFrameCotsMachineMaster, fetchDrawFrameMachineMaster } from "@/apis/draw-frame";
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
import useDatabaseEntryId from "@/hooks/useDatabaseEntryId";
import { useThemeMode } from "@/utils/useThemeMode";

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
  { id: 6, name: "A%", aliases: ["A%", "A Percent"] },
];

export const DRAW_FRAME_INPUT_SCREEN_COUNT = primaryTypeOptions.length;
const DRAW_FRAME_ENTRY_PREFIX = {
  "1 Yard / Half Yard CV Entry": "DY",
  "Yarn CV% Calculation Form": "YAR",
  "Draw Frame Cots Data Entry": "DRC",
  "U% Data Entry": "DUP",
  "PP - Breaker Drawing": "DRB",
  "PP - Finisher Drawing": "DRF",
  "A%": "DAP",
};

const getDrawFrameEntryConfig = (type = "") =>
  ({ prefix: DRAW_FRAME_ENTRY_PREFIX[type] || "DRAW" });

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
  "CDG-21","CDG-22","CDG-23","CDG-24","CDG-25","CDG-26",
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
const BREAKER_PREFIX = String(process.env.NEXT_PUBLIC_DRAWFRAME_BREAKER_PREFIX || "DFB").trim().toUpperCase();
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
  const normalized = String(machineName || "").trim().toUpperCase();
  if (!normalized) return false;
  if (processType === "Breaker") return normalized.startsWith(BREAKER_PREFIX);
  if (processType === "Finisher") return FINISHER_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  return true;
};

const getMachineCardDefaults = () => [];

const formatMetric = (value) => (Number.isFinite(value) ? value.toFixed(2) : "");

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
    hank: formatMetric(hank),
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
      ]);
      const nMinus1 = getObjectValueByAliases(row, ["N-1", "N - 1", "N_minus_1", "n_minus_1", "n-1"]);
      const n = getObjectValueByAliases(row, ["N", "n"]);
      const nPlus1 = getObjectValueByAliases(row, ["N+1", "N + 1", "N_plus_1", "n_plus_1", "n+1"]);

      return {
        sampleNo: sampleNo === null || sampleNo === undefined ? "" : String(sampleNo).trim(),
        nMinus1: nMinus1 === null || nMinus1 === undefined ? "" : String(nMinus1).trim(),
        n: n === null || n === undefined ? "" : String(n).trim(),
        nPlus1: nPlus1 === null || nPlus1 === undefined ? "" : String(nPlus1).trim(),
      };
    })
    .filter((row) => row.sampleNo || row.nMinus1 || row.n || row.nPlus1);

const parseAPercentRawTextRows = (rawText = "") => {
  const rows = [];
  String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .forEach((line) => {
      const match = line.match(
        /^(Average Weight|Weight\s*\(Max\)|Weight\s*\(Min\)|Range|Hank|SD|CV|\d{1,3})\s+(\S+)\s+(\S+)\s+(\S+)$/i
      );
      if (!match) return;
      rows.push({
        sampleNo: match[1].replace(/\s+/g, " ").replace(/^weight\s*\(/i, "Weight ("),
        nMinus1: match[2],
        n: match[3],
        nPlus1: match[4],
      });
    });
  return rows;
};

const getAPercentRowsFromOcrResult = (result, parsedRows = []) => {
  const jsonRows = normalizeAPercentJsonRows(parsedRows);
  if (jsonRows.length) return jsonRows;
  return parseAPercentRawTextRows(result?.raw_text || result?.text || "");
};

function DrawFrame() {
  const currentDateLabel = new Date().toLocaleDateString("en-IN");
  const router = useRouter();
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth?.user);
  const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
  const typeOptions = filterOptionsByDepartmentAccess(
    primaryTypeOptions,
    accessByDepartment,
    user,
    "Draw Frame"
  );
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
    serialNumber: "",
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
  const cvMachineDropdownRef = useRef(null);
  const aPercentFileInputRef = useRef(null);
  const [machineNameOptions, setMachineNameOptions] = useState([]);
  const [yarnCvMachineOptions, setYarnCvMachineOptions] = useState([]);
  const [machineMasterByName, setMachineMasterByName] = useState({});
  const [aPercentFile, setAPercentFile] = useState(null);
  const [aPercentOcrBusy, setAPercentOcrBusy] = useState(false);
  const [aPercentOcrMessage, setAPercentOcrMessage] = useState("");
  const [aPercentOcrRows, setAPercentOcrRows] = useState([]);
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
  const isUPercentEntry = form.type === "U% Data Entry";
  const isAPercentEntry = form.type === "A%";
  const isWrappingDrawframeNotebook = form.type === "Wrapping Drawframe Notebook";
  const isHeaderEntry =
    form.type === "PP - Breaker Drawing" || form.type === "PP - Finisher Drawing";
  const { entryId, reserveEntryId } = useDatabaseEntryId({
    department: "Draw Frame",
    typeName: form.type,
    config: getDrawFrameEntryConfig(form.type),
    leadingHash: true,
  });

  useEffect(() => {
    if (!typeOptions.some((option) => option.name === form.type)) {
      setForm((current) => ({
        ...current,
        type: typeOptions[0]?.name || "",
      }));
    }
  }, [form.type, typeOptions]);

  useEffect(() => {
    let isMounted = true;

    const loadYarnCvMachineNames = async () => {
      try {
        const machines = await fetchDrawFrameMachineMaster();
        if (!isMounted) return;
        const names = [];
        const nextMasterByName = {};
        machines.forEach((item) => {
          const machineName = String(item?.machine_number || item?.mc_name || "").trim();
          const mcNo = String(item?.mc_no || "").trim();
          if (!machineName) return;
          names.push(machineName);
          nextMasterByName[machineName] = { mcNo };
        });
        setYarnCvMachineOptions(mergeUniqueMachineNames(names, STATIC_FR_MACHINE_NAMES));
        setMachineMasterByName(nextMasterByName);
      } catch (_error) {
        if (isMounted) {
          setYarnCvMachineOptions(mergeUniqueMachineNames([], STATIC_FR_MACHINE_NAMES));
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
          setMachineNameOptions(form.processType === "Finisher" ? [...STATIC_FR_MACHINE_NAMES] : []);
        }
      }
    };

    loadCotsMachineNames();
    return () => {
      isMounted = false;
    };
  }, [form.type, form.processType]);

  const handleFormChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: field === "readingCount" ? Number(value) || 0 : value,
    }));
    setErrors((prev) => {
      if (!prev.header?.[field]) return prev;
      const nextHeader = { ...(prev.header || {}) };
      delete nextHeader[field];
      return { ...prev, header: nextHeader };
    });
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
    const nextValue = sanitizeNumericInput(value, { precision: 10, scale: 2 });
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
    try {
      const result = await runOcrForDocument({ file: aPercentFile, docType: "hvi" });
      const parsedRows = Array.isArray(result?.json_output) ? result.json_output : [];
      setAPercentOcrRows(parsedRows);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "ocr_prefill",
          JSON.stringify({
            screen: "draw-frame",
            docType: "a_percent",
            values: parsedRows[0] || {},
            result,
          })
        );
      }
      setAPercentOcrMessage(
        parsedRows.length ? "OCR completed. Extracted values are ready." : "OCR completed, but no table rows were returned."
      );
    } catch (ocrError) {
      setAPercentOcrMessage(ocrError?.message || "OCR failed. Please try again.");
    } finally {
      setAPercentOcrBusy(false);
    }
  };

  const aPercentOcrColumns = useMemo(() => {
    const columns = [];
    const seen = new Set();
    aPercentOcrRows.forEach((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return;
      Object.keys(row).forEach((key) => {
        if (seen.has(key)) return;
        seen.add(key);
        columns.push(key);
      });
    });
    return columns;
  }, [aPercentOcrRows]);

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
    dispatch(clearDrawFrameState());
  };

  const handleSuccessClose = () => {
    setShowSuccess(false);
    handleClear();
    dispatch(clearDrawFrameState());
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

      setErrors({
        header: {},
        aPercent: aPercentErrors,
        machines: [],
        oneYard: [],
        halfYard: [],
      });

      return Object.keys(aPercentErrors).length === 0;
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
        if (item.thickPlace === "") errs.thickPlace = true;
        if (form.processType === "Finisher") {
          if (item.autoLevel === "") errs.autoLevel = true;
          if (item.silverMon === "") errs.silverMon = true;
          if (item.massThick === "") errs.massThick = true;
          if (item.scanningR === "") errs.scanningR = true;
        }
        machineErrors.push(errs);
      });
    } else {
      if (!form.serialNumber.trim()) headerErrors.serialNumber = true;
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
        items.push({ label: "Stripper W", value: m.stripperWaste || "-" });
        items.push({ label: "Thick Place", value: m.thickPlace || "-" });
        if (form.processType === "Finisher") {
          items.push({ label: "Auto Level", value: m.autoLevel || "-" });
          items.push({ label: "Silver Mon", value: m.silverMon || "-" });
          items.push({ label: "Mass Thick", value: m.massThick || "-" });
          items.push({ label: "Scanning R", value: m.scanningR || "-" });
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
    } else if (!isHeaderEntry) {
      items.push({ label: "Type", value: form.type });
      items.push({ label: "S. No.", value: form.serialNumber });
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
  }, [aPercentFile, entryId, form, isHeaderEntry, machineEntries, oneYardReadings, halfYardReadings, oneYardMetrics, halfYardMetrics, uPercentForm]);

  const handleSubmit = () => {
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
          dispatch(fetchDrawFrameUqcEntries({ page: 1, limit: 10 }));
        }
      });
      return;
    }

    if (form.type === "A%") {
      reserveEntryId();
      setShowSuccess(true);
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
          s_no: form.serialNumber,
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

    dispatch(isCots ? submitDrawFrameCotsInspection(payload) : submitDrawFrameYarnCvInspection(payload));
  };

  const openPreview = () => {
    if (!validate()) return;
    setPreviewItems(buildPreviewItems);
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
      setShowSuccess(true);
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

        {isWrappingDrawframeNotebook ? (
          <Wrapping
            fixedType="Drawing"
            backPath="/draw-frame"
            title="Quality Control - Wrapping Drawframe Notebook"
          />
        ) : isHeaderEntry ? (
          <DrawFrameHeaderEntry
            entryId={entryId}
            typeOptions={typeOptions}
            selectedType={form.type}
            onTypeChange={(value) => handleFormChange("type", value)}
          />
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
                {aPercentOcrColumns.length > 0 ? (
                  <div className={styles.aPercentTableScroll}>
                    <table className={styles.aPercentTable}>
                      <thead>
                        <tr>
                          <th>S.No</th>
                          {aPercentOcrColumns.map((column) => (
                            <th key={column}>{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {aPercentOcrRows.map((row, rowIndex) => (
                          <tr key={`a-percent-ocr-row-${rowIndex}`}>
                            <td>{rowIndex + 1}</td>
                            {aPercentOcrColumns.map((column) => {
                              const value = row?.[column];
                              return (
                                <td key={`${rowIndex}-${column}`}>
                                  {value === null || value === undefined || value === "" ? "-" : String(value)}
                                </td>
                              );
                            })}
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
                  <select
                    value={uPercentForm.shift}
                    onChange={(e) => handleUPercentChange("shift", e.target.value)}
                    className={errors.uPercent?.shift ? uPercentStyles.errorField : ""}
                  >
                    <option value="">Select</option>
                    {STATIC_SHIFT_OPTIONS.map((option, index) => (
                      <option key={`${option.value}-${index}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={uPercentStyles.field}>
                  <label>Variety</label>
                  <SearchableSelect
                    value={uPercentForm.variety}
                    onChange={(value) => handleUPercentChange("variety", value)}
                    options={["WPSF 0.90", "WPSF 1.20", "PSF Blend"]}
                    placeholder="Select"
                    className={errors.uPercent?.variety ? uPercentStyles.errorField : ""}
                    ariaLabel="Variety"
                  />
                </div>

                <div className={uPercentStyles.field}>
                  <label>Department</label>
                  <select
                    value={uPercentForm.department}
                    onChange={(e) => handleUPercentChange("department", e.target.value)}
                    className={errors.uPercent?.department ? uPercentStyles.errorField : ""}
                  >
                    <option value="">Select Department</option>
                    {STATIC_DEPARTMENT_OPTIONS.map((item, index) => (
                      <option key={`${item.dept_code}-${index}`} value={item.dept_name}>
                        {item.dept_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={uPercentStyles.field}>
                  <label>MC No.</label>
                  <SearchableSelect
                    value={uPercentForm.mcNo}
                    onChange={(value) => handleUPercentChange("mcNo", value)}
                    options={STATIC_MC_NO_OPTIONS.map((item) => item.mc_no)}
                    placeholder="Select MC No."
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
                    <label className={styles.label}>Unique</label>
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
                    <label className={styles.label}>S. No.</label>
                    <input
                      value={form.serialNumber}
                      onChange={(e) => handleFormChange("serialNumber", e.target.value)}
                      className={`${styles.input} ${errors.header?.serialNumber ? styles.inputError : ""}`}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Unique</label>
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
                          <label className={styles.label}>Stripper W</label>
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
                              <label className={styles.label}>Thick Place</label>
                              <input
                                value={machine.thickPlace}
                                onChange={(e) => handleMachineChange(index, "thickPlace", e.target.value)}
                                className={`${styles.input} ${
                                  errors.machines?.[index]?.thickPlace ? styles.inputError : ""
                                }`}
                              />
                            </div>

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
                              <label className={styles.label}>Silver Mon</label>
                                <input
                                  value={machine.silverMon}
                                  onChange={(e) => handleMachineChange(index, "silverMon", e.target.value)}
                                  className={`${styles.input} ${
                                    errors.machines?.[index]?.silverMon ? styles.inputError : ""
                                  }`}
                                />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Mass Thick</label>
                                <input
                                  value={machine.massThick}
                                  onChange={(e) => handleMachineChange(index, "massThick", e.target.value)}
                                  className={`${styles.input} ${
                                    errors.machines?.[index]?.massThick ? styles.inputError : ""
                                  }`}
                                />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Scanning R</label>
                                <input
                                  value={machine.scanningR}
                                  onChange={(e) => handleMachineChange(index, "scanningR", e.target.value)}
                                  className={`${styles.input} ${
                                    errors.machines?.[index]?.scanningR ? styles.inputError : ""
                                  }`}
                                />
                            </div>
                          </>
                        ) : (
                          <div className={`${styles.field} ${styles.machineFieldCompact}`}>
                            <label className={styles.label}>Thick Place</label>
                            <input
                              value={machine.thickPlace}
                              onChange={(e) => handleMachineChange(index, "thickPlace", e.target.value)}
                              className={`${styles.input} ${
                                errors.machines?.[index]?.thickPlace ? styles.inputError : ""
                              }`}
                            />
                          </div>
                        )}
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
      />
    </div>
  );
}

export default DrawFrame;

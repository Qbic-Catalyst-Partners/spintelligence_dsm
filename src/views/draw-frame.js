import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { MdOutlineEditNote } from "react-icons/md";

import Footer from "@/components/Footer";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import PreviewModal from "@/components/PreviewModal";
import SearchableSelect from "@/components/SearchableSelect";
import SuccessModal from "@/components/SuccessModal";
import DrawFrameHeaderEntry from "@/views/draw-frame/DrawFrameHeaderEntry";
import {
  STATIC_DEPARTMENT_OPTIONS,
  STATIC_MC_NO_OPTIONS,
  STATIC_SHIFT_OPTIONS,
  STATIC_VARIETY_OPTIONS,
} from "@/views/carding/u%dataentry";
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
];

export const DRAW_FRAME_INPUT_SCREEN_COUNT = primaryTypeOptions.length;
const DRAW_FRAME_ENTRY_SEQ_KEY = "drawframe_entry_sequence";
const DRAW_FRAME_ENTRY_PREFIX = {
  "Yarn CV% Calculation Form": "YAR",
  "Draw Frame Cots Data Entry": "DRC",
  "U% Data Entry": "DUP",
  "PP - Breaker Drawing": "DRB",
  "PP - Finisher Drawing": "DRF",
};
const getDrawFrameUniqueId = (seq, type = "") => {
  const prefix = DRAW_FRAME_ENTRY_PREFIX[type] || "DRAW";
  return `${prefix}-${String(Math.max(1, Number(seq) || 1)).padStart(3, "0")}`;
};

const processTypeOptions = ["Breaker", "Finisher"];
const shiftOptions = ["General", "A Shift", "B Shift", "C Shift"];
const U_PERCENT_NUMERIC_FIELDS = ["uPercent", "cvm", "oneMeterCvm", "threeMeterCvm"];
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
  const [entrySeq, setEntrySeq] = useState(1);
  const [showSuccess, setShowSuccess] = useState(false);
  const cvMachineDropdownRef = useRef(null);
  const [machineNameOptions, setMachineNameOptions] = useState([]);
  const [yarnCvMachineOptions, setYarnCvMachineOptions] = useState([]);
  const [machineMasterByName, setMachineMasterByName] = useState({});
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
  const isHeaderEntry =
    form.type === "PP - Breaker Drawing" || form.type === "PP - Finisher Drawing";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = Number(window.localStorage.getItem(DRAW_FRAME_ENTRY_SEQ_KEY) || "1");
    setEntrySeq(Number.isFinite(stored) && stored > 0 ? stored : 1);
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
        setYarnCvMachineOptions(names);
        setMachineMasterByName(nextMasterByName);
      } catch (_error) {
        if (isMounted) {
          setYarnCvMachineOptions([]);
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
        const names = filteredNames;
        if (!isMounted) return;
        if (names.length) {
          setMachineNameOptions(names);
          return;
        }
        const fallbackMachines = await fetchDrawFrameMachineMaster();
        const fallbackRawNames = fallbackMachines
          .map((item) => String(item?.mc_name || item?.machine_number || "").trim())
          .filter(Boolean);
        const filteredFallbackNames = fallbackRawNames.filter((name) =>
          matchesCotsTypePrefix(name, form.processType)
        );
        const fallbackNames = filteredFallbackNames;
        setMachineNameOptions(fallbackNames);
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
          const fallbackNames = filteredFallbackNames;
          setMachineNameOptions(fallbackNames);
        } catch (_fallbackError) {
          setMachineNameOptions([]);
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
    setOneYardMetrics([]);
    setHalfYardMetrics([]);
    setHasCalculated(false);
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
  }, [form, isHeaderEntry, machineEntries, oneYardReadings, halfYardReadings, oneYardMetrics, halfYardMetrics, uPercentForm]);

  const handleSubmit = () => {
    const isCots = form.type === "Draw Frame Cots Data Entry";

    if (!validate()) return;

    if (form.type === "U% Data Entry") {
      dispatch(
        submitDrawFrameUqcInspection({
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

    const payload = isCots
      ? {
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
      if (form.type === "Draw Frame Cots Data Entry") {
        dispatch(fetchDrawFrameCotsEntries({ page: 1, limit: 10 }));
      }
      if (form.type === "U% Data Entry") {
        dispatch(fetchDrawFrameUqcEntries({ page: 1, limit: 10 }));
      }
      setShowSuccess(true);
    }
  }, [actionSuccess, dispatch, form.type]);

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
            entryId={getDrawFrameUniqueId(entrySeq, form.type)}
            typeOptions={typeOptions}
            selectedType={form.type}
            onTypeChange={(value) => handleFormChange("type", value)}
          />
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
                  <input type="text" value={getDrawFrameUniqueId(entrySeq, form.type)} readOnly disabled className={errors.header?.date ? uPercentStyles.errorField : ""} />
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
                  <select
                    value={uPercentForm.variety}
                    onChange={(e) => handleUPercentChange("variety", e.target.value)}
                    className={errors.uPercent?.variety ? uPercentStyles.errorField : ""}
                  >
                    <option value="">-- Select Variety --</option>
                    {STATIC_VARIETY_OPTIONS.map((name, index) => (
                      <option key={`${name}-${index}`} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
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
                    <input type="text" value={getDrawFrameUniqueId(entrySeq, form.type)} readOnly disabled className={`${styles.input} ${errors.header?.date ? styles.inputError : ""}`} />
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
                    <input type="text" value={getDrawFrameUniqueId(entrySeq, form.type)} readOnly disabled className={`${styles.input} ${errors.header?.date ? styles.inputError : ""}`} />
                  </div>

                  <div className={styles.field} ref={cvMachineDropdownRef}>
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

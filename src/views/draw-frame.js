import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { MdOutlineEditNote } from "react-icons/md";

import Footer from "@/components/Footer";
import PreviewModal from "@/components/PreviewModal";
import SuccessModal from "@/components/SuccessModal";
import {
  clearDrawFrameState,
  fetchDrawFrameCotsEntries,
  fetchDrawFrameUqcEntries,
  submitDrawFrameCotsInspection,
  submitDrawFrameUqcInspection,
  submitDrawFrameYarnCvInspection,
} from "@/store/slices/draw-frame";
import styles from "@/styles/draw-frame.module.css";

const today = new Date().toISOString().split("T")[0];

const primaryTypeOptions = [
  "Yarn CV% Calculation Form",
  "Draw Frame Cots Data Entry",
   "U% Data Entry",
];

export const DRAW_FRAME_INPUT_SCREEN_COUNT = primaryTypeOptions.length;

const processTypeOptions = ["Breaker", "Finisher"];
const shiftOptions = ["General", "A Shift", "B Shift", "C Shift"];
const cvMachineOptions = ["DF-01", "DF-02", "DF-03", "DF-04"];

const createMachineEntry = (machineName = "") => ({
  machineName,
  fanWaste: "",
  cotChange: "",
  stripperWaste: "",
  thickPlace: "",
  autoLevel: "",
  silverMon: "",
  massThick: "",
  scanningR: "",
});

const getMachineCardDefaults = (processType) => {
  const count = processType === "Finisher" ? 6 : 4;
  return Array.from({ length: count }, (_, index) => `MC-0${index + 1}`);
};

const formatMetric = (value) => (Number.isFinite(value) ? value.toFixed(2) : "");

const emptyMetric = () => ({
  avg: "",
  hank: "",
  sd: "",
  cv: "",
});

function DrawFrame() {
  const router = useRouter();
  const dispatch = useDispatch();
  const typeOptions = primaryTypeOptions.map((t, i) => ({
    id: i + 1,
    name: t,
  }));
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

  const [form, setForm] = useState({
    type: "Yarn CV% Calculation Form",
    date: today,
    shift: "General",
    processType: "Breaker",
    serialNumber: "",
    machineNumber: "",
    remarks: "",
    readingCount: 5,
  });

  const [machineEntries, setMachineEntries] = useState(
    getMachineCardDefaults("Breaker").map((name) => createMachineEntry(name))
  );
  const [oneYardMetrics, setOneYardMetrics] = useState([]);
  const [halfYardMetrics, setHalfYardMetrics] = useState([]);
  const [hasCalculated, setHasCalculated] = useState(false);
  const [errors, setErrors] = useState({});
  const [showPreview, setShowPreview] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);
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

  const handleMetricChange = (setter, index, field, value) => {
    setter((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
              ...(field !== "cv" ? { cv: "" } : {}),
            }
          : item
      )
    );
    setHasCalculated(false);
    setErrors((prev) => {
      const key = setter === setOneYardMetrics ? "oneYard" : "halfYard";
      const arr = prev[key] ? [...prev[key]] : [];
      if (arr[index]?.[field]) {
        const nextMetricErr = { ...(arr[index] || {}) };
        delete nextMetricErr[field];
        arr[index] = nextMetricErr;
        return { ...prev, [key]: arr };
      }
      return prev;
    });
  };

  const handleGenerate = () => {
    const count = Math.max(Number(form.readingCount) || 0, 0);
    setOneYardMetrics(Array.from({ length: count }, () => emptyMetric()));
    setHalfYardMetrics(Array.from({ length: count }, () => emptyMetric()));
    setHasCalculated(false);
    setErrors((prev) => ({ ...prev, header: { ...prev.header, readingCount: false }, oneYard: [], halfYard: [] }));
  };

  const handleUPercentChange = (field, value) => {
    setUPercentForm((current) => ({
      ...current,
      [field]: value,
    }));
    setErrors((prev) => {
      if (!prev.uPercent?.[field]) return prev;
      const nextUPercent = { ...(prev.uPercent || {}) };
      delete nextUPercent[field];
      return { ...prev, uPercent: nextUPercent };
    });
  };

  const handleCalculate = () => {
    const calculateMetricSet = (metrics) =>
      metrics.map((metric) => {
        const avg = Number(metric.avg);
        const sd = Number(metric.sd);
        const cv = avg > 0 && !Number.isNaN(sd) ? formatMetric((sd / avg) * 100) : "";

        return {
          ...metric,
          cv,
        };
      });

    setOneYardMetrics((current) => calculateMetricSet(current));
    setHalfYardMetrics((current) => calculateMetricSet(current));
    setHasCalculated(true);
  };

  const handleClear = () => {
    setForm({
      type: "Yarn CV% Calculation Form",
      date: today,
      shift: "General",
      processType: "Breaker",
      serialNumber: "",
      machineNumber: "",
      remarks: "",
      readingCount: 5,
    });
    setMachineEntries(getMachineCardDefaults("Breaker").map((name) => createMachineEntry(name)));
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

    const defaults = getMachineCardDefaults(form.processType);
    setMachineEntries((current) =>
      defaults.map((name, index) => ({
        ...createMachineEntry(name),
        ...current[index],
        machineName: current[index]?.machineName || name,
      }))
    );
  }, [form.processType, form.type]);

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
      const paddedOne = oneYardMetrics.length ? oneYardMetrics : Array.from({ length: ensureMetricCount }, () => emptyMetric());
      const paddedHalf = halfYardMetrics.length ? halfYardMetrics : Array.from({ length: ensureMetricCount }, () => emptyMetric());

      paddedOne.forEach((item) => {
        const errs = {};
        if (item.avg === "") errs.avg = true;
        if (item.hank === "") errs.hank = true;
        if (item.sd === "") errs.sd = true;
        oneErrors.push(errs);
      });
      paddedHalf.forEach((item) => {
        const errs = {};
        if (item.avg === "") errs.avg = true;
        if (item.hank === "") errs.hank = true;
        if (item.sd === "") errs.sd = true;
        halfErrors.push(errs);
      });
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
      items.push({ label: "CVM", value: uPercentForm.cvm });
      items.push({ label: "1m CVM", value: uPercentForm.oneMeterCvm });
      items.push({ label: "3m CVM", value: uPercentForm.threeMeterCvm });
      items.push({ label: "Remarks", value: uPercentForm.remarks });
    } else {
      items.push({ label: "Type", value: form.type });
      items.push({ label: "S. No.", value: form.serialNumber });
      items.push({ label: "Date", value: form.date });
      items.push({ label: "Machine Number", value: form.machineNumber });
      items.push({ label: "Remarks", value: form.remarks });
      items.push({ label: "Number of Readings (N)", value: form.readingCount });
      const ensureMetricCount = Math.max(form.readingCount || 0, oneYardMetrics.length, halfYardMetrics.length, 1);
      const paddedOne = oneYardMetrics.length ? oneYardMetrics : Array.from({ length: ensureMetricCount }, () => emptyMetric());
      const paddedHalf = halfYardMetrics.length ? halfYardMetrics : Array.from({ length: ensureMetricCount }, () => emptyMetric());

      Array.from({ length: ensureMetricCount }).forEach((_, idx) => {
        items.push({ label: `Reading ${idx + 1} - AVG (1Y)`, value: paddedOne[idx]?.avg || "-" });
        items.push({ label: `Reading ${idx + 1} - HANK (1Y)`, value: paddedOne[idx]?.hank || "-" });
        items.push({ label: `Reading ${idx + 1} - SD (1Y)`, value: paddedOne[idx]?.sd || "-" });
        items.push({ label: `Reading ${idx + 1} - AVG (1/2Y)`, value: paddedHalf[idx]?.avg || "-" });
        items.push({ label: `Reading ${idx + 1} - HANK (1/2Y)`, value: paddedHalf[idx]?.hank || "-" });
        items.push({ label: `Reading ${idx + 1} - SD (1/2Y)`, value: paddedHalf[idx]?.sd || "-" });
      });
    }
    return items;
  }, [form, machineEntries, oneYardMetrics, halfYardMetrics, uPercentForm]);

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
    setPreviewItems(form.type === "U% Data Entry" ? uqcRef.current?.getPreviewData?.() || [] : buildPreviewItems);
    setShowPreview(true);
  };

  useEffect(() => {
    if (actionSuccess) {
      if (form.type === "Draw Frame Cots Data Entry") {
        dispatch(fetchDrawFrameCotsEntries({ page: 1, limit: 10 }));
      }
      if (form.type !== "U% Data Entry") {
        setShowSuccess(true);
      }
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
        <div className={styles.breadcrumbs}>
          <button type="button" className={styles.breadcrumbButton} onClick={() => router.push("/")}>
            Home
          </button>
          <span>&rsaquo;</span>
          <button type="button" className={styles.breadcrumbButton} onClick={() => router.push("/dashboard")}>
            Dashboard
          </button>
          <span>&rsaquo;</span>
          <button
            type="button"
            className={styles.breadcrumbButton}
            onClick={() => router.push("/departments/quality-control")}
          >
            Quality Control
          </button>
          <span>&rsaquo;</span>
          <span className={styles.breadcrumbCurrent}>Draw Frame Notebook QC</span>
        </div>

        <div className={styles.header}>
          <h1 className={styles.title}>Quality Control - Draw Frame Notebook</h1>
          <p className={styles.description}>Record and manage industrial machine quality inspections.</p>
        </div>

        <div className={styles.card}>
          <div className={styles.cardBody}>
            <div className={styles.sectionHeader}>
              <MdOutlineEditNote className={styles.sectionIcon} />
              <h2 className={styles.sectionTitle}>Inspection Data Entry</h2>
            </div>
            <div className={styles.sectionDivider} />

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
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
     
                
            

              {form.type === "U% Data Entry" ? null : form.type === "Draw Frame Cots Data Entry" ? (
                <>
                  <div className={styles.field}>
                    <label className={styles.label}>Date</label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) => handleFormChange("date", e.target.value)}
                      className={`${styles.input} ${errors.header?.date ? styles.inputError : ""}`}
                    />
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
              ) : form.type === "U% Data Entry" ? (
                <>
                  <div className={styles.field}>
                    <label className={styles.label}>Date</label>
                    <input
                      type="date"
                      value={uPercentForm.date}
                      onChange={(e) => handleUPercentChange("date", e.target.value)}
                      className={`${styles.input} ${errors.header?.date ? styles.inputError : ""}`}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Shift</label>
                    <select
                      value={uPercentForm.shift}
                      onChange={(e) => handleUPercentChange("shift", e.target.value)}
                      className={`${styles.select} ${errors.uPercent?.shift ? styles.inputError : ""}`}
                    >
                      <option value="">Select</option>
                      {shiftOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Variety</label>
                    <select
                      value={uPercentForm.variety}
                      onChange={(e) => handleUPercentChange("variety", e.target.value)}
                      className={`${styles.select} ${errors.uPercent?.variety ? styles.inputError : ""}`}
                    >
                      <option value="">Select</option>
                      <option value="WPSF 0.90">WPSF 0.90</option>
                      <option value="WPSF 1.20">WPSF 1.20</option>
                      <option value="PSF Blend">PSF Blend</option>
                    </select>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Department</label>
                    <select
                      value={uPercentForm.department}
                      onChange={(e) => handleUPercentChange("department", e.target.value)}
                      className={`${styles.select} ${errors.uPercent?.department ? styles.inputError : ""}`}
                    >
                      <option value="">Select Department</option>
                      <option value="FR Drawing">FR Drawing</option>
                      <option value="Draw Frame">Draw Frame</option>
                      <option value="Finisher Drawing">Finisher Drawing</option>
                    </select>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>MC No.</label>
                    <select
                      value={uPercentForm.mcNo}
                      onChange={(e) => handleUPercentChange("mcNo", e.target.value)}
                      className={`${styles.select} ${errors.uPercent?.mcNo ? styles.inputError : ""}`}
                    >
                      <option value="">Select MC No.</option>
                      <option value="DF-01">DF-01</option>
                      <option value="DF-02">DF-02</option>
                      <option value="DF-03">DF-03</option>
                      <option value="DF-04">DF-04</option>
                    </select>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>U%</label>
                    <input
                      value={uPercentForm.uPercent}
                      onChange={(e) => handleUPercentChange("uPercent", e.target.value)}
                      className={`${styles.input} ${errors.uPercent?.uPercent ? styles.inputError : ""}`}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>CVM</label>
                    <input
                      value={uPercentForm.cvm}
                      onChange={(e) => handleUPercentChange("cvm", e.target.value)}
                      className={`${styles.input} ${errors.uPercent?.cvm ? styles.inputError : ""}`}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>1m CVM</label>
                    <select
                      value={uPercentForm.oneMeterCvm}
                      onChange={(e) => handleUPercentChange("oneMeterCvm", e.target.value)}
                      className={`${styles.select} ${errors.uPercent?.oneMeterCvm ? styles.inputError : ""}`}
                    >
                      <option value="">Select</option>
                      <option value="0.32">0.32</option>
                      <option value="0.45">0.45</option>
                      <option value="0.58">0.58</option>
                    </select>
                  </div>

                  <div className={`${styles.field} ${styles.uPercentCompactField}`}>
                    <label className={styles.label}>3m CVM</label>
                    <input
                      value={uPercentForm.threeMeterCvm}
                      onChange={(e) => handleUPercentChange("threeMeterCvm", e.target.value)}
                      className={`${styles.input} ${errors.uPercent?.threeMeterCvm ? styles.inputError : ""}`}
                    />
                  </div>

                  <div className={`${styles.field} ${styles.fieldWide} ${styles.uPercentRemarksField}`}>
                    <label className={styles.label}>Remarks</label>
                    <textarea
                      rows={4}
                      value={uPercentForm.remarks}
                      onChange={(e) => handleUPercentChange("remarks", e.target.value)}
                      className={`${styles.textarea} ${errors.uPercent?.remarks ? styles.inputError : ""}`}
                    />
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
                    <label className={styles.label}>Date</label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) => handleFormChange("date", e.target.value)}
                      className={`${styles.input} ${errors.header?.date ? styles.inputError : ""}`}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Machine Number</label>
                    <select
                      value={form.machineNumber}
                      onChange={(e) => handleFormChange("machineNumber", e.target.value)}
                      className={`${styles.select} ${errors.header?.machineNumber ? styles.inputError : ""}`}
                    >
                      <option value="">Select Machine Number</option>
                      {cvMachineOptions.map((machine) => (
                        <option key={machine} value={machine}>
                          {machine}
                        </option>
                      ))}
                    </select>
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

            {form.type === "Draw Frame Cots Data Entry" ? (
              <div className={styles.machineSection}>
                <h3 className={styles.machineSectionTitle}>Machine-Specific Data</h3>

                <div className={styles.machineCardList}>
                  {machineEntries.map((machine, index) => (
                    <div key={`machine-card-${index}`} className={styles.machineCard}>
                      <div className={styles.machineNameRow}>
                        <label className={styles.machineNameLabel}>MC Name :</label>
                        <span className={styles.machineNameValue}>{machine.machineName}</span>
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
                <div className={styles.calculateWrap}>
                  <button
                    type="button"
                    onClick={handleCalculate}
                    className={`${styles.button} ${styles.calculateButton}`}
                  >
                    Calculate CV%
                  </button>
                </div>

                <div className={styles.resultsWrap}>
                  {(oneYardMetrics.length ? oneYardMetrics : [emptyMetric()]).map((_, index) => (
                    <div key={`reading-result-${index}`} className={styles.readingBlock}>
                      <h3 className={styles.readingTitle}>{`Reading - ${index + 1}`}</h3>

                      <div className={styles.resultCard}>
                        <div className={styles.resultSection}>
                          <h4 className={styles.resultTitle}>Calculation Results - 1 yard Readings</h4>
                          <div className={styles.metricsGrid}>
                            <div className={styles.field}>
                              <label className={styles.label}>AVG (1 Yard)</label>
                            <input
                              value={oneYardMetrics[index]?.avg || ""}
                              onChange={(e) => handleMetricChange(setOneYardMetrics, index, "avg", e.target.value)}
                              className={`${styles.metricInput} ${
                                errors.oneYard?.[index]?.avg ? styles.inputError : ""
                              }`}
                            />
                            </div>
                            <div className={styles.field}>
                              <label className={styles.label}>HANK (1 Yard)</label>
                              <input
                                value={oneYardMetrics[index]?.hank || ""}
                                onChange={(e) => handleMetricChange(setOneYardMetrics, index, "hank", e.target.value)}
                                className={`${styles.metricInput} ${
                                  errors.oneYard?.[index]?.hank ? styles.inputError : ""
                                }`}
                              />
                            </div>
                            <div className={styles.field}>
                              <label className={styles.label}>SD (1 Yard)</label>
                              <input
                                value={oneYardMetrics[index]?.sd || ""}
                                onChange={(e) => handleMetricChange(setOneYardMetrics, index, "sd", e.target.value)}
                                className={`${styles.metricInput} ${
                                  errors.oneYard?.[index]?.sd ? styles.inputError : ""
                                }`}
                              />
                            </div>
                          </div>
                          <div className={styles.metricCompact}>
                            <div className={styles.field}>
                              <label className={styles.label}>CV% (1 Yard)</label>
                              <input
                                readOnly
                                value={hasCalculated ? oneYardMetrics[index]?.cv || "" : ""}
                                className={styles.metricInput}
                              />
                            </div>
                          </div>
                        </div>

                        <div className={styles.resultSection}>
                          <h4 className={styles.resultTitle}>Calculation Results - 1/2 yard Readings</h4>
                          <div className={styles.metricsGrid}>
                            <div className={styles.field}>
                              <label className={styles.label}>AVG (1/2 Yard)</label>
                              <input
                                value={halfYardMetrics[index]?.avg || ""}
                                onChange={(e) => handleMetricChange(setHalfYardMetrics, index, "avg", e.target.value)}
                                className={`${styles.metricInput} ${
                                  errors.halfYard?.[index]?.avg ? styles.inputError : ""
                                }`}
                              />
                            </div>
                            <div className={styles.field}>
                              <label className={styles.label}>HANK (1/2 Yard)</label>
                              <input
                                value={halfYardMetrics[index]?.hank || ""}
                                onChange={(e) => handleMetricChange(setHalfYardMetrics, index, "hank", e.target.value)}
                                className={`${styles.metricInput} ${
                                  errors.halfYard?.[index]?.hank ? styles.inputError : ""
                                }`}
                              />
                            </div>
                            <div className={styles.field}>
                              <label className={styles.label}>SD (1/2 Yard)</label>
                              <input
                                value={halfYardMetrics[index]?.sd || ""}
                                onChange={(e) => handleMetricChange(setHalfYardMetrics, index, "sd", e.target.value)}
                                className={`${styles.metricInput} ${
                                  errors.halfYard?.[index]?.sd ? styles.inputError : ""
                                }`}
                              />
                            </div>
                          </div>
                          <div className={styles.metricCompact}>
                            <div className={styles.field}>
                              <label className={styles.label}>CV% (1/2 Yard)</label>
                              <input
                                readOnly
                                value={hasCalculated ? halfYardMetrics[index]?.cv || "" : ""}
                                className={styles.metricInput}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {error && <p className={styles.messageError}>{error}</p>}
          </div>

          <Footer
            onBack={() => router.push("/dashboard")}
            onClear={handleClear}
            onSave={openPreview}
            saveLabel={actionLoading ? "Submitting..." : "Save Record"}
            disabled={actionLoading}
          />
        </div>
        {form.type === "U% Data Entry" && (
  <div
    style={{
      marginTop: "20px",
      background: "#fff",
      borderRadius: "10px",
      padding: "16px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      overflowX: "auto",
    }}
  >
    <h3
      style={{
        marginBottom: "12px",
        fontSize: "18px",
        fontWeight: "600",
        color: "#333",
      }}
    >
      Last 10 Entries
    </h3>

    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "14px",
        minWidth: "900px",
      }}
    >
      <thead style={{ backgroundColor: "#f4f6f8" }}>
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
                color: "#444",
                borderBottom: "2px solid #e0e0e0",
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
            <td
              colSpan={10}
              style={{
                padding: "16px",
                textAlign: "center",
                color: "#64748b",
              }}
            >
              Loading entries...
            </td>
          </tr>
        ) : uqcEntries.length ? uqcEntries.map((entry, i) => (
          <tr
            key={entry.id || i}
            style={{
              backgroundColor: i % 2 === 0 ? "#fff" : "#fafafa",
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
                  borderBottom: "1px solid #eaeaea",
                  color: idx === 5 ? "#1976d2" : "#555",
                  fontWeight: idx === 5 ? "600" : "400",
                }}
              >
                {cell}
              </td>
            ))}
          </tr>
        )) : (
          <tr>
            <td
              colSpan={10}
              style={{
                padding: "16px",
                textAlign: "center",
                color: "#64748b",
              }}
            >
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

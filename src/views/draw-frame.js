import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { MdOutlineEditNote } from "react-icons/md";

import Footer from "@/components/Footer";
import {
  clearDrawFrameState,
  fetchDrawFrameCotsEntries,
  submitDrawFrameCotsInspection,
  submitDrawFrameYarnCvInspection,
} from "@/store/slices/draw-frame";
import styles from "@/styles/draw-frame.module.css";

const today = new Date().toISOString().split("T")[0];

const primaryTypeOptions = [
  "Yarn CV% Calculation Form",
  "Draw Frame Cots Data Entry",
];

const processTypeOptions = ["Breaker", "Finisher", "Pre-Draw"];
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
  const { actionLoading, actionSuccess, cotsEntries, listLoading, error } = useSelector(
    (state) =>
      state.drawFrame ?? {
        actionLoading: false,
        actionSuccess: false,
        cotsEntries: [],
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

  const handleFormChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: field === "readingCount" ? Number(value) || 0 : value,
    }));
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
  };

  const handleGenerate = () => {
    const count = Math.max(Number(form.readingCount) || 0, 0);
    setOneYardMetrics(Array.from({ length: count }, () => emptyMetric()));
    setHalfYardMetrics(Array.from({ length: count }, () => emptyMetric()));
    setHasCalculated(false);
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
  }, [dispatch, form.type]);

  const handleSubmit = () => {
    const isCots = form.type === "Draw Frame Cots Data Entry";

    if (isCots) {
      const hasEmptyHeaderField =
        !form.date.trim() ||
        !form.shift.trim() ||
        !form.processType.trim();

      const hasEmptyMachineField = machineEntries.some((item) => {
        const commonMissing =
          !item.machineName.trim() ||
          item.fanWaste === "" ||
          item.cotChange === "" ||
          item.stripperWaste === "" ||
          item.thickPlace === "";

        if (form.processType === "Finisher") {
          return (
            commonMissing ||
            item.autoLevel === "" ||
            item.silverMon === "" ||
            item.massThick === "" ||
            item.scanningR === ""
          );
        }

        return commonMissing;
      });

      if (hasEmptyHeaderField || hasEmptyMachineField) {
        alert("Please fill all fields.");
        return;
      }
    } else {
      const hasEmptyHeaderField =
        !form.serialNumber.trim() ||
        !form.date.trim() ||
        !form.machineNumber.trim() ||
        !form.remarks.trim() ||
        !String(form.readingCount).trim();

      const hasEmptyMetrics =
        !oneYardMetrics.length ||
        !halfYardMetrics.length ||
        oneYardMetrics.some((item) => item.avg === "" || item.hank === "" || item.sd === "") ||
        halfYardMetrics.some((item) => item.avg === "" || item.hank === "" || item.sd === "");

      if (hasEmptyHeaderField || hasEmptyMetrics) {
        alert("Please fill all fields.");
        return;
      }
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

  useEffect(() => {
    if (actionSuccess) {
      if (form.type === "Draw Frame Cots Data Entry") {
        dispatch(fetchDrawFrameCotsEntries({ page: 1, limit: 10 }));
      }
      alert("Data submitted successfully");
      handleClear();
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

            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.label}>Type</label>
                <select
                  value={form.type}
                  onChange={(e) => handleFormChange("type", e.target.value)}
                  className={styles.select}
                >
                  {primaryTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              {form.type === "Draw Frame Cots Data Entry" ? (
                <>
                  <div className={styles.field}>
                    <label className={styles.label}>Date</label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) => handleFormChange("date", e.target.value)}
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Shift</label>
                    <select
                      value={form.shift}
                      onChange={(e) => handleFormChange("shift", e.target.value)}
                      className={styles.select}
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
                      className={styles.select}
                    >
                      {processTypeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.field}>
                    <label className={styles.label}>S. No.</label>
                    <input
                      value={form.serialNumber}
                      onChange={(e) => handleFormChange("serialNumber", e.target.value)}
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Date</label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) => handleFormChange("date", e.target.value)}
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Machine Number</label>
                    <select
                      value={form.machineNumber}
                      onChange={(e) => handleFormChange("machineNumber", e.target.value)}
                      className={styles.select}
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
                      className={styles.textarea}
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
                        className={styles.input}
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
                            className={styles.input}
                          />
                        </div>

                        <div className={styles.field}>
                          <label className={styles.label}>Cot Change</label>
                          <input
                            value={machine.cotChange}
                            onChange={(e) => handleMachineChange(index, "cotChange", e.target.value)}
                            className={styles.input}
                          />
                        </div>

                        <div className={styles.field}>
                          <label className={styles.label}>Stripper W</label>
                          <input
                            value={machine.stripperWaste}
                            onChange={(e) => handleMachineChange(index, "stripperWaste", e.target.value)}
                            className={styles.input}
                          />
                        </div>

                        {form.processType === "Finisher" ? (
                          <>
                            <div className={styles.field}>
                              <label className={styles.label}>Thick Place</label>
                              <input
                                value={machine.thickPlace}
                                onChange={(e) => handleMachineChange(index, "thickPlace", e.target.value)}
                                className={styles.input}
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Auto Level</label>
                              <input
                                value={machine.autoLevel}
                                onChange={(e) => handleMachineChange(index, "autoLevel", e.target.value)}
                                className={styles.input}
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Silver Mon</label>
                              <input
                                value={machine.silverMon}
                                onChange={(e) => handleMachineChange(index, "silverMon", e.target.value)}
                                className={styles.input}
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Mass Thick</label>
                              <input
                                value={machine.massThick}
                                onChange={(e) => handleMachineChange(index, "massThick", e.target.value)}
                                className={styles.input}
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Scanning R</label>
                              <input
                                value={machine.scanningR}
                                onChange={(e) => handleMachineChange(index, "scanningR", e.target.value)}
                                className={styles.input}
                              />
                            </div>
                          </>
                        ) : (
                          <div className={`${styles.field} ${styles.machineFieldCompact}`}>
                            <label className={styles.label}>Thick Place</label>
                            <input
                              value={machine.thickPlace}
                              onChange={(e) => handleMachineChange(index, "thickPlace", e.target.value)}
                              className={styles.input}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            ) : (
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
                                className={styles.metricInput}
                              />
                            </div>
                            <div className={styles.field}>
                              <label className={styles.label}>HANK (1 Yard)</label>
                              <input
                                value={oneYardMetrics[index]?.hank || ""}
                                onChange={(e) => handleMetricChange(setOneYardMetrics, index, "hank", e.target.value)}
                                className={styles.metricInput}
                              />
                            </div>
                            <div className={styles.field}>
                              <label className={styles.label}>SD (1 Yard)</label>
                              <input
                                value={oneYardMetrics[index]?.sd || ""}
                                onChange={(e) => handleMetricChange(setOneYardMetrics, index, "sd", e.target.value)}
                                className={styles.metricInput}
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
                                className={styles.metricInput}
                              />
                            </div>
                            <div className={styles.field}>
                              <label className={styles.label}>HANK (1/2 Yard)</label>
                              <input
                                value={halfYardMetrics[index]?.hank || ""}
                                onChange={(e) => handleMetricChange(setHalfYardMetrics, index, "hank", e.target.value)}
                                className={styles.metricInput}
                              />
                            </div>
                            <div className={styles.field}>
                              <label className={styles.label}>SD (1/2 Yard)</label>
                              <input
                                value={halfYardMetrics[index]?.sd || ""}
                                onChange={(e) => handleMetricChange(setHalfYardMetrics, index, "sd", e.target.value)}
                                className={styles.metricInput}
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

            {actionSuccess && (
              <p className={styles.messageSuccess}>Draw Frame inspection saved successfully.</p>
            )}
            {error && <p className={styles.messageError}>{error}</p>}
          </div>

          <Footer
            onBack={() => router.push("/dashboard")}
            onClear={handleClear}
            onSave={handleSubmit}
            saveLabel={actionLoading ? "Submitting..." : "Submit"}
            disabled={actionLoading}
          />
        </div>
      </div>
    </div>
  );
}

export default DrawFrame;

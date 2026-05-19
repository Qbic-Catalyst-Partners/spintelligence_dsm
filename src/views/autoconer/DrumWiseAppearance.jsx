import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  getAutoconerDrumWise,
  saveAutoconerDrumWise,
} from "@/store/slices/autoconer";
import styles from "@/styles/drumWiseAppearance.module.css";
import { sanitizeIntegerInput } from "@/utils/inputValidation";

const getTodayDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const countOptions = [
  "10 COTTON POLY LINEN 60/20/20 400...",
  "20 WHITE POLY YARN CONES",
  "30 BLACK POLY YARN CONES",
];

const autoconerOptions = ["AC03", "AC04", "AC05"];

const buildRowsFromRange = (from, to) => {
  const start = Number(from) || 1;
  const end = Number(to) || start;
  if (end < start) {
    return [{ drumNo: String(start), ok: 1, notOk: 0 }];
  }
  return Array.from({ length: end - start + 1 }, (_, index) => ({
    drumNo: String(start + index),
    ok: 0,
    notOk: 1,
  }));
};

const mapDrumWiseEntryToRows = (entry = {}) => {
  const inspections = Array.isArray(entry.drum_inspections) ? entry.drum_inspections : [];

  if (inspections.length > 0) {
    return inspections.map((row) => ({
      drumNo: String(row.drum_no ?? row.drumNo ?? entry.drum_from ?? "-"),
      ok: Number(row.appearance_ok_count ?? (row.appearance_ok ? 1 : 0) ?? row.ok ?? 0),
      notOk: Number(row.appearance_not_ok_count ?? row.notOk ?? 0),
    }));
  }

  return [
    {
      drumNo: String(entry.drum_no ?? entry.drum_from ?? "-"),
      ok: Number(entry.appearance_ok_count ?? entry.ok ?? 0),
      notOk: Number(entry.appearance_not_ok_count ?? entry.notOk ?? 0),
    },
  ];
};

function DrumWiseAppearance({
  types,
  selectedType,
  onTypeChange,
  onRegisterActions,
  tablePortalTargetId,
  postFooterPortalTargetId,
}) {
  const todayDate = getTodayDate();
  const dispatch = useDispatch();
  const autoconerState = useSelector((state) => state.autoconer) || {};
  const { isLoading = false, isFetching = false, drumWise: savedEntries = [] } = autoconerState;
  const [testNo, setTestNo] = useState("");
  const [entryDate, setEntryDate] = useState(todayDate);
  const [countName, setCountName] = useState(countOptions[0]);
  const [autoconerNo, setAutoconerNo] = useState(autoconerOptions[0]);
  const [drumFrom, setDrumFrom] = useState("");
  const [drumTo, setDrumTo] = useState("");
  const [remarks, setRemarks] = useState("");
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState({});
  const [portalReady, setPortalReady] = useState(false);
  const errorStyle = (flag) =>
    flag
      ? {
          borderColor: "#ef4444",
          backgroundColor: "#fff1f2",
          boxShadow: "0 0 0 1000px #fff1f2 inset",
        }
      : undefined;

  const savedRows = useMemo(
    () => savedEntries.flatMap((entry) => mapDrumWiseEntryToRows(entry)).slice(0, 10),
    [savedEntries]
  );

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const updateAppearance = (drumNo, key) => {
    setRows((current) =>
      current.map((row) =>
        row.drumNo === drumNo
          ? { ...row, ok: key === "ok" ? 1 : 0, notOk: key === "notOk" ? 1 : 0 }
          : row
      )
    );
  };

  const resetForm = () => {
    setTestNo("");
    setEntryDate(todayDate);
    setCountName(countOptions[0]);
    setAutoconerNo(autoconerOptions[0]);
    setDrumFrom("");
    setDrumTo("");
    setRemarks("");
    setRows([]);
    setErrors({});
  };

  const validate = () => {
    const nextErrors = {};
    if (!String(selectedType || "").trim()) nextErrors.type = true;
    if (!String(testNo || "").trim()) nextErrors.testNo = true;
    if (!String(entryDate || "").trim()) nextErrors.entryDate = true;
    if (!String(countName || "").trim()) nextErrors.countName = true;
    if (!String(autoconerNo || "").trim()) nextErrors.autoconerNo = true;
    if (!String(drumFrom || "").trim()) nextErrors.drumFrom = true;
    if (!String(drumTo || "").trim()) nextErrors.drumTo = true;
    if (!String(remarks || "").trim()) nextErrors.remarks = true;
    if (!rows.length) nextErrors.rows = true;
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getPreviewData = () => [
    { label: "Type", value: selectedType || "-" },
    { label: "Test No.", value: testNo || "-" },
    { label: "Entry Date", value: entryDate || "-" },
    { label: "Count Name", value: countName || "-" },
    { label: "Auto Coner No.", value: autoconerNo || "-" },
    { label: "Drum From", value: drumFrom || "-" },
    { label: "Drum To", value: drumTo || "-" },
    { label: "Remarks", value: remarks || "-" },
    ...rows.map((row) => ({
      label: `Drum ${row.drumNo}`,
      value: row.ok ? "OK" : row.notOk ? "NOT OK" : "-",
    })),
  ];

  const submit = async () => {
    if (!validate()) return false;
    try {
      const payload = {
        test_no: Number(testNo) || 0,
        entry_date: entryDate,
        type: "Drum Inspection",
        drum_from: Number(drumFrom) || 0,
        drum_to: Number(drumTo) || 0,
        remarks,
        machine_code: autoconerNo || null,
        count_name: countName || null,
        drum_inspections: rows.map((row) => ({
          drum_no: Number(row.drumNo) || 0,
          appearance_ok: Boolean(row.ok),
          appearance_ok_count: row.ok ? 1 : 0,
          appearance_not_ok_count: row.notOk ? 1 : 0,
        })),
      };

      await dispatch(saveAutoconerDrumWise(payload)).unwrap();
      dispatch(getAutoconerDrumWise({ page: 1, limit: 10 }));
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    setRows((current) => {
      if (!drumFrom || !drumTo) {
        return [];
      }
      if (!current.length) return buildRowsFromRange(drumFrom, drumTo);
      const start = Number(drumFrom);
      const end = Number(drumTo);
      if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
        return current;
      }
      if (
        current[0]?.drumNo === String(start) &&
        current[current.length - 1]?.drumNo === String(end) &&
        current.length === end - start + 1
      ) {
        return current;
      }

      const nextRows = buildRowsFromRange(start, end);
      return nextRows.map((row) => {
        const existing = current.find((item) => item.drumNo === row.drumNo);
        return existing || row;
      });
    });
  }, [drumFrom, drumTo]);

  useEffect(() => {
    dispatch(getAutoconerDrumWise({ page: 1, limit: 10 }));
  }, [dispatch]);

  useEffect(() => {
    if (!onRegisterActions) return;
    onRegisterActions({
      validate,
      getPreviewData,
      submit,
      onClear: resetForm,
      saveLabel: "Save Record",
      disabled: isLoading,
    });
  }, [
    onRegisterActions,
    selectedType,
    testNo,
    entryDate,
    countName,
    autoconerNo,
    drumFrom,
    drumTo,
    remarks,
    rows,
    isLoading,
  ]);

  const tablePortalTarget =
    portalReady && tablePortalTargetId && typeof document !== "undefined"
      ? document.getElementById(tablePortalTargetId)
      : null;

  const summaryPortalTarget =
    portalReady && postFooterPortalTargetId && typeof document !== "undefined"
      ? document.getElementById(postFooterPortalTargetId)
      : null;

  const appearanceSection = (
    <div className={styles.appearanceSection}>
      <div className={styles.appearanceTable}>
        <div className={styles.appearanceHeader}>
          <span>DRUM NO.</span>
          <span>APPEARANCE</span>
        </div>

        {rows.map((row) => (
          <div key={row.drumNo} className={styles.appearanceRow}>
            <span className={styles.drumNo}>{row.drumNo}</span>
            <div className={styles.toggleGroup}>
              <button
                type="button"
                className={`${styles.toggleBtn} ${row.ok ? styles.active : ""}`}
                onClick={() => updateAppearance(row.drumNo, "ok")}
              >
                OK
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${row.notOk ? styles.active : ""}`}
                onClick={() => updateAppearance(row.drumNo, "notOk")}
              >
                NOT OK
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.remarksBlock}>
        <label>Remarks</label>
        <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} style={errorStyle(errors.remarks)} />
      </div>
    </div>
  );

  const summarySection = (
    <div className={styles.summaryCard}>
      <h4>All Drum Entries</h4>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>DRUM NO.</th>
            <th>APPEARANCE OK</th>
            <th>APPEARANCE NOT OK</th>
          </tr>
        </thead>
        <tbody>
          {savedRows.map((row, index) => (
            <tr key={`summary-${row.drumNo}-${index}`}>
              <td>{row.drumNo}</td>
              <td>{row.ok}</td>
              <td>{row.notOk}</td>
            </tr>
          ))}
          {!savedRows.length ? (
            <tr>
              <td colSpan={3}>
                {isFetching ? "Loading last 10 drum wise entries..." : "No drum wise entries available."}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.entryCard}>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label>Type</label>
            <select value={selectedType} onChange={(e) => onTypeChange(e.target.value)} style={errorStyle(errors.type)}>
              {types.map((type) => (
                <option key={type.id} value={type.name}>
                  {type.displayName ?? type.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label>Test No.</label>
            <input value={testNo} onChange={(e) => setTestNo(sanitizeIntegerInput(e.target.value, 10))} style={errorStyle(errors.testNo)} />
          </div>

          <div className={styles.field}>
            <label>Entry Date</label>
            <input type="date" value={entryDate} disabled style={errorStyle(errors.entryDate)} />
          </div>

          <div className={styles.field}>
            <label>Count Name</label>
            <select value={countName} onChange={(e) => setCountName(e.target.value)} style={errorStyle(errors.countName)}>
              {countOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label>Auto Coner No.</label>
            <select value={autoconerNo} onChange={(e) => setAutoconerNo(e.target.value)} style={errorStyle(errors.autoconerNo)}>
              {autoconerOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.doubleField}>
            <div className={styles.field}>
              <label>Drum From/To</label>
              <input value={drumFrom} onChange={(e) => setDrumFrom(sanitizeIntegerInput(e.target.value, 10))} style={errorStyle(errors.drumFrom || errors.rows)} />
            </div>
            <div className={styles.field}>
              <label className={styles.hiddenLabel}>To</label>
              <input value={drumTo} onChange={(e) => setDrumTo(sanitizeIntegerInput(e.target.value, 10))} style={errorStyle(errors.drumTo || errors.rows)} />
            </div>
          </div>
        </div>

      </div>
      {tablePortalTarget ? createPortal(appearanceSection, tablePortalTarget) : null}
      {summaryPortalTarget ? createPortal(summarySection, summaryPortalTarget) : null}
    </div>
  );
}

export default DrumWiseAppearance;

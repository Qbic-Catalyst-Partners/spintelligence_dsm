import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  getAutoconerDrumWise,
  saveAutoconerDrumWise,
} from "@/store/slices/autoconer";
import {
  fetchAutoconerCountMaster,
  fetchAutoconerMachineMaster,
} from "@/apis/autoconer";
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
  { value: "", label: "Select Count Name" },
  { value: "10 COTTON POLY LINEN 60/20/20 400...", label: "10 COTTON POLY LINEN 60/20/20 400..." },
  { value: "20 WHITE POLY YARN CONES", label: "20 WHITE POLY YARN CONES" },
  { value: "30 BLACK POLY YARN CONES", label: "30 BLACK POLY YARN CONES" },
];

const autoconerOptions = [
  { value: "", label: "Select Auto Coner" },
  { value: "AC03", label: "AC03" },
  { value: "AC04", label: "AC04" },
  { value: "AC05", label: "AC05" },
];

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
  entryId = "",
}) {
  const todayDate = getTodayDate();
  const dispatch = useDispatch();
  const autoconerState = useSelector((state) => state.autoconer) || {};
  const { isLoading = false, isFetching = false, drumWise: savedEntries = [] } = autoconerState;
  const [testNo, setTestNo] = useState("");
  const [entryDate, setEntryDate] = useState(todayDate);
  const [countName, setCountName] = useState("");
  const [autoconerNo, setAutoconerNo] = useState("");
  const [masterCounts, setMasterCounts] = useState(countOptions);
  const [masterMachines, setMasterMachines] = useState(autoconerOptions);
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
  const selectedCountLabel =
    masterCounts.find((option) => String(option.value) === String(countName))?.label || countName;
  const selectedMachineLabel =
    masterMachines.find((option) => String(option.value) === String(autoconerNo))?.label || autoconerNo;

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
    setCountName("");
    setAutoconerNo("");
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
    { label: "Entry ID", value: entryId || "-" },
    { label: "Count Name", value: selectedCountLabel || "-" },
    { label: "Auto Coner No.", value: selectedMachineLabel || "-" },
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
        machine_id: Number(autoconerNo) || null,
        count_id: Number(countName) || null,
        drum_from: Number(drumFrom) || 0,
        drum_to: Number(drumTo) || 0,
        remarks,
        machine_code: selectedMachineLabel || null,
        count_name: selectedCountLabel || null,
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
    let active = true;

    const loadMasters = async () => {
      const [countResponse, machineResponse] = await Promise.all([
        fetchAutoconerCountMaster(),
        fetchAutoconerMachineMaster(),
      ]);

      if (!active) return;

      const countList = Array.isArray(countResponse?.options)
        ? countResponse.options.map((option) => ({
            value: option.value,
            label: option.label,
          }))
        : [];
      const machineList = Array.isArray(machineResponse?.options)
        ? machineResponse.options.map((option) => ({
            value: option.value,
            label: option.label,
          }))
        : [];

      setMasterCounts([countOptions[0], ...(countList.length ? countList : countOptions.slice(1))]);
      setMasterMachines([autoconerOptions[0], ...(machineList.length ? machineList : autoconerOptions.slice(1))]);
    };

    loadMasters();

    return () => {
      active = false;
    };
  }, []);

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
              <label className={styles.radioOption}>
                <input
                  type="radio"
                  name={`appearance-${row.drumNo}`}
                  value="ok"
                  checked={row.ok === 1}
                  onChange={() => updateAppearance(row.drumNo, "ok")}
                  className={styles.radioInput}
                />
                <span>Yes</span>
              </label>
              <label className={styles.radioOption}>
                <input
                  type="radio"
                  name={`appearance-${row.drumNo}`}
                  value="notOk"
                  checked={row.notOk === 1}
                  onChange={() => updateAppearance(row.drumNo, "notOk")}
                  className={styles.radioInput}
                />
                <span>No</span>
              </label>
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
            <label>Entry ID</label>
            <input type="text" value={entryId} readOnly disabled />
          </div>

          <div className={styles.field}>
            <label>Count Name</label>
            <select value={countName} onChange={(e) => setCountName(e.target.value)} style={errorStyle(errors.countName)}>
              {masterCounts.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label>Auto Coner No.</label>
            <select value={autoconerNo} onChange={(e) => setAutoconerNo(e.target.value)} style={errorStyle(errors.autoconerNo)}>
              {masterMachines.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
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

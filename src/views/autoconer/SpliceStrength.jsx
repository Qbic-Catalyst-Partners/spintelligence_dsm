import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MdEditNote } from "react-icons/md";
import { useDispatch, useSelector } from "react-redux";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import {
  getAutoconerSpliceStrength,
  saveAutoconerSpliceStrength,
} from "@/store/slices/autoconer";
import styles from "@/styles/spliceStrength.module.css";
import { sanitizeIntegerInput, sanitizeNumericInput } from "@/utils/inputValidation";

const getTodayDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const countOptions = [
  "Cotton 20s",
  "10 GRC POLY YARN CONES",
  "20 WHITE POLY YARN CONES",
  "30 BLACK POLY YARN CONES",
];

const autoconerOptions = ["AC-01", "AC02", "AC03", "AC04"];
const drumOptions = ["1", "2", "3", "4", "5", "10"];
const initialRows = (count) =>
  Array.from({ length: count }, (_, index) => ({
    drumNo: "",
    readingNumber: String(index + 1),
    spliceStrength: "",
    parentYarn: "",
  }));

const mapSpliceEntryToRows = (entry = {}) => {
  const nestedRows = Array.isArray(entry.drum_readings) ? entry.drum_readings : [];

  if (nestedRows.length > 0) {
    return nestedRows.map((row, index) => {
      const spliceStrength = String(row.splice_strength ?? row.spliceStrength ?? "-");
      const parentYarn = String(row.parent_yarn ?? row.parentYarn ?? "-");
      const percentValue =
        row.percent_yarn ?? row.percentYarn ?? (
          Number(parentYarn) ? ((Number(spliceStrength) / Number(parentYarn)) * 100).toFixed(2) : "-"
        );

      return {
        drumNo: String(row.drum_no ?? row.drumNo ?? entry.drum_from ?? "-"),
        readingNumber: String(row.reading_number ?? row.readingNumber ?? index + 1),
        spliceStrength,
        parentYarn,
        percent: String(percentValue),
      };
    });
  }

  return [
    {
      drumNo: String(entry.drum_from ?? entry.drumNo ?? "-"),
      readingNumber: String(entry.reading_number ?? "1"),
      spliceStrength: String(entry.splice_strength ?? "-"),
      parentYarn: String(entry.parent_yarn ?? "-"),
      percent: String(entry.percent_yarn ?? entry.average ?? "-"),
    },
  ];
};

function SpliceStrength({
  types,
  selectedType,
  onTypeChange,
  onRegisterActions,
  postFooterPortalTargetId,
}) {
  const todayDate = getTodayDate();
  const dispatch = useDispatch();
  const autoconerState = useSelector((state) => state.autoconer) || {};
  const { isLoading = false, isFetching = false, spliceStrength: savedEntries = [] } = autoconerState;
  const [testNo, setTestNo] = useState("");
  const [date, setDate] = useState(todayDate);
  const [countName, setCountName] = useState(countOptions[0]);
  const [autoconerNo, setAutoconerNo] = useState(autoconerOptions[0]);
  const [drumFrom, setDrumFrom] = useState("");
  const [drumTo, setDrumTo] = useState("");
  const [coneTip, setConeTip] = useState("");
  const [cspValue, setCspValue] = useState("");
  const [readingCount, setReadingCount] = useState("");
  const [generatedRows, setGeneratedRows] = useState([]);
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

  const rowsWithPercent = useMemo(
    () =>
      generatedRows.map((row) => {
        const splice = parseFloat(row.spliceStrength) || 0;
        const parent = parseFloat(row.parentYarn) || 0;
        const percent = parent ? ((splice / parent) * 100).toFixed(2) : "0.00";
        return { ...row, percent };
      }),
    [generatedRows]
  );

  const average = useMemo(() => {
    if (!rowsWithPercent.length) {
      return { readingNumber: "", splice: "", parent: "", percent: "" };
    }

    const totalSplice = rowsWithPercent.reduce((sum, row) => sum + (parseFloat(row.spliceStrength) || 0), 0);
    const totalParent = rowsWithPercent.reduce((sum, row) => sum + (parseFloat(row.parentYarn) || 0), 0);
    const totalPercent = rowsWithPercent.reduce((sum, row) => sum + (parseFloat(row.percent) || 0), 0);
    const count = rowsWithPercent.length;

    return {
      readingNumber: String(count),
      splice: (totalSplice / count).toFixed(2),
      parent: (totalParent / count).toFixed(2),
      percent: (totalPercent / count).toFixed(2),
    };
  }, [rowsWithPercent]);

  const cspAverage = useMemo(() => {
    if (!cspValue) return "";
    const csp = parseFloat(cspValue) || 0;
    return (csp * 0.264).toFixed(2);
  }, [cspValue]);

  const handleGenerate = () => {
    const count = Math.max(1, Number(readingCount) || 1);
    setGeneratedRows(
      Array.from({ length: count }, (_, index) => ({
        drumNo: drumFrom || "",
        readingNumber: String(index + 1),
        spliceStrength: "",
        parentYarn: "",
      }))
    );
    setErrors((current) => {
      const next = { ...current };
      delete next.readingCount;
      delete next.generatedRows;
      return next;
    });
  };

  const resetForm = () => {
    setTestNo("");
    setDate(todayDate);
    setCountName(countOptions[0]);
    setAutoconerNo(autoconerOptions[0]);
    setDrumFrom("");
    setDrumTo("");
    setConeTip("");
    setCspValue("");
    setReadingCount("");
    setGeneratedRows([]);
    setErrors({});
  };

  const validate = () => {
    const nextErrors = {};
    if (!String(selectedType || "").trim()) nextErrors.type = true;
    if (!String(testNo || "").trim()) nextErrors.testNo = true;
    if (!String(date || "").trim()) nextErrors.date = true;
    if (!String(countName || "").trim()) nextErrors.countName = true;
    if (!String(autoconerNo || "").trim()) nextErrors.autoconerNo = true;
    if (!String(drumFrom || "").trim()) nextErrors.drumFrom = true;
    if (!String(drumTo || "").trim()) nextErrors.drumTo = true;
    if (!String(coneTip || "").trim()) nextErrors.coneTip = true;
    if (!String(cspValue || "").trim()) nextErrors.cspValue = true;
    if (!String(readingCount || "").trim()) nextErrors.readingCount = true;
    if (!rowsWithPercent.length) nextErrors.generatedRows = true;
    rowsWithPercent.forEach((row, index) => {
      if (!String(row.spliceStrength || "").trim()) nextErrors[`splice-${index}`] = true;
      if (!String(row.parentYarn || "").trim()) nextErrors[`parent-${index}`] = true;
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getPreviewData = () => [
    { label: "Type", value: selectedType || "-" },
    { label: "Test No.", value: testNo || "-" },
    { label: "Date", value: date || "-" },
    { label: "Count Name", value: countName || "-" },
    { label: "Auto Coner No.", value: autoconerNo || "-" },
    { label: "Drum From", value: drumFrom || "-" },
    { label: "Drum To", value: drumTo || "-" },
    { label: "Cone Tip", value: coneTip || "-" },
    { label: "CSP Value", value: cspValue || "-" },
    { label: "Average", value: average.splice || "-" },
    ...rowsWithPercent.map((row, index) => ({
      label: `Reading ${index + 1}`,
      value: `${row.spliceStrength || "-"} | ${row.parentYarn || "-"} | ${row.percent || "-"}`,
    })),
  ];

  const submit = async () => {
    if (!validate()) return false;
    try {
      const payload = {
        type: "Splice Strength Test",
        test_no: Number(testNo) || 0,
        inspection_date: date,
        count_name: countName,
        auto_coner_no: autoconerNo,
        drum_from: Number(drumFrom) || 0,
        drum_to: Number(drumTo) || 0,
        cone_tip: coneTip,
        csp_value: cspValue,
        average: average.splice,
        drum_readings: rowsWithPercent.map((row) => ({
          drum_no: Number(row.drumNo) || 0,
          reading_number: Number(row.readingNumber) || 0,
          splice_strength: Number(row.spliceStrength) || 0,
          parent_yarn: Number(row.parentYarn) || 0,
          percent_yarn: Number(row.percent) || 0,
        })),
      };

      await dispatch(saveAutoconerSpliceStrength(payload)).unwrap();
      dispatch(getAutoconerSpliceStrength({ page: 1, limit: 10 }));
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    dispatch(getAutoconerSpliceStrength({ page: 1, limit: 10 }));
  }, [dispatch]);

  useEffect(() => {
    setPortalReady(true);
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
    dispatch,
    isLoading,
    testNo,
    date,
    countName,
    autoconerNo,
    drumFrom,
    drumTo,
    coneTip,
    cspValue,
    rowsWithPercent,
    average.splice,
    rowsWithPercent,
  ]);

  const handleRowChange = (index, field, value) => {
    const nextValue =
      field === "spliceStrength" || field === "parentYarn"
        ? sanitizeNumericInput(value, { precision: 10, scale: 2 })
        : value;
    setGeneratedRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: nextValue } : row
      )
    );
    setErrors((current) => {
      const errorKey = field === "spliceStrength" ? `splice-${index}` : `parent-${index}`;
      if (!current[errorKey]) return current;
      const next = { ...current };
      delete next[errorKey];
      return next;
    });
  };

  const allEntries = useMemo(
    () => savedEntries.flatMap((entry) => mapSpliceEntryToRows(entry)).slice(0, 10),
    [savedEntries]
  );

  const summaryPortalTarget =
    portalReady && postFooterPortalTargetId && typeof document !== "undefined"
      ? document.getElementById(postFooterPortalTargetId)
      : null;

  const summarySection = (
    <div className={styles.tableCard}>
      <h4>All Drum Entries</h4>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>DRUM NO.</th>
            <th>READING NUMBER</th>
            <th>SPLICE STRENGTH</th>
            <th>PARENT YARN</th>
            <th>PREGENT YARN</th>
          </tr>
        </thead>
        <tbody>
          {allEntries.map((row, index) => (
            <tr key={`all-${row.drumNo}-${row.readingNumber}-${index}`}>
              <td>{row.drumNo}</td>
              <td>{row.readingNumber}</td>
              <td>{row.spliceStrength}</td>
              <td>{row.parentYarn}</td>
              <td>{row.percent}</td>
            </tr>
          ))}
          {!allEntries.length ? (
            <tr>
              <td colSpan={5}>{isFetching ? "Loading last 10 splice strength entries..." : "No splice strength entries available."}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.entryCard}>
        <div className={styles.formTitle}>
          <MdEditNote />
          <h3>Inspection Data Entry</h3>
          <InputScreenUploadButton className="ml-auto" />
        </div>

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
            <label>Date</label>
            <input type="date" value={date} disabled style={errorStyle(errors.date)} />
          </div>

          <div className={styles.field}>
            <label>Count Name (From)</label>
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
              <select value={drumFrom} onChange={(e) => setDrumFrom(e.target.value)} style={errorStyle(errors.drumFrom || errors.generatedRows)}>
                {drumOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.hiddenLabel}>To</label>
              <select value={drumTo} onChange={(e) => setDrumTo(e.target.value)} style={errorStyle(errors.drumTo || errors.generatedRows)}>
                {drumOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label>Cone Tip</label>
            <input value={coneTip} onChange={(e) => setConeTip(e.target.value)} style={errorStyle(errors.coneTip)} />
          </div>

          <div className={styles.field}>
            <label>CSP Value</label>
            <input value={cspValue} onChange={(e) => setCspValue(sanitizeNumericInput(e.target.value, { precision: 10, scale: 2 }))} style={errorStyle(errors.cspValue)} />
          </div>

          <div className={styles.field}>
            <label>Average</label>
            <input value={cspAverage} readOnly />
          </div>
        </div>

      </div>

      <div className={styles.generateBar}>
        <div className={styles.generateField}>
          <label>Drum No</label>
          <select value={drumFrom} onChange={(e) => setDrumFrom(e.target.value)} style={errorStyle(errors.drumFrom || errors.generatedRows)}>
            {drumOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.generateField}>
          <label>No. of Readings.</label>
          <input value={readingCount} onChange={(e) => setReadingCount(sanitizeIntegerInput(e.target.value, 10))} style={errorStyle(errors.readingCount || errors.generatedRows)} />
        </div>

        <button type="button" className={styles.generateBtn} onClick={handleGenerate}>
          Generate
        </button>
      </div>

      <div className={styles.tableSection}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>DRUM NO.</th>
              <th>READING NUMBER</th>
              <th>SPLICE STRENGTH</th>
              <th>PARENT YARN</th>
              <th>PREGENT YARN</th>
            </tr>
          </thead>
          <tbody>
            {rowsWithPercent.map((row, index) => (
              <tr key={`${row.drumNo}-${row.readingNumber}-${index}`}>
                <td>{row.drumNo}</td>
                <td>{row.readingNumber}</td>
                <td>
                  <input
                    value={row.spliceStrength}
                    onChange={(e) => handleRowChange(index, "spliceStrength", e.target.value)}
                    style={errorStyle(errors[`splice-${index}`])}
                  />
                </td>
                <td>
                  <input
                    value={row.parentYarn}
                    onChange={(e) => handleRowChange(index, "parentYarn", e.target.value)}
                    style={errorStyle(errors[`parent-${index}`])}
                  />
                </td>
                <td>{row.percent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {summaryPortalTarget ? createPortal(summarySection, summaryPortalTarget) : null}
    </div>
  );
}

export default SpliceStrength;

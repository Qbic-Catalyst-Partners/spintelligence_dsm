import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  getAutoconerSpliceStrength,
  saveAutoconerSpliceStrength,
} from "@/store/slices/autoconer";
import { fetchAutoconerSpliceStrengthMasterData } from "@/apis/autoconer";
import SearchableSelect from "@/components/SearchableSelect";
import styles from "@/styles/spliceStrength.module.css";
import { sanitizeDrumRangeInput, sanitizeIntegerInput, sanitizeNumericInput } from "@/utils/inputValidation";


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
  entryId = "",
}) {
  const todayDate = getTodayDate();
  const dispatch = useDispatch();
  const autoconerState = useSelector((state) => state.autoconer) || {};
  const { isLoading = false, isFetching = false, spliceStrength: savedEntries = [] } = autoconerState;
  const [date, setDate] = useState(todayDate);
  const [testNo, setTestNo] = useState("");
  const [countName, setCountName] = useState(countOptions[0]);
  const [countCode, setCountCode] = useState("");
  const [autoconerNo, setAutoconerNo] = useState(autoconerOptions[0]);
  const [countDropdownOptions, setCountDropdownOptions] = useState(
    countOptions.map((option) => ({ value: option, label: option, code: "" }))
  );
  const [autoconerDropdownOptions, setAutoconerDropdownOptions] = useState(
    autoconerOptions.map((option) => ({ value: option, label: option }))
  );
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
    setDate(todayDate);
    setTestNo("");
    setCountName(countDropdownOptions[0]?.label || countOptions[0]);
    setCountCode(countDropdownOptions[0]?.code || "");
    setAutoconerNo(autoconerDropdownOptions[0]?.value || autoconerOptions[0]);
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
    if (!String(date || "").trim()) nextErrors.date = true;
    if (!String(testNo || "").trim()) nextErrors.testNo = true;
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
    { label: "Entry ID", value: entryId || "-" },
    { label: "Test No", value: testNo || "-" },
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
        entry_id: entryId,
        type: "Splice Strength Test",
        test_no: testNo,
        inspection_date: date,
        count_name: countName,
        cntcode: countCode || undefined,
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
    let isCancelled = false;

    const loadMasterData = async () => {
      const response = await fetchAutoconerSpliceStrengthMasterData();
      if (isCancelled) return;

      const countOpts = Array.isArray(response?.count_options)
        ? response.count_options
            .map((item) => {
              const code = String(item?.cntcode ?? "").trim();
              const label = String(item?.cntname ?? "").trim();
              if (!label) return null;
              return { value: code || label, label, code: code || "" };
            })
            .filter(Boolean)
        : [];

      const legacyCountOpts = Array.isArray(response?.count_names)
        ? response.count_names
            .map((item) => {
              const label = String(item ?? "").trim();
              return label ? { value: label, label, code: "" } : null;
            })
            .filter(Boolean)
        : [];

      const autoconerOpts = Array.isArray(response?.autoconer_options)
        ? response.autoconer_options
            .map((item) => {
              const value = String(item?.value ?? "").trim();
              const label = String(item?.label ?? value).trim();
              if (!value && !label) return null;
              return { value: value || label, label: label || value };
            })
            .filter(Boolean)
        : [];

      const legacyAutoconerOpts = Array.isArray(response?.autoconer_nos)
        ? response.autoconer_nos
            .map((item) => {
              const label = String(item ?? "").trim();
              return label ? { value: label, label } : null;
            })
            .filter(Boolean)
        : [];

      const uniqueByValue = (options) => {
        const map = new Map();
        options.forEach((option) => {
          if (!map.has(option.value)) map.set(option.value, option);
        });
        return Array.from(map.values());
      };

      const nextCountOptions = uniqueByValue([...countOpts, ...legacyCountOpts]);
      const nextAutoconerOptions = uniqueByValue([...autoconerOpts, ...legacyAutoconerOpts]);

      if (nextCountOptions.length) {
        setCountDropdownOptions(nextCountOptions);
        setCountName((current) =>
          nextCountOptions.some((option) => option.label === current)
            ? current
            : nextCountOptions[0].label
        );
      }
      if (nextAutoconerOptions.length) {
        setAutoconerDropdownOptions(nextAutoconerOptions);
        setAutoconerNo((current) =>
          nextAutoconerOptions.some((option) => option.value === current)
            ? current
            : nextAutoconerOptions[0].value
        );
      }
    };

    loadMasterData();
    return () => {
      isCancelled = true;
    };
  }, []);

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
    date,
    testNo,
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
            <th>PARENT YARN STRENGTH</th>
            <th>PERCENT YARN</th>
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
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label>Type</label>
            <select value={selectedType} onChange={(e) => onTypeChange(e.target.value)} style={errorStyle(errors.type)}>
              {types.map((type) => {
                const optionValue =
                  typeof type === "string"
                    ? type
                    : String(type?.name ?? type?.displayName ?? type?.value ?? type?.id ?? "").trim();
                const optionLabel =
                  typeof type === "string"
                    ? type
                    : String(type?.displayName ?? type?.name ?? type?.label ?? type?.value ?? type?.id ?? "").trim();

                return (
                  <option key={optionValue || optionLabel} value={optionValue}>
                    {optionLabel || optionValue}
                  </option>
                );
              })}
            </select>
          </div>

          <div className={styles.field}>
            <label>Entry ID</label>
            <input type="text" value={entryId} readOnly disabled />
          </div>

          <div className={styles.field}>
            <label>Test No</label>
            <input
              type="text"
              value={testNo}
              onChange={(e) => {
                setTestNo(e.target.value);
                setErrors((current) => {
                  if (!current.testNo) return current;
                  const next = { ...current };
                  delete next.testNo;
                  return next;
                });
              }}
              style={errorStyle(errors.testNo)}
              placeholder="Enter Test No"
            />
          </div>

          <div className={styles.field}>
            <label>Count Name (From)</label>
            <SearchableSelect
              value={countName}
              onChange={(value) => {
                const selected = countDropdownOptions.find((option) => option.label === value || option.value === value);
                setCountName(selected?.label ?? value);
                setCountCode(selected?.code ?? "");
              }}
              options={countDropdownOptions.map((option) => option.label)}
              className={styles.select}
            />
          </div>

          <div className={styles.field}>
            <label>Auto Coner No.</label>
            <SearchableSelect
              value={autoconerNo}
              onChange={(value) => setAutoconerNo(value)}
              options={autoconerDropdownOptions.map((option) => option.value)}
              className={styles.select}
            />
          </div>

          <div className={styles.doubleField}>
            <div className={styles.field}>
              <label>Drum From/To</label>
              <input
                type="text"
                type="number"
                min="1"
                max="100"
                step="1"
                inputMode="numeric"
                value={drumFrom}
                onChange={(e) => setDrumFrom(sanitizeDrumRangeInput(e.target.value, { min: 1, max: 100, maxDigits: 3 }))}
                style={errorStyle(errors.drumFrom || errors.generatedRows)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.hiddenLabel}>To</label>
              <input
                type="text"
                type="number"
                min="1"
                max="100"
                step="1"
                inputMode="numeric"
                value={drumTo}
                onChange={(e) => setDrumTo(sanitizeDrumRangeInput(e.target.value, { min: 1, max: 100, maxDigits: 3 }))}
                style={errorStyle(errors.drumTo || errors.generatedRows)}
              />
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
          <input
            type="text"
            type="number"
            min="1"
            max="100"
            step="1"
            inputMode="numeric"
            value={drumFrom}
            onChange={(e) => setDrumFrom(sanitizeDrumRangeInput(e.target.value, { min: 1, max: 100, maxDigits: 3 }))}
            style={errorStyle(errors.drumFrom || errors.generatedRows)}
          />
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
              <th>PARENT YARN STRENGTH</th>
              <th>PERCENT YARN</th>
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

import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  getAutoconerLycraChecking,
  saveAutoconerLycraChecking,
} from "@/store/slices/autoconer";
import { fetchAutoconerLycraCheckingMasterData } from "@/apis/autoconer";
import SearchableSelect from "@/components/SearchableSelect";
import styles from "@/styles/lycraChecking.module.css";
import { sanitizeIntegerInput, sanitizeNumericInput } from "@/utils/inputValidation";


const getTodayDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const countOptions = [
  "10 BLACK POLY 70D SPX YARN",
  "10 BLACK POLY 70D SPX YARN CONES",
  "20 WHITE POLY 40D SPX YARN CONES",
  "COTTON LYCRA 30S PACK",
];

const initialReadings = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    length: "",
  }));

function LycraChecking({ types, selectedType, onTypeChange, onRegisterActions, entryId = "" }) {
  const todayDate = getTodayDate();
  const dispatch = useDispatch();
  const autoconerState = useSelector((state) => state.autoconer) || {};
  const { isLoading = false } = autoconerState;
  const [testNo, setTestNo] = useState("");
  const [entryDate, setEntryDate] = useState(todayDate);
  const [lycraDraft, setLycraDraft] = useState("");
  const [countName, setCountName] = useState(countOptions[0]);
  const [countCode, setCountCode] = useState("");
  const [countDropdownOptions, setCountDropdownOptions] = useState(
    countOptions.map((option) => ({ value: option, label: option, code: "" }))
  );
  const [readingsCount, setReadingsCount] = useState("");
  const [lycraWeight, setLycraWeight] = useState("");
  const [fabricWeight, setFabricWeight] = useState("");
  const [generatedRows, setGeneratedRows] = useState([]);
  const [errors, setErrors] = useState({});
  const errorStyle = (flag) =>
    flag
      ? {
          borderColor: "#ef4444",
          backgroundColor: "#fff1f2",
          boxShadow: "0 0 0 1000px #fff1f2 inset",
        }
      : undefined;

  const totalWeight = useMemo(() => {
    if (!lycraWeight && !fabricWeight) return "";
    const lycra = parseFloat(lycraWeight) || 0;
    const fabric = parseFloat(fabricWeight) || 0;
    return (lycra + fabric).toFixed(4);
  }, [lycraWeight, fabricWeight]);

  const lycraPercent = useMemo(() => {
    if (!lycraWeight || !totalWeight) return "";
    const lycra = parseFloat(lycraWeight) || 0;
    const total = parseFloat(totalWeight) || 0;
    if (!total) return "";
    return ((lycra / total) * 100).toFixed(2);
  }, [lycraWeight, totalWeight]);

  const averageLength = useMemo(() => {
    const values = generatedRows
      .map((row) => parseFloat(row.length))
      .filter((value) => !Number.isNaN(value));
    if (!values.length) return "";
    return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2);
  }, [generatedRows]);

  const handleGenerate = () => {
    const count = Math.max(1, Number(readingsCount) || 1);
    setGeneratedRows(initialReadings(count));
    setErrors((current) => {
      const next = { ...current };
      delete next.readingsCount;
      delete next.generatedRows;
      return next;
    });
  };

  const handleReadingChange = (index, value) => {
    const nextValue = sanitizeNumericInput(value, { precision: 10, scale: 2 });
    setGeneratedRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, length: nextValue } : row
      )
    );
    setErrors((current) => {
      if (!current[`row-${index}`]) return current;
      const next = { ...current };
      delete next[`row-${index}`];
      return next;
    });
  };

  const resetForm = () => {
    setTestNo("");
    setEntryDate(todayDate);
    setLycraDraft("");
    setCountName(countDropdownOptions[0]?.label || countOptions[0]);
    setCountCode(countDropdownOptions[0]?.code || "");
    setReadingsCount("");
    setLycraWeight("");
    setFabricWeight("");
    setGeneratedRows([]);
    setErrors({});
  };

  const validate = () => {
    const nextErrors = {};
    if (!String(selectedType || "").trim()) nextErrors.type = true;
    if (!String(testNo || "").trim()) nextErrors.testNo = true;
    if (!String(entryDate || "").trim()) nextErrors.entryDate = true;
    if (!String(lycraDraft || "").trim()) nextErrors.lycraDraft = true;
    if (!String(countName || "").trim()) nextErrors.countName = true;
    if (!String(readingsCount || "").trim()) nextErrors.readingsCount = true;
    if (!String(lycraWeight || "").trim()) nextErrors.lycraWeight = true;
    if (!String(fabricWeight || "").trim()) nextErrors.fabricWeight = true;
    if (!generatedRows.length) nextErrors.generatedRows = true;
    generatedRows.forEach((row, index) => {
      if (!String(row.length || "").trim()) nextErrors[`row-${index}`] = true;
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getPreviewData = () => [
    { label: "Type", value: selectedType || "-" },
    { label: "Test No.", value: testNo || "-" },
    { label: "Entry ID", value: entryId || "-" },
    { label: "Lycra Draft", value: lycraDraft || "-" },
    { label: "Count Name", value: countName || "-" },
    { label: "No. of Readings", value: readingsCount || "-" },
    { label: "Lycra Weight", value: lycraWeight || "-" },
    { label: "Fabric Weight", value: fabricWeight || "-" },
    { label: "Total Weight", value: totalWeight || "-" },
    { label: "Lycra %", value: lycraPercent || "-" },
    ...generatedRows.map((row, index) => ({
      label: `Reading ${index + 1}`,
      value: row.length || "-",
    })),
  ];

  const submit = async () => {
    if (!validate()) return false;
    try {
      const payload = {
        inspection_type: selectedType,
        test_no: Number(testNo) || 0,
        entry_date: entryDate,
        lycra_draft: lycraDraft,
        count_name: countName,
        cntcode: countCode || undefined,
        no_of_readings: Number(readingsCount) || generatedRows.length || 0,
        lycra_weight: lycraWeight,
        fabric_weight: fabricWeight,
        total_weight: totalWeight,
        lycra_percent: lycraPercent,
        readings: generatedRows.map((row, index) => ({
          reading_no: index + 1,
          length_mm: Number(row.length) || 0,
          lycra_weight: Number(lycraWeight) || 0,
          fabric_weight: Number(fabricWeight) || 0,
          total_weight: Number(totalWeight) || 0,
          lycra_percent: Number(lycraPercent) || 0,
        })),
        summary: {
          avg_length: Number(averageLength) || 0,
          lycra_weight: Number(lycraWeight) || 0,
          fabric_weight: Number(fabricWeight) || 0,
          total_weight: Number(totalWeight) || 0,
          lycra_percent: Number(lycraPercent) || 0,
        },
      };

      await dispatch(saveAutoconerLycraChecking(payload)).unwrap();
      dispatch(getAutoconerLycraChecking());
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    let isCancelled = false;
    const loadMasterData = async () => {
      const response = await fetchAutoconerLycraCheckingMasterData();
      if (isCancelled) return;

      const fromObjects = Array.isArray(response?.count_options)
        ? response.count_options
            .map((item) => {
              const code = String(item?.cntcode ?? "").trim();
              const label = String(item?.cntname ?? "").trim();
              return label ? { value: code || label, label, code: code || "" } : null;
            })
            .filter(Boolean)
        : [];
      const fromLegacy = Array.isArray(response?.count_names)
        ? response.count_names
            .map((item) => String(item || "").trim())
            .filter(Boolean)
            .map((label) => ({ value: label, label, code: "" }))
        : [];
      const unique = Array.from(new Map([...fromObjects, ...fromLegacy].map((item) => [item.value, item])).values());
      if (unique.length) {
        setCountDropdownOptions(unique);
        setCountName((current) => (unique.some((item) => item.label === current) ? current : unique[0].label));
      }
    };
    loadMasterData();
    return () => {
      isCancelled = true;
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
    lycraDraft,
    countName,
    readingsCount,
    lycraWeight,
    fabricWeight,
    totalWeight,
    lycraPercent,
    generatedRows,
    averageLength,
    dispatch,
    isLoading,
    generatedRows,
  ]);

  return (
    <div className={styles.wrapper}>
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
          <label>Lycra Draft</label>
          <input value={lycraDraft} onChange={(e) => setLycraDraft(sanitizeNumericInput(e.target.value, { precision: 10, scale: 2 }))} style={errorStyle(errors.lycraDraft)} />
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

        <div className={styles.generateField}>
          <div className={styles.field}>
            <label>No. of Readings</label>
            <input
              value={readingsCount}
              onChange={(e) => setReadingsCount(sanitizeIntegerInput(e.target.value, 10))}
              style={errorStyle(errors.readingsCount || errors.generatedRows)}
            />
          </div>
          <button type="button" className={styles.generateBtn} onClick={handleGenerate}>
            Generate
          </button>
        </div>

        <div className={styles.field}>
          <label>Lycra Weight</label>
          <input value={lycraWeight} onChange={(e) => setLycraWeight(sanitizeNumericInput(e.target.value, { precision: 10, scale: 2 }))} style={errorStyle(errors.lycraWeight)} />
        </div>

        <div className={styles.field}>
          <label>Fabric Weight</label>
          <input value={fabricWeight} onChange={(e) => setFabricWeight(sanitizeNumericInput(e.target.value, { precision: 10, scale: 2 }))} style={errorStyle(errors.fabricWeight)} />
        </div>

        <div className={styles.field}>
          <label>Total Weight</label>
          <input value={totalWeight} readOnly />
        </div>

        <div className={styles.field}>
          <label>Lycra %</label>
          <input value={lycraPercent} readOnly />
        </div>
      </div>

      {generatedRows.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>READING NO.</th>
                <th>READINGS (LENGTH in mm)</th>
                <th>LYCRA WEIGHT (gms)</th>
                <th>FABRIC WEIGHT (gms)</th>
                <th>TOTAL WEIGHT (gms)</th>
                <th>LYCRA % (Lycra Wt / Total Wt)</th>
                <th>AVG LYCRA %</th>
              </tr>
            </thead>
            <tbody>
              {generatedRows.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td>
                    <input
                      value={row.length}
                      onChange={(e) => handleReadingChange(index, e.target.value)}
                      style={errorStyle(errors[`row-${index}`])}
                    />
                  </td>
                  <td>{lycraWeight}</td>
                  <td>{fabricWeight}</td>
                  <td>{totalWeight}</td>
                  <td>{lycraPercent}</td>
                  <td>{lycraPercent}</td>
                </tr>
              ))}
              <tr className={styles.summaryRow}>
                <td>SUMMARY</td>
                <td>{averageLength}</td>
                <td>{lycraWeight}</td>
                <td>{fabricWeight}</td>
                <td>{totalWeight}</td>
                <td>{lycraPercent}</td>
                <td>{lycraPercent}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default LycraChecking;

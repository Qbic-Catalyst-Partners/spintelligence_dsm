import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { MdEditNote } from "react-icons/md";
import { useDispatch, useSelector } from "react-redux";
import Footer from "@/components/Footer";
import {
  getAutoconerSpliceStrength,
  saveAutoconerSpliceStrength,
} from "@/store/slices/autoconer";
import styles from "@/styles/spliceStrength.module.css";

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

function SpliceStrength({ types, selectedType, onTypeChange, onRegisterActions }) {
  const router = useRouter();
  const todayDate = getTodayDate();
  const dispatch = useDispatch();
  const autoconerState = useSelector((state) => state.autoconer) || {};
  const { isLoading = false } = autoconerState;
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

  const handleGenerate = () => {
    const count = Math.max(1, Number(readingCount) || 1);
    setGeneratedRows(
      Array.from({ length: count }, (_, index) => ({
        drumNo: drumFrom,
        readingNumber: String(index + 1),
        spliceStrength: "",
        parentYarn: "",
      }))
    );
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
  };

  const handleSave = async () => {
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
      await dispatch(getAutoconerSpliceStrength({ page: 1, limit: 10 })).unwrap();
      alert("Splice Strength saved successfully.");
    } catch (error) {
      alert(error || "Unable to save Splice Strength.");
    }
  };

  useEffect(() => {
    if (!onRegisterActions) return;

    onRegisterActions({
      onSave: handleSave,
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
    handleSave,
  ]);

  const handleRowChange = (index, field, value) => {
    setGeneratedRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      )
    );
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.entryCard}>
        <div className={styles.formTitle}>
          <MdEditNote />
          <h3>Inspection Data Entry</h3>
        </div>

        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label>Type</label>
            <select value={selectedType} onChange={(e) => onTypeChange(e.target.value)}>
              {types.map((type) => (
                <option key={type.id} value={type.name}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label>Test No.</label>
            <input value={testNo} onChange={(e) => setTestNo(e.target.value)} />
          </div>

          <div className={styles.field}>
            <label>Date</label>
            <input type="date" value={date} disabled />
          </div>

          <div className={styles.field}>
            <label>Count Name (From)</label>
            <select value={countName} onChange={(e) => setCountName(e.target.value)}>
              {countOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label>Auto Coner No.</label>
            <select value={autoconerNo} onChange={(e) => setAutoconerNo(e.target.value)}>
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
              <select value={drumFrom} onChange={(e) => setDrumFrom(e.target.value)}>
                {drumOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.hiddenLabel}>To</label>
              <select value={drumTo} onChange={(e) => setDrumTo(e.target.value)}>
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
            <input value={coneTip} onChange={(e) => setConeTip(e.target.value)} />
          </div>

          <div className={styles.field}>
            <label>CSP Value</label>
            <input value={cspValue} onChange={(e) => setCspValue(e.target.value)} />
          </div>

          <div className={styles.field}>
            <label>Average</label>
            <input value={average.splice} readOnly />
          </div>
        </div>

      </div>

      <div className={styles.footerWrap}>
        <Footer
          onBack={() => router.push("/dashboard")}
          onClear={resetForm}
          onSave={handleSave}
          saveLabel="Save Record"
          disabled={isLoading}
        />
      </div>

      <div className={styles.generateBar}>
        <div className={styles.generateField}>
          <label>Drum No</label>
          <select value={drumFrom} onChange={(e) => setDrumFrom(e.target.value)}>
            {drumOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.generateField}>
          <label>No. of Readings.</label>
          <input value={readingCount} onChange={(e) => setReadingCount(e.target.value)} />
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
                  />
                </td>
                <td>
                  <input
                    value={row.parentYarn}
                    onChange={(e) => handleRowChange(index, "parentYarn", e.target.value)}
                  />
                </td>
                <td>{row.percent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
            {rowsWithPercent.map((row, index) => (
              <tr key={`all-${row.drumNo}-${row.readingNumber}-${index}`}>
                <td>{row.drumNo}</td>
                <td>{row.readingNumber}</td>
                <td>{row.spliceStrength}</td>
                <td>{row.parentYarn}</td>
                <td>{row.percent}</td>
              </tr>
            ))}
            <tr className={styles.summaryRow}>
              <td>1 AVG</td>
              <td>{average.readingNumber}</td>
              <td>{average.splice}</td>
              <td>{average.parent}</td>
              <td>{average.percent}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default SpliceStrength;

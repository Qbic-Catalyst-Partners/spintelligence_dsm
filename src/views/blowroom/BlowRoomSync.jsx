import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import styles from "@/styles/BlowRoomSync.module.css";
import { useDispatch, useSelector } from "react-redux";
import { sanitizeIntegerInput, sanitizeNumericInput } from "@/utils/inputValidation";
import {
  saveBlowroomData,
  fetchBlowroomData,
} from "../../store/slices/blowroomSlice";

const todayValue = new Date().toISOString().split("T")[0];
const blowroomTypeOptions = [
  "Blow Room Sync",
  "BR Waste Study Entry",
  "Drop Test Data Entry",
];

const BlowRoomSync = forwardRef(function BlowRoomSync(
  { date, selectedTypeName, onTypeChange, onDateChange },
  ref
) {
  const dispatch = useDispatch();

  const { loading, success, message, error } = useSelector(
    (state) =>
      state.blowroom ?? {
        loading: false,
        success: false,
        message: "",
        error: null,
      }
  );

  const [rows, setRows] = useState(5);
  const [tableData, setTableData] = useState([]);
  const [generated, setGenerated] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState({
    type: "Blow Room Sync",
    entryDate: date || todayValue,
    lineNo: "",
    variety: "",
    checkedBy: "",
    beater: "",
    totalTime: "",
  });

  useEffect(() => {
    dispatch(fetchBlowroomData());
  }, [dispatch]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      entryDate: date || todayValue,
    }));
  }, [date]);

  const handleChange = (index, field, value) => {
    const updated = [...tableData];
    updated[index][field] = sanitizeNumericInput(value, { precision: 10, scale: 2 });

    const a = parseFloat(updated[index].a);
    const b = parseFloat(updated[index].b);
    const c = parseFloat(updated[index].c);

    if (![a, b, c].some(Number.isNaN) && updated[index].a !== "" && updated[index].b !== "" && updated[index].c !== "") {
      updated[index].sync = (((a || 0) + (b || 0) + (c || 0)) / 3).toFixed(2);
    } else {
      updated[index].sync = "";
    }

    setTableData(updated);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`row-${index}-a`];
      delete next[`row-${index}-b`];
      delete next[`row-${index}-c`];
      return next;
    });
  };

  const calculateStats = (key) => {
    const values = tableData
      .map((row) => parseFloat(row[key]))
      .filter((val) => !Number.isNaN(val));

    if (!values.length) {
      return { avg: "0.00", min: "0.00", max: "0.00", range: "0.00" };
    }

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = (sum / values.length).toFixed(2);
    const min = Math.min(...values).toFixed(2);
    const max = Math.max(...values).toFixed(2);
    const range = (Number(max) - Number(min)).toFixed(2);

    return { avg, min, max, range };
  };

  const handleGenerate = () => {
    if (!rows || rows <= 0) return;

    const newData = Array.from({ length: rows }, () => ({
      a: "",
      b: "",
      c: "",
      sync: "",
    }));

    setTableData(newData);
    setGenerated(true);
    setErrors((prev) => ({ ...prev, table: false }));
  };

  const handleSave = async () => {
    const nextErrors = {};
    ["lineNo", "variety", "checkedBy", "beater", "totalTime"].forEach((key) => {
      if (!String(form[key] || "").trim()) nextErrors[key] = true;
    });
    if (!form.entryDate) nextErrors.entryDate = true;
    if (!generated || !tableData.length) nextErrors.table = true;
    tableData.forEach((row, idx) => {
      ["a", "b", "c"].forEach((k) => {
        if (String(row[k] || "").trim() === "") {
          nextErrors[`row-${idx}-${k}`] = true;
        }
      });
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    try {
      await dispatch(
        saveBlowroomData({
          inspection_date: form.entryDate,
          line_no: form.lineNo,
          variety: form.variety,
          checked_by: form.checkedBy,
          beater: form.beater,
          total_time: form.totalTime,
          entries: tableData.map((row) => ({
            value_a: Number(row.a) || 0,
            value_b: Number(row.b) || 0,
            value_c: Number(row.c) || 0,
            sync_percentage: Number(row.sync) || 0,
          })),
        })
      ).unwrap();
    } catch (e) {
      // errors already handled by slice; no-op
    }
  };

  const handleClear = () => {
    setGenerated(false);
    setTableData([]);
    setRows(5);
    setErrors({});
    setForm({
      type: "Blow Room Sync",
      entryDate: date || todayValue,
      lineNo: "",
      variety: "",
      checkedBy: "",
      beater: "",
      totalTime: "",
    });
  };

  const handleFormChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  useImperativeHandle(ref, () => ({
    submit: handleSave,
    clear: handleClear,
    validate: () => {
      const nextErrors = {};
      ["lineNo", "variety", "checkedBy", "beater", "totalTime"].forEach((key) => {
        if (!String(form[key] || "").trim()) nextErrors[key] = true;
      });
      if (!form.entryDate) nextErrors.entryDate = true;
      if (!generated || !tableData.length) nextErrors.table = true;
      tableData.forEach((row, idx) => {
        ["a", "b", "c"].forEach((k) => {
          if (String(row[k] || "").trim() === "") {
            nextErrors[`row-${idx}-${k}`] = true;
          }
        });
      });
      setErrors(nextErrors);
      return Object.keys(nextErrors).length === 0;
    },
    getPreviewData: () => {
      const header = [
        { label: "Type", value: selectedTypeName || form.type },
        { label: "Entry Date", value: form.entryDate },
        { label: "Line No.", value: form.lineNo },
        { label: "Variety", value: form.variety },
        { label: "Checked By", value: form.checkedBy },
        { label: "Beater", value: form.beater },
        { label: "Total Time", value: form.totalTime },
      ];
      const rowsData = tableData.map((row, idx) => ({
        label: `Row ${idx + 1}`,
        value: `A:${row.a} | B:${row.b} | C:${row.c} | Sync:${row.sync}`,
      }));
      return [...header, ...rowsData];
    },
  }));

  return (
    <div className={styles.syncSection}>
      <div className={styles.metaGrid}>
        <div className={styles.group}>
          <label>Type</label>
          <select
            value={selectedTypeName || form.type}
            onChange={(e) => onTypeChange?.(e.target.value)}
          >
            {blowroomTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.group}>
          <label>Entry Date</label>
          <input
            type="date"
            value={form.entryDate}
            onChange={(e) => onDateChange?.(e.target.value)}
            className={errors.entryDate ? styles.errorField : undefined}
          />
        </div>

        <div className={styles.group}>
          <label>Line No.</label>
          <input
            value={form.lineNo}
            onChange={(e) => handleFormChange("lineNo", e.target.value)}
            className={errors.lineNo ? styles.errorField : undefined}
          />
        </div>

        <div className={styles.group}>
          <label>Variety</label>
          <select
            value={form.variety}
            onChange={(e) => handleFormChange("variety", e.target.value)}
            className={errors.variety ? styles.errorField : undefined}
          >
            <option value="">Select Variety</option>
            <option>Cotton Blend</option>
            <option>Compact Cotton</option>
            <option>Viscose Mix</option>
          </select>
        </div>

        <div className={styles.group}>
          <label>Checked by</label>
          <input
            value={form.checkedBy}
            onChange={(e) => handleFormChange("checkedBy", e.target.value)}
            className={errors.checkedBy ? styles.errorField : undefined}
          />
        </div>

        <div className={styles.group}>
          <label>Beater</label>
          <input
            value={form.beater}
            onChange={(e) => handleFormChange("beater", e.target.value)}
            className={errors.beater ? styles.errorField : undefined}
          />
        </div>

        <div className={styles.group}>
          <label>Total Time (MM:SS)</label>
          <input
            type="time"
            step="1"
            value={form.totalTime}
            onChange={(e) => handleFormChange("totalTime", e.target.value)}
            className={errors.totalTime ? styles.errorField : undefined}
          />
        </div>
      </div>

      <div className={styles.subsection}>
        <h4>Detailed Sync Entries</h4>
      </div>

      <div className={styles.generateRow}>
        <div className={styles.group}>
          <label>Number of Rows (N)</label>
          <input
            type="number"
            min="1"
            value={rows}
            onChange={(e) => setRows(Number(sanitizeIntegerInput(e.target.value, 4) || 0))}
          />
        </div>

        <button className={styles.primary} onClick={handleGenerate}>
          Generate Grid
        </button>
      </div>

      {generated && (
        <div className={styles.gridWrap}>
          <div className={styles.tableHeader}>
            <span>S. No.</span>
            <span>Value A</span>
            <span>Value B</span>
            <span>Value C</span>
            <span>Sync Percentage</span>
          </div>

          {tableData.map((row, i) => (
            <div className={styles.tableRow} key={i}>
              <span className={styles.serial}>{i + 1}</span>

              <input
                value={row.a}
                onChange={(e) => handleChange(i, "a", e.target.value)}
                className={errors[`row-${i}-a`] ? styles.errorField : undefined}
              />
              <input
                value={row.b}
                onChange={(e) => handleChange(i, "b", e.target.value)}
                className={errors[`row-${i}-b`] ? styles.errorField : undefined}
              />
              <input
                value={row.c}
                onChange={(e) => handleChange(i, "c", e.target.value)}
                className={errors[`row-${i}-c`] ? styles.errorField : undefined}
              />
              <input value={row.sync} readOnly />
            </div>
          ))}
        </div>
      )}

      <div className={styles.stats}>
        {[
          { label: "Value A Stats", key: "a" },
          { label: "Value B Stats", key: "b" },
          { label: "Value C Stats", key: "c" },
          { label: "Sync Percentage Stats", key: "sync" },
        ].map((item) => {
          const s = calculateStats(item.key);
          return (
            <div key={item.key} className={styles.statCard}>
              <h5>{item.label}</h5>
              <p>Avg : {s.avg}</p>
              <p>Min : {s.min}</p>
              <p>Max : {s.max}</p>
              <p>Range : {s.range}</p>
            </div>
          );
        })}
      </div>

      {loading && <p className={styles.loading}>Saving...</p>}
      {success && <p className={styles.success}>{message}</p>}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
});

export default BlowRoomSync;

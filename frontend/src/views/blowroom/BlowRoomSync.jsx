import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import styles from "@/styles/BlowRoomSync.module.css";
import { useDispatch, useSelector } from "react-redux";
import { sanitizeIntegerInput, sanitizeNumericInput } from "@/utils/inputValidation";
import SearchableSelect from "@/components/SearchableSelect";
import useBlowroomMasterVarieties from "@/hooks/useBlowroomMasterVarieties";
import useEmployeeOptions from "@/hooks/useEmployeeOptions";
import {
  saveBlowroomData,
  fetchBlowroomData,
} from "../../store/slices/blowroomSlice";

const formatSecondsToHHMMSS = (totalSeconds) => {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

const todayValue = new Date().toISOString().split("T")[0];
const DEFAULT_BLOWROOM_STATE = {
  loading: false,
  success: false,
  message: "",
  error: null,
};

const BlowRoomSync = forwardRef(function BlowRoomSync(
  { date, entryId, selectedTypeName, onTypeChange, onDateChange, typeOptions = [] },
  ref
) {
  const dispatch = useDispatch();

  const { loading, success, message, error } = useSelector(
    (state) => state.blowroom ?? DEFAULT_BLOWROOM_STATE
  );

  const [rows, setRows] = useState(5);
  const [tableData, setTableData] = useState([]);
  const [generated, setGenerated] = useState(false);
  const [errors, setErrors] = useState({});
  const rowAInputRefs = useRef([]);
  const { varietyOptions, varietyOptionsError, loadingVarietyOptions } = useBlowroomMasterVarieties();
  const { employeeOptions, employeeOptionsError, loadingEmployeeOptions } = useEmployeeOptions("blowroom-checked-by");
  const [form, setForm] = useState({
    type: "Blow Room Sync",
    entryDate: date || todayValue,
    lineNo: "",
    variety: "",
    checkedBy: "",
    beater: "",
  });

  const availableTypeOptions = typeOptions.length
    ? typeOptions.map((option) => ({
        value: option.name,
        label: option.displayName ?? option.name,
      }))
    : [{ value: "Blow Room Sync", label: "Blow Room Sync" }];

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
    if (![a, b].some(Number.isNaN) && updated[index].a !== "" && updated[index].b !== "") {
      const c = a + b;
      updated[index].c = c.toFixed(2);
      updated[index].sync = c > 0 ? ((a / c) * 100).toFixed(2) : "";
    } else {
      updated[index].c = "";
      updated[index].sync = "";
    }

    setTableData(updated);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`row-${index}-a`];
      delete next[`row-${index}-b`];
      return next;
    });
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
    rowAInputRefs.current = [];
    setGenerated(true);
    setErrors((prev) => ({ ...prev, table: false }));
  };

  const handleSave = async () => {
    const nextErrors = {};
    ["lineNo", "variety", "checkedBy", "beater"].forEach((key) => {
      if (!String(form[key] || "").trim()) nextErrors[key] = true;
    });
    if (!form.entryDate) nextErrors.entryDate = true;
    if (!generated || !tableData.length) nextErrors.table = true;
    tableData.forEach((row, idx) => {
      ["a", "b"].forEach((k) => {
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
          entry_id: entryId || undefined,
          inspection_date: form.entryDate,
          line_no: form.lineNo,
          variety: form.variety,
          checked_by: form.checkedBy,
          beater: form.beater,
          total_time: grandTotalTime,
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
    rowAInputRefs.current = [];
    setRows(5);
    setErrors({});
    setForm({
      type: "Blow Room Sync",
      entryDate: date || todayValue,
      lineNo: "",
      variety: "",
      checkedBy: "",
      beater: "",
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

  const totalRunSeconds = tableData.reduce((sum, row) => sum + (parseFloat(row.a) || 0), 0);
  const totalIdleSeconds = tableData.reduce((sum, row) => sum + (parseFloat(row.b) || 0), 0);
  const totalSubSeconds = totalRunSeconds + totalIdleSeconds;
  const totalSyncPercentage = totalSubSeconds > 0 ? ((totalRunSeconds / totalSubSeconds) * 100).toFixed(2) : "";
  const grandTotalTime = tableData.length ? formatSecondsToHHMMSS(totalSubSeconds) : "";

  const focusNextRowA = (index) => {
    const nextRowInput = rowAInputRefs.current[index + 1];
    if (nextRowInput) {
      nextRowInput.focus();
      nextRowInput.select?.();
    }
  };

  useImperativeHandle(ref, () => ({
    submit: handleSave,
    clear: handleClear,
    validate: () => {
      const nextErrors = {};
      ["lineNo", "variety", "checkedBy", "beater"].forEach((key) => {
        if (!String(form[key] || "").trim()) nextErrors[key] = true;
      });
      if (!form.entryDate) nextErrors.entryDate = true;
      if (!generated || !tableData.length) nextErrors.table = true;
      tableData.forEach((row, idx) => {
        ["a", "b"].forEach((k) => {
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
        { label: "Entry ID", value: entryId || "-" },
        { label: "Line No.", value: form.lineNo },
        { label: "Variety", value: form.variety },
        { label: "Checked By", value: form.checkedBy },
        { label: "Beater", value: form.beater },
        { label: "Grand Total Time", value: grandTotalTime },
      ];
      const rowsData = tableData.map((row, idx) => ({
        label: `Row ${idx + 1}`,
        value: `Run Time:${row.a}s | Idle Time:${row.b}s | Sub Total:${row.c !== "" ? formatSecondsToHHMMSS(Number(row.c)) : ""} | Sync:${row.sync ? `${row.sync}%` : ""}`,
      }));
      const totalsRow = tableData.length
        ? [{
            label: "Totals",
            value: `Run Time:${totalRunSeconds.toFixed(2)}s | Idle Time:${totalIdleSeconds.toFixed(2)}s | Sub Total:${formatSecondsToHHMMSS(totalSubSeconds)} | Sync:${totalSyncPercentage ? `${totalSyncPercentage}%` : ""}`,
          }]
        : [];
      return [...header, ...rowsData, ...totalsRow];
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
            {availableTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.group}>
          <label>Entry ID</label>
          <input
            type="text"
            value={entryId || ""}
            readOnly
            disabled
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
          <SearchableSelect
            value={form.variety}
            onChange={(value) => handleFormChange("variety", value)}
            className={errors.variety ? styles.errorField : undefined}
            options={varietyOptions}
            placeholder={
              loadingVarietyOptions
                ? "Loading varieties..."
                : varietyOptionsError
                  ? "Type variety"
                  : "Select Variety"
            }
            ariaLabel="Variety"
          />
        </div>

        <div className={styles.group}>
          <label>Checked by</label>
          <SearchableSelect
            value={form.checkedBy}
            onChange={(value) => handleFormChange("checkedBy", value)}
            className={errors.checkedBy ? styles.errorField : undefined}
            options={employeeOptions}
            placeholder={
              loadingEmployeeOptions
                ? "Loading employees..."
                : employeeOptionsError
                  ? "Type employee name"
                  : "Select Employee"
            }
            ariaLabel="Checked by"
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
            <span>Run Time (Seconds)</span>
            <span>Idle Time (Seconds)</span>
            <span>Sub Total Time</span>
            <span>Sync Percentage (%)</span>
          </div>

          {tableData.map((row, i) => (
            <div className={styles.tableRow} key={i}>
              <span className={styles.serial}>{i + 1}</span>

              <input
                ref={(el) => {
                  rowAInputRefs.current[i] = el;
                }}
                value={row.a}
                onChange={(e) => handleChange(i, "a", e.target.value)}
                className={errors[`row-${i}-a`] ? styles.errorField : undefined}
              />
              <input
                value={row.b}
                onChange={(e) => handleChange(i, "b", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    focusNextRowA(i);
                  }
                }}
                className={errors[`row-${i}-b`] ? styles.errorField : undefined}
              />
              <input
                value={row.c !== "" ? formatSecondsToHHMMSS(Number(row.c)) : ""}
                readOnly
                tabIndex={-1}
              />
              <input value={row.sync ? `${row.sync}%` : ""} readOnly tabIndex={-1} />
            </div>
          ))}

          {tableData.length > 0 && (
            <div className={`${styles.tableRow} ${styles.totalRow}`}>
              <span className={styles.serial}>Total</span>
              <input
                className={styles.totalInput}
                value={totalRunSeconds.toFixed(2)}
                readOnly
                tabIndex={-1}
              />
              <input
                className={styles.totalInput}
                value={totalIdleSeconds.toFixed(2)}
                readOnly
                tabIndex={-1}
              />
              <input
                className={styles.totalInput}
                value={formatSecondsToHHMMSS(totalSubSeconds)}
                readOnly
                tabIndex={-1}
              />
              <input
                className={styles.totalInput}
                value={totalSyncPercentage ? `${totalSyncPercentage}%` : ""}
                readOnly
                tabIndex={-1}
              />
            </div>
          )}
        </div>
      )}

      <div className={`${styles.group} ${styles.grandTotalRow}`}>
        <label>Grand Total Time (HH:MM:SS)</label>
        <input type="text" value={grandTotalTime} readOnly tabIndex={-1} />
      </div>

      {loading && <p className={styles.loading}>Saving...</p>}
      {success && <p className={styles.success}>{message}</p>}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
});

export default BlowRoomSync;


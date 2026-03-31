import { useState, useEffect } from "react";
import styles from "../../styles/BlowRoomSync.module.css";
import { MdOutlineEditNote } from "react-icons/md";
import { useDispatch, useSelector } from "react-redux";
import {
  saveBlowroomData,
  fetchBlowroomData,
} from "../../store/slices/blowroomSlice";
import { useRouter } from "next/router";

const todayValue = new Date().toISOString().split("T")[0];

function BlowRoom() {
  const router = useRouter();
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
  const [form, setForm] = useState({
    type: "Blow Room Sync",
    entryDate: todayValue,
    lineNo: "",
    variety: "",
    checkedBy: "",
    beater: "",
    totalTime: "",
  });

  useEffect(() => {
    dispatch(fetchBlowroomData());
  }, [dispatch]);

  const handleChange = (index, field, value) => {
    const updated = [...tableData];
    updated[index][field] = value;

    const a = parseFloat(updated[index].a) || 0;
    const b = parseFloat(updated[index].b) || 0;
    const c = parseFloat(updated[index].c) || 0;

    updated[index].sync = ((a + b + c) / 3).toFixed(2);

    setTableData(updated);
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
      a: "0.00",
      b: "0.00",
      c: "0.00",
      sync: "0.00",
    }));

    setTableData(newData);
    setGenerated(true);
  };

  const handleSave = () => {
    dispatch(
      saveBlowroomData({
        ...form,
        entries: tableData,
      })
    );
  };

  const handleClear = () => {
    setGenerated(false);
    setTableData([]);
    setRows(5);
    setForm({
      type: "Blow Room Sync",
      entryDate: todayValue,
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
  };

  return (
    <div className={styles.page}>
     

      <div className={styles.container}>
        <div className={styles.breadcrumbs}>
          <button type="button" onClick={() => router.push("/")}>
            Home
          </button>
          <span>&rsaquo;</span>
          <button type="button" onClick={() => router.push("/dashboard")}>
            Dashboard
          </button>
          <span>&rsaquo;</span>
          <button type="button" onClick={() => router.push("/departments/quality-control")}>
            Quality Control
          </button>
          <span>&rsaquo;</span>
          <span className={styles.active}>Blow Room Notebook QC</span>
        </div>

        <h1 className={styles.title}>Quality Control - Blow room Notebook QC</h1>
        <p className={styles.description}>
          Record and manage industrial machine quality inspections.
        </p>

        <div className={styles.card}>
          <h3 className={styles.sectiontitle}>
            <span className={styles.icon}>
              <MdOutlineEditNote />
            </span>
            Inspection Data Entry
          </h3>

          <div className={styles.metaGrid}>
            <div className={styles.group}>
              <label>Type</label>
              <select
                value={form.type}
                onChange={(e) => handleFormChange("type", e.target.value)}
              >
                <option>Blow Room Sync</option>
              </select>
            </div>

            <div className={styles.group}>
              <label>Entry Date</label>
              <input
                type="date"
                value={form.entryDate}
                onChange={(e) => handleFormChange("entryDate", e.target.value)}
              />
            </div>

            <div className={styles.group}>
              <label>Line No.</label>
              <input
                value={form.lineNo}
                onChange={(e) => handleFormChange("lineNo", e.target.value)}
              />
            </div>

            <div className={styles.group}>
              <label>Variety</label>
              <select
                value={form.variety}
                onChange={(e) => handleFormChange("variety", e.target.value)}
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
              />
            </div>

            <div className={styles.group}>
              <label>Beater</label>
              <input
                value={form.beater}
                onChange={(e) => handleFormChange("beater", e.target.value)}
              />
            </div>

            <div className={styles.group}>
              <label>Total Time (MM:SS)</label>
              <input
                placeholder="MM : SS"
                value={form.totalTime}
                onChange={(e) => handleFormChange("totalTime", e.target.value)}
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
                onChange={(e) => setRows(Number(e.target.value))}
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
                  />
                  <input
                    value={row.b}
                    onChange={(e) => handleChange(i, "b", e.target.value)}
                  />
                  <input
                    value={row.c}
                    onChange={(e) => handleChange(i, "c", e.target.value)}
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

          <div className={styles.footer}>
            <button
              className={styles.back}
              onClick={() => router.push("/dashboard")}
            >
              Back to Dashboard
            </button>

            <div className={styles.footerActions}>
              <button className={styles.secondary} onClick={handleClear}>
                Clear Form
              </button>
              <button className={styles.primary} onClick={handleSave}>
                Save Record
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BlowRoom;

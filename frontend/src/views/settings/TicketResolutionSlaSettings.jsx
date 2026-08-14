import { useEffect, useMemo, useState } from "react";
import styles from "@/styles/SubmissionThreshold.module.css";
import {
  fetchTicketResolutionSlaAPI,
  saveTicketResolutionSlaAPI,
  updateTicketResolutionSlaStatusAPI,
} from "@/apis/ticketResolutionSlaApi";

const LEVELS = ["L1", "L2", "L3", "L4"];
const HOUR_OPTIONS = Array.from({ length: 100 }, (_, index) => index + 1);

const defaultRowForLevel = (level) => ({ id: level, level, hours: 24, is_active: true, createdAt: null });

const normalizeRow = (row) => ({
  id: row?.level || row?.id,
  level: String(row?.level || "").toUpperCase(),
  hours: Math.min(100, Math.max(1, Number(row?.resolution_hours ?? row?.hours) || 24)),
  is_active: row?.is_active !== false,
  createdAt: row?.created_at || row?.createdAt || null,
});

const formatTimestamp = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

export default function TicketResolutionSlaSettings() {
  const [rows, setRows] = useState(LEVELS.map(defaultRowForLevel));
  const [selectedLevel, setSelectedLevel] = useState("L1");
  const [selectedHours, setSelectedHours] = useState("24");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyLevel, setBusyLevel] = useState("");

  const loadRows = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchTicketResolutionSlaAPI();
      const normalized = LEVELS.map((level) => normalizeRow(data.find((row) => String(row?.level || "").toUpperCase() === level) || defaultRowForLevel(level)));
      setRows(normalized);
    } catch (err) {
      setError(err?.message || "Unable to load ticket resolution SLA.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const selectedExistingRow = useMemo(
    () => rows.find((row) => row.level === selectedLevel) || defaultRowForLevel(selectedLevel),
    [rows, selectedLevel]
  );

  const applyRow = async () => {
    const hours = Math.min(100, Math.max(1, Number(selectedHours) || 24));
    setLoading(true);
    setError("");
    try {
      const saved = await saveTicketResolutionSlaAPI({
        level: selectedLevel,
        resolution_hours: hours,
        is_active: true,
      });
      const normalizedSaved = normalizeRow(saved || { level: selectedLevel, hours, is_active: true, createdAt: new Date().toISOString() });
      setRows((current) =>
        LEVELS.map((level) =>
          level === selectedLevel
            ? normalizedSaved
            : current.find((row) => row.level === level) || defaultRowForLevel(level)
        )
      );
      setMessage(`${selectedLevel} Ticket Resolution SLA applied successfully.`);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Unable to save ticket resolution SLA.");
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (level, nextActive) => {
    const currentRow = rows.find((row) => row.level === level) || defaultRowForLevel(level);
    setBusyLevel(level);
    setError("");
    try {
      const updated = await updateTicketResolutionSlaStatusAPI(level, nextActive);
      const normalizedUpdated = normalizeRow(updated || { ...currentRow, is_active: nextActive });
      setRows((current) => current.map((row) => (row.level === level ? normalizedUpdated : row)));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Unable to update status.");
    } finally {
      setBusyLevel("");
    }
  };

  return (
    <div className={styles.stack}>
      <section className={styles.sectionPlain}>
        <div className={styles.sectionHeader} />

        <div className={styles.rulesTable}>
          <div className={styles.ruleCard}>
            <div className={styles.ruleGrid} style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto" }}>
              <label className={styles.field} style={{ gridColumn: "1 / 2", gridRow: "1" }}>
                <span>Level Type</span>
                <select value={selectedLevel} onChange={(event) => setSelectedLevel(event.target.value)}>
                  {LEVELS.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </label>

              <label className={styles.field} style={{ gridColumn: "2 / 3", gridRow: "1" }}>
                <span>Resolution Time</span>
                <select value={selectedHours} onChange={(event) => setSelectedHours(event.target.value)}>
                  {HOUR_OPTIONS.map((hour) => (
                    <option key={hour} value={hour}>{hour} Hrs</option>
                  ))}
                </select>
              </label>

              <div className={styles.ruleActions} style={{ gridColumn: "3 / 4", gridRow: "1" }}>
                <button type="button" className={styles.slaApplyButton} onClick={applyRow} aria-label="Apply SLA row" disabled={loading}>
                  {loading ? "Saving..." : "Apply"}
                </button>
                <button type="button" className={styles.slaClearButton} onClick={() => { setSelectedLevel("L1"); setSelectedHours("24"); }}>
                  Clear
                </button>
              </div>
            </div>
          </div>

          <div className={styles.slaTableWrap}>
            <table className={styles.slaTable}>
              <thead>
                <tr>
                  <th>Level Type</th>
                  <th>Resolution Time</th>
                  <th>Status</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.level}>
                    <td>{row.level}</td>
                    <td>{row.hours} Hrs</td>
                    <td>
                      <div className={styles.slaStatusToggle} role="group" aria-label={`${row.level} SLA status`}>
                        <button
                          type="button"
                          className={`${styles.slaStatusToggleButton} ${row.is_active ? styles.slaStatusToggleButtonActive : ""}`}
                          onClick={() => toggleStatus(row.level, true)}
                          disabled={busyLevel === row.level || row.is_active}
                        >
                          Active
                        </button>
                        <button
                          type="button"
                          className={`${styles.slaStatusToggleButton} ${!row.is_active ? styles.slaStatusToggleButtonInactive : ""}`}
                          onClick={() => toggleStatus(row.level, false)}
                          disabled={busyLevel === row.level || !row.is_active}
                        >
                          Inactive
                        </button>
                      </div>
                    </td>
                    <td>{formatTimestamp(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {message ? <p className={styles.successMessage}>{message}</p> : null}
        {error ? <p className={styles.errorMessage}>{error}</p> : null}
      </section>
    </div>
  );
}


import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import { FiList, FiCheckCircle, FiClock, FiAlertCircle } from "react-icons/fi";
import styles from "@/styles/ticketCalendar.module.css";

// Utility functions (copied from TicketCalendarPage)
const getEmpId = (ticket) => ticket?.employee_id || ticket?.emp_id || ticket?.employeeId || "";
const isIdByMode = (value, mode) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (mode === "L2") return normalized.startsWith("SUP");
  return normalized.startsWith("EMP");
};
const normalizeStatus = (status) => {
  const value = String(status || "").trim().toLowerCase();
  if (value === "in progress") return "In Progress";
  if (value === "submit" || value === "approved" || value === "closed") return "Completed";
  return "Incomplete";
};
const resolveTicketEmpId = (ticket, userIdByName) => {
  const direct = String(getEmpId(ticket) || "").trim().toUpperCase();
  if (direct) return direct;
  const name = String(ticket?.user_name || "").trim().toLowerCase();
  return String(userIdByName.get(name) || "").trim().toUpperCase();
};

export default function TicketAnalysisPage({ mode = "L1" }) {
  const { tickets } = useSelector((state) => state.operator) || {};
  const { tickets: supervisorTickets } = useSelector((state) => state.supervisor) || {};
  const { users } = useSelector((state) => state.users) || {};

  const allTickets = useMemo(
    () => Array.isArray(tickets) ? tickets : [],
    [tickets]
  );
  const supervisorTicketList = useMemo(() => {
    const raw = Array.isArray(supervisorTickets)
      ? supervisorTickets
      : Array.isArray(supervisorTickets?.tickets)
        ? supervisorTickets.tickets
        : Array.isArray(supervisorTickets?.data)
          ? supervisorTickets.data
          : [];
    return raw;
  }, [supervisorTickets]);
  const combinedTickets = useMemo(
    () => [...allTickets, ...supervisorTicketList],
    [allTickets, supervisorTicketList]
  );
  const userIdByName = useMemo(
    () =>
      new Map(
        (Array.isArray(users) ? users : []).map((u) => [
          String(u?.name || "").trim().toLowerCase(),
          String(u?.employeeId || "").trim().toUpperCase(),
        ])
      ),
    [users]
  );
  const modeTickets = useMemo(
    () =>
      combinedTickets.filter((t) =>
        isIdByMode(resolveTicketEmpId(t, userIdByName), mode)
      ),
    [combinedTickets, mode, userIdByName]
  );

  const analytics = useMemo(() => {
    const now = Date.now();
    const rowsMap = new Map();
    let completed = 0;
    let inprogress = 0;
    let reassigned = 0;
    let overdue = 0;

    modeTickets.forEach((t) => {
      const status = normalizeStatus(t.status);
      const ticketName = String(t?.user_name || "").trim() || "-";
      const ticketId = resolveTicketEmpId(t, userIdByName);
      const key = ticketId ? `${ticketId}-${ticketName}` : ticketName;
      const entry = rowsMap.get(key) || { employee: key, completed: 0, inprogress: 0, reassigned: 0, total: 0, hours: 0 };
      entry.total += 1;

      const createdAt = new Date(t.created_at).getTime();
      const ageHours = Number.isNaN(createdAt) ? 0 : Math.max(0, (now - createdAt) / (1000 * 60 * 60));
      if (status !== "Completed") {
        entry.hours += ageHours;
        if (ageHours > 24) overdue += 1;
      }

      if (status === "Completed") {
        entry.completed += 1;
        completed += 1;
      } else if (status === "In Progress") {
        entry.inprogress += 1;
        inprogress += 1;
      }

      if (String(t.status || "").trim().toLowerCase() === "reopened") {
        entry.reassigned += 1;
        reassigned += 1;
      }
      rowsMap.set(key, entry);
    });

    const rows = Array.from(rowsMap.values())
      .map((r) => ({ ...r, hours: Math.round(r.hours) }))
      .sort((a, b) => b.total - a.total);

    return {
      total: modeTickets.length,
      completed,
      inprogress,
      pending: Math.max(0, modeTickets.length - completed - inprogress),
      overdue,
      reassigned,
      rows,
    };
  }, [modeTickets, userIdByName]);

  return (
    <section className={styles.page}>
      <div className={styles.titleBlock}>
        <h1>
          <span className={styles.titleIcon}>📊</span>
          <span>Analysis {mode}</span>
        </h1>
        <p>Insights & Analytics for {mode} tickets</p>
      </div>
      <section className={styles.analyticsWrap}>
        <div className={styles.analyticsHead}>
          <h2>Insights & Analytics</h2>
          <p>Track team performance and ticket progress</p>
        </div>
        <h3 className={styles.sectionTitle}>Insights</h3>
        <div className={styles.cards}>
          <article className={`${styles.card} ${mode === "L2" ? styles.squareCard : ""}`}>
            <h4>Total Tasks</h4>
            <strong>{analytics.total}</strong>
            <span className={styles.cardIconRight}><FiList /></span>
          </article>
          <article className={`${styles.card} ${mode === "L2" ? styles.squareCard : ""}`}>
            <h4>Approved</h4>
            <strong>{analytics.completed}</strong>
            <span className={styles.cardIconRight}><FiCheckCircle /></span>
          </article>
          <article className={`${styles.card} ${mode === "L2" ? styles.squareCard : ""}`}>
            <h4>Rejected</h4>
            <strong>{analytics.pending}</strong>
            <span className={styles.cardIconRight}><FiClock /></span>
          </article>
          <article className={`${styles.card} ${mode === "L2" ? styles.squareCard : ""}`}>
            <h4>Pending</h4>
            <strong>{analytics.inprogress}</strong>
            <span className={styles.cardIconRight}><FiClock /></span>
          </article>
          <article className={`${styles.card} ${mode === "L2" ? styles.squareCard : ""}`}>
            <h4>Overdue</h4>
            <strong>{analytics.overdue}</strong>
            <span className={styles.cardIconRight}><FiAlertCircle /></span>
          </article>
        </div>
        <h3 className={styles.sectionTitle}>Analytics</h3>
        <div className={styles.tableWrap}>
          <table className={styles.analyticsTable}>
            <thead>
              <tr>
                <th>S.No</th>
                <th>Employee</th>
                <th>Completed</th>
                <th>In Progress</th>
                <th>Reassigned</th>
                <th>Total</th>
                <th>Hours</th>
              </tr>
            </thead>
            <tbody>
              {analytics.rows.map((row, idx) => (
                <tr key={`${row.employee}-${idx}`}>
                  <td>{idx + 1}</td>
                  <td>{row.employee}</td>
                  <td>{row.completed}</td>
                  <td>{row.inprogress}</td>
                  <td>{row.reassigned}</td>
                  <td>{row.total}</td>
                  <td>{row.hours}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

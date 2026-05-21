
import React, { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { FiList, FiCheckCircle, FiClock, FiAlertCircle } from "react-icons/fi";
import styles from "@/styles/ticketCalendar.module.css";
import { applyStoredTicketStatuses } from "@/utils/ticketStatus";

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
const normalizeL2Status = (status) => {
  const value = String(status || "").trim().toLowerCase();
  if (value === "approved" || value === "closed") return "Approved";
  if (value === "reopened" || value === "rejected" || value === "unresolved") return "Rejected";
  return "Pending";
};
const resolveTicketEmpId = (ticket, userIdByName) => {
  const direct = String(getEmpId(ticket) || "").trim().toUpperCase();
  if (direct) return direct;
  const name = String(ticket?.user_name || "").trim().toLowerCase();
  return String(userIdByName.get(name) || "").trim().toUpperCase();
};

export default function TicketAnalysisPage({ mode = "L1" }) {
  const [activeSystem, setActiveSystem] = useState("threshold");
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
  const modeTickets = useMemo(() => {
    const filteredTickets = combinedTickets.filter((t) =>
        isIdByMode(resolveTicketEmpId(t, userIdByName), mode)
      );

    return mode === "L2" ? applyStoredTicketStatuses(filteredTickets) : filteredTickets;
  }, [combinedTickets, mode, userIdByName]);

  const analytics = useMemo(() => {
    const now = Date.now();
    const rowsMap = new Map();
    let completed = 0;
    let inprogress = 0;
    let reassigned = 0;
    let overdue = 0;
    let approved = 0;
    let rejected = 0;
    let pending = 0;

    modeTickets.forEach((t) => {
      const status = normalizeStatus(t.status);
      const l2Status = normalizeL2Status(t.status);
      const ticketName = String(t?.user_name || "").trim() || "-";
      const ticketId = resolveTicketEmpId(t, userIdByName);
      const key = ticketId ? `${ticketId}-${ticketName}` : ticketName;
      const entry = rowsMap.get(key) || {
        employee: key,
        completed: 0,
        inprogress: 0,
        reassigned: 0,
        approved: 0,
        rejected: 0,
        pending: 0,
        overdue: 0,
        total: 0,
        hours: 0,
      };
      entry.total += 1;

      const createdAt = new Date(t.created_at).getTime();
      const ageHours = Number.isNaN(createdAt) ? 0 : Math.max(0, (now - createdAt) / (1000 * 60 * 60));
      const isOverdue = ageHours > 24 && (mode === "L2" ? l2Status !== "Approved" : status !== "Completed");
      if (mode === "L2" ? l2Status !== "Approved" : status !== "Completed") {
        entry.hours += ageHours;
        if (isOverdue) {
          entry.overdue += 1;
          overdue += 1;
        }
      }

      if (mode === "L2") {
        if (l2Status === "Approved") {
          entry.approved += 1;
          approved += 1;
        } else if (l2Status === "Rejected") {
          entry.rejected += 1;
          rejected += 1;
        } else {
          entry.pending += 1;
          pending += 1;
        }
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
      approved,
      inprogress,
      pending: mode === "L2" ? pending : Math.max(0, modeTickets.length - completed - inprogress),
      overdue,
      reassigned,
      rejected,
      rows,
    };
  }, [modeTickets, mode, userIdByName]);

  const isL2 = mode === "L2";
  const visibleRows = useMemo(() => {
    if (mode !== "L1") return analytics.rows;
    const thresholdRows = analytics.rows.filter((row) =>
      String(row.employee || "").toLowerCase().includes("threshold")
    );
    const submissionRows = analytics.rows.filter(
      (row) => !String(row.employee || "").toLowerCase().includes("threshold")
    );
    if (activeSystem === "threshold") return thresholdRows.length ? thresholdRows : analytics.rows;
    return submissionRows.length ? submissionRows : analytics.rows;
  }, [activeSystem, analytics.rows, mode]);

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
        {mode === "L1" && (
          <div style={{ margin: "8px 0 14px", display: "inline-flex", gap: 4, background: "#d7d7d7", padding: 3, borderRadius: 7 }}>
            <button
              type="button"
              onClick={() => setActiveSystem("threshold")}
              style={{
                height: 30,
                border: "none",
                borderRadius: 6,
                padding: "0 16px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                background: activeSystem === "threshold" ? "#fff" : "transparent",
              }}
            >
              Threshold Ticketing Sys.
            </button>
            <button
              type="button"
              onClick={() => setActiveSystem("submission")}
              style={{
                height: 30,
                border: "none",
                borderRadius: 6,
                padding: "0 16px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                background: activeSystem === "submission" ? "#fff" : "transparent",
              }}
            >
              Submission Ticketing Sys.
            </button>
          </div>
        )}
        <div className={styles.analyticsHead}>
          <h2>Insights & Analytics</h2>
          <p>Track team performance and ticket progress</p>
        </div>
        <h3 className={styles.sectionTitle}>Insights</h3>
        <div className={styles.cards}>
          <article className={styles.card}><h4>Total Tasks</h4><strong>{analytics.total}</strong></article>
          <article className={styles.card}><h4>Completed</h4><strong>{analytics.completed}</strong></article>
          <article className={styles.card}><h4>Pending</h4><strong>{analytics.pending}</strong></article>
          <article className={styles.card}><h4>Overdue (frequency)</h4><strong>{analytics.overdue}</strong></article>
        </div>
        <h3 className={styles.sectionTitle}>Analytics</h3>
        <div className={styles.tableWrap}>
          <table className={styles.analyticsTable}>
            <thead>
              <tr>
                <th>S.No</th>
                <th>{isL2 ? "Supervisor" : "Employee"}</th>
                {isL2 ? (
                  <>
                    <th>Approved</th>
                    <th>Rejected</th>
                    <th>Pending</th>
                    <th>Overdue</th>
                  </>
                ) : (
                  <>
                    <th>Completed</th>
                    <th>In Progress</th>
                    <th>Reassigned</th>
                  </>
                )}
                <th>Total</th>
                <th>Hours</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, idx) => (
                <tr key={`${row.employee}-${idx}`}>
                  <td>{idx + 1}</td>
                  <td>{row.employee}</td>
                  {isL2 ? (
                    <>
                      <td>{row.approved}</td>
                      <td>{row.rejected}</td>
                      <td>{row.pending}</td>
                      <td>{row.overdue}</td>
                    </>
                  ) : (
                    <>
                      <td>{row.completed}</td>
                      <td>{row.inprogress}</td>
                      <td>{row.reassigned}</td>
                    </>
                  )}
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

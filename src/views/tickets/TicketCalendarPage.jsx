import { useEffect, useMemo, useState } from "react";
import { FiCalendar } from "react-icons/fi";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { useDispatch, useSelector } from "react-redux";
import { fetchOperatorTickets } from "@/store/slices/operatorSlice";
import { fetchSupervisorTickets } from "@/store/slices/supervisorSlice";
import { fetchUsers } from "@/store/slices/userSlice";
import { applyStoredTicketStatuses } from "@/utils/ticketStatus";
import styles from "@/styles/ticketCalendar.module.css";

const VIEWS = ["Daily", "Weekly", "Monthly"];
const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EMPLOYEE_DEFAULT = "Employee";

const getEmpId = (ticket) =>
  ticket?.employee_id || ticket?.emp_id || ticket?.employeeId || "";

const isIdByMode = (value, mode) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (mode === "L2") return normalized.startsWith("SUP");
  return normalized.startsWith("EMP");
};

const getEmployeeOptionValue = (ticket, mode) => {
  const name = String(ticket?.user_name || "").trim();
  const empId = String(getEmpId(ticket) || "").trim();
  if (empId && !isIdByMode(empId, mode)) return "";
  if (empId && name) return `${empId}-${name}`;
  if (empId) return empId;
  return "";
};

const parseEmployeeSelection = (value) => {
  const raw = String(value || "").trim();
  if (!raw || raw === EMPLOYEE_DEFAULT) return { empId: "", name: "" };
  const [empId, ...nameParts] = raw.split("-");
  return {
    empId: String(empId || "").trim().toUpperCase(),
    name: nameParts.join("-").trim().toLowerCase(),
  };
};

const normalizeStatus = (status) => {
  const value = String(status || "").trim().toLowerCase();
  if (value === "in progress") return "In Progress";
  if (value === "submit" || value === "approved" || value === "closed") return "Completed";
  return "Incomplete";
};

const ymd = (date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const weekStart = (date) => {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
};
const resolveTicketEmpId = (ticket, userIdByName) => {
  const direct = String(getEmpId(ticket) || "").trim().toUpperCase();
  if (direct) return direct;
  const name = String(ticket?.user_name || "").trim().toLowerCase();
  return String(userIdByName.get(name) || "").trim().toUpperCase();
};

export default function TicketCalendarPage({ mode = "L1" }) {
  const dispatch = useDispatch();
  const { tickets, loading, error } = useSelector((state) => state.operator) || {};
  const { tickets: supervisorTickets } = useSelector((state) => state.supervisor) || {};
  const { users } = useSelector((state) => state.users) || {};
  const [view, setView] = useState("Monthly");
  const [cursorDate, setCursorDate] = useState(new Date());
  const [employee, setEmployee] = useState(EMPLOYEE_DEFAULT);

  useEffect(() => {
    dispatch(fetchOperatorTickets());
    dispatch(fetchSupervisorTickets());
    dispatch(fetchUsers());
  }, [dispatch]);

  const allTickets = useMemo(
    () => applyStoredTicketStatuses(Array.isArray(tickets) ? tickets : []),
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
    return applyStoredTicketStatuses(raw);
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

  const employees = useMemo(() => {
    const fromUsers = (Array.isArray(users) ? users : [])
      .map((u) => {
        const empId = String(u?.employeeId || "").trim();
        const name = String(u?.name || "").trim();
        if (!isIdByMode(empId, mode)) return "";
        if (empId && name) return `${empId}-${name}`;
        if (empId) return empId;
        return "";
      })
      .filter(Boolean);

    const unique = Array.from(
      new Set(
        [...fromUsers, ...modeTickets]
          .map((t) => (typeof t === "string" ? t : getEmployeeOptionValue(t, mode)))
          .filter(Boolean)
      )
    ).sort();
    return [EMPLOYEE_DEFAULT, ...unique];
  }, [modeTickets, mode, users]);

  const filtered = useMemo(
    () => {
      if (employee === EMPLOYEE_DEFAULT) return modeTickets;

      const selected = parseEmployeeSelection(employee);
      return modeTickets.filter((t) => {
        const ticketEmpId = String(getEmpId(t) || "").trim().toUpperCase();
        const ticketName = String(t?.user_name || "").trim().toLowerCase();
        const mappedEmpId = userIdByName.get(ticketName) || "";

        if (selected.empId && (ticketEmpId === selected.empId || mappedEmpId === selected.empId)) {
          return true;
        }

        if (selected.name && ticketName === selected.name) {
          return true;
        }

        return false;
      });
    },
    [employee, modeTickets, userIdByName]
  );

  const ticketMap = useMemo(() => {
    const map = new Map();
    filtered.forEach((t) => {
      const date = new Date(t.created_at);
      if (Number.isNaN(date.getTime())) return;
      const key = ymd(date);
      const existing = map.get(key) || [];
      existing.push({
        id: t.ticket_id,
        employee: t.user_name || "-",
        status: normalizeStatus(t.status),
      });
      map.set(key, existing);
    });
    return map;
  }, [filtered]);

  const monthLabel = useMemo(
    () => cursorDate.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    [cursorDate]
  );

  const monthCells = useMemo(() => {
    const first = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursorDate]);

  const step = (delta) => {
    const next = new Date(cursorDate);
    if (view === "Daily") next.setDate(next.getDate() + delta);
    else if (view === "Weekly") next.setDate(next.getDate() + delta * 7);
    else next.setMonth(next.getMonth() + delta);
    setCursorDate(next);
  };

  const weekCells = useMemo(() => {
    const start = weekStart(cursorDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursorDate]);

  const currentDayEvents = ticketMap.get(ymd(cursorDate)) || [];
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
          <span className={styles.titleIcon}><FiCalendar /></span>
          <span>Calendar {mode}</span>
        </h1>
        <p>View and manage employee tickets by status</p>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftControls}>
          <button type="button" onClick={() => step(-1)}><FiChevronLeft /></button>
          <button type="button" onClick={() => setCursorDate(new Date())}>Today</button>
          <button type="button" onClick={() => step(1)}><FiChevronRight /></button>
          <strong>{monthLabel}</strong>
        </div>
        <div className={styles.rightControls}>
          <select value={employee} onChange={(e) => setEmployee(e.target.value)}>
            {employees.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <div className={styles.segment}>
            {VIEWS.map((item) => (
              <button
                key={item}
                type="button"
                className={view === item ? styles.segmentActive : ""}
                onClick={() => setView(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? <p>Loading tickets...</p> : null}
      {error ? <p>{error}</p> : null}

      {view === "Daily" ? (
        <div className={styles.dailyPanel}>
          <h3>{cursorDate.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h3>
          <div className={styles.dailyList}>
            {currentDayEvents.length === 0 ? <p>No tasks for this employee/day.</p> : null}
            {currentDayEvents.map((e) => (
              <article key={`${e.id}-${e.status}`} className={`${styles.dailyItem} ${styles[e.status.replace(/\s+/g, "")]}`}>
                <strong>{e.id}</strong>
                <span>{e.employee}</span>
                <span>{e.status}</span>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.calendarCard}>
          <div className={styles.weekHeader}>
            {WEEK_DAYS.map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className={view === "Weekly" ? styles.weekGrid : styles.monthGrid}>
            {(view === "Weekly" ? weekCells : monthCells).map((date) => {
              const key = ymd(date);
              const events = ticketMap.get(key) || [];
              const outOfMonth = date.getMonth() !== cursorDate.getMonth();
              return (
                <div key={key} className={`${styles.dayCell} ${outOfMonth && view === "Monthly" ? styles.muted : ""}`}>
                  <div className={styles.dayNumber}>{date.getDate()}</div>
                  <div className={styles.events}>
                    {events.slice(0, view === "Weekly" ? 6 : 3).map((e) => (
                      <div key={`${e.id}-${e.status}`} className={`${styles.event} ${styles[e.status.replace(/\s+/g, "")]}`}>
                        {e.id} - {e.employee}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.legend}>
        <span><i className={`${styles.dot} ${styles.Completed}`}></i>Completed</span>
        <span><i className={`${styles.dot} ${styles.InProgress}`}></i>In Progress</span>
        <span><i className={`${styles.dot} ${styles.Incomplete}`}></i>Incomplete</span>
      </div>

      {/* Analytics section removed: Only calendar UI is shown on L1/L2 Calendar pages */}
    </section>
  );
}


import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/router";
import {
  FiAward,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiList,
  FiRefreshCw,
  FiTarget,
  FiTrendingUp,
} from "react-icons/fi";
import {
  fetchAnalysisRankingApi,
  fetchL1AnalysisApi,
  fetchL2AnalysisApi,
  fetchStatisticsAnalyticsApi,
} from "@/apis/analysisApi";
import { getSubmissionTickets } from "@/apis/operatorApi";
import styles from "@/styles/ticketCalendar.module.css";
import { fetchOperatorTickets } from "@/store/slices/operatorSlice";
import { fetchSupervisorTickets } from "@/store/slices/supervisorSlice";
import { fetchUsers } from "@/store/slices/userSlice";
import { applyStoredTicketStatuses } from "@/utils/ticketStatus";
import { departmentDirectory } from "@/views/departments/data";
import { getThresholdFieldsForScreen } from "@/views/thresholds/fieldCatalog";
import { getThresholdScreensForSubDepartment } from "@/views/thresholds/screenCatalog";

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
const toInputDate = (date) => {
  const next = new Date(date);
  if (Number.isNaN(next.getTime())) return "";
  const yyyy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
const clampPercent = (value) => Math.max(12, Math.min(96, Math.round(value)));
const parseTicketDate = (ticket) => {
  const value =
    ticket?.created_at ||
    ticket?.createdAt ||
    ticket?.created_date ||
    ticket?.date ||
    ticket?.submitted_at ||
    ticket?.updated_at;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const normalizeDateStart = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};
const normalizeDateEnd = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(23, 59, 59, 999);
  return date;
};
const getTicketId = (ticket) =>
  String(ticket?.ticket_id || ticket?.ticketId || ticket?.id || "").trim();
const uniqueTicketsById = (tickets) => {
  const seen = new Set();
  return tickets.filter((ticket, index) => {
    const id = getTicketId(ticket) || `row-${index}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};
const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
const standardDeviation = (values) => {
  if (!values.length) return 0;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};
const getScaledPoints = (values) => {
  const max = Math.max(1, ...values);
  return values.map((value) => clampPercent((value / max) * 84 + 12));
};
const detectValueKind = (fieldName) => {
  const value = String(fieldName || "").toLowerCase();
  if (value.includes("%") || value.includes("percent") || value.includes("efficiency") || value.includes("rate")) {
    return "percent";
  }
  if (value.includes("count") || value.includes("tickets") || value.includes("submission") || value.includes("approval")) {
    return "number";
  }
  return "decimal";
};
const formatAxisValue = (value, valueKind = "decimal") => {
  const number = Number(value || 0);
  if (valueKind === "percent") return `${Number(number.toFixed(1)).toString()}%`;
  if (valueKind === "number") return String(Math.round(number));
  return Number(number.toFixed(2)).toString();
};
const periodToBackendPeriod = {
  "1D": "today",
  "1W": "week",
  "1M": "month",
  "1Y": "year",
};
const formatMetricPercent = (value) => `${Number(value || 0).toFixed(2).replace(/\.00$/, "")}%`;
const normalizeLookup = (value) => String(value || "").trim().toLowerCase();
const formatShortDay = (date) =>
  date.toLocaleDateString("en-US", { weekday: "short" });
const formatShortDate = (date) =>
  `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
const buildPeriodBuckets = (period, anchorDateValue) => {
  const anchor = normalizeDateEnd(anchorDateValue) || new Date();

  if (period === "1D") {
    const start = normalizeDateStart(anchor);
    return Array.from({ length: 8 }, (_, index) => {
      const bucketStart = new Date(start);
      bucketStart.setHours(index * 3, 0, 0, 0);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setHours(bucketStart.getHours() + 2, 59, 59, 999);
      return {
        label: `${String(bucketStart.getHours()).padStart(2, "0")}:00`,
        start: bucketStart,
        end: bucketEnd,
      };
    });
  }

  if (period === "1W") {
    return Array.from({ length: 7 }, (_, index) => {
      const day = normalizeDateStart(addDays(anchor, index - 6));
      return {
        label: `${formatShortDay(day)} ${formatShortDate(day)}`,
        start: day,
        end: normalizeDateEnd(day),
      };
    });
  }

  if (period === "1M") {
    return Array.from({ length: 4 }, (_, index) => {
      const start = normalizeDateStart(addDays(anchor, (index - 3) * 7));
      const end = normalizeDateEnd(addDays(start, 6));
      return {
        label: `W${index + 1}`,
        start,
        end,
      };
    });
  }

  const year = anchor.getFullYear();
  return Array.from({ length: 12 }, (_, index) => {
    const start = new Date(year, index, 1);
    const end = normalizeDateEnd(new Date(year, index + 1, 0));
    return {
      label: start.toLocaleDateString("en-US", { month: "short" }),
      start,
      end,
    };
  });
};

function DatePickerField({ label, value, onChange }) {
  const inputRef = useRef(null);
  const fieldRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const selectedDate = value ? new Date(`${value}T00:00:00`) : new Date();
  const [viewDate, setViewDate] = useState(selectedDate);
  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const monthDays = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const leadingDays = monthStart.getDay();
  const calendarCells = [
    ...Array.from({ length: leadingDays }, (_, index) => ({ key: `blank-${index}`, day: null })),
    ...Array.from({ length: monthDays }, (_, index) => ({ key: `day-${index + 1}`, day: index + 1 })),
  ];

  useEffect(() => {
    if (value) setViewDate(new Date(`${value}T00:00:00`));
  }, [value]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!fieldRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  const openPicker = () => {
    setIsOpen((current) => !current);
    inputRef.current?.focus();
  };
  const changeMonth = (offset) => {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };
  const selectDay = (day) => {
    onChange(toInputDate(new Date(viewDate.getFullYear(), viewDate.getMonth(), day)));
    setIsOpen(false);
  };

  return (
    <div className={styles.statisticsDateField} ref={fieldRef}>
      <span>{label}</span>
      <input ref={inputRef} type="text" value={value} onChange={(event) => onChange(event.target.value)} readOnly />
      <button type="button" className={styles.dateTrigger} aria-label={`Open ${label} calendar`} onClick={openPicker}>
        <FiCalendar />
      </button>
      {isOpen && (
        <div className={styles.datePopover}>
          <div className={styles.datePopoverHeader}>
            <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month">
              &lt;
            </button>
            <strong>
              {viewDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
            </strong>
            <button type="button" onClick={() => changeMonth(1)} aria-label="Next month">
              &gt;
            </button>
          </div>
          <div className={styles.dateWeekdays}>
            {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
              <span key={`${day}-${index}`}>{day}</span>
            ))}
          </div>
          <div className={styles.dateGrid}>
            {calendarCells.map((cell) =>
              cell.day ? (
                <button
                  type="button"
                  key={cell.key}
                  className={toInputDate(new Date(viewDate.getFullYear(), viewDate.getMonth(), cell.day)) === value ? styles.dateSelected : ""}
                  onClick={() => selectDay(cell.day)}
                >
                  {cell.day}
                </button>
              ) : (
                <span key={cell.key} />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniAreaChart({ title, values, labels, valueKind }) {
  const scaledValues = getScaledPoints(values);
  const maxValue = Math.max(1, ...values.map((value) => Number(value || 0)));
  const points = scaledValues.map((value, index) => ({
    x: values.length === 1 ? 180 : 28 + (index / Math.max(1, values.length - 1)) * 314,
    y: 118 - value,
  }));
  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} 132 L ${points[0].x} 132 Z`;

  return (
    <article className={styles.statChartCard}>
      <div className={styles.statChartHead}>
        <strong>{title}</strong>
      </div>
      <svg className={styles.statChartSvg} viewBox="0 20 360 130" role="img" aria-label={`${title} chart`}>
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <text x="4" y={132 - tick} className={styles.statChartTick}>
              {formatAxisValue((tick / 100) * maxValue, valueKind)}
            </text>
            <line x1="28" x2="342" y1={132 - tick} y2={132 - tick} className={styles.statChartGrid} />
          </g>
        ))}
        <path d={areaPath} className={styles.statChartArea} />
        <path d={linePath} className={styles.statChartLine} />
        {points.map((point, index) => (
          <g key={`${title}-${index}`}>
            <circle cx={point.x} cy={point.y} r="4" className={styles.statChartPoint} />
            <text x={point.x} y="144" textAnchor="middle" className={styles.statChartDay}>{labels[index]}</text>
          </g>
        ))}
      </svg>
    </article>
  );
}

function TeamPerformanceFilter({
  activePeriod,
  setActivePeriod,
  filterMode,
  setFilterMode,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  selectedDepartmentSlug,
  setSelectedDepartmentSlug,
  selectedSubDepartmentSlug,
  setSelectedSubDepartmentSlug,
  notebook,
  setNotebook,
  inputField,
  setInputField,
}) {
  const selectedDepartment = departmentDirectory.find((department) => department.slug === selectedDepartmentSlug);
  const subDepartments = selectedDepartment?.subDepartments || [];
  const notebookOptions = selectedDepartmentSlug && selectedSubDepartmentSlug
    ? getThresholdScreensForSubDepartment(selectedDepartmentSlug, selectedSubDepartmentSlug)
    : [];
  const inputFieldOptions = notebook ? getThresholdFieldsForScreen(notebook) : [];

  const handleDepartmentChange = (event) => {
    setSelectedDepartmentSlug(event.target.value);
    setSelectedSubDepartmentSlug("");
    setNotebook("");
    setInputField("");
  };

  const handleSubDepartmentChange = (event) => {
    setSelectedSubDepartmentSlug(event.target.value);
    setNotebook("");
    setInputField("");
  };

  const handleNotebookChange = (event) => {
    setNotebook(event.target.value);
    setInputField("");
  };

  return (
    <section className={styles.performanceControlsCard}>
      <div className={styles.performanceControlsLeft}>
        <label className={styles.performanceSelectField}>
          <span>Department</span>
          <select value={selectedDepartmentSlug} onChange={handleDepartmentChange}>
            <option value="">All Departments</option>
            {departmentDirectory.map((department) => (
              <option key={department.slug} value={department.slug}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.performanceSelectField}>
          <span>Sub Department</span>
          <select
            value={selectedSubDepartmentSlug}
            onChange={handleSubDepartmentChange}
            disabled={!selectedDepartmentSlug}
          >
            <option value="">All Sub Departments</option>
            {subDepartments.map((subDepartment) => (
              <option key={subDepartment.slug} value={subDepartment.slug}>
                {subDepartment.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.performanceSelectField}>
          <span>Notebook</span>
          <select value={notebook} onChange={handleNotebookChange} disabled={!selectedSubDepartmentSlug}>
            <option value="">All Notebooks</option>
            {notebookOptions.map((screen) => (
              <option key={screen} value={screen}>
                {screen}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.performanceSelectField}>
          <span>Input Field</span>
          <select value={inputField} onChange={(event) => setInputField(event.target.value)} disabled={!notebook}>
            <option value="">All Values</option>
            {inputFieldOptions.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.performanceControlsRight}>
        <div className={styles.performanceModeToggle}>
          {["current", "custom"].map((mode) => (
            <button
              key={mode}
              type="button"
              className={filterMode === mode ? styles.performanceModeActive : ""}
              onClick={() => setFilterMode(mode)}
            >
              {mode === "current" ? "Current" : "Custom"}
            </button>
          ))}
        </div>

        {filterMode === "custom" ? (
          <div className={styles.performanceCustomDates}>
            <DatePickerField label="Custom From" value={fromDate} onChange={setFromDate} />
            <DatePickerField label="Custom To" value={toDate} onChange={setToDate} />
          </div>
        ) : (
          <div className={styles.performanceCurrentFilters}>
            {["1D", "1W", "1M", "1Y"].map((period) => (
              <button
                key={period}
                type="button"
                className={activePeriod === period ? styles.statisticsPeriodActive : ""}
                onClick={() => setActivePeriod(period)}
              >
                {period}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function StatisticsAnalysisFilter({
  activePeriod,
  setActivePeriod,
  filterMode,
  setFilterMode,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  selectedDepartmentSlug,
  setSelectedDepartmentSlug,
  selectedSubDepartmentSlug,
  setSelectedSubDepartmentSlug,
  users,
  selectedUserId,
  setSelectedUserId,
}) {
  const selectedDepartment = departmentDirectory.find((department) => department.slug === selectedDepartmentSlug);
  const subDepartments = selectedDepartment?.subDepartments || [];

  const handleDepartmentChange = (event) => {
    setSelectedDepartmentSlug(event.target.value);
    setSelectedSubDepartmentSlug("");
  };

  return (
    <section className={styles.statisticsTopFilters}>
      <div className={`${styles.performanceControlsLeft} ${styles.statisticsControlsLeft}`}>
        <label className={styles.performanceSelectField}>
          <span>Department</span>
          <select value={selectedDepartmentSlug} onChange={handleDepartmentChange}>
            <option value="">All Departments</option>
            {departmentDirectory.map((department) => (
              <option key={department.slug} value={department.slug}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.performanceSelectField}>
          <span>Sub Department</span>
          <select
            value={selectedSubDepartmentSlug}
            onChange={(event) => setSelectedSubDepartmentSlug(event.target.value)}
            disabled={!selectedDepartmentSlug}
          >
            <option value="">All Sub Departments</option>
            {subDepartments.map((subDepartment) => (
              <option key={subDepartment.slug} value={subDepartment.slug}>
                {subDepartment.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.performanceSelectField}>
          <span>User</span>
          <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
            <option value="">All Users</option>
            {(Array.isArray(users) ? users : []).map((user) => {
              const userId = String(user?.employeeId || user?.employee_id || user?.id || "").trim();
              return (
                <option key={`${userId}-${user?.name || userId}`} value={userId}>
                  {user?.name || userId}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      <div className={styles.performanceControlsRight}>
        <div className={styles.performanceModeToggle}>
        {["current", "custom"].map((mode) => (
          <button
            key={mode}
            type="button"
            className={filterMode === mode ? styles.performanceModeActive : ""}
            onClick={() => setFilterMode(mode)}
          >
            {mode === "current" ? "Current" : "Custom"}
          </button>
        ))}
      </div>

      {filterMode === "custom" ? (
        <div className={styles.statisticsCustomDates}>
          <DatePickerField label="Custom From" value={fromDate} onChange={setFromDate} />
          <DatePickerField label="Custom To" value={toDate} onChange={setToDate} />
        </div>
      ) : (
        <div className={styles.performanceCurrentFilters}>
          {["1D", "1W", "1M", "1Y"].map((period) => (
            <button
              key={period}
              type="button"
              className={activePeriod === period ? styles.statisticsPeriodActive : ""}
              onClick={() => setActivePeriod(period)}
            >
              {period}
            </button>
          ))}
        </div>
      )}
    </div>
  </section>
  );
}

const metricIcons = [
  { match: "allocated", icon: FiList },
  { match: "on time", icon: FiCheckCircle },
  { match: "delayed", icon: FiClock },
  { match: "reworked", icon: FiRefreshCw },
  { match: "efficiency", icon: FiTrendingUp },
  { match: "approval", icon: FiTarget },
  { match: "ranking", icon: FiAward },
];

function MetricCard({ label, value }) {
  const Icon = metricIcons.find((item) => label.toLowerCase().includes(item.match))?.icon || FiTarget;
  return (
    <article className={styles.performanceMetricCard}>
      <div className={styles.performanceMetricHead}>
        <span>{label}</span>
        <Icon />
      </div>
      <strong>{value}</strong>
    </article>
  );
}

export default function TicketAnalysisPage({ mode = "L1" }) {
  const router = useRouter();
  const dispatch = useDispatch();
  const [activeSystem, setActiveSystem] = useState("threshold");
  const [statisticsApiData, setStatisticsApiData] = useState({
    cards: null,
    loading: false,
    error: "",
    filter: null,
  });
  const [activePeriod, setActivePeriod] = useState("1M");
  const [performanceFilterMode, setPerformanceFilterMode] = useState("current");
  const [fromDate, setFromDate] = useState(toInputDate(addDays(new Date(), -25)));
  const [toDate, setToDate] = useState(toInputDate(new Date()));
  const [selectedDepartmentSlug, setSelectedDepartmentSlug] = useState("");
  const [selectedSubDepartmentSlug, setSelectedSubDepartmentSlug] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [notebook, setNotebook] = useState("");
  const [inputField, setInputField] = useState("");
  const [submissionTickets, setSubmissionTickets] = useState([]);
  const [submissionError, setSubmissionError] = useState("");
  const [performanceApiData, setPerformanceApiData] = useState({
    l1: null,
    l2: null,
    ranking: [],
    loading: false,
    error: "",
  });
  const { tickets, loading: operatorLoading, error: operatorError } = useSelector((state) => state.operator) || {};
  const {
    tickets: supervisorTickets,
    isLoading: supervisorLoading,
    error: supervisorError,
  } = useSelector((state) => state.supervisor) || {};
  const { users } = useSelector((state) => state.users) || {};
  const selectedDepartment = useMemo(
    () => departmentDirectory.find((department) => department.slug === selectedDepartmentSlug) || null,
    [selectedDepartmentSlug]
  );
  const selectedSubDepartment = useMemo(
    () =>
      selectedDepartment?.subDepartments?.find((subDepartment) => subDepartment.slug === selectedSubDepartmentSlug) ||
      null,
    [selectedDepartment, selectedSubDepartmentSlug]
  );

  useEffect(() => {
    const departmentParam = String(router.query?.department || process.env.NEXT_PUBLIC_STATS_DEPARTMENT || "").trim();
    const subDepartmentParam = String(
      router.query?.sub_department || process.env.NEXT_PUBLIC_STATS_SUB_DEPARTMENT || ""
    ).trim();
    const userIdParam = String(router.query?.user_id || "").trim();
    const notebookParam = String(router.query?.input_screen || process.env.NEXT_PUBLIC_STATS_INPUT_SCREEN || "").trim();
    const inputFieldParam = String(router.query?.input_field || process.env.NEXT_PUBLIC_STATS_INPUT_FIELD || "").trim();

    if (departmentParam) {
      const foundDepartment = departmentDirectory.find(
        (department) =>
          normalizeLookup(department.slug) === normalizeLookup(departmentParam) ||
          normalizeLookup(department.name) === normalizeLookup(departmentParam)
      );
      if (foundDepartment) {
        setSelectedDepartmentSlug(foundDepartment.slug);
      }
    }

    if (subDepartmentParam) {
      const foundSubDepartment = departmentDirectory
        .flatMap((department) => department.subDepartments || [])
        .find(
          (subDepartment) =>
            normalizeLookup(subDepartment.slug) === normalizeLookup(subDepartmentParam) ||
            normalizeLookup(subDepartment.name) === normalizeLookup(subDepartmentParam)
        );
      if (foundSubDepartment) {
        setSelectedSubDepartmentSlug(foundSubDepartment.slug);
      }
    }

    if (userIdParam) {
      setSelectedUserId(userIdParam);
    }
    if (notebookParam) {
      setNotebook(notebookParam);
    }
    if (inputFieldParam) {
      setInputField(inputFieldParam);
    }
  }, [router.query]);

  const handlePeriodChange = (period) => {
    const end = normalizeDateEnd(toDate) || new Date();
    setActivePeriod(period);

    if (period === "1D") {
      setFromDate(toInputDate(end));
      setToDate(toInputDate(end));
      return;
    }

    if (period === "1W") {
      setFromDate(toInputDate(addDays(end, -6)));
      setToDate(toInputDate(end));
      return;
    }

    if (period === "1M") {
      setFromDate(toInputDate(addDays(end, -27)));
      setToDate(toInputDate(end));
      return;
    }

    setFromDate(toInputDate(new Date(end.getFullYear(), 0, 1)));
    setToDate(toInputDate(new Date(end.getFullYear(), 11, 31)));
  };

  useEffect(() => {
    dispatch(fetchUsers());

    if (mode === "Stats") {
      return undefined;
    }

    dispatch(fetchOperatorTickets());
    dispatch(fetchSupervisorTickets());

    let isMounted = true;
    getSubmissionTickets()
      .then((response) => {
        if (!isMounted) return;
        const rows = Array.isArray(response)
          ? response
          : Array.isArray(response?.data)
            ? response.data
            : Array.isArray(response?.tickets)
              ? response.tickets
              : [];
        setSubmissionTickets(rows);
        setSubmissionError("");
      })
      .catch((error) => {
        if (!isMounted) return;
        setSubmissionTickets([]);
        setSubmissionError(error.message || "Failed to fetch submission tickets.");
      });

    return () => {
      isMounted = false;
    };
  }, [dispatch, mode]);

  useEffect(() => {
    if (mode !== "L1" && mode !== "L2") return undefined;

    let isMounted = true;
    const isCustomPeriod = performanceFilterMode === "custom";
    const period = isCustomPeriod ? "custom" : periodToBackendPeriod[activePeriod] || "month";
    const params = {
      period,
      ...(isCustomPeriod ? { start_date: fromDate, end_date: toDate } : {}),
      ...(selectedDepartment ? { department: selectedDepartment.name, department_slug: selectedDepartment.slug } : {}),
      ...(selectedSubDepartment
        ? { sub_department: selectedSubDepartment.name, sub_department_slug: selectedSubDepartment.slug }
        : {}),
      ...(selectedUserId ? { user_id: selectedUserId, employee_id: selectedUserId } : {}),
      ...(notebook ? { input_screen: notebook } : {}),
      ...(inputField ? { input_field: inputField } : {}),
    };

    setPerformanceApiData((current) => ({ ...current, loading: true, error: "" }));

    Promise.all([
      fetchL1AnalysisApi(params),
      fetchL2AnalysisApi(params),
      fetchAnalysisRankingApi(params),
    ])
      .then(([l1, l2, ranking]) => {
        if (!isMounted) return;
        setPerformanceApiData({
          l1,
          l2,
          ranking: Array.isArray(ranking?.ranking) ? ranking.ranking : [],
          loading: false,
          error: "",
        });
      })
      .catch((error) => {
        if (!isMounted) return;
        setPerformanceApiData((current) => ({
          ...current,
          loading: false,
          error: error?.response?.data?.message || error.message || "Failed to fetch team performance analysis.",
        }));
      });

    return () => {
      isMounted = false;
    };
  }, [activePeriod, fromDate, mode, performanceFilterMode, selectedDepartment, selectedSubDepartment, selectedUserId, notebook, inputField, toDate]);

  useEffect(() => {
    if (mode !== "Stats") return undefined;

    const department = selectedDepartment?.name || String(router.query?.department || process.env.NEXT_PUBLIC_STATS_DEPARTMENT || "").trim();
  const subDepartment = selectedSubDepartment?.name || String(
      router.query?.sub_department || process.env.NEXT_PUBLIC_STATS_SUB_DEPARTMENT || ""
    ).trim();
    const userId = selectedUserId || String(router.query?.user_id || "").trim();
    const isCustomPeriod = performanceFilterMode === "custom";
    const period = isCustomPeriod ? "custom" : periodToBackendPeriod[activePeriod] || "month";
    const canFetchFromApi = department && subDepartment;

    if (!canFetchFromApi) {
      setStatisticsApiData((current) => ({
        ...current,
        loading: false,
        error: "",
      }));
      return undefined;
    }

    let mounted = true;
    setStatisticsApiData((current) => ({ ...current, loading: true, error: "" }));

    fetchStatisticsAnalyticsApi({
      department,
      sub_department: subDepartment,
      period,
      ...(isCustomPeriod ? { start_date: fromDate, end_date: toDate } : {}),
      ...(userId ? { user_id: userId, employee_id: userId } : {}),
    })
      .then((response) => {
        if (!mounted) return;
        setStatisticsApiData({
          cards: response?.cards || null,
          loading: false,
          error: "",
          filter: response?.filter || null,
        });
      })
      .catch((error) => {
        if (!mounted) return;
        const message = error?.response?.data?.message || error.message || "Failed to fetch statistics analytics.";
        if (/input_screen.*input_field.*required/i.test(message)) {
          setStatisticsApiData({
            cards: null,
            loading: false,
            error: "",
            filter: null,
          });
          return;
        }
        setStatisticsApiData({
          cards: null,
          loading: false,
          error: message,
          filter: null,
        });
      });

    return () => {
      mounted = false;
    };
  }, [
    activePeriod,
    mode,
    router.query?.department,
    router.query?.sub_department,
    router.query?.user_id,
    selectedDepartment,
    selectedSubDepartment,
    selectedUserId,
    fromDate,
    performanceFilterMode,
    toDate,
  ]);

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
    () => uniqueTicketsById([...allTickets, ...supervisorTicketList, ...submissionTickets]),
    [allTickets, supervisorTicketList, submissionTickets]
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
  const userById = useMemo(() => {
    const lookup = new Map();
    (Array.isArray(users) ? users : []).forEach((user) => {
      const employeeId = String(user?.employeeId || user?.employee_id || user?.id || "").trim().toUpperCase();
      if (employeeId) lookup.set(employeeId, user);
    });
    return lookup;
  }, [users]);
  const matchesDepartmentFilters = useMemo(
    () => (ticket) => {
      if (!selectedDepartment && !selectedSubDepartment && !selectedUserId) return true;
      const employeeId = resolveTicketEmpId(ticket, userIdByName);
      const user = userById.get(employeeId);
      const ticketDepartment =
        ticket?.department ||
        ticket?.management_field ||
        ticket?.dept ||
        ticket?.department_name ||
        user?.dept ||
        user?.department ||
        "";
      const ticketSubDepartment =
        ticket?.sub_department ||
        ticket?.subDepartment ||
        ticket?.erp_product_code ||
        ticket?.sub_department_name ||
        "";

      if (selectedDepartment && normalizeLookup(ticketDepartment) !== normalizeLookup(selectedDepartment.name)) {
        return false;
      }
      if (
        selectedSubDepartment &&
        normalizeLookup(ticketSubDepartment) !== normalizeLookup(selectedSubDepartment.name)
      ) {
        return false;
      }
      if (selectedUserId) {
        if (!employeeId || normalizeLookup(employeeId) !== normalizeLookup(selectedUserId)) {
          return false;
        }
      }
      return true;
    },
    [selectedDepartment, selectedSubDepartment, selectedUserId, userById, userIdByName]
  );
  const modeTickets = useMemo(() => {
    const filteredTickets = combinedTickets.filter((t) =>
        isIdByMode(resolveTicketEmpId(t, userIdByName), mode)
      );

    return mode === "L2" ? applyStoredTicketStatuses(filteredTickets) : filteredTickets;
  }, [combinedTickets, mode, userIdByName]);
  const filteredModeTickets = useMemo(() => {
    const start = normalizeDateStart(fromDate);
    const end = normalizeDateEnd(toDate);
    return modeTickets.filter((ticket) => {
      const date = parseTicketDate(ticket);
      if (!date) return false;
      return (!start || date >= start) && (!end || date <= end) && matchesDepartmentFilters(ticket);
    });
  }, [fromDate, matchesDepartmentFilters, modeTickets, toDate]);

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

    filteredModeTickets.forEach((t) => {
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
      total: filteredModeTickets.length,
      completed,
      approved,
      inprogress,
      pending: mode === "L2" ? pending : Math.max(0, filteredModeTickets.length - completed - inprogress),
      overdue,
      reassigned,
      rejected,
      rows,
    };
  }, [filteredModeTickets, mode, userIdByName]);

  const isL2 = mode === "L2";
  const isStatsMode = mode === "Stats";
  const selectedValueKind = useMemo(() => detectValueKind(inputField), [inputField]);
  const filteredFetchedTickets = useMemo(() => {
    const start = normalizeDateStart(fromDate);
    const end = normalizeDateEnd(toDate);
    return combinedTickets.filter((ticket) => {
      const date = parseTicketDate(ticket);
      if (!date) return false;
      return (!start || date >= start) && (!end || date <= end) && matchesDepartmentFilters(ticket);
    });
  }, [combinedTickets, fromDate, matchesDepartmentFilters, toDate]);
  const statisticsSeries = useMemo(() => {
    const cards = statisticsApiData.cards;
    if (cards && typeof cards === "object") {
      const chartConfigs = [
        { title: "Mean", key: "mean" },
        { title: "Median", key: "median" },
        { title: "Standard Deviation", key: "standard_deviation" },
        { title: "Average", key: "average" },
      ];
      const apiSeries = chartConfigs.map(({ title, key }) => {
        const points = Array.isArray(cards?.[key]) ? cards[key] : [];
        const labels = points.map((point) => String(point?.label || "-"));
        const rawValues = points.map((point) => Number(point?.value ?? 0));
        return { title, labels, values: rawValues, valueKind: selectedValueKind };
      });

      if (apiSeries.some((series) => series.labels.length > 0)) {
        return apiSeries;
      }
    }

    const buckets = buildPeriodBuckets(activePeriod, toDate);
    const bucketCounts = buckets.map((bucket) => {
      return filteredFetchedTickets.filter((ticket) => {
        const date = parseTicketDate(ticket);
        return date && date >= bucket.start && date <= bucket.end;
      }).length;
    });
    const completionRates = buckets.map((bucket) => {
      const dayTickets = filteredFetchedTickets.filter((ticket) => {
        const date = parseTicketDate(ticket);
        return date && date >= bucket.start && date <= bucket.end;
      });
      if (!dayTickets.length) return 0;
      return Math.round(
        (dayTickets.filter((ticket) => normalizeStatus(ticket.status) === "Completed").length / dayTickets.length) * 100
      );
    });
    const runningMeans = bucketCounts.map((_, index) => {
      const slice = bucketCounts.slice(0, index + 1);
      return Number((slice.reduce((sum, value) => sum + value, 0) / slice.length).toFixed(1));
    });
    const runningMedians = bucketCounts.map((_, index) => Number(median(bucketCounts.slice(0, index + 1)).toFixed(1)));
    const runningDeviation = bucketCounts.map((_, index) =>
      Number(standardDeviation(bucketCounts.slice(0, index + 1)).toFixed(1))
    );
    const minMaxSpread = bucketCounts.map((_, index) => {
      const slice = bucketCounts.slice(0, index + 1);
      return Math.max(...slice) - Math.min(...slice);
    });
    const overallMean = bucketCounts.length
      ? bucketCounts.reduce((sum, value) => sum + value, 0) / bucketCounts.length
      : 0;
    const outlierScores = bucketCounts.map((value) => Number(Math.abs(value - overallMean).toFixed(1)));
    const labels = buckets.map((bucket) => bucket.label);

    return [
      { title: "Mean", labels, values: runningMeans, valueKind: selectedValueKind },
      { title: "Median", labels, values: runningMedians, valueKind: selectedValueKind },
      { title: "Standard Deviation", labels, values: runningDeviation, valueKind: selectedValueKind },
      { title: "Average", labels, values: completionRates, valueKind: selectedValueKind },
      { title: "Outlier", labels, values: outlierScores, valueKind: selectedValueKind },
      { title: "Min & Max", labels, values: minMaxSpread, valueKind: selectedValueKind },
    ];
  }, [activePeriod, filteredFetchedTickets, selectedValueKind, statisticsApiData.cards, toDate]);
  const performanceMetrics = useMemo(() => {
    const l1ApiMetrics = performanceApiData.l1?.metrics;
    const l2ApiMetrics = performanceApiData.l2?.metrics;
    const topRanking = performanceApiData.ranking?.[0];

    if (!selectedDepartment && !selectedSubDepartment && (l1ApiMetrics || l2ApiMetrics || topRanking)) {
      return {
        l1Submission: [
          { label: "Allocated Submission", value: Number(l1ApiMetrics?.allocated_submissions || 0) },
          { label: "On Time Submission", value: Number(l1ApiMetrics?.on_time_submissions || 0) },
          { label: "Delayed Submission", value: Number(l1ApiMetrics?.delayed_submissions || 0) },
          { label: "Reworked Submission", value: Number(l1ApiMetrics?.reworked_submissions || 0) },
          { label: "Submission Efficiency", value: formatMetricPercent(l1ApiMetrics?.submission_efficiency) },
        ],
        l1Resolution: [
          { label: "Allocated Tickets", value: Number(l1ApiMetrics?.allocated_tickets || 0) },
          { label: "On Time Resolution", value: Number(l1ApiMetrics?.on_time_resolutions || 0) },
          { label: "Delayed Resolution", value: Number(l1ApiMetrics?.delayed_resolutions || 0) },
          { label: "Reworked Resolution", value: Number(l1ApiMetrics?.reworked_resolutions || 0) },
          { label: "Resolution Efficiency", value: formatMetricPercent(l1ApiMetrics?.resolution_efficiency) },
          { label: "First Time Approval Rate", value: formatMetricPercent(l1ApiMetrics?.first_time_approval_rate) },
        ],
        l1Ranking: [
          {
            label: "Ranking",
            value: formatMetricPercent(topRanking?.average_efficiency ?? l1ApiMetrics?.average_efficiency),
          },
        ],
        l2Approvals: [
          { label: "Allocated Tickets", value: Number(l2ApiMetrics?.allocated_tickets || 0) },
          { label: "On Time Approvals", value: Number(l2ApiMetrics?.on_time_approvals || 0) },
          { label: "Delayed Approvals", value: Number(l2ApiMetrics?.delayed_approvals || 0) },
          { label: "Approvals Efficiency", value: formatMetricPercent(l2ApiMetrics?.approval_efficiency) },
        ],
      };
    }

    const getStats = (targetMode) => {
      const start = normalizeDateStart(fromDate);
      const end = normalizeDateEnd(toDate);
      const targetTickets = combinedTickets.filter((ticket) => {
        const date = parseTicketDate(ticket);
        return (
          isIdByMode(resolveTicketEmpId(ticket, userIdByName), targetMode) &&
          (!date || ((!start || date >= start) && (!end || date <= end))) &&
          matchesDepartmentFilters(ticket)
        );
      });
      const normalizedTickets = targetMode === "L2"
        ? applyStoredTicketStatuses(targetTickets)
        : targetTickets;
      const total = normalizedTickets.length;
      const completed = normalizedTickets.filter((ticket) => normalizeStatus(ticket.status) === "Completed").length;
      const delayed = normalizedTickets.filter((ticket) => normalizeStatus(ticket.status) !== "Completed").length;
      const reworked = normalizedTickets.filter((ticket) =>
        String(ticket.status || "").trim().toLowerCase() === "reopened"
      ).length;
      const approved = normalizedTickets.filter((ticket) => normalizeL2Status(ticket.status) === "Approved").length;
      const percentage = (part) => `${total ? Math.round((part / total) * 100) : 0}%`;

      return {
        total,
        completed,
        delayed,
        reworked,
        approved,
        completedRate: percentage(completed),
        approvedRate: percentage(approved),
      };
    };

    const l1 = getStats("L1");
    const l2 = getStats("L2");

    return {
      l1Submission: [
        { label: "Allocated Submission", value: l1.total },
        { label: "On Time Submission", value: l1.completed },
        { label: "Delayed Submission", value: l1.delayed },
        { label: "Reworked Submission", value: l1.reworked },
        { label: "Submission Efficiency", value: l1.completedRate },
      ],
      l1Resolution: [
        { label: "Allocated Tickets", value: l1.total },
        { label: "On Time Resolution", value: l1.completed },
        { label: "Delayed Resolution", value: l1.delayed },
        { label: "Reworked Resolution", value: l1.reworked },
        { label: "Resolution Efficiency", value: l1.completedRate },
        { label: "First Time Approval Rate", value: l1.completedRate },
      ],
      l1Ranking: [
        { label: "Ranking", value: l1.completedRate },
      ],
      l2Approvals: [
        { label: "Allocated Tickets", value: l2.total },
        { label: "On Time Approvals", value: l2.approved },
        { label: "Delayed Approvals", value: Math.max(0, l2.total - l2.approved) },
        { label: "Approvals Efficiency", value: l2.approvedRate },
      ],
    };
  }, [
    combinedTickets,
    fromDate,
    matchesDepartmentFilters,
    performanceApiData.l1,
    performanceApiData.l2,
    performanceApiData.ranking,
    selectedDepartment,
    selectedSubDepartment,
    toDate,
    userIdByName,
  ]);
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

  if (isStatsMode) {
    return (
      <section className={`${styles.page} ${styles.statisticsPage}`}>
        <h1 className={styles.statisticsTitle}>Statistic Analytics</h1>
        <StatisticsAnalysisFilter
          activePeriod={activePeriod}
          setActivePeriod={handlePeriodChange}
          filterMode={performanceFilterMode}
          setFilterMode={setPerformanceFilterMode}
          fromDate={fromDate}
          setFromDate={setFromDate}
          toDate={toDate}
          setToDate={setToDate}
          selectedDepartmentSlug={selectedDepartmentSlug}
          setSelectedDepartmentSlug={setSelectedDepartmentSlug}
          selectedSubDepartmentSlug={selectedSubDepartmentSlug}
          setSelectedSubDepartmentSlug={setSelectedSubDepartmentSlug}
          users={users}
          selectedUserId={selectedUserId}
          setSelectedUserId={setSelectedUserId}
        />
        {statisticsApiData.loading && <p className={styles.statisticsError}>Fetching statistics analytics...</p>}
        {statisticsApiData.error && <p className={styles.statisticsError}>{statisticsApiData.error}</p>}
        <section className={styles.statisticsGrid}>
          {statisticsSeries.map((chart) => (
            <MiniAreaChart
              key={chart.title}
              title={chart.title}
              values={chart.values}
              labels={chart.labels}
              valueKind={chart.valueKind}
            />
          ))}
        </section>
      </section>
    );
  }

  if (mode === "L1") {
    return (
      <section className={`${styles.page} ${styles.performancePage}`}>
        <h1 className={styles.performanceTitle}>L1 Team Performance Analysis</h1>
        <TeamPerformanceFilter
          activePeriod={activePeriod}
          setActivePeriod={handlePeriodChange}
          filterMode={performanceFilterMode}
          setFilterMode={setPerformanceFilterMode}
          fromDate={fromDate}
          setFromDate={setFromDate}
          toDate={toDate}
          setToDate={setToDate}
          selectedDepartmentSlug={selectedDepartmentSlug}
          setSelectedDepartmentSlug={setSelectedDepartmentSlug}
          selectedSubDepartmentSlug={selectedSubDepartmentSlug}
          setSelectedSubDepartmentSlug={setSelectedSubDepartmentSlug}
          notebook={notebook}
          setNotebook={setNotebook}
          inputField={inputField}
          setInputField={setInputField}
        />
        {performanceApiData.loading && <p className={styles.statisticsError}>Fetching team performance data...</p>}
        {performanceApiData.error && <p className={styles.statisticsError}>{performanceApiData.error}</p>}
        <section className={styles.performancePanel}>
          <div className={styles.performanceGrid}>
            {performanceMetrics.l1Submission.map((metric) => (
              <MetricCard key={metric.label} label={metric.label} value={metric.value} />
            ))}
          </div>
        </section>
        <section className={styles.performancePanel}>
          <div className={styles.performanceGrid}>
            {performanceMetrics.l1Resolution.map((metric) => (
              <MetricCard key={metric.label} label={metric.label} value={metric.value} />
            ))}
          </div>
        </section>
        <div className={styles.performanceRanking}>
          {performanceMetrics.l1Ranking.map((metric) => (
            <MetricCard key={metric.label} label={metric.label} value={metric.value} />
          ))}
        </div>
      </section>
    );
  }

  if (mode === "L2") {
    return (
      <section className={`${styles.page} ${styles.performancePage}`}>
        <h1 className={styles.performanceTitle}>L2 Team Performance Analysis</h1>
        <TeamPerformanceFilter
          activePeriod={activePeriod}
          setActivePeriod={handlePeriodChange}
          filterMode={performanceFilterMode}
          setFilterMode={setPerformanceFilterMode}
          fromDate={fromDate}
          setFromDate={setFromDate}
          toDate={toDate}
          setToDate={setToDate}
          selectedDepartmentSlug={selectedDepartmentSlug}
          setSelectedDepartmentSlug={setSelectedDepartmentSlug}
          selectedSubDepartmentSlug={selectedSubDepartmentSlug}
          setSelectedSubDepartmentSlug={setSelectedSubDepartmentSlug}
          users={users}
          notebook={notebook}
          setNotebook={setNotebook}
          inputField={inputField}
          setInputField={setInputField}
        />
        {performanceApiData.loading && <p className={styles.statisticsError}>Fetching team performance data...</p>}
        {performanceApiData.error && <p className={styles.statisticsError}>{performanceApiData.error}</p>}
        <section className={styles.performancePanel}>
          <div className={styles.performanceGrid}>
            {performanceMetrics.l2Approvals.map((metric) => (
              <MetricCard key={metric.label} label={metric.label} value={metric.value} />
            ))}
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <div className={styles.titleBlock}>
        <h1>
          <span>Team Performance</span>
        </h1>
        <p>Track L2 team performance and ticket progress</p>
      </div>
      <section className={styles.analyticsWrap}>
        {mode === "L1" && (
          <div className={styles.analysisToggle}>
            <button
              type="button"
              onClick={() => setActiveSystem("threshold")}
              className={`${styles.analysisToggleBtn} ${activeSystem === "threshold" ? styles.analysisToggleBtnActive : ""}`}
            >
              Threshold Ticketing Sys.
            </button>
            <button
              type="button"
              onClick={() => setActiveSystem("submission")}
              className={`${styles.analysisToggleBtn} ${activeSystem === "submission" ? styles.analysisToggleBtnActive : ""}`}
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

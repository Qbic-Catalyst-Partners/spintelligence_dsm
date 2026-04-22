import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import {
  FiBarChart2,
  FiCheckSquare,
  FiClock,
  FiGrid,
  FiLayers,
  FiSettings,
  FiSliders,
} from "react-icons/fi";

import styles from "@/styles/dashboard.module.css";
import { departmentDirectory } from "@/views/departments/data";
import { fetchSupervisorTickets } from "@/store/slices/supervisorSlice";
import { isFullAccessUser } from "@/utils/accessControl";

const DASHBOARD_PREFS_KEY = "dashboardPreferences";
const RANGE_OPTIONS = ["daily", "weekly", "monthly"];

const defaultPreferences = {
  showSummaryCards: true,
  showSubmissionTrends: true,
  showLatestTickets: true,
  showDepartmentOverview: true,
  showQuickLinks: true,
};

const chartRanges = {
  daily: { points: 7, formatter: formatDailyLabel },
  weekly: { points: 8, formatter: formatWeeklyLabel },
  monthly: { points: 6, formatter: formatMonthlyLabel },
};

function formatDailyLabel(date) {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function formatWeeklyLabel(date) {
  return `Wk ${getWeekNumber(date)}`;
}

function formatMonthlyLabel(date) {
  return date.toLocaleDateString("en-US", { month: "short" });
}

function getWeekNumber(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target - firstThursday;
  return 1 + Math.round(diff / 604800000);
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfWeek(date) {
  const copy = startOfDay(date);
  const day = copy.getDay();
  const diff = (day + 6) % 7;
  copy.setDate(copy.getDate() - diff);
  return copy;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function addWeeks(date, amount) {
  return addDays(date, amount * 7);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function getTicketDate(ticket) {
  const rawValue =
    ticket?.created_at ||
    ticket?.createdAt ||
    ticket?.submitted_at ||
    ticket?.submission_time ||
    ticket?.updated_at;
  const date = rawValue ? new Date(rawValue) : null;
  return Number.isNaN(date?.getTime()) ? null : date;
}

function getTicketSource(ticket) {
  const parameterName = Array.isArray(ticket?.parameter_name)
    ? ticket.parameter_name[0]
    : ticket?.parameter_name;

  return (
    ticket?.input_screen_name ||
    ticket?.screen_name ||
    ticket?.screen ||
    ticket?.form_name ||
    ticket?.department_name ||
    parameterName ||
    ticket?.machine_name ||
    "Unknown screen"
  );
}

function formatTicketTime(date) {
  if (!date) return "-";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatTicketDate(date) {
  if (!date) return "-";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function normalizeTickets(tickets) {
  if (Array.isArray(tickets)) {
    return tickets;
  }

  if (Array.isArray(tickets?.tickets)) {
    return tickets.tickets;
  }

  if (Array.isArray(tickets?.data)) {
    return tickets.data;
  }

  return [];
}

function buildTrendData(tickets, range) {
  const config = chartRanges[range];
  const today = new Date();
  let cursor;
  let stepFn;
  let keyFn;

  if (range === "daily") {
    cursor = startOfDay(addDays(today, -(config.points - 1)));
    stepFn = (date) => addDays(date, 1);
    keyFn = (date) => startOfDay(date).getTime();
  } else if (range === "weekly") {
    cursor = startOfWeek(addWeeks(today, -(config.points - 1)));
    stepFn = (date) => addWeeks(date, 1);
    keyFn = (date) => startOfWeek(date).getTime();
  } else {
    cursor = startOfMonth(addMonths(today, -(config.points - 1)));
    stepFn = (date) => addMonths(date, 1);
    keyFn = (date) => startOfMonth(date).getTime();
  }

  const buckets = [];
  const bucketMap = new Map();

  for (let index = 0; index < config.points; index += 1) {
    const bucketDate = new Date(cursor);
    const bucket = {
      key: keyFn(bucketDate),
      label: config.formatter(bucketDate),
      value: 0,
    };
    buckets.push(bucket);
    bucketMap.set(bucket.key, bucket);
    cursor = stepFn(cursor);
  }

  tickets.forEach((ticket) => {
    const ticketDate = getTicketDate(ticket);
    if (!ticketDate) {
      return;
    }

    const key = keyFn(ticketDate);
    const matchingBucket = bucketMap.get(key);
    if (matchingBucket) {
      matchingBucket.value += 1;
    }
  });

  return buckets;
}

function getAccessibleDepartmentStats(accessByDepartment, user) {
  if (isFullAccessUser(user)) {
    return {
      accessibleDepartments: departmentDirectory.filter((department) => department.enabled).length,
      accessibleScreens: departmentDirectory.reduce(
        (total, department) => total + department.subDepartments.filter((subDepartment) => subDepartment.enabled).length,
        0
      ),
    };
  }

  const accessList = Array.isArray(accessByDepartment) ? accessByDepartment : [];

  return {
    accessibleDepartments: accessList.length,
    accessibleScreens: accessList.reduce((total, department) => {
      const screens = Array.isArray(department?.screens) ? department.screens.length : 0;
      return total + screens;
    }, 0),
  };
}

function readStoredPreferences(storageKey) {
  if (typeof window === "undefined") {
    return defaultPreferences;
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);
    if (!storedValue) {
      return defaultPreferences;
    }

    return {
      ...defaultPreferences,
      ...JSON.parse(storedValue),
    };
  } catch {
    return defaultPreferences;
  }
}

function writeStoredPreferences(storageKey, preferences) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(preferences));
}

function StatCard({ icon: Icon, label, value, accent, helper }) {
  return (
    <article className={`${styles.statCard} ${styles[accent]}`}>
      <div className={styles.statHeader}>
        <span className={styles.statIcon}>
          <Icon />
        </span>
        <span className={styles.statLabel}>{label}</span>
      </div>
      <div className={styles.statValue}>{value}</div>
      <p className={styles.statHelper}>{helper}</p>
    </article>
  );
}

function TrendChart({ data }) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);
  const gridSteps = 4;
  const points = data.map((item, index) => {
    const x = (index / Math.max(data.length - 1, 1)) * 100;
    const y = 100 - (item.value / maxValue) * 100;
    return `${x},${y}`;
  });
  const areaPoints = [`0,100`, ...points, `100,100`].join(" ");

  return (
    <div className={styles.chartWrap}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.chartSvg} aria-hidden="true">
        <defs>
          <linearGradient id="submissionFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(31, 79, 126, 0.22)" />
            <stop offset="100%" stopColor="rgba(31, 79, 126, 0.02)" />
          </linearGradient>
        </defs>
        {Array.from({ length: gridSteps + 1 }, (_, index) => {
          const y = (index / gridSteps) * 100;
          return <line key={y} x1="0" y1={y} x2="100" y2={y} className={styles.chartGridLine} />;
        })}
        <polygon points={areaPoints} className={styles.chartArea} />
        <polyline points={points.join(" ")} className={styles.chartLine} />
        {data.map((item, index) => {
          const x = (index / Math.max(data.length - 1, 1)) * 100;
          const y = 100 - (item.value / maxValue) * 100;
          return <circle key={item.label} cx={x} cy={y} r="2.2" className={styles.chartPoint} />;
        })}
      </svg>

      <div className={styles.chartAxis}>
        {data.map((item) => (
          <div key={item.label} className={styles.axisItem}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function TicketSourceChart({ tickets }) {
  const maxValue = Math.max(...tickets.map((ticket) => ticket.value), 1);

  return (
    <div className={styles.ticketChartList}>
      {tickets.map((ticket) => (
        <div key={`${ticket.ticketId}-${ticket.timestamp}`} className={styles.ticketChartItem}>
          <div className={styles.ticketChartMeta}>
            <div className={styles.ticketChartMetaPrimary}>
              <strong>{ticket.source}</strong>
              <small>{ticket.ticketId}</small>
            </div>
            <span>
              {ticket.timeLabel} on {ticket.dateLabel}
            </span>
          </div>
          <div className={styles.ticketChartBarTrack} aria-hidden="true">
            <div
              className={styles.ticketChartBar}
              style={{ width: `${Math.max((ticket.value / maxValue) * 100, 28)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CustomDashboard() {
  const router = useRouter();
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth?.user);
  const accessByDepartment = useSelector((state) => state.auth?.accessByDepartment);
  const { tickets, isLoading, error } = useSelector((state) => state.supervisor) || {};
  const employeeKey = user?.employee_id || user?.employeeId || "guest";
  const storageKey = `${DASHBOARD_PREFS_KEY}:${employeeKey}`;

  const [chartRange, setChartRange] = useState("daily");
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [showCustomizer, setShowCustomizer] = useState(false);

  useEffect(() => {
    setPreferences(readStoredPreferences(storageKey));
  }, [storageKey]);

  useEffect(() => {
    dispatch(fetchSupervisorTickets());
  }, [dispatch]);

  const safeTickets = useMemo(() => normalizeTickets(tickets), [tickets]);
  const sortedTickets = useMemo(() => {
    return [...safeTickets].sort((left, right) => {
      const leftTime = getTicketDate(left)?.getTime() || 0;
      const rightTime = getTicketDate(right)?.getTime() || 0;
      return rightTime - leftTime;
    });
  }, [safeTickets]);

  const submissionTrend = useMemo(
    () => buildTrendData(sortedTickets, chartRange),
    [chartRange, sortedTickets]
  );

  const latestFiveTickets = useMemo(() => {
    return sortedTickets.slice(0, 5).map((ticket, index) => {
      const ticketDate = getTicketDate(ticket);
      return {
        ticketId: ticket?.ticket_id || `ticket-${index}`,
        source: getTicketSource(ticket),
        timeLabel: formatTicketTime(ticketDate),
        dateLabel: formatTicketDate(ticketDate),
        timestamp: ticketDate?.getTime() || index,
        value: Math.max(5 - index, 1),
      };
    });
  }, [sortedTickets]);

  const totalDepartments = departmentDirectory.length;
  const totalSubDepartments = departmentDirectory.reduce(
    (total, department) => total + department.subDepartments.length,
    0
  );
  const enabledSubDepartments = departmentDirectory.reduce(
    (total, department) => total + department.subDepartments.filter((subDepartment) => subDepartment.enabled).length,
    0
  );

  const { accessibleDepartments, accessibleScreens } = useMemo(
    () => getAccessibleDepartmentStats(accessByDepartment, user),
    [accessByDepartment, user]
  );

  const departmentCards = useMemo(() => {
    return departmentDirectory.map((department) => {
      const enabledCount = department.subDepartments.filter((subDepartment) => subDepartment.enabled).length;
      return {
        slug: department.slug,
        name: department.name,
        href: `/departments/${department.slug}`,
        total: department.subDepartments.length,
        enabled: enabledCount,
        description: department.description,
      };
    });
  }, []);

  const updatePreference = (preferenceKey) => {
    const nextPreferences = {
      ...preferences,
      [preferenceKey]: !preferences[preferenceKey],
    };
    setPreferences(nextPreferences);
    writeStoredPreferences(storageKey, nextPreferences);
  };

  const fullName = user?.full_name || user?.name || "Client";

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <section className={styles.hero}>
          <section className={styles.heroPanel}>
            <div>
              <p className={styles.eyebrow}>Operations Dashboard</p>
              <h1>Welcome back, {fullName}</h1>
              <p className={styles.heroCopy}>
                A cleaner snapshot of submissions, ticket creation, and department coverage across the website.
              </p>
            </div>

            <div className={styles.heroMetrics}>
              <div className={styles.heroMetric}>
                <span>Total Departments</span>
                <strong>{totalDepartments}</strong>
              </div>
              <div className={styles.heroMetric}>
                <span>Total Tickets</span>
                <strong>{safeTickets.length}</strong>
              </div>
              <div className={styles.heroMetric}>
                <span>Accessible Screens</span>
                <strong>{accessibleScreens}</strong>
              </div>
            </div>
          </section>

          <aside className={styles.heroSide}>
            <div className={styles.heroSideTop}>
              <p className={styles.panelEyebrow}>Control Center</p>
              <h2 className={styles.heroSideTitle}>Change the dashboard view</h2>
              <p className={styles.heroSideCopy}>
                Show only the sections your client wants to keep visible on the dashboard page.
              </p>
            </div>

            <div className={styles.heroActionStack}>
              <button
                type="button"
                className={styles.customizeButton}
                onClick={() => setShowCustomizer((current) => !current)}
              >
                <FiSettings />
                Customize Dashboard
              </button>
              <button
                type="button"
                className={styles.heroLinkButton}
                onClick={() => router.push("/departments/quality-control")}
              >
                <FiGrid />
                Open Departments
              </button>
            </div>
          </aside>
        </section>

        {showCustomizer && (
          <section className={styles.customizer}>
            <div className={styles.customizerHeader}>
              <h2>Choose what the client can see</h2>
              <p>Your selections are saved for this login.</p>
            </div>

            <div className={styles.toggleGrid}>
              {[
                ["showSummaryCards", "Summary cards"],
                ["showSubmissionTrends", "Submission graph"],
                ["showLatestTickets", "Latest 5 ticket graph"],
                ["showDepartmentOverview", "Department cards"],
                ["showQuickLinks", "Quick links"],
              ].map(([key, label]) => (
                <label key={key} className={styles.toggleCard}>
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={preferences[key]}
                    onChange={() => updatePreference(key)}
                  />
                </label>
              ))}
            </div>
          </section>
        )}

        {preferences.showSummaryCards && (
          <section className={styles.statsGrid}>
            <StatCard
              icon={FiLayers}
              label="Departments"
              value={totalDepartments}
              accent="blueCard"
              helper="Total department groups available in the website."
            />
            <StatCard
              icon={FiGrid}
              label="Sub-Departments"
              value={totalSubDepartments}
              accent="orangeCard"
              helper={`${enabledSubDepartments} currently active across the platform.`}
            />
            <StatCard
              icon={FiCheckSquare}
              label="Accessible Departments"
              value={accessibleDepartments}
              accent="tealCard"
              helper="Based on the logged-in user's allowed department access."
            />
            <StatCard
              icon={FiSliders}
              label="Accessible Screens"
              value={accessibleScreens}
              accent="darkCard"
              helper="Input screens currently available for this user/client."
            />
          </section>
        )}

        <section className={styles.analyticsGrid}>
          {preferences.showSubmissionTrends && (
            <article className={`${styles.panel} ${styles.trendPanel}`}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.panelEyebrow}>Input Screen Submission Trend</p>
                  <h2>Daily, weekly, and monthly view</h2>
                </div>

                <div className={styles.segmentedControl}>
                  {RANGE_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={chartRange === option ? styles.segmentActive : ""}
                      onClick={() => setChartRange(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <TrendChart data={submissionTrend} />
              <p className={styles.panelFootnote}>
                {isLoading
                  ? "Loading ticket submissions..."
                  : `Showing ${safeTickets.length} total submission records in the current dataset.`}
              </p>
            </article>
          )}

          {preferences.showLatestTickets && (
            <article className={`${styles.panel} ${styles.latestPanel}`}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.panelEyebrow}>Latest Ticket Sources</p>
                  <h2>When and from which input screen</h2>
                </div>
                <span className={styles.panelBadge}>
                  <FiClock />
                  Latest 5
                </span>
              </div>

              {latestFiveTickets.length > 0 ? (
                <TicketSourceChart tickets={latestFiveTickets} />
              ) : (
                <div className={styles.emptyState}>
                  <FiBarChart2 />
                  <p>No ticket records are available yet.</p>
                </div>
              )}
            </article>
          )}
        </section>

        {preferences.showDepartmentOverview && (
          <section className={styles.departmentSection}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.panelEyebrow}>Department Overview</p>
                <h2>Full website coverage at a glance</h2>
              </div>
            </div>

            <div className={styles.departmentGrid}>
              {departmentCards.map((department) => (
                <button
                  key={department.slug}
                  type="button"
                  className={styles.departmentCard}
                  onClick={() => router.push(department.href)}
                >
                  <div className={styles.departmentCardTop}>
                    <h3>{department.name}</h3>
                    <span className={styles.departmentPill}>Overview</span>
                  </div>
                  <div>
                    <p>{department.description}</p>
                  </div>
                  <div className={styles.departmentStats}>
                    <strong>{department.total}</strong>
                    <span>Sub-departments</span>
                    <small>{department.enabled} enabled</small>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {preferences.showQuickLinks && (
          <section className={styles.quickLinksSection}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.panelEyebrow}>Quick Links</p>
                <h2>Jump to the most-used flows</h2>
              </div>
            </div>

            <div className={styles.quickLinksGrid}>
              <button type="button" className={styles.quickLinkCard} onClick={() => router.push("/departments/quality-control")}>
                <div className={styles.quickLinkAccent} />
                <div>
                  <strong>Departments</strong>
                  <p>Open quality control departments and browse input screens faster.</p>
                </div>
                <span>Open quality control departments</span>
              </button>
              <button type="button" className={styles.quickLinkCard} onClick={() => router.push("/supervisordashboard")}>
                <div className={styles.quickLinkAccent} />
                <div>
                  <strong>Supervisor Tickets</strong>
                  <p>Review generated tickets, source screens, and current approval status.</p>
                </div>
                <span>Review generated tickets and status</span>
              </button>
              <button type="button" className={styles.quickLinkCard} onClick={() => router.push("/operator")}>
                <div className={styles.quickLinkAccent} />
                <div>
                  <strong>Ticketing System</strong>
                  <p>Move directly to operator flows and ticket creation-related pages.</p>
                </div>
                <span>Go to ticketing system and operator views</span>
              </button>
            </div>
          </section>
        )}

        {error && <p className={styles.errorText}>{error}</p>}
      </main>
    </div>
  );
}

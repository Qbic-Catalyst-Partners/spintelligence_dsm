import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { FiPieChart, FiCalendar, FiMaximize2, FiX, FiPrinter } from "react-icons/fi";
import { MdOutlineConfirmationNumber, MdOutlinePendingActions, MdOutlineReplay } from "react-icons/md";
import { IoCheckmarkDoneCircleOutline } from "react-icons/io5";
import { AiOutlineFolderOpen } from "react-icons/ai";

import apiConfig from "@/apis/apiConfig";
import { fetchBuilderData, fetchMyDashboard, fetchMyWidgets, fetchUserWidgets } from "@/apis/dashboardBuilderApi";
import styles from "@/styles/departmentDirectory.module.css";
import { canViewDashboardLevelFilter, getDashboardVisibleLevels, isDashboardManagerUser } from "@/utils/accessControl";
import { getDashboardOwnerUserId } from "@/utils/dashboardOwner";

// Wraps the Ticket Dashboard's date filter row + ticket stat cards in one outer card. The
// chart panels below it (trend/status/priority) intentionally stay outside this wrapper so
// they keep their own separate individual cards instead of being absorbed into one big box.
const SECTION_CARD_STYLE = {
  border: "1px solid #dbe1ec",
  borderRadius: 14,
  background: "#f8fafc",
  padding: 18,
};
const CHART_CARD_STYLE = {
  border: "1px solid #dbe1ec",
  borderRadius: 12,
  background: "#ffffff",
  padding: 16,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
};
// Status/Priority sit under a shorter chart than the trend line, so the grid row (sized to the
// tallest card) leaves empty space below them - center their content in that space instead of
// leaving it stuck at the top.
const CHART_CARD_BODY_CENTERED_STYLE = { flex: 1, display: "flex", alignItems: "center", justifyContent: "center" };
const CHART_CARD_TITLE_STYLE = { fontSize: 14, fontWeight: 700, color: "#1f2937", margin: 0 };
const CHART_CARD_SUBTITLE_STYLE = { fontSize: 12, color: "#94a3b8", margin: "2px 0 0" };
// Shared by the Date Range control's own fields (Date Range/From/To) and the Level/Name filters
// next to it, so every field in that row is the exact same size regardless of which group it
// belongs to.
const FILTER_FIELD_LABEL_STYLE = { display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 0.4 };
const FILTER_SELECT_STYLE = { height: 34, minWidth: 140, border: "1px solid #dbe1ec", borderRadius: 8, background: "#ffffff", color: "#1f2937", fontWeight: 400, padding: "0 10px", fontSize: 13 };
const TICKET_VISUALIZATION_TYPES = new Set(["ticket_status_card", "individual_ticket_count", "add_ticket_count"]);
const DASHBOARD_FETCH_DEBOUNCE_MS = 250;
const LINE_CHART_X_PADDING = 6;
const timelineToPeriod = {
  daily: "1D",
  weekly: "1W",
  monthly: "1M",
};
const normalizeRoleKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
const isExcludedRole = (role) => normalizeRoleKey(role).includes("somplex");

const parseWidgetEnabled = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  if (["false", "0", "off", "disabled", "no"].includes(normalized)) return false;
  if (["true", "1", "on", "enabled", "yes"].includes(normalized)) return true;
  return true;
};

const normalizeInputFieldKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const visualizationTypeToChartType = (visualizationType) => {
  const normalized = String(visualizationType || "").trim().toLowerCase();
  if (normalized === "average_value_card") return "value";
  if (normalized.includes("line")) return "line";
  if (normalized.includes("bar")) return "bar";
  if (normalized.includes("area")) return "area";
  if (normalized.includes("timeline")) return "timeline";
  return "line";
};

const formatIntegerValue = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return String(Math.round(n));
};
const formatDayLabel = (date) => {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}`;
};
const formatMonthLabel = (date) =>
  date.toLocaleString("en-US", { month: "short" });
const getTicketCardLabel = (value) => {
  const toSentenceCase = (text) => {
    const normalized = String(text || "").trim();
    if (!normalized) return "";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
  };
  const key = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (key === "totaltickets") return "Total Tickets";
  if (key === "open" || key === "opentickets") return "Open";
  if (key === "reopened" || key === "reopenedtickets") return "Reopened";
  if (key === "closed" || key === "closedtickets") return "Closed";
  // "pending" is the widget's internal metric key (kept for backward compat with already-saved
  // widgets), but the ticket's own real status is always called "In Progress" everywhere else
  // in the app (SUPERVISOR_VISIBLE_STATUS_OPTIONS, ticket filters, etc.) - "Pending" was never
  // an actual ticket status, so the card showed a confusing label for a correctly-counted value.
  if (key === "pending" || key === "pendingtickets" || key === "inprogress" || key === "inprogresstickets") return "In Progress";
  if (key === "overdue" || key === "overduetickets") return "Overdue";
  if (key === "submit" || key === "submittickets" || key === "submitted" || key === "submittedtickets") return "Submit";
  return "Ticket Dashboard";
};
const getTicketCardIcon = (label) => {
  if (label === "Total Tickets") return MdOutlineConfirmationNumber;
  if (label === "Open") return AiOutlineFolderOpen;
  if (label === "Reopened") return MdOutlineReplay;
  if (label === "Closed") return IoCheckmarkDoneCircleOutline;
  if (label === "In Progress") return MdOutlinePendingActions;
  if (label === "Submit") return IoCheckmarkDoneCircleOutline;
  return FiPieChart;
};
// Same semantic colors as the Status Distribution donut (STATUS_COLOR_MAP, defined further
// down) - a light tint for the icon badge background, the solid color for the icon itself, so
// a card's color means the same thing everywhere on the page instead of every icon badge being
// the same uniform blue regardless of what the card actually represents.
const TICKET_CARD_ACCENT = {
  "Total Tickets": "#64748b",
  Open: "#3d539f",
  "In Progress": "#f4b13f",
  Overdue: "#ef4444",
  Submit: "#06b6d4",
  Closed: "#22c55e",
  Reopened: "#8b5cf6",
};
const getTicketCardAccentStyle = (label) => {
  const color = TICKET_CARD_ACCENT[label] || "#64748b";
  return { background: `${color}1f`, color };
};
// Short one-line explanation of what each ticket card's number actually counts, shown under
// the value so the metric isn't just a bare label + number.
const TICKET_CARD_DESCRIPTION = {
  "Total Tickets": "Created in this period",
  Closed: "Actioned with approvals",
  Overdue: "Beyond ticket addressal time",
  Open: "Pending actions",
  Reopened: "Rejected and reassigned",
  "In Progress": "Awaiting closure",
  Submit: "Queued for closure",
};
// Standard 7-card ticket set used when viewing a Level aggregate (no specific Name picked) -
// there's no single person's saved builder config to load for a whole level, so this mirrors
// the backend's own DEFAULT_TICKET_WIDGETS fallback shape.
const DEFAULT_TICKET_WIDGET_LABELS = {
  total: "Total Tickets",
  open: "Open Tickets",
  reopened: "Reopened Tickets",
  closed: "Closed Tickets",
  pending: "In Progress Tickets",
  overdue: "Overdue Tickets",
  submit: "Submit Tickets",
};
const DEFAULT_TICKET_WIDGETS = Object.keys(DEFAULT_TICKET_WIDGET_LABELS).map((metricKey, index) => ({
  id: `level-ticket-${metricKey}`,
  order: index + 1,
  enabled: true,
  department: "Ticketing",
  sub_department: "",
  input_screen: "Ticket Dashboard",
  input_field: metricKey,
  metric_key: metricKey,
  widget_name: DEFAULT_TICKET_WIDGET_LABELS[metricKey],
  visualization_type: "ticket_status_card",
}));

const ticketMetricCandidates = {
  total: ["total_tickets", "totaltickets", "total", "ticket_count", "tickets", "count"],
  open: ["open_tickets", "opentickets", "open", "open_count", "ticket_count"],
  reopened: ["reopened_tickets", "reopenedtickets", "reopened", "reopened_count", "ticket_count"],
  closed: ["closed_tickets", "closedtickets", "closed", "closed_count", "ticket_count"],
  pending: [
    "pending_tickets", "pendingtickets", "pending", "pending_count",
    "in_progress_tickets", "inprogresstickets", "in_progress", "inprogress", "in_progress_count",
    "ticket_count",
  ],
  overdue: ["overdue_tickets", "overduetickets", "overdue", "overdue_count", "ticket_count"],
  submit: ["submit_tickets", "submittickets", "submit", "submit_count", "submitted_tickets", "ticket_count"],
};

const normalizeMetricKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const resolveTicketMetricGroup = (value, fallback = "total") => {
  const key = normalizeMetricKey(value);
  if (["totaltickets", "total"].includes(key)) return "total";
  if (["open", "opentickets"].includes(key)) return "open";
  if (["reopened", "reopenedtickets"].includes(key)) return "reopened";
  if (["closed", "closedtickets"].includes(key)) return "closed";
  if (["pending", "pendingtickets", "inprogress", "inprogresstickets"].includes(key)) return "pending";
  if (["overdue", "overduetickets"].includes(key)) return "overdue";
  if (["submit", "submittickets", "submitted", "submittedtickets"].includes(key)) return "submit";
  return fallback;
};
const getTicketMetricGroup = (value) => resolveTicketMetricGroup(value, "total");
const getKnownTicketMetricGroup = (value) => resolveTicketMetricGroup(value, null);

const getNumberOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const pickMetricValueFromRecord = (record, candidates) => {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;

  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const value = getNumberOrNull(record[key]);
      if (value !== null) return value;
    }
  }

  const entries = Object.entries(record);
  for (const key of candidates) {
    const normalizedTarget = normalizeMetricKey(key);
    const matched = entries.find(([entryKey]) => normalizeMetricKey(entryKey) === normalizedTarget);
    if (matched) {
      const value = getNumberOrNull(matched[1]);
      if (value !== null) return value;
    }
  }

  return null;
};

const isTicketDashboardRow = (record) => {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;

  const visualizationType = String(record?.visualization_type || "").trim().toLowerCase();
  if (TICKET_VISUALIZATION_TYPES.has(visualizationType)) return true;
  if (getNumberOrNull(record?.ticket_count) !== null) return true;
  if (record?.status_breakdown && typeof record.status_breakdown === "object") return true;

  const inputScreen = String(record?.input_screen || record?.screen_name || "").trim().toLowerCase();
  if (["ticket values", "ticket dashboard"].includes(inputScreen)) return true;

  return getKnownTicketMetricGroup(record?.metric_key || record?.widget_name) !== null;
};

const getTicketMetricValue = (payload, metricField) => {
  if (!isTicketDashboardRow(payload)) return null;

  const group = getTicketMetricGroup(metricField);
  const candidates = ticketMetricCandidates[group] || ticketMetricCandidates.total;
  const sources = [payload, payload?.data, payload?.summary, payload?.metrics, payload?.ticket_summary].filter(Boolean);

  for (const source of sources) {
    const value = pickMetricValueFromRecord(source, candidates);
    if (value !== null) return value;
  }

  return null;
};
const formatDepartmentLabel = (value) =>
  String(value || "").trim().toLowerCase() === "quality control" ? "QC" : String(value || "");

const padDatePart = (value) => String(value).padStart(2, "0");

const formatAxisDate = (date) =>
  `${padDatePart(date.getDate())}-${padDatePart(date.getMonth() + 1)}-${date.getFullYear()}`;

const formatAxisShortDate = (date) =>
  `${padDatePart(date.getDate())}-${padDatePart(date.getMonth() + 1)}`;

const getDateKey = (date) =>
  `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;

const parseAxisDateKey = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";

  const numericMatch = text.match(/(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?/);
  if (numericMatch) {
    const year = Number(numericMatch[3]?.length === 2 ? `20${numericMatch[3]}` : numericMatch[3] || new Date().getFullYear());
    const date = new Date(year, Number(numericMatch[2]) - 1, Number(numericMatch[1]));
    return Number.isNaN(date.getTime()) ? "" : getDateKey(date);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : getDateKey(parsed);
};

const getXAxisTicks = (mode) => {
  const today = new Date();
  const getX = (index, count) =>
    count === 1 ? 50 : LINE_CHART_X_PADDING + (index / Math.max(1, count - 1)) * (100 - LINE_CHART_X_PADDING * 2);

  if (mode === "1D") {
    return [{ label: formatAxisDate(today), dateKey: getDateKey(today), x: 50 }];
  }

  if (mode === "1W") {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - 6 + index);
      const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
      const isToday = getDateKey(date) === getDateKey(today);
      return {
        label: `${isToday ? "Today" : weekday} (${formatAxisShortDate(date)})`,
        dateKey: getDateKey(date),
        weekday: weekday.toLowerCase(),
        x: getX(index, 7),
      };
    });
  }

  if (mode === "1M") {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return [
      { label: formatAxisDate(monthStart), dateKey: getDateKey(monthStart), x: LINE_CHART_X_PADDING },
      { label: formatAxisDate(monthEnd), dateKey: getDateKey(monthEnd), x: 100 - LINE_CHART_X_PADDING },
    ];
  }

  if (mode === "1Y") {
    const yearStart = new Date(today.getFullYear(), 0, 1);
    const yearEnd = new Date(today.getFullYear(), 11, 31);
    return [
      { label: formatAxisDate(yearStart), dateKey: getDateKey(yearStart), x: LINE_CHART_X_PADDING },
      { label: formatAxisDate(yearEnd), dateKey: getDateKey(yearEnd), x: 100 - LINE_CHART_X_PADDING },
    ];
  }

  return [];
};

const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const getTrendPointValue = (point) => {
  const value = Number(point?.value ?? point?.average ?? point?.avg ?? point?.count ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
};

const getTrendPointDateKey = (point) =>
  parseAxisDateKey(point?.date || point?.date_key || point?.day || point?.label);

const getTrendPointMonthIndex = (point) => {
  const numericMonth = Number(point?.month);
  if (Number.isInteger(numericMonth) && numericMonth >= 1 && numericMonth <= 12) return numericMonth - 1;

  const dateKey = getTrendPointDateKey(point);
  if (dateKey) return Number(dateKey.slice(5, 7)) - 1;

  const label = String(point?.label || "").trim().toLowerCase();
  return monthNames.findIndex((month) => label.startsWith(month));
};

const getPointXAxisPosition = ({ point, index, total, ticks, mode }) => {
  if (mode === "1D") return 50;

  if (mode === "1W") {
    const dateKey = parseAxisDateKey(point.label);
    const dateMatchedTick = ticks.find((tick) => tick.dateKey && tick.dateKey === dateKey);
    if (dateMatchedTick) return dateMatchedTick.x;

    const weekdayText = String(point.label || "").slice(0, 3).toLowerCase();
    const weekdayMatchedTick = ticks.find((tick) => tick.weekday === weekdayText);
    if (weekdayMatchedTick) return weekdayMatchedTick.x;

    const todayTick = ticks[ticks.length - 1];
    if (total === 1) return todayTick?.x ?? 50;

    const alignedTickIndex = Math.max(0, ticks.length - total) + index;
    return ticks[Math.min(ticks.length - 1, alignedTickIndex)]?.x ?? todayTick?.x ?? 50;
  }

  return total === 1
    ? 50
    : LINE_CHART_X_PADDING + (index / Math.max(1, total - 1)) * (100 - LINE_CHART_X_PADDING * 2);
};

function HomeDashboard() {
  const user = useSelector((state) => state.auth?.user);
  const fullName = user?.full_name || user?.fullName || user?.name || "User";
  const dashboardOwnerUserId = useMemo(() => getDashboardOwnerUserId(user), [user]);
  const isDashboardAdmin = useMemo(() => isDashboardManagerUser(user), [user]);
  // True admins stay unrestricted; an L1-L5 hierarchy user without that role now also gets the
  // Level/Name filter, but only scoped to levels strictly below their own (an L4 can't browse
  // other L4 peers, an L1 has nothing below them so sees no filter at all).
  const canViewLevelFilter = useMemo(() => canViewDashboardLevelFilter(user), [user]);
  const visibleDashboardLevels = useMemo(() => getDashboardVisibleLevels(user), [user]);

  const [dashboardLevels, setDashboardLevels] = useState([]);
  const [dashboardUsers, setDashboardUsers] = useState([]);
  const [selectedDashboardLevel, setSelectedDashboardLevel] = useState("");
  const [selectedDashboardUserId, setSelectedDashboardUserId] = useState("");
  // The Ticket Dashboard section's date range control - overrides its cards' own 1D/1W/1M/1Y
  // toggle when active, sent to the backend as period=CUSTOM&fromDate=&toDate=.
  const [ticketDateRange, setTicketDateRange] = useState({ preset: "custom", from: "", to: "" });
  // Raw response (trend/status_breakdown/severity_breakdown) from any one Ticket Dashboard
  // card's fetch, used for the Ticket Created trend chart and the two pie charts below it.
  const [ticketSummaryData, setTicketSummaryData] = useState(null);
  const toIsoDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  // Resolves a preset (today/week/month/year) to concrete from/to dates, or null for "custom"
  // (where the user's own From/To fields decide the range instead).
  const resolveDateRangePreset = (preset) => {
    const now = new Date();
    if (preset === "today") {
      const today = toIsoDate(now);
      return { from: today, to: today };
    }
    if (preset === "week") {
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      return { from: toIsoDate(monday), to: toIsoDate(now) };
    }
    if (preset === "month") {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toIsoDate(firstOfMonth), to: toIsoDate(now) };
    }
    if (preset === "year") {
      const firstOfYear = new Date(now.getFullYear(), 0, 1);
      return { from: toIsoDate(firstOfYear), to: toIsoDate(now) };
    }
    return null;
  };
  // Effective {from, to} for a date-range control's current value, or null when it isn't
  // active yet (custom preset with an incomplete From/To pair).
  const getEffectiveDateRange = (rangeValue) => {
    if (rangeValue.preset === "custom") {
      return rangeValue.from && rangeValue.to ? { from: rangeValue.from, to: rangeValue.to } : null;
    }
    return resolveDateRangePreset(rangeValue.preset);
  };
  const ticketEffectiveRange = useMemo(() => getEffectiveDateRange(ticketDateRange), [ticketDateRange]);

  const [widgets, setWidgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isTrendChartExpanded, setIsTrendChartExpanded] = useState(false);
  const [cardModes, setCardModes] = useState({});
  const [widgetData, setWidgetData] = useState({});

  const widgetDataCacheRef = useRef(new Map());
  const debounceTimerRef = useRef(null);
  const inFlightControllersRef = useRef([]);

  const selectedDashboardUserIdNumber = useMemo(() => {
    const id = Number(selectedDashboardUserId);
    return Number.isInteger(id) && id > 0 ? id : null;
  }, [selectedDashboardUserId]);

  // A Level picked with no specific Name aggregates across every user at that level, instead
  // of requiring one person to be chosen - takes priority over activeDashboardUserId below.
  const isDashboardLevelAggregateView = Boolean(
    canViewLevelFilter && selectedDashboardLevel && !selectedDashboardUserIdNumber
  );

  const activeDashboardUserId =
    canViewLevelFilter && selectedDashboardUserIdNumber ? selectedDashboardUserIdNumber : dashboardOwnerUserId;
  const isViewingOwnDashboard =
    !isDashboardLevelAggregateView && (!activeDashboardUserId || activeDashboardUserId === dashboardOwnerUserId);

  const normalizedWidgets = useMemo(
    () =>
      (Array.isArray(widgets) ? widgets : []).flatMap((widget, index) => {
        const sourceWidgetId = widget?.id || `widget-${index + 1}`;
        const rawInputField = String(widget?.input_field || widget?.field_name || "SCI");
        const visualizationType = String(
          widget?.visualization_type || (widget?.chart_type === "value" ? "average_value_card" : "line_chart")
        ).trim().toLowerCase();
        const ticketMetricField = normalizeInputFieldKey(
          widget?.metric_key || widget?.ticket_metric || widget?.input_field || rawInputField
        );

        if (TICKET_VISUALIZATION_TYPES.has(visualizationType)) {
          return [{
            id: sourceWidgetId,
            source_widget_id: sourceWidgetId,
            enabled: parseWidgetEnabled(widget?.enabled),
            order: Number.isInteger(widget?.order) ? widget.order : index + 1,
            department: widget?.department || "Ticketing",
            sub_department: widget?.sub_department || "",
            input_screen: widget?.input_screen || widget?.screen_name || "Ticket Dashboard",
            raw_input_field: widget?.widget_name || widget?.input_field || ticketMetricField,
            input_field: ticketMetricField,
            ticket_metric_field: ticketMetricField,
            visualization_type: visualizationType,
            chart_type: "value",
          }];
        }

        const normalizedRaw = rawInputField.toLowerCase();
        const isTicketValuesWidget =
          String(widget?.department || "").trim().toLowerCase() === "ticketing" &&
          ["ticket values", "ticket dashboard"].includes(String(widget?.screen_name || widget?.input_screen || "").trim().toLowerCase());

        if (isTicketValuesWidget && (normalizedRaw.includes("_|_") || normalizedRaw.includes("|"))) {
          const parts = rawInputField
            .split("_|_")
            .flatMap((part) => part.split("|"))
            .map((part) => String(part || "").trim())
            .filter(Boolean);

          if (parts.length > 1) {
            return parts.map((part, partIndex) => ({
              id: `${sourceWidgetId}-${partIndex + 1}`,
              source_widget_id: sourceWidgetId,
              enabled: parseWidgetEnabled(widget?.enabled),
              order: Number.isInteger(widget?.order) ? widget.order + partIndex : index + 1 + partIndex,
              department: widget?.department || "Quality Control",
              sub_department: widget?.sub_department || "Mixing",
              input_screen: widget?.input_screen || widget?.screen_name || "Cotton HVI Data Entry",
              raw_input_field: part,
              input_field: normalizeInputFieldKey(rawInputField),
              ticket_metric_field: normalizeInputFieldKey(part),
              visualization_type: visualizationType,
              chart_type: widget?.chart_type || visualizationTypeToChartType(widget?.visualization_type),
            }));
          }
        }

        return [{
          id: sourceWidgetId,
          source_widget_id: sourceWidgetId,
          enabled: parseWidgetEnabled(widget?.enabled),
          order: Number.isInteger(widget?.order) ? widget.order : index + 1,
          department: widget?.department || "Quality Control",
          sub_department: widget?.sub_department || "Mixing",
          input_screen: widget?.input_screen || widget?.screen_name || "Cotton HVI Data Entry",
          raw_input_field: rawInputField,
          input_field: normalizeInputFieldKey(rawInputField),
          ticket_metric_field: normalizeInputFieldKey(rawInputField),
          visualization_type: visualizationType,
          chart_type: widget?.chart_type || visualizationTypeToChartType(widget?.visualization_type),
        }];
      }),
    [widgets]
  );

  const isTicketWidget = (widget) => {
    const visualizationType = String(widget?.visualization_type || "").trim().toLowerCase();
    if (TICKET_VISUALIZATION_TYPES.has(visualizationType)) return true;
    return (
      String(widget?.input_field || "").trim().toLowerCase() === "ticket_values" ||
      ["ticket values", "ticket dashboard"].includes(String(widget?.input_screen || "").trim().toLowerCase()) ||
      ["ticket values", "ticket dashboard"].includes(String(widget?.raw_input_field || "").trim().toLowerCase())
    );
  };

  // Average Values / Performance Trends widgets have been removed from the dashboard entirely -
  // only ticket widgets are ever fetched or rendered, regardless of what's still saved in a
  // user's builder config.
  const visibleWidgets = useMemo(
    () => normalizedWidgets.filter((widget) => widget.enabled && isTicketWidget(widget)).sort((a, b) => a.order - b.order),
    [normalizedWidgets]
  );

  // Fixed display order for the ticket cards, independent of whatever order they were
  // originally added to the dashboard in (each widget's stored `order` field) - Total,
  // Closed, Overdue, Open, Reopened, In Progress, Submit.
  const TICKET_CARD_DISPLAY_ORDER = ["total", "closed", "overdue", "open", "reopened", "pending", "submit"];
  const ticketWidgets = useMemo(
    () => visibleWidgets
      .filter((widget) => isTicketWidget(widget))
      .slice()
      .sort((a, b) => {
        const groupA = getTicketMetricGroup(a.ticket_metric_field || a.raw_input_field || a.input_field);
        const groupB = getTicketMetricGroup(b.ticket_metric_field || b.raw_input_field || b.input_field);
        const rankA = TICKET_CARD_DISPLAY_ORDER.indexOf(groupA);
        const rankB = TICKET_CARD_DISPLAY_ORDER.indexOf(groupB);
        return (rankA === -1 ? TICKET_CARD_DISPLAY_ORDER.length : rankA) - (rankB === -1 ? TICKET_CARD_DISPLAY_ORDER.length : rankB);
      }),
    [visibleWidgets]
  );

  useEffect(() => {
    if (!canViewLevelFilter || !visibleDashboardLevels.length) {
      setDashboardLevels([]);
      setDashboardUsers([]);
      setSelectedDashboardLevel("");
      setSelectedDashboardUserId("");
      return;
    }

    let isMounted = true;
    const loadDashboardUserOptions = async () => {
      try {
        const usersResponse = await apiConfig.get("/users", {}, { skipGlobalErrorModal: true });
        if (!isMounted) return;

        const users = (Array.isArray(usersResponse?.data?.users) ? usersResponse.data.users : Array.isArray(usersResponse?.data) ? usersResponse.data : [])
          .map((record) => {
            const id = Number(record?.id || record?.user_id || record?.userId);
            return {
              id: Number.isInteger(id) && id > 0 ? id : null,
              name: String(record?.full_name || record?.name || record?.username || record?.user_name || "").trim(),
              role: String(record?.role_name || record?.role || record?.role_title || "").trim(),
              level: String(record?.level || "").trim().toUpperCase(),
            };
          })
          // Only levels strictly below the logged-in user's own level are ever selectable -
          // matches the backend's own resolveDashboardTargetUserId check, so nothing shown
          // here would actually be rejected when picked.
          .filter((u) => u.id && u.name && !isExcludedRole(u.role) && visibleDashboardLevels.includes(u.level));

        const dedupedUsers = users.filter((u, i, arr) => i === arr.findIndex((x) => x.id === u.id));
        const dedupedLevels = Array.from(new Set(dedupedUsers.map((u) => u.level).filter(Boolean))).sort();
        setDashboardLevels(dedupedLevels);
        setDashboardUsers(dedupedUsers);
        setSelectedDashboardLevel((cur) => (cur && dedupedLevels.includes(cur) ? cur : ""));
      } catch {
        if (!isMounted) return;
        setDashboardLevels([]);
        setDashboardUsers([]);
      }
    };

    loadDashboardUserOptions();
    return () => {
      isMounted = false;
    };
  }, [canViewLevelFilter, visibleDashboardLevels]);

  const dashboardUsersForSelectedLevel = useMemo(() => {
    if (!selectedDashboardLevel) return dashboardUsers;
    return dashboardUsers.filter((u) => u.level === selectedDashboardLevel);
  }, [dashboardUsers, selectedDashboardLevel]);

  useEffect(() => {
    if (!canViewLevelFilter) return;
    setSelectedDashboardUserId((current) => {
      if (current && dashboardUsersForSelectedLevel.some((u) => String(u.id) === String(current))) return current;
      return "";
    });
  }, [canViewLevelFilter, dashboardUsersForSelectedLevel]);

  const selectedDashboardUser = useMemo(
    () => dashboardUsers.find((u) => String(u.id) === String(activeDashboardUserId)),
    [dashboardUsers, activeDashboardUserId]
  );

  useEffect(() => {
    let isMounted = true;

    const loadWidgets = async () => {
      if (isDashboardLevelAggregateView) {
        // A level aggregate has no single person's saved config - always the standard 7-card
        // set, same as the backend's own fallback for it.
        setWidgets(DEFAULT_TICKET_WIDGETS);
        setWidgetData({});
        widgetDataCacheRef.current.clear();
        setErrorMessage("");
        setLoading(false);
        return;
      }
      if (!activeDashboardUserId) {
        setLoading(false);
        setErrorMessage("Unable to identify dashboard user.");
        return;
      }
      try {
        setLoading(true);
        const response = isViewingOwnDashboard
          ? await fetchMyWidgets({ skipGlobalErrorModal: true })
          : await fetchUserWidgets(activeDashboardUserId, { skipGlobalErrorModal: true });
        if (!isMounted) return;
        setWidgets(Array.isArray(response?.data?.widgets) ? response.data.widgets : []);
        setWidgetData({});
        widgetDataCacheRef.current.clear();
        setErrorMessage("");
      } catch (error) {
        if (!isMounted) return;
        const deniedOwnConfig =
          error?.response?.status === 403 &&
          String(error?.response?.data?.message || "").toLowerCase().includes("own dashboard configuration");

        if (deniedOwnConfig && isDashboardAdmin) {
          try {
            const fallbackResponse = await fetchMyWidgets({ skipGlobalErrorModal: true });
            if (!isMounted) return;
            setWidgets(Array.isArray(fallbackResponse?.data?.widgets) ? fallbackResponse.data.widgets : []);
            setWidgetData({});
            widgetDataCacheRef.current.clear();
            setErrorMessage("Selected user dashboard endpoint is restricted by API. Showing admin baseline dashboard.");
            return;
          } catch {
            // fall through to generic error message below
          }
        }

        setWidgets([]);
        setErrorMessage(error?.response?.data?.message || "Unable to load dashboard widgets.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadWidgets();
    return () => {
      isMounted = false;
    };
  }, [activeDashboardUserId, isDashboardAdmin, isViewingOwnDashboard, isDashboardLevelAggregateView]);

  useEffect(() => {
    setCardModes((current) => ticketWidgets.reduce((next, w) => ({ ...next, [w.id]: current[w.id] || "1M" }), {}));
  }, [ticketWidgets]);

  useEffect(() => {
    let isMounted = true;

    const clearInFlightRequests = () => {
      inFlightControllersRef.current.forEach((controller) => {
        try {
          controller.abort();
        } catch {
          // no-op
        }
      });
      inFlightControllersRef.current = [];
    };

    const fetchWidgetData = async () => {
      if (!visibleWidgets.length) {
        if (isMounted) setWidgetData({});
        return;
      }

      const ticketDashboardByPeriod = new Map();
      const dashboardUserParams = isDashboardLevelAggregateView
        ? { level: selectedDashboardLevel }
        : activeDashboardUserId
          ? { user_id: activeDashboardUserId }
          : {};

      const pendingRequests = visibleWidgets.map((widget) => {
        const isTicket = isTicketWidget(widget);
        const sectionRange = ticketEffectiveRange;
        const customDateParams = sectionRange ? { fromDate: sectionRange.from, toDate: sectionRange.to } : null;
        const period = sectionRange ? "CUSTOM" : cardModes[widget.id] || "1M";
        const requestInputField = String(
          isTicket ? (widget.ticket_metric_field || widget.input_field) : widget.input_field
        ).trim();

        const key = [
          widget.department,
          widget.sub_department,
          widget.input_screen,
          requestInputField,
          period,
          customDateParams?.fromDate || "",
          customDateParams?.toDate || "",
        ].join("::");
        const cached = widgetDataCacheRef.current.get(key);
        if (cached) return Promise.resolve({ widgetId: widget.id, key, data: cached, cached: true });

        if (isTicket) {
          const ticketPeriodKey = `ticket::${period}::${customDateParams?.fromDate || ""}::${customDateParams?.toDate || ""}`;
          if (!ticketDashboardByPeriod.has(ticketPeriodKey)) {
            const controller = new AbortController();
            inFlightControllersRef.current.push(controller);
            ticketDashboardByPeriod.set(
              ticketPeriodKey,
              fetchMyDashboard(
                { period, ...customDateParams, ...dashboardUserParams },
                { signal: controller.signal, skipGlobalErrorModal: true }
              )
                .then((response) => (Array.isArray(response?.data?.data) ? response.data.data : []))
                .catch(() => [])
            );
          }

          return ticketDashboardByPeriod.get(ticketPeriodKey).then((rows) => {
            const sourceWidgetId = String(widget.source_widget_id || widget.id || "");
            const byId = rows.find((item) => String(item?.widget_id || "") === sourceWidgetId);
            const metricKey = getKnownTicketMetricGroup(
              widget.ticket_metric_field || widget.raw_input_field || widget.input_field
            );
            const byMetric = metricKey
              ? rows.find(
                (item) =>
                  isTicketDashboardRow(item) &&
                  getKnownTicketMetricGroup(item?.metric_key || item?.input_field || item?.widget_name) === metricKey
              )
              : null;
            return {
              widgetId: widget.id,
              key,
              data: byId || byMetric || null,
            };
          });
        }

        const controller = new AbortController();
        inFlightControllersRef.current.push(controller);

        return fetchBuilderData(
          {
            department: widget.department,
            sub_department: widget.sub_department,
            input_screen: widget.input_screen,
            input_field: requestInputField,
            period,
            ...customDateParams,
            ...dashboardUserParams,
          },
          { signal: controller.signal, skipGlobalErrorModal: true }
        )
          .catch(async (error) => {
            const fallbackInputField = String(
              isTicket
                ? (widget.input_field || widget.raw_input_field || "")
                : (widget.raw_input_field || "")
            ).trim();
            if (!fallbackInputField || fallbackInputField === requestInputField) throw error;
            return fetchBuilderData(
              {
                department: widget.department,
                sub_department: widget.sub_department,
                input_screen: widget.input_screen,
                input_field: fallbackInputField,
                period,
                ...customDateParams,
                ...dashboardUserParams,
              },
              { signal: controller.signal, skipGlobalErrorModal: true }
            );
          })
          .then((response) => ({ widgetId: widget.id, key, data: response?.data || null }))
          .catch(() => ({ widgetId: widget.id, key, data: null }));
      });

      const results = await Promise.all(pendingRequests);
      if (!isMounted) return;

      setWidgetData((current) => {
        const next = { ...current };
        results.forEach((result) => {
          if (!result) return;
          next[result.widgetId] = result.data;
          if (result.data) widgetDataCacheRef.current.set(result.key, result.data);
        });
        return next;
      });

      // status_breakdown/severity_breakdown/trend are computed the same way (scoped only by
      // ticket ownership + the Ticket Dashboard's date range, not by which specific metric card
      // requested them) regardless of which ticket card's response they came from - any one
      // resolved ticket row carries the full picture needed for the trend/status/priority charts.
      const anyTicketRow = results.find((result) => result?.data && isTicketDashboardRow(result.data));
      if (anyTicketRow) setTicketSummaryData(anyTicketRow.data);
      else if (ticketWidgets.length) setTicketSummaryData(null);
    };

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    clearInFlightRequests();
    debounceTimerRef.current = setTimeout(fetchWidgetData, DASHBOARD_FETCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      clearInFlightRequests();
      isMounted = false;
    };
  }, [
    visibleWidgets,
    cardModes,
    isViewingOwnDashboard,
    ticketEffectiveRange,
    activeDashboardUserId,
    isDashboardLevelAggregateView,
    selectedDashboardLevel,
  ]);

  return (
    <div className={styles.dashboardMain}>
      <section className={styles.referenceDashboardHeader}>
        <div className={styles.dashboardWelcomeBlock}>
          <span>Welcome Back, {fullName}</span>
          {canViewLevelFilter ? (
            <p className={styles.dashboardViewingPill}>
              <b>Viewing:</b>
              <span>
                {isDashboardLevelAggregateView
                  ? `All ${selectedDashboardLevel} Users`
                  : selectedDashboardUser?.name || fullName}
              </span>
            </p>
          ) : null}
        </div>
      </section>

      {ticketWidgets.length ? (
        <section className={styles.referenceSection}>
          <h1>Ticket Dashboard</h1>
          <div style={SECTION_CARD_STYLE}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 28 }}>
            <DateRangeControl
              value={ticketDateRange}
              onChange={setTicketDateRange}
              resolvedRange={ticketEffectiveRange}
            />
            {canViewLevelFilter && visibleDashboardLevels.length ? (
              <>
                <label className={styles.ticketFilterLevelName} style={FILTER_FIELD_LABEL_STYLE}>
                  <span>LEVEL</span>
                  <select value={selectedDashboardLevel} onChange={(e) => setSelectedDashboardLevel(e.target.value)} style={FILTER_SELECT_STYLE}>
                    <option value="">Select Level</option>
                    {dashboardLevels.map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.ticketFilterLevelName} style={FILTER_FIELD_LABEL_STYLE}>
                  <span>NAME</span>
                  <select value={selectedDashboardUserId} onChange={(e) => setSelectedDashboardUserId(e.target.value)} style={FILTER_SELECT_STYLE}>
                    <option value="">Select Name</option>
                    {dashboardUsersForSelectedLevel.map((record) => (
                      <option key={record.id} value={record.id}>{record.name}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => window.print()}
              style={{ ...FILTER_SELECT_STYLE, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", minWidth: 0 }}
            >
              <FiPrinter size={14} />
              Print
            </button>
          </div>
          <div className={styles.referenceStatsGrid}>
            {ticketWidgets.map((card) => (
              <article key={card.id} className={styles.referenceStatCard}>
                {(() => {
                  const ticketLabel = getTicketCardLabel(card.raw_input_field || card.ticket_metric_field || card.input_field);
                  const TicketIcon = getTicketCardIcon(ticketLabel);
                  const ticketValue = getTicketMetricValue(
                    widgetData?.[card.id],
                    card.ticket_metric_field || card.raw_input_field || ticketLabel
                  );
                  return (
                    <>
                      <div className={styles.referenceStatHeader}>
                        <div>
                          <h2>{ticketLabel}</h2>
                        </div>
                        <span className={styles.referenceStatIcon} style={getTicketCardAccentStyle(ticketLabel)}><TicketIcon /></span>
                      </div>
                      <div className={styles.referenceStatBottom}>
                        <strong>{formatIntegerValue(ticketValue)}</strong>
                      </div>
                      {TICKET_CARD_DESCRIPTION[ticketLabel] ? (
                        <p className={styles.referenceStatDescription}>{TICKET_CARD_DESCRIPTION[ticketLabel]}</p>
                      ) : null}
                    </>
                  );
                })()}
              </article>
            ))}
          </div>
          </div>

          <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
            <div style={CHART_CARD_STYLE}>
              <ChartCardHeader
                title="Tickets - Trend Chart"
                subtitle="Tickets created over the selected date range"
                onExpand={() => setIsTrendChartExpanded(true)}
              />
              <TicketTrendChart trend={ticketSummaryData?.trend} />
            </div>

            <div style={CHART_CARD_STYLE}>
              <ChartCardHeader title="Tickets - Status Distribution" subtitle="Tickets by current status" />
              <div style={CHART_CARD_BODY_CENTERED_STYLE}>
                <BreakdownPieChart breakdown={ticketSummaryData?.status_breakdown} />
              </div>
            </div>

            <div style={CHART_CARD_STYLE}>
              <ChartCardHeader title="Tickets - Priority Distribution" subtitle="Tickets grouped by priority level" />
              <div style={CHART_CARD_BODY_CENTERED_STYLE}>
                <PriorityBarChart breakdown={ticketSummaryData?.severity_breakdown} />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {loading ? <p>Loading dashboard...</p> : null}
      {!loading && !ticketWidgets.length ? <p>No dashboard widgets configured.</p> : null}
      {errorMessage ? <p>{errorMessage}</p> : null}

      {isTrendChartExpanded ? (
        <div
          onClick={() => setIsTrendChartExpanded(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#ffffff",
              borderRadius: 14,
              padding: 24,
              maxWidth: 900,
              width: "100%",
              boxShadow: "0 20px 50px rgba(15, 23, 42, 0.25)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1f2937", margin: 0 }}>Tickets - Trend Chart</h2>
                <p style={{ fontSize: 13, color: "#94a3b8", margin: "2px 0 0" }}>Tickets created over the selected date range</p>
              </div>
              <button
                type="button"
                onClick={() => setIsTrendChartExpanded(false)}
                aria-label="Close"
                style={{
                  border: "1px solid #dbe1ec",
                  borderRadius: 8,
                  background: "#ffffff",
                  color: "#64748b",
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <FiX size={16} />
              </button>
            </div>
            <TicketTrendChart trend={ticketSummaryData?.trend} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

const PIE_CHART_PALETTE = ["#3d539f", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];
// Semantic colors for known ticket statuses (Status Distribution donut) instead of assigning
// colors purely by whatever order Object.entries() happens to return - e.g. "Closed" landing on
// purple was just an accident of key order, not anything meaningful.
const STATUS_COLOR_MAP = {
  open: "#3d539f",
  "in progress": "#f4b13f",
  overdue: "#ef4444",
  submit: "#06b6d4",
  closed: "#22c55e",
  reopened: "#8b5cf6",
};

// Ticket count grouped by day within the selected date range, as a simple CSS bar chart -
// reuses the same trend array the backend already returns for every ticket card (see
// severity_breakdown/status_breakdown/trend in dashboard.js's fetchWidgetData).
// Line chart with gridlines and axis labels (SVG, viewBox-based so it scales with its
// container) - same trend array the backend already returns for every ticket card.
function TicketTrendChart({ trend }) {
  const points = Array.isArray(trend) ? trend : [];

  if (!points.length) {
    return <div style={{ color: "#94a3b8", fontSize: 13, padding: "12px 0" }}>No data for this range.</div>;
  }

  // "2026-08-18" is too wide to fit next to its neighbors at a readable font size - a short
  // "18 Aug" form takes roughly half the space and still reads unambiguously.
  const formatTrendLabel = (raw) => {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return String(raw ?? "");
    return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  };

  const values = points.map((point) => Number(point.value) || 0);
  const axisMax = Math.max(1, Math.ceil(Math.max(...values)));
  // A tick per integer (0,1,2,...axisMax) reads fine for small counts but overlaps into an
  // unreadable stack once axisMax gets into the dozens - always show a handful of evenly
  // spaced ticks instead, regardless of how large the range's peak value is.
  const Y_TICK_COUNT = 4;
  const yTicks = Array.from({ length: Y_TICK_COUNT + 1 }, (_, i) => Math.round((axisMax * (Y_TICK_COUNT - i)) / Y_TICK_COUNT));

  const chartSize = 100;
  const padding = 4;
  const xStep = points.length > 1 ? (chartSize - padding * 2) / (points.length - 1) : 0;
  const coords = points.map((point, index) => ({
    x: padding + index * xStep,
    y: chartSize - padding - ((Number(point.value) || 0) / axisMax) * (chartSize - padding * 2),
    label: formatTrendLabel(point.label),
    rawLabel: point.label,
    value: point.value,
  }));
  const linePath = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const areaPath = `${padding},${chartSize - padding} ${linePath} ${chartSize - padding},${chartSize - padding}`;

  const chartHeightPx = 180;
  const yAxisWidthPx = 22;
  // Every date gets its own fixed pixel width and its own visible label now, instead of
  // squeezing the whole range into the card's width and hiding most labels to avoid overlap -
  // the chart scrolls horizontally (y-axis stays fixed on the left) so a long range stays
  // readable instead of compressed. Wide enough for the "18 Aug" label to never need to
  // shrink below its own column and spill into its neighbor's.
  const pointWidthPx = 56;
  const chartWidthPx = Math.max(320, points.length * pointWidthPx);

  return (
    <div style={{ padding: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {/* Absolutely-positioned labels inside a fixed-height box, rather than a flex sibling
            of the SVG - a flex column here relies on the SVG's rendered height matching this
            box's height exactly, and any mismatch (e.g. the SVG shrinking to fit a narrow
            card) pushed this column below the chart instead of beside it. */}
        <div style={{ position: "relative", width: yAxisWidthPx, height: chartHeightPx, flexShrink: 0 }}>
          {yTicks.map((tick) => (
            <span
              key={tick}
              style={{
                position: "absolute",
                top: `${(1 - tick / axisMax) * 100}%`,
                right: 6,
                transform: "translateY(-50%)",
                fontSize: 10,
                color: "#94a3b8",
              }}
            >
              {tick}
            </span>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0, overflowX: "auto", overflowY: "hidden" }}>
          <div style={{ width: chartWidthPx }}>
            <div style={{ width: chartWidthPx, height: chartHeightPx, position: "relative" }}>
            <svg viewBox={`0 0 ${chartSize} ${chartSize}`} preserveAspectRatio="none" style={{ width: chartWidthPx, height: chartHeightPx, display: "block" }}>
              {yTicks.map((tick) => {
                const y = chartSize - padding - (tick / axisMax) * (chartSize - padding * 2);
                return <line key={tick} x1={padding} x2={chartSize - padding} y1={y} y2={y} stroke="#eef1f6" strokeWidth="0.5" />;
              })}
              <polygon points={areaPath} fill="#3d539f1a" stroke="none" />
              <polyline
                points={linePath}
                fill="none"
                stroke="#3d539f"
                strokeWidth="1.2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {/* Rendered as separate fixed-size HTML dots instead of SVG <circle> elements - the
                chart's width/height ratio doesn't match its square viewBox (preserveAspectRatio
                is "none" so the chart can stretch to any card width), which squashes SVG
                circles into ellipses. A real circle here stays perfectly round and crisp,
                positioned by percentage so it still lines up exactly with the stretched line. */}
            {coords.map((c, index) => (
              <div
                key={index}
                title={`${c.rawLabel}: ${c.value}`}
                style={{
                  position: "absolute",
                  left: `${(c.x / chartSize) * 100}%`,
                  top: `${(c.y / chartSize) * 100}%`,
                  width: 7,
                  height: 7,
                  marginLeft: -3.5,
                  marginTop: -3.5,
                  borderRadius: "50%",
                  background: "#3d539f",
                  border: "1.5px solid #ffffff",
                  boxShadow: "0 0 0 1px #3d539f",
                }}
              />
            ))}
            </div>
            <div style={{ display: "flex", fontSize: 11, color: "#64748b", marginTop: 6 }}>
              {coords.map((c, index) => (
                <span
                  key={index}
                  style={{ flex: `0 0 ${pointWidthPx}px`, width: pointWidthPx, textAlign: "center", whiteSpace: "nowrap" }}
                >
                  {c.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Horizontal bar chart for the Priority Distribution panel (High/Medium/Low severity), with a
// "Total Tickets" bar prepended so the individual priority bars read against the whole count
// instead of only against each other.
function PriorityBarChart({ breakdown }) {
  const PRIORITY_ORDER = ["High", "Medium", "Low"];
  const PRIORITY_COLORS = { High: "#f97316", Medium: "#f4b13f", Low: "#3d539f" };
  const entries = Object.entries(breakdown || {}).filter(([, count]) => Number(count) > 0);

  if (!entries.length) {
    return <div style={{ color: "#94a3b8", fontSize: 13, padding: "12px 0" }}>No data for this range.</div>;
  }

  const sorted = entries.slice().sort((a, b) => {
    const rankA = PRIORITY_ORDER.indexOf(a[0]);
    const rankB = PRIORITY_ORDER.indexOf(b[0]);
    return (rankA === -1 ? PRIORITY_ORDER.length : rankA) - (rankB === -1 ? PRIORITY_ORDER.length : rankB);
  });
  const total = sorted.reduce((sum, [, count]) => sum + Number(count), 0);
  const rows = [["Total Tickets", total], ...sorted];
  const max = Math.max(...rows.map(([, count]) => Number(count)), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 0", width: "100%", maxWidth: 320 }}>
      {rows.map(([label, count]) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 84, fontSize: 12, color: "#334155", fontWeight: 600, flexShrink: 0, textAlign: "right" }}>{label}</span>
          <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 4, height: 22, position: "relative" }}>
            <div
              style={{
                width: `${(Number(count) / max) * 100}%`,
                background: label === "Total Tickets" ? "#64748b" : PRIORITY_COLORS[label] || "#94a3b8",
                height: "100%",
                borderRadius: 4,
                minWidth: 4,
              }}
            />
          </div>
          <span style={{ width: 28, fontSize: 12, color: "#64748b", fontWeight: 600 }}>{count}</span>
        </div>
      ))}
    </div>
  );
}

// Renders a {label: count} breakdown (status or severity) as a CSS conic-gradient ring - a
// white center hole shows the overall total, and each segment's percentage is placed directly
// on the ring band itself (in addition to the legend on the right) - no charting library
// needed for this shape.
function BreakdownPieChart({ breakdown, size = "normal" }) {
  const entries = Object.entries(breakdown || {}).filter(([, count]) => Number(count) > 0);
  const total = entries.reduce((sum, [, count]) => sum + Number(count), 0);

  if (!entries.length || total <= 0) {
    return <div style={{ color: "#94a3b8", fontSize: 13, padding: "12px 0" }}>No data for this range.</div>;
  }

  let cursor = 0;
  let unmappedIndex = 0;
  const segments = entries.map(([label, count]) => {
    const pct = (Number(count) / total) * 100;
    const start = cursor;
    cursor += pct;
    const color = STATUS_COLOR_MAP[label.trim().toLowerCase()] || PIE_CHART_PALETTE[unmappedIndex++ % PIE_CHART_PALETTE.length];
    return { label, count: Number(count), pct, start, end: cursor, color };
  });
  const gradient = `conic-gradient(${segments.map((seg) => `${seg.color} ${seg.start}% ${seg.end}%`).join(", ")})`;

  const isLarge = size === "large";
  const outerSize = isLarge ? 240 : 140;
  const holeSize = isLarge ? 144 : 84;
  const outerRadius = outerSize / 2;
  const labelRadius = (outerRadius + holeSize / 2) / 2;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: isLarge ? 40 : 24, flexWrap: "wrap", padding: "8px 0" }}>
      <div style={{ position: "relative", width: outerSize, height: outerSize, flexShrink: 0 }}>
        <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: gradient }} />
        {segments.map((seg) => {
          const midAngleDeg = ((seg.start + seg.end) / 2 / 100) * 360;
          const midAngleRad = (midAngleDeg * Math.PI) / 180;
          const x = outerRadius + labelRadius * Math.sin(midAngleRad);
          const y = outerRadius - labelRadius * Math.cos(midAngleRad);
          return (
            <span
              key={seg.label}
              style={{
                position: "absolute",
                left: x,
                top: y,
                transform: "translate(-50%, -50%)",
                fontSize: isLarge ? 14 : 10,
                fontWeight: 700,
                color: "#ffffff",
                textShadow: "0 1px 2px rgba(15, 23, 42, 0.45)",
                pointerEvents: "none",
              }}
            >
              {seg.pct.toFixed(0)}%
            </span>
          );
        })}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: holeSize,
            height: holeSize,
            borderRadius: "50%",
            background: "#ffffff",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <strong style={{ fontSize: isLarge ? 36 : 22, color: "#1f2937", lineHeight: 1 }}>{total}</strong>
          <span style={{ fontSize: isLarge ? 13 : 11, color: "#94a3b8", marginTop: 2 }}>Total</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: isLarge ? 12 : 8 }}>
        {segments.map((seg) => (
          <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: isLarge ? 15 : 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, display: "inline-block", flexShrink: 0 }} />
            <span style={{ color: "#334155", fontWeight: 600, minWidth: isLarge ? 110 : 84 }}>{seg.label}</span>
            <span style={{ color: "#64748b", minWidth: 32, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartCardHeader({ title, subtitle, onExpand }) {
  return (
    <div style={{ marginBottom: 4, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
      <div>
        <h2 style={CHART_CARD_TITLE_STYLE}>{title}</h2>
        <p style={CHART_CARD_SUBTITLE_STYLE}>{subtitle}</p>
      </div>
      {onExpand ? (
        <button
          type="button"
          onClick={onExpand}
          aria-label={`Expand ${title}`}
          style={{
            border: "1px solid #dbe1ec",
            borderRadius: 8,
            background: "#ffffff",
            color: "#64748b",
            width: 28,
            height: 28,
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <FiMaximize2 size={14} />
        </button>
      ) : null}
    </div>
  );
}

function DateRangeControl({ value, onChange, resolvedRange }) {
  const fromRef = useRef(null);
  const toRef = useRef(null);
  const openPicker = (ref) => {
    try {
      ref.current?.showPicker?.();
    } catch {
      ref.current?.focus();
    }
  };
  const isCustom = value.preset === "custom";
  const displayFrom = isCustom ? value.from : (resolvedRange?.from || "");
  const displayTo = isCustom ? value.to : (resolvedRange?.to || "");
  const dateInputStyle = (disabled) => ({
    ...FILTER_SELECT_STYLE,
    background: disabled ? "#f8fafc" : "#ffffff",
    color: "#425066",
    padding: "0 30px 0 8px",
    fontWeight: 400,
    colorScheme: "light",
    cursor: disabled ? "not-allowed" : "text",
  });

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label style={FILTER_FIELD_LABEL_STYLE}>
        <span>DATE RANGE</span>
        <select
          value={value.preset}
          onChange={(e) => onChange({ ...value, preset: e.target.value })}
          style={FILTER_SELECT_STYLE}
        >
          <option value="custom">Custom</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
      </label>
      <label style={FILTER_FIELD_LABEL_STYLE}>
        <span>FROM</span>
        <div style={{ position: "relative", display: "flex" }}>
          <input
            ref={fromRef}
            type="date"
            value={displayFrom}
            max={displayTo || undefined}
            disabled={!isCustom}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            onKeyDown={(e) => e.preventDefault()}
            style={dateInputStyle(!isCustom)}
          />
          <FiCalendar
            onClick={() => isCustom && openPicker(fromRef)}
            style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: isCustom ? "#64748b" : "#c3cbd6", cursor: isCustom ? "pointer" : "not-allowed" }}
          />
        </div>
      </label>
      <label style={FILTER_FIELD_LABEL_STYLE}>
        <span>TO</span>
        <div style={{ position: "relative", display: "flex" }}>
          <input
            ref={toRef}
            type="date"
            value={displayTo}
            min={displayFrom || undefined}
            disabled={!isCustom}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            onKeyDown={(e) => e.preventDefault()}
            style={dateInputStyle(!isCustom)}
          />
          <FiCalendar
            onClick={() => isCustom && openPicker(toRef)}
            style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: isCustom ? "#64748b" : "#c3cbd6", cursor: isCustom ? "pointer" : "not-allowed" }}
          />
        </div>
      </label>
    </div>
  );
}

export default HomeDashboard;

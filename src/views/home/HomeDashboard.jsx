import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { FiPieChart } from "react-icons/fi";
import { MdOutlineConfirmationNumber, MdOutlinePendingActions, MdOutlineReplay } from "react-icons/md";
import { IoCheckmarkDoneCircleOutline } from "react-icons/io5";
import { AiOutlineFolderOpen } from "react-icons/ai";

import apiConfig from "@/apis/apiConfig";
import { fetchBuilderData, fetchMyDashboard, fetchMyWidgets, fetchUserWidgets } from "@/apis/dashboardBuilderApi";
import styles from "@/styles/departmentDirectory.module.css";
import { isDashboardManagerUser } from "@/utils/accessControl";
import { getDashboardOwnerUserId } from "@/utils/dashboardOwner";

const DASHBOARD_SELECTION_STORAGE_KEY = "spintelligenceDashboardSelection";

const trendModes = ["1D", "1W", "1M", "1Y"];
const TICKET_VISUALIZATION_TYPES = new Set(["ticket_status_card", "individual_ticket_count", "add_ticket_count"]);
const modeMultipliers = { "1D": 0.72, "1W": 0.9, "1M": 1, "1Y": 1.18 };
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

const formatValue = (value, mode) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return (n * (modeMultipliers[mode] || 1)).toFixed(2);
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
  if (key === "pending" || key === "pendingtickets") return "Pending";
  if (key === "overdue" || key === "overduetickets") return "Overdue";
  return "Ticket Dashboard";
};
const getTicketCardIcon = (label) => {
  if (label === "Total Tickets") return MdOutlineConfirmationNumber;
  if (label === "Open") return AiOutlineFolderOpen;
  if (label === "Reopened") return MdOutlineReplay;
  if (label === "Closed") return IoCheckmarkDoneCircleOutline;
  if (label === "Pending") return MdOutlinePendingActions;
  return FiPieChart;
};
const ticketMetricCandidates = {
  total: ["total_tickets", "totaltickets", "total", "ticket_count", "tickets", "count"],
  open: ["open_tickets", "opentickets", "open", "open_count", "ticket_count"],
  reopened: ["reopened_tickets", "reopenedtickets", "reopened", "reopened_count", "ticket_count"],
  closed: ["closed_tickets", "closedtickets", "closed", "closed_count", "ticket_count"],
  pending: ["pending_tickets", "pendingtickets", "pending", "pending_count", "ticket_count"],
  overdue: ["overdue_tickets", "overduetickets", "overdue", "overdue_count", "ticket_count"],
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
  if (["pending", "pendingtickets"].includes(key)) return "pending";
  if (["overdue", "overduetickets"].includes(key)) return "overdue";
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
const formatCardContextLabel = (department, subDepartment, inputScreen) => {
  const isMixing = String(subDepartment || "").trim().toLowerCase() === "mixing";
  const cleanedInputScreen = isMixing
    ? String(inputScreen || "").replace(/\bdata\s*entry\b/gi, "").trim()
    : String(inputScreen || "").trim();

  return `${formatDepartmentLabel(department)} | ${subDepartment} | ${cleanedInputScreen}`.replace(/\s+\|\s*$/, "");
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

  const [dashboardRoles, setDashboardRoles] = useState([]);
  const [dashboardUsers, setDashboardUsers] = useState([]);
  const [selectedDashboardRole, setSelectedDashboardRole] = useState("");
  const [selectedDashboardUserId, setSelectedDashboardUserId] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(DASHBOARD_SELECTION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.role) setSelectedDashboardRole(parsed.role);
        if (parsed?.userId) setSelectedDashboardUserId(String(parsed.userId));
      }
    } catch {
      // ignore invalid storage
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = {
      role: selectedDashboardRole || undefined,
      userId: selectedDashboardUserId || undefined,
    };
    window.localStorage.setItem(DASHBOARD_SELECTION_STORAGE_KEY, JSON.stringify(payload));
  }, [selectedDashboardRole, selectedDashboardUserId]);

  const [widgets, setWidgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [cardModes, setCardModes] = useState({});
  const [trendModesById, setTrendModesById] = useState({});
  const [widgetData, setWidgetData] = useState({});

  const widgetDataCacheRef = useRef(new Map());
  const debounceTimerRef = useRef(null);
  const inFlightControllersRef = useRef([]);

  const selectedDashboardUserIdNumber = useMemo(() => {
    const id = Number(selectedDashboardUserId);
    return Number.isInteger(id) && id > 0 ? id : null;
  }, [selectedDashboardUserId]);

  const activeDashboardUserId =
    isDashboardAdmin && selectedDashboardUserIdNumber ? selectedDashboardUserIdNumber : dashboardOwnerUserId;
  const isViewingOwnDashboard = !activeDashboardUserId || activeDashboardUserId === dashboardOwnerUserId;

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

  const visibleWidgets = useMemo(
    () => normalizedWidgets.filter((widget) => widget.enabled).sort((a, b) => a.order - b.order),
    [normalizedWidgets]
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

  const ticketWidgets = useMemo(
    () => visibleWidgets.filter((widget) => isTicketWidget(widget)),
    [visibleWidgets]
  );

  const averageWidgets = useMemo(
    () => visibleWidgets.filter((widget) => !isTicketWidget(widget) && (widget.visualization_type === "average_value_card" || widget.chart_type === "value")),
    [visibleWidgets]
  );

  const performanceWidgets = useMemo(
    () => visibleWidgets.filter((widget) => !isTicketWidget(widget) && !(widget.visualization_type === "average_value_card" || widget.chart_type === "value")),
    [visibleWidgets]
  );

  useEffect(() => {
    if (!isDashboardAdmin) {
      setDashboardRoles([]);
      setDashboardUsers([]);
      setSelectedDashboardRole("");
      setSelectedDashboardUserId("");
      return;
    }

    let isMounted = true;
    const loadDashboardUserOptions = async () => {
      try {
        const [rolesResponse, usersResponse] = await Promise.all([
          apiConfig.get("/roles", { page: 1, limit: 200 }, { skipGlobalErrorModal: true }),
          apiConfig.get("/users", {}, { skipGlobalErrorModal: true }),
        ]);

        if (!isMounted) return;

        const roles = (Array.isArray(rolesResponse?.data?.roles) ? rolesResponse.data.roles : Array.isArray(rolesResponse?.data) ? rolesResponse.data : [])
          .map((r) => String(r?.role_name || r?.name || r?.role || "").trim())
          .filter((role) => role && !isExcludedRole(role));

        const allowed = new Set(roles);
        const users = (Array.isArray(usersResponse?.data?.users) ? usersResponse.data.users : Array.isArray(usersResponse?.data) ? usersResponse.data : [])
          .map((record) => {
            const id = Number(record?.id || record?.user_id || record?.userId);
            return {
              id: Number.isInteger(id) && id > 0 ? id : null,
              name: String(record?.full_name || record?.name || record?.username || record?.user_name || "").trim(),
              role: String(record?.role_name || record?.role || record?.role_title || "").trim(),
            };
          })
          .filter((u) => u.id && u.name && (!u.role || allowed.has(u.role)));

        const dedupedRoles = Array.from(new Set(roles));
        const dedupedUsers = users.filter((u, i, arr) => i === arr.findIndex((x) => x.id === u.id));
        setDashboardRoles(dedupedRoles);
        setDashboardUsers(dedupedUsers);
        setSelectedDashboardRole((cur) => (cur && dedupedRoles.includes(cur) ? cur : dedupedRoles[0] || ""));
      } catch {
        if (!isMounted) return;
        setDashboardRoles([]);
        setDashboardUsers([]);
      }
    };

    loadDashboardUserOptions();
    return () => {
      isMounted = false;
    };
  }, [isDashboardAdmin]);

  const dashboardUsersForSelectedRole = useMemo(() => {
    if (!selectedDashboardRole) return dashboardUsers;
    const roleMatchedUsers = dashboardUsers.filter((u) => u.role === selectedDashboardRole);
    return roleMatchedUsers.length ? roleMatchedUsers : dashboardUsers;
  }, [dashboardUsers, selectedDashboardRole]);

  useEffect(() => {
    if (!isDashboardAdmin) return;
    setSelectedDashboardUserId((current) => {
      if (current && dashboardUsersForSelectedRole.some((u) => String(u.id) === String(current))) return current;
      if (dashboardOwnerUserId && dashboardUsersForSelectedRole.some((u) => u.id === dashboardOwnerUserId)) return String(dashboardOwnerUserId);
      return dashboardUsersForSelectedRole[0]?.id ? String(dashboardUsersForSelectedRole[0].id) : "";
    });
  }, [isDashboardAdmin, dashboardOwnerUserId, dashboardUsersForSelectedRole]);

  const selectedDashboardUser = useMemo(
    () => dashboardUsers.find((u) => String(u.id) === String(activeDashboardUserId)),
    [dashboardUsers, activeDashboardUserId]
  );

  useEffect(() => {
    let isMounted = true;

    const loadWidgets = async () => {
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
  }, [activeDashboardUserId, isDashboardAdmin, isViewingOwnDashboard]);

  useEffect(() => {
    setCardModes((current) => [...averageWidgets, ...ticketWidgets].reduce((next, w) => ({ ...next, [w.id]: current[w.id] || "1M" }), {}));
    setTrendModesById((current) => performanceWidgets.reduce((next, w) => ({ ...next, [w.id]: current[w.id] || "1M" }), {}));
  }, [averageWidgets, ticketWidgets, performanceWidgets]);

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

      const pendingRequests = visibleWidgets.map((widget) => {
        const isTicket = isTicketWidget(widget);
        const period = isTicket || widget.visualization_type === "average_value_card" || widget.chart_type === "value"
          ? cardModes[widget.id] || "1M"
          : trendModesById[widget.id] || "1M";
        const requestInputField = String(
          isTicket ? (widget.ticket_metric_field || widget.input_field) : widget.input_field
        ).trim();

        const key = [widget.department, widget.sub_department, widget.input_screen, requestInputField, period].join("::");
        const cached = widgetDataCacheRef.current.get(key);
        if (cached) return Promise.resolve({ widgetId: widget.id, key, data: cached, cached: true });

        if (isTicket) {
          if (!isViewingOwnDashboard) {
            return Promise.resolve({ widgetId: widget.id, key, data: null });
          }

          const ticketPeriodKey = `ticket::${period}`;
          if (!ticketDashboardByPeriod.has(ticketPeriodKey)) {
            const controller = new AbortController();
            inFlightControllersRef.current.push(controller);
            ticketDashboardByPeriod.set(
              ticketPeriodKey,
              fetchMyDashboard(
                { period },
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
  }, [visibleWidgets, cardModes, trendModesById, isViewingOwnDashboard]);

  return (
    <div className={styles.dashboardMain}>
      <section className={styles.referenceDashboardHeader}>
        <div className={styles.dashboardWelcomeBlock}>
          <span>Welcome Back, {fullName}</span>
          {isDashboardAdmin ? (
            <p className={styles.dashboardViewingPill}>
              <b>Viewing:</b>
              <span>{selectedDashboardUser?.name || fullName}</span>
            </p>
          ) : null}
        </div>
        {isDashboardAdmin ? (
          <div className={styles.dashboardUserControls}>
            <label>
              <span>Role</span>
              <select value={selectedDashboardRole} onChange={(e) => setSelectedDashboardRole(e.target.value)}>
                {dashboardRoles.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Name</span>
              <select value={selectedDashboardUserId} onChange={(e) => setSelectedDashboardUserId(e.target.value)}>
                {dashboardUsersForSelectedRole.map((record) => (
                  <option key={record.id} value={record.id}>{record.name}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </section>

      {ticketWidgets.length ? (
        <section className={styles.referenceSection}>
          <h1>Ticket Dashboard</h1>
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
                        <span className={styles.referenceStatIcon}><TicketIcon /></span>
                      </div>
                      <div className={styles.referenceStatBottom}>
                        <strong>{formatIntegerValue(ticketValue)}</strong>
                        <div className={styles.referenceMiniToggle}>
                          {trendModes.map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              className={cardModes[card.id] === mode ? styles.referenceMiniToggleActive : ""}
                              onClick={() => setCardModes((current) => ({ ...current, [card.id]: mode }))}
                            >
                              {mode}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.referenceSection}>
        <h1>Average Values</h1>
        <div className={styles.referenceStatsGrid}>
          {averageWidgets.map((card) => (
            <article key={card.id} className={styles.referenceStatCard}>
              <div className={styles.referenceStatHeader}>
                <div>
                  <h2>{card.raw_input_field || card.input_field || "Metric"}</h2>
                  <span>{formatCardContextLabel(card.department, card.sub_department, card.input_screen)}</span>
                </div>
                <span className={styles.referenceStatIcon}><FiPieChart /></span>
              </div>
              <div className={styles.referenceStatBottom}>
                <strong>{formatValue(widgetData?.[card.id]?.average_value, cardModes[card.id])}</strong>
                <div className={styles.referenceMiniToggle}>
                  {trendModes.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={cardModes[card.id] === mode ? styles.referenceMiniToggleActive : ""}
                      onClick={() => setCardModes((current) => ({ ...current, [card.id]: mode }))}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.referenceSection}>
        <h1>Performance Trends</h1>
        {performanceWidgets.map((widget) => (
          <PerformanceLineCard
            key={widget.id}
            widget={widget}
            data={widgetData?.[widget.id]}
            activeMode={trendModesById[widget.id] || "1M"}
            setActiveMode={(nextMode) => setTrendModesById((current) => ({ ...current, [widget.id]: nextMode }))}
          />
        ))}
      </section>

      {loading ? <p>Loading dashboard...</p> : null}
      {!loading && !averageWidgets.length && !performanceWidgets.length && !ticketWidgets.length ? <p>No dashboard widgets configured.</p> : null}
      {errorMessage ? <p>{errorMessage}</p> : null}
    </div>
  );
}

function PerformanceLineCard({ widget, data, activeMode, setActiveMode }) {
  const xAxisTicks = useMemo(() => getXAxisTicks(activeMode), [activeMode]);
  const baseTrendPoints = useMemo(() => {
    const source = Array.isArray(data?.trend_points)
      ? data.trend_points
      : Array.isArray(data?.trend)
        ? data.trend
        : Array.isArray(data?.points)
          ? data.points
          : [];

    return source
      .map((point, index) => {
        const rawValue = Number(point?.value ?? point?.y ?? point?.average ?? point?.avg);
        return {
          label: String(point?.label ?? point?.date ?? point?.x ?? `P${index + 1}`),
          value: Number.isFinite(rawValue) ? rawValue : 0,
        };
      })
      .filter((point) => point.label);
  }, [data]);

  const currentLinePoints = useMemo(() => {
    if (activeMode === "1M") {
      const today = new Date();
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const valuesByDate = new Map(
        baseTrendPoints
          .map((point) => [getTrendPointDateKey(point), getTrendPointValue(point)])
          .filter(([dateKey]) => dateKey)
      );
      const source = baseTrendPoints.slice(-daysInMonth);

      return Array.from({ length: daysInMonth }, (_, index) => {
        const date = new Date(today.getFullYear(), today.getMonth(), index + 1);
        const dateKey = getDateKey(date);
        const sourcePoint = source[index];
        const value = valuesByDate.has(dateKey)
          ? valuesByDate.get(dateKey)
          : sourcePoint
            ? getTrendPointValue(sourcePoint)
            : 0;
        return {
          label: formatDayLabel(date),
          value,
        };
      });
    }

    if (activeMode === "1Y") {
      const now = new Date();
      const valuesByMonth = new Map(
        baseTrendPoints
          .map((point) => [getTrendPointMonthIndex(point), getTrendPointValue(point)])
          .filter(([monthIndex]) => monthIndex >= 0)
      );
      const source = baseTrendPoints.slice(-12);

      return Array.from({ length: 12 }, (_, index) => {
        const date = new Date(now.getFullYear(), index, 1);
        const sourcePoint = source[index];
        const value = valuesByMonth.has(index)
          ? valuesByMonth.get(index)
          : sourcePoint
            ? getTrendPointValue(sourcePoint)
            : 0;
        return {
          label: formatMonthLabel(date),
          value,
        };
      });
    }

    const points = baseTrendPoints.length ? baseTrendPoints : [{ label: "No Data", value: 0 }];
    return points.map((point) => ({
      label: point.label,
      value: getTrendPointValue(point),
    }));
  }, [activeMode, baseTrendPoints]);

  const lineChartPoints = useMemo(() => {
    const yPadding = 8;
    const height = 100 - yPadding * 2;
    const max = Math.max(...currentLinePoints.map((point) => point.value), 100);

    return currentLinePoints.map((point, index) => {
      const x = getPointXAxisPosition({
        point,
        index,
        total: currentLinePoints.length,
        ticks: xAxisTicks,
        mode: activeMode,
      });
      const y = yPadding + height - (point.value / max) * height;
      return { ...point, x, y };
    }).sort((left, right) => left.x - right.x);
  }, [activeMode, currentLinePoints, xAxisTicks]);

  const linePolyline = useMemo(() => lineChartPoints.map((point) => `${point.x},${point.y}`).join(" "), [lineChartPoints]);
  const lineArea = `${lineChartPoints[0]?.x || 0},100 ${linePolyline} ${lineChartPoints[lineChartPoints.length - 1]?.x || 100},100`;

  return (
    <article className={`${styles.referenceChartCard} ${styles.referenceLineCard}`}>
      <div className={styles.referenceChartHeader}>
        <div>
          <h2>{widget?.raw_input_field || widget?.input_field || "Metric"}</h2>
          <span>{`${formatDepartmentLabel(widget?.department)} | ${widget?.sub_department || ""} | ${widget?.input_screen || ""}`}</span>
        </div>
        <div className={styles.referenceLineHeaderRight}>
          <span className={styles.referenceLegend}><i /> Trend</span>
          <ModeToggle activeMode={activeMode} setActiveMode={setActiveMode} />
        </div>
      </div>

      <div className={styles.referenceLineChart}>
        <div className={styles.referenceYAxis}>
          <span>100%</span>
          <span>75%</span>
          <span>50%</span>
          <span>25%</span>
          <span>0%</span>
        </div>
        <div className={styles.referenceLinePlot}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polygon points={lineArea} />
            <polyline points={linePolyline} />
          </svg>
          {lineChartPoints.map((point, idx) => (
            <span
              key={`${point.label}-${idx}`}
              className={styles.referenceLinePoint}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
            />
          ))}
        </div>
        <div className={styles.referenceXAxis}>
          {xAxisTicks.map((tick, idx) => (
            <span key={`${tick.label}-${idx}`} style={{ left: `${tick.x}%` }}>{tick.label || "-"}</span>
          ))}
        </div>
      </div>
    </article>
  );
}

function ModeToggle({ activeMode, setActiveMode }) {
  return (
    <div className={styles.referenceModeToggle}>
      {trendModes.map((mode) => (
        <button
          key={mode}
          type="button"
          className={activeMode === mode ? styles.referenceModeToggleActive : ""}
          onClick={() => setActiveMode(mode)}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}

export default HomeDashboard;

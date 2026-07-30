import { useState, useEffect, useRef } from "react";
import styles from "../../styles/supervisordashboard.module.css";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { fetchSupervisorTickets } from "../../store/slices/supervisorSlice";
import Pagination from "@/components/Pagination";
import { FiCalendar, FiX } from "react-icons/fi";
import { MdFilterList } from "react-icons/md";
import { getProcessParameterTickets, fetchL2ApprovalQueueApi } from "../../apis/operatorApi";
import {
  applyStoredTicketStatuses,
  getStatusClassKey,
  getSupervisorStatusLabel,
  isSupervisorVisibleTicket,
  SUPERVISOR_VISIBLE_STATUS_OPTIONS,
} from "../../utils/ticketStatus";
import {
  isFullAccessUser,
} from "../../utils/accessControl";
import {
  isNotebookAcknowledgementTicketRecord as isAcknowledgementReviewTicket,
  isPpBatchCompletionTicketRecord,
  isSubmissionTicketRecord,
  isWheelChangeApprovalTicketRecord,
  transformTicket,
  getTicketKind,
  TICKET_KIND,
} from "../../utils/ticketTransformer";
import { formatDateTime } from "../../utils/formatDateTime";

const ITEMS_PER_PAGE = 6;
const formatDateDisplay = (value) => {
  if (!value) return "";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}-${month}-${year}` : String(value);
};

const parseMaybeJson = (value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || !["{", "["].includes(trimmed[0])) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const firstText = (...values) => {
  for (const value of values) {
    const parsed = parseMaybeJson(value);

    if (Array.isArray(parsed)) {
      const nested = firstText(...parsed);
      if (nested) return nested;
      continue;
    }

    if (parsed && typeof parsed === "object") {
      const nested = firstText(
        parsed.full_name,
        parsed.fullName,
        parsed.name,
        parsed.user_name,
        parsed.userName,
        parsed.employee_name,
        parsed.employeeName,
        parsed.employee_id,
        parsed.employeeId,
        parsed.id
      );
      if (nested) return nested;
      continue;
    }

    const text = String(parsed ?? "").trim();
    if (text) return text;
  }

  return "";
};

const getReviewL2 = (ticket) =>
  firstText(
    ticket?.l2_approvers,
    ticket?.l2Approvers,
    ticket?.approval_l2_name,
    ticket?.approvalL2Name,
    ticket?.l2_approver_name,
    ticket?.l2ApproverName,
    ticket?.l2_name,
    ticket?.assigned_l2_name,
    ticket?.approval_l2_user_ids,
    ticket?.approvalL2UserIds,
    ticket?.approval_l2,
    ticket?.l2_approver
  ) || "-";

const getReviewL3 = (ticket) =>
  firstText(
    ticket?.l3_approvers,
    ticket?.l3Approvers,
    ticket?.approval_l3_name,
    ticket?.approvalL3Name,
    ticket?.l3_approver_name,
    ticket?.l3ApproverName,
    ticket?.l3_name,
    ticket?.assigned_l3_name,
    ticket?.approval_l3_user_ids,
    ticket?.approvalL3UserIds,
    ticket?.approval_l3,
    ticket?.l3_approver
  ) || getReviewL2(ticket);

// Unlike WC/PP Approvals (open to any user at that level), a ticket is
// assigned to specific L4/L5 users the moment it escalates to that level
// (approval_l4_user_ids/approval_l5_user_ids) - so showing who it's actually
// assigned to is meaningful here, same as the existing L2/L3 columns.
const getReviewL4 = (ticket) =>
  firstText(
    ticket?.l4_approvers,
    ticket?.l4Approvers,
    ticket?.approval_l4_name,
    ticket?.approvalL4Name,
    ticket?.l4_approver_name,
    ticket?.l4ApproverName,
    ticket?.l4_name,
    ticket?.assigned_l4_name,
    ticket?.approval_l4_user_ids,
    ticket?.approvalL4UserIds,
    ticket?.approval_l4,
    ticket?.l4_approver
  ) || getReviewL3(ticket);

const getReviewL5 = (ticket) =>
  firstText(
    ticket?.l5_approvers,
    ticket?.l5Approvers,
    ticket?.approval_l5_name,
    ticket?.approvalL5Name,
    ticket?.l5_approver_name,
    ticket?.l5ApproverName,
    ticket?.l5_name,
    ticket?.assigned_l5_name,
    ticket?.approval_l5_user_ids,
    ticket?.approvalL5UserIds,
    ticket?.approval_l5,
    ticket?.l5_approver
  ) || getReviewL4(ticket);

// Picks whichever level's assigned reviewer(s) are relevant to show right
// now, based on the ticket's current escalation stage - so the "Reviewer"
// column always reflects who it's actually sitting with, not always L2.
const getCurrentReviewer = (ticket) => {
  const level = String(ticket?.tat_current_level || ticket?.tatCurrentLevel || "L2").toUpperCase();
  if (level.startsWith("L5")) return getReviewL5(ticket);
  if (level.startsWith("L4")) return getReviewL4(ticket);
  if (level.startsWith("L3")) return getReviewL3(ticket);
  return getReviewL2(ticket);
};

const getTicketTypeLabel = (ticket) => {
  if (isWheelChangeApprovalTicketRecord(ticket)) return "Wheel Change";
  if (isAcknowledgementReviewTicket(ticket)) return "Acknowledgement";
  if (isPpBatchCompletionTicketRecord(ticket)) return "PP";
  if (isSubmissionTicketRecord(ticket)) return "Submission";
  return "Value";
};

// Deterministic per-ticket seed so placeholder ownership figures stay
// stable across re-renders instead of reshuffling on every fetch.
const hashTicketId = (value) => {
  const str = String(value || "");
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) % 100000;
  }
  return hash;
};

const minutesToClock = (totalMinutes) => {
  const clamped = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const diffMinutes = (fromValue, toValue) => {
  const from = fromValue ? new Date(fromValue) : null;
  const to = toValue ? new Date(toValue) : null;
  if (!from || Number.isNaN(from.getTime()) || !to || Number.isNaN(to.getTime())) return null;
  return (to.getTime() - from.getTime()) / 60000;
};

// TAT due-at for the ticket's current escalation level - the "Defined Res Time"
// window it was given, measured from creation.
const getCurrentLevelDueAt = (ticket) => {
  const level = String(ticket?.tat_current_level || ticket?.tatCurrentLevel || "L1").toUpperCase();
  return (
    {
      L1: ticket?.l1_tat_due_at,
      L2: ticket?.l2_tat_due_at,
      L3: ticket?.l3_tat_due_at,
      L4: ticket?.l4_tat_due_at,
      L5: ticket?.l5_tat_due_at,
    }[level] || null
  );
};

// Defined = TAT window (created_at -> current level's due_at). Actual = time it
// really took to resolve (created_at -> ticket_logs Approved/ACKNOWLEDGED
// timestamp, returned by the API as resolved_at). Gap = defined - actual.
const getResolutionDisplay = (ticket) => {
  const definedMinutes = diffMinutes(ticket?.created_at, getCurrentLevelDueAt(ticket));
  const resolved = isTicketResolved(ticket?.status);
  const resolvedAt = ticket?.resolved_at;
  const actualMinutes = resolved ? diffMinutes(ticket?.created_at, resolvedAt) : null;

  return {
    defined: definedMinutes !== null ? minutesToClock(definedMinutes) : "--:--",
    actual: actualMinutes !== null ? minutesToClock(actualMinutes) : "--:--",
    gapLabel:
      definedMinutes !== null && actualMinutes !== null
        ? `${definedMinutes - actualMinutes < 0 ? "-" : ""}${minutesToClock(Math.abs(definedMinutes - actualMinutes))}`
        : "--:--",
    isGapPositive:
      definedMinutes !== null && actualMinutes !== null ? definedMinutes - actualMinutes >= 0 : null,
  };
};

const isTicketResolved = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "closed" || normalized === "submit";
};

const TICKET_TYPE_OPTIONS = ["Value", "Submission", "PP", "Acknowledgement", "Wheel Change"];

// Per the PDF's hierarchy design, a ticket's escalation walks L1->L2->L3->L4->L5
// as each level's TAT window elapses without action - "Owned" means it is
// CURRENTLY sitting at the viewer's own level (their turn to act on/escalate
// it), and "Mapped" means it's visible to them because it's still active at
// a level below theirs (cumulative visibility: L4 sees L1/L2/L3 tickets
// mapped, L3 sees L1/L2, L2 sees L1, L1 sees nothing below it). L5 is the
// final escalation authority with no reportees below assigning tickets to
// it directly, so it never "owns" anything here - everything it sees is Mapped.
const LEVEL_RANK = { L1: 1, L2: 2, L3: 3, L4: 4, L5: 5 };

// Only Submission Frequency, PP Batch Incomplete, and Acknowledgement
// Overdue tickets carry a real tat_current_level state machine today; Value
// Threshold tickets are created with every level's approvers precomputed at
// once and never set tat_current_level (it stays null), so they have no
// progressive "current tier" - they fall back to the level that must act on
// them per the PDF (L1 submits a Correction Report, or L2 acknowledges).
const getPrimaryActorLevel = (ticket) => (getTicketKind(ticket) === TICKET_KIND.NOTEBOOK_ACK ? "L2" : "L1");

const getTicketCurrentLevel = (ticket) => {
  const raw = String(ticket?.tat_current_level || "").trim().toUpperCase();
  const stripped = raw.startsWith("EXPIRED_") ? raw.slice("EXPIRED_".length) : raw;
  if (LEVEL_RANK[stripped]) return stripped;
  return getPrimaryActorLevel(ticket);
};

// Previously this was a random hashTicketId(...) % 3 placeholder completely
// disconnected from real ticket data - replaced with the actual current
// escalation-tier check above.
const getOwnershipDisplay = (ticket, mode, delegateName) => {
  const viewLevel = String(mode || "L2").trim().toUpperCase();
  const currentLevel = getTicketCurrentLevel(ticket);
  const isOwned = viewLevel !== "L5" && currentLevel === viewLevel;
  return {
    kind: isOwned ? "owned" : "mapped",
    label: isOwned ? "Owned" : "Mapped",
    delegateName: isOwned ? "" : (delegateName || "-"),
  };
};

// PP_NOTEBOOK_INCOMPLETE tickets from /operator-tickets/process-parameter-ticketing —
// these no longer appear in the generic /tickets feed (segregation fix), so they're
// fetched separately here, same pattern as Operator dashboard's fetchSubmissionTickets.
// time_lagged_hours is computed live by the backend, so it stays current as time passes.
const formatProcessParameterTicket = (ticket) => {
  const transformedTicket = transformTicket(ticket);
  return {
    ...transformedTicket,
    id: transformedTicket.ticket_id || ticket.ticket_id,
    ticket_id: transformedTicket.ticket_id || ticket.ticket_id,
    entryId: ticket.entry_id || ticket.entryId || "-",
    machine_name: ticket.notebook || transformedTicket.notebook || "Unknown",
    notebook: ticket.notebook || transformedTicket.notebook || "Unknown",
    completionThresholdHours: ticket.completion_time_provided_hours ?? ticket.completionTimeProvidedHours ?? "-",
    entryCreatedAt: ticket.entry_created_at || ticket.entryCreatedAt || "-",
    timeLaggedHours: ticket.time_lagged_hours ?? ticket.timeLaggedHours ?? "-",
    severity: ticket.severity || transformedTicket.severity || "High",
    status: transformedTicket.status,
  };
};

export default function SupervisorDashboard({ mode = "L2", detailRoute = "/supervisordetails" }) {
  const dispatch = useDispatch();
  const router = useRouter();

  const { tickets, isLoading, error } =
    useSelector((state) => state.supervisor) || {};
  const authUser = useSelector((state) => state.auth?.user);
  const authToken = useSelector((state) => state.auth?.token);
  const isAuthHydrated = useSelector((state) => state.auth?.isHydrated);
  const isAdminUser = isFullAccessUser(authUser);
  const authFullName = firstText(
    authUser?.full_name,
    authUser?.fullName,
    authUser?.name,
    authUser?.employee_name,
    authUser?.employeeName
  );

  const sourceTickets = Array.isArray(tickets)
    ? tickets
    : Array.isArray(tickets?.tickets)
      ? tickets.tickets
      : Array.isArray(tickets?.data)
        ? tickets.data
        : [];

  const safeTickets = applyStoredTicketStatuses(sourceTickets)
    .filter((ticket) => isAdminUser || isSupervisorVisibleTicket(ticket))
    .map(transformTicket);
  const supervisorTicketQuery = isAdminUser
    ? {
        include_all: true,
        all_users: true,
        all_tickets: true,
        scope: "all",
      }
    : {};

  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [userName, setUserName] = useState("");
  const [ticketType, setTicketType] = useState("");
  const [level, setLevel] = useState("");
  // L1 (operator) only ever sees its own L1 tickets, so a Level filter there
  // would always have exactly one meaningful option - it's only useful once
  // a view can show tickets sitting at more than one escalation level.
  const showLevelFilter = mode !== "L1";
  const levelFilterOptions = Object.keys(LEVEL_RANK).filter((option) => option !== "L5");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showFilter, setShowFilter] = useState(false);
  // L1-L4 each get an "Owned" tab (tickets currently escalated to their own
  // level right now); L5 is the final escalation authority with nothing
  // assigned directly to it, so it's Mapped-only. L1 has nothing escalating
  // to it from below, so it has no "Mapped" tab.
  const showOwnedTab = mode !== "L5";
  const showMappedTab = mode !== "L1";
  const defaultTicketingView = showOwnedTab ? "owned" : "mapped";
  const [activeTicketingView, setActiveTicketingView] = useState(defaultTicketingView);
  const [statusUpdatingId, setStatusUpdatingId] = useState("");
  const [processParameterTicketData, setProcessParameterTicketData] = useState([]);
  const [processParameterError, setProcessParameterError] = useState("");
  const [l2ApprovalQueueData, setL2ApprovalQueueData] = useState([]);
  const startDateInputRef = useRef(null);
  const endDateInputRef = useRef(null);

  const fetchProcessParameterTickets = async () => {
    try {
      setProcessParameterError("");
      const response = await getProcessParameterTickets({ page: 1, limit: 500, _ts: Date.now() });
      const ticketsArray = Array.isArray(response)
        ? response
        : response?.data?.tickets ||
          response?.data?.rows ||
          response?.data ||
          response?.tickets ||
          response?.rows ||
          [];

      if (!ticketsArray.length && response && typeof response === "object") {
        console.warn("getProcessParameterTickets returned an unrecognized response shape:", response);
      }

      setProcessParameterTicketData(ticketsArray.map(formatProcessParameterTicket));
    } catch (ppError) {
      console.error("Error fetching process parameter tickets:", ppError);
      setProcessParameterTicketData([]);
      setProcessParameterError(ppError.message || "Failed to fetch process parameter tickets.");
    }
  };

  // Value Threshold L1->L2 tickets: fetch one row per ticket_approvals L2 entry so a
  // ticket that was rejected and resubmitted shows every submit/approve/reject cycle
  // as its own separate row, instead of a single row that just overwrites its status.
  const fetchL2ApprovalQueue = async () => {
    try {
      const response = await fetchL2ApprovalQueueApi({ page: 1, limit: 500, _ts: Date.now() });
      const rows = Array.isArray(response?.approvals) ? response.approvals : [];
      setL2ApprovalQueueData(rows);
    } catch (queueError) {
      console.error("Error fetching L2 approval queue:", queueError);
      setL2ApprovalQueueData([]);
    }
  };

  useEffect(() => {
    // Wait for auth rehydration to finish (and a token to actually exist)
    // before firing any ticket fetch - on a fresh page load/reload this
    // effect can otherwise run before the token is restored, sending
    // requests with no Authorization header and surfacing as a crash.
    if (!isAuthHydrated || !authToken) return;
    dispatch(fetchSupervisorTickets(supervisorTicketQuery));
    fetchProcessParameterTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, isAdminUser, isAuthHydrated, authToken]);

  // Operators can change a ticket's status from their own dashboard while an admin/supervisor
  // already has this page open — refetch on refocus so those changes show up without a manual reload.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const refreshFromServer = () => {
      if (!isAuthHydrated || !authToken) return;
      dispatch(fetchSupervisorTickets(supervisorTicketQuery));
      fetchProcessParameterTickets();
      fetchL2ApprovalQueue();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshFromServer();
      }
    };

    window.addEventListener("focus", refreshFromServer);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshFromServer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, isAdminUser, isAuthHydrated, authToken]);

  const openCalendarPicker = (inputRef) => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  };

  // Every ticket type (Value/Submission/Acknowledgement/PP) is merged into one row shape
  // here so they can share a single table, filter bar, and Owned/Mapped toggle instead of
  // separate tabbed views per ticket type. Value Threshold tickets still with L1 (Open/In
  // Progress/Reopened) keep coming from safeTickets like before, but once submitted they're
  // excluded here - from that point on they come exclusively from l2ApprovalQueueData below,
  // which shows one row per ticket_approvals L2 entry (so a rejected+resubmitted ticket shows
  // every submit/approve/reject cycle as its own row) instead of one row with just current status.
  const mergedTickets = [
    ...safeTickets
      .filter((ticket) => {
        if (getTicketTypeLabel(ticket) !== "Value") return true;
        const normalizedStatus = String(ticket?.status || "").trim().toLowerCase();
        return ["open", "in progress", "reopened"].includes(normalizedStatus);
      })
      .map((ticket) => ({
        ...ticket,
        ticketType: getTicketTypeLabel(ticket),
        userName: isAcknowledgementReviewTicket(ticket) ? getCurrentReviewer(ticket) : (ticket.user_name || "-"),
        levelType: String(ticket?.tat_current_level || ticket?.tatCurrentLevel || mode).toUpperCase(),
      })),
    ...l2ApprovalQueueData.map((row) => {
      const transformed = transformTicket({
        ticket_id: row.ticket_id,
        user_id: row.user_id,
        user_name: row.user_name,
        machine_name: row.machine_name,
        parameter_name: row.parameter_name,
        actual_value: row.actual_value,
        threshold_value: row.threshold_value,
        severity: row.severity,
        status: row.ticket_status,
        created_at: row.approval_created_at,
      });
      return {
        ...transformed,
        id: `${row.ticket_id}-approval-${row.approval_row_id}`,
        approvalRowId: row.approval_row_id,
        approvalActionStatus: row.action_status,
        ticketType: "Value",
        userName: row.user_name || "-",
        levelType: "L2",
      };
    }),
    ...processParameterTicketData.map((ticket) => ({
      ...ticket,
      ticketType: "PP",
      userName: ticket.notebook || "-",
      levelType: mode,
    })),
  ];

  const filteredTickets = mergedTickets.filter((t) => {
    const ticketDate = t.created_at ? new Date(t.created_at) : null;
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    const dateMatch =
      !start && !end
        ? true
        : ticketDate &&
          (!start || ticketDate >= start) &&
          (!end || ticketDate <= end);

    const normalizedTicketStatus = String(t.status || "").trim().toLowerCase();
    const normalizedFilterStatus = String(status || "").trim().toLowerCase();
    const statusMatch =
      !status ||
      normalizedTicketStatus === normalizedFilterStatus ||
      (normalizedFilterStatus === "closed" && normalizedTicketStatus === "submit") ||
      (normalizedFilterStatus === "submit" && normalizedTicketStatus === "closed");

    return (
      dateMatch &&
      statusMatch &&
      (!severity || t.severity === severity) &&
      (!userName || t.userName === userName) &&
      (!ticketType || t.ticketType === ticketType) &&
      (!level || t.levelType === level) &&
      (!search ||
        t.ticket_id?.toLowerCase().includes(search.toLowerCase()) ||
        t.userName?.toLowerCase().includes(search.toLowerCase()))
    );
  });

  const uniqueUserNames = [
    ...new Set(mergedTickets.map((t) => t.userName).filter((value) => value && value !== "-")),
  ];
  const statusFilterOptions = SUPERVISOR_VISIBLE_STATUS_OPTIONS;

  const taggedTickets = filteredTickets.map((t) => ({
    ...t,
    ownership: getOwnershipDisplay(t, mode, authFullName),
    resolution: getResolutionDisplay(t),
  }));
  const displayTickets = taggedTickets.filter((t) => t.ownership.kind === activeTicketingView);

  const totalPages = Math.max(
    1,
    Math.ceil(displayTickets.length / ITEMS_PER_PAGE)
  );
  const start = (page - 1) * ITEMS_PER_PAGE;
  const pageData = displayTickets.slice(start, start + ITEMS_PER_PAGE);

  const handleTicketClick = (ticketId, ticketType, status) => {
    const id = ticketId?.startsWith("#") ? ticketId : `#${ticketId}`;
    router.push(`${detailRoute}?ticketId=${encodeURIComponent(id)}&ticketType=${ticketType}`);
  };

  const handleDashboardTicketClick = (ticket) => {
    if (isAcknowledgementReviewTicket(ticket)) return;
    handleTicketClick(ticket.ticket_id, ticket.ticketType, ticket.status);
  };

  const selectTicketingView = (view) => {
    setActiveTicketingView(view);
    setPage(1);
  };

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className={styles["sup-page"]}>
      <div className={styles["sup-content"]}>
        <h1 className={styles["sup-title"]}>Ticketing System</h1>

        {showOwnedTab || showMappedTab ? (
          <div className={styles["ticketing-toggle"]}>
            {showOwnedTab ? (
              <button
                type="button"
                className={`${styles["ticketing-toggle-btn"]} ${activeTicketingView === "owned" ? styles["ticketing-toggle-btn-active"] : ""}`}
                onClick={() => selectTicketingView("owned")}
              >
                Owned Tickets
              </button>
            ) : null}
            {showMappedTab ? (
              <button
                type="button"
                className={`${styles["ticketing-toggle-btn"]} ${activeTicketingView === "mapped" ? styles["ticketing-toggle-btn-active"] : ""}`}
                onClick={() => selectTicketingView("mapped")}
              >
                Mapped Tickets
              </button>
            ) : null}
          </div>
        ) : null}

        {processParameterError ? (
          <div
            role="alert"
            style={{
              margin: "0 0 16px",
              padding: "12px 14px",
              border: "1px solid #f6c2c2",
              borderRadius: 6,
              background: "#fff5f5",
              color: "#9f1d1d",
              fontSize: 14,
            }}
          >
            Process parameter tickets could not be loaded. The backend returned: {processParameterError}
          </div>
        ) : null}

        <div className={styles["sup-mobile-title-row"]}>
          <button
            className={styles["mobile-filter-btn"]}
            onClick={() => setShowFilter(true)}
          >
            <MdFilterList className={styles["filter-icon-img"]} />
            Filter
          </button>
        </div>

        <div className={styles["sup-filters"]}>
          <div className={styles["sup-filter"]}>
            <label>Ticket Type</label>
            <select
              className={styles["sup-select"]}
              value={ticketType}
              onChange={(e) => setTicketType(e.target.value)}
            >
              <option value="">All</option>
              {TICKET_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option} Ticket</option>
              ))}
            </select>
          </div>

          {showLevelFilter && (
            <div className={styles["sup-filter"]}>
              <label>Level</label>
              <select
                className={styles["sup-select"]}
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                <option value="">All</option>
                {levelFilterOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          )}

          <div className={styles["sup-filter"]}>
            <label>Severity</label>
            <select
              className={styles["sup-select"]}
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="">All</option>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </div>

          <div className={styles["sup-filter"]}>
            <label>Status</label>
            <select
              className={styles["sup-select"]}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All</option>
              {statusFilterOptions.map((option) => (
                <option key={option} value={option}>{getSupervisorStatusLabel(option)}</option>
              ))}
            </select>
          </div>

          <div className={styles["sup-filter"]}>
            <label>User Name</label>
            <select
              className={styles["sup-select"]}
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            >
              <option value="">All</option>
              {uniqueUserNames.map((name, i) => (
                <option key={i} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles["sup-date-group"]}>
            <div className={styles["sup-filter"]}>
              <label>From Date</label>
              <button
                type="button"
                className={styles["sup-select"]}
                onClick={() => openCalendarPicker(startDateInputRef)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
              >
                <span>{formatDateDisplay(startDate) || "Select date"}</span>
                <input
                  ref={startDateInputRef}
                  type="date"
                  value={startDate}
                  tabIndex={-1}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
                />
                <FiCalendar aria-hidden="true" />
              </button>
            </div>
            <div className={styles["sup-filter"]}>
              <label>To Date</label>
              <button
                type="button"
                className={styles["sup-select"]}
                onClick={() => openCalendarPicker(endDateInputRef)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
              >
                <span>{formatDateDisplay(endDate) || "Select date"}</span>
                <input
                  ref={endDateInputRef}
                  type="date"
                  value={endDate}
                  tabIndex={-1}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
                />
                <FiCalendar aria-hidden="true" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setStatus("");
              setSeverity("");
              setUserName("");
              setTicketType("");
              setLevel("");
              setStartDate("");
              setEndDate("");
              setSearch("");
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              height: 36,
              padding: "0 14px",
              fontSize: 13,
              fontWeight: 500,
              color: "#344054",
              background: "#fff",
              border: "1px solid #d0d5dd",
              borderRadius: 6,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <FiX aria-hidden="true" /> Clear
          </button>
        </div>

        <div className={styles["sup-table-wrapper"]}>
          <table className={styles.supTable}>
            <thead>
              <tr>
                <th>TICKET ID</th>
                <th>TICKET TYPE</th>
                <th>OWNED/DELEGATE</th>
                <th>LEVEL TYPE</th>
                <th>USER NAME</th>
                <th>STATUS</th>
                <th>SEVERITY</th>
                <th>DEFINED RES TIME</th>
                <th>ACTUAL RES TIME</th>
                <th>RESOLUTION GAP</th>
                <th>CREATED AT</th>
              </tr>
            </thead>
            <tbody>
              {pageData.length > 0 ? (
                pageData.map((t, i) => (
                  <tr
                    key={`${t.ticket_id}-${i}`}
                    className={styles["sup-table-row"]}
                    onClick={() => handleDashboardTicketClick(t)}
                  >
                    <td
                      className={styles["sup-ticket-link"]}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleTicketClick(t.ticket_id, t.ticketType, t.status);
                      }}
                    >
                      {t.ticket_id}
                    </td>
                    <td>{t.ticketType}</td>
                    <td>
                      {t.ownership.label}
                      {t.ownership.delegateName ? (
                        <div className={styles["sup-small-label"]}>({t.ownership.delegateName})</div>
                      ) : null}
                    </td>
                    <td>{t.levelType}</td>
                    <td>{t.userName}</td>
                    <td>
                      <span
                        className={`${styles["status-badge"]} ${
                          styles[`status-${getStatusClassKey(t.status)}`] ||
                          styles[getStatusClassKey(t.status).replace(/-/g, "_")] ||
                          ""
                        }`}
                      >
                        {getSupervisorStatusLabel(t.status)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`${styles["sup-badge"]} ${styles[t.severity?.toLowerCase()]}`}
                      >
                        {t.severity}
                      </span>
                    </td>
                    <td>{t.resolution.defined}</td>
                    <td>{t.resolution.actual}</td>
                    <td
                      style={{
                        color:
                          t.resolution.isGapPositive === null
                            ? "#98a2b3"
                            : t.resolution.isGapPositive
                              ? "#12b76a"
                              : "#f04438",
                        fontWeight: 600,
                      }}
                    >
                      {t.resolution.gapLabel}
                    </td>
                    <td>{formatDateTime(t.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="11" style={{ textAlign: "center", padding: "24px" }}>
                    No tickets found
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className={styles["sup-table-footer"]}>
            <div>
              Showing {displayTickets.length === 0 ? 0 : start + 1}-
              {Math.min(start + ITEMS_PER_PAGE, displayTickets.length)} of{" "}
              {displayTickets.length}
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>

        <div className={styles["sup-mobile-cards"]}>
          {displayTickets.map((t, i) => (
            <div
              key={`${t.ticket_id}-${i}`}
              className={`${styles["sup-mobile-card"]} ${
                getSupervisorStatusLabel(t.status) === "Closed" ? styles["sup-muted"] : ""
              }`}
              onClick={() => handleDashboardTicketClick(t)}
            >
              <div className={styles["sup-card-top"]}>
                <div>
                  <div className={styles["sup-card-title"]}>
                    {t.ticket_id} | {t.ticketType}
                  </div>
                  <div className={styles["sup-card-date"]}>
                    {formatDateTime(t.created_at)}
                  </div>
                </div>

                <span className={`${styles["sup-badge"]} ${styles[t.severity?.toLowerCase()]}`}>
                  Severity: {t.severity}
                </span>
              </div>

              <div className={styles["sup-param-box"]}>
                <div>
                  <div className={styles["sup-small-label"]}>{t.ownership.label}</div>
                  <div className={styles["sup-param-name"]}>{t.userName}</div>
                </div>

                <div>
                  <div className={styles["sup-small-label"]}>Resolution Gap</div>
                  <div
                    className={styles["sup-actual-value"]}
                    style={{ color: t.resolution.isGapPositive ? "#12b76a" : "#f04438" }}
                  >
                    {t.resolution.gapLabel}
                  </div>
                </div>
              </div>

              <div className={styles["sup-card-bottom"]}>
                <div
                  className={`${styles["status-text"]} ${
                    styles[getStatusClassKey(t.status).replace(/-/g, "_")]
                  }`}
                >
                  <span className={styles["status-dot"]} />
                  {getSupervisorStatusLabel(t.status)}
                </div>
                {isAcknowledgementReviewTicket(t) ? null : (
                  <div className={styles["details-link"]}>Details &gt;</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {showFilter && (
          <div
            className={styles["sup-filter-overlay"]}
            onClick={() => setShowFilter(false)}
          >
            <div
              className={styles["sup-filter-drawer"]}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles["sup-filter-drawer-header"]}>
                <span>Filter</span>
                <button onClick={() => setShowFilter(false)}>Ã—</button>
              </div>

              <div className={styles["sup-filter-body"]}>
                <div className={styles["sup-filter-group"]}>
                  <label>Ticket Type</label>
                  <select
                    value={ticketType}
                    onChange={(e) => setTicketType(e.target.value)}
                  >
                    <option value="">All</option>
                    {TICKET_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option} Ticket</option>
                    ))}
                  </select>
                </div>

                {showLevelFilter && (
                  <div className={styles["sup-filter-group"]}>
                    <label>Level</label>
                    <select
                      value={level}
                      onChange={(e) => setLevel(e.target.value)}
                    >
                      <option value="">All</option>
                      {levelFilterOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={styles["sup-filter-group"]}>
                  <label>Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">All</option>
                    {statusFilterOptions.map((option) => (
                      <option key={option} value={option}>{getSupervisorStatusLabel(option)}</option>
                    ))}
                  </select>
                </div>

                <div className={styles["sup-filter-group"]}>
                  <label>Severity</label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                  >
                    <option value="">All</option>
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                </div>

                <div className={styles["sup-filter-group"]}>
                  <label>User Name</label>
                  <select
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                  >
                    <option value="">All</option>
                    {uniqueUserNames.map((name, i) => (
                      <option key={i} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <label>Date Range</label>
                <div className={styles["sup-date-row"]}>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>

                <div className={styles["sup-filter-actions"]}>
                  <button
                    className={styles["reset-btn"]}
                    onClick={() => {
                      setStatus("");
                      setSeverity("");
                      setUserName("");
                      setTicketType("");
                      setLevel("");
                      setStartDate("");
                      setEndDate("");
                      setSearch("");
                    }}
                  >
                    Reset
                  </button>
                  <button
                    className={styles["apply-btn"]}
                    onClick={() => setShowFilter(false)}
                  >
                    Apply Filter
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



import { useState, useEffect, useRef } from "react";
import styles from "../../styles/supervisordashboard.module.css";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { fetchSupervisorTickets } from "../../store/slices/supervisorSlice";
import Pagination from "@/components/Pagination";
import { FiCalendar, FiX } from "react-icons/fi";
import { MdFilterList } from "react-icons/md";
import { updateOperatorTicketStatus, getProcessParameterTickets } from "../../apis/operatorApi";
import { acknowledgeTicketApi } from "../../apis/supervisorApi";
import {
  applyStoredTicketStatuses,
  getStatusClassKey,
  getOperatorStatusLabel,
  getOperatorStatusOptions,
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
  transformTicket,
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
  if (isAcknowledgementReviewTicket(ticket)) return "Acknowledgement";
  if (isPpBatchCompletionTicketRecord(ticket)) return "PP";
  if (isSubmissionTicketRecord(ticket)) return "Submission";
  return "Value";
};

// Deterministic per-ticket seed so placeholder resolution/ownership figures stay
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

// Real defined/actual resolution timers aren't tracked in the ticket data model yet -
// these are display-only placeholders derived from the ticket id so the merged table
// layout can be previewed before that data exists.
const getResolutionDisplay = (ticket) => {
  const seed = hashTicketId(ticket?.ticket_id);
  const definedMinutes = 30 + (seed % 8) * 30;
  const resolved = isTicketResolved(ticket?.status);

  if (!resolved) {
    return {
      defined: minutesToClock(definedMinutes),
      actual: "--:--",
      gapLabel: "--:--",
      isGapPositive: null,
    };
  }

  const varianceMinutes = ((seed % 7) - 3) * 15;
  const actualMinutes = Math.max(15, definedMinutes + varianceMinutes);
  const gapMinutes = definedMinutes - actualMinutes;

  return {
    defined: minutesToClock(definedMinutes),
    actual: minutesToClock(actualMinutes),
    gapLabel: `${gapMinutes < 0 ? "-" : ""}${minutesToClock(Math.abs(gapMinutes))}`,
    isGapPositive: gapMinutes >= 0,
  };
};

const isTicketResolved = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "closed" || normalized === "submit";
};

const TICKET_TYPE_OPTIONS = ["Value", "Submission", "PP", "Acknowledgement"];

const getOwnershipDisplay = (ticket, delegateName) => {
  const seed = hashTicketId(ticket?.ticket_id);
  const isDelegate = seed % 3 === 0;
  return {
    kind: isDelegate ? "mapped" : "owned",
    label: isDelegate ? "Delegate" : "Owned",
    delegateName: isDelegate ? (delegateName || "-") : "",
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

export default function SupervisorDashboard({ mode = "L2" }) {
  const dispatch = useDispatch();
  const router = useRouter();

  const { tickets, isLoading, error } =
    useSelector((state) => state.supervisor) || {};
  const authUser = useSelector((state) => state.auth?.user);
  const isAdminUser = isFullAccessUser(authUser);

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
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showFilter, setShowFilter] = useState(false);
  const [activeTicketingView, setActiveTicketingView] = useState("owned");
  const [statusUpdatingId, setStatusUpdatingId] = useState("");
  const [processParameterTicketData, setProcessParameterTicketData] = useState([]);
  const [processParameterError, setProcessParameterError] = useState("");
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

  useEffect(() => {
    dispatch(fetchSupervisorTickets(supervisorTicketQuery));
    fetchProcessParameterTickets();
  }, [dispatch, isAdminUser]);

  // Operators can change a ticket's status from their own dashboard while an admin/supervisor
  // already has this page open — refetch on refocus so those changes show up without a manual reload.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const refreshFromServer = () => {
      dispatch(fetchSupervisorTickets(supervisorTicketQuery));
      fetchProcessParameterTickets();
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
  }, [dispatch, isAdminUser]);

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
  // separate tabbed views per ticket type.
  const mergedTickets = [
    ...safeTickets.map((ticket) => ({
      ...ticket,
      ticketType: getTicketTypeLabel(ticket),
      userName: isAcknowledgementReviewTicket(ticket) ? getCurrentReviewer(ticket) : (ticket.user_name || "-"),
      levelType: String(ticket?.tat_current_level || ticket?.tatCurrentLevel || mode).toUpperCase(),
    })),
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
      (!search ||
        t.ticket_id?.toLowerCase().includes(search.toLowerCase()) ||
        t.userName?.toLowerCase().includes(search.toLowerCase()))
    );
  });

  const uniqueUserNames = [
    ...new Set(mergedTickets.map((t) => t.userName).filter((value) => value && value !== "-")),
  ];
  const statusFilterOptions = SUPERVISOR_VISIBLE_STATUS_OPTIONS;

  const authFullName = authUser?.full_name || authUser?.name || "You";
  const taggedTickets = filteredTickets.map((t) => ({
    ...t,
    ownership: getOwnershipDisplay(t, authFullName),
    resolution: getResolutionDisplay(t),
  }));
  const displayTickets = taggedTickets.filter((t) => t.ownership.kind === activeTicketingView);

  const totalPages = Math.max(
    1,
    Math.ceil(displayTickets.length / ITEMS_PER_PAGE)
  );
  const start = (page - 1) * ITEMS_PER_PAGE;
  const pageData = displayTickets.slice(start, start + ITEMS_PER_PAGE);

  const handleTicketClick = (ticketId, ticketType) => {
    const id = ticketId?.startsWith("#") ? ticketId : `#${ticketId}`;
    router.push(`/supervisordetails?ticketId=${encodeURIComponent(id)}&ticketType=${ticketType}`);
  };

  const handleDashboardTicketClick = (ticket) => {
    if (isAcknowledgementReviewTicket(ticket)) return;
    handleTicketClick(ticket.ticket_id, ticket.ticketType);
  };

  const selectTicketingView = (view) => {
    setActiveTicketingView(view);
    setPage(1);
  };

  const handleStatusChange = async (ticketId, nextStatus, ticket = null) => {
    if (!ticketId || !nextStatus) return;
    if (String(ticket?.status || "").trim().toLowerCase() === String(nextStatus || "").trim().toLowerCase()) return;

    try {
      setStatusUpdatingId(ticketId);
      const normalizedStatus = String(nextStatus || "").trim().toLowerCase();
      const shouldAcknowledge =
        ticket &&
        isAcknowledgementReviewTicket(ticket) &&
        ["submit", "closed", "acknowledged", "ack"].includes(normalizedStatus);

      if (shouldAcknowledge) {
        await acknowledgeTicketApi(ticketId);
      } else {
        await updateOperatorTicketStatus(ticketId, nextStatus);
      }
      await dispatch(fetchSupervisorTickets(supervisorTicketQuery));
    } catch (updateError) {
      // Keep the current table visible; the global API layer already surfaces failures.
      console.error("Failed to update ticket status:", updateError);
    } finally {
      setStatusUpdatingId("");
    }
  };

  const getDisplayStatusOptions = (currentStatus) => {
    const options = getOperatorStatusOptions(currentStatus);
    const seenLabels = new Set();
    return options.filter((option) => {
      const label = getOperatorStatusLabel(option);
      if (seenLabels.has(label)) return false;
      seenLabels.add(label);
      return true;
    });
  };

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className={styles["sup-page"]}>
      <div className={styles["sup-content"]}>
        <h1 className={styles["sup-title"]}>Ticketing System</h1>

        <div className={styles["ticketing-toggle"]}>
          <button
            type="button"
            className={`${styles["ticketing-toggle-btn"]} ${activeTicketingView === "owned" ? styles["ticketing-toggle-btn-active"] : ""}`}
            onClick={() => selectTicketingView("owned")}
          >
            Owned Tickets
          </button>
          <button
            type="button"
            className={`${styles["ticketing-toggle-btn"]} ${activeTicketingView === "mapped" ? styles["ticketing-toggle-btn-active"] : ""}`}
            onClick={() => selectTicketingView("mapped")}
          >
            Mapped Tickets
          </button>
        </div>

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
                        handleTicketClick(t.ticket_id, t.ticketType);
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
                      {isAcknowledgementReviewTicket(t) ? (
                        <span
                          className={`${styles["status-badge"]} ${
                            styles[`status-${getStatusClassKey(t.status)}`] ||
                            styles[getStatusClassKey(t.status).replace(/-/g, "_")] ||
                            ""
                          }`}
                        >
                          {getSupervisorStatusLabel(t.status)}
                        </span>
                      ) : (
                        <span onClick={(event) => event.stopPropagation()}>
                          <select
                            className={styles["status-select"]}
                            value={t.status}
                            disabled={statusUpdatingId === t.ticket_id}
                            onChange={(event) => handleStatusChange(t.ticket_id, event.target.value, t)}
                          >
                            {getDisplayStatusOptions(t.status).map((option) => (
                              <option key={option} value={option}>
                                {getOperatorStatusLabel(option)}
                              </option>
                            ))}
                          </select>
                        </span>
                      )}
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
              key={t.ticket_id || i}
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
                {isAcknowledgementReviewTicket(t) ? (
                  <div className={styles["status-text"]} onClick={(event) => event.stopPropagation()}>
                    <span className={styles["status-dot"]} />
                    <select
                      className={styles["mobile-status-select"]}
                      value={t.status}
                      disabled={statusUpdatingId === t.ticket_id}
                      onChange={(event) => handleStatusChange(t.ticket_id, event.target.value, t)}
                    >
                      {getDisplayStatusOptions(t.status).map((option) => (
                        <option key={option} value={option}>
                          {getOperatorStatusLabel(option)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div
                    className={`${styles["status-text"]} ${
                      styles[getStatusClassKey(t.status).replace(/-/g, "_")]
                    }`}
                  >
                    <span className={styles["status-dot"]} />
                    {getSupervisorStatusLabel(t.status)}
                  </div>
                )}
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



import { useState, useEffect, useRef } from "react";
import styles from "../../styles/supervisordashboard.module.css";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { fetchSupervisorTickets } from "../../store/slices/supervisorSlice";
import { FiCalendar } from "react-icons/fi";
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

const ITEMS_PER_PAGE = 6;

const formatDateTime = (dateString) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};
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

const REVIEW_STATUS_FILTER_OPTIONS = [
  "Pending Approval",
  "Open",
  "In Progress",
  "Submit",
  "Reopened",
];

const getReviewSubDepartment = (ticket) =>
  firstText(
    ticket?.sub_department,
    ticket?.subDepartment,
    ticket?.sub_department_name,
    ticket?.subDepartmentName,
    ticket?.management_field,
    ticket?.managementField,
    ticket?.department
  ) || "-";

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
  const isL3Mode = String(mode || "").trim().toUpperCase() === "L3";

  const { tickets, isLoading, error } =
    useSelector((state) => state.supervisor) || {};
  const authUser = useSelector((state) => state.auth?.user);
  const isAdminUser = isFullAccessUser(authUser);
  const isReviewOnlyL3Mode = isL3Mode;

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

  const [status, setStatus] = useState(isReviewOnlyL3Mode ? "Pending Approval" : "");
  const [severity, setSeverity] = useState("");
  const [operator, setOperator] = useState("");
  const [notebookType, setNotebookType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showFilter, setShowFilter] = useState(false);
  const [activeTicketingView, setActiveTicketingView] = useState(isReviewOnlyL3Mode ? "review" : "threshold");
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

  useEffect(() => {
    if (!isReviewOnlyL3Mode) return;
    setActiveTicketingView("review");
    setStatus("Pending Approval");
    setSeverity("");
    setOperator("");
    setNotebookType("");
    setPage(1);
  }, [isReviewOnlyL3Mode]);

  const filteredTickets = safeTickets.filter((t) => {
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
    const statusMatch = activeTicketingView === "review" && normalizedFilterStatus === "pending approval"
      ? true
      : !status ||
        normalizedTicketStatus === normalizedFilterStatus ||
        (normalizedFilterStatus === "closed" && normalizedTicketStatus === "submit") ||
        (normalizedFilterStatus === "submit" && normalizedTicketStatus === "closed");

    const operatorMatch = activeTicketingView === "review"
      ? (!operator || getReviewL3(t) === operator)
      : (!operator || t.user_name === operator);
    const notebookTypeMatch = activeTicketingView === "review"
      ? (!notebookType || getReviewSubDepartment(t) === notebookType)
      : (!notebookType || (t.notebook_type || t.notebookType || t.notebook || "") === notebookType);

    return (
      dateMatch &&
      statusMatch &&
      (activeTicketingView === "review" || !severity || t.severity === severity) &&
      operatorMatch &&
      notebookTypeMatch &&
      (!search ||
        t.ticket_id?.toLowerCase().includes(search.toLowerCase()) ||
        t.user_name?.toLowerCase().includes(search.toLowerCase()) ||
        t.machine_name?.toLowerCase().includes(search.toLowerCase()))
    );
  });

  const uniqueOperators = [
    ...new Set(safeTickets.map((t) => t.user_name).filter(Boolean)),
  ];
  const uniqueNotebookTypes = [
    ...new Set(
      safeTickets
        .map((t) => t.notebook_type || t.notebookType || t.notebook)
        .filter(Boolean)
    ),
  ];
  const reviewSourceTickets = safeTickets.filter(isAcknowledgementReviewTicket);
  const uniqueReviewSubDepartments = [
    ...new Set(reviewSourceTickets.map(getReviewSubDepartment).filter((value) => value && value !== "-")),
  ];
  const uniqueReviewL3Users = [
    ...new Set(reviewSourceTickets.map(getReviewL3).filter((value) => value && value !== "-")),
  ];
  const statusFilterOptions = activeTicketingView === "review"
    ? REVIEW_STATUS_FILTER_OPTIONS
    : SUPERVISOR_VISIBLE_STATUS_OPTIONS;

  const reviewTickets = filteredTickets.filter(isAcknowledgementReviewTicket);
  const submissionTickets = filteredTickets.filter(
    (ticket) => isSubmissionTicketRecord(ticket) && !isAcknowledgementReviewTicket(ticket)
  );
  const thresholdTickets = filteredTickets.filter((ticket) => !isSubmissionTicketRecord(ticket));
  // Process parameter tickets come from their own dedicated endpoint (not the
  // generic /tickets feed safeTickets is built from), so they get their own
  // simple filter pass instead of running through the shared filteredTickets logic.
  const processParameterTickets = processParameterTicketData.filter((t) => {
    const ticketDate = t.created_at ? new Date(t.created_at) : null;
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    const dateMatch =
      !start && !end ? true : ticketDate && (!start || ticketDate >= start) && (!end || ticketDate <= end);
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
      (!notebookType || t.notebook === notebookType) &&
      (!search ||
        t.ticket_id?.toLowerCase().includes(search.toLowerCase()) ||
        t.entryId?.toLowerCase?.().includes(search.toLowerCase()) ||
        t.notebook?.toLowerCase().includes(search.toLowerCase()))
    );
  });
  const displayTickets =
    activeTicketingView === "threshold"
      ? thresholdTickets
      : activeTicketingView === "submission"
        ? submissionTickets
        : activeTicketingView === "process_parameter"
          ? processParameterTickets
          : reviewTickets;

  const totalPages = Math.max(
    1,
    Math.ceil(displayTickets.length / ITEMS_PER_PAGE)
  );
  const start = (page - 1) * ITEMS_PER_PAGE;
  const pageData = displayTickets.slice(start, start + ITEMS_PER_PAGE);

  const handleTicketClick = (ticketId) => {
    const id = ticketId?.startsWith("#") ? ticketId : `#${ticketId}`;
    router.push(`/supervisordetails?ticketId=${encodeURIComponent(id)}&ticketType=${activeTicketingView}`);
  };

  const handleDashboardTicketClick = (ticket) => {
    if (activeTicketingView === "review" || isAcknowledgementReviewTicket(ticket)) return;
    handleTicketClick(ticket.ticket_id);
  };

  const selectTicketingView = (view) => {
    if (isReviewOnlyL3Mode && view !== "review") return;
    setActiveTicketingView(view);
    setPage(1);
    setStatus(view === "review" ? "Pending Approval" : "");
    setSeverity("");
    setOperator("");
    setNotebookType("");
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

  const getTicketNotebookLabel = (ticket) =>
    ticket?.notebook ||
    ticket?.notebook_type ||
    ticket?.notebookType ||
    ticket?.machine_name ||
    ticket?.machine ||
    "Unknown";

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className={styles["sup-page"]}>
      <div className={styles["sup-content"]}>
        <h1 className={styles["sup-title"]}>{mode} Ticketing Dashboard</h1>
        {!isReviewOnlyL3Mode ? (
          <div className={styles["ticketing-toggle"]}>
            <button
              type="button"
              className={`${styles["ticketing-toggle-btn"]} ${activeTicketingView === "threshold" ? styles["ticketing-toggle-btn-active"] : ""}`}
              onClick={() => selectTicketingView("threshold")}
              >
              Threshold Ticketing Sys.
            </button>
            <button
              type="button"
              className={`${styles["ticketing-toggle-btn"]} ${activeTicketingView === "submission" ? styles["ticketing-toggle-btn-active"] : ""}`}
              onClick={() => selectTicketingView("submission")}
              >
              Submission Ticketing Sys.
            </button>
            <button
              type="button"
              className={`${styles["ticketing-toggle-btn"]} ${activeTicketingView === "review" ? styles["ticketing-toggle-btn-active"] : ""}`}
              onClick={() => selectTicketingView("review")}
              >
              Review Ticketing Sys.
            </button>
            <button
              type="button"
              className={`${styles["ticketing-toggle-btn"]} ${activeTicketingView === "process_parameter" ? styles["ticketing-toggle-btn-active"] : ""}`}
              onClick={() => selectTicketingView("process_parameter")}
              >
              Process Parameter Tickets
            </button>
          </div>
        ) : null}

        {activeTicketingView === "process_parameter" && processParameterError ? (
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

          {activeTicketingView === "review" ? (
            <>
              <div className={styles["sup-filter"]}>
                <label>Sub-Department</label>
                <select
                  className={styles["sup-select"]}
                  value={notebookType}
                  onChange={(e) => setNotebookType(e.target.value)}
                >
                  <option value="">All</option>
                  {uniqueReviewSubDepartments.map((type, i) => (
                    <option key={i} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles["sup-filter"]}>
                <label>L3</label>
                <select
                  className={styles["sup-select"]}
                  value={operator}
                  onChange={(e) => setOperator(e.target.value)}
                >
                  <option value="">All</option>
                  {uniqueReviewL3Users.map((op, i) => (
                    <option key={i} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
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
                <label>Operator</label>
                <select
                  className={styles["sup-select"]}
                  value={operator}
                  onChange={(e) => setOperator(e.target.value)}
                >
                  <option value="">All</option>
                  {uniqueOperators.map((op, i) => (
                    <option key={i} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles["sup-filter"]}>
                <label>Notebook Type</label>
                <select
                  className={styles["sup-select"]}
                  value={notebookType}
                  onChange={(e) => setNotebookType(e.target.value)}
                >
                  <option value="">All</option>
                  {uniqueNotebookTypes.map((type, i) => (
                    <option key={i} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className={styles["sup-date-group"]}>
            <div className={styles["sup-filter"]}>
              <label>Start Date</label>
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
              <label>End Date</label>
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
        </div>

        <div className={styles["sup-table-wrapper"]}>
          <table className={styles.supTable}>
            <thead>
              <tr>
                <th>TICKET ID</th>
                {activeTicketingView === "review" ? (
                  <>
                    <th>SUB DEPARTMENT</th>
                    <th>L2</th>
                    <th>NOTEBOOK</th>
                    <th>STATUS</th>
                    <th>CREATED AT</th>
                  </>
                ) : activeTicketingView === "submission" ? (
                  <>
                    <th>OPERATOR</th>
                    <th>NOTEBOOK</th>
                    <th>PARAMETER</th>
                    <th>FREQUENCY</th>
                    <th>OCCURRENCES</th>
                    <th>SEVERITY</th>
                    <th>STATUS</th>
                    <th>CREATED AT</th>
                  </>
                ) : activeTicketingView === "process_parameter" ? (
                  <>
                    <th>NOTEBOOK</th>
                    <th>ENTRY ID</th>
                    <th>COMPLETION THRESHOLD (HRS)</th>
                    <th>ENTRY CREATED AT</th>
                    <th>TIME LAGGED (HRS)</th>
                    <th>SEVERITY</th>
                    <th>STATUS</th>
                    <th>CREATED AT</th>
                  </>
                ) : (
                  <>
                    <th>OPERATOR</th>
                    <th>NOTEBOOK TYPE</th>
                    <th>PARAMETER</th>
                    <th>ACTUAL</th>
                    <th>STANDARD</th>
                    <th>THRESHOLD</th>
                    <th>SEVERITY</th>
                    <th>STATUS</th>
                    <th>CREATED AT</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {pageData.length > 0 ? (
                pageData.map((t, i) => {
                  const primaryParam = t.parameter || (
                    Array.isArray(t.parameter_name)
                      ? t.parameter_name[0] || "-"
                      : t.parameter_name || "-"
                  );

                  return (
                    <tr
                      key={`${t.ticket_id}-${i}`}
                      className={styles["sup-table-row"]}
                      onClick={() => handleDashboardTicketClick(t)}
                    >
                      <td className={styles["sup-ticket-link"]}>
                        {t.ticket_id}
                      </td>
                      {activeTicketingView === "review" ? (
                        <>
                          <td>{getReviewSubDepartment(t)}</td>
                          <td>{getReviewL2(t)}</td>
                          <td>{getTicketNotebookLabel(t)}</td>
                          <td>
                            {isReviewOnlyL3Mode ? (
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
                          <td>{formatDateTime(t.created_at)}</td>
                        </>
                      ) : activeTicketingView === "submission" ? (
                        <>
                          <td>{t.user_name}</td>
                          <td>{getTicketNotebookLabel(t)}</td>
                          <td>{primaryParam}</td>
                          <td>
                            {isPpBatchCompletionTicketRecord(t)
                              ? `${Math.max(0, Math.round((Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60)))}h`
                              : t.frequency || t.submission_frequency || t.check_frequency || "-"}
                          </td>
                          <td>{isPpBatchCompletionTicketRecord(t) ? 1 : t.occurrences || t.occurrence_count || t.count || "-"}</td>
                          <td>
                            <span
                              className={`${styles["sup-badge"]} ${
                                styles[t.severity?.toLowerCase()]
                              }`}
                            >
                              {t.severity}
                            </span>
                          </td>
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
                          <td>{formatDateTime(t.created_at)}</td>
                        </>
                      ) : activeTicketingView === "process_parameter" ? (
                        <>
                          <td>{t.notebook}</td>
                          <td>{t.entryId}</td>
                          <td>{t.completionThresholdHours}</td>
                          <td>{t.entryCreatedAt === "-" ? "-" : formatDateTime(t.entryCreatedAt)}</td>
                          <td>{t.timeLaggedHours}</td>
                          <td>
                            <span
                              className={`${styles["sup-badge"]} ${
                                styles[t.severity?.toLowerCase()]
                              }`}
                            >
                              {t.severity}
                            </span>
                          </td>
                          <td>
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
                          </td>
                          <td>{formatDateTime(t.created_at)}</td>
                        </>
                      ) : (
                        <>
                          <td>{t.user_name}</td>
                          <td>{getTicketNotebookLabel(t)}</td>
                          <td>{primaryParam}</td>
                          <td>{t.actual ?? "-"}</td>
                          <td>{t.standard ?? "-"}</td>
                          <td>{t.threshold ?? "-"}</td>
                          <td>
                            <span
                              className={`${styles["sup-badge"]} ${
                                styles[t.severity?.toLowerCase()]
                              }`}
                            >
                              {t.severity}
                            </span>
                          </td>
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
                          <td>{formatDateTime(t.created_at)}</td>
                        </>
                      )}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={
                      activeTicketingView === "review"
                        ? "6"
                        : activeTicketingView === "submission"
                          ? "9"
                          : activeTicketingView === "process_parameter"
                            ? "9"
                            : "10"
                    }
                    style={{ textAlign: "center", padding: "24px" }}
                  >
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
            <div className={styles["sup-pagination"]}>
              <button
                disabled={page === 1}
                onClick={() => setPage(1)}
              >
                &lt;&lt;
              </button>
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                â€¹
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  className={page === i + 1 ? styles.active : ""}
                  onClick={() => setPage(i + 1)}
                >
                  {i + 1}
                </button>
              ))}
              <button
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
              >
                â€º
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(totalPages)}
              >
                &gt;&gt;
              </button>
            </div>
          </div>
        </div>

        <div className={styles["sup-mobile-cards"]}>
          {displayTickets.map((t, i) => {
            const primaryParam = t.parameter || (
              Array.isArray(t.parameter_name)
                ? t.parameter_name[0] || "-"
                : t.parameter_name || "-"
            );

            return (
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
                      {t.ticket_id} | {getTicketNotebookLabel(t)}
                    </div>
                    <div className={styles["sup-card-date"]}>
                      {formatDateTime(t.created_at)}
                    </div>
                  </div>

                  <span
                    className={`${styles["sup-badge"]} ${
                      styles[t.severity?.toLowerCase()]
                    }`}
                  >
                    Severity: {t.severity}
                  </span>
                </div>

                <div className={styles["sup-param-box"]}>
                  <div>
                    <div className={styles["sup-small-label"]}>Parameter</div>
                    <div className={styles["sup-param-name"]}>
                      {primaryParam}
                    </div>
                  </div>

                  <div>
                    <div className={styles["sup-small-label"]}>
                      {activeTicketingView === "review" ? "Hours Pending" : activeTicketingView === "submission" ? "Frequency" : "Actual"}
                    </div>
                    <div className={styles["sup-actual-value"]}>
                      {activeTicketingView === "review"
                        ? `${Math.round((Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60))}h`
                        : activeTicketingView === "submission"
                        ? isPpBatchCompletionTicketRecord(t)
                          ? `${Math.max(0, Math.round((Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60)))}h`
                          : t.frequency || t.submission_frequency || t.check_frequency || "-"
                        : t.actual ?? "-"}
                    </div>
                  </div>
                </div>

                <div className={styles["sup-card-bottom"]}>
                  {activeTicketingView === "review" ? (
                    isReviewOnlyL3Mode ? (
                      <div
                        className={`${styles["status-text"]} ${
                          styles[getStatusClassKey(t.status).replace(/-/g, "_")]
                        }`}
                      >
                        <span className={styles["status-dot"]} />
                        {getSupervisorStatusLabel(t.status)}
                      </div>
                    ) : (
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
                    )
                  ) : isAcknowledgementReviewTicket(t) ? (
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
                  {activeTicketingView === "review" || isAcknowledgementReviewTicket(t) ? null : (
                    <div className={styles["details-link"]}>Details &gt;</div>
                  )}
                </div>
              </div>
            );
          })}
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

                {activeTicketingView === "review" ? (
                  <>
                    <div className={styles["sup-filter-group"]}>
                      <label>Sub-Department</label>
                      <select
                        value={notebookType}
                        onChange={(e) => setNotebookType(e.target.value)}
                      >
                        <option value="">All</option>
                        {uniqueReviewSubDepartments.map((type, i) => (
                          <option key={i} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles["sup-filter-group"]}>
                      <label>L3</label>
                      <select
                        value={operator}
                        onChange={(e) => setOperator(e.target.value)}
                      >
                        <option value="">All</option>
                        {uniqueReviewL3Users.map((op, i) => (
                          <option key={i} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
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
                      <label>Notebook Type</label>
                      <select
                        value={notebookType}
                        onChange={(e) => setNotebookType(e.target.value)}
                      >
                        <option value="">All</option>
                        {uniqueNotebookTypes.map((type, i) => (
                          <option key={i} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles["sup-filter-group"]}>
                      <label>Operator</label>
                      <select
                        value={operator}
                        onChange={(e) => setOperator(e.target.value)}
                      >
                        <option value="">All</option>
                        {uniqueOperators.map((op, i) => (
                          <option key={i} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

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
                      setStatus(isReviewOnlyL3Mode ? "Pending Approval" : "");
                      setSeverity("");
                      setOperator("");
                      setNotebookType("");
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



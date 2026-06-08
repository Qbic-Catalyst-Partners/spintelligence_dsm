import { useState, useEffect } from "react";
import styles from "../../styles/supervisordashboard.module.css";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { fetchSupervisorTickets } from "../../store/slices/supervisorSlice";
import { MdFilterList } from "react-icons/md";
import { updateOperatorTicketStatus } from "../../apis/operatorApi";
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
  isNotebookAcknowledgementParameterName,
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

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const REVIEW_STATUS_FILTER_OPTIONS = [
  "Pending Approval",
  "Open",
  "In Progress",
  "Submit",
  "Reopened",
];

const isAcknowledgementReviewTicket = (ticket) => {
  const parameterNames = Array.isArray(ticket?.parameter_name)
    ? ticket.parameter_name
    : [ticket?.parameter_name, ticket?.parameter].filter(Boolean);
  const typeText = normalizeText(
    [
      ticket?.ticket_type,
      ticket?.ticketType,
      ticket?.acknowledgement_ticket_type,
      ticket?.notebook_type,
      ticket?.notebookType,
      ticket?.notebook,
      ticket?.machine_name,
      ticket?.description,
      ticket?.message,
    ].join(" ")
  );
  const statusText = normalizeText(
    ticket?.status || ticket?.ticket_status || ticket?.current_status || ticket?.state
  );

  return (
    typeText.includes("acknowledge") ||
    typeText.includes("acknowledgement") ||
    statusText.includes("pending approval") ||
    statusText.includes("pending acknowledgement") ||
    parameterNames.some(isNotebookAcknowledgementParameterName)
  );
};

const getReviewSubDepartment = (ticket) =>
  ticket?.sub_department ||
  ticket?.subDepartment ||
  ticket?.sub_department_name ||
  ticket?.subDepartmentName ||
  ticket?.department ||
  "-";

const getReviewL2 = (ticket) =>
  ticket?.approval_l2_name ||
  ticket?.approvalL2Name ||
  ticket?.l2_approver_name ||
  ticket?.l2ApproverName ||
  ticket?.l2_name ||
  ticket?.assigned_l2_name ||
  ticket?.approval_l2 ||
  ticket?.l2_approver ||
  "-";

const getReviewL3 = (ticket) =>
  ticket?.approval_l3_name ||
  ticket?.approvalL3Name ||
  ticket?.l3_approver_name ||
  ticket?.l3ApproverName ||
  ticket?.l3_name ||
  ticket?.assigned_l3_name ||
  ticket?.approval_l3 ||
  ticket?.l3_approver ||
  getReviewL2(ticket);

export default function SupervisorDashboard({ mode = "L2" }) {
  const dispatch = useDispatch();
  const router = useRouter();
  const isL3Mode = String(mode || "").trim().toUpperCase() === "L3";

  const { tickets, isLoading, error } =
    useSelector((state) => state.supervisor) || {};

  const sourceTickets = Array.isArray(tickets)
    ? tickets
    : Array.isArray(tickets?.tickets)
      ? tickets.tickets
      : Array.isArray(tickets?.data)
        ? tickets.data
        : [];

  const safeTickets = applyStoredTicketStatuses(sourceTickets)
    .filter(isSupervisorVisibleTicket)
    .map(transformTicket);

  const [status, setStatus] = useState(isL3Mode ? "Pending Approval" : "");
  const [severity, setSeverity] = useState("");
  const [operator, setOperator] = useState("");
  const [notebookType, setNotebookType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showFilter, setShowFilter] = useState(false);
  const [activeTicketingView, setActiveTicketingView] = useState(isL3Mode ? "review" : "threshold");
  const [statusUpdatingId, setStatusUpdatingId] = useState("");

  useEffect(() => {
    dispatch(fetchSupervisorTickets());
  }, [dispatch]);

  useEffect(() => {
    if (!isL3Mode) return;
    setActiveTicketingView("review");
    setStatus("Pending Approval");
    setSeverity("");
    setOperator("");
    setNotebookType("");
    setPage(1);
  }, [isL3Mode]);

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

  const reviewTickets = filteredTickets.filter(isAcknowledgementReviewTicket);
  const submissionTickets = filteredTickets.filter(
    (ticket) => isSubmissionTicketRecord(ticket) && !isAcknowledgementReviewTicket(ticket)
  );
  const thresholdTickets = filteredTickets.filter((ticket) => !isSubmissionTicketRecord(ticket));
  const displayTickets =
    activeTicketingView === "threshold"
      ? thresholdTickets
      : activeTicketingView === "submission"
        ? submissionTickets
        : reviewTickets;

  const totalPages = Math.max(
    1,
    Math.ceil(displayTickets.length / ITEMS_PER_PAGE)
  );
  const start = (page - 1) * ITEMS_PER_PAGE;
  const pageData = displayTickets.slice(start, start + ITEMS_PER_PAGE);

  const handleTicketClick = (ticketId) => {
    const id = ticketId?.startsWith("#") ? ticketId : `#${ticketId}`;
    router.push(`/supervisordetails?ticketId=${encodeURIComponent(id)}`);
  };

  const selectTicketingView = (view) => {
    if (isL3Mode && view !== "review") return;
    setActiveTicketingView(view);
    setPage(1);
    setStatus(view === "review" ? "Pending Approval" : "");
    setSeverity("");
    setOperator("");
    setNotebookType("");
  };

  const handleStatusChange = async (ticketId, nextStatus) => {
    if (!ticketId || !nextStatus) return;

    try {
      setStatusUpdatingId(ticketId);
      await updateOperatorTicketStatus(ticketId, nextStatus);
      await dispatch(fetchSupervisorTickets());
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
        {!isL3Mode ? (
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
              {(activeTicketingView === "review"
                ? REVIEW_STATUS_FILTER_OPTIONS
                : SUPERVISOR_VISIBLE_STATUS_OPTIONS
              ).map((option) => (
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
              <input
                type="date"
                className={styles["sup-select"]}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className={styles["sup-filter"]}>
              <label>End Date</label>
              <input
                type="date"
                className={styles["sup-select"]}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
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
                      onClick={() => handleTicketClick(t.ticket_id)}
                    >
                      <td className={styles["sup-ticket-link"]}>
                        {t.ticket_id}
                      </td>
                      {activeTicketingView === "review" ? (
                        <>
                          <td>{getReviewSubDepartment(t)}</td>
                          <td>{getReviewL2(t)}</td>
                          <td>{getTicketNotebookLabel(t)}</td>
                          <td onClick={(event) => event.stopPropagation()}>
                            <select
                              className={styles["status-select"]}
                              value={t.status}
                              disabled={statusUpdatingId === t.ticket_id}
                              onChange={(event) => handleStatusChange(t.ticket_id, event.target.value)}
                            >
                              {getDisplayStatusOptions(t.status).map((option) => (
                                <option key={option} value={option}>
                                  {getOperatorStatusLabel(option)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>{formatDateTime(t.created_at)}</td>
                        </>
                      ) : activeTicketingView === "submission" ? (
                        <>
                          <td>{t.user_name}</td>
                          <td>{getTicketNotebookLabel(t)}</td>
                          <td>{primaryParam}</td>
                          <td>{t.frequency || t.submission_frequency || t.check_frequency || "-"}</td>
                          <td>{t.occurrences || t.occurrence_count || t.count || "-"}</td>
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
                    colSpan={activeTicketingView === "review" ? "6" : activeTicketingView === "submission" ? "9" : "10"}
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
                onClick={() => handleTicketClick(t.ticket_id)}
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
                        ? t.frequency || t.submission_frequency || t.check_frequency || "-"
                        : t.actual ?? "-"}
                    </div>
                  </div>
                </div>

                <div className={styles["sup-card-bottom"]}>
                  {activeTicketingView === "review" ? (
                    <div className={styles["status-text"]} onClick={(event) => event.stopPropagation()}>
                      <span className={styles["status-dot"]} />
                      <select
                        className={styles["mobile-status-select"]}
                        value={t.status}
                        disabled={statusUpdatingId === t.ticket_id}
                        onChange={(event) => handleStatusChange(t.ticket_id, event.target.value)}
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
                  <div className={styles["details-link"]}>Details &gt;</div>
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
                    {(activeTicketingView === "review"
                      ? REVIEW_STATUS_FILTER_OPTIONS
                      : SUPERVISOR_VISIBLE_STATUS_OPTIONS
                    ).map((option) => (
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
                      setStatus(isL3Mode ? "Pending Approval" : "");
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

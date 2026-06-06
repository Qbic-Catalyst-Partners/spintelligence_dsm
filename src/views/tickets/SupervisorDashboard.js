import { useState, useEffect } from "react";
import styles from "../../styles/supervisordashboard.module.css";
import { useRouter } from "next/router";
import Link from "next/link";
import { useDispatch, useSelector } from "react-redux";
import { fetchSupervisorTickets } from "../../store/slices/supervisorSlice";
import { MdFilterList } from "react-icons/md";
import {
  applyStoredTicketStatuses,
  getStatusClassKey,
  getSupervisorStatusLabel,
  isSupervisorVisibleTicket,
  SUPERVISOR_VISIBLE_STATUS_OPTIONS,
} from "../../utils/ticketStatus";
import { transformTicket } from "../../utils/ticketTransformer";

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

export default function SupervisorDashboard() {
  const dispatch = useDispatch();
  const router = useRouter();

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

  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [operator, setOperator] = useState("");
  const [notebookType, setNotebookType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showFilter, setShowFilter] = useState(false);
  const [activeTicketingView, setActiveTicketingView] = useState("threshold");

  useEffect(() => {
    dispatch(fetchSupervisorTickets());
  }, [dispatch]);

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
    const statusMatch =
      !status ||
      normalizedTicketStatus === normalizedFilterStatus ||
      (normalizedFilterStatus === "closed" && normalizedTicketStatus === "submit") ||
      (normalizedFilterStatus === "submit" && normalizedTicketStatus === "closed");

    return (
      dateMatch &&
      statusMatch &&
      (!severity || t.severity === severity) &&
      (!operator || t.user_name === operator) &&
      (!notebookType ||
        (t.notebook_type || t.notebookType || t.notebook || "") === notebookType) &&
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

  const thresholdTickets = filteredTickets.filter((ticket) =>
    String(ticket.notebook_type || ticket.notebookType || ticket.notebook || "")
      .toLowerCase()
      .includes("threshold")
  );
  const submissionTickets = filteredTickets.filter(
    (ticket) =>
      !String(ticket.notebook_type || ticket.notebookType || ticket.notebook || "")
        .toLowerCase()
        .includes("threshold")
  );
  const displayTickets =
    activeTicketingView === "threshold"
      ? (thresholdTickets.length ? thresholdTickets : filteredTickets)
      : (submissionTickets.length ? submissionTickets : filteredTickets);

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

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className={styles["sup-page"]}>
      <div className={styles["sup-content"]}>
        <h1 className={styles["sup-title"]}>L2 Ticketing Dashboard</h1>
        <div className={styles["ticketing-toggle"]}>
          <button
            type="button"
            className={`${styles["ticketing-toggle-btn"]} ${activeTicketingView === "threshold" ? styles["ticketing-toggle-btn-active"] : ""}`}
            onClick={() => {
              setActiveTicketingView("threshold");
              setPage(1);
            }}
          >
            Threshold Ticket
          </button>
          <button
            type="button"
            className={`${styles["ticketing-toggle-btn"]} ${activeTicketingView === "submission" ? styles["ticketing-toggle-btn-active"] : ""}`}
            onClick={() => {
              setActiveTicketingView("submission");
              setPage(1);
            }}
          >
            Submission Ticket
          </button>
        </div>

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
              {SUPERVISOR_VISIBLE_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{getSupervisorStatusLabel(option)}</option>
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
                <th>OPERATOR</th>
                <th>{activeTicketingView === "submission" ? "NOTEBOOK" : "NOTEBOOK TYPE"}</th>
                <th>PARAMETER</th>
                {activeTicketingView === "submission" ? (
                  <>
                    <th>FREQUENCY</th>
                    <th>OCCURRENCES</th>
                  </>
                ) : (
                  <>
                    <th>ACTUAL</th>
                    <th>STANDARD</th>
                    <th>THRESHOLD</th>
                  </>
                )}
                <th>SEVERITY</th>
                <th>STATUS</th>
                <th>CREATED AT</th>
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
                      <td>{t.user_name}</td>
                      <td>{t.machine_name}</td>
                      <td>{primaryParam}</td>
                      {activeTicketingView === "submission" ? (
                        <>
                          <td>{t.frequency || t.submission_frequency || t.check_frequency || "-"}</td>
                          <td>{t.occurrences || t.occurrence_count || t.count || "-"}</td>
                        </>
                      ) : (
                        <>
                          <td>{t.actual ?? "-"}</td>
                          <td>{t.standard ?? "-"}</td>
                          <td>{t.threshold ?? "-"}</td>
                        </>
                      )}
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
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={activeTicketingView === "submission" ? "9" : "10"}
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
                      {t.ticket_id} | {t.machine_name || "-"}
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
                      {activeTicketingView === "submission" ? "Frequency" : "Actual"}
                    </div>
                    <div className={styles["sup-actual-value"]}>
                      {activeTicketingView === "submission"
                        ? t.frequency || t.submission_frequency || t.check_frequency || "-"
                        : t.actual ?? "-"}
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
                    {SUPERVISOR_VISIBLE_STATUS_OPTIONS.map((option) => (
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

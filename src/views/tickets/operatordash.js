import { useState, useEffect, useRef } from "react";
import styles from "../../styles/operator.module.css";
import { useRouter } from "next/router";
import Image from "next/image";
import { FiCalendar, FiPlus } from "react-icons/fi";
import { MdFilterList } from "react-icons/md";
import { useSelector } from "react-redux";
import { getOperatorTickets, getSubmissionTickets, updateOperatorTicketStatus } from "../../apis/operatorApi";
import OperatorCreateTicket from "./OperatorCreateTicket";
import {
    isPpBatchCompletionTicketRecord,
    isSubmissionTicketRecord,
    transformTicket,
} from "../../utils/ticketTransformer";
import { isSupervisorNavUser } from "../../utils/accessControl";
import {
    applyStoredTicketStatuses,
    getStatusClassKey,
    getOperatorStatusOptions,
    getOperatorStatusLabel,
    TICKET_STATUS_OPTIONS,
} from "../../utils/ticketStatus";

export default function operatorboard() {
    const authUser = useSelector((state) => state.auth?.user);
    const authToken = useSelector((state) => state.auth?.token);
    const isAuthHydrated = useSelector((state) => state.auth?.isHydrated);
    const [ticketData, setTicketData] = useState([]);
    const [apiSubmissionTicketData, setApiSubmissionTicketData] = useState([]);
    const [operatorSubmissionTicketData, setOperatorSubmissionTicketData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [thresholdError, setThresholdError] = useState("");
    const [submissionError, setSubmissionError] = useState("");
    const [showMobileFilter, setShowMobileFilter] = useState(false);
    const [showManualTicket, setShowManualTicket] = useState(false);
    const [statusUpdatingId, setStatusUpdatingId] = useState("");

    const [status, setStatus] = useState("All");
    const [severity, setSeverity] = useState("All");
    const [notebookType, setNotebookType] = useState("All");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [activeTicketingView, setActiveTicketingView] = useState("threshold");
    const startDateInputRef = useRef(null);
    const endDateInputRef = useRef(null);

    const resolveNotebookType = (ticket) =>
        String(
            ticket?.notebookType ||
            ticket?.notebook_type ||
            ticket?.notebook ||
            ticket?.machine_name ||
            ticket?.machine ||
            ""
        ).trim();

    const router = useRouter();
    const shouldUseSupervisorDashboard = isSupervisorNavUser(authUser);
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
    const formatDateDisplay = (value) => {
        if (!value) return "";
        const [year, month, day] = String(value).split("-");
        return year && month && day ? `${day}-${month}-${year}` : String(value);
    };

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 6;

    const formatSubmissionTicket = (ticket) => {
        const transformedTicket = transformTicket(ticket);
        const isPpBatchTicket = isPpBatchCompletionTicketRecord(ticket);
        // A PP batch ticket is only ever raised once L1 has already missed the completion
        // deadline, so its created_at IS the moment of breach — hours since then is the lag.
        const hoursLagged = Math.max(
            0,
            Math.round((Date.now() - transformedTicket.rawCreatedAt.getTime()) / (1000 * 60 * 60))
        );
            return {
                id: transformedTicket.ticket_id || ticket.ticket_id,
                machine:
                    ticket.notebook ||
                    transformedTicket.notebook ||
                    transformedTicket.machine_name ||
                    "Unknown",
            notebookType: resolveNotebookType({
                notebookType: transformedTicket.notebookType,
                notebook_type: transformedTicket.notebook_type,
                notebook: transformedTicket.notebook,
                machine_name: transformedTicket.machine_name,
                machine: transformedTicket.machine,
            }) || "Submission",
            parameter:
                ticket.parameter ||
                transformedTicket.parameter ||
                ticket.parameter_name?.[0] ||
                "submission_frequency",
            actual: "-",
            standard: "-",
            threshold: "-",
            frequency: isPpBatchTicket
                ? `${hoursLagged}h`
                : ticket.frequency ||
                  transformedTicket.frequency ||
                  transformedTicket.submission_frequency ||
                  transformedTicket.check_frequency ||
                  "-",
            occurrences: isPpBatchTicket
                ? 1
                : ticket.occurrences ??
                  ticket.configured_occurrences ??
                  transformedTicket.occurrences ??
                  transformedTicket.occurrence_count ??
                  transformedTicket.count ??
                  "-",
            severity: ticket.severity || transformedTicket.severity || "High",
            status: transformedTicket.status,
            rawCreatedAt: transformedTicket.rawCreatedAt,
            createdAt: transformedTicket.createdAt,
        };
    };

    useEffect(() => {
        if (!isAuthHydrated) {
            return;
        }
        if (!authToken) {
            setLoading(false);
            return;
        }
        if (shouldUseSupervisorDashboard) {
            router.replace("/supervisordashboard");
            return;
        }
        fetchTickets();
        fetchSubmissionTickets();
    }, [authToken, isAuthHydrated, shouldUseSupervisorDashboard]);

    if (shouldUseSupervisorDashboard) {
        return null;
    }

    const fetchTickets = async () => {
        try {
            setThresholdError("");
            const response = await getOperatorTickets({ page: 1, limit: 500, _ts: Date.now() });

            const ticketsArray = Array.isArray(response)
                ? response
                : response?.data?.tickets ||
                  response?.data?.rows ||
                  response?.data ||
                  response?.tickets ||
                  response?.rows ||
                  [];

            if (!ticketsArray.length && response && typeof response === "object") {
                console.warn("getOperatorTickets returned an unrecognized response shape:", response);
            }

            const normalizedTickets = applyStoredTicketStatuses(ticketsArray);
            const thresholdTickets = normalizedTickets.filter((ticket) => !isSubmissionTicketRecord(ticket));
            const submissionTickets = normalizedTickets.filter(isSubmissionTicketRecord);

            const formattedData = thresholdTickets
                .map((ticket) => {
                    const transformedTicket = transformTicket(ticket);

                    return {
                        id: transformedTicket.ticket_id,
                        machine: transformedTicket.machine_name,
                        notebookType:
                            resolveNotebookType(transformedTicket) ||
                            "Unknown",
                        parameter: transformedTicket.parameter,
                        actual: transformedTicket.actual,
                        standard: transformedTicket.standard,
                        threshold: transformedTicket.threshold,
                        frequency: transformedTicket.frequency || transformedTicket.submission_frequency || transformedTicket.check_frequency || "-",
                        occurrences: transformedTicket.occurrences || transformedTicket.occurrence_count || transformedTicket.count || "-",
                        severity: transformedTicket.severity,
                        status: transformedTicket.status,
                        rawCreatedAt: transformedTicket.rawCreatedAt,
                        createdAt: transformedTicket.createdAt,
                    };
                });

            setTicketData(formattedData);
            setOperatorSubmissionTicketData(submissionTickets.map(formatSubmissionTicket));
        } catch (error) {
            console.error("Error fetching tickets:", error);
            setTicketData([]);
            setOperatorSubmissionTicketData([]);
            setThresholdError(error.message || "Failed to fetch threshold tickets.");
        } finally {
            setLoading(false);
        }
    };

    const fetchSubmissionTickets = async () => {
        try {
            setSubmissionError("");
            const response = await getSubmissionTickets({ page: 1, limit: 500, _ts: Date.now() });
            const ticketsArray = Array.isArray(response)
                ? response
                : response?.data?.tickets ||
                  response?.data?.rows ||
                  response?.data ||
                  response?.tickets ||
                  response?.rows ||
                  [];

            if (!ticketsArray.length && response && typeof response === "object") {
                console.warn("getSubmissionTickets returned an unrecognized response shape:", response);
            }

            const formattedData = ticketsArray.map(formatSubmissionTicket);

            setApiSubmissionTicketData(formattedData);
        } catch (submissionError) {
            console.error("Error fetching submission tickets:", submissionError);
            setApiSubmissionTicketData([]);
            setSubmissionError(submissionError.message || "Failed to fetch submission tickets.");
        }
    };

    const handleStatusChange = async (ticketId, nextStatus) => {
        if (!ticketId || !nextStatus) return;

        try {
            setStatusUpdatingId(ticketId);
            await updateOperatorTicketStatus(ticketId, nextStatus);
            await fetchTickets();
        } catch (updateError) {
            setThresholdError(updateError.message || "Failed to update ticket status.");
        } finally {
            setStatusUpdatingId("");
        }
    };

    const getDisplayUniqueStatusOptions = (currentStatus) => {
        const options = getOperatorStatusOptions(currentStatus);
        const seenLabels = new Set();
        return options.filter((option) => {
            const label = getOperatorStatusLabel(option);
            if (seenLabels.has(label)) return false;
            seenLabels.add(label);
            return true;
        });
    };

    useEffect(() => {
        if (!isAuthHydrated || !authToken || shouldUseSupervisorDashboard || typeof window === "undefined") return;

        const refreshFromServer = () => {
            fetchTickets();
            fetchSubmissionTickets();
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
    }, [authToken, isAuthHydrated, shouldUseSupervisorDashboard]);

    if (loading) return <p>Loading tickets...</p>;

    const submissionTicketData = [
        ...apiSubmissionTicketData,
        ...operatorSubmissionTicketData.filter(
            (operatorTicket) =>
                operatorTicket?.id &&
                !apiSubmissionTicketData.some((apiTicket) => apiTicket?.id === operatorTicket.id)
        ),
    ];
    const activeDataSource = activeTicketingView === "submission" ? submissionTicketData : ticketData;
    const activeError = activeTicketingView === "submission" ? submissionError : thresholdError;

    const filteredTickets = activeDataSource.filter((t) => {
        const created = new Date(t.rawCreatedAt);
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        const normalizedTicketStatus = String(t.status || "").trim().toLowerCase();
        const normalizedFilterStatus = String(status || "").trim().toLowerCase();
        const statusMatch =
            status === "All" ||
            normalizedTicketStatus === normalizedFilterStatus ||
            (normalizedFilterStatus === "closed" && normalizedTicketStatus === "submit") ||
            (normalizedFilterStatus === "submit" && normalizedTicketStatus === "closed");

        if (end) end.setHours(23, 59, 59, 999);

        return (
            statusMatch &&
            (severity === "All" || t.severity === severity) &&
            (notebookType === "All" || t.notebookType === notebookType) &&
            (!start || created >= start) &&
            (!end || created <= end)
        );
    });

    const displayTickets = filteredTickets;

    const totalPages = Math.ceil(displayTickets.length / ITEMS_PER_PAGE);
    const indexOfLast = currentPage * ITEMS_PER_PAGE;
    const indexOfFirst = indexOfLast - ITEMS_PER_PAGE;
    const currentTickets = displayTickets.slice(indexOfFirst, indexOfLast);
    const uniqueNotebookTypes = [
        "All",
        ...new Set(activeDataSource.map((t) => resolveNotebookType(t)).filter(Boolean)),
    ];

    return (
        <div className={styles.page}>
            
           

            {/* MOBILE NAVBAR */}
            <header className={styles["mobile-navbar"]}>
                <div className={styles["mobile-hamburger"]}>☰</div>
                <div className={styles["mobile-logo"]}>
                    <Image src="/logo.png" alt="DSM Logo" width={40} height={40} />
                </div>
            </header>

            {/* TITLE & FILTER BUTTON */}
            <div className={styles["mobile-title-row"]}>
                <h1 className={styles.title}>L1 Ticketing Dashboard</h1>
                <div className={styles["title-actions"]}>
                    <button
                        type="button"
                        className={styles["manual-ticket-btn"]}
                        onClick={() => setShowManualTicket(true)}
                    >
                        <FiPlus aria-hidden="true" />
                        <span>Manual Ticket</span>
                    </button>
                    <button
                        className={styles["mobile-filter-btn"]}
                        onClick={() => setShowMobileFilter(true)}
                    >
                        <MdFilterList className={styles["filter-icon-img"]} />Filter
                    </button>
                </div>
            </div>

            <div className={styles["ticketing-toggle"]}>
                <button
                    type="button"
                    className={`${styles["ticketing-toggle-btn"]} ${activeTicketingView === "threshold" ? styles["ticketing-toggle-btn-active"] : ""}`}
                    onClick={() => {
                        setActiveTicketingView("threshold");
                        setCurrentPage(1);
                    }}
                >
                    Threshold Ticket
                </button>
                <button
                    type="button"
                    className={`${styles["ticketing-toggle-btn"]} ${activeTicketingView === "submission" ? styles["ticketing-toggle-btn-active"] : ""}`}
                    onClick={() => {
                        setActiveTicketingView("submission");
                        setCurrentPage(1);
                    }}
                >
                    Submission Ticket
                </button>
            </div>

            {activeError && (
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
                    {activeTicketingView === "threshold"
                        ? "Threshold tickets could not be loaded. The backend returned: "
                        : "Submission tickets could not be loaded. The backend returned: "}
                    {activeError}
                </div>
            )}

            {/* DESKTOP FILTERS */}
            <div className={styles.filtrs}>
                <Filter
                    label="Status"
                    value={status}
                    onChange={setStatus}
                    options={["All", ...TICKET_STATUS_OPTIONS]}
                />

                <Filter
                    label="Severity"
                    value={severity}
                    onChange={setSeverity}
                    options={["All", "High", "Medium", "Low"]}
                />

                <Filter
                    label="Notebook Type"
                    value={notebookType}
                    onChange={setNotebookType}
                    options={uniqueNotebookTypes}
                />

                {/* Start & End Dates */}
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

            {/* TABLE WRAPPER */}
            <div className={styles["table-wrapper"]}>
                <table className={styles.tableWrapperTable}>
                    <thead>
                        <tr>
                            <th>TICKET ID</th>
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

                        {currentTickets.map((t) => (
                            <tr
                                key={t.id} // Use 't.id', not 'ticket.id'
                                style={{ cursor: "pointer" }}
                                onClick={() => router.push(`/operatordetail?ticketId=${encodeURIComponent(t.id.replace("#", ""))}&ticketType=${activeTicketingView}`)}
                            >
                                <td className={styles["ticket-link"]}>{t.id}</td>
                                <td>{t.machine}</td>
                                <td>{t.parameter}</td>
                                {activeTicketingView === "submission" ? (
                                    <>
                                        <td>{t.frequency || "-"}</td>
                                        <td>{t.occurrences || "-"}</td>
                                    </>
                                ) : (
                                    <>
                                        <td>{t.actual}</td>
                                        <td>{t.standard}</td>
                                        <td>{t.threshold}</td>
                                    </>
                                )}
                                <td>
                                    <span className={`${styles.badge} ${styles[t.severity?.toLowerCase()]}`}>
                                        {t.severity}
                                    </span>
                                </td>
                                <td>
                                    <select
                                        className={styles["status-select"]}
                                        value={t.status}
                                        disabled={statusUpdatingId === t.id}
                                        onClick={(event) => event.stopPropagation()}
                                        onChange={(event) => handleStatusChange(t.id, event.target.value)}
                                    >
                                        {getDisplayUniqueStatusOptions(t.status).map((option) => (
                                            <option key={option} value={option}>
                                                {getOperatorStatusLabel(option)}
                                            </option>
                                        ))}
                                    </select>
                                </td>
                                <td>{t.createdAt}</td>
                            </tr>
                        ))}
                        {currentTickets.length === 0 && (
                            <tr>
                                <td colSpan={9} style={{ textAlign: "center", color: "#667085" }}>
                                    No tickets found for the selected filters.
                                </td>
                            </tr>
                        )}

                    </tbody>
                </table>

                {/* TABLE FOOTER */}
                <div className={styles["table-footer"]}>
                    <span>
                        Showing {displayTickets.length ? indexOfFirst + 1 : 0}–{Math.min(indexOfLast, displayTickets.length)} of {displayTickets.length}
                    </span>

                    <div className={styles.pagination}>
                        <button disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>«</button>
                        <button disabled={currentPage === 1} onClick={() => setCurrentPage(currentPage - 1)}>‹</button>
                        {Array.from({ length: totalPages }, (_, i) => (
                            <button key={i} className={currentPage === i + 1 ? styles.active : ""}
                                onClick={() => setCurrentPage(i + 1)}>{i + 1}</button>
                        ))}
                        <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(currentPage + 1)}>›</button>
                        <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>»</button>
                    </div>
                </div>
            </div>

            {/* MOBILE CARD VIEW */}
            <div className={styles["mobile-cards"]}>
                {showMobileFilter && (
                    <>
                        <div className={styles["filter-overlay"]} onClick={() => setShowMobileFilter(false)} />
                        <div className={styles["mobile-filter-modal"]}>
                            <div className={styles["filter-header"]}>
                                <h3>Filter</h3>
                                <span onClick={() => setShowMobileFilter(false)}>✕</span>
                            </div>
                            <div className={styles["filter-body"]}>
                                <label>Status</label>
                                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                                    <option>All</option>
                                    {TICKET_STATUS_OPTIONS.map((option) => (
                                        <option key={option} value={option}>{getOperatorStatusLabel(option)}</option>
                                    ))}
                                </select>

                                <label>Severity</label>
                                <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                                    <option>All</option><option>High</option><option>Medium</option><option>Low</option>
                                </select>

                                <label>Notebook Type</label>
                                <select value={notebookType} onChange={(e) => setNotebookType(e.target.value)}>
                                    <option>All</option>
                                    {[...new Set(activeDataSource.map((t) => resolveNotebookType(t)).filter(Boolean))].map((type) => (
                                        <option key={type}>{type}</option>
                                    ))}
                                </select>

                                <label>Date Range</label>
                                <div className={styles["date-row"]}>
                                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                                </div>
                            </div>

                            <div className={styles["filter-footer"]}>
                                <button className={styles["reset-btn"]} onClick={() => {
                                    setStatus("All"); setSeverity("All"); setNotebookType("All"); setStartDate(""); setEndDate("");
                                }}>Reset</button>
                                <button className={styles["apply-btn"]} onClick={() => setShowMobileFilter(false)}>Apply Filter</button>
                            </div>
                        </div>
                    </>
                )}

                {displayTickets.map((t) => (
                    <div key={t.id} className={styles["mobile-card"]} onClick={() => router.push(`/operatordetail?ticketId=${encodeURIComponent(t.id.replace("#", ""))}&ticketType=${activeTicketingView}`)}>
                        <div className={styles["card-top"]}>
                            <div className={styles["left-section"]}>
                                <div className={styles["card-id-machine"]}>{t.id} | {t.machine}</div>
                                <div className={styles["card-date"]}>{t.createdAt}</div>
                            </div>
                            <span className={`${styles["severity-badge"]} ${t.severity?.toLowerCase() === "high" ? styles["severity-high"] : t.severity?.toLowerCase() === "medium" ? styles["severity-medium"] : styles["severity-low"]}`}>
                                {t.severity}
                            </span>
                        </div>

                        <div className={styles["param-box"]}>
                            <div className={styles["param-item"]}>
                                <div className={styles["small-label"]}>Parameter</div>
                                <div className={styles["param-name"]}>{t.parameter}</div>
                            </div>
                            <div className={styles["param-item"]}>
                                <div className={styles["small-label"]}>Actual</div>
                                <div className={styles["actual-value"]}>{t.actual}</div>
                            </div>
                        </div>

                        <div className={styles["card-bottom"]}>
                            <div className={styles["status-left"]} onClick={(event) => event.stopPropagation()}>
                                <span className={`${styles["status-dot"]} ${styles[getStatusClassKey(t.status).replace(/-/g, "_")]}`}></span>
                                <select
                                    className={styles["mobile-status-select"]}
                                    value={t.status}
                                    disabled={statusUpdatingId === t.id}
                                    onChange={(event) => handleStatusChange(t.id, event.target.value)}
                                >
                                    {getDisplayUniqueStatusOptions(t.status).map((option) => (
                                        <option key={option} value={option}>
                                            {getOperatorStatusLabel(option)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className={styles["details-link"]}>Details &gt;</div>
                        </div>
                    </div>
                ))}
            </div>

            {showManualTicket && (
                <OperatorCreateTicket
                    onClose={() => setShowManualTicket(false)}
                    onCreated={fetchTickets}
                />
            )}
        </div >
    );
}

/* FILTER COMPONENT */
function Filter({ label, value, onChange, options }) {
    return (
        <div className={styles["sup-filter"]}>
            <label>{label}</label>
            <select className={styles["sup-select"]} value={value} onChange={(e) => onChange(e.target.value)}>
                {options.map(opt => <option key={opt}>{opt}</option>)}
            </select>
        </div>
    );
}

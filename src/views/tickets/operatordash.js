import { useState, useEffect } from "react";
import styles from "../../styles/operator.module.css";
import { useRouter } from "next/router";
import Image from "next/image";
import { FiPlus } from "react-icons/fi";
import { getOperatorTickets } from "../../apis/operatorApi";
import OperatorCreateTicket from "./OperatorCreateTicket";
import {
    formatThresholdValue,
    formatStandardValue,
    getTicketValueForParameter,
} from "../../utils/ticketTransformer";
import {
    applyStoredTicketStatuses,
    getStatusClassKey,
    getOperatorStatusOptions,
    setStoredTicketStatus,
    TICKET_STATUS_OPTIONS,
} from "../../utils/ticketStatus";

export default function operatorboard() {
    const [ticketData, setTicketData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showMobileFilter, setShowMobileFilter] = useState(false);
    const [showManualTicket, setShowManualTicket] = useState(false);

    const [status, setStatus] = useState("All");
    const [severity, setSeverity] = useState("All");
    const [machine, setMachine] = useState("All");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    const router = useRouter();

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 6;

    useEffect(() => {
        fetchTickets();
    }, []);

    const fetchTickets = async () => {
        try {
            setError("");
            const response = await getOperatorTickets();

            const ticketsArray = Array.isArray(response)
                ? response
                : response?.data || response?.tickets || [];

            const formattedData = applyStoredTicketStatuses(ticketsArray).map((ticket) => {
                const createdDate = new Date(ticket.created_at);

                return {
                    id: ticket.ticket_id,
                    machine: ticket.machine_name,
                    parameter: ticket.parameter_name?.[0] || "-",
                    actual: getTicketValueForParameter(
                        ticket.actual_value,
                        ticket.parameter_name?.[0]
                    ),
                    standard: formatStandardValue(
                        getTicketValueForParameter(
                            ticket.threshold_value,
                            ticket.parameter_name?.[0]
                        )
                    ),
                    threshold: formatThresholdValue(
                        getTicketValueForParameter(
                            ticket.threshold_value,
                            ticket.parameter_name?.[0]
                        )
                    ),
                    severity: ticket.severity,
                    status: ticket.status,
                    rawCreatedAt: createdDate,
                    createdAt: createdDate.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                    }),
                };
            });

            setTicketData(formattedData);
        } catch (error) {
            console.error("Error fetching tickets:", error);
            setError(error.message || "Failed to fetch tickets.");
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <p>Loading tickets...</p>;
    if (error) return <p>{error}</p>;

    const filteredTickets = ticketData.filter((t) => {
        const created = new Date(t.rawCreatedAt);
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;

        if (end) end.setHours(23, 59, 59, 999);

        return (
            (status === "All" || t.status === status) &&
            (severity === "All" || t.severity === severity) &&
            (machine === "All" || t.machine === machine) &&
            (!start || created >= start) &&
            (!end || created <= end)
        );
    });

    const totalPages = Math.ceil(filteredTickets.length / ITEMS_PER_PAGE);
    const indexOfLast = currentPage * ITEMS_PER_PAGE;
    const indexOfFirst = indexOfLast - ITEMS_PER_PAGE;
    const currentTickets = filteredTickets.slice(indexOfFirst, indexOfLast);

    return (
        <div className={styles.page}>
            {/* NAVBAR */}
           

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
                        <img src="/filter.png" alt="filter" className={styles["filter-icon-img"]} />Filter
                    </button>
                </div>
            </div>

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
                    label="Machine"
                    value={machine}
                    onChange={setMachine}
                    options={[
                        "All", "Dyeing Vat 2", "Spinner C-14", "Winder W-12", "Drawframe D-02",
                        "Dyeing Vat 1", "Spinner C-15", "Draw Frame D-05", "Central Compressor",
                        "Sizing Range S-2", "Wash Range W-1", "Carding Unit 3", "Knitting Machine K-04",
                        "Auto-Coner A-1", "Winder W-11", "Auto-Coner AC-05"
                    ]}
                />

                {/* Start & End Dates */}
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

            {/* TABLE WRAPPER */}
            <div className={styles["table-wrapper"]}>
                <table className={styles.tableWrapperTable}>
                    <thead>
                        <tr>
                            <th>TICKET ID</th>
                            <th>MACHINE</th>
                            <th>PARAMETER</th>
                            <th>ACTUAL</th>
                            <th>STANDARD</th>
                            <th>THRESHOLD</th>
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
                                onClick={() => router.push(`/operator/${t.id.replace("#", "")}`)}
                            >
                                <td className={styles["ticket-link"]}>{t.id}</td>
                                <td>{t.machine}</td>
                                <td>{t.parameter}</td>
                                <td>{t.actual}</td>
                                <td>{t.standard}</td>
                                <td>{t.threshold}</td>
                                <td>
                                    <span className={`${styles.badge} ${styles[t.severity?.toLowerCase()]}`}>
                                        {t.severity}
                                    </span>
                                </td>
                                <td>
                                    <select
                                        className={styles["status-select"]}
                                        value={t.status}
                                        onClick={(event) => event.stopPropagation()}
                                        onChange={(event) => {
                                            const nextStatus = event.target.value;
                                            setStoredTicketStatus(t.id, nextStatus);
                                            setTicketData((current) =>
                                                current.map((ticket) =>
                                                    ticket.id === t.id ? { ...ticket, status: nextStatus } : ticket
                                                )
                                            );
                                        }}
                                    >
                                        {getOperatorStatusOptions(t.status).map((option) => (
                                            <option key={option} value={option}>
                                                {option}
                                            </option>
                                        ))}
                                    </select>
                                </td>
                                <td>{t.createdAt}</td>
                            </tr>
                        ))}

                    </tbody>
                </table>

                {/* TABLE FOOTER */}
                <div className={styles["table-footer"]}>
                    <span>
                        Showing {indexOfFirst + 1}–{Math.min(indexOfLast, filteredTickets.length)} of {filteredTickets.length}
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
                                    {TICKET_STATUS_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                                </select>

                                <label>Severity</label>
                                <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                                    <option>All</option><option>High</option><option>Medium</option><option>Low</option>
                                </select>

                                <label>Machine</label>
                                <select value={machine} onChange={(e) => setMachine(e.target.value)}>
                                    <option>All</option>
                                    {[...new Set(ticketData.map(t => t.machine))].map(m => <option key={m}>{m}</option>)}
                                </select>

                                <label>Date Range</label>
                                <div className={styles["date-row"]}>
                                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                                </div>
                            </div>

                            <div className={styles["filter-footer"]}>
                                <button className={styles["reset-btn"]} onClick={() => {
                                    setStatus("All"); setSeverity("All"); setMachine("All"); setStartDate(""); setEndDate("");
                                }}>Reset</button>
                                <button className={styles["apply-btn"]} onClick={() => setShowMobileFilter(false)}>Apply Filter</button>
                            </div>
                        </div>
                    </>
                )}

                {filteredTickets.map((t) => (
                    <div key={t.id} className={styles["mobile-card"]} onClick={() => router.push(`/operator/${t.id.replace("#", "")}`)}>
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
                                    onChange={(event) => {
                                        const nextStatus = event.target.value;
                                        setStoredTicketStatus(t.id, nextStatus);
                                        setTicketData((current) =>
                                            current.map((ticket) =>
                                                ticket.id === t.id ? { ...ticket, status: nextStatus } : ticket
                                            )
                                        );
                                    }}
                                >
                                    {getOperatorStatusOptions(t.status).map((option) => (
                                        <option key={option} value={option}>
                                            {option}
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

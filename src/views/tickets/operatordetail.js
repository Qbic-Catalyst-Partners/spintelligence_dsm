// pages/operator/[ticketId].js
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Image from "next/image";
import { useDispatch, useSelector } from "react-redux";
import { fetchOperatorTicketById } from "../../store/slices/operatorSlice";
import styles from "../../styles/operatordetail.module.css";
import { IoTimeSharp, IoChevronBackSharp } from "react-icons/io5";
import axios from "axios";

export default function TicketDetails() {
    const router = useRouter();
    const { ticketId } = router.query;
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [comment, setComment] = useState("");
    const [expanded, setExpanded] = useState(false);

    const formatDateTime = (dateString) => {
        if (!dateString) return "-";
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "-";
        return date.toLocaleString("en-US", {
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
        });
    };

    const dispatch = useDispatch();

    const {
        ticketDetail: ticket,
        ticketDetailLoading: loading,
        ticketDetailError: error,
    } = useSelector((state) => state.operator);

    useEffect(() => {
        if (ticketId) {
            const backendId = ticketId.startsWith("#") ? ticketId : `#${ticketId}`;
            dispatch(fetchOperatorTicketById(backendId));
        }
    }, [ticketId, dispatch]);

    if (error) return <p>Error: {error}</p>;

    const handleSubmit = async () => {
        if (!comment.trim()) {
            alert("Please enter resolution comment");
            return;
        }

        try {
            const encodedId = encodeURIComponent(ticket.ticket_id);

            const res = await axios.put(
                `${process.env.NEXT_PUBLIC_API_URL}/operator-tickets/submit/${encodedId}`,
                { resolution_comment: comment }
            );

            alert(res.data.message);

            setTicket((prev) => ({
                ...prev,
                status: res.data.ticket.status,
            }));

            setIsPopupOpen(false);
            setComment("");
        } catch (err) {
            console.error("Backend error:", err.response?.data);
            alert(err.response?.data?.message || "Submit failed");
        }
    };

    const parameterMap =
        Array.isArray(ticket?.parameter_name)
            ? ticket.parameter_name.map((param) => {
                const key = param.toLowerCase();
                const actualKey = Object.keys(ticket.actual_value || {}).find((k) =>
                    k.toLowerCase().includes(key.split(" ")[0])
                );
                const thresholdKey = Object.keys(ticket.threshold_value || {}).find((k) =>
                    k.toLowerCase().includes(key.split(" ")[0])
                );
                return {
                    name: param,
                    actual: actualKey ? ticket.actual_value[actualKey] : "-",
                    threshold: thresholdKey ? ticket.threshold_value[thresholdKey] : "-",
                };
            })
            : [];

    if (loading) return <p>Loading ticket details...</p>;
    if (!ticket) return <p>Ticket not found.</p>;

    return (
        <div className={styles.ticketPage}>
            {/* MOBILE NAVBAR */}
            <header className={styles.mobileNavbar}>
                <div className={styles.mobileHamburger}>☰</div>
                <div className={styles.mobileLogo}>
                    <Image src="/logo.png" alt="logo" width={140} height={40} />
                </div>
            </header>

            <div className={styles.mobileView}>
                {/* Ticket Header */}
                <div className={styles.ticketTopRows}>
                    <div className={styles.ticketLeft}>
                        <IoChevronBackSharp
                            className={styles.backArrow}
                            onClick={() => router.push("/operator")}
                        />
                        <div>
                            <strong>{ticket.ticket_id}</strong>
                            <br />
                            <span className={`${styles.statusBadge} ${styles[ticket.status.toLowerCase().replace(/\s+/g, "_")]}`}>
                                {ticket.status}
                            </span>
                        </div>
                    </div>
                    <div className={`${styles.severityBadge} ${styles[ticket.severity.toLowerCase()]}`}>
                        Severity: {ticket.severity}
                    </div>
                </div>

                {/* Parameter Table */}
                <div className={styles.mobileInfoCard}>
                    <div className={styles.infoRow}>
                        <div>
                            <span className={styles.label}>MACHINE</span>
                            <p className={styles.value}>{ticket.machine_name}</p>
                        </div>
                        <div>
                            <span className={styles.label}>CREATED AT</span>
                            <p className={styles.value}>{formatDateTime(ticket.created_at)}</p>
                        </div>
                    </div>

                    <div className={styles.paramGridHeader}>
                        <span className={styles.para}>PARAMETER</span>
                        <span className={styles.act}>ACTUAL</span>
                        <span className={styles.thresh}>THRESHOLD</span>
                    </div>

                    {parameterMap.map((p, index) => (
                        <div key={index} className={styles.paramGrid}>
                            <span className={styles.yarnValue}>{p.name}</span>
                            <span className={styles.actual}>{p.actual}</span>
                            <span className={styles.values}>{p.threshold}</span>
                        </div>
                    ))}
                </div>

                {/* Timeline */}
                <div className={styles.timelineCards}>
                    <h3>
                        <IoTimeSharp /> Activity Timeline
                    </h3>
                    {/* Example timeline items */}
                    <div className={styles.timelineItem}>
                        <div className={styles.dotBlue}></div>
                        <div className={styles.content}>
                            <Image src="/ticket-creat.png" alt="logo" width={140} height={40} />
                            <div className={styles.time}>10:30 AM</div>
                            <h4>Ticket Created</h4>
                            <p>Automated system alert triggered by vibration sensor RF-04-S2</p>
                        </div>
                    </div>
                </div>

                <button className={styles.mobileFixBtn} onClick={() => setIsPopupOpen(true)}>

                    <Image src="/fix.png" alt="logo" width={140} height={40} />

                    Fix & Resubmit
                </button>

                {isPopupOpen && (
                    <div className={styles.mobilePopupOverlay}>
                        <div className={styles.mobilePopupModal}>
                            <h3>Fix & Resubmit</h3>
                            <textarea
                                className={styles.mobileTextarea}
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                maxLength={500}
                                placeholder="Enter resolution comment"
                            />
                            <div className={styles.mobileCharCount}>{comment.length}/500</div>
                            <button onClick={handleSubmit}>Submit</button>
                            <button onClick={() => setIsPopupOpen(false)}>Cancel</button>
                        </div>
                    </div>
                )}
            </div>

            {/* Desktop View */}
            <div className={styles.desktopView}>
                {/* Top Navbar */}
                <header className={styles.topNavbar}>
                    <div className={styles.navLeft}>
                        <div className={styles.spintelLogo}>
                            <Image src="/spintel.svg" width={88} height={88} alt="Spintel" />
                            
                        </div>
                    </div>
                    <div className={styles.navRight}>
                        <Image src="/logo.png" width={140} height={40} alt="Company Logo" />
                    </div>
                </header>

                {/* Breadcrumb */}
                <div className={styles.breadcrumb}>
                    <a href="/operator" className={styles.breadcrumbLink}>Tickets</a>
                    <span className={styles.breadcrumbSeparator}>&gt;</span>
                    <span className={styles.breadcrumbCurrent}>{ticket.ticket_id}</span>
                </div>
                {/* Timeline */}
                <div className={styles.timelineCards}>
                    <h3>
                        <IoTimeSharp /> Activity Timeline
                    </h3>
                    {/* Example timeline items */}
                    <div className={styles.timelineItem}>
                        <div className={styles.dotBlue}></div>
                        <div className={styles.content}>
                            <Image src="/ticket-creat.png" alt="logo" width={140} height={40} />
                            <div className={styles.time}>10:30 AM</div>
                            <h4>Ticket Created</h4>
                            <p>Automated system alert triggered by vibration sensor RF-04-S2</p>
                        </div>
                    </div>
                </div>

                {/* Ticket Card */}
                <div className={`${styles.ticketCard} ${expanded ? styles.expanded : ""}`}>
                    <div className={styles.ticketHeader}>
                        <div className={styles.ticketHeaderLeft}>
                            <div className={styles.ticketTitleRow}>
                                <div className={styles.ticketId}>{ticket.ticket_id}</div>
                                <span className={`${styles.badgeStatus} ${styles[ticket.status.toLowerCase().replace(/\s+/g, "_")]}`}>
                                    {ticket.status}
                                </span>
                                <span className={`${styles.badgeSeverity} ${styles[ticket.severity.toLowerCase()]}`}>
                                    {ticket.severity}
                                </span>
                            </div>
                        </div>
                        <button onClick={() => setIsPopupOpen(true)} className={styles.fixBtn}>
                            <Image src="/images/Fix-btn.svg" width={24} height={24} alt="Fix Button" />
                            Fix & Resubmit
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { IoTime, IoChevronBackSharp } from "react-icons/io5";
import styles from "../../styles/SupervisorDetails.module.css";
import Link from "next/link";
import { useDispatch, useSelector } from "react-redux";
import {
  approveTicket,
  rejectTicket,
} from "../../store/slices/supervisorSlice";
import {
  formatThresholdValue,
  formatStandardValue,
  getTicketValueForParameter,
} from "../../utils/ticketTransformer";

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

const timelineItems = [
  {
    time: "10:30 AM",
    title: "Ticket Created",
    description: "System generated alert : RPM Threshold Exceeded",
    icon: "/created.png",
    alt: "Created",
  },
  {
    time: "11:25 AM",
    title: "Maintenance Started",
    description: "Operator John Doe took ownership",
    icon: "/maintenance.png",
    alt: "Maintenance Started",
  },
  {
    time: "12:45 PM",
    title: "Awaiting Approval",
    description: "Resolution submitted by John Doe",
    icon: "/awaiting.png",
    alt: "Awaiting Approval",
  },
];

export default function SupervisorDetails() {
  const router = useRouter();
  const { ticketId } = router.query;

  const dispatch = useDispatch();
  const { actionLoading } = useSelector((state) => state.supervisor);

  const [ticket, setTicket] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!router.isReady) return;

    const fetchTicket = async () => {
      const id = Array.isArray(ticketId) ? ticketId[0] : ticketId;
      const formattedId = id?.startsWith("#") ? id : `#${id}`;
      const encodedId = encodeURIComponent(formattedId);

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/operator-tickets/${encodedId}`
        );
        const data = await res.json();
        setTicket(data);
      } catch (err) {
        console.error(err);
      }
    };

    if (ticketId) fetchTicket();
  }, [router.isReady, ticketId]);

  const handleApprove = async () => {
    try {
      await dispatch(approveTicket(ticket.ticket_id)).unwrap();
      router.push("/supervisordashboard");
    } catch (err) {
      alert(err);
    }
  };

  const handleReject = async () => {
    if (!reason.trim()) {
      alert("Enter rejection reason");
      return;
    }

    try {
      await dispatch(
      rejectTicket({ ticketId: ticket.ticket_id, reason })
      ).unwrap();

      setShowRejectModal(false);
      setReason("");
      router.push("/supervisordashboard");
    } catch (err) {
      alert(err);
    }
  };

  if (!ticket) return <p className={styles.loading}>Loading...</p>;

  const keys = Object.keys(ticket.actual_value || {});
  const visibleKeys = expanded ? keys : keys.slice(0, 1);

  return (
    <div>
      <div className={styles.page}>
        

        <div className={styles.breadcrumb}>
          <Link href="/supervisordashboard">Tickets</Link> &gt;{" "}
          <span className={styles.current}>
            Review Ticket {ticket.ticket_id}
          </span>
        </div>

        <div className={styles.card}>
          <div className={styles.cardTop}>
            <div>
              <h2>{ticket.ticket_id}</h2>

              <div className={styles.badges}>
                <span
                  className={`${styles.status} ${ticket.status?.toLowerCase() === "closed" ? styles.closed : ""}`}
                >
                  {ticket.status}
                </span>
                <span className={styles.severity}>
                  Severity: {ticket.severity}
                </span>
              </div>

              <p className={styles.desc}>
                Industrial sensor alert: Mechanical stress detected on main spindle
              </p>
            </div>

            <div className={styles.right}>
              <div>
                <span>OPERATOR</span>
                <strong>{ticket.user_name}</strong>
              </div>

              <div className={styles.actions}>
                <button
                  className={styles.reject}
                  onClick={() => setShowRejectModal(true)}
                >
                  Reject
                </button>

                <button
                  className={styles.accept}
                  onClick={handleApprove}
                  disabled={actionLoading}
                >
                  Accept
                </button>
              </div>
            </div>
          </div>

          <table className={styles.table}>
            <thead>
              <tr>
                <th>MACHINE ID</th>
                <th>PARAMETER</th>
                <th>ACTUAL VALUE</th>
                <th>STANDARD VALUE</th>
                <th>THRESHOLD VALUE</th>
                <th>CREATED AT</th>
              </tr>
            </thead>

            <tbody>
              {visibleKeys.map((key, i) => (
                <tr key={i}>
                  <td>{ticket.machine_name}</td>
                  <td>{key.toUpperCase()}</td>
                  <td style={{ color: "#CA0000" }}>
                    {getTicketValueForParameter(ticket?.actual_value, key)}
                  </td>
                  <td>
                    {formatStandardValue(
                      getTicketValueForParameter(ticket?.threshold_value, key)
                    )}
                  </td>
                  <td>
                    {formatThresholdValue(
                      getTicketValueForParameter(ticket?.threshold_value, key)
                    )}
                  </td>
                  <td>{formatDateTime(ticket.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {keys.length > 1 && (
            <div
              className={styles.dots}
              onClick={() => setExpanded(!expanded)}
            >
              ...
            </div>
          )}
        </div>

        {showRejectModal && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalBox}>
              <h3 className={styles.modalTitle}>
                <span className={styles.warningIcon}>!</span>
                Reject Ticket
              </h3>

              <p className={styles.modalDesc}>
                You are about to reject the resolution for Ticket{" "}
                <b>{ticket.ticket_id}</b>. This action will notify the technician
                and reopen the ticket for further action.
              </p>

              <label className={styles.modalLabel}>
                Rejection Reason <span>*</span>
              </label>

              <textarea
                placeholder="Please explain why this resolution is being rejected..."
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />

              <div className={styles.modalFooterText}>
                <span>Provide specific details for the technician</span>
                <span>{reason.length} / 500 characters</span>
              </div>

              <div className={styles.modalActions}>
                <button onClick={() => setShowRejectModal(false)}>
                  Cancel
                </button>
                <button onClick={handleReject}>
                  Reject Ticket
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={styles.bottom}>
          <div className={styles.timeline}>
            <div className={styles.timelineHeader}>
              <IoTime />
              <h3>Activity Timeline</h3>
            </div>

            {timelineItems.map((item, index) => (
              <div className={styles.item} key={item.title}>
                <span className={styles.itemTime}>{item.time}</span>
                <div className={styles.itemContent}>
                  <img src={item.icon} alt={item.alt} className={styles.timelineIcon} />
                  <div>
                    <p><b>{item.title}</b></p>
                    <p>{item.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.resolution}>
            <h3>Resolution Submission</h3>

            <label>OPERATOR'S COMMENT</label>
            <div className={styles.comment}>
              "Check the lubricant levels. It seems the main bearing is overheating.
              Need to replace the grease and re-test the vibration levels. Proceed
              with caution."
            </div>

            <button className={styles.review}>
              Review Submission
            </button>
          </div>
        </div>
      </div>

      <div className={styles.mobileHeader}>
        <span className={styles.menu}>☰</span>
        <img src="/logo.png" className={styles.mobileLogo} alt="Logo" />
      </div>

      <div className={styles.mobileContainer}>
        <div className={styles.ticketTop}>
          <div className={styles.left}>
            <span
              className={styles.back}
              onClick={() => router.push("/supervisordashboard")}
            >
              <IoChevronBackSharp />
            </span>

            <div>
              <strong>{ticket.ticket_id}</strong>
              <span className={styles.status}>Status: {ticket.status}</span>
            </div>
          </div>

          <span className={styles.severity}>
            Severity: {ticket.severity}
          </span>
        </div>

        <div className={styles.operator}>
          <span>OPERATOR</span>
          <strong>{ticket.user_name}</strong>
        </div>

        <div className={styles.card}>
          <div className={styles.row}>
            <div>
              <span>MACHINE</span>
              <p>{ticket.machine_name}</p>
            </div>

            <div>
              <span>CREATED AT</span>
              <p>{formatDateTime(ticket.created_at)}</p>
            </div>
          </div>

          <div className={styles.tableHeader}>
            <span>PARAMETER</span>
            <span>ACTUAL</span>
            <span>STANDARD</span>
            <span>THRESHOLD</span>
          </div>

          {visibleKeys.map((key, i) => (
            <div className={styles.tableRow} key={i}>
              <span>{key.replace("_", " ")}</span>
              <span className={styles.actual}>
                {getTicketValueForParameter(ticket.actual_value, key)}
              </span>
              <span>
                {formatStandardValue(
                  getTicketValueForParameter(ticket.threshold_value, key)
                )}
              </span>
              <span>
                {formatThresholdValue(
                  getTicketValueForParameter(ticket.threshold_value, key)
                )}
              </span>
            </div>
          ))}

          {keys.length > 1 && (
            <div
              className={styles.dots}
              onClick={() => setExpanded(!expanded)}
            >
              ...
            </div>
          )}
        </div>

        <div className={styles.timelineCard}>
          <div className={styles.timelineHeader}>
            <IoTime />
            <h3>Activity Timeline</h3>
          </div>

          <div className={styles.timelineWrap}>
            {timelineItems.map((item) => (
              <div className={styles.timelineItem} key={item.title}>
                <span className={styles.time}>{item.time}</span>
                <div className={styles.iconCol}>
                  <img src={item.icon} alt={item.alt} />
                  <div className={styles.line}></div>
                </div>
                <div className={styles.content}>
                  <b>{item.title}</b>
                  <p>{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.resolutionCard}>
          <h4>Resolution Submission</h4>

          <span className={styles.commentLabel}>
            OPERATOR'S COMMENT
          </span>

          <div className={styles.commentBox}>
            "Check the lubricant levels. It seems the main bearing is overheating.
            Need to replace the grease and re-test the vibration levels. Proceed
            with caution."
          </div>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.reject}
            onClick={() => setShowRejectModal(true)}
          >
            Reject
          </button>

          <button
            className={styles.accept}
            onClick={handleApprove}
          >
            Accept
          </button>
        </div>

        {showRejectModal && (
          <div
            className={styles.modalOverlay}
            onClick={() => setShowRejectModal(false)}
          >
            <div
              className={styles.modalBox}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>
                  <span className={styles.warningIcon}>!</span>
                  Reject Ticket
                </div>

                <span
                  className={styles.closeBtn}
                  onClick={() => setShowRejectModal(false)}
                >
                  ×
                </span>
              </div>

              <p className={styles.modalDesc}>
                You are about to reject the resolution for Ticket{" "}
                <b>{ticket.ticket_id}</b>. This action will notify the technician
                and reopen the ticket for further action.
              </p>

              <label className={styles.modalLabel}>
                Rejection Reason <span>*</span>
              </label>

              <textarea
                placeholder="Please explain why this resolution is being rejected..."
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />

              <div className={styles.modalFooterText}>
                <span>Provide specific details for the technician</span>
                <span>{reason.length} / 500</span>
              </div>

              <div className={styles.modalActions}>
                <button
                  className={styles.rejectBtn}
                  onClick={handleReject}
                >
                  Reject Ticket
                </button>

                <button
                  className={styles.cancelbtn}
                  onClick={() => setShowRejectModal(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

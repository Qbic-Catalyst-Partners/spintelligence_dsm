import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { IoTimeSharp, IoChevronBackSharp } from "react-icons/io5";
import styles from "../../styles/SupervisorDetails.module.css";
import Link from "next/link";
import { useDispatch, useSelector } from "react-redux";
import {
  approveTicket,
  fetchTicketDetails,
  rejectTicket,
} from "../../store/slices/supervisorSlice";
import {
  formatTicketIdForDisplay,
  formatThresholdValue,
  formatStandardValue,
  getTicketParameterNames,
  getTicketValueForParameter,
  transformTicketWithDescription,
} from "../../utils/ticketTransformer";
import {
  applyStoredTicketStatus,
  getSupervisorStatusLabel,
  setStoredTicketStatus,
} from "../../utils/ticketStatus";

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
  const { actionLoading, ticket: ticketDetail, tickets, isLoading, error } = useSelector((state) => state.supervisor);

  const [expanded, setExpanded] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [reason, setReason] = useState("");

  const normalizeTicketId = (value) => String(value || "").replace(/^#/, "");
  const toClassKey = (value) => String(value || "").toLowerCase().replace(/\s+/g, "-");
  const requestedTicketId = Array.isArray(ticketId) ? ticketId[0] : ticketId;
  const normalizedRequestedTicketId = normalizeTicketId(requestedTicketId);

  const dashboardTicket = useMemo(() => {
    if (!requestedTicketId || !Array.isArray(tickets)) return null;

    return tickets.find(
      (item) => normalizeTicketId(item?.ticket_id || item?.id) === normalizeTicketId(requestedTicketId)
    ) || null;
  }, [requestedTicketId, tickets]);

  const ticket = useMemo(() => {
    const detailSource = ticketDetail?.data || ticketDetail?.ticket || ticketDetail;
    const detailMatches =
      detailSource && normalizeTicketId(detailSource?.ticket_id || detailSource?.id) === normalizedRequestedTicketId;
    const source = detailMatches ? detailSource : dashboardTicket;
    return source ? applyStoredTicketStatus(transformTicketWithDescription(source)) : null;
  }, [dashboardTicket, normalizedRequestedTicketId, ticketDetail]);

  useEffect(() => {
    if (!router.isReady || !requestedTicketId) return;

    if (
      !dashboardTicket &&
      normalizeTicketId(ticketDetail?.ticket_id) !== normalizedRequestedTicketId
    ) {
      dispatch(fetchTicketDetails(requestedTicketId));
    }
  }, [dashboardTicket, dispatch, normalizedRequestedTicketId, requestedTicketId, router.isReady, ticketDetail?.ticket_id]);

  const handleApprove = async () => {
    try {
      await dispatch(approveTicket(ticket.ticket_id)).unwrap();
      setStoredTicketStatus(ticket.ticket_id, "APPROVED");
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

      setStoredTicketStatus(ticket.ticket_id, "Reopened");
      setShowRejectModal(false);
      setReason("");
      router.push("/supervisordashboard");
    } catch (err) {
      alert(err);
    }
  };

  if (isLoading && !ticket) return <p className={styles.loading}>Loading...</p>;
  if (error && !ticket) return <p className={styles.loading}>{error}</p>;
  if (!ticket) return <p className={styles.loading}>No ticket found</p>;

  const parameterNames = getTicketParameterNames(ticket);
  const visibleParameterNames = expanded ? parameterNames : parameterNames.slice(0, 1);
  const displayTicketId = formatTicketIdForDisplay(ticket.ticket_id || requestedTicketId);
  const statusClassName = styles[toClassKey(ticket.status)] || "";
  const isSubmissionTicket =
    String(parameterNames?.[0] || "").toLowerCase().includes("submission_frequency") ||
    String(ticket?.violation_details?.category || "").toUpperCase() === "MISSED_FREQUENCY";
  const submissionFrequency = ticket?.frequency || ticket?.threshold_value?.expected_frequency || "-";
  const submissionOccurrences =
    ticket?.occurrences ??
    ticket?.violation_details?.checks?.expected_occurrences ??
    ticket?.violation_details?.checks?.actual_occurrences ??
    "-";

  return (
    <div>
      <div className={styles.page}>
        

        <div className={styles.breadcrumb}>
          <Link href="/supervisordashboard">Tickets</Link> &gt;{" "}
          <span className={styles.current}>
            Review Ticket {displayTicketId}
          </span>
        </div>

        <div className={styles.card}>
          <div className={styles.cardTop}>
            <div>
              <h2>{displayTicketId}</h2>

              <div className={styles.badges}>
                <span
                  className={`${styles.status} ${statusClassName}`}
                >
                  {getSupervisorStatusLabel(ticket.status)}
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
                <th>NOTEBOOK TYPE</th>
                <th>PARAMETER</th>
                <th>{isSubmissionTicket ? "FREQUENCY" : "ACTUAL VALUE"}</th>
                <th>{isSubmissionTicket ? "OCCURRENCES" : "STANDARD VALUE"}</th>
                <th>{isSubmissionTicket ? "STATUS" : "THRESHOLD VALUE"}</th>
                <th>CREATED AT</th>
              </tr>
            </thead>

            <tbody>
              {visibleParameterNames.map((key, i) => (
                <tr key={i}>
                  <td>{ticket.machine_name || ticket.notebook || "-"}</td>
                  <td>{key.toUpperCase()}</td>
                  <td style={{ color: "#CA0000" }}>
                    {isSubmissionTicket ? submissionFrequency : getTicketValueForParameter(ticket?.actual_value, key)}
                  </td>
                  <td>
                    {isSubmissionTicket ? submissionOccurrences : formatStandardValue(
                      getTicketValueForParameter(ticket?.threshold_value, key)
                    )}
                  </td>
                  <td>
                    {isSubmissionTicket ? getSupervisorStatusLabel(ticket.status) : formatThresholdValue(
                      getTicketValueForParameter(ticket?.threshold_value, key)
                    )}
                  </td>
                  <td>{formatDateTime(ticket.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {parameterNames.length > 1 && (
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
                <b>{displayTicketId}</b>. This action will notify the technician
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
              <IoTimeSharp />
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
              <strong>{displayTicketId}</strong>
              <span className={`${styles.status} ${statusClassName}`}>Status: {getSupervisorStatusLabel(ticket.status)}</span>
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
              <span>NOTEBOOK TYPE</span>
              <p>{ticket.machine_name || ticket.notebook || "-"}</p>
            </div>

            <div>
              <span>CREATED AT</span>
              <p>{formatDateTime(ticket.created_at)}</p>
            </div>
          </div>

          <div className={styles.tableHeader}>
            <span>PARAMETER</span>
            <span>{isSubmissionTicket ? "FREQUENCY" : "ACTUAL"}</span>
            <span>{isSubmissionTicket ? "OCCURRENCES" : "STANDARD"}</span>
            <span>{isSubmissionTicket ? "STATUS" : "THRESHOLD"}</span>
          </div>

          {visibleParameterNames.map((key, i) => (
            <div className={styles.tableRow} key={i}>
              <span>{key.replace("_", " ")}</span>
              <span className={styles.actual}>
                {isSubmissionTicket ? submissionFrequency : getTicketValueForParameter(ticket.actual_value, key)}
              </span>
              <span>
                {isSubmissionTicket ? submissionOccurrences : formatStandardValue(
                  getTicketValueForParameter(ticket.threshold_value, key)
                )}
              </span>
              <span>
                {isSubmissionTicket ? getSupervisorStatusLabel(ticket.status) : formatThresholdValue(
                  getTicketValueForParameter(ticket.threshold_value, key)
                )}
              </span>
            </div>
          ))}

          {parameterNames.length > 1 && (
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
            <IoTimeSharp />
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
                <b>{displayTicketId}</b>. This action will notify the technician
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

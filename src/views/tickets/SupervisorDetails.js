import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { IoTimeSharp } from "react-icons/io5";
import { BsThreeDotsVertical } from "react-icons/bs";
import styles from "../../styles/SupervisorDetails.module.css";
import { useDispatch, useSelector } from "react-redux";
import {
  acknowledgeTicket,
  approveTicket,
  fetchTicketDetails,
  rejectTicket,
} from "../../store/slices/supervisorSlice";
import { fetchL2TicketPreviewApi, fetchTicketTimelineApi } from "../../apis/supervisorApi";
import {
  formatTicketIdForDisplay,
  formatThresholdValue,
  formatStandardValue,
  getTicketKind,
  getTicketParameterNames,
  getTicketValueForParameter,
  isNotebookAcknowledgementParameterName,
  isSubmissionFrequencyParameterName,
  isSubmissionTicketRecord,
  TICKET_KIND,
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

const buildTimelineIcon = (title) => {
  const normalized = String(title || "").toLowerCase();
  if (normalized.includes("created")) return { icon: "/created.png", alt: "Created" };
  if (normalized.includes("approved") || normalized.includes("closed")) return { icon: "/awaiting.png", alt: "Approved" };
  if (normalized.includes("reject") || normalized.includes("reopen")) return { icon: "/maintenance.png", alt: "Rejected" };
  return { icon: "/awaiting.png", alt: "Updated" };
};

const fieldsToObject = (fields) => {
  if (!Array.isArray(fields)) return {};
  return fields.reduce((acc, field) => {
    const key = String(field?.parameter || field?.name || field?.field_name || field?.label || "").trim();
    if (!key) return acc;
    acc[key] = field?.value ?? field?.actual_value ?? field?.submitted_value ?? "-";
    return acc;
  }, {});
};

const fieldLabel = (item) =>
  String(item?.label || item?.name || item?.parameter || item?.field_name || item || "").trim();

const buildPreviewTicket = (preview) => {
  const source = preview?.ticket || preview?.data?.ticket || preview?.data || preview;
  if (!source || typeof source !== "object") return source;

  const submittedFields = preview?.submitted_notebook_fields || preview?.submitted_fields || preview?.data?.submitted_notebook_fields;
  const thresholdFields = preview?.threshold_fields || preview?.data?.threshold_fields;
  const parameters = preview?.parameters || preview?.data?.parameters;
  const actualFromFields = fieldsToObject(submittedFields);
  const thresholdFromFields = fieldsToObject(thresholdFields);
  const parameterNames = Array.isArray(parameters)
    ? parameters.map((item) => fieldLabel(item)).filter(Boolean)
    : Object.keys({ ...actualFromFields, ...thresholdFromFields });

  return {
    ...source,
    submitted_notebook_fields: submittedFields || source.submitted_notebook_fields,
    notifications: preview?.notifications || preview?.data?.notifications || source.notifications,
    endpoint_hints: preview?.endpoint_hints || preview?.data?.endpoint_hints || source.endpoint_hints,
    actual_value: Object.keys(actualFromFields).length ? actualFromFields : source.actual_value,
    threshold_value: Object.keys(thresholdFromFields).length ? thresholdFromFields : source.threshold_value,
    parameter_name: parameterNames.length ? parameterNames : source.parameter_name,
    violation_details: preview?.violation_details || preview?.data?.violation_details || source.violation_details,
    submitted_user: preview?.submitted_user || preview?.data?.submitted_user || source.submitted_user,
  };
};

const isAcknowledgeActionTicket = (ticket) => getTicketKind(ticket) === TICKET_KIND.NOTEBOOK_ACK;

export default function SupervisorDetails() {
  const router = useRouter();
  const { ticketId, ticketType } = router.query;

  const dispatch = useDispatch();
  const { actionLoading, ticket: ticketDetail, tickets, isLoading, error } = useSelector((state) => state.supervisor);

  const [expanded, setExpanded] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [reason, setReason] = useState("");
  const [timelineItems, setTimelineItems] = useState([]);
  const [l2Preview, setL2Preview] = useState(null);
  const [l2PreviewLoaded, setL2PreviewLoaded] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

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
    const previewSource = buildPreviewTicket(l2Preview);
    const previewMatches =
      previewSource && normalizeTicketId(previewSource?.ticket_id || previewSource?.id) === normalizedRequestedTicketId;
    const detailSource = ticketDetail?.data || ticketDetail?.ticket || ticketDetail;
    const detailMatches =
      detailSource && normalizeTicketId(detailSource?.ticket_id || detailSource?.id) === normalizedRequestedTicketId;
    const source = previewMatches ? previewSource : detailMatches ? detailSource : dashboardTicket;
    return source ? applyStoredTicketStatus(transformTicketWithDescription(source)) : null;
  }, [dashboardTicket, l2Preview, normalizedRequestedTicketId, ticketDetail]);

  useEffect(() => {
    if (!router.isReady || !requestedTicketId) return;

    if (!l2PreviewLoaded) return;

    if (
      !l2Preview &&
      !dashboardTicket &&
      normalizeTicketId(ticketDetail?.ticket_id) !== normalizedRequestedTicketId
    ) {
      dispatch(fetchTicketDetails(requestedTicketId));
    }
  }, [dashboardTicket, dispatch, l2Preview, l2PreviewLoaded, normalizedRequestedTicketId, requestedTicketId, router.isReady, ticketDetail?.ticket_id]);

  useEffect(() => {
    let mounted = true;
    const loadTimeline = async () => {
      if (!requestedTicketId) return;
      try {
        const response = await fetchTicketTimelineApi(requestedTicketId);
        const events = Array.isArray(response?.timeline) ? response.timeline : [];
        const mapped = events.map((event) => {
          const iconMeta = buildTimelineIcon(event?.title || event?.action);
          return {
            time: formatDateTime(event?.at),
            title: event?.title || "Updated",
            description: event?.detail || event?.action || "-",
            icon: iconMeta.icon,
            alt: iconMeta.alt,
          };
        });
        if (mounted) setTimelineItems(mapped);
      } catch {
        if (mounted) setTimelineItems([]);
      }
    };
    loadTimeline();
    return () => {
      mounted = false;
    };
  }, [requestedTicketId]);

  useEffect(() => {
    let mounted = true;
    const loadPreview = async () => {
      if (!requestedTicketId) return;
      setL2PreviewLoaded(false);
      try {
        const response = await fetchL2TicketPreviewApi(requestedTicketId);
        if (!mounted) return;
        setL2Preview(response || null);
        const previewTimeline = response?.timeline || response?.data?.timeline;
        if (Array.isArray(previewTimeline)) {
          setTimelineItems(
            previewTimeline.map((event) => {
              const iconMeta = buildTimelineIcon(event?.title || event?.action);
              return {
                time: formatDateTime(event?.at || event?.created_at || event?.time),
                title: event?.title || event?.action || "Updated",
                description: event?.detail || event?.description || event?.action || "-",
                icon: iconMeta.icon,
                alt: iconMeta.alt,
              };
            })
          );
        }
      } catch {
        if (mounted) setL2Preview(null);
      } finally {
        if (mounted) setL2PreviewLoaded(true);
      }
    };
    loadPreview();
    return () => {
      mounted = false;
    };
  }, [requestedTicketId]);

  useEffect(() => {
    if (!showMoreMenu) return undefined;
    const closeMenu = () => setShowMoreMenu(false);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, [showMoreMenu]);

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

  const handleAcknowledge = async () => {
    try {
      await dispatch(acknowledgeTicket(ticket.ticket_id)).unwrap();
      setStoredTicketStatus(ticket.ticket_id, "Closed");
      router.push("/supervisordashboard");
    } catch (err) {
      alert(err);
    }
  };

  const handleCopyTicketId = async () => {
    try {
      await navigator.clipboard.writeText(displayTicketId);
      alert("Ticket ID copied.");
    } catch {
      alert("Unable to copy ticket ID.");
    }
    setShowMoreMenu(false);
  };

  const handleCopySummary = async () => {
    const summary = [
      `Ticket: ${displayTicketId}`,
      `Status: ${getSupervisorStatusLabel(ticket?.status)}`,
      `Severity: ${ticket?.severity || "-"}`,
      `Operator: ${ticket?.user_name || "-"}`,
      `Machine: ${ticket?.machine_name || ticket?.notebook || "-"}`,
      `Created At: ${formatDateTime(ticket?.created_at)}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(summary);
      alert("Ticket summary copied.");
    } catch {
      alert("Unable to copy ticket summary.");
    }
    setShowMoreMenu(false);
  };

  const handleRefreshTicket = () => {
    if (requestedTicketId) {
      dispatch(fetchTicketDetails(requestedTicketId));
    }
    setShowMoreMenu(false);
  };

  if (isLoading && !ticket) return <p className={styles.loading}>Loading...</p>;
  if (error && !ticket) return <p className={styles.loading}>{error}</p>;
  if (!ticket) return <p className={styles.loading}>No ticket found</p>;

  // The dashboard already knows which tab (Threshold vs Submission) a ticket came from,
  // so it's passed via ?ticketType= and trusted here directly. Fall back to guessing from
  // the ticket's own fields only for links that don't carry that param (e.g. old bookmarks).
  const isSubmissionTicket = ticketType
    ? ticketType === "submission"
    : isSubmissionTicketRecord(ticket) ||
      String(ticket?.violation_details?.category || "").toUpperCase() === "MISSED_FREQUENCY";
  const rawParameterNames = getTicketParameterNames(ticket);
  const submissionParameterNames = rawParameterNames.filter(
    (key) => isSubmissionFrequencyParameterName(key) || isNotebookAcknowledgementParameterName(key)
  );
  const parameterNames = (isSubmissionTicket
    ? (submissionParameterNames.length ? submissionParameterNames : ["ACKNOWLEDGEMENT"])
    : rawParameterNames
  ).filter((key) => {
    if (!/^\d+$/.test(String(key || "").trim())) return true;

    const actual = getTicketValueForParameter(ticket?.actual_value, key);
    const standard = formatStandardValue(getTicketValueForParameter(ticket?.threshold_value, key));
    const threshold = formatThresholdValue(getTicketValueForParameter(ticket?.threshold_value, key));

    return [actual, standard, threshold].some(
      (value) => String(value ?? "").trim() && String(value ?? "").trim() !== "-"
    );
  });
  const visibleParameterNames = expanded ? parameterNames : parameterNames.slice(0, 1);
  const displayTicketId = formatTicketIdForDisplay(ticket.ticket_id || requestedTicketId);
  const statusClassName = styles[toClassKey(ticket.status)] || "";
  const submissionFrequency =
    ticket?.frequency ||
    ticket?.submission_frequency ||
    ticket?.check_frequency ||
    ticket?.threshold_value?.expected_frequency ||
    "-";
  const submissionOccurrences =
    ticket?.occurrences ??
    ticket?.occurrence_count ??
    ticket?.count ??
    ticket?.violation_details?.checks?.expected_occurrences ??
    ticket?.violation_details?.checks?.actual_occurrences ??
    "-";
  const isClosedTicket = getSupervisorStatusLabel(ticket.status) === "Closed";
  const isAcknowledgeTicket = isAcknowledgeActionTicket(ticket);
  const machineName = ticket.notebook || ticket.machine_name || "Unknown machine";
  const machineDetailText =
    ticket.description ||
    (isSubmissionTicket
      ? `Submission alert for ${machineName}. Please review the submitted frequency details and operator response.`
      : `Alert generated for machine ${machineName}. Please review the submission and operator resolution.`);
  const l2Comment =
    ticket?.violation_details?.l2_comment ||
    ticket?.violation_details?.l2_remarks ||
    ticket?.violation_details?.supervisor_comment ||
    ticket?.violation_details?.rejection_reason ||
    ticket?.violation_details?.reject_reason ||
    ticket?.violation_details?.approver_comment ||
    ticket?.rejection_reason ||
    ticket?.comments ||
    null;
  const operatorComment =
    ticket?.violation_details?.operator_comment ||
    ticket?.violation_details?.comment ||
    ticket?.violation_details?.remarks ||
    null;
  const resolutionCommentLabel =
    ticket?.violation_details?.comment_label ||
    ticket?.violation_details?.comment_heading ||
    ticket?.violation_details?.operator_comment_label ||
    (l2Comment ? "L2 COMMENT" : "OPERATOR'S COMMENT");
  const resolutionComment =
    l2Comment ||
    operatorComment ||
    "No comment submitted during fix and resubmit.";
  const timelineWithL2Comment = (() => {
    const baseTimeline = Array.isArray(timelineItems) ? [...timelineItems] : [];
    if (!l2Comment) return baseTimeline;

    const alreadyExists = baseTimeline.some((item) =>
      String(item?.title || "").trim().toUpperCase() === "L2 COMMENT"
    );
    if (alreadyExists) return baseTimeline;

    const l2CommentEvent = {
      time: formatDateTime(ticket?.updated_at || ticket?.created_at),
      title: "L2 COMMENT",
      description: l2Comment,
      icon: "/maintenance.png",
      alt: "L2 Comment",
    };

    const l1CommentIndex = baseTimeline.findIndex((item) =>
      String(item?.title || "").toLowerCase().includes("l1 comment")
    );

    if (l1CommentIndex >= 0) {
      baseTimeline.splice(l1CommentIndex + 1, 0, l2CommentEvent);
      return baseTimeline;
    }

    const genericCommentIndex = baseTimeline.findIndex((item) =>
      String(item?.title || "").toLowerCase().includes("comment")
    );
    if (genericCommentIndex >= 0) {
      baseTimeline.splice(genericCommentIndex + 1, 0, l2CommentEvent);
      return baseTimeline;
    }

    baseTimeline.push(l2CommentEvent);
    return baseTimeline;
  })();

  return (
    <div>
      <div className={styles.page}>
        

        <div className={styles.breadcrumb}>
          <button
            type="button"
            onClick={() => router.back()}
            style={{ background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", color: "inherit", font: "inherit" }}
          >
            Tickets
          </button>{" "}
          &gt;{" "}
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
                {machineDetailText}
              </p>
            </div>

            <div className={styles.right}>
              <div className={styles.moreMenuWrap}>
                <button
                  type="button"
                  className={styles.moreMenuBtn}
                  aria-label="More options"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMoreMenu((value) => !value);
                  }}
                >
                  <BsThreeDotsVertical />
                </button>
                {showMoreMenu && (
                  <div className={styles.moreMenuPanel} onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={handleCopyTicketId}>Copy Ticket ID</button>
                    <button type="button" onClick={handleCopySummary}>Copy Summary</button>
                    <button type="button" onClick={handleRefreshTicket}>Refresh Details</button>
                  </div>
                )}
              </div>
              <div>
                <span>OPERATOR</span>
                <strong>{ticket.user_name}</strong>
              </div>

              <div className={styles.actions}>
                {isAcknowledgeTicket ? (
                  <button
                    className={styles.accept}
                    onClick={handleAcknowledge}
                    disabled={isClosedTicket || actionLoading}
                  >
                    Acknowledge
                  </button>
                ) : (
                  <>
                    <button
                      className={styles.reject}
                      onClick={() => setShowRejectModal(true)}
                      disabled={isClosedTicket || actionLoading}
                    >
                      Reject
                    </button>

                    <button
                      className={styles.accept}
                      onClick={handleApprove}
                      disabled={isClosedTicket || actionLoading}
                    >
                      Accept
                    </button>
                  </>
                )}
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
                  <td>{ticket.notebook || ticket.machine_name || "-"}</td>
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
            <button
              type="button"
              className={styles.dots}
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? "Collapse parameter details" : "Expand all parameter details"}
              title={expanded ? "Show less" : "Show all"}
            >
              ...
            </button>
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

            {(timelineWithL2Comment.length ? timelineWithL2Comment : [{
              time: formatDateTime(ticket.created_at),
              title: "Created",
              description: `Ticket created for ${ticket.user_name || "Operator"}`,
              icon: "/created.png",
              alt: "Created",
            }]).map((item, index) => (
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

            <label>{resolutionCommentLabel}</label>
            <div className={styles.comment}>
              {resolutionComment}
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
            <div>
              <strong>{displayTicketId}</strong>
              <span className={`${styles.status} ${statusClassName}`}>Status: {getSupervisorStatusLabel(ticket.status)}</span>
            </div>
          </div>
          <div className={styles.moreMenuWrap}>
            <button
              type="button"
              className={styles.moreMenuBtn}
              aria-label="More options"
              onClick={(e) => {
                e.stopPropagation();
                setShowMoreMenu((value) => !value);
              }}
            >
              <BsThreeDotsVertical />
            </button>
            {showMoreMenu && (
              <div className={styles.moreMenuPanel} onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={handleCopyTicketId}>Copy Ticket ID</button>
                <button type="button" onClick={handleCopySummary}>Copy Summary</button>
                <button type="button" onClick={handleRefreshTicket}>Refresh Details</button>
              </div>
            )}
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
              <p>{ticket.notebook || ticket.machine_name || "-"}</p>
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
            <button
              type="button"
              className={styles.dots}
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? "Collapse parameter details" : "Expand all parameter details"}
              title={expanded ? "Show less" : "Show all"}
            >
              ...
            </button>
          )}
        </div>

        <div className={styles.timelineCard}>
          <div className={styles.timelineHeader}>
            <IoTimeSharp />
            <h3>Activity Timeline</h3>
          </div>

          <div className={styles.timelineWrap}>
            {(timelineWithL2Comment.length ? timelineWithL2Comment : [{
              time: formatDateTime(ticket.created_at),
              title: "Created",
              description: `Ticket created for ${ticket.user_name || "Operator"}`,
              icon: "/created.png",
              alt: "Created",
            }]).map((item) => (
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
            {resolutionCommentLabel}
          </span>

          <div className={styles.commentBox}>
            {resolutionComment}
          </div>
        </div>

        <div className={styles.actions}>
          {isAcknowledgeTicket ? (
            <button
              className={styles.accept}
              onClick={handleAcknowledge}
              disabled={isClosedTicket || actionLoading}
            >
              Acknowledge
            </button>
          ) : (
            <>
              <button
                className={styles.reject}
                onClick={() => setShowRejectModal(true)}
                disabled={isClosedTicket || actionLoading}
              >
                Reject
              </button>

              <button
                className={styles.accept}
                onClick={handleApprove}
                disabled={isClosedTicket || actionLoading}
              >
                Accept
              </button>
            </>
          )}
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

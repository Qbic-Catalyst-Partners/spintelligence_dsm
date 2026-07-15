import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  fetchOperatorTicketById,
  submitTicketFix,
} from "@/store/slices/operatorSlice";
import {
  getOperatorTicketTimeline,
  getSubmissionTickets,
  getProcessParameterTickets,
} from "@/apis/operatorApi";
import {
  formatTicketIdForDisplay,
  formatThresholdValue,
  formatStandardValue,
  calculateTicketDeviation,
  getTicketParameterNames,
  getTicketValueForParameter,
  isNotebookAcknowledgementParameterName,
  isPpBatchCompletionTicketRecord,
  isSubmissionFrequencyParameterName,
  isSubmissionTicketRecord,
  transformTicketWithDescription,
  buildTicketActivityTimelineSteps,
  getTicketL1ApproverNames,
} from "@/utils/ticketTransformer";
import { applyStoredTicketStatus, getOperatorStatusLabel } from "@/utils/ticketStatus";

import { IoClose, IoTimeSharp } from "react-icons/io5";
import { FaRegCommentAlt } from "react-icons/fa";
import { BsThreeDots, BsThreeDotsVertical } from "react-icons/bs";
import { HiBars3, HiChevronLeft } from "react-icons/hi2";

import styles from "../../styles/operatordetails.module.css";
import TatCountdown from "../../components/TatCountdown";

const logoSrc = "/logo.png";
const spintelSrc = "/spintel.svg";
const createdImgSrc = "/created.png";
const maintenanceImgSrc = "/maintenance.png";
const fixImgSrc = "/fix.png";

export default function TicketDetails() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { ticketId, ticketType } = router.query;

  const {
    tickets,
    ticketDetail: ticket,
    ticketDetailLoading: loading,
  } = useSelector((state) => state.operator);

  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [timelineItems, setTimelineItems] = useState([]);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [directFetchTicket, setDirectFetchTicket] = useState(null);
  const [directFetchLoading, setDirectFetchLoading] = useState(false);
  const commentLimit = 500;

  const normalizeTicketId = (value) => String(value || "").replace(/^#/, "");
  const toClassKey = (value) => String(value || "").toLowerCase().replace(/\s+/g, "-");

  const normalizedRequestedTicketId = normalizeTicketId(ticketId);
  const ticketDetailMatches =
    ticket && normalizeTicketId(ticket.ticket_id) === normalizedRequestedTicketId;

  const dashboardTicket = useMemo(() => {
    if (!ticketId) return null;

    return tickets.find(
      (item) => normalizeTicketId(item.ticket_id || item.id) === normalizeTicketId(ticketId)
    ) || null;
  }, [ticketId, tickets]);

  const directFetchTicketMatches =
    directFetchTicket && normalizeTicketId(directFetchTicket.ticket_id) === normalizedRequestedTicketId;

  const resolvedTicket = applyStoredTicketStatus(
    dashboardTicket ||
      (directFetchTicketMatches ? directFetchTicket : null) ||
      (ticketDetailMatches ? ticket : null)
  );

  // Submission and process-parameter tickets live in separate backend tables
  // (/operator-tickets/submission-ticketing, /operator-tickets/process-parameter-ticketing) —
  // the same lists the dashboard tabs pull from. The generic single-ticket endpoint
  // (/operator-tickets/:id) only knows about threshold tickets, so it 404s or returns
  // incomplete data for those two kinds. Fetch from the matching list endpoint instead,
  // mirroring what the dashboard already does, and find the ticket by id client-side.
  useEffect(() => {
    if (!ticketId || dashboardTicket) return undefined;

    let mounted = true;

    const loadFromListEndpoint = async (fetchList) => {
      setDirectFetchLoading(true);
      try {
        const response = await fetchList({ page: 1, limit: 500, _ts: Date.now() });
        const list = Array.isArray(response)
          ? response
          : response?.data?.tickets || response?.data?.rows || response?.data || [];
        const match = (Array.isArray(list) ? list : []).find(
          (item) => normalizeTicketId(item?.ticket_id || item?.id) === normalizedRequestedTicketId
        );
        if (mounted) {
          setDirectFetchTicket(match ? transformTicketWithDescription(match) : null);
        }
      } catch {
        if (mounted) setDirectFetchTicket(null);
      } finally {
        if (mounted) setDirectFetchLoading(false);
      }
    };

    if (ticketType === "submission") {
      loadFromListEndpoint(getSubmissionTickets);
    } else if (ticketType === "process_parameter") {
      loadFromListEndpoint(getProcessParameterTickets);
    } else if (!ticketDetailMatches) {
      dispatch(fetchOperatorTicketById(ticketId));
    }

    return () => {
      mounted = false;
    };
  }, [dashboardTicket, dispatch, ticketDetailMatches, ticketId, ticketType]);

  const handleSubmit = async () => {
    if (!comment.trim()) return alert("Enter comment");
    const submitTicketId = resolvedTicket?.ticket_id || ticketId;
    const currentStatus = String(resolvedTicket?.status || "").trim();

    if (!submitTicketId) {
      alert("Ticket ID is missing. Please refresh and try again.");
      return;
    }

    if (!["Open", "Reopened"].includes(currentStatus)) {
      alert(`Only Open or Reopened tickets can be submitted. Current status: ${currentStatus || "Unknown"}`);
      return;
    }

    try {
      await dispatch(
        submitTicketFix({
          ticketId: submitTicketId,
          comment,
        })
      ).unwrap();

      setIsPopupOpen(false);
      setComment("");
      dispatch(fetchOperatorTicketById(submitTicketId));
    } catch (error) {
      const errorMessage =
        typeof error === "string" ? error : error?.message || "Failed to submit ticket.";
      alert(errorMessage);
    }
  };

  const formatCompactDateTime = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return isNaN(date)
      ? "-"
      : date.toLocaleString("en-US", {
          timeZone: "Asia/Kolkata",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
  };

  const rawParameterNames = getTicketParameterNames(resolvedTicket);
  // The dashboard already knows which tab (Threshold vs Submission) a ticket came from,
  // so it's passed via ?ticketType= and trusted here directly. Fall back to guessing from
  // the ticket's own fields only for links that don't carry that param (e.g. old bookmarks).
  const isProcessParameterTicket = ticketType
    ? ticketType === "process_parameter"
    : isPpBatchCompletionTicketRecord(resolvedTicket);
  const isSubmissionTicket = !isProcessParameterTicket && (ticketType
    ? ticketType === "submission"
    : isSubmissionTicketRecord(resolvedTicket) ||
      String(resolvedTicket?.violation_details?.category || "").toUpperCase() === "MISSED_FREQUENCY");
  const entryId = resolvedTicket?.entry_id || resolvedTicket?.entryId || "-";
  const completionThresholdHours =
    resolvedTicket?.completion_time_provided_hours ?? resolvedTicket?.completionTimeProvidedHours ?? "-";
  const entryCreatedAt = resolvedTicket?.entry_created_at || resolvedTicket?.entryCreatedAt || "-";
  const timeLaggedHours = resolvedTicket?.time_lagged_hours ?? resolvedTicket?.timeLaggedHours ?? "-";
  const submissionParameterNames = rawParameterNames.filter(
    (param) => isSubmissionFrequencyParameterName(param) || isNotebookAcknowledgementParameterName(param)
  );
  const displayParameterNames = isSubmissionTicket
    ? (submissionParameterNames.length ? submissionParameterNames : ["ACKNOWLEDGEMENT"])
    : rawParameterNames;

  const parameterMap =
    displayParameterNames.map((param) => {
      const actual = getTicketValueForParameter(resolvedTicket?.actual_value, param);
      const thresholdSource = getTicketValueForParameter(resolvedTicket?.threshold_value, param);
      const standard = formatStandardValue(thresholdSource);
      return {
        name: param,
        actual,
        standard,
        threshold: formatThresholdValue(thresholdSource),
        deviation: calculateTicketDeviation(actual, standard, thresholdSource),
      };
    }).filter((item) => {
      if (!/^\d+$/.test(String(item.name || "").trim())) return true;

      return [item.actual, item.standard, item.threshold].some(
        (value) => String(value ?? "").trim() && String(value ?? "").trim() !== "-"
      );
    });

  const visibleRows = expanded ? parameterMap : parameterMap.slice(0, 1);
  const mobileParameterRows = expanded ? parameterMap : parameterMap.slice(0, 3);
  const statusClassName = resolvedTicket ? styles[toClassKey(resolvedTicket.status)] || "" : "";
  const severityClassName = resolvedTicket ? styles[toClassKey(resolvedTicket.severity)] || "" : "";
  const displayTicketId = formatTicketIdForDisplay(resolvedTicket?.ticket_id || ticketId);
  const machineName = resolvedTicket?.machine_name || resolvedTicket?.notebook || "Unknown machine";
  const machineDetailText =
    resolvedTicket?.description ||
    (isSubmissionTicket
      ? `Submission alert for ${machineName}. Please complete and resubmit the required entry.`
      : `Alert generated for machine ${machineName}. Please review and complete the fix before resubmitting.`);
  const submissionFrequency =
    resolvedTicket?.frequency ||
    resolvedTicket?.submission_frequency ||
    resolvedTicket?.check_frequency ||
    resolvedTicket?.threshold_value?.expected_frequency ||
    "-";
  const submissionOccurrences =
    resolvedTicket?.occurrences ??
    resolvedTicket?.occurrence_count ??
    resolvedTicket?.count ??
    resolvedTicket?.violation_details?.checks?.expected_occurrences ??
    resolvedTicket?.violation_details?.checks?.actual_occurrences ??
    "-";

  const getTimelineIcon = (title) => {
    const normalized = String(title || "").toLowerCase();
    if (normalized.includes("created")) return { icon: createdImgSrc, iconType: null };
    if (normalized.includes("assign")) return { icon: maintenanceImgSrc, iconType: null };
    if (normalized.includes("comment") || normalized.includes("submitted")) return { icon: null, iconType: "comment" };
    if (normalized.includes("reject")) return { icon: maintenanceImgSrc, iconType: null };
    if (normalized.includes("approved") || normalized.includes("closed") || normalized.includes("acknowledged")) {
      return { icon: fixImgSrc, iconType: null };
    }
    return { icon: createdImgSrc, iconType: null };
  };

  // Fallback multi-step timeline built from the ticket record itself, used whenever the
  // dedicated timeline endpoint returns nothing — which today is always the case for
  // Submission and Process Parameter tickets (that endpoint only knows the Threshold table).
  const l1ApproverNames = resolvedTicket ? getTicketL1ApproverNames(resolvedTicket) : [];

  const fallbackTimelineItems = resolvedTicket
    ? buildTicketActivityTimelineSteps(resolvedTicket)
        .filter((step) => !String(step?.title || "").toLowerCase().includes("l1 comment"))
        .map((step) => {
          const iconMeta = getTimelineIcon(step.title);
          const isAssignment = String(step?.title || "").toLowerCase().includes("assign");
          return {
            time: formatCompactDateTime(step.at),
            title: isAssignment ? "Ticket Assigned To" : step.title,
            description: isAssignment
              ? l1ApproverNames.join(", ") || step.description
              : step.description,
            icon: iconMeta.icon,
            iconType: iconMeta.iconType,
          };
        })
    : [];

  useEffect(() => {
    let mounted = true;
    const loadTimeline = async () => {
      if (!ticketId) return;
      try {
        const response = await getOperatorTicketTimeline(ticketId);
        const events = Array.isArray(response?.timeline) ? response.timeline : [];
        const mapped = events
          .filter((event) => !String(event?.title || event?.action || "").toLowerCase().includes("l1 comment"))
          .map((event) => {
          const rawTitle = event?.title || event?.action || "";
          const iconMeta = getTimelineIcon(rawTitle);
          const isAssignment = String(rawTitle).toLowerCase().includes("assign");
          return {
            time: formatCompactDateTime(event?.at),
            title: isAssignment ? "Ticket Assigned To" : event?.title || "Updated",
            description: isAssignment
              ? l1ApproverNames.join(", ") || event?.detail || "-"
              : event?.detail || event?.action || "-",
            icon: iconMeta.icon,
            iconType: iconMeta.iconType,
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
  }, [ticketId]);

  useEffect(() => {
    if (!showMoreMenu) return undefined;
    const closeMenu = () => setShowMoreMenu(false);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, [showMoreMenu]);

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
      `Status: ${getOperatorStatusLabel(resolvedTicket?.status)}`,
      `Severity: ${resolvedTicket?.severity || "-"}`,
      `Machine: ${resolvedTicket?.machine_name || resolvedTicket?.notebook || "-"}`,
      `Created At: ${formatCompactDateTime(resolvedTicket?.created_at || resolvedTicket?.rawCreatedAt)}`,
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
    const targetTicketId = resolvedTicket?.ticket_id || ticketId;
    if (targetTicketId) {
      dispatch(fetchOperatorTicketById(targetTicketId));
    }
    setShowMoreMenu(false);
  };

  if ((loading || directFetchLoading) && !resolvedTicket) return <p>Loading...</p>;
  if (!resolvedTicket) return <p>No ticket found</p>;

  return (
    <div className={styles.page}>
      <header className={styles["mobile-topbar"]}>
        <button type="button" className={styles["mobile-icon-btn"]} aria-label="Open menu">
          <HiBars3 />
        </button>
        <div className={styles["mobile-logo-wrap"]}>
          <img src={logoSrc} alt="DSM" />
        </div>
        <span className={styles["mobile-topbar-spacer"]} />
      </header>

      

      <main className={styles.container}>
        <div className={styles.breadcrumb}>
          <button
            type="button"
            className={styles["breadcrumb-link"]}
            onClick={() => {
              if (window.history.length > 1) router.back();
              else router.push("/operatordashboard");
            }}
            style={{ background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", font: "inherit" }}
          >
            Tickets
          </button>
          <span className={styles["breadcrumb-separator"]}>&gt;</span>
          <span className={styles["breadcrumb-current"]}>{displayTicketId}</span>
        </div>

        <section className={styles["mobile-ticket-summary"]}>
          <div className={styles["mobile-ticket-head"]}>
            <div className={styles["mobile-ticket-id-wrap"]}>
              <h1 className={styles["mobile-ticket-id"]}>{displayTicketId}</h1>
            </div>
            <div className={styles["more-menu-wrap"]}>
              <button
                type="button"
                className={styles["more-menu-btn"]}
                aria-label="More options"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMoreMenu((value) => !value);
                }}
              >
                <BsThreeDotsVertical />
              </button>
              {showMoreMenu && (
                <div className={styles["more-menu-panel"]} onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={handleCopyTicketId}>Copy Ticket ID</button>
                  <button type="button" onClick={handleCopySummary}>Copy Summary</button>
                  <button type="button" onClick={handleRefreshTicket}>Refresh Details</button>
                </div>
              )}
            </div>
            <span className={`${styles["severity-badge"]} ${severityClassName}`}>
              Severity: {resolvedTicket.severity}
            </span>
            <TatCountdown ticket={resolvedTicket} />
          </div>

          <div className={styles["mobile-status-row"]}>
            <span className={`${styles["status-badge"]} ${statusClassName}`}>
              {getOperatorStatusLabel(resolvedTicket.status)}
            </span>
          </div>
        </section>

        <section className={styles["mobile-ticket-card"]}>

          <div className={styles["mobile-meta-grid"]}>
            <div>
              <span className={styles["mobile-meta-label"]}>Notebook Type</span>
              <p className={styles["mobile-meta-value"]}>{resolvedTicket.machine_name || resolvedTicket.notebook || "-"}</p>
            </div>
            <div>
              <span className={styles["mobile-meta-label"]}>Created At</span>
              <p className={styles["mobile-meta-value"]}>
                {formatCompactDateTime(resolvedTicket.created_at || resolvedTicket.rawCreatedAt)}
              </p>
            </div>
          </div>

          <div className={styles["mobile-parameter-table"]}>
            {isProcessParameterTicket ? (
              <>
                <div className={styles["mobile-parameter-head"]}>
                  <span>Entry ID</span>
                  <span>Completion Threshold (Hrs)</span>
                  <span>Entry Created At</span>
                  <span>Time Lagged (Hrs)</span>
                </div>
                <div className={styles["mobile-parameter-row"]}>
                  <span className={styles["mobile-parameter-name"]}>{entryId}</span>
                  <span className={styles["mobile-parameter-value"]}>{completionThresholdHours}</span>
                  <span className={styles["mobile-parameter-value"]}>{entryCreatedAt === "-" ? "-" : formatCompactDateTime(entryCreatedAt)}</span>
                  <span className={styles["mobile-parameter-value"]}>{timeLaggedHours}</span>
                </div>
              </>
            ) : (
              <>
                <div
                  className={styles["mobile-parameter-head"]}
                  style={isSubmissionTicket ? undefined : { gridTemplateColumns: "minmax(0, 1.25fr) repeat(4, minmax(58px, 0.75fr))" }}
                >
                  <span>Parameter</span>
                  <span>{isSubmissionTicket ? "Frequency" : "Actual"}</span>
                  <span>{isSubmissionTicket ? "Occurrences" : "Standard"}</span>
                  <span>{isSubmissionTicket ? "Status" : "Threshold"}</span>
                  {!isSubmissionTicket && <span>Deviation</span>}
                </div>

                {mobileParameterRows.map((item, index) => (
                  <div
                    className={styles["mobile-parameter-row"]}
                    key={`mobile-${item.name}-${index}`}
                    style={isSubmissionTicket ? undefined : { gridTemplateColumns: "minmax(0, 1.25fr) repeat(4, minmax(58px, 0.75fr))" }}
                  >
                    <span className={styles["mobile-parameter-name"]}>{item.name}</span>
                    <span className={`${styles["mobile-parameter-value"]} ${styles.danger}`}>
                      {isSubmissionTicket ? submissionFrequency : item.actual}
                    </span>
                    <span className={styles["mobile-parameter-value"]}>{isSubmissionTicket ? submissionOccurrences : item.standard}</span>
                    <span className={styles["mobile-parameter-value"]}>{isSubmissionTicket ? getOperatorStatusLabel(resolvedTicket.status) : item.threshold}</span>
                    {!isSubmissionTicket && (
                      <span className={styles["mobile-parameter-value"]}>{item.deviation}</span>
                    )}
                  </div>
                ))}
              </>
            )}

            {!isProcessParameterTicket && parameterMap.length > 3 && (
              <button
                type="button"
                className={styles["expand-dots"]}
                onClick={() => setExpanded((value) => !value)}
                aria-label={expanded ? "Collapse parameter details" : "Expand all parameter details"}
                title={expanded ? "Show less" : "Show all"}
              >
                <BsThreeDots />
              </button>
            )}
          </div>
        </section>

        <section className={styles["ticket-card"]}>
          <div className={styles["ticket-header"]}>
            <div className={styles["ticket-title-wrap"]}>
              <div className={styles["ticket-heading-row"]}>
                <h1 className={styles["ticket-id"]}>{displayTicketId}</h1>
                <span className={`${styles["status-badge"]} ${statusClassName}`}>
                  {getOperatorStatusLabel(resolvedTicket.status)}
                </span>
                <span className={`${styles["severity-badge"]} ${severityClassName}`}>
                  {resolvedTicket.severity}
                </span>
                <TatCountdown ticket={resolvedTicket} />
              </div>
              <p className={styles.subtitle}>
                {machineDetailText}
              </p>
            </div>

            <div className={styles["header-actions"]}>
              <div className={styles["more-menu-wrap"]}>
                <button
                  type="button"
                  className={styles["more-menu-btn"]}
                  aria-label="More options"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMoreMenu((value) => !value);
                  }}
                >
                  <BsThreeDotsVertical />
                </button>
                {showMoreMenu && (
                  <div className={styles["more-menu-panel"]} onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={handleCopyTicketId}>Copy Ticket ID</button>
                    <button type="button" onClick={handleCopySummary}>Copy Summary</button>
                    <button type="button" onClick={handleRefreshTicket}>Refresh Details</button>
                  </div>
                )}
              </div>
              <button
                className={styles["fix-btn"]}
                onClick={() => setIsPopupOpen(true)}
              >
                <img src={fixImgSrc} alt="" aria-hidden="true" />
                Fix & Resubmit
              </button>
            </div>
          </div>

          <div className={styles["table-shell"]}>
            {isProcessParameterTicket ? (
              <>
                <div className={styles["table-head"]}>
                  <span>Notebook</span>
                  <span>Entry ID</span>
                  <span>Completion Threshold (Hrs)</span>
                  <span>Entry Created At</span>
                  <span>Time Lagged (Hrs)</span>
                  <span>Created At</span>
                </div>
                <div className={styles["table-row"]}>
                  <span className={styles["value-strong"]}>{resolvedTicket.machine_name || resolvedTicket.notebook || "-"}</span>
                  <span className={styles["value-strong"]}>{entryId}</span>
                  <span className={styles["value-strong"]}>{completionThresholdHours}</span>
                  <span className={styles["value-strong"]}>{entryCreatedAt === "-" ? "-" : formatCompactDateTime(entryCreatedAt)}</span>
                  <span className={styles["value-strong"]}>{timeLaggedHours}</span>
                  <span className={styles["value-strong"]}>
                    {formatCompactDateTime(resolvedTicket.created_at || resolvedTicket.rawCreatedAt)}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div
                  className={styles["table-head"]}
                  style={isSubmissionTicket ? undefined : { gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
                >
                  <span>Notebook Type</span>
                  <span>Parameter</span>
                  <span>{isSubmissionTicket ? "Frequency" : "Actual Value"}</span>
                  <span>{isSubmissionTicket ? "Occurrences" : "Standard Value"}</span>
                  <span>{isSubmissionTicket ? "Status" : "Threshold Value"}</span>
                  {!isSubmissionTicket && <span>Deviation</span>}
                  <span>Created At</span>
                </div>

                {visibleRows.map((item, index) => (
                  <div
                    className={styles["table-row"]}
                    key={`${item.name}-${index}`}
                    style={isSubmissionTicket ? undefined : { gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
                  >
                    <span className={styles["value-strong"]}>{resolvedTicket.machine_name || resolvedTicket.notebook || "-"}</span>
                    <span className={styles["value-strong"]}>{item.name}</span>
                    <span className={`${styles["value-strong"]} ${styles.danger}`}>{isSubmissionTicket ? submissionFrequency : item.actual}</span>
                    <span className={styles["value-strong"]}>{isSubmissionTicket ? submissionOccurrences : item.standard}</span>
                    <span className={styles["value-strong"]}>{isSubmissionTicket ? getOperatorStatusLabel(resolvedTicket.status) : item.threshold}</span>
                    {!isSubmissionTicket && (
                      <span className={styles["value-strong"]}>{item.deviation}</span>
                    )}
                    <span className={styles["value-strong"]}>
                      {formatCompactDateTime(resolvedTicket.created_at || resolvedTicket.rawCreatedAt)}
                    </span>
                  </div>
                ))}
              </>
            )}

            {!isProcessParameterTicket && parameterMap.length > 1 && (
              <button
                type="button"
                className={styles["expand-dots"]}
                onClick={() => setExpanded((value) => !value)}
                aria-label={expanded ? "Collapse parameter details" : "Expand all parameter details"}
                title={expanded ? "Show less" : "Show all"}
              >
                <BsThreeDots />
              </button>
            )}
          </div>
        </section>

        <section className={styles["timeline-card-wrap"]}>
          <h3 className={styles["timeline-title"]}>
            <IoTimeSharp /> Activity Timeline
          </h3>

          <div className={styles["timeline-list"]}>
            {(() => {
              const displayedTimeline = timelineItems.length ? timelineItems : fallbackTimelineItems;
              return displayedTimeline.map((item, index) => (
                <div className={styles["timeline-item"]} key={`${item.time}-${item.title}`}>
                  <div className={styles["timeline-time"]}>{item.time}</div>
                  <div className={styles["timeline-rail"]}>
                    {item.iconType === "comment" ? (
                      <FaRegCommentAlt className={styles["timeline-comment-icon"]} />
                    ) : (
                      <img
                        src={item.icon}
                        alt=""
                        aria-hidden="true"
                        className={styles["timeline-icon"]}
                      />
                    )}
                    {index !== displayedTimeline.length - 1 && (
                      <span className={styles["timeline-line"]} />
                    )}
                  </div>
                  <div className={styles["timeline-content"]}>
                    <h4>{item.title}</h4>
                    <p>{item.description}</p>
                  </div>
                </div>
              ));
            })()}
          </div>
        </section>
      </main>

      <div className={styles["mobile-action-bar"]}>
        <button
          className={styles["fix-btn"]}
          onClick={() => setIsPopupOpen(true)}
        >
          <img src={fixImgSrc} alt="" aria-hidden="true" />
          Fix & Resubmit
        </button>
      </div>

      {isPopupOpen && (
        <div className={styles["popup-overlay"]}>
          <div className={styles["popup-modal"]}>
            <div className={styles["popup-head"]}>
              <h2>
                <FaRegCommentAlt className={styles["popup-head-icon-svg"]} />
                <span>Fix & Resubmit</span>
              </h2>
              <button
                type="button"
                className={styles["popup-close-btn"]}
                onClick={() => setIsPopupOpen(false)}
                aria-label="Close popup"
              >
                <IoClose />
              </button>
            </div>

            <div className={styles["popup-label-row"]}>
              <label className={styles["popup-label"]} htmlFor="resolution-comment">
                Resolution Comment<span>*</span>
              </label>

              <div className={styles["popup-counter"]}>
                {comment.length} / {commentLimit}
              </div>
            </div>

            <textarea
              id="resolution-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={commentLimit}
              placeholder="Enter resolution details"
            />

            <div className={styles["popup-actions"]}>
              <button
                className={styles["cancel-btn"]}
                onClick={() => setIsPopupOpen(false)}
              >
                Cancel
              </button>

              <button
                className={styles["submit-btn"]}
                onClick={handleSubmit}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

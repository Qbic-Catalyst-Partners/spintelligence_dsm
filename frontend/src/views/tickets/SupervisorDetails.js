import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { IoTimeSharp } from "react-icons/io5";
import { BsThreeDotsVertical } from "react-icons/bs";
import { FaCogs, FaClipboardCheck, FaBell } from "react-icons/fa";
import styles from "../../styles/SupervisorDetails.module.css";
import Pagination from "@/components/Pagination";
import { useDispatch, useSelector } from "react-redux";
import {
  approveTicket,
  fetchTicketDetails,
  rejectTicket,
} from "../../store/slices/supervisorSlice";
import { fetchL2TicketPreviewApi, fetchTicketTimelineApi, markAcknowledgeTicketSubmitApi } from "../../apis/supervisorApi";
import { fetchTicketApprovalsApi, submitOperatorTicket } from "../../apis/operatorApi";
import {
  formatTicketIdForDisplay,
  formatThresholdValue,
  formatStandardValue,
  getTicketKind,
  getTicketParameterNames,
  getTicketValueForParameter,
  isNotebookAcknowledgementParameterName,
  isSubmissionFrequencyParameterName,
  TICKET_KIND,
  transformTicketWithDescription,
} from "../../utils/ticketTransformer";
import {
  applyStoredTicketStatus,
  getSupervisorStatusLabel,
  setStoredTicketStatus,
} from "../../utils/ticketStatus";
import { formatDateTime } from "../../utils/formatDateTime";

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
    // The l2-preview endpoint returns the ticket's creation timestamp as
    // submitted_at (there is no created_at key on that response), so the
    // detail view's formatDateTime(ticket.created_at) rendered "-". Map it
    // back to created_at here, keeping any real created_at if present.
    created_at: source.created_at ?? preview?.submitted_at ?? preview?.data?.submitted_at ?? source.submitted_at,
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

// Wheel Change Approval, PP Approval, and Acknowledgement all land on L4 as
// the final authority with nobody else's work to approve/reject - L4 is the
// one actually resolving them, so they get the same "Fix and Submit" action
// as L1 instead of Accept/Reject. PP Batch stays on Accept/Reject at L4 -
// it's not part of this group.
const isL4SelfResolveTicket = (ticket) => {
  const kind = getTicketKind(ticket);
  return kind === TICKET_KIND.NOTEBOOK_ACK || kind === TICKET_KIND.WHEEL_CHANGE || kind === TICKET_KIND.PP_APPROVAL;
};

// Acknowledgement tickets are raised against a specific submitted_notebooks row (stamped into
// violation_details.submitted_notebook_id when the ticket is created - see
// submittedNotebooks.routes.js). Pulling it back out here is what lets the redirect to
// Submitted Notebooks open that exact notebook's card instead of just the list.
const getTicketNotebookId = (ticket) => {
  if (!ticket) return null;
  const raw = ticket.violation_details;
  const parsed = typeof raw === "string"
    ? (() => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      })()
    : raw;

  return (
    parsed?.submitted_notebook_id ??
    ticket?.submitted_notebook_id ??
    ticket?.submittedNotebookId ??
    null
  );
};

export default function SupervisorDetails() {
  const router = useRouter();
  const { ticketId, ticketType } = router.query;

  const dispatch = useDispatch();
  const { actionLoading, ticket: ticketDetail, tickets, isLoading, error } = useSelector((state) => state.supervisor);

  const [expanded, setExpanded] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [reason, setReason] = useState("");
  const [timelineItems, setTimelineItems] = useState([]);
  const [approvalHistory, setApprovalHistory] = useState([]);
  const [timelinePage, setTimelinePage] = useState(1);
  const [l2Preview, setL2Preview] = useState(null);
  const [l2PreviewLoaded, setL2PreviewLoaded] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showFixModal, setShowFixModal] = useState(false);
  const [fixComment, setFixComment] = useState("");
  const [fixSubmitting, setFixSubmitting] = useState(false);

  const normalizeTicketId = (value) => String(value || "").replace(/^#/, "");
  const toClassKey = (value) => String(value || "").toLowerCase().replace(/\s+/g, "-");
  const requestedTicketId = Array.isArray(ticketId) ? ticketId[0] : ticketId;
  const normalizedRequestedTicketId = normalizeTicketId(requestedTicketId);
  const requestedTicketType = Array.isArray(ticketType) ? ticketType[0] : ticketType;
  // The L2 preview endpoint is built for Value-threshold review tickets - its
  // response shape has no assigned_user_names/configured_tat_hours/threshold_active
  // fields at all, and for Acknowledgement it fetches the wrong submitted-notebook
  // shape entirely. It used to only be skipped for Acknowledgement, so Wheel
  // Change/PP Approval tickets still fetched it - when that fetch succeeded (it
  // 200s for some viewer roles), its sparse shape won as the ticket source and
  // silently blanked out Assigned To/Approval Due/Configured TAT, which the
  // GET /tickets/:id fetch further down had already gotten right.
  const skipL2PreviewFetch = ["acknowledgement", "wheel change", "pp approval"].includes(
    String(requestedTicketType || "").toLowerCase()
  );

  const dashboardTicket = useMemo(() => {
    if (!requestedTicketId || !Array.isArray(tickets)) return null;

    return tickets.find(
      (item) => normalizeTicketId(item?.ticket_id || item?.id) === normalizeTicketId(requestedTicketId)
    ) || null;
  }, [requestedTicketId, tickets]);

  const ticket = useMemo(() => {
    // The L2 preview endpoint's response shape only makes sense for non-acknowledgement
    // tickets, but GET /tickets/:id (fetchTicketDetails) returns the raw operator_tickets row
    // (ot.*, including violation_details) for both kinds - it's a safe fallback when the
    // dashboard list hasn't been loaded yet (e.g. a hard refresh straight onto this page),
    // which previously left acknowledgement tickets with no notebook id to deep-link to.
    const previewSource = skipL2PreviewFetch ? null : buildPreviewTicket(l2Preview);
    const previewMatches =
      previewSource && normalizeTicketId(previewSource?.ticket_id || previewSource?.id) === normalizedRequestedTicketId;
    const detailSource = ticketDetail?.data || ticketDetail?.ticket || ticketDetail;
    const detailMatches =
      detailSource && normalizeTicketId(detailSource?.ticket_id || detailSource?.id) === normalizedRequestedTicketId;
    // detailSource (the single-ticket fetch) wins over dashboardTicket (the
    // dashboard list row) when both exist - the list endpoint doesn't select
    // everything this page needs (current-level-aware assigned-to, live
    // threshold-config fields), so it used to silently shadow the complete
    // data the moment the dashboard list had already loaded a row for this
    // ticket. dashboardTicket is spread first purely as a base so any
    // dashboard-only field survives; detailSource's real values take over.
    const source = previewMatches
      ? previewSource
      : detailMatches
        ? { ...dashboardTicket, ...detailSource }
        : dashboardTicket;
    return source ? applyStoredTicketStatus(transformTicketWithDescription(source)) : null;
  }, [dashboardTicket, skipL2PreviewFetch, l2Preview, normalizedRequestedTicketId, ticketDetail]);

  useEffect(() => {
    if (!router.isReady || !requestedTicketId) return;

    if (!skipL2PreviewFetch && !l2PreviewLoaded) return;

    // Always pull the single-ticket endpoint, even when the dashboard list
    // already has a row for this id - the list endpoint doesn't carry
    // everything this page needs (e.g. the current-level-aware assigned-to
    // name, or the live threshold-config fields on Wheel Change/PP Approval/
    // Acknowledgement tickets), so relying on the list row alone left those
    // showing blank/"Unassigned" even though the data genuinely exists.
    if (
      !l2Preview &&
      normalizeTicketId(ticketDetail?.ticket_id) !== normalizedRequestedTicketId
    ) {
      dispatch(fetchTicketDetails(requestedTicketId));
    }
  }, [dispatch, skipL2PreviewFetch, l2Preview, l2PreviewLoaded, normalizedRequestedTicketId, requestedTicketId, router.isReady, ticketDetail?.ticket_id]);

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
    const loadApprovalHistory = async () => {
      if (!requestedTicketId) return;
      try {
        const response = await fetchTicketApprovalsApi(requestedTicketId);
        const rows = Array.isArray(response?.approvals) ? response.approvals : [];
        const mapped = rows.map((row) => {
          const iconMeta = buildTimelineIcon(row?.action_status);
          return {
            time: formatDateTime(row?.created_at),
            title: `${row?.level || ""} ${row?.action_status || ""}`.trim(),
            description: row?.performed_by ? `By ${row.performed_by}` : "-",
            icon: iconMeta.icon,
            alt: iconMeta.alt,
          };
        });
        if (mounted) setApprovalHistory(mapped);
      } catch {
        if (mounted) setApprovalHistory([]);
      }
    };
    loadApprovalHistory();
    return () => {
      mounted = false;
    };
  }, [requestedTicketId]);

  useEffect(() => {
    let mounted = true;
    const loadPreview = async () => {
      if (!requestedTicketId || skipL2PreviewFetch) {
        if (mounted) setL2PreviewLoaded(true);
        return;
      }
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
  }, [requestedTicketId, skipL2PreviewFetch]);

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

  // L1 is the only level that actually fixes/resubmits the underlying data - Accept/Reject
  // only makes sense once a ticket has escalated to a reviewing level. Reuses the same
  // /operator-tickets/submit/:id endpoint operatordetail.js's Fix & Resubmit flow calls,
  // then refreshes via this page's own (supervisor-scoped) fetchTicketDetails so the status
  // change shows here without needing the operator slice this page doesn't otherwise use.
  const handleFixResubmit = async () => {
    if (!fixComment.trim()) {
      alert("Enter a resolution comment");
      return;
    }

    setFixSubmitting(true);
    try {
      await submitOperatorTicket(ticket.ticket_id, {
        operator_comment: fixComment,
        comment: fixComment,
      });
      setShowFixModal(false);
      setFixComment("");
      dispatch(fetchTicketDetails(ticket.ticket_id));
    } catch (err) {
      alert(err?.message || "Failed to submit fix.");
    } finally {
      setFixSubmitting(false);
    }
  };

  // Acknowledging a notebook ticket doesn't happen from this detail view anymore - it only
  // hands off to Submitted Notebooks, where the reviewer must actually open the notebook and
  // click Acknowledge there. That page owns the real acknowledgeSubmittedNotebookApi call.
  // The notebook id is passed through so that page can auto-open the matching card/preview
  // instead of dropping the reviewer on the bare list.
  const handleAcknowledge = () => {
    const notebookId = getTicketNotebookId(ticket);
    // Marks the ticket Submit so it reads as "in hand" rather than still
    // Open/In Progress while the real acknowledgement happens on the next
    // page - best-effort, the reconciliation worker settles Closed/Open
    // regardless of whether this particular call succeeds.
    markAcknowledgeTicketSubmitApi(ticket.ticket_id).catch(() => {});
    router.push(
      notebookId
        ? `/submitted-notebooks?openNotebookId=${encodeURIComponent(notebookId)}`
        : "/submitted-notebooks"
    );
  };

  // PP Approval tickets don't decide anything from this generic ticket page
  // anymore - same as Acknowledgement's handoff to Submitted Notebooks above,
  // Accept/Reject here just hand off to the real PP Approvals screen
  // (Management Hub), where the reviewer sees the full combined PP preview
  // and the actual approve/reject-with-reason action lives. The PP id is
  // passed through so that page can auto-open this exact entry instead of
  // dropping the reviewer on the bare queue.
  const handlePpApprovalRedirect = () => {
    const entryId = ticket?.violation_details?.entry_id || ticket?.entry_id || "";
    router.push(
      entryId ? `/pp-approvals?openEntryId=${encodeURIComponent(entryId)}` : "/pp-approvals"
    );
  };

  // Same handoff pattern as PP Approval above - Wheel Change Approval tickets
  // don't decide anything from this generic ticket page either, they just
  // hand off to the real Wheel Change Approvals screen for that specific
  // department, where the reviewer sees the full proposal and the actual
  // approve/reject-with-reason action lives. Each department saves its
  // Wheel Change into its own table (see WHEEL_CHANGE_DEPARTMENTS in
  // backend/routes/spinning.js), each with its own separate approvals page.
  const WHEEL_CHANGE_DEPARTMENT_TO_PATH = {
    spinning: "/wheel-change-approvals",
    drawframe: "/drawframe-wheel-change-approvals",
    carding: "/carding-change-control-approvals",
    simplex: "/simplex-wheel-change-approvals",
  };
  const handleWheelChangeApprovalRedirect = () => {
    const department = String(ticket?.violation_details?.department || "").trim().toLowerCase();
    const path = WHEEL_CHANGE_DEPARTMENT_TO_PATH[department] || "/wheel-change-approvals";
    const entryId = ticket?.violation_details?.entry_id || ticket?.entry_id || "";
    router.push(entryId ? `${path}?openEntryId=${encodeURIComponent(entryId)}` : path);
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
      `Criticality: ${ticket?.severity || "-"}`,
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
  // Uses getTicketKind (which checks the explicit ticket_kind column first) rather than a
  // bare violation_details.category === 'MISSED_FREQUENCY' check - PP_BATCH_INCOMPLETE
  // tickets also carry that same category value, so that check alone misclassified every
  // PP batch ticket as a Submission ticket.
  const isSubmissionTicket = ticketType
    ? ticketType === "submission"
    : getTicketKind(ticket) === TICKET_KIND.SUBMISSION_FREQUENCY;
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
  // PP Batch tickets carry no frequency/occurrences field at all — derive
  // "Frequency" as hours elapsed since creation and hardcode "Occurrences" to 1.
  const isPpBatchTicket = getTicketKind(ticket) === TICKET_KIND.PP_BATCH;
  const submissionFrequency = isPpBatchTicket
    ? (() => {
        const createdAt = new Date(ticket?.created_at);
        if (Number.isNaN(createdAt.getTime())) return "-";
        const hours = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60)));
        return `${hours} hr${hours === 1 ? "" : "s"}`;
      })()
    : ticket?.frequency ||
      ticket?.submission_frequency ||
      ticket?.check_frequency ||
      ticket?.threshold_value?.expected_frequency ||
      "-";
  const submissionOccurrences = isPpBatchTicket
    ? 1
    : ticket?.occurrences ??
      ticket?.occurrence_count ??
      ticket?.count ??
      ticket?.violation_details?.checks?.expected_occurrences ??
      ticket?.violation_details?.checks?.actual_occurrences ??
      "-";
  const isClosedTicket = getSupervisorStatusLabel(ticket.status) === "Closed";
  const isAcknowledgeTicket = isAcknowledgeActionTicket(ticket);
  // Accept/Reject is an L2+ reviewer action - a ticket still sitting at L1 hasn't
  // escalated to anyone yet, so L1 is the one who needs to Fix & Resubmit it, not
  // approve/reject it.
  // Prefer the ticket list's own tat_current_level (refetched via
  // fetchSupervisorTickets, so it reflects the latest escalation) over the
  // l2-preview snapshot, which is fetched once per ticket id and can go
  // stale the moment the ticket escalates - previously using the preview's
  // value here made the Approve/Reject button flash to the correct action
  // then immediately revert to the previous level's action.
  const currentTicketLevel = String(
    dashboardTicket?.tat_current_level || ticket?.tat_current_level || ticket?.tatCurrentLevel || "L1"
  ).trim().toUpperCase();
  const isL1OwnedTicket = !isAcknowledgeTicket && currentTicketLevel === "L1";
  // Wheel Change Approval and PP Approval are both genuine approve/reject
  // decisions (approving applies the change / activates the PP id, rejecting
  // sends it back to L1) - unlike Acknowledgement they keep the normal
  // Accept/Reject pair at L4 instead of the single "Fix and Submit" action,
  // even though they still use their own info card below
  // (isL4SelfResolveTicket stays true for that, driving the card style not
  // the button choice). handleApprove/handleReject already fully support
  // both kinds server-side (applyRealUnderlyingDecision in
  // supervisorTickets.routes.js).
  const isWheelChangeTicket = getTicketKind(ticket) === TICKET_KIND.WHEEL_CHANGE;
  const isPpApprovalTicket = getTicketKind(ticket) === TICKET_KIND.PP_APPROVAL;
  const isL4SelfResolveOwnedTicket = isL4SelfResolveTicket(ticket) && currentTicketLevel === "L4" && !isWheelChangeTicket && !isPpApprovalTicket;
  // Replaces the "Resolution Submission" comment box for these ticket kinds
  // - they have no operator/fix-comment concept, so that box only ever read
  // "No comment submitted during fix and resubmit," which explained nothing.
  const liveStatusPanel = isL4SelfResolveTicket(ticket) && !isWheelChangeTicket && !isPpApprovalTicket ? (
    <p style={{ margin: 0, color: "#4b5563", fontSize: "13px", lineHeight: 1.5 }}>
      {isClosedTicket
        ? "This ticket is closed - the real record it was raised for has been confirmed done."
        : "This closes automatically once the real record confirms it's done, or reopens if it turns out not to have gone through."}
    </p>
  ) : null;
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

  const timelineWithApprovalHistory = approvalHistory.length
    ? [...timelineWithL2Comment, ...approvalHistory]
    : timelineWithL2Comment;

  const displayedTimeline = timelineWithApprovalHistory.length
    ? timelineWithApprovalHistory
    : [{
        time: formatDateTime(ticket.created_at),
        title: "Created",
        description: `Ticket created for ${ticket.user_name || "Operator"}`,
        icon: "/created.png",
        alt: "Created",
      }];
  const TIMELINE_PAGE_SIZE = 10;
  const timelineTotalPages = Math.max(1, Math.ceil(displayedTimeline.length / TIMELINE_PAGE_SIZE));
  const safeTimelinePage = Math.min(timelinePage, timelineTotalPages);
  const paginatedTimeline = displayedTimeline.slice(
    (safeTimelinePage - 1) * TIMELINE_PAGE_SIZE,
    safeTimelinePage * TIMELINE_PAGE_SIZE
  );

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
                  Criticality: {ticket.severity}
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

              {!isClosedTicket && (
                <div className={styles.actions}>
                  {isAcknowledgeTicket ? (
                    <button
                      className={styles.accept}
                      onClick={handleAcknowledge}
                      disabled={actionLoading}
                    >
                      Fix &amp; Submit
                    </button>
                  ) : isL1OwnedTicket ? (
                    <button
                      className={styles.accept}
                      onClick={() => setShowFixModal(true)}
                      disabled={fixSubmitting}
                    >
                      Fix &amp; Submit
                    </button>
                  ) : isL4SelfResolveOwnedTicket ? (
                    <button
                      className={styles.accept}
                      onClick={handleApprove}
                      disabled={actionLoading}
                    >
                      Fix &amp; Submit
                    </button>
                  ) : isPpApprovalTicket ? (
                    <button
                      className={styles.accept}
                      onClick={handlePpApprovalRedirect}
                      disabled={actionLoading}
                    >
                      Confirm Action
                    </button>
                  ) : isWheelChangeTicket ? (
                    <button
                      className={styles.accept}
                      onClick={handleWheelChangeApprovalRedirect}
                      disabled={actionLoading}
                    >
                      Confirm Action
                    </button>
                  ) : (
                    <>
                      <button
                        className={styles.reject}
                        onClick={() => setShowRejectModal(true)}
                        disabled={actionLoading}
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
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {isPpBatchTicket ? (
            // Purpose-built layout for PP Batch tickets, replacing the
            // Value/Submission table above - that table iterates every key
            // in actual_value/threshold_value, which for a PP Batch ticket
            // are the completed-screens array and a stray
            // completion_threshold_hours key, neither of which is the actual
            // point of the ticket (the missing departments). One ticket
            // covers every department still missing for the PP ID (see PDF
            // Step 3's "one ticket per PP ID"), so this lists them all
            // instead of a noisy 10-row table of mostly blank cells.
            // `overdue_screens`/`missing_screens` (plural) is the current
            // shape; `missing_screen` (singular) is kept as a fallback for
            // tickets filed while this was briefly one-ticket-per-department.
            // missing_screens is every department not yet submitted;
            // overdue_screens is only the subset whose own completion
            // threshold has already elapsed (used to decide when to raise/
            // escalate, not to describe what's actually missing) - preferring
            // it here understated the real gap whenever some missing
            // departments had a longer threshold than others.
            (() => {
              const details = ticket?.violation_details || {};
              const missingDepartments = Array.isArray(details.missing_screens) && details.missing_screens.length
                ? details.missing_screens
                : Array.isArray(details.overdue_screens) && details.overdue_screens.length
                  ? details.overdue_screens
                  : details.missing_screen
                    ? [details.missing_screen]
                    : [];
              const threshold = details.screen_thresholds && typeof details.screen_thresholds === "object"
                ? Object.values(details.screen_thresholds)[0]
                : details.completion_threshold_hours;
              const assignedTo = ticket.assigned_user_names || ticket.assignedUserNames || "Unassigned";

              return (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>ENTRY ID</th>
                        <th>MISSING DEPARTMENTS</th>
                        <th>COMPLETED</th>
                        <th>COMPLETION THRESHOLD</th>
                        <th>FIRST SUBMITTED</th>
                        <th>ASSIGNED TO</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>{details.entry_id || ticket.notebook || ticket.machine_name || "-"}</td>
                        <td style={{ color: "#CA0000" }}>
                          {missingDepartments.length ? missingDepartments.join(", ") : "-"}
                        </td>
                        <td>
                          {Array.isArray(details.completed_screens)
                            ? `${details.completed_screens.length} dept(s): ${details.completed_screens.join(", ")}`
                            : "-"}
                        </td>
                        <td>{threshold ? `${threshold} Hrs` : "-"}</td>
                        <td>{formatDateTime(details.first_created_at || ticket.created_at)}</td>
                        <td>{assignedTo}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })()
          ) : isL4SelfResolveTicket(ticket) ? (
            // Wheel Change Approval / PP Approval / Acknowledgement tickets
            // don't carry parameter/actual/threshold values at all (their
            // actual_value and threshold_value columns are empty arrays) -
            // the generic table below rendered as an empty, headers-only
            // table for these. What they actually carry is real, useful
            // context sitting entirely in violation_details, so this reads
            // straight from there instead, styled to match what each kind
            // is actually about rather than forcing it into a threshold
            // table's shape.
            (() => {
              const details = ticket?.violation_details || {};
              const kind = getTicketKind(ticket);
              const assignedTo = ticket.assigned_user_names || ticket.assignedUserNames || "Unassigned";
              const dueAt = ticket.l4_tat_due_at || ticket.l4TatDueAt || null;
              const isOverdue = dueAt ? new Date(dueAt).getTime() < Date.now() : false;
              const dueValue = dueAt ? formatDateTime(dueAt) : "-";
              // Live values from the actual Wheel Change/PP Notebook/Acknowledgement
              // Threshold config this ticket was raised under - not the ticket's own
              // frozen-at-creation snapshot, so a reviewer can tell whether the
              // configured TAT/severity has since changed since this ticket fired.
              const configuredTatHours = ticket.configured_tat_hours ?? ticket.configuredTatHours ?? null;
              const configuredSeverity = ticket.configured_severity ?? ticket.configuredSeverity ?? null;
              const thresholdActive = ticket.threshold_active ?? ticket.thresholdActive;
              const configuredTatField = {
                label: "Configured TAT",
                value: configuredTatHours ? `${configuredTatHours} hr${Number(configuredTatHours) === 1 ? "" : "s"}${configuredSeverity ? ` · ${configuredSeverity}` : ""}` : "-",
              };

              let kindLabel = "Review";
              let Icon = FaClipboardCheck;
              let fields = [];

              if (kind === TICKET_KIND.WHEEL_CHANGE) {
                kindLabel = "Wheel Change Approval";
                Icon = FaCogs;
                fields = [
                  { label: "Department", value: details.department || "-" },
                  { label: "Entry ID", value: details.entry_id || "-" },
                  { label: "Assigned To", value: assignedTo },
                  { label: "Approval Due", value: dueValue, overdue: isOverdue },
                  configuredTatField,
                  { label: "Created At", value: formatDateTime(ticket.created_at) },
                ];
              } else if (kind === TICKET_KIND.PP_APPROVAL) {
                kindLabel = "PP Approval";
                Icon = FaClipboardCheck;
                fields = [
                  { label: "Entry ID", value: details.entry_id || "-" },
                  { label: "Last Completed", value: details.notebook_label || "-" },
                  { label: "Assigned To", value: assignedTo },
                  { label: "Approval Due", value: dueValue, overdue: isOverdue },
                  configuredTatField,
                  { label: "Created At", value: formatDateTime(ticket.created_at) },
                ];
              } else {
                kindLabel = "Acknowledgement";
                Icon = FaBell;
                const entryRef = ticket?.actual_value?.entry_id || details.notebook_submission_id || "-";
                const ackBy = details.ack_due_at || ticket?.threshold_value?.acknowledge_by || null;
                const ackByOverdue = ackBy ? new Date(ackBy).getTime() < Date.now() : false;
                const ackByValue = ackBy ? formatDateTime(ackBy) : "-";
                fields = [
                  { label: "Notebook / Screen", value: ticket.notebook || ticket.machine_name || "-" },
                  { label: "Submitted By", value: ticket.user_name || "-" },
                  { label: "Entry Reference", value: entryRef },
                  { label: "Acknowledge By", value: ackByValue, overdue: ackByOverdue },
                  { label: "Assigned To", value: assignedTo },
                  configuredTatField,
                ];
              }

              return (
                <div
                  className={styles.resolveSummary}
                  style={{
                    "--resolve-accent": kind === TICKET_KIND.WHEEL_CHANGE ? "#2563eb" : kind === TICKET_KIND.PP_APPROVAL ? "#7c3aed" : "#b45309",
                    "--resolve-accent-tint": kind === TICKET_KIND.WHEEL_CHANGE ? "#eff6ff" : kind === TICKET_KIND.PP_APPROVAL ? "#f5f3ff" : "#fffbeb",
                  }}
                >
                  <div className={styles.resolveSummaryHead}>
                    <div className={styles.resolveSummaryKind}>
                      <Icon />
                      {kindLabel}
                    </div>
                  </div>
                  {details.message && <p className={styles.resolveSummaryMessage}>{details.message}</p>}
                  {thresholdActive === false && (
                    <p className={styles.resolveSummaryMessage} style={{ color: "#b45309" }}>
                      Note: the threshold config this was raised under is currently switched off - it won't fire again until re-enabled.
                    </p>
                  )}
                  <div className={styles.resolveGrid}>
                    {fields.map((field) => (
                      <div className={styles.resolveItem} key={field.label}>
                        <span>{field.label}</span>
                        <strong className={field.overdue ? styles.overdue : ""}>{field.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()
          ) : (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>NOTEBOOK TYPE</th>
                      <th>ENTRY ID</th>
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
                        <td>{ticket.entry_id || ticket.violation_details?.entry_id || "-"}</td>
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
              </div>

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
            </>
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

        {showFixModal && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalBox}>
              <h3 className={styles.modalTitle}>Fix &amp; Submit</h3>

              <p className={styles.modalDesc}>
                Resolve Ticket <b>{displayTicketId}</b> at L1 and submit it for review.
              </p>

              <label className={styles.modalLabel}>
                Resolution Comment <span>*</span>
              </label>

              <textarea
                placeholder="Enter resolution details..."
                value={fixComment}
                maxLength={500}
                onChange={(e) => setFixComment(e.target.value)}
              />

              <div className={styles.modalFooterText}>
                <span>{fixComment.length} / 500 characters</span>
              </div>

              <div className={styles.modalActions}>
                <button onClick={() => setShowFixModal(false)} disabled={fixSubmitting}>
                  Cancel
                </button>
                <button onClick={handleFixResubmit} disabled={fixSubmitting}>
                  Submit
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

            {paginatedTimeline.map((item) => (
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
            <Pagination page={safeTimelinePage} totalPages={timelineTotalPages} onPageChange={setTimelinePage} />
          </div>

          <div className={styles.resolution}>
            {liveStatusPanel ? (
              <>
                <h3>Live Status</h3>
                {liveStatusPanel}
              </>
            ) : (
              <>
                <h3>Resolution Submission</h3>
                <label>{resolutionCommentLabel}</label>
                <div className={styles.comment}>
                  {resolutionComment}
                </div>
              </>
            )}
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
            Criticality: {ticket.severity}
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
              <span>ENTRY ID</span>
              <p>{ticket.entry_id || ticket.violation_details?.entry_id || "-"}</p>
            </div>

            <div>
              <span>CREATED AT</span>
              <p>{formatDateTime(ticket.created_at)}</p>
            </div>
          </div>

          <div className={styles.tableHeader}>
            <span>PARAMETER</span>
            <span>{isSubmissionTicket ? "FREQUENCY" : "IDLE"}</span>
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
            {paginatedTimeline.map((item) => (
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
          <Pagination page={safeTimelinePage} totalPages={timelineTotalPages} onPageChange={setTimelinePage} />
        </div>

        <div className={styles.resolutionCard}>
          {liveStatusPanel ? (
            <>
              <h4>Live Status</h4>
              {liveStatusPanel}
            </>
          ) : (
            <>
              <h4>Resolution Submission</h4>
              <span className={styles.commentLabel}>
                {resolutionCommentLabel}
              </span>
              <div className={styles.commentBox}>
                {resolutionComment}
              </div>
            </>
          )}
        </div>

        {!isClosedTicket && (
          <div className={styles.actions}>
            {isAcknowledgeTicket ? (
              <button
                className={styles.accept}
                onClick={handleAcknowledge}
                disabled={actionLoading}
              >
                Fix &amp; Submit
              </button>
            ) : isL1OwnedTicket ? (
              <button
                className={styles.accept}
                onClick={() => setShowFixModal(true)}
                disabled={fixSubmitting}
              >
                Fix &amp; Submit
              </button>
            ) : isL4SelfResolveOwnedTicket ? (
              <button
                className={styles.accept}
                onClick={handleApprove}
                disabled={actionLoading}
              >
                Fix &amp; Submit
              </button>
            ) : isPpApprovalTicket ? (
              <button
                className={styles.accept}
                onClick={handlePpApprovalRedirect}
                disabled={actionLoading}
              >
                Confirm Action
              </button>
            ) : isWheelChangeTicket ? (
              <button
                className={styles.accept}
                onClick={handleWheelChangeApprovalRedirect}
                disabled={actionLoading}
              >
                Confirm Action
              </button>
            ) : (
              <>
                <button
                  className={styles.reject}
                  onClick={() => setShowRejectModal(true)}
                  disabled={actionLoading}
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
              </>
            )}
          </div>
        )}

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

        {showFixModal && (
          <div
            className={styles.modalOverlay}
            onClick={() => setShowFixModal(false)}
          >
            <div
              className={styles.modalBox}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>Fix &amp; Submit</div>

                <span
                  className={styles.closeBtn}
                  onClick={() => setShowFixModal(false)}
                >
                  ×
                </span>
              </div>

              <p className={styles.modalDesc}>
                Resolve Ticket <b>{displayTicketId}</b> at L1 and submit it for review.
              </p>

              <label className={styles.modalLabel}>
                Resolution Comment <span>*</span>
              </label>

              <textarea
                placeholder="Enter resolution details..."
                value={fixComment}
                maxLength={500}
                onChange={(e) => setFixComment(e.target.value)}
              />

              <div className={styles.modalFooterText}>
                <span>{fixComment.length} / 500</span>
              </div>

              <div className={styles.modalActions}>
                <button
                  className={styles.rejectBtn}
                  onClick={() => setShowFixModal(false)}
                  disabled={fixSubmitting}
                >
                  Cancel
                </button>

                <button
                  className={styles.cancelbtn}
                  onClick={handleFixResubmit}
                  disabled={fixSubmitting}
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  fetchOperatorTicketById,
  submitTicketFix,
} from "@/store/slices/operatorSlice";

import { IoClose, IoTimeSharp } from "react-icons/io5";
import { FaRegCommentAlt } from "react-icons/fa";
import { BsThreeDots } from "react-icons/bs";
import { HiBars3, HiChevronLeft } from "react-icons/hi2";

import styles from "../../styles/operatordetails.module.css";

const logoSrc = "/logo.png";
const spintelSrc = "/spintel.svg";
const createdImgSrc = "/created.png";
const maintenanceImgSrc = "/maintenance.png";
const fixImgSrc = "/fix.png";

export default function TicketDetails() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { ticketId } = router.query;

  const {
    tickets,
    ticketDetail: ticket,
    ticketDetailLoading: loading,
  } = useSelector((state) => state.operator);

  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [expanded, setExpanded] = useState(false);
  const commentLimit = 500;

  const normalizeTicketId = (value) => String(value || "").replace(/^#/, "");
  const toClassKey = (value) => String(value || "").toLowerCase().replace(/\s+/g, "-");

  const getValueForParameter = (source, parameterName) => {
    if (!source || !parameterName) return "-";

    const directMatch = source[parameterName];
    if (directMatch !== undefined && directMatch !== null) {
      return directMatch;
    }

    const normalizedParameter = parameterName.toLowerCase().trim();
    const matchedKey = Object.keys(source).find(
      (key) => key.toLowerCase().trim() === normalizedParameter
    );

    return matchedKey ? source[matchedKey] : "-";
  };

  const dashboardTicket = useMemo(() => {
    if (!ticketId) return null;

    return tickets.find(
      (item) => normalizeTicketId(item.ticket_id || item.id) === normalizeTicketId(ticketId)
    ) || null;
  }, [ticketId, tickets]);

  const resolvedTicket = dashboardTicket || ticket;

  useEffect(() => {
    if (
      ticketId &&
      !dashboardTicket &&
      normalizeTicketId(ticket?.ticket_id) !== normalizeTicketId(ticketId)
    ) {
      dispatch(fetchOperatorTicketById(ticketId));
    }
  }, [dashboardTicket, dispatch, ticket?.ticket_id, ticketId]);

  const handleSubmit = () => {
    if (!comment.trim()) return alert("Enter comment");

    dispatch(
      submitTicketFix({
        ticketId: resolvedTicket.ticket_id,
        comment,
      })
    );

    setIsPopupOpen(false);
    setComment("");
  };

  const formatCompactDateTime = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return isNaN(date)
      ? "-"
      : date.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
  };

  
  const parameterMap =
    resolvedTicket?.parameter_name?.map((param) => ({
      name: param,
      actual: getValueForParameter(resolvedTicket?.actual_value, param),
      threshold: getValueForParameter(resolvedTicket?.threshold_value, param),
    })) || [];

  const visibleRows = expanded ? parameterMap : parameterMap.slice(0, 1);
  const mobileParameterRows = parameterMap.slice(0, 3);
  const statusClassName = resolvedTicket ? styles[toClassKey(resolvedTicket.status)] || "" : "";
  const severityClassName = resolvedTicket ? styles[toClassKey(resolvedTicket.severity)] || "" : "";

  const timelineItems = [
    {
      time: "10:30 AM",
      title: "Ticket Created",
      icon: createdImgSrc,
      description: "Automated system alert triggered by vibration sensor RF-04-S2",
    },
    {
      time: "11:25 AM",
      title: "Assigned to maintenance",
      icon: maintenanceImgSrc,
      description: "Ticket assigned to Maintenance Team A (Technician : Surya Prakash)",
    },
    {
      time: "12:45 PM",
      title: "Supervisor Comment",
      iconType: "comment",
      description:
        '"Check the lubricant levels. It seems the main bearing is overheating. Need to replace the grease and re-test the vibration levels. proceed with caution."',
    },
  ];

  if (loading && !resolvedTicket) return <p>Loading...</p>;
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

      <header className={styles["top-navbar"]}>
        <div className={styles["nav-left"]}>
          <img src={spintelSrc} alt="Spintelligence" />
        </div>
        <nav className={styles["top-links"]}>
          <span>Home</span>
          <span>User Management</span>
          <span>Roles and Permissions Management</span>
        </nav>
        <div className={styles["nav-right"]}>
          <img src={logoSrc} alt="DSM" />
        </div>
      </header>

      <main className={styles.container}>
        <div className={styles.breadcrumb}>
          <span
            className={styles["breadcrumb-link"]}
            onClick={() => router.push("/operator")}
          >
            Tickets
          </span>
          <span className={styles["breadcrumb-separator"]}>&gt;</span>
          <span className={styles["breadcrumb-current"]}>{resolvedTicket.ticket_id}</span>
        </div>

        <section className={styles["mobile-ticket-summary"]}>
          <div className={styles["mobile-ticket-head"]}>
            <div className={styles["mobile-ticket-id-wrap"]}>
              <button
                type="button"
                className={styles["mobile-back-btn"]}
                onClick={() => router.push("/operator")}
                aria-label="Back to tickets"
              >
                <HiChevronLeft />
              </button>
              <h1 className={styles["mobile-ticket-id"]}>{resolvedTicket.ticket_id}</h1>
            </div>
            <span className={`${styles["severity-badge"]} ${severityClassName}`}>
              Severity: {resolvedTicket.severity}
            </span>
          </div>

          <div className={styles["mobile-status-row"]}>
            <span className={`${styles["status-badge"]} ${statusClassName}`}>
              {resolvedTicket.status}
            </span>
          </div>
        </section>

        <section className={styles["mobile-ticket-card"]}>

          <div className={styles["mobile-meta-grid"]}>
            <div>
              <span className={styles["mobile-meta-label"]}>Machine</span>
              <p className={styles["mobile-meta-value"]}>{resolvedTicket.machine_name}</p>
            </div>
            <div>
              <span className={styles["mobile-meta-label"]}>Created At</span>
              <p className={styles["mobile-meta-value"]}>
                {formatCompactDateTime(resolvedTicket.created_at || resolvedTicket.rawCreatedAt)}
              </p>
            </div>
          </div>

          <div className={styles["mobile-parameter-table"]}>
            <div className={styles["mobile-parameter-head"]}>
              <span>Parameter</span>
              <span>Actual</span>
              <span>Threshold</span>
            </div>

            {mobileParameterRows.map((item) => (
              <div className={styles["mobile-parameter-row"]} key={`mobile-${item.name}`}>
                <span className={styles["mobile-parameter-name"]}>{item.name}</span>
                <span className={`${styles["mobile-parameter-value"]} ${styles.danger}`}>
                  {item.actual}
                </span>
                <span className={styles["mobile-parameter-value"]}>{item.threshold}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles["ticket-card"]}>
          <div className={styles["ticket-header"]}>
            <div className={styles["ticket-title-wrap"]}>
              <div className={styles["ticket-heading-row"]}>
                <h1 className={styles["ticket-id"]}>{resolvedTicket.ticket_id}</h1>
                <span className={`${styles["status-badge"]} ${statusClassName}`}>
                  {resolvedTicket.status}
                </span>
                <span className={`${styles["severity-badge"]} ${severityClassName}`}>
                  {resolvedTicket.severity}
                </span>
              </div>
              <p className={styles.subtitle}>
                {resolvedTicket.description || "Industrial sensor alert: Mechanical stress detected on main spindle."}
              </p>
            </div>

            <button
              className={styles["fix-btn"]}
              onClick={() => setIsPopupOpen(true)}
            >
              <img src={fixImgSrc} alt="" aria-hidden="true" />
              Fix & Resubmit
            </button>
          </div>

          <div className={styles["table-shell"]}>
            <div className={styles["table-head"]}>
              <span>Machine</span>
              <span>Parameter</span>
              <span>Actual Value</span>
              <span>Threshold Value</span>
              <span>Created At</span>
            </div>

            {visibleRows.map((item) => (
              <div className={styles["table-row"]} key={item.name}>
                <span className={styles["value-strong"]}>{resolvedTicket.machine_name}</span>
                <span className={styles["value-strong"]}>{item.name}</span>
                <span className={`${styles["value-strong"]} ${styles.danger}`}>{item.actual}</span>
                <span className={styles["value-strong"]}>{item.threshold}</span>
                <span className={styles["value-strong"]}>
                  {formatCompactDateTime(resolvedTicket.created_at || resolvedTicket.rawCreatedAt)}
                </span>
              </div>
            ))}

            {parameterMap.length > 1 && (
              <button
                type="button"
                className={styles["expand-dots"]}
                onClick={() => setExpanded((value) => !value)}
                aria-label={expanded ? "Show fewer values" : "Show all values"}
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
            {timelineItems.map((item, index) => (
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
                  {index !== timelineItems.length - 1 && (
                    <span className={styles["timeline-line"]} />
                  )}
                </div>
                <div className={styles["timeline-content"]}>
                  <h4>{item.title}</h4>
                  <p>{item.description}</p>
                </div>
              </div>
            ))}
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
                <img src={fixImgSrc} alt="" aria-hidden="true" className={styles["popup-head-icon"]} />
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

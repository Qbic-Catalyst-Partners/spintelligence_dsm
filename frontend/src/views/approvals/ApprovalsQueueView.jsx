import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";

import SuccessModal from "@/components/SuccessModal";
import { isWheelChangeApproverUser } from "@/utils/accessControl";
import styles from "@/styles/wheelChangeApprovals.module.css";

const TABS = [
  { key: "pending", label: "Pending Approvals" },
  { key: "approved", label: "Existing Approvals" },
];

const STATUS_BADGE_CLASS = {
  pending: styles.statusBadgePending,
  approved: styles.statusBadgeApproved,
  rejected: styles.statusBadgeRejected,
};

const trimValue = (value) => String(value ?? "").trim();

function StatusBadge({ status }) {
  const key = trimValue(status).toLowerCase() || "pending";
  return (
    <span className={`${styles.statusBadge} ${STATUS_BADGE_CLASS[key] || STATUS_BADGE_CLASS.pending}`}>
      {key === "pending" ? "Awaiting L2" : key}
    </span>
  );
}

const humanizeDepartmentCode = (value) => {
  const normalized = trimValue(value);
  if (!normalized) return "";
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

// Multiple departments can share one aggregator endpoint with overlapping type
// codes (e.g. both Spinning and Draw Frame use "type1"/"type2"/"type3"), so we
// can't safely guess a friendly name from the code alone without risking a
// wrong label. Prefer an explicit name field if the backend sends one; otherwise
// just humanize the raw code as-is rather than collapsing it into a guess.
const defaultResolveDepartmentLabel = (item) => {
  const explicit = trimValue(
    item?.department_name ?? item?.departmentName ?? item?.source ?? item?.module ?? item?.screen ?? ""
  );
  if (explicit) return explicit;
  return humanizeDepartmentCode(item?.department) || "-";
};

const formatCreatedOn = (value) => {
  if (!trimValue(value)) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return trimValue(value);
  const pad = (num) => String(num).padStart(2, "0");
  const datePart = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  const timePart = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${datePart}, ${timePart}`;
};

const getGroupLabel = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Older";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const itemDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((today - itemDay) / 86400000);

  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString("en-GB");
};

// Default shape: a JSONB parameters/parameter_rows/rows blob of
// {key,label,existing,proposed} — what Spinning, Draw Frame, and Simplex all
// store. Carding's backend instead stores flat `${field}_existing`/
// `${field}_proposed` columns with no blob at all, so it supplies its own
// `extractParameters` (see CardingChangeControlApprovals.jsx) rather than
// relying on this default.
const defaultExtractParameters = (item) => {
  const source = Array.isArray(item?.parameters)
    ? item.parameters
    : Array.isArray(item?.parameter_rows)
      ? item.parameter_rows
      : item?.rows && typeof item.rows === "object"
        ? Object.values(item.rows)
        : [];

  return source
    .map((row, index) => ({
      key: trimValue(row?.key) || `param-${index}`,
      label: trimValue(row?.label) || trimValue(row?.key) || `Parameter ${index + 1}`,
      value: trimValue(row?.proposed ?? row?.value ?? row?.existing ?? ""),
    }))
    .filter((row) => row.label);
};

function ApprovalsQueueView({
  pageTitle,
  entityLabel = "entries",
  fetchPending,
  fetchApproved,
  approve,
  reject,
  resolveDepartmentLabel = defaultResolveDepartmentLabel,
  extractParameters = defaultExtractParameters,
  departmentSuffix = "Department",
  modalTitleId = "approval-title",
  successEntityName = "Entry",
}) {
  const user = useSelector((state) => state.auth?.user);
  const isHydrated = useSelector((state) => state.auth?.isHydrated);
  const canApprove = isWheelChangeApproverUser(user);
  const [activeTab, setActiveTab] = useState("pending");
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const normalizeApprovalItem = useCallback(
    (item, index) => ({
      id: trimValue(item?.id ?? item?.approval_id ?? item?.entry_id ?? index),
      department: trimValue(item?.department ?? item?.department_name ?? ""),
      departmentLabel: resolveDepartmentLabel(item),
      title: trimValue(item?.title ?? item?.wheel_change_type_label ?? item?.type ?? "") || pageTitle,
      operator:
        trimValue(item?.operator ?? item?.operator_name ?? item?.user_name ?? item?.created_by ?? "") || "-",
      createdOn: item?.created_at ?? item?.created_on ?? item?.entry_date ?? "",
      remarks: trimValue(item?.remarks ?? item?.comment ?? ""),
      status: trimValue(item?.approval_status ?? item?.status ?? "pending").toLowerCase() || "pending",
      parameters: extractParameters(item),
    }),
    [extractParameters, pageTitle, resolveDepartmentLabel]
  );

  const extractApprovalRows = useCallback(
    (payload) => {
      const rows = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.rows)
          ? payload.rows
          : Array.isArray(payload)
            ? payload
            : [];
      return rows.map(normalizeApprovalItem);
    },
    [normalizeApprovalItem]
  );

  const loadApprovals = useCallback(
    async (tab) => {
      setLoading(true);
      setError("");
      try {
        const payload = tab === "approved" ? await fetchApproved() : await fetchPending();
        setApprovals(extractApprovalRows(payload));
      } catch (err) {
        setError(
          err?.message || `Unable to load ${tab === "approved" ? "existing" : "pending"} ${entityLabel}.`
        );
        setApprovals([]);
      } finally {
        setLoading(false);
      }
    },
    [entityLabel, extractApprovalRows, fetchApproved, fetchPending]
  );

  useEffect(() => {
    if (!isHydrated || !canApprove) return;
    loadApprovals(activeTab);
  }, [activeTab, canApprove, isHydrated, loadApprovals]);

  const closeDetail = () => {
    setSelected(null);
    setShowRejectForm(false);
    setRejectReason("");
  };

  const handleApprove = async () => {
    if (!selected || approving || rejecting) return;
    setApproving(true);
    setError("");
    try {
      await approve(selected.id, { department: selected.department });
      setApprovals((current) => current.filter((item) => item.id !== selected.id));
      closeDetail();
      setSuccessMessage(`${successEntityName} Approved`);
      setShowSuccess(true);
    } catch (err) {
      setError(err?.message || `Unable to approve this entry.`);
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!selected || approving || rejecting) return;
    setRejecting(true);
    setError("");
    try {
      await reject(selected.id, { department: selected.department, reason: rejectReason.trim() });
      setApprovals((current) => current.filter((item) => item.id !== selected.id));
      closeDetail();
      setSuccessMessage(`${successEntityName} Rejected`);
      setShowSuccess(true);
    } catch (err) {
      setError(err?.message || `Unable to reject this entry.`);
    } finally {
      setRejecting(false);
    }
  };

  const groupedApprovals = useMemo(() => {
    const groups = new Map();
    approvals.forEach((item) => {
      const label = getGroupLabel(item.createdOn);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(item);
    });
    return Array.from(groups.entries()).map(([label, rows]) => ({ label, rows }));
  }, [approvals]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{pageTitle}</h1>

      {isHydrated && !canApprove ? (
        <div className={styles.accessNotice}>
          Only L2 users can view and approve proposed {entityLabel}. Please contact your administrator if you need
          access.
        </div>
      ) : null}

      {isHydrated && canApprove ? (
        <>
          <div className={styles.tabs}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ""}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {error ? <div className={styles.errorState}>{error}</div> : null}

          {loading ? (
            <div className={styles.emptyState}>
              Loading {activeTab === "approved" ? "existing" : "pending"} approvals...
            </div>
          ) : groupedApprovals.length ? (
            <div className={styles.groups}>
              {groupedApprovals.map((group) => (
                <section key={group.label} className={styles.group}>
                  <h2 className={styles.groupTitle}>{group.label}</h2>
                  <div className={styles.list}>
                    {group.rows.map((item) => (
                      <button key={item.id} type="button" onClick={() => setSelected(item)} className={styles.row}>
                        <span className={styles.rowMain}>
                          <span className={styles.rowTitleLine}>
                            <strong>{item.title}</strong>
                            <StatusBadge status={item.status} />
                          </span>
                          <span>{item.departmentLabel ? `${item.departmentLabel} ${departmentSuffix}` : "-"}</span>
                        </span>
                        <span className={styles.rowMeta}>
                          <span>
                            <small>Operator</small>
                            <strong>{item.operator}</strong>
                          </span>
                          <span>
                            <small>Created On</small>
                            <strong>{formatCreatedOn(item.createdOn)}</strong>
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              No {entityLabel} are {activeTab === "approved" ? "approved yet" : "waiting for approval"}.
            </div>
          )}
        </>
      ) : null}

      {selected ? (
        <div className={styles.overlay} role="presentation" onClick={closeDetail}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className={styles.closeButton} aria-label="Close" onClick={closeDetail}>
              ✕
            </button>

            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalHeaderTitleLine}>
                  <h2 id={modalTitleId}>{selected.title}</h2>
                  <StatusBadge status={selected.status} />
                </div>
                <p>
                  Quality Control &gt; {selected.departmentLabel || "-"}
                </p>
              </div>
              <div className={styles.modalMeta}>
                <span>
                  <small>Operator</small>
                  <strong>{selected.operator}</strong>
                </span>
                <span>
                  <small>Created On</small>
                  <strong>{formatCreatedOn(selected.createdOn)}</strong>
                </span>
              </div>
            </div>

            <div className={styles.fieldGrid}>
              {selected.parameters.map((row) => (
                <div key={row.key} className={styles.fieldCard}>
                  <small>{row.label}</small>
                  <strong>{row.value || "-"}</strong>
                </div>
              ))}
              {selected.remarks ? (
                <div className={styles.fieldCard} style={{ gridColumn: "span 2" }}>
                  <small>Operator Remarks</small>
                  <strong>{selected.remarks}</strong>
                </div>
              ) : null}
              {!selected.parameters.length && !selected.remarks ? (
                <div className={styles.emptyState} style={{ gridColumn: "1 / -1" }}>
                  No proposed values were captured for this entry.
                </div>
              ) : null}
            </div>

            {activeTab === "pending" ? (
              <>
                {showRejectForm ? (
                  <div className={styles.rejectForm}>
                    <label htmlFor="approval-reject-reason">
                      Reason for rejection (optional, recommended for audit)
                    </label>
                    <textarea
                      id="approval-reject-reason"
                      className={styles.rejectTextarea}
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      placeholder="e.g. Proposed value is inconsistent with the count."
                    />
                  </div>
                ) : null}

                <div className={styles.actions}>
                  {showRejectForm ? (
                    <button
                      type="button"
                      className={styles.confirmRejectButton}
                      disabled={rejecting}
                      onClick={handleReject}
                    >
                      {rejecting ? "Rejecting..." : "Confirm Reject"}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={styles.rejectButton}
                        disabled={approving}
                        onClick={() => setShowRejectForm(true)}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className={styles.approveButton}
                        disabled={approving}
                        onClick={handleApprove}
                      >
                        {approving ? "Approving..." : "Approve"}
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <SuccessModal open={showSuccess} message={successMessage} onClose={() => setShowSuccess(false)} closeLabel="OK" />
    </div>
  );
}

export default ApprovalsQueueView;

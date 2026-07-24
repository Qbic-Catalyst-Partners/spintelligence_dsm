import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";

import { FaCheckCircle, FaIdCard } from "react-icons/fa";
import { FiCalendar } from "react-icons/fi";
import Pagination from "@/components/Pagination";
import { HiOutlineTag, HiOutlineUserGroup } from "react-icons/hi2";
import SuccessModal from "@/components/SuccessModal";
import SearchableSelect from "@/components/SearchableSelect";
import { isWheelChangeApproverUser } from "@/utils/accessControl";
import styles from "@/styles/wheelChangeApprovals.module.css";
import combinedStyles from "@/styles/combinedProcessParameterPreview.module.css";
import { formatDateTime, formatDateOnly } from "@/utils/formatDateTime";

const DEFAULT_TAB_LABELS = {
  pending: "Pending Approvals",
  approved: "Existing Approvals",
  rejected: "Rejected",
};

const STATUS_BADGE_CLASS = {
  pending: styles.statusBadgePending,
  approved: styles.statusBadgeApproved,
  rejected: styles.statusBadgeRejected,
  // PP lifecycle statuses (process_parameters.master.status)
  in_progress: styles.statusBadgePending,
  pending_approval: styles.statusBadgePending,
  active: styles.statusBadgeApproved,
  inactive: styles.statusBadgeRejected,
};

const STATUS_BADGE_LABEL = {
  pending: "Awaiting L2",
  in_progress: "In Progress",
  pending_approval: "Awaiting L4",
  active: "Active",
  inactive: "Inactive",
};

const trimValue = (value) => String(value ?? "").trim();

// Operator/consignee/count names sometimes carry double spaces or odd
// spacing from source data (e.g. "Aravinth  S") - collapse to single spaces
// before comparing so a normally-typed filter query still matches them.
const normalizeSearchText = (value) => trimValue(value).toLowerCase().replace(/\s+/g, " ");

const firstNonEmpty = (...values) => {
  for (const value of values) {
    const trimmed = trimValue(value);
    if (trimmed) return trimmed;
  }
  return "";
};

// Raw type codes like "type1" (Spinning's four wheel-change tables set this
// but have no wheel_change_type_label of their own, unlike Draw Frame) ->
// "Type 1", so the list/detail title still shows which sub-type an entry
// belongs to instead of falling all the way back to the generic pageTitle.
const humanizeWheelChangeTypeCode = (value) => {
  const match = String(value ?? "").trim().match(/^type_?(\d+)$/i);
  return match ? `Type ${match[1]}` : "";
};

function StatusBadge({ status, pendingLabel }) {
  const key = trimValue(status).toLowerCase() || "pending";
  const label = key === "pending" && pendingLabel ? pendingLabel : STATUS_BADGE_LABEL[key] || key;
  return (
    <span className={`${styles.statusBadge} ${STATUS_BADGE_CLASS[key] || STATUS_BADGE_CLASS.pending}`}>
      {label}
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
  const formatted = formatDateTime(value);
  return formatted === "-" ? trimValue(value) : formatted;
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
  return formatDateOnly(date);
};

// Candidate raw field names to look for Count/Consignee on an approval item —
// broad enough to cover Spinning's flat `${field}_existing`/`_proposed`
// wheel-change columns, Spinning's PP header (count_name/consignee_name),
// and the variety/mixing naming other departments use.
const DEFAULT_COUNT_NAME_KEYS = [
  "count_name",
  "count_from_proposed",
  "count_from_existing",
  "count_from",
  "count",
  "variety_name",
  "variety",
  "mixing_name",
  "mixing",
];
const DEFAULT_CONSIGNEE_NAME_KEYS = [
  "consignee_name_proposed",
  "consignee_name_existing",
  "consignee_name",
  "consignee",
];

const extractFieldValue = (item, keys) => {
  for (const key of keys) {
    const value = trimValue(item?.[key]);
    if (value) return value;
  }
  return "";
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
  fetchRejected,
  approve,
  reject,
  resolveDepartmentLabel = defaultResolveDepartmentLabel,
  extractParameters = defaultExtractParameters,
  departmentSuffix = "Department",
  modalTitleId = "approval-title",
  successEntityName = "Entry",
  countNameKeys = DEFAULT_COUNT_NAME_KEYS,
  consigneeNameKeys = DEFAULT_CONSIGNEE_NAME_KEYS,
  canApproveCheck = isWheelChangeApproverUser,
  accessDeniedText = "Only L2 users can view and approve proposed",
  tabLabels = DEFAULT_TAB_LABELS,
  showDepartmentFilter = true,
  operatorLabel = "Operator",
  pendingStatusLabel = "",
}) {
  const user = useSelector((state) => state.auth?.user);
  const isHydrated = useSelector((state) => state.auth?.isHydrated);
  const canApprove = canApproveCheck(user);
  const mergedTabLabels = { ...DEFAULT_TAB_LABELS, ...tabLabels };
  // Rejected is opt-in per screen (only PP Approvals passes fetchRejected
  // today) - other approval screens (Wheel Change, Carding, etc.) keep their
  // existing two-tab layout unchanged.
  const TABS = [
    { key: "pending", label: mergedTabLabels.pending },
    { key: "approved", label: mergedTabLabels.approved },
    ...(fetchRejected ? [{ key: "rejected", label: mergedTabLabels.rejected }] : []),
  ];
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
  const [filters, setFilters] = useState({
    department: "",
    countName: "",
    consigneeName: "",
    machineNumber: "",
    operatorName: "",
    dateFrom: "",
    dateTo: "",
  });
  const [dateRangePreset, setDateRangePreset] = useState("custom");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;
  const dateFromInputRef = useRef(null);
  const dateToInputRef = useRef(null);
  // Same calendar-icon pattern as the ticketing screens (SubmittedNotebooksPage,
  // ActivityLogs) - a native date input with its own indicator hidden (see
  // .dateInputWrap in the shared CSS) and this icon driving showPicker() instead,
  // so both places behave identically.
  const openDatePicker = (inputRef) => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
    } else {
      input.focus();
    }
  };

  // Picking "Custom" from the date-range preset dropdown should immediately
  // open the date picker rather than leaving the operator to notice and
  // click the now-visible input themselves - but not on first mount, since
  // "custom" is also the default preset before the operator has touched it.
  const dateRangePresetMountedRef = useRef(false);
  useEffect(() => {
    if (!dateRangePresetMountedRef.current) {
      dateRangePresetMountedRef.current = true;
      return;
    }
    if (dateRangePreset !== "custom") return;
    openDatePicker(dateFromInputRef);
  }, [dateRangePreset]);

  const normalizeApprovalItem = useCallback(
    (item, index) => ({
      id: trimValue(item?.id ?? item?.approval_id ?? item?.entry_id ?? index),
      department: trimValue(item?.department ?? item?.department_name ?? ""),
      departmentLabel: resolveDepartmentLabel(item),
      countName: extractFieldValue(item, countNameKeys),
      consigneeName: extractFieldValue(item, consigneeNameKeys),
      // A generic screen label like "Wheel Change" on item.type is truthy, so
      // a ?? chain would always stop there before ever reaching the more
      // specific wheel_change_type-derived title (e.g. Spinning's raw rows
      // carry type: "Wheel Change" on every row regardless of sub-type) -
      // pick the first value that's actually non-empty after trimming
      // instead of the first merely-defined one.
      title:
        firstNonEmpty(
          item?.title,
          item?.wheel_change_type_label,
          humanizeWheelChangeTypeCode(item?.wheel_change_type),
          item?.type
        ) || pageTitle,
      operator:
        trimValue(item?.operator ?? item?.operator_name ?? item?.user_name ?? item?.created_by ?? "") || "-",
      machineNumber:
        firstNonEmpty(
          item?.machine_no,
          item?.machine_number,
          item?.mc_no,
          item?.fm_no,
          item?.fr_no,
          item?.frame_no,
          item?.card_no,
          item?.spdl_no
        ) || "-",
      createdOn: item?.created_at ?? item?.created_on ?? item?.entry_date ?? "",
      remarks: trimValue(item?.remarks ?? item?.comment ?? ""),
      // Set on reject (and approve, for reviewedBy) - surfaced in the detail
      // modal so a reviewer (or the operator, on a rejected entry) can see
      // who acted on it and why.
      reviewRemarks: trimValue(item?.review_remarks ?? ""),
      reviewedBy: trimValue(item?.reviewed_by ?? ""),
      status: trimValue(item?.approval_status ?? item?.status ?? "pending").toLowerCase() || "pending",
      parameters: extractParameters(item),
    }),
    [consigneeNameKeys, countNameKeys, extractParameters, pageTitle, resolveDepartmentLabel]
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
        const payload =
          tab === "approved"
            ? await fetchApproved()
            : tab === "rejected"
              ? await fetchRejected()
              : await fetchPending();
        setApprovals(extractApprovalRows(payload));
      } catch (err) {
        setError(
          err?.message || `Unable to load ${tab === "approved" ? "existing" : tab === "rejected" ? "rejected" : "pending"} ${entityLabel}.`
        );
        setApprovals([]);
      } finally {
        setLoading(false);
      }
    },
    [entityLabel, extractApprovalRows, fetchApproved, fetchPending, fetchRejected]
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

  const departmentOptions = useMemo(() => {
    const seen = new Map();
    approvals.forEach((item) => {
      if (item.departmentLabel) seen.set(item.department || item.departmentLabel, item.departmentLabel);
    });
    return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
  }, [approvals]);

  // Distinct, non-empty values seen in the current tab's data - used to
  // populate the Count Name/Consignee Name/Machine No./Operator filters as
  // dropdowns instead of free-text search, so an approver can only pick a
  // value that's actually present rather than guessing spelling.
  const buildUniqueOptions = (getValue) => {
    const seen = new Set();
    approvals.forEach((item) => {
      const value = trimValue(getValue(item));
      if (value) seen.add(value);
    });
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  };
  const countNameOptions = useMemo(() => buildUniqueOptions((item) => item.countName), [approvals]);
  const consigneeNameOptions = useMemo(() => buildUniqueOptions((item) => item.consigneeName), [approvals]);
  const machineNumberOptions = useMemo(() => buildUniqueOptions((item) => item.machineNumber), [approvals]);
  const operatorNameOptions = useMemo(() => buildUniqueOptions((item) => item.operator), [approvals]);

  const submissionCount = approvals.length;
  const uniqueCountNameCount = countNameOptions.length;
  const uniqueConsigneeNameCount = consigneeNameOptions.length;

  const updateFilter = (field) => (event) => {
    const value = event?.target ? event.target.value : event;
    setFilters((current) => ({ ...current, [field]: value }));
  };

  const formatDateInputValue = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handleDateRangePresetChange = (event) => {
    const preset = event.target.value;
    setDateRangePreset(preset);

    if (preset === "custom") return;

    const now = new Date();
    let from = null;
    let to = now;

    if (preset === "today") {
      from = now;
    } else if (preset === "week") {
      from = new Date(now);
      // Sunday-start week, matching the calendar week the user is currently in.
      from.setDate(now.getDate() - now.getDay());
    } else if (preset === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (preset === "year") {
      from = new Date(now.getFullYear(), 0, 1);
    }

    setFilters((current) => ({
      ...current,
      dateFrom: formatDateInputValue(from),
      dateTo: formatDateInputValue(to),
    }));
  };

  const clearFilters = () => {
    setDateRangePreset("custom");
    setFilters({
      department: "",
      countName: "",
      consigneeName: "",
      machineNumber: "",
      operatorName: "",
      dateFrom: "",
      dateTo: "",
    });
  };

  const hasActiveFilters = Object.values(filters).some((value) => trimValue(value));

  const filteredApprovals = useMemo(() => {
    const countNameFilter = normalizeSearchText(filters.countName);
    const consigneeNameFilter = normalizeSearchText(filters.consigneeName);
    const machineNumberFilter = normalizeSearchText(filters.machineNumber);
    const operatorNameFilter = normalizeSearchText(filters.operatorName);
    const fromTime = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`).getTime() : null;
    const toTime = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`).getTime() : null;

    return approvals.filter((item) => {
      if (filters.department && (item.department || item.departmentLabel) !== filters.department) return false;
      if (countNameFilter && !normalizeSearchText(item.countName).includes(countNameFilter)) return false;
      if (consigneeNameFilter && !normalizeSearchText(item.consigneeName).includes(consigneeNameFilter)) return false;
      if (machineNumberFilter && !normalizeSearchText(item.machineNumber).includes(machineNumberFilter)) return false;
      if (operatorNameFilter && !normalizeSearchText(item.operator).includes(operatorNameFilter)) return false;

      if (fromTime !== null || toTime !== null) {
        const itemTime = item.createdOn ? new Date(item.createdOn).getTime() : NaN;
        if (Number.isNaN(itemTime)) return false;
        if (fromTime !== null && itemTime < fromTime) return false;
        if (toTime !== null && itemTime > toTime) return false;
      }

      return true;
    });
  }, [approvals, filters]);

  const totalPages = Math.max(1, Math.ceil(filteredApprovals.length / PAGE_SIZE));

  // Reset back to page 1 whenever the tab or filters change the underlying
  // result set - otherwise a page number from a longer list can point past
  // the end of a shorter, newly-filtered one.
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, filters]);

  const paginatedApprovals = useMemo(
    () => filteredApprovals.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredApprovals, currentPage]
  );

  const goToPage = (page) => {
    setCurrentPage(Math.min(Math.max(1, page), totalPages));
  };

  const groupedApprovals = useMemo(() => {
    const groups = new Map();
    paginatedApprovals.forEach((item) => {
      const label = getGroupLabel(item.createdOn);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(item);
    });
    return Array.from(groups.entries()).map(([label, rows]) => ({ label, rows }));
  }, [paginatedApprovals]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{pageTitle}</h1>

      {isHydrated && !canApprove ? (
        <div className={styles.accessNotice}>
          {accessDeniedText} {entityLabel}. Please contact your administrator if you need
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

          <div className={styles.statsGrid}>
            <article className={styles.statCard}>
              <div className={`${styles.statIcon} ${styles.blue}`}>
                <FaIdCard />
              </div>
              <div>
                <span>No. of Submission</span>
                <strong>{submissionCount}</strong>
              </div>
            </article>
            <article className={styles.statCard}>
              <div className={`${styles.statIcon} ${styles.activeTone}`}>
                <HiOutlineTag />
              </div>
              <div>
                <span>No. of Count Name Unique</span>
                <strong>{uniqueCountNameCount}</strong>
              </div>
            </article>
            <article className={styles.statCard}>
              <div className={`${styles.statIcon} ${styles.inactiveTone}`}>
                <HiOutlineUserGroup />
              </div>
              <div>
                <span>No. of Consignee Name Unique</span>
                <strong>{uniqueConsigneeNameCount}</strong>
              </div>
            </article>
          </div>

          <div className={styles.filterBar}>
            <div className={styles.filterField}>
              <label htmlFor="approval-filter-count-name">Count Name</label>
              <SearchableSelect
                className={styles.filterSelect}
                value={filters.countName}
                onChange={updateFilter("countName")}
                options={countNameOptions}
                includeEmptyOption
                emptyOptionLabel="All"
                placeholder="All"
                ariaLabel="Count Name"
              />
            </div>
            <div className={styles.filterField}>
              <label htmlFor="approval-filter-consignee-name">Consignee Name</label>
              <SearchableSelect
                className={styles.filterSelect}
                value={filters.consigneeName}
                onChange={updateFilter("consigneeName")}
                options={consigneeNameOptions}
                includeEmptyOption
                emptyOptionLabel="All"
                placeholder="All"
                ariaLabel="Consignee Name"
              />
            </div>
            <div className={styles.filterField}>
              <label htmlFor="approval-filter-machine-no">Machine No.</label>
              <SearchableSelect
                className={styles.filterSelect}
                value={filters.machineNumber}
                onChange={updateFilter("machineNumber")}
                options={machineNumberOptions}
                includeEmptyOption
                emptyOptionLabel="All"
                placeholder="All"
                ariaLabel="Machine No."
              />
            </div>
            <div className={styles.filterField}>
              <label htmlFor="approval-filter-operator-name">{operatorLabel}</label>
              <SearchableSelect
                className={styles.filterSelect}
                value={filters.operatorName}
                onChange={updateFilter("operatorName")}
                options={operatorNameOptions}
                includeEmptyOption
                emptyOptionLabel="All"
                placeholder="All"
                ariaLabel={operatorLabel}
              />
            </div>
            {showDepartmentFilter && departmentOptions.length > 1 ? (
              <div className={styles.filterField}>
                <label htmlFor="approval-filter-department">Department</label>
                <SearchableSelect
                  className={styles.filterSelect}
                  value={filters.department}
                  onChange={updateFilter("department")}
                  options={departmentOptions}
                  includeEmptyOption
                  emptyOptionLabel="All"
                  placeholder="All"
                  ariaLabel="Department"
                />
              </div>
            ) : null}
            <div className={styles.filterField}>
              <label htmlFor="approval-filter-date-range">Created Date</label>
              <select
                id="approval-filter-date-range"
                className={styles.filterSelect}
                value={dateRangePreset}
                onChange={handleDateRangePresetChange}
              >
                <option value="custom">Custom</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
              </select>
            </div>
            {dateRangePreset === "custom" ? (
              <div className={`${styles.filterField} ${styles.filterDateRange}`}>
                <label htmlFor="approval-filter-date-from">Date Range</label>
                <div className={styles.filterDateRangeInputs}>
                  <span className={styles.dateInputWrap}>
                    <input
                      id="approval-filter-date-from"
                      ref={dateFromInputRef}
                      type="date"
                      className={styles.filterInput}
                      value={filters.dateFrom}
                      onChange={updateFilter("dateFrom")}
                    />
                    <FiCalendar
                      className={styles.dateInputIcon}
                      aria-hidden="true"
                      onClick={() => openDatePicker(dateFromInputRef)}
                    />
                  </span>
                  <span className={styles.filterDateRangeSeparator}>to</span>
                  <span className={styles.dateInputWrap}>
                    <input
                      id="approval-filter-date-to"
                      ref={dateToInputRef}
                      type="date"
                      className={styles.filterInput}
                      value={filters.dateTo}
                      onChange={updateFilter("dateTo")}
                    />
                    <FiCalendar
                      className={styles.dateInputIcon}
                      aria-hidden="true"
                      onClick={() => openDatePicker(dateToInputRef)}
                    />
                  </span>
                </div>
              </div>
            ) : null}
            {hasActiveFilters ? (
              <button type="button" className={styles.filterClearButton} onClick={clearFilters}>
                Clear Filters
              </button>
            ) : null}
          </div>

          {hasActiveFilters ? (
            <div className={styles.filterResultCount}>
              Showing {filteredApprovals.length} of {approvals.length} {entityLabel}.
            </div>
          ) : null}

          {error ? <div className={styles.errorState}>{error}</div> : null}

          {loading ? (
            <div className={styles.emptyState}>
              Loading {tabLabels[activeTab] || DEFAULT_TAB_LABELS[activeTab] || ""} Approvals...
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
                            <StatusBadge status={item.status} pendingLabel={pendingStatusLabel} />
                          </span>
                          <span>{item.departmentLabel ? `${item.departmentLabel} ${departmentSuffix}` : "-"}</span>
                        </span>
                        <span className={styles.rowMeta}>
                          <span>
                            <small>{operatorLabel}</small>
                            <strong>{item.operator}</strong>
                          </span>
                          <span>
                            <small>Machine No.</small>
                            <strong>{item.machineNumber}</strong>
                          </span>
                          {item.countName ? (
                            <span>
                              <small>Count Name</small>
                              <strong>{item.countName}</strong>
                            </span>
                          ) : null}
                          {item.consigneeName ? (
                            <span>
                              <small>Consignee Name</small>
                              <strong>{item.consigneeName}</strong>
                            </span>
                          ) : null}
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
              {hasActiveFilters && approvals.length
                ? `No ${entityLabel} match the current filters.`
                : `No ${entityLabel} are ${
                    activeTab === "approved" ? "approved yet" : activeTab === "rejected" ? "rejected" : "waiting for approval"
                  }.`}
            </div>
          )}

          {!loading && filteredApprovals.length ? (
            <Pagination page={currentPage} totalPages={totalPages} onPageChange={goToPage} />
          ) : null}
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
                  <StatusBadge status={selected.status} pendingLabel={pendingStatusLabel} />
                </div>
                <p>
                  Quality Control &gt; {selected.departmentLabel || "-"}
                </p>
              </div>
              <div className={styles.modalMeta}>
                <span>
                  <small>{operatorLabel}</small>
                  <strong>{selected.operator}</strong>
                </span>
                <span>
                  <small>Machine No.</small>
                  <strong>{selected.machineNumber}</strong>
                </span>
                <span>
                  <small>Created On</small>
                  <strong>{formatCreatedOn(selected.createdOn)}</strong>
                </span>
              </div>
            </div>

            {selected.parameters.some((row) => row.group) ? (
              <div className={combinedStyles.sections}>
                {(() => {
                  const flatRows = selected.parameters.filter((row) => !row.group);
                  const groupOrder = [];
                  const groupRows = new Map();
                  const groupHeaders = new Map();
                  selected.parameters.forEach((row) => {
                    if (!row.group) return;
                    if (!groupRows.has(row.group)) {
                      groupRows.set(row.group, []);
                      groupOrder.push(row.group);
                    }
                    if (row.isSectionHeader) {
                      groupHeaders.set(row.group, row);
                    } else {
                      groupRows.get(row.group).push(row);
                    }
                  });

                  return (
                    <>
                      {flatRows.length ? (
                        <div className={combinedStyles.fieldGrid}>
                          {flatRows.map((row) => (
                            <div key={row.key} className={combinedStyles.fieldTile}>
                              <div className={combinedStyles.fieldLabel}>{row.label}</div>
                              <div className={combinedStyles.fieldValue}>{row.value || "-"}</div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {groupOrder.map((groupKey) => {
                        const header = groupHeaders.get(groupKey);
                        const rows = groupRows.get(groupKey) || [];
                        return (
                          <div key={groupKey} className={combinedStyles.section}>
                            <div className={combinedStyles.sectionHeader}>
                              <span className={combinedStyles.sectionTitle}>{header?.groupLabel || groupKey}</span>
                              {header?.done ? (
                                <FaCheckCircle className={combinedStyles.doneIcon} />
                              ) : (
                                <span className={combinedStyles.pendingIcon} />
                              )}
                            </div>
                            {rows.length ? (
                              <div className={combinedStyles.fieldGrid}>
                                {rows.map((row) => (
                                  <div key={row.key} className={combinedStyles.fieldTile}>
                                    <div className={combinedStyles.fieldLabel}>{row.label}</div>
                                    <div className={combinedStyles.fieldValue}>{row.value || "0"}</div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className={combinedStyles.loadingRow}>Not submitted yet</div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className={styles.fieldGrid}>
                {selected.parameters.map((row) => (
                  <div key={row.key} className={styles.fieldCard}>
                    <small>{row.label}</small>
                    <strong>{row.value || "-"}</strong>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.fieldGrid}>
              {selected.remarks ? (
                <div className={styles.fieldCard} style={{ gridColumn: "span 2" }}>
                  <small>Operator Remarks</small>
                  <strong>{selected.remarks}</strong>
                </div>
              ) : null}
              {selected.status === "rejected" && (selected.reviewRemarks || selected.reviewedBy) ? (
                <div className={styles.fieldCard} style={{ gridColumn: "span 2" }}>
                  <small>Rejection Reason{selected.reviewedBy ? ` (${selected.reviewedBy})` : ""}</small>
                  <strong>{selected.reviewRemarks || "No reason provided"}</strong>
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

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { fetchUsers } from "@/store/slices/userSlice";
import { FiMoreVertical, FiX } from "react-icons/fi";

import ThresholdValuesPage from "@/views/thresholds/ThresholdValues";
import SubmissionThresholdPage from "@/views/thresholds/SubmissionThreshold";
import PPNotebookThresholdPage from "@/views/thresholds/PPNotebookThresholdPage";
import SubmittedNotebookThresholdPage from "@/views/tickets/SubmittedNotebookThresholdPage";
import WheelChangeApprovalThresholdPage from "@/views/thresholds/WheelChangeApprovalThresholdPage";

import {
  fetchThresholdsAPI,
  updateThresholdStatusAPI,
  updateThresholdAPI,
  deleteThresholdAPI,
} from "@/apis/thresholdsApi";
import {
  fetchSubmissionFrequencyConfigsAPI,
  saveSubmissionFrequencyConfigAPI,
  updateSubmissionFrequencyStatusAPI,
  updateSubmissionFrequencyConfigAPI,
  deleteSubmissionFrequencyConfigAPI,
} from "@/apis/submissionFrequencyApi";
import {
  fetchPpNotebookThresholdsAPI,
  deletePpNotebookThresholdAPI,
  updatePpNotebookThresholdStatusAPI,
} from "@/apis/ppNotebookThresholdApi";
import {
  fetchNotebookAcknowledgementThresholdsAPI,
  updateNotebookAcknowledgementThresholdAPI,
  updateNotebookAcknowledgementThresholdStatusAPI,
  deleteNotebookAcknowledgementThresholdAPI,
} from "@/apis/notebookAcknowledgementThresholdApi";
import {
  fetchWheelChangeApprovalConfigListAPI,
  updateWheelChangeApprovalConfigStatusAPI,
  deleteWheelChangeApprovalConfigAPI,
} from "@/apis/wheelChangeApprovalConfigApi";

import { departmentDirectory } from "@/views/departments/data";
import { getThresholdScreensForSubDepartment } from "@/views/thresholds/screenCatalog";
import { isFullAccessUser, isSubmittedNotebookManagerUser } from "@/utils/accessControl";
import styles from "@/styles/SubmissionThreshold.module.css";
import warningStyles from "@/styles/warningModal.module.css";

const THRESHOLD_TYPES = [
  { value: "value", label: "Value Threshold" },
  { value: "submission", label: "Submission Threshold" },
  { value: "pp", label: "PP Threshold" },
  { value: "acknowledgement", label: "Acknowledgement Threshold" },
  { value: "wheel-change-approval", label: "WC Threshold" },
];

// Columns differ per threshold type, so each type declares its own extra
// columns (beyond the shared Department/Sub Department/Notebook Type/Status/
// Created At columns) instead of forcing every type into one generic shape.
const THRESHOLD_TYPE_COLUMNS = {
  value: [
    { key: "field", label: "Input Field" },
    { key: "l1", label: "L1" },
    { key: "typicalValue", label: "Typical Value" },
    { key: "detail", label: "Plus (+) / Minus (-)" },
  ],
  submission: [
    { key: "l1", label: "L1" },
    { key: "days", label: "Days" },
    { key: "frequency", label: "Frequency" },
  ],
  pp: [
    { key: "field", label: "Criticality" },
    { key: "l1", label: "L1 Proposer" },
    { key: "l2", label: "L4 Approver" },
    { key: "entryWithin", label: "Entry Within" },
    { key: "approveWithin", label: "Approve Within" },
  ],
  acknowledgement: [
    { key: "field", label: "Criticality" },
    { key: "l2", label: "L4 Approver" },
    { key: "detail", label: "Acknowledge Within" },
  ],
  "wheel-change-approval": [
    { key: "field", label: "Criticality" },
    { key: "l1", label: "L4 Approver" },
    { key: "detail", label: "Approve Within" },
  ],
};

// Wheel Change Approval is scoped by department only, not sub-department -
// that column is dropped from the merged Existing Thresholds table instead
// of always showing "-".
const THRESHOLD_TYPE_LOCATION_COLUMNS = {
  "wheel-change-approval": { department: true, subDepartment: false },
};

const getLocationColumns = (type) =>
  THRESHOLD_TYPE_LOCATION_COLUMNS[type] || { department: true, subDepartment: true };

const getActiveValue = (item) => item?.is_active ?? item?.isActive ?? true;

const formatTimestamp = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year}, ${hours}:${minutes}`;
};

const nameListToText = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ") || "-";
  return String(value ?? "").trim() || "-";
};

const getRowId = (item) => item?.id || item?._id || item?.threshold_id || item?.thresholdId || "";

// Builds the "Department > Sub Department > Notebook Type > Field Name"
// breadcrumb shown in the delete-confirmation modal, using the same
// normalized row shape (department/subDepartment/notebookType/field) every
// threshold type already produces above.
const getDeleteThresholdSummary = (row) =>
  [row?.department, row?.subDepartment, row?.notebookType, row?.field]
    .filter((part) => part && part !== "-")
    .join(" > ");

// The approver name shown on its own line below the breadcrumb, labeled
// with whichever level ("L1"/"L1 Proposer"/"L4 Approver"/...) that type's
// column config uses for the populated field.
const getDeleteThresholdApprover = (row) => {
  const columns = THRESHOLD_TYPE_COLUMNS[row?.type] || [];
  const l1Column = columns.find((column) => column.key === "l1");
  const l2Column = columns.find((column) => column.key === "l2");

  if (row?.l1 && row.l1 !== "-") {
    return `${row.l1} (${l1Column?.label || "L1"})`;
  }
  if (row?.l2 && row.l2 !== "-") {
    return `${row.l2} (${l2Column?.label || "L4"})`;
  }
  return "";
};

// Normalizes each threshold type's row shape into one common display shape
// so the merged "Existing Thresholds" tab can render every type in one table.
const normalizeValueThresholdRow = (item, users) => {
  const l1UserNames =
    resolveUserNames(item?.approval_l1_user_ids, users) ||
    resolveUserNames(item?.approval_l1_ids, users) ||
    [];

  return ({
  type: "value",
  typeLabel: "Value Threshold",
  id: getRowId(item),
  raw: item,
  department: item?.department || item?.management_field || "-",
  subDepartment: item?.sub_department || item?.erp_product_code || "-",
  notebookType: item?.notebook || item?.input_screen || item?.machine_name || "-",
  field: item?.field || item?.input_field || item?.parameter_name || "-",
  l1: item?.l1_user_name || item?.approval_l1_name || item?.approval_l1_names || l1UserNames.join(", ") || item?.approval_l1 || item?.approval_l1_user_name || "-",
  typicalValue: item?.typical_value ?? item?.actual_value ?? "-",
  detail: `${item?.plus_value ?? item?.plus_threshold ?? item?.positive_tolerance ?? "-"} / ${item?.minus_value ?? item?.minus_threshold ?? item?.negative_tolerance ?? "-"}`,
  isActive: getActiveValue(item),
  createdAt: item?.updated_at || item?.updatedAt || item?.created_at || item?.createdAt,
  });
};

const normalizeSubmissionThresholdRow = (item) => ({
  type: "submission",
  typeLabel: "Submission Threshold",
  id: getRowId(item),
  raw: item,
  department: item?.department || "-",
  subDepartment: item?.sub_department || "-",
  notebookType: item?.screen_name || "-",
  field: "-",
  l1: nameListToText(item?.approval_l1_name || item?.approval_l1),
  days: item?.range ?? "-",
  frequency: item?.frequency ?? "-",
  detail: `Every ${item?.range ?? "-"}d x ${item?.frequency ?? "-"}`,
  isActive: getActiveValue(item),
  createdAt: item?.updated_at || item?.updatedAt || item?.created_at || item?.createdAt,
});

const resolveUserNames = (ids, users) =>
  (Array.isArray(ids) ? ids : [])
    .map((id) => (users || []).find((candidate) => String(candidate?.id) === String(id)))
    .filter(Boolean)
    .map((candidate) => candidate?.name || candidate?.full_name || candidate?.fullName)
    .filter(Boolean);

const normalizePpThresholdRow = (item, users) => ({
  type: "pp",
  typeLabel: "PP Threshold",
  id: getRowId(item),
  raw: item,
  department: item?.department || "-",
  subDepartment: item?.sub_department || "-",
  notebookType: item?.notebook_label || item?.notebookLabel || "-",
  field: item?.severity || "-",
  l1: nameListToText(resolveUserNames(item?.approval_l1_user_ids, users)),
  l2: nameListToText(resolveUserNames(item?.approval_l4_user_ids, users)) || "Any current L4 user",
  entryWithin: item?.completion_threshold_hours ?? "-",
  approveWithin: item?.approve_within_hours ?? "-",
  detail: `Entry ${item?.completion_threshold_hours ?? "-"}h / Approve ${item?.approve_within_hours ?? "-"}h`,
  isActive: getActiveValue(item),
  createdAt: item?.updated_at || item?.created_at || item?.createdAt,
});

const normalizeAcknowledgementThresholdRow = (item) => ({
  type: "acknowledgement",
  typeLabel: "Acknowledgement Threshold",
  id: getRowId(item),
  raw: item,
  department: item?.department || item?.department_name || "-",
  subDepartment: item?.sub_department || item?.subDepartment || "-",
  notebookType: item?.screen_name || item?.notebook || item?.notebook_name || "-",
  field: item?.criticality || "-",
  l1: "-",
  l2: nameListToText(item?.approval_l4_name || item?.approval_l4),
  detail: `${item?.acknowledge_within_hours ?? item?.acknowledgeWithinHours ?? "-"} Hrs`,
  isActive: getActiveValue(item),
  createdAt: item?.updated_at || item?.updatedAt || item?.created_at || item?.createdAt,
});

// Wheel Change Approval is one row per department (Spinning/Drawframe/
// Carding/Simplex) - each is its own separate approval queue in the app,
// so each gets its own editable row here too.
const normalizeWheelChangeApprovalRow = (item, users) => {
  const approverNames = resolveUserNames(item?.l4_user_ids, users);
  const wheelChangeDepartment = item?.wheel_change_department || item?.config_key || item?.department || "-";
  return {
    type: "wheel-change-approval",
    typeLabel: "WC Threshold",
    id: item?.department,
    raw: item,
    department: "Quality Control",
    subDepartment: "-",
    notebookType: wheelChangeDepartment || "All",
    field: item?.severity || "-",
    l1: approverNames.length ? nameListToText(approverNames) : "Any current L4 user",
    l2: "-",
    detail: `${item?.tat_hours ?? "-"} Hrs`,
    isActive: Boolean(item?.updated_at),
    createdAt: item?.updated_at,
  };
};

// Each threshold type only supports the actions its backend API actually
// exposes today: Value/Submission/Acknowledgement/PP/Wheel Change Approval
// all have full edit+delete+status APIs now. PP Approval is a single global
// row, editable in place, no delete/status.
const THRESHOLD_TYPE_LOADERS = {
  value: {
    fetch: fetchThresholdsAPI,
    normalize: normalizeValueThresholdRow,
    canEdit: true,
    canToggleStatus: true,
    canDelete: true,
    toggleStatus: (row, nextActive) => updateThresholdStatusAPI(row.raw, nextActive),
    remove: (row) => deleteThresholdAPI(row.raw),
    updateTat: (raw, field, hours) => updateThresholdAPI(raw, { [field]: hours }),
  },
  submission: {
    fetch: fetchSubmissionFrequencyConfigsAPI,
    normalize: normalizeSubmissionThresholdRow,
    canEdit: true,
    canToggleStatus: true,
    canDelete: true,
    toggleStatus: (row, nextActive) => updateSubmissionFrequencyStatusAPI(getRowId(row.raw), nextActive),
    remove: (row) => deleteSubmissionFrequencyConfigAPI(getRowId(row.raw)),
    updateTat: (raw, field, hours) => updateSubmissionFrequencyConfigAPI(getRowId(raw), { [field]: hours }),
  },
  pp: {
    fetch: fetchPpNotebookThresholdsAPI,
    normalize: normalizePpThresholdRow,
    canEdit: true,
    canToggleStatus: true,
    canDelete: true,
    toggleStatus: (row, nextActive) => updatePpNotebookThresholdStatusAPI(row.id, nextActive),
    remove: (row) => deletePpNotebookThresholdAPI(row.id),
  },
  acknowledgement: {
    fetch: fetchNotebookAcknowledgementThresholdsAPI,
    normalize: normalizeAcknowledgementThresholdRow,
    canEdit: true,
    canToggleStatus: true,
    canDelete: true,
    toggleStatus: (row, nextActive) => updateNotebookAcknowledgementThresholdStatusAPI(getRowId(row.raw), nextActive),
    remove: (row) => deleteNotebookAcknowledgementThresholdAPI(getRowId(row.raw)),
    updateTat: (raw, field, hours) => updateNotebookAcknowledgementThresholdAPI(getRowId(raw), { [field]: hours }),
  },
  "wheel-change-approval": {
    fetch: fetchWheelChangeApprovalConfigListAPI,
    normalize: normalizeWheelChangeApprovalRow,
    canEdit: true,
    canToggleStatus: true,
    canDelete: true,
    // row.department is hardcoded to "Quality Control" for display (this
    // config has no real department/sub-department of its own the way other
    // threshold types do) - the actual WC department key (Spinning/Drawframe/
    // Carding/Simplex) that these APIs need lives on row.id instead (set to
    // item.department in normalizeWheelChangeApprovalRow below). Using
    // row.department here would send "Quality Control" as the department,
    // which the backend rejects (not one of WHEEL_CHANGE_DEPARTMENTS).
    toggleStatus: (row, nextActive) => updateWheelChangeApprovalConfigStatusAPI(row.id, nextActive),
    remove: (row) => deleteWheelChangeApprovalConfigAPI(row.id),
  },
};

const buildExistingFilters = () => ({
  departmentSlug: "",
  subDepartmentSlug: "",
  notebookType: "",
  status: "",
});

function RowActionsMenu({ row, loader, onEdit, onToggleStatus, onDelete, busy }) {
  const [menuPosition, setMenuPosition] = useState(null);
  const containerRef = useRef(null);
  const isOpen = Boolean(menuPosition);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleOutsideClick = (event) => {
      if (containerRef.current?.contains(event.target)) return;
      if (event.target.closest?.(`.${styles.hubActionMenu}`)) return;
      setMenuPosition(null);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  if (!loader?.canEdit && !loader?.canToggleStatus && !loader?.canDelete) {
    return null;
  }

  const handleToggleOpen = (event) => {
    if (isOpen) {
      setMenuPosition(null);
      return;
    }
    // Anchor the menu to the button with fixed positioning and render it via
    // a portal to document.body so the table's scroll/overflow container can
    // never clip it, regardless of where the row sits after the table loads.
    // Opens just below the button by default, flipping above only when
    // there isn't enough room below.
    const rect = event.currentTarget.getBoundingClientRect();
    const estimatedMenuHeight = 160;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const openUpward = rect.bottom + estimatedMenuHeight > viewportHeight;
    setMenuPosition(
      openUpward
        ? { bottom: Math.max(12, viewportHeight - rect.top + 6), right: Math.max(12, window.innerWidth - rect.right) }
        : { top: rect.bottom + 6, right: Math.max(12, window.innerWidth - rect.right) }
    );
  };

  return (
    <div className={styles.hubActionMenuWrap} ref={containerRef}>
      <button
        type="button"
        className={styles.hubActionMenuButton}
        aria-label="Open threshold actions"
        onClick={handleToggleOpen}
      >
        <FiMoreVertical />
      </button>
      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className={styles.hubActionMenu}
              style={{
                position: "fixed",
                top: menuPosition.top ?? "auto",
                bottom: menuPosition.bottom ?? "auto",
                right: menuPosition.right,
              }}
            >
              {loader.canEdit ? (
                <button
                  type="button"
                  className={styles.hubActionMenuItem}
                  disabled={busy}
                  onClick={() => {
                    setMenuPosition(null);
                    onEdit(row);
                  }}
                >
                  Edit
                </button>
              ) : null}
              {loader.canToggleStatus ? (
                <button
                  type="button"
                  className={styles.hubActionMenuItem}
                  disabled={busy}
                  onClick={() => {
                    setMenuPosition(null);
                    onToggleStatus(row);
                  }}
                >
                  {row.isActive ? "Inactive" : "Active"}
                </button>
              ) : null}
              {loader.canDelete ? (
                <button
                  type="button"
                  className={`${styles.hubActionMenuItem} ${styles.hubActionMenuDelete}`}
                  disabled={busy}
                  onClick={() => {
                    setMenuPosition(null);
                    onDelete(row);
                  }}
                >
                  Delete
                </button>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function ExistingThresholdsTab({ onEditRow }) {
  const dispatch = useDispatch();
  const users = useSelector((state) => state.users?.users || []);
  const [thresholdType, setThresholdType] = useState("");
  const [filters, setFilters] = useState(buildExistingFilters);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!users.length) dispatch(fetchUsers());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const availableDepartments = departmentDirectory;
  const selectedDepartment =
    availableDepartments.find((item) => item.slug === filters.departmentSlug) || null;
  const availableSubDepartments = selectedDepartment?.subDepartments || [];
  const notebookTypeOptions = useMemo(() => {
    const selectedSubDepartment = availableSubDepartments.find(
      (item) => item.slug === filters.subDepartmentSlug
    );
    const scopedRows = rows.filter((row) => {
      if (selectedDepartment && row.department !== selectedDepartment.name) return false;
      if (selectedSubDepartment && row.subDepartment !== selectedSubDepartment.name) return false;
      return true;
    });
    return Array.from(new Set(scopedRows.map((row) => row.notebookType).filter((value) => value && value !== "-"))).sort(
      (left, right) => left.localeCompare(right)
    );
  }, [rows, selectedDepartment, availableSubDepartments, filters.subDepartmentSlug]);

  const loadRows = async (nextType) => {
    if (!nextType) {
      setRows([]);
      setHasLoaded(false);
      return;
    }

    const loader = THRESHOLD_TYPE_LOADERS[nextType];
    if (!loader) return;

    setLoading(true);
    setError("");
    try {
      const data = await loader.fetch();
      const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      setRows(list.map((item) => loader.normalize(item, users)));
      setHasLoaded(true);
    } catch (err) {
      setRows([]);
      setError(err?.message || "Unable to load thresholds.");
      setHasLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  const handleTypeChange = (event) => {
    const nextType = event.target.value;
    setThresholdType(nextType);
    setFilters(buildExistingFilters());
    loadRows(nextType);
  };

  const handleFilterChange = (field, value) => {
    setFilters((current) => {
      if (field === "departmentSlug") {
        return { ...current, departmentSlug: value, subDepartmentSlug: "" };
      }
      return { ...current, [field]: value };
    });
  };

  const [busyRowKey, setBusyRowKey] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingDeleteRow, setPendingDeleteRow] = useState(null);

  const getRowKey = (row, index) => `${row.type}-${row.id || index}`;

  const handleEdit = (row) => {
    onEditRow?.(row.type, row.raw);
  };

  const handleToggleStatus = async (row) => {
    const loader = THRESHOLD_TYPE_LOADERS[row.type];
    if (!loader?.toggleStatus) return;

    const rowKey = getRowKey(row, rows.indexOf(row));
    setBusyRowKey(rowKey);
    setActionMessage("");
    setActionError("");
    try {
      await loader.toggleStatus(row, !row.isActive);
      setActionMessage("Threshold status updated successfully.");
      await loadRows(thresholdType);
    } catch (err) {
      setActionError(
        err?.response?.data?.message || err?.message || "Unable to update threshold status."
      );
    } finally {
      setBusyRowKey("");
    }
  };

  const requestDelete = (row) => {
    setPendingDeleteRow(row);
  };

  const cancelDelete = () => {
    setPendingDeleteRow(null);
  };

  const confirmDelete = async () => {
    const row = pendingDeleteRow;
    if (!row) return;

    const loader = THRESHOLD_TYPE_LOADERS[row.type];
    if (!loader?.remove) {
      setPendingDeleteRow(null);
      return;
    }

    const rowKey = getRowKey(row, rows.indexOf(row));
    setBusyRowKey(rowKey);
    setActionMessage("");
    setActionError("");
    try {
      await loader.remove(row);
      setActionMessage("Threshold deleted successfully.");
      await loadRows(thresholdType);
    } catch (err) {
      setActionError(
        err?.response?.data?.message || err?.message || "Unable to delete threshold."
      );
    } finally {
      setBusyRowKey("");
      setPendingDeleteRow(null);
    }
  };

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (filters.status) {
          const statusValue = row.isActive ? "active" : "inactive";
          if (statusValue !== filters.status) return false;
        }
        if (selectedDepartment && row.department !== selectedDepartment.name) return false;
        const selectedSubDepartment = availableSubDepartments.find(
          (item) => item.slug === filters.subDepartmentSlug
        );
        if (selectedSubDepartment && row.subDepartment !== selectedSubDepartment.name) return false;
        if (filters.notebookType && row.notebookType !== filters.notebookType) return false;
        return true;
      }),
    [rows, filters, selectedDepartment, availableSubDepartments]
  );

  const columns = THRESHOLD_TYPE_COLUMNS[thresholdType] || [];
  const locationColumns = getLocationColumns(thresholdType);
  const visibleColumnCount =
    (locationColumns.department ? 1 : 0) + (locationColumns.subDepartment ? 1 : 0) + 1 + columns.length + 3;

  return (
    <div className={styles.stack}>
      <section className={`${styles.existingFilterPanel} ${styles.hubFilterPanel}`}>
        <label className={styles.field}>
          <span>Threshold Type</span>
          <select value={thresholdType} onChange={handleTypeChange}>
            <option value="">Select Threshold Type</option>
            {THRESHOLD_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Department</span>
          <select
            value={filters.departmentSlug}
            onChange={(event) => handleFilterChange("departmentSlug", event.target.value)}
            disabled={!thresholdType}
          >
            <option value="">All Departments</option>
            {availableDepartments.map((department) => (
              <option
                key={department.slug}
                value={department.slug}
                disabled={department.slug === "electrical" || department.slug === "mechanical"}
              >
                {department.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Sub Department</span>
          <select
            value={filters.subDepartmentSlug}
            onChange={(event) => handleFilterChange("subDepartmentSlug", event.target.value)}
            disabled={!selectedDepartment}
          >
            <option value="">All Sub Departments</option>
            {availableSubDepartments.map((subDepartment) => (
              <option key={subDepartment.slug} value={subDepartment.slug}>
                {subDepartment.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Notebook Type</span>
          <select
            value={filters.notebookType}
            onChange={(event) => handleFilterChange("notebookType", event.target.value)}
            disabled={!thresholdType || thresholdType === "wheel-change-approval"}
            className={thresholdType === "wheel-change-approval" ? styles.notebookTypeDisabledForWc : ""}
          >
            <option value="">All Notebook Types</option>
            {notebookTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Status</span>
          <select
            value={filters.status}
            onChange={(event) => handleFilterChange("status", event.target.value)}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>

        <button
          type="button"
          className={`${styles.clearFilterButton} ${styles.hubClearFilterButton}`}
          onClick={() => {
            setThresholdType("");
            setFilters(buildExistingFilters());
            setRows([]);
            setHasLoaded(false);
          }}
        >
          <FiX />
          Clear Filter
        </button>
      </section>

      <section className={`${styles.card} ${styles.existingThresholdCard}`}>
        {!thresholdType ? (
          <div className={styles.emptyState}>Select a threshold type to view its existing thresholds.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.existingThresholdTable} ${styles.hubExistingThresholdTable}`}>
              <thead>
                <tr>
                  {locationColumns.department ? <th>Department</th> : null}
                  {locationColumns.subDepartment ? <th>Sub Department</th> : null}
                  <th>Notebook Type</th>
                  {columns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                  <th>Status</th>
                  <th>Updated At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={visibleColumnCount}>Loading...</td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumnCount}>{hasLoaded ? "No thresholds found." : "Loading..."}</td>
                  </tr>
                ) : (
                  filteredRows.map((row, index) => {
                    const rowKey = getRowKey(row, index);
                    const loader = THRESHOLD_TYPE_LOADERS[row.type];
                    return (
                    <tr key={rowKey}>
                      {locationColumns.department ? <td>{row.department}</td> : null}
                      {locationColumns.subDepartment ? <td>{row.subDepartment}</td> : null}
                      <td>{row.notebookType}</td>
                      {columns.map((column) => (
                        <td key={column.key}>{row[column.key]}</td>
                      ))}
                      <td>
                        <span
                          className={`${styles.statusBadge} ${
                            row.isActive ? styles.statusActive : styles.statusInactive
                          }`}
                        >
                          {row.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>{formatTimestamp(row.createdAt)}</td>
                      <td>
                        <RowActionsMenu
                          row={row}
                          loader={loader}
                          busy={busyRowKey === rowKey}
                          onEdit={handleEdit}
                          onToggleStatus={handleToggleStatus}
                          onDelete={requestDelete}
                        />
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {actionMessage ? <p className={styles.successMessage}>{actionMessage}</p> : null}
        {(error || actionError) ? <p className={styles.errorMessage}>{error || actionError}</p> : null}
      </section>

      {pendingDeleteRow ? (
        <div className={warningStyles.overlay} data-warning-modal="true">
          <div className={warningStyles.modal} role="alertdialog" aria-modal="true">
            <div className={warningStyles.icon} aria-hidden="true">
              !
            </div>
            <div className={warningStyles.message}>
              Are you sure you want to delete this threshold?
              <br />
              <strong>{getDeleteThresholdSummary(pendingDeleteRow)}</strong>
              {getDeleteThresholdApprover(pendingDeleteRow) ? (
                <>
                  <br />
                  <strong>User - {getDeleteThresholdApprover(pendingDeleteRow)}</strong>
                </>
              ) : null}
            </div>

            <div className={styles.hubConfirmActions}>
              <button
                type="button"
                className={styles.hubConfirmCancelButton}
                onClick={cancelDelete}
                disabled={busyRowKey === getRowKey(pendingDeleteRow, rows.indexOf(pendingDeleteRow))}
              >
                Cancel
              </button>
              <button
                type="button"
                className={warningStyles.button}
                onClick={confirmDelete}
                disabled={busyRowKey === getRowKey(pendingDeleteRow, rows.indexOf(pendingDeleteRow))}
              >
                {busyRowKey === getRowKey(pendingDeleteRow, rows.indexOf(pendingDeleteRow))
                  ? "Deleting..."
                  : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const ROLE_LEVELS = ["L1", "L2", "L3", "L4"];

// Each option lists which units the TAT column breaks the duration into,
// e.g. ["h"] shows whole/fractional hours only, ["h","m","s"] shows all three.
const TAT_UNIT_OPTIONS = [
  { value: "h", label: "Hours", units: ["h"] },
  { value: "m", label: "Minutes", units: ["m"] },
  { value: "s", label: "Seconds", units: ["s"] },
  { value: "hm", label: "Hours & Minutes", units: ["h", "m"] },
  { value: "hms", label: "Hours, Minutes & Seconds", units: ["h", "m", "s"] },
];

const UNIT_INPUT_LABELS = { h: "Hours", m: "Minutes", s: "Seconds" };

const formatTatHoursDisplay = (hours, units = ["h", "m"]) => {
  const numeric = Number(hours);
  if (!Number.isFinite(numeric) || numeric <= 0) return "-";

  const totalSeconds = Math.round(numeric * 3600);
  if (totalSeconds <= 0) return "-";

  if (units.length === 1 && units[0] === "h") {
    const hoursOnly = numeric;
    const rounded = Math.round(hoursOnly * 100) / 100;
    return `${rounded}h`;
  }
  if (units.length === 1 && units[0] === "m") {
    const totalMinutes = Math.round(totalSeconds / 60);
    return `${totalMinutes}m`;
  }
  if (units.length === 1 && units[0] === "s") {
    return `${totalSeconds}s`;
  }

  const wholeHours = Math.floor(totalSeconds / 3600);
  const remAfterHours = totalSeconds - wholeHours * 3600;
  const wholeMinutes = Math.floor(remAfterHours / 60);
  const remSeconds = remAfterHours - wholeMinutes * 60;

  const parts = [];
  if (units.includes("h") && wholeHours > 0) parts.push(`${wholeHours}h`);
  if (units.includes("m") && wholeMinutes > 0) parts.push(`${wholeMinutes}m`);
  if (units.includes("s") && remSeconds > 0) parts.push(`${remSeconds}s`);
  return parts.length ? parts.join(" ") : "0m";
};

// Expands one Value/Submission Threshold rule into one row per configured
// role level (L1, L2, ...) so Department/Sub-Department/Notebook Type/Role
// Level/TAT can be shown as a flat, filterable list. Each expanded row keeps
// a reference back to the source rule (type + raw) so Edit/Delete/Active
// actions still operate on the whole rule via THRESHOLD_TYPE_LOADERS.
const expandRuleIntoResolutionRows = (item, type, typeLabel) => {
  const department = item?.department || item?.management_field || "-";
  const subDepartment = item?.sub_department || item?.erp_product_code || "-";
  const notebookType = item?.input_screen || item?.screen_name || item?.machine_name || "-";

  const levelHours = {
    L1: item?.l1_tat_hours,
    L2: item?.l2_tat_hours,
    L3: item?.l3_tat_hours,
    L4: item?.l4_tat_hours,
  };

  return ROLE_LEVELS.filter((level) => Number(levelHours[level]) > 0).map((level) => ({
    id: `${getRowId(item)}-${level}`,
    type,
    typeLabel,
    raw: item,
    department,
    subDepartment,
    notebookType,
    roleLevel: level,
    tatHours: levelHours[level],
    isActive: getActiveValue(item),
  }));
};

function ResolutionTimeTab({ onEditRow }) {
  const [rows, setRows] = useState([]);
  const [rawSubmissionConfigs, setRawSubmissionConfigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ departmentSlug: "", subDepartmentSlug: "", notebookType: "", roleLevel: "" });
  const [tatUnit, setTatUnit] = useState("hm");
  const [tatUnitValues, setTatUnitValues] = useState({ h: "", m: "", s: "" });
  const [applyingTat, setApplyingTat] = useState(false);
  const [busyRowKey, setBusyRowKey] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingDeleteRow, setPendingDeleteRow] = useState(null);

  const availableDepartments = departmentDirectory;
  const selectedDepartment =
    availableDepartments.find((item) => item.slug === filters.departmentSlug) || null;
  const availableSubDepartments = selectedDepartment?.subDepartments || [];

  const loadRows = async () => {
    setLoading(true);
    setError("");
    try {
      const [valueData, submissionData] = await Promise.all([
        fetchThresholdsAPI(),
        fetchSubmissionFrequencyConfigsAPI(),
      ]);
      const valueList = Array.isArray(valueData) ? valueData : Array.isArray(valueData?.data) ? valueData.data : [];
      const submissionList = Array.isArray(submissionData)
        ? submissionData
        : Array.isArray(submissionData?.data)
        ? submissionData.data
        : [];

      const expanded = [
        ...valueList.flatMap((item) => expandRuleIntoResolutionRows(item, "value", "Value Threshold")),
        ...submissionList.flatMap((item) => expandRuleIntoResolutionRows(item, "submission", "Submission Threshold")),
      ];

      setRows(expanded);
      setRawSubmissionConfigs(submissionList);
    } catch (err) {
      setError(err?.message || "Unable to load resolution time data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  // Notebook types come from the full threshold screen catalog (every
  // notebook type available for the selected sub-department), not just ones
  // that already have a threshold rule, since this tab is used to create new
  // TAT entries for combinations that may not exist yet.
  const notebookTypeOptions = useMemo(() => {
    if (filters.departmentSlug && filters.subDepartmentSlug) {
      const catalogTypes = getThresholdScreensForSubDepartment(filters.departmentSlug, filters.subDepartmentSlug);
      if (catalogTypes.length) {
        return [...catalogTypes].sort((left, right) => left.localeCompare(right));
      }
    }

    const selectedSubDepartment = availableSubDepartments.find(
      (item) => item.slug === filters.subDepartmentSlug
    );
    const scopedRows = rows.filter((row) => {
      if (selectedDepartment && row.department !== selectedDepartment.name) return false;
      if (selectedSubDepartment && row.subDepartment !== selectedSubDepartment.name) return false;
      return true;
    });
    return Array.from(new Set(scopedRows.map((row) => row.notebookType).filter((value) => value && value !== "-"))).sort(
      (left, right) => left.localeCompare(right)
    );
  }, [rows, selectedDepartment, availableSubDepartments, filters.departmentSlug, filters.subDepartmentSlug]);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (selectedDepartment && row.department !== selectedDepartment.name) return false;
        const selectedSubDepartment = availableSubDepartments.find(
          (item) => item.slug === filters.subDepartmentSlug
        );
        if (selectedSubDepartment && row.subDepartment !== selectedSubDepartment.name) return false;
        if (filters.notebookType && row.notebookType !== filters.notebookType) return false;
        if (filters.roleLevel && row.roleLevel !== filters.roleLevel) return false;
        return true;
      }),
    [rows, filters, selectedDepartment, availableSubDepartments]
  );

  // Looks up the raw Submission Threshold config (not the expanded per-level
  // rows, which drop levels with no TAT set yet) so Apply can find a rule
  // even if this specific role level's TAT hasn't been set before.
  const matchedConfigForCreate = useMemo(() => {
    if (!filters.departmentSlug || !filters.subDepartmentSlug || !filters.notebookType || !filters.roleLevel) {
      return null;
    }
    const selectedSubDepartment = availableSubDepartments.find(
      (item) => item.slug === filters.subDepartmentSlug
    );
    if (!selectedDepartment || !selectedSubDepartment) return null;

    const match = rawSubmissionConfigs.find(
      (config) =>
        config?.department === selectedDepartment.name &&
        config?.sub_department === selectedSubDepartment.name &&
        config?.screen_name === filters.notebookType
    );
    return match || null;
  }, [rawSubmissionConfigs, filters, selectedDepartment, availableSubDepartments]);

  const activeTatUnitOption =
    TAT_UNIT_OPTIONS.find((option) => option.value === tatUnit) || TAT_UNIT_OPTIONS[0];

  const canApplyTat = Boolean(
    filters.departmentSlug &&
      filters.subDepartmentSlug &&
      filters.notebookType &&
      filters.roleLevel &&
      activeTatUnitOption.units.some((unit) => Number(tatUnitValues[unit]) > 0)
  );

  const getRowKey = (row, index) => `${row.type}-${row.id || index}`;

  const handleEdit = (row) => {
    onEditRow?.(row.type, row.raw);
  };

  const handleToggleStatus = async (row) => {
    const loader = THRESHOLD_TYPE_LOADERS[row.type];
    if (!loader?.toggleStatus) return;

    const rowKey = getRowKey(row, rows.indexOf(row));
    setBusyRowKey(rowKey);
    setActionMessage("");
    setActionError("");
    try {
      await loader.toggleStatus(row, !row.isActive);
      setActionMessage("Threshold status updated successfully.");
      await loadRows();
    } catch (err) {
      setActionError(
        err?.response?.data?.message || err?.message || "Unable to update threshold status."
      );
    } finally {
      setBusyRowKey("");
    }
  };

  const requestDelete = (row) => {
    setPendingDeleteRow(row);
  };

  const cancelDelete = () => setPendingDeleteRow(null);

  const confirmDelete = async () => {
    if (!pendingDeleteRow) return;
    const loader = THRESHOLD_TYPE_LOADERS[pendingDeleteRow.type];
    if (!loader?.remove) {
      setPendingDeleteRow(null);
      return;
    }

    const rowKey = getRowKey(pendingDeleteRow, rows.indexOf(pendingDeleteRow));
    setBusyRowKey(rowKey);
    setActionMessage("");
    setActionError("");
    try {
      await loader.remove(pendingDeleteRow);
      setActionMessage("Threshold deleted successfully.");
      await loadRows();
    } catch (err) {
      setActionError(err?.response?.data?.message || err?.message || "Unable to delete threshold.");
    } finally {
      setBusyRowKey("");
      setPendingDeleteRow(null);
    }
  };

  const handleApplyTat = async () => {
    if (!canApplyTat) return;

    const hoursFromUnits =
      (Number(tatUnitValues.h) || 0) + (Number(tatUnitValues.m) || 0) / 60 + (Number(tatUnitValues.s) || 0) / 3600;
    if (!Number.isFinite(hoursFromUnits) || hoursFromUnits <= 0) {
      setActionError("Enter a TAT value greater than 0.");
      return;
    }

    // Backend only accepts a whole positive integer number of hours for
    // lN_tat_hours, so any minutes/seconds entered round up to the next hour.
    const hours = Math.ceil(hoursFromUnits);

    const field = `${filters.roleLevel.toLowerCase()}_tat_hours`;
    setApplyingTat(true);
    setActionMessage("");
    setActionError("");
    try {
      if (matchedConfigForCreate) {
        await updateSubmissionFrequencyConfigAPI(getRowId(matchedConfigForCreate), { [field]: hours });
      } else {
        await saveSubmissionFrequencyConfigAPI({
          screen_name: filters.notebookType,
          department: selectedDepartment?.name,
          sub_department: availableSubDepartments.find((item) => item.slug === filters.subDepartmentSlug)?.name,
          range: 1,
          frequency: 1,
          [field]: hours,
        });
      }
      setActionMessage("TAT saved successfully.");
      setTatUnitValues({ h: "", m: "", s: "" });
      await loadRows();
    } catch (err) {
      setActionError(err?.response?.data?.message || err?.message || "Unable to save TAT.");
    } finally {
      setApplyingTat(false);
    }
  };

  return (
    <div className={styles.stack}>
      <section className={`${styles.existingFilterPanel} ${styles.hubFilterPanel}`}>
        <label className={styles.field}>
          <span>Department</span>
          <select
            value={filters.departmentSlug}
            onChange={(event) =>
              setFilters((current) => ({ ...current, departmentSlug: event.target.value, subDepartmentSlug: "" }))
            }
          >
            <option value="">All Departments</option>
            {availableDepartments.map((department) => (
              <option
                key={department.slug}
                value={department.slug}
                disabled={department.slug === "electrical" || department.slug === "mechanical"}
              >
                {department.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Sub Department</span>
          <select
            value={filters.subDepartmentSlug}
            onChange={(event) => setFilters((current) => ({ ...current, subDepartmentSlug: event.target.value }))}
            disabled={!selectedDepartment}
          >
            <option value="">All Sub Departments</option>
            {availableSubDepartments.map((subDepartment) => (
              <option key={subDepartment.slug} value={subDepartment.slug}>
                {subDepartment.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Notebook Type</span>
          <select
            value={filters.notebookType}
            onChange={(event) => setFilters((current) => ({ ...current, notebookType: event.target.value }))}
          >
            <option value="">All Notebook Types</option>
            {notebookTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Role Level</span>
          <select
            value={filters.roleLevel}
            onChange={(event) => setFilters((current) => ({ ...current, roleLevel: event.target.value }))}
          >
            <option value="">All Levels</option>
            {ROLE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className={`${styles.clearFilterButton} ${styles.hubClearFilterButton}`}
          onClick={() => setFilters({ departmentSlug: "", subDepartmentSlug: "", notebookType: "", roleLevel: "" })}
        >
          <FiX />
          Clear Filter
        </button>
      </section>

      {filters.roleLevel ? (
        <div className={styles.existingFilterPanel} style={{ alignItems: "flex-end" }}>
          <label className={styles.field}>
            <span>TAT Unit</span>
            <select value={tatUnit} onChange={(event) => setTatUnit(event.target.value)}>
              {TAT_UNIT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {activeTatUnitOption.units.map((unit) => (
            <label className={styles.field} key={unit}>
              <span>{UNIT_INPUT_LABELS[unit]}</span>
              <input
                type="number"
                min="0"
                step="any"
                value={tatUnitValues[unit]}
                onChange={(event) =>
                  setTatUnitValues((current) => ({ ...current, [unit]: event.target.value }))
                }
                placeholder="0"
              />
            </label>
          ))}

          <button
            type="button"
            className={styles.clearFilterButton}
            onClick={handleApplyTat}
            disabled={applyingTat || !canApplyTat}
          >
            {applyingTat ? "Applying..." : "Apply"}
          </button>
        </div>
      ) : (
        <p className={styles.emptyState}>Select a Role Level above to view and format TAT.</p>
      )}

      <section className={`${styles.card} ${styles.existingThresholdCard}`}>
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.existingThresholdTable} ${styles.hubExistingThresholdTable}`}>
            <thead>
              <tr>
                <th>Department</th>
                <th>Sub-Department</th>
                <th>Notebook Type</th>
                <th>Role Level</th>
                <th>TAT</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>Loading...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7}>No resolution time data found.</td>
                </tr>
              ) : (
                filteredRows.map((row, index) => {
                  const rowKey = getRowKey(row, index);
                  const loader = THRESHOLD_TYPE_LOADERS[row.type];
                  return (
                    <tr key={rowKey}>
                      <td>{row.department}</td>
                      <td>{row.subDepartment}</td>
                      <td>{row.notebookType}</td>
                      <td>{row.roleLevel}</td>
                      <td>
                        {filters.roleLevel
                          ? formatTatHoursDisplay(
                              row.tatHours,
                              TAT_UNIT_OPTIONS.find((option) => option.value === tatUnit)?.units
                            )
                          : "Select Role Level"}
                      </td>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${
                            row.isActive ? styles.statusActive : styles.statusInactive
                          }`}
                        >
                          {row.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <RowActionsMenu
                          row={row}
                          loader={loader}
                          busy={busyRowKey === rowKey}
                          onEdit={handleEdit}
                          onToggleStatus={handleToggleStatus}
                          onDelete={requestDelete}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {actionMessage ? <p className={styles.successMessage}>{actionMessage}</p> : null}
        {(error || actionError) ? <p className={styles.errorMessage}>{error || actionError}</p> : null}
      </section>

      {pendingDeleteRow ? (
        <div className={warningStyles.overlay} data-warning-modal="true">
          <div className={warningStyles.modal} role="alertdialog" aria-modal="true">
            <div className={warningStyles.icon} aria-hidden="true">
              !
            </div>
            <div className={warningStyles.message}>
              Are you sure you want to delete this threshold?
              <br />
              <strong>{getDeleteThresholdSummary(pendingDeleteRow)}</strong>
              {getDeleteThresholdApprover(pendingDeleteRow) ? (
                <>
                  <br />
                  <strong>User - {getDeleteThresholdApprover(pendingDeleteRow)}</strong>
                </>
              ) : null}
            </div>

            <div className={styles.hubConfirmActions}>
              <button
                type="button"
                className={styles.hubConfirmCancelButton}
                onClick={cancelDelete}
                disabled={busyRowKey === getRowKey(pendingDeleteRow, rows.indexOf(pendingDeleteRow))}
              >
                Cancel
              </button>
              <button
                type="button"
                className={warningStyles.button}
                onClick={confirmDelete}
                disabled={busyRowKey === getRowKey(pendingDeleteRow, rows.indexOf(pendingDeleteRow))}
              >
                {busyRowKey === getRowKey(pendingDeleteRow, rows.indexOf(pendingDeleteRow))
                  ? "Deleting..."
                  : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ThresholdsHub() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("value");
  const [editItems, setEditItems] = useState({});
  const user = useSelector((state) => state.auth?.user);
  const canAccessAcknowledgement = isSubmittedNotebookManagerUser(user);
  const canAccessOthers = isFullAccessUser(user);

  useEffect(() => {
    if (!router.isReady) return;
    if (String(router.query.tab || "").trim() === "existing") {
      setActiveTab("existing");
    }
  }, [router.isReady, router.query.tab]);

  const handleEditRow = (type, rawItem) => {
    setEditItems((current) => ({ ...current, [type]: rawItem }));
    setActiveTab(type);
  };

  const clearEditItem = (type) => {
    setEditItems((current) => {
      if (!current[type]) return current;
      const next = { ...current };
      delete next[type];
      return next;
    });
  };

  const tabs = [
    { value: "value", label: "Value Threshold" },
    { value: "submission", label: "Submission Threshold" },
    { value: "pp", label: "PP Threshold" },
    { value: "acknowledgement", label: "Acknowledgement Threshold" },
    { value: "wheel-change-approval", label: "WC Threshold" },
    { value: "existing", label: "Existing Thresholds" },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.intro}>
          <h1>Threshold</h1>
          <p>Add and edit the threshold value</p>
        </div>

        <div className={styles.tabBar} style={{ width: "auto", gridTemplateColumns: `repeat(${tabs.length}, auto)` }} role="tablist" aria-label="Threshold views">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`${styles.tabButton} ${activeTab === tab.value ? styles.tabButtonActive : ""}`}
              style={{ padding: "0 16px" }}
              onClick={() => setActiveTab(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "value" && canAccessOthers ? (
          <ThresholdValuesPage
            standalone={false}
            editItem={editItems.value || null}
            onEditItemHandled={() => clearEditItem("value")}
          />
        ) : null}
        {activeTab === "submission" && canAccessOthers ? (
          <SubmissionThresholdPage
            standalone={false}
            editItem={editItems.submission || null}
            onEditItemHandled={() => clearEditItem("submission")}
          />
        ) : null}
        {activeTab === "pp" && canAccessOthers ? (
          <PPNotebookThresholdPage
            standalone={false}
            editItem={editItems.pp || null}
            onEditItemHandled={() => clearEditItem("pp")}
          />
        ) : null}
        {activeTab === "acknowledgement" && canAccessAcknowledgement ? (
          <SubmittedNotebookThresholdPage
            standalone={false}
            editItem={editItems.acknowledgement || null}
            onEditItemHandled={() => clearEditItem("acknowledgement")}
          />
        ) : null}
        {activeTab === "wheel-change-approval" && canAccessOthers ? (
          <WheelChangeApprovalThresholdPage
            standalone={false}
            editItem={editItems["wheel-change-approval"] || null}
            onEditItemHandled={() => clearEditItem("wheel-change-approval")}
          />
        ) : null}
        {activeTab === "existing" ? <ExistingThresholdsTab onEditRow={handleEditRow} /> : null}
      </div>
    </div>
  );
}

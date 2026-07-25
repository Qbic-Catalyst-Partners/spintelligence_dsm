import { useEffect, useMemo, useRef, useState } from "react";
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
  deleteThresholdAPI,
} from "@/apis/thresholdsApi";
import {
  fetchSubmissionFrequencyConfigsAPI,
  updateSubmissionFrequencyStatusAPI,
  deleteSubmissionFrequencyConfigAPI,
} from "@/apis/submissionFrequencyApi";
import {
  fetchPpNotebookThresholdsAPI,
  deletePpNotebookThresholdAPI,
  updatePpNotebookThresholdStatusAPI,
} from "@/apis/ppNotebookThresholdApi";
import { fetchNotebookAcknowledgementThresholdsAPI } from "@/apis/notebookAcknowledgementThresholdApi";
import {
  fetchWheelChangeApprovalConfigListAPI,
  updateWheelChangeApprovalConfigStatusAPI,
} from "@/apis/wheelChangeApprovalConfigApi";

import { departmentDirectory } from "@/views/departments/data";
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
    { key: "l2", label: "L2" },
    { key: "detail", label: "Plus (+) / Minus (-)" },
  ],
  submission: [
    { key: "l1", label: "L1" },
    { key: "l2", label: "L2" },
    { key: "detail", label: "Frequency" },
  ],
  pp: [
    { key: "field", label: "Severity" },
    { key: "l1", label: "L1 Proposer" },
    { key: "l2", label: "L4 Approver" },
    { key: "detail", label: "Entry / Approve Within" },
  ],
  acknowledgement: [
    { key: "l2", label: "L2" },
    { key: "detail", label: "Acknowledge Within" },
  ],
  "wheel-change-approval": [
    { key: "field", label: "Severity" },
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

// Normalizes each threshold type's row shape into one common display shape
// so the merged "Existing Thresholds" tab can render every type in one table.
const normalizeValueThresholdRow = (item) => ({
  type: "value",
  typeLabel: "Value Threshold",
  id: getRowId(item),
  raw: item,
  department: item?.department || item?.management_field || "-",
  subDepartment: item?.sub_department || item?.erp_product_code || "-",
  notebookType: item?.input_screen || item?.machine_name || "-",
  field: item?.input_field || item?.parameter_name || "-",
  l1: nameListToText(item?.approval_l1_names || item?.approval_l1_name || item?.approval_l1),
  l2: nameListToText(item?.approval_l2_names || item?.approval_l2_name || item?.approval_l2),
  detail: `${item?.plus_threshold ?? item?.positive_tolerance ?? "-"} / ${item?.minus_threshold ?? item?.negative_tolerance ?? "-"}`,
  isActive: getActiveValue(item),
  createdAt: item?.created_at || item?.createdAt,
});

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
  l2: nameListToText(item?.approval_l2_name || item?.approval_l2),
  detail: `Every ${item?.frequency ?? "-"}d x ${item?.occurrences ?? "-"}`,
  isActive: getActiveValue(item),
  createdAt: item?.created_at || item?.createdAt,
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
  field: "-",
  l1: "-",
  l2: nameListToText(item?.approval_l2_name || item?.approval_l2),
  detail: `${item?.acknowledge_within_hours ?? item?.acknowledgeWithinHours ?? "-"} Hrs`,
  isActive: getActiveValue(item),
  createdAt: item?.created_at || item?.createdAt,
});

// Wheel Change Approval is one row per department (Spinning/Drawframe/
// Carding/Simplex) - each is its own separate approval queue in the app,
// so each gets its own editable row here too.
const normalizeWheelChangeApprovalRow = (item, users) => {
  const approverNames = resolveUserNames(item?.l4_user_ids, users);
  return {
    type: "wheel-change-approval",
    typeLabel: "WC Threshold",
    id: item?.department,
    raw: item,
    department: item?.department || "-",
    subDepartment: "-",
    notebookType: item?.department || "All",
    field: item?.severity || "-",
    l1: approverNames.length ? nameListToText(approverNames) : "Any current L4 user",
    l2: "-",
    detail: `${item?.tat_hours ?? "-"} Hrs`,
    isActive: Boolean(item?.updated_at),
    createdAt: item?.updated_at,
  };
};

// Each threshold type only supports the actions its backend API actually
// exposes today: Value/Submission have full edit+delete+status APIs. PP
// Threshold and Wheel Change Approval support edit (per-notebook /
// per-department rows) but not delete/status. Acknowledgement Threshold has
// no update/delete/status API at all (create + fetch only). PP Approval is a
// single global row, editable in place, no delete/status.
const THRESHOLD_TYPE_LOADERS = {
  value: {
    fetch: fetchThresholdsAPI,
    normalize: normalizeValueThresholdRow,
    canEdit: true,
    canToggleStatus: true,
    canDelete: true,
    toggleStatus: (row, nextActive) => updateThresholdStatusAPI(row.raw, nextActive),
    remove: (row) => deleteThresholdAPI(row.raw),
  },
  submission: {
    fetch: fetchSubmissionFrequencyConfigsAPI,
    normalize: normalizeSubmissionThresholdRow,
    canEdit: true,
    canToggleStatus: true,
    canDelete: true,
    toggleStatus: (row, nextActive) => updateSubmissionFrequencyStatusAPI(row.id, nextActive),
    remove: (row) => deleteSubmissionFrequencyConfigAPI(row.id),
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
    canEdit: false,
    canToggleStatus: false,
    canDelete: false,
  },
  "wheel-change-approval": {
    fetch: fetchWheelChangeApprovalConfigListAPI,
    normalize: normalizeWheelChangeApprovalRow,
    canEdit: true,
    canToggleStatus: true,
    canDelete: false,
    toggleStatus: (row, nextActive) => updateWheelChangeApprovalConfigStatusAPI(row.department, nextActive),
  },
};

const buildExistingFilters = () => ({
  departmentSlug: "",
  subDepartmentSlug: "",
  notebookType: "",
  status: "",
});

function RowActionsMenu({ row, loader, onEdit, onToggleStatus, onDelete, busy }) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  if (!loader?.canEdit && !loader?.canToggleStatus && !loader?.canDelete) {
    return null;
  }

  const handleToggleOpen = () => {
    if (!isOpen) {
      // Estimate whether the menu would render below the visible viewport
      // (e.g. the last row(s) of a long table) and open upward instead so
      // it's never clipped/invisible below the fold.
      const buttonRect = containerRef.current?.getBoundingClientRect();
      const estimatedMenuHeight = 160;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      setDropUp(Boolean(buttonRect) && buttonRect.bottom + estimatedMenuHeight > viewportHeight);
    }
    setIsOpen((current) => !current);
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
      {isOpen ? (
        <div className={`${styles.hubActionMenu} ${dropUp ? styles.hubActionMenuUp : ""}`}>
          {loader.canEdit ? (
            <button
              type="button"
              className={styles.hubActionMenuItem}
              disabled={busy}
              onClick={() => {
                setIsOpen(false);
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
                setIsOpen(false);
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
                setIsOpen(false);
                onDelete(row);
              }}
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
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
  const notebookTypeOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.notebookType).filter((value) => value && value !== "-"))).sort(
        (left, right) => left.localeCompare(right)
      ),
    [rows]
  );

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
              <option key={department.slug} value={department.slug}>
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
            disabled={!thresholdType}
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
                  <th>Created At</th>
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
              <strong>{pendingDeleteRow.notebookType}</strong>
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
  const [activeTab, setActiveTab] = useState("value");
  const [editItems, setEditItems] = useState({});
  const user = useSelector((state) => state.auth?.user);
  const canAccessAcknowledgement = isSubmittedNotebookManagerUser(user);
  const canAccessOthers = isFullAccessUser(user);

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
          <SubmittedNotebookThresholdPage standalone={false} />
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

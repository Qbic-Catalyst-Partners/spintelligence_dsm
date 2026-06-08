import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { FiCheckCircle, FiClock, FiSlash, FiX } from "react-icons/fi";
import { FaIdCard } from "react-icons/fa6";

import {
  fetchNotebookAcknowledgementThresholdsAPI,
  saveNotebookAcknowledgementThresholdAPI,
} from "@/apis/notebookAcknowledgementThresholdApi";
import { fetchUsers } from "@/store/slices/userSlice";
import { isSubmittedNotebookManagerUser } from "@/utils/accessControl";
import { departmentDirectory } from "@/views/departments/data";
import { getThresholdScreensForSubDepartment } from "@/views/thresholds/screenCatalog";
import styles from "@/styles/SubmissionThreshold.module.css";

const createRule = () => ({
  subDepartmentSlug: "",
  screenName: "",
  acknowledgeWithinHours: "24",
  approvalL2: "",
});

const buildExistingFilters = () => ({
  department: "",
  subDepartment: "",
  screenName: "",
  status: "",
});

const PENDING_ACK_THRESHOLD_STORAGE_KEY = "submittedNotebookPendingAcknowledgementThresholds";

const normalizeLookupValue = (value) => String(value ?? "").trim().toLowerCase();

const getUserDisplayName = (user) =>
  String(user?.name || user?.full_name || user?.fullName || user?.username || "").trim();

const getUserEmployeeId = (user) =>
  String(user?.employee_id || user?.employeeId || user?.id || "").trim();

const buildUserOptions = (users, level) => {
  const seen = new Set();

  return users
    .filter((user) => String(user?.level || "").trim().toUpperCase() === level)
    .map((user) => ({
      id: user?.id,
      employeeId: getUserEmployeeId(user),
      name: getUserDisplayName(user),
    }))
    .filter((user) => {
      const key = normalizeLookupValue(user.employeeId || user.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
};

const resolveUser = (users, value) => {
  const normalized = normalizeLookupValue(value);
  if (!normalized) return null;

  return users.find((user) =>
    [
      user?.id,
      user?.employee_id,
      user?.employeeId,
      user?.name,
      user?.full_name,
      user?.fullName,
      user?.username,
    ].some((candidate) => normalizeLookupValue(candidate) === normalized)
  ) || null;
};

const getThresholdId = (item) =>
  item?.id || item?.threshold_id || item?.thresholdId || item?._id || "";

const getThresholdDepartment = (item) => item?.department || item?.department_name || item?.departmentName || "";

const getThresholdSubDepartment = (item) =>
  item?.sub_department || item?.subDepartment || item?.sub_department_name || item?.subDepartmentName || "";

const getThresholdScreenName = (item) =>
  item?.screen_name || item?.screenName || item?.notebook || item?.notebook_name || item?.notebookName || item?.input_screen || item?.inputScreen || "";

const getThresholdAckHours = (item) =>
  item?.acknowledge_within_hours ??
  item?.acknowledgeWithinHours ??
  item?.ack_hours ??
  item?.ackHours ??
  item?.acknowledgement_hours ??
  item?.acknowledgementHours ??
  "";

const getThresholdL2 = (item) =>
  item?.approval_l2_name ||
  item?.approvalL2Name ||
  item?.l2_approver_name ||
  item?.l2ApproverName ||
  item?.approval_l2 ||
  item?.approvalL2 ||
  "-";

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

const getActiveValue = (item) => item?.is_active ?? item?.isActive ?? true;

const normalizeMatchValue = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const readPendingThresholdRows = () => {
  if (typeof window === "undefined") return [];

  try {
    const parsedRows = JSON.parse(
      window.localStorage.getItem(PENDING_ACK_THRESHOLD_STORAGE_KEY) || "[]"
    );
    return Array.isArray(parsedRows) ? parsedRows : [];
  } catch {
    return [];
  }
};

const writePendingThresholdRows = (rows) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      PENDING_ACK_THRESHOLD_STORAGE_KEY,
      JSON.stringify(rows.slice(0, 20))
    );
  } catch {
    // Best-effort cache only; the API remains the source of truth.
  }
};

const getSavedThresholdFromResponse = (response, fallbackPayload) => {
  const candidate =
    response?.threshold ||
    response?.config ||
    response?.row ||
    response?.data?.threshold ||
    response?.data?.config ||
    response?.data?.row ||
    response?.data;

  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? { ...fallbackPayload, ...candidate }
    : fallbackPayload;
};

const isSameThreshold = (left, right) => {
  const leftId = getThresholdId(left);
  const rightId = getThresholdId(right);

  if (leftId && rightId) return String(leftId) === String(rightId);

  return (
    normalizeMatchValue(getThresholdDepartment(left)) === normalizeMatchValue(getThresholdDepartment(right)) &&
    normalizeMatchValue(getThresholdSubDepartment(left)) === normalizeMatchValue(getThresholdSubDepartment(right)) &&
    normalizeMatchValue(getThresholdScreenName(left)) === normalizeMatchValue(getThresholdScreenName(right))
  );
};

const mergeThresholdRow = (rows, row) => {
  if (!row) return rows;
  const index = rows.findIndex((item) => isSameThreshold(item, row));
  if (index === -1) return [row, ...rows];

  return rows.map((item, itemIndex) => (itemIndex === index ? { ...item, ...row } : item));
};

const mergeThresholdRows = (rows, nextRows) =>
  nextRows.reduce((mergedRows, row) => mergeThresholdRow(mergedRows, row), rows);

export default function SubmittedNotebookThresholdPage() {
  const dispatch = useDispatch();
  const router = useRouter();
  const user = useSelector((state) => state.auth?.user);
  const isHydrated = useSelector((state) => state.auth?.isHydrated);
  const users = useSelector((state) => state.users?.users || []);
  const canAccessPage = isSubmittedNotebookManagerUser(user);

  const [activeTab, setActiveTab] = useState("new");
  const [thresholds, setThresholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedDepartmentSlug, setSelectedDepartmentSlug] = useState("");
  const [rule, setRule] = useState(createRule);
  const [existingFilters, setExistingFilters] = useState(buildExistingFilters);

  const availableDepartments = departmentDirectory.filter((item) => item.enabled);
  const selectedDepartment =
    availableDepartments.find((item) => item.slug === selectedDepartmentSlug) || null;
  const availableSubDepartments = (selectedDepartment?.subDepartments || []).filter(
    (item) => item.enabled
  );
  const selectedSubDepartment =
    availableSubDepartments.find((item) => item.slug === rule.subDepartmentSlug) || null;
  const existingDepartment = availableDepartments.find(
    (item) => item.name === existingFilters.department
  ) || null;
  const existingSubDepartment = (existingDepartment?.subDepartments || []).find(
    (item) => item.name === existingFilters.subDepartment
  ) || null;
  const l2Options = useMemo(() => buildUserOptions(users, "L2"), [users]);

  const totalThresholds = thresholds.length;
  const activeThresholds = thresholds.filter((item) => getActiveValue(item)).length;
  const inactiveThresholds = thresholds.filter((item) => !getActiveValue(item)).length;

  const existingDepartmentOptions = Array.from(
    new Set(thresholds.map((item) => getThresholdDepartment(item)).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right));
  const existingSubDepartmentOptions = Array.from(
    new Set(
      thresholds
        .filter((item) => !existingFilters.department || getThresholdDepartment(item) === existingFilters.department)
        .map((item) => getThresholdSubDepartment(item))
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));
  const existingNotebookOptions = Array.from(
    new Set(
      thresholds
        .filter((item) => !existingFilters.department || getThresholdDepartment(item) === existingFilters.department)
        .filter((item) => !existingFilters.subDepartment || getThresholdSubDepartment(item) === existingFilters.subDepartment)
        .map((item) => getThresholdScreenName(item))
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));
  const filteredThresholds = thresholds.filter((item) => {
    const screenName = getThresholdScreenName(item);
    if (existingFilters.department && getThresholdDepartment(item) !== existingFilters.department) return false;
    if (existingFilters.subDepartment && getThresholdSubDepartment(item) !== existingFilters.subDepartment) return false;
    if (existingFilters.screenName && screenName !== existingFilters.screenName) return false;
    if (existingFilters.status) {
      const statusValue = getActiveValue(item) ? "active" : "inactive";
      if (statusValue !== existingFilters.status) return false;
    }
    return true;
  });

  const loadThresholds = async () => {
    if (!canAccessPage) return;
    setLoading(true);
    try {
      const acknowledgementRows = await fetchNotebookAcknowledgementThresholdsAPI();
      const mergedAcknowledgementRows = mergeThresholdRows(
        acknowledgementRows,
        readPendingThresholdRows()
      );
      setThresholds(mergedAcknowledgementRows);
      setError("");
      return mergedAcknowledgementRows;
    } catch (err) {
      const pendingRows = readPendingThresholdRows();
      setThresholds(pendingRows);
      setError(err?.message || "Unable to load acknowledgement thresholds.");
      return pendingRows;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isHydrated) return;
    if (!canAccessPage) {
      router.replace("/submitted-notebooks");
      return;
    }
    loadThresholds();
    dispatch(fetchUsers());
  }, [canAccessPage, dispatch, isHydrated, router]);

  const updateRule = (field, value) => {
    setRule((current) => ({
      ...current,
      [field]: value,
      ...(field === "subDepartmentSlug" ? { screenName: "" } : {}),
    }));
    setMessage("");
    setError("");
  };

  const handleDepartmentChange = (event) => {
    setSelectedDepartmentSlug(event.target.value);
    setRule(createRule());
    setMessage("");
    setError("");
  };

  const handleExistingFilterChange = (field, value) => {
    setExistingFilters((current) => {
      if (field === "department") {
        return { department: value, subDepartment: "", screenName: "", status: current.status };
      }
      if (field === "subDepartment") {
        return { ...current, subDepartment: value, screenName: "" };
      }
      return { ...current, [field]: value };
    });
  };

  const resetForm = ({ preserveFeedback = false } = {}) => {
    setSelectedDepartmentSlug("");
    setRule(createRule());
    if (!preserveFeedback) {
      setMessage("");
      setError("");
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      if (!selectedDepartment) throw new Error("Please select a department.");
      if (!selectedSubDepartment) throw new Error("Please select a sub-department.");
      if (!rule.screenName) throw new Error("Please select a notebook type.");

      const hours = Number(rule.acknowledgeWithinHours);
      if (!Number.isFinite(hours) || hours <= 0) {
        throw new Error("Please enter acknowledge within hours greater than 0.");
      }

      const selectedL2 = resolveUser(users, rule.approvalL2);
      if (!selectedL2) throw new Error("Please select an L2 approver.");

      const existingThreshold = thresholds.find((item) =>
        isSameThreshold(item, {
          screen_name: rule.screenName,
          department: selectedDepartment.name,
          sub_department: selectedSubDepartment.name,
        })
      );
      const existingThresholdId = getThresholdId(existingThreshold);

      const payload = {
        ...(existingThresholdId
          ? {
              id: existingThresholdId,
              threshold_id: existingThresholdId,
            }
          : {}),
        screen_name: rule.screenName,
        department: selectedDepartment.name,
        sub_department: selectedSubDepartment.name,
        acknowledge_within_hours: hours,
        approval_l2: getUserEmployeeId(selectedL2) || selectedL2.id || rule.approvalL2,
        approval_l2_name: getUserDisplayName(selectedL2),
        is_active: true,
      };

      const response = await saveNotebookAcknowledgementThresholdAPI(payload);
      const savedThreshold = {
        ...(existingThreshold || {}),
        ...getSavedThresholdFromResponse(response, payload),
        updated_at: new Date().toISOString(),
      };
      writePendingThresholdRows(mergeThresholdRow(readPendingThresholdRows(), savedThreshold));
      setMessage(response?.message || "Submitted notebook threshold saved successfully.");
      setActiveTab("existing");
      setExistingFilters(buildExistingFilters());
      resetForm({ preserveFeedback: true });
      const reloadedThresholds = await loadThresholds();
      setThresholds((currentThresholds) =>
        mergeThresholdRow(
          reloadedThresholds.length ? reloadedThresholds : mergeThresholdRows(currentThresholds, readPendingThresholdRows()),
          savedThreshold
        )
      );
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          "Failed to save acknowledgement threshold."
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isHydrated || !canAccessPage) return null;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.intro}>
          <h1>Submission Threshold</h1>
          <p>Set the L2 acknowledgement time for submitted notebooks</p>
        </div>

        <div className={styles.tabBar} role="tablist" aria-label="Submitted notebook threshold views">
          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === "new" ? styles.tabButtonActive : ""}`}
            onClick={() => setActiveTab("new")}
          >
            New Threshold
          </button>
          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === "existing" ? styles.tabButtonActive : ""}`}
            onClick={() => setActiveTab("existing")}
          >
            Existing Thresholds
          </button>
        </div>

        {activeTab === "new" ? (
          <div className={styles.statsGrid}>
            <article className={styles.statCard}>
              <div className={`${styles.statIcon} ${styles.blue}`}>
                <FaIdCard />
              </div>
              <div>
                <span>Total Thresholds</span>
                <strong>{totalThresholds}</strong>
              </div>
            </article>
            <article className={styles.statCard}>
              <div className={`${styles.statIcon} ${styles.activeTone}`}>
                <FiCheckCircle />
              </div>
              <div>
                <span>Active Thresholds</span>
                <strong>{activeThresholds}</strong>
              </div>
            </article>
            <article className={styles.statCard}>
              <div className={`${styles.statIcon} ${styles.inactiveTone}`}>
                <FiSlash />
              </div>
              <div>
                <span>Inactive Thresholds</span>
                <strong>{inactiveThresholds}</strong>
              </div>
            </article>
          </div>
        ) : null}

        {activeTab === "new" ? (
          <form className={styles.stack} onSubmit={handleSave}>
            <section className={styles.sectionPlain}>
              <div className={styles.sectionHeader}>
                <h2>Set the Acknowledgement Threshold</h2>
              </div>

              <div className={styles.departmentRow}>
                <label className={styles.field}>
                  <span>Department</span>
                  <select value={selectedDepartmentSlug} onChange={handleDepartmentChange}>
                    <option value="">Select Department</option>
                    {availableDepartments.map((department) => (
                      <option key={department.slug} value={department.slug}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className={styles.rulesTable}>
                <div className={styles.ruleCard}>
                  <div className={styles.ruleGrid}>
                    <label className={styles.field}>
                      <span>Sub-Department</span>
                      <select
                        value={rule.subDepartmentSlug}
                        onChange={(event) => updateRule("subDepartmentSlug", event.target.value)}
                        disabled={!selectedDepartment}
                      >
                        <option value="">Select Sub-Department</option>
                        {availableSubDepartments.map((item) => (
                          <option key={item.slug} value={item.slug}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span>Notebook Type</span>
                      <select
                        value={rule.screenName}
                        onChange={(event) => updateRule("screenName", event.target.value)}
                        disabled={!rule.subDepartmentSlug}
                      >
                        <option value="">Select Notebook Type</option>
                        {getThresholdScreensForSubDepartment(
                          selectedDepartmentSlug,
                          rule.subDepartmentSlug
                        ).map((screenName) => (
                          <option key={screenName} value={screenName}>
                            {screenName}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span>Acknowledge Within Hours</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={rule.acknowledgeWithinHours}
                        onChange={(event) => updateRule("acknowledgeWithinHours", event.target.value)}
                      />
                    </label>

                    <label className={styles.field}>
                      <span>L2 Approver</span>
                      <select
                        value={rule.approvalL2}
                        onChange={(event) => updateRule("approvalL2", event.target.value)}
                      >
                        <option value="">Select L2</option>
                        {l2Options.map((item) => (
                          <option key={`${item.employeeId}-${item.name}`} value={item.employeeId || item.name}>
                            {item.name || item.employeeId}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className={styles.ruleActions}>
                      <FiClock aria-hidden="true" />
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.formFooter}>
                <div className={styles.actionButtons}>
                  <button type="button" className={styles.clearButton} onClick={resetForm} disabled={saving}>
                    Clear
                  </button>
                  <button type="submit" className={styles.saveButton} disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>

              {message ? <p className={styles.successMessage}>{message}</p> : null}
              {error ? <p className={styles.errorMessage}>{error}</p> : null}
            </section>
          </form>
        ) : (
          <div className={styles.stack}>
            <section className={styles.existingFilterPanel}>
              <label className={styles.field}>
                <span>Department</span>
                <select
                  value={existingFilters.department}
                  onChange={(event) => handleExistingFilterChange("department", event.target.value)}
                >
                  <option value="">Select Department</option>
                  {existingDepartmentOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>Sub Department</span>
                <select
                  value={existingFilters.subDepartment}
                  onChange={(event) => handleExistingFilterChange("subDepartment", event.target.value)}
                >
                  <option value="">Select Sub Department</option>
                  {existingSubDepartmentOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>Notebook Type</span>
                <select
                  value={existingFilters.screenName}
                  onChange={(event) => handleExistingFilterChange("screenName", event.target.value)}
                >
                  <option value="">Select Notebook Type</option>
                  {existingNotebookOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>Status</span>
                <select
                  value={existingFilters.status}
                  onChange={(event) => handleExistingFilterChange("status", event.target.value)}
                >
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>

              <button
                type="button"
                className={styles.clearFilterButton}
                onClick={() => setExistingFilters(buildExistingFilters())}
              >
                <FiX />
                Clear Filter
              </button>
            </section>

            <section className={`${styles.card} ${styles.existingThresholdCard}`}>
              <div className={styles.existingSummaryRow}>
                <article className={`${styles.summaryCard} ${styles.departmentSummaryCard}`}>
                  <span>Department</span>
                  <strong>{existingDepartment?.name || existingFilters.department || "-"}</strong>
                </article>
                <article className={styles.summaryCard}>
                  <span>Sub Department</span>
                  <strong>{existingSubDepartment?.name || existingFilters.subDepartment || "-"}</strong>
                </article>
                <article className={styles.summaryCard}>
                  <span>Notebook Type</span>
                  <strong>{existingFilters.screenName || "-"}</strong>
                </article>
              </div>

              <div className={styles.tableWrap}>
                <table className={`${styles.table} ${styles.existingThresholdTable}`}>
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th>Sub-Deprt.</th>
                      <th>Notebook</th>
                      <th>Acknowledge Within</th>
                      <th>L2</th>
                      <th>Status</th>
                      <th>Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7}>Loading...</td>
                      </tr>
                    ) : filteredThresholds.length === 0 ? (
                      <tr>
                        <td colSpan={7}>No acknowledgement thresholds found.</td>
                      </tr>
                    ) : (
                      filteredThresholds.map((item, index) => {
                        const rowKey =
                          getThresholdId(item) ||
                          `${getThresholdScreenName(item)}-${getThresholdSubDepartment(item)}-${index}`;
                        return (
                          <tr key={rowKey}>
                            <td>{getThresholdDepartment(item) || "-"}</td>
                            <td>{getThresholdSubDepartment(item) || "-"}</td>
                            <td>{getThresholdScreenName(item) || "-"}</td>
                            <td>{getThresholdAckHours(item) || "-"} Hrs</td>
                            <td>{getThresholdL2(item)}</td>
                            <td>
                              <span
                                className={`${styles.statusBadge} ${
                                  getActiveValue(item) ? styles.statusActive : styles.statusInactive
                                }`}
                              >
                                {getActiveValue(item) ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td>{formatTimestamp(item.created_at || item.createdAt || item.created_on || item.createdOn)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {message ? <p className={styles.successMessage}>{message}</p> : null}
              {error ? <p className={styles.errorMessage}>{error}</p> : null}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

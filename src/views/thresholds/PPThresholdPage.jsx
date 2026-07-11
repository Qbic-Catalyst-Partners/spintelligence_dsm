import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { FiCheckCircle, FiClock, FiSlash, FiX } from "react-icons/fi";
import { FaIdCard } from "react-icons/fa6";

import { fetchPpThresholdsAPI, savePpThresholdAPI } from "@/apis/ppThresholdApi";
import { fetchUsers } from "@/store/slices/userSlice";
import { isFullAccessUser } from "@/utils/accessControl";
import styles from "@/styles/SubmissionThreshold.module.css";

// Every PP notebook that appears as its own column in the "Update Existing PP"
// matrix (process-parameter.js DEPARTMENT_TYPE_NAMES / DEPARTMENT_TYPE_OPTION_OBJECTS)
// gets its own threshold row here instead of one shared batch config.
// Names must match process-parameter.js's updateExistingColumns labels
// exactly, since the matrix looks up a column's threshold by this name.
const PP_THRESHOLD_NOTEBOOKS = [
  "Mixing",
  "Blow Room",
  "Carding",
  "DF Breaker",
  "DF Finisher",
  "Simplex",
  "Spinning",
  "Autoconer PP",
  "AC-Q2",
  "AC-Q3",
];

const createRule = () => ({
  notebookName: "",
  completionThresholdHours: "24",
  approvalL1Ids: [],
  approvalL2Ids: [],
});

const buildExistingFilters = () => ({
  notebookName: "",
  status: "",
});

const PENDING_PP_THRESHOLD_STORAGE_KEY = "ppThresholdPendingRows";

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

const normalizeIdList = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);

const getThresholdId = (item) => item?.id || item?.threshold_id || item?.thresholdId || item?._id || "";

const getThresholdNotebookName = (item) =>
  item?.notebook_name || item?.notebookName || item?.notebook || item?.screen_name || item?.screenName || "";

const getThresholdHours = (item) =>
  item?.completion_threshold_hours ?? item?.completionThresholdHours ?? item?.acknowledge_within_hours ?? "";

const getThresholdNameList = (item, namesKeys, singleKeys) => {
  for (const key of namesKeys) {
    if (Array.isArray(item?.[key]) && item[key].length) return item[key].join(", ");
  }
  for (const key of singleKeys) {
    if (item?.[key]) return String(item[key]);
  }
  return "-";
};

const getThresholdL1 = (item) =>
  getThresholdNameList(
    item,
    ["approval_l1_names", "approvalL1Names"],
    ["approval_l1_name", "approvalL1Name", "approval_l1", "approvalL1"]
  );

const getThresholdL2 = (item) =>
  getThresholdNameList(
    item,
    ["approval_l2_names", "approvalL2Names"],
    ["approval_l2_name", "approvalL2Name", "approval_l2", "approvalL2"]
  );

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

const normalizeMatchValue = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const readPendingThresholdRows = () => {
  if (typeof window === "undefined") return [];
  try {
    const parsedRows = JSON.parse(window.localStorage.getItem(PENDING_PP_THRESHOLD_STORAGE_KEY) || "[]");
    return Array.isArray(parsedRows) ? parsedRows : [];
  } catch {
    return [];
  }
};

const writePendingThresholdRows = (rows) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_PP_THRESHOLD_STORAGE_KEY, JSON.stringify(rows.slice(0, 20)));
  } catch {
    // Best-effort cache only; the backend remains the source of truth.
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
  return normalizeMatchValue(getThresholdNotebookName(left)) === normalizeMatchValue(getThresholdNotebookName(right));
};

const mergeThresholdRow = (rows, row) => {
  if (!row) return rows;
  const index = rows.findIndex((item) => isSameThreshold(item, row));
  if (index === -1) return [row, ...rows];
  return rows.map((item, itemIndex) => (itemIndex === index ? { ...item, ...row } : item));
};

const mergeThresholdRows = (rows, nextRows) => nextRows.reduce((mergedRows, row) => mergeThresholdRow(mergedRows, row), rows);

function MultiUserSelect({
  value = [],
  options = [],
  onChange,
  disabled = false,
  placeholder = "Select",
  emptyLabel = "No users available",
}) {
  const containerRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const selectedIds = new Set(normalizeIdList(value));
  const selectedNames = options
    .filter((option) => selectedIds.has(String(option.id)))
    .map((option) => option.name);
  const selectedLabel =
    selectedNames.length > 1 ? `${selectedNames.length} selected` : selectedNames[0] || placeholder;

  return (
    <div
      ref={containerRef}
      className={`${styles.multiSelectWrap} ${disabled ? styles.multiSelectDisabled : ""}`}
    >
      <button
        type="button"
        className={styles.multiSelectButton}
        onClick={() => {
          if (!disabled) setIsOpen((current) => !current);
        }}
        disabled={disabled}
      >
        <span className={styles.multiSelectValue}>{selectedLabel}</span>
        <span className={styles.multiSelectChevron}>{isOpen ? "^" : "v"}</span>
      </button>

      {isOpen ? (
        <div className={styles.multiSelectMenu}>
          {options.length ? (
            options.map((option) => {
              const optionId = String(option.id);
              const isChecked = selectedIds.has(optionId);
              return (
                <button
                  key={optionId}
                  type="button"
                  className={`${styles.singleSelectOption} ${isChecked ? styles.singleSelectOptionActive : ""}`}
                  onClick={() => {
                    const nextIds = isChecked
                      ? normalizeIdList(value).filter((id) => id !== optionId)
                      : [...normalizeIdList(value), optionId];
                    onChange?.(nextIds);
                  }}
                >
                  <span className={styles.multiSelectOptionRow}>
                    <input type="checkbox" checked={isChecked} readOnly tabIndex={-1} />
                    <span>{option.name}</span>
                  </span>
                </button>
              );
            })
          ) : (
            <div className={styles.multiSelectEmpty}>{emptyLabel}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function PPThresholdPage() {
  const dispatch = useDispatch();
  const router = useRouter();
  const user = useSelector((state) => state.auth?.user);
  const isHydrated = useSelector((state) => state.auth?.isHydrated);
  const users = useSelector((state) => state.users?.users || []);
  const canAccessPage = isFullAccessUser(user);

  const [activeTab, setActiveTab] = useState("new");
  const [thresholds, setThresholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [rule, setRule] = useState(createRule);
  const [existingFilters, setExistingFilters] = useState(buildExistingFilters);

  const l1Options = useMemo(() => buildUserOptions(users, "L1"), [users]);
  const l2Options = useMemo(() => buildUserOptions(users, "L2"), [users]);

  const totalThresholds = thresholds.length;
  const activeThresholds = thresholds.filter((item) => getActiveValue(item)).length;
  const inactiveThresholds = thresholds.filter((item) => !getActiveValue(item)).length;

  const filteredThresholds = thresholds.filter((item) => {
    if (existingFilters.notebookName && getThresholdNotebookName(item) !== existingFilters.notebookName) return false;
    if (existingFilters.status) {
      const statusValue = getActiveValue(item) ? "active" : "inactive";
      if (statusValue !== existingFilters.status) return false;
    }
    return true;
  });

  const loadThresholds = async () => {
    if (!canAccessPage) return [];
    setLoading(true);
    try {
      const rows = await fetchPpThresholdsAPI();
      const mergedRows = mergeThresholdRows(rows, readPendingThresholdRows());
      setThresholds(mergedRows);
      setError("");
      return mergedRows;
    } catch (err) {
      const pendingRows = readPendingThresholdRows();
      setThresholds(pendingRows);
      setError(err?.message || "Unable to load PP thresholds.");
      return pendingRows;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isHydrated) return;
    if (!canAccessPage) {
      router.replace("/departments");
      return;
    }
    loadThresholds();
    dispatch(fetchUsers());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccessPage, isHydrated]);

  const updateRule = (field, value) => {
    setRule((current) => ({ ...current, [field]: value }));
    setMessage("");
    setError("");
  };

  const handleExistingFilterChange = (field, value) => {
    setExistingFilters((current) => ({ ...current, [field]: value }));
  };

  const resetForm = ({ preserveFeedback = false } = {}) => {
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
      if (!rule.notebookName) throw new Error("Please select a notebook.");

      const hours = Number(rule.completionThresholdHours);
      if (!Number.isFinite(hours) || hours <= 0) {
        throw new Error("Please enter a completion threshold greater than 0 hours.");
      }

      if (!rule.approvalL1Ids.length) throw new Error("Please select at least one L1 user.");
      if (!rule.approvalL2Ids.length) throw new Error("Please select at least one L2 user.");

      const selectedL1Users = users.filter((candidate) =>
        rule.approvalL1Ids.includes(String(candidate?.id ?? ""))
      );
      const selectedL2Users = users.filter((candidate) =>
        rule.approvalL2Ids.includes(String(candidate?.id ?? ""))
      );

      const existingThreshold = thresholds.find((item) =>
        isSameThreshold(item, { notebook_name: rule.notebookName })
      );
      const existingThresholdId = getThresholdId(existingThreshold);

      const payload = {
        ...(existingThresholdId ? { id: existingThresholdId, threshold_id: existingThresholdId } : {}),
        notebook_name: rule.notebookName,
        completion_threshold_hours: hours,
        approval_l1_user_ids: rule.approvalL1Ids.map((id) => Number(id)),
        approval_l1_names: selectedL1Users.map(getUserDisplayName),
        approval_l2_user_ids: rule.approvalL2Ids.map((id) => Number(id)),
        approval_l2_names: selectedL2Users.map(getUserDisplayName),
        is_active: true,
      };

      const response = await savePpThresholdAPI(payload);
      const savedThreshold = {
        ...(existingThreshold || {}),
        ...getSavedThresholdFromResponse(response, payload),
        updated_at: new Date().toISOString(),
      };
      writePendingThresholdRows(mergeThresholdRow(readPendingThresholdRows(), savedThreshold));
      setMessage(response?.message || "PP threshold saved successfully.");
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
        err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to save PP threshold."
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
          <h1>PP Threshold</h1>
          <p>Set an individual completion threshold, L1 and L2 for each PP notebook.</p>
        </div>

        <div className={styles.tabBar} role="tablist" aria-label="PP threshold views">
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
                <h2>Set the PP Threshold</h2>
              </div>

              <div className={styles.rulesTable}>
                <div className={styles.ruleCard}>
                  <div className={styles.ruleGrid}>
                    <label className={styles.field}>
                      <span>Notebook</span>
                      <select
                        value={rule.notebookName}
                        onChange={(event) => updateRule("notebookName", event.target.value)}
                      >
                        <option value="">Select Notebook</option>
                        {PP_THRESHOLD_NOTEBOOKS.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span>Completion Threshold (Hours)</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={rule.completionThresholdHours}
                        onChange={(event) => updateRule("completionThresholdHours", event.target.value)}
                      />
                    </label>

                    <label className={styles.field}>
                      <span>L1 (Responsible to Complete)</span>
                      <MultiUserSelect
                        value={rule.approvalL1Ids}
                        options={l1Options}
                        onChange={(nextIds) => updateRule("approvalL1Ids", nextIds)}
                        placeholder={l1Options.length ? "Select" : "No L1 users available"}
                        emptyLabel="No L1 users available"
                      />
                    </label>

                    <label className={styles.field}>
                      <span>L2 (Escalation Approver)</span>
                      <MultiUserSelect
                        value={rule.approvalL2Ids}
                        options={l2Options}
                        onChange={(nextIds) => updateRule("approvalL2Ids", nextIds)}
                        placeholder={l2Options.length ? "Select" : "No L2 users available"}
                        emptyLabel="No L2 users available"
                      />
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
                <span>Notebook</span>
                <select
                  value={existingFilters.notebookName}
                  onChange={(event) => handleExistingFilterChange("notebookName", event.target.value)}
                >
                  <option value="">All Notebooks</option>
                  {PP_THRESHOLD_NOTEBOOKS.map((name) => (
                    <option key={name} value={name}>
                      {name}
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
              <div className={styles.tableWrap}>
                <table className={`${styles.table} ${styles.existingThresholdTable}`}>
                  <thead>
                    <tr>
                      <th>Notebook</th>
                      <th>Completion Threshold</th>
                      <th>L1</th>
                      <th>L2</th>
                      <th>Status</th>
                      <th>Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6}>Loading...</td>
                      </tr>
                    ) : filteredThresholds.length === 0 ? (
                      <tr>
                        <td colSpan={6}>No PP thresholds found.</td>
                      </tr>
                    ) : (
                      filteredThresholds.map((item, index) => {
                        const rowKey = getThresholdId(item) || `${getThresholdNotebookName(item)}-${index}`;
                        return (
                          <tr key={rowKey}>
                            <td>{getThresholdNotebookName(item) || "-"}</td>
                            <td>{getThresholdHours(item) || "-"} Hrs</td>
                            <td>{getThresholdL1(item)}</td>
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

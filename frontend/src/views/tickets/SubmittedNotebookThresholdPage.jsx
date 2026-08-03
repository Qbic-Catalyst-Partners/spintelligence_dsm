import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { FiCheckCircle, FiMoreVertical, FiPlus, FiSlash, FiTrash2, FiX } from "react-icons/fi";
import { FaIdCard } from "react-icons/fa6";

import {
  fetchNotebookAcknowledgementThresholdsAPI,
  saveNotebookAcknowledgementThresholdAPI,
  updateNotebookAcknowledgementThresholdAPI,
  updateNotebookAcknowledgementThresholdStatusAPI,
  deleteNotebookAcknowledgementThresholdAPI,
} from "@/apis/notebookAcknowledgementThresholdApi";
import { fetchUsers } from "@/store/slices/userSlice";
import { isSubmittedNotebookManagerUser } from "@/utils/accessControl";
import { departmentDirectory } from "@/views/departments/data";
import { getThresholdScreensForSubDepartment } from "@/views/thresholds/screenCatalog";
import styles from "@/styles/SubmissionThreshold.module.css";

const CRITICALITY_OPTIONS = ["High", "Medium", "Low"];

const createRule = () => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  subDepartmentSlug: "",
  screenName: "",
  criticality: "High",
  approvalL4Ids: [],
  acknowledgeWithinHours: "24",
});

const buildExistingFilters = () => ({
  department: "",
  subDepartment: "",
  screenName: "",
  status: "",
});

const PENDING_ACK_THRESHOLD_STORAGE_KEY = "submittedNotebookPendingAcknowledgementThresholds";

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

const getThresholdCriticality = (item) => item?.criticality || "-";

const getThresholdL4Name = (item) => item?.approval_l4_name || item?.approvalL4Name || "-";

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

const normalizeIdList = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);

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
    // Best-effort cache only; the backend remains the source of truth.
  }
};

const getSavedThresholdFromResponse = (response, fallbackPayload) => {
  const candidate =
    response?.acknowledgement_threshold ||
    response?.threshold ||
    response?.config ||
    response?.row ||
    response?.data?.acknowledgement_threshold ||
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

const getUserDisplayName = (user) =>
  String(user?.name || user?.full_name || user?.fullName || user?.username || "").trim();

const buildUserOptions = (users, level) => {
  const seen = new Set();
  return users
    .filter((user) => String(user?.level || "").trim().toUpperCase() === level)
    .map((user) => ({ id: user?.id, name: getUserDisplayName(user) }))
    .filter((user) => {
      const key = String(user.id ?? "").trim();
      if (!key || !user.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
};

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
    <div ref={containerRef} className={`${styles.multiSelectWrap} ${disabled ? styles.multiSelectDisabled : ""}`}>
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

export default function SubmittedNotebookThresholdPage({ standalone = true, editItem = null, onEditItemHandled } = {}) {
  const router = useRouter();
  const dispatch = useDispatch();
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
  const [rules, setRules] = useState([createRule()]);
  const [existingFilters, setExistingFilters] = useState(buildExistingFilters);
  const [editingThresholdId, setEditingThresholdId] = useState("");
  const [openActionMenuId, setOpenActionMenuId] = useState("");
  const [statusUpdatingId, setStatusUpdatingId] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const l4Options = useMemo(() => buildUserOptions(users, "L4"), [users]);

  const availableDepartments = departmentDirectory.filter((item) => item.enabled);
  const selectedDepartment =
    availableDepartments.find((item) => item.slug === selectedDepartmentSlug) || null;
  const availableSubDepartments = (selectedDepartment?.subDepartments || []).filter(
    (item) => item.enabled
  );
  const existingDepartment = availableDepartments.find(
    (item) => item.name === existingFilters.department
  ) || null;
  const existingSubDepartment = (existingDepartment?.subDepartments || []).find(
    (item) => item.name === existingFilters.subDepartment
  ) || null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccessPage, isHydrated, router]);

  const openEditThreshold = (item) => {
    const departmentName = getThresholdDepartment(item);
    const subDepartmentName = getThresholdSubDepartment(item);
    const department = availableDepartments.find((candidate) => candidate.name === departmentName) || null;
    const subDepartment = department?.subDepartments?.find((candidate) => candidate.name === subDepartmentName) || null;
    const approvalL4Ids = String(item?.approval_l4 || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    setSelectedDepartmentSlug(department?.slug || "");
    setRules([
      {
        ...createRule(),
        subDepartmentSlug: subDepartment?.slug || "",
        screenName: getThresholdScreenName(item),
        criticality: getThresholdCriticality(item) === "-" ? "High" : getThresholdCriticality(item),
        approvalL4Ids,
        acknowledgeWithinHours: String(getThresholdAckHours(item) || "24"),
      },
    ]);
    setEditingThresholdId(String(getThresholdId(item) || ""));
    setActiveTab("new");
    setMessage("Edit mode loaded from Existing Thresholds.");
    setError("");
  };

  useEffect(() => {
    if (!editItem) return;
    openEditThreshold(editItem);
    onEditItemHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItem]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      const actionMenu = event.target.closest("[data-ack-threshold-menu]");
      if (!actionMenu) {
        setOpenActionMenuId("");
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const toggleThresholdStatus = async (item) => {
    const thresholdId = getThresholdId(item);
    if (!thresholdId) {
      setError("Unable to find the selected acknowledgement threshold.");
      return;
    }

    setStatusUpdatingId(String(thresholdId));
    setOpenActionMenuId("");
    setMessage("");
    setError("");

    try {
      const response = await updateNotebookAcknowledgementThresholdStatusAPI(thresholdId, !getActiveValue(item));
      setMessage(response?.message || "Acknowledgement threshold status updated successfully.");
      await loadThresholds();
    } catch (err) {
      setError(
        err?.response?.data?.message || err?.message || "Unable to update acknowledgement threshold status."
      );
    } finally {
      setStatusUpdatingId("");
    }
  };

  const deleteThreshold = async (item) => {
    const thresholdId = getThresholdId(item);
    if (!thresholdId) {
      setError("Unable to find the selected acknowledgement threshold.");
      return;
    }

    setDeletingId(String(thresholdId));
    setOpenActionMenuId("");
    setMessage("");
    setError("");

    try {
      const response = await deleteNotebookAcknowledgementThresholdAPI(thresholdId);
      setMessage(response?.message || "Acknowledgement threshold deleted successfully.");
      await loadThresholds();
    } catch (err) {
      setError(
        err?.response?.data?.message || err?.message || "Unable to delete acknowledgement threshold."
      );
    } finally {
      setDeletingId("");
    }
  };

  const updateRule = (ruleId, field, value) => {
    setRules((current) =>
      current.map((rule) => {
        if (rule.id !== ruleId) return rule;
        const next = { ...rule, [field]: value };
        if (field === "subDepartmentSlug") next.screenName = "";
        return next;
      })
    );
    setMessage("");
    setError("");
  };

  const addRule = () => {
    setRules((current) => [...current, createRule()]);
    setMessage("");
    setError("");
  };

  const removeRule = (ruleId) => {
    setRules((current) => {
      const next = current.filter((rule) => rule.id !== ruleId);
      return next.length ? next : [createRule()];
    });
    setMessage("");
    setError("");
  };

  const handleDepartmentChange = (event) => {
    setSelectedDepartmentSlug(event.target.value);
    setRules([createRule()]);
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
    setRules([createRule()]);
    setEditingThresholdId("");
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

      // Editing an existing row goes through PATCH-by-id instead of the create
      // endpoint's upsert-by-(screen_name, department, sub_department) — using
      // the natural-key upsert here would silently create a second row instead
      // of updating this one if the notebook/department selection changed
      // during the edit, leaving the original row behind untouched.
      if (editingThresholdId) {
        const rule = rules[0];
        const subDepartment = availableSubDepartments.find((item) => item.slug === rule.subDepartmentSlug) || null;
        if (!subDepartment) throw new Error("Please select a sub-department.");
        if (!rule.screenName) throw new Error("Please select a notebook.");

        const duplicateMatch = thresholds.find((item) =>
          isSameThreshold(item, {
            screen_name: rule.screenName,
            department: selectedDepartment.name,
            sub_department: subDepartment.name,
          })
        );
        if (duplicateMatch && String(getThresholdId(duplicateMatch)) !== String(editingThresholdId)) {
          throw new Error("Threshold already exists, please modify in list of existing thresholds");
        }

        const hours = Number(rule.acknowledgeWithinHours);
        if (!Number.isFinite(hours) || hours <= 0) {
          throw new Error("Please enter approved within hours greater than 0.");
        }

        const l4Names = l4Options
          .filter((option) => normalizeIdList(rule.approvalL4Ids).includes(String(option.id)))
          .map((option) => option.name);

        const response = await updateNotebookAcknowledgementThresholdAPI(editingThresholdId, {
          screen_name: rule.screenName,
          department: selectedDepartment.name,
          sub_department: subDepartment.name,
          criticality: rule.criticality,
          approval_l4: normalizeIdList(rule.approvalL4Ids),
          approval_l4_name: l4Names,
          acknowledge_within_hours: hours,
        });

        setMessage(response?.message || "Acknowledgement threshold updated successfully.");
        setActiveTab("existing");
        setExistingFilters(buildExistingFilters());
        resetForm({ preserveFeedback: true });
        await loadThresholds();
        return;
      }

      const payloads = rules.map((rule) => {
        const subDepartment = availableSubDepartments.find((item) => item.slug === rule.subDepartmentSlug) || null;
        if (!subDepartment) throw new Error("Please select a sub-department for every row.");
        if (!rule.screenName) throw new Error("Please select a notebook for every row.");

        const hours = Number(rule.acknowledgeWithinHours);
        if (!Number.isFinite(hours) || hours <= 0) {
          throw new Error("Please enter approved within hours greater than 0 for every row.");
        }

        const l4Names = l4Options
          .filter((option) => normalizeIdList(rule.approvalL4Ids).includes(String(option.id)))
          .map((option) => option.name);

        const isDuplicate = thresholds.some((item) =>
          isSameThreshold(item, {
            screen_name: rule.screenName,
            department: selectedDepartment.name,
            sub_department: subDepartment.name,
          })
        );
        if (isDuplicate) {
          throw new Error("Threshold already exists, please modify in list of existing thresholds");
        }

        return {
          screen_name: rule.screenName,
          department: selectedDepartment.name,
          sub_department: subDepartment.name,
          criticality: rule.criticality,
          approval_l4: normalizeIdList(rule.approvalL4Ids),
          approval_l4_name: l4Names,
          acknowledge_within_hours: hours,
          is_active: true,
        };
      });

      const responses = await Promise.all(
        payloads.map((payload) => saveNotebookAcknowledgementThresholdAPI(payload))
      );

      const savedThresholds = responses.map((response, index) => ({
        ...getSavedThresholdFromResponse(response, payloads[index]),
        updated_at: new Date().toISOString(),
      }));

      writePendingThresholdRows(mergeThresholdRows(readPendingThresholdRows(), savedThresholds));
      setMessage(
        responses[0]?.message ||
          `${savedThresholds.length} acknowledgement threshold${savedThresholds.length > 1 ? "s" : ""} saved successfully.`
      );
      setActiveTab("existing");
      setExistingFilters(buildExistingFilters());
      resetForm({ preserveFeedback: true });
      const reloadedThresholds = await loadThresholds();
      setThresholds((currentThresholds) =>
        mergeThresholdRows(
          reloadedThresholds.length ? reloadedThresholds : mergeThresholdRows(currentThresholds, readPendingThresholdRows()),
          savedThresholds
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

  const effectiveActiveTab = standalone ? activeTab : "new";

  const content = (
    <>
        {standalone ? (
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
        ) : null}

        {effectiveActiveTab === "new" ? (
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

        {effectiveActiveTab === "new" ? (
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
                {rules.map((rule, index) => (
                  <div className={styles.ruleCard} key={rule.id}>
                    <div className={styles.ruleGrid} style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr)) auto" }}>
                      <label className={styles.field} style={{ gridColumn: "1 / 2", gridRow: "1" }}>
                        <span>Sub Department</span>
                        <select
                          value={rule.subDepartmentSlug}
                          onChange={(event) => updateRule(rule.id, "subDepartmentSlug", event.target.value)}
                          disabled={!selectedDepartment}
                        >
                          <option value="">Select Sub Department</option>
                          {availableSubDepartments.map((item) => (
                            <option key={item.slug} value={item.slug}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className={styles.field} style={{ gridColumn: "2 / 3", gridRow: "1" }}>
                        <span>Notebook</span>
                        <select
                          value={rule.screenName}
                          onChange={(event) => updateRule(rule.id, "screenName", event.target.value)}
                          disabled={!rule.subDepartmentSlug}
                        >
                          <option value="">Select Notebook</option>
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

                      <label className={styles.field} style={{ gridColumn: "3 / 4", gridRow: "1" }}>
                        <span>Criticality</span>
                        <select
                          value={rule.criticality}
                          onChange={(event) => updateRule(rule.id, "criticality", event.target.value)}
                        >
                          {CRITICALITY_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className={styles.field} style={{ gridColumn: "4 / 5", gridRow: "1" }}>
                        <span>L4</span>
                        <MultiUserSelect
                          value={rule.approvalL4Ids}
                          options={l4Options}
                          onChange={(nextIds) => updateRule(rule.id, "approvalL4Ids", nextIds)}
                          placeholder="Select L4 user"
                          emptyLabel="No L4 users available"
                        />
                      </label>

                      <label className={styles.field} style={{ gridColumn: "5 / 6", gridRow: "1" }}>
                        <span>Approved within (Hours)</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={rule.acknowledgeWithinHours}
                          onChange={(event) => updateRule(rule.id, "acknowledgeWithinHours", event.target.value)}
                        />
                      </label>

                      <div className={styles.ruleActions} style={{ gridColumn: "6 / 7", gridRow: "1" }}>
                        {index === rules.length - 1 ? (
                          <button
                            type="button"
                            className={styles.addIconButton}
                            onClick={addRule}
                            aria-label="Add acknowledgement threshold row"
                          >
                            <FiPlus />
                          </button>
                        ) : (
                          <span className={styles.actionSpacer} aria-hidden="true" />
                        )}
                        <button
                          type="button"
                          className={styles.deleteIconButton}
                          onClick={() => removeRule(rule.id)}
                          aria-label="Delete acknowledgement threshold row"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
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
                <span>Notebook</span>
                <select
                  value={existingFilters.screenName}
                  onChange={(event) => handleExistingFilterChange("screenName", event.target.value)}
                >
                  <option value="">Select Notebook</option>
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
                  <span>Notebook</span>
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
                      <th>Criticality</th>
                      <th>L4</th>
                      <th>Approved Within</th>
                      <th>Status</th>
                      <th>Created At</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={9}>Loading...</td>
                      </tr>
                    ) : filteredThresholds.length === 0 ? (
                      <tr>
                        <td colSpan={9}>No acknowledgement thresholds found.</td>
                      </tr>
                    ) : (
                      filteredThresholds.map((item, index) => {
                        const rowKey =
                          getThresholdId(item) ||
                          `${getThresholdScreenName(item)}-${getThresholdSubDepartment(item)}-${index}`;
                        const isMenuOpen = openActionMenuId === String(rowKey);
                        const isStatusUpdating = statusUpdatingId === String(getThresholdId(item) || "");
                        const isDeleting = deletingId === String(getThresholdId(item) || "");
                        return (
                          <tr key={rowKey}>
                            <td>{getThresholdDepartment(item) || "-"}</td>
                            <td>{getThresholdSubDepartment(item) || "-"}</td>
                            <td>{getThresholdScreenName(item) || "-"}</td>
                            <td>{getThresholdCriticality(item)}</td>
                            <td>{getThresholdL4Name(item)}</td>
                            <td>{getThresholdAckHours(item) || "-"} Hrs</td>
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
                            <td>
                              <div className={styles.actionMenuWrap} data-ack-threshold-menu="true">
                                <button
                                  type="button"
                                  className={styles.actionMenuButton}
                                  aria-label="Open acknowledgement threshold actions"
                                  onClick={() =>
                                    setOpenActionMenuId((current) => (current === String(rowKey) ? "" : String(rowKey)))
                                  }
                                >
                                  <FiMoreVertical />
                                </button>
                                {isMenuOpen ? (
                                  <div className={styles.actionMenu}>
                                    <button
                                      type="button"
                                      className={styles.actionMenuItem}
                                      onClick={() => {
                                        openEditThreshold(item);
                                        setOpenActionMenuId("");
                                      }}
                                      disabled={isStatusUpdating || isDeleting}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.actionMenuItem}
                                      onClick={() => toggleThresholdStatus(item)}
                                      disabled={isStatusUpdating || isDeleting}
                                    >
                                      {isStatusUpdating ? "Updating..." : getActiveValue(item) ? "Pause" : "Activate"}
                                    </button>
                                    <button
                                      type="button"
                                      className={`${styles.actionMenuItem} ${styles.actionMenuDelete}`}
                                      onClick={() => deleteThreshold(item)}
                                      disabled={isStatusUpdating || isDeleting}
                                    >
                                      {isDeleting ? "Deleting..." : "Delete"}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </td>
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
    </>
  );

  if (!standalone) {
    return content;
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.intro}>
          <h1>Acknowledgement Threshold</h1>
          <p>Set the L4 acknowledgement time for submitted notebooks</p>
        </div>
        {content}
      </div>
    </div>
  );
}

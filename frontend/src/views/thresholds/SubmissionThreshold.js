import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { FiCheckCircle, FiClock, FiMoreVertical, FiPlus, FiSlash, FiTrash2, FiX } from "react-icons/fi";
import { FaIdCard } from "react-icons/fa6";

import {
  deleteSubmissionFrequencyConfigAPI,
  fetchSubmissionFrequencyConfigsAPI,
  saveSubmissionFrequencyConfigAPI,
  updateSubmissionFrequencyConfigAPI,
  updateSubmissionFrequencyStatusAPI,
} from "@/apis/submissionFrequencyApi";
import { fetchUsers } from "@/store/slices/userSlice";
import { isFullAccessUser } from "@/utils/accessControl";
import { departmentDirectory } from "@/views/departments/data";
import { getThresholdScreensForSubDepartment } from "@/views/thresholds/screenCatalog";
import styles from "@/styles/SubmissionThreshold.module.css";

const createRule = () => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  subDepartmentSlug: "",
  screenName: "",
  approvalL1: [],
  approvalL2: [],
  approvalL1Tat: "08:00",
  approvalL2Tat: "08:00",
  frequencyLabel: "Daily",
  occurrences: "4",
  isActive: true,
});

const frequencyOptions = [
  { label: "Daily", value: "Daily", days: 1 },
  { label: "Every 2 Days", value: "Every 2 Days", days: 2 },
  { label: "Every 3 Days", value: "Every 3 Days", days: 3 },
  { label: "Weekly", value: "Weekly", days: 7 },
  { label: "Biweekly", value: "Biweekly", days: 14 },
  { label: "Monthly", value: "Monthly", days: 30 },
  { label: "Quarterly", value: "Quarterly", days: 91 },
  { label: "Half Yearly", value: "Half Yearly", days: 182 },
];

const occurrenceOptions = Array.from({ length: 10 }, (_, index) => String(index + 1));
const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minuteOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

const buildExistingFilters = () => ({
  department: "",
  subDepartment: "",
  screenName: "",
  status: "",
});

const normalizeLookupValue = (value) => String(value ?? "").trim().toLowerCase();

const getUserDisplayName = (user) =>
  String(user?.name || user?.full_name || user?.fullName || user?.username || "").trim();

const buildUserOptions = (users, level) => {
  const seenNames = new Set();

  return users
    .filter((user) => String(user?.level || "").trim().toUpperCase() === level)
    .filter((user) => {
      const name = getUserDisplayName(user);
      const key = name.toLowerCase();

      if (!name || seenNames.has(key)) {
        return false;
      }

      seenNames.add(key);
      return true;
    })
    .sort((left, right) => getUserDisplayName(left).localeCompare(getUserDisplayName(right)));
};

const resolveUser = (users, value) => {
  const normalizedValue = normalizeLookupValue(value);

  if (!normalizedValue) {
    return null;
  }

  return (
    users.find((userItem) => {
      const candidateValues = [
        userItem?.id,
        userItem?.employeeId,
        userItem?.employee_id,
        userItem?.name,
        userItem?.full_name,
        userItem?.fullName,
        userItem?.username,
        userItem?.email,
      ];

      return candidateValues.some(
        (candidate) => normalizeLookupValue(candidate) === normalizedValue
      );
    }) || null
  );
};

const getFrequencyLabel = (frequency) => {
  const matchedOption = frequencyOptions.find((item) => Number(item.days) === Number(frequency));
  return matchedOption?.label || `${frequency} Day${Number(frequency) === 1 ? "" : "s"}`;
};

const formatTimestamp = (value) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year}, ${hours}:${minutes}`;
};

const normalizeNameList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const parseTatParts = (value) => {
  const normalizedValue = String(value || "08:00").trim().toUpperCase();
  const match = normalizedValue.match(/^(\d{1,2})(?::(\d{1,2}))?\s*(A|P|AM|PM)?$/);

  if (!match) {
    return { hour: "08", minute: "00" };
  }

  const parsedHour = Number(match[1]);
  const parsedMinute = Number(match[2] || 0);
  // Historical values may still carry a 12-hour "AM/PM" suffix from before the switch
  // to a 24-hour picker — fold PM hours into 24-hour form so old data keeps displaying correctly.
  const meridiem = match[3]?.startsWith("P") ? "PM" : match[3]?.startsWith("A") ? "AM" : null;
  let hourNumber = parsedHour || 8;
  if (meridiem === "PM" && hourNumber < 12) hourNumber += 12;
  if (meridiem === "AM" && hourNumber === 12) hourNumber = 0;

  const hour = String(Math.min(Math.max(hourNumber, 0), 23)).padStart(2, "0");
  const minute = String(Math.min(Math.max(parsedMinute || 0, 0), 59)).padStart(2, "0");

  return { hour, minute };
};

const formatTatValue = (hour, minute) => `${hour}:${minute}`;

const formatTatHours = (value) => {
  const hours = Number(value);
  if (!Number.isInteger(hours) || hours <= 0) return "08:00";

  const normalizedHour = Math.min(Math.max(hours, 0), 23);
  return `${String(normalizedHour).padStart(2, "0")}:00`;
};

const tatValueToHours = (value) => {
  const { hour, minute } = parseTatParts(value);
  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  return Math.max(1, hourNumber + (minuteNumber > 0 ? 1 : 0));
};

const resolveUsers = (users, values) =>
  normalizeNameList(values)
    .map((value) => resolveUser(users, value))
    .filter(Boolean);

const formatTatHoursLabel = (value) => {
  const hours = Number(value);
  if (!Number.isInteger(hours) || hours <= 0) return "-";
  return `${hours} Hr${hours === 1 ? "" : "s"}`;
};

function ExpandableCell({ values = [], fallback = "-" }) {
  const normalizedValues = Array.from(
    new Set(
      normalizeNameList(values)
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

  if (!normalizedValues.length) {
    return fallback;
  }

  if (normalizedValues.length === 1) {
    return normalizedValues[0];
  }

  return (
    <details className={styles.expandableCell}>
      <summary className={styles.expandableCellSummary}>
        <span className={styles.expandableCellPrimary}>{normalizedValues[0]}</span>
        <span className={styles.expandableCellIcon}>v</span>
      </summary>
      <div className={styles.expandableCellDropdown}>
        {normalizedValues.map((value) => (
          <div key={value} className={styles.expandableCellItem}>
            {value}
          </div>
        ))}
      </div>
    </details>
  );
}

function SingleSelectDropdown({
  value = [],
  options = [],
  onChange,
  placeholder = "Select",
  disabled = false,
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

  const selectedValues = Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : normalizeNameList(value);
  const selectedSet = new Set(selectedValues.map((item) => item.toLowerCase()));
  const selectedLabel =
    selectedValues.length > 1
      ? `${selectedValues.length} selected`
      : selectedValues[0] || placeholder;

  return (
    <div
      ref={containerRef}
      className={`${styles.multiSelectWrap} ${disabled ? styles.multiSelectDisabled : ""}`}
    >
      <button
        type="button"
        className={styles.multiSelectButton}
        onClick={() => {
          if (!disabled) {
            setIsOpen((current) => !current);
          }
        }}
        disabled={disabled}
      >
        <span className={styles.multiSelectValue}>{selectedLabel}</span>
        <span className={styles.multiSelectChevron}>{isOpen ? "^" : "v"}</span>
      </button>

      {isOpen ? (
        <div className={styles.multiSelectMenu}>
          {options.length ? (
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`${styles.singleSelectOption} ${
                  selectedSet.has(String(option.name || "").trim().toLowerCase())
                    ? styles.singleSelectOptionActive
                    : ""
                }`}
                onClick={() => {
                  const optionName = String(option.name || "").trim();
                  if (!optionName) return;

                  const hasValue = selectedSet.has(optionName.toLowerCase());
                  const nextValue = hasValue
                    ? selectedValues.filter(
                        (item) => item.toLowerCase() !== optionName.toLowerCase()
                      )
                    : [...selectedValues, optionName];
                  onChange?.(nextValue);
                }}
              >
                <span className={styles.multiSelectOptionRow}>
                  <input
                    type="checkbox"
                    checked={selectedSet.has(String(option.name || "").trim().toLowerCase())}
                    readOnly
                    tabIndex={-1}
                  />
                  <span>{option.name}</span>
                </span>
              </button>
            ))
          ) : (
            <div className={styles.multiSelectEmpty}>{emptyLabel}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TatTimePicker({ value, onChange, label }) {
  const containerRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const { hour, minute } = parseTatParts(value);

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

  const syncTime = (nextHour, nextMinute) => {
    onChange?.(formatTatValue(nextHour, nextMinute));
  };

  const handleTextChange = (nextValue) => {
    onChange?.(nextValue);
  };

  return (
    <div className={styles.tatTimeWrap} ref={containerRef}>
      <input
        type="text"
        value={value}
        placeholder="08:00"
        onFocus={() => setIsOpen(true)}
        onClick={() => setIsOpen(true)}
        onChange={(event) => handleTextChange(event.target.value)}
      />
      <button
        type="button"
        className={styles.tatTimeButton}
        onClick={() => setIsOpen((current) => !current)}
        aria-label={`Select ${label} turn around time`}
      >
        <FiClock />
      </button>
      {isOpen ? (
        <div className={styles.tatTimeMenu}>
          <label>
            <span>Hrs</span>
            <select value={hour} onChange={(event) => syncTime(event.target.value, minute)}>
              {hourOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Mins</span>
            <select value={minute} onChange={(event) => syncTime(hour, event.target.value)}>
              {minuteOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}

export default function SubmissionThreshold({ standalone = true, editItem = null, onEditItemHandled } = {}) {
  const dispatch = useDispatch();
  const router = useRouter();
  const user = useSelector((state) => state.auth?.user);
  const isHydrated = useSelector((state) => state.auth?.isHydrated);
  const users = useSelector((state) => state.users?.users || []);
  const canAccessPage = isFullAccessUser(user);

  const [activeTab, setActiveTab] = useState("new");
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedDepartmentSlug, setSelectedDepartmentSlug] = useState("");
  const [rules, setRules] = useState([createRule()]);
  const [existingFilters, setExistingFilters] = useState(buildExistingFilters);
  const [openActionMenuId, setOpenActionMenuId] = useState("");
  const [editingConfigId, setEditingConfigId] = useState("");
  const [statusUpdatingId, setStatusUpdatingId] = useState("");
  const [deletingId, setDeletingId] = useState("");

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
  const subDepartmentNameBySlug = useMemo(
    () => Object.fromEntries(availableSubDepartments.map((item) => [item.slug, item.name])),
    [availableSubDepartments]
  );

  const l1Options = useMemo(() => buildUserOptions(users, "L1"), [users]);
  const l2Options = useMemo(() => buildUserOptions(users, "L2"), [users]);

  const totalThresholds = configs.length;
  const activeThresholds = configs.filter((item) => item?.is_active).length;
  const inactiveThresholds = configs.filter((item) => !item?.is_active).length;
  const existingDepartmentOptions = Array.from(
    new Set(configs.map((item) => item.department).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right));
  const existingSubDepartmentOptions = Array.from(
    new Set(
      configs
        .filter((item) => !existingFilters.department || item.department === existingFilters.department)
        .map((item) => item.sub_department)
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));
  const existingNotebookOptions = Array.from(
    new Set(
      configs
        .filter((item) => !existingFilters.department || item.department === existingFilters.department)
        .filter(
          (item) =>
            !existingFilters.subDepartment || item.sub_department === existingFilters.subDepartment
        )
        .map((item) => item.screen_name)
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));
  const filteredConfigs = configs.filter((item) => {
    if (existingFilters.department && item.department !== existingFilters.department) return false;
    if (
      existingFilters.subDepartment &&
      item.sub_department !== existingFilters.subDepartment
    ) {
      return false;
    }
    if (existingFilters.screenName && item.screen_name !== existingFilters.screenName) return false;
    if (existingFilters.status) {
      const statusValue = item?.is_active ? "active" : "inactive";
      if (statusValue !== existingFilters.status) return false;
    }
    return true;
  });

  const loadConfigs = async () => {
    if (!canAccessPage) return;
    setLoading(true);
    try {
      const data = await fetchSubmissionFrequencyConfigsAPI();
      setConfigs(data);
      setError("");
    } catch (err) {
      setConfigs([]);
      setError(err?.message || "Unable to load submission thresholds.");
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
    loadConfigs();
    dispatch(fetchUsers());
  }, [canAccessPage, dispatch, isHydrated, router]);

  useEffect(() => {
    if (!router.isReady || !availableDepartments.length) return;

    const departmentSlug = String(router.query.department || "").trim();
    const subDepartmentSlug = String(router.query.subDepartment || "").trim();
    const screenName = String(router.query.screenName || "").trim();
    if (!departmentSlug && !subDepartmentSlug && !screenName) return;

    const matchedDepartment = availableDepartments.find((item) => item.slug === departmentSlug);
    const matchedSubDepartment = matchedDepartment?.subDepartments?.find(
      (item) => item.slug === subDepartmentSlug
    );

    setActiveTab("new");
    setSelectedDepartmentSlug(matchedDepartment?.slug || "");
    setRules((current) => [
      {
        ...(current[0] || createRule()),
        subDepartmentSlug: matchedSubDepartment?.slug || "",
        screenName,
      },
    ]);
    setError("");
    setMessage("");
  }, [availableDepartments, router.isReady, router.query.department, router.query.screenName, router.query.subDepartment]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      const actionMenu = event.target.closest("[data-submission-menu]");
      if (!actionMenu) {
        setOpenActionMenuId("");
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const getAvailableScreens = (subDepartmentSlug) =>
    selectedDepartmentSlug && subDepartmentSlug
      ? getThresholdScreensForSubDepartment(selectedDepartmentSlug, subDepartmentSlug)
      : [];

  const handleDepartmentChange = (event) => {
    setSelectedDepartmentSlug(event.target.value);
    setRules([createRule()]);
    setMessage("");
    setError("");
  };

  const handleRuleChange = (ruleId, field, value) => {
    setRules((current) =>
      current.map((rule) => {
        if (rule.id !== ruleId) return rule;
        if (field === "subDepartmentSlug") {
          return { ...rule, subDepartmentSlug: value, screenName: "" };
        }
        return { ...rule, [field]: value };
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
      const nextRules = current.filter((rule) => rule.id !== ruleId);
      return nextRules.length ? nextRules : [createRule()];
    });
    setMessage("");
    setError("");
  };

  const resetForm = ({ preserveFeedback = false } = {}) => {
    setSelectedDepartmentSlug("");
    setRules([createRule()]);
    setEditingConfigId("");
    if (!preserveFeedback) {
      setMessage("");
      setError("");
    }
  };

  const handleExistingFilterChange = (field, value) => {
    setExistingFilters((current) => {
      if (field === "department") {
        return {
          department: value,
          subDepartment: "",
          screenName: "",
          status: current.status,
        };
      }

      if (field === "subDepartment") {
        return {
          ...current,
          subDepartment: value,
          screenName: "",
        };
      }

      return {
        ...current,
        [field]: value,
      };
    });
  };

  const openEditConfig = (item) => {
    const departmentSlug =
      availableDepartments.find((department) => department.name === item?.department)?.slug || "";
    const subDepartmentSlug =
      availableDepartments
        .find((department) => department.slug === departmentSlug)
        ?.subDepartments?.find((subDepartment) => subDepartment.name === item?.sub_department)?.slug ||
      "";
    const matchedFrequency =
      frequencyOptions.find((option) => Number(option.days) === Number(item?.frequency))?.label ||
      "Daily";

    setSelectedDepartmentSlug(departmentSlug);
    setRules([
      {
        id: `${Date.now()}-edit`,
        subDepartmentSlug,
        screenName: item?.screen_name || "",
        approvalL1: normalizeNameList(item?.approval_l1_name || item?.approval_l1),
        approvalL2: normalizeNameList(item?.approval_l2_name || item?.approval_l2),
        approvalL1Tat: formatTatHours(item?.l1_tat_hours),
        approvalL2Tat: formatTatHours(item?.l2_tat_hours),
        frequencyLabel: matchedFrequency,
        occurrences: String(item?.occurrences ?? "4"),
        isActive: Boolean(item?.is_active),
      },
    ]);
    setEditingConfigId(String(item?.id || ""));
    setActiveTab("new");
    setOpenActionMenuId("");
    setMessage("Edit mode loaded from Existing Thresholds.");
    setError("");
  };

  useEffect(() => {
    if (!editItem) return;
    openEditConfig(editItem);
    onEditItemHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItem]);

  const toggleConfigStatus = async (item) => {
    const configId = item?.id;
    if (!configId) {
      setError("Unable to find the selected submission threshold.");
      return;
    }

    setStatusUpdatingId(String(configId));
    setOpenActionMenuId("");
    setMessage("");
    setError("");

    try {
      const response = await updateSubmissionFrequencyStatusAPI(configId, !item?.is_active);
      setMessage(response?.message || "Submission threshold status updated successfully.");
      await loadConfigs();
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to update submission threshold status."
      );
    } finally {
      setStatusUpdatingId("");
    }
  };

  const deleteConfig = async (item) => {
    const configId = item?.id;
    if (!configId) {
      setError("Unable to find the selected submission threshold.");
      return;
    }

    setDeletingId(String(configId));
    setOpenActionMenuId("");
    setMessage("");
    setError("");

    try {
      const response = await deleteSubmissionFrequencyConfigAPI(configId);
      setMessage(response?.message || "Submission threshold deleted successfully.");
      await loadConfigs();
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to delete submission threshold."
      );
    } finally {
      setDeletingId("");
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      if (!selectedDepartment) {
        throw new Error("Please select a department.");
      }

      const payloads = rules.map((rule) => {
        const subDepartmentName = subDepartmentNameBySlug[rule.subDepartmentSlug] || "";
        const matchedFrequency =
          frequencyOptions.find((item) => item.label === rule.frequencyLabel)?.days || 1;
        const selectedL1 = normalizeNameList(rule.approvalL1);
        const selectedL2 = normalizeNameList(rule.approvalL2);
        const l1Users = resolveUsers(users, selectedL1);
        const l2Users = resolveUsers(users, selectedL2);

        if (!rule.subDepartmentSlug || !subDepartmentName) {
          throw new Error("Please select a sub-department for each row.");
        }

        if (!rule.screenName) {
          throw new Error("Please select a notebook type for each row.");
        }

        if (!selectedL1.length) {
          throw new Error("Please select an L1 user for each row.");
        }

        if (!selectedL2.length) {
          throw new Error("Please select an L2 user for each row.");
        }

        const l1Ids = l1Users.map((item) => item.id).filter(Boolean);
        const l2Ids = l2Users.map((item) => item.id).filter(Boolean);
        const l1Names = l1Users.map((item) => getUserDisplayName(item)).filter(Boolean);
        const l2Names = l2Users.map((item) => getUserDisplayName(item)).filter(Boolean);

        return {
          screen_name: rule.screenName,
          department: selectedDepartment.name,
          sub_department: subDepartmentName,
          frequency: Number(matchedFrequency),
          occurrences: Number(rule.occurrences),
          is_active: rule.isActive,
          approval_l1: l1Ids.length ? l1Ids.join(", ") : selectedL1.join(", "),
          approval_l1_name: l1Names.length ? l1Names.join(", ") : selectedL1.join(", "),
          tracked_l1_user_ids: l1Ids,
          l1_tat_hours: tatValueToHours(rule.approvalL1Tat),
          approval_l2: l2Ids.length ? l2Ids.join(", ") : selectedL2.join(", "),
          approval_l2_name: l2Names.length ? l2Names.join(", ") : selectedL2.join(", "),
          l2_tat_hours: tatValueToHours(rule.approvalL2Tat),
        };
      });

      if (editingConfigId) {
        const response = await updateSubmissionFrequencyConfigAPI(editingConfigId, payloads[0]);
        setMessage(response?.message || "Submission threshold updated successfully.");
      } else {
        await Promise.all(payloads.map((payload) => saveSubmissionFrequencyConfigAPI(payload)));
        setMessage("Submission threshold saved successfully.");
      }
      setActiveTab("existing");
      resetForm({ preserveFeedback: true });
      await loadConfigs();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to save submission threshold.");
    } finally {
      setSaving(false);
    }
  };

  if (!isHydrated || !canAccessPage) {
    return null;
  }

  const effectiveActiveTab = standalone ? activeTab : "new";

  const content = (
    <>
        {standalone ? (
        <div className={styles.tabBar} role="tablist" aria-label="Submission threshold views">
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
                <h2>Set the Submission Frequency</h2>
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
                  <div key={rule.id} className={styles.ruleCard}>
                    <div className={styles.ruleGrid}>
                      <label className={styles.field}>
                        <span>Sub-Department</span>
                        <select
                          value={rule.subDepartmentSlug}
                          onChange={(event) =>
                            handleRuleChange(rule.id, "subDepartmentSlug", event.target.value)
                          }
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
                          onChange={(event) =>
                            handleRuleChange(rule.id, "screenName", event.target.value)
                          }
                          disabled={!rule.subDepartmentSlug}
                        >
                          <option value="">Select Notebook Type</option>
                          {getAvailableScreens(rule.subDepartmentSlug).map((screenName) => (
                            <option key={screenName} value={screenName}>
                              {screenName}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className={styles.field}>
                        <span>Frequency</span>
                        <select
                          value={rule.frequencyLabel}
                          onChange={(event) =>
                            handleRuleChange(rule.id, "frequencyLabel", event.target.value)
                          }
                        >
                          {frequencyOptions.map((option) => (
                            <option key={option.label} value={option.label}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className={styles.field}>
                        <span>Number of Occurrences</span>
                        <select
                          value={rule.occurrences}
                          onChange={(event) =>
                            handleRuleChange(rule.id, "occurrences", event.target.value)
                          }
                        >
                          {occurrenceOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className={styles.field}>
                        <span>L1</span>
                        <SingleSelectDropdown
                          value={rule.approvalL1}
                          options={l1Options}
                          onChange={(nextValue) => handleRuleChange(rule.id, "approvalL1", nextValue)}
                          placeholder={l1Options.length ? "Select" : "No L1 users available"}
                          emptyLabel="No L1 users available"
                        />
                      </label>

                      <label className={styles.field}>
                        <span>TAT</span>
                        <TatTimePicker
                          label="L1 TAT"
                          value={rule.approvalL1Tat}
                          onChange={(nextValue) => handleRuleChange(rule.id, "approvalL1Tat", nextValue)}
                        />
                      </label>

                      <label className={styles.field}>
                        <span>L2</span>
                        <SingleSelectDropdown
                          value={rule.approvalL2}
                          options={l2Options}
                          onChange={(nextValue) => handleRuleChange(rule.id, "approvalL2", nextValue)}
                          placeholder={l2Options.length ? "Select" : "No L2 users available"}
                          emptyLabel="No L2 users available"
                        />
                      </label>

                      <label className={styles.field}>
                        <span>TAT</span>
                        <TatTimePicker
                          label="L2 TAT"
                          value={rule.approvalL2Tat}
                          onChange={(nextValue) => handleRuleChange(rule.id, "approvalL2Tat", nextValue)}
                        />
                      </label>

                      <div className={styles.ruleActions}>
                        {index === rules.length - 1 ? (
                          <button
                            type="button"
                            className={styles.addIconButton}
                            onClick={addRule}
                            aria-label="Add submission threshold row"
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
                          aria-label="Delete submission threshold row"
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
                  <button
                    type="button"
                    className={styles.clearButton}
                    onClick={() => resetForm()}
                    disabled={saving}
                  >
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
                  onChange={(event) =>
                    handleExistingFilterChange("subDepartment", event.target.value)
                  }
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
                  <strong>{existingDepartment?.name || "-"}</strong>
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
                      <th>L1</th>
                      <th>L1 TAT</th>
                      <th>L2</th>
                      <th>L2 TAT</th>
                      <th>Frequency</th>
                      <th>No. Of Occurrences</th>
                      <th>Status</th>
                      <th>Created At</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={12}>Loading...</td>
                      </tr>
                    ) : filteredConfigs.length === 0 ? (
                      <tr>
                        <td colSpan={12}>No submission thresholds found.</td>
                      </tr>
                    ) : (
                      filteredConfigs.map((item, index) => {
                        const rowKey =
                          item.id ||
                          item._id ||
                          `${item.screen_name}-${item.sub_department}-${index}`;
                        const isMenuOpen = openActionMenuId === String(rowKey);
                        const isStatusUpdating = statusUpdatingId === String(item?.id || "");
                        const isDeleting = deletingId === String(item?.id || "");

                        return (
                        <tr key={rowKey}>
                          <td>{item.department || "-"}</td>
                          <td>{item.sub_department || "-"}</td>
                          <td className={styles.notebookCell}>
                            <ExpandableCell values={item.screen_name} />
                          </td>
                          <td>
                            <ExpandableCell values={item.approval_l1_name || item.approval_l1} />
                          </td>
                          <td>{formatTatHoursLabel(item.l1_tat_hours)}</td>
                          <td>
                            <ExpandableCell values={item.approval_l2_name || item.approval_l2} />
                          </td>
                          <td>{formatTatHoursLabel(item.l2_tat_hours)}</td>
                          <td>{getFrequencyLabel(item.frequency)}</td>
                          <td>{item.occurrences ?? "-"}</td>
                          <td>
                            <span
                              className={`${styles.statusBadge} ${
                                item.is_active ? styles.statusActive : styles.statusInactive
                              }`}
                            >
                              {item.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td>{formatTimestamp(item.created_at || item.createdAt)}</td>
                          <td>
                            <div className={styles.actionMenuWrap} data-submission-menu="true">
                              <button
                                type="button"
                                className={styles.actionMenuButton}
                                aria-label="Open submission threshold actions"
                                onClick={() =>
                                  setOpenActionMenuId((current) =>
                                    current === String(rowKey) ? "" : String(rowKey)
                                  )
                                }
                              >
                                <FiMoreVertical />
                              </button>
                              {isMenuOpen ? (
                                <div className={styles.actionMenu}>
                                  <button
                                    type="button"
                                    className={styles.actionMenuItem}
                                    onClick={() => openEditConfig(item)}
                                    disabled={isStatusUpdating || isDeleting}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.actionMenuItem}
                                    onClick={() => toggleConfigStatus(item)}
                                    disabled={isStatusUpdating || isDeleting}
                                  >
                                    {isStatusUpdating
                                      ? "Updating..."
                                      : item?.is_active
                                        ? "Inactive"
                                        : "Active"}
                                  </button>
                                  <button
                                    type="button"
                                    className={`${styles.actionMenuItem} ${styles.actionMenuDelete}`}
                                    onClick={() => deleteConfig(item)}
                                    disabled={isStatusUpdating || isDeleting}
                                  >
                                    {isDeleting ? "Deleting..." : "Delete"}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )})
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
          <h1>Submission Threshold</h1>
          <p>Add and edit the threshold Submission</p>
        </div>
        {content}
      </div>
    </div>
  );
}

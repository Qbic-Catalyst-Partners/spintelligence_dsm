import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import {
    FiChevronDown,
    FiChevronLeft,
    FiChevronRight,
    FiCheckCircle,
    FiClock,
    FiMoreVertical,
    FiPlus,
    FiSlash,
    FiTrash2,
    FiX,
} from "react-icons/fi";
import { FaIdCard } from "react-icons/fa6";

import { deleteThresholdAPI, fetchThresholdsAPI, saveThresholdsBulkAPI, updateThresholdAPI, updateThresholdStatusAPI } from "@/apis/thresholdsApi";
import { fetchUsers } from "@/store/slices/userSlice";
import { isFullAccessUser } from "@/utils/accessControl";
import { departmentDirectory } from "@/views/departments/data";
import { getThresholdFieldsForScreen } from "@/views/thresholds/fieldCatalog";
import { getThresholdScreensForSubDepartment } from "@/views/thresholds/screenCatalog";
import styles from "@/styles/ThresholdValues.module.css";

const createRule = () => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fieldName: "",
    comparison: "more_and_less_than",
    actualValue: "",
    valueMode: "number",
    positiveTolerance: "",
    negativeTolerance: "",
    criticality: "",
    approvalL1: [],
    approvalL2: [],
    approvalL1Tat: "08:00",
    approvalL2Tat: "08:00",
});

// TAT (turn-around time) helpers — 24-hour, hours-and-minutes only, no AM/PM.
// Kept in sync with the same logic in SubmissionThreshold.js.
const tatHourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const tatMinuteOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

const parseTatParts = (value) => {
    const normalizedValue = String(value || "08:00").trim().toUpperCase();
    const match = normalizedValue.match(/^(\d{1,2})(?::(\d{1,2}))?\s*(A|P|AM|PM)?$/);

    if (!match) {
        return { hour: "08", minute: "00" };
    }

    const parsedHour = Number(match[1]);
    const parsedMinute = Number(match[2] || 0);
    // Historical values may still carry a 12-hour "AM/PM" suffix — fold PM hours into 24-hour form.
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

    return (
        <div className={styles.tatTimeWrap} ref={containerRef}>
            <input
                type="text"
                value={value}
                placeholder="08:00"
                onFocus={() => setIsOpen(true)}
                onClick={() => setIsOpen(true)}
                onChange={(event) => onChange?.(event.target.value)}
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
                            {tatHourOptions.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        <span>Mins</span>
                        <select value={minute} onChange={(event) => syncTime(hour, event.target.value)}>
                            {tatMinuteOptions.map((option) => (
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

const EXISTING_ROWS_PER_PAGE = 6;

const buildInitialFilters = () => ({
    departmentSlug: "",
    subDepartmentSlug: "",
    screenName: "",
    status: "",
});

const getScreenFieldOptions = (screenName, thresholds) => {
    const catalogFields = getThresholdFieldsForScreen(screenName);

    if (catalogFields.length) {
        return catalogFields;
    }

    const inferredFields = thresholds
        .filter((item) => (item?.input_screen || item?.machine_name) === screenName)
        .map((item) => item?.input_field || item?.parameter_name)
        .filter(Boolean);

    return Array.from(new Set(inferredFields)).sort();
};

const formatToleranceDisplay = (item, absoluteValue, percentValue) => {
    if (item?.value_mode === "percent" && percentValue !== undefined && percentValue !== null && percentValue !== "") {
        return `${percentValue} (%)`;
    }

    return absoluteValue ?? "-";
};

const PERCENT_MODE_STORAGE_KEY = "thresholdValuesPercentModeCache";

const loadPercentModeCacheFromStorage = () => {
    if (typeof window === "undefined") {
        return new Map();
    }

    try {
        const raw = window.localStorage.getItem(PERCENT_MODE_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return new Map(Object.entries(parsed));
    } catch {
        return new Map();
    }
};

const savePercentModeCacheToStorage = (cache) => {
    if (typeof window === "undefined") {
        return;
    }

    try {
        window.localStorage.setItem(
            PERCENT_MODE_STORAGE_KEY,
            JSON.stringify(Object.fromEntries(cache))
        );
    } catch {
        // ignore storage failures (e.g. private browsing quota)
    }
};

const getCriticalityLabel = (item) => {
    const directValue = String(
        item?.criticality || item?.severity || item?.priority || ""
    ).trim();

    if (directValue) {
        const normalized = directValue.toLowerCase();
        if (normalized === "high" || normalized === "medium" || normalized === "low") {
            return normalized.charAt(0).toUpperCase() + normalized.slice(1);
        }
    }

    const plusValue = Number(item?.plus_threshold ?? item?.positive_tolerance);
    const minusValue = Number(item?.minus_threshold ?? item?.negative_tolerance);
    const tolerance = Math.max(
        Number.isFinite(plusValue) ? Math.abs(plusValue) : 0,
        Number.isFinite(minusValue) ? Math.abs(minusValue) : 0
    );

    if (tolerance >= 2) return "High";
    if (tolerance >= 1) return "Medium";
    return "Low";
};

const normalizeLookupValue = (value) => String(value ?? "").trim().toLowerCase();

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

const getUserDisplayName = (user) =>
    String(user?.name || user?.full_name || user?.fullName || user?.username || "").trim();

const resolveUserName = (users, value) => {
    const normalizedValue = normalizeLookupValue(value);

    if (!normalizedValue) {
        return "";
    }

    const matchedUser = users.find((userItem) => {
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
    });

    return getUserDisplayName(matchedUser) || String(value ?? "").trim();
};

const resolveDisplayValues = (users, candidates) => {
    for (const candidate of candidates) {
        const labels = normalizeNameList(candidate)
            .map((value) => resolveUserName(users, value))
            .filter(Boolean);

        if (labels.length) {
            return labels;
        }
    }

    return [];
};

const getApprovalValues = (item, users, level) => {
    const l1Candidates = [
        item?.approval_l1_names,
        item?.approvalL1Names,
        item?.approval_l1_name,
        item?.approvalL1Name,
        item?.approval_l1,
        item?.approvalL1,
    ];

    const l2Candidates = [
        item?.approval_l2_names,
        item?.approvalL2Names,
        item?.approval_l2_name,
        item?.approvalL2Name,
        item?.approved_by_name,
        item?.approvedByName,
        item?.approval_l2,
        item?.approved_by,
        item?.created_by_name,
        item?.createdByName,
        item?.updated_by_name,
        item?.updatedByName,
        item?.created_by,
        item?.updated_by,
    ];

    return resolveDisplayValues(users, level === "l1" ? l1Candidates : l2Candidates);
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
                <FiChevronDown className={styles.expandableCellIcon} aria-hidden="true" />
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

const buildUserOptions = (users, predicate) => {
    const seenNames = new Set();

    return users
        .filter(predicate)
        .filter((item) => {
            const name = String(item?.name || "").trim();

            if (!name || seenNames.has(name.toLowerCase())) {
                return false;
            }

            seenNames.add(name.toLowerCase());
            return true;
        })
        .sort((left, right) => left.name.localeCompare(right.name));
};

const resolveSelectedUsers = (users, values) =>
    normalizeNameList(values)
        .map((value) => {
            const normalizedValue = normalizeLookupValue(value);

            return users.find((userItem) => {
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
            });
        })
        .filter(Boolean);

function MultiSelectDropdown({
    values = [],
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

    const selectedValues = Array.isArray(values) ? values : [];
    const buttonLabel = selectedValues.length ? "Selected" : placeholder;

    const toggleValue = (option) => {
        if (disabled) {
            return;
        }

        const nextValues = selectedValues.includes(option)
            ? selectedValues.filter((item) => item !== option)
            : [...selectedValues, option];

        onChange?.(nextValues);
    };

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
                <span className={styles.multiSelectValue}>{buttonLabel}</span>
                <span className={styles.multiSelectChevron}>{isOpen ? "˄" : "˅"}</span>
            </button>

            {isOpen ? (
                <div className={styles.multiSelectMenu}>
                    {options.length ? (
                        options.map((option) => (
                            <label key={option.id} className={styles.multiSelectOption}>
                                <input
                                    type="checkbox"
                                    checked={selectedValues.includes(option.name)}
                                    onChange={() => toggleValue(option.name)}
                                />
                                <span>{option.name}</span>
                            </label>
                        ))
                    ) : (
                        <div className={styles.multiSelectEmpty}>{emptyLabel}</div>
                    )}
                </div>
            ) : null}
        </div>
    );
}

export default function ThresholdValues() {
    const dispatch = useDispatch();
    const router = useRouter();
    const user = useSelector((state) => state.auth?.user);
    const isHydrated = useSelector((state) => state.auth?.isHydrated);
    const users = useSelector((state) => state.users?.users || []);
    const canAccessPage = isFullAccessUser(user);

    const [activeTab, setActiveTab] = useState("new");
    const [thresholds, setThresholds] = useState([]);
    const [loadError, setLoadError] = useState("");
    const [loading, setLoading] = useState(true);
    const [selectedDepartmentSlug, setSelectedDepartmentSlug] = useState("");
    const [selectedSubDepartmentSlug, setSelectedSubDepartmentSlug] = useState("");
    const [selectedScreenName, setSelectedScreenName] = useState("");
    const [screenRules, setScreenRules] = useState([createRule()]);
    const [submitting, setSubmitting] = useState(false);
    const [formMessage, setFormMessage] = useState("");
    const [formError, setFormError] = useState("");
    const [existingFilters, setExistingFilters] = useState(buildInitialFilters);
    const [existingPage, setExistingPage] = useState(1);
    const [openActionMenuId, setOpenActionMenuId] = useState("");
    const [editingThresholdId, setEditingThresholdId] = useState("");
    const [statusUpdatingRowKey, setStatusUpdatingRowKey] = useState("");
    const [deletingRowKey, setDeletingRowKey] = useState("");
    const [existingMessage, setExistingMessage] = useState("");
    const [existingError, setExistingError] = useState("");

    const percentModeCacheRef = useRef(null);
    if (percentModeCacheRef.current === null) {
        percentModeCacheRef.current = loadPercentModeCacheFromStorage();
    }

    const normalizeKeyText = (value) => String(value ?? "").trim().toLowerCase();

    const normalizeKeyNumber = (value) => {
        const num = Number(value);
        return Number.isFinite(num) ? String(num) : normalizeKeyText(value);
    };

    const getPercentCacheKey = (item) =>
        [
            normalizeKeyText(item?.input_screen || item?.machine_name),
            normalizeKeyText(item?.input_field || item?.parameter_name),
            normalizeKeyNumber(item?.actual_value),
        ].join("::");

    const rememberPercentMode = (item) => {
        const key = getPercentCacheKey(item);
        percentModeCacheRef.current.set(key, {
            value_mode: item.value_mode,
            positive_tolerance_percent: item.positive_tolerance_percent,
            negative_tolerance_percent: item.negative_tolerance_percent,
        });
        savePercentModeCacheToStorage(percentModeCacheRef.current);
    };

    const applyPercentModeCache = (data) =>
        (Array.isArray(data) ? data : []).map((item) => {
            const cached = percentModeCacheRef.current.get(getPercentCacheKey(item));
            return cached ? { ...item, ...cached } : item;
        });

    const loadThresholds = async () => {
        if (!canAccessPage) {
            return;
        }

        setLoading(true);

        try {
            const data = await fetchThresholdsAPI();
            setThresholds(applyPercentModeCache(data));
            setLoadError("");
        } catch (error) {
            setThresholds([]);
            setLoadError(
                error?.message ||
                "Unable to load threshold values. Check backend availability and try again."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isHydrated) {
            return;
        }

        if (!canAccessPage) {
            router.replace("/departments");
            return;
        }

        loadThresholds();
    }, [canAccessPage, isHydrated, router]);

    useEffect(() => {
        if (canAccessPage && isHydrated && !users.length) {
            dispatch(fetchUsers());
        }
    }, [canAccessPage, dispatch, isHydrated, users.length]);

    useEffect(() => {
        const handlePointerDown = (event) => {
            const actionMenu = event.target.closest("[data-threshold-menu]");
            if (!actionMenu) {
                setOpenActionMenuId("");
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        return () => document.removeEventListener("mousedown", handlePointerDown);
    }, []);

    const availableDepartments = departmentDirectory;
    const selectedDepartment =
        availableDepartments.find((item) => item.slug === selectedDepartmentSlug) || null;
    const availableSubDepartments = selectedDepartment?.subDepartments || [];
    const selectedSubDepartment =
        availableSubDepartments.find((item) => item.slug === selectedSubDepartmentSlug) || null;
    const availableScreens = selectedDepartmentSlug && selectedSubDepartmentSlug
        ? getThresholdScreensForSubDepartment(selectedDepartmentSlug, selectedSubDepartmentSlug)
        : [];

    const fieldOptions = useMemo(
        () => getScreenFieldOptions(selectedScreenName, thresholds),
        [selectedScreenName, thresholds]
    );

    const l1Options = useMemo(
        () => buildUserOptions(users, (item) => normalizeLookupValue(item?.level) === "l1"),
        [users]
    );

    const l2Options = useMemo(
        () =>
            buildUserOptions(
                users,
                (item) =>
                    normalizeLookupValue(item?.level) === "l2" ||
                    String(item?.role || "").trim().toLowerCase().includes("supervisor")
            ),
        [users]
    );

    useEffect(() => {
        setExistingFilters((current) => {
            const nextDepartmentSlug = availableDepartments.some(
                (department) => department.slug === current.departmentSlug
            )
                ? current.departmentSlug
                : "";
            const nextDepartment = availableDepartments.find(
                (department) => department.slug === nextDepartmentSlug
            );
            const nextSubDepartments = nextDepartment?.subDepartments || [];
            const nextSubDepartmentSlug = nextSubDepartments.some(
                (subDepartment) => subDepartment.slug === current.subDepartmentSlug
            )
                ? current.subDepartmentSlug
                : "";
            const nextScreens = nextDepartmentSlug && nextSubDepartmentSlug
                ? getThresholdScreensForSubDepartment(nextDepartmentSlug, nextSubDepartmentSlug)
                : [];
            const nextScreenName = nextScreens.includes(current.screenName)
                ? current.screenName
                : nextScreens[0] || "";

            if (
                nextDepartmentSlug === current.departmentSlug &&
                nextSubDepartmentSlug === current.subDepartmentSlug &&
                nextScreenName === current.screenName
            ) {
                return current;
            }

            return {
                ...current,
                departmentSlug: nextDepartmentSlug,
                subDepartmentSlug: nextSubDepartmentSlug,
                screenName: nextScreenName,
            };
        });
    }, [availableDepartments]);

    const existingDepartment =
        availableDepartments.find((item) => item.slug === existingFilters.departmentSlug) || null;
    const existingSubDepartments = existingDepartment?.subDepartments || [];
    const existingSubDepartment =
        existingSubDepartments.find((item) => item.slug === existingFilters.subDepartmentSlug) || null;
    const existingScreens = existingFilters.departmentSlug && existingFilters.subDepartmentSlug
        ? getThresholdScreensForSubDepartment(existingFilters.departmentSlug, existingFilters.subDepartmentSlug)
        : [];

    const filteredThresholds = useMemo(() => {
        return thresholds.filter((item) => {
            const itemDepartment = item?.department || item?.management_field || "";
            const itemSubDepartment = item?.sub_department || item?.erp_product_code || "";
            const itemScreen = item?.input_screen || item?.machine_name || "";
            const matchesDepartment =
                !existingDepartment || itemDepartment === existingDepartment.name;
            const matchesSubDepartment =
                !existingSubDepartment || itemSubDepartment === existingSubDepartment.name;
            const matchesScreen =
                !existingFilters.screenName || itemScreen === existingFilters.screenName;
            const matchesStatus =
                existingFilters.status === "" || String(Boolean(item?.is_active)) === existingFilters.status;

            return matchesDepartment && matchesSubDepartment && matchesScreen && matchesStatus;
        });
    }, [existingDepartment, existingFilters.screenName, existingFilters.status, existingSubDepartment, thresholds]);

    useEffect(() => {
        setExistingPage(1);
    }, [existingFilters]);

    const totalThresholds = thresholds.length;
    const activeThresholds = thresholds.filter((item) => item?.is_active).length;
    const inactiveThresholds = totalThresholds - activeThresholds;
    const totalExistingPages = Math.max(1, Math.ceil(filteredThresholds.length / EXISTING_ROWS_PER_PAGE));
    const safeExistingPage = Math.min(existingPage, totalExistingPages);
    const existingPageStart = (safeExistingPage - 1) * EXISTING_ROWS_PER_PAGE;
    const visibleThresholdRows = filteredThresholds.slice(
        existingPageStart,
        existingPageStart + EXISTING_ROWS_PER_PAGE
    );

    const resetForm = () => {
        setSelectedDepartmentSlug("");
        setSelectedSubDepartmentSlug("");
        setSelectedScreenName("");
        setScreenRules([createRule()]);
        setEditingThresholdId("");
        setFormMessage("");
        setFormError("");
    };

    const addRule = () => {
        setScreenRules((current) => [...current, createRule()]);
        setFormMessage("");
        setFormError("");
    };

    const removeRule = (ruleId) => {
        setScreenRules((current) => {
            const nextRules = current.filter((rule) => rule.id !== ruleId);
            return nextRules.length ? nextRules : [createRule()];
        });
        setFormMessage("");
        setFormError("");
    };

    const handleRuleChange = (ruleId, field, value) => {
        setScreenRules((current) =>
            current.map((rule) => (rule.id === ruleId ? { ...rule, [field]: value } : rule))
        );
        setFormMessage("");
        setFormError("");
    };

    const formatTimestamp = (value) => {
        if (!value) {
            return "-";
        }

        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return "-";
        }

        return parsed.toLocaleString("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).replace(",", "");
    };

    const getThresholdRowKey = (item, index) =>
        String(
            item?.id ||
            item?._id ||
            `${item?.department}-${item?.sub_department}-${item?.input_screen}-${item?.input_field}-${item?.created_at || index}`
        );

    const getThresholdIdentifier = (item) =>
        String(item?.id || item?._id || item?.threshold_id || item?.thresholdId || "");

    const openEditThreshold = (item) => {
        const departmentSlug = availableDepartments.find(
            (department) => department.name === (item?.department || item?.management_field)
        )?.slug || "";
        const subDepartmentSlug =
            availableDepartments
                .find((department) => department.slug === departmentSlug)
                ?.subDepartments.find(
                    (subDepartment) => subDepartment.name === (item?.sub_department || item?.erp_product_code)
                )?.slug || "";

        setSelectedDepartmentSlug(departmentSlug);
        setSelectedSubDepartmentSlug(subDepartmentSlug);
        setSelectedScreenName(item?.input_screen || item?.machine_name || "");
        setScreenRules([
            {
                id: `${Date.now()}-edit`,
                fieldName: item?.input_field || item?.parameter_name || "",
                comparison: item?.comparison_operator || item?.condition_level || "more_and_less_than",
                actualValue: String(item?.actual_value ?? ""),
                valueMode: item?.value_mode === "percent" ? "percent" : "number",
                positiveTolerance:
                    item?.value_mode === "percent"
                        ? String(item?.positive_tolerance_percent ?? "")
                        : String(item?.plus_threshold ?? item?.positive_tolerance ?? ""),
                negativeTolerance:
                    item?.value_mode === "percent"
                        ? String(item?.negative_tolerance_percent ?? "")
                        : String(item?.minus_threshold ?? item?.negative_tolerance ?? ""),
                criticality: getCriticalityLabel(item),
                approvalL1: normalizeNameList(
                    item?.approval_l1_names || item?.approval_l1_name || item?.approval_l1
                ),
                approvalL2: normalizeNameList(
                    item?.approval_l2_names || item?.approval_l2_name || item?.approval_l2
                ),
                approvalL1Tat: formatTatHours(item?.l1_tat_hours),
                approvalL2Tat: formatTatHours(item?.l2_tat_hours),
            },
        ]);
        setEditingThresholdId(getThresholdIdentifier(item));
        setActiveTab("new");
        setOpenActionMenuId("");
        setFormMessage("Edit mode loaded from Existing Thresholds.");
        setFormError("");
        setExistingMessage("");
        setExistingError("");
    };

    const toggleThresholdStatus = async (rowKey) => {
        const currentIndex = thresholds.findIndex((item, index) => getThresholdRowKey(item, index) === rowKey);

        if (currentIndex === -1) {
            setExistingError("Unable to find the selected threshold row.");
            return;
        }

        const currentItem = thresholds[currentIndex];
        const nextStatus = !currentItem?.is_active;
        const previousThresholds = thresholds;

        setStatusUpdatingRowKey(rowKey);
        setExistingMessage("");
        setExistingError("");
        setOpenActionMenuId("");
        setThresholds((current) =>
            current.map((item, index) =>
                getThresholdRowKey(item, index) === rowKey
                    ? { ...item, is_active: nextStatus }
                    : item
            )
        );

        try {
            const updatedThreshold = await updateThresholdStatusAPI(currentItem, nextStatus);
            setThresholds((current) =>
                current.map((item, index) =>
                    getThresholdRowKey(item, index) === rowKey
                        ? { ...item, ...updatedThreshold, is_active: nextStatus }
                        : item
                )
            );
            setExistingMessage(`Threshold marked as ${nextStatus ? "active" : "inactive"}.`);
        } catch (error) {
            setThresholds(previousThresholds);
            setExistingError(
                error?.response?.data?.message || error?.message || "Unable to update threshold status."
            );
        } finally {
            setStatusUpdatingRowKey("");
        }
    };

    const deleteThresholdRow = async (rowKey) => {
        const currentIndex = thresholds.findIndex((item, index) => getThresholdRowKey(item, index) === rowKey);

        if (currentIndex === -1) {
            setExistingError("Unable to find the selected threshold row.");
            return;
        }

        const currentItem = thresholds[currentIndex];
        const previousThresholds = thresholds;

        setDeletingRowKey(rowKey);
        setExistingMessage("");
        setExistingError("");
        setOpenActionMenuId("");
        setThresholds((current) => current.filter((item, index) => getThresholdRowKey(item, index) !== rowKey));

        try {
            await deleteThresholdAPI(currentItem);
            setExistingMessage("Threshold deleted successfully.");
        } catch (error) {
            setThresholds(previousThresholds);
            setExistingError(
                error?.response?.data?.message || error?.message || "Unable to delete threshold."
            );
        } finally {
            setDeletingRowKey("");
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!selectedDepartment) {
            setFormError("department is required.");
            setFormMessage("");
            return;
        }

        if (!selectedSubDepartment) {
            setFormError("sub_department is required.");
            setFormMessage("");
            return;
        }

        if (!selectedScreenName) {
            setFormError("input_screen is required.");
            setFormMessage("");
            return;
        }

        const editingThreshold = editingThresholdId
            ? thresholds.find((item) => getThresholdIdentifier(item) === editingThresholdId) || null
            : null;
        const thresholdItems = [];

        for (const rule of screenRules) {
            const fieldName = rule.fieldName.trim();
            const rawActualValue = rule.actualValue.trim();
            const rawPositiveTolerance = rule.positiveTolerance.trim();
            const rawNegativeTolerance = rule.negativeTolerance.trim();
            const criticality = String(rule.criticality || "").trim();
            const approvalL1Names = normalizeNameList(rule.approvalL1);
            const approvalL2Names = normalizeNameList(rule.approvalL2);
            const approvalL1Users = resolveSelectedUsers(users, approvalL1Names);
            const approvalL2Users = resolveSelectedUsers(users, approvalL2Names);
            const approvalL1Ids = approvalL1Users
                .map((userItem) => String(userItem?.employeeId || userItem?.id || "").trim())
                .filter(Boolean);
            const approvalL2Ids = approvalL2Users
                .map((userItem) => String(userItem?.employeeId || userItem?.id || "").trim())
                .filter(Boolean);
            const primaryApprovalL1Name = approvalL1Names[0] || "";
            const primaryApprovalL2Name = approvalL2Names[0] || "";
            const primaryApprovalL1Id = approvalL1Ids[0] || "";
            const primaryApprovalL2Id = approvalL2Ids[0] || "";

            const staleApprovalL1Names = approvalL1Names.filter(
                (name) => !resolveSelectedUsers(users, [name]).length
            );
            const staleApprovalL2Names = approvalL2Names.filter(
                (name) => !resolveSelectedUsers(users, [name]).length
            );

            if (
                !fieldName ||
                !rawActualValue ||
                (!rawPositiveTolerance && !rawNegativeTolerance) ||
                !criticality ||
                !approvalL1Names.length ||
                !approvalL2Names.length ||
                staleApprovalL1Names.length ||
                staleApprovalL2Names.length
            ) {
                const missingFields = [];

                if (!fieldName) {
                    missingFields.push("input_field");
                }

                if (!rawActualValue) {
                    missingFields.push("actual_value");
                }

                if (!rawPositiveTolerance && !rawNegativeTolerance) {
                    missingFields.push("plus_or_minus_value");
                }

                if (!criticality) {
                    missingFields.push("criticality");
                }

                if (!approvalL1Names.length) {
                    missingFields.push("approval_l1");
                } else if (staleApprovalL1Names.length) {
                    missingFields.push(
                        `approval_l1 (${staleApprovalL1Names.join(", ")} no longer exists — please re-select)`
                    );
                }

                if (!approvalL2Names.length) {
                    missingFields.push("approval_l2");
                } else if (staleApprovalL2Names.length) {
                    missingFields.push(
                        `approval_l2 (${staleApprovalL2Names.join(", ")} no longer exists — please re-select)`
                    );
                }

                setFormError(`${missingFields.join(", ")} are required.`);
                setFormMessage("");
                return;
            }

            const isPercentMode = rule.valueMode === "percent";
            const numericActualValue = Number(rawActualValue);
            const rawNumericPositiveTolerance = Number(rawPositiveTolerance);
            const rawNumericNegativeTolerance = Number(rawNegativeTolerance);

            const roundToTwo = (value) => Number(value.toFixed(2));

            const numericPositiveTolerance =
                isPercentMode &&
                rawPositiveTolerance !== "" &&
                Number.isFinite(numericActualValue) &&
                Number.isFinite(rawNumericPositiveTolerance)
                    ? roundToTwo(numericActualValue * (rawNumericPositiveTolerance / 100))
                    : rawNumericPositiveTolerance;
            const numericNegativeTolerance =
                isPercentMode &&
                rawNegativeTolerance !== "" &&
                Number.isFinite(numericActualValue) &&
                Number.isFinite(rawNumericNegativeTolerance)
                    ? roundToTwo(numericActualValue * (rawNumericNegativeTolerance / 100))
                    : rawNumericNegativeTolerance;

            thresholdItems.push({
                department: selectedDepartment.name,
                sub_department: selectedSubDepartment.name,
                input_screen: selectedScreenName,
                input_field: fieldName,
                management_field: selectedDepartment.name,
                erp_product_code: selectedSubDepartment.name,
                machine_name: selectedScreenName,
                parameter_name: fieldName,
                criticality,
                severity: criticality,
                priority: criticality,
                approval_l1: primaryApprovalL1Id || primaryApprovalL1Name,
                approval_l1_name: primaryApprovalL1Name,
                approval_l1_user_id: primaryApprovalL1Id || null,
                approval_l1_names: approvalL1Names,
                approval_l1_ids: approvalL1Ids,
                l1_tat_hours: tatValueToHours(rule.approvalL1Tat),
                approval_l2: primaryApprovalL2Id || primaryApprovalL2Name,
                approval_l2_name: primaryApprovalL2Name,
                approval_l2_user_id: primaryApprovalL2Id || null,
                approval_l2_names: approvalL2Names,
                approval_l2_ids: approvalL2Ids,
                l2_tat_hours: tatValueToHours(rule.approvalL2Tat),
                comparison_operator: rule.comparison,
                condition_level: rule.comparison,
                actual_value:
                    rawActualValue !== "" && Number.isFinite(numericActualValue)
                        ? numericActualValue
                        : rawActualValue,
                plus_threshold:
                    rawPositiveTolerance !== "" && Number.isFinite(numericPositiveTolerance)
                        ? numericPositiveTolerance
                        : rawPositiveTolerance,
                minus_threshold:
                    rawNegativeTolerance !== "" && Number.isFinite(numericNegativeTolerance)
                        ? numericNegativeTolerance
                        : rawNegativeTolerance,
                positive_tolerance:
                    rawPositiveTolerance !== "" && Number.isFinite(numericPositiveTolerance)
                        ? numericPositiveTolerance
                        : rawPositiveTolerance,
                negative_tolerance:
                    rawNegativeTolerance !== "" && Number.isFinite(numericNegativeTolerance)
                        ? numericNegativeTolerance
                        : rawNegativeTolerance,
                value_mode: rule.valueMode || "number",
                positive_tolerance_percent: isPercentMode ? rawPositiveTolerance : "",
                negative_tolerance_percent: isPercentMode ? rawNegativeTolerance : "",
                min_allowed_value:
                    rawActualValue !== "" &&
                    rawNegativeTolerance !== "" &&
                    Number.isFinite(numericActualValue) &&
                    Number.isFinite(numericNegativeTolerance)
                        ? numericActualValue - numericNegativeTolerance
                        : undefined,
                max_allowed_value:
                    rawActualValue !== "" &&
                    rawPositiveTolerance !== "" &&
                    Number.isFinite(numericActualValue) &&
                    Number.isFinite(numericPositiveTolerance)
                        ? numericActualValue + numericPositiveTolerance
                        : undefined,
                is_active: editingThreshold?.is_active ?? true,
            });
        }

        thresholdItems.forEach(rememberPercentMode);

        setSubmitting(true);
        setFormError("");
        setFormMessage("");

        try {
            if (editingThresholdId) {
                const existingThreshold = editingThreshold;

                if (!existingThreshold) {
                    throw new Error("Unable to find the selected threshold for editing.");
                }

                const updatedThreshold = await updateThresholdAPI(existingThreshold, thresholdItems[0]);
                setThresholds((current) =>
                    current.map((item) =>
                        getThresholdIdentifier(item) === editingThresholdId
                            ? { ...item, ...updatedThreshold, ...thresholdItems[0] }
                            : item
                    )
                );
                setFormMessage("Threshold updated successfully.");
            } else {
                await saveThresholdsBulkAPI({
                    thresholds: thresholdItems,
                });
                setFormMessage("Threshold values saved successfully.");
            }

            setExistingMessage("");
            setExistingError("");
            setExistingFilters((current) => ({
                ...current,
                departmentSlug: selectedDepartmentSlug,
                subDepartmentSlug: selectedSubDepartmentSlug,
                screenName: selectedScreenName,
                status: "",
            }));
            setActiveTab("existing");
            resetForm();
            await loadThresholds();
        } catch (error) {
            setFormError(error?.response?.data?.message || error?.message || "Unable to save threshold values.");
        } finally {
            setSubmitting(false);
        }
    };

    if (!isHydrated || !canAccessPage) {
        return null;
    }

    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <div className={styles.intro}>
                    <h1>Threshold values</h1>
                    <p>Add and edit the threshold value</p>
                </div>

                <div className={styles.tabBar} role="tablist" aria-label="Threshold views">
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
                    <>
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

                        <form className={styles.stack} onSubmit={handleSubmit}>
                            <section className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <h2>Add Threshold Value</h2>
                                </div>

                                <div className={styles.formGrid}>
                                    <label className={styles.field}>
                                        <span>Department</span>
                                        <select
                                            value={selectedDepartmentSlug}
                                            onChange={(event) => {
                                                setSelectedDepartmentSlug(event.target.value);
                                                setSelectedSubDepartmentSlug("");
                                                setSelectedScreenName("");
                                                setScreenRules([createRule()]);
                                                setFormMessage("");
                                                setFormError("");
                                            }}
                                        >
                                            <option value="">Select Department</option>
                                            {availableDepartments.map((department) => (
                                                <option key={department.slug} value={department.slug}>
                                                    {department.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>

                                    <label className={styles.field}>
                                        <span>Sub Departments</span>
                                        <select
                                            value={selectedSubDepartmentSlug}
                                            onChange={(event) => {
                                                setSelectedSubDepartmentSlug(event.target.value);
                                                setSelectedScreenName("");
                                                setScreenRules([createRule()]);
                                                setFormMessage("");
                                                setFormError("");
                                            }}
                                            disabled={!selectedDepartment}
                                        >
                                            <option value="">Select Sub Department</option>
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
                                            value={selectedScreenName}
                                            onChange={(event) => {
                                                setSelectedScreenName(event.target.value);
                                                setScreenRules([createRule()]);
                                                setFormMessage("");
                                                setFormError("");
                                            }}
                                            disabled={!selectedSubDepartment}
                                        >
                                            <option value="">Select Notebook Type</option>
                                            {availableScreens.map((screenName) => (
                                                <option key={screenName} value={screenName}>
                                                    {screenName}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                            </section>

                            <section className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <h2>{selectedScreenName || "Notebook Threshold Entry"}</h2>
                                    <p>Add threshold for this Notebook</p>
                                </div>

                                <div className={styles.rulesTable}>
                                    {screenRules.map((rule, index) => (
                                        <div key={rule.id} className={styles.ruleCard}>
                                            <div className={styles.ruleRow}>
                                                <div className={styles.ruleFields}>
                                                    <div className={styles.ruleTopGrid}>
                                                        <label className={styles.field}>
                                                            <span>Input Field Name</span>
                                                            <select
                                                                value={rule.fieldName}
                                                                onChange={(event) =>
                                                                    handleRuleChange(rule.id, "fieldName", event.target.value)
                                                                }
                                                            >
                                                                <option value="">Select Field</option>
                                                                {fieldOptions.map((fieldOption) => (
                                                                    <option key={fieldOption} value={fieldOption}>
                                                                        {fieldOption}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </label>

                                                        <label className={styles.field}>
                                                            <span>Criticality</span>
                                                            <select
                                                                value={rule.criticality}
                                                                onChange={(event) =>
                                                                    handleRuleChange(rule.id, "criticality", event.target.value)
                                                                }
                                                            >
                                                                <option value="">Select Criticality</option>
                                                                <option value="Low">Low</option>
                                                                <option value="Medium">Medium</option>
                                                                <option value="High">High</option>
                                                            </select>
                                                        </label>
                                                    </div>

                                                    <div className={styles.ruleTopGrid}>
                                                        <label className={styles.field}>
                                                            <span>L1</span>
                                                            <MultiSelectDropdown
                                                                values={rule.approvalL1}
                                                                options={l1Options}
                                                                disabled={!l1Options.length}
                                                                placeholder={l1Options.length ? "Select" : "No L1 users available"}
                                                                onChange={(nextValues) =>
                                                                    handleRuleChange(rule.id, "approvalL1", nextValues)
                                                                }
                                                            />
                                                        </label>

                                                        <label className={styles.field}>
                                                            <span>TAT</span>
                                                            <TatTimePicker
                                                                label="L1 TAT"
                                                                value={rule.approvalL1Tat}
                                                                onChange={(nextValue) =>
                                                                    handleRuleChange(rule.id, "approvalL1Tat", nextValue)
                                                                }
                                                            />
                                                        </label>

                                                        <label className={styles.field}>
                                                            <span>L2</span>
                                                            <MultiSelectDropdown
                                                                values={rule.approvalL2}
                                                                options={l2Options}
                                                                disabled={!l2Options.length}
                                                                placeholder={l2Options.length ? "Select" : "No L2 users available"}
                                                                onChange={(nextValues) =>
                                                                    handleRuleChange(rule.id, "approvalL2", nextValues)
                                                                }
                                                                emptyLabel="No L2 users available"
                                                            />
                                                        </label>

                                                        <label className={styles.field}>
                                                            <span>TAT</span>
                                                            <TatTimePicker
                                                                label="L2 TAT"
                                                                value={rule.approvalL2Tat}
                                                                onChange={(nextValue) =>
                                                                    handleRuleChange(rule.id, "approvalL2Tat", nextValue)
                                                                }
                                                            />
                                                        </label>
                                                    </div>

                                                    <div className={styles.ruleBottomGrid}>
                                                        <label className={styles.field}>
                                                            <span>Idle Value</span>
                                                            <span className={styles.actualValueRow}>
                                                                <input
                                                                    className={styles.actualValueInput}
                                                                    value={rule.actualValue}
                                                                    onChange={(event) =>
                                                                        handleRuleChange(rule.id, "actualValue", event.target.value)
                                                                    }
                                                                    placeholder="Enter Idle value"
                                                                />
                                                                <span className={styles.valueModeGroup} role="radiogroup" aria-label="Value type">
                                                                    <label className={styles.valueModeOption}>
                                                                        <input
                                                                            type="radio"
                                                                            name={`value-mode-${rule.id}`}
                                                                            checked={(rule.valueMode || "number") === "number"}
                                                                            onChange={() =>
                                                                                handleRuleChange(rule.id, "valueMode", "number")
                                                                            }
                                                                        />
                                                                        Numbers
                                                                    </label>
                                                                    <label className={styles.valueModeOption}>
                                                                        <input
                                                                            type="radio"
                                                                            name={`value-mode-${rule.id}`}
                                                                            checked={rule.valueMode === "percent"}
                                                                            onChange={() =>
                                                                                handleRuleChange(rule.id, "valueMode", "percent")
                                                                            }
                                                                        />
                                                                        Percentage
                                                                    </label>
                                                                </span>
                                                            </span>
                                                        </label>

                                                        <label className={styles.field}>
                                                            <span>Plus (+){rule.valueMode === "percent" ? " %" : ""}</span>
                                                            <input
                                                                value={rule.positiveTolerance}
                                                                onChange={(event) =>
                                                                    handleRuleChange(rule.id, "positiveTolerance", event.target.value)
                                                                }
                                                                placeholder={
                                                                    rule.valueMode === "percent"
                                                                        ? "Enter + % (e.g. 5)"
                                                                        : "Enter + tolerance"
                                                                }
                                                            />
                                                        </label>

                                                        <label className={styles.field}>
                                                            <span>Minus (-){rule.valueMode === "percent" ? " %" : ""} (optional)</span>
                                                            <input
                                                                value={rule.negativeTolerance}
                                                                onChange={(event) =>
                                                                    handleRuleChange(rule.id, "negativeTolerance", event.target.value)
                                                                }
                                                                placeholder={
                                                                    rule.valueMode === "percent"
                                                                        ? "Enter - % (e.g. 5)"
                                                                        : "Enter - tolerance"
                                                                }
                                                            />
                                                        </label>

                                                        <div className={styles.ruleActions}>
                                                            {index === screenRules.length - 1 ? (
                                                                <button
                                                                    type="button"
                                                                    className={styles.addIconButton}
                                                                    onClick={addRule}
                                                                    aria-label="Add threshold row"
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
                                                                aria-label="Delete threshold row"
                                                            >
                                                                <FiTrash2 />
                                                            </button>
                                                        </div>
                                                    </div>
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
                                            onClick={resetForm}
                                            disabled={submitting}
                                        >
                                            Clear
                                        </button>
                                        <button
                                            type="submit"
                                            className={styles.saveButton}
                                            disabled={submitting}
                                        >
                                            {submitting ? "Saving..." : "Save Threshold"}
                                        </button>
                                    </div>
                                </div>

                                {formMessage ? <p className={styles.successMessage}>{formMessage}</p> : null}
                                {formError ? <p className={styles.errorMessage}>{formError}</p> : null}
                            </section>
                        </form>
                    </>
                ) : (
                    <div className={styles.stack}>
                        <section className={styles.existingFilterPanel}>
                            <label className={styles.field}>
                                <span>Department</span>
                                <select
                                    value={existingFilters.departmentSlug}
                                    onChange={(event) => {
                                        const nextDepartmentSlug = event.target.value;
                                        const nextDepartment = availableDepartments.find(
                                            (item) => item.slug === nextDepartmentSlug
                                        );

                                        setExistingFilters((current) => ({
                                            ...current,
                                            departmentSlug: nextDepartmentSlug,
                                            subDepartmentSlug: "",
                                            screenName: "",
                                        }));
                                    }}
                                >
                                    <option value="">Select Department</option>
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
                                    value={existingFilters.subDepartmentSlug}
                                    onChange={(event) => {
                                        const nextSubDepartmentSlug = event.target.value;

                                        setExistingFilters((current) => ({
                                            ...current,
                                            subDepartmentSlug: nextSubDepartmentSlug,
                                            screenName: "",
                                        }));
                                    }}
                                    disabled={!existingFilters.departmentSlug}
                                >
                                    <option value="">Select Sub Department</option>
                                    {existingSubDepartments.map((subDepartment) => (
                                        <option key={subDepartment.slug} value={subDepartment.slug}>
                                            {subDepartment.name}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className={styles.field}>
                                <span>Notebook Type</span>
                                <select
                                    value={existingFilters.screenName}
                                    onChange={(event) =>
                                        setExistingFilters((current) => ({
                                            ...current,
                                            screenName: event.target.value,
                                        }))
                                    }
                                    disabled={!existingFilters.subDepartmentSlug}
                                >
                                    <option value="">Select Notebook Type</option>
                                    {existingScreens.map((screenName) => (
                                        <option key={screenName} value={screenName}>
                                            {screenName}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className={styles.field}>
                                <span>Status</span>
                                <select
                                    value={existingFilters.status}
                                    onChange={(event) =>
                                        setExistingFilters((current) => ({
                                            ...current,
                                            status: event.target.value,
                                        }))
                                    }
                                >
                                    <option value="">All</option>
                                    <option value="true">Active</option>
                                    <option value="false">Inactive</option>
                                </select>
                            </label>

                            <button
                                type="button"
                                className={styles.clearFilterButton}
                                onClick={() => setExistingFilters(buildInitialFilters())}
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
                                    <strong>{existingSubDepartment?.name || "-"}</strong>
                                </article>
                                <article className={styles.summaryCard}>
                                    <span>Notebook Type</span>
                                    <strong>{existingFilters.screenName || "-"}</strong>
                                </article>
                            </div>

                            {loading ? (
                                <div className={styles.emptyState}>Loading threshold values...</div>
                            ) : loadError ? (
                                <div className={styles.emptyState}>
                                    <p className={styles.errorMessage}>{loadError}</p>
                                </div>
                            ) : filteredThresholds.length === 0 ? (
                                <div className={styles.emptyState}>No threshold values found for the current filters.</div>
                            ) : (
                                <div className={styles.tableWrap}>
                                    <table className={`${styles.table} ${styles.existingThresholdTable}`}>
                                        <thead>
                                            <tr>
                                                <th>Sub Department</th>
                                                <th>Input Field</th>
                                                <th>Notebook Type</th>
                                                <th>L1</th>
                                                <th>L2</th>
                                                <th>Criticality</th>
                                                <th>Idle Value</th>
                                                <th>Plus (+)</th>
                                                <th>Minus (-)</th>
                                                <th>Status</th>
                                                <th>Created At</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {visibleThresholdRows.map((item, index) => {
                                                const rowKey = getThresholdRowKey(item, existingPageStart + index);
                                                const isMenuOpen = openActionMenuId === rowKey;
                                                const isStatusUpdating = statusUpdatingRowKey === rowKey;
                                                const isDeleting = deletingRowKey === rowKey;
                                                const criticalityLabel = getCriticalityLabel(item);
                                                const notebookTypes = normalizeNameList(
                                                    item?.input_screen || item?.machine_name
                                                );
                                                const approvalL1Names = normalizeNameList(
                                                    item?.approval_l1_names || item?.approval_l1_name || item?.approval_l1
                                                );
                                                const approvalL2Names = normalizeNameList(
                                                    item?.approval_l2_names || item?.approval_l2_name || item?.approval_l2
                                                );
                                                return (
                                                <tr key={rowKey}>
                                                    <td>{item.sub_department || item.erp_product_code || "-"}</td>
                                                    <td>{item.input_field || item.parameter_name || "-"}</td>
                                                    <td>
                                                        <ExpandableCell values={notebookTypes} />
                                                    </td>
                                                    <td>
                                                        <ExpandableCell values={approvalL1Names} />
                                                    </td>
                                                    <td>
                                                        <ExpandableCell values={approvalL2Names} />
                                                    </td>
                                                    <td>
                                                        <span
                                                            className={`${styles.criticalityBadge} ${
                                                                criticalityLabel === "High"
                                                                    ? styles.criticalityHigh
                                                                    : criticalityLabel === "Medium"
                                                                        ? styles.criticalityMedium
                                                                        : styles.criticalityLow
                                                            }`}
                                                        >
                                                            {criticalityLabel}
                                                        </span>
                                                    </td>
                                                    <td>{item.actual_value ?? "-"}</td>
                                                    <td className={styles.positiveValue}>
                                                        {formatToleranceDisplay(
                                                            item,
                                                            item.plus_threshold ?? item.positive_tolerance,
                                                            item.positive_tolerance_percent
                                                        )}
                                                    </td>
                                                    <td className={styles.negativeValue}>
                                                        {formatToleranceDisplay(
                                                            item,
                                                            item.minus_threshold ?? item.negative_tolerance,
                                                            item.negative_tolerance_percent
                                                        )}
                                                    </td>
                                                    <td>
                                                        <span
                                                            className={`${styles.statusBadge} ${item?.is_active ? styles.activeStatus : styles.inactiveStatus}`}
                                                        >
                                                            {item?.is_active ? "Active" : "Inactive"}
                                                        </span>
                                                    </td>
                                                    <td>{formatTimestamp(item.created_at || item.createdAt)}</td>
                                                    <td>
                                                        <div className={styles.actionMenuWrap} data-threshold-menu="true">
                                                            <button
                                                                type="button"
                                                                className={styles.actionMenuButton}
                                                                aria-label="Open threshold actions"
                                                                onClick={() =>
                                                                    setOpenActionMenuId((current) =>
                                                                        current === rowKey ? "" : rowKey
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
                                                                        onClick={() => openEditThreshold(item)}
                                                                        disabled={isDeleting || isStatusUpdating}
                                                                    >
                                                                        Edit
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className={styles.actionMenuItem}
                                                                        onClick={() => toggleThresholdStatus(rowKey)}
                                                                        disabled={isStatusUpdating}
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
                                                                        onClick={() => deleteThresholdRow(rowKey)}
                                                                        disabled={isDeleting || isStatusUpdating}
                                                                    >
                                                                        {isDeleting ? "Deleting..." : "Delete"}
                                                                    </button>
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )})}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {existingMessage ? <p className={styles.successMessage}>{existingMessage}</p> : null}
                            {existingError ? <p className={styles.errorMessage}>{existingError}</p> : null}

                            {!loading && !loadError && filteredThresholds.length > 0 ? (
                                <div className={styles.paginationBar}>
                                    <div className={styles.paginationControls}>
                                        <button
                                            type="button"
                                            className={styles.paginationButton}
                                            onClick={() => setExistingPage(1)}
                                            disabled={safeExistingPage === 1}
                                            aria-label="First page"
                                        >
                                            <FiChevronLeft />
                                            <FiChevronLeft className={styles.doubleChevron} />
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.paginationButton}
                                            onClick={() => setExistingPage((value) => Math.max(1, value - 1))}
                                            disabled={safeExistingPage === 1}
                                            aria-label="Previous page"
                                        >
                                            <FiChevronLeft />
                                        </button>
                                        {Array.from({ length: totalExistingPages }, (_, index) => index + 1).map((pageNumber) => (
                                            <button
                                                key={pageNumber}
                                                type="button"
                                                className={`${styles.paginationNumber} ${pageNumber === safeExistingPage ? styles.paginationNumberActive : ""}`}
                                                onClick={() => setExistingPage(pageNumber)}
                                            >
                                                {pageNumber}
                                            </button>
                                        ))}
                                        <button
                                            type="button"
                                            className={styles.paginationButton}
                                            onClick={() => setExistingPage((value) => Math.min(totalExistingPages, value + 1))}
                                            disabled={safeExistingPage === totalExistingPages}
                                            aria-label="Next page"
                                        >
                                            <FiChevronRight />
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.paginationButton}
                                            onClick={() => setExistingPage(totalExistingPages)}
                                            disabled={safeExistingPage === totalExistingPages}
                                            aria-label="Last page"
                                        >
                                            <FiChevronRight />
                                            <FiChevronRight className={styles.doubleChevron} />
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
}

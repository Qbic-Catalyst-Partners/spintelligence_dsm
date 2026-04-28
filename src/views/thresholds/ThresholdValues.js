import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import { FiPlus, FiRefreshCw, FiSearch, FiTrash2 } from "react-icons/fi";
import { HiMiniChevronDown } from "react-icons/hi2";
import { MdOutlineTune } from "react-icons/md";

import { fetchThresholdsAPI, saveThresholdsBulkAPI } from "@/apis/thresholdsApi";
import { isFullAccessUser } from "@/utils/accessControl";
import { departmentDirectory } from "@/views/departments/data";
import { getThresholdFieldsForScreen } from "@/views/thresholds/fieldCatalog";
import { getThresholdScreensForSubDepartment } from "@/views/thresholds/screenCatalog";
import styles from "@/styles/ThresholdValues.module.css";

const ROWS_PER_PAGE = 8;
const createRule = () => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fieldName: "",
    comparison: "more_and_less_than",
    actualValue: "",
    positiveTolerance: "",
    negativeTolerance: "",
});

const formatTimestamp = (value) => {
    if (!value) {
        return "-";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return "-";
    }

    return parsed.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};

export default function ThresholdValues() {
    const router = useRouter();
    const user = useSelector((state) => state.auth?.user);
    const isHydrated = useSelector((state) => state.auth?.isHydrated);
    const canAccessPage = isFullAccessUser(user);

    const [thresholds, setThresholds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [page, setPage] = useState(1);
    const [selectedDepartmentSlug, setSelectedDepartmentSlug] = useState("");
    const [selectedSubDepartmentSlug, setSelectedSubDepartmentSlug] = useState("");
    const [selectedScreenNames, setSelectedScreenNames] = useState([]);
    const [screenRules, setScreenRules] = useState({});
    const [formStatus, setFormStatus] = useState("true");
    const [submitting, setSubmitting] = useState(false);
    const [formMessage, setFormMessage] = useState("");
    const [formError, setFormError] = useState("");

    const loadThresholds = async ({ silent = false } = {}) => {
        if (!canAccessPage) {
            return;
        }

        if (silent) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        try {
            const data = await fetchThresholdsAPI();
            setThresholds(data);
        } finally {
            setLoading(false);
            setRefreshing(false);
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

    const filteredThresholds = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();

        return thresholds.filter((item) => {
            const matchesStatus =
                statusFilter === "" ||
                String(item?.is_active) === statusFilter;

            if (!normalizedSearch) {
                return matchesStatus;
            }

            const haystack = [
                item?.department || item?.management_field,
                item?.sub_department || item?.erp_product_code,
                item?.input_screen || item?.machine_name,
                item?.input_field || item?.parameter_name,
                item?.actual_value,
                item?.plus_threshold || item?.positive_tolerance,
                item?.minus_threshold || item?.negative_tolerance,
            ]
                .map((value) => String(value || "").toLowerCase())
                .join(" ");

            return matchesStatus && haystack.includes(normalizedSearch);
        });
    }, [searchTerm, statusFilter, thresholds]);

    useEffect(() => {
        setPage(1);
    }, [searchTerm, statusFilter]);

    const availableDepartments = departmentDirectory;
    const selectedDepartment =
        availableDepartments.find((item) => item.slug === selectedDepartmentSlug) || null;
    const availableSubDepartments = selectedDepartment?.subDepartments || [];
    const selectedSubDepartment =
        availableSubDepartments.find((item) => item.slug === selectedSubDepartmentSlug) || null;
    const availableScreens = selectedDepartmentSlug && selectedSubDepartmentSlug
        ? getThresholdScreensForSubDepartment(selectedDepartmentSlug, selectedSubDepartmentSlug)
        : [];
    const fieldOptionsByScreen = useMemo(() => {
        const grouped = {};

        thresholds.forEach((item) => {
            const screenName = item?.input_screen || item?.machine_name;
            const fieldName = item?.input_field || item?.parameter_name;

            if (!screenName || !fieldName) {
                return;
            }

            if (!grouped[screenName]) {
                grouped[screenName] = new Set();
            }

            grouped[screenName].add(fieldName);
        });

        selectedScreenNames.forEach((screenName) => {
            const mappedFields = getThresholdFieldsForScreen(screenName);
            if (mappedFields.length) {
                grouped[screenName] = new Set(mappedFields);
            } else if (grouped[screenName]) {
                grouped[screenName] = new Set(Array.from(grouped[screenName]));
            } else {
                grouped[screenName] = new Set();
            }
        });

        return Object.fromEntries(
            Object.entries(grouped).map(([screenName, values]) => [screenName, Array.from(values).sort()])
        );
    }, [selectedScreenNames, thresholds]);

    useEffect(() => {
        setSelectedSubDepartmentSlug("");
        setSelectedScreenNames([]);
        setScreenRules({});
    }, [selectedDepartmentSlug]);

    useEffect(() => {
        setSelectedScreenNames([]);
        setScreenRules({});
    }, [selectedSubDepartmentSlug]);

    const handleDepartmentChange = (event) => {
        setSelectedDepartmentSlug(event.target.value);
        setFormMessage("");
        setFormError("");
    };

    const handleSubDepartmentChange = (event) => {
        setSelectedSubDepartmentSlug(event.target.value);
        setFormMessage("");
        setFormError("");
    };

    const handleStatusChange = (event) => {
        setFormStatus(event.target.value);
        setFormMessage("");
        setFormError("");
    };

    const handleScreenToggle = (screenName) => {
        setSelectedScreenNames((current) => {
            if (current.includes(screenName)) {
                setScreenRules((existing) => {
                    const next = { ...existing };
                    delete next[screenName];
                    return next;
                });
                return current.filter((item) => item !== screenName);
            }

            setScreenRules((existing) => ({
                ...existing,
                [screenName]: existing[screenName]?.length ? existing[screenName] : [createRule()],
            }));
            return [...current, screenName];
        });
        setFormMessage("");
        setFormError("");
    };

    const addRuleForScreen = (screenName) => {
        setScreenRules((current) => ({
            ...current,
            [screenName]: [...(current[screenName] || []), createRule()],
        }));
    };

    const removeRuleForScreen = (screenName, ruleId) => {
        setScreenRules((current) => {
            const nextRules = (current[screenName] || []).filter((rule) => rule.id !== ruleId);
            return {
                ...current,
                [screenName]: nextRules.length ? nextRules : [createRule()],
            };
        });
    };

    const handleRuleChange = (screenName, ruleId, field, value) => {
        setScreenRules((current) => ({
            ...current,
            [screenName]: (current[screenName] || []).map((rule) =>
                rule.id === ruleId ? { ...rule, [field]: value } : rule
            ),
        }));
        setFormMessage("");
        setFormError("");
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        const missingFields = [];

        if (!selectedDepartment) {
            missingFields.push("department");
        }

        if (!selectedSubDepartment) {
            missingFields.push("sub_department");
        }

        if (!selectedScreenNames.length) {
            missingFields.push("input_screen");
        }

        if (missingFields.length) {
            setFormError(`${missingFields.join(", ")} are required.`);
            setFormMessage("");
            return;
        }

        const thresholdItems = [];

        for (const screenName of selectedScreenNames) {
            const rules = screenRules[screenName] || [];
            for (const rule of rules) {
                const fieldName = rule.fieldName.trim();
                const rawActualValue = rule.actualValue.trim();
                const rawPositiveTolerance = rule.positiveTolerance.trim();
                const rawNegativeTolerance = rule.negativeTolerance.trim();

                if (!screenName || !fieldName || !rawActualValue) {
                    const rowMissingFields = [];

                    if (!fieldName) {
                        rowMissingFields.push("input_field");
                    }

                    if (!rawActualValue) {
                        rowMissingFields.push("actual_value");
                    }

                    if (!rawPositiveTolerance && !rawNegativeTolerance) {
                        rowMissingFields.push("plus_or_minus_value");
                    }

                    setFormError(`${rowMissingFields.join(", ")} are required.`);
                    setFormMessage("");
                    return;
                }

                const numericActualValue = Number(rawActualValue);
                const numericPositiveTolerance = Number(rawPositiveTolerance);
                const numericNegativeTolerance = Number(rawNegativeTolerance);
                thresholdItems.push({
                    department: selectedDepartment.name,
                    sub_department: selectedSubDepartment.name,
                    input_screen: screenName,
                    input_field: fieldName,
                    management_field: selectedDepartment.name,
                    erp_product_code: selectedSubDepartment.name,
                    machine_name: screenName,
                    parameter_name: fieldName,
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
                    is_active: formStatus === "true",
                });
            }
        }

        setSubmitting(true);
        setFormError("");
        setFormMessage("");

        try {
            await saveThresholdsBulkAPI({
                thresholds: thresholdItems,
            });

            setSelectedDepartmentSlug("");
            setSelectedSubDepartmentSlug("");
            setSelectedScreenNames([]);
            setScreenRules({});
            setFormStatus("true");
            setFormMessage("Threshold values saved successfully.");
            await loadThresholds({ silent: true });
        } catch (error) {
            setFormError(error?.response?.data?.message || error?.message || "Unable to save threshold values.");
        } finally {
            setSubmitting(false);
        }
    };

    const totalThresholds = thresholds.length;
    const activeThresholds = thresholds.filter((item) => item?.is_active).length;
    const inactiveThresholds = totalThresholds - activeThresholds;
    const totalPages = Math.max(1, Math.ceil(filteredThresholds.length / ROWS_PER_PAGE));
    const currentPage = Math.min(page, totalPages);
    const pageStart = (currentPage - 1) * ROWS_PER_PAGE;
    const currentRows = filteredThresholds.slice(pageStart, pageStart + ROWS_PER_PAGE);

    if (!isHydrated || !canAccessPage) {
        return null;
    }

    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <div className={styles.header}>
                    <div>
                        <p className={styles.eyebrow}>Admin Control</p>
                        <h1>Threshold Values</h1>
                        <p className={styles.subtitle}>
                            Review threshold master values used for operator ticket validation.
                        </p>
                    </div>

                    <button
                        type="button"
                        className={styles.refreshButton}
                        onClick={() => loadThresholds({ silent: true })}
                        disabled={refreshing}
                    >
                        <FiRefreshCw className={refreshing ? styles.spinning : ""} />
                        {refreshing ? "Refreshing..." : "Refresh"}
                    </button>
                </div>

                <div className={styles.statsGrid}>
                    <article className={styles.statCard}>
                        <span>Total Records</span>
                        <strong>{totalThresholds}</strong>
                    </article>
                    <article className={styles.statCard}>
                        <span>Active Thresholds</span>
                        <strong>{activeThresholds}</strong>
                    </article>
                    <article className={styles.statCard}>
                        <span>Inactive Thresholds</span>
                        <strong>{inactiveThresholds}</strong>
                    </article>
                </div>

                <section className={styles.formCard}>
                    <div className={styles.sectionHeading}>
                        <div>
                            <h2>Add Threshold Value</h2>
                            <p>Select a department flow, choose input screens, and add field-level threshold rules.</p>
                        </div>
                    </div>

                    <form className={styles.formGrid} onSubmit={handleSubmit}>
                        <label className={styles.field}>
                            <span>Department</span>
                            <select value={selectedDepartmentSlug} onChange={handleDepartmentChange}>
                                <option value="">Select department</option>
                                {availableDepartments.map((department) => (
                                    <option key={department.slug} value={department.slug}>
                                        {department.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className={styles.field}>
                            <span>Sub-Department</span>
                            <select
                                value={selectedSubDepartmentSlug}
                                onChange={handleSubDepartmentChange}
                                disabled={!selectedDepartment}
                            >
                                <option value="">Select sub-department</option>
                                {availableSubDepartments.map((subDepartment) => (
                                    <option key={subDepartment.slug} value={subDepartment.slug}>
                                        {subDepartment.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className={styles.field}>
                            <span>Status</span>
                            <select value={formStatus} onChange={handleStatusChange}>
                                <option value="true">Active</option>
                                <option value="false">Inactive</option>
                            </select>
                        </label>

                        <div className={styles.multiSelectSection}>
                            <div className={styles.multiSelectHeader}>
                                <span>Input Screens</span>
                                <p>Select one or more screens for this sub-department.</p>
                            </div>

                            {selectedSubDepartment ? (
                                availableScreens.length ? (
                                    <div className={styles.screenGrid}>
                                        {availableScreens.map((screenName) => (
                                            <label key={screenName} className={styles.screenOption}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedScreenNames.includes(screenName)}
                                                    onChange={() => handleScreenToggle(screenName)}
                                                />
                                                <span>{screenName}</span>
                                            </label>
                                        ))}
                                    </div>
                                ) : (
                                    <div className={styles.emptyInlineState}>
                                        No input screen catalog is mapped for this sub-department yet.
                                    </div>
                                )
                            ) : (
                                <div className={styles.emptyInlineState}>
                                    Select a sub-department to view its input screens.
                                </div>
                            )}
                        </div>

                        {selectedScreenNames.length ? (
                            <div className={styles.rulesSection}>
                                {selectedScreenNames.map((screenName) => (
                                    <div key={screenName} className={styles.ruleCard}>
                                        <div className={styles.ruleCardHeader}>
                                            <div>
                                                <h3>{screenName}</h3>
                                                <p>Add threshold fields for this input screen.</p>
                                            </div>
                                            <button
                                                type="button"
                                                className={styles.addRuleButton}
                                                onClick={() => addRuleForScreen(screenName)}
                                            >
                                                <FiPlus />
                                                Add Field
                                            </button>
                                        </div>

                                        <div className={styles.ruleRows}>
                                            {!(fieldOptionsByScreen[screenName] || []).length ? (
                                                <div className={styles.emptyInlineState}>
                                                    No field catalog is mapped for this input screen yet.
                                                </div>
                                            ) : null}
                                            {(screenRules[screenName] || []).map((rule) => (
                                                <div key={rule.id} className={styles.ruleRow}>
                                                    <label className={styles.field}>
                                                        <span>Field Name</span>
                                                        <select
                                                            value={rule.fieldName}
                                                            onChange={(event) =>
                                                                handleRuleChange(screenName, rule.id, "fieldName", event.target.value)
                                                            }
                                                        >
                                                            <option value="">Select field</option>
                                                            {(fieldOptionsByScreen[screenName] || []).map((fieldOption) => (
                                                                <option key={fieldOption} value={fieldOption}>
                                                                    {fieldOption}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>

                                                    <label className={styles.field}>
                                                        <span>Actual Value</span>
                                                        <input
                                                            value={rule.actualValue}
                                                            onChange={(event) =>
                                                                handleRuleChange(
                                                                    screenName,
                                                                    rule.id,
                                                                    "actualValue",
                                                                    event.target.value
                                                                )
                                                            }
                                                            placeholder="Enter actual value"
                                                        />
                                                    </label>

                                                    <label className={styles.field}>
                                                        <span>Plus (+)</span>
                                                        <input
                                                            value={rule.positiveTolerance}
                                                            onChange={(event) =>
                                                                handleRuleChange(
                                                                    screenName,
                                                                    rule.id,
                                                                    "positiveTolerance",
                                                                    event.target.value
                                                                )
                                                            }
                                                            placeholder="Enter + tolerance"
                                                        />
                                                    </label>

                                                    <label className={styles.field}>
                                                        <span>Minus (-)</span>
                                                        <input
                                                            value={rule.negativeTolerance}
                                                            onChange={(event) =>
                                                                handleRuleChange(
                                                                    screenName,
                                                                    rule.id,
                                                                    "negativeTolerance",
                                                                    event.target.value
                                                                )
                                                            }
                                                            placeholder="Enter - tolerance"
                                                        />
                                                    </label>

                                                    <button
                                                        type="button"
                                                        className={styles.removeRuleButton}
                                                        onClick={() => removeRuleForScreen(screenName, rule.id)}
                                                        aria-label={`Remove ${screenName} field rule`}
                                                    >
                                                        <FiTrash2 />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        <div className={styles.formActions}>
                            <button
                                type="button"
                                className={styles.secondaryButton}
                                onClick={() => {
                                    setSelectedDepartmentSlug("");
                                    setSelectedSubDepartmentSlug("");
                                    setSelectedScreenNames([]);
                                    setScreenRules({});
                                    setFormStatus("true");
                                    setFormMessage("");
                                    setFormError("");
                                }}
                                disabled={submitting}
                            >
                                Clear
                            </button>
                            <button
                                type="submit"
                                className={styles.primaryButton}
                                disabled={submitting}
                            >
                                {submitting ? "Saving..." : "Save Threshold"}
                            </button>
                        </div>
                    </form>

                    <p className={styles.infoMessage}>
                        Use `Actual Value` with `+ / -` tolerances.
                        Example: actual `140`, `+5`, `-4` means `136` to `145` is allowed.
                    </p>
                    {formMessage ? <p className={styles.successMessage}>{formMessage}</p> : null}
                    {formError ? <p className={styles.errorMessage}>{formError}</p> : null}
                </section>

                <div className={styles.filterBar}>
                    <div className={styles.searchBox}>
                        <FiSearch />
                        <input
                            type="text"
                            placeholder="Search by field, ERP code, machine or parameter"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                        />
                    </div>

                    <div className={styles.selectWrap}>
                        <MdOutlineTune className={styles.selectIcon} />
                        <select
                            value={statusFilter}
                            onChange={(event) => setStatusFilter(event.target.value)}
                        >
                            <option value="">Status: All</option>
                            <option value="true">Status: Active</option>
                            <option value="false">Status: Inactive</option>
                        </select>
                        <HiMiniChevronDown className={styles.selectChevron} />
                    </div>
                </div>

                <div className={styles.tableCard}>
                    {loading ? (
                        <div className={styles.emptyState}>Loading threshold values...</div>
                    ) : currentRows.length === 0 ? (
                        <div className={styles.emptyState}>No threshold values found for the current filters.</div>
                    ) : (
                        <>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Department</th>
                                        <th>Sub-Department</th>
                                        <th>Input Screen</th>
                                        <th>Input Field</th>
                                        <th>Actual Value</th>
                                        <th>Plus (+)</th>
                                        <th>Minus (-)</th>
                                        <th>Created At</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentRows.map((item) => (
                                        <tr key={item.id}>
                                            <td>{item.department || item.management_field || "-"}</td>
                                            <td>{item.sub_department || item.erp_product_code || "-"}</td>
                                            <td>{item.input_screen || item.machine_name || "-"}</td>
                                            <td>{item.input_field || item.parameter_name || "-"}</td>
                                            <td>{item.actual_value ?? "-"}</td>
                                            <td>{item.plus_threshold ?? item.positive_tolerance ?? "-"}</td>
                                            <td>{item.minus_threshold ?? item.negative_tolerance ?? "-"}</td>
                                            <td>{formatTimestamp(item.created_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div className={styles.footer}>
                                <div className={styles.footerMeta}>
                                    Showing {filteredThresholds.length === 0 ? 0 : pageStart + 1} to{" "}
                                    {Math.min(pageStart + ROWS_PER_PAGE, filteredThresholds.length)} of{" "}
                                    {filteredThresholds.length} records
                                </div>

                                <div className={styles.pagination}>
                                    <button
                                        type="button"
                                        onClick={() => setPage((value) => Math.max(value - 1, 1))}
                                        disabled={currentPage === 1}
                                    >
                                        Prev
                                    </button>
                                    <span>{currentPage}</span>
                                    <button
                                        type="button"
                                        onClick={() => setPage((value) => Math.min(value + 1, totalPages))}
                                        disabled={currentPage === totalPages}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}


import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import { FiChevronLeft, FiChevronRight, FiMoreVertical, FiPlus, FiTrash2, FiX } from "react-icons/fi";

import { deleteThresholdAPI, fetchThresholdsAPI, saveThresholdsBulkAPI, updateThresholdAPI, updateThresholdStatusAPI } from "@/apis/thresholdsApi";
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
    positiveTolerance: "",
    negativeTolerance: "",
});

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

export default function ThresholdValues() {
    const router = useRouter();
    const user = useSelector((state) => state.auth?.user);
    const isHydrated = useSelector((state) => state.auth?.isHydrated);
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

    const loadThresholds = async () => {
        if (!canAccessPage) {
            return;
        }

        setLoading(true);

        try {
            const data = await fetchThresholdsAPI();
            setThresholds(data);
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
                positiveTolerance: String(item?.plus_threshold ?? item?.positive_tolerance ?? ""),
                negativeTolerance: String(item?.minus_threshold ?? item?.negative_tolerance ?? ""),
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

            if (!fieldName || !rawActualValue || (!rawPositiveTolerance && !rawNegativeTolerance)) {
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

                setFormError(`${missingFields.join(", ")} are required.`);
                setFormMessage("");
                return;
            }

            const numericActualValue = Number(rawActualValue);
            const numericPositiveTolerance = Number(rawPositiveTolerance);
            const numericNegativeTolerance = Number(rawNegativeTolerance);

            thresholdItems.push({
                department: selectedDepartment.name,
                sub_department: selectedSubDepartment.name,
                input_screen: selectedScreenName,
                input_field: fieldName,
                management_field: selectedDepartment.name,
                erp_product_code: selectedSubDepartment.name,
                machine_name: selectedScreenName,
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
                is_active: editingThreshold?.is_active ?? true,
            });
        }

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
                                <span>Total Thresholds</span>
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
                                    <div className={styles.ruleLabels}>
                                        <span>Input Field Name</span>
                                        <span>Actual Value</span>
                                        <span>Plus (+)</span>
                                        <span>Minus (-)</span>
                                        <span className={styles.ruleActionHeader}>Actions</span>
                                    </div>

                                    {screenRules.map((rule, index) => (
                                        <div key={rule.id} className={styles.ruleRow}>
                                            <label className={styles.field}>
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
                                                <input
                                                    value={rule.actualValue}
                                                    onChange={(event) =>
                                                        handleRuleChange(rule.id, "actualValue", event.target.value)
                                                    }
                                                    placeholder="Enter Actual value"
                                                />
                                            </label>

                                            <label className={styles.field}>
                                                <input
                                                    value={rule.positiveTolerance}
                                                    onChange={(event) =>
                                                        handleRuleChange(rule.id, "positiveTolerance", event.target.value)
                                                    }
                                                    placeholder="Enter + tolerance"
                                                />
                                            </label>

                                            <label className={styles.field}>
                                                <input
                                                    value={rule.negativeTolerance}
                                                    onChange={(event) =>
                                                        handleRuleChange(rule.id, "negativeTolerance", event.target.value)
                                                    }
                                                    placeholder="Enter - tolerance"
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
                        <section className={styles.filterPanel}>
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

                        <section className={styles.card}>
                            <div className={styles.summaryGrid}>
                                <article className={styles.summaryCard}>
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
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                <th>Input Field</th>
                                                <th>Actual Value</th>
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
                                                return (
                                                <tr key={rowKey}>
                                                    <td>{item.input_field || item.parameter_name || "-"}</td>
                                                    <td>{item.actual_value ?? "-"}</td>
                                                    <td className={styles.positiveValue}>
                                                        {item.plus_threshold ?? item.positive_tolerance ?? "-"}
                                                    </td>
                                                    <td className={styles.negativeValue}>
                                                        {item.minus_threshold ?? item.negative_tolerance ?? "-"}
                                                    </td>
                                                    <td>
                                                        <span
                                                            className={`${styles.statusBadge} ${item?.is_active ? styles.activeStatus : styles.inactiveStatus}`}
                                                        >
                                                            {item?.is_active ? "Active" : "Inactive"}
                                                        </span>
                                                    </td>
                                                    <td>{formatTimestamp(item.created_at)}</td>
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
                                    <div className={styles.paginationMeta}>
                                        Showing {existingPageStart + 1} to{" "}
                                        {Math.min(existingPageStart + EXISTING_ROWS_PER_PAGE, filteredThresholds.length)} of{" "}
                                        {filteredThresholds.length}
                                    </div>
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

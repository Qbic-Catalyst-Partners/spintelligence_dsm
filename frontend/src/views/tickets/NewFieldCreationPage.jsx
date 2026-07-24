import { useEffect, useMemo, useRef, useState } from "react";
import { FiCalendar } from "react-icons/fi";
import {
    createNotebookCustomFieldApi,
    fetchNotebookCustomFieldsApi,
    toggleNotebookCustomFieldApi,
} from "@/apis/notebookCustomFieldsApi";
import SuccessModal from "@/components/SuccessModal";
import styles from "@/styles/newFieldCreation.module.css";

// Departments this page groups under. Update this list if the actual set changes.
const DEPARTMENTS = ["Quality Control", "Electrical", "Mechanical"];

// Same 8 sub-departments apply under every department above — placeholder names,
// rename freely here if the real sub-department list differs.
const SUB_DEPARTMENTS = [
    "Mixing",
    "Blow Room",
    "Carding",
    "Comber",
    "Draw Frame",
    "Simplex",
    "Spinning",
    "Autoconer",
    "Individual Card Performance",
    "Process Parameter",
];

// Notebook options keyed by sub-department (same underlying screen names ScreenAccessPanel.jsx
// uses per department) — every department shares this one sub-department -> notebook mapping.
const NOTEBOOKS_BY_SUB_DEPARTMENT = {
    Mixing: [
        "Cotton HVI Data Entry",
        "AFIS Data Entry",
        "AFIS-6 Cotton Data Entry",
        "AFIS-6 MMF Data Entry",
        "Fibre Data Entry",
        "Moisture Data Entry",
        "Openness Data Entry",
    ],
    "Blow Room": [
        "Blow Room Sync",
        "BR Waste Study Entry",
        "Drop Test Data Entry",
        "B/R CV1M Data Entry Within Lap",
        "B/R Between Lap CV%",
    ],
    Carding: [
        "Between & Within Card Data Entry",
        "Thick place & CV",
        "Carding NRE%",
        "Nati Data Entry",
        "U% Data Entry",
        "Card DFK Data",
        "WheelChange",
        "Individual Card Waste Study",
    ],
    "Draw Frame": [
        "1 Yard / Half Yard CV Entry",
        "Draw Frame Cots Data Entry",
        "U% Data Entry",
        "A%",
        "Wheel Change - Type 1 (SB20)",
        "Wheel Change - Type 2 (TD7)",
        "Wheel Change - Type 3 (TD9)",
        "Wheel Change - Type 1 (LRSB)",
        "Wheel Change - Type 2 (D40)",
        "Wheel Change - Type 3 (D50/D55)",
        "Wheel Change - Type 4 (LDF3S)",
    ],
    Simplex: [
        "SMXCots Change Data Entry",
        "SMX Breaks Study Report",
        "U% Data Entry",
        "Wheel Change",
        "Stretch %",
    ],
    Spinning: [
        "COTS Checking",
        "Count Change",
        "Ring Frame Log Book",
        "Speed Checking",
        "Bottom Apron Checking",
        "Lycra out of Centering",
        "RSM & Lycrasensor Checking Online",
        "RSM & Lycrasensor Checking Offline",
        "Wheel Change - Type 1",
        "Wheel Change - Type 2",
        "Wheel Change - Type 3",
    ],
    Autoconer: [
        "Rewinding Study",
        "Cone Density",
        "Cone Packing Audit",
        "Lycra% Checking",
        "Count Wise Cuts Record",
        "Splice Strength",
        "Drum wise Appearance",
        "CSP Parameter Entries",
        "U% Parameter Entries",
    ],
    Comber: [
        "Ribbon Lap CV1M Data Entry",
        "Nati Data Entry",
        "U% Data Entry",
        "Comber Nolis %",
        "Comber NRE%",
        "Comber Efficiency",
    ],
    "Individual Card Performance": [
        "Individual Card Performance Data",
    ],
    "Process Parameter": [
        "Mixing - PP",
        "Blow Room - PP",
        "Carding - PP",
        "Simplex - PP",
        "Spinning - PP",
        "Autoconer - PP",
        "PP - Breaker Drawing",
        "PP - Finisher Drawing",
        "PP - Autoconer Q2",
        "PP - Autoconer Q3",
        "PP - Autoconer Q4",
    ],
};

const FIELD_TYPES = [
    { value: "text", label: "Text" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date" },
    { value: "dropdown", label: "Dropdown" },
    { value: "special", label: "Special Characters" },
];

const DECIMAL_PLACES_OPTIONS = [0, 1, 2, 3, 4, 5, 6];

const FILTER_CASCADE = ["department", "subDepartment", "notebook"];

const formatDate = (value) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const DATE_RANGE_PRESETS = [
    { key: "today", label: "Today" },
    { key: "thisWeek", label: "This Week" },
    { key: "thisMonth", label: "This Month" },
    { key: "thisYear", label: "This Year" },
];

const toInputDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

// Each preset is a "period-to-date" window: the period start through today, not a full
// preceding period — "This Week" means Monday of the current week through today, etc.
const getDateRangeForPreset = (presetKey) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (presetKey) {
        case "today":
            return { from: today, to: today };
        case "thisWeek": {
            const dayOfWeek = (today.getDay() + 6) % 7; // Monday = 0 ... Sunday = 6
            const startOfWeek = new Date(today);
            startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
            return { from: startOfWeek, to: today };
        }
        case "thisMonth": {
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            return { from: startOfMonth, to: today };
        }
        case "thisYear": {
            const startOfYear = new Date(today.getFullYear(), 0, 1);
            return { from: startOfYear, to: today };
        }
        default:
            return null;
    }
};

const NewFieldCreationPage = () => {
    const [activeTab, setActiveTab] = useState("creation");
    const [filters, setFilters] = useState({
        department: "",
        subDepartment: "",
        notebook: "",
        datePreset: "",
        dateFrom: "",
        dateTo: "",
    });
    const dateFromInputRef = useRef(null);
    const dateToInputRef = useRef(null);

    const openDatePicker = (inputRef) => {
        const input = inputRef.current;
        if (!input) return;
        if (typeof input.showPicker === "function") {
            input.showPicker();
        } else {
            input.focus();
        }
    };

    const handleDatePresetChange = (presetKey) => {
        const range = getDateRangeForPreset(presetKey);
        setFilters((current) => ({
            ...current,
            datePreset: presetKey,
            dateFrom: range ? toInputDateString(range.from) : "",
            dateTo: range ? toInputDateString(range.to) : "",
        }));
    };

    const handleCustomDateChange = (field, value) => {
        setFilters((current) => ({ ...current, datePreset: "", [field]: value }));
    };
    const [fieldLabel, setFieldLabel] = useState("");
    const [fieldType, setFieldType] = useState("text");
    const [decimalPlaces, setDecimalPlaces] = useState(2);
    const [dropdownOptions, setDropdownOptions] = useState([""]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState("");
    const [submitSuccess, setSubmitSuccess] = useState("");

    const [existingFields, setExistingFields] = useState([]);
    const [isLoadingExisting, setIsLoadingExisting] = useState(false);
    const [existingError, setExistingError] = useState("");
    const [togglingId, setTogglingId] = useState(null);

    const notebookOptions = useMemo(
        () => NOTEBOOKS_BY_SUB_DEPARTMENT[filters.subDepartment] || [],
        [filters.subDepartment]
    );

    const filteredExistingFields = useMemo(
        () => existingFields.filter((field) =>
            (!filters.dateFrom || new Date(field.created_at || 0) >= new Date(`${filters.dateFrom}T00:00:00`)) &&
            (!filters.dateTo || new Date(field.created_at || 0) <= new Date(`${filters.dateTo}T23:59:59.999`))
        ),
        [existingFields, filters.dateFrom, filters.dateTo]
    );

    const handleFilterChange = (field, value) => {
        setFilters((current) => {
            const next = { ...current, [field]: value };
            FILTER_CASCADE.slice(FILTER_CASCADE.indexOf(field) + 1).forEach((key) => {
                next[key] = "";
            });
            return next;
        });
        setSubmitError("");
        setSubmitSuccess("");
    };

    const canCreateField = Boolean(filters.department && filters.subDepartment && filters.notebook);

    const loadExistingFields = async () => {
        setIsLoadingExisting(true);
        setExistingError("");
        try {
            const data = await fetchNotebookCustomFieldsApi({
                ...(filters.department ? { department: filters.department } : {}),
                ...(filters.subDepartment ? { sub_department: filters.subDepartment } : {}),
                ...(filters.notebook ? { notebook: filters.notebook } : {}),
            });
            setExistingFields(Array.isArray(data?.fields) ? data.fields : []);
        } catch (err) {
            setExistingError(err?.response?.data?.error || err?.message || "Unable to load fields.");
        } finally {
            setIsLoadingExisting(false);
        }
    };

    useEffect(() => {
        loadExistingFields();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.department, filters.subDepartment, filters.notebook]);

    const handleCreateField = async (event) => {
        event.preventDefault();
        if (!canCreateField || !fieldLabel.trim()) return;

        setIsSubmitting(true);
        setSubmitError("");
        setSubmitSuccess("");
        try {
            await createNotebookCustomFieldApi({
                department: filters.department,
                sub_department: filters.subDepartment,
                notebook: filters.notebook,
                field_label: fieldLabel.trim(),
                field_type: fieldType,
                decimal_places: fieldType === "number" ? decimalPlaces : undefined,
                field_options: fieldType === "dropdown"
                    ? dropdownOptions.map((item) => item.trim()).filter(Boolean)
                    : [],
            });
            setSubmitSuccess("Field created successfully.");
            setFieldLabel("");
            setDropdownOptions([""]);
            setFieldType("text");
            setDecimalPlaces(2);
            await loadExistingFields();
        } catch (err) {
            setSubmitError(err?.response?.data?.error || err?.message || "Unable to create field.");
        } finally {
            setIsSubmitting(false);
        }
    };

    useEffect(() => {
        if (!submitSuccess) return undefined;
        const timer = setTimeout(() => setSubmitSuccess(""), 1500);
        return () => clearTimeout(timer);
    }, [submitSuccess]);

    const handleToggleField = async (id) => {
        setTogglingId(id);
        try {
            await toggleNotebookCustomFieldApi(id);
            await loadExistingFields();
        } finally {
            setTogglingId(null);
        }
    };

    const handleDropdownOptionChange = (index, value) => {
        setDropdownOptions((current) => current.map((item, i) => (i === index ? value : item)));
    };

    const handleAddDropdownOption = () => {
        setDropdownOptions((current) => [...current, ""]);
    };

    const handleRemoveDropdownOption = (index) => {
        setDropdownOptions((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : current));
    };

    const renderExistingFieldsList = () => {
        if (isLoadingExisting) {
            return <div className={styles.emptyState}>Loading fields...</div>;
        }
        if (existingError) {
            return <div className={styles.emptyState}>{existingError}</div>;
        }
        if (!filteredExistingFields.length) {
            return <div className={styles.emptyState}>No fields created yet for this notebook.</div>;
        }
        return (
            <div className={styles.list}>
                {filteredExistingFields.map((field) => (
                    <div className={styles.row} key={field.id}>
                        <span className={styles.rowMain}>
                            <strong>{field.field_label}</strong>
                            <span>{field.department} &gt; {field.sub_department} &gt; {field.notebook}</span>
                        </span>
                        <span className={styles.rowMeta}>
                            <span className={styles.rowMetaItem}>
                                <small>Type</small>
                                <strong>{field.field_type}</strong>
                            </span>
                            <span className={styles.rowMetaItem}>
                                <small>Created</small>
                                <strong>{formatDate(field.created_at)}</strong>
                            </span>
                            <button
                                type="button"
                                className={`${styles.toggleSwitch} ${field.is_active ? styles.toggleSwitchActive : ""}`}
                                onClick={() => handleToggleField(field.id)}
                                disabled={togglingId === field.id}
                                aria-label={field.is_active ? "Deactivate field" : "Activate field"}
                            />
                        </span>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <section className={styles.page}>
            <div className={styles.titleBar}>
                <h1 className={styles.title}>New Field Creation</h1>
                <div className={styles.tabSwitch}>
                    <button
                        type="button"
                        className={`${styles.tabButton} ${activeTab === "creation" ? styles.tabButtonActive : ""}`}
                        onClick={() => setActiveTab("creation")}
                    >
                        Creation
                    </button>
                    <button
                        type="button"
                        className={`${styles.tabButton} ${activeTab === "existing" ? styles.tabButtonActive : ""}`}
                        onClick={() => setActiveTab("existing")}
                    >
                        Existing
                    </button>
                </div>
                <div className={styles.filterBar}>
                    <label className={styles.filterField}>
                        <small>Department</small>
                        <select
                            className={styles.filterSelect}
                            value={filters.department}
                            onChange={(event) => handleFilterChange("department", event.target.value)}
                        >
                            <option value="">Select</option>
                            {DEPARTMENTS.map((dept) => (
                                <option key={dept} value={dept}>{dept}</option>
                            ))}
                        </select>
                    </label>
                    <label className={styles.filterField}>
                        <small>Sub Department</small>
                        <select
                            className={styles.filterSelect}
                            value={filters.subDepartment}
                            onChange={(event) => handleFilterChange("subDepartment", event.target.value)}
                            disabled={!filters.department}
                        >
                            <option value="">Select</option>
                            {SUB_DEPARTMENTS.map((value) => (
                                <option key={value} value={value}>{value}</option>
                            ))}
                        </select>
                    </label>
                    <label className={styles.filterField}>
                        <small>Notebook</small>
                        <select
                            className={styles.filterSelect}
                            value={filters.notebook}
                            onChange={(event) => handleFilterChange("notebook", event.target.value)}
                            disabled={!filters.subDepartment}
                        >
                            <option value="">Select</option>
                            {notebookOptions.map((value) => (
                                <option key={value} value={value}>{value}</option>
                            ))}
                        </select>
                    </label>
                    <label className={styles.filterField}>
                        <small>Date Range</small>
                        <select
                            className={styles.filterSelect}
                            value={filters.datePreset}
                            onChange={(event) => handleDatePresetChange(event.target.value)}
                        >
                            <option value="">Custom</option>
                            {DATE_RANGE_PRESETS.map((preset) => (
                                <option key={preset.key} value={preset.key}>{preset.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className={styles.filterField}>
                        <small>From</small>
                        <span className={styles.dateInputWrap}>
                            <input
                                ref={dateFromInputRef}
                                type="date"
                                className={styles.filterSelect}
                                value={filters.dateFrom}
                                onChange={(event) => handleCustomDateChange("dateFrom", event.target.value)}
                            />
                            <FiCalendar
                                className={styles.dateInputIcon}
                                aria-hidden="true"
                                onClick={() => openDatePicker(dateFromInputRef)}
                            />
                        </span>
                    </label>
                    <label className={styles.filterField}>
                        <small>To</small>
                        <span className={styles.dateInputWrap}>
                            <input
                                ref={dateToInputRef}
                                type="date"
                                className={styles.filterSelect}
                                value={filters.dateTo}
                                onChange={(event) => handleCustomDateChange("dateTo", event.target.value)}
                            />
                            <FiCalendar
                                className={styles.dateInputIcon}
                                aria-hidden="true"
                                onClick={() => openDatePicker(dateToInputRef)}
                            />
                        </span>
                    </label>
                </div>
            </div>

            {activeTab === "creation" ? (
                !canCreateField ? (
                    <div className={styles.emptyState}>
                        Select Department, Sub Department and Notebook to create a new field.
                    </div>
                ) : (
                    <div className={styles.creationCard}>
                        <h2>Enter new field</h2>
                        {submitError ? <p className={styles.formError}>{submitError}</p> : null}
                        <form onSubmit={handleCreateField}>
                            <div className={styles.formField}>
                                <label htmlFor="field-label">Field Label</label>
                                <input
                                    id="field-label"
                                    type="text"
                                    className={styles.formInput}
                                    value={fieldLabel}
                                    onChange={(event) => setFieldLabel(event.target.value)}
                                    placeholder="e.g. Batch Temperature"
                                    required
                                />
                            </div>
                            <div className={styles.formField}>
                                <label htmlFor="field-type">Field Type</label>
                                <select
                                    id="field-type"
                                    className={styles.formSelect}
                                    value={fieldType}
                                    onChange={(event) => setFieldType(event.target.value)}
                                >
                                    {FIELD_TYPES.map((type) => (
                                        <option key={type.value} value={type.value}>{type.label}</option>
                                    ))}
                                </select>
                            </div>
                            {fieldType === "number" ? (
                                <div className={styles.formField}>
                                    <label htmlFor="field-decimal-places">Decimal Places</label>
                                    <select
                                        id="field-decimal-places"
                                        className={styles.formSelect}
                                        value={decimalPlaces}
                                        onChange={(event) => setDecimalPlaces(Number(event.target.value))}
                                    >
                                        {DECIMAL_PLACES_OPTIONS.map((count) => (
                                            <option key={count} value={count}>{count}</option>
                                        ))}
                                    </select>
                                </div>
                            ) : null}
                            {fieldType === "dropdown" ? (
                                <div className={styles.formField}>
                                    <label>Dropdown Options</label>
                                    {dropdownOptions.map((option, index) => (
                                        <div className={styles.optionRow} key={index}>
                                            <input
                                                type="text"
                                                className={styles.formInput}
                                                value={option}
                                                onChange={(event) => handleDropdownOptionChange(index, event.target.value)}
                                                placeholder={`Option ${index + 1}`}
                                            />
                                            {dropdownOptions.length > 1 ? (
                                                <button
                                                    type="button"
                                                    className={styles.removeOptionButton}
                                                    onClick={() => handleRemoveDropdownOption(index)}
                                                    aria-label="Remove option"
                                                >
                                                    &minus;
                                                </button>
                                            ) : null}
                                            {index === dropdownOptions.length - 1 ? (
                                                <button
                                                    type="button"
                                                    className={styles.addOptionButton}
                                                    onClick={handleAddDropdownOption}
                                                    aria-label="Add option"
                                                >
                                                    +
                                                </button>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                            <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
                                {isSubmitting ? "Adding..." : "Add Field"}
                            </button>
                        </form>
                    </div>
                )
            ) : (
                renderExistingFieldsList()
            )}

            {fieldPendingDelete ? (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalCard}>
                        <h3 className={styles.modalTitle}>Delete this field?</h3>
                        <p className={styles.modalMessage}>
                            "{fieldPendingDelete.field_label}" will be permanently removed. This cannot be undone.
                        </p>
                        <div className={styles.modalActions}>
                            <button
                                type="button"
                                className={styles.confirmNoButton}
                                onClick={handleCancelDelete}
                                disabled={deletingId === fieldPendingDelete.id}
                            >
                                No
                            </button>
                            <button
                                type="button"
                                className={styles.confirmYesButton}
                                onClick={handleConfirmDelete}
                                disabled={deletingId === fieldPendingDelete.id}
                            >
                                {deletingId === fieldPendingDelete.id ? "Deleting..." : "Yes, delete"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            <SuccessModal
                open={Boolean(submitSuccess)}
                message={submitSuccess}
                onClose={() => setSubmitSuccess("")}
                hideButton
            />
        </section>
    );
};

export default NewFieldCreationPage;

import { useEffect, useMemo, useState } from "react";
import {
    createNotebookCustomFieldApi,
    deleteNotebookCustomFieldApi,
    fetchNotebookCustomFieldsApi,
    toggleNotebookCustomFieldApi,
    updateNotebookCustomFieldApi,
} from "@/apis/notebookCustomFieldsApi";
import SuccessModal from "@/components/SuccessModal";
import Pagination from "@/components/Pagination";
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
        "Wheel Change",
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
        "Wheel Change",
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

const NewFieldCreationPage = () => {
    const [activeTab, setActiveTab] = useState("creation");
    const [filters, setFilters] = useState({ department: "", subDepartment: "", notebook: "" });
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
    const [openMenuId, setOpenMenuId] = useState(null);
    const [editingField, setEditingField] = useState(null);
    const [editLabel, setEditLabel] = useState("");
    const [editType, setEditType] = useState("text");
    const [editDecimalPlaces, setEditDecimalPlaces] = useState(2);
    const [editOptions, setEditOptions] = useState([""]);
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [fieldPendingDelete, setFieldPendingDelete] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 5;

    const notebookOptions = useMemo(
        () => NOTEBOOKS_BY_SUB_DEPARTMENT[filters.subDepartment] || [],
        [filters.subDepartment]
    );

    const totalPages = Math.max(1, Math.ceil(existingFields.length / PAGE_SIZE));

    useEffect(() => {
        setCurrentPage(1);
    }, [existingFields]);

    const paginatedExistingFields = useMemo(
        () => existingFields.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
        [existingFields, currentPage]
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

    const handleStartEdit = (field) => {
        setOpenMenuId(null);
        setEditingField(field);
        setEditLabel(field.field_label);
        setEditType(field.field_type);
        setEditDecimalPlaces(Number.isInteger(field.decimal_places) ? field.decimal_places : 2);
        setEditOptions(Array.isArray(field.field_options) && field.field_options.length ? field.field_options : [""]);
    };

    const handleCancelEdit = () => {
        setEditingField(null);
    };

    const handleSaveEdit = async (event) => {
        event.preventDefault();
        if (!editingField || !editLabel.trim()) return;

        setIsSavingEdit(true);
        try {
            await updateNotebookCustomFieldApi(editingField.id, {
                field_label: editLabel.trim(),
                field_type: editType,
                decimal_places: editType === "number" ? editDecimalPlaces : undefined,
                field_options: editType === "dropdown"
                    ? editOptions.map((item) => item.trim()).filter(Boolean)
                    : [],
            });
            setEditingField(null);
            await loadExistingFields();
        } finally {
            setIsSavingEdit(false);
        }
    };

    const handleEditOptionChange = (index, value) => {
        setEditOptions((current) => current.map((item, i) => (i === index ? value : item)));
    };

    const handleAddEditOption = () => {
        setEditOptions((current) => [...current, ""]);
    };

    const handleRemoveEditOption = (index) => {
        setEditOptions((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : current));
    };

    const handleDeleteField = (field) => {
        setOpenMenuId(null);
        setFieldPendingDelete(field);
    };

    const handleCancelDelete = () => {
        setFieldPendingDelete(null);
    };

    const handleConfirmDelete = async () => {
        if (!fieldPendingDelete) return;
        const id = fieldPendingDelete.id;
        setDeletingId(id);
        try {
            await deleteNotebookCustomFieldApi(id);
            await loadExistingFields();
        } finally {
            setDeletingId(null);
            setFieldPendingDelete(null);
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
        if (!existingFields.length) {
            return <div className={styles.emptyState}>No fields created yet for this notebook.</div>;
        }
        return (
            <div className={styles.list}>
                {paginatedExistingFields.map((field) => (
                    editingField?.id === field.id ? (
                        <div className={styles.creationCard} key={field.id}>
                            <h2>Edit field</h2>
                            <form onSubmit={handleSaveEdit}>
                                <div className={styles.formField}>
                                    <label htmlFor={`edit-label-${field.id}`}>Field Label</label>
                                    <input
                                        id={`edit-label-${field.id}`}
                                        type="text"
                                        className={styles.formInput}
                                        value={editLabel}
                                        onChange={(event) => setEditLabel(event.target.value)}
                                        required
                                    />
                                </div>
                                <div className={styles.formField}>
                                    <label htmlFor={`edit-type-${field.id}`}>Field Type</label>
                                    <select
                                        id={`edit-type-${field.id}`}
                                        className={styles.formSelect}
                                        value={editType}
                                        onChange={(event) => setEditType(event.target.value)}
                                    >
                                        {FIELD_TYPES.map((type) => (
                                            <option key={type.value} value={type.value}>{type.label}</option>
                                        ))}
                                    </select>
                                </div>
                                {editType === "number" ? (
                                    <div className={styles.formField}>
                                        <label htmlFor={`edit-decimal-places-${field.id}`}>Decimal Places</label>
                                        <select
                                            id={`edit-decimal-places-${field.id}`}
                                            className={styles.formSelect}
                                            value={editDecimalPlaces}
                                            onChange={(event) => setEditDecimalPlaces(Number(event.target.value))}
                                            disabled={Boolean(field.db_column_name)}
                                        >
                                            {DECIMAL_PLACES_OPTIONS.map((count) => (
                                                <option key={count} value={count}>{count}</option>
                                            ))}
                                        </select>
                                    </div>
                                ) : null}
                                {editType === "dropdown" ? (
                                    <div className={styles.formField}>
                                        <label>Dropdown Options</label>
                                        {editOptions.map((option, index) => (
                                            <div className={styles.optionRow} key={index}>
                                                <input
                                                    type="text"
                                                    className={styles.formInput}
                                                    value={option}
                                                    onChange={(event) => handleEditOptionChange(index, event.target.value)}
                                                    placeholder={`Option ${index + 1}`}
                                                />
                                                {editOptions.length > 1 ? (
                                                    <button
                                                        type="button"
                                                        className={styles.removeOptionButton}
                                                        onClick={() => handleRemoveEditOption(index)}
                                                        aria-label="Remove option"
                                                    >
                                                        &minus;
                                                    </button>
                                                ) : null}
                                                {index === editOptions.length - 1 ? (
                                                    <button
                                                        type="button"
                                                        className={styles.addOptionButton}
                                                        onClick={handleAddEditOption}
                                                        aria-label="Add option"
                                                    >
                                                        +
                                                    </button>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                                <div className={styles.optionRow}>
                                    <button type="submit" className={styles.submitButton} disabled={isSavingEdit}>
                                        {isSavingEdit ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.confirmNoButton}
                                        onClick={handleCancelEdit}
                                        disabled={isSavingEdit}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : (
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
                                <span className={styles.actionMenuWrap}>
                                    <button
                                        type="button"
                                        className={styles.actionMenuButton}
                                        onClick={() => setOpenMenuId((current) => (current === field.id ? null : field.id))}
                                        aria-label="More actions"
                                    >
                                        &#8942;
                                    </button>
                                    {openMenuId === field.id ? (
                                        <div className={styles.actionMenu}>
                                            <button
                                                type="button"
                                                className={styles.actionMenuItem}
                                                onClick={() => handleStartEdit(field)}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                className={`${styles.actionMenuItem} ${styles.actionMenuItemDanger}`}
                                                onClick={() => handleDeleteField(field)}
                                                disabled={deletingId === field.id}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    ) : null}
                                </span>
                            </span>
                        </div>
                    )
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
                <>
                    {renderExistingFieldsList()}
                    {!isLoadingExisting && !existingError && existingFields.length ? (
                        <Pagination page={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
                    ) : null}
                </>
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

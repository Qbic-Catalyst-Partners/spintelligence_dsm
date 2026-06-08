import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import {
    acknowledgeSubmittedNotebookApi,
    fetchSubmittedNotebookDetailApi,
    fetchSubmittedNotebooksApi,
} from "@/apis/submittedNotebooksApi";
import apiConfig from "@/apis/apiConfig";
import styles from "@/styles/submittedNotebooks.module.css";

const FIELD_LABELS = {
    date: "Date",
    lot_no: "Lot No.",
    variety: "Variety",
    invoice_no: "Invoice No.",
    invoice: "Invoice No.",
    micronaire: "Micronaire",
    sci: "SCI",
    span_length: "Span Length",
    mic: "Mic",
    strength: "Strength",
    maturity: "Maturity",
    ur: "UR",
    sfi: "SFI",
    elongation: "Elongation",
    colour_rd: "Colour Grade",
    trash: "Trash",
    rd: "RD",
};

const FALLBACK_FIELDS = [
    "date",
    "inspection_date",
    "entry_id",
    "lot_no",
    "variety",
    "invoice_no",
    "invoice_date",
    "micronaire",
    "sci",
    "span_length",
    "mic",
    "gtex",
    "strength",
    "maturity",
    "ur",
    "sfi",
    "elongation",
    "yellow_b",
    "trcnt",
    "trar",
    "trid",
    "invisible_loss_percentage",
    "trash_content_percentage",
    "colour_rd",
    "colour_grade",
    "trash",
    "rd",
];

const formatTitle = (value) =>
    String(value || "")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());

const normalizeKey = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const normalizeLookupValue = (value) =>
    String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

const META_FIELD_KEYS = new Set([
    "id",
    "_id",
    "entry_id",
    "entryid",
    "submitted_notebook_id",
    "submittednotebookid",
    "notebook_id",
    "notebookid",
    "submission_id",
    "submissionid",
    "created_at",
    "createdat",
    "submitted_at",
    "submittedat",
    "ack_due_at",
    "ackdueat",
    "operator_name",
    "operatorname",
    "submitted_by_name",
    "submittedbyname",
    "submitted_by_user_id",
    "submittedbyuserid",
    "submitted_user_id",
    "submitteduserid",
    "user_id",
    "userid",
    "status",
    "updated_at",
    "updatedat",
    "department",
    "sub_department",
    "subdepartment",
    "notebook_name",
    "notebookname",
    "input_screen",
    "inputscreen",
    "title",
    "approval_l1",
    "approvall1",
    "approval_l2",
    "approvall2",
    "acknowledged_at",
    "acknowledgedat",
    "acknowledged_by",
    "acknowledgedby",
]);

const getNotebookId = (notebook) =>
    notebook?.id ||
    notebook?.submitted_notebook_id ||
    notebook?.submittedNotebookId ||
    notebook?.notebook_id ||
    notebook?.notebookId ||
    notebook?.submission_id ||
    notebook?.submissionId ||
    notebook?._id;

const parseJsonValue = (value) => {
    if (typeof value !== "string") return value;

    const trimmed = value.trim();
    if (!trimmed || !["{", "["].includes(trimmed[0])) return value;

    try {
        return JSON.parse(trimmed);
    } catch {
        return value;
    }
};

const findSubmittedFieldsPayload = (value, seen = new Set(), allowRootPayload = true) => {
    const parsed = parseJsonValue(value);

    if (!parsed || typeof parsed !== "object") return parsed;
    if (seen.has(parsed)) return {};
    seen.add(parsed);

    if (Array.isArray(parsed)) return parsed.length && allowRootPayload ? parsed : {};

    const directKeys = [
        "submitted_fields",
        "submittedFields",
        "submitted_fields_json",
        "submittedFieldsJson",
        "input_fields",
        "inputFields",
        "fields",
        "form_data",
        "formData",
        "payload",
        "notebook_payload",
        "notebookPayload",
    ];

    for (const key of directKeys) {
        const candidate = parseJsonValue(parsed?.[key]);
        if (Array.isArray(candidate) && candidate.length) return candidate;
        if (candidate && typeof candidate === "object" && Object.keys(candidate).length) {
            const nested = findSubmittedFieldsPayload(candidate, seen, true);
            if (Array.isArray(nested) && nested.length) return nested;
            if (nested && typeof nested === "object" && Object.keys(nested).length) return nested;
        }
    }

    if (parsed.data && typeof parsed.data === "object") {
        const nested = findSubmittedFieldsPayload(parsed.data, seen, false);
        if (Array.isArray(nested) && nested.length) return nested;
        if (nested && typeof nested === "object" && Object.keys(nested).length) return nested;
    }

    if (!allowRootPayload) return {};

    const hasNonMetaValues = Object.entries(parsed).some(([key, item]) => {
        const value = parseJsonValue(item);
        return (
            !META_FIELD_KEYS.has(normalizeKey(key)) &&
            value !== undefined &&
            value !== null &&
            value !== "" &&
            (typeof value !== "object" || value instanceof Date)
        );
    });

    return hasNonMetaValues ? parsed : {};
};

const getPayload = (notebook) => {
    const payload = findSubmittedFieldsPayload(notebook, new Set(), false);
    if (Array.isArray(payload) && payload.length) return payload;
    if (payload && typeof payload === "object" && Object.keys(payload).length) return payload;
    return {};
};

const getCreatedDate = (notebook) =>
    notebook?.submitted_at ||
    notebook?.submittedAt ||
    notebook?.created_at ||
    notebook?.createdAt ||
    notebook?.ack_due_at ||
    null;

const formatTime = (value) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 5) || "--";
    return date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
};

const formatDateValue = (value) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return [
        String(date.getDate()).padStart(2, "0"),
        String(date.getMonth() + 1).padStart(2, "0"),
        date.getFullYear(),
    ].join("-");
};

const isDateField = (key) => {
    const normalized = normalizeKey(key);
    return normalized === "date" || normalized.endsWith("date");
};

const getGroupLabel = (value) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "Older";

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const itemDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const diff = Math.round((today - itemDay) / 86400000);

    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return date.toLocaleDateString("en-GB");
};

const normalizeList = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.submitted_notebooks)) return data.submitted_notebooks;
    if (Array.isArray(data?.submittedNotebooks)) return data.submittedNotebooks;
    if (Array.isArray(data?.notebooks)) return data.notebooks;
    if (Array.isArray(data?.rows)) return data.rows;
    if (Array.isArray(data?.data)) return data.data;
    return [];
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

    return value === undefined || value === null || value === "" ? [] : [String(value).trim()];
};

const getUserIdentityValues = (user) =>
    [
        user?.id,
        user?.employee_id,
        user?.employeeId,
        user?.emp_id,
        user?.name,
        user?.full_name,
        user?.fullName,
        user?.username,
        user?.email,
    ]
        .map(normalizeLookupValue)
        .filter(Boolean);

const getNotebookApproverValues = (notebook) =>
    [
        ...normalizeNameList(notebook?.approval_l2),
        ...normalizeNameList(notebook?.approval_l2_name),
        ...normalizeNameList(notebook?.approval_l2_names),
        ...normalizeNameList(notebook?.approval_l2_user_id),
        ...normalizeNameList(notebook?.approval_l2_user_ids),
        ...normalizeNameList(notebook?.l2_approver_user_id),
        ...normalizeNameList(notebook?.l2_approver_user_ids),
        ...normalizeNameList(notebook?.l2ApproverUserIds),
        ...normalizeNameList(notebook?.l2_approver_names),
        ...normalizeNameList(notebook?.l2ApproverNames),
    ]
        .map(normalizeLookupValue)
        .filter(Boolean);

const isNotebookForUser = (notebook, user) => {
    const approverValues = getNotebookApproverValues(notebook);
    if (!approverValues.length) return true;

    const userValues = getUserIdentityValues(user);
    return userValues.some((userValue) => approverValues.includes(userValue));
};

const isNotebookPendingAcknowledgement = (notebook) => {
    if (notebook?.acknowledged_at || notebook?.acknowledgedAt || notebook?.acknowledged_by || notebook?.acknowledgedBy) {
        return false;
    }

    const status = normalizeLookupValue(notebook?.status || notebook?.ack_status || notebook?.ackStatus);
    if (!status) return true;

    return !["acknowledged", "ack", "completed", "closed", "approved"].includes(status);
};

const buildSubmittedNotebookQuery = (user) =>
    Object.fromEntries(
        Object.entries({
            approval_l2: user?.employee_id || user?.employeeId || user?.id || "",
            approval_l2_name: user?.full_name || user?.fullName || user?.name || "",
            l2_approver_user_id: user?.id || user?.employee_id || user?.employeeId || "",
        }).filter(([, value]) => String(value || "").trim())
    );

const normalizeSourceRows = (data) => {
    const rows = normalizeList(data);
    if (rows.length) return rows;

    const candidate =
        data?.entry ||
        data?.row ||
        data?.record ||
        data?.result ||
        data?.data ||
        data;

    return candidate && typeof candidate === "object" && !Array.isArray(candidate)
        ? [candidate]
        : [];
};

const getDetailNotebook = (data, fallback) =>
    data?.submitted_notebook || data?.submittedNotebook || data?.notebook || data?.data || data || fallback;

const getNotebookSourceEndpoint = (notebook) => {
    const name = normalizeKey(
        notebook?.notebook_name ||
        notebook?.notebookName ||
        notebook?.input_screen ||
        notebook?.inputScreen ||
        notebook?.title
    );

    if (name.includes("cotton") || name.includes("hvi")) return "/mixing/cotton-hvi";
    if (name.includes("fibre") || name.includes("fiber")) return "/mixing/fibre";
    if (name.includes("afis")) return "/mixing/afis";
    if (name.includes("moisture")) return "/mixing/moisture";
    if (name.includes("openness")) return "/mixing/openness";

    return "";
};

const findMatchingSourceEntry = (rows, notebook) => {
    const entryId = String(notebook?.entry_id || notebook?.entryId || "").trim();
    const lotNo = String(notebook?.lot_no || notebook?.lotNo || "").trim();

    if (entryId) {
        const byEntryId = rows.find((row) => String(row?.entry_id || row?.entryId || "").trim() === entryId);
        if (byEntryId) return byEntryId;
    }

    if (lotNo) {
        const byLotNo = rows.find((row) => String(row?.lot_no || row?.lotNo || "").trim() === lotNo);
        if (byLotNo) return byLotNo;
    }

    return rows[0] || null;
};

const fetchSourceEntryPayload = async (notebook) => {
    const endpoint = getNotebookSourceEndpoint(notebook);
    if (!endpoint) return null;

    const params = {};
    if (notebook?.entry_id || notebook?.entryId) params.entry_id = notebook.entry_id || notebook.entryId;
    if (notebook?.lot_no || notebook?.lotNo) params.lot_no = notebook.lot_no || notebook.lotNo;

    const response = await apiConfig.get(endpoint, params, { skipGlobalErrorModal: true });
    const rows = normalizeSourceRows(response?.data);
    return findMatchingSourceEntry(rows, notebook);
};

const hasSubmittedFields = (notebook) =>
    buildFieldCards(notebook).some((field) => !META_FIELD_KEYS.has(normalizeKey(field.key)));

const buildFieldCards = (notebook) => {
    const payload = getPayload(notebook);
    const fields = [];
    const usedKeys = new Set();

    if (Array.isArray(payload)) {
        return payload
            .map((item, index) => {
                if (!item || typeof item !== "object") {
                    return null;
                }

                const key = String(
                    item.key ||
                    item.name ||
                    item.field ||
                    item.field_name ||
                    item.input_field ||
                    item.label ||
                    `field_${index}`
                );
                const value =
                    item.value ??
                    item.field_value ??
                    item.input_value ??
                    item.actual_value ??
                    item.submitted_value;

                if (value === undefined || value === null || value === "" || typeof value === "object") {
                    return null;
                }

                return {
                    key,
                    label: item.label || FIELD_LABELS[key] || formatTitle(key),
                    value,
                };
            })
            .filter(Boolean);
    }

    const payloadHasDisplayValues =
        payload &&
        typeof payload === "object" &&
        Object.keys(payload).some((key) => !META_FIELD_KEYS.has(normalizeKey(key)));

    FALLBACK_FIELDS.forEach((key) => {
        const value = payload?.[key] ?? notebook?.[key];
        if (value !== undefined && value !== null && value !== "") {
            if (!payloadHasDisplayValues && META_FIELD_KEYS.has(normalizeKey(key))) {
                return;
            }
            usedKeys.add(key);
            fields.push({ key, label: FIELD_LABELS[key] || formatTitle(key), value });
        }
    });

    Object.entries(payload || {}).forEach(([key, value]) => {
        if (
            usedKeys.has(key) ||
            META_FIELD_KEYS.has(normalizeKey(key)) ||
            value === undefined ||
            value === null ||
            value === "" ||
            typeof value === "object"
        ) {
            return;
        }
        fields.push({ key, label: FIELD_LABELS[key] || formatTitle(key), value });
    });

    return fields;
};

const SubmittedNotebooksPage = () => {
    const user = useSelector((state) => state.auth?.user);
    const [notebooks, setNotebooks] = useState([]);
    const [selectedNotebook, setSelectedNotebook] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [error, setError] = useState("");
    const [acknowledgingId, setAcknowledgingId] = useState(null);

    const loadNotebooks = async () => {
        setIsLoading(true);
        setError("");
        try {
            const query = buildSubmittedNotebookQuery(user);
            const data = await fetchSubmittedNotebooksApi(query);
            let rows = normalizeList(data);

            if (!rows.length && Object.keys(query).length) {
                const fallbackData = await fetchSubmittedNotebooksApi();
                rows = normalizeList(fallbackData);
            }

            const userRows = rows.filter((notebook) => isNotebookForUser(notebook, user));
            const scopedRows = userRows.length || !rows.length ? userRows : rows;
            setNotebooks(scopedRows.filter(isNotebookPendingAcknowledgement));
        } catch (err) {
            setError(err?.response?.data?.message || err?.message || "Unable to load submitted notebooks.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadNotebooks();
    }, [user?.id, user?.employee_id, user?.employeeId, user?.full_name, user?.fullName, user?.name]);

    const groupedNotebooks = useMemo(() => {
        const groups = new Map();
        notebooks.forEach((notebook) => {
            const label = getGroupLabel(getCreatedDate(notebook));
            if (!groups.has(label)) groups.set(label, []);
            groups.get(label).push(notebook);
        });
        return Array.from(groups.entries()).map(([label, rows]) => ({ label, rows }));
    }, [notebooks]);

    const openNotebook = async (notebook) => {
        const id = getNotebookId(notebook);
        setSelectedNotebook(notebook);

        setIsDetailLoading(true);
        try {
            let nextNotebook = notebook;

            if (id) {
                const data = await fetchSubmittedNotebookDetailApi(id);
                nextNotebook = getDetailNotebook(data, notebook);
            }

            if (!hasSubmittedFields(nextNotebook)) {
                const sourcePayload = await fetchSourceEntryPayload(nextNotebook);
                if (sourcePayload) {
                    nextNotebook = {
                        ...nextNotebook,
                        submitted_fields: sourcePayload,
                    };
                }
            }

            setSelectedNotebook(nextNotebook);
        } catch {
            setSelectedNotebook(notebook);
        } finally {
            setIsDetailLoading(false);
        }
    };

    const handleAcknowledge = async () => {
        const id = getNotebookId(selectedNotebook);
        if (!id) return;
        setAcknowledgingId(id);
        try {
            await acknowledgeSubmittedNotebookApi(id);
            setNotebooks((currentNotebooks) =>
                currentNotebooks.filter((notebook) => getNotebookId(notebook) !== id)
            );
            setSelectedNotebook(null);
            await loadNotebooks();
        } finally {
            setAcknowledgingId(null);
        }
    };

    const selectedFields = buildFieldCards(selectedNotebook);

    return (
        <section className={styles.page}>
            <div className={styles.breadcrumb}>Home &gt; Dashboard &gt; Comber Notebook QC</div>
            <h1 className={styles.title}>Submitted Notebooks</h1>

            {isLoading ? (
                <div className={styles.emptyState}>Loading submitted notebooks...</div>
            ) : error ? (
                <div className={styles.emptyState}>{error}</div>
            ) : groupedNotebooks.length ? (
                <div className={styles.groups}>
                    {groupedNotebooks.map((group) => (
                        <section key={group.label} className={styles.group}>
                            <h2 className={styles.groupTitle}>{group.label}</h2>
                            <div className={styles.list}>
                                {group.rows.map((notebook, index) => {
                                    const id = getNotebookId(notebook) || `${group.label}-${index}`;
                                    const payload = getPayload(notebook);
                                    const title = notebook?.notebook_name || notebook?.notebookName || notebook?.title || payload?.notebook_name || "Cotton HVI";
                                    const department = notebook?.department || payload?.department || "Quality Control";
                                    const subDepartment = notebook?.sub_department || notebook?.subDepartment || payload?.sub_department || "Mixing Department";
                                    const operator = notebook?.operator_name || notebook?.operatorName || notebook?.submitted_by_name || notebook?.submittedByName || "John Doe";
                                    const createdAt = getCreatedDate(notebook);

                                    return (
                                        <button
                                            type="button"
                                            key={id}
                                            className={styles.row}
                                            onClick={() => openNotebook(notebook)}
                                        >
                                            <span className={styles.rowMain}>
                                                <strong>{title}</strong>
                                                <span>{department} &gt; {subDepartment}</span>
                                            </span>
                                            <span className={styles.rowMeta}>
                                                <span>
                                                    <small>Operator</small>
                                                    <strong>{operator}</strong>
                                                </span>
                                                <span>
                                                    <small>Created At</small>
                                                    <strong>{formatTime(createdAt)}</strong>
                                                </span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            ) : (
                <div className={styles.emptyState}>No submitted notebooks found.</div>
            )}

            {selectedNotebook && (
                <div className={styles.overlay} role="presentation" onClick={() => setSelectedNotebook(null)}>
                    <div
                        className={styles.modal}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="submitted-notebook-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 id="submitted-notebook-title">
                                    {selectedNotebook?.notebook_name || selectedNotebook?.title || "Cotton HVI Data Entry"}
                                </h2>
                                <p>
                                    {selectedNotebook?.department || "Quality Control"} &gt;{" "}
                                    {selectedNotebook?.sub_department || selectedNotebook?.subDepartment || "Mixing Department"}
                                </p>
                            </div>
                            <div className={styles.modalMeta}>
                                <span>
                                    <small>Operator</small>
                                    <strong>{selectedNotebook?.operator_name || selectedNotebook?.submitted_by_name || "John Doe"}</strong>
                                </span>
                                <span>
                                    <small>Created At</small>
                                    <strong>{formatTime(getCreatedDate(selectedNotebook))}</strong>
                                </span>
                            </div>
                        </div>

                        <div className={styles.fieldGrid}>
                            {isDetailLoading ? (
                                <div className={styles.emptyState}>Loading notebook details...</div>
                            ) : selectedFields.length ? (
                                selectedFields.map((field) => (
                                    <div key={field.key} className={styles.fieldCard}>
                                        <small>{field.label}</small>
                                        <strong>{isDateField(field.key) ? formatDateValue(field.value) : String(field.value)}</strong>
                                    </div>
                                ))
                            ) : (
                                <div className={styles.emptyState}>No submitted fields available.</div>
                            )}
                        </div>

                        <button
                            type="button"
                            className={styles.ackButton}
                            disabled={Boolean(acknowledgingId)}
                            onClick={handleAcknowledge}
                        >
                            {acknowledgingId ? "Acknowledging..." : "Acknowledge"}
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
};

export default SubmittedNotebooksPage;

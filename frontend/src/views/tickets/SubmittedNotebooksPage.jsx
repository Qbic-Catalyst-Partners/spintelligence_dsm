import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import { FiCalendar } from "react-icons/fi";
import {
    acknowledgeSubmittedNotebookApi,
    fetchSubmittedNotebookDetailApi,
    fetchSubmittedNotebooksApi,
} from "@/apis/submittedNotebooksApi";
import apiConfig from "@/apis/apiConfig";
import Pagination from "@/components/Pagination";
import SearchableSelect from "@/components/SearchableSelect";
import { fetchUsersAPI } from "@/apis/userApi";
import {
    hasHierarchyLevel,
    isFullAccessUser,
    isSubmittedNotebookApproverUser,
    isSupervisorNavUser,
} from "@/utils/accessControl";
import styles from "@/styles/submittedNotebooks.module.css";
import {
    formatDateTime as sharedFormatDateTime,
    formatDateOnly,
    formatTimeOnly,
} from "@/utils/formatDateTime";

const getFirstName = (fullName) => String(fullName || "").trim().split(/\s+/)[0] || fullName || "";

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

const FILTER_CASCADE = ["department", "subDepartment", "notebookType", "operator", "supervisor", "entryId"];

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

const normalizeUserList = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.users)) return data.users;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.rows)) return data.rows;
    return [];
};

const META_FIELD_KEYS = new Set([
    "id",
    "_id",
    "entry_id",
    "entryid",
    "submitted_notebook_id",
    "submittednotebookid",
    "notebook_submission_id",
    "notebooksubmissionid",
    "notebookSubmissionId",
    "notebook_id",
    "notebookid",
    "notebookId",
    "submission_id",
    "submissionid",
    "submissionId",
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
    "notebook",
    "notebook_name",
    "notebookname",
    "input_screen",
    "inputscreen",
    "title",
    "approval_l1",
    "approvall1",
    "approval_l1_name",
    "approvall1name",
    "approvalL1Name",
    "approval_l1_names",
    "approvall1names",
    "approvalL1Names",
    "approval_l1_user_id",
    "approvall1userid",
    "approvalL1UserId",
    "approval_l1_user_ids",
    "approvall1userids",
    "approvalL1UserIds",
    "approval_l2",
    "approvall2",
    "approval_l2_name",
    "approvall2name",
    "approvalL2Name",
    "approval_l2_names",
    "approvall2names",
    "approvalL2Names",
    "approval_l2_employee_id",
    "approvall2employeeid",
    "approvalL2EmployeeId",
    "approval_l2_user_id",
    "approvall2userid",
    "approvalL2UserId",
    "approval_l2_user_ids",
    "approvall2userids",
    "approvalL2UserIds",
    "approval_l3",
    "approvall3",
    "approval_l3_name",
    "approvall3name",
    "approvalL3Name",
    "approval_l3_names",
    "approvall3names",
    "approvalL3Names",
    "approval_l3_user_id",
    "approvall3userid",
    "approvalL3UserId",
    "approval_l3_user_ids",
    "approvall3userids",
    "approvalL3UserIds",
    "l1_approver",
    "l1approver",
    "l1_approver_name",
    "l1approvername",
    "l1_approver_names",
    "l1approvernames",
    "l1_approver_user_id",
    "l1approveruserid",
    "l1_approver_user_ids",
    "l1approveruserids",
    "l2_approver",
    "l2approver",
    "l2_approver_name",
    "l2approvername",
    "l2_approver_names",
    "l2approvernames",
    "l2_approver_employee_id",
    "l2approveremployeeid",
    "l2ApproverEmployeeId",
    "l2_approver_user_id",
    "l2approveruserid",
    "l2ApproverUserId",
    "l2_approver_user_ids",
    "l2approveruserids",
    "l2ApproverUserIds",
    "l3_approver",
    "l3approver",
    "l3_approver_name",
    "l3approvername",
    "l3_approver_names",
    "l3approvernames",
    "l3_approver_user_id",
    "l3approveruserid",
    "l3ApproverUserId",
    "l3_approver_user_ids",
    "l3approveruserids",
    "l3ApproverUserIds",
    "l4_approver_user_ids",
    "l4approveruserids",
    "l4ApproverUserIds",
    "assigned_l1",
    "assignedl1",
    "assigned_l1_users",
    "assignedl1users",
    "assignedL1Users",
    "assigned_l2",
    "assignedl2",
    "assignedL2",
    "assigned_l2_users",
    "assignedl2users",
    "assignedL2Users",
    "assigned_l3",
    "assignedl3",
    "assignedL3",
    "assigned_l3_users",
    "assignedl3users",
    "assignedL3Users",
    "ticket_level",
    "ticketlevel",
    "target_level",
    "targetlevel",
    "acknowledgement_ticket_level",
    "acknowledgementticketlevel",
    "acknowledgement_target_level",
    "acknowledgementtargetlevel",
    "acknowledgement_ticket_type",
    "acknowledgementtickettype",
    "create_l1_acknowledgement_ticket",
    "createl1acknowledgementticket",
    "create_l2_acknowledgement_ticket",
    "createl2acknowledgementticket",
    "skip_l1_acknowledgement_ticket",
    "skipl1acknowledgementticket",
    "acknowledged_at",
    "acknowledgedat",
    "acknowledged_by",
    "acknowledgedby",
    "requires_acknowledgement",
    "requiresacknowledgement",
    "requiresAcknowledgement",
    "__field_labels",
    "fieldlabels",
]);

const ACKNOWLEDGEMENT_TIME_KEYS = new Set([
    "ack_time",
    "acknowledgement_time",
    "acknowledgementtime",
    "acknowledge_time",
    "acknowledgetime",
    "acknowledged_at",
    "acknowledgedat",
]);

const PAYLOAD_CONTAINER_KEYS = new Set([
    "submitted_fields",
    "submittedfields",
    "submitted_notebook_fields",
    "submittednotebookfields",
    "submitted_fields_json",
    "submittedfieldsjson",
    "submitted_payload",
    "submittedpayload",
    "submitted_payload_json",
    "submittedpayloadjson",
    "input_fields",
    "inputfields",
    "fields",
    "form_data",
    "formdata",
    "payload",
    "notebook_payload",
    "notebookpayload",
    "data",
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
        "submitted_notebook_fields",
        "submittedNotebookFields",
        "submitted_fields_json",
        "submittedFieldsJson",
        "submitted_payload",
        "submittedPayload",
        "submitted_payload_json",
        "submittedPayloadJson",
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

// Nested arrays/objects (e.g. Count Change's "readings" rows, LHS/RHS spindle lists) used to
// render as a single raw JSON blob here - unreadable, and the same generic renderer is shared
// across every notebook's payload, so this formats any such value into a plain "key: value" line
// instead of guessing a layout per notebook type.
const formatStructuredValue = (value) => {
    if (Array.isArray(value)) {
        return value
            .map((item, index) =>
                item && typeof item === "object" && !(item instanceof Date)
                    ? `${index + 1}) ${formatStructuredValue(item)}`
                    : String(item)
            )
            .join(" | ");
    }

    if (value && typeof value === "object") {
        return Object.entries(value)
            .filter(([, item]) => item !== null && typeof item !== "undefined" && item !== "")
            .map(([key, item]) => `${formatTitle(key)}: ${formatStructuredValue(item)}`)
            .join(", ");
    }

    return String(value);
};

const getDisplayValue = (value) => {
    const parsed = parseJsonValue(value);
    if (parsed === undefined || parsed === null || parsed === "") return "";
    if (parsed instanceof Date) return parsed.toISOString();
    if (Array.isArray(parsed) || (parsed && typeof parsed === "object")) {
        return formatStructuredValue(parsed);
    }
    return parsed;
};

// A "row list" is an array of records (e.g. Count Change's "readings", one row per reading) -
// these render as their own full-width table section instead of being squeezed into the regular
// field grid alongside short scalar fields like Entry ID/Type/RF No.
const isRowListValue = (value) =>
    Array.isArray(value) && value.some((item) => item && typeof item === "object" && !(item instanceof Date));

// A handful of OCR/PDF-report-imported notebook types (A%, Stretch %, Comber Nolis %, Carding
// Between/Within CV% - all fed by the same report-parsing pipeline) store their entire extracted
// summary as one long "Label: value, Label: value, ..." string under a single "meta" field,
// instead of individual structured fields - that used to render as one crammed, hard-to-read
// card. Split ONLY on a comma that's followed by what looks like the start of the next
// "Label: " pair (not every comma - a value can legitimately contain one, e.g. "Tester: Naveen,
// Kumar [4766]", which has no colon after the inner comma so it's correctly kept as one value).
const parseMetaBlobRows = (value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed.includes(": ")) return null;

    const rows = trimmed
        .split(/,\s*(?=[A-Za-z][A-Za-z0-9 %_]{0,40}:\s)/)
        .map((segment) => {
            const colonIndex = segment.indexOf(": ");
            if (colonIndex === -1) return null;
            const fieldLabel = segment.slice(0, colonIndex).trim();
            const fieldValue = segment.slice(colonIndex + 2).trim();
            return fieldLabel && fieldValue ? { Field: fieldLabel, Value: fieldValue } : null;
        })
        .filter(Boolean);

    // Only treat this as a parsed summary if it actually broke into several real
    // pairs - a plain remark/description that happens to contain one ": " should
    // still render as normal text, not a one-row "table".
    return rows.length >= 2 ? rows : null;
};

// recordSubmittedNotebook always writes a lot_no key into submitted_fields, even for screens
// that have no Lot No field at all (it's just blank there) - so unlike a genuine input field
// left blank, an empty Lot No means "not on this screen" and should stay hidden rather than
// showing as "-".
const HIDE_WHEN_BLANK_KEYS = new Set(["lot_no", "lotno"]);

const addDisplayField = (fields, usedKeys, key, value, label = "", labelOverrides = {}) => {
    const normalizedKey = normalizeKey(key);
    if (
        !normalizedKey ||
        META_FIELD_KEYS.has(normalizedKey) ||
        PAYLOAD_CONTAINER_KEYS.has(normalizedKey) ||
        usedKeys.has(normalizedKey)
    ) {
        return;
    }

    if (HIDE_WHEN_BLANK_KEYS.has(normalizedKey) && getDisplayValue(value) === "") {
        return;
    }

    const resolvedLabel = label || labelOverrides[key] || FIELD_LABELS[key] || formatTitle(key);

    if (normalizedKey === "meta") {
        const metaRows = parseMetaBlobRows(value);
        if (metaRows) {
            usedKeys.add(normalizedKey);
            fields.push({
                key,
                label: resolvedLabel,
                value: "",
                rows: metaRows,
            });
            return;
        }
    }

    const parsed = parseJsonValue(value);
    // A blank/zero value is still a field that exists on the entry screen - show it (as "-")
    // rather than silently dropping it, so no input field from the screen goes missing here.
    const rawDisplayValue = getDisplayValue(value);
    const displayValue = rawDisplayValue === "" ? "-" : rawDisplayValue;

    usedKeys.add(normalizedKey);
    fields.push({
        key,
        label: resolvedLabel,
        value: displayValue,
        rows: isRowListValue(parsed) ? parsed : null,
    });
};

const flattenDisplayFields = (value, fields, usedKeys, prefix = "", labelOverrides = {}) => {
    const parsed = parseJsonValue(value);
    if (!parsed || typeof parsed !== "object") {
        if (prefix) addDisplayField(fields, usedKeys, prefix, parsed, "", labelOverrides);
        return;
    }

    if (Array.isArray(parsed)) {
        if (prefix) addDisplayField(fields, usedKeys, prefix, parsed, "", labelOverrides);
        return;
    }

    Object.entries(parsed).forEach(([key, item]) => {
        const nextKey = prefix ? `${prefix}_${key}` : key;
        const parsedItem = parseJsonValue(item);
        addDisplayField(fields, usedKeys, nextKey, parsedItem, "", labelOverrides);
    });
};

const getCreatedDate = (notebook) =>
    notebook?.submitted_at ||
    notebook?.submittedAt ||
    notebook?.created_at ||
    notebook?.createdAt ||
    notebook?.ack_due_at ||
    null;

const getNotebookReviewNote = (notebook) =>
    String(
        notebook?.acknowledgement_note ??
        notebook?.acknowledgementNote ??
        notebook?.note ??
        ""
    ).trim();

const formatTime = (value) => {
    if (!value) return "--";
    const formatted = formatTimeOnly(value);
    return formatted === "-" ? (String(value).slice(0, 5) || "--") : formatted;
};

const formatDateValue = (value) => {
    if (!value) return "--";
    const formatted = formatDateOnly(value);
    return formatted === "-" ? String(value) : formatted;
};

const formatDateTime = (value) => {
    if (!value) return "--";
    const formatted = sharedFormatDateTime(value);
    return formatted === "-" ? String(value) : formatted;
};

const isDateField = (key) => {
    const normalized = normalizeKey(key);
    return normalized === "date" || normalized.endsWith("date");
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

const normalizeIdentityList = (value) => {
    const parsed = parseJsonValue(value);

    if (Array.isArray(parsed)) {
        return parsed.flatMap((item) => normalizeIdentityList(item));
    }

    if (parsed && typeof parsed === "object") {
        return [
            parsed.id,
            parsed.employee_id,
            parsed.employeeId,
            parsed.emp_id,
            parsed.full_name,
            parsed.fullName,
            parsed.name,
            parsed.username,
            parsed.email,
        ]
            .map((item) => String(item ?? "").trim())
            .filter(Boolean);
    }

    return normalizeNameList(parsed);
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
        ...normalizeIdentityList(notebook?.approval_l2),
        ...normalizeIdentityList(notebook?.approval_l2_name),
        ...normalizeIdentityList(notebook?.approval_l2_names),
        ...normalizeIdentityList(notebook?.approval_l2_employee_id),
        ...normalizeIdentityList(notebook?.approvalL2EmployeeId),
        ...normalizeIdentityList(notebook?.approval_l2_user_id),
        ...normalizeIdentityList(notebook?.approval_l2_user_ids),
        ...normalizeIdentityList(notebook?.approvalL2UserIds),
        ...normalizeIdentityList(notebook?.l2_approver_employee_id),
        ...normalizeIdentityList(notebook?.l2ApproverEmployeeId),
        ...normalizeIdentityList(notebook?.l2_approver_user_id),
        ...normalizeIdentityList(notebook?.l2_approver_user_ids),
        ...normalizeIdentityList(notebook?.l2ApproverUserIds),
        ...normalizeIdentityList(notebook?.l2_approver_names),
        ...normalizeIdentityList(notebook?.l2ApproverNames),
        ...normalizeIdentityList(notebook?.assigned_l2),
        ...normalizeIdentityList(notebook?.assigned_l2_users),
        ...normalizeIdentityList(notebook?.assignedL2),
        ...normalizeIdentityList(notebook?.assignedL2Users),
    ]
        .map(normalizeLookupValue)
        .filter(Boolean);

const isNotebookForUser = (notebook, user) => {
    // Every L1-L5 hierarchy account can view the full submitted-notebooks
    // list now (approval itself is separately restricted to L4/L5) - only
    // accounts without a recognized level still fall back to the legacy
    // "am I the specifically assigned approver" scoping below.
    if (isFullAccessUser(user) || hasHierarchyLevel(user)) return true;

    const approverValues = getNotebookApproverValues(notebook);
    if (!approverValues.length) return false;

    const userValues = getUserIdentityValues(user);
    return userValues.some((userValue) => approverValues.includes(userValue));
};

const isNotebookPendingAcknowledgement = (notebook) => {
    // Mirrors the list endpoint's isPending (GET /submitted-notebooks): pending
    // means "not yet acknowledged", independent of whether the screen has an
    // Acknowledgement Threshold configured. `requiresAcknowledgement` only
    // controls overdue-ticket generation, not tab placement - a submission
    // from a screen with no configured threshold is still unacknowledged and
    // must land under Pending, not Closed.
    if (notebook?.acknowledged_at || notebook?.acknowledgedAt || notebook?.acknowledged_by || notebook?.acknowledgedBy) {
        return false;
    }

    const status = normalizeLookupValue(notebook?.status || notebook?.ack_status || notebook?.ackStatus);
    if (!status) return true;

    return !["acknowledged", "ack", "completed", "closed", "approved"].includes(status);
};

// Scopes the primary fetch to the caller's own approver identity at their
// real hierarchy level (so an L4 person's query actually hits
// approval_l4/l4_approver_user_id - the fields a notebook assigned to them
// as L4 is stored under - not just the legacy L2 fields). Full-access users
// skip scoping entirely; for a level-less account (e.g. plain supervisor
// employee id with no `level` set) this falls back to L2, matching the
// original behaviour before per-level approval existed. loadNotebooks()
// always merges this scoped result with a second unfiltered fetch, so an
// L4/L5's assigned notebook still surfaces even if the scoped query above
// doesn't match anything server-side.
const buildSubmittedNotebookQuery = (user) => {
    if (isFullAccessUser(user)) return {};

    const level = String(user?.level ?? user?.user_details?.level ?? "").trim().toUpperCase();
    const levelKey = ["L1", "L2", "L3", "L4", "L5"].includes(level) ? level.toLowerCase() : "l2";

    return Object.fromEntries(
        Object.entries({
            [`approval_${levelKey}`]: user?.employee_id || user?.employeeId || user?.id || "",
            [`approval_${levelKey}_name`]: user?.full_name || user?.fullName || user?.name || "",
            [`${levelKey}_approver_user_id`]: user?.id || user?.employee_id || user?.employeeId || "",
        }).filter(([, value]) => String(value || "").trim())
    );
};

const serializeQuery = (query) =>
    Object.entries(query || {})
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, value]) => `${key}:${String(value || "").trim()}`)
        .join("|");

const getUserLoadKey = (user) =>
    [
        user?.id,
        user?.employee_id,
        user?.employeeId,
        user?.emp_id,
        user?.full_name,
        user?.fullName,
        user?.name,
        user?.username,
        user?.role,
        user?.role_name,
        user?.roleName,
    ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join("|");

const getUserDisplayName = (user) => String(user?.name || user?.full_name || user?.fullName || user?.username || "").trim();

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
            userItem?.emp_id,
            userItem?.name,
            userItem?.full_name,
            userItem?.fullName,
            userItem?.username,
            userItem?.email,
        ];

        return candidateValues.some((candidate) => normalizeLookupValue(candidate) === normalizedValue);
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

const getUsersDisplayNames = (userList) =>
    (Array.isArray(userList) ? userList : [])
        .map((user) => getUserDisplayName(user))
        .filter(Boolean);

const getNotebookSupervisorName = (notebook, users = []) => {
    // Once a notebook has actually been acknowledged, acknowledged_by_name is the ground truth
    // for who checked it - the pre-assignment (assigned_l2_users etc., checked below) may be
    // empty on older rows that predate the L4 approver-resolution fix, even though the
    // acknowledgement itself went through fine. Prefer the real acknowledger whenever it's set.
    const acknowledgedByName = String(notebook?.acknowledged_by_name || notebook?.acknowledgedByName || "").trim();
    if (acknowledgedByName) return acknowledgedByName;

    // The backend actually resolves the L2 approver(s) into notebook.assigned_l2_users — full
    // {id, employee_id, full_name, level, role} objects, not any of the flat approval_l2_name /
    // supervisor_name / l2_approver_name style fields below (those were never populated on a
    // submitted_notebooks row; they only ever existed on a separate submission-threshold config
    // table). Check the real field first before falling back to the legacy guesses.
    // Checked in L5->L2 order: a notebook escalated up to L4/L5 for approval
    // should show the person it's actually sitting with now, not whichever
    // lower level it passed through first.
    const assignedL5Names = getUsersDisplayNames(notebook?.assigned_l5_users);
    if (assignedL5Names.length) return assignedL5Names.join(", ");

    const assignedL4Names = getUsersDisplayNames(notebook?.assigned_l4_users);
    if (assignedL4Names.length) return assignedL4Names.join(", ");

    const assignedL3Names = getUsersDisplayNames(notebook?.assigned_l3_users);
    if (assignedL3Names.length) return assignedL3Names.join(", ");

    const assignedL2Names = getUsersDisplayNames(notebook?.assigned_l2_users);
    if (assignedL2Names.length) return assignedL2Names.join(", ");

    const names = resolveDisplayValues(users, [
        ...normalizeNameList(notebook?.approval_l2_name),
        ...normalizeNameList(notebook?.approval_l2_names),
        ...normalizeNameList(notebook?.approvalL2Name),
        ...normalizeNameList(notebook?.approvalL2Names),
        ...normalizeNameList(notebook?.approved_by_name),
        ...normalizeNameList(notebook?.approvedByName),
        ...normalizeNameList(notebook?.supervisor_name),
        ...normalizeNameList(notebook?.supervisorName),
        ...normalizeNameList(notebook?.l2_supervisor_name),
        ...normalizeNameList(notebook?.l2SupervisorName),
        ...normalizeNameList(notebook?.l2_approver_name),
        ...normalizeNameList(notebook?.l2_approver_names),
        ...normalizeNameList(notebook?.l2ApproverName),
        ...normalizeNameList(notebook?.l2ApproverNames),
        ...normalizeNameList(notebook?.created_by_name),
        ...normalizeNameList(notebook?.createdByName),
        ...normalizeNameList(notebook?.updated_by_name),
        ...normalizeNameList(notebook?.updatedByName),
    ]);
    if (names.length) return names[0];

    const ids = resolveDisplayValues(users, [
        ...normalizeNameList(notebook?.approval_l2),
        ...normalizeNameList(notebook?.approval_l2_employee_id),
        ...normalizeNameList(notebook?.approvalL2EmployeeId),
        ...normalizeNameList(notebook?.approval_l2_user_id),
        ...normalizeNameList(notebook?.approval_l2_user_ids),
        ...normalizeNameList(notebook?.l2_approver_employee_id),
        ...normalizeNameList(notebook?.l2ApproverEmployeeId),
        ...normalizeNameList(notebook?.l2_approver_user_id),
        ...normalizeNameList(notebook?.l2_approver_user_ids),
    ]);
    if (ids.length) return ids[0];

    const rawNames = [
        ...normalizeNameList(notebook?.approval_l2_name),
        ...normalizeNameList(notebook?.approval_l2_names),
        ...normalizeNameList(notebook?.approvalL2Name),
        ...normalizeNameList(notebook?.approvalL2Names),
        ...normalizeNameList(notebook?.approved_by_name),
        ...normalizeNameList(notebook?.approvedByName),
        ...normalizeNameList(notebook?.supervisor_name),
        ...normalizeNameList(notebook?.supervisorName),
        ...normalizeNameList(notebook?.l2_supervisor_name),
        ...normalizeNameList(notebook?.l2SupervisorName),
        ...normalizeNameList(notebook?.l2_approver_name),
        ...normalizeNameList(notebook?.l2_approver_names),
        ...normalizeNameList(notebook?.l2ApproverName),
        ...normalizeNameList(notebook?.l2ApproverNames),
        ...normalizeNameList(notebook?.created_by_name),
        ...normalizeNameList(notebook?.createdByName),
        ...normalizeNameList(notebook?.updated_by_name),
        ...normalizeNameList(notebook?.updatedByName),
    ];
    if (rawNames.length) return rawNames[0];

    const rawIds = [
        ...normalizeNameList(notebook?.approval_l2),
        ...normalizeNameList(notebook?.approval_l2_employee_id),
        ...normalizeNameList(notebook?.approvalL2EmployeeId),
        ...normalizeNameList(notebook?.approval_l2_user_id),
        ...normalizeNameList(notebook?.approval_l2_user_ids),
        ...normalizeNameList(notebook?.l2_approver_employee_id),
        ...normalizeNameList(notebook?.l2ApproverEmployeeId),
        ...normalizeNameList(notebook?.l2_approver_user_id),
        ...normalizeNameList(notebook?.l2_approver_user_ids),
    ];
    return rawIds[0] || "--";
};

const getNotebookOperatorName = (notebook, users = []) => {
    const names = resolveDisplayValues(users, [
        ...normalizeNameList(notebook?.operator_name),
        ...normalizeNameList(notebook?.operatorName),
        ...normalizeNameList(notebook?.submitted_by_name),
        ...normalizeNameList(notebook?.submittedByName),
    ]);
    if (names.length) return names[0];

    const ids = resolveDisplayValues(users, [
        ...normalizeNameList(notebook?.submitted_by_user_id),
        ...normalizeNameList(notebook?.submittedByUserId),
        ...normalizeNameList(notebook?.submitted_user_id),
        ...normalizeNameList(notebook?.submittedUserId),
        ...normalizeNameList(notebook?.user_id),
        ...normalizeNameList(notebook?.userId),
    ]);
    if (ids.length) return ids[0];

    const rawNames = [
        ...normalizeNameList(notebook?.operator_name),
        ...normalizeNameList(notebook?.operatorName),
        ...normalizeNameList(notebook?.submitted_by_name),
        ...normalizeNameList(notebook?.submittedByName),
    ];
    return rawNames[0] || "--";
};

const getNotebookTitle = (notebook) => {
    const payload = getPayload(notebook);
    return (
        notebook?.notebook_name ||
        notebook?.notebookName ||
        notebook?.notebook ||
        notebook?.title ||
        payload?.notebook_name ||
        "Cotton HVI"
    );
};

const getNotebookApprovalName = (notebook) => {
    const names = [
        ...normalizeNameList(notebook?.approval_l4_name),
        ...normalizeNameList(notebook?.approval_l4_names),
        ...normalizeNameList(notebook?.l4_approver_name),
        ...normalizeNameList(notebook?.l4_approver_names),
        ...normalizeNameList(notebook?.l4ApproverName),
        ...normalizeNameList(notebook?.l4ApproverNames),
        // Legacy fallback for already-saved rows that only ever got an L2 name.
        ...normalizeNameList(notebook?.approval_l2_name),
        ...normalizeNameList(notebook?.approval_l2_names),
        ...normalizeNameList(notebook?.l2_approver_name),
        ...normalizeNameList(notebook?.l2_approver_names),
        ...normalizeNameList(notebook?.l2ApproverName),
        ...normalizeNameList(notebook?.l2ApproverNames),
    ];
    return names[0] || "--";
};

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
        notebook?.notebook ||
        notebook?.input_screen ||
        notebook?.inputScreen ||
        notebook?.title
    );

    if (name.includes("cotton") || name.includes("hvi")) return "/mixing/cotton-hvi";
    if (name.includes("afis-6") || name.includes("afis6")) return "/mixing/afis6-cotton";
    if (name.includes("fibre") || name.includes("fiber")) return "/mixing/fibre";
    if (name.includes("afis")) return "/mixing/afis";
    if (name.includes("moisture")) return "/mixing/moisture";
    if (name.includes("openness")) return "/mixing/openness";

    return "";
};

const getNotebookScreenName = (notebook) => {
    const payload = getPayload(notebook);
    return (
        notebook?.notebook_name ||
        notebook?.notebookName ||
        notebook?.input_screen ||
        notebook?.inputScreen ||
        notebook?.title ||
        payload?.notebook_name ||
        payload?.notebookName ||
        payload?.title ||
        payload?.input_screen ||
        payload?.inputScreen ||
        ""
    );
};

const inferDepartmentByScreenName = (screenName) => {
    const normalized = normalizeLookupValue(screenName);
    if (!normalized) return null;

    if (
        normalized.includes("cotton") ||
        normalized.includes("hvi") ||
        normalized.includes("fibre") ||
        normalized.includes("fiber") ||
        normalized.includes("afis") ||
        normalized.includes("moisture") ||
        normalized.includes("openness")
    ) {
        return { department: "Quality Control", subDepartment: "Mixing" };
    }

    if (
        normalized.includes("blow room") ||
        normalized.includes("blowroom") ||
        normalized.includes("drop test") ||
        normalized.includes("br waste") ||
        normalized.includes("sync")
    ) {
        return { department: "Quality Control", subDepartment: "Blow Room" };
    }

    if (
        normalized.includes("card") ||
        normalized.includes("nati") ||
        normalized.includes("wheelchange") ||
        normalized.includes("card thick")
    ) {
        return { department: "Quality Control", subDepartment: "Carding" };
    }

    if (normalized.includes("ribbon") || normalized.includes("comber")) {
        return { department: "Quality Control", subDepartment: "Comber" };
    }

    if (normalized.includes("draw frame") || normalized.includes("breaker") || normalized.includes("finisher")) {
        return { department: "Quality Control", subDepartment: "Draw Frame" };
    }

    if (normalized.includes("simplex")) {
        return { department: "Quality Control", subDepartment: "Simplex" };
    }

    if (normalized.includes("spinning") || normalized.includes("ring frame") || normalized.includes("wheel change") || normalized.includes("speed checking") || normalized.includes("bottom apron")) {
        return { department: "Quality Control", subDepartment: "Spinning" };
    }

    if (normalized.includes("autoconer") || normalized.includes("rewinding") || normalized.includes("cone")) {
        return { department: "Quality Control", subDepartment: "Autoconer" };
    }

    return null;
};

const resolveNotebookDepartment = (notebook) => {
    const payload = getPayload(notebook);
    const explicitDepartment =
        notebook?.department ||
        notebook?.department_name ||
        notebook?.departmentName ||
        payload?.department ||
        payload?.department_name ||
        payload?.departmentName ||
        "";
    const explicitSubDepartment =
        notebook?.sub_department ||
        notebook?.subDepartment ||
        notebook?.sub_department_name ||
        notebook?.subDepartmentName ||
        payload?.sub_department ||
        payload?.subDepartment ||
        payload?.sub_department_name ||
        payload?.subDepartmentName ||
        "";
    const screenName = getNotebookScreenName(notebook);
    const inferred = inferDepartmentByScreenName(screenName);

    if (inferred) {
        const normalizedExplicitSub = normalizeLookupValue(explicitSubDepartment);
        const normalizedExplicitDept = normalizeLookupValue(explicitDepartment);

        if (!normalizedExplicitDept && !normalizedExplicitSub) {
            return inferred;
        }

        if (
            inferred.subDepartment === "Mixing" &&
            normalizedExplicitSub &&
            !["mixing", "mixing department"].includes(normalizedExplicitSub)
        ) {
            return inferred;
        }

        if (
            inferred.subDepartment === "Blow Room" &&
            normalizedExplicitSub &&
            !["blow room", "blowroom"].includes(normalizedExplicitSub)
        ) {
            return inferred;
        }
    }

    return {
        department: explicitDepartment || "Quality Control",
        subDepartment: explicitSubDepartment || "Mixing Department",
    };
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

// The wrapping-schema PDF-report notebooks (A%, Comber Nolis %, Simplex Stretch % - see
// draw-frame.js/wrapping.jsx and PdfOcrTableEntry.jsx's OCR_REPORT_CONFIG) each save their
// whole extracted report as a flat bag of fields rather than the generic field list every
// other notebook uses - the generic renderer used to stringify or scatter that into a wall
// of unreadable individual cards. This reconstructs each one back into the same shape its
// own entry-time preview shows (a Meta field grid plus Sample/Summary Rows tables), by
// detecting the actual saved shape structurally - not by notebook name, since a mismatched
// name is exactly the class of bug this app keeps hitting - so it recovers correctly even
// if a report gains/drops a column.
const OCR_META_FIELD_LABELS = {
    entryId: "Entry ID",
    pdfFile: "PDF File",
    reportTitle: "Report",
    testId: "Test ID",
    machine: "Machine",
    countSystem: "Count System",
    lengthUnit: "Length Unit",
    length: "Length",
    totalTest: "Total Test",
    standardAPercent: "Standard A%",
    aPercentNMinus1: "A% (N-1)",
    aPercentNPlus1: "A% (N+1)",
    date: "Date",
    tester: "Tester",
    shift: "Shift",
    process: "Process",
    remark: "Remark",
    // Comber Nolis % / Simplex Stretch % flatten their meta fields at the top level
    // (or under a "table_N_" prefix, stripped before these labels are looked up).
    entry_id: "Entry ID",
    pdf_file: "PDF File",
    test_id: "Test ID",
    machine_id: "Machine ID",
    total_test: "Total Test",
    std_noils: "Std. Noils %",
    noils: "Noils %",
    number_of_entries_n: "Number of Entries (N)",
    ocr_rows: "OCR Rows",
    type: "Type",
    lot_no: "Lot No.",
    std_stretch: "Std. Stretch %",
    stretch: "Stretch %",
};

const OCR_ROW_COLUMN_ORDER = [
    "sampleNo", "sample_no", "label", "nMinus1", "n", "nPlus1",
    "sliver_wt", "noils_wt", "noils", "initial_bobbin", "full_bobbin",
];
const OCR_ROW_COLUMN_LABELS = {
    sampleNo: "Sample No",
    sample_no: "Sample No",
    label: "Label",
    nMinus1: "N-1",
    n: "N",
    nPlus1: "N+1",
    sliver_wt: "Sliver Wt",
    noils_wt: "Noils Wt",
    noils: "Noils %",
    initial_bobbin: "Initial Bobbin",
    full_bobbin: "Full Bobbin",
};

const getOcrRowColumns = (rows) => {
    const keys = Array.from(
        rows.reduce((set, row) => {
            if (row && typeof row === "object") Object.keys(row).forEach((key) => set.add(key));
            return set;
        }, new Set())
    );
    const ordered = OCR_ROW_COLUMN_ORDER.filter((key) => keys.includes(key));
    const rest = keys.filter((key) => !OCR_ROW_COLUMN_ORDER.includes(key));
    return [...ordered, ...rest];
};

// Comber Nolis % / Stretch % save each sample reading as "sample_<index>_<metric>" keys
// (e.g. sample_1_sliver_wt, sample_2_noils) instead of a real array - this regroups them
// back into one row object per index, keyed by whatever metric suffixes actually exist.
const reconstructIndexedSampleRows = (source, prefix) => {
    const indices = new Set();
    const indexPattern = new RegExp(`^${prefix}(\\d+)_`);
    Object.keys(source).forEach((key) => {
        const match = key.match(indexPattern);
        if (match) indices.add(Number(match[1]));
    });

    return Array.from(indices)
        .sort((a, b) => a - b)
        .map((index) => {
            const rowPrefix = `${prefix}${index}_`;
            const row = {};
            Object.entries(source).forEach(([key, value]) => {
                if (key.startsWith(rowPrefix)) row[key.slice(rowPrefix.length)] = value;
            });
            return row;
        });
};

// Same idea for summary rows, but each is identified by a "summary_<type>_label" key
// (e.g. summary_cv_label = "CV") rather than a numeric index - that label key is the
// reliable anchor for finding the summary "type" slug, since the slug itself
// (e.g. "weight_max", "average_weight") isn't otherwise unambiguous to split out.
const reconstructLabeledSummaryRows = (source, prefix) => {
    const types = [];
    const labelPattern = new RegExp(`^${prefix}(.+)_label$`);
    Object.keys(source).forEach((key) => {
        const match = key.match(labelPattern);
        if (match) types.push(match[1]);
    });

    return types.map((type) => {
        const rowPrefix = `${prefix}${type}_`;
        const row = {};
        Object.entries(source).forEach(([key, value]) => {
            if (key.startsWith(rowPrefix)) row[key.slice(rowPrefix.length)] = value;
        });
        return row;
    });
};

// Every notebook-specific custom section below (Carding Between & Within, Card DFK, this OCR
// group, ...) builds its own "meta" leftover-fields list straight off the raw payload, bypassing
// the generic buildFieldCards()/addDisplayField() path entirely - so each one needs its own check
// to keep internal bookkeeping keys like __field_labels (see previewItemsToPayload in
// submittedNotebookRecorder.js) from leaking through as a literal "Field Labels" card.
const isDisplayableMetaKey = (key) => !META_FIELD_KEYS.has(normalizeKey(key));

const buildFlatOcrGroup = (source, title = "") => {
    const sampleRows = reconstructIndexedSampleRows(source, "sample_");
    const summaryRows = reconstructLabeledSummaryRows(source, "summary_");
    if (!sampleRows.length && !summaryRows.length) return null;

    const metaEntries = Object.entries(source).filter(([key, value]) => {
        if (/^sample_\d+_/.test(key) || /^summary_.+_/.test(key)) return false;
        return isDisplayableMetaKey(key) && value !== undefined && value !== null && value !== "";
    });

    return { title, metaEntries, sampleRows, summaryRows };
};

// Returns an array of report groups (almost always one - Stretch %'s "table_1_"/"table_2_"
// split is the only notebook type that saves more than one report per entry) rather than a
// single object, so a multi-table report renders as one Meta+Sample+Summary section per
// table instead of merging two unrelated tables' rows together.
const getOcrReportSections = (notebook) => {
    const payload = getPayload(notebook);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

    // A%'s own already-structured shape: { meta: {...}, sample_rows: [...], summary_rows: [...] }.
    if (payload.meta && typeof payload.meta === "object" && !Array.isArray(payload.meta)) {
        const sampleRows = Array.isArray(payload.sample_rows) ? payload.sample_rows : [];
        const summaryRows = Array.isArray(payload.summary_rows) ? payload.summary_rows : [];
        if (sampleRows.length || summaryRows.length) {
            return [{
                title: "",
                metaEntries: Object.entries(payload.meta).filter(
                    ([key, value]) => isDisplayableMetaKey(key) && value !== undefined && value !== null && value !== ""
                ),
                sampleRows,
                summaryRows,
            }];
        }
    }

    // Stretch %'s two-table flattened report.
    const tableIndices = new Set();
    Object.keys(payload).forEach((key) => {
        const match = key.match(/^table_(\d+)_/);
        if (match) tableIndices.add(Number(match[1]));
    });
    if (tableIndices.size) {
        const groups = Array.from(tableIndices)
            .sort((a, b) => a - b)
            .map((index) => {
                const prefix = `table_${index}_`;
                const source = {};
                Object.entries(payload).forEach(([key, value]) => {
                    if (key.startsWith(prefix)) source[key.slice(prefix.length)] = value;
                });
                return buildFlatOcrGroup(source, `Table ${index}`);
            })
            .filter(Boolean);
        if (groups.length) return groups;
    }

    // Comber Nolis %'s single flattened report.
    const singleGroup = buildFlatOcrGroup(payload);
    if (singleGroup) return [singleGroup];

    return null;
};

// Carding's Between & Within Card Data Entry screen (see betweenWithinCardEntry.jsx) isn't
// a PDF-report import at all - it's a plain data-entry form - but it saves the same way:
// "row_<index>_hank"/"row_<index>_sample_weight" per entry, plus
// "hank_calculations_<stat>"/"sample_weight_calculations_<stat>" for the two computed-stats
// panels the screen itself shows. Reconstructed to match THAT screen's own layout (an
// entries table, then the two calculation panels) rather than the OCR preview layout above,
// per the actual UI it's meant to mirror.
const CARDING_STAT_FIELDS = [
    { key: "avg", label: "Avg" },
    { key: "max", label: "Max" },
    { key: "min", label: "Min" },
    { key: "range", label: "Range" },
    { key: "sd", label: "SD" },
    { key: "cv", label: "CV" },
];

const getCardingBetweenWithinSections = (notebook) => {
    const payload = getPayload(notebook);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

    const rowIndices = new Set();
    Object.keys(payload).forEach((key) => {
        const match = key.match(/^row_(\d+)_(hank|sample_weight)$/);
        if (match) rowIndices.add(Number(match[1]));
    });
    if (!rowIndices.size) return null;

    const entryRows = Array.from(rowIndices)
        .sort((a, b) => a - b)
        .map((index) => ({
            Row: String(index),
            "Sample Weight": payload[`row_${index}_sample_weight`] ?? "-",
            Hank: payload[`row_${index}_hank`] ?? "-",
        }));

    const buildStatsEntries = (prefix) =>
        CARDING_STAT_FIELDS.map(({ key, label }) => [label, payload[`${prefix}_calculations_${key}`]]).filter(
            ([, value]) => value !== undefined && value !== null && value !== ""
        );

    const consumedKeys = new Set();
    Object.keys(payload).forEach((key) => {
        if (/^row_\d+_(hank|sample_weight)$/.test(key) || /^(hank|sample_weight)_calculations_/.test(key)) {
            consumedKeys.add(key);
        }
    });
    const metaEntries = Object.entries(payload).filter(
        ([key, value]) =>
            !consumedKeys.has(key) && isDisplayableMetaKey(key) && value !== undefined && value !== null && value !== ""
    );

    return {
        metaEntries,
        entryRows,
        sampleWeightStats: buildStatsEntries("sample_weight"),
        hankStats: buildStatsEntries("hank"),
    };
};

// Card DFK Data (cardingdfk.jsx) has no dedicated detail-fetch endpoint of its own - it
// records straight to submitted_notebooks as a flat "<machine> <column label>" list
// (see submittedNotebookItems in cardingdfk.jsx), which the generic buildFieldCards fallback
// below turned into one field card per machine/column cell instead of the per-machine table
// the entry screen itself shows. Reconstructed here by grouping those flattened keys back by
// machine, same approach as getCardingBetweenWithinSections above.
const CARD_DFK_COLUMNS = [
    { key: "dfk", label: "DFK" },
    { key: "ccd", label: "CCD" },
    { key: "icfd_1", label: "ICFD (1)" },
    { key: "lt", label: "LT" },
    { key: "cds", label: "CDS" },
    { key: "silver_draft", label: "SILVER DRAFT" },
    { key: "icfd_2", label: "ICFD (2)" },
    { key: "idf_in", label: "IDF IN" },
    { key: "idf_out", label: "IDF OUT" },
    { key: "al_on", label: "AL ON" },
];

const getCardDfkSections = (notebook) => {
    const payload = getPayload(notebook);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

    const machinePrefixes = [];
    Object.keys(payload).forEach((key) => {
        const match = key.match(/^(.+)_machine_name$/);
        if (match) machinePrefixes.push(match[1]);
    });
    if (!machinePrefixes.length) return null;

    const rows = machinePrefixes.map((prefix) => ({
        machine: payload[`${prefix}_machine_name`] ?? prefix,
        values: CARD_DFK_COLUMNS.map(({ key, label }) => ({ label, value: payload[`${prefix}_${key}`] ?? "-" })),
    }));

    const consumedKeys = new Set();
    machinePrefixes.forEach((prefix) => {
        consumedKeys.add(`${prefix}_machine_name`);
        CARD_DFK_COLUMNS.forEach(({ key }) => consumedKeys.add(`${prefix}_${key}`));
    });
    const metaEntries = Object.entries(payload).filter(
        ([key, value]) =>
            !consumedKeys.has(key) && isDisplayableMetaKey(key) && value !== undefined && value !== null && value !== ""
    );

    return { metaEntries, rows };
};

// Thick place & CV (cardThickPlaceEntry.jsx) flattens its one-row-per-machine grid (machine,
// Card Thick Place Value, 5m CV) into two preview items per machine - "<machine> (5m CV 1)" /
// "<machine> (5m CV 2)" - which the generic fallback then shows as one flat card per value
// (~50 cards for 25 machines) instead of the entry screen's own table. Reconstructed here the
// same way as getCardDfkSections/getCardingBetweenWithinSections above, grouping the two
// suffixed keys back together per machine.
const THICK_PLACE_VALUE_SUFFIXES = [
    { keySuffix: "_5m_cv_1", labelSuffix: /\(?\s*5m\s*cv\s*1\)?$/i, column: "Card Thick Place Value" },
    { keySuffix: "_5m_cv_2", labelSuffix: /\(?\s*5m\s*cv\s*2\)?$/i, column: "5m CV" },
];

const getCardThickPlaceSections = (notebook) => {
    const payload = getPayload(notebook);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

    const fieldLabelOverrides = parseJsonValue(payload.__field_labels) || {};
    const consumedKeys = new Set();
    const machineSlugs = [];

    Object.keys(payload).forEach((key) => {
        const match = THICK_PLACE_VALUE_SUFFIXES.find(({ keySuffix }) => key.endsWith(keySuffix));
        if (!match) return;
        consumedKeys.add(key);
        const machineSlug = key.slice(0, key.length - match.keySuffix.length);
        if (machineSlug && !machineSlugs.includes(machineSlug)) machineSlugs.push(machineSlug);
    });
    if (!machineSlugs.length) return null;

    const rows = machineSlugs.map((machineSlug) => {
        const machineLabel = THICK_PLACE_VALUE_SUFFIXES.reduce((label, { keySuffix, labelSuffix }) => {
            if (label) return label;
            const rawLabel = fieldLabelOverrides[`${machineSlug}${keySuffix}`];
            return rawLabel ? String(rawLabel).replace(labelSuffix, "").trim() : "";
        }, "") || formatTitle(machineSlug);

        return {
            machine: machineLabel,
            values: THICK_PLACE_VALUE_SUFFIXES.map(({ keySuffix, column }) => ({
                label: column,
                value: payload[`${machineSlug}${keySuffix}`] ?? "-",
            })),
        };
    });

    const metaEntries = Object.entries(payload).filter(
        ([key, value]) =>
            !consumedKeys.has(key) && isDisplayableMetaKey(key) && value !== undefined && value !== null && value !== ""
    );

    return { metaEntries, rows };
};

// Ring Frame Log Book (spinning.js's isRingFrame branch) actually records its own
// structured {rows, summary} payload (see the isRingFrame block building `rows`/`summary`
// in spinning.js) rather than the flattened "MC <no> - <field>" previewItems list that
// feeds the generic submitted_notebooks record for other screens - so unlike Card DFK,
// this one is read straight off payload.rows/payload.summary instead of reconstructed from
// flattened keys.
// Labels match the entry screen's own <th> text exactly (spinning.js's isRingFrame table
// header row) - "Mc.No"/"Bobbin"/bare "1".."6", not the friendlier names used elsewhere.
const RING_FRAME_ROW_FIELDS = [
    { key: "mc_no", label: "Mc.No" },
    { key: "lycra", label: "Lycra" },
    { key: "bobbin_color", label: "Bobbin" },
    { key: "spindle_1", label: "1" },
    { key: "spindle_2", label: "2" },
    { key: "spindle_3", label: "3" },
    { key: "spindle_4", label: "4" },
    { key: "spindle_5", label: "5" },
    { key: "spindle_6", label: "6" },
    { key: "guide_roll_lapping", label: "Guide Roll Lapping" },
    { key: "lycra_missing", label: "Lycra Missing" },
    { key: "others", label: "Others" },
    { key: "total", label: "Total" },
];

// Matches the ring frame summary box's own <label> text exactly (spinning.js's
// ringFrameSummaryGrid/ringFrameExtraSummaryGrid) - out_of_center/fault_cops (the combined
// AC+RF totals) and lycra_missing_rf are computed into `summary` but never actually shown as
// their own field on screen, so they're left out here rather than inventing labels for them.
const RING_FRAME_SUMMARY_LABELS = {
    out_of_center_ac: "Out of Center AC",
    out_of_center_rf: "Out of Center RF",
    fault_cops_ac: "Fault Cops AC",
    fault_cops_rf: "Fault Cops RF",
    total_cops_ac: "Total Cops AC",
    total_cops_rf: "Total Cops RF",
    total_cops: "Grand Total",
    guide_roll_total: "Guide Roll",
    lycra_missing: "Lycra Missing",
    others_total: "Others",
    comments: "Comments",
};

const RING_FRAME_META_LABELS = {
    entry_id: "Entry ID",
    entry_date: "Date",
    checker_name: "Checker Name",
    shift: "Shift",
};

const getRingFrameSections = (notebook) => {
    const payload = getPayload(notebook);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

    const rawRows = Array.isArray(payload.rows) ? payload.rows : null;
    if (!rawRows || !rawRows.length || !rawRows.every((row) => row && typeof row === "object" && "mc_no" in row)) {
        return null;
    }

    const rows = rawRows.map((row) => ({
        machine: row.mc_no ?? "-",
        values: RING_FRAME_ROW_FIELDS.slice(1).map(({ key, label }) => ({ label, value: row[key] ?? "-" })),
    }));

    const metaEntries = Object.entries(RING_FRAME_META_LABELS)
        .map(([key, label]) => [label, payload[key]])
        .filter(([, value]) => value !== undefined && value !== null && value !== "");

    const summary = payload.summary && typeof payload.summary === "object" ? payload.summary : {};
    const summaryEntries = Object.entries(RING_FRAME_SUMMARY_LABELS)
        .map(([key, label]) => [label, summary[key]])
        .filter(([, value]) => value !== undefined && value !== null && value !== "");

    return { metaEntries, rows, summaryEntries };
};

// SMX Breaks Study Report (SMXBreaksStudyReport.jsx) does NOT go through buildStudyPayload
// for its submitted_notebooks record - that structured {items, other_field_values} shape only
// ever reaches POST /simplex/study (a separate relational-table write, smx_breaks_study_header/
// smx_breaks_inspection_items). The submitted_notebooks record instead comes from the parent
// simplex.js wrapper calling recordSubmittedNotebook with childRef.current.getPreviewData()'s
// flat {label, value} list (see getPreviewData in SMXBreaksStudyReport.jsx) - same flattening
// mechanism as Card DFK/Ring Frame, keyed by previewItemsToPayload's slugified label. Matrix
// cells are looked up by recomputing that exact slug per row/column instead of trying to parse
// it back out of the flattened key (the row label's own "801 - 1000" already contains the same
// " - " separator the row/column join uses, so a parse can't tell them apart reliably).
const SMX_BREAK_COLUMNS = [
    "Roving Breaks at Finger",
    "Roving Breaks at Front Roller Nip",
    "Roving Breaks at Between Flyer",
    "Undraft",
    "Top Roller Lapping",
    "Bottom Roller Lapping",
    "SLIVER BREAKS",
    "Can Exhaust",
    "Unknown Stop",
];

const SMX_BREAK_ROWS_ORDER = [
    "0 - 200", "201 - 400", "401 - 600", "601 - 800", "801 - 1000", "1001 - 1200",
    "1201 - 1400", "1401 - 1600", "1601 - 1800", "1801 - 2000", "2001 - 2200",
    "2201 - 2400", "2401 - 2600",
];

// Matches SMXBreaksStudyReport.jsx's own header field list (its `form` state / formFields
// array) so the preview's Meta section shows the same fields the entry screen does.
const SMX_META_LABELS = {
    type: "Type",
    entry_id: "Entry ID",
    simplex_no: "Simplex No",
    start_time: "Start Time",
    end_time: "End Time",
    total_minutes: "Total Minutes",
    tpi: "TPI",
    tpm: "TPM",
    start_hk: "Start Hank",
    finish_hk: "Finish Hank",
    average_speed: "Average Speed",
    hank: "Hank",
    mixing: "Mixing",
    roving_hk: "Roving HK",
    doff_length: "Doff Length",
    rh: "RH%",
    temp: "TEMP%",
    tt_spdl: "Total Spindles",
    running_spdl: "Running Spindles",
    ideals: "Idle Spindles",
    s_name: "Sider Name",
};

// Mirrors previewItemsToPayload's own transform (submittedNotebookRecorder.js) exactly, so a
// recomputed label always lands on the same key that recording used.
const slugifySmxLabel = (label) =>
    String(label || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

const getSmxBreaksStudySections = (notebook) => {
    const payload = getPayload(notebook);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

    const matrix = {};
    const rows = SMX_BREAK_ROWS_ORDER.filter((row) =>
        SMX_BREAK_COLUMNS.some((column) => {
            const value = payload[slugifySmxLabel(`${row} - ${column}`)];
            if (value === undefined || value === null || value === "") return false;
            matrix[row] = matrix[row] || {};
            matrix[row][column] = value;
            return true;
        })
    );
    if (!rows.length) return null;

    const metaEntries = Object.entries(SMX_META_LABELS)
        .map(([key, label]) => [label, payload[key]])
        .filter(([, value]) => value !== undefined && value !== null && value !== "");

    const columnTotals = {};
    SMX_BREAK_COLUMNS.forEach((column) => {
        const totalValue = payload[slugifySmxLabel(`Total Breaks - ${column}`)];
        if (totalValue !== undefined && totalValue !== null && totalValue !== "") columnTotals[column] = totalValue;
    });

    // "No. of Breaks 100 Spindles/HR" only ever covers the 7 columns through SLIVER BREAKS on
    // the entry screen itself (percentageBreakColumns in SMXBreaksStudyReport.jsx) - Can
    // Exhaust/Unknown Stop have no percentage cell there, so this matches that same subset
    // instead of all 9 columns.
    const percentageColumns = SMX_BREAK_COLUMNS.slice(0, SMX_BREAK_COLUMNS.indexOf("SLIVER BREAKS") + 1);
    const columnBreaksPer100Sh = {};
    percentageColumns.forEach((column) => {
        const percentValue = payload[slugifySmxLabel(`Breaks % - ${column}`)];
        if (percentValue !== undefined && percentValue !== null && percentValue !== "") columnBreaksPer100Sh[column] = percentValue;
    });

    const grandTotal = payload[slugifySmxLabel("Total Breaks (Grand)")];
    const totalBreaksPer100Sh = payload[slugifySmxLabel("Total No. of Breaks/100SH")];

    return { matrix, rows, columns: SMX_BREAK_COLUMNS, percentageColumns, metaEntries, columnTotals, columnBreaksPer100Sh, grandTotal, totalBreaksPer100Sh };
};

// Individual Card Performance (trialsDataEntry.jsx) saves its ~65 fields as one flat object
// via buildTrialsPayload() - the generic fallback below turned that into a wall of ~50+
// individual field cards with awkward raw-key labels (cp/a1/df_drg_mc_no/...) instead of the
// entry screen's own sectioned layout (Draw Frame, Simplex, Cuts and Imperfection Parameters,
// User Tester Parameters, IPI Regular/Higher Sensitive, Other IPI/Final). Reconstructed here
// the same way as the other custom sections above, grouping the flat keys back into the
// entry screen's own section tables.
const TRIALS_META_LABELS = {
    mc_no: "Carding Machine No.",
    spinning_machine: "Spinning Machine Name",
    autoconer_machine: "Autoconer Machine Name",
    count_name: "Count Name",
    product: "Product",
    trial_type: "Type (Trial/Sample)",
    nature: "Nature of Trials/Sample",
    raw_material_mixing: "Raw Material / Mixing",
};

const TRIALS_GROUPS = [
    {
        title: "Draw Frame",
        fields: [["Drg Mc. No.", "df_drg_mc_no"], ["Finish U%", "df_finish_u_percent"], ["CVIM", "df_cvim"], ["CVB", "df_cvb"]],
    },
    {
        title: "Simplex",
        fields: [["SMX No.", "smx_no"], ["SPL No.", "spl_no"], ["Roving%", "roving_percent"], ["CVIM", "smx_cvim"]],
    },
    {
        title: "Cuts Summary",
        fields: [["Total Cuts", "total_cuts"], ["Neps Cuts", "neps_cuts"], ["Short Cuts", "shorts_cuts"], ["Long Cuts", "long_cuts"], ["Thin Cuts", "thin_cuts"]],
    },
    {
        title: "Cuts and Imperfection Parameters",
        fields: [
            ["CP", "cp"], ["CM", "cm"], ["CCP", "ccp"], ["CCM", "ccm"], ["JP", "jp"], ["JM", "jm"],
            ["A1", "a1"], ["A2", "a2"], ["A3", "a3"], ["A4", "a4"],
            ["B1", "b1"], ["B2", "b2"], ["B3", "b3"], ["B4", "b4"],
            ["C1", "c1"], ["C2", "c2"], ["C3", "c3"], ["C4", "c4"],
            ["D1", "d1"], ["D2", "d2"], ["D3", "d3"], ["D4", "d4"],
            ["E", "e"], ["F", "f"], ["G", "g"], ["H1", "h1"], ["H2", "h2"],
            ["I1", "l1"], ["I2", "l2"], ["CVB", "cvb"], ["FL CUT", "fl_cut"], ["FD CUT", "fd_cut"],
        ],
    },
    {
        title: "User Tester Parameters",
        fields: [["User ID", "user_id"], ["U%", "u_percent"], ["CVM", "cvm"], ["CVM cv%", "cvm_cv_percent"], ["CVM 10 mtr", "cvm_10mtr"], ["DR 1.5m", "dr_1_5m"]],
    },
    {
        title: "IPI Parameters - Regular",
        fields: [["Thin -50%", "thin_minus_50"], ["Thick +50%", "thick_plus_50"], ["Neps +200%", "neps_plus_200"], ["Total (Regular)", "total_regular"]],
    },
    {
        title: "IPI Parameters - Higher Sensitive",
        fields: [["Thin -40%", "thin_minus_40"], ["Thick +35%", "thick_plus_35"], ["Neps +140%", "neps_plus_140"], ["Total (HS)", "total_hs"]],
    },
    {
        title: "Other IPI / Final Values",
        fields: [["Thin -30%", "thin_minus_30"], ["Count", "yarn_count"], ["CSP", "csp"]],
    },
    {
        title: "Yarn Results & Remarks",
        fields: [["Yarn Results", "yarn_results"], ["Yarn Remarks", "yarn_remarks"]],
    },
];

const getTrialsSections = (notebook) => {
    const payload = getPayload(notebook);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const hasTrialsShape = ["df_drg_mc_no", "total_regular", "total_hs", "smx_cvim"].every((key) => key in payload);
    if (!hasTrialsShape) return null;

    const consumedKeys = new Set(["entry_id", "date", "time", "type", "entry_date", "entry_time", "entry_type", "lot_no"]);
    const groups = TRIALS_GROUPS.map((group) => {
        const columns = group.fields.map(([label, key]) => ({ key, label }));
        const row = group.fields.reduce((acc, [, key]) => {
            consumedKeys.add(key);
            acc[key] = payload[key] ?? "-";
            return acc;
        }, {});
        return { title: group.title, columns, row };
    });

    const metaEntries = Object.entries(payload).filter(
        ([key, value]) => !consumedKeys.has(key) && isDisplayableMetaKey(key) && value !== undefined && value !== null && value !== ""
    );

    return { metaEntries, groups };
};

// Draw Frame's "1 Yard / Half Yard CV Entry" (and its Cots variant) saves its readings/results
// as nested objects - readings: { one_yard: [...], half_yard: [...] }, results: { avg_1yd, ... } -
// via its own extra.submitted_fields override (see draw-frame.js's handleSubmit), bypassing the
// generic groupsToPayload/__field_labels fallback entirely. The generic buildFieldCards renderer
// then flattens those nested objects into one comma-joined "key: value, key: value" card each,
// instead of the entry screen's own Readings/Calculation Results tables. Reconstructed here to
// match that layout, detected structurally by the readings/results shape rather than by name.
const getYarnCvSections = (notebook) => {
    const payload = getPayload(notebook);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const readings = parseJsonValue(payload.readings);
    const results = parseJsonValue(payload.results);
    if (!readings || typeof readings !== "object") return null;
    if (!Array.isArray(readings.one_yard) && !Array.isArray(readings.half_yard)) return null;

    const oneYard = Array.isArray(readings.one_yard) ? readings.one_yard : [];
    const halfYard = Array.isArray(readings.half_yard) ? readings.half_yard : [];
    const rowCount = Math.max(oneYard.length, halfYard.length);

    const groups = [
        {
            title: "Readings",
            columns: [
                { key: "serial", label: "S.No" },
                { key: "oneYard", label: "1 Yard Reading" },
                { key: "halfYard", label: "1/2 Yard Reading" },
            ],
            rows: Array.from({ length: rowCount }, (_, index) => ({
                serial: index + 1,
                oneYard: oneYard[index] ?? "-",
                halfYard: halfYard[index] ?? "-",
            })),
        },
    ];

    if (results && typeof results === "object") {
        groups.push({
            title: "Calculation Results",
            columns: [
                { key: "avg_1yd", label: "AVG (1 Yard)" },
                { key: "hank_1yd", label: "HANK (1 Yard)" },
                { key: "sd_1yd", label: "SD (1 Yard)" },
                { key: "cv_1yd", label: "CV% (1 Yard)" },
                { key: "avg_half", label: "AVG (1/2 Yard)" },
                { key: "hank_half", label: "HANK (1/2 Yard)" },
                { key: "sd_half", label: "SD (1/2 Yard)" },
                { key: "cv_half", label: "CV% (1/2 Yard)" },
            ],
            rows: [results],
        });
    }

    const consumedKeys = new Set(["readings", "results"]);
    const metaEntries = Object.entries(payload).filter(
        ([key, value]) =>
            !consumedKeys.has(key) && isDisplayableMetaKey(key) && value !== undefined && value !== null && value !== ""
    );

    return { metaEntries, groups };
};

// Spinning's "Count Change" screen saves via the generic checkingType submit path shared with
// Ring Frame/Cots/Wheel Change (buildPayload() -> extra.submitted_fields override in spinning.js),
// bypassing previewGroups entirely, so the entry screen's own "Readings"/"Averages" tables never
// reached the submitted-notebook record - the real payload's readings[] array (each row still
// carrying the duplicated overall cv_percent/cv_percent_2 - see deriveCountChangeRow in
// spinning.js) fell to the generic array-of-rows renderer instead, with avg_reading/avg_count/
// avg_strength/overall_csp left as individual flat cards. Reconstructed here to match the entry
// screen's own layout, detected structurally by the readings[]/avg_reading/overall_csp shape.
const getSpinningCountChangeSections = (notebook) => {
    const payload = getPayload(notebook);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const readings = parseJsonValue(payload.readings);
    if (!Array.isArray(readings) || !readings.length) return null;
    if (!("avg_reading" in payload) || !("overall_csp" in payload)) return null;
    const hasShape = readings.every((row) => row && typeof row === "object" && "reading_no" in row && "csp" in row);
    if (!hasShape) return null;

    const groups = [
        {
            title: "Readings",
            columns: [
                { key: "reading_no", label: "Reading No." },
                { key: "reading_value", label: "Reading Value" },
                { key: "count", label: "Count" },
                { key: "strength", label: "Strength" },
                { key: "mean", label: "Mean (Strength)" },
                { key: "csp", label: "CSP" },
            ],
            rows: readings.map((row, index) => ({
                reading_no: row.reading_no ?? index + 1,
                reading_value: row.reading_value ?? "-",
                count: row.count ?? "-",
                strength: row.strength ?? "-",
                mean: row.mean ?? "-",
                csp: row.csp ?? "-",
            })),
        },
        {
            title: "Averages",
            columns: [
                { key: "avg_reading", label: "Avg Reading" },
                { key: "avg_count", label: "Avg Count" },
                { key: "avg_strength", label: "Avg Strength" },
                { key: "cv_percent", label: "CV% (Count)" },
                { key: "cv_percent_2", label: "CV% (Strength)" },
                { key: "overall_csp", label: "Overall CSP" },
            ],
            rows: [
                {
                    avg_reading: payload.avg_reading ?? "-",
                    avg_count: payload.avg_count ?? "-",
                    avg_strength: payload.avg_strength ?? "-",
                    cv_percent: readings[0]?.cv_percent ?? "-",
                    cv_percent_2: readings[0]?.cv_percent_2 ?? "-",
                    overall_csp: payload.overall_csp ?? "-",
                },
            ],
        },
    ];

    const consumedKeys = new Set(["readings", "avg_reading", "avg_count", "avg_strength", "overall_csp"]);
    const metaEntries = Object.entries(payload).filter(
        ([key, value]) =>
            !consumedKeys.has(key) && isDisplayableMetaKey(key) && value !== undefined && value !== null && value !== ""
    );

    return { metaEntries, groups };
};

// Many entry screens across departments (Between & Within Card, Card Thick Place, Nati Data
// Entry, Individual Card Waste Study, Blow Room Sync, Drop Test, BR Waste Study, Ribbon Lap Cv%,
// Comber Nati Data, Simplex Cots Checking/Wheel Change, all five Autoconer
// screens, ...) were converted to show their pre-submit preview as PreviewModal `groups` (real
// per-section tables) instead of one flat `items` list, but have no dedicated getPayload() of
// their own - recordSubmittedNotebook falls back to flattening those groups via
// groupsToPayload() in submittedNotebookRecorder.js, which writes each cell under a
// "<group title> <row#> - <column label>" (or "<group title> - <column label>" for a single-row
// group) entry in the saved __field_labels map. Reconstructed generically here by parsing that
// convention back into the same grouped tables, rather than writing one bespoke detector per
// screen.
const GROUPED_FIELD_LABEL_RE = /^(.+?)(?:\s+(\d+))? - (.+)$/;

const getGroupedFieldSections = (notebook) => {
    const payload = getPayload(notebook);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const fieldLabels = parseJsonValue(payload.__field_labels);
    if (!fieldLabels || typeof fieldLabels !== "object") return null;

    const groupMap = new Map();
    const consumedKeys = new Set();

    Object.entries(fieldLabels).forEach(([key, label]) => {
        const match = String(label || "").match(GROUPED_FIELD_LABEL_RE);
        if (!match) return;
        const [, title, rowIndexStr, columnLabel] = match;
        const rowIndex = rowIndexStr ? Number(rowIndexStr) : 0;
        if (!groupMap.has(title)) groupMap.set(title, new Map());
        const rows = groupMap.get(title);
        if (!rows.has(rowIndex)) rows.set(rowIndex, {});
        rows.get(rowIndex)[columnLabel] = payload[key];
        consumedKeys.add(key);
    });

    if (!groupMap.size) return null;

    const groups = Array.from(groupMap.entries()).map(([title, rowsMap]) => {
        const sortedRowIndexes = Array.from(rowsMap.keys()).sort((a, b) => a - b);
        const columnLabels = [];
        sortedRowIndexes.forEach((idx) => {
            Object.keys(rowsMap.get(idx)).forEach((col) => {
                if (!columnLabels.includes(col)) columnLabels.push(col);
            });
        });
        return {
            title,
            columns: columnLabels.map((label) => ({ key: label, label })),
            rows: sortedRowIndexes.map((idx) => rowsMap.get(idx)),
        };
    });

    consumedKeys.add("__field_labels");
    const metaEntries = Object.entries(payload).filter(
        ([key, value]) =>
            !consumedKeys.has(key) && isDisplayableMetaKey(key) && value !== undefined && value !== null && value !== ""
    );

    return { metaEntries, groups };
};

// Every "Wheel Change" screen (Carding, Spinning) saves each Existing/Proposed parameter row as
// two sibling top-level keys sharing one field prefix - "<field>_existing"/"<field>_proposed" -
// rather than a row array, so the generic getGroupedFieldSections/buildFieldCards paths would
// otherwise show one flat card per field instead of the entry screen's own Parameter/Existing/
// Proposed table. Detected structurally (any key ending "_existing" with a matching "_proposed"
// sibling) rather than by notebook name, so it covers every department's Wheel Change screen that
// uses this convention without a per-screen detector.
const getWheelChangeFlatPairSections = (notebook) => {
    const payload = getPayload(notebook);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    // A payload carrying __field_labels came through the generic (non-getPayload) capture path
    // (see previewItemsToPayload/groupsToPayload in submittedNotebookRecorder.js) and must be
    // reconstructed via getGroupedFieldSections instead - its group-title slug can itself contain
    // "_existing"/"_proposed" (e.g. a group literally titled "Parameters (Existing / Proposed)"),
    // which otherwise false-matches this structural heuristic before the real key-label mapping
    // ever gets a chance to run.
    if (parseJsonValue(payload.__field_labels)) return null;

    const fields = [];
    Object.keys(payload).forEach((key) => {
        if (key.endsWith("_existing") && `${key.slice(0, -9)}_proposed` in payload) {
            fields.push(key.slice(0, -9));
        }
    });
    if (!fields.length) return null;

    const rows = fields.map((field) => ({
        parameter: formatTitle(field),
        existing: payload[`${field}_existing`] ?? "-",
        proposed: payload[`${field}_proposed`] ?? "-",
    }));

    const consumedKeys = new Set();
    fields.forEach((field) => {
        consumedKeys.add(`${field}_existing`);
        consumedKeys.add(`${field}_proposed`);
    });
    const metaEntries = Object.entries(payload).filter(
        ([key, value]) =>
            !consumedKeys.has(key) && isDisplayableMetaKey(key) && value !== undefined && value !== null && value !== ""
    );

    return { metaEntries, rows };
};

// Draw Frame's and Simplex's "Wheel Change" screens save their Existing/Proposed rows as a
// `parameters` array of {key, label, existing, proposed} objects instead of flat sibling keys
// (see getWheelChangeFlatPairSections above for the other convention) - detected structurally by
// that array's shape, again so one detector covers every department using this convention.
const getWheelChangeParametersArraySections = (notebook) => {
    const payload = getPayload(notebook);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    // Same reasoning as getWheelChangeFlatPairSections above - a generically-captured payload
    // must go through getGroupedFieldSections, not this structural heuristic.
    if (parseJsonValue(payload.__field_labels)) return null;
    const parameters = parseJsonValue(payload.parameters);
    if (!Array.isArray(parameters) || !parameters.length) return null;
    const hasShape = parameters.every(
        (item) => item && typeof item === "object" && "label" in item && "existing" in item && "proposed" in item
    );
    if (!hasShape) return null;

    const rows = parameters.map((item) => ({
        parameter: item.label,
        existing: item.existing ?? "-",
        proposed: item.proposed ?? "-",
    }));

    // Carding's and Spinning's Wheel Change payloads carry their own legacy flat
    // "<field>_existing"/"<field>_proposed" keys ALONGSIDE this `parameters` array (added purely
    // for this popup's benefit - see registeredActions.getPayload in carding/WheelChange.jsx and
    // the extra.submitted_fields override in spinning.js) - excluding only "parameters"/"rows"
    // would leave every one of those flat keys to leak through as its own duplicate flat card
    // showing the exact same data already in the table above. Exclude the whole convention here.
    const consumedKeys = new Set(["parameters", "rows"]);
    Object.keys(payload).forEach((key) => {
        if (key.endsWith("_existing") || key.endsWith("_proposed")) consumedKeys.add(key);
    });
    const metaEntries = Object.entries(payload).filter(
        ([key, value]) =>
            !consumedKeys.has(key) && isDisplayableMetaKey(key) && value !== undefined && value !== null && value !== ""
    );

    return { metaEntries, rows };
};

// Several entry screens (Blow Room Sync, Drop Test, BR Waste Study, ...) build their pre-submit
// preview by flattening each grid row into one field per row - e.g. label "Row 1" with value
// "Run Time:5s | Idle Time:2s | Sub Total:00:00:07 | Sync:71.43%" - which is what ends up stored
// as the submitted field. Rather than showing those as a wall of "Row 1: Run Time:5s | ..." cards,
// detect the "Label:Value | Label:Value" shape and the shared numbered-label prefix (Row/Entry/
// Waste KGs ...) across sibling fields and rebuild them into one real table matching the entry
// screen's own grid, using the same row-list rendering already used for structured array fields.
const NUMBERED_FIELD_LABEL_RE = /^(.*?)[\s_-]*(\d+)$/;

const parsePipeDelimitedPairs = (value) => {
    if (typeof value !== "string" || !value.includes("|") || !value.includes(":")) return null;

    const segments = value.split("|").map((segment) => segment.trim()).filter(Boolean);
    if (segments.length < 2) return null;

    const pairs = {};
    for (const segment of segments) {
        const colonIndex = segment.indexOf(":");
        if (colonIndex === -1) return null;
        const key = segment.slice(0, colonIndex).trim();
        if (!key) return null;
        pairs[key] = segment.slice(colonIndex + 1).trim();
    }
    return pairs;
};

const mergeNumberedRowFields = (fields) => {
    const groups = new Map();
    const totalCandidates = [];
    const untouched = [];

    fields.forEach((field) => {
        const match = typeof field.label === "string" ? field.label.match(NUMBERED_FIELD_LABEL_RE) : null;
        const pairs = match ? parsePipeDelimitedPairs(field.value) : null;

        if (match && pairs) {
            const prefix = match[1].trim() || field.label;
            if (!groups.has(prefix)) groups.set(prefix, []);
            groups.get(prefix).push({ num: parseInt(match[2], 10), pairs });
            return;
        }

        // A trailing "Totals" field (no numeric suffix, so it doesn't match the group above)
        // is folded into its matching row group as the last row, provided its pipe-delimited
        // keys are exactly the same set as that group's rows - otherwise it's left as-is.
        const totalPairs = /total/i.test(String(field.label || "")) ? parsePipeDelimitedPairs(field.value) : null;
        if (totalPairs) {
            totalCandidates.push({ field, pairs: totalPairs });
            return;
        }

        untouched.push(field);
    });

    const mergedFields = [];
    groups.forEach((entries, prefix) => {
        entries.sort((a, b) => a.num - b.num);
        const rows = entries.map(({ num, pairs }) => ({ "S. No.": num, ...pairs }));

        const rowKeys = new Set(Object.keys(rows[0] || {}).filter((key) => key !== "S. No."));
        const matchIndex = totalCandidates.findIndex(({ pairs }) => {
            const keys = Object.keys(pairs);
            return keys.length === rowKeys.size && keys.every((key) => rowKeys.has(key));
        });
        if (matchIndex !== -1) {
            const [totalMatch] = totalCandidates.splice(matchIndex, 1);
            rows.push({ "S. No.": "Total", ...totalMatch.pairs });
        }

        mergedFields.push({
            key: normalizeKey(prefix) || prefix,
            label: prefix,
            value: "",
            rows,
        });
    });

    return [...untouched, ...totalCandidates.map(({ field }) => field), ...mergedFields];
};

const buildFieldCards = (notebook) => {
    const payload = getPayload(notebook);
    const fields = [];
    const usedKeys = new Set();

    if (Array.isArray(payload)) {
        return mergeNumberedRowFields(
            payload
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

                    const rawDisplayValue = getDisplayValue(value);
                    if (HIDE_WHEN_BLANK_KEYS.has(normalizeKey(key)) && rawDisplayValue === "") {
                        return null;
                    }
                    const displayValue = rawDisplayValue === "" ? "-" : rawDisplayValue;

                    return {
                        key,
                        label: item.label || FIELD_LABELS[key] || formatTitle(key),
                        value: displayValue,
                    };
                })
                .filter(Boolean)
        );
    }

    const payloadHasDisplayValues =
        payload &&
        typeof payload === "object" &&
        Object.keys(payload).some((key) => !META_FIELD_KEYS.has(normalizeKey(key)));

    // Preserve the exact label the entry screen showed (e.g. "Lap Weight (KGs)") instead of
    // reconstructing a lossy approximation from its slugified key ("Lap Weight Kgs") - see
    // previewItemsToPayload in submittedNotebookRecorder.js, which writes this alongside the
    // slugged fields for any screen using the generic (non-getPayload) capture path.
    const fieldLabelOverrides =
        (payload && typeof payload === "object" && !Array.isArray(payload) && parseJsonValue(payload.__field_labels)) ||
        {};

    FALLBACK_FIELDS.forEach((key) => {
        const value = payload?.[key] ?? notebook?.[key];
        // Only skip a fallback field when it's genuinely absent from this notebook type
        // (undefined/null) - a blank-but-present value ("") is still shown, as "-", except
        // for keys like lot_no that get written for every notebook regardless of whether
        // that screen actually has the field.
        if (value !== undefined && value !== null) {
            if (HIDE_WHEN_BLANK_KEYS.has(normalizeKey(key)) && value === "") {
                return;
            }
            if (!payloadHasDisplayValues && META_FIELD_KEYS.has(normalizeKey(key))) {
                return;
            }
            usedKeys.add(normalizeKey(key));
            fields.push({
                key,
                label: fieldLabelOverrides[key] || FIELD_LABELS[key] || formatTitle(key),
                value: value === "" ? "-" : value,
            });
        }
    });

    Object.entries(payload || {}).forEach(([key, value]) => {
        if (ACKNOWLEDGEMENT_TIME_KEYS.has(normalizeKey(key))) {
            fields.push({
                key: "approval_l4_name",
                label: "L4 Approval Name",
                value: getNotebookApprovalName(notebook),
            });
            usedKeys.add(normalizeKey(key));
            return;
        }

        if (
            usedKeys.has(normalizeKey(key)) ||
            META_FIELD_KEYS.has(normalizeKey(key)) ||
            value === undefined ||
            value === null
        ) {
            return;
        }
        addDisplayField(fields, usedKeys, key, value, "", fieldLabelOverrides);
    });

    // Only ever display what was actually captured on the entry screen (the submitted
    // payload) - never fall back to flattening the raw notebook DB row here, since that
    // row carries columns (status, timestamps, approver ids, ...) that were never on the
    // UI and must not leak into this view as if they were submitted fields.
    flattenDisplayFields(payload, fields, usedKeys, "", fieldLabelOverrides);

    return mergeNumberedRowFields(fields);
};

const SubmittedNotebooksPage = () => {
    const router = useRouter();
    const user = useSelector((state) => state.auth?.user);
    const isAuthHydrated = useSelector((state) => state.auth?.isHydrated);
    const [notebooks, setNotebooks] = useState([]);
    const [selectedNotebook, setSelectedNotebook] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [error, setError] = useState("");
    const [acknowledgingId, setAcknowledgingId] = useState(null);
    const [showAcknowledgeConfirm, setShowAcknowledgeConfirm] = useState(false);
    const [showAcknowledgeSuccess, setShowAcknowledgeSuccess] = useState(false);
    const [showApprovalRestricted, setShowApprovalRestricted] = useState(false);
    const [reviewNote, setReviewNote] = useState("");
    const [reviewNoteError, setReviewNoteError] = useState(false);
    const [users, setUsers] = useState([]);
    const [filters, setFilters] = useState({
        department: "",
        subDepartment: "",
        notebookType: "",
        operator: "",
        supervisor: "",
        entryId: "",
        datePreset: "",
        dateFrom: "",
        dateTo: "",
    });
    const isSupervisor = isSupervisorNavUser(user) && !isFullAccessUser(user);
    const isAdminUser = isFullAccessUser(user);
    const canApproveNotebooks = isSubmittedNotebookApproverUser(user);
    // L4 is now scoped server-side to only notebooks they were actually assigned to (see
    // isL4Requester in submittedNotebooks.routes.js) - the "Check by"/"Checked by" filter let
    // them pick a DIFFERENT L4's name, which no longer means anything since they can't see that
    // other L4's notebooks anyway. Drop the filter entirely for L4 rather than leave a control
    // that only ever has one meaningful value (themselves).
    const isL4User = String(user?.level ?? user?.user_details?.level ?? "").trim().toUpperCase() === "L4" && !isAdminUser;
    const [activeTab, setActiveTab] = useState("pending");
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalCount, setTotalCount] = useState(0);
    const [serverFilterOptions, setServerFilterOptions] = useState({
        departments: [],
        subDepartments: [],
        notebookTypes: [],
        operators: [],
        supervisors: [],
        entryIds: [],
    });
    const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];
    const lastLoadKeyRef = useRef("");
    const inFlightLoadKeyRef = useRef("");
    const handledOpenNotebookIdRef = useRef("");
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

    const loadNotebooks = async ({ force = false } = {}) => {
        if (!isAuthHydrated) {
            return;
        }

        // Pagination, the Pending/Closed tab, and every filter are all resolved server-side now -
        // the backend returns exactly one page of already-filtered, already-enriched rows plus a
        // real totalCount and the filter dropdown options (computed over the full matching set,
        // not just this page).
        const query = {
            ...buildSubmittedNotebookQuery(user),
            tab: activeTab,
            page: currentPage,
            limit: pageSize,
            ...(filters.department ? { department: filters.department } : {}),
            ...(filters.subDepartment ? { sub_department: filters.subDepartment } : {}),
            ...(filters.notebookType ? { notebook_type: filters.notebookType } : {}),
            ...(filters.operator ? { operator: filters.operator } : {}),
            ...(filters.supervisor ? { supervisor: filters.supervisor } : {}),
            ...(filters.entryId ? { entry_id: filters.entryId } : {}),
            ...(filters.dateFrom ? { date_from: filters.dateFrom } : {}),
            ...(filters.dateTo ? { date_to: filters.dateTo } : {}),
        };
        const loadKey = `${getUserLoadKey(user)}::${serializeQuery(query)}`;

        // Acknowledging a notebook changes its status server-side without changing anything about
        // *this* query (same tab/filters/page) - the loadKey would be identical to the one already
        // cached in lastLoadKeyRef, so without `force` this dedup guard (meant to collapse redundant
        // re-renders/effect-reruns firing the same request) would silently skip the refetch and the
        // notebook would keep showing under Pending until some unrelated filter change happened to
        // bust the cache. `force` lets a caller that just changed server state bypass it.
        if (inFlightLoadKeyRef.current === loadKey || (!force && lastLoadKeyRef.current === loadKey)) {
            return;
        }

        inFlightLoadKeyRef.current = loadKey;
        setIsLoading(true);
        setError("");
        try {
            const data = await fetchSubmittedNotebooksApi(query);
            const rows = normalizeList(data);
            const userRows = rows.filter((notebook) => isNotebookForUser(notebook, user));
            setNotebooks(userRows);
            setTotalCount(Number(data?.pagination?.total) || 0);
            setServerFilterOptions({
                departments: data?.filter_options?.departments || [],
                subDepartments: data?.filter_options?.sub_departments || [],
                notebookTypes: data?.filter_options?.notebook_types || [],
                operators: data?.filter_options?.operators || [],
                supervisors: data?.filter_options?.supervisors || [],
                entryIds: data?.filter_options?.entry_ids || [],
            });
            lastLoadKeyRef.current = loadKey;
        } catch (err) {
            setError(err?.response?.data?.message || err?.message || "Unable to load submitted notebooks.");
        } finally {
            inFlightLoadKeyRef.current = "";
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadNotebooks();
    }, [isAuthHydrated, user?.id, user?.employee_id, user?.employeeId, user?.emp_id, user?.full_name, user?.fullName, user?.name, user?.username, user?.role, user?.role_name, user?.roleName, activeTab, currentPage, pageSize, filters]);

    useEffect(() => {
        let active = true;

        const loadUsers = async () => {
            try {
                const data = await fetchUsersAPI();
                if (!active) return;
                setUsers(normalizeUserList(data));
            } catch {
                if (active) setUsers([]);
            }
        };

        loadUsers();

        return () => {
            active = false;
        };
    }, []);

    // Pagination, the Pending/Closed tab, and every filter (department/sub-department/notebook
    // type/operator/supervisor/date range) are now all applied server-side - `notebooks` here is
    // already exactly one page of the correctly-filtered set. This still runs the same
    // display-value resolution (title/operator/supervisor/department) the app always has, purely
    // for rendering - it is not re-filtering anything, since re-deriving these values and then
    // filtering by them again client-side risked silently hiding rows the server already decided
    // belonged on this page if either side's resolution ever drifted apart even slightly.
    const enrichedNotebooks = useMemo(
        () =>
            notebooks.map((notebook) => {
                const { department, subDepartment } = resolveNotebookDepartment(notebook);
                return {
                    notebook,
                    id: getNotebookId(notebook),
                    entryId: notebook?.entry_id || notebook?.entryId || "",
                    department,
                    subDepartment,
                    title: getNotebookTitle(notebook),
                    operator: getNotebookOperatorName(notebook, users),
                    // Every L1-L5 hierarchy account (not just admin) can see who checked a
                    // Closed notebook - visibility of the whole list is already open to
                    // L1-L5, and only L4/L5 can ever be the one who acknowledged it, so
                    // there's no separate secrecy concern for who did it.
                    supervisor: getNotebookSupervisorName(notebook, users),
                    createdAt: getCreatedDate(notebook),
                    review: getNotebookReviewNote(notebook),
                };
            }),
        [notebooks, users]
    );

    const filterOptions = serverFilterOptions;
    const filteredNotebooks = enrichedNotebooks;
    const paginatedNotebooks = enrichedNotebooks;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, filters, pageSize]);

    const handleFilterChange = (field, value) => {
        setFilters((current) => {
            const next = { ...current, [field]: value };
            FILTER_CASCADE.slice(FILTER_CASCADE.indexOf(field) + 1).forEach((key) => {
                next[key] = "";
            });
            return next;
        });
    };

    // Preset and Custom From/To are exclusive — picking a preset overwrites From/To outright,
    // and editing From/To directly clears whatever preset was selected (so the two controls
    // never silently disagree about which one is actually in effect).
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

    const openNotebook = async (notebook) => {
        const id = getNotebookId(notebook);
        setSelectedNotebook(notebook);
        setShowAcknowledgeConfirm(false);
        setShowApprovalRestricted(false);
        setReviewNote("");
        setReviewNoteError(false);

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

    // Deep-link from the acknowledgement ticket detail view: it passes ?openNotebookId= so the
    // exact notebook card/preview opens here directly, rather than dropping the reviewer on the
    // bare list to hunt for it themselves. Fetches the notebook by id directly rather than
    // looking it up in the loaded `notebooks` list - that list is now just one server-paginated
    // page, so the deep-link target frequently wouldn't be in it at all.
    useEffect(() => {
        if (!router.isReady) return;
        const openNotebookId = String(router.query.openNotebookId || "").trim();
        if (!openNotebookId || openNotebookId === handledOpenNotebookIdRef.current) return;

        handledOpenNotebookIdRef.current = openNotebookId;

        (async () => {
            try {
                const data = await fetchSubmittedNotebookDetailApi(openNotebookId);
                const match = getDetailNotebook(data, null);
                if (!match || !getNotebookId(match)) return;

                if (!isNotebookPendingAcknowledgement(match)) {
                    setActiveTab("closed");
                }
                openNotebook(match);
            } catch {
                // Deep-link target may no longer exist or the user may lack access - ignore.
            }
        })();

        const { openNotebookId: _omit, ...restQuery } = router.query;
        router.replace({ pathname: router.pathname, query: restQuery }, undefined, { shallow: true });
    }, [router.isReady, router.query.openNotebookId]);

    const handleAcknowledge = async () => {
        const id = getNotebookId(selectedNotebook);
        if (!id) return;
        setAcknowledgingId(id);
        try {
            await acknowledgeSubmittedNotebookApi(id, { note: reviewNote.trim() });
            setShowAcknowledgeConfirm(false);
            setReviewNote("");
            setReviewNoteError(false);
            // The acknowledged notebook's status changed server-side, but nothing about this
            // query (tab/filters/page) did - force bypasses the stale-request dedup guard so the
            // Pending list actually drops it right away instead of only refreshing on some later,
            // unrelated filter/tab change.
            await loadNotebooks({ force: true });
            // Show "Thanks for Acknowledging" over the detail view for 2s, then close it —
            // closing selectedNotebook immediately (as this used to do) skipped straight past
            // any success feedback, so the reviewer had no confirmation the click registered.
            setShowAcknowledgeSuccess(true);
            setTimeout(() => {
                setShowAcknowledgeSuccess(false);
                setSelectedNotebook(null);
            }, 2000);
        } finally {
            setAcknowledgingId(null);
        }
    };

    const requestAcknowledgeConfirmation = () => {
        if (!getNotebookId(selectedNotebook)) return;
        if (!canApproveNotebooks) {
            setShowApprovalRestricted(true);
            return;
        }
        if (!reviewNote.trim()) {
            setReviewNoteError(true);
            return;
        }
        setReviewNoteError(false);
        setShowAcknowledgeConfirm(true);
    };

    const ocrReportSections = selectedNotebook ? getOcrReportSections(selectedNotebook) : null;
    const cardingSections = !ocrReportSections && selectedNotebook ? getCardingBetweenWithinSections(selectedNotebook) : null;
    const cardDfkSections = !ocrReportSections && !cardingSections && selectedNotebook ? getCardDfkSections(selectedNotebook) : null;
    const thickPlaceSections = !ocrReportSections && !cardingSections && !cardDfkSections && selectedNotebook ? getCardThickPlaceSections(selectedNotebook) : null;
    const ringFrameSections = !ocrReportSections && !cardingSections && !cardDfkSections && !thickPlaceSections && selectedNotebook ? getRingFrameSections(selectedNotebook) : null;
    const smxBreaksStudySections = !ocrReportSections && !cardingSections && !cardDfkSections && !thickPlaceSections && !ringFrameSections && selectedNotebook ? getSmxBreaksStudySections(selectedNotebook) : null;
    const trialsSections = !ocrReportSections && !cardingSections && !cardDfkSections && !thickPlaceSections && !ringFrameSections && !smxBreaksStudySections && selectedNotebook ? getTrialsSections(selectedNotebook) : null;
    const priorCustomSections = ocrReportSections || cardingSections || cardDfkSections || thickPlaceSections || ringFrameSections || smxBreaksStudySections || trialsSections;
    // Parameters-array (exact on-screen labels) takes priority over the flat-pair heuristic
    // (which guesses a label from the raw backend key) - Carding's and Spinning's Wheel Change
    // payloads carry both a `parameters` array AND the legacy flat "<field>_existing"/
    // "<field>_proposed" keys side by side, so without this ordering the lossy heuristic would
    // win just because it's checked first.
    const wheelChangeParametersArraySections = !priorCustomSections && selectedNotebook ? getWheelChangeParametersArraySections(selectedNotebook) : null;
    const wheelChangeFlatPairSections = !priorCustomSections && !wheelChangeParametersArraySections && selectedNotebook ? getWheelChangeFlatPairSections(selectedNotebook) : null;
    const yarnCvSections = !priorCustomSections && !wheelChangeFlatPairSections && !wheelChangeParametersArraySections && selectedNotebook ? getYarnCvSections(selectedNotebook) : null;
    const countChangeSections = !priorCustomSections && !wheelChangeFlatPairSections && !wheelChangeParametersArraySections && !yarnCvSections && selectedNotebook ? getSpinningCountChangeSections(selectedNotebook) : null;
    const groupedFieldSections = !priorCustomSections && !wheelChangeFlatPairSections && !wheelChangeParametersArraySections && !yarnCvSections && !countChangeSections && selectedNotebook ? getGroupedFieldSections(selectedNotebook) : null;
    const entryIdValue = selectedNotebook?.entry_id || selectedNotebook?.entryId || "-";
    const entryIdMetaCard = (
        <div className={styles.fieldCard}>
            <small>Entry ID</small>
            <strong>{entryIdValue}</strong>
        </div>
    );
    const hasCustomSections = priorCustomSections || wheelChangeFlatPairSections || wheelChangeParametersArraySections || yarnCvSections || countChangeSections || groupedFieldSections;
    const selectedFields = hasCustomSections ? [] : buildFieldCards(selectedNotebook);
    const simpleFields = selectedFields.filter((field) => !field.rows);
    const rowListFields = selectedFields.filter((field) => field.rows);
    const selectedNotebookDepartment = selectedNotebook ? resolveNotebookDepartment(selectedNotebook) : { department: "Quality Control", subDepartment: "Mixing Department" };

    return (
        <section className={styles.page}>
            <div className={styles.titleBar}>
                <h1 className={styles.title}>Submitted Notebooks</h1>
                <div className={styles.tabSwitch}>
                    <button
                        type="button"
                        className={`${styles.tabButton} ${activeTab === "pending" ? styles.tabButtonActive : ""}`}
                        onClick={() => setActiveTab("pending")}
                    >
                        Pending
                    </button>
                    <button
                        type="button"
                        className={`${styles.tabButton} ${activeTab === "closed" ? styles.tabButtonActive : ""}`}
                        onClick={() => setActiveTab("closed")}
                    >
                        Closed
                    </button>
                </div>
                <div className={styles.filterBar}>
                    <label className={styles.filterField}>
                        <small>Department</small>
                        {isSupervisor ? (
                            <span className={styles.filterLocked}>Can&apos;t access</span>
                        ) : (
                            <select
                                className={styles.filterSelect}
                                value={filters.department}
                                onChange={(event) => handleFilterChange("department", event.target.value)}
                            >
                                <option value="">All</option>
                                {filterOptions.departments.map((value) => (
                                    <option key={value} value={value}>{value}</option>
                                ))}
                            </select>
                        )}
                    </label>
                    <label className={styles.filterField}>
                        <small>Sub Department</small>
                        {isSupervisor ? (
                            <span className={styles.filterLocked}>Can&apos;t access</span>
                        ) : (
                            <select
                                className={styles.filterSelect}
                                value={filters.subDepartment}
                                onChange={(event) => handleFilterChange("subDepartment", event.target.value)}
                            >
                                <option value="">All</option>
                                {filterOptions.subDepartments.map((value) => (
                                    <option key={value} value={value}>{value}</option>
                                ))}
                            </select>
                        )}
                    </label>
                    <label className={styles.filterField}>
                        <small>Notebook Type</small>
                        <SearchableSelect
                            className={styles.filterSelect}
                            value={filters.notebookType}
                            onChange={(value) => handleFilterChange("notebookType", value)}
                            options={filterOptions.notebookTypes}
                            includeEmptyOption
                            emptyOptionLabel="All"
                            placeholder="All"
                            ariaLabel="Notebook Type"
                            optionVariant="native"
                        />
                    </label>
                    <label className={styles.filterField}>
                        <small>Submitted by</small>
                        <select
                            className={styles.filterSelect}
                            value={filters.operator}
                            onChange={(event) => handleFilterChange("operator", event.target.value)}
                        >
                            <option value="">All</option>
                            {filterOptions.operators.map((value) => (
                                <option key={value} value={value}>{getFirstName(value)}</option>
                            ))}
                        </select>
                    </label>
                    {isL4User ? null : (
                        <label className={styles.filterField}>
                            <small>{activeTab === "closed" ? "Checked by" : "Check by"}</small>
                            {isSupervisor ? (
                                <span className={styles.filterLocked}>{getFirstName(user?.full_name || user?.fullName || user?.name) || "You"}</span>
                            ) : (
                                <select
                                    className={styles.filterSelect}
                                    value={filters.supervisor}
                                    onChange={(event) => handleFilterChange("supervisor", event.target.value)}
                                >
                                    <option value="">All</option>
                                    {filterOptions.supervisors.map((value) => (
                                        <option key={value} value={value}>{getFirstName(value)}</option>
                                    ))}
                                </select>
                            )}
                        </label>
                    )}
                    <label className={styles.filterField}>
                        <small>Entry ID</small>
                        <SearchableSelect
                            className={styles.filterSelect}
                            value={filters.entryId}
                            onChange={(value) => handleFilterChange("entryId", value)}
                            options={filterOptions.entryIds}
                            includeEmptyOption
                            emptyOptionLabel="All"
                            placeholder="All"
                            ariaLabel="Entry ID"
                            optionVariant="native"
                        />
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

            {isLoading ? (
                <div className={styles.emptyState}>Loading submitted notebooks...</div>
            ) : error ? (
                <div className={styles.emptyState}>{error}</div>
            ) : filteredNotebooks.length ? (
                <div className={styles.list}>
                    {paginatedNotebooks.map((item, index) => {
                        const id = item.id || `notebook-${index}`;

                        return (
                            <button
                                type="button"
                                key={id}
                                className={styles.row}
                                onClick={() => openNotebook(item.notebook)}
                            >
                                <span className={styles.rowMain}>
                                    <strong>{item.title}</strong>
                                    <span>{item.department} &gt; {item.subDepartment}</span>
                                </span>
                                <span className={styles.rowMeta}>
                                    <span className={styles.rowMetaItem}>
                                        <small>Entry ID</small>
                                        <strong>{item.entryId || "--"}</strong>
                                    </span>
                                    <span className={styles.rowMetaItem}>
                                        <small>{activeTab === "closed" ? "Checked by" : "Check by"}</small>
                                        <strong>{getFirstName(item.supervisor)}</strong>
                                    </span>
                                    <span className={styles.rowMetaItem}>
                                        <small>Submitted by</small>
                                        <strong>{getFirstName(item.operator)}</strong>
                                    </span>
                                    <span className={styles.rowMetaItem}>
                                        <small>Created At</small>
                                        <strong>{formatDateTime(item.createdAt)}</strong>
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className={styles.emptyState}>No submitted notebooks found.</div>
            )}

            {!isLoading && !error && filteredNotebooks.length ? (
                <Pagination
                    page={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    pageSize={pageSize}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    onPageSizeChange={setPageSize}
                    showPageJump
                />
            ) : null}

            {selectedNotebook && showAcknowledgeSuccess && (
                // Thanks-for-acknowledging replaces the whole detail card outright, instead of
                // layering on top of it — the pending notebook's fields/review textarea stayed
                // visible underneath the fixed overlay otherwise, which read as a stacked popup
                // rather than a clean confirmation.
                <div className={styles.successOverlay} role="presentation">
                    <div
                        className={styles.successDialog}
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="acknowledge-success-title"
                    >
                        <div className={styles.successIcon} aria-hidden="true">{"✓"}</div>
                        <h3 id="acknowledge-success-title">Thanks for Acknowledging</h3>
                    </div>
                </div>
            )}

            {selectedNotebook && !showAcknowledgeSuccess && (
                <div
                    className={styles.overlay}
                    role="presentation"
                    onClick={() => {
                        setSelectedNotebook(null);
                        setShowAcknowledgeConfirm(false);
                        setShowAcknowledgeSuccess(false);
                        setShowApprovalRestricted(false);
                        setReviewNote("");
                        setReviewNoteError(false);
                    }}
                >
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
                                    {selectedNotebook?.notebook_name || selectedNotebook?.notebook || selectedNotebook?.title || "Cotton HVI Data Entry"}
                                </h2>
                                <p>
                                    {selectedNotebookDepartment.department} &gt; {selectedNotebookDepartment.subDepartment}
                                </p>
                            </div>
                            <div className={styles.modalMeta}>
                                <span>
                                    <small>Supervisor</small>
                                    <strong>{getNotebookSupervisorName(selectedNotebook, users)}</strong>
                                </span>
                                <span>
                                    <small>Operator</small>
                                    <strong>{getNotebookOperatorName(selectedNotebook, users)}</strong>
                                </span>
                                <span>
                                    <small>Created At</small>
                                    <strong>{formatDateTime(getCreatedDate(selectedNotebook))}</strong>
                                </span>
                            </div>
                        </div>

                        {ocrReportSections ? (
                            <>
                                {ocrReportSections.map((section, sectionIndex) => (
                                    <div key={sectionIndex}>
                                        {section.title ? (
                                            <div className={styles.rowListSection}>
                                                <small>{section.title}</small>
                                            </div>
                                        ) : null}

                                        <div className={styles.rowListSection}>
                                            <small>Meta</small>
                                            <div className={styles.rowListTableWrap}>
                                                <table className={styles.rowListTable}>
                                                    <thead>
                                                        <tr>
                                                            <th>Entry ID</th>
                                                            {section.metaEntries.map(([key]) => (
                                                                <th key={key}>{OCR_META_FIELD_LABELS[key] || formatTitle(key)}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        <tr>
                                                            <td>{entryIdValue}</td>
                                                            {section.metaEntries.map(([key, value]) => (
                                                                <td key={key}>{isDateField(key) ? formatDateValue(value) : String(value)}</td>
                                                            ))}
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {["sampleRows", "summaryRows"].map((sectionKey) => {
                                            const rows = section[sectionKey];
                                            if (!rows.length) return null;
                                            const columns = getOcrRowColumns(rows);
                                            const isSummary = sectionKey === "summaryRows";

                                            return (
                                                <div key={sectionKey} className={styles.rowListSection}>
                                                    <small>{isSummary ? "Summary Rows" : "Sample Rows"}</small>
                                                    <div className={styles.rowListTableWrap}>
                                                        <table className={styles.rowListTable}>
                                                            <thead>
                                                                <tr>
                                                                    {columns.map((column) => (
                                                                        <th key={column}>
                                                                            {isSummary && (column === "sampleNo" || column === "sample_no")
                                                                                ? "Label"
                                                                                : OCR_ROW_COLUMN_LABELS[column] || formatTitle(column)}
                                                                        </th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {rows.map((row, rowIndex) => (
                                                                    <tr key={rowIndex}>
                                                                        {columns.map((column) => (
                                                                            <td key={column}>
                                                                                {row?.[column] === null || typeof row?.[column] === "undefined" || row?.[column] === ""
                                                                                    ? "-"
                                                                                    : String(row[column])}
                                                                            </td>
                                                                        ))}
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </>
                        ) : cardingSections ? (
                            <>
                                <div className={styles.rowListSection}>
                                    <small>Meta</small>
                                    <div className={styles.fieldGrid}>
                                        {entryIdMetaCard}
                                        {cardingSections.metaEntries.map(([key, value]) => (
                                            <div key={key} className={styles.fieldCard}>
                                                <small>{FIELD_LABELS[key] || formatTitle(key)}</small>
                                                <strong>{isDateField(key) ? formatDateValue(value) : String(value)}</strong>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className={styles.rowListSection}>
                                    <small>Entries</small>
                                    <div className={styles.rowListTableWrap}>
                                        <table className={styles.rowListTable}>
                                            <thead>
                                                <tr>
                                                    <th>Row</th>
                                                    <th>Sample Weight</th>
                                                    <th>Hank</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {cardingSections.entryRows.map((row) => (
                                                    <tr key={row.Row}>
                                                        <td>{row.Row}</td>
                                                        <td>{String(row["Sample Weight"])}</td>
                                                        <td>{String(row.Hank)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {[
                                    { key: "sampleWeightStats", title: "Sample Weight Calculations" },
                                    { key: "hankStats", title: "Hank Calculations" },
                                ].map(({ key, title }) => {
                                    const entries = cardingSections[key];
                                    if (!entries.length) return null;
                                    return (
                                        <div key={key} className={styles.rowListSection}>
                                            <small>{title}</small>
                                            <div className={styles.fieldGrid}>
                                                {entries.map(([label, value]) => (
                                                    <div key={label} className={styles.fieldCard}>
                                                        <small>{label}</small>
                                                        <strong>{String(value)}</strong>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        ) : cardDfkSections ? (
                            <>
                                <div className={styles.rowListSection}>
                                    <small>Meta</small>
                                    <div className={styles.fieldGrid}>{entryIdMetaCard}</div>
                                </div>

                                <div className={styles.rowListSection}>
                                    <small>DFK Values</small>
                                    <div className={styles.rowListTableWrap}>
                                        <table className={styles.rowListTable}>
                                            <thead>
                                                <tr>
                                                    <th>Machine Name</th>
                                                    {cardDfkSections.rows[0]?.values.map(({ label }) => (
                                                        <th key={label}>{label}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {cardDfkSections.rows.map((row) => (
                                                    <tr key={row.machine}>
                                                        <td>{row.machine}</td>
                                                        {row.values.map(({ label, value }) => (
                                                            <td key={label}>{String(value)}</td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        ) : thickPlaceSections ? (
                            <>
                                <div className={styles.rowListSection}>
                                    <small>Meta</small>
                                    <div className={styles.fieldGrid}>{entryIdMetaCard}</div>
                                </div>

                                <div className={styles.rowListSection}>
                                    <small>Card Thick Place Values</small>
                                    <div className={styles.rowListTableWrap}>
                                        <table className={styles.rowListTable}>
                                            <thead>
                                                <tr>
                                                    <th>Machine</th>
                                                    {thickPlaceSections.rows[0]?.values.map(({ label }) => (
                                                        <th key={label}>{label}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {thickPlaceSections.rows.map((row) => (
                                                    <tr key={row.machine}>
                                                        <td>{row.machine}</td>
                                                        {row.values.map(({ label, value }) => (
                                                            <td key={label}>{String(value)}</td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        ) : ringFrameSections ? (
                            <>
                                <div className={styles.rowListSection}>
                                    <small>Meta</small>
                                    <div className={styles.fieldGrid}>{entryIdMetaCard}</div>
                                </div>

                                <div className={styles.rowListSection}>
                                    <small>Ring Frame Rows</small>
                                    <div className={styles.rowListTableWrap}>
                                        <table className={styles.rowListTable}>
                                            <thead>
                                                <tr>
                                                    <th>Mc.No</th>
                                                    {ringFrameSections.rows[0]?.values.map(({ label }) => (
                                                        <th key={label}>{label}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {ringFrameSections.rows.map((row) => (
                                                    <tr key={row.machine}>
                                                        <td>{row.machine}</td>
                                                        {row.values.map(({ label, value }) => (
                                                            <td key={label}>{String(value)}</td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {ringFrameSections.summaryEntries.length ? (
                                    <div className={styles.rowListSection}>
                                        <small>Summary</small>
                                        <div className={styles.fieldGrid}>
                                            {ringFrameSections.summaryEntries.map(([label, value]) => (
                                                <div key={label} className={styles.fieldCard}>
                                                    <small>{label}</small>
                                                    <strong>{String(value)}</strong>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </>
                        ) : smxBreaksStudySections ? (
                            <>
                                <div className={styles.rowListSection}>
                                    <small>Meta</small>
                                    <div className={styles.fieldGrid}>
                                        {entryIdMetaCard}
                                        {smxBreaksStudySections.metaEntries.map(([label, value]) => (
                                            <div key={label} className={styles.fieldCard}>
                                                <small>{label}</small>
                                                <strong>{String(value)}</strong>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className={styles.rowListSection}>
                                    <small>Breaks Study Matrix</small>
                                    <div className={styles.rowListTableWrap}>
                                        <table className={styles.rowListTable}>
                                            <thead>
                                                <tr>
                                                    <th>Length Range</th>
                                                    {smxBreaksStudySections.columns.map((column) => (
                                                        <th key={column}>{column}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {smxBreaksStudySections.rows.map((row) => (
                                                    <tr key={row}>
                                                        <td>{row}</td>
                                                        {smxBreaksStudySections.columns.map((column) => (
                                                            <td key={column}>{smxBreaksStudySections.matrix[row]?.[column] ?? "-"}</td>
                                                        ))}
                                                    </tr>
                                                ))}
                                                <tr>
                                                    <td><strong>TOTAL BREAKS</strong></td>
                                                    {smxBreaksStudySections.columns.map((column) => (
                                                        <td key={column}>{smxBreaksStudySections.columnTotals[column] ?? "-"}</td>
                                                    ))}
                                                </tr>
                                                {smxBreaksStudySections.grandTotal !== undefined ? (
                                                    <tr>
                                                        <td><strong>GRAND TOTAL</strong></td>
                                                        <td>{String(smxBreaksStudySections.grandTotal)}</td>
                                                    </tr>
                                                ) : null}
                                                <tr>
                                                    <td><strong>NO. OF BREAKS 100 SPINDLES / HR</strong></td>
                                                    {smxBreaksStudySections.percentageColumns.map((column) => (
                                                        <td key={column}>{smxBreaksStudySections.columnBreaksPer100Sh[column] ?? "-"}</td>
                                                    ))}
                                                </tr>
                                                {smxBreaksStudySections.totalBreaksPer100Sh !== undefined ? (
                                                    <tr>
                                                        <td><strong>TOTAL NO. OF BREAKS/100SH</strong></td>
                                                        <td>{String(smxBreaksStudySections.totalBreaksPer100Sh)}</td>
                                                    </tr>
                                                ) : null}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        ) : trialsSections ? (
                            <>
                                <div className={styles.rowListSection}>
                                    <small>Meta</small>
                                    <div className={styles.fieldGrid}>
                                        {entryIdMetaCard}
                                        {trialsSections.metaEntries.map(([key, value]) => (
                                            <div key={key} className={styles.fieldCard}>
                                                <small>{TRIALS_META_LABELS[key] || FIELD_LABELS[key] || formatTitle(key)}</small>
                                                <strong>{isDateField(key) ? formatDateValue(value) : String(value)}</strong>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {trialsSections.groups.map((group) => (
                                    <div key={group.title} className={styles.rowListSection}>
                                        <small>{group.title}</small>
                                        <div className={styles.rowListTableWrap}>
                                            <table className={styles.rowListTable}>
                                                <thead>
                                                    <tr>
                                                        {group.columns.map((column) => (
                                                            <th key={column.key}>{column.label}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr>
                                                        {group.columns.map((column) => (
                                                            <td key={column.key}>{String(group.row[column.key])}</td>
                                                        ))}
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))}
                            </>
                        ) : wheelChangeFlatPairSections || wheelChangeParametersArraySections ? (
                            (() => {
                                const section = wheelChangeFlatPairSections || wheelChangeParametersArraySections;
                                return (
                                    <>
                                        <div className={styles.rowListSection}>
                                            <small>Meta</small>
                                            <div className={styles.fieldGrid}>
                                                {entryIdMetaCard}
                                                {section.metaEntries.map(([key, value]) => (
                                                    <div key={key} className={styles.fieldCard}>
                                                        <small>{FIELD_LABELS[key] || formatTitle(key)}</small>
                                                        <strong>{isDateField(key) ? formatDateValue(value) : String(value)}</strong>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className={styles.rowListSection}>
                                            <small>Parameters (Existing / Proposed)</small>
                                            <div className={styles.rowListTableWrap}>
                                                <table className={styles.rowListTable}>
                                                    <thead>
                                                        <tr>
                                                            <th>Parameter</th>
                                                            <th>Existing</th>
                                                            <th>Proposed</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {section.rows.map((row, rowIndex) => (
                                                            <tr key={rowIndex}>
                                                                <td>{String(row.parameter)}</td>
                                                                <td>{String(row.existing)}</td>
                                                                <td>{String(row.proposed)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </>
                                );
                            })()
                        ) : groupedFieldSections || yarnCvSections || countChangeSections ? (
                            (() => {
                                const section = groupedFieldSections || yarnCvSections || countChangeSections;
                                return (
                                    <>
                                        <div className={styles.rowListSection}>
                                            <small>Meta</small>
                                            <div className={styles.fieldGrid}>
                                                {entryIdMetaCard}
                                                {section.metaEntries.map(([key, value]) => (
                                                    <div key={key} className={styles.fieldCard}>
                                                        <small>{FIELD_LABELS[key] || formatTitle(key)}</small>
                                                        <strong>{isDateField(key) ? formatDateValue(value) : String(value)}</strong>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {section.groups.map((group) => (
                                            <div key={group.title} className={styles.rowListSection}>
                                                <small>{group.title}</small>
                                                <div className={styles.rowListTableWrap}>
                                                    <table className={styles.rowListTable}>
                                                        <thead>
                                                            <tr>
                                                                {group.columns.map((column) => (
                                                                    <th key={column.key}>{column.label}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {group.rows.map((row, rowIndex) => (
                                                                <tr key={rowIndex}>
                                                                    {group.columns.map((column) => (
                                                                        <td key={column.key}>
                                                                            {row[column.key] === undefined || row[column.key] === null || row[column.key] === ""
                                                                                ? "-"
                                                                                : String(row[column.key])}
                                                                        </td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                );
                            })()
                        ) : (
                            <>
                                <div className={styles.fieldGrid}>
                                    {isDetailLoading ? (
                                        <div className={styles.emptyState}>Loading notebook details...</div>
                                    ) : selectedFields.length ? (
                                        <>
                                            {simpleFields.some((field) => normalizeKey(field.key) === "entryid") ? null : entryIdMetaCard}
                                            {simpleFields.map((field) => (
                                                <div key={field.key} className={styles.fieldCard}>
                                                    <small>{field.label}</small>
                                                    <strong>{isDateField(field.key) ? formatDateValue(field.value) : String(field.value)}</strong>
                                                </div>
                                            ))}
                                        </>
                                    ) : (
                                        <div className={styles.emptyState}>No submitted fields available.</div>
                                    )}
                                </div>

                                {!isDetailLoading && rowListFields.map((field) => {
                                    const columns = Array.from(
                                        field.rows.reduce((keys, row) => {
                                            if (row && typeof row === "object") {
                                                Object.keys(row).forEach((key) => keys.add(key));
                                            }
                                            return keys;
                                        }, new Set())
                                    );

                                    return (
                                        <div key={field.key} className={styles.rowListSection}>
                                            <small>{field.label}</small>
                                            <div className={styles.rowListTableWrap}>
                                                <table className={styles.rowListTable}>
                                                    <thead>
                                                        <tr>
                                                            {columns.map((column) => (
                                                                <th key={column}>{formatTitle(column)}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {field.rows.map((row, rowIndex) => (
                                                            <tr key={rowIndex}>
                                                                {columns.map((column) => (
                                                                    <td key={column}>
                                                                        {row?.[column] === null || typeof row?.[column] === "undefined" || row?.[column] === ""
                                                                            ? "-"
                                                                            : String(row[column])}
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        )}

                        {activeTab === "closed" || !canApproveNotebooks ? null : (
                            <>
                                <div className={styles.reviewSection}>
                                    <label className={styles.reviewLabel} htmlFor="submitted-notebook-review">
                                        Review<span className={styles.required}>*</span>
                                    </label>
                                    <textarea
                                        id="submitted-notebook-review"
                                        className={`${styles.reviewTextarea} ${reviewNoteError ? styles.reviewError : ""}`}
                                        value={reviewNote}
                                        onChange={(event) => {
                                            setReviewNote(event.target.value);
                                            if (reviewNoteError && event.target.value.trim()) setReviewNoteError(false);
                                        }}
                                        placeholder="Enter your review before acknowledging"
                                    />
                                    {reviewNoteError ? (
                                        <p className={styles.reviewErrorText}>Review is required before you can acknowledge.</p>
                                    ) : null}
                                </div>

                                <button
                                    type="button"
                                    className={styles.ackButton}
                                    disabled={Boolean(acknowledgingId)}
                                    onClick={requestAcknowledgeConfirmation}
                                >
                                    {acknowledgingId ? "Acknowledging..." : "Acknowledge"}
                                </button>
                            </>
                        )}

                        {showAcknowledgeConfirm ? (
                            <div className={styles.confirmOverlay} role="presentation">
                                <div
                                    className={styles.confirmDialog}
                                    role="alertdialog"
                                    aria-modal="true"
                                    aria-labelledby="acknowledge-confirm-title"
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <h3 id="acknowledge-confirm-title">Are you sure you have viewed the full details?</h3>
                                    <div className={styles.confirmActions}>
                                        <button
                                            type="button"
                                            className={styles.confirmNoButton}
                                            disabled={Boolean(acknowledgingId)}
                                            onClick={() => setShowAcknowledgeConfirm(false)}
                                        >
                                            No
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.confirmYesButton}
                                            disabled={Boolean(acknowledgingId)}
                                            onClick={handleAcknowledge}
                                        >
                                            Yes
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        {showApprovalRestricted ? (
                            <div className={styles.confirmOverlay} role="presentation">
                                <div
                                    className={styles.confirmDialog}
                                    role="alertdialog"
                                    aria-modal="true"
                                    aria-labelledby="approval-restricted-title"
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <h3 id="approval-restricted-title">Only L4 and L5 have access to approve.</h3>
                                    <div className={styles.confirmActions}>
                                        <button
                                            type="button"
                                            className={styles.confirmYesButton}
                                            onClick={() => setShowApprovalRestricted(false)}
                                        >
                                            OK
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
        </section>
    );
};

export default SubmittedNotebooksPage;

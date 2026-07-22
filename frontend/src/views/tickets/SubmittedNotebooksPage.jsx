import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { FiCalendar } from "react-icons/fi";
import {
    acknowledgeSubmittedNotebookApi,
    fetchSubmittedNotebookDetailApi,
    fetchSubmittedNotebooksApi,
} from "@/apis/submittedNotebooksApi";
import apiConfig from "@/apis/apiConfig";
import { fetchUsersAPI } from "@/apis/userApi";
import { isFullAccessUser, isSupervisorNavUser } from "@/utils/accessControl";
import styles from "@/styles/submittedNotebooks.module.css";

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

const FILTER_CASCADE = ["department", "subDepartment", "notebookType", "operator", "supervisor"];

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

const getDisplayValue = (value) => {
    const parsed = parseJsonValue(value);
    if (parsed === undefined || parsed === null || parsed === "") return "";
    if (parsed instanceof Date) return parsed.toISOString();
    if (Array.isArray(parsed) || (parsed && typeof parsed === "object")) {
        return JSON.stringify(parsed);
    }
    return parsed;
};

const addDisplayField = (fields, usedKeys, key, value, label = "") => {
    const normalizedKey = normalizeKey(key);
    if (
        !normalizedKey ||
        META_FIELD_KEYS.has(normalizedKey) ||
        PAYLOAD_CONTAINER_KEYS.has(normalizedKey) ||
        usedKeys.has(normalizedKey)
    ) {
        return;
    }

    const displayValue = getDisplayValue(value);
    if (displayValue === "") return;

    usedKeys.add(normalizedKey);
    fields.push({
        key,
        label: label || FIELD_LABELS[key] || formatTitle(key),
        value: displayValue,
    });
};

const flattenDisplayFields = (value, fields, usedKeys, prefix = "") => {
    const parsed = parseJsonValue(value);
    if (!parsed || typeof parsed !== "object") {
        if (prefix) addDisplayField(fields, usedKeys, prefix, parsed);
        return;
    }

    if (Array.isArray(parsed)) {
        if (prefix) addDisplayField(fields, usedKeys, prefix, parsed);
        return;
    }

    Object.entries(parsed).forEach(([key, item]) => {
        const nextKey = prefix ? `${prefix}_${key}` : key;
        const parsedItem = parseJsonValue(item);

        if (Array.isArray(parsedItem) || (parsedItem && typeof parsedItem === "object" && !(parsedItem instanceof Date))) {
            addDisplayField(fields, usedKeys, nextKey, parsedItem);
            return;
        }

        addDisplayField(fields, usedKeys, nextKey, parsedItem);
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

const formatDateTime = (value) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return `${formatDateValue(value)} | ${formatTime(value)}`;
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
    if (isFullAccessUser(user)) return true;

    const approverValues = getNotebookApproverValues(notebook);
    if (!approverValues.length) return false;

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

const buildSubmittedNotebookQuery = (user) => {
    if (isFullAccessUser(user)) return {};

    return Object.fromEntries(
        Object.entries({
            approval_l2: user?.employee_id || user?.employeeId || user?.id || "",
            approval_l2_name: user?.full_name || user?.fullName || user?.name || "",
            l2_approver_user_id: user?.id || user?.employee_id || user?.employeeId || "",
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

const mergeNotebookRows = (...rowGroups) => {
    const seen = new Set();
    const rows = [];

    rowGroups.flat().forEach((row) => {
        if (!row || typeof row !== "object") return;
        const id = String(getNotebookId(row) || row?.notebook_submission_id || row?.notebookSubmissionId || "").trim();
        const key = id || JSON.stringify(row);
        if (seen.has(key)) return;
        seen.add(key);
        rows.push(row);
    });

    return rows;
};

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
    // The backend actually resolves the L2 approver(s) into notebook.assigned_l2_users — full
    // {id, employee_id, full_name, level, role} objects, not any of the flat approval_l2_name /
    // supervisor_name / l2_approver_name style fields below (those were never populated on a
    // submitted_notebooks row; they only ever existed on a separate submission-threshold config
    // table). Check the real field first before falling back to the legacy guesses.
    const assignedL2Names = getUsersDisplayNames(notebook?.assigned_l2_users);
    if (assignedL2Names.length) return assignedL2Names.join(", ");

    const assignedL3Names = getUsersDisplayNames(notebook?.assigned_l3_users);
    if (assignedL3Names.length) return assignedL3Names.join(", ");

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

const getNotebookL2ApprovalName = (notebook) => {
    const names = [
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

                const displayValue = getDisplayValue(value);
                if (displayValue === "") {
                    return null;
                }

                return {
                    key,
                    label: item.label || FIELD_LABELS[key] || formatTitle(key),
                    value: displayValue,
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
            usedKeys.add(normalizeKey(key));
            fields.push({ key, label: FIELD_LABELS[key] || formatTitle(key), value });
        }
    });

    Object.entries(payload || {}).forEach(([key, value]) => {
        if (ACKNOWLEDGEMENT_TIME_KEYS.has(normalizeKey(key))) {
            fields.push({
                key: "approval_l2_name",
                label: "L2 Approval Name",
                value: getNotebookL2ApprovalName(notebook),
            });
            usedKeys.add(normalizeKey(key));
            return;
        }

        if (
            usedKeys.has(normalizeKey(key)) ||
            META_FIELD_KEYS.has(normalizeKey(key)) ||
            value === undefined ||
            value === null ||
            value === ""
        ) {
            return;
        }
        addDisplayField(fields, usedKeys, key, value);
    });

    flattenDisplayFields(payload, fields, usedKeys);
    if (notebook && typeof notebook === "object") {
        flattenDisplayFields(notebook, fields, usedKeys);
    }

    return fields;
};

const SubmittedNotebooksPage = () => {
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
    const [reviewNote, setReviewNote] = useState("");
    const [reviewNoteError, setReviewNoteError] = useState(false);
    const [users, setUsers] = useState([]);
    const [filters, setFilters] = useState({
        department: "",
        subDepartment: "",
        notebookType: "",
        operator: "",
        supervisor: "",
        datePreset: "",
        dateFrom: "",
        dateTo: "",
    });
    const isSupervisor = isSupervisorNavUser(user) && !isFullAccessUser(user);
    const isAdminUser = isFullAccessUser(user);
    const [activeTab, setActiveTab] = useState("pending");
    const lastLoadKeyRef = useRef("");
    const inFlightLoadKeyRef = useRef("");
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

    const loadNotebooks = async () => {
        if (!isAuthHydrated) {
            return;
        }

        const query = buildSubmittedNotebookQuery(user);
        const loadKey = `${getUserLoadKey(user)}::${serializeQuery(query)}`;

        if (inFlightLoadKeyRef.current === loadKey || lastLoadKeyRef.current === loadKey) {
            return;
        }

        inFlightLoadKeyRef.current = loadKey;
        setIsLoading(true);
        setError("");
        try {
            const data = await fetchSubmittedNotebooksApi(query);
            let rows = normalizeList(data);

            if (Object.keys(query).length) {
                const fallbackData = await fetchSubmittedNotebooksApi();
                rows = mergeNotebookRows(rows, normalizeList(fallbackData));
            }

            const userRows = rows.filter((notebook) => isNotebookForUser(notebook, user));
            setNotebooks(userRows);
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
    }, [isAuthHydrated, user?.id, user?.employee_id, user?.employeeId, user?.emp_id, user?.full_name, user?.fullName, user?.name, user?.username, user?.role, user?.role_name, user?.roleName]);

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

    const enrichedNotebooks = useMemo(
        () =>
            notebooks
                .filter((notebook) =>
                    activeTab === "pending"
                        ? isNotebookPendingAcknowledgement(notebook)
                        : !isNotebookPendingAcknowledgement(notebook)
                )
                .map((notebook) => {
                    const { department, subDepartment } = resolveNotebookDepartment(notebook);
                    return {
                        notebook,
                        id: getNotebookId(notebook),
                        department,
                        subDepartment,
                        title: getNotebookTitle(notebook),
                        operator: getNotebookOperatorName(notebook, users),
                        // Who acknowledged a Closed notebook is only shown to admins — everyone
                        // else (including the supervisor who acknowledged it themselves) sees
                        // "--" on this tab so one supervisor's activity isn't visible to another.
                        supervisor:
                            activeTab === "closed" && !isAdminUser
                                ? "--"
                                : getNotebookSupervisorName(notebook, users),
                        createdAt: getCreatedDate(notebook),
                        review: getNotebookReviewNote(notebook),
                    };
                }),
        [notebooks, users, activeTab, isAdminUser]
    );

    const uniqueValues = (values) => Array.from(new Set(values.filter((value) => value && value !== "--")));

    const filterOptions = useMemo(() => {
        const byDepartment = enrichedNotebooks.filter(
            (item) => !filters.department || item.department === filters.department
        );
        const bySubDepartment = byDepartment.filter(
            (item) => !filters.subDepartment || item.subDepartment === filters.subDepartment
        );
        const byNotebookType = bySubDepartment.filter(
            (item) => !filters.notebookType || item.title === filters.notebookType
        );
        const byOperator = byNotebookType.filter(
            (item) => !filters.operator || item.operator === filters.operator
        );

        return {
            departments: uniqueValues(enrichedNotebooks.map((item) => item.department)),
            subDepartments: uniqueValues(byDepartment.map((item) => item.subDepartment)),
            notebookTypes: uniqueValues(bySubDepartment.map((item) => item.title)),
            operators: uniqueValues(byNotebookType.map((item) => item.operator)),
            supervisors: uniqueValues(byOperator.map((item) => item.supervisor)),
        };
    }, [enrichedNotebooks, filters.department, filters.subDepartment, filters.notebookType, filters.operator]);

    const filteredNotebooks = useMemo(
        () =>
            enrichedNotebooks
                .filter(
                    (item) =>
                        (!filters.department || item.department === filters.department) &&
                        (!filters.subDepartment || item.subDepartment === filters.subDepartment) &&
                        (!filters.notebookType || item.title === filters.notebookType) &&
                        (!filters.operator || item.operator === filters.operator) &&
                        (!filters.supervisor || item.supervisor === filters.supervisor) &&
                        (!filters.dateFrom || new Date(item.createdAt || 0) >= new Date(`${filters.dateFrom}T00:00:00`)) &&
                        (!filters.dateTo || new Date(item.createdAt || 0) <= new Date(`${filters.dateTo}T23:59:59.999`))
                )
                .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0)),
        [enrichedNotebooks, filters]
    );

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

    const handleAcknowledge = async () => {
        const id = getNotebookId(selectedNotebook);
        if (!id) return;
        setAcknowledgingId(id);
        try {
            await acknowledgeSubmittedNotebookApi(id, { note: reviewNote.trim() });
            setShowAcknowledgeConfirm(false);
            setReviewNote("");
            setReviewNoteError(false);
            await loadNotebooks();
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
        if (!reviewNote.trim()) {
            setReviewNoteError(true);
            return;
        }
        setReviewNoteError(false);
        setShowAcknowledgeConfirm(true);
    };

    const selectedFields = buildFieldCards(selectedNotebook);
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
                        <select
                            className={styles.filterSelect}
                            value={filters.notebookType}
                            onChange={(event) => handleFilterChange("notebookType", event.target.value)}
                        >
                            <option value="">All</option>
                            {filterOptions.notebookTypes.map((value) => (
                                <option key={value} value={value}>{value}</option>
                            ))}
                        </select>
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
                    {filteredNotebooks.map((item, index) => {
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

                        {activeTab === "closed" ? null : (
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
                    </div>
                </div>
            )}
        </section>
    );
};

export default SubmittedNotebooksPage;

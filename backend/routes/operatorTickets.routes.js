const express = require('express');
const router = express.Router();
const client = require('../connection');
const { createNotificationsForUsers, ensureNotificationMetadataColumns } = require('../utils/notifications');
const sendEmail = require('../email');
const multer = require('multer');
const csvParser = require('csv-parser');
const { Readable } = require('stream');

const csvUpload = multer({ storage: multer.memoryStorage() });

const nonAcknowledgementTicketWhere = `NOT (
  ot.ticket_reason = 'MISSING_VALUE'
  AND (ot.violation_details->>'category') = 'MISSED_FREQUENCY'
  AND COALESCE(ot.violation_details->>'ticket_type', '') IN ('SUBMISSION_ACKNOWLEDGEMENT', 'NOTEBOOK_ACK_OVERDUE')
)`;

// Process Parameter (PP notebook) tickets get their own tab (see
// /process-parameter-ticketing below), same as acknowledgement tickets do --
// so they must be excluded here to avoid also showing up in the generic
// ticket list and the Submission tab, both of which otherwise match on
// ticket_reason = 'MISSING_VALUE' AND category = 'MISSED_FREQUENCY' alone.
const nonPpNotebookTicketWhere = `NOT (
  ot.ticket_reason = 'MISSING_VALUE'
  AND (ot.violation_details->>'category') = 'MISSED_FREQUENCY'
  AND COALESCE(ot.violation_details->>'ticket_type', '') IN ('PP_NOTEBOOK_INCOMPLETE', 'PP_BATCH_INCOMPLETE')
)`;

const normalizeKey = (value) => String(value || '').toLowerCase().replace(/\s+/g, '_');
const normalizeParameterNames = (parameterName) => {
  if (Array.isArray(parameterName)) {
    return parameterName
      .map((item) => pickDropdownValue(item))
      .filter((item) => item !== null && item !== '');
  }

  if (typeof parameterName === 'string') {
    const trimmed = parameterName.trim();
    if (!trimmed) return [];

    // Allow JSON-array strings from clients that serialize payload values.
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => pickDropdownValue(item))
            .filter((item) => item !== null && item !== '');
        }
        const single = pickDropdownValue(parsed);
        return single ? [single] : [];
      } catch (_) {
        // Fall back to comma split below.
      }
    }

    return trimmed
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }

  const single = pickDropdownValue(parameterName);
  if (single) return [single];

  // Support map-like payloads: { moisture: ..., micronaire: ... }
  if (parameterName && typeof parameterName === 'object' && !Array.isArray(parameterName)) {
    return Object.keys(parameterName).filter(Boolean);
  }

  return [];
};

const pickDropdownValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (typeof value === 'object') {
    const candidate =
      value.value ??
      value.label ??
      value.name ??
      value.title ??
      value.input_field ??
      value.parameter_name ??
      value.field ??
      value.key;
    if (candidate === null || candidate === undefined) return null;
    return String(candidate).trim();
  }
  return null;
};

const toNumericIfPossible = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
};

const parseMaybeJsonObject = (value) => {
  if (!value) return value;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    return value;
  }
};

const normalizeThresholdInputs = (plusThreshold, minusThreshold, actualValue) => {
  let normalizedPlus = plusThreshold;
  let normalizedMinus = minusThreshold;
  let normalizedActual = actualValue;

  if (typeof plusThreshold === 'string') {
    const trimmed = plusThreshold.trim();
    const pattern = /^(-?\d+(?:\.\d+)?)\s*\(\s*\+?\s*(-?\d+(?:\.\d+)?)\s*\/\s*-?\s*(-?\d+(?:\.\d+)?)\s*\)$/;
    const match = trimmed.match(pattern);

    if (match) {
      normalizedActual = normalizedActual ?? match[1];
      normalizedPlus = match[2];
      normalizedMinus = match[3];
    }
  }

  return {
    plusThreshold: toNumericIfPossible(normalizedPlus),
    minusThreshold: toNumericIfPossible(normalizedMinus),
    actualValue: toNumericIfPossible(normalizedActual)
  };
};

const resolveFieldValue = (obj, fieldName) => {
  if (!obj || typeof obj !== 'object') return undefined;
  const normalizedField = normalizeKey(fieldName);
  const key = Object.keys(obj).find((k) => normalizeKey(k) === normalizedField);
  return key ? obj[key] : undefined;
};

const parseRangeValue = (raw) => {
  if (Array.isArray(raw) && raw.length === 2) {
    const min = Number(raw[0]);
    const max = Number(raw[1]);
    if (Number.isFinite(min) && Number.isFinite(max)) return { min, max };
  }
  if (typeof raw === 'string') {
    const parts = raw.split(',').map((v) => Number(v.trim()));
    if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      return { min: parts[0], max: parts[1] };
    }
  }
  if (raw && typeof raw === 'object') {
    const min = Number(raw.min ?? raw.lower ?? raw.from);
    const max = Number(raw.max ?? raw.upper ?? raw.to);
    if (Number.isFinite(min) && Number.isFinite(max)) return { min, max };
  }
  return null;
};

const evaluateThresholdBreach = (actual, rule) => {
  const actualNum = Number(actual);
  if (!Number.isFinite(actualNum)) return null;

  const condition = String(rule?.condition_level || 'More Than')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const plusThreshold = Number(rule?.plus_threshold);
  const minusThreshold = Number(rule?.minus_threshold);
  const fallbackThreshold = Number(rule?.threshold_value);
  const effectivePlus = Number.isFinite(plusThreshold) ? plusThreshold : fallbackThreshold;
  const effectiveMinus = Number.isFinite(minusThreshold) ? minusThreshold : fallbackThreshold;

  if (condition === 'more than') {
    if (!Number.isFinite(effectivePlus)) return null;
    return actualNum > effectivePlus;
  }

  if (condition === 'less than') {
    if (!Number.isFinite(effectiveMinus)) return null;
    return actualNum < effectiveMinus;
  }

  if (condition === 'more and less than') {
    const std = Number(rule?.actual_value);
    if (!Number.isFinite(std) || !Number.isFinite(plusThreshold) || !Number.isFinite(minusThreshold)) return null;
    const min = std - minusThreshold;
    const max = std + plusThreshold;
    // Boundary-inclusive breach: values at min/max are also violations.
    return actualNum <= min || actualNum >= max;
  }

  return null;
};

const normalizeThresholdRules = (thresholdValue) => {
  if (!thresholdValue || typeof thresholdValue !== 'object') return null;
  const rules = {};
  for (const [field, value] of Object.entries(thresholdValue)) {
    if (value && typeof value === 'object' && (Object.prototype.hasOwnProperty.call(value, 'plus_threshold') || Object.prototype.hasOwnProperty.call(value, 'minus_threshold'))) {
      rules[field] = {
        plus_threshold: value.plus_threshold ?? null,
        minus_threshold: value.minus_threshold ?? null,
        actual_value: value.actual_value ?? null,
        condition_level: value.condition_level || 'More Than'
      };
    } else {
      rules[field] = {
        plus_threshold: value,
        minus_threshold: value,
        condition_level: 'More Than'
      };
    }
  }
  return rules;
};

const analyzeViolations = (parameterName, actualValue, thresholdRules) => {
  const fields = normalizeParameterNames(parameterName);
  const missingFields = [];
  const thresholdBreaches = [];

  for (const field of fields) {
    const actual = resolveFieldValue(actualValue, field);
    const rule = resolveFieldValue(thresholdRules, field);

    const isMissing =
      actual === null ||
      actual === undefined ||
      (typeof actual === 'string' && actual.trim() === '');

    if (isMissing) {
      missingFields.push(field);
      continue;
    }

    const breached = evaluateThresholdBreach(actual, rule);
    if (breached === true) {
      let deviationPercent = null;
      const actualNum = Number(actual);
      const plusNum = Number(rule?.plus_threshold);
      const minusNum = Number(rule?.minus_threshold);
      const baseActual = Number(rule?.actual_value);
      const mode = String(rule?.condition_level || 'More Than')
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (mode === 'more than' && Number.isFinite(plusNum) && plusNum !== 0) {
        deviationPercent = Math.abs(((actualNum - plusNum) / plusNum) * 100);
      } else if (mode === 'less than' && Number.isFinite(minusNum) && minusNum !== 0) {
        deviationPercent = Math.abs(((minusNum - actualNum) / minusNum) * 100);
      } else if (mode === 'more and less than' && Number.isFinite(baseActual) && Number.isFinite(plusNum) && Number.isFinite(minusNum)) {
        const lower = baseActual - minusNum;
        const upper = baseActual + plusNum;
        if (actualNum <= lower && lower !== 0) {
          deviationPercent = Math.abs(((lower - actualNum) / lower) * 100);
        } else if (actualNum >= upper && upper !== 0) {
          deviationPercent = Math.abs(((actualNum - upper) / upper) * 100);
        }
      }

      thresholdBreaches.push({
        field,
        actual_value: Number(actual),
        condition_level: rule?.condition_level || 'More Than',
        plus_threshold: rule?.plus_threshold ?? null,
        minus_threshold: rule?.minus_threshold ?? null,
        deviation_percent: Number.isFinite(deviationPercent) ? Number(deviationPercent.toFixed(4)) : null
      });
    }
  }

  let ticketReason = null;
  if (missingFields.length && thresholdBreaches.length) ticketReason = 'BOTH';
  else if (missingFields.length) ticketReason = 'MISSING_VALUE';
  else if (thresholdBreaches.length) ticketReason = 'THRESHOLD_BREACH';

  return {
    ticketReason,
    violationDetails: {
      missing_fields: missingFields,
      threshold_breaches: thresholdBreaches
    }
  };
};

const deriveSeverity = (violationDetails) => {
  const missingCount = violationDetails?.missing_fields?.length || 0;
  if (missingCount > 0) return 'High';

  const breaches = violationDetails?.threshold_breaches || [];
  let maxDeviation = 0;
  for (const breach of breaches) {
    const pct = Number(breach?.deviation_percent);
    if (Number.isFinite(pct) && pct > maxDeviation) {
      maxDeviation = pct;
    }
  }

  if (maxDeviation >= 20) return 'High';
  if (maxDeviation >= 10) return 'Medium';
  return breaches.length ? 'Low' : 'Medium';
};

const VALID_SEVERITIES = ['High', 'Medium', 'Low'];

// The criticality configured on the threshold rule (Value Threshold page) is authoritative —
// only fall back to the deviation-based derivation when the caller didn't supply a valid one.
const resolveSeverity = (requestedSeverity, violationDetails) => {
  const normalized = String(requestedSeverity || '').trim();
  const match = VALID_SEVERITIES.find((s) => s.toLowerCase() === normalized.toLowerCase());
  return match || deriveSeverity(violationDetails);
};

const getUserById = async (userId) => {
  const result = await client.query(
    `SELECT id, employee_id, full_name, email, level, department, role
     FROM users.user_details
     WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
};
const getUserByEmployeeId = async (employeeId) => {
  const code = String(employeeId || '').trim();
  if (!code) return null;
  const result = await client.query(
    `SELECT id, employee_id, full_name, email, level, department, role
     FROM users.user_details
     WHERE lower(trim(employee_id)) = lower($1)
     LIMIT 1`,
    [code]
  );
  return result.rows[0] || null;
};

const isAdminApproverUser = (user) => {
  const role = String(user?.role || '').trim().toLowerCase();
  return ['admin', 'super admin', 'superadmin'].includes(role);
};

const getUserByFullName = async (fullName) => {
  const normalized = String(fullName || '').trim();
  if (!normalized) return null;

  const numericId = parsePositiveInt(normalized);
  if (numericId) {
    const userById = await getUserById(numericId);
    if (userById) return userById;
  }

  const normalizedSingleSpace = normalized.replace(/\s+/g, ' ');
  const result = await client.query(
    `SELECT id, full_name
     FROM users.user_details
     WHERE lower(regexp_replace(trim(full_name), '\s+', ' ', 'g')) = lower($1)
        OR lower(trim(employee_id)) = lower($2)
        OR lower(trim(email)) = lower($2)
     ORDER BY
       CASE
         WHEN lower(regexp_replace(trim(full_name), '\s+', ' ', 'g')) = lower($1) THEN 1
         WHEN lower(trim(employee_id)) = lower($2) THEN 2
         WHEN lower(trim(email)) = lower($2) THEN 3
         ELSE 4
       END,
       id
     LIMIT 1`,
    [normalizedSingleSpace, normalized]
  );
  return result.rows[0] || null;
};
const parsePositiveInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const ensureThresholdMasterApprovalColumns = async () => {
  await client.query(`
    ALTER TABLE ticketing_system.threshold_master
    ADD COLUMN IF NOT EXISTS approval_l1_user_id integer REFERENCES users.user_details(id)
  `);
  await client.query(`
    ALTER TABLE ticketing_system.threshold_master
    ADD COLUMN IF NOT EXISTS approval_l2_user_id integer REFERENCES users.user_details(id)
  `);
  await client.query(`
    ALTER TABLE ticketing_system.threshold_master
    ADD COLUMN IF NOT EXISTS approval_l3_user_id integer
  `);
};

const ensureThresholdMasterL1ApproverTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.threshold_master_l1_approvers (
      id BIGSERIAL PRIMARY KEY,
      threshold_master_id BIGINT NOT NULL,
      approver_user_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (threshold_master_id, approver_user_id)
    )
  `);
  await client.query(`
    ALTER TABLE ticketing_system.threshold_master_l1_approvers
    ADD COLUMN IF NOT EXISTS id BIGSERIAL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.threshold_master_l1_approvers
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
  await client.query(`
    DELETE FROM ticketing_system.threshold_master_l1_approvers a
    USING (
      SELECT ctid,
             ROW_NUMBER() OVER (
               PARTITION BY threshold_master_id, approver_user_id
               ORDER BY ctid
             ) AS rn
      FROM ticketing_system.threshold_master_l1_approvers
    ) d
    WHERE a.ctid = d.ctid
      AND d.rn > 1
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS threshold_master_l1_approvers_threshold_user_uq
    ON ticketing_system.threshold_master_l1_approvers (threshold_master_id, approver_user_id)
  `);
};

const ensureThresholdMasterL2ApproverTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.threshold_master_l2_approvers (
      id BIGSERIAL PRIMARY KEY,
      threshold_master_id BIGINT NOT NULL,
      approver_user_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (threshold_master_id, approver_user_id)
    )
  `);
  await client.query(`
    ALTER TABLE ticketing_system.threshold_master_l2_approvers
    ADD COLUMN IF NOT EXISTS id BIGSERIAL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.threshold_master_l2_approvers
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
  await client.query(`
    DELETE FROM ticketing_system.threshold_master_l2_approvers a
    USING (
      SELECT ctid,
             ROW_NUMBER() OVER (
               PARTITION BY threshold_master_id, approver_user_id
               ORDER BY ctid
             ) AS rn
      FROM ticketing_system.threshold_master_l2_approvers
    ) d
    WHERE a.ctid = d.ctid
      AND d.rn > 1
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS threshold_master_l2_approvers_threshold_user_uq
    ON ticketing_system.threshold_master_l2_approvers (threshold_master_id, approver_user_id)
  `);
};

const ensureThresholdMasterL3ApproverTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.threshold_master_l3_approvers (
      id BIGSERIAL PRIMARY KEY,
      threshold_master_id BIGINT NOT NULL,
      approver_user_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (threshold_master_id, approver_user_id)
    )
  `);
  await client.query(`
    ALTER TABLE ticketing_system.threshold_master_l3_approvers
    ADD COLUMN IF NOT EXISTS id BIGSERIAL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.threshold_master_l3_approvers
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
  await client.query(`
    DELETE FROM ticketing_system.threshold_master_l3_approvers a
    USING (
      SELECT ctid,
             ROW_NUMBER() OVER (
               PARTITION BY threshold_master_id, approver_user_id
               ORDER BY ctid
             ) AS rn
      FROM ticketing_system.threshold_master_l3_approvers
    ) d
    WHERE a.ctid = d.ctid
      AND d.rn > 1
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS threshold_master_l3_approvers_threshold_user_uq
    ON ticketing_system.threshold_master_l3_approvers (threshold_master_id, approver_user_id)
  `);
};

const ensureOperatorTicketApprovalColumns = async () => {
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
    ADD COLUMN IF NOT EXISTS approval_l1_user_ids integer[] NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
    ADD COLUMN IF NOT EXISTS approval_l2_user_ids integer[] NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
    ADD COLUMN IF NOT EXISTS approval_l3_user_ids integer[] NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
    ADD COLUMN IF NOT EXISTS submission_frequency_config_id bigint NULL REFERENCES ticketing_system.screen_submission_frequency(id)
  `);
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
    ADD COLUMN IF NOT EXISTS tat_current_level text NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
    ADD COLUMN IF NOT EXISTS l1_tat_due_at timestamptz NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
    ADD COLUMN IF NOT EXISTS l2_tat_due_at timestamptz NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
    ADD COLUMN IF NOT EXISTS l3_tat_due_at timestamptz NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
    ADD COLUMN IF NOT EXISTS ticket_type varchar(50) NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
    ADD COLUMN IF NOT EXISTS l1_tat_hours integer NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
    ADD COLUMN IF NOT EXISTS l2_tat_hours integer NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
    ADD COLUMN IF NOT EXISTS l3_tat_hours integer NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
    ADD COLUMN IF NOT EXISTS description text NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
    ADD COLUMN IF NOT EXISTS ticket_kind varchar(50) NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
    ADD COLUMN IF NOT EXISTS source varchar(50) NULL
  `);
};

const ensureThresholdMasterTatColumns = async () => {
  await client.query(`
    ALTER TABLE ticketing_system.threshold_master
    ADD COLUMN IF NOT EXISTS l1_tat_hours integer NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.threshold_master
    ADD COLUMN IF NOT EXISTS l2_tat_hours integer NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.threshold_master
    ADD COLUMN IF NOT EXISTS l3_tat_hours integer NULL
  `);
};

const ensureNotificationRecipientColumn = async () => {
  await ensureNotificationMetadataColumns();
};

const getThresholdApproversFromMaster = async ({
  department,
  subDepartment,
  inputScreen,
  machineName,
  parameterName
}) => {
  const normalizedParameters = normalizeParameterNames(parameterName);
  if (!department || !subDepartment || !inputScreen || !normalizedParameters.length) {
    return { approval_l1_user_ids: [], approval_l2_user_ids: [], approval_l3_user_ids: [] };
  }

  const result = await client.query(
    `SELECT
       tm.id,
       tm.machine_name,
       COALESCE(l1.approval_l1_user_ids, ARRAY[]::int[]) AS approval_l1_user_ids,
       COALESCE(l2.approval_l2_user_ids, ARRAY[]::int[]) AS approval_l2_user_ids,
       COALESCE(l3.approval_l3_user_ids, ARRAY[]::int[]) AS approval_l3_user_ids
     FROM ticketing_system.threshold_master tm
     LEFT JOIN LATERAL (
       SELECT ARRAY_AGG(a.approver_user_id ORDER BY a.approver_user_id) AS approval_l1_user_ids
       FROM ticketing_system.threshold_master_l1_approvers a
       WHERE a.threshold_master_id = tm.id
     ) l1 ON true
     LEFT JOIN LATERAL (
       SELECT ARRAY_AGG(a.approver_user_id ORDER BY a.approver_user_id) AS approval_l2_user_ids
       FROM ticketing_system.threshold_master_l2_approvers a
       WHERE a.threshold_master_id = tm.id
     ) l2 ON true
     LEFT JOIN LATERAL (
       SELECT ARRAY_AGG(a.approver_user_id ORDER BY a.approver_user_id) AS approval_l3_user_ids
       FROM ticketing_system.threshold_master_l3_approvers a
       WHERE a.threshold_master_id = tm.id
     ) l3 ON true
     WHERE tm.department = $1
       AND tm.sub_department = $2
       AND tm.input_screen = $3
       AND tm.input_field = ANY($4::text[])
       AND tm.is_active = true
       AND ($5::text IS NULL OR tm.machine_name = $5 OR tm.machine_name IS NULL)
     ORDER BY CASE WHEN tm.machine_name = $5 THEN 0 ELSE 1 END, tm.id DESC
     LIMIT 1`,
    [department, subDepartment, inputScreen, normalizedParameters, machineName || null]
  );

  if (!result.rows.length) return { approval_l1_user_ids: [], approval_l2_user_ids: [], approval_l3_user_ids: [] };
  return {
    approval_l1_user_ids: result.rows[0].approval_l1_user_ids || [],
    approval_l2_user_ids: result.rows[0].approval_l2_user_ids || [],
    approval_l3_user_ids: result.rows[0].approval_l3_user_ids || []
  };
};

const getThresholdTatHoursFromMaster = async ({
  department,
  subDepartment,
  inputScreen,
  machineName,
  parameterName
}) => {
  await ensureThresholdMasterTatColumns();
  const normalizedParameters = normalizeParameterNames(parameterName);
  if (!department || !subDepartment || !inputScreen || !normalizedParameters.length) {
    return { l1_tat_hours: null, l2_tat_hours: null, l3_tat_hours: null };
  }

  const result = await client.query(
    `SELECT tm.l1_tat_hours, tm.l2_tat_hours, tm.l3_tat_hours
     FROM ticketing_system.threshold_master tm
     WHERE tm.department = $1
       AND tm.sub_department = $2
       AND tm.input_screen = $3
       AND tm.input_field = ANY($4::text[])
       AND tm.is_active = true
       AND ($5::text IS NULL OR tm.machine_name = $5 OR tm.machine_name IS NULL)
     ORDER BY CASE WHEN tm.machine_name = $5 THEN 0 ELSE 1 END, tm.id DESC
     LIMIT 1`,
    [department, subDepartment, inputScreen, normalizedParameters, machineName || null]
  );

  if (!result.rows.length) return { l1_tat_hours: null, l2_tat_hours: null, l3_tat_hours: null };
  return {
    l1_tat_hours: result.rows[0].l1_tat_hours ?? null,
    l2_tat_hours: result.rows[0].l2_tat_hours ?? null,
    l3_tat_hours: result.rows[0].l3_tat_hours ?? null
  };
};

const createTicketNotificationsForApprovers = async (ticketId, approverIds = []) => {
  if (!ticketId || !approverIds.length) return;
  const unique = Array.from(new Set(approverIds.filter((id) => Number.isInteger(Number(id)) && Number(id) > 0).map(Number)));
  await createNotificationsForUsers(unique, {
    ticketId,
    type: 'TICKET_ASSIGNED',
    category: 'Tickets',
    priority: 'High',
    title: `Ticket ${ticketId} assigned`,
    body: `A ticket has been assigned for your review or action.`,
    linkUrl: `/operator-tickets/${ticketId}`,
    payload: { ticket_id: ticketId }
  });
};

const createThresholdBreachNotifications = async (ticket, approverIds = [], violationDetails = {}) => {
  if (!ticket?.ticket_id || !approverIds.length) return;
  const breaches = Array.isArray(violationDetails?.threshold_breaches)
    ? violationDetails.threshold_breaches
    : [];
  if (!breaches.length) return;

  await createNotificationsForUsers(approverIds, {
    ticketId: ticket.ticket_id,
    type: 'THRESHOLD_BREACH_DETECTED',
    category: 'Thresholds',
    priority: ticket.severity === 'Critical' ? 'Critical' : 'High',
    title: `Threshold breach detected`,
    body: `${ticket.machine_name || 'Machine/process'} has ${breaches.length} parameter breach(es).`,
    linkUrl: `/operator-tickets/${ticket.ticket_id}`,
    payload: {
      ticket_id: ticket.ticket_id,
      machine_name: ticket.machine_name,
      severity: ticket.severity,
      breaches
    }
  });
};

const resolveApproverUserId = async ({
  levelLabel,
  expectedLevel,
  userIdValue,
  nameValue
}) => {
  let approverUserId = parsePositiveInt(userIdValue);
  const approverLookupValue = typeof nameValue === 'string' ? nameValue.trim() : nameValue;

  if (!approverUserId && approverLookupValue) {
    const approverByName = await getUserByFullName(approverLookupValue);
    if (!approverByName) {
      throw new Error(`${levelLabel}_name not found in users.user_details`);
    }
    approverUserId = approverByName.id;
  }

  if (userIdValue !== undefined && userIdValue !== null && !approverUserId) {
    throw new Error(`${levelLabel}_user_id must be a positive integer`);
  }

  if (approverUserId) {
    const approver = await getUserById(approverUserId);
    if (!approver) {
      throw new Error(`${levelLabel}_user_id not found in users.user_details`);
    }
    if (
      expectedLevel &&
      String(approver.level || '').trim().toUpperCase() !== expectedLevel &&
      !isAdminApproverUser(approver)
    ) {
      throw new Error(`${levelLabel} must reference a ${expectedLevel} user`);
    }
  }

  return approverUserId;
};

const toArray = (value) => {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (_) {
        // Fall back to comma split below.
      }
    }

    return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [value];
};

const resolveApproverUserIds = async ({
  levelLabel,
  expectedLevel,
  userIdValue,
  nameValue
}) => {
  const isPlaceholderValue = (value) => {
    const v = String(value || '').trim().toLowerCase();
    return (
      v === 'selected' ||
      v === 'select' ||
      v === 'choose' ||
      v === 'choose...' ||
      v.includes('selected') ||
      (v.includes('select') && !v.includes('@')) // keep emails intact
    );
  };

  const rawUserIds = toArray(userIdValue);
  const rawNames = toArray(nameValue);
  const resolvedUserIds = [];
  const seen = new Set();

  for (const rawId of rawUserIds) {
    const candidate =
      typeof rawId === 'object' && rawId !== null
        ? rawId.id ?? rawId.user_id ?? rawId.value
        : rawId;
    const candidateText = candidate === null || candidate === undefined ? '' : String(candidate).trim();
    if (!candidateText) continue; // Ignore empty placeholders from UI payloads.
    if (isPlaceholderValue(candidateText)) continue; // Ignore dropdown placeholder labels.

    const parsedId = parsePositiveInt(candidateText);

    if (!parsedId) {
      const userByIdentifier = await getUserByFullName(candidateText);
      if (!userByIdentifier?.id) {
        const userByEmployeeId = await getUserByEmployeeId(candidateText);
        if (!userByEmployeeId?.id) {
          throw new Error(`${levelLabel}_user_ids must contain positive user IDs, employee IDs, or user names`);
        }
        if (!seen.has(userByEmployeeId.id)) {
          seen.add(userByEmployeeId.id);
          resolvedUserIds.push(userByEmployeeId.id);
        }
        continue;
      }
      if (!seen.has(userByIdentifier.id)) {
        seen.add(userByIdentifier.id);
        resolvedUserIds.push(userByIdentifier.id);
      }
      continue;
    }

    if (!seen.has(parsedId)) {
      seen.add(parsedId);
      resolvedUserIds.push(parsedId);
    }
  }

  for (const rawName of rawNames) {
    const lookupValue = pickDropdownValue(rawName);
    if (!lookupValue) continue;
    if (isPlaceholderValue(lookupValue)) continue;

    const approverByName = await getUserByFullName(lookupValue);
    if (!approverByName) {
      // Ignore unresolved labels/placeholders from UI dropdown payloads.
      continue;
    }

    if (!seen.has(approverByName.id)) {
      seen.add(approverByName.id);
      resolvedUserIds.push(approverByName.id);
    }
  }

  for (const approverUserId of resolvedUserIds) {
    const approver = await getUserById(approverUserId);
    if (!approver) {
      throw new Error(`${levelLabel} contains a user_id not found in users.user_details`);
    }
    if (
      expectedLevel &&
      String(approver.level || '').trim().toUpperCase() !== expectedLevel &&
      !isAdminApproverUser(approver)
    ) {
      throw new Error(`${levelLabel} must reference only ${expectedLevel} users`);
    }
  }

  return resolvedUserIds;
};

const syncThresholdMasterL1Approvers = async (thresholdMasterId, approvalL1UserIds = []) => {
  await ensureThresholdMasterL1ApproverTable();
  await client.query(
    `DELETE FROM ticketing_system.threshold_master_l1_approvers
     WHERE threshold_master_id = $1`,
    [thresholdMasterId]
  );

  for (const approverUserId of approvalL1UserIds) {
    await client.query(
      `INSERT INTO ticketing_system.threshold_master_l1_approvers
       (threshold_master_id, approver_user_id)
       VALUES ($1, $2)
       ON CONFLICT (threshold_master_id, approver_user_id) DO NOTHING`,
      [thresholdMasterId, approverUserId]
    );
  }
};

const syncThresholdMasterL2Approvers = async (thresholdMasterId, approvalL2UserIds = []) => {
  await ensureThresholdMasterL2ApproverTable();
  await client.query(
    `DELETE FROM ticketing_system.threshold_master_l2_approvers
     WHERE threshold_master_id = $1`,
    [thresholdMasterId]
  );

  for (const approverUserId of approvalL2UserIds) {
    await client.query(
      `INSERT INTO ticketing_system.threshold_master_l2_approvers
       (threshold_master_id, approver_user_id)
       VALUES ($1, $2)
       ON CONFLICT (threshold_master_id, approver_user_id) DO NOTHING`,
      [thresholdMasterId, approverUserId]
    );
  }
};

const normalizeTicketStatusInput = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const statuses = {
    open: 'Open',
    reopened: 'Reopened',
    reopen: 'Reopened',
    rejected: 'Reopened',
    'in progress': 'In Progress',
    in_progress: 'In Progress',
    pending: 'In Progress',
    submitted: 'In Progress',
    closed: 'Closed',
    close: 'Closed',
    approved: 'Closed',
    approve: 'Closed',
    resolved: 'Closed'
  };
  return statuses[normalized] || null;
};

const syncThresholdMasterL3Approvers = async (thresholdMasterId, approvalL3UserIds = []) => {
  await ensureThresholdMasterL3ApproverTable();
  await client.query(
    `DELETE FROM ticketing_system.threshold_master_l3_approvers
     WHERE threshold_master_id = $1`,
    [thresholdMasterId]
  );

  for (const approverUserId of approvalL3UserIds) {
    await client.query(
      `INSERT INTO ticketing_system.threshold_master_l3_approvers
       (threshold_master_id, approver_user_id)
       VALUES ($1, $2)
       ON CONFLICT (threshold_master_id, approver_user_id) DO NOTHING`,
      [thresholdMasterId, approverUserId]
    );
  }
};

const getThresholdByIdWithApprovers = async (id) => {
  await ensureThresholdMasterL1ApproverTable();
  await ensureThresholdMasterL2ApproverTable();
  await ensureThresholdMasterL3ApproverTable();

  const result = await client.query(
    `SELECT
       tm.id,
       tm.department,
       tm.sub_department,
       tm.input_screen,
       tm.machine_name,
       tm.input_field,
       tm.condition_level,
       tm.plus_threshold,
       tm.minus_threshold,
       tm.actual_value,
       tm.is_active,
       COALESCE(l1.approval_l1_user_ids, ARRAY[]::int[]) AS approval_l1_user_ids,
       COALESCE(l1.approval_l1_names, ARRAY[]::text[]) AS approval_l1_names,
       COALESCE(l2.approval_l2_user_ids, ARRAY[]::int[]) AS approval_l2_user_ids,
       COALESCE(l2.approval_l2_names, ARRAY[]::text[]) AS approval_l2_names,
       COALESCE(l3.approval_l3_user_ids, ARRAY[]::int[]) AS approval_l3_user_ids,
       COALESCE(l3.approval_l3_names, ARRAY[]::text[]) AS approval_l3_names,
       tm.created_at,
       tm.updated_at
     FROM ticketing_system.threshold_master tm
     LEFT JOIN LATERAL (
       SELECT
         ARRAY_AGG(u.id ORDER BY u.full_name, u.id) AS approval_l1_user_ids,
         ARRAY_AGG(u.full_name ORDER BY u.full_name, u.id) AS approval_l1_names
       FROM ticketing_system.threshold_master_l1_approvers a
       JOIN users.user_details u ON u.id = a.approver_user_id
       WHERE a.threshold_master_id = tm.id
     ) l1 ON true
     LEFT JOIN LATERAL (
       SELECT
         ARRAY_AGG(u.id ORDER BY u.full_name, u.id) AS approval_l2_user_ids,
         ARRAY_AGG(u.full_name ORDER BY u.full_name, u.id) AS approval_l2_names
       FROM ticketing_system.threshold_master_l2_approvers a
       JOIN users.user_details u ON u.id = a.approver_user_id
       WHERE a.threshold_master_id = tm.id
     ) l2 ON true
     LEFT JOIN LATERAL (
       SELECT
         ARRAY_AGG(u.id ORDER BY u.full_name, u.id) AS approval_l3_user_ids,
         ARRAY_AGG(u.full_name ORDER BY u.full_name, u.id) AS approval_l3_names
       FROM ticketing_system.threshold_master_l3_approvers a
       JOIN users.user_details u ON u.id = a.approver_user_id
       WHERE a.threshold_master_id = tm.id
     ) l3 ON true
     WHERE tm.id = $1`,
    [id]
  );

  return result.rows[0] || null;
};

const getThresholdApproverOptions = async () => {
  const result = await client.query(
    `SELECT id, employee_id, full_name, email, level, department, role, account_status
     FROM users.user_details
     WHERE level IN ('L1', 'L2', 'L3')
     ORDER BY level, full_name, id`
  );

  const users = result.rows.map((row) => ({
    id: row.id,
    employee_id: row.employee_id,
    full_name: row.full_name,
    email: row.email,
    level: row.level,
    department: row.department,
    role: row.role,
    account_status: row.account_status
  }));

  return {
    l1_users: users.filter((user) => user.level === 'L1'),
    l2_users: users.filter((user) => user.level === 'L2'),
    l3_users: users.filter((user) => user.level === 'L3')
  };
};

const getDefaultApproverUserIdsByLevel = async ({ level, department = null } = {}) => {
  const normalizedLevel = String(level || '').trim().toUpperCase();
  if (!['L1', 'L2', 'L3'].includes(normalizedLevel)) return [];

  const values = [normalizedLevel];
  let where = `WHERE level = $1`;

  if (department && String(department).trim()) {
    values.push(String(department).trim());
    where += ` AND (department = $2 OR department IS NULL OR trim(department) = '')`;
  }

  const result = await client.query(
    `SELECT id
     FROM users.user_details
     ${where}
     ORDER BY
       CASE
         WHEN COALESCE(account_status, '') ILIKE 'active' THEN 0
         ELSE 1
       END,
       full_name,
       id`,
    values
  );

  return result.rows.map((row) => row.id).filter((id) => Number.isInteger(Number(id)) && Number(id) > 0);
};

const SCREEN_SUBMISSION_SOURCES = {
  'Cotton HVI Data Entry': { table: 'mixing.cotton_hvi_data_entry', dateColumn: 'inspection_date' },
  'Fibre Data Entry': { table: 'mixing.fibre_data_entry', dateColumn: 'inspection_date' },
  'AFIS Data Entry': { table: 'mixing.afis_data_entry', dateColumn: 'inspection_date' },
  'AFIS-6 Cotton Data Entry': { table: 'mixing.afis6_cotton_data_entry', dateColumn: 'inspection_date' },
  'Moisture Data Entry': { table: 'mixing.moisture_data_entry', dateColumn: 'inspection_date' },
  'Openness Data Entry': { table: 'mixing.openness_inspection', dateColumn: 'inspection_date' }
};

const normalizeFrequency = (value) => {
  if (typeof value === 'number' && value > 0) return value;
  if (typeof value === 'string') {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) return num;
    
    const normalized = value.toLowerCase().replace(/[\s-]+/g, '_').trim();
    if (normalized === 'daily') return 1;
    if (normalized === 'every_3_days' || normalized === 'three_days' || normalized === '3_days') return 3;
  }
  return null;
};

const frequencyGapDays = (frequency) => {
  if (typeof frequency === 'number') return frequency;
  if (typeof frequency === 'string') {
    const num = parseInt(frequency, 10);
    if (!isNaN(num) && num > 0) return num;
  }
  if (frequency === 'every_3_days') return 3;
  return 1;
};

const parseTatHours = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const ensureScreenFrequencyTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.screen_submission_frequency (
      id BIGSERIAL PRIMARY KEY,
      screen_name TEXT NOT NULL,
      department TEXT NULL,
      sub_department TEXT NULL,
      frequency INTEGER NOT NULL,
      occurrences INTEGER NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      approval_l1 TEXT NULL,
      approval_l1_name TEXT NULL,
      approval_l2 TEXT NULL,
      approval_l2_name TEXT NULL,
      approval_l3 TEXT NULL,
      approval_l3_name TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (screen_name, department, sub_department)
    )
  `);

  await client.query(`
    ALTER TABLE ticketing_system.screen_submission_frequency
    ADD COLUMN IF NOT EXISTS occurrences INTEGER NULL
  `);

  await client.query(`
    ALTER TABLE ticketing_system.screen_submission_frequency
    ADD COLUMN IF NOT EXISTS approval_l1 TEXT NULL
  `);

  await client.query(`
    ALTER TABLE ticketing_system.screen_submission_frequency
    ADD COLUMN IF NOT EXISTS approval_l1_name TEXT NULL
  `);

  await client.query(`
    ALTER TABLE ticketing_system.screen_submission_frequency
    ADD COLUMN IF NOT EXISTS approval_l2 TEXT NULL
  `);

  await client.query(`
    ALTER TABLE ticketing_system.screen_submission_frequency
    ADD COLUMN IF NOT EXISTS approval_l2_name TEXT NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.screen_submission_frequency
    ADD COLUMN IF NOT EXISTS approval_l3 TEXT NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.screen_submission_frequency
    ADD COLUMN IF NOT EXISTS approval_l3_name TEXT NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.screen_submission_frequency
    ADD COLUMN IF NOT EXISTS l1_tat_hours INTEGER NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.screen_submission_frequency
    ADD COLUMN IF NOT EXISTS l2_tat_hours INTEGER NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.screen_submission_frequency
    ADD COLUMN IF NOT EXISTS l3_tat_hours INTEGER NULL
  `);
  // submission_window_minutes was a per-screen concept that turned out to be
  // the wrong model (PP completion is tracked per entry_id batch instead, see
  // pp_notebook_batch_config in submittedNotebooks.routes.js); drop it rather
  // than leave it as dead cruft.
  await client.query(`
    ALTER TABLE ticketing_system.screen_submission_frequency
    DROP COLUMN IF EXISTS submission_window_minutes
  `);
};

const runSubmissionFrequencyTatCheck = async () => {
  await ensureScreenFrequencyTable();
  await ensureOperatorTicketApprovalColumns();

  // L1 -> L2: only once the L1 grace window (from ticket creation) has actually elapsed.
  await client.query(
    `UPDATE ticketing_system.operator_tickets ot
     SET tat_current_level = 'L2',
         status = CASE WHEN ot.status = 'Open' THEN 'In Progress' ELSE ot.status END,
         l1_tat_due_at = NULL,
         l2_tat_due_at = COALESCE(
           ot.l2_tat_due_at,
           CASE
             WHEN sf.l2_tat_hours IS NULL THEN NULL
             ELSE ot.created_at + (sf.l2_tat_hours || ' hours')::interval
           END
         ),
         approval_l2_user_ids = COALESCE(ot.approval_l2_user_ids, ARRAY[]::int[])
     FROM ticketing_system.screen_submission_frequency sf
     WHERE sf.id = ot.submission_frequency_config_id
       AND ot.ticket_reason = 'MISSING_VALUE'
       AND (ot.violation_details->>'category') = 'MISSED_FREQUENCY'
       AND COALESCE(ot.tat_current_level, 'L1') = 'L1'
       AND sf.is_active = true
       AND sf.l1_tat_hours IS NOT NULL
       AND sf.l1_tat_hours > 0
       AND ot.created_at + (sf.l1_tat_hours || ' hours')::interval <= NOW()`
  );

  // L2 -> L3: only when an L3 TAT is configured; otherwise the ticket keeps the
  // legacy two-level behavior and expires straight out of L2 below.
  await client.query(
    `UPDATE ticketing_system.operator_tickets ot
     SET tat_current_level = 'L3',
         l2_tat_due_at = NULL,
         l3_tat_due_at = COALESCE(
           ot.l3_tat_due_at,
           ot.created_at + (sf.l3_tat_hours || ' hours')::interval
         ),
         approval_l3_user_ids = COALESCE(ot.approval_l3_user_ids, ARRAY[]::int[])
     FROM ticketing_system.screen_submission_frequency sf
     WHERE sf.id = ot.submission_frequency_config_id
       AND ot.ticket_reason = 'MISSING_VALUE'
       AND (ot.violation_details->>'category') = 'MISSED_FREQUENCY'
       AND ot.tat_current_level = 'L2'
       AND sf.is_active = true
       AND sf.l2_tat_hours IS NOT NULL
       AND sf.l2_tat_hours > 0
       AND sf.l3_tat_hours IS NOT NULL
       AND sf.l3_tat_hours > 0
       AND ot.created_at + (sf.l2_tat_hours || ' hours')::interval <= NOW()`
  );

  // Expire out of L3 once its TAT elapses.
  const expiredFromL3 = await client.query(
    `UPDATE ticketing_system.operator_tickets ot
     SET status = 'No Due',
         tat_current_level = 'EXPIRED_L3'
     FROM ticketing_system.screen_submission_frequency sf
     WHERE sf.id = ot.submission_frequency_config_id
       AND ot.status = 'In Progress'
       AND ot.ticket_reason = 'MISSING_VALUE'
       AND (ot.violation_details->>'category') = 'MISSED_FREQUENCY'
       AND ot.tat_current_level = 'L3'
       AND sf.is_active = true
       AND sf.l3_tat_hours IS NOT NULL
       AND sf.l3_tat_hours > 0
       AND ot.created_at + (sf.l3_tat_hours || ' hours')::interval <= NOW()
     RETURNING ot.ticket_id, ot.machine_name, ot.created_at, sf.l1_tat_hours, sf.l2_tat_hours, sf.l3_tat_hours`
  );

  // Legacy fallback: configs with no L3 TAT still expire directly out of L2.
  const expiredFromL2 = await client.query(
    `UPDATE ticketing_system.operator_tickets ot
     SET status = 'No Due',
         tat_current_level = 'EXPIRED_L2'
     FROM ticketing_system.screen_submission_frequency sf
     WHERE sf.id = ot.submission_frequency_config_id
       AND ot.status = 'In Progress'
       AND ot.ticket_reason = 'MISSING_VALUE'
       AND (ot.violation_details->>'category') = 'MISSED_FREQUENCY'
       AND ot.tat_current_level = 'L2'
       AND sf.is_active = true
       AND (sf.l3_tat_hours IS NULL OR sf.l3_tat_hours <= 0)
       AND sf.l2_tat_hours IS NOT NULL
       AND sf.l2_tat_hours > 0
       AND ot.created_at + (sf.l2_tat_hours || ' hours')::interval <= NOW()
     RETURNING ot.ticket_id, ot.machine_name, ot.created_at, sf.l1_tat_hours, sf.l2_tat_hours, sf.l3_tat_hours`
  );

  return [...expiredFromL3.rows, ...expiredFromL2.rows];
};

// Same L1->L2->L3 TAT escalation as submission-frequency tickets, but for
// threshold-violation tickets, which carry their own denormalized TAT hours
// (set from threshold_master at creation time) instead of joining out to
// screen_submission_frequency.
const runThresholdTicketTatCheck = async () => {
  await ensureOperatorTicketApprovalColumns();

  // L1 -> L2: L1 never submitted within its TAT window.
  const escalatedToL2 = await client.query(
    `UPDATE ticketing_system.operator_tickets ot
     SET tat_current_level = 'L2',
         status = CASE WHEN ot.status = 'Open' THEN 'In Progress' ELSE ot.status END,
         l1_tat_due_at = NULL,
         l2_tat_due_at = CASE
           WHEN ot.l2_tat_hours IS NOT NULL THEN CURRENT_TIMESTAMP + (ot.l2_tat_hours || ' hours')::interval
           ELSE NULL
         END
     WHERE ot.submission_frequency_config_id IS NULL
       AND COALESCE(ot.tat_current_level, 'L1') = 'L1'
       AND ot.l1_tat_due_at IS NOT NULL
       AND ot.l1_tat_due_at <= NOW()
     RETURNING ot.ticket_id, ot.machine_name, ot.approval_l2_user_ids`
  );

  for (const row of escalatedToL2.rows) {
    await createNotificationsForUsers(row.approval_l2_user_ids || [], {
      ticketId: row.ticket_id,
      type: 'TICKET_ASSIGNED',
      category: 'Tickets',
      priority: 'High',
      title: `Ticket ${row.ticket_id} needs your attention`,
      body: `${row.machine_name || 'A ticket'} missed its L1 TAT and was escalated to you.`,
      linkUrl: `/operator-tickets/${row.ticket_id}`,
      payload: { ticket_id: row.ticket_id, role: 'L2', reason: 'L1_TAT_EXPIRED' }
    });
  }

  // L2 -> L3: L2 never accepted/rejected within its TAT window.
  const escalatedToL3 = await client.query(
    `UPDATE ticketing_system.operator_tickets ot
     SET tat_current_level = 'L3',
         l2_tat_due_at = NULL,
         l3_tat_due_at = CASE
           WHEN ot.l3_tat_hours IS NOT NULL THEN CURRENT_TIMESTAMP + (ot.l3_tat_hours || ' hours')::interval
           ELSE NULL
         END
     WHERE ot.submission_frequency_config_id IS NULL
       AND ot.tat_current_level = 'L2'
       AND ot.l2_tat_due_at IS NOT NULL
       AND ot.l2_tat_due_at <= NOW()
     RETURNING ot.ticket_id, ot.machine_name, ot.approval_l3_user_ids`
  );

  for (const row of escalatedToL3.rows) {
    await createNotificationsForUsers(row.approval_l3_user_ids || [], {
      ticketId: row.ticket_id,
      type: 'TICKET_ASSIGNED',
      category: 'Tickets',
      priority: 'Critical',
      title: `Ticket ${row.ticket_id} needs your attention`,
      body: `${row.machine_name || 'A ticket'} missed its L2 TAT and was escalated to you.`,
      linkUrl: `/operator-tickets/${row.ticket_id}`,
      payload: { ticket_id: row.ticket_id, role: 'L3', reason: 'L2_TAT_EXPIRED' }
    });
  }

  // Expire out of L3 once its TAT elapses (no L4 to escalate to).
  const expiredFromL3 = await client.query(
    `UPDATE ticketing_system.operator_tickets ot
     SET tat_current_level = 'EXPIRED_L3'
     WHERE ot.submission_frequency_config_id IS NULL
       AND ot.tat_current_level = 'L3'
       AND ot.l3_tat_due_at IS NOT NULL
       AND ot.l3_tat_due_at <= NOW()
     RETURNING ot.ticket_id, ot.machine_name, ot.created_at`
  );

  return expiredFromL3.rows;
};

router.post('/submission-frequency/tat/check', async (req, res, next) => {
  try {
    const noDueTickets = await runSubmissionFrequencyTatCheck();
    res.status(200).json({
      message: 'Submission frequency TAT check completed',
      no_due_count: noDueTickets.length,
      no_due_tickets: noDueTickets
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /operator-tickets/submission-frequency:
 *   post:
 *     summary: Create or update submission frequency for an input screen
 *     tags: [Operator Tickets]
 *     description: Set a custom submission frequency (in days) for a screen. Supports any positive integer (1, 2, 3, 7, etc.)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - screen_name
 *               - frequency
 *             properties:
 *               screen_name:
 *                 type: string
 *                 example: "Fibre Data Entry"
 *               department:
 *                 type: string
 *                 nullable: true
 *                 example: "Quality Control"
 *               sub_department:
 *                 type: string
 *                 nullable: true
 *                 example: "Mixing"
 *               frequency:
 *                 type: integer
 *                 description: Number of days between submissions
 *                 example: 2
 *               is_active:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Frequency saved successfully
 *       400:
 *         description: Invalid parameters
 */
router.post('/submission-frequency', async (req, res, next) => {
  try {
    await ensureScreenFrequencyTable();
    await ensureOperatorTicketApprovalColumns();

    const {
      screen_name,
      department = null,
      sub_department = null,
      frequency,
      occurrences = null,
      is_active = true,
      approval_l1 = null,
      approval_l1_name = null,
      approval_l2 = null,
      approval_l2_name = null,
      approval_l3 = null,
      approval_l3_name = null,
      l1_tat_hours = null,
      l2_tat_hours = null,
      l3_tat_hours = null
    } = req.body || {};

    const normalizedFrequency = normalizeFrequency(frequency);
    const normalizedOccurrences =
      occurrences === null || occurrences === undefined || occurrences === ''
        ? null
        : Number(occurrences);
    const normalizedL1TatHours = parseTatHours(l1_tat_hours);
    const normalizedL2TatHours = parseTatHours(l2_tat_hours);
    const normalizedL3TatHours = parseTatHours(l3_tat_hours);

    if (!screen_name || !normalizedFrequency) {
      return res.status(400).json({
        error: 'Invalid parameters',
        message: 'screen_name and frequency are required'
      });
    }

    if (
      normalizedOccurrences !== null &&
      (!Number.isInteger(normalizedOccurrences) || normalizedOccurrences < 1)
    ) {
      return res.status(400).json({
        error: 'Invalid occurrences',
        message: 'occurrences must be a positive integer'
      });
    }
    if (l1_tat_hours !== null && l1_tat_hours !== undefined && l1_tat_hours !== '' && !normalizedL1TatHours) {
      return res.status(400).json({
        error: 'Invalid L1 TAT',
        message: 'l1_tat_hours must be a positive integer'
      });
    }
    if (l2_tat_hours !== null && l2_tat_hours !== undefined && l2_tat_hours !== '' && !normalizedL2TatHours) {
      return res.status(400).json({
        error: 'Invalid L2 TAT',
        message: 'l2_tat_hours must be a positive integer'
      });
    }
    if (l3_tat_hours !== null && l3_tat_hours !== undefined && l3_tat_hours !== '' && !normalizedL3TatHours) {
      return res.status(400).json({
        error: 'Invalid L3 TAT',
        message: 'l3_tat_hours must be a positive integer'
      });
    }

    const result = await client.query(
      `INSERT INTO ticketing_system.screen_submission_frequency
       (
         screen_name,
         department,
         sub_department,
         frequency,
         occurrences,
         is_active,
         approval_l1,
         approval_l1_name,
         approval_l2,
         approval_l2_name,
         approval_l3,
         approval_l3_name,
         l1_tat_hours,
         l2_tat_hours,
         l3_tat_hours,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
       ON CONFLICT (screen_name, department, sub_department)
       DO UPDATE SET
         frequency = EXCLUDED.frequency,
         occurrences = EXCLUDED.occurrences,
         is_active = EXCLUDED.is_active,
         approval_l1 = EXCLUDED.approval_l1,
         approval_l1_name = EXCLUDED.approval_l1_name,
         approval_l2 = EXCLUDED.approval_l2,
         approval_l2_name = EXCLUDED.approval_l2_name,
         approval_l3 = EXCLUDED.approval_l3,
         approval_l3_name = EXCLUDED.approval_l3_name,
         l1_tat_hours = EXCLUDED.l1_tat_hours,
         l2_tat_hours = EXCLUDED.l2_tat_hours,
         l3_tat_hours = EXCLUDED.l3_tat_hours,
         updated_at = NOW()
       RETURNING *`,
      [
        screen_name,
        department,
        sub_department,
        normalizedFrequency,
        normalizedOccurrences,
        is_active,
        approval_l1,
        approval_l1_name,
        approval_l2,
        approval_l2_name,
        approval_l3,
        approval_l3_name,
        normalizedL1TatHours,
        normalizedL2TatHours,
        normalizedL3TatHours
      ]
    );

    res.status(200).json({
      message: 'Submission frequency saved successfully',
      config: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /operator-tickets/submission-frequency:
 *   get:
 *     summary: Retrieve all submission frequency configurations
 *     tags: [Operator Tickets]
 *     description: Get all configured submission frequencies for input screens
 *     responses:
 *       200:\n *         description: List of all frequency configurations
 */
router.get('/submission-frequency', async (req, res, next) => {
  try {
    await ensureScreenFrequencyTable();

    const result = await client.query(
      `SELECT
         id,
         screen_name,
         department,
         sub_department,
         frequency,
         occurrences,
         is_active,
         approval_l1,
         approval_l1_name,
         approval_l2,
         approval_l2_name,
         l1_tat_hours,
         l2_tat_hours,
         l3_tat_hours,
         created_at,
         updated_at
       FROM ticketing_system.screen_submission_frequency
       ORDER BY screen_name, department NULLS FIRST, sub_department NULLS FIRST`
    );

    res.status(200).json({ configs: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /operator-tickets/submission-frequency/check:
 *   post:
 *     summary: Check and create tickets for missed submissions
 *     tags: [Operator Tickets]
 *     description: |
 *       Checks all active frequency configurations and creates tickets for screens that have missed 
 *       their submission deadline. For example, if a screen has frequency=2, a ticket is created 
 *       if no submission was made in the last 2 days.
 *     responses:
 *       200:
 *         description: Submission frequency check completed
 */
const checkSubmissionFrequencyTickets = async () => {
    await ensureScreenFrequencyTable();
    await ensureOperatorTicketApprovalColumns();

    const noDueTickets = await runSubmissionFrequencyTatCheck();
    await runThresholdTicketTatCheck();

    const today = new Date();
    const rows = await client.query(
      `SELECT id, screen_name, department, sub_department, frequency, occurrences, is_active, l1_tat_hours, l2_tat_hours, l3_tat_hours,
              approval_l1, approval_l2, approval_l3
       FROM ticketing_system.screen_submission_frequency
       WHERE is_active = true`
    );

    const createdTickets = [];
    const skipped = [];

    for (const config of rows.rows) {
      const source = SCREEN_SUBMISSION_SOURCES[config.screen_name];
      if (!source) {
        skipped.push({
          screen_name: config.screen_name,
          reason: 'source_mapping_missing'
        });
        continue;
      }

      const gapDays = frequencyGapDays(config.frequency);
      const dueFromDate = new Date(today);
      dueFromDate.setDate(dueFromDate.getDate() - gapDays);

      const activityResult = await client.query(
        `SELECT
           MAX(${source.dateColumn}) AS last_submission_date,
           COUNT(*) FILTER (WHERE ${source.dateColumn} >= $1) AS submissions_in_window
         FROM ${source.table}
         WHERE ${source.dateColumn} IS NOT NULL`,
        [dueFromDate]
      );

      const lastSubmission = activityResult.rows[0]?.last_submission_date
        ? new Date(activityResult.rows[0].last_submission_date)
        : null;
      const actualOccurrences = Number(activityResult.rows[0]?.submissions_in_window || 0);
      const minOccurrences = Number(config.occurrences || 0);

      const missedFrequency = !lastSubmission || lastSubmission < dueFromDate;
      const missedOccurrences = Number.isInteger(minOccurrences) && minOccurrences > 0
        ? actualOccurrences < minOccurrences
        : false;

      if (!missedFrequency && !missedOccurrences) {
        skipped.push({
          screen_name: config.screen_name,
          reason: 'within_frequency_and_occurrence',
          last_submission_date: lastSubmission ? lastSubmission.toISOString() : null,
          expected_occurrences: minOccurrences > 0 ? minOccurrences : null,
          actual_occurrences: actualOccurrences
        });
        continue;
      }

      const existingOpenTicket = await client.query(
        `SELECT 1
         FROM ticketing_system.operator_tickets
         WHERE submission_frequency_config_id = $1
           AND status IN ('Open', 'In Progress')
         LIMIT 1`,
        [config.id]
      );
      if (existingOpenTicket.rows.length) {
        skipped.push({
          screen_name: config.screen_name,
          reason: 'open_ticket_already_exists'
        });
        continue;
      }

      const l1User = config.approval_l1 ? await getUserByEmployeeId(config.approval_l1) : null;
      const l2User = config.approval_l2 ? await getUserByEmployeeId(config.approval_l2) : null;
      const l3User = config.approval_l3 ? await getUserByEmployeeId(config.approval_l3) : null;
      const approvalL1UserIds = l1User ? [l1User.id] : [];
      const approvalL2UserIds = l2User ? [l2User.id] : [];
      const approvalL3UserIds = l3User ? [l3User.id] : [];

      const violationDetails = {
        category: 'MISSED_FREQUENCY',
        ticket_type: 'SUBMISSION_FREQUENCY',
        action_type: 'REVIEW',
        screen_name: config.screen_name,
        department: config.department,
        sub_department: config.sub_department,
        last_submission_date: lastSubmission ? lastSubmission.toISOString() : null,
        expected_occurrences: minOccurrences > 0 ? minOccurrences : null,
        actual_occurrences: actualOccurrences,
        missed_frequency: missedFrequency,
        missed_occurrences: missedOccurrences,
        message: missedFrequency
          ? `"${config.screen_name}" was not submitted within its configured frequency.`
          : `"${config.screen_name}" was submitted ${actualOccurrences} time(s), fewer than the required ${minOccurrences}.`
      };

      const inserted = await client.query(
        `INSERT INTO ticketing_system.operator_tickets
         (ticket_id, machine_name, parameter_name, actual_value, threshold_value,
          severity, status, created_at, management_field, erp_product_code,
          ticket_reason, violation_details, ticket_type,
          approval_l1_user_ids, approval_l2_user_ids, approval_l3_user_ids,
          submission_frequency_config_id, tat_current_level,
          l1_tat_due_at)
         VALUES (
           'TK-' || LPAD(nextval('"ticketing_system"."ticket_seq"')::text, 4, '0'),
           $1, $2::jsonb, $3::jsonb, $4::jsonb,
           'High', 'Open', NOW(), $5, $6,
           'MISSING_VALUE', $7::jsonb, 'SUBMISSION_FREQUENCY',
           $8::int[], $9::int[], $10::int[],
           $11, 'L1',
           CASE WHEN $12::int IS NOT NULL THEN NOW() + ($12::int || ' hours')::interval ELSE NULL END
         )
         RETURNING *`,
        [
          config.screen_name,
          JSON.stringify([config.screen_name]),
          JSON.stringify({}),
          JSON.stringify({ frequency: config.frequency, occurrences: config.occurrences }),
          config.department,
          config.sub_department,
          JSON.stringify(violationDetails),
          approvalL1UserIds,
          approvalL2UserIds,
          approvalL3UserIds,
          config.id,
          config.l1_tat_hours || null
        ]
      );

      const ticket = inserted.rows[0];
      createdTickets.push(ticket);

      await client.query(
        `INSERT INTO ticketing_system.ticket_logs
         (ticket_id, action, performed_by, role, created_at)
         VALUES ($1, 'SUBMISSION_FREQUENCY_MISSED', 'System', 'System', NOW())`,
        [ticket.ticket_id]
      );

      if (approvalL1UserIds.length) {
        await createNotificationsForUsers(approvalL1UserIds, {
          ticketId: ticket.ticket_id,
          type: 'SUBMISSION_FREQUENCY',
          category: 'Tickets',
          priority: 'High',
          title: `Submission missed: ${config.screen_name}`,
          body: violationDetails.message,
          linkUrl: `/operator-tickets/${ticket.ticket_id}`,
          payload: { ticket_id: ticket.ticket_id, screen_name: config.screen_name, role: 'L1' }
        });
      }
    }

    return {
      created_count: createdTickets.length,
      no_due_count: noDueTickets.length,
      skipped_count: skipped.length,
      created_tickets: createdTickets,
      no_due_tickets: noDueTickets,
      skipped
    };
};

router.post('/submission-frequency/check', async (req, res, next) => {
  try {
    const result = await checkSubmissionFrequencyTickets();
    res.status(200).json({
      message: 'Submission frequency check completed',
      ...result
    });
  } catch (err) {
    next(err);
  }
});

const upsertThresholdMaster = async ({
  department,
  subDepartment,
  inputScreen,
  machineName,
  inputField,
  conditionLevel,
  plusThreshold,
  minusThreshold,
  actualValue,
  isActive,
  approvalL1UserIds = [],
  approvalL2UserIds = [],
  approvalL3UserIds = []
}) => {
  await ensureThresholdMasterApprovalColumns();
  await ensureThresholdMasterL1ApproverTable();
  await ensureThresholdMasterL2ApproverTable();
  await ensureThresholdMasterL3ApproverTable();
  const normalizedMachineName = machineName && String(machineName).trim() !== '' ? String(machineName).trim() : null;
  if (!normalizedMachineName) {
    throw new Error('machine_name is required for threshold_master');
  }
  const primaryApprovalL1UserId = approvalL1UserIds[0] ?? null;
  const primaryApprovalL2UserId = approvalL2UserIds[0] ?? null;
  const primaryApprovalL3UserId = approvalL3UserIds[0] ?? null;
  const updateResult = await client.query(
    `UPDATE ticketing_system.threshold_master
     SET management_field = $1,
         erp_product_code = $2,
         parameter_name = $5,
         threshold_value = $7,
         condition_level = $6,
         plus_threshold = $7,
         minus_threshold = $8,
         actual_value = $9,
         is_active = $10,
         approval_l1_user_id = $11,
         approval_l2_user_id = $12,
         approval_l3_user_id = $13,
         updated_at = NOW()
     WHERE lower(trim(department)) = lower(trim($1))
       AND lower(trim(sub_department)) = lower(trim($2))
       AND lower(trim(input_screen)) = lower(trim($3))
       AND lower(trim(machine_name)) = lower(trim($4))
       AND lower(trim(input_field)) = lower(trim($5))
     RETURNING *`,
    [department, subDepartment, inputScreen, normalizedMachineName, inputField, conditionLevel, plusThreshold, minusThreshold, actualValue ?? null, isActive, primaryApprovalL1UserId, primaryApprovalL2UserId, primaryApprovalL3UserId]
  );

  if (updateResult.rowCount > 0) {
    await syncThresholdMasterL1Approvers(updateResult.rows[0].id, approvalL1UserIds);
    await syncThresholdMasterL2Approvers(updateResult.rows[0].id, approvalL2UserIds);
    await syncThresholdMasterL3Approvers(updateResult.rows[0].id, approvalL3UserIds);
    return getThresholdByIdWithApprovers(updateResult.rows[0].id);
  }

  const legacyUpdateResult = await client.query(
    `UPDATE ticketing_system.threshold_master
     SET department = COALESCE(department, $1),
         sub_department = COALESCE(sub_department, $2),
         input_screen = COALESCE(input_screen, $3),
         input_field = COALESCE(input_field, $5),
         threshold_value = $7,
         condition_level = $6,
         plus_threshold = $7,
         minus_threshold = $8,
         actual_value = $9,
         is_active = $10,
         approval_l1_user_id = $11,
         approval_l2_user_id = $12,
         approval_l3_user_id = $13,
         updated_at = NOW()
     WHERE lower(trim(management_field)) = lower(trim($1))
       AND lower(trim(erp_product_code)) = lower(trim($2))
       AND lower(trim(machine_name)) = lower(trim($4))
       AND lower(trim(parameter_name)) = lower(trim($5))
     RETURNING *`,
    [department, subDepartment, inputScreen, normalizedMachineName, inputField, conditionLevel, plusThreshold, minusThreshold, actualValue ?? null, isActive, primaryApprovalL1UserId, primaryApprovalL2UserId, primaryApprovalL3UserId]
  );

  if (legacyUpdateResult.rowCount > 0) {
    await syncThresholdMasterL1Approvers(legacyUpdateResult.rows[0].id, approvalL1UserIds);
    await syncThresholdMasterL2Approvers(legacyUpdateResult.rows[0].id, approvalL2UserIds);
    await syncThresholdMasterL3Approvers(legacyUpdateResult.rows[0].id, approvalL3UserIds);
    return getThresholdByIdWithApprovers(legacyUpdateResult.rows[0].id);
  }

  try {
    const insertResult = await client.query(
      `INSERT INTO ticketing_system.threshold_master
       (management_field, erp_product_code, parameter_name, threshold_value, department, sub_department, input_screen, machine_name, input_field, condition_level, plus_threshold, minus_threshold, actual_value, is_active, approval_l1_user_id, approval_l2_user_id, approval_l3_user_id, created_at, updated_at)
       VALUES ($1, $2, $5, $7, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
       RETURNING *`,
      [department, subDepartment, inputScreen, normalizedMachineName, inputField, conditionLevel, plusThreshold, minusThreshold, actualValue ?? null, isActive, primaryApprovalL1UserId, primaryApprovalL2UserId, primaryApprovalL3UserId]
    );
    await syncThresholdMasterL1Approvers(insertResult.rows[0].id, approvalL1UserIds);
    await syncThresholdMasterL2Approvers(insertResult.rows[0].id, approvalL2UserIds);
    await syncThresholdMasterL3Approvers(insertResult.rows[0].id, approvalL3UserIds);
    return getThresholdByIdWithApprovers(insertResult.rows[0].id);
  } catch (error) {
    if (error?.code !== '23505') throw error;

    const retryLegacyUpdate = await client.query(
      `UPDATE ticketing_system.threshold_master
       SET department = COALESCE(department, $1),
           sub_department = COALESCE(sub_department, $2),
           input_screen = COALESCE(input_screen, $3),
           input_field = COALESCE(input_field, $5),
           threshold_value = $7,
           condition_level = $6,
           plus_threshold = $7,
           minus_threshold = $8,
           actual_value = $9,
           is_active = $10,
           approval_l1_user_id = $11,
           approval_l2_user_id = $12,
           approval_l3_user_id = $13,
           updated_at = NOW()
       WHERE lower(trim(management_field)) = lower(trim($1))
         AND lower(trim(erp_product_code)) = lower(trim($2))
         AND lower(trim(machine_name)) = lower(trim($4))
         AND lower(trim(parameter_name)) = lower(trim($5))
       RETURNING *`,
      [department, subDepartment, inputScreen, normalizedMachineName, inputField, conditionLevel, plusThreshold, minusThreshold, actualValue ?? null, isActive, primaryApprovalL1UserId, primaryApprovalL2UserId, primaryApprovalL3UserId]
    );

    if (retryLegacyUpdate.rowCount > 0) {
      await syncThresholdMasterL1Approvers(retryLegacyUpdate.rows[0].id, approvalL1UserIds);
      await syncThresholdMasterL2Approvers(retryLegacyUpdate.rows[0].id, approvalL2UserIds);
      await syncThresholdMasterL3Approvers(retryLegacyUpdate.rows[0].id, approvalL3UserIds);
      return getThresholdByIdWithApprovers(retryLegacyUpdate.rows[0].id);
    }
    throw error;
  }
};

const getThresholdMapFromMaster = async ({
  department,
  subDepartment,
  inputScreen,
  machineName,
  parameterName
}) => {
  const normalizedParameters = normalizeParameterNames(parameterName);
  if (!department || !subDepartment || !inputScreen || !normalizedParameters.length) {
    return {};
  }

  const result = await client.query(
    `SELECT input_field, plus_threshold, minus_threshold, threshold_value, actual_value, condition_level, machine_name
     FROM ticketing_system.threshold_master
     WHERE lower(trim(COALESCE(department, management_field, ''))) = lower(trim($1))
       AND lower(trim(COALESCE(sub_department, erp_product_code, ''))) = lower(trim($2))
       AND lower(trim(COALESCE(input_screen, machine_name, ''))) = lower(trim($3))
       AND EXISTS (
         SELECT 1
         FROM unnest($4::text[]) AS v
         WHERE lower(trim(v)) = lower(trim(input_field))
       )
       AND is_active = true
       AND ($5::text IS NULL OR lower(trim(COALESCE(machine_name, ''))) = lower(trim($5)) OR machine_name IS NULL)
     ORDER BY CASE WHEN lower(trim(COALESCE(machine_name, ''))) = lower(trim($5)) THEN 0 ELSE 1 END`,
    [department, subDepartment, inputScreen, normalizedParameters, machineName || null]
  );

  const thresholdMap = {};
  for (const row of result.rows) {
    if (thresholdMap[row.input_field]) continue;
    thresholdMap[row.input_field] = {
      plus_threshold: row.plus_threshold,
      minus_threshold: row.minus_threshold,
      threshold_value: row.threshold_value,
      actual_value: row.actual_value,
      condition_level: row.condition_level
    };
  }
  return thresholdMap;
};

// const openedMailTemplate = (ticket) => {

//   const rows = (ticket.parameter_name || []).map((param, index) => {
//     const normalizedParam = param.toLowerCase().replace(/\s+/g, '_');

//     const key = Object.keys(ticket.actual_value || {}).find(k =>
//       k.toLowerCase().replace(/\s+/g, '_') === normalizedParam
//     );

//     return `
//       <tr style="background:${index % 2 === 0 ? '#FFFFFF' : '#EEF2FF'};">
//         <td style="padding:8px;font-size:10px;">${ticket.machine_name}</td>
//         <td style="padding:8px;font-size:10px;">${param}</td>
//         <td style="padding:8px;font-size:10px;">${key ? ticket.actual_value[key] : '-'}</td>
//         <td style="padding:8px;font-size:10px;">${key ? ticket.threshold_value[key] : '-'}</td>
//         <td style="padding:8px;font-size:10px;text-align:right;">
//           ${(() => {
//             const date = new Date(ticket.created_at);
//             const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
//             const formattedTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
//             return `${formattedDate} | ${formattedTime}`;
//           })()}
//         </td>
//       </tr>
//     `;
//   }).join('');

//   return `
//   <div style="max-width:600px;margin:auto;font-family:Inter,Arial,sans-serif;background:#FFFFFF;border:1px solid #e5e7eb;">

//     <!-- HEADER -->
//     <div style="background:linear-gradient(90deg,#1E3A8A 0%,#60A5FA 100%);padding:20px;">
//       <span style="font-size:14px;font-weight:700;color:#FFFFFF;">
//         New Ticket Submitted – Review Required
//       </span>
//     </div>

//     <!-- CONTENT -->
//     <div style="padding:20px;font-size:12px;color:#000000;">
//       <p>Hello ,</p>

//       <p style="margin-bottom:15px;color:#555555;">
//         A new ticket has been submitted by <b>${ticket.user_name} and is awaiting your review.</b>
 
//       </p>

//       <p style="margin-bottom:15px;color:#000000;">
//         Please find the ticket details below.
//       </p>

//       <!-- TABLE -->
//       <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:14px;border-radius:10px;overflow:hidden;">
//         <thead>
//           <tr style="background:#EEF2FF;border:1px solid #EEF2FF;">
//             <th style="padding:6px;font-size:10px;color:#555555;text-align:left;">MACHINE</th>
//             <th style="padding:6px;font-size:10px;color:#555555;text-align:left;">PARAMETER</th>
//             <th style="padding:6px;font-size:10px;color:#555555;text-align:left;">ACTUAL VALUE</th>
//             <th style="padding:6px;font-size:10px;color:#555555;text-align:left;">THRESHOLD VALUE</th>
//             <th style="padding:6px;font-size:10px;color:#555555;text-align:right;">CREATED AT</th>
//           </tr>
//         </thead>

//         <tbody>
//           ${rows || `<tr><td colspan="5" style="padding:10px;font-size:10px;">No parameter data available</td></tr>`}
//         </tbody>
//       </table>

//       <p style="margin-top:18px;color:#555555;">
//         Kindly review the ticket and take the necessary action. If any additional information or updates are required, please provide your feedback in the ticket comments.
//       </p>

//       <p style="margin-top:12px;">
//         <span style="color:#CA0000;font-style:italic;font-weight:bold;">
//           This is an auto-generated email. Please do not reply.
//         </span>
//       </p>

//       <p style="color:#555555;margin-top:12px;">Best Regards,<br/>Support Team</p>
//     </div>
//   </div>
//   `;
// };

// const submittedMailTemplate = (ticket) => {

//   const rows = (ticket.parameter_name || []).map((param, index) => {
//     const normalizedParam = param.toLowerCase().replace(/\s+/g, '_');

//     const key = Object.keys(ticket.actual_value || {}).find(k =>
//       k.toLowerCase().replace(/\s+/g, '_') === normalizedParam
//     );

//     return `
//       <tr style="background:${index % 2 === 0 ? '#FFFFFF' : '#EEF2FF'};">
//         <td style="padding:8px;font-size:10px;">${ticket.machine_name}</td>
//         <td style="padding:8px;font-size:10px;">${param}</td>
//         <td style="padding:8px;font-size:10px;">${key ? ticket.actual_value[key] : '-'}</td>
//         <td style="padding:8px;font-size:10px;">${key ? ticket.threshold_value[key] : '-'}</td>
//         <td style="padding:8px;font-size:10px;text-align:right;">
//           ${(() => {
//             const date = new Date(ticket.created_at);
//             const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
//             const formattedTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
//             return `${formattedDate} | ${formattedTime}`;
//           })()}
//         </td>
//       </tr>
//     `;
//   }).join('');

//   return `
//   <div style="max-width:600px;margin:auto;font-family:Inter,Arial,sans-serif;background:#FFFFFF;border:1px solid #e5e7eb;">

//     <!-- HEADER -->
//     <div style="background:linear-gradient(90deg,#1E3A8A 0%,#60A5FA 100%);padding:20px;">
//       <span style="font-size:14px;font-weight:700;color:#FFFFFF;">
//         New Ticket Submitted – Review Required
//       </span>
//     </div>

//     <!-- CONTENT -->
//     <div style="padding:20px;font-size:12px;color:#000000;">
//       <p>Hello ,</p>

//       <p style="margin-bottom:15px;color:#555555;">
//         A new ticket has been submitted by <b>${ticket.user_name} and is awaiting your review.</b>
 
//       </p>

//       <p style="margin-bottom:15px;color:#000000;">
//         Please find the ticket details below.
//       </p>

//       <!-- TABLE -->
//       <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:14px;border-radius:10px;overflow:hidden;">
//         <thead>
//           <tr style="background:#EEF2FF;border:1px solid #EEF2FF;">
//             <th style="padding:6px;font-size:10px;color:#555555;text-align:left;">MACHINE</th>
//             <th style="padding:6px;font-size:10px;color:#555555;text-align:left;">PARAMETER</th>
//             <th style="padding:6px;font-size:10px;color:#555555;text-align:left;">ACTUAL VALUE</th>
//             <th style="padding:6px;font-size:10px;color:#555555;text-align:left;">THRESHOLD VALUE</th>
//             <th style="padding:6px;font-size:10px;color:#555555;text-align:right;">CREATED AT</th>
//           </tr>
//         </thead>

//         <tbody>
//           ${rows || `<tr><td colspan="5" style="padding:10px;font-size:10px;">No parameter data available</td></tr>`}
//         </tbody>
//       </table>

//       <p style="margin-top:18px;color:#555555;">
//         Kindly review the ticket and take the necessary action. If any additional information or updates are required, please provide your feedback in the ticket comments.
//       </p>

//       <p style="margin-top:12px;">
//         <span style="color:#CA0000;font-style:italic;font-weight:bold;">
//           This is an auto-generated email. Please do not reply.
//         </span>
//       </p>

//       <p style="color:#555555;margin-top:12px;">Best Regards,<br/>Support Team</p>
//     </div>
//   </div>
//   `;
// };

/**
 * @swagger
 * /operator-tickets:
 *   get:
 *     summary: Retrieve a list of operator tickets
 *     description: Fetches all tickets along with their associated notifications.
 *     tags:
 *     - Operator Tickets
 *     responses:
 *       200:
 *         description: A list of tickets.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   ticket_id:
 *                     type: integer
 *                   user_name:
 *                     type: string
 *                   machine_name:
 *                     type: string
 *                   status:
 *                     type: string
 *                   notifications:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         notification_id:
 *                           type: integer
 *                         status:
 *                           type: string
 *                         pagination:
 *                           type: object
 *                           properties:
 *                           totalItems:
 *                              type: Integer
 *                           totalPages:
 *                              type: Integer
 *                           currentPage:
 *                              type: Integer
 *                           itemsPerPage:
 *                              type: Integer
 *       500:
 *         description: Internal server error
 */

router.get('/', async (req, res, next) => {
  try {
    await ensureOperatorTicketApprovalColumns();
    await ensureNotificationRecipientColumn();

    const page = parseInt(req.query.page) || 1;
    const limit = 6; 
    const offset = (page - 1) * limit;
    const { status, severity, machine, start_date, end_date, user_id } = req.query;

    const where = [];
    const values = [];
    where.push(nonAcknowledgementTicketWhere);
    where.push(nonPpNotebookTicketWhere);
    const normalizedStatus = String(status || '').trim();
    const normalizedSeverity = String(severity || '').trim();
    const normalizedMachine = String(machine || '').trim();

    if (normalizedStatus && normalizedStatus.toLowerCase() !== 'all') {
      values.push(normalizedStatus);
      where.push(`ot.status = $${values.length}`);
    }

    if (normalizedSeverity && normalizedSeverity.toLowerCase() !== 'all') {
      values.push(normalizedSeverity);
      where.push(`ot.severity = $${values.length}`);
    }

    if (normalizedMachine && normalizedMachine.toLowerCase() !== 'all') {
      values.push(normalizedMachine);
      where.push(`ot.machine_name = $${values.length}`);
    }

    if (start_date) {
      values.push(start_date);
      where.push(`ot.created_at::date >= $${values.length}::date`);
    }

    if (end_date) {
      values.push(end_date);
      where.push(`ot.created_at::date <= $${values.length}::date`);
    }

    const requesterEmployeeId = String(req.user?.employee_id || '').trim().toUpperCase();
    const requesterRole = String(req.user?.role || '').trim().toLowerCase();
    const requesterLevel = String(req.user?.level || '').trim().toUpperCase();
    const canViewAllTickets =
      requesterRole === 'admin' ||
      requesterRole === 'super admin' ||
      requesterRole === 'superadmin' ||
      requesterLevel === 'L3';

    const viewerUserId = canViewAllTickets ? null : parsePositiveInt(user_id);
    if (viewerUserId) {
      values.push(viewerUserId);
      // L1 approvers see a ticket as soon as it's created; L2/L3 only see it once
      // the prior level has submitted and tat_current_level has advanced to their level.
      where.push(`(
        ot.user_id = $${values.length}
        OR $${values.length} = ANY(COALESCE(ot.approval_l1_user_ids, ARRAY[]::int[]))
        OR ($${values.length} = ANY(COALESCE(ot.approval_l2_user_ids, ARRAY[]::int[])) AND ot.tat_current_level IN ('L2', 'L3'))
        OR ($${values.length} = ANY(COALESCE(ot.approval_l3_user_ids, ARRAY[]::int[])) AND ot.tat_current_level IN ('L3', 'EXPIRED_L3', 'EXPIRED_L2'))
      )`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const query = `
      SELECT
          ot.ticket_id,
          ot.user_id,
          ot.user_name,
          ot.machine_name,
          ot.parameter_name,
          ot.actual_value,
          ot.threshold_value,
          ot.severity,
          ot.status,
          ot.created_at,
          COALESCE(ot.tat_current_level, 'L1') AS tat_current_level,
          ot.l1_tat_due_at,
          ot.l2_tat_due_at,
          ot.l3_tat_due_at,
          COUNT(*) OVER()::int AS total_count,
          COALESCE(
              json_agg(
                  json_build_object(
                      'notification_id', n.notification_id,
                      'recipient_user_id', n.recipient_user_id,
                      'notification_type', n.notification_type,
                      'status', n.status,
                      'sent_at', n.sent_at
                  )
              ) FILTER (WHERE n.notification_id IS NOT NULL),
              '[]'
          ) AS notifications
      FROM ticketing_system.operator_tickets ot
      LEFT JOIN ticketing_system.notifications n
          ON ot.ticket_id = n.ticket_id
      ${whereClause}
      GROUP BY
          ot.ticket_id,
          ot.user_id,
          ot.user_name,
          ot.machine_name,
          ot.parameter_name,
          ot.actual_value,
          ot.threshold_value,
          ot.severity,
          ot.status,
          ot.created_at,
          ot.tat_current_level,
          ot.l1_tat_due_at,
          ot.l2_tat_due_at,
          ot.l3_tat_due_at
      ORDER BY ot.created_at DESC;
    `;

    const result = await client.query(query, values);
    const pagedRows = result.rows.slice(offset, offset + limit);

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    res.status(200).json({
      tickets: pagedRows,
      data: pagedRows,
      pagination: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/submission-ticketing', async (req, res, next) => {
  try {
    await ensureOperatorTicketApprovalColumns();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const offset = (page - 1) * limit;

    const status = String(req.query.status || '').trim();
    const severity = String(req.query.severity || '').trim();
    const operator = String(req.query.operator || req.query.user_name || '').trim();
    const notebook = String(req.query.notebook || req.query.machine || '').trim();
    const startDate = String(req.query.start_date || '').trim();
    const endDate = String(req.query.end_date || '').trim();

    const values = [];
    const where = [];

    // Submission tickets: frequency/missed-submission category.
    where.push(`(COALESCE(ot.ticket_type, 'THRESHOLD') = 'SUBMISSION_FREQUENCY' OR (ot.ticket_reason = 'MISSING_VALUE' AND (ot.violation_details->>'category') = 'MISSED_FREQUENCY'))`);
    where.push(nonAcknowledgementTicketWhere);
    where.push(nonPpNotebookTicketWhere);

    if (status && status.toLowerCase() !== 'all') {
      values.push(status);
      where.push(`ot.status = $${values.length}`);
    }
    if (severity && severity.toLowerCase() !== 'all') {
      values.push(severity);
      where.push(`ot.severity = $${values.length}`);
    }
    if (operator && operator.toLowerCase() !== 'all') {
      values.push(operator);
      where.push(`COALESCE(NULLIF(trim(ud.full_name), ''), NULLIF(trim(ot.user_name), '')) = $${values.length}`);
    }
    if (notebook && notebook.toLowerCase() !== 'all') {
      values.push(notebook);
      where.push(`ot.machine_name = $${values.length}`);
    }
    if (startDate) {
      values.push(startDate);
      where.push(`ot.created_at::date >= $${values.length}::date`);
    }
    if (endDate) {
      values.push(endDate);
      where.push(`ot.created_at::date <= $${values.length}::date`);
    }

    const requesterRoleForSubmission = String(req.user?.role || '').trim().toLowerCase();
    const requesterLevelForSubmission = String(req.user?.level || '').trim().toUpperCase();
    const canViewAllSubmissionTickets =
      requesterRoleForSubmission === 'admin' ||
      requesterRoleForSubmission === 'super admin' ||
      requesterRoleForSubmission === 'superadmin' ||
      requesterLevelForSubmission === 'L3';
    const submissionViewerUserId = canViewAllSubmissionTickets ? null : parsePositiveInt(req.query.user_id);
    if (submissionViewerUserId) {
      values.push(submissionViewerUserId);
      where.push(`(
        ot.user_id = $${values.length}
        OR $${values.length} = ANY(COALESCE(ot.approval_l1_user_ids, ARRAY[]::int[]))
        OR ($${values.length} = ANY(COALESCE(ot.approval_l2_user_ids, ARRAY[]::int[])) AND COALESCE(ot.tat_current_level, 'L1') IN ('L2', 'L3'))
        OR ($${values.length} = ANY(COALESCE(ot.approval_l3_user_ids, ARRAY[]::int[])) AND ot.tat_current_level IN ('L3', 'EXPIRED_L3', 'EXPIRED_L2'))
      )`);
    }

    values.push(limit);
    const limitIndex = values.length;
    values.push(offset);
    const offsetIndex = values.length;

    const result = await client.query(
      `SELECT
         ot.ticket_id,
         ot.user_id,
         COALESCE(NULLIF(trim(ud.full_name), ''), ot.user_name, 'System') AS operator,
         ot.machine_name AS notebook,
         ot.parameter_name,
         ot.severity,
         ot.status,
         ot.created_at,
         (ot.threshold_value->>'frequency')::int AS frequency,
         (ot.threshold_value->>'occurrences')::int AS occurrences,
         COALESCE(ot.tat_current_level, 'L1') AS tat_current_level,
         ot.l1_tat_due_at,
         ot.l2_tat_due_at,
         ot.l3_tat_due_at,
         COUNT(*) OVER()::int AS total_count
       FROM ticketing_system.operator_tickets ot
       LEFT JOIN users.user_details ud ON ud.id = ot.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY ot.created_at DESC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values
    );

    const totalCount = result.rows[0]?.total_count || 0;
    return res.status(200).json({
      tickets: result.rows,
      data: result.rows,
      pagination: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    next(error);
  }
});

// Process Parameter tab: same shape as /submission-ticketing, but a PP
// notebook ticket has no frequency/occurrences config -- instead each one
// carries the notebook's configured completion_threshold_hours ("completion
// time provided") and, since the deadline is entry_id-creation-time +
// that threshold, how far past that deadline it still is right now
// ("time lagged"), both computed from violation_details on the fly.
router.get('/process-parameter-ticketing', async (req, res, next) => {
  try {
    await ensureOperatorTicketApprovalColumns();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const offset = (page - 1) * limit;

    const status = String(req.query.status || '').trim();
    const severity = String(req.query.severity || '').trim();
    const notebook = String(req.query.notebook || req.query.machine || '').trim();
    const entryId = String(req.query.entry_id || '').trim();
    const startDate = String(req.query.start_date || '').trim();
    const endDate = String(req.query.end_date || '').trim();

    const values = [];
    const where = [];

    where.push(`ot.ticket_reason = 'MISSING_VALUE'`);
    where.push(`(ot.violation_details->>'category') = 'MISSED_FREQUENCY'`);
    where.push(`(ot.violation_details->>'ticket_type') = 'PP_NOTEBOOK_INCOMPLETE'`);

    if (status && status.toLowerCase() !== 'all') {
      values.push(status);
      where.push(`ot.status = $${values.length}`);
    }
    if (severity && severity.toLowerCase() !== 'all') {
      values.push(severity);
      where.push(`ot.severity = $${values.length}`);
    }
    if (notebook && notebook.toLowerCase() !== 'all') {
      values.push(notebook);
      where.push(`ot.machine_name = $${values.length}`);
    }
    if (entryId) {
      values.push(entryId);
      where.push(`(ot.violation_details->>'entry_id') = $${values.length}`);
    }
    if (startDate) {
      values.push(startDate);
      where.push(`ot.created_at::date >= $${values.length}::date`);
    }
    if (endDate) {
      values.push(endDate);
      where.push(`ot.created_at::date <= $${values.length}::date`);
    }

    const requesterRoleForPp = String(req.user?.role || '').trim().toLowerCase();
    const requesterLevelForPp = String(req.user?.level || '').trim().toUpperCase();
    const canViewAllPpTickets =
      requesterRoleForPp === 'admin' ||
      requesterRoleForPp === 'super admin' ||
      requesterRoleForPp === 'superadmin' ||
      requesterLevelForPp === 'L3';
    const ppViewerUserId = canViewAllPpTickets ? null : parsePositiveInt(req.query.user_id);
    if (ppViewerUserId) {
      values.push(ppViewerUserId);
      where.push(`(
        ot.user_id = $${values.length}
        OR $${values.length} = ANY(COALESCE(ot.approval_l1_user_ids, ARRAY[]::int[]))
        OR ($${values.length} = ANY(COALESCE(ot.approval_l2_user_ids, ARRAY[]::int[])) AND COALESCE(ot.tat_current_level, 'L1') IN ('L2', 'L3'))
        OR ($${values.length} = ANY(COALESCE(ot.approval_l3_user_ids, ARRAY[]::int[])) AND ot.tat_current_level IN ('L3', 'EXPIRED_L3', 'EXPIRED_L2'))
      )`);
    }

    values.push(limit);
    const limitIndex = values.length;
    values.push(offset);
    const offsetIndex = values.length;

    const result = await client.query(
      `SELECT
         ot.ticket_id,
         ot.violation_details->>'entry_id' AS entry_id,
         ot.machine_name AS notebook,
         ot.severity,
         ot.status,
         ot.created_at,
         COALESCE(ot.tat_current_level, 'L1') AS tat_current_level,
         ot.l1_tat_due_at,
         ot.l2_tat_due_at,
         ot.l3_tat_due_at,
         (ot.violation_details->>'completion_threshold_hours')::numeric AS completion_time_provided_hours,
         (ot.violation_details->>'first_created_at')::timestamptz AS entry_created_at,
         GREATEST(
           ROUND(
             (EXTRACT(EPOCH FROM (
               NOW() - (
                 (ot.violation_details->>'first_created_at')::timestamptz
                 + ((ot.violation_details->>'completion_threshold_hours')::numeric || ' hours')::interval
               )
             )) / 3600)::numeric,
             2
           ),
           0
         ) AS time_lagged_hours,
         COUNT(*) OVER()::int AS total_count
       FROM ticketing_system.operator_tickets ot
       WHERE ${where.join(' AND ')}
       ORDER BY ot.created_at DESC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values
    );

    const totalCount = result.rows[0]?.total_count || 0;
    return res.status(200).json({
      tickets: result.rows,
      data: result.rows,
      pagination: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /operator-tickets/{id}:
 *   get:
 *     summary: Retrieve a single operator ticket by ID
 *     description: Fetches a specific ticket along with its associated notifications.
 *     tags:
 *       - Operator Tickets
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the ticket to retrieve
 *     responses:
 *       200:
 *         description: Ticket details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ticket_id:
 *                   type: integer
 *                 user_name:
 *                   type: string
 *                 machine_name:
 *                   type: string
 *                 parameter_name:
 *                   type: array
 *                   items:
 *                     type: string
 *                 actual_value:
 *                   type: object
 *                   additionalProperties: true
 *                 threshold_value:
 *                   type: object
 *                   additionalProperties: true
 *                 severity:
 *                   type: string
 *                 status:
 *                   type: string
 *                 notifications:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       notification_id:
 *                         type: integer
 *                       notification_type:
 *                         type: string
 *                       status:
 *                         type: string
 *                       sent_at:
 *                         type: string
 *                         format: date-time
 *       404:
 *         description: Ticket not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id/timeline', async (req, res, next) => {
  try {
    await ensureOperatorTicketApprovalColumns();
    const ticketId = String(req.params.id || '').trim();
    if (!ticketId) return res.status(400).json({ message: 'ticketId is required' });

    const ticketRes = await client.query(
      `SELECT
         ot.ticket_id,
         ot.user_id,
         ot.user_name,
         ot.machine_name,
         ot.parameter_name,
         ot.status,
         ot.created_at,
         ot.violation_details,
         ot.approval_l1_user_ids,
         ot.approval_l2_user_ids
       FROM ticketing_system.operator_tickets ot
       WHERE (ot.ticket_id = $1 OR ot.ticket_id = '#' || $1)
         AND ${nonAcknowledgementTicketWhere}`,
      [ticketId]
    );
    if (!ticketRes.rows.length) return res.status(404).json({ message: 'Ticket not found' });
    const ticket = ticketRes.rows[0];

    const logRes = await client.query(
      `SELECT action, performed_by, role, created_at
       FROM ticketing_system.ticket_logs
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
      [ticket.ticket_id]
    );

    const assignedLog = logRes.rows.find((r) => String(r.action || '').toUpperCase().includes('ASSIGN'));
    const submittedLog = logRes.rows.find((r) => {
      const a = String(r.action || '').toUpperCase();
      return a === 'SUBMITTED' || a === 'RESUBMITTED' || a.includes('REJECTED');
    });

    // Dynamic-first comment resolution for timeline:
    // prefer values saved in violation_details from submit payload,
    // and only fall back to static sample text if none exists.
    let l1Comment = null;
    if (ticket.violation_details && typeof ticket.violation_details === 'object') {
      l1Comment =
        ticket.violation_details.operator_comment ||
        ticket.violation_details.comment ||
        ticket.violation_details.remarks ||
        null;
    }

    const timeline = [
      {
        at: ticket.created_at,
        title: 'Ticket Created',
        detail: `Automated system alert triggered by vibration sensor ${ticket.machine_name || 'N/A'}`
      },
      {
        at: assignedLog?.created_at || ticket.created_at,
        title: 'Assigned to maintenance',
        detail: assignedLog?.performed_by
          ? `Ticket assigned by ${assignedLog.performed_by}`
          : `Ticket assigned to Maintenance Team A (Technician : ${ticket.user_name || 'Surya Prakash'})`
      },
      {
        at: submittedLog?.created_at || ticket.created_at,
        title: 'L1 Comment',
        detail: l1Comment || 'Check the lubricant levels. It seems the main bearing is overheating. Need to replace the grease and re-test the vibration levels. proceed with caution.'
      }
    ];

    return res.status(200).json({
      ticket_id: ticket.ticket_id,
      status: ticket.status,
      timeline
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const ticketId = req.params.id; // accept alphanumeric IDs, with or without a leading '#'

    const query = `
      SELECT
          ot.ticket_id,
          ot.user_id,
          ot.user_name,
          ot.machine_name,
          ot.parameter_name,
          ot.actual_value,
          ot.threshold_value,
          ot.severity,
          ot.status,
          ot.created_at,
          COALESCE(ot.tat_current_level, 'L1') AS tat_current_level,
          ot.l1_tat_due_at,
          ot.l2_tat_due_at,
          ot.l3_tat_due_at

      FROM ticketing_system.operator_tickets ot
      WHERE (ot.ticket_id = $1 OR ot.ticket_id = '#' || $1)
        AND ${nonAcknowledgementTicketWhere};
    `;

    const result = await client.query(query, [ticketId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});


/**
 * @swagger
 * /operator-tickets:
 *   post:
 *     summary: Submit a new operator ticket
 *     description: Creates a new operator ticket, stores it in the database, and sends a notification email to the supervisor.
 *     tags:
 *       - Operator Tickets
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user_name:
 *                 type: string
 *                 example: Khalid
 *               machine_name:
 *                 type: string
 *                 example: Winder W-12
 *               parameter_name:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Diameter", "Tension", "Drum Speed"]
 *               actual_value:
 *                 type: object
 *                 additionalProperties: true
 *                 example: { "drum": 1150, "tension": 26.5, "diameter": 305 }
 *               threshold_value:
 *                 type: object
 *                 additionalProperties: true
 *                 example: { "drum": 1100, "tension": 25, "diameter": 300 }
 *               severity:
 *                 type: string
 *                 example: Medium
 *     responses:
 *       201:
 *         description: Ticket created successfully and email sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ticket created and email sent
 *                 ticket:
 *                   type: object
 *                   description: The newly created ticket
 *       400:
 *         description: Bad request (invalid or missing fields)
 *       500:
 *         description: Internal server error
 */
router.post('/', async (req, res, next) => {
  try {
    await ensureOperatorTicketApprovalColumns();
    await ensureNotificationRecipientColumn();
    const {
      user_id,
      user_name,
      machine_name,
      parameter_name,
      actual_value,
      threshold_value,
      severity: requestedSeverity,
      department,
      sub_department,
      input_screen,
      management_field,
      erp_product_code,
      description,
      ticket_kind,
      source
    } = req.body;

    const normalizedParameterNames = normalizeParameterNames(parameter_name);
    // Backward-compat alias: older runtime snapshots may still reference this identifier.
    const normalizedParameterNamesAll = normalizedParameterNames;
    const normalizedActualValue = parseMaybeJsonObject(actual_value);
    const normalizedThresholdValue = parseMaybeJsonObject(threshold_value);

    if (!machine_name || !parameter_name || !actual_value) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const PROCESS_PARAMETER_SCREENS = new Set([
      'Process Parameter',
      'PP - Breaker Drawing',
      'PP - Finisher Drawing',
      'PP - Autoconer Q2',
      'PP - Autoconer Q3'
    ]);
    if (PROCESS_PARAMETER_SCREENS.has(String(input_screen || '').trim()) && !/^PP-\d{4,}$/i.test(String(machine_name).trim())) {
      return res.status(400).json({ message: 'machine_name must be a valid PP-000n process parameter id for this input_screen' });
    }

    let assignedUserId = user_id || parsePositiveInt(req.user?.id) || null;
    let assignedUserName = user_name || String(req.user?.full_name || '').trim() || null;

    if (assignedUserId) {
      const user = await getUserById(assignedUserId);
      if (!user) {
        return res.status(404).json({ message: 'Assigned user not found' });
      }
      assignedUserName = user.full_name;
    }

    if (!assignedUserName && assignedUserId) {
      const tokenUser = await getUserById(assignedUserId);
      if (tokenUser) assignedUserName = tokenUser.full_name;
    }

    if (!assignedUserName && !assignedUserId && req.user?.employee_id) {
      const tokenUserByEmp = await getUserByEmployeeId(req.user.employee_id);
      if (tokenUserByEmp) {
        assignedUserId = tokenUserByEmp.id;
        assignedUserName = tokenUserByEmp.full_name;
      }
    }

    if (!assignedUserName) {
      return res.status(400).json({ message: 'user_id or user_name is required (or login user context)' });
    }

    const masterThresholds = await getThresholdMapFromMaster({
      department: department || management_field,
      subDepartment: sub_department || erp_product_code,
      inputScreen: input_screen,
      machineName: machine_name,
      parameterName: normalizedParameterNames
    });

    const fallbackRules = normalizeThresholdRules(normalizedThresholdValue);
    const effectiveThresholds = Object.keys(masterThresholds).length ? masterThresholds : fallbackRules;
    const thresholdApprovers = await getThresholdApproversFromMaster({
      department: department || management_field,
      subDepartment: sub_department || erp_product_code,
      inputScreen: input_screen,
      machineName: machine_name,
      parameterName: normalizedParameterNames
    });
    const approvalL1UserIds = thresholdApprovers.approval_l1_user_ids || [];
    const approvalL2UserIds = thresholdApprovers.approval_l2_user_ids || [];
    const approvalL3UserIds = thresholdApprovers.approval_l3_user_ids || [];
    const tatHours = await getThresholdTatHoursFromMaster({
      department: department || management_field,
      subDepartment: sub_department || erp_product_code,
      inputScreen: input_screen,
      machineName: machine_name,
      parameterName: normalizedParameterNames
    });

    if (!effectiveThresholds) {
      return res.status(400).json({
        message: 'threshold_value missing and no threshold found in threshold_master'
      });
    }

    const { ticketReason, violationDetails } = analyzeViolations(
      normalizedParameterNames,
      normalizedActualValue,
      effectiveThresholds
    );

    const trimmedDescription = typeof description === 'string' ? description.trim() : '';

    if (!ticketReason && !trimmedDescription) {
      return res.status(400).json({
        message: 'No violations found. Ticket requires null actual values, threshold breaches, or a description.'
      });
    }

    const severity = resolveSeverity(requestedSeverity, violationDetails);

    const insertQuery = `
      INSERT INTO ticketing_system.operator_tickets
      (ticket_id, user_id, user_name, machine_name, parameter_name, actual_value, threshold_value, severity, status, created_at, management_field, erp_product_code, ticket_reason, violation_details, approval_l1_user_ids, approval_l2_user_ids, approval_l3_user_ids, l1_tat_hours, l2_tat_hours, l3_tat_hours, l1_tat_due_at, tat_current_level, description, ticket_kind, source)
      VALUES (
        'TK-' || LPAD(nextval('"ticketing_system"."ticket_seq"')::text, 4, '0'),
        $1, $2, $3, $4, $5, $6, $7, 'Open', CURRENT_TIMESTAMP, $8, $9, $10, $11::jsonb, $12::int[], $13::int[], $14::int[],
        $15::int, $16::int, $17::int,
        CASE WHEN $15::int IS NOT NULL THEN CURRENT_TIMESTAMP + ($15::int || ' hours')::interval ELSE NULL END,
        'L1', $18, $19, $20
      )
      RETURNING *;
    `;

    const result = await client.query(insertQuery, [
      assignedUserId,
      assignedUserName,
      machine_name,
      JSON.stringify(normalizedParameterNames),
      JSON.stringify(normalizedActualValue),
      JSON.stringify(effectiveThresholds),
      severity,
      management_field || null,
      erp_product_code || null,
      ticketReason || 'Manual Submission',
      JSON.stringify(violationDetails),
      approvalL1UserIds,
      approvalL2UserIds,
      approvalL3UserIds,
      tatHours.l1_tat_hours,
      tatHours.l2_tat_hours,
      tatHours.l3_tat_hours,
      trimmedDescription || null,
      ticket_kind || null,
      source || null
    ]);

    const ticket = result.rows[0];
    // Only L1 is notified at creation; L2/L3 are notified once the prior level submits (see PUT /submit/:id).
    await createTicketNotificationsForApprovers(ticket.ticket_id, approvalL1UserIds);
    await createThresholdBreachNotifications(ticket, approvalL1UserIds, violationDetails);

    await sendEmail({
      to: ticket.supevisor_email || 'otpdemoin@gmail.com',
      subject: `New Ticket Opened: ${ticket.ticket_id}`,
      // html: openedMailTemplate(ticket)
    });

    res.status(201).json({ message: 'Ticket created and email sent', ticket });
  } catch (err) {
    next(err);
  }
});

router.post('/generate', async (req, res, next) => {
  let transactionStarted = false;
  try {
    await ensureOperatorTicketApprovalColumns();
    await ensureNotificationRecipientColumn();
    const tickets = Array.isArray(req.body?.tickets) ? req.body.tickets : [];

    if (!tickets.length) {
      return res.status(400).json({ message: 'tickets array is required' });
    }

    await client.query('BEGIN');
    transactionStarted = true;
    const generated = [];
    const skipped = [];

    for (const item of tickets) {
      const {
        user_id,
        user_name,
        machine_name,
        parameter_name,
        actual_value,
        threshold_value,
        severity: requestedSeverity,
        department = null,
        sub_department = null,
        input_screen = null,
        management_field = null,
        erp_product_code = null
      } = item;

      const normalizedParameterNames = normalizeParameterNames(parameter_name);
      const normalizedActualValue = parseMaybeJsonObject(actual_value);
      const normalizedThresholdValue = parseMaybeJsonObject(threshold_value);

      if (!machine_name || !parameter_name || !actual_value) {
        throw new Error('Each ticket must include machine_name, parameter_name and actual_value');
      }

      let assignedUserId = user_id || parsePositiveInt(req.user?.id) || null;
      let assignedUserName = user_name || String(req.user?.full_name || '').trim() || null;

      if (assignedUserId) {
        const user = await getUserById(assignedUserId);
        if (!user) throw new Error(`Assigned user not found for user_id: ${assignedUserId}`);
        assignedUserName = user.full_name;
      }

      if (!assignedUserName && assignedUserId) {
        const tokenUser = await getUserById(assignedUserId);
        if (tokenUser) assignedUserName = tokenUser.full_name;
      }

      if (!assignedUserName && !assignedUserId && req.user?.employee_id) {
        const tokenUserByEmp = await getUserByEmployeeId(req.user.employee_id);
        if (tokenUserByEmp) {
          assignedUserId = tokenUserByEmp.id;
          assignedUserName = tokenUserByEmp.full_name;
        }
      }

      if (!assignedUserName) {
        throw new Error('Each ticket must include user_id or user_name (or login user context)');
      }

      const masterThresholds = await getThresholdMapFromMaster({
        department: department || management_field,
        subDepartment: sub_department || erp_product_code,
        inputScreen: input_screen,
        machineName: machine_name,
        parameterName: normalizedParameterNames
      });

      const fallbackRules = normalizeThresholdRules(normalizedThresholdValue);
      const effectiveThresholds = Object.keys(masterThresholds).length ? masterThresholds : fallbackRules;
      const thresholdApprovers = await getThresholdApproversFromMaster({
        department: department || management_field,
        subDepartment: sub_department || erp_product_code,
        inputScreen: input_screen,
        machineName: machine_name,
        parameterName: normalizedParameterNames
      });
      const approvalL1UserIds = thresholdApprovers.approval_l1_user_ids || [];
      const approvalL2UserIds = thresholdApprovers.approval_l2_user_ids || [];
      const approvalL3UserIds = thresholdApprovers.approval_l3_user_ids || [];
      const tatHours = await getThresholdTatHoursFromMaster({
        department: department || management_field,
        subDepartment: sub_department || erp_product_code,
        inputScreen: input_screen,
        machineName: machine_name,
        parameterName: normalizedParameterNames
      });
      if (!effectiveThresholds) {
        skipped.push({
          machine_name,
          parameter_name,
          reason: 'threshold_missing',
          message: 'No threshold found in threshold_master and no fallback threshold provided'
        });
        continue;
      }

      const { ticketReason, violationDetails } = analyzeViolations(
        normalizedParameterNames,
        normalizedActualValue,
        effectiveThresholds
      );

      if (!ticketReason) {
        skipped.push({
          machine_name,
          parameter_name,
          reason: 'no_violation',
          message: 'Actual values did not violate configured thresholds'
        });
        continue;
      }
      const severity = resolveSeverity(requestedSeverity, violationDetails);

      const result = await client.query(
        `INSERT INTO ticketing_system.operator_tickets
         (ticket_id, user_id, user_name, machine_name, parameter_name, actual_value, threshold_value, severity, status, created_at, management_field, erp_product_code, ticket_reason, violation_details, approval_l1_user_ids, approval_l2_user_ids, approval_l3_user_ids, l1_tat_hours, l2_tat_hours, l3_tat_hours, l1_tat_due_at, tat_current_level)
         VALUES (
           'TK-' || LPAD(nextval('"ticketing_system"."ticket_seq"')::text, 4, '0'), $1, $2, $3, $4, $5, $6, $7, 'Open', CURRENT_TIMESTAMP, $8, $9, $10, $11::jsonb, $12::int[], $13::int[], $14::int[],
           $15::int, $16::int, $17::int,
           CASE WHEN $15::int IS NOT NULL THEN CURRENT_TIMESTAMP + ($15::int || ' hours')::interval ELSE NULL END,
           'L1'
         )
         RETURNING *;`,
        [
          assignedUserId,
          assignedUserName,
          machine_name,
          JSON.stringify(normalizedParameterNames),
          JSON.stringify(normalizedActualValue),
          JSON.stringify(effectiveThresholds),
          severity,
          management_field,
          erp_product_code,
          ticketReason,
          JSON.stringify(violationDetails),
          approvalL1UserIds,
          approvalL2UserIds,
          approvalL3UserIds,
          tatHours.l1_tat_hours,
          tatHours.l2_tat_hours,
          tatHours.l3_tat_hours
        ]
      );

      // Only L1 is notified at creation; L2/L3 are notified once the prior level submits (see PUT /submit/:id).
      await createTicketNotificationsForApprovers(result.rows[0].ticket_id, approvalL1UserIds);
      await createThresholdBreachNotifications(result.rows[0], approvalL1UserIds, violationDetails);
      generated.push(result.rows[0]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: `${generated.length} tickets generated successfully`,
      generated_count: generated.length,
      skipped_count: tickets.length - generated.length,
      skipped,
      tickets: generated
    });
  } catch (err) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    next(err);
  }
});

router.get('/thresholds/list', async (req, res, next) => {
  try {
    await ensureThresholdMasterApprovalColumns();
    await ensureThresholdMasterL1ApproverTable();
    await ensureThresholdMasterL2ApproverTable();
    await ensureThresholdMasterL3ApproverTable();
    await ensureThresholdMasterL3ApproverTable();
    const { department, sub_department, input_screen, machine_name, status } = req.query;
    const where = [];
    const values = [];

    if (department) {
      values.push(department);
      where.push(`tm.department = $${values.length}`);
    }
    if (sub_department) {
      values.push(sub_department);
      where.push(`tm.sub_department = $${values.length}`);
    }
    if (input_screen) {
      values.push(input_screen);
      where.push(`tm.input_screen = $${values.length}`);
    }
    if (machine_name) {
      values.push(machine_name);
      where.push(`tm.machine_name = $${values.length}`);
    }
    if (status && ['active', 'inactive'].includes(String(status).toLowerCase())) {
      values.push(String(status).toLowerCase() === 'active');
      where.push(`tm.is_active = $${values.length}`);
    }

    const sql = `
      SELECT
        tm.id,
        tm.department,
        tm.sub_department,
        tm.input_screen,
        tm.machine_name,
        tm.input_field,
        tm.condition_level,
        tm.plus_threshold,
        tm.minus_threshold,
        tm.actual_value,
        tm.is_active,
        COALESCE(l1.approval_l1_user_ids, ARRAY[]::int[]) AS approval_l1_user_ids,
        COALESCE(l1.approval_l1_names, ARRAY[]::text[]) AS approval_l1_names,
        COALESCE(l2.approval_l2_user_ids, ARRAY[]::int[]) AS approval_l2_user_ids,
        COALESCE(l2.approval_l2_names, ARRAY[]::text[]) AS approval_l2_names,
        COALESCE(l3.approval_l3_user_ids, ARRAY[]::int[]) AS approval_l3_user_ids,
        COALESCE(l3.approval_l3_names, ARRAY[]::text[]) AS approval_l3_names,
        tm.created_at,
        tm.updated_at
      FROM ticketing_system.threshold_master tm
      LEFT JOIN LATERAL (
        SELECT
          ARRAY_AGG(u.id ORDER BY u.full_name, u.id) AS approval_l1_user_ids,
          ARRAY_AGG(u.full_name ORDER BY u.full_name, u.id) AS approval_l1_names
        FROM ticketing_system.threshold_master_l1_approvers a
        JOIN users.user_details u ON u.id = a.approver_user_id
        WHERE a.threshold_master_id = tm.id
      ) l1 ON true
      LEFT JOIN LATERAL (
        SELECT
          ARRAY_AGG(u.id ORDER BY u.full_name, u.id) AS approval_l2_user_ids,
          ARRAY_AGG(u.full_name ORDER BY u.full_name, u.id) AS approval_l2_names
        FROM ticketing_system.threshold_master_l2_approvers a
        JOIN users.user_details u ON u.id = a.approver_user_id
        WHERE a.threshold_master_id = tm.id
      ) l2 ON true
      LEFT JOIN LATERAL (
        SELECT
          ARRAY_AGG(u.id ORDER BY u.full_name, u.id) AS approval_l3_user_ids,
          ARRAY_AGG(u.full_name ORDER BY u.full_name, u.id) AS approval_l3_names
        FROM ticketing_system.threshold_master_l3_approvers a
        JOIN users.user_details u ON u.id = a.approver_user_id
        WHERE a.threshold_master_id = tm.id
      ) l3 ON true
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY tm.id DESC
    `;

    const result = await client.query(sql, values);
    res.status(200).json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.patch('/submission-frequency/:id', async (req, res, next) => {
  try {
    await ensureScreenFrequencyTable();

    const { id } = req.params;
    const {
      screen_name,
      department,
      sub_department,
      frequency,
      occurrences,
      is_active,
      approval_l1,
      approval_l1_name,
      approval_l2,
      approval_l2_name,
      approval_l3,
      approval_l3_name,
      l1_tat_hours,
      l2_tat_hours,
      l3_tat_hours
    } = req.body || {};

    const normalizedFrequency =
      frequency === undefined ? undefined : normalizeFrequency(frequency);

    if (frequency !== undefined && !normalizedFrequency) {
      return res.status(400).json({ message: 'frequency must be a positive integer' });
    }

    const normalizedOccurrences =
      occurrences === undefined
        ? undefined
        : occurrences === null || occurrences === ''
          ? null
          : Number(occurrences);
    const normalizedL1TatHours =
      l1_tat_hours === undefined ? undefined : parseTatHours(l1_tat_hours);
    const normalizedL2TatHours =
      l2_tat_hours === undefined ? undefined : parseTatHours(l2_tat_hours);
    const normalizedL3TatHours =
      l3_tat_hours === undefined ? undefined : parseTatHours(l3_tat_hours);

    if (
      normalizedOccurrences !== undefined &&
      normalizedOccurrences !== null &&
      (!Number.isInteger(normalizedOccurrences) || normalizedOccurrences < 1)
    ) {
      return res.status(400).json({ message: 'occurrences must be a positive integer' });
    }
    if (
      l1_tat_hours !== undefined &&
      l1_tat_hours !== null &&
      l1_tat_hours !== '' &&
      !normalizedL1TatHours
    ) {
      return res.status(400).json({ message: 'l1_tat_hours must be a positive integer' });
    }
    if (
      l2_tat_hours !== undefined &&
      l2_tat_hours !== null &&
      l2_tat_hours !== '' &&
      !normalizedL2TatHours
    ) {
      return res.status(400).json({ message: 'l2_tat_hours must be a positive integer' });
    }
    if (
      l3_tat_hours !== undefined &&
      l3_tat_hours !== null &&
      l3_tat_hours !== '' &&
      !normalizedL3TatHours
    ) {
      return res.status(400).json({ message: 'l3_tat_hours must be a positive integer' });
    }

    const result = await client.query(
      `UPDATE ticketing_system.screen_submission_frequency
       SET screen_name = COALESCE($1, screen_name),
           department = COALESCE($2, department),
           sub_department = COALESCE($3, sub_department),
           frequency = COALESCE($4, frequency),
           occurrences = COALESCE($5, occurrences),
           is_active = COALESCE($6, is_active),
           approval_l1 = COALESCE($7, approval_l1),
           approval_l1_name = COALESCE($8, approval_l1_name),
           approval_l2 = COALESCE($9, approval_l2),
           approval_l2_name = COALESCE($10, approval_l2_name),
           approval_l3 = COALESCE($11, approval_l3),
           approval_l3_name = COALESCE($12, approval_l3_name),
           l1_tat_hours = COALESCE($13, l1_tat_hours),
           l2_tat_hours = COALESCE($14, l2_tat_hours),
           l3_tat_hours = COALESCE($15, l3_tat_hours),
           updated_at = NOW()
       WHERE id = $16
       RETURNING *`,
      [
        screen_name,
        department,
        sub_department,
        normalizedFrequency,
        normalizedOccurrences,
        is_active,
        approval_l1,
        approval_l1_name,
        approval_l2,
        approval_l2_name,
        approval_l3,
        approval_l3_name,
        normalizedL1TatHours,
        normalizedL2TatHours,
        normalizedL3TatHours,
        id
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Submission threshold not found' });
    }

    res.status(200).json({
      message: 'Submission threshold updated successfully',
      config: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/submission-frequency/:id/status', async (req, res, next) => {
  try {
    await ensureScreenFrequencyTable();

    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ message: 'is_active must be boolean' });
    }

    const result = await client.query(
      `UPDATE ticketing_system.screen_submission_frequency
       SET is_active = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [is_active, id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Submission threshold not found' });
    }

    res.status(200).json({
      message: `Submission threshold ${is_active ? 'activated' : 'deactivated'} successfully`,
      config: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/submission-frequency/:id', async (req, res, next) => {
  try {
    await ensureScreenFrequencyTable();

    const { id } = req.params;

    const result = await client.query(
      `DELETE FROM ticketing_system.screen_submission_frequency
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Submission threshold not found' });
    }

    res.status(200).json({
      message: 'Submission threshold deleted successfully'
    });
  } catch (err) {
    next(err);
  }
});

router.get('/thresholds/approver-options', async (req, res, next) => {
  try {
    const approverOptions = await getThresholdApproverOptions();
    res.status(200).json(approverOptions);
  } catch (err) {
    next(err);
  }
});

router.post('/thresholds', async (req, res, next) => {
  try {
    const {
      department,
      sub_department,
      subDepartment,
      input_screen,
      inputScreen,
      machine_name,
      input_field,
      inputField,
      condition_level = 'More Than',
      condition,
      plus_threshold,
      plusThreshold,
      minus_threshold,
      minusThreshold,
      threshold_value,
      threshold,
      value,
      actual_value,
      actualValue,
      approval_l1_name,
      approval_l1_names,
      approval_l1_user_id,
      approval_l1_user_ids,
      approval_l1_id,
      approval_l1_ids,
      approval_l2_name,
      approval_l2_names,
      approval_l2_user_id,
      approval_l2_user_ids,
      approval_l2_id,
      approval_l2_ids,
      approval_l3_name,
      approval_l3_names,
      approval_l3_user_id,
      approval_l3_user_ids,
      approval_l3_id,
      approval_l3_ids,
      is_active = true
    } = req.body;

    const departmentValue = pickDropdownValue(department);
    const subDepartmentValue = pickDropdownValue(sub_department ?? subDepartment);
    const inputScreenValue = pickDropdownValue(input_screen ?? inputScreen);
    const inputFieldValue = pickDropdownValue(input_field ?? inputField);
    const conditionLevelValue = pickDropdownValue(condition_level ?? condition) || 'More Than';
    const normalized = normalizeThresholdInputs(
      plus_threshold ?? plusThreshold ?? threshold_value ?? threshold ?? value,
      minus_threshold ?? minusThreshold ?? threshold_value ?? threshold ?? value,
      actual_value ?? actualValue ?? null
    );
    const plusThresholdFinal = normalized.plusThreshold;
    const minusThresholdFinal = normalized.minusThreshold;
    const actualValueFinal = normalized.actualValue;
    let approvalL1UserIds;
    let approvalL2UserIds;
    let approvalL3UserIds;
    try {
      approvalL1UserIds = await resolveApproverUserIds({
        levelLabel: 'approval_l1',
        expectedLevel: 'L1',
        userIdValue: approval_l1_user_ids ?? approval_l1_ids ?? approval_l1_user_id ?? approval_l1_id,
        nameValue: approval_l1_names ?? approval_l1_name
      });
      approvalL2UserIds = await resolveApproverUserIds({
        levelLabel: 'approval_l2',
        expectedLevel: 'L2',
        userIdValue: approval_l2_user_ids ?? approval_l2_ids ?? approval_l2_user_id ?? approval_l2_id,
        nameValue: approval_l2_names ?? approval_l2_name
      });
      approvalL3UserIds = await resolveApproverUserIds({
        levelLabel: 'approval_l3',
        expectedLevel: 'L3',
        userIdValue: approval_l3_user_ids ?? approval_l3_ids ?? approval_l3_user_id ?? approval_l3_id,
        nameValue: approval_l3_names ?? approval_l3_name
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    if (!approvalL1UserIds.length) {
      approvalL1UserIds = await getDefaultApproverUserIdsByLevel({
        level: 'L1',
        department: departmentValue
      });
    }
    if (!approvalL2UserIds.length) {
      approvalL2UserIds = await getDefaultApproverUserIdsByLevel({
        level: 'L2',
        department: departmentValue
      });
    }
    if (!approvalL3UserIds.length) {
      approvalL3UserIds = await getDefaultApproverUserIdsByLevel({
        level: 'L3',
        department: departmentValue
      });
    }

    if (!departmentValue || !subDepartmentValue || !inputScreenValue || !machine_name || !inputFieldValue || plusThresholdFinal === undefined || minusThresholdFinal === undefined) {
      return res.status(400).json({
        message: 'department, sub_department, input_screen, machine_name, input_field and a threshold value are required'
      });
    }

    const result = await upsertThresholdMaster({
      department: departmentValue,
      subDepartment: subDepartmentValue,
      inputScreen: inputScreenValue,
      machineName: machine_name || null,
      inputField: inputFieldValue,
      conditionLevel: conditionLevelValue,
      plusThreshold: plusThresholdFinal,
      minusThreshold: minusThresholdFinal,
      actualValue: actualValueFinal,
      isActive: is_active,
      approvalL1UserIds,
      approvalL2UserIds,
      approvalL3UserIds
    });

    res.status(201).json({
      message: 'Threshold saved successfully',
      threshold: result
    });
  } catch (err) {
    next(err);
  }
});

router.post('/thresholds/bulk', async (req, res, next) => {
  let transactionStarted = false;
  try {
    const items = Array.isArray(req.body?.thresholds) ? req.body.thresholds : [];
    const rootDepartment = req.body?.department;
    const rootSubDepartment = req.body?.sub_department ?? req.body?.subDepartment ?? req.body?.subdepartment;
    const rootInputScreen = req.body?.input_screen ?? req.body?.inputScreen ?? req.body?.screen;
    const rootMachineName = req.body?.machine_name ?? req.body?.machineName;
    if (!items.length) {
      return res.status(400).json({ message: 'thresholds array is required' });
    }

    await client.query('BEGIN');
    transactionStarted = true;

    const saved = [];
    for (const item of items) {
      const {
        department,
        sub_department,
        subDepartment,
        subdepartment,
        input_screen,
        inputScreen,
        screen,
        screen_name,
        machine_name,
        machineName,
        input_field,
        inputField,
        field_name,
        fieldName,
        condition_level = 'More Than',
        condition,
        conditionLevel,
        plus_threshold,
        plusThreshold,
        minus_threshold,
        minusThreshold,
        threshold_value,
        threshold,
        value,
        actual_value,
        actualValue,
        approval_l1_name,
        approval_l1_names,
        approval_l1_user_id,
        approval_l1_user_ids,
        approval_l1_id,
        approval_l1_ids,
        approval_l2_name,
        approval_l2_names,
        approval_l2_user_id,
        approval_l2_user_ids,
        approval_l2_id,
        approval_l2_ids,
        approval_l3_name,
        approval_l3_names,
        approval_l3_user_id,
        approval_l3_user_ids,
        approval_l3_id,
        approval_l3_ids,
        is_active = true
      } = item;

      const departmentValue = pickDropdownValue(department ?? rootDepartment);
      const subDepartmentValue = pickDropdownValue(sub_department ?? subDepartment ?? subdepartment ?? rootSubDepartment);
      const inputScreenValue = pickDropdownValue(input_screen ?? inputScreen ?? screen ?? screen_name ?? rootInputScreen);
      const inputFieldValue = pickDropdownValue(input_field ?? inputField ?? field_name ?? fieldName);
      const conditionLevelValue = pickDropdownValue(condition_level ?? condition ?? conditionLevel) || 'More Than';
      const normalized = normalizeThresholdInputs(
        plus_threshold ?? plusThreshold ?? threshold_value ?? threshold ?? value,
        minus_threshold ?? minusThreshold ?? threshold_value ?? threshold ?? value,
        actual_value ?? actualValue ?? null
      );
      const plusThresholdFinal = normalized.plusThreshold;
      const minusThresholdFinal = normalized.minusThreshold;
      const actualValueFinal = normalized.actualValue;
      let approvalL1UserIds = await resolveApproverUserIds({
        levelLabel: 'approval_l1',
        expectedLevel: 'L1',
        userIdValue: approval_l1_user_ids ?? approval_l1_ids ?? approval_l1_user_id ?? approval_l1_id,
        nameValue: approval_l1_names ?? approval_l1_name
      });
      let approvalL2UserIds = await resolveApproverUserIds({
        levelLabel: 'approval_l2',
        expectedLevel: 'L2',
        userIdValue: approval_l2_user_ids ?? approval_l2_ids ?? approval_l2_user_id ?? approval_l2_id,
        nameValue: approval_l2_names ?? approval_l2_name
      });
      let approvalL3UserIds = await resolveApproverUserIds({
        levelLabel: 'approval_l3',
        expectedLevel: 'L3',
        userIdValue: approval_l3_user_ids ?? approval_l3_ids ?? approval_l3_user_id ?? approval_l3_id,
        nameValue: approval_l3_names ?? approval_l3_name
      });

      if (!approvalL1UserIds.length) {
        approvalL1UserIds = await getDefaultApproverUserIdsByLevel({
          level: 'L1',
          department: departmentValue
        });
      }
      if (!approvalL2UserIds.length) {
        approvalL2UserIds = await getDefaultApproverUserIdsByLevel({
          level: 'L2',
          department: departmentValue
        });
      }
      if (!approvalL3UserIds.length) {
        approvalL3UserIds = await getDefaultApproverUserIdsByLevel({
          level: 'L3',
          department: departmentValue
        });
      }
      const machineNameValue = machine_name ?? machineName ?? rootMachineName ?? null;

      if (!departmentValue || !subDepartmentValue || !inputScreenValue || !machineNameValue || !inputFieldValue || plusThresholdFinal === undefined || minusThresholdFinal === undefined) {
        throw new Error('Each threshold must include department, sub_department, input_screen, machine_name, input_field and a threshold value');
      }

      const savedRow = await upsertThresholdMaster({
        department: departmentValue,
        subDepartment: subDepartmentValue,
        inputScreen: inputScreenValue,
        machineName: machineNameValue,
        inputField: inputFieldValue,
        conditionLevel: conditionLevelValue,
        plusThreshold: plusThresholdFinal,
        minusThreshold: minusThresholdFinal,
        actualValue: actualValueFinal,
        isActive: is_active,
        approvalL1UserIds,
        approvalL2UserIds,
        approvalL3UserIds
      });

      saved.push(savedRow);
    }

    await client.query('COMMIT');
    res.status(201).json({
      message: `${saved.length} thresholds saved successfully`,
      count: saved.length,
      thresholds: saved
    });
  } catch (err) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    next(err);
  }
});

router.post('/thresholds/upload-csv', csvUpload.single('file'), async (req, res, next) => {
  let transactionStarted = false;
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'CSV file is required in form-data field: file' });
    }

    const rows = [];
    await new Promise((resolve, reject) => {
      Readable.from(req.file.buffer)
        .pipe(csvParser())
        .on('data', (data) => rows.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    if (!rows.length) {
      return res.status(400).json({ message: 'CSV has no rows' });
    }

    await client.query('BEGIN');
    transactionStarted = true;

    const saved = [];
    for (const rawRow of rows) {
      const department = rawRow.department;
      const sub_department = rawRow.sub_department || rawRow.subDepartment;
      const input_screen = rawRow.input_screen || rawRow.inputScreen;
      const machine_name = rawRow.machine_name || rawRow.machineName;
      const input_field = rawRow.input_field || rawRow.inputField;
      const condition_level = rawRow.condition_level || rawRow.conditionLevel || 'More Than';
      const plusRaw = rawRow.plus_threshold ?? rawRow.plusThreshold ?? rawRow.threshold_value ?? rawRow.thresholdValue;
      const minusRaw = rawRow.minus_threshold ?? rawRow.minusThreshold ?? rawRow.threshold_value ?? rawRow.thresholdValue;
      const actualRaw = rawRow.actual_value ?? rawRow.actualValue ?? null;
      const normalized = normalizeThresholdInputs(plusRaw, minusRaw, actualRaw);
      const plus_threshold = normalized.plusThreshold;
      const minus_threshold = normalized.minusThreshold;
      const actual_value = normalized.actualValue;
      const is_active_raw = rawRow.is_active ?? rawRow.isActive;
      const is_active = is_active_raw === undefined
        ? true
        : String(is_active_raw).toLowerCase() !== 'false';
      const approvalL1Raw =
        rawRow.approval_l1_user_ids ??
        rawRow.approvalL1UserIds ??
        rawRow.approval_l1_user_id ??
        rawRow.approvalL1UserId ??
        null;
      const approvalL1Name =
        rawRow.approval_l1_names ??
        rawRow.approvalL1Names ??
        rawRow.approval_l1_name ??
        rawRow.approvalL1Name ??
        null;
      const approvalL2Raw =
        rawRow.approval_l2_user_ids ??
        rawRow.approvalL2UserIds ??
        rawRow.approval_l2_user_id ??
        rawRow.approvalL2UserId ??
        null;
      const approvalL2Name =
        rawRow.approval_l2_names ??
        rawRow.approvalL2Names ??
        rawRow.approval_l2_name ??
        rawRow.approvalL2Name ??
        null;
      const approvalL3Raw =
        rawRow.approval_l3_user_ids ??
        rawRow.approvalL3UserIds ??
        rawRow.approval_l3_user_id ??
        rawRow.approvalL3UserId ??
        null;
      const approvalL3Name =
        rawRow.approval_l3_names ??
        rawRow.approvalL3Names ??
        rawRow.approval_l3_name ??
        rawRow.approvalL3Name ??
        null;
      let approvalL1UserIds = await resolveApproverUserIds({
        levelLabel: 'approval_l1',
        expectedLevel: 'L1',
        userIdValue: approvalL1Raw,
        nameValue: approvalL1Name
      });
      let approvalL2UserIds = await resolveApproverUserIds({
        levelLabel: 'approval_l2',
        expectedLevel: 'L2',
        userIdValue: approvalL2Raw,
        nameValue: approvalL2Name
      });
      let approvalL3UserIds = await resolveApproverUserIds({
        levelLabel: 'approval_l3',
        expectedLevel: 'L3',
        userIdValue: approvalL3Raw,
        nameValue: approvalL3Name
      });

      if (!approvalL1UserIds.length) {
        approvalL1UserIds = await getDefaultApproverUserIdsByLevel({
          level: 'L1',
          department
        });
      }
      if (!approvalL2UserIds.length) {
        approvalL2UserIds = await getDefaultApproverUserIdsByLevel({
          level: 'L2',
          department
        });
      }
      if (!approvalL3UserIds.length) {
        approvalL3UserIds = await getDefaultApproverUserIdsByLevel({
          level: 'L3',
          department
        });
      }

      if (!department || !sub_department || !input_screen || !machine_name || !input_field || plus_threshold === undefined || minus_threshold === undefined) {
        throw new Error('Invalid CSV row. Required: department, sub_department, input_screen, machine_name, input_field, plus_threshold, minus_threshold');
      }

      const savedRow = await upsertThresholdMaster({
        department,
        subDepartment: sub_department,
        inputScreen: input_screen,
        machineName: machine_name || null,
        inputField: input_field,
        conditionLevel: condition_level,
        plusThreshold: plus_threshold,
        minusThreshold: minus_threshold,
        actualValue: actual_value,
        isActive: is_active,
        approvalL1UserIds,
        approvalL2UserIds,
        approvalL3UserIds
      });

      saved.push(savedRow);
    }

    await client.query('COMMIT');
    res.status(201).json({
      message: `${saved.length} thresholds saved successfully from CSV`,
      count: saved.length,
      thresholds: saved
    });
  } catch (err) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    next(err);
  }
});

router.put('/:id/assign', async (req, res, next) => {
  try {
    const ticketId = req.params.id;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ message: 'user_id is required' });
    }

    const user = await getUserById(user_id);
    if (!user) {
      return res.status(404).json({ message: 'Assigned user not found' });
    }

    const existing = await client.query(
      `SELECT ot.ticket_id, ot.tat_current_level, ot.approval_l1_user_ids, ot.approval_l2_user_ids, ot.approval_l3_user_ids
       FROM ticketing_system.operator_tickets ot
       WHERE ot.ticket_id = $1 OR ot.ticket_id = '#' || $1`,
      [ticketId]
    );

    if (!existing.rowCount) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const ticketRow = existing.rows[0];
    const requesterRole = String(req.user?.role || '').trim().toLowerCase();
    const isAdmin = requesterRole === 'admin' || requesterRole === 'super admin' || requesterRole === 'superadmin';
    const requesterId = parsePositiveInt(req.user?.id);

    if (!isAdmin) {
      const currentLevel = ticketRow.tat_current_level || 'L1';
      const approverIdsByLevel = {
        L1: ticketRow.approval_l1_user_ids || [],
        L2: ticketRow.approval_l2_user_ids || [],
        L3: ticketRow.approval_l3_user_ids || [],
        EXPIRED_L3: ticketRow.approval_l3_user_ids || [],
        EXPIRED_L2: ticketRow.approval_l3_user_ids?.length ? ticketRow.approval_l3_user_ids : (ticketRow.approval_l2_user_ids || [])
      };
      const eligibleApproverIds = approverIdsByLevel[currentLevel] || [];

      if (!requesterId || !eligibleApproverIds.includes(requesterId)) {
        return res.status(403).json({
          message: `Only ${currentLevel} approvers can reassign this ticket at its current stage`
        });
      }
    }

    const updated = await client.query(
      `UPDATE ticketing_system.operator_tickets
       SET user_id = $1, user_name = $2
       WHERE ticket_id = $3
       RETURNING *`,
      [user.id, user.full_name, ticketRow.ticket_id]
    );

    res.status(200).json({
      message: 'Ticket assigned successfully',
      ticket: updated.rows[0]
    });
  } catch (err) {
    next(err);
  }
});

const updateOperatorTicketStatusHandler = async (req, res, next) => {
  try {
    let ticketId = String(req.params.id || req.body?.ticket_id || req.body?.ticketId || '').trim();
    const status = normalizeTicketStatusInput(req.body?.status || req.body?.ticket_status || req.body?.ticketStatus);

    if (!ticketId) return res.status(400).json({ message: 'ticketId is required' });
    if (!status) {
      return res.status(400).json({
        message: 'Valid status is required',
        allowed_statuses: ['Open', 'In Progress', 'Closed', 'Reopened']
      });
    }

    const existing = await client.query(
      `SELECT ot.ticket_id, ot.tat_current_level, ot.approval_l1_user_ids, ot.approval_l2_user_ids, ot.approval_l3_user_ids
       FROM ticketing_system.operator_tickets ot
       WHERE (ot.ticket_id = $1 OR ot.ticket_id = '#' || $1)
         AND ${nonAcknowledgementTicketWhere}`,
      [ticketId]
    );

    if (!existing.rowCount) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const ticketRow = existing.rows[0];
    ticketId = ticketRow.ticket_id; // normalize to the canonical stored id (with '#') for all following queries
    const requesterRole = String(req.user?.role || '').trim().toLowerCase();
    const isAdmin = requesterRole === 'admin' || requesterRole === 'super admin' || requesterRole === 'superadmin';
    const requesterId = parsePositiveInt(req.user?.id);

    if (!isAdmin) {
      const currentLevel = ticketRow.tat_current_level || 'L1';
      // EXPIRED_L2/EXPIRED_L3 are terminal TAT-breach states, not new levels -
      // the L3 (or, for the legacy no-L3-configured path, L2) approvers who
      // could already see the escalated ticket keep the same optional-review
      // ability to act on it once it's expired.
      const approverIdsByLevel = {
        L1: ticketRow.approval_l1_user_ids || [],
        L2: ticketRow.approval_l2_user_ids || [],
        L3: ticketRow.approval_l3_user_ids || [],
        EXPIRED_L3: ticketRow.approval_l3_user_ids || [],
        EXPIRED_L2: ticketRow.approval_l3_user_ids?.length ? ticketRow.approval_l3_user_ids : (ticketRow.approval_l2_user_ids || [])
      };
      const eligibleApproverIds = approverIdsByLevel[currentLevel] || [];

      if (!requesterId || !eligibleApproverIds.includes(requesterId)) {
        return res.status(403).json({
          message: `Only ${currentLevel} approvers can act on this ticket at its current stage`
        });
      }
    }

    // A reject sends the ticket back to L1: restart the L1 TAT clock and drop
    // tat_current_level back to 'L1' so L2/L3 stop seeing it until L1 resubmits.
    const isReject = status === 'Reopened';

    const updated = await client.query(
      `UPDATE ticketing_system.operator_tickets ot
       SET status = $2,
           tat_current_level = CASE WHEN $3::boolean THEN 'L1' ELSE tat_current_level END,
           l1_tat_due_at = CASE
             WHEN $3::boolean AND ot.l1_tat_hours IS NOT NULL THEN CURRENT_TIMESTAMP + (ot.l1_tat_hours || ' hours')::interval
             WHEN $3::boolean THEN NULL
             ELSE l1_tat_due_at
           END,
           l2_tat_due_at = CASE WHEN $3::boolean THEN NULL ELSE l2_tat_due_at END,
           l3_tat_due_at = CASE WHEN $3::boolean THEN NULL ELSE l3_tat_due_at END
       WHERE ot.ticket_id = $1
         AND ${nonAcknowledgementTicketWhere}
       RETURNING *`,
      [ticketId, status, isReject]
    );

    if (!updated.rowCount) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    await client.query(
      `INSERT INTO ticketing_system.ticket_logs
       (ticket_id, action, performed_by, role, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [
        ticketId,
        `STATUS_UPDATED_${status.toUpperCase().replace(/\s+/g, '_')}`,
        req.user?.full_name || req.user?.employee_id || req.body?.updated_by || 'System',
        req.user?.role || 'System'
      ]
    );

    return res.status(200).json({
      message: 'Ticket status updated successfully',
      ticket: updated.rows[0],
      tickets: updated.rows,
      data: updated.rows
    });
  } catch (err) {
    next(err);
  }
};

router.patch('/:id/status', updateOperatorTicketStatusHandler);
router.put('/:id/status', updateOperatorTicketStatusHandler);

router.get('/workflow/guide', async (req, res) => {
  res.status(200).json({
    workflow: [
      {
        step: 1,
        title: 'Create or update threshold master',
        endpoint: 'POST /operator-tickets/thresholds',
        owner: 'Admin/ERP'
      },
      {
        step: 2,
        title: 'Create ticket(s) from ERP actual values',
        endpoint: 'POST /operator-tickets OR POST /operator-tickets/generate',
        owner: 'Admin/ERP'
      },
      {
        step: 3,
        title: 'Assign ticket to operator user',
        endpoint: 'PUT /operator-tickets/{ticket_id}/assign',
        owner: 'Admin/Supervisor'
      },
      {
        step: 4,
        title: 'Submit ticket for supervisor review',
        endpoint: 'PUT /operator-tickets/submit/{ticket_id}',
        owner: 'Operator'
      },
      {
        step: 5,
        title: 'Supervisor decision',
        endpoint: 'PATCH /api/supervisor-tickets/tickets/approve?ticketId={ticket_id} OR /reject',
        owner: 'Supervisor'
      }
    ],
    ticket_reasons: ['MISSING_VALUE', 'THRESHOLD_BREACH', 'BOTH'],
    status_flow: ['Open', 'In Progress', 'Closed or Reopened']
  });
});
/**
 * @swagger
 * /operator-tickets/submit/{id}:
 *   put:
 *     summary: Submit an Open ticket for L1 approval
 *     description: |
 *       Changes ticket status from **Open** to **In Progress**,
 *       stores operator comment in `violation_details.operator_comment`
 *       (accepts `operator_comment` / `comment` / `remarks`),
 *       and sends an email notification to L1.
 *     tags:
 *       - Operator Tickets
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ticket submitted successfully and email sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ticket submitted successfully and sent for approval
 *                 ticket:
 *                   type: object
 *                   properties:
 *                     ticket_id:
 *                       type: string
 *                       example: TK-0001
 *                     status:
 *                       type: string
 *                       example: In Progress
 *       400:
 *         description: Only Open tickets can be submitted
 *       404:
 *         description: Ticket not found
 *       500:
 *         description: L1 email not found or internal server error
 */

router.put('/submit/:id', async (req, res, next) => {
  try {

    let ticketId = req.params.id;
    // Accept multiple payload aliases and persist as operator_comment.
    const operatorCommentRaw =
      req.body?.operator_comment ??
      req.body?.comment ??
      req.body?.remarks ??
      null;
    const operatorComment =
      operatorCommentRaw === null || operatorCommentRaw === undefined
        ? null
        : String(operatorCommentRaw).trim();

    const ticketResult = await client.query(
      `SELECT *
       FROM ticketing_system.operator_tickets ot
       WHERE (ot.ticket_id = $1 OR ot.ticket_id = '#' || $1)
         AND ${nonAcknowledgementTicketWhere}`,
      [ticketId]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];
    ticketId = ticket.ticket_id; // normalize to the canonical stored id (with '#') for all following queries

    const normalizedStatus = String(ticket.status || '').trim().toLowerCase();

    if (normalizedStatus === 'in progress') {
      return res.status(200).json({
        message: 'Ticket is already submitted and sent for approval',
        ticket
      });
    }

    if (!['open', 'reopened'].includes(normalizedStatus)) {
      return res.status(400).json({
        message: 'Only Open or Reopened tickets can be submitted'
      });
    }

    const l2ApproverIdsOnTicket = Array.isArray(ticket.approval_l2_user_ids) ? ticket.approval_l2_user_ids : [];
    const shouldAdvanceToL2 = l2ApproverIdsOnTicket.length > 0 && (ticket.tat_current_level || 'L1') === 'L1';

    const updateResult = await client.query(
      `UPDATE ticketing_system.operator_tickets
       SET status = 'In Progress',
           tat_current_level = CASE WHEN $3::boolean THEN 'L2' ELSE tat_current_level END,
           l1_tat_due_at = CASE WHEN $3::boolean THEN NULL ELSE l1_tat_due_at END,
           l2_tat_due_at = CASE
             WHEN $3::boolean AND l2_tat_hours IS NOT NULL THEN CURRENT_TIMESTAMP + (l2_tat_hours || ' hours')::interval
             ELSE l2_tat_due_at
           END,
           violation_details = CASE
             WHEN $2::text IS NULL OR btrim($2::text) = '' THEN violation_details
             ELSE COALESCE(violation_details, '{}'::jsonb) || jsonb_build_object('operator_comment', $2::text)
           END
       WHERE ticket_id = $1
       RETURNING *`,
      [ticketId, operatorComment, shouldAdvanceToL2]
    );

    const updatedTicket = updateResult.rows[0];

    await client.query(
      `INSERT INTO ticketing_system.ticket_logs
       (ticket_id, action, performed_by, role, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [
        ticketId,
        normalizedStatus === 'reopened' ? 'RESUBMITTED' : 'SUBMITTED',
        req.user?.full_name || req.user?.employee_id || 'Operator',
        req.user?.role || 'Operator'
      ]
    );

    if (shouldAdvanceToL2) {
      const l2ApproverIds = Array.isArray(updatedTicket.approval_l2_user_ids) ? updatedTicket.approval_l2_user_ids : [];
      const isPpNotebookIncomplete = updatedTicket.violation_details?.ticket_type === 'PP_NOTEBOOK_INCOMPLETE';
      const notebook = updatedTicket.violation_details?.notebook;
      const entryId = updatedTicket.violation_details?.entry_id;
      await createNotificationsForUsers(l2ApproverIds, {
        ticketId: updatedTicket.ticket_id,
        type: isPpNotebookIncomplete ? 'PP_NOTEBOOK_INCOMPLETE' : 'TICKET_ASSIGNED',
        category: 'Tickets',
        priority: 'High',
        title: isPpNotebookIncomplete
          ? `Process Parameter ${entryId} needs your attention`
          : `Ticket ${updatedTicket.ticket_id} needs your attention`,
        body: isPpNotebookIncomplete
          ? `"${notebook}" was submitted by L1 and needs your review.`
          : `${updatedTicket.machine_name || 'A ticket'} was submitted by L1 and needs your review.`,
        linkUrl: `/supervisor-tickets/${updatedTicket.ticket_id}`,
        payload: { ticket_id: updatedTicket.ticket_id, entry_id: entryId, notebook, role: 'L2' }
      });
    }

    sendEmail({
      to: ticket.supevisor_email || 'otpdemoin@gmail.com',
      subject: `Ticket In Progress: ${updatedTicket.ticket_id}`,
      // html: submittedMailTemplate(updatedTicket)
    });

    res.status(200).json({
      message: 'Ticket submitted successfully and sent for approval',
      ticket: updatedTicket
    });

  } catch (err) {
    next(err);
  }
});

router.patch('/thresholds/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ message: 'is_active must be boolean' });
    }

    const result = await client.query(
      `UPDATE ticketing_system.threshold_master
       SET is_active = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [is_active, id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Threshold not found' });
    }

    res.status(200).json({
      message: `Threshold ${is_active ? 'activated' : 'deactivated'} successfully`,
      threshold: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
});


router.patch('/thresholds/:id', async (req, res, next) => {
  try {
    await ensureThresholdMasterApprovalColumns();
    await ensureThresholdMasterL1ApproverTable();
    await ensureThresholdMasterL2ApproverTable();
    const { id } = req.params;

    const {
      condition_level,
      plus_threshold,
      minus_threshold,
      actual_value,
      approval_l1_name,
      approval_l1_names,
      approval_l1_user_id,
      approval_l1_user_ids,
      approval_l1_id,
      approval_l1_ids,
      approval_l2_name,
      approval_l2_names,
      approval_l2_user_id,
      approval_l2_user_ids,
      approval_l2_id,
      approval_l2_ids,
      approval_l3_name,
      approval_l3_names,
      approval_l3_user_id,
      approval_l3_user_ids,
      approval_l3_id,
      approval_l3_ids
    } = req.body;
    const hasL1ApproverInput =
      Object.prototype.hasOwnProperty.call(req.body, 'approval_l1_name') ||
      Object.prototype.hasOwnProperty.call(req.body, 'approval_l1_names') ||
      Object.prototype.hasOwnProperty.call(req.body, 'approval_l1_user_id') ||
      Object.prototype.hasOwnProperty.call(req.body, 'approval_l1_user_ids') ||
      Object.prototype.hasOwnProperty.call(req.body, 'approval_l1_id') ||
      Object.prototype.hasOwnProperty.call(req.body, 'approval_l1_ids');
    const hasL2ApproverInput =
      Object.prototype.hasOwnProperty.call(req.body, 'approval_l2_name') ||
      Object.prototype.hasOwnProperty.call(req.body, 'approval_l2_names') ||
      Object.prototype.hasOwnProperty.call(req.body, 'approval_l2_user_id') ||
      Object.prototype.hasOwnProperty.call(req.body, 'approval_l2_user_ids') ||
      Object.prototype.hasOwnProperty.call(req.body, 'approval_l2_id') ||
      Object.prototype.hasOwnProperty.call(req.body, 'approval_l2_ids');
    const hasL3ApproverInput =
      Object.prototype.hasOwnProperty.call(req.body, 'approval_l3_name') ||
      Object.prototype.hasOwnProperty.call(req.body, 'approval_l3_names') ||
      Object.prototype.hasOwnProperty.call(req.body, 'approval_l3_user_id') ||
      Object.prototype.hasOwnProperty.call(req.body, 'approval_l3_user_ids') ||
      Object.prototype.hasOwnProperty.call(req.body, 'approval_l3_id') ||
      Object.prototype.hasOwnProperty.call(req.body, 'approval_l3_ids');

    const hasConditionLevelInput = Object.prototype.hasOwnProperty.call(req.body, 'condition_level');
    const hasPlusThresholdInput = Object.prototype.hasOwnProperty.call(req.body, 'plus_threshold');
    const hasMinusThresholdInput = Object.prototype.hasOwnProperty.call(req.body, 'minus_threshold');
    const hasActualValueInput = Object.prototype.hasOwnProperty.call(req.body, 'actual_value');

    const normalized = normalizeThresholdInputs(
      plus_threshold,
      minus_threshold,
      actual_value
    );
    let approvalL1UserIds = null;
    let approvalL2UserIds = null;
    let approvalL3UserIds = null;
    try {
      if (hasL1ApproverInput) {
        approvalL1UserIds = await resolveApproverUserIds({
          levelLabel: 'approval_l1',
          expectedLevel: 'L1',
          userIdValue: approval_l1_user_ids ?? approval_l1_ids ?? approval_l1_user_id ?? approval_l1_id,
          nameValue: approval_l1_names ?? approval_l1_name
        });
      }
      if (hasL2ApproverInput) {
        approvalL2UserIds = await resolveApproverUserIds({
          levelLabel: 'approval_l2',
          expectedLevel: 'L2',
          userIdValue: approval_l2_user_ids ?? approval_l2_ids ?? approval_l2_user_id ?? approval_l2_id,
          nameValue: approval_l2_names ?? approval_l2_name
        });
      }
      if (hasL3ApproverInput) {
        approvalL3UserIds = await resolveApproverUserIds({
          levelLabel: 'approval_l3',
          expectedLevel: 'L3',
          userIdValue: approval_l3_user_ids ?? approval_l3_ids ?? approval_l3_user_id ?? approval_l3_id,
          nameValue: approval_l3_names ?? approval_l3_name
        });
      }
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    const result = await client.query(
      `UPDATE ticketing_system.threshold_master
       SET condition_level = CASE WHEN $12::boolean THEN $1 ELSE condition_level END,
           plus_threshold = CASE WHEN $13::boolean THEN $2 ELSE plus_threshold END,
           minus_threshold = CASE WHEN $14::boolean THEN $3 ELSE minus_threshold END,
           actual_value = CASE WHEN $15::boolean THEN $4 ELSE actual_value END,
           approval_l1_user_id = CASE WHEN $5 THEN $6 ELSE approval_l1_user_id END,
           approval_l2_user_id = CASE WHEN $7 THEN $8 ELSE approval_l2_user_id END,
           approval_l3_user_id = CASE WHEN $9 THEN $10 ELSE approval_l3_user_id END,
           updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        condition_level || 'More Than',
        normalized.plusThreshold,
        normalized.minusThreshold,
        normalized.actualValue,
        hasL1ApproverInput,
        approvalL1UserIds?.[0] ?? null,
        hasL2ApproverInput,
        approvalL2UserIds?.[0] ?? null,
        hasL3ApproverInput,
        approvalL3UserIds?.[0] ?? null,
        id,
        hasConditionLevelInput,
        hasPlusThresholdInput,
        hasMinusThresholdInput,
        hasActualValueInput
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Threshold not found' });
    }

    if (hasL1ApproverInput) {
      await syncThresholdMasterL1Approvers(id, approvalL1UserIds || []);
    }
    if (hasL2ApproverInput) {
      await syncThresholdMasterL2Approvers(id, approvalL2UserIds || []);
    }
    if (hasL3ApproverInput) {
      await syncThresholdMasterL3Approvers(id, approvalL3UserIds || []);
    }
    const threshold = await getThresholdByIdWithApprovers(id);

    res.status(200).json({
      message: 'Threshold updated successfully',
      threshold
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/thresholds/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await client.query(
      `DELETE FROM ticketing_system.threshold_master
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Threshold not found' });
    }

    res.status(200).json({
      message: 'Threshold deleted successfully'
    });
  } catch (err) {
    next(err);
  }
});

module.exports = {
  router,
  runSubmissionFrequencyTatCheck,
  runThresholdTicketTatCheck,
  checkSubmissionFrequencyTickets,
  ensureScreenFrequencyTable,
  ensureOperatorTicketApprovalColumns
};

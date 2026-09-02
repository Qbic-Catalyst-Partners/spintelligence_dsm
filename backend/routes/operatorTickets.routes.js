const express = require('express');
const router = express.Router();
const client = require('../connection');
const { createNotificationsForUsers } = require('../utils/notifications');
const { generateTicketId } = require('../utils/ticketId');
const { ensureDelegationsTable } = require('./delegations.routes');
const { getManagerChain } = require('./user.routes');
const sendEmail = require('../email');
const multer = require('multer');
const csvParser = require('csv-parser');
const { Readable } = require('stream');

const csvUpload = multer({ storage: multer.memoryStorage() });

// ticket_id has been stored two different ways across this app's history -
// older tickets as plain "TK-0338", newer ones (generateTicketId, utils/
// ticketId.js) with a leading "#" as "#TK-0346" - while the frontend's
// formatTicketId always strips any leading "#" before sending an id to the
// API. Net effect: a lookup here for a "#"-prefixed ticket (any PP Approval/
// Wheel Change Approval/PP Batch ticket) silently 404'd as "Ticket not
// found" even though it exists, since the bare id it received never matched
// the stored "#..." value. Resolving to whichever form is actually stored -
// once, right after the id is read off the request - lets every existing
// `WHERE ticket_id = $1` query below keep working unchanged for both
// formats. Mirrors the identical helper in supervisorTickets.routes.js.
const resolveStoredTicketId = async (rawTicketId) => {
  const trimmed = String(rawTicketId || '').trim();
  if (!trimmed) return trimmed;
  const bare = trimmed.replace(/^#/, '');
  const result = await client.query(
    `SELECT ticket_id FROM ticketing_system.operator_tickets
     WHERE ticket_id = $1 OR ticket_id = $2
     LIMIT 1`,
    [bare, `#${bare}`]
  );
  return result.rows[0]?.ticket_id || trimmed;
};

// Employee-Hierarchy-and-Workflow-System_V2.pdf: escalation for every
// threshold type should follow the L1 user's real reporting chain
// (reports_to_user_id, see getManagerChain in user.routes.js) rather than
// relying solely on manually-configured approver-id lists. Falls back to
// whatever approver ids were already resolved (e.g. from threshold_master
// config) for any level the chain doesn't reach.
const resolveTicketEscalationChain = async (l1UserId, fallback = {}) => {
  const chain = l1UserId ? await getManagerChain(l1UserId) : [];
  const byLevel = new Map(chain.map((manager) => [manager.level, manager.id]));

  return {
    l2: byLevel.has('L2') ? [byLevel.get('L2')] : (fallback.l2 || []),
    l3: byLevel.has('L3') ? [byLevel.get('L3')] : (fallback.l3 || []),
    l4: byLevel.has('L4') ? [byLevel.get('L4')] : (fallback.l4 || []),
    l5: byLevel.has('L5') ? [byLevel.get('L5')] : (fallback.l5 || []),
  };
};

const nonAcknowledgementTicketWhere = `NOT (
  ot.ticket_reason = 'MISSING_VALUE'
  AND (ot.violation_details->>'category') = 'MISSED_FREQUENCY'
  AND COALESCE(ot.violation_details->>'ticket_type', '') IN ('SUBMISSION_ACKNOWLEDGEMENT', 'NOTEBOOK_ACK_OVERDUE')
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

  if (condition === 'more than') {
    if (!Number.isFinite(plusThreshold)) return null;
    return actualNum > plusThreshold;
  }

  if (condition === 'less than') {
    if (!Number.isFinite(minusThreshold)) return null;
    return actualNum < minusThreshold;
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
      const mode = (rule?.condition_level || 'More Than').toLowerCase();

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
        deviation_percent: Number.isFinite(deviationPercent) ? Number(deviationPercent.toFixed(4)) : null,
        criticality: rule?.criticality || null
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

const SEVERITY_RANK = { High: 3, Medium: 2, Low: 1 };

const deriveSeverity = (violationDetails) => {
  const missingCount = violationDetails?.missing_fields?.length || 0;
  const breaches = violationDetails?.threshold_breaches || [];

  if (missingCount > 0) return 'High';

  // The criticality configured on the threshold rule itself (Value Threshold settings
  // page) is authoritative - a rule set to Medium must produce a Medium-severity ticket,
  // never a deviation-based guess. This used to ignore rule?.criticality entirely and
  // always fall through to the distance-based heuristic below, so a rule configured as
  // Medium/High still showed up as Low whenever the breach was numerically small.
  let configuredSeverity = null;
  for (const breach of breaches) {
    const criticality = String(breach?.criticality || '').trim();
    const rank = SEVERITY_RANK[criticality] || 0;
    if (rank > (SEVERITY_RANK[configuredSeverity] || 0)) {
      configuredSeverity = criticality;
    }
  }
  if (configuredSeverity) return configuredSeverity;

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
  const employeeId = String(user?.employee_id || '').trim().toUpperCase();
  const role = String(user?.role || '').trim().toLowerCase();
  return employeeId === 'ADMIN001' || ['admin', 'super admin', 'superadmin'].includes(role);
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

const uniquePositiveIds = (ids = []) =>
  Array.from(new Set(ids.filter((id) => Number.isInteger(Number(id)) && Number(id) > 0).map(Number)));

// Sends a distinct, level-specific notification to each approver level rather than
// one flat blast — L1/L2/L3 submissions and approvals are mapped per-user, so their
// notifications must reflect that same per-level relevance.
const createTicketNotificationsForApprovers = async (ticketId, ticketContext = {}, levels = []) => {
  if (!ticketId || !levels.length) return;
  for (const { level, userIds } of levels) {
    const unique = uniquePositiveIds(userIds);
    if (!unique.length) continue;
    await createNotificationsForUsers(unique, {
      ticketId,
      type: 'TICKET_ASSIGNED',
      category: 'Tickets',
      priority: 'High',
      title: `${level} approval needed — ${ticketContext.machineName || 'Ticket'} ${ticketId}`,
      body: `${ticketContext.parameterName || 'A parameter'} on ${ticketContext.machineName || 'the machine'} requires your ${level} review.`,
      linkUrl: `/operator-tickets/${ticketId}`,
      payload: { ticket_id: ticketId, level }
    });
  }
};

const createThresholdBreachNotifications = async (ticket, levels = [], violationDetails = {}) => {
  if (!ticket?.ticket_id || !levels.length) return;
  const breaches = Array.isArray(violationDetails?.threshold_breaches)
    ? violationDetails.threshold_breaches
    : [];
  if (!breaches.length) return;

  for (const { level, userIds } of levels) {
    const unique = uniquePositiveIds(userIds);
    if (!unique.length) continue;
    await createNotificationsForUsers(unique, {
      ticketId: ticket.ticket_id,
      type: 'THRESHOLD_BREACH_DETECTED',
      category: 'Thresholds',
      priority: ticket.severity === 'Critical' ? 'Critical' : 'High',
      title: `${level} threshold breach — ${ticket.machine_name || 'machine'}`,
      body: `${ticket.machine_name || 'Machine/process'} has ${breaches.length} parameter breach(es) awaiting your ${level} review.`,
      linkUrl: `/operator-tickets/${ticket.ticket_id}`,
      payload: {
        ticket_id: ticket.ticket_id,
        machine_name: ticket.machine_name,
        severity: ticket.severity,
        level,
        breaches
      }
    });
  }
};

// Notifies the specific L1/L2/L3 approver(s) a new threshold is assigned to —
// these approver ids ARE "who the threshold is for" since there is no separate owner field.
const notifyThresholdApprovers = async ({ thresholdId, machineName, inputField, department, subDepartment, levels = [] }) => {
  if (!thresholdId || !levels.length) return;
  for (const { level, userIds } of levels) {
    const unique = uniquePositiveIds(userIds);
    if (!unique.length) continue;
    await createNotificationsForUsers(unique, {
      ticketId: null,
      type: 'THRESHOLD_CREATED',
      category: 'Thresholds',
      priority: 'Medium',
      title: `New threshold assigned — ${machineName || 'machine'} (${level})`,
      body: `A new ${inputField || 'parameter'} threshold for ${machineName || 'this machine'} in ${subDepartment || department || 'your department'} was created and assigned to you for ${level} review.`,
      linkUrl: `/thresholds/${thresholdId}`,
      payload: { threshold_id: thresholdId, machine_name: machineName, input_field: inputField, level }
    });
  }
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
      const err = new Error(`${levelLabel}_name not found in users.user_details`);
      err.statusCode = 400;
      throw err;
    }
    approverUserId = approverByName.id;
  }

  if (userIdValue !== undefined && userIdValue !== null && !approverUserId) {
    const err = new Error(`${levelLabel}_user_id must be a positive integer`);
    err.statusCode = 400;
    throw err;
  }

  if (approverUserId) {
    const approver = await getUserById(approverUserId);
    if (!approver) {
      const err = new Error(`${levelLabel} contains a user that no longer exists — please re-select the approver and try again`);
      err.statusCode = 400;
      throw err;
    }
    if (
      expectedLevel &&
      String(approver.level || '').trim().toUpperCase() !== expectedLevel &&
      !isAdminApproverUser(approver)
    ) {
      const err = new Error(`${levelLabel} must reference a ${expectedLevel} user`);
      err.statusCode = 400;
      throw err;
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

  for (let index = 0; index < rawUserIds.length; index += 1) {
    const rawId = rawUserIds[index];
    const candidate =
      typeof rawId === 'object' && rawId !== null
        ? rawId.id ?? rawId.user_id ?? rawId.value
        : rawId;
    const candidateText = candidate === null || candidate === undefined ? '' : String(candidate).trim();
    if (!candidateText) continue; // Ignore empty placeholders from UI payloads.
    if (isPlaceholderValue(candidateText)) continue; // Ignore dropdown placeholder labels.

    const parsedId = parsePositiveInt(candidateText);
    // The name at the same position is the fallback identity if the id turns out stale/deleted.
    const fallbackName = pickDropdownValue(toArray(nameValue)[index]);

    let resolvedUser = null;
    if (parsedId) {
      resolvedUser = await getUserById(parsedId);
    }
    if (!resolvedUser && fallbackName && !isPlaceholderValue(fallbackName)) {
      resolvedUser = await getUserByFullName(fallbackName);
    }
    if (!resolvedUser && !parsedId) {
      resolvedUser = await getUserByFullName(candidateText);
    }
    if (!resolvedUser) {
      resolvedUser = await getUserByEmployeeId(candidateText) || (fallbackName ? await getUserByEmployeeId(fallbackName) : null);
    }

    if (!resolvedUser) {
      if (parsedId) {
        const notFoundError = new Error(`${levelLabel} contains a user that no longer exists — please re-select the approver and try again`);
        notFoundError.statusCode = 400;
        throw notFoundError;
      }
      const notFoundError = new Error(`${levelLabel}_user_ids must contain positive user IDs, employee IDs, or user names`);
      notFoundError.statusCode = 400;
      throw notFoundError;
    }

    if (!seen.has(resolvedUser.id)) {
      seen.add(resolvedUser.id);
      resolvedUserIds.push(resolvedUser.id);
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
      console.error(`[resolveApproverUserIds] ${levelLabel} lookup failed for resolved id=${approverUserId}; rawUserIds=${JSON.stringify(rawUserIds)}; rawNames=${JSON.stringify(rawNames)}`);
      const notFoundError = new Error(`${levelLabel} contains a user that no longer exists — please re-select the approver and try again`);
      notFoundError.statusCode = 400;
      throw notFoundError;
    }
    if (
      expectedLevel &&
      String(approver.level || '').trim().toUpperCase() !== expectedLevel &&
      !isAdminApproverUser(approver)
    ) {
      const levelMismatchError = new Error(`${levelLabel} must reference only ${expectedLevel} users`);
      levelMismatchError.statusCode = 400;
      throw levelMismatchError;
    }
  }

  return resolvedUserIds;
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

const normalizeThresholdMode = (value) => {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'percentage' || mode === 'percent' || mode === '%') return 'Percentage';
  return 'Number';
};

const buildUniqueTicketKey = ({ department, subDepartment, notebook, field, l1UserId, criticality, valueMode }) =>
  [
    department,
    subDepartment,
    notebook,
    field,
    l1UserId,
    criticality,
    valueMode
  ]
    .map((part) => String(part ?? '').trim().toLowerCase())
    .join('::');

const rejectLegacyThresholdL2Fields = (payload) => {
  const legacyL2Keys = [
    'approval_l2',
    'approvalL2',
    'approval_l2_name',
    'approvalL2Name',
    'approval_l2_names',
    'approvalL2Names',
    'approval_l2_user_id',
    'approvalL2UserId',
    'approval_l2_user_ids',
    'approvalL2UserIds',
    'approval_l2_id',
    'approvalL2Id',
    'approval_l2_ids',
    'approvalL2Ids',
    'l2_tat_hours',
  ];

  const present = legacyL2Keys.filter(
    (key) => payload?.[key] !== undefined && payload?.[key] !== null && payload?.[key] !== ''
  );

  if (present.length) {
    const err = new Error(`Legacy L2 fields are not allowed for value thresholds: ${present.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
};

const VALID_COMPARISON_MODES = new Set(['more_than', 'less_than', 'more_and_less_than']);
const normalizeComparisonMode = (value) => {
  const mode = String(value || '').trim().toLowerCase();
  return VALID_COMPARISON_MODES.has(mode) ? mode : 'more_and_less_than';
};

const upsertValueThresholdRule = async (payload) => {
  rejectLegacyThresholdL2Fields(payload);

  const department = pickDropdownValue(payload.department);
  const subDepartment = pickDropdownValue(payload.sub_department ?? payload.subDepartment);
  const notebook = pickDropdownValue(payload.notebook);
  const field = pickDropdownValue(payload.field);
  const criticality = pickDropdownValue(payload.criticality);
  const comparisonMode = normalizeComparisonMode(
    payload.comparison_operator ?? payload.comparisonOperator ?? payload.condition_level ?? payload.conditionLevel ?? payload.comparison
  );
  const valueMode = normalizeThresholdMode(payload.value_mode ?? payload.valueMode);
  const typicalValue = String(payload.typical_value ?? payload.typicalValue ?? '').trim();
  const plusValue = toNumericIfPossible(payload.plus_value ?? payload.plusValue);
  const minusValue = toNumericIfPossible(payload.minus_value ?? payload.minusValue);
  const rawL1UserIds = payload.approval_l1_user_ids ?? payload.approvalL1UserIds;
  const l1UserIds = Array.isArray(rawL1UserIds)
    ? rawL1UserIds.map((value) => parsePositiveInt(value)).filter(Boolean)
    : [];
  const l1UserId = parsePositiveInt(payload.l1_user_id ?? payload.l1UserId ?? l1UserIds[0]);
  const l1UserName = pickDropdownValue(payload.l1_user_name ?? payload.l1UserName);
  let resolvedL1UserName = l1UserName;

  if (!resolvedL1UserName && l1UserId) {
    const l1User = await getUserById(l1UserId);
    resolvedL1UserName = l1User?.full_name || l1User?.name || l1User?.employee_id || null;
  }

  if (!department || !subDepartment || !notebook || !field || !criticality || !typicalValue || !l1UserId) {
    const err = new Error('department, sub_department, notebook, field, l1, criticality, typical_value, plus_value, and minus_value are required');
    err.statusCode = 400;
    throw err;
  }

  const uniqueTicketKey = buildUniqueTicketKey({
      department,
      subDepartment,
      notebook,
      field,
      l1UserId,
    criticality,
    valueMode
  });

  const result = await client.query(
    `INSERT INTO ticketing_system.value_threshold_rules
      (department, sub_department, notebook, field, l1_user_id, approval_l1_user_ids, l1_user_name, criticality, comparison_mode, typical_value, value_mode, plus_value, minus_value, unique_ticket_key, is_active, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
     ON CONFLICT (unique_ticket_key)
     DO UPDATE SET
       l1_user_name = EXCLUDED.l1_user_name,
       approval_l1_user_ids = EXCLUDED.approval_l1_user_ids,
       criticality = EXCLUDED.criticality,
       comparison_mode = EXCLUDED.comparison_mode,
       typical_value = EXCLUDED.typical_value,
       value_mode = EXCLUDED.value_mode,
       plus_value = EXCLUDED.plus_value,
       minus_value = EXCLUDED.minus_value,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()
     RETURNING *`,
    [department, subDepartment, notebook, field, l1UserId, l1UserIds.length ? l1UserIds : [l1UserId], resolvedL1UserName, criticality, comparisonMode, typicalValue, valueMode, plusValue, minusValue, uniqueTicketKey, Boolean(payload.is_active ?? payload.isActive ?? true)]
  );

  return result.rows[0];
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

const normalizeSlaLevel = (value) => {
  const level = String(value || "").trim().toUpperCase();
  return ["L1", "L2", "L3", "L4"].includes(level) ? level : null;
};

const normalizeSlaHours = (value) => {
  const hours = Number(value);
  if (!Number.isInteger(hours) || hours < 1 || hours > 100) return null;
  return hours;
};

// Employee-Hierarchy-and-Workflow-System_V2.pdf: "If an L1 user fails to
// meet the required submission frequency within the defined period, the
// system raises a ticket on that L1 user." Nothing in the codebase actually
// detected this before - runSubmissionFrequencyTatCheck below only
// escalates a ticket that already exists. This is the missing detection
// step: for each active config, count each tracked L1 user's submissions to
// that screen within the rolling `frequency`-day window (via
// ticketing_system.submitted_notebooks, the same table
// generateOverdueNotebookTickets reads), and raise a ticket on anyone short
// of the required `occurrences` who doesn't already have an open one.
// Value-range check for a submission-frequency config that also has input_field
// set - reuses evaluateThresholdBreach's "more_and_less_than" semantics against
// the most recently submitted value for that field, same as Value Threshold.
const checkSubmissionFrequencyValueBreach = async (config) => {
  const source = SCREEN_SUBMISSION_SOURCES[config.screen_name];
  if (!source) return null; // screen not wired to a known submission table - skip gracefully

  const latestRow = await client.query(
    `SELECT "${config.input_field}" AS field_value, "${source.dateColumn}" AS submitted_at, entry_id
     FROM ${source.table}
     WHERE "${config.input_field}" IS NOT NULL
     ORDER BY "${source.dateColumn}" DESC
     LIMIT 1`
  );

  const actualValue = latestRow.rows[0]?.field_value;
  if (actualValue === null || actualValue === undefined) return null;

  const rule = {
    condition_level: 'more_and_less_than',
    actual_value: config.actual_value,
    plus_threshold: config.plus_threshold,
    minus_threshold: config.minus_threshold
  };
  const breached = evaluateThresholdBreach(actualValue, rule);
  if (breached !== true) return null;

  const existingTicket = await client.query(
    `SELECT ticket_id FROM ticketing_system.operator_tickets
     WHERE submission_frequency_config_id = $1
       AND ticket_reason = 'THRESHOLD_BREACH'
       AND status NOT IN ('Closed', 'No Due')
     LIMIT 1`,
    [config.id]
  );
  if (existingTicket.rows[0]?.ticket_id) return null;

  const violationDetails = {
    category: 'VALUE_BREACH',
    ticket_type: 'SUBMISSION_FREQUENCY',
    screen_name: config.screen_name,
    field: config.input_field,
    actual_value: Number(actualValue),
    typical_value: config.actual_value,
    plus_threshold: config.plus_threshold,
    minus_threshold: config.minus_threshold,
    entry_id: latestRow.rows[0]?.entry_id || null,
    message: `${config.input_field} on ${config.screen_name} submitted value ${actualValue} is outside the typical range.`
  };

  const severity = deriveSeverity({ missing_fields: [], threshold_breaches: [{ deviation_percent: null }] });
  const l1TatHours = Number(config.l1_tat_hours) > 0 ? Number(config.l1_tat_hours) : null;
  const l1TatDueAt = l1TatHours ? new Date(Date.now() + l1TatHours * 60 * 60 * 1000).toISOString() : null;

  const ticketId = await generateTicketId(client);
  let ticket;
  try {
    ticket = await client.query(
      `INSERT INTO ticketing_system.operator_tickets
       (ticket_id, machine_name, parameter_name, actual_value, threshold_value,
        severity, status, created_at, management_field, erp_product_code, ticket_reason, ticket_type, ticket_kind,
        violation_details, submission_frequency_config_id, tat_current_level, l1_tat_due_at)
       VALUES (
         'TK-' || LPAD(nextval('"ticketing_system"."ticket_seq"')::text, 4, '0'),
         $1, $2::jsonb, $3::jsonb, $4::jsonb,
         $5, 'Open', NOW(), $6, $7, 'THRESHOLD_BREACH', 'SUBMISSION_FREQUENCY', 'submission_frequency',
         $8::jsonb, $9, 'L1', $10
       )
       RETURNING *`,
      [
        ticketId,
        config.screen_name,
        JSON.stringify([config.input_field]),
        JSON.stringify([Number(actualValue)]),
        JSON.stringify([{ actual_value: config.actual_value, plus_threshold: config.plus_threshold, minus_threshold: config.minus_threshold }]),
        severity,
        config.department,
        config.sub_department,
        JSON.stringify(violationDetails),
        config.id,
        l1TatDueAt
      ]
    );
  } catch (error) {
    // 23505 = operator_tickets_subfreq_breach_open_uq - another run already
    // raised this exact ticket first.
    if (error?.code !== '23505') throw error;
    return null;
  }

  const inserted = ticket.rows[0];

  const trackedUserIds = Array.isArray(config.tracked_l1_user_ids) ? config.tracked_l1_user_ids : [];
  if (trackedUserIds.length) {
    await createNotificationsForUsers(trackedUserIds, {
      ticketId: inserted.ticket_id,
      type: 'SUBMISSION_FREQUENCY',
      category: 'Tickets',
      priority: severity,
      title: `Value threshold breach: ${config.screen_name}`,
      body: violationDetails.message,
      linkUrl: `/operator-tickets/${inserted.ticket_id}`,
      payload: { ticket_id: inserted.ticket_id }
    });
  }

  return inserted;
};

// Backstops checkSubmissionFrequencyValueBreach's and this function's own
// per-user check-then-insert dedup - same reasoning as the PP/Wheel Change
// Approval unique indexes. Two separate partial indexes since the two ticket
// shapes have different dedup keys (config alone vs. config+user) and
// different ticket_reason values.
const ensureSubmissionFrequencyTicketIndexes = async () => {
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS operator_tickets_subfreq_breach_open_uq
    ON ticketing_system.operator_tickets (submission_frequency_config_id)
    WHERE ticket_type = 'SUBMISSION_FREQUENCY' AND ticket_reason = 'THRESHOLD_BREACH'
      AND status NOT IN ('Closed', 'No Due')
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS operator_tickets_subfreq_missed_open_uq
    ON ticketing_system.operator_tickets (submission_frequency_config_id, user_id)
    WHERE ticket_type = 'SUBMISSION_FREQUENCY' AND ticket_reason = 'MISSING_VALUE'
      AND status NOT IN ('Closed', 'No Due')
  `);
};

const runSubmissionFrequencyCheck = async () => {
  await ensureSubmissionFrequencyTicketIndexes();

  const configs = await client.query(
    `SELECT * FROM ticketing_system.screen_submission_frequency WHERE is_active = true`
  );

  const created = [];

  for (const config of configs.rows) {
    if (config.input_field) {
      // eslint-disable-next-line no-await-in-loop
      const valueBreachTicket = await checkSubmissionFrequencyValueBreach(config);
      if (valueBreachTicket) created.push(valueBreachTicket);
    }

    // The Submission Threshold settings screen saves one L1 user per screen
    // as approval_l1 (a display name, chosen from a dropdown - see
    // SubmissionThreshold.js), not a tracked_l1_user_ids array - that column
    // was never actually part of this table (see ensureScreenFrequencyTable
    // above). Resolving by name is what's actually configured; nobody
    // assigned means nobody to raise a ticket against.
    const assignedL1Name = String(config.approval_l1 || '').trim();
    if (!assignedL1Name) continue; // nobody configured to track for this screen yet

    // eslint-disable-next-line no-await-in-loop
    const l1UserRow = await client.query(
      `SELECT id, full_name FROM users.user_details WHERE full_name = $1 AND level = 'L1' LIMIT 1`,
      [assignedL1Name]
    );
    const l1UserId = l1UserRow.rows[0]?.id;
    if (!l1UserId) continue; // configured name doesn't match a real L1 user (renamed/removed) - nothing to assign to

    const windowDays = Number(config.range) > 0 ? Number(config.range) : 7;
    const requiredCount = Number(config.frequency) > 0 ? Number(config.frequency) : 1;

    {
      // Only evaluate fully completed days. "Every 1 day" means today's
      // submission is not judged until the day ends.
      // eslint-disable-next-line no-await-in-loop
      const submissionCount = await client.query(
        `SELECT COUNT(*) FROM ticketing_system.submitted_notebooks
         WHERE submitted_by_user_id = $1
           AND (input_screen = $2 OR notebook = $2)
           AND submitted_at >= DATE_TRUNC('day', NOW()) - ($3 || ' days')::interval
           AND submitted_at < DATE_TRUNC('day', NOW())`,
        [l1UserId, config.screen_name, windowDays]
      );
      const actualCount = Number(submissionCount.rows[0]?.count) || 0;
      if (actualCount >= requiredCount) {
        // The L1 user has since caught up in the current rolling window -
        // this only ever raised a ticket, it never had a companion "resolve
        // once fixed" step, so a since-resolved ticket would otherwise sit
        // open and keep escalating through L2-L5 regardless of whether the
        // actual problem still exists. Close any ticket still open for this
        // exact config+user now that the same measurement that flagged it
        // says it's no longer true.
        // eslint-disable-next-line no-await-in-loop
        const closedResult = await client.query(
          `UPDATE ticketing_system.operator_tickets
           SET status = 'Closed'
           WHERE submission_frequency_config_id = $1
             AND user_id = $2
             AND ticket_reason = 'MISSING_VALUE'
             AND (violation_details->>'category') = 'MISSED_FREQUENCY'
             AND status NOT IN ('Closed', 'No Due')
           RETURNING ticket_id`,
          [config.id, l1UserId]
        );
        for (const closedRow of closedResult.rows) {
          // eslint-disable-next-line no-await-in-loop
          await client.query(
            `INSERT INTO ticketing_system.ticket_logs (ticket_id, action, performed_by, role, created_at)
             VALUES ($1, 'AUTO_RESOLVED_CAUGHT_UP', 'System', 'System', NOW())`,
            [closedRow.ticket_id]
          );
        }
        continue; // eslint-disable-line no-continue
      }

      // eslint-disable-next-line no-await-in-loop
      const existingTicket = await client.query(
        `SELECT ticket_id FROM ticketing_system.operator_tickets
         WHERE submission_frequency_config_id = $1
           AND user_id = $2
           AND status NOT IN ('Closed', 'No Due')
         LIMIT 1`,
        [config.id, l1UserId]
      );
      if (existingTicket.rows[0]?.ticket_id) continue;

      // eslint-disable-next-line no-await-in-loop
      const userRow = await client.query(`SELECT full_name FROM users.user_details WHERE id = $1`, [l1UserId]);
      // No TAT-hours column exists on this config table (unlike the other
      // threshold types) - there's nothing configured to derive a due date
      // from, so this stays unset rather than inventing a default.
      const l1TatDueAt = null;
      // This ticket has no single triggering entry (it's raised over an
      // absence of submissions, not a specific one), so there's nothing to
      // point ot.violation_details->>'entry_id' at when actualCount is 0 -
      // every UI that reads that field already falls back to "-" correctly.
      // When the user is short but not at zero, surfacing their most recent
      // submission to this screen still gives L1/L2 a concrete entry to open
      // instead of always showing nothing.
      // eslint-disable-next-line no-await-in-loop
      const lastEntryRow = actualCount > 0
        ? await client.query(
            `SELECT entry_id FROM ticketing_system.submitted_notebooks
             WHERE submitted_by_user_id = $1
               AND (input_screen = $2 OR notebook = $2)
             ORDER BY submitted_at DESC
             LIMIT 1`,
            [l1UserId, config.screen_name]
          )
        : null;
      const lastEntryId = lastEntryRow?.rows?.[0]?.entry_id || null;
      const violationDetails = {
        category: 'MISSED_FREQUENCY',
        ticket_type: 'SUBMISSION_FREQUENCY',
        screen_name: config.screen_name,
        required_occurrences: requiredCount,
        actual_occurrences: actualCount,
        entry_id: lastEntryId,
        window_days: windowDays,
        message: `${config.screen_name} requires ${requiredCount} submission(s) every ${windowDays} day(s); only ${actualCount} submitted.`
      };

      // eslint-disable-next-line no-await-in-loop
      const ticketId = await generateTicketId(client);
      let inserted;
      try {
        // eslint-disable-next-line no-await-in-loop
        const ticket = await client.query(
          `INSERT INTO ticketing_system.operator_tickets
           (ticket_id, user_id, user_name, machine_name, parameter_name, actual_value, threshold_value,
            severity, status, created_at, management_field, erp_product_code, ticket_reason, ticket_type, ticket_kind,
            violation_details, approval_l1_user_ids, submission_frequency_config_id, tat_current_level, l1_tat_due_at)
           VALUES (
             $1,
             $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb,
             'Medium', 'Open', NOW(), $8, $9, 'MISSING_VALUE', 'SUBMISSION_FREQUENCY', 'submission_frequency',
             $10::jsonb, $11::int[], $12, 'L1', $13
           )
           RETURNING *`,
          [
            ticketId,
            l1UserId,
            userRow.rows[0]?.full_name || null,
            config.screen_name,
            JSON.stringify([config.screen_name]),
            JSON.stringify([actualCount]),
            JSON.stringify([{ screen_name: config.screen_name, required_occurrences: requiredCount, window_days: windowDays }]),
            config.department,
            config.sub_department,
            JSON.stringify(violationDetails),
            [l1UserId],
            config.id,
            l1TatDueAt
          ]
        );
        inserted = ticket.rows[0];
      } catch (error) {
        // 23505 = operator_tickets_subfreq_missed_open_uq - another run
        // already raised this exact ticket (same config+user) first.
        if (error?.code !== '23505') throw error;
        continue; // eslint-disable-line no-continue
      }
      created.push(inserted);

      // eslint-disable-next-line no-await-in-loop
      await createNotificationsForUsers([l1UserId], {
        ticketId: inserted.ticket_id,
        type: 'SUBMISSION_FREQUENCY',
        category: 'Tickets',
        priority: 'Medium',
        title: `Submission frequency missed: ${config.screen_name}`,
        body: violationDetails.message,
        linkUrl: `/operator-tickets/${inserted.ticket_id}`,
        payload: { ticket_id: inserted.ticket_id }
      });
    }
  }

  return created;
};

// Employee-Hierarchy-and-Workflow-System_V2.pdf: Submission Threshold should
// escalate L2 -> L3 -> L4 -> L5, same as every other threshold type - this
// previously stopped at L2 (terminal state "EXPIRED_L2"), missing L3/L4/L5
// entirely. Each due ticket's next-tier approver is resolved from its own
// submitter's real reporting chain (getManagerChain), falling back to the
// screen config's single approval_lN id only for a level the chain doesn't
// reach.
const runSubmissionFrequencyTatCheck = async () => {

  // L1->L2 is deliberately NOT auto-escalated by TAT here (unlike every
  // tier below) - a Submission Frequency ticket means "L1 missed their
  // submissions," and L1 is the one who has to actually go fix that by
  // submitting the missing notebook entries, not just wait it out. It only
  // moves to L2 for review once L1 genuinely does that and clicks Fix &
  // Submit (PUT /operator-tickets/submit/:id, which already resolves the L2
  // approver from the submitter's real reporting chain and escalates
  // correctly) - matching PP Approval/Wheel Change Approval/Acknowledgement,
  // which are all likewise driven by a real action rather than a clock.
  // This used to unconditionally bump every L1 ticket to L2 on the very next
  // check (no L1 TAT column exists on this config, so there was never a real
  // wait involved) regardless of whether L1 had done anything at all -
  // meaning the ticket was visible "at L1" for at most ~15 minutes before
  // silently jumping to L2, making it look like nothing was ever raised.

  const tiers = [
    { level: 'L2', dueColumn: 'l2_tat_due_at', nextLevel: 'L3', nextDueColumn: 'l3_tat_due_at', tatHoursColumn: 'l3_tat_hours', fallbackColumn: 'approval_l3' },
    { level: 'L3', dueColumn: 'l3_tat_due_at', nextLevel: 'L4', nextDueColumn: 'l4_tat_due_at', tatHoursColumn: 'l4_tat_hours', fallbackColumn: null },
    { level: 'L4', dueColumn: 'l4_tat_due_at', nextLevel: 'L5', nextDueColumn: 'l5_tat_due_at', tatHoursColumn: 'l5_tat_hours', fallbackColumn: null },
  ];

  const escalated = [];
  for (const tier of tiers) {
    const dueTickets = await client.query(
      `SELECT ot.*, sf.${tier.tatHoursColumn} AS next_tat_hours${tier.fallbackColumn ? `, sf.${tier.fallbackColumn} AS fallback_approver` : ''}
       FROM ticketing_system.operator_tickets ot
       JOIN ticketing_system.screen_submission_frequency sf ON sf.id = ot.submission_frequency_config_id
       WHERE ot.tat_current_level = $1
         AND ot.ticket_reason = 'MISSING_VALUE'
         AND (ot.violation_details->>'category') = 'MISSED_FREQUENCY'
         AND ot.${tier.dueColumn} IS NOT NULL
         AND ot.${tier.dueColumn} <= NOW()
         AND ot.status <> 'Closed'`,
      [tier.level]
    );

    for (const ticket of dueTickets.rows) {
      const chain = ticket.user_id ? await getManagerChain(ticket.user_id) : []; // eslint-disable-line no-await-in-loop
      const nextManager = chain.find((manager) => manager.level === tier.nextLevel);
      const fallbackId = tier.fallbackColumn ? parseTatHours(ticket.fallback_approver, null) : null;
      const nextApproverIds = nextManager ? [nextManager.id] : (fallbackId ? [fallbackId] : []);
      // Unlike L1->L2 (always has a fallback: the submitter's own manager
      // chain almost always reaches an L2, plus L2/L3 tiers have a config
      // fallback column), L3->L4 and L4->L5 have NO config fallback - if
      // getManagerChain doesn't reach that far up, advancing anyway used to
      // leave the ticket at the next tier with an EMPTY approver array,
      // invisible to literally everyone (canApproveOrRejectTicket/GET
      // /tickets both gate on being named in that array, and unlike PP
      // Approval there's no "any L4/L5 can act" carve-out here - this is
      // meant to be reporting-chain-scoped, not company-wide). Skipping the
      // advance keeps it visible to whoever already holds it at the current
      // tier and lets a later run retry once/if the chain is fixed, instead
      // of orphaning it to nobody.
      if (!nextApproverIds.length) {
        console.warn(`[submission-frequency] ${ticket.ticket_id} due to escalate ${tier.level}->${tier.nextLevel} but no approver resolved - leaving at ${tier.level}`);
        continue; // eslint-disable-line no-continue
      }
      const nextTatHours = Number(ticket.next_tat_hours) > 0 ? Number(ticket.next_tat_hours) : null;
      const nextDueAt = nextTatHours ? new Date(Date.now() + nextTatHours * 60 * 60 * 1000).toISOString() : null;

      // eslint-disable-next-line no-await-in-loop
      const result = await client.query(
        `UPDATE ticketing_system.operator_tickets
         SET tat_current_level = $1,
             approval_${tier.nextLevel.toLowerCase()}_user_ids = $2,
             ${tier.nextDueColumn} = $3
         WHERE ticket_id = $4
         RETURNING *`,
        [tier.nextLevel, nextApproverIds, nextDueAt, ticket.ticket_id]
      );
      if (result.rows[0]) escalated.push(result.rows[0]);

      // eslint-disable-next-line no-await-in-loop
      await createNotificationsForUsers(nextApproverIds, {
        ticketId: ticket.ticket_id,
        type: 'SUBMISSION_FREQUENCY',
        category: 'Tickets',
        priority: 'High',
        title: `Submission frequency missed (escalated to ${tier.nextLevel}): ${ticket.machine_name || ticket.ticket_id}`,
        body: `This ticket was not actioned at ${tier.level} in time and has escalated to ${tier.nextLevel}.`,
        linkUrl: `/supervisor-tickets/${ticket.ticket_id}`,
        payload: { ticket_id: ticket.ticket_id }
      });
    }
  }

  // L5 is terminal - nothing further to escalate to, just mark it expired
  // once its own TAT elapses.
  const result = await client.query(
    `UPDATE ticketing_system.operator_tickets ot
     SET status = 'No Due',
         tat_current_level = 'EXPIRED_L5'
     FROM ticketing_system.screen_submission_frequency sf
     WHERE sf.id = ot.submission_frequency_config_id
       AND ot.status = 'In Progress'
       AND ot.ticket_reason = 'MISSING_VALUE'
       AND (ot.violation_details->>'category') = 'MISSED_FREQUENCY'
       AND ot.tat_current_level = 'L5'
       AND sf.is_active = true
       AND ot.l5_tat_due_at IS NOT NULL
       AND ot.l5_tat_due_at <= NOW()
     RETURNING ot.ticket_id, ot.machine_name, ot.created_at`
  );

  return [...escalated, ...result.rows];
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

// Detection step (raises tickets on any tracked L1 user short of their
// required submission count) - separate from /tat/check above, which only
// escalates tickets that already exist.
router.post('/submission-frequency/check', async (req, res, next) => {
  try {
    const created = await runSubmissionFrequencyCheck();
    res.status(200).json({
      message: 'Submission frequency check completed',
      created_count: created.length,
      created_tickets: created
    });
  } catch (err) {
    next(err);
  }
});

router.get('/ticket-resolution-sla', async (req, res, next) => {
  try {
    const result = await client.query(
      `SELECT level, resolution_hours, is_active, created_at, updated_at
       FROM ticketing_system.ticket_resolution_sla
       ORDER BY CASE level WHEN 'L1' THEN 1 WHEN 'L2' THEN 2 WHEN 'L3' THEN 3 WHEN 'L4' THEN 4 ELSE 5 END`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/ticket-resolution-sla', async (req, res, next) => {
  try {
    const level = normalizeSlaLevel(req.body?.level);
    const hours = normalizeSlaHours(req.body?.resolution_hours ?? req.body?.hours);
    const isActive = req.body?.is_active === undefined ? true : Boolean(req.body.is_active);
    if (!level) return res.status(400).json({ message: 'level must be L1, L2, L3, or L4' });
    if (!hours) return res.status(400).json({ message: 'resolution_hours must be between 1 and 100' });

    const result = await client.query(
      `INSERT INTO ticketing_system.ticket_resolution_sla (level, resolution_hours, is_active, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (level)
       DO UPDATE SET resolution_hours = EXCLUDED.resolution_hours, is_active = EXCLUDED.is_active, updated_at = NOW()
       RETURNING level, resolution_hours, is_active, created_at, updated_at`,
      [level, hours, isActive]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/ticket-resolution-sla/:level/status', async (req, res, next) => {
  try {
    const level = normalizeSlaLevel(req.params.level);
    const isActive = req.body?.is_active;
    if (!level) return res.status(400).json({ message: 'level must be L1, L2, L3, or L4' });
    if (typeof isActive !== 'boolean') return res.status(400).json({ message: 'is_active must be boolean' });

    const result = await client.query(
      `UPDATE ticketing_system.ticket_resolution_sla
       SET is_active = $1, updated_at = NOW()
       WHERE level = $2
       RETURNING level, resolution_hours, is_active, created_at, updated_at`,
      [isActive, level]
    );
    if (result.rows[0]) return res.json(result.rows[0]);

    const inserted = await client.query(
      `INSERT INTO ticketing_system.ticket_resolution_sla (level, resolution_hours, is_active, updated_at)
       VALUES ($1, 24, $2, NOW())
       RETURNING level, resolution_hours, is_active, created_at, updated_at`,
      [level, isActive]
    );
    return res.json(inserted.rows[0]);
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

    const {
      screen_name,
      department = null,
      sub_department = null,
      range,
      frequency = null,
      is_active = true,
      approval_l1 = null,
      criticality = null,
    } = req.body || {};

    const normalizedRange = normalizeFrequency(range);
    const normalizedFrequency =
      frequency === null || frequency === undefined || frequency === ''
        ? null
        : Number(frequency);

    if (!screen_name || !normalizedRange) {
      return res.status(400).json({
        error: 'Invalid parameters',
        message: 'screen_name and range are required'
      });
    }

    if (
      normalizedFrequency !== null &&
      (!Number.isInteger(normalizedFrequency) || normalizedFrequency < 1)
    ) {
      return res.status(400).json({
        error: 'Invalid frequency',
        message: 'frequency must be a positive integer'
      });
    }

    const result = await client.query(
      `INSERT INTO ticketing_system.screen_submission_frequency
       (
         screen_name,
         department,
         sub_department,
         range,
         frequency,
         is_active,
         approval_l1,
         criticality,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (screen_name, department, sub_department)
       DO UPDATE SET
         range = EXCLUDED.range,
         frequency = EXCLUDED.frequency,
         is_active = EXCLUDED.is_active,
         approval_l1 = EXCLUDED.approval_l1,
         criticality = EXCLUDED.criticality,
         updated_at = NOW()
       RETURNING *`,
      [
        screen_name,
        department,
        sub_department,
        normalizedRange,
        normalizedFrequency,
        is_active,
        approval_l1,
        criticality,
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

    const result = await client.query(
      `SELECT
         id,
         screen_name,
         department,
         sub_department,
         range,
         frequency,
         is_active,
         approval_l1,
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
router.post('/submission-frequency/check', async (req, res, next) => {
  try {

    const noDueTickets = await runSubmissionFrequencyTatCheck();

    const today = new Date();
    const rows = await client.query(
      `SELECT id, screen_name, department, sub_department, range, frequency, is_active
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

      const gapDays = frequencyGapDays(config.range);
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
      const minOccurrences = Number(config.frequency || 0);

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

      skipped.push({
        screen_name: config.screen_name,
        reason: 'acknowledgement_ticket_removed'
      });
      continue;
    }

    res.status(200).json({
      message: 'Submission frequency check completed',
      created_count: createdTickets.length,
      no_due_count: noDueTickets.length,
      skipped_count: skipped.length,
      created_tickets: createdTickets,
      no_due_tickets: noDueTickets,
      skipped
    });
  } catch (err) {
    next(err);
  }
});

const getValueThresholdRuleMap = async ({
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
    `SELECT field, typical_value, plus_value, minus_value, comparison_mode, value_mode, criticality, l1_user_id, l1_user_name
     FROM ticketing_system.value_threshold_rules
     WHERE department = $1
       AND sub_department = $2
       AND notebook = $3
       AND field = ANY($4::text[])
       AND is_active = true
       AND l1_user_id IS NOT NULL
     ORDER BY id DESC`,
    [department, subDepartment, inputScreen, normalizedParameters]
  );

  const thresholdMap = {};
  for (const row of result.rows) {
    if (thresholdMap[row.field]) continue;
    // Keyed to match what evaluateThresholdBreach/analyzeViolations actually
    // read (condition_level/actual_value/plus_threshold/minus_threshold) -
    // this used to hand back the raw value_threshold_rules column names
    // (typical_value/plus_value/minus_value, no condition_level at all), so
    // evaluateThresholdBreach always read undefined thresholds and every
    // POST /operator-tickets call reported "No violations found" even for a
    // genuine breach.
    thresholdMap[row.field] = {
      actual_value: row.typical_value,
      plus_threshold: row.plus_value,
      minus_threshold: row.minus_value,
      condition_level: row.comparison_mode,
      value_mode: row.value_mode,
      criticality: row.criticality,
      l1_user_id: row.l1_user_id,
      l1_user_name: row.l1_user_name
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
    await ensureDelegationsTable();
    // Reporting-hierarchy visibility (below) walks reports_to_user_id, so make
    // sure the column exists before the recursive scope subquery references it.

    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const offset = (page - 1) * limit;
    const { status, severity, machine, start_date, end_date } = req.query;

    const where = [];
    const values = [];
    where.push(nonAcknowledgementTicketWhere);
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
    // L5 (Executive Leadership) sees every ticket system-wide, same as admin,
    // rather than only the ones that happened to reach approval_l5_user_ids.
    const canViewAllTickets =
      requesterEmployeeId === 'ADMIN001' ||
      requesterRole === 'admin' ||
      requesterRole === 'super admin' ||
      requesterRole === 'superadmin' ||
      requesterLevel === 'L5';

    // Scope by the AUTHENTICATED requester (from the JWT), never a
    // client-supplied user_id - previously this trusted req.query.user_id,
    // which the frontend never actually sent, so every non-admin viewer
    // silently got every ticket in the system with no ownership filtering
    // at all (e.g. L1 "Owned Tickets" showing everyone's tickets).
    const viewerUserId = canViewAllTickets ? null : parsePositiveInt(req.user?.id);
    if (viewerUserId) {
      values.push(viewerUserId);
      // A supervisor must see every ticket owned by anyone below them in the
      // reporting hierarchy (Owned/Mapped tabs), regardless of the ticket's
      // status (Open/In Progress/Submit) and regardless of whether its
      // approval_lN_user_ids arrays were ever populated. The reports_to_user_id
      // chain is the source of truth: this recursive subquery collects every
      // descendant of the viewer, so any ticket whose owner (the L1 operator)
      // rolls up to this viewer is visible. The approval-array and delegation
      // checks are kept as additional inclusion paths.
      where.push(`(
        ot.user_id = $${values.length}
        OR $${values.length} = ANY(COALESCE(ot.approval_l1_user_ids, ARRAY[]::int[]))
        OR $${values.length} = ANY(COALESCE(ot.approval_l2_user_ids, ARRAY[]::int[]))
        OR $${values.length} = ANY(COALESCE(ot.approval_l3_user_ids, ARRAY[]::int[]))
        OR $${values.length} = ANY(COALESCE(ot.approval_l4_user_ids, ARRAY[]::int[]))
        OR $${values.length} = ANY(COALESCE(ot.approval_l5_user_ids, ARRAY[]::int[]))
        OR ot.user_id IN (
          WITH RECURSIVE reportees AS (
            SELECT id FROM users.user_details WHERE reports_to_user_id = $${values.length}
            UNION
            SELECT u.id FROM users.user_details u
            JOIN reportees r ON u.reports_to_user_id = r.id
          )
          SELECT id FROM reportees
        )
        OR ot.user_id IN (
          SELECT owner_user_id FROM users.delegations
          WHERE delegate_user_id = $${values.length}
            AND from_date <= CURRENT_DATE
            AND to_date >= CURRENT_DATE
            AND revoked_at IS NULL
        )
      )`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Only the specific delegate and admins/L5 (canViewAllTickets) should
    // see the "Delegate" tag - other approvers who can see this ticket via
    // their own approval-list membership should not.
    const isDelegatedExpr = canViewAllTickets
      ? `ot.user_id IN (
          SELECT owner_user_id FROM users.delegations
          WHERE from_date <= CURRENT_DATE
            AND to_date >= CURRENT_DATE
            AND revoked_at IS NULL
        )`
      : viewerUserId
        ? `(ot.user_id != ${viewerUserId} AND ot.user_id IN (
            SELECT owner_user_id FROM users.delegations
            WHERE delegate_user_id = ${viewerUserId}
              AND from_date <= CURRENT_DATE
              AND to_date >= CURRENT_DATE
              AND revoked_at IS NULL
          ))`
        : 'false';

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
          ot.ticket_type,
          ot.ticket_kind,
          ot.violation_details,
          ot.violation_details->>'entry_id' AS entry_id,
          ot.tat_current_level,
          (
            SELECT string_agg(ud.full_name, ', ' ORDER BY ud.full_name)
            FROM users.user_details ud
            WHERE ud.id = ANY(COALESCE(ot.approval_l1_user_ids, ARRAY[]::int[]))
          ) AS assigned_user_names,
          (
            SELECT tl.created_at
            FROM ticketing_system.ticket_logs tl
            WHERE tl.ticket_id = ot.ticket_id
              AND UPPER(tl.action) IN ('APPROVED', 'ACKNOWLEDGED', 'SUBMITTED', 'RESUBMITTED', 'REJECTED')
            ORDER BY tl.created_at DESC
            LIMIT 1
          ) AS resolved_at,
          ${isDelegatedExpr} AS is_delegated,
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
          ot.ticket_type,
          ot.ticket_kind,
          ot.violation_details,
          ot.tat_current_level,
          ot.approval_l1_user_ids
      ORDER BY NULLIF(regexp_replace(ot.ticket_id, '\\D', '', 'g'), '')::bigint DESC, ot.created_at DESC;
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
         COUNT(*) OVER()::int AS total_count
       FROM ticketing_system.operator_tickets ot
       LEFT JOIN users.user_details ud ON ud.id = ot.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY NULLIF(regexp_replace(ot.ticket_id, '\\D', '', 'g'), '')::bigint DESC, ot.created_at DESC
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

// PP_BATCH_INCOMPLETE tickets - the frontend has called this exact path
// (getProcessParameterTickets in operatorApi.js) since before this route
// existed, silently 404ing every time and leaving the Process Parameter tab
// on both the operator dashboard and SupervisorDashboard's L1 view always
// empty. Mirrors /submission-ticketing's shape/filters/pagination, scoped by
// the same viewer-visibility rule as the base '/' route (admin/L5 see
// everything, everyone else only tickets naming them as an approver at some
// level or as the ticket's owner).
router.get('/process-parameter-ticketing', async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const offset = (page - 1) * limit;

    const status = String(req.query.status || '').trim();
    const severity = String(req.query.severity || '').trim();
    const startDate = String(req.query.start_date || '').trim();
    const endDate = String(req.query.end_date || '').trim();

    const values = [];
    const where = [`ot.ticket_type = 'PP_BATCH_INCOMPLETE'`];

    if (status && status.toLowerCase() !== 'all') {
      values.push(status);
      where.push(`ot.status = $${values.length}`);
    }
    if (severity && severity.toLowerCase() !== 'all') {
      values.push(severity);
      where.push(`ot.severity = $${values.length}`);
    }
    if (startDate) {
      values.push(startDate);
      where.push(`ot.created_at::date >= $${values.length}::date`);
    }
    if (endDate) {
      values.push(endDate);
      where.push(`ot.created_at::date <= $${values.length}::date`);
    }

    const requesterEmployeeId = String(req.user?.employee_id || '').trim().toUpperCase();
    const requesterRole = String(req.user?.role || '').trim().toLowerCase();
    const requesterLevel = String(req.user?.level || '').trim().toUpperCase();
    const canViewAllTickets =
      requesterEmployeeId === 'ADMIN001' ||
      requesterRole === 'admin' ||
      requesterRole === 'super admin' ||
      requesterRole === 'superadmin' ||
      requesterLevel === 'L5';

    const viewerUserId = canViewAllTickets ? null : parsePositiveInt(req.user?.id);
    if (viewerUserId) {
      values.push(viewerUserId);
      where.push(`(
        ot.user_id = $${values.length}
        OR $${values.length} = ANY(COALESCE(ot.approval_l1_user_ids, ARRAY[]::int[]))
        OR $${values.length} = ANY(COALESCE(ot.approval_l2_user_ids, ARRAY[]::int[]))
        OR $${values.length} = ANY(COALESCE(ot.approval_l3_user_ids, ARRAY[]::int[]))
        OR $${values.length} = ANY(COALESCE(ot.approval_l4_user_ids, ARRAY[]::int[]))
        OR $${values.length} = ANY(COALESCE(ot.approval_l5_user_ids, ARRAY[]::int[]))
        OR ot.user_id IN (
          SELECT owner_user_id FROM users.delegations
          WHERE delegate_user_id = $${values.length}
            AND from_date <= CURRENT_DATE
            AND to_date >= CURRENT_DATE
            AND revoked_at IS NULL
        )
      )`);
    }

    values.push(limit);
    const limitIndex = values.length;
    values.push(offset);
    const offsetIndex = values.length;

    const result = await client.query(
      `SELECT
         ot.ticket_id,
         ot.machine_name,
         ot.parameter_name,
         ot.severity,
         ot.status,
         ot.created_at,
         ot.tat_current_level,
         ot.violation_details,
         ot.violation_details->>'entry_id' AS entry_id,
         ot.violation_details->>'first_created_at' AS entry_created_at,
         ot.approval_l1_user_ids,
         ot.approval_l2_user_ids,
         ot.approval_l3_user_ids,
         ot.approval_l4_user_ids,
         ot.approval_l5_user_ids,
         (
           -- Whoever is assigned to actually resolve/approve it at the tier
           -- it's sitting at right now (PP escalates L1 -> L4 directly), not
           -- always L1's original assignees - once it's at L4, the L1 names
           -- are no longer who owns the next action on it.
           SELECT string_agg(ud.full_name, ', ' ORDER BY ud.full_name)
           FROM users.user_details ud
           WHERE ud.id = ANY(COALESCE(
             CASE UPPER(COALESCE(ot.tat_current_level, 'L1'))
               WHEN 'L2' THEN ot.approval_l2_user_ids
               WHEN 'L3' THEN ot.approval_l3_user_ids
               WHEN 'L4' THEN ot.approval_l4_user_ids
               WHEN 'L5' THEN ot.approval_l5_user_ids
               ELSE ot.approval_l1_user_ids
             END,
             ARRAY[]::int[]
           ))
         ) AS assigned_user_names,
         (
           SELECT MAX(v.value::numeric)
           FROM jsonb_each_text(COALESCE(ot.violation_details->'screen_thresholds', '{}'::jsonb)) v
         ) AS completion_time_provided_hours,
         GREATEST(
           0,
           EXTRACT(EPOCH FROM (NOW() - NULLIF(ot.violation_details->>'first_created_at', '')::timestamptz)) / 3600
         )::numeric(10,1) AS time_lagged_hours,
         resolution_log.resolved_at,
         COUNT(*) OVER()::int AS total_count
       FROM ticketing_system.operator_tickets ot
       LEFT JOIN LATERAL (
         -- ACTUAL RES TIME is when the ticket was last actually actioned -
         -- this route (PP tickets specifically) never selected it at all, so
         -- every PP ticket showed "--:--" for Actual Res Time and Resolution
         -- Gap regardless of whether L1 had submitted it, matching the same
         -- fix already applied to /supervisor-tickets/tickets.
         SELECT tl.created_at AS resolved_at
         FROM ticketing_system.ticket_logs tl
         WHERE tl.ticket_id = ot.ticket_id
           AND UPPER(tl.action) IN ('APPROVED', 'ACKNOWLEDGED', 'SUBMITTED', 'RESUBMITTED', 'REJECTED')
         ORDER BY tl.created_at DESC
         LIMIT 1
       ) resolution_log ON true
       WHERE ${where.join(' AND ')}
       ORDER BY NULLIF(regexp_replace(ot.ticket_id, '\\D', '', 'g'), '')::bigint DESC, ot.created_at DESC
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
    const ticketId = await resolveStoredTicketId(String(req.params.id || '').trim());
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
       WHERE ot.ticket_id = $1
         AND ${nonAcknowledgementTicketWhere}`,
      [ticketId]
    );
    if (!ticketRes.rows.length) return res.status(404).json({ message: 'Ticket not found' });
    let ticket = ticketRes.rows[0];

    // Open/Reopened -> In Progress happens the moment someone actually opens
    // the ticket's own detail page - this timeline endpoint is the one call
    // every detail-page load makes unconditionally (unlike the ticket-by-id
    // fetch, which is skipped whenever the ticket's already in the caller's
    // local list), so it's the reliable place to record "viewed." This only
    // touches status, not tat_current_level - Fix & Resubmit still shows
    // correctly off tat_current_level='L1', independent of this status text.
    if (['open', 'reopened'].includes(String(ticket.status || '').trim().toLowerCase())) {
      const viewedResult = await client.query(
        `UPDATE ticketing_system.operator_tickets SET status = 'In Progress' WHERE ticket_id = $1 RETURNING status`,
        [ticketId]
      );
      ticket = { ...ticket, status: viewedResult.rows[0]?.status || 'In Progress' };
    }

    const logRes = await client.query(
      `SELECT action, performed_by, role, created_at
       FROM ticketing_system.ticket_logs
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
      [ticketId]
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

    // Only include events that actually happened - this used to fill gaps with
    // invented sample copy ("vibration sensor", "Maintenance Team A (Technician:
    // Surya Prakash)", a canned bearing/lubricant comment) whenever there was no
    // real ticket_logs row or violation_details comment yet, which showed fabricated
    // history on every ticket that hadn't been touched since creation.
    const timeline = [
      {
        at: ticket.created_at,
        title: 'Ticket Created',
        detail: `Ticket raised for ${ticket.machine_name || ticket.user_name || 'the assigned owner'}`
      }
    ];

    if (assignedLog) {
      timeline.push({
        at: assignedLog.created_at,
        title: 'Assigned',
        detail: assignedLog.performed_by
          ? `Ticket assigned by ${assignedLog.performed_by}`
          : 'Ticket assigned'
      });
    }

    if (submittedLog || l1Comment) {
      timeline.push({
        at: submittedLog?.created_at || ticket.created_at,
        title: 'L1 Comment',
        detail: l1Comment || `Ticket ${String(submittedLog?.action || '').toLowerCase() || 'updated'} by L1`
      });
    }

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
    const ticketId = await resolveStoredTicketId(req.params.id); // accept alphanumeric IDs

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
          ot.ticket_type,
          ot.ticket_kind,
          ot.violation_details,
          ot.violation_details->>'entry_id' AS entry_id,
          ot.tat_current_level,
          (
            SELECT string_agg(ud.full_name, ', ' ORDER BY ud.full_name)
            FROM users.user_details ud
            WHERE ud.id = ANY(COALESCE(ot.approval_l1_user_ids, ARRAY[]::int[]))
          ) AS assigned_user_names

      FROM ticketing_system.operator_tickets ot
      WHERE ot.ticket_id = $1
        AND ${nonAcknowledgementTicketWhere};
    `;

    const result = await client.query(query, [ticketId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const ticket = result.rows[0];
    // Live, not the frozen-at-creation snapshot - so the operator sees which
    // departments are ACTUALLY still missing right now, including any they
    // (or another department) already fixed and saved since this ticket was
    // raised or last submitted.
    if (ticket.ticket_kind === 'pp_batch' || ticket.ticket_type === 'PP_BATCH_INCOMPLETE') {
      const { getPpBatchCompletionForEntryId } = require('./submittedNotebooks.routes');
      const { completedScreens, missingScreens } = await getPpBatchCompletionForEntryId(ticket.entry_id);
      ticket.violation_details = {
        ...(ticket.violation_details || {}),
        completed_screens: completedScreens,
        missing_screens: missingScreens,
      };
    }

    res.status(200).json(ticket);
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
// Backstops this route's own check-then-insert dedup (the "same entry
// re-triggering the same breach" guard below, a few hundred lines down) -
// same reasoning as the PP/Wheel Change Approval unique indexes. Scoped to
// rows that actually supplied entry_id, matching that guard's own
// `if (normalizedEntryId)` condition - callers without one intentionally get
// no dedup at all today, so this shouldn't start enforcing one for them.
const ensureValueThresholdTicketIndex = async () => {
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS operator_tickets_value_threshold_open_uq
    ON ticketing_system.operator_tickets (machine_name, (violation_details->>'entry_id'))
    WHERE ticket_type = 'VALUE_THRESHOLD' AND status <> 'Closed'
      AND NULLIF(violation_details->>'entry_id', '') IS NOT NULL
  `);
};

router.post('/', async (req, res, next) => {
  try {
    await ensureValueThresholdTicketIndex();
    const {
      user_id,
      user_name,
      machine_name,
      parameter_name,
      actual_value,
      threshold_value,
      department,
      sub_department,
      input_screen,
      management_field,
      erp_product_code,
      entry_id
    } = req.body;

    const normalizedParameterNames = normalizeParameterNames(parameter_name);
    // Backward-compat alias: older runtime snapshots may still reference this identifier.
    const normalizedParameterNamesAll = normalizedParameterNames;
    const normalizedActualValue = parseMaybeJsonObject(actual_value);
    const normalizedEntryId = String(entry_id || '').trim() || null;
    const normalizedThresholdValue = parseMaybeJsonObject(threshold_value);

    if (!machine_name || !parameter_name || !actual_value) {
      return res.status(400).json({ message: 'All fields are required' });
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

    const masterThresholds = await getValueThresholdRuleMap({
      department: department || management_field,
      subDepartment: sub_department || erp_product_code,
      inputScreen: input_screen,
      machineName: machine_name,
      parameterName: normalizedParameterNames
    });

    const effectiveThresholds = masterThresholds;
    const l1UserIds = Array.from(new Set(
      Object.values(masterThresholds)
        .map((rule) => Number(rule.l1_user_id))
        .filter((id) => Number.isInteger(id) && id > 0)
    ));
    const approvalL1UserIds = l1UserIds;
    const escalationChain = await resolveTicketEscalationChain(assignedUserId, {
      l2: approvalL1UserIds,
      l3: []
    });
    const approvalL2UserIds = escalationChain.l2;
    const approvalL3UserIds = escalationChain.l3;
    const approvalL4UserIds = escalationChain.l4;
    const approvalL5UserIds = escalationChain.l5;

    if (!effectiveThresholds || !Object.keys(effectiveThresholds).length) {
      return res.status(400).json({
        message: 'No active value threshold found for this constraint'
      });
    }

    const { ticketReason, violationDetails } = analyzeViolations(
      normalizedParameterNames,
      normalizedActualValue,
      effectiveThresholds
    );

    if (!ticketReason) {
      return res.status(400).json({
        message: 'No violations found. Ticket requires null actual values or threshold breaches.'
      });
    }

    // Same entry re-triggering the same breach (double submit, retry, accidental
    // double-click) must not raise a second ticket - only when the caller
    // actually supplied entry_id, since older callers without it fall back to
    // no dedupe rather than colliding on machine_name/parameter_name alone
    // (which would wrongly merge two genuinely different entries).
    if (normalizedEntryId) {
      const existingTicket = await client.query(
        `SELECT ticket_id FROM ticketing_system.operator_tickets
         WHERE ticket_type = 'VALUE_THRESHOLD'
           AND machine_name = $1
           AND (violation_details->>'entry_id') = $2
           AND status <> 'Closed'
         LIMIT 1`,
        [machine_name, normalizedEntryId]
      );
      if (existingTicket.rows[0]?.ticket_id) {
        return res.status(200).json({
          message: 'Ticket already open for this entry',
          ticket: { ticket_id: existingTicket.rows[0].ticket_id }
        });
      }
    }

    const severity = deriveSeverity(violationDetails);

    const ticketId = await generateTicketId(client);
    const insertQuery = `
      INSERT INTO ticketing_system.operator_tickets
      (ticket_id, user_id, user_name, machine_name, parameter_name, actual_value, threshold_value, severity, status, created_at, management_field, erp_product_code, ticket_reason, ticket_type, ticket_kind, violation_details, approval_l1_user_ids, approval_l2_user_ids, approval_l3_user_ids, approval_l4_user_ids, approval_l5_user_ids)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Open', CURRENT_TIMESTAMP, $9, $10, $11, 'VALUE_THRESHOLD', 'value_threshold', $12::jsonb, $13::int[], $14::int[], $15::int[], $16::int[], $17::int[])
      RETURNING *;
    `;

    let result;
    try {
      result = await client.query(insertQuery, [
        ticketId,
        assignedUserId,
        assignedUserName,
        machine_name,
        JSON.stringify(normalizedParameterNames),
        JSON.stringify(normalizedActualValue),
        JSON.stringify(effectiveThresholds),
        severity,
        management_field || null,
        erp_product_code || null,
        ticketReason,
        JSON.stringify({ ...violationDetails, entry_id: normalizedEntryId }),
        approvalL1UserIds,
        approvalL2UserIds,
        approvalL3UserIds,
        approvalL4UserIds,
        approvalL5UserIds
      ]);
    } catch (error) {
      // 23505 = operator_tickets_value_threshold_open_uq - lost a race with
      // another request that inserted this exact entry_id's ticket first.
      if (error?.code !== '23505') throw error;
      const winner = await client.query(
        `SELECT ticket_id FROM ticketing_system.operator_tickets
         WHERE ticket_type = 'VALUE_THRESHOLD' AND machine_name = $1 AND (violation_details->>'entry_id') = $2 AND status <> 'Closed'
         LIMIT 1`,
        [machine_name, normalizedEntryId]
      );
      return res.status(200).json({
        message: 'Ticket already open for this entry',
        ticket: { ticket_id: winner.rows[0]?.ticket_id }
      });
    }

    const ticket = result.rows[0];
    const approverLevels = [
      { level: 'L1', userIds: approvalL1UserIds },
      { level: 'L2', userIds: approvalL2UserIds },
      { level: 'L3', userIds: approvalL3UserIds },
      { level: 'L4', userIds: approvalL4UserIds },
      { level: 'L5', userIds: approvalL5UserIds }
    ];
    await createTicketNotificationsForApprovers(
      ticket.ticket_id,
      { machineName: ticket.machine_name, parameterName: normalizedParameterNames?.join?.(', ') || normalizedParameterNames },
      approverLevels
    );
    await createThresholdBreachNotifications(ticket, approverLevels, violationDetails);

    res.locals.activityDescription = `Created ticket ${ticket.ticket_id} for ${machine_name} — ${ticketReason || 'threshold violation'}`;
    res.locals.activityMetadata = { ticket_id: ticket.ticket_id, machine_name, severity };

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
        severity: _severity,
        department = null,
        sub_department = null,
        input_screen = null,
        management_field = null,
        erp_product_code = null,
        entry_id = null
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

      const masterThresholds = await getValueThresholdRuleMap({
        department: department || management_field,
        subDepartment: sub_department || erp_product_code,
        inputScreen: input_screen,
        machineName: machine_name,
        parameterName: normalizedParameterNames
      });

      const effectiveThresholds = masterThresholds;
    const approvalL1UserIds = Array.from(new Set(
      Object.values(masterThresholds)
        .map((rule) => Number(rule.l1_user_id))
        .filter((id) => Number.isInteger(id) && id > 0)
    ));
    const escalationChain = await resolveTicketEscalationChain(assignedUserId, {
      l2: approvalL1UserIds,
      l3: []
    });
      const approvalL2UserIds = escalationChain.l2;
      const approvalL3UserIds = escalationChain.l3;
      const approvalL4UserIds = escalationChain.l4;
      const approvalL5UserIds = escalationChain.l5;
      if (!effectiveThresholds) {
        skipped.push({
          machine_name,
          parameter_name,
          reason: 'threshold_missing',
          message: 'No active value threshold found for this constraint'
        });
        continue;
      }

      const { ticketReason, violationDetails: analyzedViolationDetails } = analyzeViolations(
        normalizedParameterNames,
        normalizedActualValue,
        effectiveThresholds
      );
      const violationDetails = { ...analyzedViolationDetails, entry_id: entry_id || null };

      if (!ticketReason) {
        skipped.push({
          machine_name,
          parameter_name,
          reason: 'no_violation',
          message: 'Actual values did not violate configured thresholds'
        });
        continue;
      }
      const severity = deriveSeverity(violationDetails);

      const ticketId = await generateTicketId(client);
      const result = await client.query(
        `INSERT INTO ticketing_system.operator_tickets
         (ticket_id, user_id, user_name, machine_name, parameter_name, actual_value, threshold_value, severity, status, created_at, management_field, erp_product_code, ticket_reason, ticket_type, ticket_kind, violation_details, approval_l1_user_ids, approval_l2_user_ids, approval_l3_user_ids, approval_l4_user_ids, approval_l5_user_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Open', CURRENT_TIMESTAMP, $9, $10, $11, 'VALUE_THRESHOLD', 'value_threshold', $12::jsonb, $13::int[], $14::int[], $15::int[], $16::int[], $17::int[])
         RETURNING *;`,
        [
          ticketId,
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
          approvalL4UserIds,
          approvalL5UserIds
        ]
      );

      const bulkApproverLevels = [
        { level: 'L1', userIds: approvalL1UserIds },
        { level: 'L2', userIds: approvalL2UserIds },
        { level: 'L3', userIds: approvalL3UserIds },
        { level: 'L4', userIds: approvalL4UserIds },
        { level: 'L5', userIds: approvalL5UserIds }
      ];
      await createTicketNotificationsForApprovers(
        result.rows[0].ticket_id,
        { machineName: result.rows[0].machine_name, parameterName: normalizedParameterNames?.join?.(', ') || normalizedParameterNames },
        bulkApproverLevels
      );
      await createThresholdBreachNotifications(result.rows[0], bulkApproverLevels, violationDetails);
      generated.push(result.rows[0]);
    }

    await client.query('COMMIT');

    res.locals.activityDescription = `Generated ${generated.length} ticket(s) in bulk (${tickets.length - generated.length} skipped)`;
    res.locals.activityMetadata = { generated_count: generated.length, skipped_count: tickets.length - generated.length };

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
    const { department, sub_department, notebook, input_screen, field, l1_user_id, status } = req.query;
    const where = [];
    const values = [];

    if (department) {
      values.push(department);
      where.push(`vt.department = $${values.length}`);
    }
    if (sub_department) {
      values.push(sub_department);
      where.push(`vt.sub_department = $${values.length}`);
    }
    // input_screen is accepted as an alias for notebook - createOperatorTicket
    // (POST /operator-tickets) reads it as body.input_screen, while this list
    // endpoint historically only recognized `notebook`. thresholdTicketing.js's
    // createThresholdViolationTickets() calls this endpoint with input_screen,
    // which silently matched nothing here, so the notebook filter was skipped
    // entirely and thresholds from OTHER notebooks in the same sub-department
    // (matched only by normalized field-name text) leaked into the client-side
    // violation check - producing a "violation" the stricter, correctly-scoped
    // getValueThresholdRuleMap() then rejected with "No active value threshold
    // found for this constraint".
    const notebookFilter = notebook || input_screen;
    if (notebookFilter) {
      values.push(notebookFilter);
      where.push(`vt.notebook = $${values.length}`);
    }
    if (field) {
      values.push(field);
      where.push(`vt.field = $${values.length}`);
    }
    if (l1_user_id) {
      values.push(Number(l1_user_id));
      where.push(`vt.l1_user_id = $${values.length}`);
    }
    if (status && ['active', 'inactive'].includes(String(status).toLowerCase())) {
      values.push(String(status).toLowerCase() === 'active');
      where.push(`vt.is_active = $${values.length}`);
    }

    const sql = `
      SELECT
        vt.id,
        vt.department,
        vt.sub_department,
        vt.notebook,
        vt.field,
        vt.l1_user_id,
        vt.approval_l1_user_ids,
        vt.l1_user_name,
        vt.criticality,
        vt.comparison_mode,
        vt.typical_value,
        vt.value_mode,
        vt.plus_value,
        vt.minus_value,
        vt.is_active,
        vt.created_at,
        vt.updated_at
      FROM ticketing_system.value_threshold_rules vt
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY vt.id DESC
    `;

    const result = await client.query(sql, values);
    res.status(200).json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/thresholds', async (req, res, next) => {
  try {
    rejectLegacyThresholdL2Fields(req.body || {});
    const result = await upsertValueThresholdRule(req.body || {});
    res.status(201).json({
      message: 'Value threshold saved successfully',
      threshold: result
    });
  } catch (err) {
    next(err);
  }
});

// The Value Threshold settings screen (ThresholdValues.js) has always called
// these three for edit/status-toggle/delete, but none of them were ever
// actually built here - only list/create/bulk-create existed - so every
// edit, activate/deactivate, or delete action on an existing Value Threshold
// row has been failing with 404 since the screen was first built. Mirrors
// the same COALESCE-partial-update pattern already used for Submission
// Frequency's equivalent three routes below.
router.patch('/thresholds/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    rejectLegacyThresholdL2Fields(body);

    const department = body.department !== undefined ? pickDropdownValue(body.department) : undefined;
    const subDepartment = body.sub_department !== undefined || body.subDepartment !== undefined
      ? pickDropdownValue(body.sub_department ?? body.subDepartment)
      : undefined;
    // The Value Threshold form (ThresholdValues.js) submits input_screen/input_field/
    // actual_value/plus_threshold/minus_threshold - the same external names the create
    // route (POST /thresholds/bulk) accepts - not the internal notebook/field/
    // typical_value/plus_value/minus_value column names this route used to require
    // exclusively. Since none of those internal names were ever actually sent, every
    // edit's typical value/tolerances/field/notebook silently no-opped (COALESCE just
    // kept the existing row unchanged) while the edit still reported success.
    const notebook = (body.notebook ?? body.input_screen ?? body.inputScreen ?? body.screen ?? body.screen_name) !== undefined
      ? pickDropdownValue(body.notebook ?? body.input_screen ?? body.inputScreen ?? body.screen ?? body.screen_name)
      : undefined;
    const field = (body.field ?? body.input_field ?? body.inputField ?? body.field_name ?? body.fieldName) !== undefined
      ? pickDropdownValue(body.field ?? body.input_field ?? body.inputField ?? body.field_name ?? body.fieldName)
      : undefined;
    const criticality = (body.criticality ?? body.severity ?? body.priority) !== undefined
      ? pickDropdownValue(body.criticality ?? body.severity ?? body.priority)
      : undefined;
    const comparisonMode = (body.comparison_operator ?? body.comparisonOperator ?? body.condition_level ?? body.conditionLevel ?? body.comparison) !== undefined
      ? normalizeComparisonMode(body.comparison_operator ?? body.comparisonOperator ?? body.condition_level ?? body.conditionLevel ?? body.comparison)
      : undefined;
    const valueMode = (body.value_mode ?? body.valueMode) !== undefined
      ? normalizeThresholdMode(body.value_mode ?? body.valueMode)
      : undefined;
    const typicalValue = (body.typical_value ?? body.typicalValue ?? body.actual_value ?? body.actualValue) !== undefined
      ? String(body.typical_value ?? body.typicalValue ?? body.actual_value ?? body.actualValue).trim()
      : undefined;
    const plusValue = (body.plus_value ?? body.plusValue ?? body.plus_threshold ?? body.plusThreshold) !== undefined
      ? toNumericIfPossible(body.plus_value ?? body.plusValue ?? body.plus_threshold ?? body.plusThreshold)
      : undefined;
    const minusValue = (body.minus_value ?? body.minusValue ?? body.minus_threshold ?? body.minusThreshold) !== undefined
      ? toNumericIfPossible(body.minus_value ?? body.minusValue ?? body.minus_threshold ?? body.minusThreshold)
      : undefined;
    const rawL1UserIds = body.approval_l1_user_ids ?? body.approvalL1UserIds;
    const l1UserIds = Array.isArray(rawL1UserIds)
      ? rawL1UserIds.map((value) => parsePositiveInt(value)).filter(Boolean)
      : undefined;
    const l1UserId = (body.l1_user_id ?? body.l1UserId) !== undefined
      ? parsePositiveInt(body.l1_user_id ?? body.l1UserId)
      : l1UserIds?.[0];
    let l1UserName = body.l1_user_name !== undefined || body.l1UserName !== undefined
      ? pickDropdownValue(body.l1_user_name ?? body.l1UserName)
      : undefined;
    if (l1UserId && !l1UserName) {
      const l1User = await getUserById(l1UserId);
      l1UserName = l1User?.full_name || l1User?.name || l1User?.employee_id || null;
    }
    const isActive = typeof body.is_active === 'boolean' ? body.is_active : undefined;

    const result = await client.query(
      `UPDATE ticketing_system.value_threshold_rules
       SET department = COALESCE($1, department),
           sub_department = COALESCE($2, sub_department),
           notebook = COALESCE($3, notebook),
           field = COALESCE($4, field),
           l1_user_id = COALESCE($5, l1_user_id),
           approval_l1_user_ids = COALESCE($6, approval_l1_user_ids),
           l1_user_name = COALESCE($7, l1_user_name),
           criticality = COALESCE($8, criticality),
           comparison_mode = COALESCE($9, comparison_mode),
           typical_value = COALESCE($10, typical_value),
           value_mode = COALESCE($11, value_mode),
           plus_value = COALESCE($12, plus_value),
           minus_value = COALESCE($13, minus_value),
           is_active = COALESCE($14, is_active),
           updated_at = NOW()
       WHERE id = $15
       RETURNING *`,
      [
        department, subDepartment, notebook, field,
        l1UserId, l1UserIds, l1UserName, criticality,
        comparisonMode, typicalValue, valueMode, plusValue, minusValue,
        isActive, id
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Value threshold not found' });
    }

    res.status(200).json({
      message: 'Value threshold updated successfully',
      threshold: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/thresholds/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body || {};

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ message: 'is_active must be boolean' });
    }

    const result = await client.query(
      `UPDATE ticketing_system.value_threshold_rules
       SET is_active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [is_active, id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Value threshold not found' });
    }

    res.status(200).json({
      message: `Value threshold ${is_active ? 'activated' : 'deactivated'} successfully`,
      threshold: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/thresholds/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await client.query(
      `DELETE FROM ticketing_system.value_threshold_rules
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Value threshold not found' });
    }

    res.status(200).json({
      message: 'Value threshold deleted successfully',
      threshold: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/submission-frequency/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      screen_name,
      department,
      sub_department,
      range,
      frequency,
      is_active,
      approval_l1,
      criticality,
    } = req.body || {};

    const normalizedRange =
      range === undefined ? undefined : normalizeFrequency(range);

    if (range !== undefined && !normalizedRange) {
      return res.status(400).json({ message: 'range must be a positive integer' });
    }

    const normalizedFrequency =
      frequency === undefined
        ? undefined
        : frequency === null || frequency === ''
          ? null
          : Number(frequency);
    if (
      normalizedFrequency !== undefined &&
      normalizedFrequency !== null &&
      (!Number.isInteger(normalizedFrequency) || normalizedFrequency < 1)
    ) {
      return res.status(400).json({ message: 'frequency must be a positive integer' });
    }
    const result = await client.query(
      `UPDATE ticketing_system.screen_submission_frequency
       SET screen_name = COALESCE($1, screen_name),
           department = COALESCE($2, department),
           sub_department = COALESCE($3, sub_department),
           range = COALESCE($4, range),
           frequency = COALESCE($5, frequency),
           is_active = COALESCE($6, is_active),
           approval_l1 = COALESCE($7, approval_l1),
           criticality = COALESCE($8, criticality),
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        screen_name,
        department,
        sub_department,
        normalizedRange,
        normalizedFrequency,
        is_active,
        approval_l1,
        criticality,
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
    const { id } = req.params;

    // operator_tickets.submission_frequency_config_id is a real FK into this
    // table, so any ticket ever raised from this config (even a long-closed
    // one) blocks the DELETE below outright with a foreign-key-violation
    // 500 - this used to try the DELETE first and only close referencing
    // tickets afterward, meaning a config that had ever fired even once
    // could never actually be deleted. Closing and detaching the reference
    // first (any ticket that hasn't already been "wrapped up" some other
    // way is settled here - the config it tracked no longer exists) clears
    // the FK before the DELETE runs.
    await client.query(
      `UPDATE ticketing_system.operator_tickets
       SET status = 'Closed', submission_frequency_config_id = NULL
       WHERE submission_frequency_config_id = $1`,
      [id]
    );

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
      plus_threshold ?? plusThreshold,
      minus_threshold ?? minusThreshold,
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
        message: 'department, sub_department, input_screen, machine_name, input_field, plus_threshold and minus_threshold are required'
      });
    }

    const result = await upsertValueThresholdRule({
      department: departmentValue,
      sub_department: subDepartmentValue,
      notebook: inputScreenValue,
      field: inputFieldValue,
      l1_user_id: approvalL1UserIds[0] || null,
      approval_l1_user_ids: approvalL1UserIds,
      criticality: conditionLevelValue,
      typical_value: actualValueFinal,
      value_mode: String(req.body?.value_mode || req.body?.valueMode || 'Number'),
      plus_value: plusThresholdFinal,
      minus_value: minusThresholdFinal,
      is_active,
    });

    await notifyThresholdApprovers({
      thresholdId: result.id,
      machineName: machine_name,
      inputField: inputFieldValue,
      department: departmentValue,
      subDepartment: subDepartmentValue,
      levels: [
        { level: 'L1', userIds: approvalL1UserIds },
        { level: 'L2', userIds: approvalL2UserIds },
        { level: 'L3', userIds: approvalL3UserIds }
      ]
    });

    res.locals.activityDescription = `Created threshold for ${machine_name} — ${inputFieldValue} (${departmentValue}/${subDepartmentValue})`;
    res.locals.activityMetadata = { threshold_id: result.id, machine_name, input_field: inputFieldValue };

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
      rejectLegacyThresholdL2Fields(item);
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
        criticality,
        severity,
        priority,
        plus_threshold,
        plusThreshold,
        minus_threshold,
        minusThreshold,
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
        plus_threshold ?? plusThreshold ?? threshold ?? value,
        minus_threshold ?? minusThreshold ?? threshold ?? value,
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
        const err = new Error('Each threshold must include department, sub_department, input_screen, machine_name, input_field, plus_threshold, minus_threshold');
        err.statusCode = 400;
        throw err;
      }

      const savedRow = await upsertValueThresholdRule({
        department: departmentValue,
        sub_department: subDepartmentValue,
        notebook: inputScreenValue,
        field: inputFieldValue,
        l1_user_id: approvalL1UserIds[0] || null,
        approval_l1_user_ids: approvalL1UserIds,
        // Was wrongly set to conditionLevelValue (the comparison mode, e.g.
        // "more_and_less_than") - every ticket raised off a bulk-saved rule
        // showed Low criticality regardless of what was actually selected in
        // the Value Threshold form, since deriveSeverity's rank lookup on
        // "more_and_less_than" always misses and falls back to the deviation
        // heuristic. criticality/severity/priority are the same field sent
        // three ways by the frontend (see thresholdItems.push in
        // ThresholdValues.js) - none of them were ever read here.
        criticality: pickDropdownValue(criticality ?? severity ?? priority),
        comparison_operator: conditionLevelValue,
        typical_value: actualValueFinal,
        value_mode: String(item?.value_mode || item?.valueMode || 'Number'),
        plus_value: plusThresholdFinal,
        minus_value: minusThresholdFinal,
        is_active,
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
      rejectLegacyThresholdL2Fields(rawRow);
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

      const savedRow = await upsertValueThresholdRule({
        department,
        sub_department,
        notebook: input_screen,
        field: input_field,
        l1_user_id: approvalL1UserIds[0] || null,
        approval_l1_user_ids: approvalL1UserIds,
        criticality: condition_level,
        typical_value: actual_value,
        value_mode: String(rawRow.value_mode || rawRow.valueMode || 'Number'),
        plus_value: plus_threshold,
        minus_value: minus_threshold,
        is_active,
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
    const ticketId = await resolveStoredTicketId(req.params.id);
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ message: 'user_id is required' });
    }

    const user = await getUserById(user_id);
    if (!user) {
      return res.status(404).json({ message: 'Assigned user not found' });
    }

    const ticketResult = await client.query(
      `UPDATE ticketing_system.operator_tickets
       SET user_id = $1, user_name = $2
       WHERE ticket_id = $3
       RETURNING *`,
      [user.id, user.full_name, ticketId]
    );

    if (!ticketResult.rowCount) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.status(200).json({
      message: 'Ticket assigned successfully',
      ticket: ticketResult.rows[0]
    });
  } catch (err) {
    next(err);
  }
});

const updateOperatorTicketStatusHandler = async (req, res, next) => {
  try {
    const ticketId = await resolveStoredTicketId(String(req.params.id || req.body?.ticket_id || req.body?.ticketId || '').trim());
    const status = normalizeTicketStatusInput(req.body?.status || req.body?.ticket_status || req.body?.ticketStatus);

    if (!ticketId) return res.status(400).json({ message: 'ticketId is required' });
    if (!status) {
      return res.status(400).json({
        message: 'Valid status is required',
        allowed_statuses: ['Open', 'In Progress', 'Closed', 'Reopened']
      });
    }

    const updated = await client.query(
      `UPDATE ticketing_system.operator_tickets ot
       SET status = $2
       WHERE ot.ticket_id = $1
         AND ${nonAcknowledgementTicketWhere}
       RETURNING *`,
      [ticketId, status]
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

    const ticketId = await resolveStoredTicketId(req.params.id);
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
       WHERE ot.ticket_id = $1
         AND ${nonAcknowledgementTicketWhere}`,
      [ticketId]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];

    const normalizedStatus = String(ticket.status || '').trim().toLowerCase();

    if (!['open', 'reopened', 'in progress'].includes(normalizedStatus)) {
      return res.status(400).json({
        message: 'Only Open, Reopened, or In Progress tickets can be submitted'
      });
    }

    // L1 submitting is what actually escalates the ticket. PP Entry Threshold
    // tickets (PP_BATCH_INCOMPLETE) have no L2/L3 configured anywhere in PP
    // Thresholds - only L1 and L4 - matching the same pattern as PP Approval,
    // Wheel Change Approval, and Acknowledgement, which all escalate straight
    // to L4 too. Every other ticket type keeps going to L2 (manually
    // configured approval_l2_user_ids first, then the submitter's real
    // reporting-chain L2 manager). Previously this only set status='Submit'
    // and left tat_current_level at 'L1' forever, so the ticket kept showing
    // the L1 Fix & Resubmit action instead of the next level's review action.
    const isPpBatchTicket = ticket.ticket_kind === 'pp_batch' || ticket.ticket_type === 'PP_BATCH_INCOMPLETE';

    let nextLevel;
    let nextApproverIds;
    // Refreshed completed/missing screens for a PP batch ticket, merged into
    // violation_details below - null for every other ticket kind (nothing to
    // refresh).
    let refreshedPpScreens = null;
    if (isPpBatchTicket) {
      const { getPpNotebookThresholds, getPpBatchCompletionForEntryId } = require('./submittedNotebooks.routes');
      const notebookThresholds = await getPpNotebookThresholds();
      const entryId = ticket.violation_details?.entry_id;
      const { completedScreens, missingScreens } = await getPpBatchCompletionForEntryId(entryId);
      refreshedPpScreens = { completed_screens: completedScreens, missing_screens: missingScreens };
      // Only the screens the operator was actually asked to fix (the ticket's
      // original overdue set) decide who reviews next - a screen that was
      // already missing but hadn't hit its own threshold yet when this
      // ticket was raised shouldn't newly pull in its L4 approver here.
      const overdueScreens = Array.isArray(ticket.violation_details?.overdue_screens) && ticket.violation_details.overdue_screens.length
        ? ticket.violation_details.overdue_screens
        : Array.isArray(ticket.parameter_name) ? ticket.parameter_name : [];
      const l4Set = new Set();
      for (const label of overdueScreens) {
        const notebookRow = notebookThresholds.get(label);
        (Array.isArray(notebookRow?.approval_l4_user_ids) ? notebookRow.approval_l4_user_ids : [])
          .forEach((id) => l4Set.add(Number(id)));
      }
      nextLevel = 'L4';
      nextApproverIds = Array.from(l4Set).filter((id) => Number.isInteger(id) && id > 0);
    } else {
      const fallbackL2Ids = Array.isArray(ticket.approval_l2_user_ids) ? ticket.approval_l2_user_ids : [];
      const hierarchyL2Ids = ticket.user_id
        ? (await getManagerChain(ticket.user_id)).filter((manager) => String(manager.level || '').trim().toUpperCase() === 'L2').map((manager) => manager.id)
        : [];
      nextLevel = 'L2';
      nextApproverIds = Array.from(new Set([...fallbackL2Ids, ...hierarchyL2Ids].map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)));
    }
    const updateResult = await client.query(
      `UPDATE ticketing_system.operator_tickets
       SET status = 'Submit',
           tat_current_level = $3,
           approval_l2_user_ids = CASE WHEN $3 = 'L2' THEN $4::int[] ELSE approval_l2_user_ids END,
           approval_l4_user_ids = CASE WHEN $3 = 'L4' THEN $4::int[] ELSE approval_l4_user_ids END,
           violation_details =
             COALESCE(violation_details, '{}'::jsonb)
             || CASE WHEN $2::text IS NULL OR btrim($2::text) = '' THEN '{}'::jsonb ELSE jsonb_build_object('operator_comment', $2::text) END
             || $5::jsonb
       WHERE ticket_id = $1
       RETURNING *`,
      [ticketId, operatorComment, nextLevel, nextApproverIds, JSON.stringify(refreshedPpScreens || {})]
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

    await client.query(
      `INSERT INTO ticketing_system.ticket_approvals (ticket_id, level, action_status, performed_by, role)
       VALUES ($1, 'L1', $2, $3, $4)`,
      [
        ticketId,
        normalizedStatus === 'reopened' ? 'Resubmitted' : 'Submitted',
        req.user?.full_name || req.user?.employee_id || 'Operator',
        req.user?.role || 'Operator'
      ]
    );
    await client.query(
      `INSERT INTO ticketing_system.ticket_approvals (ticket_id, level, action_status)
       VALUES ($1, $2, 'Pending')`,
      [ticketId, nextLevel]
    );

    if (nextApproverIds.length) {
      await createNotificationsForUsers(nextApproverIds, {
        ticketId,
        type: `TICKET_SUBMITTED_TO_${nextLevel}`,
        category: 'Tickets',
        priority: 'High',
        title: `Ticket submitted for ${nextLevel} review - ${ticketId}`,
        body: `${ticket.user_name || ticket.user_id || 'An L1 user'} submitted ticket ${ticketId}.`,
        linkUrl: `/operator-tickets/${ticketId}`,
        payload: { ticket_id: ticketId, level: 'L2' }
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

router.get('/:id/approvals', async (req, res, next) => {
  try {
    const ticketId = await resolveStoredTicketId(req.params.id);

    const result = await client.query(
      `SELECT ticket_id, level, action_status, performed_by, role, created_at
       FROM ticketing_system.ticket_approvals
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
      [ticketId]
    );

    res.status(200).json({ ticket_id: ticketId, approvals: result.rows });
  } catch (err) {
    next(err);
  }
});

// Approval queue for threshold tickets. The same ticket_approvals pattern is
// used at L2/L3/L4/L5, so the frontend can request the queue for the current
// supervisor level and get one row per approval-cycle entry.
const getApprovalQueue = async (req, res, next) => {
  try {

    const levelFilter = String(req.query.level || 'L2').trim().toUpperCase();
    const statusFilter = String(req.query.status || '').trim();
    const severityFilter = String(req.query.severity || '').trim();
    const machineFilter = String(req.query.machine || '').trim();

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 25, 1);
    const offset = (page - 1) * limit;

    const values = [];
    const where = [
      // This queue is for the L1 -> L2 -> L3... hierarchy-chain ticket types
      // only (Value Threshold, Submission Frequency) - PP Batch/PP Approval/
      // Wheel Change/Acknowledgement escalate straight L1 -> L4 and are
      // already served by their own dedicated feeds. This used to compare
      // against the literal string 'THRESHOLD', which only matched legacy
      // rows where ticket_type had never been set (COALESCE defaulted it to
      // 'THRESHOLD') - once ticket_type started being populated for real as
      // 'VALUE_THRESHOLD'/'SUBMISSION_FREQUENCY', that comparison stopped
      // matching anything and this endpoint silently returned zero rows for
      // every real ticket, hiding the entire L2-L5 approval queue.
      `COALESCE(ot.ticket_type, 'VALUE_THRESHOLD') IN ('VALUE_THRESHOLD', 'SUBMISSION_FREQUENCY', 'THRESHOLD')`,
      nonAcknowledgementTicketWhere
    ];

    if (statusFilter && statusFilter.toLowerCase() !== 'all') {
      values.push(statusFilter);
      where.push(`ta.action_status = $${values.length}`);
    } else if (!statusFilter) {
      // Default to just the row actually awaiting action at this level. A
      // reject -> resubmit cycle leaves the old row UPDATEd to 'Rejected'
      // (see the reject handler) plus a brand-new 'Pending' row from the
      // resubmit - both are legitimate history, but this queue represents
      // "what does this level need to act on right now," so surfacing every
      // past cycle's row here duplicated the same ticket on screen. Explicit
      // ?status=all still returns full history for anywhere that wants it.
      where.push(`ta.action_status = 'Pending'`);
    }

    if (severityFilter && severityFilter.toLowerCase() !== 'all') {
      values.push(severityFilter);
      where.push(`ot.severity = $${values.length}`);
    }

    if (machineFilter && machineFilter.toLowerCase() !== 'all') {
      values.push(machineFilter);
      where.push(`ot.machine_name = $${values.length}`);
    }

    // Scope the queue to the reporting-manager approver for this level. Each
    // ticket's approval_lN_user_ids is resolved from the L1 user's reporting
    // chain (getManagerChain) at creation/escalation time, so a plain L2/L3/L4
    // approver must only see the tickets whose matching-level approver list
    // includes them - otherwise every L2 sees every L2 ticket. Admin / full
    // access users (and L5, the top authority) keep the unscoped view.
    const requesterEmployeeId = String(req.user?.employee_id || '').trim().toUpperCase();
    const requesterRole = String(req.user?.role || '').trim().toLowerCase();
    const requesterLevel = String(req.user?.level || '').trim().toUpperCase();
    const canViewAllApprovals =
      requesterEmployeeId === 'ADMIN001' ||
      /^ADMIN\s*0*\d+$/.test(requesterEmployeeId) ||
      ['admin', 'super admin', 'superadmin'].includes(requesterRole) ||
      requesterLevel === 'L5';

    // L5 (and admin) get the unscoped queue across every level - the
    // frontend's "Mapped" tab for L5 always sends level=L5, but L5 is meant
    // to oversee every level's tickets, not just the ones that literally
    // reached the L5 approval stage. A plain L2/L3/L4 approver still only
    // sees their own level's queue.
    if (!canViewAllApprovals) {
      values.push(levelFilter);
      where.push(`ta.level = $${values.length}`);
    }

    const approverColumnByLevel = {
      L2: 'approval_l2_user_ids',
      L3: 'approval_l3_user_ids',
      L4: 'approval_l4_user_ids',
      L5: 'approval_l5_user_ids'
    };
    const approverColumn = approverColumnByLevel[levelFilter];
    const requesterUserId = parsePositiveInt(req.user?.id);
    if (!canViewAllApprovals && approverColumn && requesterUserId) {
      values.push(requesterUserId);
      where.push(`$${values.length} = ANY(COALESCE(ot.${approverColumn}, ARRAY[]::int[]))`);
    }

    values.push(limit);
    const limitIndex = values.length;
    values.push(offset);
    const offsetIndex = values.length;

    const result = await client.query(
      `SELECT
         ta.id AS approval_row_id,
         ta.ticket_id,
         ta.level,
         ta.action_status,
         ta.performed_by,
         ta.role,
         ta.created_at AS approval_created_at,
         ot.user_id,
         ot.user_name,
         ot.machine_name,
         ot.parameter_name,
         ot.actual_value,
         ot.threshold_value,
         ot.severity,
         ot.status AS ticket_status,
         ot.created_at AS ticket_created_at,
         ot.tat_current_level,
         ot.violation_details->>'entry_id' AS entry_id,
         ot.approval_l1_user_ids,
         ot.approval_l2_user_ids,
         ot.approval_l3_user_ids,
         ot.approval_l4_user_ids,
         ot.approval_l5_user_ids,
         resolution_log.resolved_at,
         COUNT(*) OVER()::int AS total_count
       FROM ticketing_system.ticket_approvals ta
       JOIN ticketing_system.operator_tickets ot ON ot.ticket_id = ta.ticket_id
       LEFT JOIN LATERAL (
         -- Same "Actual Res Time" source as the main ticket list
         -- (supervisorTickets.routes.js) - the last submit/approve/reject/
         -- acknowledge action logged for this ticket - so Value/Submission
         -- Frequency tickets in the L2+ approval queue show a real resolution
         -- time too instead of always "--:--".
         SELECT tl.created_at AS resolved_at
         FROM ticketing_system.ticket_logs tl
         WHERE tl.ticket_id = ot.ticket_id
           AND UPPER(tl.action) IN ('APPROVED', 'ACKNOWLEDGED', 'SUBMITTED', 'RESUBMITTED', 'REJECTED')
         ORDER BY tl.created_at DESC
         LIMIT 1
       ) resolution_log ON true
       WHERE ${where.join(' AND ')}
       ORDER BY ta.created_at DESC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values
    );

    const rows = result.rows;
    const totalCount = rows[0]?.total_count || 0;

    res.status(200).json({
      approvals: rows,
      pagination: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        itemsPerPage: limit
      }
    });
  } catch (err) {
    next(err);
  }
};

router.get('/approvals/queue', getApprovalQueue);
router.get('/approvals/l2-queue', async (req, res, next) => {
  req.query = { ...req.query, level: 'L2' };
  return getApprovalQueue(req, res, next);
});

module.exports = router;
module.exports.runSubmissionFrequencyTatCheck = runSubmissionFrequencyTatCheck;
module.exports.runSubmissionFrequencyCheck = runSubmissionFrequencyCheck;

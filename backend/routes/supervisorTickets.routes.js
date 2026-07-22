const express = require('express');
const router = express.Router();
const client = require('../connection');
const auth = require('../middleware/auth');
const { createNotification, ensureNotificationMetadataColumns } = require('../utils/notifications');

const parsePositiveInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
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

const nonAcknowledgementTicketWhere = `NOT (
  ot.ticket_reason = 'MISSING_VALUE'
  AND (ot.violation_details->>'category') = 'MISSED_FREQUENCY'
  AND COALESCE(ot.violation_details->>'ticket_type', '') IN ('SUBMISSION_ACKNOWLEDGEMENT', 'NOTEBOOK_ACK_OVERDUE')
)`;
const acknowledgementTicketWhere = `(
  ot.ticket_reason = 'MISSING_VALUE'
  AND (ot.violation_details->>'category') = 'MISSED_FREQUENCY'
  AND COALESCE(ot.violation_details->>'ticket_type', '') IN ('SUBMISSION_ACKNOWLEDGEMENT', 'NOTEBOOK_ACK_OVERDUE')
)`;

// L1 entry operator, L2 supervisor, L3 sub manager, L4 Quality/Dept Head,
// L5 Admin/MD - the reviewer/stage levels this ticketing API recognizes.
const REVIEW_LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5'];
const isReviewLevel = (value) => REVIEW_LEVELS.includes(value);

const isAdminUser = (req) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  return role === 'admin' || role === 'super admin' || role === 'superadmin';
};

const ensureSupervisorAssignmentsTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users.supervisor_assignments (
      id bigserial PRIMARY KEY,
      supervisor_user_id integer NOT NULL REFERENCES users.user_details(id) ON DELETE CASCADE,
      employee_user_id integer NOT NULL REFERENCES users.user_details(id) ON DELETE CASCADE,
      is_active boolean NOT NULL DEFAULT true,
      assigned_at timestamptz NOT NULL DEFAULT now(),
      assigned_by integer REFERENCES users.user_details(id),
      UNIQUE (supervisor_user_id, employee_user_id)
    )
  `);
};

const getUserIdByEmployeeCode = async (employeeIdCode) => {
  const code = String(employeeIdCode || '').trim();
  if (!code) return null;
  const result = await client.query(
    `SELECT id FROM users.user_details WHERE employee_id = $1`,
    [code]
  );
  return result.rows[0]?.id || null;
};

const resolveUserId = async ({ userId, employeeCode }) => {
  const fromId = parsePositiveInt(userId);
  if (fromId) return fromId;
  const fromCode = await getUserIdByEmployeeCode(employeeCode);
  return fromCode || null;
};

router.use(auth);

let operatorTicketApprovalColumnsReady = false;
let operatorTicketApprovalColumnsPromise = null;

const runEnsureOperatorTicketApprovalColumns = async () => {
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
    ADD COLUMN IF NOT EXISTS approval_l4_user_ids integer[] NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
    ADD COLUMN IF NOT EXISTS approval_l5_user_ids integer[] NULL
  `);
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
    ADD COLUMN IF NOT EXISTS ticket_type varchar(50) NULL
  `);
};

const ensureOperatorTicketApprovalColumns = async () => {
  if (operatorTicketApprovalColumnsReady) return;

  if (!operatorTicketApprovalColumnsPromise) {
    operatorTicketApprovalColumnsPromise = runEnsureOperatorTicketApprovalColumns()
      .then(() => {
        operatorTicketApprovalColumnsReady = true;
      })
      .finally(() => {
        operatorTicketApprovalColumnsPromise = null;
      });
  }

  return operatorTicketApprovalColumnsPromise;
};

const ensureNotificationRecipientColumn = async () => {
  await ensureNotificationMetadataColumns();
};

const canApproveOrRejectTicket = (req, ticket) => {
  if (isAdminUser(req)) return true;
  const requesterId = parsePositiveInt(req.user?.id);
  if (!requesterId) return false;

  const allReviewerIds = REVIEW_LEVELS.flatMap((level) => {
    const ids = ticket[`approval_${level.toLowerCase()}_user_ids`];
    return Array.isArray(ids) ? ids : [];
  });
  return allReviewerIds.includes(requesterId);
};

const getPrivilegedSupervisorAccess = async (req) => {
  if (isAdminUser(req)) return true;

  const tokenEmployeeId = String(req.user?.employee_id || '').trim().toUpperCase();
  if (tokenEmployeeId === 'ADMIN001') return true;

  const requesterId = parsePositiveInt(req.user?.id);
  if (!requesterId) return false;

  const result = await client.query(
    `SELECT COALESCE(role, '') AS role, COALESCE(employee_id, '') AS employee_id
     FROM users.user_details
     WHERE id = $1`,
    [requesterId]
  );
  const row = result.rows[0] || {};
  const role = String(row.role || '').trim().toLowerCase();
  const employeeId = String(row.employee_id || '').trim().toUpperCase();
  return role === 'admin' || role === 'super admin' || role === 'superadmin' || employeeId === 'ADMIN001';
};

const getRequesterEmployeeId = async (req) => {
  const tokenEmployeeId = String(req.user?.employee_id || '').trim().toUpperCase();
  if (tokenEmployeeId) return tokenEmployeeId;

  const requesterId = parsePositiveInt(req.user?.id);
  if (!requesterId) return '';

  const result = await client.query(
    `SELECT COALESCE(employee_id, '') AS employee_id
     FROM users.user_details
     WHERE id = $1`,
    [requesterId]
  );
  return String(result.rows[0]?.employee_id || '').trim().toUpperCase();
};

const getReviewerLevel = async (req) => {
  const tokenLevel = String(req.user?.level || '').trim().toUpperCase();
  if (isReviewLevel(tokenLevel)) return tokenLevel;

  const requesterId = parsePositiveInt(req.user?.id);
  if (!requesterId) return null;

  const result = await client.query(
    `SELECT COALESCE(level, '') AS level
     FROM users.user_details
     WHERE id = $1`,
    [requesterId]
  );
  const level = String(result.rows[0]?.level || '').trim().toUpperCase();
  return isReviewLevel(level) ? level : null;
};

const getTicketIdFromRequest = (req) =>
  String(
    req.query?.ticketId ??
    req.query?.ticket_id ??
    req.body?.ticketId ??
    req.body?.ticket_id ??
    req.params?.ticketId ??
    ''
  ).trim();

const jsonbToDisplayText = (col) => `
  CASE
    WHEN ${col} IS NULL THEN NULL
    WHEN jsonb_typeof(${col}) = 'string' THEN trim(both '"' from ${col}::text)
    ELSE ${col}::text
  END
`;

const normalizeJsonFields = (value) => {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) {
    return value.map((fieldValue, index) => ({
      name: String(index + 1),
      value: fieldValue
    }));
  }
  if (typeof value !== 'object') {
    return [{
      name: 'value',
      value
    }];
  }
  return Object.entries(value).map(([name, fieldValue]) => ({
    name,
    value: fieldValue
  }));
};

const parseMaybeJson = (value) => {
  if (value === null || value === undefined || value === '') return value;
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

const firstDisplayValue = (value) => {
  const parsed = parseMaybeJson(value);
  if (parsed === null || parsed === undefined || parsed === '') return null;
  if (Array.isArray(parsed)) return parsed.map(firstDisplayValue).filter((item) => item !== null).join(', ') || null;
  if (typeof parsed !== 'object') return parsed;

  const entries = Object.entries(parsed);
  if (!entries.length) return null;
  const first = entries[0][1];
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    const candidate = first.value ?? first.actual_value ?? first.actualValue ?? first.threshold_value ?? first.thresholdValue;
    return candidate ?? JSON.stringify(first);
  }
  return first;
};

const buildThresholdDisplay = (value) => {
  const parsed = parseMaybeJson(value);
  if (parsed === null || parsed === undefined || parsed === '') return null;
  if (typeof parsed !== 'object' || Array.isArray(parsed)) return firstDisplayValue(parsed);

  const parts = [];
  for (const rule of Object.values(parsed)) {
    if (rule && typeof rule === 'object' && !Array.isArray(rule)) {
      const plus = rule.plus_threshold ?? rule.plusThreshold;
      const minus = rule.minus_threshold ?? rule.minusThreshold;
      const direct = rule.threshold_value ?? rule.thresholdValue ?? rule.value;
      if (plus !== null && plus !== undefined && minus !== null && minus !== undefined) {
        parts.push(`+${plus} / -${minus}`);
      } else if (plus !== null && plus !== undefined) {
        parts.push(plus);
      } else if (minus !== null && minus !== undefined) {
        parts.push(minus);
      } else if (direct !== null && direct !== undefined) {
        parts.push(direct);
      }
    } else if (rule !== null && rule !== undefined && rule !== '') {
      parts.push(rule);
    }
  }
  return parts.length ? parts.join(', ') : null;
};

const buildStandardDisplay = (value) => {
  const parsed = parseMaybeJson(value);
  if (parsed === null || parsed === undefined || parsed === '') return null;
  if (typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const parts = [];
  for (const rule of Object.values(parsed)) {
    if (rule && typeof rule === 'object' && !Array.isArray(rule)) {
      const standard = rule.actual_value ?? rule.actualValue ?? rule.standard_value ?? rule.standardValue ?? rule.standard;
      if (standard !== null && standard !== undefined && standard !== '') parts.push(standard);
    }
  }
  return parts.length ? parts.join(', ') : null;
};

const addTicketValueAliases = (ticket) => {
  const actual = firstDisplayValue(ticket.actual_value_json ?? ticket.actual_value);
  const standard = buildStandardDisplay(ticket.threshold_value_json ?? ticket.threshold_value);
  const threshold = buildThresholdDisplay(ticket.threshold_value_json ?? ticket.threshold_value);
  const { actual_value_json, threshold_value_json, ...publicTicket } = ticket;
  return {
    ...publicTicket,
    actual,
    actual_display: actual,
    standard,
    standard_value: standard,
    standard_display: standard,
    threshold,
    threshold_display: threshold
  };
};

const isAcknowledgementReviewTicket = (ticket = {}) =>
  String(ticket.ticket_reason || '').trim().toUpperCase() === 'MISSING_VALUE' &&
  String(ticket.violation_details?.category || '').trim().toUpperCase() === 'MISSED_FREQUENCY' &&
  ['SUBMISSION_ACKNOWLEDGEMENT', 'NOTEBOOK_ACK_OVERDUE'].includes(
    String(ticket.violation_details?.ticket_type || '').trim().toUpperCase()
  );

const canViewTicketAsReviewer = async (req, ticket, requiredLevel = null) => {
  const canViewAll = await getPrivilegedSupervisorAccess(req);
  if (canViewAll) return true;

  const requesterId = parsePositiveInt(req.user?.id);
  if (!requesterId) return false;
  const reviewerLevel = await getReviewerLevel(req);
  if (requiredLevel && reviewerLevel !== requiredLevel) return false;

  const reviewerIds = requiredLevel
    ? (ticket[`approval_${requiredLevel.toLowerCase()}_user_ids`] || [])
    : REVIEW_LEVELS.flatMap((level) => ticket[`approval_${level.toLowerCase()}_user_ids`] || []);

  return Array.isArray(reviewerIds) && reviewerIds.includes(requesterId);
};

router.get('/tickets', async (req, res, next) => {
  try {
    await ensureOperatorTicketApprovalColumns();
    await ensureNotificationRecipientColumn();

    const requesterId = parsePositiveInt(req.user?.id);
    if (!requesterId) return res.status(401).json({ message: 'Authentication required' });

    const canViewAll = await getPrivilegedSupervisorAccess(req);
    const reviewerLevel = await getReviewerLevel(req);
    const requesterEmployeeId = await getRequesterEmployeeId(req);
    const isAdmin001 = requesterEmployeeId === 'ADMIN001';
    const requestedStage = String(req.query.stage || req.query.level || '').trim().toUpperCase();
    const stageFilter = isReviewLevel(requestedStage)
      ? requestedStage
      : (reviewerLevel || 'L2');

    const statusFilter = String(req.query.status || '').trim();
    const severityFilter = String(req.query.severity || '').trim();
    const machineFilter = String(req.query.machine || '').trim();
    const startDate = String(req.query.start_date || '').trim();
    const endDate = String(req.query.end_date || '').trim();

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 25, 1);
    const offset = (page - 1) * limit;

    const where = [];
    const values = [];
    if (!canViewAll) {
      where.push(stageFilter !== 'L1'
        ? `(${nonAcknowledgementTicketWhere} OR ${acknowledgementTicketWhere})`
        : nonAcknowledgementTicketWhere);
    }

    // ADMIN001/admin users should see every L1-L5 ticket irrespective of stage or assignee.
    const applyStageFilter = !canViewAll && !isAdmin001 && isReviewLevel(stageFilter);
    if (applyStageFilter) {
      values.push(stageFilter);
      where.push(stageFilter !== 'L1'
        ? `(${acknowledgementTicketWhere} OR COALESCE(ot.tat_current_level, 'L1') = $${values.length})`
        : `COALESCE(ot.tat_current_level, 'L1') = $${values.length}`);
      if (stageFilter === 'L1') {
        where.push(`NOT (
          ot.ticket_reason = 'MISSING_VALUE'
          AND (ot.violation_details->>'category') = 'MISSED_FREQUENCY'
        )`);
      }
    }

    if (statusFilter && statusFilter.toLowerCase() !== 'all') {
      values.push(statusFilter);
      where.push(`ot.status = $${values.length}`);
    }

    if (severityFilter && severityFilter.toLowerCase() !== 'all') {
      values.push(severityFilter);
      where.push(`ot.severity = $${values.length}`);
    }

    if (machineFilter && machineFilter.toLowerCase() !== 'all') {
      values.push(machineFilter);
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

    if (!canViewAll) {
      values.push(requesterId);
      where.push(`(${REVIEW_LEVELS.map((level) => `$${values.length} = ANY(COALESCE(ot.approval_${level.toLowerCase()}_user_ids, ARRAY[]::int[]))`).join(' OR ')})`);
    }

    values.push(limit);
    const limitIndex = values.length;
    values.push(offset);
    const offsetIndex = values.length;

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const result = await client.query(
      `SELECT
         ot.ticket_id,
         ot.user_id,
         ot.user_name,
         ot.machine_name,
         ot.management_field,
         ot.erp_product_code,
         COALESCE(NULLIF(TRIM(ot.erp_product_code), ''), NULLIF(TRIM(ot.management_field), '')) AS sub_department,
         ${jsonbToDisplayText('ot.parameter_name')} AS parameter_name,
         ${jsonbToDisplayText('ot.actual_value')} AS actual_value,
         ${jsonbToDisplayText('ot.threshold_value')} AS threshold_value,
         ot.actual_value AS actual_value_json,
         ot.threshold_value AS threshold_value_json,
         ot.severity,
         ot.status,
         COALESCE(ot.ticket_type, 'THRESHOLD') AS ticket_type,
         ot.approval_l1_user_ids,
         ot.approval_l2_user_ids,
         ot.approval_l3_user_ids,
         ot.approval_l4_user_ids,
         ot.approval_l5_user_ids,
         COALESCE(l2_approvers.users, '[]'::json) AS l2_approvers,
         COALESCE(l3_approvers.users, '[]'::json) AS l3_approvers,
         COALESCE(l4_approvers.users, '[]'::json) AS l4_approvers,
         COALESCE(l5_approvers.users, '[]'::json) AS l5_approvers,
         CASE WHEN ${acknowledgementTicketWhere} THEN true ELSE false END AS is_acknowledgement_review,
         CASE WHEN ${acknowledgementTicketWhere} THEN 'ACKNOWLEDGE' ELSE 'APPROVE_REJECT' END AS action_mode,
         CASE WHEN ${acknowledgementTicketWhere} THEN '/api/supervisor-tickets/tickets/acknowledge?ticketId=' || ot.ticket_id ELSE NULL END AS acknowledge_endpoint,
         COALESCE(ot.tat_current_level, 'L1') AS tat_current_level,
         ot.l1_tat_due_at,
         ot.l2_tat_due_at,
         ot.l3_tat_due_at,
         ot.l4_tat_due_at,
         ot.l5_tat_due_at,
         ot.created_at,
         COUNT(*) OVER()::int AS total_count
       FROM ticketing_system.operator_tickets ot
       LEFT JOIN LATERAL (
         SELECT json_agg(
           json_build_object(
             'id', u.id,
             'employee_id', u.employee_id,
             'full_name', u.full_name,
             'level', u.level
           )
           ORDER BY u.full_name, u.id
         ) AS users
         FROM users.user_details u
         WHERE u.id = ANY(COALESCE(ot.approval_l2_user_ids, ARRAY[]::int[]))
       ) l2_approvers ON true
       LEFT JOIN LATERAL (
         SELECT json_agg(
           json_build_object(
             'id', u.id,
             'employee_id', u.employee_id,
             'full_name', u.full_name,
             'level', u.level
           )
           ORDER BY u.full_name, u.id
         ) AS users
         FROM users.user_details u
         WHERE u.id = ANY(COALESCE(ot.approval_l3_user_ids, ARRAY[]::int[]))
       ) l3_approvers ON true
       LEFT JOIN LATERAL (
         SELECT json_agg(
           json_build_object(
             'id', u.id,
             'employee_id', u.employee_id,
             'full_name', u.full_name,
             'level', u.level
           )
           ORDER BY u.full_name, u.id
         ) AS users
         FROM users.user_details u
         WHERE u.id = ANY(COALESCE(ot.approval_l4_user_ids, ARRAY[]::int[]))
       ) l4_approvers ON true
       LEFT JOIN LATERAL (
         SELECT json_agg(
           json_build_object(
             'id', u.id,
             'employee_id', u.employee_id,
             'full_name', u.full_name,
             'level', u.level
           )
           ORDER BY u.full_name, u.id
         ) AS users
         FROM users.user_details u
         WHERE u.id = ANY(COALESCE(ot.approval_l5_user_ids, ARRAY[]::int[]))
       ) l5_approvers ON true
       ${whereClause}
       ORDER BY ot.created_at DESC
       LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values
    );

    const tickets = result.rows.map(addTicketValueAliases);
    const totalCount = result.rows[0]?.total_count || 0;
    return res.status(200).json({
      stage: stageFilter,
      tickets,
      data: tickets,
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

router.get('/tickets/:id/l2-preview', async (req, res, next) => {
  try {
    await ensureOperatorTicketApprovalColumns();
    await ensureNotificationRecipientColumn();

    const ticketId = String(req.params.id || '').trim();
    if (!ticketId) return res.status(400).json({ message: 'ticketId is required' });

    const result = await client.query(
      `SELECT
         ot.*,
         COALESCE(owner.full_name, ot.user_name) AS submitted_by_name,
         owner.employee_id AS submitted_by_employee_id,
         COALESCE(notifications.items, '[]'::json) AS notifications
       FROM ticketing_system.operator_tickets ot
       LEFT JOIN LATERAL (
         SELECT full_name, employee_id
         FROM users.user_details
         WHERE id = ot.user_id
         ORDER BY id
         LIMIT 1
       ) owner ON true
       LEFT JOIN LATERAL (
         SELECT json_agg(
           DISTINCT jsonb_build_object(
             'notification_id', n.notification_id,
             'notification_type', n.notification_type,
             'status', n.status,
             'sent_at', n.sent_at,
             'recipient_user_id', n.recipient_user_id
           )
         ) AS items
         FROM ticketing_system.notifications n
         WHERE n.ticket_id = ot.ticket_id
       ) notifications ON true
       WHERE ot.ticket_id = $1
         AND (${nonAcknowledgementTicketWhere} OR ${acknowledgementTicketWhere})`,
      [ticketId]
    );

    if (!result.rows.length) return res.status(404).json({ message: 'Ticket not found' });
    const ticket = result.rows[0];
    const isAcknowledgementReview = isAcknowledgementReviewTicket(ticket);

    if (!await canViewTicketAsReviewer(req, ticket, isAcknowledgementReview ? null : 'L2')) {
      return res.status(403).json({ message: 'You are not authorized to view this L2 preview' });
    }

    const logs = await client.query(
      `SELECT action, performed_by, role, created_at
       FROM ticketing_system.ticket_logs
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
      [ticketId]
    );

    const valueAliases = addTicketValueAliases(ticket);

    return res.status(200).json({
      ticket_id: ticket.ticket_id,
      status: ticket.status,
      stage: ticket.tat_current_level || 'L2',
      notebook: ticket.machine_name,
      department: ticket.management_field,
      sub_department: ticket.erp_product_code,
      submitted_by: {
        user_id: ticket.user_id,
        name: ticket.submitted_by_name,
        employee_id: ticket.submitted_by_employee_id
      },
      submitted_at: ticket.created_at,
      actual_value: ticket.actual_value,
      threshold_value: ticket.threshold_value,
      submitted_fields: normalizeJsonFields(ticket.actual_value),
      parameters: normalizeJsonFields(ticket.parameter_name),
      threshold_fields: normalizeJsonFields(ticket.threshold_value),
      actual: valueAliases.actual,
      actual_value_display: valueAliases.actual_display,
      standard: valueAliases.standard,
      standard_value: valueAliases.standard_value,
      standard_value_display: valueAliases.standard_display,
      threshold: valueAliases.threshold,
      threshold_value_display: valueAliases.threshold_display,
      value_summary: {
        actual: valueAliases.actual,
        standard: valueAliases.standard,
        threshold: valueAliases.threshold
      },
      violation_details: ticket.violation_details || null,
      approval: {
        l1_user_ids: ticket.approval_l1_user_ids || [],
        l2_user_ids: ticket.approval_l2_user_ids || [],
        l3_user_ids: ticket.approval_l3_user_ids || [],
        l4_user_ids: ticket.approval_l4_user_ids || [],
        l5_user_ids: ticket.approval_l5_user_ids || [],
        action_mode: isAcknowledgementReview ? 'ACKNOWLEDGE' : 'APPROVE_REJECT',
        acknowledge_endpoint: isAcknowledgementReview ? `/api/supervisor-tickets/tickets/acknowledge?ticketId=${encodeURIComponent(ticket.ticket_id)}` : null,
        approve_endpoint: isAcknowledgementReview ? null : `/api/supervisor-tickets/tickets/approve?ticketId=${encodeURIComponent(ticket.ticket_id)}`,
        reject_endpoint: isAcknowledgementReview ? null : `/api/supervisor-tickets/tickets/reject?ticketId=${encodeURIComponent(ticket.ticket_id)}`
      },
      timeline: logs.rows,
      notifications: ticket.notifications || []
    });
  } catch (error) {
    next(error);
  }
});

router.get('/tickets/timeline/graph', async (req, res, next) => {
  try {
    await ensureOperatorTicketApprovalColumns();

    const requesterId = parsePositiveInt(req.user?.id);
    if (!requesterId) return res.status(401).json({ message: 'Authentication required' });

    const canViewAll = await getPrivilegedSupervisorAccess(req);
    const reviewerLevel = await getReviewerLevel(req);
    const requesterEmployeeId = await getRequesterEmployeeId(req);
    const isAdmin001 = requesterEmployeeId === 'ADMIN001';
    const requestedStage = String(req.query.stage || req.query.level || '').trim().toUpperCase();
    const stageFilter = isReviewLevel(requestedStage)
      ? requestedStage
      : (reviewerLevel || 'L2');

    const startDate = String(req.query.start_date || '').trim();
    const endDate = String(req.query.end_date || '').trim();
    const statusFilter = String(req.query.status || '').trim();

    const where = [];
    const values = [];
    if (!canViewAll) {
      where.push(nonAcknowledgementTicketWhere);
    }

    const applyStageFilter = !canViewAll && !isAdmin001 && isReviewLevel(stageFilter);
    if (applyStageFilter) {
      values.push(stageFilter);
      where.push(stageFilter !== 'L1'
        ? `(${acknowledgementTicketWhere} OR COALESCE(ot.tat_current_level, 'L1') = $${values.length})`
        : `COALESCE(ot.tat_current_level, 'L1') = $${values.length}`);
      if (stageFilter === 'L1') {
        where.push(`NOT (
          ot.ticket_reason = 'MISSING_VALUE'
          AND (ot.violation_details->>'category') = 'MISSED_FREQUENCY'
        )`);
      }
    }

    if (startDate) {
      values.push(startDate);
      where.push(`ot.created_at::date >= $${values.length}::date`);
    }

    if (endDate) {
      values.push(endDate);
      where.push(`ot.created_at::date <= $${values.length}::date`);
    }

    if (statusFilter && statusFilter.toLowerCase() !== 'all') {
      values.push(statusFilter);
      where.push(`ot.status = $${values.length}`);
    }

    if (!canViewAll) {
      values.push(requesterId);
      where.push(`(${REVIEW_LEVELS.map((level) => `$${values.length} = ANY(COALESCE(ot.approval_${level.toLowerCase()}_user_ids, ARRAY[]::int[]))`).join(' OR ')})`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const result = await client.query(
      `SELECT
         ot.created_at::date AS bucket_date,
         COUNT(*)::int AS total_tickets,
         COUNT(*) FILTER (WHERE COALESCE(ot.machine_name, '') ILIKE '%SCI%')::int AS sci_tickets,
         COUNT(*) FILTER (WHERE COALESCE(ot.machine_name, '') ILIKE '%GTEX%')::int AS gtex_tickets
       FROM ticketing_system.operator_tickets ot
       ${whereClause}
       GROUP BY ot.created_at::date
       ORDER BY ot.created_at::date ASC`,
      values
    );

    const points = result.rows.map((row) => ({
      date: row.bucket_date,
      sci: Number(row.sci_tickets || 0),
      gtex: Number(row.gtex_tickets || 0),
      total: Number(row.total_tickets || 0)
    }));

    return res.status(200).json({
      stage: stageFilter,
      points,
      series: {
        sci: points.map((p) => ({ date: p.date, count: p.sci })),
        gtex: points.map((p) => ({ date: p.date, count: p.gtex }))
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/tickets/:id', async (req, res, next) => {
  try {
    await ensureOperatorTicketApprovalColumns();
    await ensureNotificationRecipientColumn();

    const ticketId = String(req.params.id || '').trim();
    if (!ticketId) return res.status(400).json({ message: 'ticketId is required' });

    const result = await client.query(
      `SELECT
         ot.*,
         COALESCE(notifications.items, '[]'::json) AS notifications
       FROM ticketing_system.operator_tickets ot
       LEFT JOIN LATERAL (
         SELECT json_agg(
           json_build_object(
             'notification_id', n.notification_id,
             'notification_type', n.notification_type,
             'status', n.status,
             'sent_at', n.sent_at,
             'recipient_user_id', n.recipient_user_id
           )
         ) AS items
         FROM ticketing_system.notifications n
         WHERE n.ticket_id = ot.ticket_id
       ) notifications ON true
       WHERE ot.ticket_id = $1
         AND (${nonAcknowledgementTicketWhere} OR ${acknowledgementTicketWhere})`,
      [ticketId]
    );

    if (!result.rows.length) return res.status(404).json({ message: 'Ticket not found' });
    const ticket = result.rows[0];

    const canViewAll = await getPrivilegedSupervisorAccess(req);
    if (!canViewAll && !canApproveOrRejectTicket(req, ticket)) {
      return res.status(403).json({ message: 'You are not authorized to view this ticket' });
    }

    return res.status(200).json({ ticket: addTicketValueAliases(ticket) });
  } catch (error) {
    next(error);
  }
});

router.get('/tickets/:id/timeline', async (req, res, next) => {
  try {
    await ensureOperatorTicketApprovalColumns();
    const ticketId = String(req.params.id || '').trim();
    if (!ticketId) return res.status(400).json({ message: 'ticketId is required' });

    const ticketRes = await client.query(
      `SELECT ticket_id, user_id, user_name, machine_name, parameter_name, status, tat_current_level, created_at, violation_details, approval_l1_user_ids, approval_l2_user_ids, approval_l3_user_ids
       FROM ticketing_system.operator_tickets ot
       WHERE ot.ticket_id = $1
         AND (${nonAcknowledgementTicketWhere} OR ${acknowledgementTicketWhere})`,
      [ticketId]
    );
    if (!ticketRes.rows.length) return res.status(404).json({ message: 'Ticket not found' });
    const ticket = ticketRes.rows[0];

    const canViewAll = await getPrivilegedSupervisorAccess(req);
    if (!canViewAll && !canApproveOrRejectTicket(req, ticket)) {
      return res.status(403).json({ message: 'You are not authorized to view this ticket timeline' });
    }

    const logRes = await client.query(
      `SELECT action, performed_by, role, created_at
       FROM ticketing_system.ticket_logs
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
      [ticketId]
    );

    const normalizeAction = (action) => {
      const a = String(action || '').trim().toUpperCase();
      if (a === 'SUBMITTED' || a === 'RESUBMITTED') return 'In Progress';
      if (a.includes('APPROVED')) return 'Approved';
      if (a.includes('REJECTED')) return 'Rejected';
      return action || 'Updated';
    };

    const timeline = [
      {
        at: ticket.created_at,
        title: 'Created',
        subtitle: 'Ticket Created',
        detail: `System generated alert : ${ticket.machine_name || 'Machine'} ${ticket.parameter_name ? `(${String(ticket.parameter_name).replace(/[\[\]\"]/g, '')})` : ''}`.trim()
      }
    ];

    for (const row of logRes.rows) {
      timeline.push({
        at: row.created_at,
        title: normalizeAction(row.action),
        detail: `${row.performed_by || 'User'} (${row.role || 'User'})`,
        action: row.action
      });
    }

    const hasMaintenanceEvent = timeline.some((t) => {
      const title = String(t.title || '').trim().toUpperCase();
      return title.includes('MAINTENANCE') || title.includes('ASSIGN');
    });
    if (!hasMaintenanceEvent) {
      timeline.push({
        at: ticket.created_at,
        title: 'Maintenance Started',
        subtitle: 'Maintenance Started',
        detail: `Operator ${ticket.user_name || 'User'} took ownership`
      });
    }

    const hasProgressLikeEvent = timeline.some((t) => {
      const title = String(t.title || '').trim().toUpperCase();
      return title === 'IN PROGRESS' || title === 'AWAITING APPROVAL' || title === 'APPROVED' || title === 'REJECTED' || title === 'REOPENED';
    });

    if (!hasProgressLikeEvent) {
      const statusUpper = String(ticket.status || '').trim().toUpperCase();
      if (statusUpper === 'IN PROGRESS') {
        timeline.push({
          at: ticket.created_at,
          title: 'Awaiting Approval',
          subtitle: 'Awaiting Approval',
          detail: `Resolution submitted by ${ticket.user_name || 'Operator'}`
        });
      } else if (statusUpper === 'CLOSED') {
        timeline.push({
          at: ticket.created_at,
          title: 'Approved',
          detail: 'Ticket was approved and closed'
        });
      } else if (statusUpper === 'REOPENED') {
        timeline.push({
          at: ticket.created_at,
          title: 'Reopened',
          detail: 'Ticket was rejected and reopened for correction'
        });
      }
    }

    let operatorComment = null;
    if (ticket.violation_details && typeof ticket.violation_details === 'object') {
      operatorComment =
        ticket.violation_details.operator_comment ||
        ticket.violation_details.comment ||
        ticket.violation_details.remarks ||
        null;
    }

    return res.status(200).json({
      ticket_id: ticket.ticket_id,
      status: ticket.status,
      stage: ticket.tat_current_level || null,
      timeline,
      resolution_submission: {
        title: 'Resolution Submission',
        operator_comment: operatorComment || 'No operator comment provided.',
        action_label: 'Review Submission'
      }
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/tickets/acknowledge', async (req, res, next) => {
  try {
    await ensureOperatorTicketApprovalColumns();
    const canViewAll = await getPrivilegedSupervisorAccess(req);
    const ticketId = getTicketIdFromRequest(req);
    if (!ticketId) return res.status(400).json({ message: 'ticketId is required' });

    const ticketRes = await client.query(
      `SELECT * FROM ticketing_system.operator_tickets ot
       WHERE ot.ticket_id = $1
         AND ${acknowledgementTicketWhere}`,
      [ticketId]
    );
    if (!ticketRes.rows.length) return res.status(404).json({ message: 'Acknowledgement review ticket not found' });
    const ticket = ticketRes.rows[0];

    if (!canViewAll && !canApproveOrRejectTicket(req, ticket)) {
      return res.status(403).json({ message: 'You are not authorized to acknowledge this ticket' });
    }

    const requesterId = parsePositiveInt(req.user?.id);
    const requesterName = req.user?.full_name || req.user?.employee_id || 'L2 User';
    const note = String(req.body?.note || req.body?.acknowledgement_note || '').trim() || null;
    const submittedNotebookId = parsePositiveInt(ticket.violation_details?.submitted_notebook_id);

    if (submittedNotebookId) {
      await client.query(
        `UPDATE ticketing_system.submitted_notebooks
         SET status = 'ACKNOWLEDGED',
             acknowledged_at = NOW(),
             acknowledged_by_user_id = $2,
             acknowledged_by_name = $3,
             acknowledgement_note = $4,
             updated_at = NOW()
         WHERE id = $1
           AND status <> 'ACKNOWLEDGED'`,
        [submittedNotebookId, requesterId, requesterName, note]
      );
    }

    const updated = await client.query(
      `UPDATE ticketing_system.operator_tickets
       SET status = 'Closed'
       WHERE ticket_id = $1
       RETURNING *`,
      [ticketId]
    );

    await client.query(
      `INSERT INTO ticketing_system.ticket_logs
       (ticket_id, action, performed_by, role, created_at)
       VALUES ($1, 'ACKNOWLEDGED', $2, $3, NOW())`,
      [ticketId, requesterName, req.user?.role || 'L2']
    );

    return res.status(200).json({
      message: 'Acknowledgement review ticket closed successfully',
      ticket: updated.rows[0],
      tickets: updated.rows,
      data: updated.rows
    });
  } catch (error) {
    next(error);
  }
});

const updateSupervisorTicketStatusHandler = async (req, res, next) => {
  try {
    await ensureOperatorTicketApprovalColumns();
    const canViewAll = await getPrivilegedSupervisorAccess(req);
    const ticketId = getTicketIdFromRequest(req);
    const status = normalizeTicketStatusInput(req.body?.status || req.body?.ticket_status || req.body?.ticketStatus);

    if (!ticketId) return res.status(400).json({ message: 'ticketId is required' });
    if (!status) {
      return res.status(400).json({
        message: 'Valid status is required',
        allowed_statuses: ['Open', 'In Progress', 'Closed', 'Reopened']
      });
    }

    const ticketRes = await client.query(
      `SELECT * FROM ticketing_system.operator_tickets ot
       WHERE ot.ticket_id = $1
         AND ${nonAcknowledgementTicketWhere}`,
      [ticketId]
    );
    if (!ticketRes.rows.length) return res.status(404).json({ message: 'Ticket not found' });

    const ticket = ticketRes.rows[0];
    if (!canViewAll && !canApproveOrRejectTicket(req, ticket)) {
      return res.status(403).json({ message: 'You are not authorized to update this ticket' });
    }

    const updated = await client.query(
      `UPDATE ticketing_system.operator_tickets
       SET status = $2
       WHERE ticket_id = $1
       RETURNING *`,
      [ticketId, status]
    );

    await client.query(
      `INSERT INTO ticketing_system.ticket_logs
       (ticket_id, action, performed_by, role, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [
        ticketId,
        `STATUS_UPDATED_${status.toUpperCase().replace(/\s+/g, '_')}`,
        req.user?.full_name || req.user?.employee_id || 'Supervisor',
        req.user?.role || 'Supervisor'
      ]
    );

    const statusOwnerId = parsePositiveInt(updated.rows[0].user_id);
    if (statusOwnerId) {
      await createNotification({
        recipientUserId: statusOwnerId,
        ticketId,
        type: 'TICKET_STATUS_UPDATED',
        category: 'Tickets',
        priority: 'Medium',
        title: `${ticket.machine_name || 'Ticket'} status changed to ${status}`,
        body: `${req.user?.full_name || 'A supervisor'} set ticket ${ticketId} (${ticket.machine_name || ''}) to ${status}.`,
        linkUrl: `/operator-tickets/${ticketId}`,
        payload: { ticket_id: ticketId, status }
      });
    }

    res.locals.activityDescription = `${req.user?.full_name || 'Supervisor'} set ticket ${ticketId} to ${status}`;
    res.locals.activityMetadata = { ticket_id: ticketId, status };

    return res.status(200).json({
      message: 'Ticket status updated successfully',
      ticket: updated.rows[0],
      tickets: updated.rows,
      data: updated.rows
    });
  } catch (error) {
    next(error);
  }
};

router.patch('/tickets/status', updateSupervisorTicketStatusHandler);
router.put('/tickets/status', updateSupervisorTicketStatusHandler);

router.patch('/tickets/approve', async (req, res, next) => {
  try {
    await ensureOperatorTicketApprovalColumns();
    const canViewAll = await getPrivilegedSupervisorAccess(req);
    const ticketId = getTicketIdFromRequest(req);
    if (!ticketId) return res.status(400).json({ message: 'ticketId is required' });

    const ticketRes = await client.query(
      `SELECT * FROM ticketing_system.operator_tickets ot
       WHERE ot.ticket_id = $1
         AND ${nonAcknowledgementTicketWhere}`,
      [ticketId]
    );
    if (!ticketRes.rows.length) return res.status(404).json({ message: 'Ticket not found' });
    const ticket = ticketRes.rows[0];

    if (!canViewAll && !canApproveOrRejectTicket(req, ticket)) {
      return res.status(403).json({ message: 'You are not authorized to approve this ticket' });
    }

    const updated = await client.query(
      `UPDATE ticketing_system.operator_tickets
       SET status = 'Closed'
       WHERE ticket_id = $1
       RETURNING *`,
      [ticketId]
    );

    await client.query(
      `INSERT INTO ticketing_system.ticket_logs
       (ticket_id, action, performed_by, role, created_at)
       VALUES ($1, 'Approved', $2, $3, CURRENT_TIMESTAMP)`,
      [ticketId, req.user?.full_name || req.user?.employee_id || 'Supervisor', req.user?.role || 'Supervisor']
    );

    const approveOwnerId = parsePositiveInt(updated.rows[0].user_id);
    if (approveOwnerId) {
      await createNotification({
        recipientUserId: approveOwnerId,
        ticketId,
        type: 'TICKET_APPROVED',
        category: 'Tickets',
        priority: 'Medium',
        title: `${ticket.machine_name || 'Ticket'} ${ticketId} approved`,
        body: `${req.user?.full_name || 'A supervisor'} approved ticket ${ticketId} for ${ticket.machine_name || 'the machine'}.`,
        linkUrl: `/operator-tickets/${ticketId}`,
        payload: { ticket_id: ticketId, status: 'Closed' }
      });
    }

    res.locals.activityDescription = `Approved ticket ${ticketId} for ${ticket.machine_name || 'unknown machine'}`;
    res.locals.activityMetadata = { ticket_id: ticketId };

    return res.status(200).json({
      message: 'Ticket approved successfully',
      ticket: updated.rows[0],
      tickets: updated.rows,
      data: updated.rows
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/tickets/reject', async (req, res, next) => {
  try {
    await ensureOperatorTicketApprovalColumns();
    await ensureNotificationRecipientColumn();
    const canViewAll = await getPrivilegedSupervisorAccess(req);
    const ticketId = getTicketIdFromRequest(req);
    if (!ticketId) return res.status(400).json({ message: 'ticketId is required' });

    const ticketRes = await client.query(
      `SELECT * FROM ticketing_system.operator_tickets ot
       WHERE ot.ticket_id = $1
         AND ${nonAcknowledgementTicketWhere}`,
      [ticketId]
    );
    if (!ticketRes.rows.length) return res.status(404).json({ message: 'Ticket not found' });
    const ticket = ticketRes.rows[0];

    if (!canViewAll && !canApproveOrRejectTicket(req, ticket)) {
      return res.status(403).json({ message: 'You are not authorized to reject this ticket' });
    }

    const updated = await client.query(
      `UPDATE ticketing_system.operator_tickets
       SET status = 'Reopened'
       WHERE ticket_id = $1
       RETURNING *`,
      [ticketId]
    );

    await client.query(
      `INSERT INTO ticketing_system.ticket_logs
       (ticket_id, action, performed_by, role, created_at)
       VALUES ($1, 'Rejected', $2, $3, CURRENT_TIMESTAMP)`,
      [ticketId, req.user?.full_name || req.user?.employee_id || 'Supervisor', req.user?.role || 'Supervisor']
    );

    const ownerId = parsePositiveInt(updated.rows[0].user_id);
    if (ownerId) {
      await createNotification({
        recipientUserId: ownerId,
        ticketId,
        type: 'TICKET_REOPENED',
        category: 'Tickets',
        priority: 'High',
        title: `${ticket.machine_name || 'Ticket'} ${ticketId} rejected — reopened`,
        body: `${req.user?.full_name || 'A supervisor'} rejected ticket ${ticketId} for ${ticket.machine_name || 'the machine'}. Please review and resubmit.`,
        linkUrl: `/operator-tickets/${ticketId}`,
        payload: { ticket_id: ticketId, status: 'Reopened' }
      });
    }

    res.locals.activityDescription = `Rejected ticket ${ticketId} for ${ticket.machine_name || 'unknown machine'} — reopened for submitter`;
    res.locals.activityMetadata = { ticket_id: ticketId };

    return res.status(200).json({
      message: 'Ticket rejected and reopened successfully',
      ticket: updated.rows[0],
      tickets: updated.rows,
      data: updated.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Assign employee to supervisor
 * Supports either user IDs or employee codes (e.g., EMP002).
 */
router.post('/assign', async (req, res, next) => {
  try {
    if (!isAdminUser(req)) {
      return res.status(403).json({ message: 'Only admin can assign supervisor mappings' });
    }

    await ensureSupervisorAssignmentsTable();

    const supervisorUserId = await resolveUserId({
      userId: req.body?.supervisor_user_id,
      employeeCode: req.body?.supervisor_employee_id
    });
    const employeeUserId = await resolveUserId({
      userId: req.body?.employee_user_id,
      employeeCode: req.body?.employee_employee_id
    });

    if (!supervisorUserId || !employeeUserId) {
      return res.status(400).json({
        message: 'Valid supervisor and employee are required (user id or employee code)'
      });
    }
    if (supervisorUserId === employeeUserId) {
      return res.status(400).json({ message: 'Supervisor and employee cannot be the same user' });
    }

    const result = await client.query(
      `INSERT INTO users.supervisor_assignments
       (supervisor_user_id, employee_user_id, is_active, assigned_by, assigned_at)
       VALUES ($1, $2, true, $3, now())
       ON CONFLICT (supervisor_user_id, employee_user_id)
       DO UPDATE SET is_active = true, assigned_by = EXCLUDED.assigned_by, assigned_at = now()
       RETURNING *`,
      [supervisorUserId, employeeUserId, req.user.id || null]
    );

    return res.status(200).json({
      message: 'Supervisor assigned successfully',
      assignment: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Remove assignment (soft unassign)
 */
router.delete('/unassign', async (req, res, next) => {
  try {
    if (!isAdminUser(req)) {
      return res.status(403).json({ message: 'Only admin can remove supervisor mappings' });
    }

    await ensureSupervisorAssignmentsTable();

    const supervisorUserId = await resolveUserId({
      userId: req.body?.supervisor_user_id,
      employeeCode: req.body?.supervisor_employee_id
    });
    const employeeUserId = await resolveUserId({
      userId: req.body?.employee_user_id,
      employeeCode: req.body?.employee_employee_id
    });

    if (!supervisorUserId || !employeeUserId) {
      return res.status(400).json({
        message: 'Valid supervisor and employee are required (user id or employee code)'
      });
    }

    const result = await client.query(
      `UPDATE users.supervisor_assignments
       SET is_active = false
       WHERE supervisor_user_id = $1 AND employee_user_id = $2
       RETURNING *`,
      [supervisorUserId, employeeUserId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    return res.status(200).json({
      message: 'Supervisor assignment removed successfully',
      assignment: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * List all employees under a supervisor
 */
router.get('/supervisor/:supervisorId/employees', async (req, res, next) => {
  try {
    await ensureSupervisorAssignmentsTable();
    const supervisorId = parsePositiveInt(req.params.supervisorId);
    if (!supervisorId) return res.status(400).json({ message: 'Valid supervisorId is required' });

    const requesterId = parsePositiveInt(req.user?.id);
    if (!isAdminUser(req) && requesterId !== supervisorId) {
      return res.status(403).json({ message: 'Access denied for this supervisor mapping' });
    }

    const result = await client.query(
      `SELECT
         sa.id,
         sa.supervisor_user_id,
         sa.employee_user_id,
         sa.is_active,
         sa.assigned_at,
         e.employee_id,
         e.full_name,
         e.email,
         e.phone,
         e.department,
         e.role
       FROM users.supervisor_assignments sa
       JOIN users.user_details e ON e.id = sa.employee_user_id
       WHERE sa.supervisor_user_id = $1 AND sa.is_active = true
       ORDER BY e.full_name ASC`,
      [supervisorId]
    );

    return res.status(200).json({
      supervisor_user_id: supervisorId,
      employees: result.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get employee's active supervisor(s)
 */
router.get('/employee/:employeeId/supervisor', async (req, res, next) => {
  try {
    await ensureSupervisorAssignmentsTable();
    const employeeId = parsePositiveInt(req.params.employeeId);
    if (!employeeId) return res.status(400).json({ message: 'Valid employeeId is required' });

    const requesterId = parsePositiveInt(req.user?.id);
    if (!isAdminUser(req) && requesterId !== employeeId) {
      return res.status(403).json({ message: 'Access denied for this employee mapping' });
    }

    const result = await client.query(
      `SELECT
         sa.id,
         sa.supervisor_user_id,
         sa.employee_user_id,
         sa.is_active,
         sa.assigned_at,
         s.employee_id,
         s.full_name,
         s.email,
         s.phone,
         s.department,
         s.role
       FROM users.supervisor_assignments sa
       JOIN users.user_details s ON s.id = sa.supervisor_user_id
       WHERE sa.employee_user_id = $1 AND sa.is_active = true
       ORDER BY sa.assigned_at DESC`,
      [employeeId]
    );

    return res.status(200).json({
      employee_user_id: employeeId,
      supervisors: result.rows
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const client = require('../connection');
const auth = require('../middleware/auth');
const { createNotificationsForUsers, ensureNotificationMetadataColumns } = require('../utils/notifications');

const MAX_LIMIT = 100;
const ACK_DEADLINE_HOURS = 24;

const parsePositiveInt = (value, fallback = null) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const cleanText = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

const toJson = (value, fallback = null) => JSON.stringify(value === undefined ? fallback : value);

// operator_tickets' approval_lX_user_ids / lX_tat_due_at columns are also
// migrated by operatorTickets.routes.js and supervisorTickets.routes.js -
// this file references them (l2/l3/l4/l5_tat_due_at, approval_l1-l5_user_ids)
// without ever having run its own copy of that migration, relying entirely
// on one of those other files' routes having already been hit first. That's
// fragile even for the pre-existing L1-L3 columns; ensure them here too so
// this file's own endpoints (PP batch completion check in particular) work
// standalone.
let ticketApprovalColumnsEnsured = false;
const ensureTicketApprovalColumnsForBatchCheck = async () => {
  if (ticketApprovalColumnsEnsured) return;
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
      ADD COLUMN IF NOT EXISTS approval_l1_user_ids integer[] NULL,
      ADD COLUMN IF NOT EXISTS approval_l2_user_ids integer[] NULL,
      ADD COLUMN IF NOT EXISTS approval_l3_user_ids integer[] NULL,
      ADD COLUMN IF NOT EXISTS approval_l4_user_ids integer[] NULL,
      ADD COLUMN IF NOT EXISTS approval_l5_user_ids integer[] NULL,
      ADD COLUMN IF NOT EXISTS tat_current_level text NULL,
      ADD COLUMN IF NOT EXISTS l1_tat_due_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS l2_tat_due_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS l3_tat_due_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS l4_tat_due_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS l5_tat_due_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS ticket_type varchar(50) NULL
  `);
  ticketApprovalColumnsEnsured = true;
};

const parseTatHours = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const getUserDisplayName = async (userId) => {
  if (!userId) return null;
  const result = await client.query(
    `SELECT full_name FROM users.user_details WHERE id = $1`,
    [userId]
  );
  return result.rows[0]?.full_name || null;
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
        return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
      }
    }
    return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [value];
};

const getApproverIdsByLevel = async (providedValues = [], { level = 'L2', useDefault = true } = {}) => {
  const normalizedLevel = String(level || 'L2').trim().toUpperCase();
  const values = toArray(providedValues);
  const numericIds = values
    .map((item) => typeof item === 'object' && item !== null ? item.id ?? item.user_id ?? item.value : item)
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  const employeeCodes = values
    .map((item) => typeof item === 'object' && item !== null ? item.employee_id ?? item.employeeId ?? item.code ?? item.value : item)
    .map((item) => String(item || '').trim())
    .filter((item) => item && !Number.isInteger(Number(item)));

  let resolvedCodeIds = [];
  if (employeeCodes.length) {
    const result = await client.query(
      `SELECT id
       FROM users.user_details
       WHERE UPPER(TRIM(employee_id)) = ANY($1::text[])
       ORDER BY id`,
      [employeeCodes.map((code) => code.toUpperCase())]
    );
    resolvedCodeIds = result.rows.map((row) => Number(row.id));
  }

  const explicit = Array.from(new Set([...numericIds, ...resolvedCodeIds]));
  if (explicit.length) return explicit;
  if (!useDefault) return [];

  const result = await client.query(
    `SELECT id
     FROM users.user_details
     WHERE UPPER(COALESCE(level, '')) = $1
     ORDER BY id ASC
     LIMIT 20`
    ,
    [normalizedLevel]
  );
  const levelDefaults = result.rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
  if (levelDefaults.length) return levelDefaults;

  if (normalizedLevel === 'L2') {
    const sup001 = await client.query(
      `SELECT id
       FROM users.user_details
       WHERE UPPER(TRIM(employee_id)) = 'SUP001'
       LIMIT 1`
    );
    if (sup001.rows[0]?.id) return [Number(sup001.rows[0].id)];
  }

  return [];
};

const getL2ApproverIds = (providedValues = [], options = {}) =>
  getApproverIdsByLevel(providedValues, { ...options, level: 'L2' });

const getL3ApproverIds = (providedValues = [], options = {}) =>
  getApproverIdsByLevel(providedValues, { ...options, level: 'L3' });

const getL1ApproverIds = (providedValues = [], options = {}) =>
  getApproverIdsByLevel(providedValues, { ...options, level: 'L1' });

const getL4ApproverIds = (providedValues = [], options = {}) =>
  getApproverIdsByLevel(providedValues, { ...options, level: 'L4' });

const getL5ApproverIds = (providedValues = [], options = {}) =>
  getApproverIdsByLevel(providedValues, { ...options, level: 'L5' });

// The 7 sub-departments / 10 notebooks tracked by PP Batch Completion, and the
// underlying table each notebook's submissions actually land in. entry_id here
// is the shared "PP-000N" id stamped across every department's PP screen —
// a batch is "complete" once all 10 of these have a row for the same entry_id.
const PP_BATCH_NOTEBOOKS = [
  { sub_department: 'Mixing', notebook: 'Mixing QC Header', label: 'Mixing QC Header', schema: 'mixing', table: 'mixing_qc_header', hasOperator: true },
  { sub_department: 'Carding', notebook: 'Carding QC Header', label: 'Carding QC Header', schema: 'carding', table: 'carding_qc_header', hasOperator: false },
  { sub_department: 'Blowroom', notebook: 'Blowroom Header', label: 'Blowroom Header', schema: 'blowroom', table: 'blowroom_header', hasOperator: false },
  { sub_department: 'Drawframe', notebook: 'Drawframe QC Header', label: 'PP-Breaker', schema: 'drawframe', table: 'drawframe_qc_header', hasOperator: true },
  { sub_department: 'Drawframe', notebook: 'Drawframe Finisher Drawing Inspection', label: 'PP-Finisher', schema: 'drawframe', table: 'finisher_drawing_inspection', hasOperator: false },
  { sub_department: 'Simplex', notebook: 'Simplex Process Parameter', label: 'Simplex Process Parameter', schema: 'simplex', table: 'simplex_process_parameter', hasOperator: false },
  { sub_department: 'Spinning', notebook: 'Spinning QC Header', label: 'Spinning QC Header', schema: 'spinning', table: 'spinning_qc_header', hasOperator: false },
  { sub_department: 'Autoconer', notebook: 'Autoconer Process Parameter', label: 'Autoconer Process Parameter', schema: 'autoconer', table: 'autoconer_process_parameter', hasOperator: false },
  { sub_department: 'Autoconer', notebook: 'Autoconer Q2 Inspection', label: 'Autoconer Q2 Inspection', schema: 'autoconer', table: 'autoconer_q2_inspection', hasOperator: false },
  { sub_department: 'Autoconer', notebook: 'Autoconer Q3 Inspection', label: 'Autoconer Q3 Inspection', schema: 'autoconer', table: 'autoconer_q3_inspection', hasOperator: false }
];

const ensurePpBatchConfigTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.pp_batch_config (
      config_key TEXT PRIMARY KEY DEFAULT 'global',
      completion_threshold_hours INTEGER NOT NULL DEFAULT 24,
      l2_tat_hours INTEGER NULL,
      approval_l1_user_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      approval_l2_user_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      is_active BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // L3/L4/L5 escalation tiers - a PP_BATCH_INCOMPLETE ticket escalates
  // L2 -> L3 -> L4 -> L5 as each tier's TAT elapses (see
  // escalatePpBatchTickets below), mirroring the existing L2 step.
  await client.query(`
    ALTER TABLE ticketing_system.pp_batch_config
      ADD COLUMN IF NOT EXISTS l3_tat_hours INTEGER NULL,
      ADD COLUMN IF NOT EXISTS l4_tat_hours INTEGER NULL,
      ADD COLUMN IF NOT EXISTS l5_tat_hours INTEGER NULL,
      ADD COLUMN IF NOT EXISTS approval_l3_user_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      ADD COLUMN IF NOT EXISTS approval_l4_user_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      ADD COLUMN IF NOT EXISTS approval_l5_user_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[]
  `);
};

const getPpBatchConfig = async () => {
  await ensurePpBatchConfigTable();
  const result = await client.query(
    `SELECT * FROM ticketing_system.pp_batch_config WHERE config_key = 'global'`
  );
  return result.rows[0] || {
    config_key: 'global',
    completion_threshold_hours: 24,
    l2_tat_hours: null,
    l3_tat_hours: null,
    l4_tat_hours: null,
    l5_tat_hours: null,
    approval_l1_user_ids: [],
    approval_l2_user_ids: [],
    approval_l3_user_ids: [],
    approval_l4_user_ids: [],
    approval_l5_user_ids: [],
    is_active: true,
    updated_at: null
  };
};

const getPpBatchSubDepartments = async () => {
  const bySubDepartment = new Map();

  for (const notebookConfig of PP_BATCH_NOTEBOOKS) {
    const operatorColumn = notebookConfig.hasOperator ? 'operator' : 'NULL';
    const result = await client.query(
      `SELECT entry_id, created_at, ${operatorColumn} AS submitted_by_name
       FROM ${notebookConfig.schema}.${notebookConfig.table}
       WHERE entry_id IS NOT NULL AND TRIM(entry_id) <> ''
       ORDER BY created_at DESC
       LIMIT 1`
    );
    const lastRow = result.rows[0] || null;

    if (!bySubDepartment.has(notebookConfig.sub_department)) {
      bySubDepartment.set(notebookConfig.sub_department, []);
    }
    bySubDepartment.get(notebookConfig.sub_department).push({
      notebook: notebookConfig.notebook,
      label: notebookConfig.label,
      last_saved_entry: lastRow
        ? {
            entry_id: lastRow.entry_id,
            submitted_at: lastRow.created_at,
            submitted_by_name: lastRow.submitted_by_name || null
          }
        : null
    });
  }

  const order = ['Mixing', 'Carding', 'Blowroom', 'Drawframe', 'Simplex', 'Spinning', 'Autoconer'];
  return order.map((subDepartment) => ({
    sub_department: subDepartment,
    notebooks: bySubDepartment.get(subDepartment) || []
  }));
};

// Scans all 10 PP notebook tables for entry_ids whose batch is overdue (first
// submission older than completion_threshold_hours with at least one missing
// screen) and files a PP_BATCH_INCOMPLETE ticket for each, then expires any
// already-open PP_BATCH_INCOMPLETE ticket whose L2 TAT has elapsed.
const runPpBatchCompletionCheck = async () => {
  await ensureTicketApprovalColumnsForBatchCheck();
  const config = await getPpBatchConfig();

  if (config.is_active === false) {
    return { created: [], expired: [] };
  }

  const completionThresholdHours = Number(config.completion_threshold_hours) > 0
    ? Number(config.completion_threshold_hours)
    : 24;
  const l2TatHours = Number(config.l2_tat_hours) > 0 ? Number(config.l2_tat_hours) : null;

  const unionSelects = PP_BATCH_NOTEBOOKS.map(
    (notebookConfig) =>
      `SELECT entry_id, created_at, '${notebookConfig.label.replace(/'/g, "''")}' AS notebook_label
       FROM ${notebookConfig.schema}.${notebookConfig.table}
       WHERE entry_id IS NOT NULL AND TRIM(entry_id) <> ''`
  ).join('\nUNION ALL\n');

  const grouped = await client.query(`
    SELECT entry_id,
           MIN(created_at) AS first_created_at,
           ARRAY_AGG(DISTINCT notebook_label) AS completed_screens
    FROM (${unionSelects}) all_pp_entries
    GROUP BY entry_id
  `);

  const allLabels = PP_BATCH_NOTEBOOKS.map((notebookConfig) => notebookConfig.label);
  const created = [];

  for (const row of grouped.rows) {
    const completedScreens = Array.isArray(row.completed_screens) ? row.completed_screens : [];
    const missingScreens = allLabels.filter((label) => !completedScreens.includes(label));
    if (!missingScreens.length) continue;

    const firstCreatedAt = new Date(row.first_created_at);
    const hoursElapsed = (Date.now() - firstCreatedAt.getTime()) / (1000 * 60 * 60);
    if (hoursElapsed < completionThresholdHours) continue;

    const existing = await client.query(
      `SELECT ticket_id
       FROM ticketing_system.operator_tickets
       WHERE (violation_details->>'ticket_type') = 'PP_BATCH_INCOMPLETE'
         AND (violation_details->>'entry_id') = $1
         AND status <> 'Closed'
       LIMIT 1`,
      [row.entry_id]
    );
    if (existing.rows[0]?.ticket_id) continue;

    const approvalL1UserIds = (Array.isArray(config.approval_l1_user_ids) && config.approval_l1_user_ids.length)
      ? config.approval_l1_user_ids
      : await getL1ApproverIds([], { useDefault: true });
    const approvalL2UserIds = (Array.isArray(config.approval_l2_user_ids) && config.approval_l2_user_ids.length)
      ? config.approval_l2_user_ids
      : await getL2ApproverIds([], { useDefault: true });

    const violationDetails = {
      category: 'MISSED_FREQUENCY',
      ticket_type: 'PP_BATCH_INCOMPLETE',
      entry_id: row.entry_id,
      first_created_at: row.first_created_at,
      completion_threshold_hours: completionThresholdHours,
      completed_screens: completedScreens,
      missing_screens: missingScreens,
      message: `Process Parameter ${row.entry_id} was not completed by L1 within ${completionThresholdHours} hour(s). Missing: ${missingScreens.join(', ')}.`
    };

    const l2TatDueAt = l2TatHours ? new Date(Date.now() + l2TatHours * 60 * 60 * 1000).toISOString() : null;

    const ticket = await client.query(
      `INSERT INTO ticketing_system.operator_tickets
       (ticket_id, machine_name, parameter_name, actual_value, threshold_value,
        severity, status, created_at, ticket_reason, ticket_type, ticket_kind,
        violation_details, approval_l1_user_ids, approval_l2_user_ids, tat_current_level, l2_tat_due_at)
       VALUES (
         'TK-' || LPAD(nextval('"ticketing_system"."ticket_seq"')::text, 4, '0'),
         $1, $2::jsonb, $3::jsonb, $4::jsonb,
         'High', 'In Progress', NOW(), 'MISSING_VALUE', 'PP_BATCH_INCOMPLETE', 'pp_batch',
         $5::jsonb, $6::int[], $7::int[], 'L2', $8
       )
       RETURNING *`,
      [
        row.entry_id,
        toJson(missingScreens, []),
        toJson(completedScreens, []),
        toJson({ completion_threshold_hours: completionThresholdHours }, {}),
        toJson(violationDetails, {}),
        approvalL1UserIds,
        approvalL2UserIds,
        l2TatDueAt
      ]
    );

    const inserted = ticket.rows[0];
    created.push(inserted);

    await createNotificationsForUsers([...approvalL1UserIds, ...approvalL2UserIds], {
      ticketId: inserted.ticket_id,
      type: 'PP_BATCH_INCOMPLETE',
      category: 'Tickets',
      priority: 'High',
      title: `PP batch incomplete: ${row.entry_id}`,
      body: violationDetails.message,
      linkUrl: `/supervisor-tickets/${inserted.ticket_id}`,
      payload: { ticket_id: inserted.ticket_id, entry_id: row.entry_id }
    });
  }

  const escalated = await escalatePpBatchTickets(config);

  return { created, expired: escalated };
};

// Steps a PP_BATCH_INCOMPLETE ticket from one TAT tier to the next
// (L2 -> L3 -> L4 -> L5) once the current tier's due date has passed:
// assigns that tier's approvers, sets its due date, notifies them, and
// advances tat_current_level. L5 is the final tier - once its TAT elapses
// the ticket is just marked EXPIRED_L5 with nowhere further to escalate to.
const escalatePpBatchTickets = async (config) => {
  const tiers = [
    { level: 'L2', dueColumn: 'l2_tat_due_at', nextLevel: 'L3', nextDueColumn: 'l3_tat_due_at', nextTatHours: config.l3_tat_hours, nextApproverIds: config.approval_l3_user_ids, getDefault: getL3ApproverIds },
    { level: 'L3', dueColumn: 'l3_tat_due_at', nextLevel: 'L4', nextDueColumn: 'l4_tat_due_at', nextTatHours: config.l4_tat_hours, nextApproverIds: config.approval_l4_user_ids, getDefault: getL4ApproverIds },
    { level: 'L4', dueColumn: 'l4_tat_due_at', nextLevel: 'L5', nextDueColumn: 'l5_tat_due_at', nextTatHours: config.l5_tat_hours, nextApproverIds: config.approval_l5_user_ids, getDefault: getL5ApproverIds },
  ];

  const allEscalated = [];

  for (const tier of tiers) {
    const dueTickets = await client.query(
      `SELECT * FROM ticketing_system.operator_tickets
       WHERE (violation_details->>'ticket_type') = 'PP_BATCH_INCOMPLETE'
         AND tat_current_level = $1
         AND ${tier.dueColumn} IS NOT NULL
         AND ${tier.dueColumn} <= NOW()
         AND status <> 'Closed'`,
      [tier.level]
    );
    if (!dueTickets.rowCount) continue;

    const nextTatHours = Number(tier.nextTatHours) > 0 ? Number(tier.nextTatHours) : null;
    const nextApproverIds = (Array.isArray(tier.nextApproverIds) && tier.nextApproverIds.length)
      ? tier.nextApproverIds
      // eslint-disable-next-line no-await-in-loop
      : await tier.getDefault([], { useDefault: true });
    const nextDueAt = nextTatHours ? new Date(Date.now() + nextTatHours * 60 * 60 * 1000).toISOString() : null;

    for (const ticket of dueTickets.rows) {
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
      const escalatedTicket = result.rows[0];
      if (escalatedTicket) allEscalated.push(escalatedTicket);

      if (nextApproverIds.length) {
        // eslint-disable-next-line no-await-in-loop
        await createNotificationsForUsers(nextApproverIds, {
          ticketId: ticket.ticket_id,
          type: 'PP_BATCH_INCOMPLETE',
          category: 'Tickets',
          priority: 'High',
          title: `PP batch incomplete (escalated to ${tier.nextLevel}): ${ticket.violation_details?.entry_id || ticket.ticket_id}`,
          body: `This PP batch was not actioned at ${tier.level} in time and has escalated to ${tier.nextLevel}.`,
          linkUrl: `/supervisor-tickets/${ticket.ticket_id}`,
          payload: { ticket_id: ticket.ticket_id }
        });
      }
    }
  }

  // L5 is terminal - nothing further to escalate to, just mark it expired
  // once its own TAT elapses so it's visibly overdue rather than silently
  // stuck at "L5" forever.
  const expiredL5 = await client.query(
    `UPDATE ticketing_system.operator_tickets
     SET tat_current_level = 'EXPIRED_L5'
     WHERE (violation_details->>'ticket_type') = 'PP_BATCH_INCOMPLETE'
       AND tat_current_level = 'L5'
       AND l5_tat_due_at IS NOT NULL
       AND l5_tat_due_at <= NOW()
       AND status <> 'Closed'
     RETURNING *`
  );

  return [...allEscalated, ...expiredL5.rows];
};

const ensureSubmittedNotebookTables = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.submitted_notebooks (
      id bigserial PRIMARY KEY,
      notebook_submission_id text NOT NULL UNIQUE,
      department text NULL,
      sub_department text NULL,
      notebook text NOT NULL,
      input_screen text NULL,
      entry_id text NULL,
      source_schema text NULL,
      source_table text NULL,
      source_record_id text NULL,
      submitted_by_user_id integer NULL REFERENCES users.user_details(id) ON DELETE SET NULL,
      submitted_by_name text NULL,
      submitted_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      l2_approver_user_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[],
      l3_approver_user_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[],
      status text NOT NULL DEFAULT 'PENDING_ACK',
      submitted_at timestamptz NOT NULL DEFAULT NOW(),
      ack_due_at timestamptz NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
      acknowledged_at timestamptz NULL,
      acknowledged_by_user_id integer NULL REFERENCES users.user_details(id) ON DELETE SET NULL,
      acknowledged_by_name text NULL,
      acknowledgement_note text NULL,
      overdue_ticket_id text NULL REFERENCES ticketing_system.operator_tickets(ticket_id) ON DELETE SET NULL,
      overdue_ticket_created_at timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    ALTER TABLE ticketing_system.submitted_notebooks
      ADD COLUMN IF NOT EXISTS id bigserial,
      ADD COLUMN IF NOT EXISTS notebook_submission_id text,
      ADD COLUMN IF NOT EXISTS department text NULL,
      ADD COLUMN IF NOT EXISTS sub_department text NULL,
      ADD COLUMN IF NOT EXISTS notebook text,
      ADD COLUMN IF NOT EXISTS input_screen text NULL,
      ADD COLUMN IF NOT EXISTS entry_id text NULL,
      ADD COLUMN IF NOT EXISTS source_schema text NULL,
      ADD COLUMN IF NOT EXISTS source_table text NULL,
      ADD COLUMN IF NOT EXISTS source_record_id text NULL,
      ADD COLUMN IF NOT EXISTS submitted_by_user_id integer NULL REFERENCES users.user_details(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS submitted_by_name text NULL,
      ADD COLUMN IF NOT EXISTS submitted_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS l2_approver_user_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[],
      ADD COLUMN IF NOT EXISTS l3_approver_user_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[],
      ADD COLUMN IF NOT EXISTS l4_approver_user_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[],
      ADD COLUMN IF NOT EXISTS l5_approver_user_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[],
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING_ACK',
      ADD COLUMN IF NOT EXISTS submitted_at timestamptz NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS ack_due_at timestamptz NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
      ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS acknowledged_by_user_id integer NULL REFERENCES users.user_details(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS acknowledged_by_name text NULL,
      ADD COLUMN IF NOT EXISTS acknowledgement_note text NULL,
      ADD COLUMN IF NOT EXISTS overdue_ticket_id text NULL REFERENCES ticketing_system.operator_tickets(ticket_id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS overdue_ticket_created_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT NOW()
  `);

  await client.query(`
    DELETE FROM ticketing_system.submitted_notebooks s
    USING (
      SELECT ctid,
             ROW_NUMBER() OVER (
               PARTITION BY notebook_submission_id
               ORDER BY submitted_at DESC NULLS LAST, id DESC NULLS LAST, ctid
             ) AS rn
      FROM ticketing_system.submitted_notebooks
      WHERE notebook_submission_id IS NOT NULL
    ) d
    WHERE s.ctid = d.ctid
      AND d.rn > 1
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS submitted_notebooks_submission_id_uq
    ON ticketing_system.submitted_notebooks (notebook_submission_id)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS submitted_notebooks_l2_status_due_idx
    ON ticketing_system.submitted_notebooks (status, ack_due_at DESC)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS submitted_notebooks_submitted_at_idx
    ON ticketing_system.submitted_notebooks (submitted_at DESC)
  `);
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
      ADD COLUMN IF NOT EXISTS occurrences INTEGER NULL,
      ADD COLUMN IF NOT EXISTS approval_l1 TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l1_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l2 TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l2_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l3 TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l3_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS l1_tat_hours INTEGER NULL,
      ADD COLUMN IF NOT EXISTS l2_tat_hours INTEGER NULL,
      ADD COLUMN IF NOT EXISTS l3_tat_hours INTEGER NULL
  `);
  await client.query(`
    DELETE FROM ticketing_system.screen_submission_frequency f
    USING (
      SELECT ctid,
             ROW_NUMBER() OVER (
               PARTITION BY screen_name, department, sub_department
               ORDER BY updated_at DESC NULLS LAST, id DESC NULLS LAST, ctid
             ) AS rn
      FROM ticketing_system.screen_submission_frequency
    ) d
    WHERE f.ctid = d.ctid
      AND d.rn > 1
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS screen_submission_frequency_screen_dept_subdept_uq
    ON ticketing_system.screen_submission_frequency (screen_name, department, sub_department)
  `);
};

const ensureAcknowledgementThresholdTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.notebook_acknowledgement_threshold (
      id BIGSERIAL PRIMARY KEY,
      screen_name TEXT NOT NULL,
      department TEXT NULL,
      sub_department TEXT NULL,
      acknowledge_within_hours INTEGER NOT NULL DEFAULT 24,
      is_active BOOLEAN NOT NULL DEFAULT true,
      approval_l2 TEXT NULL,
      approval_l2_name TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (screen_name, department, sub_department)
    )
  `);

  await client.query(`
    ALTER TABLE ticketing_system.notebook_acknowledgement_threshold
      ADD COLUMN IF NOT EXISTS acknowledge_within_hours INTEGER NOT NULL DEFAULT 24,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS approval_l2 TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l2_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l3 TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l3_name TEXT NULL
  `);
  await client.query(`
    DELETE FROM ticketing_system.notebook_acknowledgement_threshold t
    USING (
      SELECT ctid,
             ROW_NUMBER() OVER (
               PARTITION BY screen_name, department, sub_department
               ORDER BY updated_at DESC NULLS LAST, id DESC NULLS LAST, ctid
             ) AS rn
      FROM ticketing_system.notebook_acknowledgement_threshold
    ) d
    WHERE t.ctid = d.ctid
      AND d.rn > 1
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS notebook_ack_threshold_screen_dept_subdept_uq
    ON ticketing_system.notebook_acknowledgement_threshold (screen_name, department, sub_department)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS notebook_ack_threshold_lookup_idx
    ON ticketing_system.notebook_acknowledgement_threshold
    (is_active, lower(trim(screen_name)), lower(trim(COALESCE(department, ''))), lower(trim(COALESCE(sub_department, ''))))
  `);
};

const getSubmissionFrequencyConfigForNotebook = async (submission) => {
  await ensureScreenFrequencyTable();
  const result = await client.query(
    `SELECT id, screen_name, department, sub_department, frequency, occurrences,
            approval_l2, approval_l2_name, approval_l3, approval_l3_name, l1_tat_hours, l2_tat_hours, l3_tat_hours
     FROM ticketing_system.screen_submission_frequency
     WHERE is_active = true
       AND LOWER(TRIM(screen_name)) = LOWER(TRIM($1))
       AND ($2::text IS NULL OR LOWER(TRIM(COALESCE(department, ''))) = LOWER(TRIM($2::text)) OR department IS NULL)
       AND ($3::text IS NULL OR LOWER(TRIM(COALESCE(sub_department, ''))) = LOWER(TRIM($3::text)) OR sub_department IS NULL)
     ORDER BY
       CASE WHEN LOWER(TRIM(COALESCE(department, ''))) = LOWER(TRIM(COALESCE($2::text, ''))) THEN 0 ELSE 1 END,
       CASE WHEN LOWER(TRIM(COALESCE(sub_department, ''))) = LOWER(TRIM(COALESCE($3::text, ''))) THEN 0 ELSE 1 END,
       id DESC
     LIMIT 1`,
    [
      submission.input_screen || submission.notebook,
      submission.department || null,
      submission.sub_department || null
    ]
  );
  return result.rows[0] || null;
};

const getSubmissionFrequencyConfigForThreshold = async ({ screenName, department, subDepartment }) => {
  await ensureScreenFrequencyTable();
  const result = await client.query(
    `SELECT id, screen_name, department, sub_department, frequency, occurrences,
            approval_l2, approval_l2_name, approval_l3, approval_l3_name, l1_tat_hours, l2_tat_hours, l3_tat_hours
     FROM ticketing_system.screen_submission_frequency
     WHERE is_active = true
       AND (
         regexp_replace(LOWER(TRIM(screen_name)), '[^a-z0-9]+', '', 'g') = regexp_replace(LOWER(TRIM($1)), '[^a-z0-9]+', '', 'g')
         OR (
           $3::text IS NOT NULL
           AND regexp_replace(LOWER(TRIM(COALESCE(sub_department, ''))), '[^a-z0-9]+', '', 'g') = regexp_replace(LOWER(TRIM($3::text)), '[^a-z0-9]+', '', 'g')
         )
       )
       AND (
         $2::text IS NULL
         OR LOWER(TRIM(COALESCE(department, ''))) = LOWER(TRIM($2::text))
         OR department IS NULL
         OR (
           $3::text IS NOT NULL
           AND regexp_replace(LOWER(TRIM(COALESCE(sub_department, ''))), '[^a-z0-9]+', '', 'g') = regexp_replace(LOWER(TRIM($3::text)), '[^a-z0-9]+', '', 'g')
         )
       )
     ORDER BY
       CASE WHEN LOWER(TRIM(screen_name)) = LOWER(TRIM($1)) THEN 0 ELSE 1 END,
       CASE WHEN LOWER(TRIM(COALESCE(department, ''))) = LOWER(TRIM(COALESCE($2::text, ''))) THEN 0 ELSE 1 END,
       CASE WHEN regexp_replace(LOWER(TRIM(COALESCE(sub_department, ''))), '[^a-z0-9]+', '', 'g') = regexp_replace(LOWER(TRIM(COALESCE($3::text, ''))), '[^a-z0-9]+', '', 'g') THEN 0 ELSE 1 END,
       id DESC
     LIMIT 1`,
    [screenName, department || null, subDepartment || null]
  );
  return result.rows[0] || null;
};

const getAcknowledgementThresholdForNotebook = async (submission) => {
  await ensureAcknowledgementThresholdTable();
  const result = await client.query(
    `SELECT id, screen_name, department, sub_department, acknowledge_within_hours, approval_l2, approval_l2_name, approval_l3, approval_l3_name
     FROM ticketing_system.notebook_acknowledgement_threshold
     WHERE is_active = true
       AND LOWER(TRIM(screen_name)) = LOWER(TRIM($1))
       AND ($2::text IS NULL OR LOWER(TRIM(COALESCE(department, ''))) = LOWER(TRIM($2::text)) OR department IS NULL)
       AND ($3::text IS NULL OR LOWER(TRIM(COALESCE(sub_department, ''))) = LOWER(TRIM($3::text)) OR sub_department IS NULL)
     ORDER BY
       CASE WHEN LOWER(TRIM(COALESCE(department, ''))) = LOWER(TRIM(COALESCE($2::text, ''))) THEN 0 ELSE 1 END,
       CASE WHEN LOWER(TRIM(COALESCE(sub_department, ''))) = LOWER(TRIM(COALESCE($3::text, ''))) THEN 0 ELSE 1 END,
       id DESC
     LIMIT 1`,
    [
      submission.input_screen || submission.notebook,
      submission.department || null,
      submission.sub_department || null
    ]
  );
  return result.rows[0] || null;
};

const resolveAcknowledgementDeadlineHours = async (submission) => {
  const acknowledgementThreshold = await getAcknowledgementThresholdForNotebook(submission);
  if (Number(acknowledgementThreshold?.acknowledge_within_hours) > 0) {
    return {
      acknowledgementThreshold,
      frequencyConfig: null,
      hours: Number(acknowledgementThreshold.acknowledge_within_hours)
    };
  }

  const frequencyConfig = await getSubmissionFrequencyConfigForNotebook(submission);
  const hours = Number(frequencyConfig?.l2_tat_hours) > 0
    ? Number(frequencyConfig.l2_tat_hours)
    : ACK_DEADLINE_HOURS;
  return { acknowledgementThreshold: null, frequencyConfig, hours };
};

const buildSubmissionId = ({ notebook, entryId, sourceTable, sourceRecordId }) => {
  const parts = [
    notebook,
    entryId || sourceRecordId || Date.now(),
    sourceTable || 'notebook'
  ].map((part) => String(part || '').trim().replace(/\s+/g, '-'));
  return `NB-${parts.filter(Boolean).join('-')}`.slice(0, 240);
};

// In-process counterpart to POST / for callers (e.g. department routes right
// after they insert their own header row) that need to log a submission
// against ticketing_system's completion tracking without an HTTP round trip.
const recordPpNotebookSubmission = async ({
  notebook,
  department,
  subDepartment,
  entryId,
  sourceSchema,
  sourceTable,
  sourceRecordId,
  submittedByUserId,
  submittedByName,
  submittedPayload
}) => {
  await ensureSubmittedNotebookTables();
  const notebookSubmissionId = buildSubmissionId({ notebook, entryId, sourceTable, sourceRecordId });

  const result = await client.query(
    `INSERT INTO ticketing_system.submitted_notebooks
     (notebook_submission_id, department, sub_department, notebook, input_screen, entry_id,
      source_schema, source_table, source_record_id, submitted_by_user_id, submitted_by_name,
      submitted_payload, submitted_at, ack_due_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb, NOW(), NOW() + INTERVAL '24 hours')
     ON CONFLICT (notebook_submission_id)
     DO UPDATE SET
       submitted_payload = EXCLUDED.submitted_payload,
       updated_at = NOW()
     RETURNING *`,
    [
      notebookSubmissionId,
      department || null,
      subDepartment || null,
      notebook,
      notebook,
      entryId || null,
      sourceSchema || null,
      sourceTable || null,
      sourceRecordId || null,
      submittedByUserId || null,
      submittedByName || null,
      toJson(submittedPayload, {})
    ]
  );

  return result.rows[0];
};

const canViewSubmission = (req, row) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  const requesterId = parsePositiveInt(req.user?.id);
  const employeeId = String(req.user?.employee_id || '').trim().toUpperCase();
  if (role === 'admin' || role === 'super admin' || role === 'superadmin' || employeeId === 'ADMIN001') return true;
  if (!requesterId) return false;
  if (row.submitted_by_user_id === requesterId) return true;
  return (
    (Array.isArray(row.l2_approver_user_ids) && row.l2_approver_user_ids.includes(requesterId)) ||
    (Array.isArray(row.l3_approver_user_ids) && row.l3_approver_user_ids.includes(requesterId))
  );
};

const getAssignedL2Users = async (ids = []) => {
  const userIds = Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );
  if (!userIds.length) return [];

  const result = await client.query(
    `SELECT id, employee_id, full_name, level, role
     FROM users.user_details
     WHERE id = ANY($1::int[])
     ORDER BY id`,
    [userIds]
  );
  return result.rows;
};

const createOverdueTicketForSubmission = async () => {
  return null;
};

const generateOverdueNotebookTickets = async () => {
  await ensureSubmittedNotebookTables();
  await ensureNotificationMetadataColumns();
  await ensureTicketApprovalColumnsForBatchCheck();

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS operator_tickets_ack_notebook_submission_uq
    ON ticketing_system.operator_tickets ((violation_details->>'notebook_submission_id'))
    WHERE ticket_reason = 'MISSING_VALUE'
      AND (violation_details->>'category') = 'MISSED_FREQUENCY'
      AND COALESCE(violation_details->>'ticket_type', '') IN ('SUBMISSION_ACKNOWLEDGEMENT', 'NOTEBOOK_ACK_OVERDUE')
      AND NULLIF(violation_details->>'notebook_submission_id', '') IS NOT NULL
  `);

  const due = await client.query(
    `SELECT *
     FROM ticketing_system.submitted_notebooks
     WHERE status = 'PENDING_ACK'
       AND ack_due_at <= NOW()
       AND overdue_ticket_id IS NULL
     ORDER BY ack_due_at ASC, id ASC
     LIMIT 100`
  );

  const created = [];
  for (const submission of due.rows) {
    const existingTicket = await client.query(
      `SELECT ticket_id
       FROM ticketing_system.operator_tickets
       WHERE ticket_reason = 'MISSING_VALUE'
         AND (violation_details->>'category') = 'MISSED_FREQUENCY'
         AND COALESCE(violation_details->>'ticket_type', '') IN ('SUBMISSION_ACKNOWLEDGEMENT', 'NOTEBOOK_ACK_OVERDUE')
         AND (
           violation_details->>'notebook_submission_id' = $1
           OR violation_details->>'submitted_notebook_id' = $2
         )
       ORDER BY created_at DESC
       LIMIT 1`,
      [submission.notebook_submission_id, String(submission.id)]
    );

    if (existingTicket.rows[0]?.ticket_id) {
      await client.query(
        `UPDATE ticketing_system.submitted_notebooks
         SET overdue_ticket_id = $1,
             overdue_ticket_created_at = COALESCE(overdue_ticket_created_at, NOW()),
             updated_at = NOW()
         WHERE id = $2
           AND overdue_ticket_id IS NULL`,
        [existingTicket.rows[0].ticket_id, submission.id]
      );
      continue;
    }

    const l2ApproverIds = (Array.isArray(submission.l2_approver_user_ids) && submission.l2_approver_user_ids.length)
      ? submission.l2_approver_user_ids
      : await getL2ApproverIds([], { useDefault: true });
    const l3ApproverIds = (Array.isArray(submission.l3_approver_user_ids) && submission.l3_approver_user_ids.length)
      ? submission.l3_approver_user_ids
      : await getL3ApproverIds([], { useDefault: true });
    const l4ApproverIds = (Array.isArray(submission.l4_approver_user_ids) && submission.l4_approver_user_ids.length)
      ? submission.l4_approver_user_ids
      : await getL4ApproverIds([], { useDefault: true });
    const l5ApproverIds = (Array.isArray(submission.l5_approver_user_ids) && submission.l5_approver_user_ids.length)
      ? submission.l5_approver_user_ids
      : await getL5ApproverIds([], { useDefault: true });
    const violationDetails = {
      category: 'MISSED_FREQUENCY',
      ticket_type: 'NOTEBOOK_ACK_OVERDUE',
      action_type: 'ACKNOWLEDGE_ONLY',
      submitted_notebook_id: submission.id,
      notebook_submission_id: submission.notebook_submission_id,
      ack_due_at: submission.ack_due_at,
      message: 'Submitted notebook was not acknowledged within the configured time.'
    };

    const ticket = await client.query(
      `INSERT INTO ticketing_system.operator_tickets
       (ticket_id, user_id, user_name, machine_name, parameter_name, actual_value, threshold_value,
        severity, status, created_at, management_field, erp_product_code, ticket_reason, ticket_type,
        violation_details, approval_l2_user_ids, approval_l3_user_ids, approval_l4_user_ids, approval_l5_user_ids,
        tat_current_level, l2_tat_due_at, l3_tat_due_at)
       VALUES (
         'TK-' || LPAD(nextval('"ticketing_system"."ticket_seq"')::text, 4, '0'),
         $1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb,
         'High', 'In Progress', NOW(), $7, $8, 'MISSING_VALUE', 'REVIEW',
         $9::jsonb, $10::int[], $11::int[], $12::int[], $13::int[], 'L2', NOW(), NULL
       )
       RETURNING *`,
      [
        submission.submitted_by_user_id,
        submission.submitted_by_name,
        submission.input_screen || submission.notebook,
        toJson(['Acknowledgement overdue'], []),
        toJson(submission.submitted_payload || {}, {}),
        toJson({ acknowledge_by: submission.ack_due_at }, {}),
        submission.department,
        submission.sub_department,
        toJson(violationDetails, {}),
        l2ApproverIds,
        l3ApproverIds,
        l4ApproverIds,
        l5ApproverIds
      ]
    );

    const inserted = ticket.rows[0];
    await client.query(
      `UPDATE ticketing_system.submitted_notebooks
       SET overdue_ticket_id = $1,
           overdue_ticket_created_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [inserted.ticket_id, submission.id]
    );

    await client.query(
      `INSERT INTO ticketing_system.ticket_logs
       (ticket_id, action, performed_by, role, created_at)
       VALUES ($1, 'ACK_REVIEW_CREATED', 'System', 'System', NOW())`,
      [inserted.ticket_id]
    );

    const ackNotebookName = submission.input_screen || submission.notebook;
    for (const { level, userIds } of [
      { level: 'L2', userIds: l2ApproverIds },
      { level: 'L3', userIds: l3ApproverIds },
      { level: 'L4', userIds: l4ApproverIds },
      { level: 'L5', userIds: l5ApproverIds }
    ]) {
      if (!Array.isArray(userIds) || !userIds.length) continue;
      await createNotificationsForUsers(userIds, {
        ticketId: inserted.ticket_id,
        type: 'NOTEBOOK_ACK_OVERDUE',
        category: 'Tickets',
        priority: 'High',
        title: `Acknowledgement overdue — ${ackNotebookName} (${level})`,
        body: `${ackNotebookName} is waiting for your ${level} acknowledgement.`,
        linkUrl: `/supervisor-tickets/${inserted.ticket_id}`,
        payload: {
          ticket_id: inserted.ticket_id,
          submitted_notebook_id: submission.id,
          notebook_submission_id: submission.notebook_submission_id,
          action_type: 'ACKNOWLEDGE_ONLY',
          level
        }
      });
    }

    created.push(inserted);
  }

  return created;
};

router.use(auth);

router.post('/acknowledgement-thresholds', async (req, res, next) => {
  try {
    await ensureAcknowledgementThresholdTable();
    const screenName = cleanText(req.body?.screen_name || req.body?.notebook || req.body?.input_screen);
    const department = cleanText(req.body?.department);
    const subDepartment = cleanText(req.body?.sub_department || req.body?.subDepartment);
    const acknowledgeWithinHours = parseTatHours(
      req.body?.acknowledge_within_hours ?? req.body?.l2_tat_hours ?? req.body?.tat_hours
    );

    if (!screenName || !acknowledgeWithinHours) {
      return res.status(400).json({
        message: 'screen_name and acknowledge_within_hours are required'
      });
    }

    const submissionThreshold = await getSubmissionFrequencyConfigForThreshold({
      screenName,
      department,
      subDepartment
    });

    if (!submissionThreshold) {
      return res.status(400).json({
        message: 'Create a submission threshold first before creating an acknowledgement threshold',
        required_submission_threshold: {
          screen_name: screenName,
          department,
          sub_department: subDepartment
        }
      });
    }

    const result = await client.query(
      `INSERT INTO ticketing_system.notebook_acknowledgement_threshold
       (screen_name, department, sub_department, acknowledge_within_hours, is_active, approval_l2, approval_l2_name, approval_l3, approval_l3_name, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (screen_name, department, sub_department)
       DO UPDATE SET
         acknowledge_within_hours = EXCLUDED.acknowledge_within_hours,
         is_active = EXCLUDED.is_active,
         approval_l2 = EXCLUDED.approval_l2,
         approval_l2_name = EXCLUDED.approval_l2_name,
         approval_l3 = EXCLUDED.approval_l3,
         approval_l3_name = EXCLUDED.approval_l3_name,
         updated_at = NOW()
       RETURNING *`,
      [
        screenName,
        department,
        subDepartment,
        acknowledgeWithinHours,
        req.body?.is_active !== undefined ? Boolean(req.body.is_active) : true,
        cleanText(req.body?.approval_l2),
        cleanText(req.body?.approval_l2_name),
        cleanText(req.body?.approval_l3),
        cleanText(req.body?.approval_l3_name)
      ]
    );

    return res.status(200).json({
      message: 'Acknowledgement threshold saved successfully',
      submission_threshold: submissionThreshold,
      acknowledgement_threshold: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

router.get('/acknowledgement-thresholds', async (req, res, next) => {
  try {
    await ensureAcknowledgementThresholdTable();
    const result = await client.query(
      `SELECT id, screen_name, department, sub_department, acknowledge_within_hours,
              is_active, approval_l2, approval_l2_name, approval_l3, approval_l3_name, created_at, updated_at
       FROM ticketing_system.notebook_acknowledgement_threshold
       ORDER BY screen_name, department NULLS FIRST, sub_department NULLS FIRST`
    );

    return res.status(200).json({
      acknowledgement_thresholds: result.rows,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});

router.get('/pp-batch-config', async (req, res, next) => {
  try {
    const config = await getPpBatchConfig();
    const subDepartments = await getPpBatchSubDepartments();
    return res.status(200).json({ config, sub_departments: subDepartments });
  } catch (error) {
    next(error);
  }
});

router.post('/pp-batch-config', async (req, res, next) => {
  try {
    await ensurePpBatchConfigTable();

    const completionThresholdHours = parseTatHours(req.body?.completion_threshold_hours);
    if (!completionThresholdHours) {
      return res.status(400).json({ message: 'completion_threshold_hours must be a positive integer' });
    }

    const l2TatHours = parseTatHours(req.body?.l2_tat_hours, null);
    const l3TatHours = parseTatHours(req.body?.l3_tat_hours, null);
    const l4TatHours = parseTatHours(req.body?.l4_tat_hours, null);
    const l5TatHours = parseTatHours(req.body?.l5_tat_hours, null);
    const toUserIdArray = (value) =>
      toArray(value).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    const approvalL1UserIds = toUserIdArray(req.body?.approval_l1_user_ids);
    const approvalL2UserIds = toUserIdArray(req.body?.approval_l2_user_ids);
    const approvalL3UserIds = toUserIdArray(req.body?.approval_l3_user_ids);
    const approvalL4UserIds = toUserIdArray(req.body?.approval_l4_user_ids);
    const approvalL5UserIds = toUserIdArray(req.body?.approval_l5_user_ids);
    const isActive = req.body?.is_active === undefined ? true : Boolean(req.body.is_active);

    const result = await client.query(
      `INSERT INTO ticketing_system.pp_batch_config
       (config_key, completion_threshold_hours, l2_tat_hours, l3_tat_hours, l4_tat_hours, l5_tat_hours,
        approval_l1_user_ids, approval_l2_user_ids, approval_l3_user_ids, approval_l4_user_ids, approval_l5_user_ids,
        is_active, updated_at)
       VALUES ('global', $1, $2, $3, $4, $5, $6::int[], $7::int[], $8::int[], $9::int[], $10::int[], $11, NOW())
       ON CONFLICT (config_key)
       DO UPDATE SET
         completion_threshold_hours = EXCLUDED.completion_threshold_hours,
         l2_tat_hours = EXCLUDED.l2_tat_hours,
         l3_tat_hours = EXCLUDED.l3_tat_hours,
         l4_tat_hours = EXCLUDED.l4_tat_hours,
         l5_tat_hours = EXCLUDED.l5_tat_hours,
         approval_l1_user_ids = EXCLUDED.approval_l1_user_ids,
         approval_l2_user_ids = EXCLUDED.approval_l2_user_ids,
         approval_l3_user_ids = EXCLUDED.approval_l3_user_ids,
         approval_l4_user_ids = EXCLUDED.approval_l4_user_ids,
         approval_l5_user_ids = EXCLUDED.approval_l5_user_ids,
         is_active = EXCLUDED.is_active,
         updated_at = NOW()
       RETURNING *`,
      [
        completionThresholdHours, l2TatHours, l3TatHours, l4TatHours, l5TatHours,
        approvalL1UserIds, approvalL2UserIds, approvalL3UserIds, approvalL4UserIds, approvalL5UserIds,
        isActive
      ]
    );

    return res.status(200).json({ message: 'PP batch config saved successfully', config: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post('/pp-batch-completion-check', async (req, res, next) => {
  try {
    const { created, expired } = await runPpBatchCompletionCheck();
    return res.status(200).json({
      success: true,
      created_count: created.length,
      expired_count: expired.length,
      tickets: created,
      expired_tickets: expired
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    await ensureSubmittedNotebookTables();
    await ensureAcknowledgementThresholdTable();
    const notebook = cleanText(req.body?.notebook || req.body?.title || req.body?.input_screen);
    if (!notebook) return res.status(400).json({ message: 'notebook is required' });

    const submittedByUserId = parsePositiveInt(req.body?.submitted_by_user_id) || parsePositiveInt(req.user?.id);
    const submittedByName = cleanText(req.body?.submitted_by_name) || await getUserDisplayName(submittedByUserId) || cleanText(req.user?.employee_id);

    const entryId = cleanText(req.body?.entry_id);
    const sourceTable = cleanText(req.body?.source_table);
    const sourceRecordId = cleanText(req.body?.source_record_id || req.body?.record_id);
    const notebookSubmissionId = cleanText(req.body?.notebook_submission_id) || buildSubmissionId({
      notebook,
      entryId,
      sourceTable,
      sourceRecordId
    });

    const submittedAt = cleanText(req.body?.submitted_at);
    let ackDueAt = cleanText(req.body?.ack_due_at);
    const payload = req.body?.submitted_payload || req.body?.fields || req.body?.payload || {};

    // Always resolve the per-screen Submission Threshold config (previously only fetched to
    // compute ack_due_at, and only when the caller hadn't already supplied one) — its
    // approval_l2/approval_l3 columns are the actual "Checked by" assignment configured on the
    // Submission Threshold page, and were never being read into l2_approver_user_ids at all, so
    // every submission's L2 approver stayed an empty array unless the caller happened to pass
    // one explicitly in the request body.
    const { hours: acknowledgementHours, acknowledgementThreshold } = await resolveAcknowledgementDeadlineHours({
      input_screen: cleanText(req.body?.input_screen) || notebook,
      notebook,
      department: cleanText(req.body?.department),
      sub_department: cleanText(req.body?.sub_department || req.body?.subDepartment)
    });

    if (!ackDueAt) {
      const baseSubmittedAt = submittedAt ? new Date(submittedAt) : new Date();
      if (!Number.isNaN(baseSubmittedAt.getTime())) {
        ackDueAt = new Date(baseSubmittedAt.getTime() + acknowledgementHours * 60 * 60 * 1000).toISOString();
      }
    }

    const l2ApproverUserIds = await getL2ApproverIds(
      req.body?.l2_approver_user_ids ||
      req.body?.approval_l2_user_ids ||
      req.body?.l2_approver_employee_ids ||
      req.body?.approval_l2_employee_ids ||
      req.body?.l2_approver_employee_id ||
      req.body?.approval_l2_employee_id ||
      req.body?.assigned_l2 ||
      (acknowledgementThreshold?.approval_l2 ? acknowledgementThreshold.approval_l2.split(',').map((value) => value.trim()).filter(Boolean) : []) ||
      [],
      { useDefault: false }
    );
    const l3ApproverUserIds = await getL3ApproverIds(
      req.body?.l3_approver_user_ids ||
      req.body?.approval_l3_user_ids ||
      req.body?.l3_approver_employee_ids ||
      req.body?.approval_l3_employee_ids ||
      req.body?.l3_approver_employee_id ||
      req.body?.approval_l3_employee_id ||
      req.body?.assigned_l3 ||
      (acknowledgementThreshold?.approval_l3 ? acknowledgementThreshold.approval_l3.split(',').map((value) => value.trim()).filter(Boolean) : []) ||
      [],
      { useDefault: false }
    );

    const result = await client.query(
      `INSERT INTO ticketing_system.submitted_notebooks
       (notebook_submission_id, department, sub_department, notebook, input_screen, entry_id,
        source_schema, source_table, source_record_id, submitted_by_user_id, submitted_by_name,
        submitted_payload, l2_approver_user_ids, l3_approver_user_ids, submitted_at, ack_due_at)
       VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::int[],$14::int[],
         COALESCE($15::timestamptz, NOW()),
         COALESCE($16::timestamptz, COALESCE($15::timestamptz, NOW()) + INTERVAL '24 hours')
       )
       ON CONFLICT (notebook_submission_id)
       DO UPDATE SET
         submitted_payload = EXCLUDED.submitted_payload,
         l2_approver_user_ids = EXCLUDED.l2_approver_user_ids,
         l3_approver_user_ids = EXCLUDED.l3_approver_user_ids,
         updated_at = NOW()
       RETURNING *`,
      [
        notebookSubmissionId,
        cleanText(req.body?.department),
        cleanText(req.body?.sub_department || req.body?.subDepartment),
        notebook,
        cleanText(req.body?.input_screen) || notebook,
        entryId,
        cleanText(req.body?.source_schema),
        sourceTable,
        sourceRecordId,
        submittedByUserId,
        submittedByName,
        toJson(payload, {}),
        l2ApproverUserIds,
        l3ApproverUserIds,
        submittedAt,
        ackDueAt
      ]
    );

    return res.status(201).json({ success: true, submitted_notebook: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    await ensureSubmittedNotebookTables();
    const requesterId = parsePositiveInt(req.user?.id);
    const page = parsePositiveInt(req.query.page, 1);
    const requestedLimit = parsePositiveInt(req.query.limit, 20);
    const limit = Math.min(requestedLimit, MAX_LIMIT);
    const offset = (page - 1) * limit;
    const status = cleanText(req.query.status);
    const department = cleanText(req.query.department);
    const subDepartment = cleanText(req.query.sub_department || req.query.subDepartment);

    const where = [];
    const params = [];
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    if (department) {
      params.push(department);
      where.push(`LOWER(TRIM(COALESCE(department, ''))) = LOWER(TRIM($${params.length}))`);
    }
    if (subDepartment) {
      params.push(subDepartment);
      where.push(`LOWER(TRIM(COALESCE(sub_department, ''))) = LOWER(TRIM($${params.length}))`);
    }

    const role = String(req.user?.role || '').trim().toLowerCase();
    const employeeId = String(req.user?.employee_id || '').trim().toUpperCase();
    const canViewAll = role === 'admin' || role === 'super admin' || role === 'superadmin' || employeeId === 'ADMIN001';
    if (!canViewAll) {
      params.push(requesterId);
      where.push(`($${params.length} = ANY(COALESCE(l2_approver_user_ids, ARRAY[]::int[])) OR $${params.length} = ANY(COALESCE(l3_approver_user_ids, ARRAY[]::int[])) OR submitted_by_user_id = $${params.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await client.query(
      `SELECT COUNT(*)::int AS total FROM ticketing_system.submitted_notebooks ${whereSql}`,
      params
    );

    params.push(limit, offset);
    const rows = await client.query(
      `SELECT id, notebook_submission_id, department, sub_department, notebook, input_screen, entry_id,
              submitted_by_user_id, submitted_by_name, l2_approver_user_ids, l3_approver_user_ids, status,
              submitted_at, ack_due_at, acknowledged_at, acknowledged_by_name, acknowledgement_note,
              overdue_ticket_id, overdue_ticket_created_at, created_at, updated_at
       FROM ticketing_system.submitted_notebooks
       ${whereSql}
       ORDER BY submitted_at DESC, id DESC
       LIMIT $${params.length - 1}
       OFFSET $${params.length}`,
      params
    );
    const assignedById = new Map();
    const allApproverIds = Array.from(new Set(rows.rows.flatMap((row) => [
      ...(row.l2_approver_user_ids || []),
      ...(row.l3_approver_user_ids || [])
    ])));
    if (allApproverIds.length) {
      const assignedUsers = await getAssignedL2Users(allApproverIds);
      for (const user of assignedUsers) assignedById.set(Number(user.id), user);
    }
    const submittedNotebooks = rows.rows.map((row) => ({
      ...row,
      assigned_l2_users: (row.l2_approver_user_ids || [])
        .map((id) => assignedById.get(Number(id)))
        .filter(Boolean),
      assigned_l3_users: (row.l3_approver_user_ids || [])
        .map((id) => assignedById.get(Number(id)))
        .filter(Boolean)
    }));

    return res.status(200).json({
      submitted_notebooks: submittedNotebooks,
      data: submittedNotebooks,
      pagination: {
        page,
        limit,
        total: count.rows[0]?.total || 0
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/generate-overdue-tickets', async (req, res, next) => {
  try {
    const created = await generateOverdueNotebookTickets();
    return res.status(200).json({ success: true, created_count: created.length, tickets: created });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    await ensureSubmittedNotebookTables();
    const value = cleanText(req.params.id);
    const result = await client.query(
      `SELECT *
       FROM ticketing_system.submitted_notebooks
       WHERE id::text = $1 OR notebook_submission_id = $1`,
      [value]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Submitted notebook not found' });
    const row = result.rows[0];
    if (!canViewSubmission(req, row)) return res.status(403).json({ message: 'You are not authorized to view this submitted notebook' });
    return res.status(200).json({
      submitted_notebook: {
        ...row,
        assigned_l2_users: await getAssignedL2Users(row.l2_approver_user_ids),
        assigned_l3_users: await getAssignedL2Users(row.l3_approver_user_ids)
      }
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/acknowledge', async (req, res, next) => {
  try {
    await ensureSubmittedNotebookTables();
    const value = cleanText(req.params.id);
    const current = await client.query(
      `SELECT *
       FROM ticketing_system.submitted_notebooks
       WHERE id::text = $1 OR notebook_submission_id = $1`,
      [value]
    );
    if (!current.rows.length) return res.status(404).json({ message: 'Submitted notebook not found' });
    const row = current.rows[0];
    if (!canViewSubmission(req, row)) return res.status(403).json({ message: 'You are not authorized to acknowledge this submitted notebook' });

    const requesterId = parsePositiveInt(req.user?.id);
    const requesterName = await getUserDisplayName(requesterId) || cleanText(req.user?.employee_id) || 'L2 User';
    const updated = await client.query(
      `UPDATE ticketing_system.submitted_notebooks
       SET status = 'ACKNOWLEDGED',
           acknowledged_at = NOW(),
           acknowledged_by_user_id = $2,
           acknowledged_by_name = $3,
           acknowledgement_note = $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [row.id, requesterId, requesterName, cleanText(req.body?.note || req.body?.acknowledgement_note)]
    );

    if (row.overdue_ticket_id) {
      await client.query(
        `UPDATE ticketing_system.operator_tickets
         SET status = 'Closed',
             tat_current_level = COALESCE(tat_current_level, 'L2')
         WHERE ticket_id = $1
           AND status <> 'Closed'`,
        [row.overdue_ticket_id]
      );
      await client.query(
        `INSERT INTO ticketing_system.ticket_logs
         (ticket_id, action, performed_by, role, created_at)
         VALUES ($1, 'ACKNOWLEDGED', $2, $3, NOW())`,
        [row.overdue_ticket_id, requesterName, req.user?.role || 'L2']
      );
    }

    return res.status(200).json({ success: true, submitted_notebook: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = {
  router,
  ensureSubmittedNotebookTables,
  ensureAcknowledgementThresholdTable,
  generateOverdueNotebookTickets,
  recordPpNotebookSubmission,
  runPpBatchCompletionCheck
};

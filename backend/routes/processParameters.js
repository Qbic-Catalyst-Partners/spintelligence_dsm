const express = require('express');
const client = require('../connection');
const { generateTicketId } = require('../utils/ticketId');
const {
  peekNextProcessParameterEntryId,
  normalizeProcessParameterEntryId,
  getExistingCountNameForEntryId,
  createProcessParameterEntryId,
} = require('../utils/processParameterEntryId');
const { getPpNotebookThresholds } = require('./submittedNotebooks.routes');
const { createNotificationsForUsers } = require('../utils/notifications');

const router = express.Router();

// A PP batch moves through 4 stages, tracked on this one master row:
//   in_progress      - created, still waiting on one or more departments
//   pending_approval - every department has submitted; waiting on L4
//   active           - L4 approved it; usable for exactly one Wheel Change
//   inactive         - a Wheel Change has been saved against it (locked -
//                      reverts to active if that Wheel Change is rejected)
//   rejected         - a per-department reject sent one department's data
//                      back (POST .../departments/:department_key/reject
//                      deletes that department's row so it can be
//                      resubmitted; the reason is kept in review_remarks).
//                      Automatically returns to pending_approval, same as
//                      in_progress, once every department has a row again
//                      (see refreshProcessParameterStatus).

// One entry per department/type screen that shares the PP entry_id system.
// Each maps to the table + column that already exists today; nothing here
// creates new child tables or touches their schema. idColumn is each table's
// own primary key (they're not all named the same).
const PP_DEPARTMENTS = [
  { key: 'mixing', label: 'Mixing', table: 'mixing.mixing_qc_header', idColumn: 'qc_id' },
  { key: 'blowroom', label: 'Blowroom', table: 'blowroom.blowroom_header', idColumn: 'br_id' },
  { key: 'carding', label: 'Carding', table: 'carding.carding_qc_header', idColumn: 'qc_id' },
  // Breaker and Finisher both save into this same table (POST /drawframe/header),
  // told apart only by entry_scope - drawframe.finisher_drawing_inspection is a
  // stale table the app no longer writes to, so checking it here always read as
  // "never submitted" even when Finisher genuinely was.
  { key: 'drawframe_breaker', label: 'Drawframe (Breaker)', table: 'drawframe.drawframe_qc_header', idColumn: 'ins_id', extraWhere: "AND entry_scope = 'breaker'" },
  { key: 'drawframe_finisher', label: 'Drawframe (Finisher)', table: 'drawframe.drawframe_qc_header', idColumn: 'ins_id', extraWhere: "AND entry_scope = 'finisher'" },
  { key: 'simplex', label: 'Simplex', table: 'simplex.simplex_process_parameter', idColumn: 'id' },
  { key: 'spinning', label: 'Spinning', table: 'spinning.spinning_qc_header', idColumn: 'qc_id' },
  { key: 'autoconer', label: 'Autoconer', table: 'autoconer.autoconer_process_parameter', idColumn: 'id' },
  { key: 'autoconer_q2', label: 'Autoconer Q2', table: 'autoconer.autoconer_q2_inspection', idColumn: 'id' },
  { key: 'autoconer_q3', label: 'Autoconer Q3', table: 'autoconer.autoconer_q3_inspection', idColumn: 'id' },
  // Built by another developer, table not live yet as of this writing - kept
  // in the list deliberately (not exempted): a PP can't reach
  // pending_approval until every listed department (including this one) has
  // a submitted row, so completion simply never reaches 100% until Q4 ships.
  { key: 'autoconer_q4', label: 'Autoconer Q4', table: 'autoconer.autoconer_q4_inspection', idColumn: 'id' },
];

const PP_DEPARTMENTS_BY_KEY = new Map(PP_DEPARTMENTS.map((dept) => [dept.key, dept]));

// Maps this file's PP_DEPARTMENTS keys onto the notebook labels used by
// submittedNotebooks.routes.js's pp_notebook_threshold config (these are two
// separate PP-tracking systems built at different times - this bridges them
// so the combined PP Threshold + Approval config screen's per-notebook L4
// Approver/Approve-Within-Hours can drive this file's PP Approval ticket).
const PP_DEPARTMENT_KEY_TO_NOTEBOOK_LABEL = {
  mixing: 'Mixing Process Parameter',
  blowroom: 'Blowroom Process Parameter',
  carding: 'Carding Process Parameter',
  drawframe_breaker: 'Drawframe Process Parameter (Breaker)',
  drawframe_finisher: 'Drawframe Process Parameter (Finisher)',
  simplex: 'Simplex Process Parameter',
  spinning: 'Spinning Process Parameter',
  autoconer: 'Autoconer Process Parameter',
  autoconer_q2: 'Autoconer Process Parameter (Q2)',
  autoconer_q3: 'Autoconer Process Parameter (Q3)',
  autoconer_q4: 'Autoconer Process Parameter (Q4)',
};

// Finds whichever participating department's row for this entry_id has the
// latest created_at - i.e. the one that just completed the batch and
// triggered pending_approval. Its per-notebook config (if any) governs the
// L4 Approver/Approve-Within-Hours for the resulting PP Approval ticket.
const getLastCompletedDepartmentKey = async (entry_id) => {
  const existingDepartments = await getExistingPpDepartments();
  const unionQuery = existingDepartments.map(
    (dept) => `SELECT '${dept.key}' AS dept_key, created_at FROM ${dept.table} WHERE entry_id = $1 ${dept.extraWhere || ''}`
  ).join(' UNION ALL ');
  if (!unionQuery) return null;

  const result = await client.query(
    `${unionQuery} ORDER BY created_at DESC NULLS LAST LIMIT 1`,
    [entry_id]
  );
  return result.rows[0]?.dept_key || null;
};

// Cached per-process since table existence only changes via a deploy, not
// per-request.
let tableExistsCache = null;
const getExistingPpDepartments = async () => {
  if (tableExistsCache) return PP_DEPARTMENTS.filter((dept) => tableExistsCache.has(dept.table));

  const result = await client.query(
    `SELECT table_ref, to_regclass(table_ref) IS NOT NULL AS exists
     FROM unnest($1::text[]) AS table_ref`,
    [PP_DEPARTMENTS.map((dept) => dept.table)]
  );
  tableExistsCache = new Set(result.rows.filter((row) => row.exists).map((row) => row.table_ref));
  return PP_DEPARTMENTS.filter((dept) => tableExistsCache.has(dept.table));
};

// Returns { mixing: true, blowroom: false, ... } for one entry_id by checking
// whether any row exists in each department's table for it - a single query
// via UNION ALL rather than one round trip per department. A department
// whose table doesn't exist yet (Q4 pre-launch) is simply never "true".
const getCompletionStatusForEntryIds = async (entryIds) => {
  if (!entryIds.length) return new Map();

  const existingDepartments = await getExistingPpDepartments();
  const unionQuery = existingDepartments.map(
    (dept) => `SELECT '${dept.key}' AS dept_key, entry_id FROM ${dept.table} WHERE entry_id = ANY($1::text[]) ${dept.extraWhere || ''}`
  ).join(' UNION ALL ');

  const result = unionQuery ? await client.query(unionQuery, [entryIds]) : { rows: [] };

  const completedByEntryId = new Map(entryIds.map((id) => [id, new Set()]));
  for (const row of result.rows) {
    completedByEntryId.get(row.entry_id)?.add(row.dept_key);
  }

  const statusByEntryId = new Map();
  for (const entryId of entryIds) {
    const completedKeys = completedByEntryId.get(entryId) || new Set();
    const status = {};
    for (const dept of PP_DEPARTMENTS) {
      status[dept.key] = completedKeys.has(dept.key);
    }
    statusByEntryId.set(entryId, status);
  }
  return statusByEntryId;
};

// Not every department table tracks machine_no/operator (Blowroom and the
// Autoconer Q2/Q3/Q4 inspection tables don't), so this pulls whichever value
// is available from whichever department has it, per PP id - same
// best-effort approach as count_name's cross-department lookup above. Used
// by the PP Approvals queue, which otherwise has no way to show either field
// since GET /approvals only ever returned the master row + completion flags.
const MACHINE_NO_TABLES = [
  'carding.carding_qc_header',
  'simplex.simplex_process_parameter',
  'spinning.spinning_qc_header',
  'autoconer.autoconer_process_parameter',
];
const OPERATOR_TABLES = [
  'mixing.mixing_qc_header',
  'drawframe.drawframe_qc_header',
  'blowroom.blowroom_header',
  'carding.carding_qc_header',
];

const getPpDetailFieldsForEntryIds = async (entryIds) => {
  const detailByEntryId = new Map(entryIds.map((id) => [id, { machine_no: null, operator: null }]));
  if (!entryIds.length) return detailByEntryId;

  // machine_no's column type isn't consistent across departments (integer in
  // some, varchar in others) - UNION ALL requires matching types, so cast
  // explicitly rather than let Postgres try (and fail) to reconcile them.
  const machineQuery = MACHINE_NO_TABLES.map(
    (table) => `SELECT entry_id, machine_no::text AS machine_no FROM ${table} WHERE entry_id = ANY($1::text[]) AND machine_no IS NOT NULL`
  ).join(' UNION ALL ');
  const operatorQuery = OPERATOR_TABLES.map(
    (table) => `SELECT entry_id, operator::text AS operator FROM ${table} WHERE entry_id = ANY($1::text[]) AND operator IS NOT NULL`
  ).join(' UNION ALL ');

  const [machineResult, operatorResult] = await Promise.all([
    client.query(machineQuery, [entryIds]),
    client.query(operatorQuery, [entryIds]),
  ]);

  for (const row of machineResult.rows) {
    const detail = detailByEntryId.get(row.entry_id);
    if (detail && !detail.machine_no) detail.machine_no = row.machine_no;
  }
  for (const row of operatorResult.rows) {
    const detail = detailByEntryId.get(row.entry_id);
    if (detail && !detail.operator) detail.operator = row.operator;
  }

  return detailByEntryId;
};

// Full submitted row per department for one PP id, not just the completion
// flag/machine_no/operator slices above - the PP Approvals preview needs to
// show everything a department actually entered, not just whether it's done.
// One query per department (rather than a UNION, since each table's columns
// differ entirely) but only for a single entry_id at a time, so this is fine
// to call per-row rather than batched like the list-level helpers above.
const getPpFullDetailsForEntryId = async (entry_id) => {
  const existingDepartments = await getExistingPpDepartments();
  const results = await Promise.all(
    existingDepartments.map(async (dept) => {
      const result = await client.query(
        `SELECT * FROM ${dept.table} WHERE entry_id = $1 ${dept.extraWhere || ''} LIMIT 1`,
        [entry_id]
      );
      const row = result.rows[0] || null;

      // Mixing's actual entered values (percentage, lot no, cut length,
      // tenacity, elongation, merge no) don't live on mixing_qc_header at
      // all - they're in a separate mixing_qc_blends child table, one row
      // per blend, joined by qc_id. Without this, Mixing's header-only row
      // has nothing to show in the PP Approvals preview but entry_id/count/
      // consignee/status.
      if (dept.key === 'mixing' && row?.qc_id) {
        const blendsResult = await client.query(
          `SELECT blend_no, percentage, lot_no, cut_length, tenacity, elongation, merge_no
           FROM mixing.mixing_qc_blends WHERE qc_id = $1 ORDER BY blend_no`,
          [row.qc_id]
        );
        blendsResult.rows.forEach((blend) => {
          const suffix = blend.blend_no ?? '';
          row[`blend_${suffix}_percentage`] = blend.percentage;
          row[`blend_${suffix}_lot_no`] = blend.lot_no;
          row[`blend_${suffix}_cut_length`] = blend.cut_length;
          row[`blend_${suffix}_tenacity`] = blend.tenacity;
          row[`blend_${suffix}_elongation`] = blend.elongation;
          row[`blend_${suffix}_merge_no`] = blend.merge_no;
        });
      }

      return [dept.key, row];
    })
  );
  return Object.fromEntries(results);
};

// Defensive schema guard for process_parameters.master - mirrors
// processParameterEntryId.js's ensureProcessParameterMasterRow (which also
// inserts the entry_id's own row) minus the insert, since callers here only
// need the table/columns to exist before querying across every entry_id.
// This was previously called but never actually defined anywhere in the
// codebase, silently breaking runPpApprovalOverdueCheck below on every run
// (caught by server.js's try/catch and logged as "overdue worker skipped" -
// meaning L4 PP Approval TAT tickets were never being raised at all).
const ensureProcessParameterMasterTable = async () => {
  await client.query('CREATE SCHEMA IF NOT EXISTS process_parameters');
  await client.query(`
    CREATE TABLE IF NOT EXISTS process_parameters.master (
      id BIGSERIAL PRIMARY KEY,
      entry_id TEXT NOT NULL UNIQUE,
      created_by_user_id INTEGER NULL,
      created_by_name TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    ALTER TABLE process_parameters.master
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'in_progress',
      ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS review_remarks TEXT,
      ADD COLUMN IF NOT EXISTS pending_approval_notebook_label TEXT
  `);
};

// Defensive schema guard for the PP-Approval-specific columns on
// ticketing_system.operator_tickets. connection.js's own startup migration
// already creates most of operator_tickets' base columns, but not these -
// like ensureProcessParameterMasterTable above, this was called but never
// defined, so every closePpApprovalTicket call (i.e. every real Approve/
// Reject click) threw here and aborted after the process_parameters.master
// row had already been updated - the PP itself was correctly
// approved/rejected, but the matching PP_APPROVAL ticket was never closed
// and the request came back as a 500 to the reviewer.
const ensureApprovalTicketSchema = async () => {
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
      ADD COLUMN IF NOT EXISTS ticket_kind TEXT,
      ADD COLUMN IF NOT EXISTS tat_current_level TEXT,
      ADD COLUMN IF NOT EXISTS approval_l4_user_ids INTEGER[],
      ADD COLUMN IF NOT EXISTS l4_tat_due_at TIMESTAMPTZ
  `);
  // Backstops createPpApprovalTicket's/runPpApprovalTatCheck's own
  // check-then-insert dedup (both just SELECT for an existing open ticket
  // before INSERTing, with nothing stopping two near-simultaneous calls -
  // e.g. two backend instances - from both passing that check). Distinct
  // from entry_id alone by COALESCE(...->>'escalation_of", '') so the one
  // original ticket and its one reminder-per-original can coexist, matching
  // how the app's own dedup logic already treats them as separate things.
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS operator_tickets_pp_approval_open_uq
    ON ticketing_system.operator_tickets (
      (violation_details->>'entry_id'),
      (COALESCE(violation_details->>'escalation_of', ''))
    )
    WHERE ticket_type = 'PP_APPROVAL' AND status <> 'Closed'
  `);
};

// Per-department accept/reject decisions within one PP id's approval review -
// separate from process_parameters.master's single overall status, which
// only tracks the PP id as a whole. One row per (entry_id, department_key);
// re-deciding the same department just overwrites its previous decision.
const ensureDepartmentDecisionsTable = async () => {
  await client.query('CREATE SCHEMA IF NOT EXISTS process_parameters');
  await client.query(`
    CREATE TABLE IF NOT EXISTS process_parameters.department_decisions (
      entry_id TEXT NOT NULL,
      department_key TEXT NOT NULL,
      decision TEXT NOT NULL CHECK (decision IN ('accepted', 'rejected')),
      reason TEXT,
      decided_by TEXT,
      decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (entry_id, department_key)
    )
  `);
};

// { PP-0014: { mixing: { decision: 'accepted', reason: null, decided_by: '...', decided_at: ... } } }
const getDepartmentDecisionsForEntryIds = async (entryIds) => {
  const decisionsByEntryId = new Map(entryIds.map((id) => [id, {}]));
  if (!entryIds.length) return decisionsByEntryId;

  const result = await client.query(
    `SELECT * FROM process_parameters.department_decisions WHERE entry_id = ANY($1::text[])`,
    [entryIds]
  );
  for (const row of result.rows) {
    const decisions = decisionsByEntryId.get(row.entry_id);
    if (decisions) decisions[row.department_key] = row;
  }
  return decisionsByEntryId;
};

// Auto-advances in_progress -> pending_approval the moment every department
// has a submitted row. Never touches active/inactive (those only change via
// the explicit approve/reject-by-L4 and Wheel Change save/reject actions
// below) - only in_progress is eligible to auto-advance. Called reactively
// whenever PP status is read/listed, rather than hooked into every
// department's own save route.
//
// This used to raise the PP Approval ticket right here, the moment the PP
// became ready - but a ticket is supposed to mean "L4 missed this," not
// "this is now pending," matching how Acknowledgement already only raises a
// ticket once its own deadline has passed. `updated_at` (stamped below) is
// the pending_approval start time and `pending_approval_notebook_label` is
// kept so the later overdue check can still resolve the right notebook's L4
// approvers/TAT - runPpApprovalOverdueCheck (below) is what actually raises
// the ticket, once truly overdue.
const refreshProcessParameterStatus = async (entry_id) => {
  const current = await client.query(
    `SELECT status FROM process_parameters.master WHERE entry_id = $1`,
    [entry_id]
  );
  const status = current.rows[0]?.status;
  // 'rejected' now IS re-checked alongside 'in_progress' - unlike the old
  // whole-PP reject (which left every department's row untouched, so
  // "does a row exist" was already true before rejection and this would've
  // flipped straight back with no real resubmission), the per-department
  // reject flow (POST .../departments/:department_key/reject) actually
  // DELETEs that one department's row, so completion genuinely goes back to
  // incomplete and this only fires again once it's genuinely been redone.
  if (status !== 'in_progress' && status !== 'rejected') return status || null;

  const completion = (await getCompletionStatusForEntryIds([entry_id])).get(entry_id) || {};
  const allComplete = Object.keys(completion).length > 0 && Object.values(completion).every(Boolean);
  if (!allComplete) return status;

  const lastCompletedDeptKey = await getLastCompletedDepartmentKey(entry_id);
  const lastCompletedNotebookLabel = PP_DEPARTMENT_KEY_TO_NOTEBOOK_LABEL[lastCompletedDeptKey] || null;
  await client.query(
    `UPDATE process_parameters.master
     SET status = 'pending_approval', updated_at = NOW(), pending_approval_notebook_label = $2
     WHERE entry_id = $1`,
    [entry_id, lastCompletedNotebookLabel]
  );
  // Clear out only the stale 'rejected' decisions - the department that was
  // rejected just resubmitted fresh data and needs a fresh Accept/Reject
  // from L4, but a sibling department that was already 'accepted' shouldn't
  // be forced through review again just because this one got fixed.
  await ensureDepartmentDecisionsTable();
  await client.query(
    `DELETE FROM process_parameters.department_decisions WHERE entry_id = $1 AND decision = 'rejected'`,
    [entry_id]
  );
  return 'pending_approval';
};

// Employee-Hierarchy-and-Workflow-System_V2.pdf: "PP Approval" is one of the
// six threshold types - once all departments finish, an actual TAT-tracked
// approval task is raised on L4, escalating to L5 if L4 doesn't act in
// time. Previously PP Approvals was just a static queue with no deadline or
// escalation at all. PP/Wheel Change Approval aren't assigned to one named
// L4 user (unlike the other threshold types) - this app's access model
// already treats "any current L4/L5" as eligible reviewers
// (isPpApproverUser/isWheelChangeApproverUser), so the ticket is raised
// against whichever users currently hold that level, resolved fresh each
// time rather than a stored assignment.
const PP_APPROVAL_TAT_HOURS = Number(process.env.PP_APPROVAL_TAT_HOURS) > 0
  ? Number(process.env.PP_APPROVAL_TAT_HOURS)
  : 24;

const getUsersAtLevel = async (level) => {
  const result = await client.query(`SELECT id FROM users.user_details WHERE level = $1`, [level]);
  return result.rows.map((row) => row.id);
};

// Employee-Hierarchy-and-Workflow-System_V2.pdf, "PP Approval & Wheel Change
// Approval Configuration": "L4 User: Select the specific L4 Department Head
// responsible... TAT: configurable." This table holds that per-instance
// config; when no specific L4 user is configured, ticket creation falls back
// to the previous "any current L4 user" behavior so existing setups keep working.
const getPpApprovalConfig = async () => {
  const result = await client.query(
    `SELECT * FROM ticketing_system.pp_approval_config WHERE config_key = 'global'`
  );
  const row = result.rows[0];
  if (!row) {
    return { config_key: 'global', l4_user_ids: [], tat_hours: PP_APPROVAL_TAT_HOURS, updated_at: null };
  }
  const l4UserIds = Array.isArray(row.l4_user_ids) && row.l4_user_ids.length
    ? row.l4_user_ids
    : (row.l4_user_id ? [row.l4_user_id] : []);
  return { ...row, l4_user_ids: l4UserIds };
};

// notebookLabel is the last-completed department's PP notebook (see
// getLastCompletedDepartmentKey) - when it has its own per-notebook config
// (approval_l4_user_ids/approve_within_hours/severity, set from the
// combined PP Threshold + Approval config screen), that governs this
// ticket; otherwise falls back to the old single global pp_approval_config.
// submittedAt is when the PP id actually finished all departments and
// entered pending_approval (process_parameters.master.updated_at) - NOT
// when this ticket happens to get inserted, which only happens once the TAT
// window has already elapsed (plus up to one worker-cycle's delay on top).
// Both the ticket's own created_at and its approval-due date are anchored
// to submittedAt so the ticket reads as "created when the PP was submitted,
// due <TAT hours> after that" (e.g. submitted 2pm + 2hr TAT = due 4pm),
// matching what actually happened, rather than to whenever the overdue
// check happened to notice.
const createPpApprovalTicket = async (entry_id, notebookLabel = null, submittedAt = null) => {
  await ensureApprovalTicketSchema();
  const existing = await client.query(
    `SELECT ticket_id FROM ticketing_system.operator_tickets
     WHERE ticket_type = 'PP_APPROVAL' AND (violation_details->>'entry_id') = $1 AND status <> 'Closed'
     LIMIT 1`,
    [entry_id]
  );
  if (existing.rows[0]?.ticket_id) return existing.rows[0].ticket_id;

  const notebookThresholds = notebookLabel ? await getPpNotebookThresholds() : null;
  const notebookConfig = notebookThresholds?.get(notebookLabel) || null;
  const notebookL4UserIds = Array.isArray(notebookConfig?.approval_l4_user_ids) ? notebookConfig.approval_l4_user_ids : [];

  const approvalConfig = await getPpApprovalConfig();
  // No L4 approver configured anywhere (neither this notebook's own PP
  // Threshold config nor the global PP Approval config) - no ticket should
  // be raised blindly notifying every L4 user system-wide (the
  // getUsersAtLevel('L4') fallback this used to have).
  const l4UserIds = notebookL4UserIds.length ? notebookL4UserIds : approvalConfig.l4_user_ids;
  if (!l4UserIds.length) return null;
  const tatHours = Number(notebookConfig?.approve_within_hours) > 0
    ? Number(notebookConfig.approve_within_hours)
    : (Number(approvalConfig.tat_hours) > 0 ? Number(approvalConfig.tat_hours) : PP_APPROVAL_TAT_HOURS);
  const severity = notebookConfig?.severity || 'High';
  const submittedAtTime = submittedAt ? new Date(submittedAt).getTime() : NaN;
  const anchorTime = Number.isFinite(submittedAtTime) ? submittedAtTime : Date.now();
  const ticketCreatedAt = new Date(anchorTime).toISOString();
  const l4TatDueAt = new Date(anchorTime + tatHours * 60 * 60 * 1000).toISOString();
  const violationDetails = {
    category: 'PENDING_APPROVAL',
    ticket_type: 'PP_APPROVAL',
    entry_id,
    notebook_label: notebookLabel,
    message: `PP id ${entry_id} has completed all departments and is awaiting L4 approval.`
  };

  const ticketId = await generateTicketId(client);
  let insertedTicketId;
  try {
    const ticket = await client.query(
      `INSERT INTO ticketing_system.operator_tickets
       (ticket_id, machine_name, parameter_name, actual_value, threshold_value,
        severity, status, created_at, ticket_reason, ticket_type, ticket_kind,
        violation_details, approval_l4_user_ids, tat_current_level, l4_tat_due_at)
       VALUES (
         $1,
         $2, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
         $6, 'Open', $7, 'MISSING_VALUE', 'PP_APPROVAL', 'pp_approval',
         $3::jsonb, $4::int[], 'L4', $5
       )
       RETURNING ticket_id`,
      [ticketId, entry_id, JSON.stringify(violationDetails), l4UserIds, l4TatDueAt, severity, ticketCreatedAt]
    );
    insertedTicketId = ticket.rows[0]?.ticket_id || null;
  } catch (error) {
    // 23505 = operator_tickets_pp_approval_open_uq - lost a race with another
    // call that inserted the same entry_id's ticket first; that one wins.
    if (error?.code !== '23505') throw error;
    const winner = await client.query(
      `SELECT ticket_id FROM ticketing_system.operator_tickets
       WHERE ticket_type = 'PP_APPROVAL' AND (violation_details->>'entry_id') = $1 AND status <> 'Closed'
       LIMIT 1`,
      [entry_id]
    );
    return winner.rows[0]?.ticket_id || null;
  }

  if (insertedTicketId && l4UserIds.length) {
    await createNotificationsForUsers(l4UserIds, {
      ticketId: insertedTicketId,
      type: 'PP_APPROVAL',
      category: 'Tickets',
      priority: severity === 'High' ? 'High' : 'Medium',
      title: (user) => `Hi ${user.full_name || 'there'} (L4), PP entry ${entry_id} needs your approval`,
      body: (user) =>
        `${user.full_name || 'You'} (L4) - PP entry ${entry_id} has completed all departments and is awaiting your approval within ${tatHours} hour(s).`,
      linkUrl: `/supervisor-tickets/${insertedTicketId}`,
      payload: { ticket_id: insertedTicketId, entry_id }
    });
  }

  return insertedTicketId;
};

// A PP ticket means "L4 missed this," not "this is now pending" - matching
// Acknowledgement, no ticket is raised the moment a PP becomes
// pending_approval (see refreshProcessParameterStatus above). This runs
// periodically and raises the real PP_APPROVAL ticket only once the
// notebook's own configured TAT window has actually elapsed since
// pending_approval started (updated_at), using the exact same
// notebook-threshold-first, global-config-fallback resolution
// createPpApprovalTicket itself uses - if nothing is configured for it,
// nothing is raised (same "no threshold, no ticket" rule as everywhere
// else), and it just stays silently pending until someone configures an L4
// approver for it.
const runPpApprovalOverdueCheck = async () => {
  await ensureProcessParameterMasterTable();

  // refreshProcessParameterStatus only ever runs reactively, off a GET to
  // /master, /master/:entry_id, or /approvals - if nobody opens one of those
  // pages after a batch's last department finishes, it stays 'in_progress'
  // forever and this overdue check (which only looks at 'pending_approval'
  // rows) would silently never see it, no matter how much time passes. This
  // worker is the one guaranteed periodic entry point, so it has to do that
  // same catch-up refresh itself rather than rely on a page view.
  const inProgress = await client.query(
    `SELECT entry_id FROM process_parameters.master WHERE status IN ('in_progress', 'rejected')`
  );
  await Promise.all(inProgress.rows.map((row) => refreshProcessParameterStatus(row.entry_id)));

  const pending = await client.query(
    `SELECT entry_id, updated_at, pending_approval_notebook_label
     FROM process_parameters.master
     WHERE status = 'pending_approval'`
  );

  const created = [];
  for (const row of pending.rows) {
    const notebookLabel = row.pending_approval_notebook_label;
    // eslint-disable-next-line no-await-in-loop
    const notebookThresholds = notebookLabel ? await getPpNotebookThresholds() : null;
    const notebookConfig = notebookThresholds?.get(notebookLabel) || null;
    // eslint-disable-next-line no-await-in-loop
    const approvalConfig = await getPpApprovalConfig();
    const tatHours = Number(notebookConfig?.approve_within_hours) > 0
      ? Number(notebookConfig.approve_within_hours)
      : (Number(approvalConfig.tat_hours) > 0 ? Number(approvalConfig.tat_hours) : PP_APPROVAL_TAT_HOURS);

    const dueAt = new Date(row.updated_at).getTime() + tatHours * 60 * 60 * 1000;
    if (Date.now() < dueAt) continue; // eslint-disable-line no-continue

    // eslint-disable-next-line no-await-in-loop
    const ticketId = await createPpApprovalTicket(row.entry_id, notebookLabel, row.updated_at);
    if (ticketId) created.push(ticketId);
  }
  return created;
};

const closePpApprovalTicket = async (entry_id, options = {}) => {
  await ensureApprovalTicketSchema();
  const closed = await client.query(
    `UPDATE ticketing_system.operator_tickets
     SET status = 'Closed'
     WHERE ticket_type = 'PP_APPROVAL' AND (violation_details->>'entry_id') = $1 AND status <> 'Closed'
     RETURNING ticket_id`,
    [entry_id]
  );

  // The ticket list's Actual Res Time/Resolution Gap are read from a matching
  // ticket_logs row (see supervisorTickets.routes.js's resolution_log join) -
  // without logging the closing action here, a closed PP Approval ticket
  // always showed "--:--" even though it really was resolved.
  const action = options.decision === 'rejected' ? 'REJECTED' : 'APPROVED';
  for (const row of closed.rows) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `INSERT INTO ticketing_system.ticket_logs
       (ticket_id, action, performed_by, role, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [row.ticket_id, action, options.performedBy || 'Supervisor', options.role || 'L4']
    );
  }
};

// PP Approval is owned by L4 fully and directly - there's no configured L5
// approver anywhere in PP Notebook Threshold (only L1/L4), so this does not
// reassign to a different tier the way other threshold types escalate (that
// would mean blindly notifying "any current L5 user" system-wide, which
// every other threshold type deliberately avoids too). Instead, once a
// PP_APPROVAL ticket's L4 TAT has elapsed with the ticket still open, a
// second reminder ticket is raised against the same L4 approver(s) - same
// entry_id, so closePpApprovalTicket (called on the real approve/reject)
// closes both together once the PP is actually actioned.
const runPpApprovalTatCheck = async () => {
  await ensureApprovalTicketSchema();

  const overdueTickets = await client.query(
    `SELECT * FROM ticketing_system.operator_tickets
     WHERE ticket_type = 'PP_APPROVAL'
       AND tat_current_level = 'L4'
       AND status <> 'Closed'
       AND l4_tat_due_at IS NOT NULL
       AND l4_tat_due_at <= NOW()`
  );

  const created = [];
  for (const ticket of overdueTickets.rows) {
    const entryId = ticket.violation_details?.entry_id;
    if (!entryId) continue; // eslint-disable-line no-continue

    // Was: raised a brand-new ticket row ('escalation_of' the original) once
    // overdue, leaving TWO open tickets for the same PP id (the one thing
    // this was supposed to avoid duplicating). Every other threshold type
    // (Submission Frequency, Value Threshold) escalates by updating the
    // SAME ticket in place, not by inserting a second one - this now does
    // the same: bump the existing ticket's own severity/message and notify
    // again, exactly once (guarded by the OVERDUE_REMINDER_RAISED log entry
    // below so a later run doesn't re-notify every cycle), with no second
    // ticket_id ever created.
    // eslint-disable-next-line no-await-in-loop
    const alreadyReminded = await client.query(
      `SELECT 1 FROM ticketing_system.ticket_logs WHERE ticket_id = $1 AND action = 'OVERDUE_REMINDER_RAISED' LIMIT 1`,
      [ticket.ticket_id]
    );
    if (alreadyReminded.rows.length) continue; // eslint-disable-line no-continue

    const l4UserIds = Array.isArray(ticket.approval_l4_user_ids) ? ticket.approval_l4_user_ids : [];
    const overdueMessage = `PP id ${entryId} was not approved by L4 within the configured time and is now overdue.`;

    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `UPDATE ticketing_system.operator_tickets
       SET severity = 'High',
           violation_details = violation_details || jsonb_build_object('overdue', true, 'message', $2::text)
       WHERE ticket_id = $1`,
      [ticket.ticket_id, overdueMessage]
    );
    created.push(ticket.ticket_id);

    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `INSERT INTO ticketing_system.ticket_logs
       (ticket_id, action, performed_by, role, created_at)
       VALUES ($1, 'OVERDUE_REMINDER_RAISED', 'System', 'System', NOW())`,
      [ticket.ticket_id]
    );

    if (l4UserIds.length) {
      // eslint-disable-next-line no-await-in-loop
      await createNotificationsForUsers(l4UserIds, {
        ticketId: ticket.ticket_id,
        type: 'PP_APPROVAL',
        category: 'Tickets',
        priority: 'High',
        title: (user) => `Hi ${user.full_name || 'there'} (L4), a PP approval is overdue`,
        body: (user) => `${user.full_name || 'You'} (L4) - ${overdueMessage}`,
        linkUrl: `/supervisor-tickets/${ticket.ticket_id}`,
        payload: { ticket_id: ticket.ticket_id, entry_id: entryId }
      });
    }
  }

  return created;
};

router.get('/approval-config', async (req, res, next) => {
  try {
    const config = await getPpApprovalConfig();
    return res.status(200).json({ config });
  } catch (error) {
    next(error);
  }
});

router.post('/approval-config', async (req, res, next) => {
  try {
    const l4UserIds = (Array.isArray(req.body?.l4_user_ids) ? req.body.l4_user_ids : [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

    const tatHours = Number(req.body?.tat_hours);
    if (!Number.isFinite(tatHours) || tatHours <= 0) {
      return res.status(400).json({ message: 'tat_hours must be a positive integer' });
    }

    const result = await client.query(
      `INSERT INTO ticketing_system.pp_approval_config (config_key, l4_user_id, l4_user_ids, tat_hours, updated_at)
       VALUES ('global', $1, $2::int[], $3, NOW())
       ON CONFLICT (config_key)
       DO UPDATE SET l4_user_id = EXCLUDED.l4_user_id, l4_user_ids = EXCLUDED.l4_user_ids, tat_hours = EXCLUDED.tat_hours, updated_at = NOW()
       RETURNING *`,
      [l4UserIds[0] || null, l4UserIds, tatHours]
    );

    return res.status(200).json({ message: 'PP Approval configuration saved successfully', config: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/next-id', async (req, res, next) => {
  try {
    const entry_id = await peekNextProcessParameterEntryId();
    return res.status(200).json({
      entry_id,
      source: 'global-process-parameter-sequence',
    });
  } catch (error) {
    next(error);
  }
});

// Reserves a new PP id for real (unlike GET /next-id, which only previews
// without claiming anything) and records it as a master batch. No child rows
// are created in any department table here - those appear only once each
// department's own form is actually saved against this entry_id.
router.post('/master', async (req, res, next) => {
  try {
    // createProcessParameterEntryId() already inserts the master row for this
    // entry_id (via ensureProcessParameterMasterRow) as part of minting the id
    // - so this must UPDATE that existing row rather than INSERT a second one,
    // or it duplicate-key-fails on every call.
    const entry_id = await createProcessParameterEntryId();

    const result = await client.query(
      `UPDATE process_parameters.master
          SET created_by_user_id = $2,
              created_by_name = $3
        WHERE entry_id = $1
        RETURNING *`,
      [entry_id, req.user?.id ?? null, req.user?.employee_id ?? null]
    );

    return res.status(201).json({
      message: 'PP batch created successfully',
      entry_id,
      master: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Paginated list of master PP batches, each annotated with per-department
// completion and its current lifecycle status.
router.get('/master', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const [rows, totalResult] = await Promise.all([
      client.query(
        `SELECT * FROM process_parameters.master
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      client.query('SELECT COUNT(*) FROM process_parameters.master')
    ]);

    await ensureDepartmentDecisionsTable();
    const entryIds = rows.rows.map((r) => r.entry_id);
    const [statusByEntryId, decisionsByEntryId] = await Promise.all([
      getCompletionStatusForEntryIds(entryIds),
      getDepartmentDecisionsForEntryIds(entryIds),
      Promise.all(rows.rows.filter((r) => r.status === 'in_progress' || r.status === 'rejected').map((r) => refreshProcessParameterStatus(r.entry_id)))
    ]);

    const refreshedRows = await client.query(
      `SELECT entry_id, status FROM process_parameters.master WHERE entry_id = ANY($1::text[])`,
      [entryIds]
    );
    const statusById = new Map(refreshedRows.rows.map((r) => [r.entry_id, r.status]));

    const data = rows.rows.map((row) => ({
      ...row,
      status: statusById.get(row.entry_id) || row.status,
      completion: statusByEntryId.get(row.entry_id) || {},
      department_decisions: decisionsByEntryId.get(row.entry_id) || {}
    }));

    const total = parseInt(totalResult.rows[0].count, 10) || 0;
    return res.status(200).json({
      data,
      departments: PP_DEPARTMENTS.map(({ key, label }) => ({ key, label })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
});

// Single master batch plus its per-department completion detail, for the
// "pick a PP id, go fill its remaining sub-forms" flow.
router.get('/master/:entry_id', async (req, res, next) => {
  try {
    const entry_id = normalizeProcessParameterEntryId(req.params.entry_id);

    const result = await client.query(
      `SELECT * FROM process_parameters.master WHERE entry_id = $1`,
      [entry_id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ message: 'PP batch not found' });
    }

    await refreshProcessParameterStatus(entry_id);
    const refreshed = await client.query(
      `SELECT * FROM process_parameters.master WHERE entry_id = $1`,
      [entry_id]
    );
    const statusByEntryId = await getCompletionStatusForEntryIds([entry_id]);

    return res.status(200).json({
      master: refreshed.rows[0],
      completion: statusByEntryId.get(entry_id) || {},
      departments: PP_DEPARTMENTS.map(({ key, label }) => ({ key, label }))
    });
  } catch (error) {
    next(error);
  }
});

// Lets any sub-department screen prefill count_name once another
// sub-department has already set it for the same PP id.
router.get('/:entry_id/count-name', async (req, res, next) => {
  try {
    const entry_id = normalizeProcessParameterEntryId(req.params.entry_id);
    const count_name = await getExistingCountNameForEntryId(entry_id);
    return res.status(200).json({ entry_id, count_name });
  } catch (error) {
    next(error);
  }
});

const isFullAccessRequest = (req) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  return role === 'admin' || role === 'super admin' || role === 'superadmin';
};

// L4 (Quality/Department Head) approves or rejects a PP id as a whole, once
// it's reached pending_approval. L5/Admin can also act here (full access).
const canActOnPpApproval = (req) => {
  const level = String(req.user?.level || '').trim().toUpperCase();
  return isFullAccessRequest(req) || level === 'L4' || level === 'L5';
};

// PP approval queue for L4 (+ L5/Admin) - one row per PP id (not per
// department). status query param accepts in_progress/pending_approval/
// active/inactive.
router.get('/approvals', async (req, res, next) => {
  try {
    if (!canActOnPpApproval(req)) {
      return res.status(200).json({ data: [] });
    }

    const status = String(req.query.status ?? 'pending_approval').trim();

    // Catch any batch that's freshly completed all departments since it was
    // last checked, so it shows up in the pending_approval queue right away -
    // 'rejected' is included since a per-department reject genuinely reopens
    // one department for resubmission (see refreshProcessParameterStatus).
    const inProgress = await client.query(
      `SELECT entry_id FROM process_parameters.master WHERE status IN ('in_progress', 'rejected')`
    );
    await Promise.all(inProgress.rows.map((row) => refreshProcessParameterStatus(row.entry_id)));

    const result = await client.query(
      `SELECT * FROM process_parameters.master WHERE status = $1 ORDER BY created_at DESC`,
      [status]
    );

    await ensureDepartmentDecisionsTable();
    const entryIds = result.rows.map((row) => row.entry_id);
    const [statusByEntryId, detailByEntryId, fullDetailsList, decisionsByEntryId] = await Promise.all([
      getCompletionStatusForEntryIds(entryIds),
      getPpDetailFieldsForEntryIds(entryIds),
      Promise.all(entryIds.map((id) => getPpFullDetailsForEntryId(id))),
      getDepartmentDecisionsForEntryIds(entryIds),
    ]);
    const fullDetailsByEntryId = new Map(entryIds.map((id, index) => [id, fullDetailsList[index]]));

    const data = result.rows.map((row) => ({
      ...row,
      id: row.entry_id,
      title: row.entry_id,
      department: 'Process Parameter',
      completion: statusByEntryId.get(row.entry_id) || {},
      machine_no: detailByEntryId.get(row.entry_id)?.machine_no || null,
      operator: detailByEntryId.get(row.entry_id)?.operator || null,
      department_details: fullDetailsByEntryId.get(row.entry_id) || {},
      department_decisions: decisionsByEntryId.get(row.entry_id) || {},
    }));

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

// Accepts one department's already-submitted data within a PP id's review.
// Purely an audit decision - the department's row is left exactly as
// submitted (nothing to unlock, nothing to redo). Submitting the whole PP
// id (POST /:entry_id/approve) still requires every department to have
// reached this decision first (enforced client-side by ApprovalsQueueView).
router.post('/:entry_id/departments/:department_key/approve', async (req, res, next) => {
  try {
    if (!canActOnPpApproval(req)) {
      return res.status(403).json({ message: 'Only L4, L5, or Admin can approve a PP department' });
    }
    const entry_id = normalizeProcessParameterEntryId(req.params.entry_id);
    const department_key = String(req.params.department_key || '').trim();
    const dept = PP_DEPARTMENTS_BY_KEY.get(department_key);
    if (!dept) {
      return res.status(400).json({ message: `Unknown department "${department_key}"` });
    }

    const completion = (await getCompletionStatusForEntryIds([entry_id])).get(entry_id) || {};
    if (!completion[department_key]) {
      return res.status(409).json({ message: `${dept.label} has not submitted data for ${entry_id} yet.` });
    }

    await ensureDepartmentDecisionsTable();
    const decidedBy = String(req.user?.employee_id || req.user?.full_name || '').trim() || null;
    const result = await client.query(
      `INSERT INTO process_parameters.department_decisions (entry_id, department_key, decision, reason, decided_by, decided_at)
       VALUES ($1, $2, 'accepted', NULL, $3, NOW())
       ON CONFLICT (entry_id, department_key)
       DO UPDATE SET decision = 'accepted', reason = NULL, decided_by = EXCLUDED.decided_by, decided_at = NOW()
       RETURNING *`,
      [entry_id, department_key, decidedBy]
    );

    return res.status(200).json({ message: `${dept.label} approved`, decision: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Rejects one department's already-submitted data within a PP id's review.
// Unlike whole-PP rejection, this reopens just that one department for
// resubmission - each department table only ever allows one row per
// entry_id (UNIQUE(entry_id), enforced as a plain INSERT with no UPDATE path
// anywhere - see e.g. carding.js's POST /qc-header), so the only way to make
// it editable again is to delete the submitted row outright. The PP id as a
// whole drops out of pending_approval immediately (same 'rejected' status
// POST /:entry_id/reject uses) since it's no longer actually complete -
// refreshProcessParameterStatus already treats 'rejected' the same as
// in_progress for re-checking completion, so it flows back to
// pending_approval on its own once the department resubmits.
router.post('/:entry_id/departments/:department_key/reject', async (req, res, next) => {
  try {
    if (!canActOnPpApproval(req)) {
      return res.status(403).json({ message: 'Only L4, L5, or Admin can reject a PP department' });
    }
    const entry_id = normalizeProcessParameterEntryId(req.params.entry_id);
    const department_key = String(req.params.department_key || '').trim();
    const dept = PP_DEPARTMENTS_BY_KEY.get(department_key);
    if (!dept) {
      return res.status(400).json({ message: `Unknown department "${department_key}"` });
    }
    const reason = String(req.body?.reason ?? '').trim() || null;
    const decidedBy = String(req.user?.employee_id || req.user?.full_name || '').trim() || null;

    // Mixing's real entered values live in a separate blends child table
    // keyed by qc_id (see getPpFullDetailsForEntryId above) - has to be
    // cleared explicitly, there's no ON DELETE CASCADE wired up for it.
    if (dept.key === 'mixing') {
      await client.query(
        `DELETE FROM mixing.mixing_qc_blends WHERE qc_id IN (
           SELECT qc_id FROM mixing.mixing_qc_header WHERE entry_id = $1
         )`,
        [entry_id]
      );
    }
    const deleted = await client.query(
      `DELETE FROM ${dept.table} WHERE entry_id = $1 ${dept.extraWhere || ''} RETURNING ${dept.idColumn}`,
      [entry_id]
    );
    if (!deleted.rowCount) {
      return res.status(409).json({ message: `${dept.label} has not submitted data for ${entry_id} yet.` });
    }

    await ensureDepartmentDecisionsTable();
    const decisionResult = await client.query(
      `INSERT INTO process_parameters.department_decisions (entry_id, department_key, decision, reason, decided_by, decided_at)
       VALUES ($1, $2, 'rejected', $3, $4, NOW())
       ON CONFLICT (entry_id, department_key)
       DO UPDATE SET decision = 'rejected', reason = EXCLUDED.reason, decided_by = EXCLUDED.decided_by, decided_at = NOW()
       RETURNING *`,
      [entry_id, department_key, reason, decidedBy]
    );

    const masterResult = await client.query(
      `UPDATE process_parameters.master
       SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(),
           review_remarks = $2, updated_at = NOW()
       WHERE entry_id = $3 AND status = 'pending_approval'
       RETURNING *`,
      [decidedBy, `${dept.label}: ${reason || 'Sent back for correction'}`, entry_id]
    );
    if (masterResult.rowCount) {
      await closePpApprovalTicket(entry_id, { decision: 'rejected', performedBy: decidedBy, role: req.user?.role });
    }

    return res.status(200).json({ message: `${dept.label} rejected - reopened for resubmission`, decision: decisionResult.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post('/:entry_id/approve', async (req, res, next) => {
  try {
    if (!canActOnPpApproval(req)) {
      return res.status(403).json({ message: 'Only L4, L5, or Admin can approve a PP id' });
    }
    const entry_id = normalizeProcessParameterEntryId(req.params.entry_id);
    // req.body.department is the entry's department/category (e.g. "Process Parameter"),
    // not the approving user - it used to be checked first here, so reviewed_by ended up
    // storing that label instead of who actually approved/rejected the entry.
    const reviewedBy = String(req.body?.reviewed_by ?? req.user?.full_name ?? req.user?.employee_id ?? '').trim() || null;

    const result = await client.query(
      `UPDATE process_parameters.master
       SET status = 'active', reviewed_by = $1, reviewed_at = NOW(), review_remarks = NULL, updated_at = NOW()
       WHERE entry_id = $2 AND status = 'pending_approval'
       RETURNING *`,
      [reviewedBy, entry_id]
    );
    if (result.rowCount === 0) {
      return res.status(409).json({ message: 'This PP id is not awaiting approval (already actioned, or not yet complete).' });
    }
    await closePpApprovalTicket(entry_id, {
      decision: 'approved',
      performedBy: reviewedBy || req.user?.full_name || req.user?.employee_id,
      role: req.user?.role,
    });

    res.status(200).json({ message: 'PP id approved — now Active', data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post('/:entry_id/reject', async (req, res, next) => {
  try {
    if (!canActOnPpApproval(req)) {
      return res.status(403).json({ message: 'Only L4, L5, or Admin can reject a PP id' });
    }
    const entry_id = normalizeProcessParameterEntryId(req.params.entry_id);
    // req.body.department is the entry's department/category (e.g. "Process Parameter"),
    // not the approving user - it used to be checked first here, so reviewed_by ended up
    // storing that label instead of who actually approved/rejected the entry.
    const reviewedBy = String(req.body?.reviewed_by ?? req.user?.full_name ?? req.user?.employee_id ?? '').trim() || null;
    const reason = String(req.body?.reason ?? '').trim() || null;

    // Rejected is its own visible stage (distinct from in_progress) so a
    // rejected PP id shows up as "Rejected" in the PP Approvals queue and the
    // PP notebook, with the reviewer's reason attached, instead of silently
    // reverting to looking like an ordinary still-in-progress batch.
    // refreshProcessParameterStatus treats 'rejected' the same as
    // 'in_progress' for re-checking completion - once every department
    // resubmits, it automatically moves back to pending_approval.
    const result = await client.query(
      `UPDATE process_parameters.master
       SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), review_remarks = $2, updated_at = NOW()
       WHERE entry_id = $3 AND status = 'pending_approval'
       RETURNING *`,
      [reviewedBy, reason, entry_id]
    );
    if (result.rowCount === 0) {
      return res.status(409).json({ message: 'This PP id is not awaiting approval (already actioned, or not yet complete).' });
    }
    await closePpApprovalTicket(entry_id, {
      decision: 'rejected',
      performedBy: reviewedBy || req.user?.full_name || req.user?.employee_id,
      role: req.user?.role,
    });

    res.status(200).json({ message: 'PP id rejected', data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.PP_DEPARTMENTS = PP_DEPARTMENTS;
module.exports.refreshProcessParameterStatus = refreshProcessParameterStatus;
module.exports.runPpApprovalTatCheck = runPpApprovalTatCheck;
module.exports.runPpApprovalOverdueCheck = runPpApprovalOverdueCheck;
module.exports.createPpApprovalTicket = createPpApprovalTicket;
module.exports.closePpApprovalTicket = closePpApprovalTicket;
module.exports.getPpApprovalConfig = getPpApprovalConfig;

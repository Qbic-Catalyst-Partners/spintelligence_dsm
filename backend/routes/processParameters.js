const express = require('express');
const client = require('../connection');
const {
  peekNextProcessParameterEntryId,
  normalizeProcessParameterEntryId,
  getExistingCountNameForEntryId,
  createProcessParameterEntryId,
} = require('../utils/processParameterEntryId');

const router = express.Router();

// A PP batch moves through 4 stages, tracked on this one master row:
//   in_progress      - created, still waiting on one or more departments
//   pending_approval - every department has submitted; waiting on L4
//   active           - L4 approved it; usable for exactly one Wheel Change
//   inactive         - a Wheel Change has been saved against it (locked -
//                      reverts to active if that Wheel Change is rejected)
// "Rejected" by L4 is not a separate stored stage - it sends the PP back to
// in_progress (departments need to fix and resubmit), with the reason kept
// in review_remarks for context.
const ensureProcessParameterMasterTableImpl = async () => {
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
      ADD COLUMN IF NOT EXISTS review_remarks TEXT
  `);
};

// This is a one-time schema migration, but every caller (across spinning.js,
// processParameters.js, etc.) awaits it on every request - memoize the
// promise so the actual CREATE/ALTER statements only ever run once per
// server process; every call after that resolves immediately.
let ensureProcessParameterMasterTablePromise = null;
const ensureProcessParameterMasterTable = () => {
  if (!ensureProcessParameterMasterTablePromise) {
    ensureProcessParameterMasterTablePromise = ensureProcessParameterMasterTableImpl().catch((error) => {
      ensureProcessParameterMasterTablePromise = null;
      throw error;
    });
  }
  return ensureProcessParameterMasterTablePromise;
};

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

// Auto-advances in_progress -> pending_approval the moment every department
// has a submitted row. Never touches active/inactive (those only change via
// the explicit approve/reject-by-L4 and Wheel Change save/reject actions
// below) - only in_progress is eligible to auto-advance. Called reactively
// whenever PP status is read/listed, rather than hooked into every
// department's own save route.
const refreshProcessParameterStatus = async (entry_id) => {
  const current = await client.query(
    `SELECT status FROM process_parameters.master WHERE entry_id = $1`,
    [entry_id]
  );
  const status = current.rows[0]?.status;
  if (status !== 'in_progress') return status || null;

  const completion = (await getCompletionStatusForEntryIds([entry_id])).get(entry_id) || {};
  const allComplete = Object.keys(completion).length > 0 && Object.values(completion).every(Boolean);
  if (!allComplete) return status;

  await client.query(
    `UPDATE process_parameters.master SET status = 'pending_approval', updated_at = NOW() WHERE entry_id = $1`,
    [entry_id]
  );
  await createPpApprovalTicket(entry_id);
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
const ensurePpApprovalConfigTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.pp_approval_config (
      config_key TEXT PRIMARY KEY DEFAULT 'global',
      l4_user_id INTEGER NULL,
      tat_hours INTEGER NOT NULL DEFAULT 24,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

const getPpApprovalConfig = async () => {
  await ensurePpApprovalConfigTable();
  const result = await client.query(
    `SELECT * FROM ticketing_system.pp_approval_config WHERE config_key = 'global'`
  );
  return result.rows[0] || { config_key: 'global', l4_user_id: null, tat_hours: PP_APPROVAL_TAT_HOURS, updated_at: null };
};

const ensureApprovalTicketSchema = async () => {
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
      ADD COLUMN IF NOT EXISTS approval_l1_user_ids integer[] NULL,
      ADD COLUMN IF NOT EXISTS approval_l2_user_ids integer[] NULL,
      ADD COLUMN IF NOT EXISTS approval_l3_user_ids integer[] NULL,
      ADD COLUMN IF NOT EXISTS approval_l4_user_ids integer[] NULL,
      ADD COLUMN IF NOT EXISTS approval_l5_user_ids integer[] NULL,
      ADD COLUMN IF NOT EXISTS tat_current_level text NULL,
      ADD COLUMN IF NOT EXISTS l4_tat_due_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS l5_tat_due_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS ticket_type varchar(50) NULL
  `);
};

const createPpApprovalTicket = async (entry_id) => {
  await ensureApprovalTicketSchema();

  const existing = await client.query(
    `SELECT ticket_id FROM ticketing_system.operator_tickets
     WHERE ticket_type = 'PP_APPROVAL' AND (violation_details->>'entry_id') = $1 AND status <> 'Closed'
     LIMIT 1`,
    [entry_id]
  );
  if (existing.rows[0]?.ticket_id) return existing.rows[0].ticket_id;

  const approvalConfig = await getPpApprovalConfig();
  const l4UserIds = approvalConfig.l4_user_id ? [approvalConfig.l4_user_id] : await getUsersAtLevel('L4');
  const tatHours = Number(approvalConfig.tat_hours) > 0 ? Number(approvalConfig.tat_hours) : PP_APPROVAL_TAT_HOURS;
  const l4TatDueAt = new Date(Date.now() + tatHours * 60 * 60 * 1000).toISOString();
  const violationDetails = {
    category: 'PENDING_APPROVAL',
    ticket_type: 'PP_APPROVAL',
    entry_id,
    message: `PP id ${entry_id} has completed all departments and is awaiting L4 approval.`
  };

  const ticket = await client.query(
    `INSERT INTO ticketing_system.operator_tickets
     (ticket_id, machine_name, parameter_name, actual_value, threshold_value,
      severity, status, created_at, ticket_reason, ticket_type, ticket_kind,
      violation_details, approval_l4_user_ids, tat_current_level, l4_tat_due_at)
     VALUES (
       'TK-' || LPAD(nextval('"ticketing_system"."ticket_seq"')::text, 4, '0'),
       $1, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
       'High', 'Open', NOW(), 'MISSING_VALUE', 'PP_APPROVAL', 'pp_approval',
       $2::jsonb, $3::int[], 'L4', $4
     )
     RETURNING ticket_id`,
    [entry_id, JSON.stringify(violationDetails), l4UserIds, l4TatDueAt]
  );
  return ticket.rows[0]?.ticket_id || null;
};

const closePpApprovalTicket = async (entry_id) => {
  await ensureApprovalTicketSchema();
  await client.query(
    `UPDATE ticketing_system.operator_tickets
     SET status = 'Closed'
     WHERE ticket_type = 'PP_APPROVAL' AND (violation_details->>'entry_id') = $1 AND status <> 'Closed'`,
    [entry_id]
  );
};

// L4 -> L5 escalation once the L4 TAT elapses without action - L5 is the
// final escalation authority per the PDF, so there's nowhere further to go;
// this just makes the ticket visible to L5 and marks it as such.
const runPpApprovalTatCheck = async () => {
  await ensureApprovalTicketSchema();

  const dueTickets = await client.query(
    `SELECT ticket_id FROM ticketing_system.operator_tickets
     WHERE ticket_type = 'PP_APPROVAL'
       AND tat_current_level = 'L4'
       AND l4_tat_due_at IS NOT NULL
       AND l4_tat_due_at <= NOW()
       AND status <> 'Closed'`
  );
  if (!dueTickets.rowCount) return [];

  const l5UserIds = await getUsersAtLevel('L5');
  const escalated = [];
  for (const row of dueTickets.rows) {
    // eslint-disable-next-line no-await-in-loop
    const result = await client.query(
      `UPDATE ticketing_system.operator_tickets
       SET tat_current_level = 'L5', approval_l5_user_ids = $1, l5_tat_due_at = NOW()
       WHERE ticket_id = $2
       RETURNING *`,
      [l5UserIds, row.ticket_id]
    );
    if (result.rows[0]) escalated.push(result.rows[0]);
  }
  return escalated;
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
    await ensurePpApprovalConfigTable();

    const l4UserId = req.body?.l4_user_id ? Number(req.body.l4_user_id) : null;
    if (req.body?.l4_user_id !== undefined && req.body?.l4_user_id !== null && req.body?.l4_user_id !== '' && !(Number.isInteger(l4UserId) && l4UserId > 0)) {
      return res.status(400).json({ message: 'l4_user_id must be a positive integer' });
    }

    const tatHours = Number(req.body?.tat_hours);
    if (!Number.isFinite(tatHours) || tatHours <= 0) {
      return res.status(400).json({ message: 'tat_hours must be a positive integer' });
    }

    const result = await client.query(
      `INSERT INTO ticketing_system.pp_approval_config (config_key, l4_user_id, tat_hours, updated_at)
       VALUES ('global', $1, $2, NOW())
       ON CONFLICT (config_key)
       DO UPDATE SET l4_user_id = EXCLUDED.l4_user_id, tat_hours = EXCLUDED.tat_hours, updated_at = NOW()
       RETURNING *`,
      [l4UserId, tatHours]
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
    await ensureProcessParameterMasterTable();
    const entry_id = await createProcessParameterEntryId();

    const result = await client.query(
      `INSERT INTO process_parameters.master (entry_id, created_by_user_id, created_by_name)
       VALUES ($1, $2, $3)
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
    await ensureProcessParameterMasterTable();
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

    const entryIds = rows.rows.map((r) => r.entry_id);
    const [statusByEntryId] = await Promise.all([
      getCompletionStatusForEntryIds(entryIds),
      Promise.all(rows.rows.filter((r) => r.status === 'in_progress').map((r) => refreshProcessParameterStatus(r.entry_id)))
    ]);

    const refreshedRows = await client.query(
      `SELECT entry_id, status FROM process_parameters.master WHERE entry_id = ANY($1::text[])`,
      [entryIds]
    );
    const statusById = new Map(refreshedRows.rows.map((r) => [r.entry_id, r.status]));

    const data = rows.rows.map((row) => ({
      ...row,
      status: statusById.get(row.entry_id) || row.status,
      completion: statusByEntryId.get(row.entry_id) || {}
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
    await ensureProcessParameterMasterTable();
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
    await ensureProcessParameterMasterTable();
    if (!canActOnPpApproval(req)) {
      return res.status(200).json({ data: [] });
    }

    const status = String(req.query.status ?? 'pending_approval').trim();

    // Catch any batch that's freshly completed all departments since it was
    // last checked, so it shows up in the pending_approval queue right away.
    const inProgress = await client.query(
      `SELECT entry_id FROM process_parameters.master WHERE status = 'in_progress'`
    );
    await Promise.all(inProgress.rows.map((row) => refreshProcessParameterStatus(row.entry_id)));

    const result = await client.query(
      `SELECT * FROM process_parameters.master WHERE status = $1 ORDER BY created_at DESC`,
      [status]
    );

    const entryIds = result.rows.map((row) => row.entry_id);
    const [statusByEntryId, detailByEntryId, fullDetailsList] = await Promise.all([
      getCompletionStatusForEntryIds(entryIds),
      getPpDetailFieldsForEntryIds(entryIds),
      Promise.all(entryIds.map((id) => getPpFullDetailsForEntryId(id))),
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
    }));

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

router.post('/:entry_id/approve', async (req, res, next) => {
  try {
    await ensureProcessParameterMasterTable();
    if (!canActOnPpApproval(req)) {
      return res.status(403).json({ message: 'Only L4, L5, or Admin can approve a PP id' });
    }
    const entry_id = normalizeProcessParameterEntryId(req.params.entry_id);
    const reviewedBy = String(req.body?.department ?? req.body?.reviewed_by ?? req.user?.employee_id ?? '').trim() || null;

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
    await closePpApprovalTicket(entry_id);

    res.status(200).json({ message: 'PP id approved — now Active', data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post('/:entry_id/reject', async (req, res, next) => {
  try {
    await ensureProcessParameterMasterTable();
    if (!canActOnPpApproval(req)) {
      return res.status(403).json({ message: 'Only L4, L5, or Admin can reject a PP id' });
    }
    const entry_id = normalizeProcessParameterEntryId(req.params.entry_id);
    const reviewedBy = String(req.body?.department ?? req.body?.reviewed_by ?? req.user?.employee_id ?? '').trim() || null;
    const reason = String(req.body?.reason ?? '').trim() || null;

    // Rejection isn't a stored stage of its own - it sends the batch back to
    // in_progress so the departments can fix and resubmit their rows.
    const result = await client.query(
      `UPDATE process_parameters.master
       SET status = 'in_progress', reviewed_by = $1, reviewed_at = NOW(), review_remarks = $2, updated_at = NOW()
       WHERE entry_id = $3 AND status = 'pending_approval'
       RETURNING *`,
      [reviewedBy, reason, entry_id]
    );
    if (result.rowCount === 0) {
      return res.status(409).json({ message: 'This PP id is not awaiting approval (already actioned, or not yet complete).' });
    }
    await closePpApprovalTicket(entry_id);

    res.status(200).json({ message: 'PP id rejected — back to In Progress', data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.PP_DEPARTMENTS = PP_DEPARTMENTS;
module.exports.ensureProcessParameterMasterTable = ensureProcessParameterMasterTable;
module.exports.refreshProcessParameterStatus = refreshProcessParameterStatus;
module.exports.runPpApprovalTatCheck = runPpApprovalTatCheck;
module.exports.createPpApprovalTicket = createPpApprovalTicket;
module.exports.closePpApprovalTicket = closePpApprovalTicket;
module.exports.ensurePpApprovalConfigTable = ensurePpApprovalConfigTable;
module.exports.getPpApprovalConfig = getPpApprovalConfig;

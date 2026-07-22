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
      ADD COLUMN IF NOT EXISTS review_remarks TEXT
  `);
};

// One entry per department/type screen that shares the PP entry_id system.
// Each maps to the table + column that already exists today; nothing here
// creates new child tables or touches their schema. idColumn is each table's
// own primary key (they're not all named the same).
const PP_DEPARTMENTS = [
  { key: 'mixing', label: 'Mixing', table: 'mixing.mixing_qc_header', idColumn: 'qc_id' },
  { key: 'blowroom', label: 'Blowroom', table: 'blowroom.blowroom_header', idColumn: 'br_id' },
  { key: 'carding', label: 'Carding', table: 'carding.carding_qc_header', idColumn: 'qc_id' },
  { key: 'drawframe_breaker', label: 'Drawframe (Breaker)', table: 'drawframe.drawframe_qc_header', idColumn: 'ins_id' },
  { key: 'drawframe_finisher', label: 'Drawframe (Finisher)', table: 'drawframe.finisher_drawing_inspection', idColumn: 'id' },
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
    (dept) => `SELECT '${dept.key}' AS dept_key, entry_id FROM ${dept.table} WHERE entry_id = ANY($1::text[])`
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
  return 'pending_approval';
};

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
    const statusByEntryId = await getCompletionStatusForEntryIds(entryIds);

    const data = result.rows.map((row) => ({
      ...row,
      id: row.entry_id,
      title: row.entry_id,
      department: 'Process Parameter',
      completion: statusByEntryId.get(row.entry_id) || {},
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

    res.status(200).json({ message: 'PP id rejected — back to In Progress', data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.PP_DEPARTMENTS = PP_DEPARTMENTS;
module.exports.ensureProcessParameterMasterTable = ensureProcessParameterMasterTable;
module.exports.refreshProcessParameterStatus = refreshProcessParameterStatus;

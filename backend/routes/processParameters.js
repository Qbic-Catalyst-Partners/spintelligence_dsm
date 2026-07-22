const express = require('express');
const client = require('../connection');
const {
  peekNextProcessParameterEntryId,
  normalizeProcessParameterEntryId,
  getExistingCountNameForEntryId,
  createProcessParameterEntryId,
} = require('../utils/processParameterEntryId');

const router = express.Router();

// Each PP batch is one row here (the "master" record) plus, optionally, one
// row per department in its own existing table (mixing.mixing_qc_header,
// blowroom.blowroom_header, etc.) once that department's form is actually
// saved. A department with no row yet is simply "not completed" - there is
// no placeholder/blank row reserved for it up front.
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
};

// One entry per department/type screen that shares the PP entry_id system.
// Each maps to the table + column that already exists today; nothing here
// creates new child tables or touches their schema.
const PP_DEPARTMENTS = [
  { key: 'mixing', label: 'Mixing', table: 'mixing.mixing_qc_header' },
  { key: 'blowroom', label: 'Blowroom', table: 'blowroom.blowroom_header' },
  { key: 'carding', label: 'Carding', table: 'carding.carding_qc_header' },
  { key: 'drawframe_breaker', label: 'Drawframe (Breaker)', table: 'drawframe.drawframe_qc_header' },
  { key: 'drawframe_finisher', label: 'Drawframe (Finisher)', table: 'drawframe.finisher_drawing_inspection' },
  { key: 'simplex', label: 'Simplex', table: 'simplex.simplex_process_parameter' },
  { key: 'spinning', label: 'Spinning', table: 'spinning.spinning_qc_header' },
  { key: 'autoconer', label: 'Autoconer', table: 'autoconer.autoconer_process_parameter' },
  { key: 'autoconer_q2', label: 'Autoconer Q2', table: 'autoconer.autoconer_q2_inspection' },
  { key: 'autoconer_q3', label: 'Autoconer Q3', table: 'autoconer.autoconer_q3_inspection' },
];

// Returns { mixing: true, blowroom: false, ... } for one entry_id by checking
// whether any row exists in each department's table for it - a single query
// via UNION ALL rather than 10 round trips.
const getCompletionStatusForEntryIds = async (entryIds) => {
  if (!entryIds.length) return new Map();

  const unionQuery = PP_DEPARTMENTS.map(
    (dept, index) => `SELECT '${dept.key}' AS dept_key, entry_id FROM ${dept.table} WHERE entry_id = ANY($1::text[])`
  ).join(' UNION ALL ');

  const result = await client.query(unionQuery, [entryIds]);

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
// completion (true if that department's table has a row for this entry_id).
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
    const statusByEntryId = await getCompletionStatusForEntryIds(entryIds);

    const data = rows.rows.map((row) => ({
      ...row,
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

    const statusByEntryId = await getCompletionStatusForEntryIds([entry_id]);

    return res.status(200).json({
      master: result.rows[0],
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

module.exports = router;

const express = require('express');
const router = express.Router();
const client = require('../connection');
const auth = require('../middleware/auth');

const isAdminUser = (req) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  return role === 'admin' || role === 'super admin' || role === 'superadmin';
};

const parsePositiveInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const parseDateOnly = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed || Number.isNaN(Date.parse(trimmed))) return null;
  return trimmed;
};

const ensureDelegationsTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users.delegations (
      id bigserial PRIMARY KEY,
      owner_user_id integer NOT NULL REFERENCES users.user_details(id) ON DELETE CASCADE,
      delegate_user_id integer NOT NULL REFERENCES users.user_details(id) ON DELETE CASCADE,
      from_date date NOT NULL,
      to_date date NOT NULL,
      no_of_days integer NOT NULL,
      created_by integer REFERENCES users.user_details(id),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
};

router.use(auth);

/**
 * Assign a delegation (owner -> delegated-to, for a date range).
 */
router.post('/', async (req, res, next) => {
  try {
    if (!isAdminUser(req)) {
      return res.status(403).json({ message: 'Only admin can assign delegations' });
    }

    await ensureDelegationsTable();

    const ownerUserId = parsePositiveInt(req.body?.owner_user_id);
    const delegateUserId = parsePositiveInt(req.body?.delegate_user_id);
    const fromDate = parseDateOnly(req.body?.from_date);
    const toDate = parseDateOnly(req.body?.to_date);

    if (!ownerUserId || !delegateUserId) {
      return res.status(400).json({ message: 'Valid owner and delegated-to user are required' });
    }
    if (ownerUserId === delegateUserId) {
      return res.status(400).json({ message: 'Owner and delegated-to user cannot be the same' });
    }
    if (!fromDate || !toDate) {
      return res.status(400).json({ message: 'Valid from date and to date are required' });
    }
    if (new Date(toDate) < new Date(fromDate)) {
      return res.status(400).json({ message: 'To date cannot be before from date' });
    }

    const noOfDays = Math.round((new Date(toDate) - new Date(fromDate)) / (1000 * 60 * 60 * 24)) + 1;

    const result = await client.query(
      `INSERT INTO users.delegations
       (owner_user_id, delegate_user_id, from_date, to_date, no_of_days, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       RETURNING *`,
      [ownerUserId, delegateUserId, fromDate, toDate, noOfDays, req.user.id || null]
    );

    return res.status(201).json({
      message: 'Delegation assigned successfully',
      delegation: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Paginated list of delegations, newest first.
 */
router.get('/', async (req, res, next) => {
  try {
    await ensureDelegationsTable();

    const page = parsePositiveInt(req.query?.page) || 1;
    const limit = parsePositiveInt(req.query?.limit) || 10;
    const offset = (page - 1) * limit;

    const [rowsResult, countResult] = await Promise.all([
      client.query(
        `SELECT
           d.id,
           d.owner_user_id,
           d.delegate_user_id,
           d.from_date,
           d.to_date,
           d.no_of_days,
           d.created_at,
           o.full_name AS owner_name,
           o.employee_id AS owner_employee_id,
           t.full_name AS delegate_name,
           t.employee_id AS delegate_employee_id
         FROM users.delegations d
         JOIN users.user_details o ON o.id = d.owner_user_id
         JOIN users.user_details t ON t.id = d.delegate_user_id
         ORDER BY d.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      client.query(`SELECT COUNT(*)::int AS count FROM users.delegations`),
    ]);

    return res.status(200).json({
      delegations: rowsResult.rows,
      page,
      limit,
      total: countResult.rows[0]?.count || 0,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

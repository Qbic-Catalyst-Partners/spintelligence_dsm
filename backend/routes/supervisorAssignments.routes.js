const express = require('express');
const router = express.Router();
const client = require('../connection');
const auth = require('../middleware/auth');

const parsePositiveInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

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

  // Environments where this table predates the UNIQUE constraint may already
  // have duplicate (supervisor, employee) rows - the constraint add below
  // would fail outright without clearing those first. Some of that older
  // data even has duplicate `id` values (the PRIMARY KEY was apparently
  // never enforced either), so ctid - guaranteed unique per physical row -
  // is used for tie-breaking rather than id. Keeps one arbitrary row per pair.
  await client.query(`
    DELETE FROM users.supervisor_assignments a
    USING users.supervisor_assignments b
    WHERE a.supervisor_user_id = b.supervisor_user_id
      AND a.employee_user_id = b.employee_user_id
      AND a.ctid < b.ctid
  `);

  // CREATE TABLE IF NOT EXISTS above is a no-op on environments where this
  // table already existed from an older schema without this constraint -
  // the /assign route's ON CONFLICT (supervisor_user_id, employee_user_id)
  // needs a matching unique constraint/index to work at all.
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'users.supervisor_assignments'::regclass
          AND contype = 'u'
          AND conkey = (
            SELECT array_agg(attnum ORDER BY attnum)
            FROM pg_attribute
            WHERE attrelid = 'users.supervisor_assignments'::regclass
              AND attname IN ('supervisor_user_id', 'employee_user_id')
          )
      ) THEN
        ALTER TABLE users.supervisor_assignments
          ADD CONSTRAINT supervisor_assignments_supervisor_employee_uq
          UNIQUE (supervisor_user_id, employee_user_id);
      END IF;
    END $$;
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
         e.role,
         e.level
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

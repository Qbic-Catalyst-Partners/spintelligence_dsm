const express = require('express');
const router = express.Router();
const client = require('../connection');
const bcrypt = require('bcrypt');
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const csv = require("csv-parser");
const { Parser } = require("json2csv");
const XLSX = require("xlsx");
const saltRounds = 10;
const dayjs = require("dayjs");
const VALID_USER_LEVELS = ["L1", "L2", "L3", "L4", "L5"];
const normalizeUserLevel = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  return VALID_USER_LEVELS.includes(normalized) ? normalized : "L1";
};

// users.user_details.level has a CHECK constraint that predates L4/L5 -
// without this, saving level='L4' or 'L5' fails at the database layer even
// though normalizeUserLevel above now happily passes them through.
let userLevelConstraintEnsured = false;
const ensureUserLevelConstraintAllowsL4L5 = async () => {
  if (userLevelConstraintEnsured) return;
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_details_level_chk'
      ) THEN
        ALTER TABLE users.user_details DROP CONSTRAINT user_details_level_chk;
      END IF;
      ALTER TABLE users.user_details
        ADD CONSTRAINT user_details_level_chk
        CHECK (level IN ('L1', 'L2', 'L3', 'L4', 'L5'));
    END $$;
  `);
  userLevelConstraintEnsured = true;
};

// Reporting hierarchy (Employee-Hierarchy-and-Workflow-System_V2.pdf): every
// user except L5 must be linked to exactly one reporting manager from the
// level immediately above. This single column is the source of truth every
// later escalation/visibility phase will walk, replacing the old ad-hoc
// per-threshold approver-id arrays and the many-to-many supervisor_assignments
// table.
let reportsToColumnEnsured = false;
const ensureReportsToColumn = async () => {
  if (reportsToColumnEnsured) return;
  // Plain nullable integer, no FK constraint: production's users.user_details
  // has no primary/unique constraint on id (confirmed live), so a real
  // REFERENCES clause here would fail the moment this ALTER TABLE actually
  // ran (unlike other tables' FK-to-user_details clauses in this codebase,
  // which only ever "worked" because their CREATE TABLE IF NOT EXISTS was a
  // no-op against an already-existing table). Integrity is enforced at the
  // application level instead, via validateReportingManager below.
  await client.query(`
    ALTER TABLE users.user_details
      ADD COLUMN IF NOT EXISTS reports_to_user_id INTEGER NULL
  `);
  reportsToColumnEnsured = true;
};

const LEVEL_ABOVE = { L1: "L2", L2: "L3", L3: "L4", L4: "L5" };

// Enforces the PDF's "Key Rule": a user can only be assigned a reporting
// manager from the level directly above their own; L5 has no manager (top of
// the hierarchy). Returns an error message string, or null if valid.
const validateReportingManager = async (level, reportsToUserId) => {
  const normalizedLevel = normalizeUserLevel(level);

  if (normalizedLevel === "L5") {
    return reportsToUserId ? "L5 users cannot have a reporting manager." : null;
  }

  const requiredManagerLevel = LEVEL_ABOVE[normalizedLevel];
  if (!reportsToUserId) {
    return `A reporting manager (${requiredManagerLevel}) is required for ${normalizedLevel} users.`;
  }

  const managerResult = await client.query(
    `SELECT level FROM users.user_details WHERE id = $1`,
    [reportsToUserId]
  );
  const managerLevel = managerResult.rows[0]?.level;
  if (!managerLevel) return "Selected reporting manager does not exist.";
  if (managerLevel !== requiredManagerLevel) {
    return `Reporting manager must be a ${requiredManagerLevel} user (selected user is ${managerLevel}).`;
  }
  return null;
};

// Walks reports_to_user_id upward from a user, returning their manager chain
// ordered from immediate manager to the top (e.g. an L1's chain is
// [L2manager, L3manager, L4manager, L5manager]). Used by ticket
// escalation/visibility logic in later phases instead of manually-configured
// approver-id arrays. Capped at 10 hops as a safety net against any cyclical
// data slipping through validation.
const getManagerChain = async (userId) => {
  await ensureReportsToColumn();
  const chain = [];
  let currentId = userId;
  for (let hop = 0; hop < 10; hop++) {
    const result = await client.query(
      `SELECT id, employee_id, full_name, level, reports_to_user_id
       FROM users.user_details WHERE id = $1`,
      [currentId]
    );
    const row = result.rows[0];
    if (!row?.reports_to_user_id) break;
    const managerResult = await client.query(
      `SELECT id, employee_id, full_name, level FROM users.user_details WHERE id = $1`,
      [row.reports_to_user_id]
    );
    const manager = managerResult.rows[0];
    if (!manager) break;
    chain.push(manager);
    currentId = manager.id;
  }
  return chain;
};

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Retrieve all users
 *     description: Fetch all users.
 *     tags:
 *     - User Management
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   employee_id:
 *                     type: string
 *                   full_name:
 *                     type: string
 *                   email:
 *                     type: string
 *                   phone:
 *                     type: string
 *                   role:
 *                     type: string
 *                   department:
 *                     type: string
 *                   account_status:
 *                     type: string
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *       500:
 *         description: Internal server error
 */

router.get('/', async (req, res, next) => {
  try {
    await ensureReportsToColumn();
    const result = await client.query(`
      SELECT
        id,
        employee_id,
        full_name,
        email,
        phone,
        level,
        role,
        department,
        account_status,
        created_at,
        reports_to_user_id
      FROM users.user_details
      ORDER BY id
    `);

    res.status(200).json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Onboarding/edit support: given the hierarchy level a user is being
// assigned, returns only the users eligible to be their reporting manager
// (i.e. active users at the level directly above) - so the frontend dropdown
// can never offer a cross-level or same-level manager in the first place,
// per the PDF's "Key Rule".
router.get('/eligible-managers', async (req, res, next) => {
  try {
    await ensureReportsToColumn();
    const level = normalizeUserLevel(req.query.level);
    const managerLevel = LEVEL_ABOVE[level];
    if (!managerLevel) {
      // L5 (or an invalid level) has no level above it - nothing eligible.
      return res.status(200).json([]);
    }

    const result = await client.query(
      `SELECT id, employee_id, full_name, level
       FROM users.user_details
       WHERE level = $1 AND (account_status IS NULL OR account_status <> 'inactive')
       ORDER BY full_name`,
      [managerLevel]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /users/add-user:
 *   post:
 *     summary: Register a new user
 *     tags:
 *       - User Management
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - first_name
 *               - last_name
 *               - email
 *               - phone
 *               - employee_id
 *               - role
 *               - department
 *               - password
 *             properties:
 *               first_name:
 *                 type: string
 *                 example: Kevin
 *               last_name:
 *                 type: string
 *                 example: M
 *               email:
 *                 type: string
 *                 example: kevinm@example.com
 *               phone:
 *                 type: string
 *                 example: "9876543210"
 *               employee_id:
 *                 type: string
 *                 example: EMP024
 *               role:
 *                 type: string
 *                 example: Quality staff
 *               department:
 *                 type: string
 *                 example: Spinning
 *               password:
 *                 type: string
 *                 example: Password@123
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User created successfully
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     full_name:
 *                       type: string
 *                       example: John Doe
 *                     email:
 *                       type: string
 *                       example: john@example.com
 *                     phone:
 *                       type: string
 *                       example: "9876543210"
 *                     role:
 *                       type: string
 *                       example: employee
 *                     department:
 *                       type: string
 *                       example: IT
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: 2026-02-26T10:30:00.000Z
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: All fields are required
 *       500:
 *         description: Internal server error
 */
router.post('/add-user', async (req, res, next) => {
  try {
    await ensureUserLevelConstraintAllowsL4L5();
    await ensureReportsToColumn();
    const {
      first_name,
      last_name,
      email,
      phone,
      employee_id,
      role,
      department,
      designation,
      level,
      dob,
      password,
      reports_to_user_id
    } = req.body;

    if (
      !first_name ||
      !last_name ||
      !email ||
      !phone ||
      !employee_id ||
      !role ||
      !department ||
      !password
    ) {
      return res.status(400).json({
        message: 'All fields are required'
      });
    }

    await client.query("BEGIN");

    const roleResult = await client.query(
      `SELECT id, name FROM rbac.role_details 
       WHERE LOWER(name) = LOWER($1)`,
      [role]
    );

    if (!roleResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Invalid role name" });
    }

    const role_id = roleResult.rows[0].id;
    const role_name = roleResult.rows[0].name;

    const deptResult = await client.query(
      `SELECT id, name FROM rbac.departments 
       WHERE LOWER(name) = LOWER($1)`,
      [department]
    );

    if (!deptResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Invalid department name" });
    }

    const department_id = deptResult.rows[0].id;
    const department_name = deptResult.rows[0].name;

    const normalizedLevel = normalizeUserLevel(level);
    const reportingManagerError = await validateReportingManager(normalizedLevel, reports_to_user_id || null);
    if (reportingManagerError) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: reportingManagerError });
    }

    const password_hash = await bcrypt.hash(password, saltRounds);
    const full_name = `${first_name} ${last_name}`.trim();

    const result = await client.query(
      `INSERT INTO users.user_details
      (full_name, first_name, last_name, email, phone, password_hash,
      employee_id, role_id, role, department_id, department,
      designation, level, dob, reports_to_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING id, full_name, email, phone,
                role, department, designation, level, dob, created_at, reports_to_user_id`,
      [
        full_name,
        first_name,
        last_name,
        email,
        phone,
        password_hash,
        employee_id,
        role_id,
        role_name,
        department_id,
        department_name,
        designation || null,
        normalizedLevel,
        dob || null,
        reports_to_user_id || null
      ]
    );

    await client.query("COMMIT");

    res.locals.activityDescription = `Created user ${email} (${full_name}) — role ${role_name}, dept ${department_name}`;
    res.locals.activityMetadata = { target_user_id: result.rows[0].id, email };

    res.status(201).json({
      message: 'User created successfully',
      user: result.rows[0]
    });

  } catch (err) {
    await client.query("ROLLBACK");

    if (err.code === '23505') {
      return res.status(400).json({
        message: 'Email or phone already exists'
      });
    }

    next(err);
  }
});

/**
 * @swagger
 * /users/change-password/{id}:
 *   patch:
 *     summary: Change user password
 *     description: Update password for a specific user by ID.
 *     tags:
 *       - User Management
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: User ID
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - new_password
 *               - confirm_password
 *             properties:
 *               new_password:
 *                 type: string
 *               confirm_password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password updated successfully
 *       400:
 *         description: Passwords do not match or invalid request
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.patch('/change-password/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { new_password, confirm_password } = req.body;

    if (!new_password || !confirm_password) {
      return res.status(400).json({ message: 'New password and confirm password are required' });
    }

    if (new_password !== confirm_password) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const userResult = await client.query(
      `SELECT id FROM users.user_details WHERE id = $1`,
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newPasswordHash = await bcrypt.hash(new_password, saltRounds);

    await client.query(
      `UPDATE users.user_details SET password_hash = $1 WHERE id = $2`,
      [newPasswordHash, id]
    );

    res.status(200).json({ message: 'Password updated successfully' });

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /users/{id}:
 *   patch:
 *     summary: Update user details
 *     description: Update user personal and professional details by ID.
 *     tags:
 *       - User Management
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               phone:
 *                 type: string
 *               role:
 *                 type: string
 *               department:
 *                 type: string
 *               dob:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: User updated successfully
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.patch('/:id', async (req, res, next) => {
  try {
    await ensureUserLevelConstraintAllowsL4L5();
    await ensureReportsToColumn();
    const { id } = req.params;
    const {
      first_name,
      last_name,
      phone,
      role,
      department,
      level,
      dob,
      reports_to_user_id
    } = req.body;

    await client.query("BEGIN");

    const existingUser = await client.query(
      `SELECT * FROM users.user_details WHERE id = $1`,
      [id]
    );

    if (!existingUser.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: 'User not found' });
    }

    // Only re-validate the reporting manager if either the level or the
    // manager itself is actually changing on this request - editing
    // unrelated fields (phone, role, ...) shouldn't force re-selecting a
    // manager that was already valid.
    if (level || reports_to_user_id !== undefined) {
      const effectiveLevel = level ? normalizeUserLevel(level) : existingUser.rows[0].level;
      const effectiveManagerId =
        reports_to_user_id !== undefined ? reports_to_user_id || null : existingUser.rows[0].reports_to_user_id;
      const reportingManagerError = await validateReportingManager(effectiveLevel, effectiveManagerId);
      if (reportingManagerError) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: reportingManagerError });
      }
    }

    let role_id = null;
    let role_name = null;
    let department_id = null;
    let department_name = null;

    if (role) {
      const roleResult = await client.query(
        `SELECT id, name FROM rbac.role_details 
         WHERE LOWER(name) = LOWER($1)`,
        [role]
      );

      if (!roleResult.rows.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Invalid role name" });
      }

      role_id = roleResult.rows[0].id;
      role_name = roleResult.rows[0].name;
    }

    if (department) {
      const deptResult = await client.query(
        `SELECT id, name FROM rbac.departments 
         WHERE LOWER(name) = LOWER($1)`,
        [department]
      );

      if (!deptResult.rows.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Invalid department name" });
      }

      department_id = deptResult.rows[0].id;
      department_name = deptResult.rows[0].name;
    }

    // reports_to_user_id needs to support being explicitly cleared (e.g. a
    // user promoted to L5, which must have no manager) - COALESCE can't do
    // that, since it treats a supplied null the same as "not provided", so
    // this column is written unconditionally to whatever was already
    // resolved above (either the new value or the untouched existing one).
    const nextReportsToUserId =
      reports_to_user_id !== undefined ? reports_to_user_id || null : existingUser.rows[0].reports_to_user_id;

    const updated = await client.query(
      `UPDATE users.user_details
      SET first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name),
          phone = COALESCE($3, phone),
          role_id = COALESCE($4, role_id),
          role = COALESCE($5, role),
          department_id = COALESCE($6, department_id),
          department = COALESCE($7, department),
          level = COALESCE($8, level),
          dob = COALESCE($9, dob),
          reports_to_user_id = $11
      WHERE id = $10
      RETURNING id, full_name, email,
                role, department, level, dob, reports_to_user_id`,
      [
        first_name || null,
        last_name || null,
        phone || null,
        role_id,
        role_name,
        department_id,
        department_name,
        level ? normalizeUserLevel(level) : null,
        dob || null,
        id,
        nextReportsToUserId
      ]
    );

    await client.query("COMMIT");

    const changeParts = [];
    if (role_name) changeParts.push(`role → ${role_name}`);
    if (department_name) changeParts.push(`department → ${department_name}`);
    if (level) changeParts.push(`level → ${normalizeUserLevel(level)}`);
    res.locals.activityDescription = `Updated user ${existingUser.rows[0].email}${changeParts.length ? ` — ${changeParts.join(", ")}` : ""}`;
    res.locals.activityMetadata = { target_user_id: id, email: existingUser.rows[0].email };

    res.json({
      message: "User updated successfully",
      user: updated.rows[0]
    });

  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  }
});

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete user
 *     description: Delete a user by ID.
 *     tags:
 *       - User Management
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await client.query(
      `DELETE FROM users.user_details
       WHERE id = $1
       RETURNING id, email, full_name`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.locals.activityDescription = `Deleted user ${result.rows[0].email} (${result.rows[0].full_name})`;
    res.locals.activityMetadata = { target_user_id: id, email: result.rows[0].email };

    res.status(200).json({ message: 'User deleted successfully' });

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /users/{id}/account-status:
 *   patch:
 *     summary: Change account status
 *     description: Update account status of a specific user.
 *     tags:
 *       - User Management
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - account_status
 *             properties:
 *               account_status:
 *                 type: string
 *                 example: Active
 *     responses:
 *       200:
 *         description: Account status updated successfully
 *       400:
 *         description: Account status is required
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.patch('/:id/account-status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { account_status } = req.body;

    if (!account_status) {
      return res.status(400).json({ message: 'Account status is required' });
    }

    const result = await client.query(
      `UPDATE users.user_details
       SET account_status = $1
       WHERE id = $2
       RETURNING id, full_name, email, role, account_status`,
      [account_status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({
      message: 'Account status updated successfully',
      user: result.rows[0]
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * tags:
 *   name: User Management
 *   description: User Management API endpoints for creating, updating, deleting, and managing users.
 */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const ALLOWED_BULK_UPLOAD_EXTENSIONS = [".csv", ".xlsx", ".xls"];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_BULK_UPLOAD_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only CSV or Excel (.xlsx/.xls) files allowed"), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter,
});

const normalizeBulkHeader = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const getBulkValue = (row, keys) => {
  const lookup = {};
  for (const [key, value] of Object.entries(row || {})) {
    lookup[normalizeBulkHeader(key)] = value;
  }

  for (const key of keys) {
    const value = lookup[normalizeBulkHeader(key)];
    if (value !== undefined && value !== null) {
      return typeof value === "string" ? value.trim() : value;
    }
  }

  return "";
};

const createBulkUploadError = (message, details = {}) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.details = details;
  return error;
};

const normalizeAccountStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "Active";
  if (["active", "1", "true", "enabled", "enable"].includes(normalized)) return "Active";
  if (["inactive", "0", "false", "disabled", "disable"].includes(normalized)) return "Inactive";
  return "Active";
};

const splitFullName = (fullNameRaw = "") => {
  const fullName = String(fullNameRaw || "").trim().replace(/\s+/g, " ");
  if (!fullName) return { first_name: "", last_name: "" };
  const parts = fullName.split(" ");
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(" ")
  };
};

const EMPLOYEE_ID_SPECIAL_CHARS = "@#$";
const EMPLOYEE_ID_MAX_LENGTH = 8;

const generateEmployeeId = async (fullName) => {
  const lettersFromName = String(fullName || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4) || "EMP";

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const digitCount = Math.max(2, EMPLOYEE_ID_MAX_LENGTH - lettersFromName.length - 1);
    const digits = String(Math.floor(Math.random() * 10 ** digitCount)).padStart(digitCount, "0");
    const specialChar = EMPLOYEE_ID_SPECIAL_CHARS[Math.floor(Math.random() * EMPLOYEE_ID_SPECIAL_CHARS.length)];
    const candidate = `${lettersFromName}${digits}${specialChar}`.slice(0, EMPLOYEE_ID_MAX_LENGTH);

    const existing = await client.query(
      `SELECT id FROM users.user_details WHERE employee_id = $1`,
      [candidate]
    );
    if (!existing.rows.length) {
      return candidate;
    }
  }

  throw new Error("Unable to generate a unique employee ID, please retry");
};

const resolveRoleForBulk = async ({ roleIdRaw, roleNameRaw, rowNumber }) => {
  const roleId = Number(roleIdRaw);
  if (Number.isInteger(roleId) && roleId > 0) {
    const roleResult = await client.query(
      `SELECT id, name FROM rbac.role_details WHERE id = $1`,
      [roleId]
    );
    if (!roleResult.rows.length) {
      throw createBulkUploadError(`Invalid role_id "${roleIdRaw}" in row ${rowNumber}`, {
        row: rowNumber,
        field: "role_id",
        value: roleIdRaw
      });
    }
    return roleResult.rows[0];
  }

  const roleName = String(roleNameRaw || "").trim();
  if (!roleName) {
    throw createBulkUploadError(`Missing role/role_id in row ${rowNumber}`, {
      row: rowNumber,
      field: "role"
    });
  }

  const roleResult = await client.query(
    `SELECT id, name FROM rbac.role_details WHERE LOWER(name)=LOWER($1)`,
    [roleName]
  );

  if (!roleResult.rows.length) {
    throw createBulkUploadError(`Invalid role name "${roleName}" in row ${rowNumber}`, {
      row: rowNumber,
      field: "role",
      value: roleName
    });
  }

  return roleResult.rows[0];
};

const resolveDepartmentForBulk = async ({ departmentIdRaw, departmentNameRaw, rowNumber }) => {
  const departmentId = Number(departmentIdRaw);
  if (Number.isInteger(departmentId) && departmentId > 0) {
    const deptResult = await client.query(
      `SELECT id, name FROM rbac.departments WHERE id = $1`,
      [departmentId]
    );
    if (!deptResult.rows.length) {
      throw createBulkUploadError(`Invalid department_id "${departmentIdRaw}" in row ${rowNumber}`, {
        row: rowNumber,
        field: "department_id",
        value: departmentIdRaw
      });
    }
    return deptResult.rows[0];
  }

  const departmentName = String(departmentNameRaw || "").trim();
  if (!departmentName) {
    throw createBulkUploadError(`Missing department/department_id in row ${rowNumber}`, {
      row: rowNumber,
      field: "department"
    });
  }

  const deptResult = await client.query(
    `SELECT id, name FROM rbac.departments WHERE LOWER(name)=LOWER($1)`,
    [departmentName]
  );

  if (!deptResult.rows.length) {
    throw createBulkUploadError(`Invalid department name "${departmentName}" in row ${rowNumber}`, {
      row: rowNumber,
      field: "department",
      value: departmentName
    });
  }

  return deptResult.rows[0];
};

const readCsvRows = (filePath) =>
  new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });

const readExcelRows = (filePath) => {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
};

const readBulkUploadRows = (filePath, originalName) => {
  const ext = path.extname(originalName || filePath).toLowerCase();
  if (ext === ".xlsx" || ext === ".xls") {
    return readExcelRows(filePath);
  }
  return readCsvRows(filePath);
};

/**
 * @swagger
 * /users/bulk-upload:
 *   post:
 *     summary: Bulk upload users via CSV or Excel
 *     tags: [User Management]
 *     description: |
 *       Upload users in bulk using CSV or Excel (.xlsx/.xls), matching the UM_BU Template.
 *       Supports DB-aware mapping for role/department using either IDs or names.
 *
 *       Accepted columns (aliases in parentheses):
 *       - Required (effective): `first_name` (First Name, or Full Name), `email` (Email Address), `phone` (Mobile Number),
 *         `role` (Role Selection), `department` or `sub_department` (Sub Department), `reports_to_employee_id`
 *         (required for every level except L5 - see Notes)
 *       - Optional: `last_name` (Last Name), `employee_id` (auto-generated from the name if omitted), `employee_type`
 *         (Employee Type), `department` (Department, stored as top_department when `sub_department` is also present),
 *         `designation`, `level` (Level), `dob`, `account_status`, `password` (Password)
 *
 *       Notes:
 *       - If `full_name` is provided and `first_name` is missing, name is split automatically.
 *       - `sub_department` (when present) is matched against rbac.departments; plain `department` is stored as top_department.
 *       - `employee_id` is auto-generated (name-derived letters + digits + special char, max 8 chars) when not supplied.
 *       - `level` is normalized to one of `L1`-`L5` (default `L1`).
 *       - `reports_to_employee_id` must be the `employee_id` of an existing (or earlier-in-this-file) user whose level
 *         is exactly one level above this row's level - e.g. an L2 row must reference an L3 user. Required for L1-L4;
 *         must be blank for L5 (the top of the hierarchy has no manager). Rows are processed top-to-bottom in one
 *         transaction, so a manager can be defined earlier in the same file as the people who report to them.
 *       - `account_status` is normalized to `Active` / `Inactive` (default `Active`).
 *       - Per-row `password` is used if provided, otherwise defaults to `Password@123`.
 *       - Duplicate emails are skipped (`ON CONFLICT (email) DO NOTHING`).
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Bulk upload completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Bulk upload completed
 *                 processed:
 *                   type: integer
 *                   example: 20
 *                 inserted:
 *                   type: integer
 *                   example: 18
 *                 skipped:
 *                   type: integer
 *                   example: 2
 *       400:
 *         description: Validation error in uploaded file
 *       500:
 *         description: Server error
 */
router.post("/bulk-upload", upload.single("file"), async (req, res, next) => {
  try {
    await ensureUserLevelConstraintAllowsL4L5();
    await ensureReportsToColumn();
    if (!req.file) {
      return res.status(400).json({ message: "Upload file is required" });
    }

    const filePath = req.file.path;
    const usersData = await readBulkUploadRows(filePath, req.file.originalname);

    const result = await processUsers(usersData);

    res.locals.activityDescription = `Bulk uploaded ${result.inserted || 0} user(s) from ${req.file.originalname} (${result.skipped || 0} skipped)`;
    res.locals.activityMetadata = { file_name: req.file.originalname, ...result };

    res.json({ message: "Bulk upload completed", ...result });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        message: error.message,
        details: error.details || undefined
      });
    }
    next(error);
  }
});

async function processUsers(data) {
  if (!Array.isArray(data) || !data.length) {
    throw createBulkUploadError("No users found in upload file");
  }

  let inserted = 0;

  await client.query("BEGIN");
  try {
    for (const [index, row] of data.entries()) {
      const rowNumber = index + 2;
      const fullNameRaw = getBulkValue(row, ["full_name", "full name", "fullname", "name"]);
      let first_name = getBulkValue(row, ["first_name", "first name", "firstname"]);
      let last_name = getBulkValue(row, ["last_name", "last name", "lastname"]);
      const email = getBulkValue(row, ["email", "email_address", "email address"]);
      const phone = getBulkValue(row, ["phone", "phone_number", "phone number", "mobile", "mobile_number", "mobile number"]);
      const employee_id = getBulkValue(row, ["employee_id", "employee id", "employeeid"]);
      const role = getBulkValue(row, ["role", "role_name", "role name", "role_selection", "role selection"]);
      const role_id_raw = getBulkValue(row, ["role_id", "role id"]);
      const sub_department = getBulkValue(row, ["sub_department", "sub department"]);
      const departmentRaw = getBulkValue(row, ["department", "department_name", "department name"]);
      const department = sub_department || departmentRaw;
      const department_id_raw = getBulkValue(row, ["department_id", "department id"]);
      const top_department = sub_department ? departmentRaw : "";
      const employee_type = getBulkValue(row, ["employee_type", "employee type"]);
      const designation = getBulkValue(row, ["designation"]);
      const level = getBulkValue(row, ["level", "user_level"]);
      const reports_to_employee_id = getBulkValue(row, [
        "reports_to_employee_id",
        "reports to employee id",
        "reporting_manager_employee_id",
        "reporting manager employee id",
        "reporting_manager",
        "reporting manager",
        "manager_employee_id",
        "manager employee id"
      ]);
      const dob = getBulkValue(row, ["dob", "date_of_birth", "date of birth"]);
      const account_status = getBulkValue(row, ["account_status", "account status", "status"]);
      const rowPassword = getBulkValue(row, ["password"]);

      if ((!first_name || !String(first_name).trim()) && fullNameRaw) {
        const split = splitFullName(fullNameRaw);
        first_name = split.first_name;
        last_name = last_name || split.last_name;
      }

      const requiredFields = {
        first_name,
        email,
        phone,
        role: role || role_id_raw,
        department: department || department_id_raw
      };
      const missingFields = Object.entries(requiredFields)
        .filter(([, value]) => value === null || value === undefined || String(value).trim() === "")
        .map(([field]) => field);

      if (missingFields.length) {
        throw createBulkUploadError(
          `Missing required fields in row ${rowNumber}: ${missingFields.join(", ")}`,
          { row: rowNumber, missing_fields: missingFields }
        );
      }

      const full_name = `${String(first_name || "").trim()} ${String(last_name || "").trim()}`.trim();
      const resolved_employee_id = employee_id || await generateEmployeeId(full_name);
      const password_hash = await bcrypt.hash(rowPassword || "Password@123", saltRounds);
      const roleResolved = await resolveRoleForBulk({
        roleIdRaw: role_id_raw,
        roleNameRaw: role,
        rowNumber
      });
      const role_id = roleResolved.id;
      const role_name = roleResolved.name;

      const departmentResolved = await resolveDepartmentForBulk({
        departmentIdRaw: department_id_raw,
        departmentNameRaw: department,
        rowNumber
      });
      const department_id = departmentResolved.id;
      const department_name = departmentResolved.name;

      const normalizedLevel = normalizeUserLevel(level);
      let reports_to_user_id = null;
      if (normalizedLevel !== "L5") {
        if (!reports_to_employee_id) {
          throw createBulkUploadError(
            `Missing required field in row ${rowNumber}: reports_to_employee_id (required for every level except L5)`,
            { row: rowNumber, missing_fields: ["reports_to_employee_id"] }
          );
        }
        // Resolved via a fresh SELECT rather than caching across rows, since
        // an earlier row in this same upload may be the manager being
        // referenced here - Postgres sees its own transaction's uncommitted
        // inserts, so this correctly picks up managers created earlier in
        // the same file.
        const managerResult = await client.query(
          `SELECT id FROM users.user_details WHERE employee_id = $1`,
          [String(reports_to_employee_id).trim()]
        );
        const managerId = managerResult.rows[0]?.id;
        if (!managerId) {
          throw createBulkUploadError(
            `Row ${rowNumber}: no user found with employee_id "${reports_to_employee_id}" for reports_to_employee_id`,
            { row: rowNumber }
          );
        }
        const reportingManagerError = await validateReportingManager(normalizedLevel, managerId);
        if (reportingManagerError) {
          throw createBulkUploadError(`Row ${rowNumber}: ${reportingManagerError}`, { row: rowNumber });
        }
        reports_to_user_id = managerId;
      } else if (reports_to_employee_id) {
        throw createBulkUploadError(
          `Row ${rowNumber}: L5 users cannot have a reports_to_employee_id.`,
          { row: rowNumber }
        );
      }

      const insertResult = await client.query(
        `INSERT INTO users.user_details
        (full_name, first_name, last_name, email, phone, password_hash,
        employee_id, role_id, role,
        department_id, department, top_department, employee_type,
        designation, level, dob, account_status, reports_to_user_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        ON CONFLICT (email) DO NOTHING
        RETURNING id`,
        [
          full_name,
          first_name,
          last_name,
          email,
          phone,
          password_hash,
          resolved_employee_id,
          role_id,
          role_name,
          department_id,
          department_name,
          top_department || null,
          employee_type || null,
          designation || null,
          normalizedLevel,
          dob || null,
          normalizeAccountStatus(account_status),
          reports_to_user_id
        ]
      );

      inserted += insertResult.rowCount;
    }

    await client.query("COMMIT");
    return {
      processed: data.length,
      inserted,
      skipped: data.length - inserted
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/**
 * @swagger
 * /users/export:
 *   get:
 *     summary: Export all users as CSV
 *     tags: [User Management]
 *     responses:
 *       200:
 *         description: CSV file download
 *       500:
 *         description: Server error
 */
router.get("/export", async (req, res) => {
  try {
    const result = await client.query(`
      SELECT 
        id,
        full_name,
        first_name,
        last_name,
        email,
        phone,
        employee_id,
        role,
        designation,
        level,
        department,
        dob,
        created_at,
        account_status
      FROM users.user_details
      ORDER BY id
    `);

    const formattedRows = result.rows.map(row => ({
      ...row,
      dob: row.dob ? dayjs(row.dob).format("YYYY-MM-DD") : null,
      created_at: row.created_at ? dayjs(row.created_at).format("YYYY-MM-DD HH:mm:ss") : null
    }));

    const parser = new Parser();
    const csvData = parser.parse(formattedRows);

    res.header("Content-Type", "text/csv");
    res.attachment("users.csv");
    res.send(csvData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
module.exports.getManagerChain = getManagerChain;
module.exports.ensureReportsToColumn = ensureReportsToColumn;

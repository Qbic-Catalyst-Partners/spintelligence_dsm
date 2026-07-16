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
const normalizeUserLevel = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "L3") return "L3";
  if (normalized === "L2") return "L2";
  return "L1";
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
        created_at
      FROM users.user_details
      ORDER BY id
    `);

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
      password
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

    const password_hash = await bcrypt.hash(password, saltRounds);
    const full_name = `${first_name} ${last_name}`.trim();

    const result = await client.query(
      `INSERT INTO users.user_details
      (full_name, first_name, last_name, email, phone, password_hash,
      employee_id, role_id, role, department_id, department,
      designation, level, dob)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING id, full_name, email, phone,
                role, department, designation, level, dob, created_at`,
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
        normalizeUserLevel(level),
        dob || null
      ]
    );

    await client.query("COMMIT");

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
    const { id } = req.params;
    const {
      first_name,
      last_name,
      phone,
      role,
      department,
      level,
      dob
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
          dob = COALESCE($9, dob)
      WHERE id = $10
      RETURNING id, full_name, email,
                role, department, level, dob`,
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
        id
      ]
    );

    await client.query("COMMIT");

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
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

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
 *         `role` (Role Selection), `department` or `sub_department` (Sub Department)
 *       - Optional: `last_name` (Last Name), `employee_id` (auto-generated from the name if omitted), `employee_type`
 *         (Employee Type), `department` (Department, stored as top_department when `sub_department` is also present),
 *         `designation`, `level` (Level), `dob`, `account_status`, `password` (Password)
 *
 *       Notes:
 *       - If `full_name` is provided and `first_name` is missing, name is split automatically.
 *       - `sub_department` (when present) is matched against rbac.departments; plain `department` is stored as top_department.
 *       - `employee_id` is auto-generated (name-derived letters + digits + special char, max 8 chars) when not supplied.
 *       - `level` is normalized to `L1` or `L2` (default `L1`).
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
    if (!req.file) {
      return res.status(400).json({ message: "Upload file is required" });
    }

    const filePath = req.file.path;
    const usersData = await readBulkUploadRows(filePath, req.file.originalname);

    const result = await processUsers(usersData);
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

      const insertResult = await client.query(
        `INSERT INTO users.user_details
        (full_name, first_name, last_name, email, phone, password_hash,
        employee_id, role_id, role,
        department_id, department, top_department, employee_type,
        designation, level, dob, account_status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
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
          normalizeUserLevel(level),
          dob || null,
          normalizeAccountStatus(account_status)
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

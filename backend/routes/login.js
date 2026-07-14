const express = require('express');
const router = express.Router();
const client = require('../connection');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const OTP_SECRET = process.env.OTP_SECRET || 'otp_secret';
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: User authentication APIs
 */
/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     description: Authenticates user using employee ID and password.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - employee_id
 *               - password
 *             properties:
 *               employee_id:
 *                 type: string
 *                 example: EMP005
 *               password:
 *                 type: string     
 *                 example: Password123
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Missing credentials
 *       401:
 *         description: Invalid employee ID or password
 *       500:
 *         description: Internal server error
 */
router.post('/login', async (req, res, next) => {
  try {
    const { employee_id, password } = req.body;

    // 1️⃣ Validate input
    if (!employee_id?.trim() || !password?.trim()) {
      return res.status(400).json({ message: 'Employee ID and password are required' });
    }

    // 2️⃣ Fetch user
    const userResult = await client.query(
      `SELECT id, employee_id, full_name, email, phone, role_id, level, account_status, password_hash, created_at
       FROM users.user_details
       WHERE employee_id = $1`,
      [employee_id.trim()]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid employee ID or password' });
    }

    const user = userResult.rows[0];

    // 3️⃣ Check account status
    if (user.account_status !== 'Active') {
      return res.status(403).json({ message: 'Account is not active' });
    }

    if (!user.password_hash) {
      return res.status(401).json({ message: 'Invalid employee ID or password' });
    }

    // 4️⃣ Compare password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid employee ID or password' });
    }

    // 5️⃣ Fetch role
    const roleResult = await client.query(
      `SELECT id, name, description, status
       FROM rbac.role_details
       WHERE id = $1`,
      [user.role_id]
    );

    const role = roleResult.rows[0];
    if (!role || role.status !== true) {
      return res.status(403).json({ message: 'Role is inactive or missing' });
    }

    // 6️⃣ Generate JWT token
    const token = jwt.sign(
      {
        sub: user.id,
        role_id: role.id,
        role: role.name,
        employee_id: user.employee_id,
        level: user.level
      },
      process.env.JWT_SECRET || 'jwt_secret',
      { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
    );

    // 7️⃣ Send login response
    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        employee_id: user.employee_id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        level: user.level,
        account_status: user.account_status,
        created_at: user.created_at,
        role_id: role.id,
        role: role.name
      }
    });

  } catch (err) {
    console.error('Login route error:', err);
    return next(err);
  }
});

/**
 * @swagger
 * /auth/accessible-screens/{roleId}:
 *   get:
 *     summary: Get accessible screens by role
 *     description: Returns all accessible screens grouped by department for the given role ID.
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Role ID of the user
 *         example: 1
 *     responses:
 *       200:
 *         description: List of accessible screens grouped by department
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 role_id:
 *                   type: integer
 *                   example: 1
 *                 access:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       department_id:
 *                         type: integer
 *                         example: 1
 *                       department_name:
 *                         type: string
 *                         example: Spinning
 *                       screens:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                               example: 1
 *                             name:
 *                               type: string
 *                               example: COTS - CHECKING
 *       400:
 *         description: Invalid role ID supplied
 *       404:
 *         description: No screens found for the role
 *       500:
 *         description: Internal server error
 */
router.get('/accessible-screens/:roleId', async (req, res, next) => {
  try {
    const { roleId } = req.params;

    const roleResult = await client.query(
      `SELECT id, name, status
       FROM rbac.role_details
       WHERE id = $1`,
      [roleId]
    );

    if (roleResult.rows.length === 0) {
      return res.status(404).json({ message: 'Role not found' });
    }

    const role = roleResult.rows[0];

    if (role.status !== true) {
      return res.status(403).json({ message: 'Role is inactive' });
    }

    const isAdmin = String(role.name).trim().toLowerCase() === 'admin';

    const accessQuery = isAdmin
      ? `
        SELECT
          d.id AS department_id,
          d.name AS department_name,
          s.id AS screen_id,
          s.name AS screen_name
        FROM rbac.departments d
        CROSS JOIN rbac.screens s
        WHERE d.is_active = true
          AND s.is_active = true
        ORDER BY d.id, s.id
      `
      : `
        SELECT
          d.id AS department_id,
          d.name AS department_name,
          s.id AS screen_id,
          s.name AS screen_name
        FROM rbac.role_departments rd
        JOIN rbac.departments d
          ON d.id = rd.department_id
        LEFT JOIN rbac.role_screens rs
          ON rs.role_id = rd.role_id
        LEFT JOIN rbac.screens s
          ON s.id = rs.screen_id
         AND s.is_active = true
        WHERE rd.role_id = $1
          AND d.is_active = true
        ORDER BY d.id, s.id
      `;

    const accessResult = isAdmin
      ? await client.query(accessQuery)
      : await client.query(accessQuery, [roleId]);

    // Group screens by department
    const accessMap = {};
    accessResult.rows.forEach(row => {
      if (!accessMap[row.department_id]) {
        accessMap[row.department_id] = {
          department_id: row.department_id,
          department_name: row.department_name,
          screens: []
        };
      }
      if (row.screen_id) {
        accessMap[row.department_id].screens.push({
          id: row.screen_id,
          name: row.screen_name
        });
      }
    });

    return res.status(200).json({
      role_id: roleId,
      role_name: role.name,
      access: Object.values(accessMap)
    });

  } catch (err) {
    console.error('Accessible screens error:', err);
    return next(err);
  }
});

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request OTP for password reset (Development)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *             properties:
 *               phone:
 *                 type: string
 *                 example: 9876543210
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       400:
 *         description: Phone number is required
 */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { phone } = req.body;

    if (!phone)
      return res.status(400).json({ message: 'Phone number is required' });

    const result = await client.query(
      `SELECT id FROM users.user_details WHERE phone = $1`,
      [phone]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'No account found with this phone number'
      });
    }

    const otp = "123456";

    res.status(200).json({
      message: 'OTP sent successfully',
      devOtp: otp
    });

  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     summary: Verify OTP and generate reset token (Development - Static OTP)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - otp
 *             properties:
 *               phone:
 *                 type: string
 *                 example: 9876543210
 *               otp:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *       400:
 *         description: Missing fields or invalid OTP
 *       404:
 *         description: User not found
 */
router.post("/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        message: "Phone and OTP are required"
      });
    }
    if (!/^\+?[0-9]{10,15}$/.test(phone)) {
      return res.status(400).json({
        message: "Invalid phone format"
      });
    }
    const result = await client.query(
      `SELECT id FROM users.user_details WHERE phone = $1`,
      [phone]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    if (otp !== "123456") {
      return res.status(400).json({
        message: "Invalid OTP"
      });
    }

    const resetToken = jwt.sign(
      { phone },
      OTP_SECRET,
      { expiresIn: "15m" }
    );

    res.status(200).json({
      message: "OTP verified successfully",
      resetToken
    });

  } catch (err) {
    res.status(401).json({
      message: "Invalid or expired OTP"
    });
  }
});


/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using reset token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - resetToken
 *               - newPassword
 *               - confirmPassword
 *             properties:
 *               resetToken:
 *                 type: string
 *                 example: jwt_token_here
 *               newPassword:
 *                 type: string
 *                 example: NewPass@123
 *               confirmPassword:
 *                 type: string
 *                 example: NewPass@123
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Validation error
 *       401:
 *         description: Token expired or invalid
 *       404:
 *         description: User not found
 */
router.post("/reset-password", async (req, res, next) => {
  try {
    const { resetToken, newPassword, confirmPassword } = req.body;

    if (!resetToken || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: "All fields are required"
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "Passwords do not match"
      });
    }

    const decoded = jwt.verify(resetToken, OTP_SECRET);

    const hashedPassword = await bcrypt.hash(
      newPassword,
      BCRYPT_SALT_ROUNDS
    );

    const updateResult = await client.query(
      `UPDATE users.user_details 
       SET password_hash = $1 
       WHERE phone = $2
       RETURNING id`,
      [hashedPassword, decoded.phone]
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    res.status(200).json({
      message: "Password reset successful"
    });

  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Reset token expired"
      });
    }

    return res.status(401).json({
      message: "Invalid or expired reset token"
    });
  }
});

module.exports = router;

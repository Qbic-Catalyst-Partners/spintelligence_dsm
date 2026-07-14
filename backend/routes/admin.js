const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const adminOnly = require('../middleware/adminOnly');

const router = express.Router();

function getAdminJwtSecret() {
  return process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'admin_jwt_secret';
}

async function isValidAdminPassword(password) {
  const plainPassword = process.env.ADMIN_PASSWORD;
  const hashedPassword = process.env.ADMIN_PASSWORD_HASH;

  if (hashedPassword) {
    return bcrypt.compare(password, hashedPassword);
  }

  return password === plainPassword;
}

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Dedicated admin authentication and admin-only APIs
 */
/**
 * @swagger
 * /admin/login:
 *   post:
 *     summary: Login admin user
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: admin
 *               password:
 *                 type: string
 *                 example: Admin@123
 *     responses:
 *       200:
 *         description: Admin login successful
 *       400:
 *         description: Username and password are required
 *       401:
 *         description: Invalid admin credentials
 *       500:
 *         description: Server error
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const configuredUsername = process.env.ADMIN_USERNAME;

    if (!username?.trim() || !password?.trim()) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    if (!configuredUsername || (!process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH)) {
      return res.status(500).json({ message: 'Admin credentials are not configured on the server' });
    }

    if (username.trim() !== configuredUsername.trim()) {
      return res.status(401).json({ message: 'Invalid admin credentials' });
    }

    const isPasswordValid = await isValidAdminPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid admin credentials' });
    }

    const normalizedUsername = configuredUsername.trim();
    const token = jwt.sign(
      {
        sub: normalizedUsername,
        username: normalizedUsername,
        role: 'admin',
        auth_type: 'admin'
      },
      getAdminJwtSecret(),
      { expiresIn: '8h' }
    );

    return res.status(200).json({
      message: 'Admin login successful',
      token,
      admin: {
        username: normalizedUsername,
        role: 'admin'
      }
    });
  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

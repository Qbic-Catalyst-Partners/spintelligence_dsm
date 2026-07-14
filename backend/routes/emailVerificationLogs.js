const express = require('express');
const router = express.Router();
const client = require('../connection');

async function createLog({ email, verificationId, isVerified = false }) {
  const result = await client.query(`
    INSERT INTO users.email_verification_logs
      (email, verification_id, is_verified, verified_at)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [email, verificationId, isVerified, null]);

  return result.rows[0];
}

async function markVerified(verificationId) {
  const result = await client.query(`
    UPDATE users.email_verification_logs
    SET is_verified = true,
        verified_at = NOW()
    WHERE verification_id = $1
    RETURNING *
  `, [verificationId]);

  return result.rows[0];
}

async function updateLog({ email, verificationId, isVerified, verifiedAt }) {
  const result = await client.query(`
    UPDATE users.email_verification_logs
    SET email = COALESCE($1, email),
        is_verified = COALESCE($3, is_verified),
        verified_at = COALESCE($4, verified_at)
    WHERE verification_id = $2
    RETURNING *
  `, [email, verificationId, isVerified, verifiedAt]);

  return result.rows[0];
}


async function findLogByEmail(email) {
  const result = await client.query(`
    SELECT * FROM users.email_verification_logs
    WHERE email = $1
    ORDER BY verified_at DESC
    LIMIT 1
  `, [email]);

  return result.rows[0];
}

/**
 * @swagger
 * /email-verification-logs:
 *   get:
 *     summary: Retrieve all email verification logs
 *     tags:
 *       - Email Verification
 *     responses:
 *       200:
 *         description: List of email verification logs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   email:
 *                     type: string
 *                   verification_id:
 *                     type: string
 *                   is_verified:
 *                     type: boolean
 *                   verified_at:
 *                     type: string
 *                     format: date-time
 *       500:
 *         description: Internal server error
 */
router.get('/', async (req, res, next) => {
  try {
    const result = await client.query(`
      SELECT email, verification_id, is_verified, verified_at
      FROM users.email_verification_logs
      ORDER BY verified_at DESC
    `);
    res.status(200).json(result.rows);
  } catch (error) {
    next(error);
  }
});

module.exports = {
  router,
  createLog,
  markVerified,
  findLogByEmail,
  updateLog
};

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sendEmail = require('../email');


const {
  createLog: createLog,
  markVerified: markVerified,
  findLogByEmail: findLogByEmail,
  updateLog: updateLog
} = require('./emailVerificationLogs');


const OTP_SECRET = process.env.OTP_SECRET;
const OTP_EXPIRE = 90; 

function generateOTP() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashOTP(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}


/**
 * @swagger
 * /email-otp/send:
 *   post:
 *     summary: Send OTP to email (stateless)
 *     tags:
 *       - Email Verification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: OTP sent successfully
 */
router.post('/send', async (req, res, next) => {
  const { email } = req.body;

  try {
    if (!email)
      return res.status(400).json({ message: "Email is required" });

    const otp = generateOTP();
    const hashedOtp = hashOTP(otp);
    const verificationId = crypto.randomUUID();
    const existingLog = await findLogByEmail(email);

    if (existingLog) {
      await updateLog({email, verificationId, verified: false, createdAt: new Date() });
    } else {
      await createLog({ email, verificationId, verified: false, createdAt: new Date() });
    }


    const token = jwt.sign(
      { email, otp: hashedOtp, verificationId },
      OTP_SECRET,
      { expiresIn: OTP_EXPIRE }
    );

    sendEmail({
      to: email,
      subject: "Your OTP Code",
      html: `<p>Your OTP is <b>${otp}</b>. It expires in 90 seconds.</p>`
    });

    res.status(200).json({ message: "OTP sent successfully", token });

  } catch (err) {
    next(err);
  }
});


/**
 * @swagger
 * /email-otp/verify:
 *   post:
 *     summary: Verify OTP (stateless)
 *     tags:
 *       - Email Verification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired OTP
 */
router.post('/verify', async (req, res) => {
  const { token, otp } = req.body;

  try {
    if (!token || !otp)
      return res.status(400).json({ message: "Token and OTP required" });

    const payload = jwt.verify(token, OTP_SECRET);

    const hashedInputOtp = hashOTP(otp);

    if (payload.otp !== hashedInputOtp)
      return res.status(400).json({ message: "Invalid OTP" });

    await markVerified(payload.verificationId);

    const verifiedToken = jwt.sign(
      { email: payload.email, verificationId: payload.verificationId},
      OTP_SECRET,
      { expiresIn: "15m" }
    );

    res.status(200).json({
      message: "Email verified successfully",
      verifiedToken
    });

  } catch (err) {
    res.status(400).json({ message: "Invalid or expired OTP" });
  }
});


/**
 * @swagger
 * /email-otp/resend:
 *   post:
 *     summary: Resend OTP to email (stateless)
 *     tags:
 *       - Email Verification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: OTP resent successfully
 */
router.post('/resend', async (req, res, next) => {
  const { email } = req.body || {};

  if (!email)
    return res.status(400).json({ message: "Email is required" });

  try {
    const otp = generateOTP();
    const hashedOtp = hashOTP(otp);
    const verificationId = crypto.randomUUID();

    const existingLog = await findLogByEmail(email);

    if (existingLog) {
      await updateLog({email, verificationId, verified: false, createdAt: new Date() });
    } else {
      await createLog({ email, verificationId, verified: false, createdAt: new Date() });
    }


    const token = jwt.sign(
      { email, otp: hashedOtp, verificationId },
      OTP_SECRET,
      { expiresIn: OTP_EXPIRE }
    );

    res.status(200).json({
      message: "OTP resent successfully",
      token
    });

    sendEmail({
      to: email,
      subject: "Your OTP Code - Resend",
      html: `<p>Your new OTP is <b>${otp}</b>. It expires in 90 seconds.</p>`
    }).catch(err =>
      console.error("Failed to send OTP email:", err)
    );

  } catch (err) {
    next(err);
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();

const STATIC_PHONE_OTP = "123456"; 
const phoneOtps = {};
/**
 * @swagger
 * /phone-verification/send-phone:
 *   post:
 *     summary: Send static OTP to phone (Development only)
 *     description: Returns a static OTP (123456) for the given phone number. Does NOT send SMS.
 *     tags:
 *       - Phone Verification
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
 *                 example: "9876543210"
 *     responses:
 *       200:
 *         description: OTP sent successfully (dummy)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: OTP sent successfully
 *                 devOtp:
 *                   type: string
 *                   example: "123456"
 *       400:
 *         description: Phone number is required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Phone number is required
 */
router.post("/send-phone", (req, res) => {
    const { phone } = req.body;

    if (!phone) {
        return res.status(400).json({ message: "Phone number is required" });
    }

    phoneOtps[phone] = STATIC_PHONE_OTP;

    console.log(`Dummy OTP for ${phone}: ${STATIC_PHONE_OTP}`);

    return res.status(200).json({
        message: "OTP sent successfully (dummy)",
        devOtp: STATIC_PHONE_OTP
    });
});

/**
 * @swagger
 * /phone-verification/verify-phone:
 *   post:
 *     summary: Verify static phone OTP
 *     description: Verifies phone number using a static OTP (123456) for development/testing only.
 *     tags:
 *       - Phone Verification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - otp
 *             properties:
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Phone verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Phone verified successfully
 *       400:
 *         description: Invalid OTP
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Invalid OTP
 */
router.post('/verify-phone', (req, res) => {
    const { otp } = req.body;

    if (otp !== STATIC_PHONE_OTP) {
        return res.status(400).json({ message: "Invalid OTP" });
    }

    return res.status(200).json({
        message: "Phone verified successfully"
    });
});

module.exports = router;

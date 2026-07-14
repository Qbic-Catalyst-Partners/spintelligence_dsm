const express = require("express");
const router = express.Router();
const client = require("../connection");

/**
 * @swagger
 * tags:
 *   name: Screens
 *   description: APIs for managing application screens
 */


/**
 * @swagger
 * /screens:
 *   post:
 *     summary: Create a new screen
 *     operationId: createScreen
 *     tags: [Screens]
 *     requestBody:
 *       required: true
 *       description: Screen details
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: Dashboard
 *               is_active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Screen created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Screen created successfully
 *                 screen:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: Dashboard
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error or screen already exists
 *       500:
 *         description: Internal server error
 */
router.post("/", async (req, res) => {

  const { name, is_active = true } = req.body;

  if (!name) {
    return res.status(400).json({
      error: "Screen name is required"
    });
  }

  try {

    const existing = await client.query(
      `SELECT id FROM rbac.screens WHERE LOWER(name)=LOWER($1)`,
      [name]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        error: "Screen already exists"
      });
    }

    const result = await client.query(
      `INSERT INTO rbac.screens (name, is_active)
       VALUES ($1,$2)
       RETURNING id,name,is_active,created_at`,
      [name, is_active]
    );

    res.status(201).json({
      message: "Screen created successfully",
      screen: result.rows[0]
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Internal server error"
    });
  }

});


/**
 * @swagger
 * /screens:
 *   get:
 *     summary: Get list of screens
 *     operationId: getScreens
 *     tags: [Screens]
 *     parameters:
 *       - in: query
 *         name: page
 *         description: Page number
 *         required: false
 *         schema:
 *           type: integer
 *           default: 1
 *           example: 1
 *       - in: query
 *         name: limit
 *         description: Number of records per page
 *         required: false
 *         schema:
 *           type: integer
 *           default: 10
 *           example: 10
 *     responses:
 *       200:
 *         description: List of screens
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 screens:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       name:
 *                         type: string
 *                         example: Dashboard
 *                       is_active:
 *                         type: boolean
 *                         example: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *                   example: 15
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 10
 *       500:
 *         description: Internal server error
 */
router.get("/", async (req, res) => {

  const { page = 1, limit = 10 } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  try {

    const result = await client.query(
      `SELECT id,name,is_active,created_at
       FROM rbac.screens
       ORDER BY id
       OFFSET $1 LIMIT $2`,
      [offset, limitNum]
    );

    const total = await client.query(
      `SELECT COUNT(*) FROM rbac.screens`
    );

    res.status(200).json({
      screens: result.rows,
      total: parseInt(total.rows[0].count),
      page: pageNum,
      limit: limitNum
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Internal server error"
    });
  }

});


/**
 * @swagger
 * /screens/{id}:
 *   delete:
 *     summary: Permanently delete a screen
 *     operationId: deleteScreen
 *     tags: [Screens]
 *     parameters:
 *       - in: path
 *         name: id
 *         description: Screen ID
 *         required: true
 *         schema:
 *           type: integer
 *           example: 3
 *     responses:
 *       200:
 *         description: Screen deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Screen deleted successfully
 *                 screen:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 3
 *                     name:
 *                       type: string
 *                       example: Dashboard
 *       404:
 *         description: Screen not found
 *       500:
 *         description: Internal server error
 */
router.delete("/:id", async (req, res) => {

  const { id } = req.params;

  try {

    const result = await client.query(
      `DELETE FROM rbac.screens
       WHERE id=$1
       RETURNING id,name`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Screen not found"
      });
    }

    res.status(200).json({
      message: "Screen deleted successfully",
      screen: result.rows[0]
    });

  } catch (error) {

    console.error(error);
    res.status(500).json({
      error: error.message
    });

  }

});


/**
 * @swagger
 * /screens/{id}/toggle:
 *   patch:
 *     summary: Toggle screen active status
 *     operationId: toggleScreenStatus
 *     tags: [Screens]
 *     parameters:
 *       - in: path
 *         name: id
 *         description: Screen ID
 *         required: true
 *         schema:
 *           type: integer
 *           example: 3
 *     responses:
 *       200:
 *         description: Screen status toggled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Screen status toggled successfully
 *                 screen:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     is_active:
 *                       type: boolean
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Screen not found
 *       500:
 *         description: Internal server error
 */
router.patch("/:id/toggle", async (req, res) => {

  const { id } = req.params;

  try {

    const result = await client.query(
      `UPDATE rbac.screens
       SET is_active = NOT is_active
       WHERE id = $1
       RETURNING id,name,is_active,created_at`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Screen not found"
      });
    }

    res.status(200).json({
      message: "Screen status toggled successfully",
      screen: result.rows[0]
    });

  } catch (error) {

    console.error(error);
    res.status(500).json({
      error: "Internal server error"
    });

  }

});

module.exports = router;
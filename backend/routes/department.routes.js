const express = require("express");
const router = express.Router();
const client = require("../connection");

/**
 * @swagger
 * tags:
 *   name: Departments
 *   description: APIs for managing departments
 */


/**
 * @swagger
 * /departments:
 *   post:
 *     summary: Create a new department
 *     operationId: createDepartment
 *     tags: [Departments]
 *     requestBody:
 *       required: true
 *       description: Department details
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: Finance
 *               is_active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Department created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Department created successfully
 *                 department:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: Finance
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error or department already exists
 *       500:
 *         description: Internal server error
 */


router.post("/", async (req, res) => {

  const { name, is_active = true } = req.body;

  if (!name) {
    return res.status(400).json({
      error: "Department name is required"
    });
  }

  try {

    const existing = await client.query(
      `SELECT id FROM rbac.departments WHERE LOWER(name)=LOWER($1)`,
      [name]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        error: "Department already exists"
      });
    }

    const result = await client.query(
      `INSERT INTO rbac.departments(name,is_active)
       VALUES($1,$2)
       RETURNING id,name,is_active,created_at`,
      [name, is_active]
    );

    res.status(201).json({
      message: "Department created successfully",
      department: result.rows[0]
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
 * /departments:
 *   get:
 *     summary: Get list of departments
 *     operationId: getDepartments
 *     tags: [Departments]
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
 *         description: List of departments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 departments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       name:
 *                         type: string
 *                         example: Finance
 *                       is_active:
 *                         type: boolean
 *                         example: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *                   example: 25
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

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  const offset = (page - 1) * limit;

  try {

    const result = await client.query(
      `SELECT id,name,is_active,created_at
       FROM rbac.departments
       ORDER BY id
       OFFSET $1 LIMIT $2`,
      [offset, limit]
    );

    const total = await client.query(
      `SELECT COUNT(*) FROM rbac.departments`
    );

    res.status(200).json({
      departments: result.rows,
      total: parseInt(total.rows[0].count),
      page,
      limit
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
 * /departments/{id}:
 *   delete:
 *     summary: Permanently delete a department
 *     operationId: deleteDepartment
 *     tags: [Departments]
 *     parameters:
 *       - in: path
 *         name: id
 *         description: Department ID
 *         required: true
 *         schema:
 *           type: integer
 *           example: 3
 *     responses:
 *       200:
 *         description: Department deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Department deleted successfully
 *                 department:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 3
 *                     name:
 *                       type: string
 *                       example: Finance
 *       400:
 *         description: Department is used by employees or roles
 *       404:
 *         description: Department not found
 *       500:
 *         description: Internal server error
 */

router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {

    const users = await client.query(
      `SELECT 1 FROM users.user_details WHERE department_id=$1 LIMIT 1`,
      [id]
    );

    if (users.rows.length > 0) {
      return res.status(400).json({
        error: "Department is used by employees. Cannot delete."
      });
    }

    const roles = await client.query(
      `SELECT 1 FROM rbac.role_departments WHERE department_id=$1 LIMIT 1`,
      [id]
    );

    if (roles.rows.length > 0) {
      return res.status(400).json({
        error: "Department is assigned to roles. Cannot delete."
      });
    }

    const result = await client.query(
      `DELETE FROM rbac.departments
       WHERE id=$1
       RETURNING id,name`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Department not found"
      });
    }

    res.status(200).json({
      message: "Department deleted successfully",
      department: result.rows[0]
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
 * /departments/{id}/toggle:
 *   patch:
 *     summary: Toggle department active status
 *     operationId: toggleDepartmentStatus
 *     tags: [Departments]
 *     parameters:
 *       - in: path
 *         name: id
 *         description: Department ID
 *         required: true
 *         schema:
 *           type: integer
 *           example: 3
 *     responses:
 *       200:
 *         description: Department status toggled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Department status toggled successfully
 *                 department:
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
 *         description: Department not found
 *       500:
 *         description: Internal server error
 */
router.patch("/:id/toggle", async (req, res) => {

  const { id } = req.params;

  try {

    const result = await client.query(
      `UPDATE rbac.departments
       SET is_active = NOT is_active
       WHERE id=$1
       RETURNING id,name,is_active,created_at`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Department not found"
      });
    }

    res.status(200).json({
      message: "Department status toggled successfully",
      department: result.rows[0]
    });

  } catch (error) {

    console.error(error);
    res.status(500).json({
      error: "Internal server error"
    });

  }

});

module.exports = router;
const express = require("express");
const router = express.Router();
const client = require("../connection");

const normalizeIdArray = (value) => {
  if (!Array.isArray(value)) return value;
  return value
    .map((item) => {
      if (item && typeof item === "object") {
        return item.id ?? item.value ?? item.screen_id ?? item.department_id ?? item.permission_id;
      }
      return item;
    })
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
};

const normalizeStatus = (value, fallback = true) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const normalized = String(value).trim().toLowerCase();
  if (["active", "true", "1", "yes", "enabled"].includes(normalized)) return true;
  if (["inactive", "false", "0", "no", "disabled"].includes(normalized)) return false;
  return fallback;
};

/**
 * @swagger
 * tags:
 *   name: Roles
 *   description: Roles & Permissions APIs
 */

/**
 * @swagger
 * /roles:
 *   post:
 *     summary: Create new role
 *     tags: [Roles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - department_ids
 *               - screen_ids
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: boolean
 *               department_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *               screen_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       201:
 *         description: Role created successfully
 *       400:
 *         description: Validation error
 */

router.post("/", async (req, res) => {
  const name = req.body.name || req.body.role_name;
  const description = req.body.description;
  const status = normalizeStatus(req.body.status ?? req.body.is_active, true);
  const department_ids = normalizeIdArray(
    req.body.department_ids || req.body.departments || req.body.selected_departments
  );
  const screen_ids = normalizeIdArray(
    req.body.screen_ids ||
      req.body.permission_ids ||
      req.body.permissions ||
      req.body.selected_screens ||
      req.body.selected_permissions
  );

  if (!name) {
    return res.status(400).json({ error: "Role name is required" });
  }

  if (!department_ids || !department_ids.length) {
    return res.status(400).json({ error: "At least one department required" });
  }

  if (!screen_ids || !screen_ids.length) {
    return res.status(400).json({ error: "At least one screen required" });
  }

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id FROM rbac.role_details WHERE LOWER(name) = LOWER($1)`,
      [name]
    );

    if (existing.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Role name already exists" });
    }

    const roleResult = await client.query(
      `INSERT INTO rbac.role_details
       (name, description, status, created_at, updated_at)
       VALUES ($1,$2,$3,NOW(),NOW())
       RETURNING id, name, status`,
      [name, description || null, status]
    );

    const roleId = roleResult.rows[0].id;

    for (const screenId of screen_ids) {
      await client.query(
        `INSERT INTO rbac.role_screens (role_id, screen_id)
         VALUES ($1,$2)`,
        [roleId, screenId]
      );
    }

    for (const deptId of department_ids) {
      await client.query(
        `INSERT INTO rbac.role_departments (role_id, department_id)
         VALUES ($1,$2)`,
        [roleId, deptId]
      );
    }

    await client.query("COMMIT");

    res.locals.activityDescription = `Created role '${roleResult.rows[0].name}' with ${screen_ids.length} screen(s) across ${department_ids.length} department(s)`;
    res.locals.activityMetadata = { role_id: roleId, role_name: roleResult.rows[0].name };

    res.status(201).json({
      message: "Role created successfully",
      role_id: roleId,
      name: roleResult.rows[0].name,
      status: roleResult.rows[0].status ? "Active" : "Inactive",
    });

  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /roles:
 *   get:
 *     summary: Get list of roles with pagination
 *     tags: [Roles]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of roles retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 roles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       status:
 *                         type: string
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.get("/", async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  try {
    const result = await client.query(
      `
      WITH total_screens AS (
        SELECT COUNT(*) AS total FROM rbac.screens
      )
      SELECT 
        r.id,
        r.name,
        r.name AS role_name,
        r.description,
        r.status,

        -- Screen Count (assigned / total)
        COUNT(DISTINCT rs.screen_id) || '/' || ts.total AS screen_count,

        -- Total Users Assigned
        COUNT(DISTINCT ur.id) AS users

      FROM rbac.role_details r
      LEFT JOIN rbac.role_screens rs 
        ON r.id = rs.role_id
      LEFT JOIN users.user_details ur 
        ON r.id = ur.role_id
      CROSS JOIN total_screens ts

      GROUP BY r.id, r.name, r.description, r.status, ts.total
      ORDER BY r.id
      OFFSET $1 LIMIT $2
      `,
      [offset, limitNum]
    );

    const totalResult = await client.query(
      `SELECT COUNT(*) FROM rbac.role_details`
    );

    res.status(200).json({
      roles: result.rows,
      total: parseInt(totalResult.rows[0].count),
      page: pageNum,
      limit: limitNum,
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
  
/**
 * @swagger
 * /roles/{id}:
 *   patch:
 *     summary: Update role details
 *     tags: [Roles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Role ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: boolean
 *               department_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *               screen_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Role updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Role not found
 *       500:
 *         description: Server error
 */

// System_id should be asked from the user
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const name = req.body.name || req.body.role_name;
  const description = req.body.description;
  const screen_ids = normalizeIdArray(
    req.body.screen_ids ||
      req.body.permission_ids ||
      req.body.permissions ||
      req.body.selected_screens ||
      req.body.selected_permissions
  );
  const department_ids = normalizeIdArray(
    req.body.department_ids || req.body.departments || req.body.selected_departments
  );
  const rawStatus = req.body.status;
  const status = normalizeStatus(rawStatus ?? req.body.is_active, null);

  if (!id) {
    return res.status(400).json({ error: "Role ID is required" });
  }

  try {
    await client.query("BEGIN");

    const existingRole = await client.query(
      `SELECT id, name FROM rbac.role_details WHERE id = $1`,
      [id]
    );

    if (!existingRole.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Role not found" });
    }

    if (name) {
      const duplicate = await client.query(
        `SELECT id FROM rbac.role_details 
         WHERE LOWER(name) = LOWER($1) AND id <> $2`,
        [name, id]
      );

      if (duplicate.rows.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Role name already exists" });
      }
    }

    await client.query(
      `UPDATE rbac.role_details
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           status = COALESCE($3, status),
           updated_at = NOW()
       WHERE id = $4`,
      [name, description, status, id]
    );

    if (screen_ids) {
      await client.query(`DELETE FROM rbac.role_screens WHERE role_id = $1`, [id]);

      for (const screenId of screen_ids) {
        await client.query(
          `INSERT INTO rbac.role_screens (role_id, screen_id)
           VALUES ($1,$2)`,
          [id, screenId]
        );
      }
    }

    if (department_ids) {
      await client.query(`DELETE FROM rbac.role_departments WHERE role_id = $1`, [id]);

      for (const deptId of department_ids) {
        await client.query(
          `INSERT INTO rbac.role_departments (role_id, department_id)
           VALUES ($1,$2)`,
          [id, deptId]
        );
      }
    }

    await client.query("COMMIT");

    const roleName = name || existingRole.rows[0].name;
    const changeParts = [];
    if (name) changeParts.push(`renamed to '${name}'`);
    if (screen_ids) changeParts.push("screen access changed");
    if (department_ids) changeParts.push("department access changed");
    if (status !== null && status !== undefined) changeParts.push(`status set to ${status ? "Active" : "Inactive"}`);
    res.locals.activityDescription = `Updated role '${roleName}'${changeParts.length ? ` — ${changeParts.join(", ")}` : ""}`;
    res.locals.activityMetadata = { role_id: id, role_name: roleName };

    res.status(200).json({
      message: "Role updated successfully",
      role_id: id,
    });

  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /roles/{id}:
 *   delete:
 *     summary: Delete a role
 *     tags: [Roles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Role ID
 *     responses:
 *       200:
 *         description: Role deleted successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Role not found
 *       500:
 *         description: Server error
 */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "Role ID is required" });
  }

  try {
    await client.query("BEGIN");

    const existingRole = await client.query(
      `SELECT id, name FROM rbac.role_details WHERE id = $1`,
      [id]
    );

    if (!existingRole.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Role not found" });
    }

    await client.query(`DELETE FROM rbac.role_screens WHERE role_id = $1`, [id]);
    await client.query(`DELETE FROM rbac.role_departments WHERE role_id = $1`, [id]);
    await client.query(`DELETE FROM users.user_details WHERE role_id = $1`, [id]);
    await client.query(`DELETE FROM rbac.role_details WHERE id = $1`, [id]);

    await client.query("COMMIT");

    res.locals.activityDescription = `Deleted role '${existingRole.rows[0].name}'`;
    res.locals.activityMetadata = { role_id: id, role_name: existingRole.rows[0].name };

    res.status(200).json({
      message: "Role deleted successfully",
      role_id: id,
    });

  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /roles/departments:
 *   get:
 *     summary: Get list of all departments
 *     tags: [Roles]
 *     responses:
 *       200:
 *         description: Departments retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *       500:
 *         description: Server error
 */
router.get('/departments', async (req, res, next) => {
  try {
    const result = await client.query(
      `SELECT id, name, is_active
       FROM rbac.departments
       WHERE is_active = true
       ORDER BY id`
    );

    res.status(200).json(result.rows);

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /roles/screens:
 *   get:
 *     summary: Get list of all screens (application modules)
 *     tags: [Roles]
 *     responses:
 *       200:
 *         description: Screens retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   route_path:
 *                     type: string
 *       500:
 *         description: Server error
 */
router.get('/screens', async (req, res, next) => {
  try {
    const result = await client.query(
      `SELECT s.id, s.name, s.is_active, s.department_id, d.name AS department_name
       FROM rbac.screens s
       LEFT JOIN rbac.departments d ON d.id = s.department_id
       WHERE s.is_active = true
       ORDER BY s.id`
    );

    res.status(200).json(result.rows);

  } catch (error) {
    next(error);
  }
});

const getRoleDetailsById = async (id) => {
  const roleResult = await client.query(
    `
    SELECT
      r.id,
      r.name,
      r.description,
      r.status,
      r.updated_at,
      COUNT(DISTINCT u.id)::int AS users_count
    FROM rbac.role_details r
    LEFT JOIN users.user_details u
      ON r.id = u.role_id
    WHERE r.id = $1
    GROUP BY r.id, r.name, r.description, r.status, r.updated_at
    `,
    [id]
  );

  if (!roleResult.rows.length) return null;

  const [departmentResult, screenResult] = await Promise.all([
    client.query(
      `
      SELECT d.id, d.name
      FROM rbac.role_departments rd
      JOIN rbac.departments d
        ON d.id = rd.department_id
      WHERE rd.role_id = $1
      ORDER BY d.id
      `,
      [id]
    ),
    client.query(
      `
      SELECT s.id, s.name, s.is_active
      FROM rbac.role_screens rs
      JOIN rbac.screens s
        ON s.id = rs.screen_id
      WHERE rs.role_id = $1
      ORDER BY s.id
      `,
      [id]
    )
  ]);

  const role = roleResult.rows[0];
  const departments = departmentResult.rows.map((department) => ({
    id: department.id,
    name: department.name,
    label: department.name,
    value: department.id
  }));
  const screens = screenResult.rows.map((screen) => ({
    id: screen.id,
    name: screen.name,
    label: screen.name,
    value: screen.id,
    is_active: screen.is_active
  }));

  const payload = {
    id: role.id,
    role_id: role.id,
    name: role.name,
    role_name: role.name,
    description: role.description || "",
    status: role.status,
    status_label: role.status ? "Active" : "Inactive",
    is_active: role.status,
    users_count: role.users_count,
    updated_at: role.updated_at,
    department_ids: departments.map((department) => department.id),
    department_names: departments.map((department) => department.name),
    departments,
    selected_departments: departments,
    screen_ids: screens.map((screen) => screen.id),
    screen_names: screens.map((screen) => screen.name),
    screens,
    selected_screens: screens,
    permission_ids: screens.map((screen) => screen.id),
    permissions: screens,
    selected_permissions: screens
  };

  return {
    ...payload,
    role: payload,
    data: payload
  };
};

const sendRoleDetails = async (req, res) => {
  const id = req.params.id || req.query.id || req.query.role_id || req.query.roleId;

  if (!id) {
    return res.status(400).json({ error: "Role ID is required" });
  }

  try {
    const roleDetails = await getRoleDetailsById(id);

    if (!roleDetails) {
      return res.status(404).json({ error: "Role not found" });
    }

    return res.status(200).json(roleDetails);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

router.get(['/edit/:id', '/editrole/:id', '/edit-role/:id', '/role/:id', '/:id/edit'], sendRoleDetails);
router.get(['/edit', '/editrole', '/edit-role'], sendRoleDetails);

/**
 * @swagger
 * /roles/{id}:
 *   get:
 *     summary: Get role details by ID
 *     tags: [Roles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Role ID
 *     responses:
 *       200:
 *         description: Role retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 name:
 *                   type: string
 *                 description:
 *                   type: string
 *                 status:
 *                   type: string
 *                 users_count:
 *                   type: integer
 *                 updated_at:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Role not found
 *       500:
 *         description: Server error
 */

router.get("/:id", sendRoleDetails);

module.exports = router;

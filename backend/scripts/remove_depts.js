const client = require("../connection");

async function removeDepartment(name) {
  const dept = await client.query(
    `SELECT id, name FROM rbac.departments WHERE LOWER(name)=LOWER($1)`,
    [name]
  );

  if (dept.rows.length === 0) {
    console.log(`${name} department not found, skipping.`);
    return;
  }

  const id = dept.rows[0].id;

  const users = await client.query(
    `SELECT 1 FROM users.user_details WHERE department_id=$1 LIMIT 1`,
    [id]
  );
  if (users.rows.length > 0) {
    console.log(`${name} department is used by employees. Cannot delete.`);
    return;
  }

  const roles = await client.query(
    `SELECT 1 FROM rbac.role_departments WHERE department_id=$1 LIMIT 1`,
    [id]
  );
  if (roles.rows.length > 0) {
    console.log(`${name} department is assigned to roles. Cannot delete.`);
    return;
  }

  const result = await client.query(
    `DELETE FROM rbac.departments WHERE id=$1 RETURNING id, name`,
    [id]
  );
  console.log(`Deleted ${name} department:`, result.rows[0]);
}

(async () => {
  try {
    await removeDepartment("Leadership");
    await removeDepartment("IT");

    const after = await client.query(`SELECT id, name, is_active, created_at FROM rbac.departments ORDER BY id`);
    console.log("Departments after:", after.rows);
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    process.exit(0);
  }
})();

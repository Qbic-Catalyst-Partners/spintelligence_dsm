const client = require("../connection");

async function ensureDepartment(name) {
  const existing = await client.query(
    `SELECT id FROM rbac.departments WHERE LOWER(name)=LOWER($1)`,
    [name]
  );

  if (existing.rows.length > 0) {
    console.log(`${name} department already exists:`, existing.rows[0]);
    return;
  }

  const result = await client.query(
    `INSERT INTO rbac.departments(name, is_active) VALUES($1, $2) RETURNING id, name, is_active, created_at`,
    [name, true]
  );
  console.log(`Inserted ${name} department:`, result.rows[0]);
}

(async () => {
  try {
    await ensureDepartment("Management");
    await ensureDepartment("Leadership");

    const after = await client.query(`SELECT id, name, is_active, created_at FROM rbac.departments ORDER BY id`);
    console.log("Departments after:", after.rows);
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    process.exit(0);
  }
})();

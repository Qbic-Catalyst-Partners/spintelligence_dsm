// Additive-only schema sync: local Postgres <- Supabase.
// Only ADD COLUMN / ADD CONSTRAINT / CREATE INDEX / CREATE SEQUENCE.
// Never DROP, TRUNCATE, DELETE, or UPDATE any existing row data.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const report = require(path.join(__dirname, "schema-diff-report.json"));

const EXTRA_FKS = [
  {
    schema: "ticketing_system", table: "operator_tickets",
    name: "operator_tickets_approval_l1_user_id_fkey", column: "approval_l1_user_id",
    refSchema: "users", refTable: "user_details", refColumn: "id"
  },
  {
    schema: "ticketing_system", table: "operator_tickets",
    name: "operator_tickets_approval_l2_user_id_fkey", column: "approval_l2_user_id",
    refSchema: "users", refTable: "user_details", refColumn: "id"
  }
];

function buildColType(def) {
  const t = def.data_type;
  if (t === "character varying") {
    return def.character_maximum_length ? `varchar(${def.character_maximum_length})` : "varchar";
  }
  if (t === "character") {
    return def.character_maximum_length ? `char(${def.character_maximum_length})` : "char";
  }
  if (t === "numeric") {
    if (def.numeric_precision != null && def.numeric_scale != null) {
      return `numeric(${def.numeric_precision},${def.numeric_scale})`;
    }
    return "numeric";
  }
  if (t === "ARRAY") {
    return `${def.udt_name.replace(/^_/, "")}[]`;
  }
  if (t === "USER-DEFINED") {
    return def.udt_name;
  }
  return t;
}

async function main() {
  const localCs = process.env.DATABASE_URL_LOCAL;
  const client = new Client({ connectionString: localCs });
  await client.connect();

  const statements = [];
  const notes = [];

  // 1) Missing columns
  for (const c of report.columnsMissingInLocal) {
    const [schema, table, col] = c.key.split(".");
    const def = c.def;
    const type = buildColType(def);
    let seqCreate = null;
    let seqOwn = null;
    const match = /nextval\('([^']+)'::regclass\)/.exec(def.column_default || "");
    if (match) {
      let seqName = match[1];
      if (!seqName.includes(".")) seqName = `${schema}.${seqName}`;
      seqCreate = `CREATE SEQUENCE IF NOT EXISTS ${seqName};`;
      seqOwn = `ALTER SEQUENCE ${seqName} OWNED BY ${schema}.${table}.${col};`;
    }
    if (seqCreate) statements.push(seqCreate);

    const canBeNotNull = def.is_nullable === "NO" && def.column_default;
    const nullClause = canBeNotNull ? " NOT NULL" : "";
    const defaultClause = def.column_default ? ` DEFAULT ${def.column_default}` : "";
    statements.push(
      `ALTER TABLE ${schema}.${table} ADD COLUMN IF NOT EXISTS ${col} ${type}${defaultClause}${nullClause};`
    );
    if (def.is_nullable === "NO" && !def.column_default) {
      notes.push(`SKIPPED NOT NULL enforcement on ${c.key} - no default available, added as nullable instead (would fail on existing rows otherwise).`);
    }
    if (seqOwn) statements.push(seqOwn);
  }

  // 2) Missing constraints (PK/UNIQUE from the diff; FK filled in separately with real refs)
  for (const c of report.constraintsMissingInLocal) {
    const [schema, table] = c.key.split(".");
    const def = c.def;
    if (def.constraint_type === "FOREIGN KEY") {
      continue; // handled via EXTRA_FKS with verified references
    }
    const cols = def.columns;
    statements.push(
      `ALTER TABLE ${schema}.${table} ADD CONSTRAINT ${def.constraint_name} ${def.constraint_type} (${cols});`
    );
  }

  for (const fk of EXTRA_FKS) {
    statements.push(
      `ALTER TABLE ${fk.schema}.${fk.table} ADD CONSTRAINT ${fk.name} FOREIGN KEY (${fk.column}) REFERENCES ${fk.refSchema}.${fk.refTable}(${fk.refColumn});`
    );
  }

  // 3) Missing indexes (skip *_pkey - those come from the PK constraints above)
  for (const idx of report.indexesMissingInLocal) {
    if (idx.key.endsWith("_pkey")) continue;
    statements.push(idx.def.replace(/^CREATE (UNIQUE )?INDEX/, "CREATE $1INDEX IF NOT EXISTS") + ";");
  }

  console.log(`Prepared ${statements.length} statements.`);
  const results = { applied: [], failed: [] };

  for (const sql of statements) {
    try {
      await client.query(sql);
      results.applied.push(sql);
    } catch (err) {
      results.failed.push({ sql, error: err.message });
    }
  }

  await client.end();

  console.log(`\nApplied: ${results.applied.length}`);
  console.log(`Failed: ${results.failed.length}`);
  if (results.failed.length) {
    console.log("\n--- FAILURES ---");
    for (const f of results.failed) {
      console.log(f.sql);
      console.log("  -> " + f.error);
    }
  }
  if (notes.length) {
    console.log("\n--- NOTES ---");
    notes.forEach((n) => console.log(n));
  }

  fs.writeFileSync(
    path.join(__dirname, "schema-sync-additive-result.json"),
    JSON.stringify(results, null, 2)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

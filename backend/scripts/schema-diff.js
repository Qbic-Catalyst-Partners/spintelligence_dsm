// Read-only schema comparison between Supabase (source of truth) and local
// Postgres. Does NOT touch data or run any DDL - report only.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const { Client } = require("pg");

const SCHEMAS = [
  "public", "autoconer", "blowroom", "carding", "comber", "drawframe",
  "mixing", "rbac", "reports", "simplex", "spinning", "ticketing_system",
  "trials", "users", "wrapping"
];

const SUPABASE_URL = process.env.DATABASE_URL_SUPABASE;
const LOCAL_URL = process.env.DATABASE_URL_LOCAL;

async function loadSchema(connectionStringRaw, label) {
  const isSupabase = connectionStringRaw.includes("supabase.co");
  const connectionString = isSupabase
    ? connectionStringRaw.replace(/[?&]sslmode=[^&]+/, "")
    : connectionStringRaw;
  const client = new Client({ connectionString, ssl: isSupabase ? { rejectUnauthorized: false } : undefined });
  await client.connect();

  const tablesRes = await client.query(
    `SELECT table_schema, table_name
     FROM information_schema.tables
     WHERE table_schema = ANY($1) AND table_type = 'BASE TABLE'
     ORDER BY table_schema, table_name`,
    [SCHEMAS]
  );

  const colsRes = await client.query(
    `SELECT table_schema, table_name, column_name, data_type, udt_name,
            is_nullable, column_default, character_maximum_length,
            numeric_precision, numeric_scale, ordinal_position
     FROM information_schema.columns
     WHERE table_schema = ANY($1)
     ORDER BY table_schema, table_name, ordinal_position`,
    [SCHEMAS]
  );

  const consRes = await client.query(
    `SELECT tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type,
            string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS columns
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = ANY($1) AND tc.constraint_type IN ('PRIMARY KEY','UNIQUE','FOREIGN KEY')
     GROUP BY tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type
     ORDER BY tc.table_schema, tc.table_name, tc.constraint_name`,
    [SCHEMAS]
  );

  const idxRes = await client.query(
    `SELECT schemaname AS table_schema, tablename AS table_name, indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = ANY($1)
     ORDER BY schemaname, tablename, indexname`,
    [SCHEMAS]
  );

  await client.end();

  const tables = new Set(tablesRes.rows.map(r => `${r.table_schema}.${r.table_name}`));
  const columns = new Map();
  for (const r of colsRes.rows) {
    columns.set(`${r.table_schema}.${r.table_name}.${r.column_name}`, r);
  }
  const constraints = new Map();
  for (const r of consRes.rows) {
    constraints.set(`${r.table_schema}.${r.table_name}.${r.constraint_name}`, r);
  }
  const indexes = new Map();
  for (const r of idxRes.rows) {
    indexes.set(`${r.table_schema}.${r.table_name}.${r.indexname}`, r);
  }

  console.error(`[${label}] tables=${tables.size} columns=${columns.size} constraints=${constraints.size} indexes=${indexes.size}`);

  return { tables, columns, constraints, indexes };
}

function colSignature(r) {
  return [
    r.data_type,
    r.udt_name,
    r.is_nullable,
    r.column_default,
    r.character_maximum_length,
    r.numeric_precision,
    r.numeric_scale
  ].join("|");
}

async function main() {
  const [supa, local] = await Promise.all([
    loadSchema(SUPABASE_URL, "supabase"),
    loadSchema(LOCAL_URL, "local")
  ]);

  const report = {
    tablesOnlyInSupabase: [],
    tablesOnlyInLocal: [],
    columnsMissingInLocal: [],
    columnsExtraInLocal: [],
    columnsDifferent: [],
    constraintsMissingInLocal: [],
    constraintsExtraInLocal: [],
    indexesMissingInLocal: [],
    indexesExtraInLocal: []
  };

  for (const t of supa.tables) {
    if (!local.tables.has(t)) report.tablesOnlyInSupabase.push(t);
  }
  for (const t of local.tables) {
    if (!supa.tables.has(t)) report.tablesOnlyInLocal.push(t);
  }

  for (const [key, r] of supa.columns) {
    if (!local.columns.has(key)) {
      report.columnsMissingInLocal.push({ key, def: r });
    } else {
      const lr = local.columns.get(key);
      if (colSignature(r) !== colSignature(lr)) {
        report.columnsDifferent.push({ key, supabase: r, local: lr });
      }
    }
  }
  for (const [key, r] of local.columns) {
    if (!supa.columns.has(key)) report.columnsExtraInLocal.push({ key, def: r });
  }

  for (const [key, r] of supa.constraints) {
    if (!local.constraints.has(key)) report.constraintsMissingInLocal.push({ key, def: r });
  }
  for (const [key, r] of local.constraints) {
    if (!supa.constraints.has(key)) report.constraintsExtraInLocal.push({ key, def: r });
  }

  for (const [key, r] of supa.indexes) {
    if (!local.indexes.has(key)) report.indexesMissingInLocal.push({ key, def: r.indexdef });
  }
  for (const [key, r] of local.indexes) {
    if (!supa.indexes.has(key)) report.indexesExtraInLocal.push({ key, def: r.indexdef });
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

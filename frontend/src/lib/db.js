import pg from "pg";

const { Pool } = pg;

const envVal = (a, b, fallback) => {
  const v = (typeof a !== "undefined" && a !== null) ? a : ((typeof b !== "undefined" && b !== null) ? b : fallback);
  return typeof v === "string" ? v : String(v === undefined || v === null ? "" : v);
};

const pool = new Pool({
  user: envVal(process.env.POSTGRES_USER, process.env.PGUSER, "postgres"),
  host: envVal(process.env.POSTGRES_HOST, process.env.PGHOST, "localhost"),
  database: envVal(process.env.POSTGRES_DATABASE, process.env.PGDATABASE, "postgres"),
  password: (() => {
    const raw = process.env.POSTGRES_PASSWORD ?? process.env.PGPASSWORD;
    if (raw === undefined || raw === null) return undefined;
    return String(raw);
  })(),
  port: Number(process.env.POSTGRES_PORT || process.env.PGPORT || 5432),
});

export default pool;

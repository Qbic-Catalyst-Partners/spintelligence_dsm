import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  user: process.env.POSTGRES_USER || process.env.PGUSER || "postgres",
  host: process.env.POSTGRES_HOST || process.env.PGHOST || "localhost",
  database: process.env.POSTGRES_DATABASE || process.env.PGDATABASE || "postgres",
  password: process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || "",
  port: Number(process.env.POSTGRES_PORT || process.env.PGPORT || 5432),
});

export default pool;

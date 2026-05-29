import pg from "pg";

const { Pool } = pg;

const getEnvString = (...values) => {
  const value = values.find((item) => item !== undefined && item !== null);
  return value === undefined ? "" : String(value);
};

const pool = new Pool({
  user: getEnvString(process.env.POSTGRES_USER, process.env.PGUSER, "postgres"),
  host: getEnvString(process.env.POSTGRES_HOST, process.env.PGHOST, "localhost"),
  database: getEnvString(process.env.POSTGRES_DATABASE, process.env.PGDATABASE, "postgres"),
  password: getEnvString(process.env.POSTGRES_PASSWORD, process.env.PGPASSWORD, ""),
  port: Number(process.env.POSTGRES_PORT || process.env.PGPORT || 5432),
});

export default pool;

const sql = require('mssql');

let poolPromise = null;

const buildConfig = () => ({
  server: process.env.MSSQL_PREP_HOST || process.env.MSSQL_HOST || '',
  port: Number(process.env.MSSQL_PREP_PORT || process.env.MSSQL_PORT || 1433),
  user: process.env.MSSQL_PREP_USER || process.env.MSSQL_USER || '',
  password: process.env.MSSQL_PREP_PASSWORD || process.env.MSSQL_PASSWORD || '',
  database: process.env.MSSQL_PREP_INITIAL_DATABASE || process.env.MSSQL_DATABASE || 'VAAHINI_DHARANIDARA_ERP',
  options: {
    encrypt: String(process.env.MSSQL_PREP_ENCRYPT || process.env.MSSQL_ENCRYPT || 'false').toLowerCase() === 'true',
    trustServerCertificate: String(process.env.MSSQL_PREP_TRUST_SERVER_CERT || process.env.MSSQL_TRUST_SERVER_CERT || 'true').toLowerCase() === 'true'
  },
  pool: {
    max: Number(process.env.MSSQL_PREP_POOL_MAX || process.env.MSSQL_POOL_MAX || 10),
    min: 0,
    idleTimeoutMillis: Number(process.env.MSSQL_PREP_POOL_IDLE_MS || process.env.MSSQL_POOL_IDLE_MS || 30000)
  },
  connectionTimeout: Number(process.env.MSSQL_PREP_CONNECT_TIMEOUT_MS || process.env.MSSQL_CONNECT_TIMEOUT_MS || 15000),
  requestTimeout: Number(process.env.MSSQL_PREP_REQUEST_TIMEOUT_MS || process.env.MSSQL_REQUEST_TIMEOUT_MS || 30000)
});

const hasSqlServerEnv = () =>
  Boolean(
    (process.env.MSSQL_PREP_HOST || process.env.MSSQL_HOST) &&
    (process.env.MSSQL_PREP_USER || process.env.MSSQL_USER) &&
    (process.env.MSSQL_PREP_PASSWORD || process.env.MSSQL_PASSWORD)
  );

const getPool = async () => {
  if (!hasSqlServerEnv()) {
    throw new Error('MSSQL prep env is not configured (MSSQL_HOST/MSSQL_USER/MSSQL_PASSWORD)');
  }

  if (!poolPromise) {
    const pool = new sql.ConnectionPool(buildConfig());
    poolPromise = pool.connect().catch((err) => {
      poolPromise = null;
      throw err;
    });
  }

  return poolPromise;
};

const query = async (queryText, params = {}) => {
  const pool = await getPool();
  const request = pool.request();

  Object.entries(params).forEach(([key, value]) => {
    request.input(key, value);
  });

  return request.query(queryText);
};

module.exports = {
  sql,
  hasSqlServerEnv,
  getPool,
  query
};

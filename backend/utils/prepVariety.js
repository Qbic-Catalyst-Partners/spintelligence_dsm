const { dedupeVarieties } = require('./variety');

const loggedAccessDeniedKeys = new Set();

const quoteSqlServerIdentifier = (value) => {
  const text = String(value || '').trim();
  if (!text || !/^[\w\s.-]+$/.test(text)) return null;
  return `[${text.replace(/]/g, ']]')}]`;
};

const isDatabaseAccessDenied = (error) => {
  const message = String(error?.message || error?.originalError?.message || '');
  return error?.number === 916
    || error?.originalError?.info?.number === 916
    || /not able to access the database/i.test(message);
};

const normalizeKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const pickField = (row, exactKeys, fallbackPredicate) => {
  const keys = Object.keys(row || {});
  const exact = keys.find((key) => exactKeys.includes(normalizeKey(key)));
  if (exact) return row[exact];

  const fallback = keys.find((key) => fallbackPredicate(normalizeKey(key)));
  return fallback ? row[fallback] : undefined;
};

const normalizePrepVarietyRow = (row = {}) => {
  const varietyName = pickField(
    row,
    ['varietyname', 'varname', 'variety', 'name', 'prepvariety', 'prepvarietyname'],
    (key) => key.includes('var') && key.includes('name')
  );
  const varietyCode = pickField(
    row,
    ['varcode', 'varietycode', 'code', 'prepvarietycode'],
    (key) => key.includes('var') && key.includes('code')
  );

  return {
    var_code: varietyCode === undefined || varietyCode === null ? '' : String(varietyCode).trim(),
    variety_name: varietyName === undefined || varietyName === null ? '' : String(varietyName).trim()
  };
};

const fetchPrepVarieties = async (prepSqlServer, prefix = '') => {
  const databaseName = 'dsmprojects';
  const quotedDatabase = quoteSqlServerIdentifier(databaseName);
  if (!quotedDatabase) {
    throw new Error('Invalid MSSQL_PREP_DATABASE value');
  }

  const result = await prepSqlServer.query(`SELECT * FROM ${quotedDatabase}.dbo.prepvariety`);
  const prefixText = String(prefix || '').trim().toLowerCase();
  const rows = (result.recordset || [])
    .map(normalizePrepVarietyRow)
    .filter((row) => row.variety_name)
    .filter((row) => !prefixText || row.variety_name.toLowerCase().includes(prefixText));

  return dedupeVarieties(rows);
};

const buildPrepVarietyOptions = (varieties) => [
  { text: '-- Select Variety --', label: '-- Select Variety --', value: '' },
  ...varieties.map((variety) => ({
    text: variety.variety_name,
    label: variety.variety_name,
    value: variety.variety_name,
    var_code: variety.var_code,
    variety_name: variety.variety_name
  }))
];

const sendPrepVarietyDropdown = (prepSqlServer, moduleName = 'preparation') => async (req, res, next) => {
  try {
    if (!prepSqlServer.hasSqlServerEnv()) {
      return res.status(503).json({ message: 'SQL Server is not configured on backend' });
    }

    const prefix = String(req.query.variety_prefix || req.query.prefix || '').trim();
    const data = await fetchPrepVarieties(prepSqlServer, prefix);
    const options = buildPrepVarietyOptions(data);
    const names = data.map((row) => row.variety_name);

    return res.status(200).json({
      source: 'sqlserver',
      database: 'dsmprojects',
      table: 'dbo.prepvariety',
      data,
      varieties: data,
      names,
      values: names,
      variety_names: names,
      options
    });
  } catch (error) {
    if (isDatabaseAccessDenied(error)) {
      const databaseName = 'dsmprojects';
      const userName = process.env.MSSQL_PREP_USER || process.env.MSSQL_USER || 'configured SQL user';
      const message = `SQL Server user "${userName}" does not have SELECT access to ${databaseName}.dbo.prepvariety`;
      const logKey = `${moduleName}:${userName}:${databaseName}:dbo.prepvariety`;
      if (!loggedAccessDeniedKeys.has(logKey)) {
        loggedAccessDeniedKeys.add(logKey);
        console.warn(`[${moduleName}] ${message}`);
      }
      return res.status(403).json({
        message,
        required_permission: `GRANT SELECT ON ${databaseName}.dbo.prepvariety`,
        database: databaseName,
        table: 'dbo.prepvariety'
      });
    }

    console.error(`Error fetching ${moduleName} prep varieties from SQL Server:`, error);
    next(error);
  }
};

module.exports = {
  fetchPrepVarieties,
  buildPrepVarietyOptions,
  sendPrepVarietyDropdown,
  isDatabaseAccessDenied
};

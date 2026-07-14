const express = require('express');
const router = express.Router();
const client = require('../connection');
const auth = require('../middleware/auth');

const MAX_LIMIT = 100;

const parsePositiveInt = (value, fallback = null) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const cleanText = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

const isAllFilter = (value) => {
  const text = String(value ?? '').trim().toLowerCase();
  return !text || text === 'all' || text.startsWith('all ');
};

const normalizeModuleFilter = (value) => {
  const text = cleanText(value);
  if (!text || isAllFilter(text)) return null;
  return text.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').toLowerCase();
};

const humanizeLabel = (value) => {
  const text = cleanText(value);
  if (!text) return null;
  return text
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const isNumericOnly = (value) => /^\d+$/.test(String(value ?? '').trim());

const firstReadableText = (...values) => {
  for (const value of values) {
    const text = cleanText(value);
    if (text && !isNumericOnly(text)) return text;
  }
  return null;
};

const formatActivity = (action, description) =>
  firstReadableText(description) || humanizeLabel(action) || 'Activity recorded';

const DEFAULT_MODULES = [
  'submitted notebooks',
  'operator tickets',
  'supervisor tickets',
  'users',
  'dashboard',
  'analysis',
  'help',
  'spinning',
  'mixing',
  'blowroom',
  'carding',
  'comber',
  'drawframe',
  'simplex',
  'autoconer'
];

const DEFAULT_ACTIONS = ['Created', 'Updated', 'Deleted'];

const normalizeDateBoundary = (value, boundary) => {
  const raw = String(value ?? '').trim();
  if (!raw || /^d{1,2}\s*-\s*m{1,2}\s*-\s*y{2,4}$/i.test(raw)) return null;

  const ddmmyyyy = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  const normalizedRaw = ddmmyyyy
    ? `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`
    : raw;

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(normalizedRaw);
  const candidate = dateOnly
    ? `${normalizedRaw}${boundary === 'end' ? 'T23:59:59.999Z' : 'T00:00:00.000Z'}`
    : normalizedRaw;

  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const getIpAddress = (req) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || null;
};

const getUserProfile = async (userId) => {
  if (!userId) return null;
  const result = await client.query(
    `SELECT full_name, employee_id FROM users.user_details WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
};

const getUserName = async (userId) => {
  const user = await getUserProfile(userId);
  return user?.full_name || null;
};

const createActivityLog = async ({
  userId = null,
  userName = null,
  employeeId = null,
  module,
  action,
  description = null,
  metadata = null,
  ipAddress = null,
  userAgent = null
}) => {
  const moduleName = cleanText(module);
  const actionName = cleanText(action);

  if (!moduleName) {
    const error = new Error('module is required');
    error.statusCode = 400;
    throw error;
  }
  if (!actionName) {
    const error = new Error('action is required');
    error.statusCode = 400;
    throw error;
  }

  const userProfile = userId && (!cleanText(userName) || !cleanText(employeeId))
    ? await getUserProfile(userId)
    : null;

  const result = await client.query(
    `
    INSERT INTO ticketing_system.activity_logs
      (user_id, user_name, employee_id, module, action, description, metadata, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
    RETURNING id, user_id, user_name, employee_id, module, action, description, metadata, ip_address, user_agent, created_at
    `,
    [
      userId,
      cleanText(userName) || cleanText(userProfile?.full_name),
      cleanText(employeeId) || cleanText(userProfile?.employee_id),
      moduleName,
      actionName,
      cleanText(description),
      metadata === undefined ? null : JSON.stringify(metadata),
      cleanText(ipAddress),
      cleanText(userAgent)
    ]
  );

  return result.rows[0];
};

const buildWhere = (query, values) => {
  const where = [];
  const userFilter = query.user_id || query.user;
  const userId = isAllFilter(userFilter) ? null : parsePositiveInt(userFilter);
  const userName = isAllFilter(query.user_name || (!userId ? query.user : null))
    ? null
    : cleanText(query.user_name || (!userId ? query.user : null));
  const moduleName = normalizeModuleFilter(query.module || query.notebook_type || query.notebook || query.screen);
  const action = isAllFilter(query.action || query.activity) ? null : cleanText(query.action || query.activity);
  const subDepartment = isAllFilter(query.sub_department || query.subDepartment) ? null : cleanText(query.sub_department || query.subDepartment);
  const search = cleanText(query.search || query.q);
  const startDate = normalizeDateBoundary(query.start_date || query.from_date, 'start');
  const endDate = normalizeDateBoundary(query.end_date || query.to_date, 'end');

  if (userId) {
    values.push(userId);
    where.push(`al.user_id = $${values.length}`);
  }
  if (moduleName) {
    values.push(`%${moduleName}%`);
    where.push(`(
      LOWER(REPLACE(REPLACE(al.module, '-', ' '), '_', ' ')) LIKE $${values.length}
      OR LOWER(REPLACE(REPLACE(COALESCE(al.metadata->>'notebook_type', al.metadata->>'notebookType', al.metadata->>'notebook', al.metadata->>'input_screen', al.metadata->>'screen_name', ''), '-', ' '), '_', ' ')) LIKE $${values.length}
    )`);
  }
  if (action) {
    values.push(`%${action}%`);
    where.push(`(al.action ILIKE $${values.length} OR al.description ILIKE $${values.length})`);
  }
  if (userName) {
    values.push(`%${userName}%`);
    where.push(`(
      COALESCE(al.user_name, u.full_name) ILIKE $${values.length}
      OR COALESCE(al.employee_id, u.employee_id) ILIKE $${values.length}
    )`);
  }
  if (subDepartment) {
    values.push(`%${subDepartment}%`);
    where.push(`COALESCE(
      al.metadata->>'sub_department',
      al.metadata->>'subDepartment',
      al.metadata->>'management_field',
      al.metadata->>'department',
      al.module
    ) ILIKE $${values.length}`);
  }
  if (startDate) {
    values.push(startDate);
    where.push(`al.created_at >= $${values.length}::timestamptz`);
  }
  if (endDate) {
    values.push(endDate);
    where.push(`al.created_at <= $${values.length}::timestamptz`);
  }
  if (search) {
    values.push(`%${search}%`);
    where.push(`(
      al.user_name ILIKE $${values.length}
      OR al.employee_id ILIKE $${values.length}
      OR u.full_name ILIKE $${values.length}
      OR u.employee_id ILIKE $${values.length}
      OR al.module ILIKE $${values.length}
      OR al.action ILIKE $${values.length}
      OR al.description ILIKE $${values.length}
      OR COALESCE(al.metadata->>'notebook_type', al.metadata->>'notebook', al.metadata->>'input_screen', al.metadata->>'screen_name') ILIKE $${values.length}
      OR COALESCE(al.metadata->>'sub_department', al.metadata->>'subDepartment', al.metadata->>'management_field') ILIKE $${values.length}
    )`);
  }

  return where.length ? `WHERE ${where.join(' AND ')}` : '';
};

const mapActivityLogRow = (row) => {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const subDepartment =
    firstReadableText(
      metadata.sub_department,
      metadata.subDepartment,
      metadata.management_field,
      metadata.department
    ) ||
    humanizeLabel(row.module);
  const notebookType =
    firstReadableText(
      metadata.notebook_type,
      metadata.notebookType,
      metadata.notebook,
      metadata.input_screen,
      metadata.screen_name
    ) ||
    humanizeLabel(row.module);

  return {
    ...row,
    user: cleanText(row.user_name) || cleanText(row.employee_id) || 'System',
    sub_department: subDepartment,
    notebook_type: notebookType,
    activity: formatActivity(row.action, row.description),
    date_time: row.created_at,
    action_menu: true
  };
};

router.use(auth);

router.get('/filters', async (req, res, next) => {
  try {
    const [modules, notebookTypes, subDepartments, actions, users] = await Promise.all([
      client.query(`
        SELECT DISTINCT value
        FROM (
          SELECT module AS value FROM ticketing_system.activity_logs
          UNION ALL
          SELECT unnest($1::text[]) AS value
        ) options
        WHERE value IS NOT NULL AND TRIM(value) <> ''
        ORDER BY value
      `, [DEFAULT_MODULES]),
      client.query(`
        SELECT DISTINCT value
        FROM (
          SELECT module AS value FROM ticketing_system.activity_logs
          UNION ALL
          SELECT metadata->>'notebook_type' AS value FROM ticketing_system.activity_logs
          UNION ALL
          SELECT metadata->>'notebookType' AS value FROM ticketing_system.activity_logs
          UNION ALL
          SELECT metadata->>'notebook' AS value FROM ticketing_system.activity_logs
          UNION ALL
          SELECT metadata->>'input_screen' AS value FROM ticketing_system.activity_logs
          UNION ALL
          SELECT metadata->>'screen_name' AS value FROM ticketing_system.activity_logs
          UNION ALL
          SELECT unnest($1::text[]) AS value
        ) options
        WHERE value IS NOT NULL AND TRIM(value) <> ''
        ORDER BY value
      `, [DEFAULT_MODULES]),
      client.query(`
        SELECT DISTINCT value
        FROM (
          SELECT metadata->>'sub_department' AS value FROM ticketing_system.activity_logs
          UNION ALL
          SELECT metadata->>'subDepartment' AS value FROM ticketing_system.activity_logs
          UNION ALL
          SELECT metadata->>'management_field' AS value FROM ticketing_system.activity_logs
          UNION ALL
          SELECT metadata->>'department' AS value FROM ticketing_system.activity_logs
        ) options
        WHERE value IS NOT NULL AND TRIM(value) <> ''
        ORDER BY value
      `),
      client.query(`
        SELECT DISTINCT value
        FROM (
          SELECT action AS value FROM ticketing_system.activity_logs
          UNION ALL
          SELECT unnest($1::text[]) AS value
        ) options
        WHERE value IS NOT NULL AND TRIM(value) <> ''
        ORDER BY value
      `, [DEFAULT_ACTIONS]),
      client.query(`
        SELECT DISTINCT ON (employee_id, user_name)
          user_id,
          user_name,
          employee_id
        FROM (
          SELECT
            id AS user_id,
            full_name AS user_name,
            employee_id
          FROM users.user_details
          WHERE COALESCE(TRIM(full_name), '') <> ''
             OR COALESCE(TRIM(employee_id), '') <> ''
          UNION ALL
          SELECT
            al.user_id,
            COALESCE(al.user_name, u.full_name) AS user_name,
            COALESCE(al.employee_id, u.employee_id) AS employee_id
          FROM ticketing_system.activity_logs al
        LEFT JOIN users.user_details u
          ON u.id = al.user_id
          OR (
            al.user_id IS NULL
            AND al.employee_id IS NOT NULL
            AND UPPER(TRIM(u.employee_id)) = UPPER(TRIM(al.employee_id))
          )
          WHERE COALESCE(al.user_name, u.full_name, al.employee_id, u.employee_id) IS NOT NULL
        ) users
        WHERE COALESCE(NULLIF(TRIM(user_name), ''), NULLIF(TRIM(employee_id), '')) IS NOT NULL
        ORDER BY employee_id, user_name, user_id NULLS LAST
      `)
    ]);

    const moduleOptions = modules.rows.map((row) => ({
      value: row.value,
      label: humanizeLabel(row.value)
    }));
    const notebookOptions = notebookTypes.rows.map((row) => ({
      value: row.value,
      label: humanizeLabel(row.value)
    }));

    return res.status(200).json({
      modules: moduleOptions,
      notebook_types: notebookOptions,
      notebooks: notebookOptions,
      sub_departments: subDepartments.rows.map((row) => ({
        value: row.value,
        label: humanizeLabel(row.value)
      })),
      actions: actions.rows.map((row) => ({
        value: row.value,
        label: humanizeLabel(row.value)
      })),
      users: users.rows.map((row) => ({
        user_id: row.user_id,
        value: row.user_id || row.employee_id || row.user_name,
        name_value: row.user_name || row.employee_id,
        label: row.user_name && row.employee_id
          ? `${row.user_name} (${row.employee_id})`
          : (row.user_name || row.employee_id),
        user_name: row.user_name || row.employee_id,
        employee_id: row.employee_id
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const requestedLimit = parsePositiveInt(req.query.limit, 20);
    const limit = Math.min(requestedLimit, MAX_LIMIT);
    const offset = (page - 1) * limit;

    const values = [];
    const whereSql = buildWhere(req.query, values);

    const countResult = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM ticketing_system.activity_logs al
       LEFT JOIN users.user_details u
         ON u.id = al.user_id
         OR (
           al.user_id IS NULL
           AND al.employee_id IS NOT NULL
           AND UPPER(TRIM(u.employee_id)) = UPPER(TRIM(al.employee_id))
         )
       ${whereSql}`,
      values
    );

    values.push(limit, offset);
    const rows = await client.query(
      `
      SELECT
        al.id,
        al.user_id,
        COALESCE(al.user_name, u.full_name) AS user_name,
        COALESCE(al.employee_id, u.employee_id) AS employee_id,
        al.module,
        al.action,
        al.description,
        al.metadata,
        al.ip_address,
        al.created_at
      FROM ticketing_system.activity_logs al
      LEFT JOIN users.user_details u
        ON u.id = al.user_id
        OR (
          al.user_id IS NULL
          AND al.employee_id IS NOT NULL
          AND UPPER(TRIM(u.employee_id)) = UPPER(TRIM(al.employee_id))
        )
      ${whereSql}
      ORDER BY al.created_at DESC, al.id DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
      `,
      values
    );
    const logs = rows.rows.map(mapActivityLogRow);

    return res.status(200).json({
      logs,
      activity_timeline: logs,
      data: logs,
      pagination: {
        page,
        limit,
        total: countResult.rows[0]?.total || 0
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ message: 'Valid log id is required' });

    const result = await client.query(
      `
      SELECT
        al.id,
        al.user_id,
        COALESCE(al.user_name, u.full_name) AS user_name,
        COALESCE(al.employee_id, u.employee_id) AS employee_id,
        al.module,
        al.action,
        al.description,
        al.metadata,
        al.ip_address,
        al.user_agent,
        al.created_at
      FROM ticketing_system.activity_logs al
      LEFT JOIN users.user_details u
        ON u.id = al.user_id
        OR (
          al.user_id IS NULL
          AND al.employee_id IS NOT NULL
          AND UPPER(TRIM(u.employee_id)) = UPPER(TRIM(al.employee_id))
        )
      WHERE al.id = $1
      `,
      [id]
    );

    if (!result.rows.length) return res.status(404).json({ message: 'Activity log not found' });
    return res.status(200).json({ log: mapActivityLogRow(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const userId = parsePositiveInt(req.body?.user_id) || parsePositiveInt(req.user?.id);
    const metadata = {
      ...(req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {}),
      ...(cleanText(req.body?.sub_department || req.body?.subDepartment)
        ? { sub_department: cleanText(req.body?.sub_department || req.body?.subDepartment) }
        : {}),
      ...(cleanText(req.body?.notebook_type || req.body?.notebookType || req.body?.notebook)
        ? { notebook_type: cleanText(req.body?.notebook_type || req.body?.notebookType || req.body?.notebook) }
        : {})
    };
    const log = await createActivityLog({
      userId,
      userName: req.body?.user_name || await getUserName(userId),
      employeeId: req.body?.employee_id || req.user?.employee_id,
      module: req.body?.module || req.body?.notebook_type || req.body?.notebook,
      action: req.body?.action || req.body?.activity,
      description: req.body?.description || req.body?.activity,
      metadata: Object.keys(metadata).length ? metadata : null,
      ipAddress: getIpAddress(req),
      userAgent: req.headers['user-agent'] || null
    });

    return res.status(201).json({ success: true, log });
  } catch (error) {
    next(error);
  }
});

module.exports = {
  router,
  createActivityLog
};

const express = require('express');
const router = express.Router();
const client = require('../connection');
const auth = require('../middleware/auth');

const PERIODS = new Set(['1D', '1W', '1M', '1Y']);
const VISUAL_TYPES = new Set(['average_value_card', 'bar_chart', 'area_chart', 'line_chart', 'individual_ticket_count', 'add_ticket_count', 'ticket_status_card']);
const TICKET_CARD_METRICS = new Set(['total', 'open', 'closed', 'reopened', 'pending', 'overdue']);
const ALL_SUB_DEPARTMENTS = ['Mixing', 'Spinning', 'Carding', 'Comber', 'Blowroom', 'Autoconer', 'Drawframe', 'Simplex'];
const SUB_DEPARTMENT_SCREEN_KEYS = {
  mixing: ['cottonhvidataentry', 'fibredataentry', 'afisdataentry', 'moisturedataentry', 'opennessdataentry', 'mixingqcdataentry'],
  blowroom: ['blowroomsyncdataentry', 'droptestdataentry', 'brwastestudydataentry', 'blowroomheaderdataentry'],
  carding: ['cardthickplacedataentry', 'betweenwithincarddataentry', 'cardingnatidataentry', 'cardinguqcdataentry', 'carddfkpressurechecking', 'cardingqcdataentry'],
  comber: ['ribbonlapcvdataentry', 'combernatidataentry', 'comberuqcdataentry'],
  drawframe: ['yarncvcalculation', 'cotsdataentry', 'drawframeuqcdataentry', 'drawframeqcdataentry', 'finisherdrawinginspection'],
  simplex: ['smxcotschangedataentry', 'smxbreaksstudyreport', 'simplexuqcdataentry', 'simplexprocessparameter'],
  spinning: ['speedcheckingdataentry', 'cotscheckingdataentry', 'lycramissingdataentry', 'bottomaproncheckingdataentry', 'lycracenteringdataentry', 'rsmlycraonlinedataentry', 'rsmlycraofflinedataentry', 'ringframedataentry', 'countchangedataentry', 'spinningqcdataentry', 'wheelchangetype1', 'wheelchangetype2', 'wheelchangetype3'],
  autoconer: ['lycracheckingdataentry', 'countwisecutsdataentry', 'drumwisedataentry', 'splicestrengthdataentry', 'inspectiondataentry', 'conedensitydataentry', 'conepackingauditdataentry', 'autoconerparameterentries', 'autoconerprocessparameter', 'autoconerq2inspection', 'autoconerq3inspection']
};

const SCREEN_SOURCE_MAP = {
  cottonhvidataentry: {
    table: 'mixing.cotton_hvi_data_entry',
    dateColumn: 'inspection_date'
  },
  fibredataentry: {
    table: 'mixing.fibre_data_entry',
    dateColumn: 'inspection_date'
  },
  afisdataentry: {
    table: 'mixing.afis_data_entry',
    dateColumn: 'inspection_date'
  },
  moisturedataentry: {
    table: 'mixing.moisture_data_entry',
    dateColumn: 'inspection_date'
  }
};

const normalizeKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const quoteIdent = (value) => `"${String(value).replace(/"/g, '""')}"`;
const parseUserId = (value) => {
  const userId = Number(value);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
};
const isoOrNull = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const normalizeBoundaryDate = (value, boundary) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (DATE_ONLY_RE.test(raw)) {
    const suffix = boundary === 'end' ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
    return isoOrNull(`${raw}${suffix}`);
  }
  return isoOrNull(raw);
};
const normalizeWidgetId = (value) => String(value ?? '').trim();
const isDashboardDebugEnabled = String(process.env.DASHBOARD_DEBUG || '').trim().toLowerCase() === 'true';

const isAdminUser = (req) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  return role === 'admin' || role === 'super admin' || role === 'superadmin';
};
const isAdmin001DashboardManager = (req) => {
  const employeeId = String(req.user?.employee_id || '').trim().toUpperCase();
  return employeeId === 'ADMIN001';
};
const canManageDashboards = (req) => isAdminUser(req) || isAdmin001DashboardManager(req);

const summarizeWidgetForLog = (widget = {}) => ({
  id: widget.id || null,
  visualization_type: widget.visualization_type || null,
  widget_name: widget.widget_name || null,
  input_screen: widget.input_screen || null,
  input_field: widget.input_field || null,
  metric_key: widget.metric_key || widget.ticket_metric || null,
  enabled: widget.enabled !== false,
  order: widget.order ?? null
});

const summarizeWidgetDataForLog = (item = {}) => ({
  widget_id: item.widget_id || null,
  widget_name: item.widget_name || null,
  metric_key: item.metric_key || null,
  ticket_count: item.ticket_count ?? null,
  average_value: item.average_value ?? null,
  latest_value: item.latest_value ?? null,
  trend_points: Array.isArray(item.trend) ? item.trend.length : 0,
  statuses: item.status_breakdown ? Object.keys(item.status_breakdown) : []
});

const logDashboardDebug = (label, payload) => {
  if (!isDashboardDebugEnabled) return;
  try {
    console.log(`[dashboard-debug] ${label} ${JSON.stringify(payload)}`);
  } catch (error) {
    console.log(`[dashboard-debug] ${label} {"log_error":"${String(error.message || error)}"}`);
  }
};

const ensureDashboardAccess = (req, res, userId) => {
  const requesterId = parseUserId(req.user?.id);
  if (!requesterId) {
    res.status(401).json({ message: 'Authentication required' });
    return false;
  }
  if (canManageDashboards(req)) {
    return true;
  }
  if (!isAdminUser(req) && requesterId !== userId) {
    res.status(403).json({ message: 'You can only access your own dashboard configuration' });
    return false;
  }
  return true;
};

const ensureDashboardBuilderTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users.dashboard_builder_configs (
      user_id integer PRIMARY KEY REFERENCES users.user_details(id) ON DELETE CASCADE,
      widgets jsonb NOT NULL DEFAULT '[]'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
};

const ensureUserDashboardPagesTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users.user_dashboard_pages (
      id bigserial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users.user_details(id) ON DELETE CASCADE,
      page_key text NOT NULL,
      page_title text NULL,
      widgets jsonb NOT NULL DEFAULT '[]'::jsonb,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, page_key)
    )
  `);
};

router.use(auth);

const resolveSource = (inputScreen, context = {}) => {
  const key = normalizeKey(inputScreen);
  if (SCREEN_SOURCE_MAP[key]) return SCREEN_SOURCE_MAP[key];

  // Common aliases coming from threshold/input master values.
  const aliasMap = {
    processparameter: 'autoconerprocessparameter',
    q2inspection: 'autoconerq2inspection',
    q3inspection: 'autoconerq3inspection'
  };
  const aliasKey = aliasMap[key];
  if (aliasKey && SCREEN_SOURCE_MAP[aliasKey]) {
    // If generic/ambiguous labels are used, prefer department-driven mapping.
    if (key === 'processparameter') {
      const deptHint = normalizeKey(context.department || context.sub_department || '');
      if (deptHint.includes('simplex')) return SCREEN_SOURCE_MAP.simplexprocessparameter;
      if (deptHint.includes('spinning')) return SCREEN_SOURCE_MAP.spinningqcdataentry;
      if (deptHint.includes('autoconer') || deptHint.includes('autocone')) return SCREEN_SOURCE_MAP.autoconerprocessparameter;
    }
    return SCREEN_SOURCE_MAP[aliasKey];
  }

  return null;
};

const getNumericColumns = async (tableName) => {
  const [schemaName, tableOnly] = tableName.split('.');
  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1
       AND table_name = $2
       AND data_type IN ('smallint','integer','bigint','numeric','real','double precision')
     ORDER BY ordinal_position`,
    [schemaName, tableOnly]
  );
  return result.rows.map((r) => r.column_name);
};

const getAllColumns = async (tableName) => {
  const [schemaName, tableOnly] = tableName.split('.');
  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1
       AND table_name = $2
     ORDER BY ordinal_position`,
    [schemaName, tableOnly]
  );
  return result.rows.map((r) => r.column_name);
};

const getAverageValuesForFields = async (tableName, fields) => {
  if (!Array.isArray(fields) || !fields.length) return {};
  const selectParts = fields.map((f) => `ROUND(AVG(${quoteIdent(f)})::numeric, 4) AS ${quoteIdent(f)}`);
  const result = await client.query(`SELECT ${selectParts.join(', ')} FROM ${tableName}`);
  return result.rows[0] || {};
};

const getMappedScreenCatalog = () => Object.entries(SCREEN_SOURCE_MAP).map(([key, src]) => ({
  input_screen: key,
  table: src.table,
  date_column: src.dateColumn
}));

const getAllMappedNumericFields = async () => {
  const catalog = getMappedScreenCatalog();
  const byTable = new Map();

  await Promise.all(
    catalog.map(async (item) => {
      const cols = await getNumericColumns(item.table);
      byTable.set(item.table, cols);
    })
  );

  const all = new Set();
  for (const cols of byTable.values()) {
    for (const col of cols) all.add(col);
  }
  return Array.from(all).sort((a, b) => a.localeCompare(b));
};

const getSchemaFieldCatalog = async () => {
  const catalog = getMappedScreenCatalog();
  const rows = await Promise.all(catalog.map(async (item) => {
    const fields = await getAllColumns(item.table);
    const [schema] = item.table.split('.');
    return {
      schema,
      table: item.table,
      input_screen: item.input_screen,
      date_column: item.date_column,
      fields
    };
  }));
  return rows;
};

const findCatalogForInputScreen = (inputScreen) => {
  const key = normalizeKey(inputScreen);
  const direct = SCREEN_SOURCE_MAP[key];
  if (direct) {
    return { input_screen: key, table: direct.table, date_column: direct.dateColumn };
  }
  if (key === 'processparameter') {
    const src = SCREEN_SOURCE_MAP.autoconerprocessparameter;
    return { input_screen: 'autoconerprocessparameter', table: src.table, date_column: src.dateColumn };
  }
  if (key === 'q2inspection') {
    const src = SCREEN_SOURCE_MAP.autoconerq2inspection;
    return { input_screen: 'autoconerq2inspection', table: src.table, date_column: src.dateColumn };
  }
  if (key === 'q3inspection') {
    const src = SCREEN_SOURCE_MAP.autoconerq3inspection;
    return { input_screen: 'autoconerq3inspection', table: src.table, date_column: src.dateColumn };
  }
  return null;
};

const resolveNumericColumn = async (tableName, requestedField) => {
  const [schemaName, tableOnly] = tableName.split('.');
  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1
       AND table_name = $2
       AND data_type IN ('smallint','integer','bigint','numeric','real','double precision')`,
    [schemaName, tableOnly]
  );

  const wanted = String(requestedField || '').trim();
  const wantedKey = normalizeKey(wanted);
  if (!wantedKey) return null;

  const exact = result.rows.find((r) => String(r.column_name).toLowerCase() === wanted.toLowerCase());
  if (exact) return exact.column_name;

  return result.rows.find((r) => normalizeKey(r.column_name) === wantedKey)?.column_name || null;
};

const validateWidget = async (widget) => {
  const department = String(widget?.department || '').trim();
  const sub_department = String(widget?.sub_department || '').trim();
  const input_screen = String(widget?.input_screen || '').trim();
  const rawInputField = String(widget?.input_field || '').trim();
  const visualization_type = String(widget?.visualization_type || 'average_value_card').trim().toLowerCase();
  const enabled = widget?.enabled !== false;
  const order = Number.isInteger(widget?.order) ? widget.order : 0;

  const isTicketCountWidget =
    visualization_type === 'individual_ticket_count' ||
    visualization_type === 'add_ticket_count' ||
    visualization_type === 'ticket_status_card';
  const metricKey = String(
    widget?.metric_key || widget?.ticket_metric || widget?.input_field || ''
  ).trim().toLowerCase();

  if (!isTicketCountWidget && (!department || !sub_department || !input_screen || !rawInputField)) {
    return { error: 'department, sub_department, input_screen and input_field are required' };
  }
  if (!VISUAL_TYPES.has(visualization_type)) {
    return { error: 'Invalid visualization_type' };
  }
  if (visualization_type === 'ticket_status_card' && !TICKET_CARD_METRICS.has(metricKey)) {
    return { error: 'ticket_status_card requires metric_key: total/open/closed/reopened/pending/overdue' };
  }

  return {
    data: {
      id: typeof widget?.id === 'string' && widget.id.trim() ? widget.id.trim() : `widget-${Date.now()}`,
      department,
      sub_department,
      input_screen,
      input_field: rawInputField,
      visualization_type,
      metric_key: visualization_type === 'ticket_status_card' ? metricKey : undefined,
      widget_name: String(widget?.widget_name || '').trim() || (visualization_type === 'add_ticket_count' ? 'Add Ticket' : undefined),
      enabled,
      order
    }
  };
};

const getConfig = async (userId) => {
  await ensureDashboardBuilderTable();
  const result = await client.query(
    `SELECT widgets, updated_at
     FROM users.dashboard_builder_configs
     WHERE user_id = $1`,
    [userId]
  );
  if (!result.rows.length) return { widgets: [], updated_at: null };
  return {
    widgets: Array.isArray(result.rows[0].widgets) ? result.rows[0].widgets : [],
    updated_at: result.rows[0].updated_at
  };
};

const saveConfig = async (userId, widgets) => {
  await ensureDashboardBuilderTable();
  const result = await client.query(
    `INSERT INTO users.dashboard_builder_configs (user_id, widgets, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id)
     DO UPDATE SET widgets = EXCLUDED.widgets, updated_at = now()
     RETURNING user_id, widgets, updated_at`,
    [userId, JSON.stringify(widgets)]
  );
  return result.rows[0];
};

const normalizePageKey = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');

const getUserPage = async (userId, pageKey = 'default') => {
  await ensureUserDashboardPagesTable();
  const key = normalizePageKey(pageKey) || 'default';
  const result = await client.query(
    `SELECT user_id, page_key, page_title, widgets, is_active, created_at, updated_at
     FROM users.user_dashboard_pages
     WHERE user_id = $1 AND page_key = $2`,
    [userId, key]
  );
  if (!result.rows.length) {
    return {
      user_id: userId,
      page_key: key,
      page_title: key === 'default' ? 'Default Dashboard' : key,
      widgets: [],
      is_active: true,
      created_at: null,
      updated_at: null
    };
  }
  return result.rows[0];
};

const listUserPages = async (userId) => {
  await ensureUserDashboardPagesTable();
  const result = await client.query(
    `SELECT user_id, page_key, page_title, widgets, is_active, created_at, updated_at
     FROM users.user_dashboard_pages
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId]
  );
  return result.rows;
};

const saveUserPage = async (userId, pageKey, pageTitle, widgets, isActive = true) => {
  await ensureUserDashboardPagesTable();
  const key = normalizePageKey(pageKey) || 'default';
  const title = String(pageTitle || '').trim() || (key === 'default' ? 'Default Dashboard' : key);
  const result = await client.query(
    `INSERT INTO users.user_dashboard_pages (user_id, page_key, page_title, widgets, is_active, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, now())
     ON CONFLICT (user_id, page_key)
     DO UPDATE SET page_title = EXCLUDED.page_title,
                   widgets = EXCLUDED.widgets,
                   is_active = EXCLUDED.is_active,
                   updated_at = now()
     RETURNING user_id, page_key, page_title, widgets, is_active, created_at, updated_at`,
    [userId, key, title, JSON.stringify(widgets || []), isActive !== false]
  );
  return result.rows[0];
};

const getEffectiveDashboardConfig = async (userId) => {
  const config = await getConfig(userId);
  const defaultPage = await getUserPage(userId, 'default');
  const configUpdatedAt = config.updated_at ? new Date(config.updated_at).getTime() : 0;
  const defaultPageUpdatedAt = defaultPage.updated_at ? new Date(defaultPage.updated_at).getTime() : 0;
  const hasDefaultPageWidgets = Array.isArray(defaultPage.widgets) && defaultPage.widgets.length > 0;
  const hasConfigWidgets = Array.isArray(config.widgets) && config.widgets.length > 0;

  if (hasDefaultPageWidgets && (!hasConfigWidgets || defaultPageUpdatedAt >= configUpdatedAt)) {
    return {
      widgets: defaultPage.widgets,
      updated_at: defaultPage.updated_at || config.updated_at,
      page_key: defaultPage.page_key,
      page_title: defaultPage.page_title
    };
  }

  return {
    widgets: config.widgets || [],
    updated_at: config.updated_at || defaultPage.updated_at,
    page_key: 'default',
    page_title: 'Default Dashboard'
  };
};

const getDashboardUserContext = async (userId) => {
  const result = await client.query(
    `SELECT
       u.id,
       u.employee_id,
       u.level,
       COALESCE(r.name, '') AS role
     FROM users.user_details u
     LEFT JOIN rbac.role_details r
       ON r.id = u.role_id
     WHERE u.id = $1`,
    [userId]
  );

  return result.rows[0] || null;
};

const deleteUserPage = async (userId, pageKey) => {
  await ensureUserDashboardPagesTable();
  const key = normalizePageKey(pageKey) || 'default';
  const result = await client.query(
    `DELETE FROM users.user_dashboard_pages
     WHERE user_id = $1 AND page_key = $2
     RETURNING user_id, page_key`,
    [userId, key]
  );
  return result.rows[0] || null;
};

const getTrendQuery = ({ table, dateColumn, valueColumn, period }) => {
  if (period === '1D') {
    return {
      query: `
        SELECT to_char(date_trunc('hour', ${dateColumn}), 'HH24:00') AS label,
               ROUND(AVG(${valueColumn})::numeric, 4) AS value
        FROM ${table}
        WHERE ${dateColumn} >= NOW() - INTERVAL '1 day'
        GROUP BY 1, date_trunc('hour', ${dateColumn})
        ORDER BY date_trunc('hour', ${dateColumn})
      `
    };
  }
  if (period === '1W') {
    return {
      query: `
        SELECT to_char(date_trunc('day', ${dateColumn}), 'Dy DD Mon') AS label,
               ROUND(AVG(${valueColumn})::numeric, 4) AS value
        FROM ${table}
        WHERE ${dateColumn} >= NOW() - INTERVAL '7 days'
        GROUP BY 1, date_trunc('day', ${dateColumn})
        ORDER BY date_trunc('day', ${dateColumn})
      `
    };
  }
  if (period === '1M') {
    return {
      query: `
        SELECT to_char(date_trunc('week', ${dateColumn}), '"WK" WW') AS label,
               ROUND(AVG(${valueColumn})::numeric, 4) AS value
        FROM ${table}
        WHERE ${dateColumn} >= NOW() - INTERVAL '1 month'
        GROUP BY 1, date_trunc('week', ${dateColumn})
        ORDER BY date_trunc('week', ${dateColumn})
      `
    };
  }
  return {
    query: `
      SELECT to_char(date_trunc('month', ${dateColumn}), 'Mon YYYY') AS label,
             ROUND(AVG(${valueColumn})::numeric, 4) AS value
      FROM ${table}
      WHERE ${dateColumn} >= NOW() - INTERVAL '1 year'
      GROUP BY 1, date_trunc('month', ${dateColumn})
      ORDER BY date_trunc('month', ${dateColumn})
    `
  };
};

const getCurrentPeriodBounds = (period) => {
  const now = new Date();
  const end = now.toISOString();
  if (period === '1D') return { start: new Date(now.getTime() - (24 * 60 * 60 * 1000)).toISOString(), end };
  if (period === '1W') return { start: new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)).toISOString(), end };
  if (period === '1M') return { start: new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString(), end };
  if (period === '3M') return { start: new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000)).toISOString(), end };
  if (period === '6M') return { start: new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000)).toISOString(), end };
  if (period === '1Q') return { start: new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000)).toISOString(), end };
  return { start: new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000)).toISOString(), end };
};

const getStatisticsTrendQuery = ({ table, dateColumn, valueColumn, period }) => {
  let bucketExpr = `date_trunc('month', f.ts)`;
  let labelExpr = `to_char(date_trunc('month', f.ts), 'Mon YYYY')`;

  if (period === '1D') {
    bucketExpr = `date_trunc('hour', f.ts)`;
    labelExpr = `to_char(date_trunc('hour', f.ts), 'HH24:00')`;
  } else if (period === '1W' || period === 'CUSTOM') {
    bucketExpr = `date_trunc('day', f.ts)`;
    labelExpr = `to_char(date_trunc('day', f.ts), 'Dy DD Mon')`;
  } else if (period === '1M' || period === '1Q' || period === '3M') {
    bucketExpr = `date_trunc('week', f.ts)`;
    labelExpr = `to_char(date_trunc('week', f.ts), '"Wk" IW')`;
  }

  return `
    WITH filtered AS (
      SELECT ${dateColumn} AS ts, ${valueColumn}::numeric AS val
      FROM ${table}
      WHERE ${dateColumn} >= $1::timestamptz
        AND ${dateColumn} <= $2::timestamptz
        AND ${valueColumn} IS NOT NULL
    ),
    global_stats AS (
      SELECT
        AVG(val)::numeric AS global_mean,
        COALESCE(stddev_samp(val), 0)::numeric AS global_stddev
      FROM filtered
    )
    SELECT
      ${bucketExpr} AS bucket_start,
      ${labelExpr} AS label,
      AVG(f.val)::numeric AS mean_value,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY f.val)::numeric AS median_value,
      COALESCE(stddev_samp(f.val), 0)::numeric AS stddev_value,
      COUNT(*) FILTER (
        WHERE gs.global_stddev > 0
          AND ABS((f.val - gs.global_mean) / gs.global_stddev) > 2
      )::int AS outliers_value,
      CASE
        WHEN gs.global_stddev > 0 THEN ((AVG(f.val) - gs.global_mean) / gs.global_stddev)::numeric
        ELSE 0::numeric
      END AS z_score_value
    FROM filtered f
    CROSS JOIN global_stats gs
    GROUP BY ${bucketExpr}, ${labelExpr}, gs.global_mean, gs.global_stddev
    ORDER BY bucket_start
  `;
};

const handleStatisticsAnalytics = async (req, res, next) => {
  try {
    const department = String(req.query.department || '').trim();
    const sub_department = String(req.query.sub_department || '').trim();
    const input_screen = String(req.query.input_screen || '').trim();
    const rawInputField = String(req.query.input_field || '').trim();
    const allowedPeriods = new Set(['1D', '1W', '1M', '3M', '6M', '1Q', '1Y', 'CUSTOM']);
    const filterMode = String(req.query.filter_mode || req.query.filter || '').trim().toUpperCase();
    const rawPeriod = String(req.query.period || '1M').toUpperCase();
    const period = filterMode === 'CUSTOM' ? 'CUSTOM' : rawPeriod;

    if (!department || !sub_department || !input_screen || !rawInputField) {
      return res.status(400).json({ message: 'department, sub_department, input_screen and input_field are required' });
    }
    if (!allowedPeriods.has(period)) return res.status(400).json({ message: 'period must be one of 1D, 1W, 1M, 3M, 6M, 1Q, 1Y, CUSTOM' });

    const customFromRaw = req.query.fromDate || req.query.from_date || req.query.start_date;
    const customToRaw = req.query.toDate || req.query.to_date || req.query.end_date;
    let bounds;
    if (period === 'CUSTOM') {
      const start = normalizeBoundaryDate(customFromRaw, 'start');
      const end = normalizeBoundaryDate(customToRaw, 'end');
      if (!start || !end) {
        return res.status(400).json({ message: 'Valid custom fromDate/start_date and toDate/end_date are required' });
      }
      bounds = { start, end };
    } else {
      bounds = getCurrentPeriodBounds(period);
    }

    const source = resolveSource(input_screen, { department, sub_department });
    if (!source) {
      return res.status(200).json({
        filter: { department, sub_department, input_screen, input_field: rawInputField, period, range: bounds },
        cards: { mean: [], median: [], standard_deviation: [], average: [], outliers: [], z_score: [] }
      });
    }

    const matchedColumn = await resolveNumericColumn(source.table, rawInputField);
    if (!matchedColumn) {
      return res.status(200).json({
        filter: { department, sub_department, input_screen, input_field: rawInputField, period, range: bounds },
        cards: { mean: [], median: [], standard_deviation: [], average: [], outliers: [], z_score: [] }
      });
    }

    const col = quoteIdent(matchedColumn);
    const query = getStatisticsTrendQuery({
      table: source.table,
      dateColumn: source.dateColumn,
      valueColumn: col,
      period
    });
    const result = await client.query(query, [bounds.start, bounds.end]);

    const rows = result.rows.map((row) => ({
      label: row.label,
      bucket_start: row.bucket_start,
      mean: row.mean_value === null ? null : Number(Number(row.mean_value).toFixed(4)),
      median: row.median_value === null ? null : Number(Number(row.median_value).toFixed(4)),
      standard_deviation: row.stddev_value === null ? null : Number(Number(row.stddev_value).toFixed(4)),
      outliers: row.outliers_value === null ? 0 : Number(row.outliers_value),
      z_score: row.z_score_value === null ? null : Number(Number(row.z_score_value).toFixed(4))
    }));

    let cumulativeSum = 0;
    let cumulativeCount = 0;
    const averagePoints = rows.map((row) => {
      if (typeof row.mean === 'number') {
        cumulativeSum += row.mean;
        cumulativeCount += 1;
      }
      const value = cumulativeCount ? Number((cumulativeSum / cumulativeCount).toFixed(4)) : null;
      return { label: row.label, value };
    });

    const toSeries = (key) => rows.map((row) => ({ label: row.label, value: row[key] }));

    return res.status(200).json({
      filter: {
        department,
        sub_department,
        input_screen,
        input_field: matchedColumn,
        period,
        range: bounds
      },
      cards: {
        mean: toSeries('mean'),
        median: toSeries('median'),
        standard_deviation: toSeries('standard_deviation'),
        average: averagePoints,
        outliers: toSeries('outliers'),
        z_score: toSeries('z_score')
      }
    });
  } catch (error) {
    next(error);
  }
};

const handleStatisticsAnalyticsFilters = async (req, res, next) => {
  try {
    const department = String(req.query.department || '').trim();
    const subDepartment = String(req.query.sub_department || '').trim();
    const notebook = String(req.query.notebook || req.query.input_screen || '').trim();

    const buildThresholdScope = ({ includeDepartment = true, includeSubDepartment = true, includeNotebook = true, includeField = false } = {}) => {
      const params = [];
      const where = [
        `COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) IS NOT NULL`,
        `COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) IS NOT NULL`,
        `NULLIF(trim(input_screen), '') IS NOT NULL`
      ];

      if (includeDepartment && department) {
        params.push(department);
        where.push(`COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) = $${params.length}`);
      }
      if (includeSubDepartment && subDepartment) {
        params.push(subDepartment);
        where.push(`COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) = $${params.length}`);
      }
      if (includeNotebook && notebook) {
        params.push(notebook);
        where.push(`trim(input_screen) = $${params.length}`);
      }
      if (includeField) {
        where.push(`NULLIF(trim(input_field), '') IS NOT NULL`);
      }

      return { where, params };
    };

    const subDepartmentScope = buildThresholdScope({ includeSubDepartment: false, includeNotebook: false });
    const notebookScope = buildThresholdScope({ includeNotebook: false });
    const fieldScope = buildThresholdScope({ includeField: true });

    const [departmentRes, subDepartmentRes, notebookRes, thresholdFieldRes] = await Promise.all([
      client.query(`
        SELECT DISTINCT COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) AS department
        FROM ticketing_system.threshold_master
        WHERE COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) IS NOT NULL
        ORDER BY 1
      `),
      client.query(
        `
        SELECT DISTINCT COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) AS sub_department
        FROM ticketing_system.threshold_master
        WHERE ${subDepartmentScope.where.join(' AND ')}
        ORDER BY 1
        `,
        subDepartmentScope.params
      ),
      client.query(
        `
        SELECT DISTINCT trim(input_screen) AS notebook
        FROM ticketing_system.threshold_master
        WHERE ${notebookScope.where.join(' AND ')}
        ORDER BY 1
        `,
        notebookScope.params
      ),
      client.query(
        `
        SELECT DISTINCT lower(trim(input_field)) AS input_field
        FROM ticketing_system.threshold_master
        WHERE ${fieldScope.where.join(' AND ')}
        ORDER BY 1
        `,
        fieldScope.params
      )
    ]);

    const schemaCatalog = await getSchemaFieldCatalog();
    const schemaNotebooks = schemaCatalog.map((item) => item.input_screen);
    const selectedSource = notebook ? resolveSource(notebook, { department, sub_department: subDepartment }) : null;
    const tableFields = selectedSource ? await getAllColumns(selectedSource.table) : [];
    const numericTableFields = selectedSource ? await getNumericColumns(selectedSource.table) : [];
    const thresholdFields = thresholdFieldRes.rows.map((row) => row.input_field).filter(Boolean);

    const inputFields = notebook
      ? Array.from(new Set([...thresholdFields, ...tableFields])).sort((a, b) => a.localeCompare(b))
      : [];
    const numericInputFields = notebook
      ? inputFields.filter((field) => numericTableFields.includes(field))
      : [];

    const departments = departmentRes.rows.map((row) => row.department).filter(Boolean);
    const subDepartments = Array.from(new Set([
      ...subDepartmentRes.rows.map((row) => row.sub_department).filter(Boolean),
      ...ALL_SUB_DEPARTMENTS
    ])).sort((a, b) => a.localeCompare(b));
    const notebooks = Array.from(new Set([
      ...notebookRes.rows.map((row) => row.notebook).filter(Boolean),
      ...schemaNotebooks
    ])).sort((a, b) => a.localeCompare(b));

    return res.status(200).json({
      filter: {
        department: department || null,
        sub_department: subDepartment || null,
        notebook: notebook || null,
        input_screen: notebook || null
      },
      departments,
      sub_departments: subDepartments,
      notebooks,
      input_screens: notebooks,
      input_fields: inputFields,
      numeric_input_fields: numericInputFields,
      periods: ['1W', '1M', '3M', '6M', '1Y'],
      field_source: selectedSource ? {
        input_screen: notebook,
        table: selectedSource.table,
        date_column: selectedSource.dateColumn
      } : null
    });
  } catch (error) {
    next(error);
  }
};

const getTicketScope = ({ userId, userEmployeeId = '' }) => {
  const isAdmin001 = String(userEmployeeId || '').trim().toUpperCase() === 'ADMIN001';
  if (isAdmin001) {
    return {
      canViewAllTickets: true,
      whereSql: '1=1',
      params: []
    };
  }

  return {
    canViewAllTickets: false,
    whereSql: `(user_id = $1 OR $1 = ANY(COALESCE(approval_l1_user_ids, ARRAY[]::int[])) OR $1 = ANY(COALESCE(approval_l2_user_ids, ARRAY[]::int[])) OR $1 = ANY(COALESCE(approval_l3_user_ids, ARRAY[]::int[])))`,
    params: [userId]
  };
};

const LEGACY_TICKET_METRIC_MAP = {
  total_tickets: 'total',
  open_tickets: 'open',
  reopened_tickets: 'reopened',
  closed_tickets: 'closed',
  pending_tickets: 'pending',
  overdue_tickets: 'overdue'
};

const isLegacyTicketValuesWidget = (widget = {}) => {
  const department = String(widget?.department || '').trim().toLowerCase();
  const inputScreen = String(widget?.input_screen || widget?.screen_name || '').trim().toLowerCase();
  const rawInputField = String(widget?.input_field || '').trim().toLowerCase();

  return (
    department === 'ticketing' &&
    (inputScreen === 'ticket values' || inputScreen === 'ticket dashboard') &&
    (rawInputField.includes('_|_') || rawInputField.includes('|'))
  );
};

const getLegacyTicketMetricKeys = (widget = {}) => {
  if (!isLegacyTicketValuesWidget(widget)) return [];

  return String(widget?.input_field || '')
    .split('_|_')
    .flatMap((part) => String(part || '').split('|'))
    .map((part) => String(part || '').trim().toLowerCase())
    .filter(Boolean)
    .map((part) => ({
      legacy_key: part,
      metric_key: LEGACY_TICKET_METRIC_MAP[part] || null
    }))
    .filter((item) => item.metric_key);
};

const fetchWidgetData = async ({ widget, period = '1W', userId = null, userLevel = '', userEmployeeId = '', userRole = '' }) => {
  if (
    widget?.visualization_type === 'individual_ticket_count' ||
    widget?.visualization_type === 'add_ticket_count' ||
    widget?.visualization_type === 'ticket_status_card'
  ) {
    if (!userId) {
      return {
        widget_id: widget.id,
        filter: { period },
        ticket_count: 0,
        status_breakdown: {},
        trend: []
      };
    }

    const metricKey = String(
      widget?.metric_key || widget?.ticket_metric || widget?.input_field || ''
    ).toLowerCase().trim();
    const ticketScope = getTicketScope({ userId, userEmployeeId, userRole });
    const ticketScopeWhere = ticketScope.whereSql;
    const queryParams = ticketScope.params;
    const countQueryByMetric = {
      total: `SELECT COUNT(*)::int AS ticket_count FROM ticketing_system.operator_tickets WHERE ${ticketScopeWhere}`,
      open: `SELECT COUNT(*)::int AS ticket_count FROM ticketing_system.operator_tickets WHERE ${ticketScopeWhere} AND lower(trim(COALESCE(status, ''))) = 'open'`,
      closed: `SELECT COUNT(*)::int AS ticket_count FROM ticketing_system.operator_tickets WHERE ${ticketScopeWhere} AND lower(trim(COALESCE(status, ''))) = 'closed'`,
      reopened: `SELECT COUNT(*)::int AS ticket_count FROM ticketing_system.operator_tickets WHERE ${ticketScopeWhere} AND lower(trim(COALESCE(status, ''))) = 'reopened'`,
      pending: `SELECT COUNT(*)::int AS ticket_count FROM ticketing_system.operator_tickets WHERE ${ticketScopeWhere} AND lower(trim(COALESCE(status, ''))) = 'in progress'`,
      overdue: `SELECT COUNT(*)::int AS ticket_count FROM ticketing_system.operator_tickets WHERE ${ticketScopeWhere} AND lower(trim(COALESCE(status, ''))) = 'no due'`
    };
    const countSql =
      widget?.visualization_type === 'ticket_status_card'
        ? (countQueryByMetric[metricKey] || countQueryByMetric.total)
        : countQueryByMetric.total;
    const countRes = await client.query(countSql, queryParams);

    const statusRes = await client.query(
      `SELECT initcap(lower(trim(COALESCE(status, '')))) AS status, COUNT(*)::int AS count
       FROM ticketing_system.operator_tickets
       WHERE ${ticketScopeWhere}
       GROUP BY lower(trim(COALESCE(status, '')))` ,
      queryParams
    );

    const intervalMap = {
      '1D': "1 day",
      '1W': "7 days",
      '1M': "1 month",
      '1Y': "1 year"
    };
    const trendRes = await client.query(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS label,
              COUNT(*)::int AS value
       FROM ticketing_system.operator_tickets
       WHERE ${ticketScopeWhere}
         AND created_at >= NOW() - INTERVAL '${intervalMap[period] || '7 days'}'
       GROUP BY date_trunc('day', created_at)
       ORDER BY date_trunc('day', created_at)`,
      queryParams
    );

    const statusBreakdown = {};
    for (const row of statusRes.rows) statusBreakdown[row.status] = row.count;

    return {
      widget_id: widget.id,
      widget_name: widget?.widget_name || (widget?.visualization_type === 'add_ticket_count' ? 'Add Ticket' : 'Individual Ticket Count'),
      metric_key: widget?.visualization_type === 'ticket_status_card' ? metricKey : 'total',
      filter: { period, user_id: userId },
      ticket_count: countRes.rows[0]?.ticket_count ?? 0,
      // Backward-compatible fields for older dashboard card renderers
      average_value: Number(countRes.rows[0]?.ticket_count ?? 0),
      latest_value: Number(countRes.rows[0]?.ticket_count ?? 0),
      latest_at: null,
      status_breakdown: statusBreakdown,
      trend: trendRes.rows.map((r) => ({ label: r.label, value: r.value }))
    };
  }

  const source = resolveSource(widget.input_screen, {
    department: widget.department,
    sub_department: widget.sub_department
  });
  if (!source) {
    return {
      widget_id: widget.id,
      filter: {
        department: widget.department,
        sub_department: widget.sub_department,
        input_screen: widget.input_screen,
        input_field: widget.input_field,
        period
      },
      average_value: null,
      latest_value: null,
      latest_at: null,
      trend: []
    };
  }

  const rawInputField = String(widget.input_field || '').trim();
  const matchedColumn = await resolveNumericColumn(source.table, rawInputField);
  if (!matchedColumn) {
    return {
      widget_id: widget.id,
      filter: {
        department: widget.department,
        sub_department: widget.sub_department,
        input_screen: widget.input_screen,
        input_field: rawInputField,
        period
      },
      average_value: null,
      latest_value: null,
      latest_at: null,
      trend: []
    };
  }
  const col = quoteIdent(matchedColumn);

  const latestResult = await client.query(
    `SELECT ${col}::numeric AS value, ${source.dateColumn} AS at
     FROM ${source.table}
     WHERE ${col} IS NOT NULL
     ORDER BY ${source.dateColumn} DESC
     LIMIT 1`
  );

  const avgResult = await client.query(
    `SELECT ROUND(AVG(${col})::numeric, 4) AS avg_value
     FROM ${source.table}
     WHERE ${col} IS NOT NULL`
  );

  const { query } = getTrendQuery({
    table: source.table,
    dateColumn: source.dateColumn,
    valueColumn: col,
    period
  });
  const trendResult = await client.query(query);

  return {
    widget_id: widget.id,
    filter: {
      department: widget.department,
      sub_department: widget.sub_department,
      input_screen: widget.input_screen,
      input_field: matchedColumn,
      period
    },
    average_value: avgResult.rows[0]?.avg_value ?? null,
    latest_value: latestResult.rows[0]?.value ?? null,
    latest_at: latestResult.rows[0]?.at ?? null,
    trend: trendResult.rows.map((r) => ({
      label: r.label,
      value: r.value === null ? null : Number(r.value)
    }))
  };
};

const getDashboardRolesAndUsers = async () => {
  const [roleRes, userRes] = await Promise.all([
    client.query(`
      SELECT DISTINCT COALESCE(NULLIF(trim(r.name), ''), NULLIF(trim(u.role), '')) AS role
      FROM users.user_details u
      LEFT JOIN rbac.role_details r ON r.id = u.role_id
      WHERE COALESCE(NULLIF(trim(r.name), ''), NULLIF(trim(u.role), '')) IS NOT NULL
      ORDER BY 1
    `),
    client.query(`
      SELECT u.id AS user_id, u.employee_id, u.full_name AS user_name,
        COALESCE(NULLIF(trim(r.name), ''), NULLIF(trim(u.role), '')) AS role
      FROM users.user_details u
      LEFT JOIN rbac.role_details r ON r.id = u.role_id
      WHERE u.full_name IS NOT NULL AND trim(u.full_name) <> ''
      ORDER BY u.full_name
    `)
  ]);
  return { roleRes, userRes };
};

const handleOptions = async (req, res, next) => {
  try {
    const selectedDepartment = String(req.query.department || '').trim();
    const selectedSubDepartment = String(req.query.sub_department || '').trim();
    const selectedScreen = String(req.query.input_screen || req.query.screen || '').trim();
    const effectiveDepartment = selectedDepartment || selectedSubDepartment;

    const deptRes = await client.query(`
      SELECT name AS department
      FROM rbac.departments
      WHERE is_active = true
      ORDER BY name
    `);
    const screenRes = effectiveDepartment
      ? await client.query(
        `
        SELECT s.id AS screen_id, s.name AS screen_name
        FROM rbac.screens s
        JOIN rbac.departments d ON d.id = s.department_id
        WHERE d.name = $1 AND s.is_active = true
        ORDER BY s.name
        `,
        [effectiveDepartment]
      )
      : await client.query(`
        SELECT id AS screen_id, name AS screen_name
        FROM rbac.screens
        WHERE is_active = true
        ORDER BY name
      `);
    const { roleRes, userRes } = await getDashboardRolesAndUsers();
    const subDeptRes = selectedDepartment
      ? await client.query(
        `
        SELECT DISTINCT COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) AS sub_department
        FROM ticketing_system.threshold_master
        WHERE COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) = $1
          AND COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) IS NOT NULL
        ORDER BY 1
        `,
        [selectedDepartment]
      )
      : await client.query(`
        SELECT DISTINCT COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) AS sub_department
        FROM ticketing_system.threshold_master
        WHERE COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) IS NOT NULL
        ORDER BY 1
      `);

    const allSchemaScreens = getMappedScreenCatalog().map((s) => s.input_screen);
    const subKey = normalizeKey(selectedSubDepartment);
    const scopedScreens = SUB_DEPARTMENT_SCREEN_KEYS[subKey] || allSchemaScreens;
    const schemaScreens = Array.from(new Set(scopedScreens)).sort((a, b) => a.localeCompare(b));
    const thresholdSubDepartments = subDeptRes.rows.map((r) => r.sub_department).filter(Boolean);
    const mergedSubDepartments = Array.from(new Set([
      ...thresholdSubDepartments,
      ...ALL_SUB_DEPARTMENTS
    ])).sort((a, b) => a.localeCompare(b));
    let inputFields = [];
    if (selectedScreen) {
      const source = resolveSource(selectedScreen, { department: selectedDepartment });
      if (source) inputFields = await getAllColumns(source.table);
    }

    res.status(200).json({
      departments: deptRes.rows.map((r) => r.department),
      sub_departments: mergedSubDepartments,
      screens: screenRes.rows.map((s) => s.screen_name),
      screen_options: screenRes.rows,
      input_screens: schemaScreens,
      input_fields: inputFields,
      roles: roleRes.rows.map((r) => r.role),
      users: userRes.rows,
      periods: ['1D', '1W', '1M', '1Y'],
      visualization_types: Array.from(VISUAL_TYPES)
    });
  } catch (error) {
    next(error);
  }
};

const handleOptionsV2 = async (req, res, next) => {
  try {
    const selectedDepartment = String(req.query.department || '').trim();
    const selectedSubDepartment = String(req.query.sub_department || '').trim();
    const selectedScreen = String(req.query.input_screen || req.query.screen || '').trim();

    const params = [];
    const where = [
      `COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) IS NOT NULL`,
      `COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) IS NOT NULL`,
      `NULLIF(trim(input_screen), '') IS NOT NULL`,
      `NULLIF(trim(input_field), '') IS NOT NULL`
    ];
    if (selectedDepartment) {
      params.push(selectedDepartment);
      where.push(`COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) = $${params.length}`);
    }
    if (selectedSubDepartment) {
      params.push(selectedSubDepartment);
      where.push(`COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) = $${params.length}`);
    }
    if (selectedScreen) {
      params.push(selectedScreen);
      where.push(`trim(input_screen) = $${params.length}`);
    }

    const [rowsRes, { roleRes, userRes }, rbacScreenRes] = await Promise.all([
      client.query(
        `
        SELECT DISTINCT
          COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) AS department,
          COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) AS sub_department,
          trim(input_screen) AS input_screen,
          lower(trim(input_field)) AS input_field
        FROM ticketing_system.threshold_master
        WHERE ${where.join(' AND ')}
        ORDER BY 1, 2, 3, 4
        `,
        params
      ),
      getDashboardRolesAndUsers(),
      client.query(`
        SELECT id AS screen_id, name AS screen_name, is_active
        FROM rbac.screens
        ORDER BY name
      `)
    ]);

    const depMap = new Map();
    for (const row of rowsRes.rows) {
      const dep = row.department;
      const sub = row.sub_department;
      const scr = row.input_screen;
      const fld = row.input_field;

      let depNode = depMap.get(dep);
      if (!depNode) {
        depNode = { name: dep, sub_departments: [], _sub: new Map() };
        depMap.set(dep, depNode);
      }
      let subNode = depNode._sub.get(sub);
      if (!subNode) {
        subNode = { name: sub, input_screens: [], _screen: new Map() };
        depNode._sub.set(sub, subNode);
        depNode.sub_departments.push(subNode);
      }
      let screenNode = subNode._screen.get(scr);
      if (!screenNode) {
        const catalog = findCatalogForInputScreen(scr);
        screenNode = {
          input_screen: scr,
          mapped_input_screen: catalog?.input_screen || null,
          table: catalog?.table || null,
          date_column: catalog?.date_column || null,
          input_fields: [],
          _field: new Set()
        };
        subNode._screen.set(scr, screenNode);
        subNode.input_screens.push(screenNode);
      }
      if (!screenNode._field.has(fld)) {
        screenNode._field.add(fld);
        screenNode.input_fields.push(fld);
      }
    }

    const departments = Array.from(depMap.values()).map((d) => {
      for (const s of d.sub_departments) {
        for (const sc of s.input_screens) delete sc._field;
        delete s._screen;
      }
      delete d._sub;
      return d;
    });

    const subDepartmentsMerged = Array.from(new Set([
      ...departments.flatMap((d) => d.sub_departments.map((s) => s.name)).filter(Boolean),
      ...ALL_SUB_DEPARTMENTS
    ])).sort((a, b) => a.localeCompare(b));

    res.status(200).json({
      departments,
      sub_departments: subDepartmentsMerged,
      rbac_screens: rbacScreenRes.rows.filter((s) => s.is_active),
      roles: roleRes.rows.map((r) => r.role),
      users: userRes.rows,
      periods: ['1D', '1W', '1M', '1Y'],
      visualization_types: Array.from(VISUAL_TYPES)
    });
  } catch (error) {
    next(error);
  }
};

const handleOptionsCascade = async (req, res, next) => {
  try {
    const department = String(req.query.department || '').trim();
    const subDepartment = String(req.query.sub_department || '').trim();
    const notebook = String(req.query.notebook || req.query.input_screen || '').trim();

    const [deptRes, screenRes, subDeptRes, notebookRes, fieldRes] = await Promise.all([
      client.query(`
        SELECT DISTINCT COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) AS department
        FROM ticketing_system.threshold_master
        WHERE COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) IS NOT NULL
        ORDER BY 1
      `),
      department
        ? client.query(
          `
          SELECT s.id AS screen_id, s.name AS screen_name, s.is_active
          FROM rbac.screens s
          JOIN rbac.departments d ON d.id = s.department_id
          WHERE d.name = $1 AND s.is_active = true
          ORDER BY s.name
          `,
          [department]
        )
        : client.query(`
          SELECT s.id AS screen_id, s.name AS screen_name, s.is_active
          FROM rbac.screens s
          WHERE s.is_active = true
          ORDER BY s.name
        `),
      department
        ? client.query(
          `
          SELECT DISTINCT COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) AS sub_department
          FROM ticketing_system.threshold_master
          WHERE COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) = $1
            AND COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) IS NOT NULL
          ORDER BY 1
          `,
          [department]
        )
        : client.query(`
          SELECT DISTINCT COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) AS sub_department
          FROM ticketing_system.threshold_master
          WHERE COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) IS NOT NULL
          ORDER BY 1
        `),
      department
        ? (subDepartment
          ? client.query(
            `
            SELECT DISTINCT trim(input_screen) AS notebook
            FROM ticketing_system.threshold_master
            WHERE COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) = $1
              AND COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) = $2
              AND NULLIF(trim(input_screen), '') IS NOT NULL
            ORDER BY 1
            `,
            [department, subDepartment]
          )
          : client.query(
            `
            SELECT DISTINCT trim(input_screen) AS notebook
            FROM ticketing_system.threshold_master
            WHERE COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) = $1
              AND NULLIF(trim(input_screen), '') IS NOT NULL
            ORDER BY 1
            `,
            [department]
          ))
        : client.query(`
          SELECT DISTINCT trim(input_screen) AS notebook
          FROM ticketing_system.threshold_master
          WHERE NULLIF(trim(input_screen), '') IS NOT NULL
          ORDER BY 1
        `),
      (() => {
        const params = [];
        const where = [`NULLIF(trim(input_field), '') IS NOT NULL`];
        if (department) {
          params.push(department);
          where.push(`COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) = $${params.length}`);
        }
        if (subDepartment) {
          params.push(subDepartment);
          where.push(`COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) = $${params.length}`);
        }
        if (notebook) {
          params.push(notebook);
          where.push(`trim(input_screen) = $${params.length}`);
        }
        return client.query(
          `
          SELECT DISTINCT lower(trim(input_field)) AS input_field
          FROM ticketing_system.threshold_master
          WHERE ${where.join(' AND ')}
          ORDER BY 1
          `,
          params
        );
      })()
    ]);

    const schemaCatalog = await getSchemaFieldCatalog();
    const schemaFieldsAll = Array.from(new Set(schemaCatalog.flatMap((s) => s.fields))).sort((a, b) => a.localeCompare(b));

    let resolvedSource = null;
    let tableFields = [];
    if (notebook) {
      resolvedSource = resolveSource(notebook, { department, sub_department: subDepartment });
      if (resolvedSource) {
        tableFields = await getAllColumns(resolvedSource.table);
      }
    }

    const mergedFields = Array.from(new Set([
      ...fieldRes.rows.map((r) => r.input_field),
      ...(notebook ? tableFields : schemaFieldsAll)
    ])).sort((a, b) => a.localeCompare(b));

    const notebookFromSchema = schemaCatalog.map((s) => s.input_screen);
    const notebooksMerged = Array.from(new Set([
      ...notebookRes.rows.map((r) => r.notebook),
      ...notebookFromSchema
    ])).sort((a, b) => a.localeCompare(b));

    const thresholdSubs = subDeptRes.rows.map((r) => r.sub_department).filter(Boolean);
    const mergedSubs = Array.from(new Set([...thresholdSubs, ...ALL_SUB_DEPARTMENTS])).sort((a, b) => a.localeCompare(b));

    res.status(200).json({
      departments: deptRes.rows.map((r) => r.department),
      screens: screenRes.rows,
      sub_departments: mergedSubs,
      notebooks: notebooksMerged,
      input_fields: mergedFields,
      field_source: resolvedSource ? {
        input_screen: notebook,
        table: resolvedSource.table,
        date_column: resolvedSource.dateColumn
      } : null,
      schema_fields: schemaCatalog,
      selected: {
        department: department || null,
        sub_department: subDepartment || null,
        notebook: notebook || null
      }
    });
  } catch (error) {
    next(error);
  }
};

// Simple frontend-matching API:
// department + input_screen -> input_fields/values for that exact context
const handleOptionsMatch = async (req, res, next) => {
  try {
    const department = String(req.query.department || '').trim();
    const inputScreen = String(req.query.input_screen || req.query.notebook || '').trim();
    const subDepartment = String(req.query.sub_department || '').trim();

    const { roleRes, userRes } = await getDashboardRolesAndUsers();

    if (!department) {
      const rbacDeptRes = await client.query(`
        SELECT DISTINCT name AS department
        FROM rbac.departments
        WHERE is_active = true
        ORDER BY 1
      `);
      const departments = rbacDeptRes.rows.map((r) => r.department);
      return res.status(200).json({
        departments,
        roles: roleRes.rows.map((r) => r.role),
        users: userRes.rows,
        selected: { department: null, input_screen: null, sub_department: null }
      });
    }

    if (!inputScreen) {
      const screensRes = await client.query(
        `
        SELECT s.id AS screen_id, s.name AS screen_name, s.is_active
        FROM rbac.screens s
        JOIN rbac.departments d ON d.id = s.department_id
        WHERE d.name = $1 AND s.is_active = true
        ORDER BY s.name
        `,
        [department]
      );
      const schemaScreens = getMappedScreenCatalog().map((s) => s.input_screen);
      const inputScreens = Array.from(new Set(schemaScreens)).sort((a, b) => a.localeCompare(b));
      return res.status(200).json({
        department,
        screens: screensRes.rows,
        sub_departments: ALL_SUB_DEPARTMENTS,
        input_screens: inputScreens,
        roles: roleRes.rows.map((r) => r.role),
        users: userRes.rows,
        selected: { department, input_screen: null, sub_department: subDepartment || null }
      });
    }

    const source = resolveSource(inputScreen, { department, sub_department: subDepartment });
    const tableFields = source ? await getAllColumns(source.table) : [];
    const numericTableFields = source ? await getNumericColumns(source.table) : [];
    const inputFields = Array.from(new Set(tableFields)).sort((a, b) => a.localeCompare(b));

    const numericInputFields = inputFields.filter((f) => numericTableFields.includes(f));
    const inputValuesAverage = source && numericInputFields.length
      ? await getAverageValuesForFields(source.table, numericInputFields)
      : {};

    return res.status(200).json({
      department,
      sub_department: subDepartment || null,
      input_screen: inputScreen,
      mapped_table: source?.table || null,
      date_column: source?.dateColumn || null,
      input_fields: inputFields,
      numeric_input_fields: numericInputFields,
      input_values_average: inputValuesAverage,
      roles: roleRes.rows.map((r) => r.role),
      users: userRes.rows,
      selected: { department, input_screen: inputScreen, sub_department: subDepartment || null }
    });
  } catch (error) {
    next(error);
  }
};

const handleGetWidgets = async (req, res, next) => {
  try {
    const userId = parseUserId(req.params.userId);
    if (!userId) return res.status(400).json({ message: 'Valid userId is required' });
    if (!ensureDashboardAccess(req, res, userId)) return;
    const config = await getConfig(userId);

    // Compatibility fallback:
    // If builder config is empty, but a default page exists in per-page storage,
    // return those widgets so user-switch in builder does not appear "vanished".
    if ((!config.widgets || !config.widgets.length)) {
      const defaultPage = await getUserPage(userId, 'default');
      if (Array.isArray(defaultPage.widgets) && defaultPage.widgets.length) {
        return res.status(200).json({
          user_id: userId,
          widgets: defaultPage.widgets,
          updated_at: defaultPage.updated_at
        });
      }
    }

    res.status(200).json({ user_id: userId, ...config });
  } catch (error) {
    next(error);
  }
};

const handleGetMyWidgets = async (req, res, next) => {
  try {
    const userId = parseUserId(req.user?.id);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    const config = await getConfig(userId);
    logDashboardDebug('my-widgets', {
      requester_user_id: userId,
      widget_count: Array.isArray(config.widgets) ? config.widgets.length : 0,
      updated_at: config.updated_at,
      widgets: Array.isArray(config.widgets) ? config.widgets.map(summarizeWidgetForLog) : []
    });
    res.status(200).json({ user_id: userId, ...config });
  } catch (error) {
    next(error);
  }
};

const handleSaveWidgets = async (req, res, next) => {
  try {
    if (!canManageDashboards(req)) {
      return res.status(403).json({ message: 'Read-only access: employees can only view dashboard' });
    }
    const userId = parseUserId(req.params.userId);
    if (!userId) return res.status(400).json({ message: 'Valid userId is required' });
    if (!ensureDashboardAccess(req, res, userId)) return;
    if (!Array.isArray(req.body?.widgets)) return res.status(400).json({ message: 'widgets must be an array' });

    const widgets = [];
    for (let i = 0; i < req.body.widgets.length; i += 1) {
      const check = await validateWidget({ ...req.body.widgets[i], order: i + 1 });
      if (check.error) return res.status(400).json({ message: check.error, index: i });
      widgets.push(check.data);
    }

    const saved = await saveConfig(userId, widgets);
    res.status(200).json({
      message: 'Dashboard builder widgets saved successfully',
      user_id: saved.user_id,
      widgets: saved.widgets,
      updated_at: saved.updated_at
    });
  } catch (error) {
    next(error);
  }
};

const handleSaveMyWidgets = async (req, res, next) => {
  try {
    const userId = parseUserId(req.user?.id);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    if (!Array.isArray(req.body?.widgets)) return res.status(400).json({ message: 'widgets must be an array' });

    const widgets = [];
    for (let i = 0; i < req.body.widgets.length; i += 1) {
      const check = await validateWidget({ ...req.body.widgets[i], order: i + 1 });
      if (check.error) return res.status(400).json({ message: check.error, index: i });
      widgets.push(check.data);
    }

    const saved = await saveConfig(userId, widgets);
    res.status(200).json({
      message: 'My dashboard widgets saved successfully',
      user_id: saved.user_id,
      widgets: saved.widgets,
      updated_at: saved.updated_at
    });
  } catch (error) {
    next(error);
  }
};

const handleAssignDashboard = async (req, res, next) => {
  try {
    if (!isAdminUser(req)) {
      return res.status(403).json({ message: 'Only admin can assign dashboard to other users' });
    }
    const targetUserId = parseUserId(req.params.userId);
    if (!targetUserId) return res.status(400).json({ message: 'Valid userId is required' });
    if (!Array.isArray(req.body?.widgets)) return res.status(400).json({ message: 'widgets must be an array' });

    const widgets = [];
    for (let i = 0; i < req.body.widgets.length; i += 1) {
      const check = await validateWidget({ ...req.body.widgets[i], order: i + 1 });
      if (check.error) return res.status(400).json({ message: check.error, index: i });
      widgets.push(check.data);
    }

    const saved = await saveConfig(targetUserId, widgets);
    return res.status(200).json({
      message: 'Dashboard assigned successfully',
      user_id: saved.user_id,
      widgets: saved.widgets,
      updated_at: saved.updated_at
    });
  } catch (error) {
    next(error);
  }
};

const handleReorderWidgets = async (req, res, next) => {
  try {
    if (!canManageDashboards(req)) {
      return res.status(403).json({ message: 'Read-only access: employees can only view dashboard' });
    }
    const userId = parseUserId(req.params.userId);
    const orderedIds = Array.isArray(req.body?.widget_ids) ? req.body.widget_ids : [];
    if (!userId) return res.status(400).json({ message: 'Valid userId is required' });
    if (!ensureDashboardAccess(req, res, userId)) return;
    if (!orderedIds.length) return res.status(400).json({ message: 'widget_ids must be a non-empty array' });

    const config = await getConfig(userId);
    const byId = new Map(config.widgets.map((w) => [w.id, w]));
    const reordered = [];
    orderedIds.forEach((id, index) => {
      const widget = byId.get(id);
      if (widget) reordered.push({ ...widget, order: index + 1 });
      byId.delete(id);
    });
    for (const widget of byId.values()) reordered.push({ ...widget, order: reordered.length + 1 });

    const saved = await saveConfig(userId, reordered);
    res.status(200).json({ message: 'Widget order updated', widgets: saved.widgets, updated_at: saved.updated_at });
  } catch (error) {
    next(error);
  }
};

const handleToggleWidget = async (req, res, next) => {
  try {
    if (!canManageDashboards(req)) {
      return res.status(403).json({ message: 'Read-only access: employees can only view dashboard' });
    }
    const userId = parseUserId(req.params.userId);
    const widgetId = normalizeWidgetId(req.params.widgetId);
    if (!userId || !widgetId) return res.status(400).json({ message: 'Valid userId and widgetId are required' });
    if (!ensureDashboardAccess(req, res, userId)) return;

    const config = await getConfig(userId);
    const widgets = config.widgets.map((w) => (normalizeWidgetId(w.id) === widgetId ? { ...w, enabled: !w.enabled } : w));
    const saved = await saveConfig(userId, widgets);
    res.status(200).json({ message: 'Widget toggled', widgets: saved.widgets, updated_at: saved.updated_at });
  } catch (error) {
    next(error);
  }
};

const handleDeleteWidget = async (req, res, next) => {
  try {
    if (!canManageDashboards(req)) {
      return res.status(403).json({ message: 'Read-only access: employees can only view dashboard' });
    }
    const userId = parseUserId(req.params.userId);
    const widgetId = normalizeWidgetId(req.params.widgetId);
    if (!userId || !widgetId) return res.status(400).json({ message: 'Valid userId and widgetId are required' });
    if (!ensureDashboardAccess(req, res, userId)) return;

    const config = await getConfig(userId);
    const before = config.widgets.length;
    const widgets = config.widgets
      .filter((w) => normalizeWidgetId(w.id) !== widgetId)
      .map((w, i) => ({ ...w, order: i + 1 }));
    if (before === widgets.length) {
      return res.status(404).json({ message: `Widget not found: ${widgetId}` });
    }
    const saved = await saveConfig(userId, widgets);
    res.status(200).json({ message: 'Widget deleted', widgets: saved.widgets, updated_at: saved.updated_at });
  } catch (error) {
    next(error);
  }
};

const handleBuilderData = async (req, res, next) => {
  try {
    const department = String(req.query.department || '').trim();
    const sub_department = String(req.query.sub_department || '').trim();
    const input_screen = String(req.query.input_screen || '').trim();
    const rawInputField = String(req.query.input_field || '').trim();
    const period = String(req.query.period || '1W').toUpperCase();

    if (!department || !sub_department || !input_screen || !rawInputField) {
      return res.status(400).json({ message: 'department, sub_department, input_screen and input_field are required' });
    }
    if (!PERIODS.has(period)) return res.status(400).json({ message: 'period must be one of 1D, 1W, 1M, 1Y' });

    const source = resolveSource(input_screen, { department, sub_department });
    if (!source) {
      return res.status(200).json({
        filter: {
          department,
          sub_department,
          input_screen,
          input_field: rawInputField,
          period
        },
        average_value: null,
        latest_value: null,
        latest_at: null,
        trend: []
      });
    }

    const matchedColumn = await resolveNumericColumn(source.table, rawInputField);
    if (!matchedColumn) {
      return res.status(200).json({
        filter: {
          department,
          sub_department,
          input_screen,
          input_field: rawInputField,
          period
        },
        average_value: null,
        latest_value: null,
        latest_at: null,
        trend: []
      });
    }
    const col = quoteIdent(matchedColumn);

    const latestResult = await client.query(
      `SELECT ${col}::numeric AS value, ${source.dateColumn} AS at
       FROM ${source.table}
       WHERE ${col} IS NOT NULL
       ORDER BY ${source.dateColumn} DESC
       LIMIT 1`
    );

    const avgResult = await client.query(
      `SELECT ROUND(AVG(${col})::numeric, 4) AS avg_value
       FROM ${source.table}
       WHERE ${col} IS NOT NULL`
    );

    const { query } = getTrendQuery({
      table: source.table,
      dateColumn: source.dateColumn,
      valueColumn: col,
      period
    });
    const trendResult = await client.query(query);

    res.status(200).json({
      filter: {
        department,
        sub_department,
        input_screen,
        input_field: matchedColumn,
        period
      },
      average_value: avgResult.rows[0]?.avg_value ?? null,
      latest_value: latestResult.rows[0]?.value ?? null,
      latest_at: latestResult.rows[0]?.at ?? null,
      trend: trendResult.rows.map((r) => ({
        label: r.label,
        value: r.value === null ? null : Number(r.value)
      }))
    });
  } catch (error) {
    next(error);
  }
};

const handleMyDashboardPage = async (req, res, next) => {
  try {
    const requesterUserId = parseUserId(req.user?.id);
    if (!requesterUserId) return res.status(401).json({ message: 'Authentication required' });
    const requestedUserId = parseUserId(req.query.user_id ?? req.query.view_user_id);
    const userId = canManageDashboards(req) && requestedUserId ? requestedUserId : requesterUserId;

    const period = String(req.query.period || '1W').toUpperCase();
    if (!PERIODS.has(period)) return res.status(400).json({ message: 'period must be one of 1D, 1W, 1M, 1Y' });

    const dashboardUser = await getDashboardUserContext(userId);
    if (!dashboardUser) return res.status(404).json({ message: 'Dashboard user not found' });

    const config = await getEffectiveDashboardConfig(userId);
    const widgets = (config.widgets || [])
      .filter((w) => w?.enabled !== false)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

    const data = [];
    for (const widget of widgets) {
      const legacyTicketMetrics = getLegacyTicketMetricKeys(widget);
      if (legacyTicketMetrics.length) {
        for (let index = 0; index < legacyTicketMetrics.length; index += 1) {
          const item = legacyTicketMetrics[index];
          const widgetData = await fetchWidgetData({
            widget: {
              ...widget,
              id: `${widget.id}-${index + 1}`,
              visualization_type: 'ticket_status_card',
              metric_key: item.metric_key,
              input_field: item.legacy_key,
              widget_name: item.legacy_key
            },
            period,
            userId,
            userLevel: dashboardUser.level,
            userEmployeeId: dashboardUser.employee_id,
            userRole: dashboardUser.role
          });
          data.push({
            ...widgetData,
            input_field: item.legacy_key
          });
        }
        continue;
      }

      const widgetData = await fetchWidgetData({
        widget,
        period,
        userId,
        userLevel: dashboardUser.level,
        userEmployeeId: dashboardUser.employee_id,
        userRole: dashboardUser.role
      });
      data.push(widgetData);
    }

    logDashboardDebug('my-dashboard', {
      requester_user_id: requesterUserId,
      dashboard_user_id: userId,
      page_key: config.page_key,
      page_title: config.page_title,
      updated_at: config.updated_at,
      period,
      widget_count: widgets.length,
      widgets: widgets.map(summarizeWidgetForLog),
      data: data.map(summarizeWidgetDataForLog)
    });

    res.status(200).json({
      user_id: userId,
      requested_by_user_id: requesterUserId,
      updated_at: config.updated_at,
      page_key: config.page_key,
      page_title: config.page_title,
      widgets,
      data
    });
  } catch (error) {
    next(error);
  }
};

const handleListMyPages = async (req, res, next) => {
  try {
    const userId = parseUserId(req.user?.id);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    const pages = await listUserPages(userId);
    res.status(200).json({ user_id: userId, pages });
  } catch (error) {
    next(error);
  }
};

const handleAssignPageToUser = async (req, res, next) => {
  try {
    if (!canManageDashboards(req)) {
      return res.status(403).json({ message: 'Only EMP001 can assign dashboard pages to other users' });
    }
    const targetUserId = parseUserId(req.params.userId);
    if (!targetUserId) return res.status(400).json({ message: 'Valid userId is required' });
    if (!Array.isArray(req.body?.widgets)) return res.status(400).json({ message: 'widgets must be an array' });

    const pageKey = String(req.params.pageKey || 'default');
    const pageTitle = req.body?.page_title || null;
    const isActive = req.body?.is_active !== false;

    const widgets = [];
    for (let i = 0; i < req.body.widgets.length; i += 1) {
      const check = await validateWidget({ ...req.body.widgets[i], order: i + 1 });
      if (check.error) return res.status(400).json({ message: check.error, index: i });
      widgets.push(check.data);
    }

    const saved = await saveUserPage(targetUserId, pageKey, pageTitle, widgets, isActive);
    // Keep builder storage in sync for legacy UI screens that read builder configs.
    await saveConfig(targetUserId, widgets);
    res.status(200).json({
      message: 'Dashboard page assigned successfully',
      page: saved
    });
  } catch (error) {
    next(error);
  }
};

const handleGetMyPage = async (req, res, next) => {
  try {
    const userId = parseUserId(req.user?.id);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    const pageKey = String(req.params.pageKey || 'default');
    const page = await getUserPage(userId, pageKey);
    res.status(200).json(page);
  } catch (error) {
    next(error);
  }
};

const handleGetMyPageData = async (req, res, next) => {
  try {
    const requesterUserId = parseUserId(req.user?.id);
    if (!requesterUserId) return res.status(401).json({ message: 'Authentication required' });
    const requestedUserId = parseUserId(req.query.user_id ?? req.query.view_user_id);
    const userId = canManageDashboards(req) && requestedUserId ? requestedUserId : requesterUserId;

    const period = String(req.query.period || '1W').toUpperCase();
    if (!PERIODS.has(period)) return res.status(400).json({ message: 'period must be one of 1D, 1W, 1M, 1Y' });

    const pageKey = String(req.params.pageKey || 'default');
    const dashboardUser = await getDashboardUserContext(userId);
    if (!dashboardUser) return res.status(404).json({ message: 'Dashboard user not found' });
    const page = await getUserPage(userId, pageKey);
    const widgets = (page.widgets || [])
      .filter((w) => w?.enabled !== false)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

    const data = [];
    for (const widget of widgets) {
      const legacyTicketMetrics = getLegacyTicketMetricKeys(widget);
      if (legacyTicketMetrics.length) {
        for (let index = 0; index < legacyTicketMetrics.length; index += 1) {
          const item = legacyTicketMetrics[index];
          const widgetData = await fetchWidgetData({
            widget: {
              ...widget,
              id: `${widget.id}-${index + 1}`,
              visualization_type: 'ticket_status_card',
              metric_key: item.metric_key,
              input_field: item.legacy_key,
              widget_name: item.legacy_key
            },
            period,
            userId,
            userLevel: dashboardUser.level,
            userEmployeeId: dashboardUser.employee_id,
            userRole: dashboardUser.role
          });
          data.push({
            ...widgetData,
            input_field: item.legacy_key
          });
        }
        continue;
      }

      const widgetData = await fetchWidgetData({
        widget,
        period,
        userId,
        userLevel: dashboardUser.level,
        userEmployeeId: dashboardUser.employee_id,
        userRole: dashboardUser.role
      });
      data.push(widgetData);
    }

    res.status(200).json({
      user_id: userId,
      requested_by_user_id: requesterUserId,
      page_key: page.page_key,
      page_title: page.page_title,
      updated_at: page.updated_at,
      widgets,
      data
    });
  } catch (error) {
    next(error);
  }
};

const handleSaveMyPage = async (req, res, next) => {
  try {
    if (!canManageDashboards(req)) {
      return res.status(403).json({ message: 'Read-only access: employees can only view dashboard' });
    }
    const userId = parseUserId(req.user?.id);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    if (!Array.isArray(req.body?.widgets)) return res.status(400).json({ message: 'widgets must be an array' });

    const pageKey = String(req.params.pageKey || 'default');
    const pageTitle = req.body?.page_title || null;
    const isActive = req.body?.is_active !== false;

    const widgets = [];
    for (let i = 0; i < req.body.widgets.length; i += 1) {
      const check = await validateWidget({ ...req.body.widgets[i], order: i + 1 });
      if (check.error) return res.status(400).json({ message: check.error, index: i });
      widgets.push(check.data);
    }

    const saved = await saveUserPage(userId, pageKey, pageTitle, widgets, isActive);
    // Keep builder config in sync so refresh endpoints that read config
    // do not lose recently saved widgets/tickets.
    await saveConfig(userId, widgets);
    res.status(200).json({
      message: 'Dashboard page saved successfully',
      page: saved
    });
  } catch (error) {
    next(error);
  }
};

const handleDeleteMyPage = async (req, res, next) => {
  try {
    if (!canManageDashboards(req)) {
      return res.status(403).json({ message: 'Read-only access: employees can only view dashboard' });
    }
    const userId = parseUserId(req.user?.id);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    const pageKey = String(req.params.pageKey || '').trim();
    if (!pageKey) return res.status(400).json({ message: 'Valid pageKey is required' });
    if (normalizePageKey(pageKey) === 'default') {
      return res.status(400).json({ message: 'default page cannot be deleted' });
    }

    const deleted = await deleteUserPage(userId, pageKey);
    if (!deleted) return res.status(404).json({ message: 'Page not found' });
    res.status(200).json({ message: 'Dashboard page deleted', page: deleted });
  } catch (error) {
    next(error);
  }
};

router.get('/builder/options', handleOptions);
router.get('/dashbuilder/options', handleOptions);
router.get('/builder/options/v2', handleOptionsV2);
router.get('/dashbuilder/options/v2', handleOptionsV2);
router.get('/builder/options/cascade', handleOptionsCascade);
router.get('/dashbuilder/options/cascade', handleOptionsCascade);
router.get('/builder/options/all', handleOptionsCascade);
router.get('/dashbuilder/options/all', handleOptionsCascade);
router.get('/builder/options/match', handleOptionsMatch);
router.get('/dashbuilder/options/match', handleOptionsMatch);

router.get('/builder/widgets/:userId', handleGetWidgets);
router.get('/dashbuilder/:userId/widgets', handleGetWidgets);

router.post('/builder/widgets/:userId', handleSaveWidgets);
router.post('/dashbuilder/:userId/add-widget', handleSaveWidgets);
router.post('/dashbuilder/:userId/add-ticket', handleSaveWidgets);

router.patch('/builder/widgets/:userId/reorder', handleReorderWidgets);
router.patch('/dashbuilder/:userId/reorder-widgets', handleReorderWidgets);

router.patch('/builder/widgets/:userId/:widgetId/toggle', handleToggleWidget);
router.patch('/dashbuilder/:userId/widgets/:widgetId/toggle', handleToggleWidget);

router.delete('/builder/widgets/:userId/:widgetId', handleDeleteWidget);
router.delete('/dashbuilder/:userId/widgets/:widgetId', handleDeleteWidget);
router.delete('/builder/:userId/widgets/:widgetId', handleDeleteWidget);

router.get('/builder/data', handleBuilderData);
router.get('/dashbuilder/data', handleBuilderData);
router.get('/builder/statistics-analytics/filters', handleStatisticsAnalyticsFilters);
router.get('/dashbuilder/statistics-analytics/filters', handleStatisticsAnalyticsFilters);
router.get('/builder/statistics-analytics', handleStatisticsAnalytics);
router.get('/dashbuilder/statistics-analytics', handleStatisticsAnalytics);
router.get('/builder/my-page', handleMyDashboardPage);
router.get('/dashbuilder/my-page', handleMyDashboardPage);

// Unified routes: dashbuilder writes config, dashboard reads same config/data
router.get('/my-widgets', handleGetMyWidgets);
router.post('/my-widgets', handleSaveMyWidgets);
router.get('/my-dashboard', handleMyDashboardPage);
router.get('/statistics-analytics/filters', handleStatisticsAnalyticsFilters);
router.get('/statistics-analytics/options', handleStatisticsAnalyticsFilters);
router.get('/statistics-analytics', handleStatisticsAnalytics);
router.get('/page', handleMyDashboardPage);
router.get('/pages/my', handleListMyPages);
router.get('/pages/my/:pageKey', handleGetMyPage);
router.get('/pages/my/:pageKey/data', handleGetMyPageData);
router.post('/pages/my/:pageKey', handleSaveMyPage);
router.delete('/pages/my/:pageKey', handleDeleteMyPage);
router.post('/pages/assign/:userId/:pageKey', handleAssignPageToUser);

// Dashbuilder compatibility aliases for assignment/view flow
router.post('/dashbuilder/pages/assign/:userId/:pageKey', handleAssignPageToUser);
router.get('/dashbuilder/pages/my/:pageKey/data', handleGetMyPageData);

module.exports = router;

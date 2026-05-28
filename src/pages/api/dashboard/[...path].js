import pool from "@/lib/db";

const PERIODS = new Set(["1D", "1W", "1M", "1Y"]);
const VISUAL_TYPES = new Set([
  "average_value_card",
  "bar_chart",
  "area_chart",
  "line_chart",
  "individual_ticket_count",
  "add_ticket_count",
  "ticket_status_card",
]);
const TICKET_CARD_METRICS = new Set(["total", "open", "closed", "reopened", "pending", "overdue"]);
const ALL_SUB_DEPARTMENTS = ["Mixing", "Spinning", "Carding", "Comber", "Blowroom", "Autoconer", "Drawframe", "Simplex", "Wrapping"];

const SUB_DEPARTMENT_SCREEN_KEYS = {
  mixing: ["cottonhvidataentry", "fibredataentry", "afisdataentry", "moisturedataentry", "opennessdataentry", "mixingqcdataentry"],
  blowroom: ["blowroomsyncdataentry", "droptestdataentry", "brwastestudydataentry", "blowroomheaderdataentry"],
  carding: ["cardthickplacedataentry", "betweenwithincarddataentry", "cardingnatidataentry", "cardinguqcdataentry", "carddfkpressurechecking", "cardingqcdataentry"],
  comber: ["ribbonlapcvdataentry", "combernatidataentry", "comberuqcdataentry"],
  drawframe: ["yarncvcalculation", "cotsdataentry", "drawframeuqcdataentry", "drawframeqcdataentry", "finisherdrawinginspection"],
  simplex: ["smxcotschangedataentry", "smxbreaksstudyreport", "simplexuqcdataentry", "simplexprocessparameter"],
  spinning: ["speedcheckingdataentry", "cotscheckingdataentry", "lycramissingdataentry", "bottomaproncheckingdataentry", "lycracenteringdataentry", "rsmlycraonlinedataentry", "rsmlycraofflinedataentry", "ringframedataentry", "countchangedataentry", "spinningqcdataentry", "wheelchangetype1", "wheelchangetype2", "wheelchangetype3"],
  autoconer: ["lycracheckingdataentry", "countwisecutsdataentry", "drumwisedataentry", "splicestrengthdataentry", "rewindingstudydataentry", "conedensitydataentry", "conepackingauditdataentry", "autoconerparameterentries", "autoconerprocessparameter", "autoconerq2inspection", "autoconerq3inspection"],
};

const SCREEN_SOURCE_MAP = {
  cottonhvidataentry: { table: "mixing.cotton_hvi_data_entry", dateColumn: "inspection_date" },
  fibredataentry: { table: "mixing.fibre_data_entry", dateColumn: "inspection_date" },
  afisdataentry: { table: "mixing.afis_data_entry", dateColumn: "inspection_date" },
  moisturedataentry: { table: "mixing.moisture_data_entry", dateColumn: "inspection_date" },
};

const normalizeKey = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const quoteIdent = (value) => `"${String(value).replace(/"/g, '""')}"`;
const parseUserId = (value) => {
  const userId = Number(value);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
};
const normalizeWidgetId = (value) => String(value ?? "").trim();
const normalizePageKey = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");

const jsonError = (res, status, message, extra = {}) => res.status(status).json({ message, ...extra });

const decodeBase64UrlJson = (value) => {
  try {
    const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
    return JSON.parse(Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
};

const decodeBearerPayload = (authorization = "") => {
  const token = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const [, payload] = token.split(".");
  return payload ? decodeBase64UrlJson(payload) : null;
};

const getRequestUser = async (req) => {
  const payload = decodeBearerPayload(req.headers.authorization || "");
  if (!payload || typeof payload !== "object") return null;

  const candidateId = parseUserId(payload.id || payload.user_id || payload.userId || payload.sub);
  const candidateEmployeeId = String(payload.employee_id || payload.employeeId || payload.emp_id || "").trim();

  try {
    const params = [];
    const where = [];
    if (candidateId) {
      params.push(candidateId);
      where.push(`id = $${params.length}`);
    }
    if (candidateEmployeeId) {
      params.push(candidateEmployeeId);
      where.push(`employee_id = $${params.length}`);
    }
    if (where.length) {
      const result = await pool.query(
        `SELECT id, employee_id, full_name, role, level
         FROM users.user_details
         WHERE ${where.join(" OR ")}
         LIMIT 1`,
        params
      );
      if (result.rows[0]) return result.rows[0];
    }
  } catch {
    // If user lookup is unavailable, still honor signed-token shaped payloads for local development.
  }

  return {
    id: candidateId,
    employee_id: candidateEmployeeId,
    full_name: payload.full_name || payload.name || "",
    role: payload.role || payload.role_name || "",
    level: payload.level || "",
  };
};

const isAdminUser = (req) => {
  const role = String(req.user?.role || "").trim().toLowerCase();
  return role === "admin" || role === "super admin" || role === "superadmin";
};
const isAdmin001DashboardManager = (req) => String(req.user?.employee_id || "").trim().toUpperCase() === "ADMIN001";
const canManageDashboards = (req) => isAdmin001DashboardManager(req);

const ensureDashboardAccess = (req, res, userId) => {
  const requesterId = parseUserId(req.user?.id);
  if (!requesterId) {
    jsonError(res, 401, "Authentication required");
    return false;
  }
  if (canManageDashboards(req)) return true;
  if (!isAdminUser(req) && requesterId !== userId) {
    jsonError(res, 403, "You can only access your own dashboard configuration");
    return false;
  }
  return true;
};

const ensureDashboardBuilderTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users.dashboard_builder_configs (
      user_id integer PRIMARY KEY REFERENCES users.user_details(id) ON DELETE CASCADE,
      widgets jsonb NOT NULL DEFAULT '[]'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
};

const ensureUserDashboardPagesTable = async () => {
  await pool.query(`
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

const resolveSource = (inputScreen, context = {}) => {
  const key = normalizeKey(inputScreen);
  if (SCREEN_SOURCE_MAP[key]) return SCREEN_SOURCE_MAP[key];

  const aliasMap = {
    processparameter: "autoconerprocessparameter",
    q2inspection: "autoconerq2inspection",
    q3inspection: "autoconerq3inspection",
  };
  const aliasKey = aliasMap[key];
  if (aliasKey && SCREEN_SOURCE_MAP[aliasKey]) {
    if (key === "processparameter") {
      const deptHint = normalizeKey(context.department || context.sub_department || "");
      if (deptHint.includes("simplex") && SCREEN_SOURCE_MAP.simplexprocessparameter) return SCREEN_SOURCE_MAP.simplexprocessparameter;
      if (deptHint.includes("spinning") && SCREEN_SOURCE_MAP.spinningqcdataentry) return SCREEN_SOURCE_MAP.spinningqcdataentry;
      if ((deptHint.includes("autoconer") || deptHint.includes("autocone")) && SCREEN_SOURCE_MAP.autoconerprocessparameter) {
        return SCREEN_SOURCE_MAP.autoconerprocessparameter;
      }
    }
    return SCREEN_SOURCE_MAP[aliasKey];
  }

  return null;
};

const getNumericColumns = async (tableName) => {
  const [schemaName, tableOnly] = tableName.split(".");
  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1
       AND table_name = $2
       AND data_type IN ('smallint','integer','bigint','numeric','real','double precision')
     ORDER BY ordinal_position`,
    [schemaName, tableOnly]
  );
  return result.rows.map((row) => row.column_name);
};

const getAllColumns = async (tableName) => {
  const [schemaName, tableOnly] = tableName.split(".");
  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1
       AND table_name = $2
     ORDER BY ordinal_position`,
    [schemaName, tableOnly]
  );
  return result.rows.map((row) => row.column_name);
};

const getAverageValuesForFields = async (tableName, fields) => {
  if (!Array.isArray(fields) || !fields.length) return {};
  const selectParts = fields.map((field) => `ROUND(AVG(${quoteIdent(field)})::numeric, 2) AS ${quoteIdent(field)}`);
  const result = await pool.query(`SELECT ${selectParts.join(", ")} FROM ${tableName}`);
  return result.rows[0] || {};
};

const getMappedScreenCatalog = () =>
  Object.entries(SCREEN_SOURCE_MAP).map(([key, src]) => ({
    input_screen: key,
    table: src.table,
    date_column: src.dateColumn,
  }));

const getSchemaFieldCatalog = async () => {
  const catalog = getMappedScreenCatalog();
  return Promise.all(catalog.map(async (item) => {
    const fields = await getAllColumns(item.table);
    const [schema] = item.table.split(".");
    return {
      schema,
      table: item.table,
      input_screen: item.input_screen,
      date_column: item.date_column,
      fields,
    };
  }));
};

const findCatalogForInputScreen = (inputScreen) => {
  const source = resolveSource(inputScreen);
  if (!source) return null;
  return {
    input_screen: normalizeKey(inputScreen),
    table: source.table,
    date_column: source.dateColumn,
  };
};

const resolveNumericColumn = async (tableName, requestedField) => {
  const [schemaName, tableOnly] = tableName.split(".");
  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1
       AND table_name = $2
       AND data_type IN ('smallint','integer','bigint','numeric','real','double precision')`,
    [schemaName, tableOnly]
  );

  const wanted = String(requestedField || "").trim();
  const wantedKey = normalizeKey(wanted);
  if (!wantedKey) return null;

  const exact = result.rows.find((row) => String(row.column_name).toLowerCase() === wanted.toLowerCase());
  if (exact) return exact.column_name;
  return result.rows.find((row) => normalizeKey(row.column_name) === wantedKey)?.column_name || null;
};

const validateWidget = async (widget) => {
  const department = String(widget?.department || "").trim();
  const sub_department = String(widget?.sub_department || "").trim();
  const input_screen = String(widget?.input_screen || "").trim();
  const rawInputField = String(widget?.input_field || "").trim();
  const visualization_type = String(widget?.visualization_type || "average_value_card").trim().toLowerCase();
  const enabled = widget?.enabled !== false;
  const order = Number.isInteger(widget?.order) ? widget.order : 0;
  const isTicketCountWidget =
    visualization_type === "individual_ticket_count" ||
    visualization_type === "add_ticket_count" ||
    visualization_type === "ticket_status_card";
  const metricKey = String(widget?.metric_key || widget?.ticket_metric || widget?.input_field || "").trim().toLowerCase();

  if (!isTicketCountWidget && (!department || !sub_department || !input_screen || !rawInputField)) {
    return { error: "department, sub_department, input_screen and input_field are required" };
  }
  if (!VISUAL_TYPES.has(visualization_type)) return { error: "Invalid visualization_type" };
  if (visualization_type === "ticket_status_card" && !TICKET_CARD_METRICS.has(metricKey)) {
    return { error: "ticket_status_card requires metric_key: total/open/closed/reopened/pending/overdue" };
  }

  return {
    data: {
      id: typeof widget?.id === "string" && widget.id.trim() ? widget.id.trim() : `widget-${Date.now()}`,
      department,
      sub_department,
      input_screen,
      input_field: rawInputField,
      visualization_type,
      metric_key: visualization_type === "ticket_status_card" ? metricKey : undefined,
      widget_name: String(widget?.widget_name || "").trim() || (visualization_type === "add_ticket_count" ? "Add Ticket" : undefined),
      enabled,
      order,
    },
  };
};

const getConfig = async (userId) => {
  await ensureDashboardBuilderTable();
  const result = await pool.query(
    `SELECT widgets, updated_at
     FROM users.dashboard_builder_configs
     WHERE user_id = $1`,
    [userId]
  );
  if (!result.rows.length) return { widgets: [], updated_at: null };
  return {
    widgets: Array.isArray(result.rows[0].widgets) ? result.rows[0].widgets : [],
    updated_at: result.rows[0].updated_at,
  };
};

const saveConfig = async (userId, widgets) => {
  await ensureDashboardBuilderTable();
  const result = await pool.query(
    `INSERT INTO users.dashboard_builder_configs (user_id, widgets, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id)
     DO UPDATE SET widgets = EXCLUDED.widgets, updated_at = now()
     RETURNING user_id, widgets, updated_at`,
    [userId, JSON.stringify(widgets)]
  );
  return result.rows[0];
};

const getUserPage = async (userId, pageKey = "default") => {
  await ensureUserDashboardPagesTable();
  const key = normalizePageKey(pageKey) || "default";
  const result = await pool.query(
    `SELECT user_id, page_key, page_title, widgets, is_active, created_at, updated_at
     FROM users.user_dashboard_pages
     WHERE user_id = $1 AND page_key = $2`,
    [userId, key]
  );
  if (!result.rows.length) {
    return {
      user_id: userId,
      page_key: key,
      page_title: key === "default" ? "Default Dashboard" : key,
      widgets: [],
      is_active: true,
      created_at: null,
      updated_at: null,
    };
  }
  return result.rows[0];
};

const listUserPages = async (userId) => {
  await ensureUserDashboardPagesTable();
  const result = await pool.query(
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
  const key = normalizePageKey(pageKey) || "default";
  const title = String(pageTitle || "").trim() || (key === "default" ? "Default Dashboard" : key);
  const result = await pool.query(
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

const deleteUserPage = async (userId, pageKey) => {
  await ensureUserDashboardPagesTable();
  const key = normalizePageKey(pageKey) || "default";
  const result = await pool.query(
    `DELETE FROM users.user_dashboard_pages
     WHERE user_id = $1 AND page_key = $2
     RETURNING user_id, page_key`,
    [userId, key]
  );
  return result.rows[0] || null;
};

const getTrendQuery = ({ table, dateColumn, valueColumn, period }) => {
  if (period === "1D") {
    return `
      SELECT to_char(date_trunc('hour', ${dateColumn}), 'HH24:00') AS label,
             ROUND(AVG(${valueColumn})::numeric, 2) AS value
      FROM ${table}
      WHERE ${dateColumn} >= NOW() - INTERVAL '1 day'
      GROUP BY 1, date_trunc('hour', ${dateColumn})
      ORDER BY date_trunc('hour', ${dateColumn})
    `;
  }
  if (period === "1W") {
    return `
      SELECT to_char(date_trunc('day', ${dateColumn}), 'Dy DD Mon') AS label,
             ROUND(AVG(${valueColumn})::numeric, 2) AS value
      FROM ${table}
      WHERE ${dateColumn} >= NOW() - INTERVAL '7 days'
      GROUP BY 1, date_trunc('day', ${dateColumn})
      ORDER BY date_trunc('day', ${dateColumn})
    `;
  }
  if (period === "1M") {
    return `
      SELECT to_char(date_trunc('week', ${dateColumn}), '"WK" WW') AS label,
             ROUND(AVG(${valueColumn})::numeric, 2) AS value
      FROM ${table}
      WHERE ${dateColumn} >= NOW() - INTERVAL '1 month'
      GROUP BY 1, date_trunc('week', ${dateColumn})
      ORDER BY date_trunc('week', ${dateColumn})
    `;
  }
  return `
    SELECT to_char(date_trunc('month', ${dateColumn}), 'Mon YYYY') AS label,
           ROUND(AVG(${valueColumn})::numeric, 2) AS value
    FROM ${table}
    WHERE ${dateColumn} >= NOW() - INTERVAL '1 year'
    GROUP BY 1, date_trunc('month', ${dateColumn})
    ORDER BY date_trunc('month', ${dateColumn})
  `;
};

const fetchWidgetData = async ({ widget, period = "1W", userId = null, userEmployeeId = "" }) => {
  if (
    widget?.visualization_type === "individual_ticket_count" ||
    widget?.visualization_type === "add_ticket_count" ||
    widget?.visualization_type === "ticket_status_card"
  ) {
    if (!userId) {
      return { widget_id: widget.id, filter: { period }, ticket_count: 0, status_breakdown: {}, trend: [] };
    }

    const metricKey = String(widget?.metric_key || "").toLowerCase().trim();
    const isAdmin001 = String(userEmployeeId || "").trim().toUpperCase() === "ADMIN001";
    const ticketScopeWhere = isAdmin001 ? "1=1" : "user_id = $1";
    const queryParams = isAdmin001 ? [] : [userId];
    const countQueryByMetric = {
      total: `SELECT COUNT(*)::int AS ticket_count FROM ticketing_system.operator_tickets WHERE ${ticketScopeWhere}`,
      open: `SELECT COUNT(*)::int AS ticket_count FROM ticketing_system.operator_tickets WHERE ${ticketScopeWhere} AND lower(trim(COALESCE(status, ''))) = 'open'`,
      closed: `SELECT COUNT(*)::int AS ticket_count FROM ticketing_system.operator_tickets WHERE ${ticketScopeWhere} AND lower(trim(COALESCE(status, ''))) = 'closed'`,
      reopened: `SELECT COUNT(*)::int AS ticket_count FROM ticketing_system.operator_tickets WHERE ${ticketScopeWhere} AND lower(trim(COALESCE(status, ''))) = 'reopened'`,
      pending: `SELECT COUNT(*)::int AS ticket_count FROM ticketing_system.operator_tickets WHERE ${ticketScopeWhere} AND lower(trim(COALESCE(status, ''))) = 'pending approval'`,
      overdue: `SELECT COUNT(*)::int AS ticket_count FROM ticketing_system.operator_tickets WHERE ${ticketScopeWhere} AND lower(trim(COALESCE(status, ''))) = 'no due'`,
    };
    const countSql = widget?.visualization_type === "ticket_status_card"
      ? (countQueryByMetric[metricKey] || countQueryByMetric.total)
      : countQueryByMetric.total;
    const countRes = await pool.query(countSql, queryParams);

    const statusRes = await pool.query(
      `SELECT initcap(lower(trim(COALESCE(status, '')))) AS status, COUNT(*)::int AS count
       FROM ticketing_system.operator_tickets
       WHERE ${ticketScopeWhere}
       GROUP BY lower(trim(COALESCE(status, '')))`,
      queryParams
    );

    const intervalMap = { "1D": "1 day", "1W": "7 days", "1M": "1 month", "1Y": "1 year" };
    const trendRes = await pool.query(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS label,
              COUNT(*)::int AS value
       FROM ticketing_system.operator_tickets
       WHERE ${ticketScopeWhere}
         AND created_at >= NOW() - INTERVAL '${intervalMap[period] || "7 days"}'
       GROUP BY date_trunc('day', created_at)
       ORDER BY date_trunc('day', created_at)`,
      queryParams
    );

    const status_breakdown = {};
    for (const row of statusRes.rows) status_breakdown[row.status] = row.count;

    return {
      widget_id: widget.id,
      widget_name: widget?.widget_name || (widget?.visualization_type === "add_ticket_count" ? "Add Ticket" : "Individual Ticket Count"),
      metric_key: widget?.visualization_type === "ticket_status_card" ? metricKey : "total",
      filter: { period, user_id: userId },
      ticket_count: countRes.rows[0]?.ticket_count ?? 0,
      status_breakdown,
      trend: trendRes.rows.map((row) => ({ label: row.label, value: row.value })),
    };
  }

  const source = resolveSource(widget.input_screen, {
    department: widget.department,
    sub_department: widget.sub_department,
  });
  const emptyData = {
    widget_id: widget.id,
    filter: {
      department: widget.department,
      sub_department: widget.sub_department,
      input_screen: widget.input_screen,
      input_field: widget.input_field,
      period,
    },
    average_value: null,
    latest_value: null,
    latest_at: null,
    trend: [],
  };
  if (!source) return emptyData;

  const rawInputField = String(widget.input_field || "").trim();
  const matchedColumn = await resolveNumericColumn(source.table, rawInputField);
  if (!matchedColumn) return { ...emptyData, filter: { ...emptyData.filter, input_field: rawInputField } };

  const col = quoteIdent(matchedColumn);
  const latestResult = await pool.query(
    `SELECT ${col}::numeric AS value, ${source.dateColumn} AS at
     FROM ${source.table}
     WHERE ${col} IS NOT NULL
     ORDER BY ${source.dateColumn} DESC
     LIMIT 1`
  );
  const avgResult = await pool.query(
    `SELECT ROUND(AVG(${col})::numeric, 2) AS avg_value
     FROM ${source.table}
     WHERE ${col} IS NOT NULL`
  );
  const trendResult = await pool.query(getTrendQuery({
    table: source.table,
    dateColumn: source.dateColumn,
    valueColumn: col,
    period,
  }));

  return {
    widget_id: widget.id,
    filter: { ...emptyData.filter, input_field: matchedColumn },
    average_value: avgResult.rows[0]?.avg_value ?? null,
    latest_value: latestResult.rows[0]?.value ?? null,
    latest_at: latestResult.rows[0]?.at ?? null,
    trend: trendResult.rows.map((row) => ({ label: row.label, value: row.value === null ? null : Number(row.value) })),
  };
};

const validateWidgetsPayload = async (widgetsPayload, res) => {
  if (!Array.isArray(widgetsPayload)) {
    jsonError(res, 400, "widgets must be an array");
    return null;
  }

  const widgets = [];
  for (let index = 0; index < widgetsPayload.length; index += 1) {
    const check = await validateWidget({ ...widgetsPayload[index], order: index + 1 });
    if (check.error) {
      jsonError(res, 400, check.error, { index });
      return null;
    }
    widgets.push(check.data);
  }
  return widgets;
};

const handleOptions = async (req, res) => {
  const selectedDepartment = String(req.query.department || "").trim();
  const selectedSubDepartment = String(req.query.sub_department || "").trim();
  const selectedScreen = String(req.query.input_screen || req.query.screen || "").trim();
  const effectiveDepartment = selectedDepartment || selectedSubDepartment;

  const deptRes = await pool.query(`
    SELECT name AS department
    FROM rbac.departments
    WHERE is_active = true
    ORDER BY name
  `);
  const screenRes = effectiveDepartment
    ? await pool.query(
      `SELECT s.id AS screen_id, s.name AS screen_name
       FROM rbac.screens s
       JOIN rbac.departments d ON d.id = s.department_id
       WHERE d.name = $1 AND s.is_active = true
       ORDER BY s.name`,
      [effectiveDepartment]
    )
    : await pool.query(`
      SELECT id AS screen_id, name AS screen_name
      FROM rbac.screens
      WHERE is_active = true
      ORDER BY name
    `);
  const roleRes = await pool.query(`
    SELECT DISTINCT role
    FROM users.user_details
    WHERE role IS NOT NULL AND trim(role) <> ''
    ORDER BY role
  `);
  const userRes = await pool.query(`
    SELECT id AS user_id, employee_id, full_name AS user_name, role
    FROM users.user_details
    WHERE full_name IS NOT NULL AND trim(full_name) <> ''
    ORDER BY full_name
  `);
  const subDeptRes = selectedDepartment
    ? await pool.query(
      `SELECT DISTINCT COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) AS sub_department
       FROM ticketing_system.threshold_master
       WHERE COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) = $1
         AND COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) IS NOT NULL
       ORDER BY 1`,
      [selectedDepartment]
    )
    : await pool.query(`
      SELECT DISTINCT COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) AS sub_department
      FROM ticketing_system.threshold_master
      WHERE COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) IS NOT NULL
      ORDER BY 1
    `);

  const allSchemaScreens = getMappedScreenCatalog().map((screen) => screen.input_screen);
  const subKey = normalizeKey(selectedSubDepartment);
  const scopedScreens = SUB_DEPARTMENT_SCREEN_KEYS[subKey] || allSchemaScreens;
  const inputFields = selectedScreen && resolveSource(selectedScreen, { department: selectedDepartment })
    ? await getAllColumns(resolveSource(selectedScreen, { department: selectedDepartment }).table)
    : [];

  return res.status(200).json({
    departments: deptRes.rows.map((row) => row.department),
    sub_departments: Array.from(new Set([
      ...subDeptRes.rows.map((row) => row.sub_department).filter(Boolean),
      ...ALL_SUB_DEPARTMENTS,
    ])).sort((a, b) => a.localeCompare(b)),
    screens: screenRes.rows.map((screen) => screen.screen_name),
    screen_options: screenRes.rows,
    input_screens: Array.from(new Set(scopedScreens)).sort((a, b) => a.localeCompare(b)),
    input_fields: inputFields,
    roles: roleRes.rows.map((row) => row.role),
    users: userRes.rows,
    periods: Array.from(PERIODS),
    visualization_types: Array.from(VISUAL_TYPES),
  });
};

const handleOptionsV2 = async (req, res) => {
  const selectedDepartment = String(req.query.department || "").trim();
  const selectedSubDepartment = String(req.query.sub_department || "").trim();
  const selectedScreen = String(req.query.input_screen || req.query.screen || "").trim();

  const params = [];
  const where = [
    `COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) IS NOT NULL`,
    `COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) IS NOT NULL`,
    `NULLIF(trim(input_screen), '') IS NOT NULL`,
    `NULLIF(trim(input_field), '') IS NOT NULL`,
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

  const [rowsRes, roleRes, userRes, rbacScreenRes] = await Promise.all([
    pool.query(
      `SELECT DISTINCT
         COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) AS department,
         COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) AS sub_department,
         trim(input_screen) AS input_screen,
         lower(trim(input_field)) AS input_field
       FROM ticketing_system.threshold_master
       WHERE ${where.join(" AND ")}
       ORDER BY 1, 2, 3, 4`,
      params
    ),
    pool.query(`SELECT DISTINCT role FROM users.user_details WHERE role IS NOT NULL AND trim(role) <> '' ORDER BY role`),
    pool.query(`SELECT id AS user_id, employee_id, full_name AS user_name, role FROM users.user_details WHERE full_name IS NOT NULL AND trim(full_name) <> '' ORDER BY full_name`),
    pool.query(`SELECT id AS screen_id, name AS screen_name, is_active FROM rbac.screens ORDER BY name`),
  ]);

  const depMap = new Map();
  for (const row of rowsRes.rows) {
    let depNode = depMap.get(row.department);
    if (!depNode) {
      depNode = { name: row.department, sub_departments: [], _sub: new Map() };
      depMap.set(row.department, depNode);
    }
    let subNode = depNode._sub.get(row.sub_department);
    if (!subNode) {
      subNode = { name: row.sub_department, input_screens: [], _screen: new Map() };
      depNode._sub.set(row.sub_department, subNode);
      depNode.sub_departments.push(subNode);
    }
    let screenNode = subNode._screen.get(row.input_screen);
    if (!screenNode) {
      const catalog = findCatalogForInputScreen(row.input_screen);
      screenNode = {
        input_screen: row.input_screen,
        mapped_input_screen: catalog?.input_screen || null,
        table: catalog?.table || null,
        date_column: catalog?.date_column || null,
        input_fields: [],
        _field: new Set(),
      };
      subNode._screen.set(row.input_screen, screenNode);
      subNode.input_screens.push(screenNode);
    }
    if (!screenNode._field.has(row.input_field)) {
      screenNode._field.add(row.input_field);
      screenNode.input_fields.push(row.input_field);
    }
  }

  const departments = Array.from(depMap.values()).map((department) => {
    for (const sub of department.sub_departments) {
      for (const screen of sub.input_screens) delete screen._field;
      delete sub._screen;
    }
    delete department._sub;
    return department;
  });

  return res.status(200).json({
    departments,
    sub_departments: Array.from(new Set([
      ...departments.flatMap((department) => department.sub_departments.map((sub) => sub.name)).filter(Boolean),
      ...ALL_SUB_DEPARTMENTS,
    ])).sort((a, b) => a.localeCompare(b)),
    rbac_screens: rbacScreenRes.rows.filter((screen) => screen.is_active),
    roles: roleRes.rows.map((row) => row.role),
    users: userRes.rows,
    periods: Array.from(PERIODS),
    visualization_types: Array.from(VISUAL_TYPES),
  });
};

const handleOptionsCascade = async (req, res) => {
  const department = String(req.query.department || "").trim();
  const subDepartment = String(req.query.sub_department || "").trim();
  const notebook = String(req.query.notebook || req.query.input_screen || "").trim();
  const params = [];
  const fieldWhere = [`NULLIF(trim(input_field), '') IS NOT NULL`];
  if (department) {
    params.push(department);
    fieldWhere.push(`COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) = $${params.length}`);
  }
  if (subDepartment) {
    params.push(subDepartment);
    fieldWhere.push(`COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) = $${params.length}`);
  }
  if (notebook) {
    params.push(notebook);
    fieldWhere.push(`trim(input_screen) = $${params.length}`);
  }

  const [deptRes, screenRes, subDeptRes, notebookRes, fieldRes] = await Promise.all([
    pool.query(`
      SELECT DISTINCT COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) AS department
      FROM ticketing_system.threshold_master
      WHERE COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) IS NOT NULL
      ORDER BY 1
    `),
    department
      ? pool.query(
        `SELECT s.id AS screen_id, s.name AS screen_name, s.is_active
         FROM rbac.screens s
         JOIN rbac.departments d ON d.id = s.department_id
         WHERE d.name = $1 AND s.is_active = true
         ORDER BY s.name`,
        [department]
      )
      : pool.query(`SELECT s.id AS screen_id, s.name AS screen_name, s.is_active FROM rbac.screens s WHERE s.is_active = true ORDER BY s.name`),
    department
      ? pool.query(
        `SELECT DISTINCT COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) AS sub_department
         FROM ticketing_system.threshold_master
         WHERE COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) = $1
           AND COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) IS NOT NULL
         ORDER BY 1`,
        [department]
      )
      : pool.query(`
        SELECT DISTINCT COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) AS sub_department
        FROM ticketing_system.threshold_master
        WHERE COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) IS NOT NULL
        ORDER BY 1
      `),
    pool.query(
      `SELECT DISTINCT trim(input_screen) AS notebook
       FROM ticketing_system.threshold_master
       WHERE NULLIF(trim(input_screen), '') IS NOT NULL
         ${department ? `AND COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) = $1` : ""}
         ${department && subDepartment ? `AND COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) = $2` : ""}
       ORDER BY 1`,
      department ? (subDepartment ? [department, subDepartment] : [department]) : []
    ),
    pool.query(
      `SELECT DISTINCT lower(trim(input_field)) AS input_field
       FROM ticketing_system.threshold_master
       WHERE ${fieldWhere.join(" AND ")}
       ORDER BY 1`,
      params
    ),
  ]);

  const schemaCatalog = await getSchemaFieldCatalog();
  const schemaFieldsAll = Array.from(new Set(schemaCatalog.flatMap((screen) => screen.fields))).sort((a, b) => a.localeCompare(b));
  const resolvedSource = notebook ? resolveSource(notebook, { department, sub_department: subDepartment }) : null;
  const tableFields = resolvedSource ? await getAllColumns(resolvedSource.table) : [];

  return res.status(200).json({
    departments: deptRes.rows.map((row) => row.department),
    screens: screenRes.rows,
    sub_departments: Array.from(new Set([
      ...subDeptRes.rows.map((row) => row.sub_department).filter(Boolean),
      ...ALL_SUB_DEPARTMENTS,
    ])).sort((a, b) => a.localeCompare(b)),
    notebooks: Array.from(new Set([
      ...notebookRes.rows.map((row) => row.notebook),
      ...schemaCatalog.map((screen) => screen.input_screen),
    ])).sort((a, b) => a.localeCompare(b)),
    input_fields: Array.from(new Set([
      ...fieldRes.rows.map((row) => row.input_field),
      ...(notebook ? tableFields : schemaFieldsAll),
    ])).sort((a, b) => a.localeCompare(b)),
    field_source: resolvedSource ? {
      input_screen: notebook,
      table: resolvedSource.table,
      date_column: resolvedSource.dateColumn,
    } : null,
    schema_fields: schemaCatalog,
    selected: {
      department: department || null,
      sub_department: subDepartment || null,
      notebook: notebook || null,
    },
  });
};

const handleOptionsMatch = async (req, res) => {
  const department = String(req.query.department || "").trim();
  const inputScreen = String(req.query.input_screen || req.query.notebook || "").trim();
  const subDepartment = String(req.query.sub_department || "").trim();

  const [userRes, roleRes] = await Promise.all([
    pool.query(`SELECT id AS user_id, employee_id, full_name AS user_name, role FROM users.user_details WHERE full_name IS NOT NULL AND trim(full_name) <> '' ORDER BY full_name`),
    pool.query(`SELECT DISTINCT role FROM users.user_details WHERE role IS NOT NULL AND trim(role) <> '' ORDER BY role`),
  ]);

  if (!department) {
    const rbacDeptRes = await pool.query(`SELECT DISTINCT name AS department FROM rbac.departments WHERE is_active = true ORDER BY 1`);
    return res.status(200).json({
      departments: rbacDeptRes.rows.map((row) => row.department),
      roles: roleRes.rows.map((row) => row.role),
      users: userRes.rows,
      selected: { department: null, input_screen: null, sub_department: null },
    });
  }

  if (!inputScreen) {
    const screensRes = await pool.query(
      `SELECT s.id AS screen_id, s.name AS screen_name, s.is_active
       FROM rbac.screens s
       JOIN rbac.departments d ON d.id = s.department_id
       WHERE d.name = $1 AND s.is_active = true
       ORDER BY s.name`,
      [department]
    );
    return res.status(200).json({
      department,
      screens: screensRes.rows,
      sub_departments: ALL_SUB_DEPARTMENTS,
      input_screens: Array.from(new Set(getMappedScreenCatalog().map((screen) => screen.input_screen))).sort((a, b) => a.localeCompare(b)),
      roles: roleRes.rows.map((row) => row.role),
      users: userRes.rows,
      selected: { department, input_screen: null, sub_department: subDepartment || null },
    });
  }

  const source = resolveSource(inputScreen, { department, sub_department: subDepartment });
  const tableFields = source ? await getAllColumns(source.table) : [];
  const numericTableFields = source ? await getNumericColumns(source.table) : [];
  const inputFields = Array.from(new Set(tableFields)).sort((a, b) => a.localeCompare(b));
  const numericInputFields = inputFields.filter((field) => numericTableFields.includes(field));

  return res.status(200).json({
    department,
    sub_department: subDepartment || null,
    input_screen: inputScreen,
    mapped_table: source?.table || null,
    date_column: source?.dateColumn || null,
    input_fields: inputFields,
    numeric_input_fields: numericInputFields,
    input_values_average: source && numericInputFields.length ? await getAverageValuesForFields(source.table, numericInputFields) : {},
    roles: roleRes.rows.map((row) => row.role),
    users: userRes.rows,
    selected: { department, input_screen: inputScreen, sub_department: subDepartment || null },
  });
};

const handleGetWidgets = async (req, res, userIdParam) => {
  const userId = parseUserId(userIdParam);
  if (!userId) return jsonError(res, 400, "Valid userId is required");
  if (!ensureDashboardAccess(req, res, userId)) return null;
  const config = await getConfig(userId);
  if (!config.widgets?.length) {
    const defaultPage = await getUserPage(userId, "default");
    if (Array.isArray(defaultPage.widgets) && defaultPage.widgets.length) {
      return res.status(200).json({ user_id: userId, widgets: defaultPage.widgets, updated_at: defaultPage.updated_at });
    }
  }
  return res.status(200).json({ user_id: userId, ...config });
};

const handleSaveWidgets = async (req, res, userIdParam) => {
  if (!canManageDashboards(req)) return jsonError(res, 403, "Read-only access: employees can only view dashboard");
  const userId = parseUserId(userIdParam);
  if (!userId) return jsonError(res, 400, "Valid userId is required");
  if (!ensureDashboardAccess(req, res, userId)) return null;
  const widgets = await validateWidgetsPayload(req.body?.widgets, res);
  if (!widgets) return null;
  const saved = await saveConfig(userId, widgets);
  return res.status(200).json({
    message: "Dashboard builder widgets saved successfully",
    user_id: saved.user_id,
    widgets: saved.widgets,
    updated_at: saved.updated_at,
  });
};

const handleReorderWidgets = async (req, res, userIdParam) => {
  if (!canManageDashboards(req)) return jsonError(res, 403, "Read-only access: employees can only view dashboard");
  const userId = parseUserId(userIdParam);
  const orderedIds = Array.isArray(req.body?.widget_ids) ? req.body.widget_ids : [];
  if (!userId) return jsonError(res, 400, "Valid userId is required");
  if (!ensureDashboardAccess(req, res, userId)) return null;
  if (!orderedIds.length) return jsonError(res, 400, "widget_ids must be a non-empty array");

  const config = await getConfig(userId);
  const byId = new Map(config.widgets.map((widget) => [widget.id, widget]));
  const reordered = [];
  orderedIds.forEach((id, index) => {
    const widget = byId.get(id);
    if (widget) reordered.push({ ...widget, order: index + 1 });
    byId.delete(id);
  });
  for (const widget of byId.values()) reordered.push({ ...widget, order: reordered.length + 1 });
  const saved = await saveConfig(userId, reordered);
  return res.status(200).json({ message: "Widget order updated", widgets: saved.widgets, updated_at: saved.updated_at });
};

const handleToggleWidget = async (req, res, userIdParam, widgetIdParam) => {
  if (!canManageDashboards(req)) return jsonError(res, 403, "Read-only access: employees can only view dashboard");
  const userId = parseUserId(userIdParam);
  const widgetId = normalizeWidgetId(widgetIdParam);
  if (!userId || !widgetId) return jsonError(res, 400, "Valid userId and widgetId are required");
  if (!ensureDashboardAccess(req, res, userId)) return null;
  const config = await getConfig(userId);
  const widgets = config.widgets.map((widget) => (normalizeWidgetId(widget.id) === widgetId ? { ...widget, enabled: !widget.enabled } : widget));
  const saved = await saveConfig(userId, widgets);
  return res.status(200).json({ message: "Widget toggled", widgets: saved.widgets, updated_at: saved.updated_at });
};

const handleDeleteWidget = async (req, res, userIdParam, widgetIdParam) => {
  if (!canManageDashboards(req)) return jsonError(res, 403, "Read-only access: employees can only view dashboard");
  const userId = parseUserId(userIdParam);
  const widgetId = normalizeWidgetId(widgetIdParam);
  if (!userId || !widgetId) return jsonError(res, 400, "Valid userId and widgetId are required");
  if (!ensureDashboardAccess(req, res, userId)) return null;
  const config = await getConfig(userId);
  const before = config.widgets.length;
  const widgets = config.widgets
    .filter((widget) => normalizeWidgetId(widget.id) !== widgetId)
    .map((widget, index) => ({ ...widget, order: index + 1 }));
  if (before === widgets.length) return jsonError(res, 404, `Widget not found: ${widgetId}`);
  const saved = await saveConfig(userId, widgets);
  return res.status(200).json({ message: "Widget deleted", widgets: saved.widgets, updated_at: saved.updated_at });
};

const handleBuilderData = async (req, res) => {
  const department = String(req.query.department || "").trim();
  const sub_department = String(req.query.sub_department || "").trim();
  const input_screen = String(req.query.input_screen || "").trim();
  const rawInputField = String(req.query.input_field || "").trim();
  const period = String(req.query.period || "1W").toUpperCase();
  if (!department || !sub_department || !input_screen || !rawInputField) {
    return jsonError(res, 400, "department, sub_department, input_screen and input_field are required");
  }
  if (!PERIODS.has(period)) return jsonError(res, 400, "period must be one of 1D, 1W, 1M, 1Y");

  const data = await fetchWidgetData({
    widget: {
      id: "preview",
      department,
      sub_department,
      input_screen,
      input_field: rawInputField,
      visualization_type: "average_value_card",
    },
    period,
  });
  const { widget_id: _widgetId, ...payload } = data;
  return res.status(200).json(payload);
};

const handleMyDashboardPage = async (req, res) => {
  const userId = parseUserId(req.user?.id);
  if (!userId) return jsonError(res, 401, "Authentication required");
  const period = String(req.query.period || "1W").toUpperCase();
  if (!PERIODS.has(period)) return jsonError(res, 400, "period must be one of 1D, 1W, 1M, 1Y");
  const config = await getConfig(userId);
  const widgets = (config.widgets || [])
    .filter((widget) => widget?.enabled !== false)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const data = [];
  for (const widget of widgets) {
    data.push(await fetchWidgetData({ widget, period, userId, userEmployeeId: req.user?.employee_id }));
  }
  return res.status(200).json({ user_id: userId, updated_at: config.updated_at, widgets, data });
};

const handleGetMyWidgets = async (req, res) => {
  const userId = parseUserId(req.user?.id);
  if (!userId) return jsonError(res, 401, "Authentication required");
  const config = await getConfig(userId);
  return res.status(200).json({ user_id: userId, ...config });
};

const handleSaveMyWidgets = async (req, res) => {
  const userId = parseUserId(req.user?.id);
  if (!userId) return jsonError(res, 401, "Authentication required");
  const widgets = await validateWidgetsPayload(req.body?.widgets, res);
  if (!widgets) return null;
  const saved = await saveConfig(userId, widgets);
  return res.status(200).json({
    message: "My dashboard widgets saved successfully",
    user_id: saved.user_id,
    widgets: saved.widgets,
    updated_at: saved.updated_at,
  });
};

const handleListMyPages = async (req, res) => {
  const userId = parseUserId(req.user?.id);
  if (!userId) return jsonError(res, 401, "Authentication required");
  return res.status(200).json({ user_id: userId, pages: await listUserPages(userId) });
};

const handleGetMyPage = async (req, res, pageKey = "default") => {
  const userId = parseUserId(req.user?.id);
  if (!userId) return jsonError(res, 401, "Authentication required");
  return res.status(200).json(await getUserPage(userId, pageKey));
};

const handleGetMyPageData = async (req, res, pageKey = "default") => {
  const userId = parseUserId(req.user?.id);
  if (!userId) return jsonError(res, 401, "Authentication required");
  const period = String(req.query.period || "1W").toUpperCase();
  if (!PERIODS.has(period)) return jsonError(res, 400, "period must be one of 1D, 1W, 1M, 1Y");
  const page = await getUserPage(userId, pageKey);
  const widgets = (page.widgets || [])
    .filter((widget) => widget?.enabled !== false)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const data = [];
  for (const widget of widgets) {
    data.push(await fetchWidgetData({ widget, period, userId, userEmployeeId: req.user?.employee_id }));
  }
  return res.status(200).json({
    user_id: userId,
    page_key: page.page_key,
    page_title: page.page_title,
    updated_at: page.updated_at,
    widgets,
    data,
  });
};

const handleSaveMyPage = async (req, res, pageKey = "default") => {
  if (!canManageDashboards(req)) return jsonError(res, 403, "Read-only access: employees can only view dashboard");
  const userId = parseUserId(req.user?.id);
  if (!userId) return jsonError(res, 401, "Authentication required");
  const widgets = await validateWidgetsPayload(req.body?.widgets, res);
  if (!widgets) return null;
  const saved = await saveUserPage(userId, pageKey, req.body?.page_title || null, widgets, req.body?.is_active !== false);
  await saveConfig(userId, widgets);
  return res.status(200).json({ message: "Dashboard page saved successfully", page: saved });
};

const handleDeleteMyPage = async (req, res, pageKey) => {
  if (!canManageDashboards(req)) return jsonError(res, 403, "Read-only access: employees can only view dashboard");
  const userId = parseUserId(req.user?.id);
  if (!userId) return jsonError(res, 401, "Authentication required");
  if (!String(pageKey || "").trim()) return jsonError(res, 400, "Valid pageKey is required");
  if (normalizePageKey(pageKey) === "default") return jsonError(res, 400, "default page cannot be deleted");
  const deleted = await deleteUserPage(userId, pageKey);
  if (!deleted) return jsonError(res, 404, "Page not found");
  return res.status(200).json({ message: "Dashboard page deleted", page: deleted });
};

const handleAssignPageToUser = async (req, res, userIdParam, pageKey = "default") => {
  if (!canManageDashboards(req)) return jsonError(res, 403, "Only ADMIN001 can assign dashboard pages to other users");
  const targetUserId = parseUserId(userIdParam);
  if (!targetUserId) return jsonError(res, 400, "Valid userId is required");
  const widgets = await validateWidgetsPayload(req.body?.widgets, res);
  if (!widgets) return null;
  const saved = await saveUserPage(targetUserId, pageKey, req.body?.page_title || null, widgets, req.body?.is_active !== false);
  await saveConfig(targetUserId, widgets);
  return res.status(200).json({ message: "Dashboard page assigned successfully", page: saved });
};

const dispatchRoute = async (req, res, parts) => {
  const method = String(req.method || "").toUpperCase();
  const [root, second, third, fourth, fifth] = parts;

  if ((root === "builder" || root === "dashbuilder") && second === "options" && method === "GET") {
    if (third === "v2") return handleOptionsV2(req, res);
    if (third === "cascade" || third === "all") return handleOptionsCascade(req, res);
    if (third === "match") return handleOptionsMatch(req, res);
    if (!third) return handleOptions(req, res);
  }

  if (root === "builder" && second === "widgets") {
    if (method === "GET" && third) return handleGetWidgets(req, res, third);
    if (method === "POST" && third) return handleSaveWidgets(req, res, third);
    if (method === "PATCH" && fourth === "reorder") return handleReorderWidgets(req, res, third);
    if (method === "PATCH" && fifth === "toggle") return handleToggleWidget(req, res, third, fourth);
    if (method === "DELETE" && fourth) return handleDeleteWidget(req, res, third, fourth);
  }

  if (root === "builder" && third === "widgets" && method === "DELETE") {
    return handleDeleteWidget(req, res, second, fourth);
  }

  if (root === "dashbuilder") {
    if (method === "GET" && third === "widgets") return handleGetWidgets(req, res, second);
    if (method === "POST" && (third === "add-widget" || third === "add-ticket")) return handleSaveWidgets(req, res, second);
    if (method === "PATCH" && third === "reorder-widgets") return handleReorderWidgets(req, res, second);
    if (method === "PATCH" && third === "widgets" && fifth === "toggle") return handleToggleWidget(req, res, second, fourth);
    if (method === "DELETE" && third === "widgets") return handleDeleteWidget(req, res, second, fourth);
    if (method === "GET" && second === "data") return handleBuilderData(req, res);
    if (method === "GET" && second === "my-page") return handleMyDashboardPage(req, res);
    if (method === "POST" && second === "pages" && third === "assign") return handleAssignPageToUser(req, res, fourth, fifth);
    if (method === "GET" && second === "pages" && third === "my" && fifth === "data") return handleGetMyPageData(req, res, fourth);
  }

  if (root === "builder" && second === "data" && method === "GET") return handleBuilderData(req, res);
  if (root === "builder" && second === "my-page" && method === "GET") return handleMyDashboardPage(req, res);
  if (root === "my-widgets" && method === "GET") return handleGetMyWidgets(req, res);
  if (root === "my-widgets" && method === "POST") return handleSaveMyWidgets(req, res);
  if ((root === "my-dashboard" || root === "page") && method === "GET") return handleMyDashboardPage(req, res);

  if (root === "pages" && second === "my") {
    if (!third && method === "GET") return handleListMyPages(req, res);
    if (third && !fourth && method === "GET") return handleGetMyPage(req, res, third);
    if (third && fourth === "data" && method === "GET") return handleGetMyPageData(req, res, third);
    if (third && !fourth && method === "POST") return handleSaveMyPage(req, res, third);
    if (third && !fourth && method === "DELETE") return handleDeleteMyPage(req, res, third);
  }

  if (root === "pages" && second === "assign" && method === "POST") {
    return handleAssignPageToUser(req, res, third, fourth);
  }

  return jsonError(res, 404, "Dashboard route not found");
};

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "GET, POST, PATCH, DELETE, OPTIONS");
    return res.status(204).end();
  }

  req.user = await getRequestUser(req);
  if (!req.user) return jsonError(res, 401, "Authentication required");

  const parts = Array.isArray(req.query?.path)
    ? req.query.path.map((part) => String(part || "").trim()).filter(Boolean)
    : [];

  try {
    return await dispatchRoute(req, res, parts);
  } catch (error) {
    return res.status(500).json({
      message: error?.message || "Dashboard API request failed",
    });
  }
}

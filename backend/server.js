const express = require('express');
const app = express();
require('./utils/logging');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swaggerConfig');     
const cors = require('cors');
const db = require('./connection');
const { isDatabaseAccessDenied } = require('./utils/prepVariety');
const auth = require('./middleware/auth');

// --- Emergent compatibility shim ---
// Strip the "/api" prefix from incoming requests so existing routes
// (mounted at "/auth", "/users", etc.) work behind Emergent's Kubernetes
// ingress (which only forwards "/api/*" traffic to the backend).
// Local dev (without /api) is unaffected.
app.use((req, res, next) => {
  if (req.url === '/api') {
    req.url = '/';
  } else if (req.url.startsWith('/api/')) {
    req.url = req.url.slice(4);
  }
  next();
});

app.use(cors({
  origin: (origin, callback) => {
    // Read allowlist from env each request so config changes take effect on restart.
    const raw = (process.env.CORS_ORIGINS || '').trim();
    const allowed = raw
      ? raw.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    // No Origin header (curl, server-to-server, same-origin) → always allow.
    if (!origin) return callback(null, true);

    // Empty allowlist → permissive (dev convenience). Set CORS_ORIGINS in prod.
    if (allowed.length === 0) return callback(null, true);

    const ok = allowed.some(rule => {
      if (rule === '*') return true;
      if (rule.startsWith('*.')) {
        // Wildcard subdomain rule, e.g. "*.web.app" matches "https://foo.web.app"
        const suffix = rule.slice(1); // ".web.app"
        try {
          const host = new URL(origin).host;
          return host.endsWith(suffix.slice(1)) || origin.endsWith(suffix);
        } catch (_) {
          return origin.endsWith(suffix);
        }
      }
      return origin === rule;
    });

    if (ok) return callback(null, true);
    return callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  credentials: true
}));
app.use(db.withRequestContext);

app.use(express.json({ limit: '10mb' }));

const DEPARTMENT_ROUTE_PREFIXES = [
  '/spinning',
  '/mixing',
  '/comber',
  '/carding',
  '/blowroom',
  '/drawframe',
  '/simplex',
  '/autoconer'
];

const FRONTEND_ENTRY_ID_KEYS = [
  'entry_id',
  'waste_study_id',
  'trial_id_name'
];

const normalizeEntryRoutePath = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const path = text.startsWith('/') ? text : `/${text}`;
  const withoutApi = path.startsWith('/api/') ? path.slice(4) : path;
  return withoutApi.split(/[?#]/)[0];
};

const getRequestRoutePath = (req) => {
  const combinedPath = `${String(req?.baseUrl || '')}${String(req?.path || '')}`;
  return normalizeEntryRoutePath(combinedPath || req?.originalUrl || req?.path || '');
};

const getEntryModuleName = (routePath) =>
  DEPARTMENT_ROUTE_PREFIXES.find((prefix) => routePath.startsWith(prefix))?.slice(1) || 'unknown';

const formatNextEntryId = (value) => String(value).padStart(4, '0');

const normalizePoolKey = (value) => {
  const text = String(value || '').trim();
  return text || '';
};

const getEntryPoolName = (source, routePath) =>
  normalizePoolKey(
    source.pool_id ||
    source.pool_key ||
    source.scope ||
    source.screen_key ||
    source.screen_type ||
    source.screen_name ||
    source.process_type ||
    source.route_name ||
    source.module_name ||
    source.module ||
    source.moduleName ||
    getEntryModuleName(routePath)
  );

const ENTRY_ID_ROUTE_TABLES = {
  '/autoconer/q2': 'autoconer.autoconer_q2_inspection',
  '/autoconer/q3': 'autoconer.autoconer_q3_inspection',
  '/mixing/cotton-hvi': 'mixing.cotton_hvi_data_entry',
  '/spinning/cots-checking': 'spinning.cots_checking',
  '/drawframe/wheel-change': 'drawframe.wheel_change',
  '/drawframe/wheel-change/type1': 'drawframe.wheel_change',
  '/drawframe/wheel-change/type2': 'drawframe.wheel_change',
  '/drawframe/wheel-change/type3': 'drawframe.wheel_change',
  '/drawframe/a-percent': 'wrapping.a_percent',
  '/drawframe/stretch-percent': 'wrapping.stretch_percent',
  '/drawframe/stretch-percentage': 'wrapping.stretch_percent',
  '/drawframe/comber-noil-percent': 'wrapping.comber_noil_percent',
  '/drawframe/noil-percent': 'wrapping.comber_noil_percent',
  '/drawframe/noils-percent': 'wrapping.comber_noil_percent',
  '/carding/nre': 'carding.nre'
};

// Routes whose entry_id is generated straight off their own table's MAX(entry_id) (see
// getRouteTableName below) rather than the shared ticketing_system registry — these always get
// a freshly generated id, even if the frontend already sent one.
const DIRECT_TABLE_ENTRY_ID_ROUTES = new Set(Object.keys(ENTRY_ID_ROUTE_TABLES));

const getRouteTableName = (routePath, source = {}) => {
  if (routePath === '/autoconer') {
    const scope = normalizePoolKey(
      source.scope ||
      source.entry_scope ||
      source.pool_id ||
      source.pool_key
    );
    if (scope === 'q2' || scope === 'pp-q2' || scope === 'ppautoconerq2' || scope === 'pp-autoconer-q2') {
      return 'autoconer.autoconer_q2_inspection';
    }
    if (scope === 'q3' || scope === 'pp-q3' || scope === 'ppautoconerq3' || scope === 'pp-autoconer-q3') {
      return 'autoconer.autoconer_q3_inspection';
    }
  }

  return ENTRY_ID_ROUTE_TABLES[routePath] || null;
};

const ENTRY_ID_ROUTE_PREFIXES = {
  '/autoconer/q2': { prefix: 'PP', width: 4, separator: '-' },
  '/autoconer/q3': { prefix: 'PP', width: 4, separator: '-' },
  '/carding/nre': { prefix: 'CNRE', width: 4, separator: '-' }
};

// The 9 backend tables that share ONE canonical PP-000n id across departments (the
// "Process Parameter" screens). If the frontend ever submits one of these routes without
// an entry_id, the fallback below must generate the next PP-000n id from the combined max
// across ALL of these tables — never a bare unprefixed number scoped to just one table,
// which is what caused ids like "0012"/"0007" to leak into the shared PP-000n scheme.
const PP_SHARED_TABLES = [
  'mixing.mixing_qc_header',
  'blowroom.blowroom_header',
  'carding.carding_qc_header',
  'drawframe.drawframe_qc_header',
  'simplex.simplex_process_parameter',
  'spinning.spinning_qc_header',
  'autoconer.autoconer_process_parameter',
  'autoconer.autoconer_q2_inspection',
  'autoconer.autoconer_q3_inspection'
];

const PP_SHARED_ROUTES = new Set([
  '/mixing/qc',
  '/blowroom/header',
  '/blowroom/process-parameter',
  '/blowroom/process_parameter',
  '/carding/qc-header',
  '/drawframe/header',
  '/simplex/process_parameter',
  '/spinning/qc',
  '/autoconer/process',
  '/autoconer/q2',
  '/autoconer/q3'
]);

const PP_SHARED_PREFIX = { prefix: 'PP', width: 4, separator: '-' };

const getCombinedPpEntryIdMax = async () => {
  let max = 0;
  for (const tableName of PP_SHARED_TABLES) {
    const tableMax = await getTableEntryIdMax(tableName);
    if (tableMax > max) max = tableMax;
  }
  return max;
};

const getRegisteredEntryIdMaxSql = `
  SELECT COALESCE(
    MAX(NULLIF(regexp_replace(entry_id, '\\D', '', 'g'), '')::bigint),
    0
  ) AS max_number
  FROM ticketing_system.frontend_entry_registry
  WHERE route_path = $1
    AND module_name = $2
`;

const getTableEntryIdMax = async (tableName) => {
  if (!tableName) return 0;
  const [schemaName, relationName] = tableName.split('.');
  const columnResult = await db.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = $1
       AND table_name = $2
       AND column_name = 'entry_id'
     LIMIT 1`,
    [schemaName, relationName]
  );
  if (!columnResult.rowCount) return 0;

  const result = await db.query(
    `SELECT COALESCE(
       MAX(NULLIF(regexp_replace(entry_id, '\\D', '', 'g'), '')::bigint),
       0
     ) AS max_number
     FROM ${tableName}`
  );
  return Number(result.rows[0]?.max_number || 0);
};

const extractFrontendEntryId = (body) => {
  if (!body || typeof body !== 'object') return '';
  for (const key of FRONTEND_ENTRY_ID_KEYS) {
    const value = String(body[key] ?? '').trim();
    if (value) return value;
  }
  return '';
};

const getNextEntryIdForRoute = async ({ routePath, moduleName }) => {
  if (PP_SHARED_ROUTES.has(routePath)) {
    const combinedMax = await getCombinedPpEntryIdMax();
    const nextNumber = combinedMax + 1;
    const entryId = `${PP_SHARED_PREFIX.prefix}${PP_SHARED_PREFIX.separator}${String(nextNumber).padStart(PP_SHARED_PREFIX.width, '0')}`;
    return {
      source: 'postgres',
      module_name: moduleName,
      route_path: routePath,
      next_number: nextNumber,
      entry_id: entryId,
      value: entryId
    };
  }

  const mappedTable = ENTRY_ID_ROUTE_TABLES[routePath];
  const tableMax = mappedTable ? await getTableEntryIdMax(mappedTable) : 0;
  const registryResult = mappedTable ? null : await db.query(getRegisteredEntryIdMaxSql, [routePath, moduleName]);
  const registryMax = Number(registryResult?.rows[0]?.max_number || 0);
  const nextNumber = (mappedTable ? tableMax : Math.max(registryMax, tableMax)) + 1;
  const routePrefix = ENTRY_ID_ROUTE_PREFIXES[routePath];
  const entryId = routePrefix
    ? `${routePrefix.prefix}${routePrefix.separator}${String(nextNumber).padStart(routePrefix.width, '0')}`
    : formatNextEntryId(nextNumber);

  return {
    source: 'postgres',
    module_name: moduleName,
    route_path: routePath,
    next_number: nextNumber,
    entry_id: entryId,
    value: entryId
  };
};

const sendNextEntryId = async (req, res, next) => {
  try {
    const source = req.method === 'GET' ? req.query : { ...(req.query || {}), ...(req.body || {}) };
    const routePath = normalizeEntryRoutePath(source.route_path || source.path || source.screen_path || source.routePath);
    const moduleName = getEntryPoolName(source, routePath);

    if (!routePath) {
      return res.status(400).json({ message: 'route_path is required' });
    }

    return res.status(200).json(await getNextEntryIdForRoute({ routePath, moduleName }));
  } catch (error) {
    next(error);
  }
};

app.get(['/entry-id/next', '/entry-ids/next', '/frontend-entry-id/next'], sendNextEntryId);
app.post(['/entry-id/next', '/entry-ids/next', '/frontend-entry-id/next'], sendNextEntryId);

app.use(async (req, res, next) => {
  try {
    if (req.method !== 'POST') return next();

    const routePath = getRequestRoutePath(req);
    const isDepartmentRoute = DEPARTMENT_ROUTE_PREFIXES.some((prefix) => routePath.startsWith(prefix));
    if (!isDepartmentRoute) return next();

    const moduleName = getEntryPoolName(req.body || {}, routePath);
    const isDirectTableRoute = DIRECT_TABLE_ENTRY_ID_ROUTES.has(routePath);
    let entryId = extractFrontendEntryId(req.body);
    const forceGeneratedEntryId = isDirectTableRoute;
    if (forceGeneratedEntryId || !entryId) {
      const nextEntry = await getNextEntryIdForRoute({ routePath, moduleName });
      entryId = nextEntry.entry_id;
      req.body.entry_id = entryId;
    }

    if (isDirectTableRoute) {
      req.frontendEntryId = entryId;
      return next();
    }

    let reserved = false;
    for (let attempt = 0; attempt < 3 && !reserved; attempt += 1) {
      try {
        await db.query(
          `INSERT INTO ticketing_system.frontend_entry_registry
           (entry_id, module_name, route_path, method, status)
           VALUES ($1, $2, $3, $4, 'reserved')`,
          [entryId, moduleName, routePath, req.method]
        );
        reserved = true;
      } catch (error) {
        if (!error || error.code !== '23505' || attempt === 2) {
          throw error;
        }
        const nextEntry = await getNextEntryIdForRoute({ routePath, moduleName });
        entryId = nextEntry.entry_id;
        req.body.entry_id = entryId;
      }
    }

    req.frontendEntryId = entryId;

    res.on('finish', async () => {
      if (!req.frontendEntryId) return;
      try {
        if (res.statusCode >= 400) {
          await db.query(
            `DELETE FROM ticketing_system.frontend_entry_registry
             WHERE entry_id = $1 AND status = 'reserved'`,
            [req.frontendEntryId]
          );
        } else {
          await db.query(
            `UPDATE ticketing_system.frontend_entry_registry
             SET status = 'committed', committed_at = NOW()
             WHERE entry_id = $1`,
            [req.frontendEntryId]
          );
        }
      } catch (_) {
        // intentionally ignored
      }
    });

    return next();
  } catch (error) {
    if (error && error.code === '23505') {
      return res.status(409).json({
        message: 'Duplicate entry_id. Please use a unique ID provided by frontend.'
      });
    }
    return next(error);
  }
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const { router: operatorTicketRoutes, checkSubmissionFrequencyTickets } = require('./routes/operatorTickets.routes');
const supervisorTicketRoutes = require('./routes/supervisorTickets.routes');
const processParametersRouter = require('./routes/processParameters');
const userRouter = require('./routes/user.routes');
const emailVerificationRouter = require('./routes/emailVerification');
const { router: emailLogsRouter } = require('./routes/emailVerificationLogs');
const phoneVerificationRouter = require('./routes/phoneVerification');
const loginRouter = require('./routes/login');
const adminRouter = require('./routes/admin');
const dashboardRouter = require('./routes/dashboard');
const analysisRouter = require('./routes/analysis.routes');
const { router: activityLogsRouter, createActivityLog } = require('./routes/activityLogs.routes');
const helpContentRouter = require('./routes/helpContent.routes');
const inAppNotificationsRouter = require('./routes/inAppNotifications.routes');
const supervisorAssignmentsRouter = require('./routes/supervisorAssignments.routes');
const { router: submittedNotebooksRouter, generateOverdueNotebookTickets, generatePpNotebookBatchIncompleteTickets } = require('./routes/submittedNotebooks.routes');
const { router: ppThresholdRouter } = require('./routes/ppThreshold.routes');
const { router: reportSchedulesRouter, startReportScheduleWorker } = require('./routes/reportSchedules.routes');
const ocrMachineRouter = require('./routes/ocrMachine.routes');

// Public routes (no auth)
app.use('/auth', loginRouter);
app.use('/admin', adminRouter);
app.use('/email-otp', emailVerificationRouter);
app.use('/phone-verification', phoneVerificationRouter);
app.use('/ocr-machine', ocrMachineRouter);
app.use('/ocr-json', (req, res, next) => {
  req.url = `/api/ocr-json${req.url === '/' ? '' : req.url}`;
  return ocrMachineRouter(req, res, next);
});

const ACTIVITY_LOG_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const getActivityModuleName = (path) => {
  const firstSegment = String(path || '').split('/').filter(Boolean)[0] || 'system';
  return firstSegment.replace(/^api$/i, '').replace(/[-_]+/g, ' ') || 'system';
};

const getActivityActionName = (req) => {
  const method = String(req.method || '').toUpperCase();
  if (method === 'POST') return 'Created';
  if (method === 'PUT' || method === 'PATCH') return 'Updated';
  if (method === 'DELETE') return 'Deleted';
  return method || 'Activity';
};

// Everything below requires a valid JWT. Keep this before activity logging so
// logs can show the real user instead of an anonymous/system entry.
app.use(auth);

app.use((req, res, next) => {
  const method = String(req.method || '').toUpperCase();
  const path = String(req.originalUrl || req.url || '');
  if (!ACTIVITY_LOG_METHODS.has(method) || path.includes('/activity-logs')) {
    return next();
  }

  res.on('finish', () => {
    if (res.statusCode >= 400) return;

    const moduleName = getActivityModuleName(path || req.path);
    const actionName = getActivityActionName(req);
    const userId = Number.isInteger(Number(req.user?.id)) ? Number(req.user.id) : null;
    const metadata = {
      method,
      path,
      route_path: req.path || null,
      params: req.params || {},
      query: req.query || {},
      status_code: res.statusCode,
      notebook_type: req.body?.notebook_type || req.body?.notebook || req.body?.input_screen || moduleName,
      sub_department: req.body?.sub_department || req.body?.subDepartment || req.body?.management_field || req.body?.department || null
    };

    createActivityLog({
      userId,
      userName: req.user?.full_name || req.user?.user_name || req.user?.username || null,
      employeeId: req.user?.employee_id || null,
      module: moduleName,
      action: actionName,
      description: `${actionName} ${moduleName}`,
      metadata,
      ipAddress: req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || null,
      userAgent: req.headers['user-agent'] || null
    }).catch((error) => {
      console.warn('[activity-logs] failed to write activity log:', error.message);
    });
  });

  return next();
});

app.use('/operator-tickets', operatorTicketRoutes);
app.use('/api/supervisor-tickets', supervisorTicketRoutes);
app.use('/supervisor-tickets', supervisorTicketRoutes);
app.use('/users', userRouter);
app.use('/email-verification-logs', emailLogsRouter);
app.use('/dashboard', dashboardRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/dashboard-settings', dashboardRouter);
app.use('/dashbuilder', dashboardRouter);
app.use('/builder', dashboardRouter);
app.use('/statistics-analytics', (req, res, next) => {
  req.url = `/statistics-analytics${req.url === '/' ? '' : req.url}`;
  return dashboardRouter(req, res, next);
});
app.use('/analysis', analysisRouter);
app.use('/api/analysis', analysisRouter);
app.use('/ticket-analysis', analysisRouter);
app.use('/activity-logs', activityLogsRouter);
app.use('/api/activity-logs', activityLogsRouter);
app.use('/in-app-notifications', inAppNotificationsRouter);
app.use('/notifications', inAppNotificationsRouter);
app.use('/help', helpContentRouter);
app.use('/submitted-notebooks', submittedNotebooksRouter);
app.use('/l2/submitted-notebooks', submittedNotebooksRouter);
app.use('/pp-threshold', ppThresholdRouter);
app.use('/process-parameters', processParametersRouter);
app.use('/glossary', (req, res, next) => {
  req.url = `/glossary${req.url === '/' ? '' : req.url}`;
  return helpContentRouter(req, res, next);
});
app.use('/faqs', (req, res, next) => {
  req.url = `/faqs${req.url === '/' ? '' : req.url}`;
  return helpContentRouter(req, res, next);
});
app.use('/user-guide', (req, res, next) => {
  req.url = `/user-guide${req.url === '/' ? '' : req.url}`;
  return helpContentRouter(req, res, next);
});
app.use('/supervisor-assignments', supervisorAssignmentsRouter);
// Backward-compatible path used by some frontend builds: /api/reportSchedules/*
app.use('/reportSchedules', reportSchedulesRouter);
app.use('/reports', reportSchedulesRouter);
// app.use('/admin', require('./routes/admin'));
const spinningRouter = require('./routes/spinning');
app.use('/spinning', spinningRouter);
// The wheel change approvals page calls these without the /spinning prefix.
app.get('/wheel-change/approvals', spinningRouter.getWheelChangeApprovals);
app.post('/wheel-change/approvals/:id/approve', spinningRouter.approveWheelChangeEntry);
app.post('/wheel-change/approvals/:id/reject', spinningRouter.rejectWheelChangeEntry);
app.use('/mixing', require('./routes/mixing'));
app.use('/roles', require('./routes/roles.routes'));
app.use('/comber', require('./routes/comber')); 
app.use('/carding', require('./routes/carding'));
app.use('/api/carding', require('./routes/carding'));
app.use('/departments', require('./routes/department.routes'));
app.use('/screens', require('./routes/screens.routes'));
app.use('/trials', require('./routes/trials'));
app.use('/carding/trials', require('./routes/trials'));
app.use('/blowroom', require('./routes/blowroom'));
app.use('/drawframe', require('./routes/drawframe'));
app.use('/simplex', require('./routes/simplex'));
app.use('/autoconer', require('./routes/autoconer')); 

app.use((err, req, res, next) => {
  if (isDatabaseAccessDenied(err)) {
    const databaseName = process.env.MSSQL_PREP_DATABASE || 'dsmprojects';
    const userName = process.env.MSSQL_PREP_USER || process.env.MSSQL_USER || 'configured SQL user';
    return res.status(403).json({
      message: `SQL Server user "${userName}" does not have SELECT access to ${databaseName}.dbo.prepvariety`,
      required_permission: `GRANT SELECT ON ${databaseName}.dbo.prepvariety`,
      database: databaseName,
      table: 'dbo.prepvariety'
    });
  }

  console.error(err);
  return res.status(err.statusCode || 500).json({
    message: err.statusCode ? err.message : (err.message || 'Server error'),
    ...(err.code ? { code: err.code } : {}),
    ...(err.detail ? { detail: err.detail } : {})
  });
});

const PORT = Number(process.env.PORT) || 4000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

startReportScheduleWorker();

const startSubmittedNotebookAckWorker = () => {
  const intervalMs = Number(process.env.NOTEBOOK_ACK_WORKER_INTERVAL_MS || 15 * 60 * 1000);
  const run = async () => {
    try {
      const created = await generateOverdueNotebookTickets();
      if (created.length) {
        console.log(`[submitted-notebooks] generated ${created.length} overdue acknowledgement ticket(s)`);
      }
    } catch (error) {
      console.warn('[submitted-notebooks] overdue worker skipped:', error.message);
    }
  };

  setTimeout(run, 5000);
  setInterval(run, intervalMs);
};

startSubmittedNotebookAckWorker();

// PP tickets are driven solely by the PP-Threshold screen (ticketing_system.pp_threshold_master)
// via generatePpNotebookBatchIncompleteTickets — the older pp_batch_config-driven
// runPpBatchCompletionCheck is intentionally no longer run automatically here.
const startPpThresholdWorker = () => {
  const intervalMs = Number(process.env.PP_BATCH_COMPLETION_WORKER_INTERVAL_MS || 15 * 60 * 1000);
  const run = async () => {
    try {
      const result = await generatePpNotebookBatchIncompleteTickets();
      if (result.created.length) {
        console.log(`[pp-threshold] created ${result.created.length} ticket(s)`);
      }
    } catch (error) {
      console.warn('[pp-threshold] worker skipped:', error.message);
    }
  };

  setTimeout(run, 10000);
  setInterval(run, intervalMs);
};

startPpThresholdWorker();



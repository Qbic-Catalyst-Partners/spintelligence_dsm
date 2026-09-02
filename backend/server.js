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
app.use((req, res, next) => {
  console.log("Origin:", req.headers.origin);
  console.log("Method:", req.method);
  console.log("URL:", req.url);
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

// These 10 routes are the shared "Process Parameter" (PP-000n) screens — each one's own
// handler already calls resolveOrCreateProcessParameterEntryId()/getCountNameConflict()
// against the single global sequence (process_parameters.entry_id_sequences), which is the
// only place that's actually coordinated across every department. The generic auto-entry-id
// middleware below predates that system and computes ids per-table/per-registry instead, so
// letting it touch these routes injects a stale, uncoordinated id before the real resolver
// ever runs — silently overriding it (this is what caused Autoconer Q2/Q3 to mint ids that
// collided with ones other departments had already claimed via the real sequence). Skip the
// middleware entirely for these paths and let each route's own resolver be the sole authority.
const PP_MANAGED_ROUTES = new Set([
  '/mixing/qc',
  '/blowroom/header',
  '/carding/qc-header',
  '/drawframe/header',
  '/simplex/process_parameter',
  '/spinning/qc',
  '/autoconer/process',
  '/autoconer/process_parameter',
  '/autoconer/q2',
  '/autoconer/q3'
]);

const normalizeEntryRoutePath = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const path = text.startsWith('/') ? text : `/${text}`;
  return path.startsWith('/api/') ? path.slice(4) : path;
};

const getEntryModuleName = (routePath) =>
  DEPARTMENT_ROUTE_PREFIXES.find((prefix) => routePath.startsWith(prefix))?.slice(1) || 'unknown';

const formatNextEntryId = (value) => String(value).padStart(4, '0');

const ENTRY_ID_ROUTE_TABLES = {
  '/mixing/cotton-hvi': 'mixing.cotton_hvi_data_entry',
  '/blowroom/header': 'blowroom.blowroom_header',
  '/blowroom/process-parameter': 'blowroom.blowroom_header',
  '/blowroom/process_parameter': 'blowroom.blowroom_header',
  '/spinning/cots-checking': 'spinning.cots_checking',
  // These five were missing from this map, so their "next entry id" was computed from the
  // ticketing_system.frontend_entry_registry bookkeeping table instead of the real department
  // table's MAX(entry_id) — if that registry ever drifted out of sync with the actual table
  // (e.g. a row inserted without going through the reservation flow), the same id could be
  // handed out twice, causing "Duplicate entry_id" on save. COTS Checking above already had the
  // correct mapping; these bring the other five Spinning checking screens in line with it.
  '/spinning/speed-checking': 'spinning.speed_checking',
  '/spinning/bottom-apron-checking': 'spinning.bottom_apron_checking',
  '/spinning/lycra-centering': 'spinning.lycra_centering',
  // information_schema.columns.table_name is always lowercase (Postgres folds
  // unquoted identifiers), so the mixed-case table names used elsewhere in this
  // codebase (spinning.RSM_and_lycrasensor_cheking_online) must be lowercased
  // here or getTableEntryIdMax's information_schema lookup silently matches
  // zero rows and always reports max=0 — producing "...0001" as the "next" id
  // on every request regardless of what's already in the table, which
  // collides with the real first row and fails as "Duplicate entry_id".
  '/spinning/rsm-lycra-online': 'spinning.rsm_and_lycrasensor_cheking_online',
  '/spinning/rsm-lycra-offline': 'spinning.rsm_and_lycrasensor_cheking_offline',
  // Same root cause as the five Spinning screens above: '/autoconer/cone-density' had no
  // mapping here, so its "next entry id" was computed only from the frontend_entry_registry
  // bookkeeping table, not the real autoconer.cone_density_notebook table the Cone Density
  // screen actually saves to (see the /cone-density-notebook route in routes/autoconer.js).
  // Any drift between the two let the same entry_id be reissued, failing saves with
  // "Duplicate entry_id".
  '/autoconer/cone-density': 'autoconer.cone_density_notebook',
  // Same root cause again: Count Wise Cuts and the CSP/U% Parameter Entries screens had no
  // mapping here either, so their "next entry id" was computed only from frontend_entry_registry.
  // For Count Wise Cuts that registry had drifted behind the real table (a stuck 'reserved' row
  // masked a higher already-committed id), so the next reservation reissued an id that was
  // already taken, failing with "duplicate key value violates ... count_wise_cuts_entry_id_uq".
  // CSP and U% Parameter Entries share ONE table (autoconer.parameter_entries) with two
  // different prefixes (ACS/AUP) distinguished by inspection_type — plus their save request
  // actually posts to plain /autoconer/parameter-entries, a different route_path than the one
  // used to reserve the id (/parameter-entries/pending-csp|pending-quality), so the registry for
  // those two route_paths never saw a committed id and kept handing out ACS-0001 forever. Mapping
  // the real table here (see getTableEntryIdMax's prefix filtering, which keeps ACS/AUP numbered
  // independently despite sharing a table) fixes both without needing to touch the frontend.
  '/autoconer/count-wise-cuts': 'autoconer.count_wise_cuts',
  '/autoconer/parameter-entries': 'autoconer.parameter_entries',
  '/autoconer/parameter-entries/pending-csp': 'autoconer.parameter_entries',
  '/autoconer/parameter-entries/pending-quality': 'autoconer.parameter_entries',
  '/drawframe/wheel-change': 'drawframe.wheel_change',
  '/drawframe/wheel-change/type1': 'drawframe.wheel_change',
  '/drawframe/wheel-change/type2': 'drawframe.wheel_change',
  '/drawframe/wheel-change/type3': 'drawframe.wheel_change',
  // Without this mapping, "next entry id" for Simplex Wheel Change had no real table to check
  // against - it only trusted ticketing_system.frontend_entry_registry (reservations), which can
  // drift behind what's actually committed to simplex.wheel_change. The frontend's own fallback
  // (fetchPath: "/simplex/notebook") makes this worse, not better - it points at a completely
  // different table (simplex.simplex_notebook) that Wheel Change never writes to, so it can never
  // see prior submissions either. Net effect: every save kept reserving "SWC-0001", so any save
  // after the very first collided on the unique entry_id index and failed with 409 Duplicate.
  '/simplex/wheel-change': 'simplex.wheel_change',
  // Same missing-mapping bug, same fix, across the equivalent Spinning screens - none of these
  // five route_paths were registered, so each one's "next entry id" only trusted the reservation
  // registry instead of checking the real table, risking the same duplicate-entry_id collision
  // once frontend_entry_registry drifts behind what's actually committed.
  '/spinning/qc': 'spinning.spinning_qc_header',
  '/spinning/count-change': 'spinning.count_change_inspections',
  '/spinning/ring-frame': 'spinning.ring_frame_inspections',
  '/spinning/lycra-missing': 'spinning.lycra_missing',
  '/spinning/wheel-change/type1': 'spinning.wheel_change_inspection',
  '/spinning/wheel-change/type2': 'spinning.wheel_change_v2',
  '/spinning/wheel-change/type3': 'spinning.wheel_change',
  '/drawframe/a-percent': 'wrapping.a_percent',
  '/drawframe/stretch-percent': 'wrapping.stretch_percent',
  '/drawframe/stretch-percentage': 'wrapping.stretch_percent',
  // Simplex's own "Stretch %" screen (simplex.js) reserves its entry id under this
  // separate route_path, but actually submits through submitWrappingOcrPercentInspection
  // to /drawframe/stretch-percent (draw-frame.js) — the same endpoint Draw Frame's own
  // Stretch % screen uses, landing in this same wrapping.stretch_percent table. Without
  // this mapping, Simplex's "next id" only tracked its own route's reservations, blind to
  // rows the Draw Frame screen (or Simplex itself) already committed to the real table —
  // guaranteeing a "duplicate key ... wrapping_stretch_percent_entry_id_uq" once both
  // screens are used.
  '/simplex/stretch-percent': 'wrapping.stretch_percent',
  '/drawframe/comber-noil-percent': 'wrapping.comber_noil_percent',
  '/drawframe/noil-percent': 'wrapping.comber_noil_percent',
  '/drawframe/noils-percent': 'wrapping.comber_noil_percent',
  // Same root cause as the Spinning/cone-density fixes above: these two routes are just
  // read-only "pending" views (see autoconer.js's buildAutoconerEndpoints comment) — the
  // actual save always goes to the shared autoconer.parameter_entries table. Without this
  // mapping, "next entry id" was computed only from frontend_entry_registry, which can
  // drift behind what's really in the table and reissue an id that already exists,
  // failing the save with "duplicate key value violates ... parameter_entries_entry_id_uq".
  '/autoconer/parameter-entries/pending-csp': 'autoconer.parameter_entries',
  '/autoconer/parameter-entries/pending-quality': 'autoconer.parameter_entries',
  // Without a table mapping, next-id for these two SMX Breaks Study Report routes was computed
  // only from ticketing_system.frontend_entry_registry, which had zero rows for either route_path
  // (reservations for this screen were never actually landing there under the right key) - so the
  // "next" id kept coming back as 1 regardless of how many real rows already existed in the header
  // table. Scanning the real table directly fixes that drift at the source, same as the autoconer
  // mappings above.
  '/simplex/list': 'simplex.smx_breaks_study_header',
  '/simplex/study': 'simplex.smx_breaks_study_header'
};

const ENTRY_ID_ROUTE_PREFIXES = {
  '/blowroom/header': { prefix: 'PP', width: 4, separator: '-' },
  '/blowroom/process-parameter': { prefix: 'PP', width: 4, separator: '-' },
  '/blowroom/process_parameter': { prefix: 'PP', width: 4, separator: '-' },
  '/autoconer/inspection-data-entry': { prefix: 'ARW', width: 4, separator: '-' },
  '/autoconer/cone-density': { prefix: 'ACD', width: 4, separator: '-' },
  '/autoconer/cone-packing-audit': { prefix: 'ACP', width: 4, separator: '-' },
  '/autoconer/lycra-checking': { prefix: 'ALC', width: 4, separator: '-' },
  '/autoconer/count-wise-cuts': { prefix: 'ACW', width: 4, separator: '-' },
  '/autoconer/splice-strength': { prefix: 'ASS', width: 4, separator: '-' },
  '/autoconer/drum-wise': { prefix: 'ADA', width: 4, separator: '-' },
  '/autoconer/parameter-entries/pending-csp': { prefix: 'ACS', width: 4, separator: '-' },
  '/autoconer/parameter-entries/pending-quality': { prefix: 'AUP', width: 4, separator: '-' },
  // Without this mapping, the generic fallback in getNextEntryIdForRoute has no prefix to
  // apply and hands out a bare number (e.g. "0013") instead of "BDT-0013" whenever it's
  // invoked directly (bypassing the frontend's own per-study reservation + per-tuft "-01"
  // suffixing) — that's how blowroom.drop_test ended up with unprefixed entry_id rows like
  // "0004", "0005", "0006".
  '/blowroom/drop-test': { prefix: 'BDT', width: 4, separator: '-' },
  // Same missing-mapping bug as drop-test above, for SMX Breaks Study Report - useDatabaseEntryId
  // reserves via GET /entry-id/next?route_path=/simplex/list (screenCatalog.js's config.routePath
  // for this screen), which without this entry fell through to the bare-number fallback too,
  // producing unprefixed rows like "0006" instead of "SBS-0006".
  '/simplex/list': { prefix: 'SBS', width: 4, separator: '-' },
  // The GET /simplex/list mapping above only covers the frontend's preview call. The actual save
  // goes to POST /simplex/study - a DIFFERENT route_path. Whenever the frontend's reserved id
  // doesn't make it into the POST body, the global reservation middleware (server.js's POST
  // interceptor) computes a fresh id keyed by THIS route_path, and without a mapping here it also
  // fell through to the bare-number fallback - the real cause of study_id=11 saving as unprefixed
  // "0007" instead of "SBS-0011" even after the /simplex/list mapping was added.
  '/simplex/study': { prefix: 'SBS', width: 4, separator: '-' }
};

// Extract only the TRAILING run of digits (the actual sequence number), not
// every digit in the string - regexp_replace(entry_id, '\D', '', 'g') used to
// strip all non-digits globally, which silently concatenated any digit
// baked into the prefix itself (e.g. "SW1-0002" -> "1" + "0002" = 10002
// instead of 2) and corrupted the computed next-id for prefixes like
// Spinning's SW1/SW2/SW3.
const getRegisteredEntryIdMaxSql = `
  SELECT COALESCE(
    MAX(NULLIF(substring(entry_id from '(\\d+)$'), '')::bigint),
    0
  ) AS max_number
  FROM ticketing_system.frontend_entry_registry
  WHERE route_path = $1
`;

// `entryIdPrefix` restricts the MAX() to rows starting with that prefix (e.g. "ACS-") — needed
// for tables shared by multiple screens/prefixes (autoconer.parameter_entries holds both
// ACS-xxxx CSP rows and AUP-xxxx U% rows), otherwise a table-wide MAX would mix the two
// sequences and hand out numbers under the wrong prefix. Omitted for tables that only ever hold
// one prefix, where it's a no-op.
const getTableEntryIdMax = async (tableName, entryIdPrefix) => {
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
       MAX(NULLIF(substring(entry_id from '(\\d+)$'), '')::bigint),
       0
     ) AS max_number
     FROM ${tableName}
     WHERE $1::text IS NULL OR entry_id LIKE $1 || '%'`,
    [entryIdPrefix || null]
  );
  return Number(result.rows[0]?.max_number || 0);
};

const getRequestRoutePath = (req) => normalizeEntryRoutePath(req.path || req.originalUrl || req.url);

const extractFrontendEntryId = (body) => {
  if (!body || typeof body !== 'object') return '';
  for (const key of FRONTEND_ENTRY_ID_KEYS) {
    const value = String(body[key] ?? '').trim();
    if (value) return value;
  }
  return '';
};

const getNextEntryIdForRoute = async ({ routePath, moduleName }) => {
  const mappedTable = ENTRY_ID_ROUTE_TABLES[routePath];
  // Always check the registry, even when a mapped table exists — a mapped-table-only
  // computation ignores any id already RESERVED in ticketing_system.frontend_entry_registry
  // (e.g. a prior attempt that reserved an id, then failed before the department-table insert
  // committed) and keeps recomputing the exact same already-reserved id forever, hard-failing
  // every retry with "Duplicate entry_id" even though the real department table is empty.
  const registryResult = await db.query(getRegisteredEntryIdMaxSql, [routePath]);
  const registryMax = Number(registryResult?.rows[0]?.max_number || 0);
  const routePrefix = ENTRY_ID_ROUTE_PREFIXES[routePath];
  const tableEntryIdPrefix = routePrefix ? `${routePrefix.prefix}${routePrefix.separator}` : null;
  const tableMax = await getTableEntryIdMax(mappedTable, tableEntryIdPrefix);
  const nextNumber = Math.max(registryMax, tableMax) + 1;
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
    const moduleName = String(source.module_name || source.module || source.moduleName || getEntryModuleName(routePath)).trim();

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
    if (PP_MANAGED_ROUTES.has(routePath)) return next();

    const isDepartmentRoute = DEPARTMENT_ROUTE_PREFIXES.some((prefix) => routePath.startsWith(prefix));
    if (!isDepartmentRoute) return next();

    const moduleName = getEntryModuleName(routePath);
    let entryId = extractFrontendEntryId(req.body);
    if (!entryId) {
      const nextEntry = await getNextEntryIdForRoute({ routePath, moduleName });
      entryId = nextEntry.entry_id;
      req.body.entry_id = entryId;
    }

    // A resubmitted/stale reserved id (double-click, retry, a frontend
    // reservation that lagged behind another tab's commit, etc.) would
    // otherwise hard-fail the whole request with an opaque 409. Since this
    // registry is purely an internal bookkeeping table (not the source of
    // truth - the real uniqueness lives on each department table), silently
    // minting a fresh id and retrying is safe and keeps genuine user
    // submissions from being lost over a bookkeeping collision.
    const MAX_ATTEMPTS = 3;
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        await db.query(
          `INSERT INTO ticketing_system.frontend_entry_registry
           (entry_id, module_name, route_path, method, status)
           VALUES ($1, $2, $3, $4, 'reserved')`,
          [entryId, moduleName, routePath, req.method]
        );
        lastError = null;
        break;
      } catch (insertError) {
        if (insertError?.code !== '23505' || attempt === MAX_ATTEMPTS) {
          lastError = insertError;
          break;
        }
        const nextEntry = await getNextEntryIdForRoute({ routePath, moduleName });
        entryId = nextEntry.entry_id;
        req.body.entry_id = entryId;
      }
    }
    if (lastError) throw lastError;

    req.frontendEntryId = entryId;

    res.on('finish', async () => {
      if (!req.frontendEntryId) return;
      try {
        if (res.statusCode >= 400) {
          await db.query(
            `DELETE FROM ticketing_system.frontend_entry_registry
             WHERE entry_id = $1 AND route_path = $2 AND status = 'reserved'`,
            [req.frontendEntryId, routePath]
          );
        } else {
          await db.query(
            `UPDATE ticketing_system.frontend_entry_registry
             SET status = 'committed', committed_at = NOW()
             WHERE entry_id = $1 AND route_path = $2`,
            [req.frontendEntryId, routePath]
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

const operatorTicketRoutes = require('./routes/operatorTickets.routes');
const supervisorTicketRoutes = require('./routes/supervisorTickets.routes');
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
const delegationsRouter = require('./routes/delegations.routes');
const { router: submittedNotebooksRouter, generateOverdueNotebookTickets, runPpBatchCompletionCheck, runPpBatchTatCheck } = require('./routes/submittedNotebooks.routes');
const processParametersRoutes = require('./routes/processParameters');
const spinningRoutes = require('./routes/spinning');
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
    const actionName = res.locals.activityAction || getActivityActionName(req);
    const userId = Number.isInteger(Number(req.user?.id)) ? Number(req.user.id) : null;
    const metadata = {
      method,
      path,
      route_path: req.path || null,
      params: req.params || {},
      query: req.query || {},
      status_code: res.statusCode,
      notebook_type: req.body?.notebook_type || req.body?.notebook || req.body?.input_screen || moduleName,
      sub_department: req.body?.sub_department || req.body?.subDepartment || req.body?.management_field || req.body?.department || null,
      ...(res.locals.activityMetadata || {})
    };

    createActivityLog({
      userId,
      userName: req.user?.full_name || req.user?.user_name || req.user?.username || null,
      employeeId: req.user?.employee_id || null,
      module: moduleName,
      action: actionName,
      description: res.locals.activityDescription || `${actionName} ${moduleName}`,
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
app.use('/delegations', delegationsRouter);
// Backward-compatible path used by some frontend builds: /api/reportSchedules/*
app.use('/reportSchedules', reportSchedulesRouter);
app.use('/reports', reportSchedulesRouter);
// app.use('/admin', require('./routes/admin'));
app.use('/process-parameters', require('./routes/processParameters'));
app.use('/pp-threshold', require('./routes/ppThreshold.routes'));
app.use('/spinning', require('./routes/spinning'));
// Spinning's wheel-change approvals are surfaced at the bare /wheel-change root
// (frontend's shared wheelChangeApprovals.js), not namespaced under /spinning
// like every other department's approvals endpoints.
app.use('/wheel-change', (req, res, next) => {
  req.url = `/wheel-change${req.url === '/' ? '' : req.url}`;
  return require('./routes/spinning')(req, res, next);
});
app.use('/mixing', require('./routes/mixing'));
app.use('/roles', require('./routes/roles.routes'));
app.use('/comber', require('./routes/comber')); 
app.use('/carding', require('./routes/carding'));
app.use('/api/carding', require('./routes/carding'));
app.use('/departments', require('./routes/department.routes'));
app.use('/screens', require('./routes/screens.routes'));
app.use('/notebook-custom-fields', require('./routes/notebookCustomFields.routes'));
app.use('/trials', require('./routes/trials'));
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
    message: err.statusCode ? err.message : 'Server error'
  });
});

const PORT = Number(process.env.PORT) || 4000;

// A second `node server.js` started alongside an already-running one (e.g.
// forgotten from a previous session, or started manually while another copy
// is already up) doesn't reliably fail loudly on every platform - both can
// end up bound and both polling/writing the same DB, silently racing each
// other (this is exactly how the PP Approval and Wheel Change Approval
// "duplicate ticket" bugs kept reappearing - two background workers on two
// live instances both passing the same "does a ticket already exist?" check
// before either had committed its insert). Failing fast and loud here beats
// a second instance quietly coexisting.
const httpServer = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use - another instance of this backend is already running. ` +
      'Stop that instance before starting a new one (two copies running at once will race each other against the same database).'
    );
    process.exit(1);
  }
  throw err;
});

startReportScheduleWorker();

const startSubmittedNotebookAckWorker = () => {
  const intervalMs = Number(process.env.NOTEBOOK_ACK_WORKER_INTERVAL_MS || 15 * 60 * 1000);
  const run = async () => {
    try {
      await db.initPromise.catch(() => {});
      const { created, escalated } = await generateOverdueNotebookTickets();
      if (created.length) {
        console.log(`[submitted-notebooks] generated ${created.length} overdue acknowledgement ticket(s)`);
      }
      if (escalated.length) {
        console.log(`[submitted-notebooks] escalated ${escalated.length} acknowledgement ticket(s) to the next tier`);
      }
    } catch (error) {
      console.warn('[submitted-notebooks] overdue worker skipped:', error.message);
    }
  };

  setTimeout(run, 5000);
  setInterval(run, intervalMs);
};

startSubmittedNotebookAckWorker();

// Employee-Hierarchy-and-Workflow-System_V2.pdf: every threshold's ticket
// generation/escalation is "automatic ... requiring no manual intervention
// at any level." Before this, PP Batch Incomplete and Submission Frequency
// only ever ran when their API routes were hit manually - nothing scheduled
// them. This worker runs all three (PP batch detection+escalation,
// submission-frequency detection, submission-frequency TAT escalation) on
// the same timer as the acknowledgement worker above.
const startThresholdTicketWorker = () => {
  const intervalMs = Number(process.env.THRESHOLD_TICKET_WORKER_INTERVAL_MS || 15 * 60 * 1000);
  const run = async () => {
    await db.initPromise.catch(() => {});

    try {
      const { created } = await runPpBatchCompletionCheck();
      if (created.length) {
        console.log(`[pp-batch] generated ${created.length} incomplete-batch ticket(s)`);
      }
    } catch (error) {
      console.warn('[pp-batch] worker skipped:', error.message);
    }

    try {
      const escalated = await runPpBatchTatCheck();
      if (escalated.length) {
        console.log(`[pp-batch] escalated ${escalated.length} ticket(s) to the next tier`);
      }
    } catch (error) {
      console.warn('[pp-batch] TAT worker skipped:', error.message);
    }

    try {
      const created = await operatorTicketRoutes.runSubmissionFrequencyCheck();
      if (created.length) {
        console.log(`[submission-frequency] generated ${created.length} missed-frequency ticket(s)`);
      }
    } catch (error) {
      console.warn('[submission-frequency] detection worker skipped:', error.message);
    }

    try {
      await operatorTicketRoutes.runSubmissionFrequencyTatCheck();
    } catch (error) {
      console.warn('[submission-frequency] TAT worker skipped:', error.message);
    }

    try {
      const created = await processParametersRoutes.runPpApprovalOverdueCheck();
      if (created.length) {
        console.log(`[pp-approval] raised ${created.length} ticket(s) - TAT window elapsed: ${created.join(', ')}`);
      }
    } catch (error) {
      console.warn('[pp-approval] overdue worker skipped:', error.message);
    }

    try {
      const escalated = await processParametersRoutes.runPpApprovalTatCheck();
      if (escalated.length) {
        console.log(`[pp-approval] escalated ${escalated.length} ticket(s) to L5`);
      }
    } catch (error) {
      console.warn('[pp-approval] TAT worker skipped:', error.message);
    }

    try {
      const created = await spinningRoutes.runWheelChangeApprovalOverdueCheck();
      if (created.length) {
        console.log(`[wheel-change-approval] raised ${created.length} ticket(s) - TAT window elapsed: ${created.join(', ')}`);
      }
    } catch (error) {
      console.warn('[wheel-change-approval] overdue worker skipped:', error.message);
    }

    try {
      const escalated = await spinningRoutes.runWheelChangeApprovalTatCheck();
      if (escalated.length) {
        console.log(`[wheel-change-approval] escalated ${escalated.length} ticket(s) to L5`);
      }
    } catch (error) {
      console.warn('[wheel-change-approval] TAT worker skipped:', error.message);
    }

    try {
      const { closed, reopened } = await supervisorTicketRoutes.runL4SelfResolveReconciliationCheck();
      if (closed.length) {
        console.log(`[l4-self-resolve] confirmed and closed ${closed.length} ticket(s): ${closed.join(', ')}`);
      }
      if (reopened.length) {
        console.log(`[l4-self-resolve] not actually completed, reopened ${reopened.length} ticket(s): ${reopened.join(', ')}`);
      }
    } catch (error) {
      console.warn('[l4-self-resolve] reconciliation worker skipped:', error.message);
    }
  };

  setTimeout(run, 8000);
  setInterval(run, intervalMs);
};

startThresholdTicketWorker();


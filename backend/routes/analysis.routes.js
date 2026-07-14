const express = require('express');
const router = express.Router();
const client = require('../connection');
const auth = require('../middleware/auth');

const PERIODS = new Set(['today', 'week', 'month', 'quarter', 'quater', 'year', 'custom', '1d', '1w', '1m', '1y']);

const parsePositiveInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const isoOrNull = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const normalizeCustomBoundary = (value, boundary) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (DATE_ONLY_RE.test(raw)) {
    const suffix = boundary === 'end' ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
    return isoOrNull(`${raw}${suffix}`);
  }
  return isoOrNull(raw);
};

const cleanTextOrNull = (value) => {
  const text = String(value ?? '').trim();
  return text ? text : null;
};

const normalizePeriod = (value) => {
  const raw = String(value || 'today').trim().toLowerCase();
  const aliasMap = {
    '1d': 'today',
    '1w': 'week',
    '1m': 'month',
    '1y': 'year',
    quater: 'quarter'
  };
  return aliasMap[raw] || raw;
};

const periodBounds = ({ period, startDate, endDate }) => {
  const now = new Date();
  const utcNow = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds()
  ));

  if (period === 'custom') {
    const start = normalizeCustomBoundary(startDate, 'start');
    const end = normalizeCustomBoundary(endDate, 'end');
    if (!start || !end) return null;
    return { start, end };
  }

  let start;
  let end;
  if (period === 'today') {
    start = new Date(Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth(), utcNow.getUTCDate(), 0, 0, 0, 0));
    end = new Date(Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth(), utcNow.getUTCDate(), 23, 59, 59, 999));
  } else if (period === 'week') {
    const day = utcNow.getUTCDay();
    const delta = (day + 6) % 7;
    start = new Date(Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth(), utcNow.getUTCDate() - delta, 0, 0, 0, 0));
    end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6, 23, 59, 59, 999));
  } else if (period === 'month') {
    start = new Date(Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth(), 1, 0, 0, 0, 0));
    end = new Date(Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  } else if (period === 'quarter') {
    const qStartMonth = Math.floor(utcNow.getUTCMonth() / 3) * 3;
    start = new Date(Date.UTC(utcNow.getUTCFullYear(), qStartMonth, 1, 0, 0, 0, 0));
    end = new Date(Date.UTC(utcNow.getUTCFullYear(), qStartMonth + 3, 0, 23, 59, 59, 999));
  } else {
    start = new Date(Date.UTC(utcNow.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
    end = new Date(Date.UTC(utcNow.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
  }

  return { start: start.toISOString(), end: end.toISOString() };
};

const pct = (numerator, denominator) => {
  if (!denominator) return 0;
  return Number(((Number(numerator || 0) / Number(denominator || 1)) * 100).toFixed(4));
};

const isAdminUser = (req) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  return role === 'admin' || role === 'super admin' || role === 'superadmin';
};

const getAnalyticsFilters = (query) => ({
  department: cleanTextOrNull(query.department || query.management_field),
  subDepartment: cleanTextOrNull(query.sub_department || query.subDepartment || query.erp_product_code),
  notebook: cleanTextOrNull(query.notebook || query.input_screen || query.inputScreen || query.machine_name)
});

const addTicketAnalyticsFilters = (filters, params, tableAlias = 'ot') => {
  const columnMap = [
    ['department', 'management_field'],
    ['subDepartment', 'erp_product_code'],
    ['notebook', 'machine_name']
  ];

  return columnMap
    .map(([key, column]) => {
      const value = filters[key];
      if (!value) return null;
      params.push(value);
      return `LOWER(TRIM(COALESCE(${tableAlias}.${column}, ''))) = LOWER(TRIM($${params.length}::text))`;
    })
    .filter(Boolean);
};

const getAnalyticsFilterResponse = ({ department, subDepartment, notebook }) => ({
  department,
  sub_department: subDepartment,
  notebook,
  input_screen: notebook
});

router.use(auth);

router.get('/team-performance/options', async (req, res, next) => {
  try {
    const filters = getAnalyticsFilters(req.query);
    const { department, subDepartment, notebook } = filters;
    const where = ['1=1'];
    const params = [];
    where.push(...addTicketAnalyticsFilters(filters, params, 'operator_tickets'));

    const scope = where.join(' AND ');
    const [departmentRes, subDepartmentRes, notebookRes, userRes] = await Promise.all([
      client.query(
        `SELECT DISTINCT NULLIF(TRIM(management_field), '') AS department
         FROM ticketing_system.operator_tickets
         WHERE NULLIF(TRIM(management_field), '') IS NOT NULL
         ORDER BY 1`
      ),
      client.query(
        `SELECT DISTINCT NULLIF(TRIM(erp_product_code), '') AS sub_department
         FROM ticketing_system.operator_tickets
         WHERE ${scope}
           AND NULLIF(TRIM(erp_product_code), '') IS NOT NULL
         ORDER BY 1`,
        params
      ),
      client.query(
        `SELECT DISTINCT NULLIF(TRIM(machine_name), '') AS notebook
         FROM ticketing_system.operator_tickets
         WHERE ${scope}
           AND NULLIF(TRIM(machine_name), '') IS NOT NULL
         ORDER BY 1`,
        params
      ),
      client.query(
        `SELECT id, employee_id, full_name, level, department
         FROM users.user_details
         WHERE UPPER(COALESCE(level, '')) IN ('L1', 'L2', 'L3')
         ORDER BY level, full_name`
      )
    ]);

    const notebooks = notebookRes.rows.map((row) => row.notebook).filter(Boolean);

    return res.status(200).json({
      filter: getAnalyticsFilterResponse({ department, subDepartment, notebook }),
      departments: departmentRes.rows.map((row) => row.department).filter(Boolean),
      sub_departments: subDepartmentRes.rows.map((row) => row.sub_department).filter(Boolean),
      notebooks,
      input_screens: notebooks,
      users: userRes.rows
    });
  } catch (error) {
    next(error);
  }
});

router.get('/l1', async (req, res, next) => {
  try {
    const periodInput = String(req.query.period || 'today').trim().toLowerCase();
    if (!PERIODS.has(periodInput)) return res.status(400).json({ message: 'Invalid period' });
    const period = normalizePeriod(periodInput);

    const bounds = periodBounds({
      period,
      startDate: req.query.start_date || req.query.from_date || req.query.custom_from,
      endDate: req.query.end_date || req.query.to_date || req.query.custom_to
    });
    if (!bounds) return res.status(400).json({ message: 'Valid start_date and end_date are required for custom period' });

    const targetUserId = parsePositiveInt(req.query.user_id) || parsePositiveInt(req.user?.id);
    const { department, subDepartment, notebook } = getAnalyticsFilters(req.query);

    const result = await client.query(
      `
      WITH base AS (
        SELECT
          ot.ticket_id,
          ot.user_id,
          ot.created_at,
          ot.status,
          ot.l1_tat_due_at,
          ot.approval_l1_user_ids
        FROM ticketing_system.operator_tickets ot
        WHERE ot.created_at >= $1::timestamptz
          AND ot.created_at <= $2::timestamptz
          AND ($4::text IS NULL OR LOWER(TRIM(COALESCE(ot.management_field, ''))) = LOWER(TRIM($4::text)))
          AND ($5::text IS NULL OR LOWER(TRIM(COALESCE(ot.erp_product_code, ''))) = LOWER(TRIM($5::text)))
          AND ($6::text IS NULL OR LOWER(TRIM(COALESCE(ot.machine_name, ''))) = LOWER(TRIM($6::text)))
      ),
      actions AS (
        SELECT
          tl.ticket_id,
          MIN(tl.created_at) FILTER (WHERE UPPER(tl.action) IN ('SUBMITTED', 'RESUBMITTED')) AS first_submission_at,
          MIN(tl.created_at) FILTER (WHERE UPPER(tl.action) LIKE '%APPROVED%' OR UPPER(tl.action) LIKE '%REJECTED%') AS first_resolution_at,
          COUNT(*) FILTER (WHERE UPPER(tl.action) = 'RESUBMITTED') AS resubmitted_count,
          COUNT(*) FILTER (WHERE UPPER(tl.action) LIKE '%REJECTED%') AS rejected_count
        FROM ticketing_system.ticket_logs tl
        GROUP BY tl.ticket_id
      ),
      j AS (
        SELECT
          b.*,
          a.first_submission_at,
          a.first_resolution_at,
          COALESCE(a.resubmitted_count, 0) AS resubmitted_count,
          COALESCE(a.rejected_count, 0) AS rejected_count
        FROM base b
        LEFT JOIN actions a ON a.ticket_id = b.ticket_id
      )
      SELECT
        COUNT(*) FILTER (
          WHERE ($3::int IS NULL OR j.user_id = $3::int)
        )::int AS allocated_submissions,
        COUNT(*) FILTER (
          WHERE ($3::int IS NULL OR j.user_id = $3::int)
            AND j.first_submission_at IS NOT NULL
            AND (j.l1_tat_due_at IS NULL OR j.first_submission_at <= j.l1_tat_due_at)
        )::int AS on_time_submissions,
        COUNT(*) FILTER (
          WHERE ($3::int IS NULL OR j.user_id = $3::int)
            AND (
              (j.first_submission_at IS NOT NULL AND j.l1_tat_due_at IS NOT NULL AND j.first_submission_at > j.l1_tat_due_at)
              OR
              (j.first_submission_at IS NULL AND j.l1_tat_due_at IS NOT NULL AND NOW() > j.l1_tat_due_at)
            )
        )::int AS delayed_submissions,
        COUNT(*) FILTER (
          WHERE ($3::int IS NULL OR j.user_id = $3::int)
            AND (j.resubmitted_count > 0 OR UPPER(COALESCE(j.status, '')) = 'REOPENED')
        )::int AS reworked_submissions,
        COUNT(*) FILTER (
          WHERE ($3::int IS NULL OR $3::int = ANY(COALESCE(j.approval_l1_user_ids, ARRAY[]::int[])))
        )::int AS allocated_tickets,
        COUNT(*) FILTER (
          WHERE ($3::int IS NULL OR $3::int = ANY(COALESCE(j.approval_l1_user_ids, ARRAY[]::int[])))
            AND j.first_resolution_at IS NOT NULL
            AND (j.l1_tat_due_at IS NULL OR j.first_resolution_at <= j.l1_tat_due_at)
        )::int AS on_time_resolutions,
        COUNT(*) FILTER (
          WHERE ($3::int IS NULL OR $3::int = ANY(COALESCE(j.approval_l1_user_ids, ARRAY[]::int[])))
            AND (
              (j.first_resolution_at IS NOT NULL AND j.l1_tat_due_at IS NOT NULL AND j.first_resolution_at > j.l1_tat_due_at)
              OR
              (j.first_resolution_at IS NULL AND j.l1_tat_due_at IS NOT NULL AND NOW() > j.l1_tat_due_at)
            )
        )::int AS delayed_resolutions,
        COUNT(*) FILTER (
          WHERE ($3::int IS NULL OR $3::int = ANY(COALESCE(j.approval_l1_user_ids, ARRAY[]::int[])))
            AND (j.rejected_count > 0 OR UPPER(COALESCE(j.status, '')) = 'REOPENED')
        )::int AS reworked_resolutions,
        COUNT(*) FILTER (
          WHERE ($3::int IS NULL OR $3::int = ANY(COALESCE(j.approval_l1_user_ids, ARRAY[]::int[])))
            AND j.rejected_count = 0
            AND UPPER(COALESCE(j.status, '')) = 'CLOSED'
        )::int AS first_time_approved
      FROM j
      `,
      [bounds.start, bounds.end, targetUserId, department, subDepartment, notebook]
    );

    const m = result.rows[0] || {};
    const submissionEfficiency = pct(m.on_time_submissions, m.allocated_submissions);
    const resolutionEfficiency = pct(m.on_time_resolutions, m.allocated_tickets);
    const firstTimeApprovalRate = pct(m.first_time_approved, m.allocated_tickets);
    const averageEfficiency = Number(((submissionEfficiency + resolutionEfficiency) / 2).toFixed(4));

    const rankingResult = await client.query(
      `
      WITH base AS (
        SELECT
          u.id AS user_id,
          COUNT(*) FILTER (WHERE ot.user_id = u.id)::int AS allocated_submissions,
          COUNT(*) FILTER (WHERE u.id = ANY(COALESCE(ot.approval_l1_user_ids, ARRAY[]::int[])))::int AS allocated_tickets
        FROM users.user_details u
        LEFT JOIN ticketing_system.operator_tickets ot
          ON ot.created_at >= $1::timestamptz
         AND ot.created_at <= $2::timestamptz
         AND ($3::text IS NULL OR LOWER(TRIM(COALESCE(ot.management_field, ''))) = LOWER(TRIM($3::text)))
         AND ($4::text IS NULL OR LOWER(TRIM(COALESCE(ot.erp_product_code, ''))) = LOWER(TRIM($4::text)))
         AND ($5::text IS NULL OR LOWER(TRIM(COALESCE(ot.machine_name, ''))) = LOWER(TRIM($5::text)))
        WHERE UPPER(COALESCE(u.level, '')) = 'L1'
        GROUP BY u.id
      ),
      actions AS (
        SELECT
          tl.ticket_id,
          MIN(tl.created_at) FILTER (WHERE UPPER(tl.action) IN ('SUBMITTED', 'RESUBMITTED')) AS first_submission_at,
          MIN(tl.created_at) FILTER (WHERE UPPER(tl.action) LIKE '%APPROVED%' OR UPPER(tl.action) LIKE '%REJECTED%') AS first_resolution_at
        FROM ticketing_system.ticket_logs tl
        GROUP BY tl.ticket_id
      ),
      sub AS (
        SELECT
          ot.user_id,
          COUNT(*) FILTER (WHERE a.first_submission_at IS NOT NULL AND (ot.l1_tat_due_at IS NULL OR a.first_submission_at <= ot.l1_tat_due_at))::int AS on_time_submissions
        FROM ticketing_system.operator_tickets ot
        LEFT JOIN actions a ON a.ticket_id = ot.ticket_id
        WHERE ot.created_at >= $1::timestamptz
          AND ot.created_at <= $2::timestamptz
          AND ($3::text IS NULL OR LOWER(TRIM(COALESCE(ot.management_field, ''))) = LOWER(TRIM($3::text)))
          AND ($4::text IS NULL OR LOWER(TRIM(COALESCE(ot.erp_product_code, ''))) = LOWER(TRIM($4::text)))
          AND ($5::text IS NULL OR LOWER(TRIM(COALESCE(ot.machine_name, ''))) = LOWER(TRIM($5::text)))
        GROUP BY ot.user_id
      ),
      reso AS (
        SELECT
          u.id AS user_id,
          COUNT(*) FILTER (WHERE a.first_resolution_at IS NOT NULL AND (ot.l1_tat_due_at IS NULL OR a.first_resolution_at <= ot.l1_tat_due_at))::int AS on_time_resolutions
        FROM users.user_details u
        JOIN ticketing_system.operator_tickets ot
          ON u.id = ANY(COALESCE(ot.approval_l1_user_ids, ARRAY[]::int[]))
        LEFT JOIN actions a ON a.ticket_id = ot.ticket_id
        WHERE ot.created_at >= $1::timestamptz
          AND ot.created_at <= $2::timestamptz
          AND ($3::text IS NULL OR LOWER(TRIM(COALESCE(ot.management_field, ''))) = LOWER(TRIM($3::text)))
          AND ($4::text IS NULL OR LOWER(TRIM(COALESCE(ot.erp_product_code, ''))) = LOWER(TRIM($4::text)))
          AND ($5::text IS NULL OR LOWER(TRIM(COALESCE(ot.machine_name, ''))) = LOWER(TRIM($5::text)))
          AND UPPER(COALESCE(u.level, '')) = 'L1'
        GROUP BY u.id
      )
      SELECT
        b.user_id,
        b.allocated_submissions,
        COALESCE(s.on_time_submissions, 0)::int AS on_time_submissions,
        b.allocated_tickets,
        COALESCE(r.on_time_resolutions, 0)::int AS on_time_resolutions
      FROM base b
      LEFT JOIN sub s ON s.user_id = b.user_id
      LEFT JOIN reso r ON r.user_id = b.user_id
      `,
      [bounds.start, bounds.end, department, subDepartment, notebook]
    );

    const rankingRows = rankingResult.rows.map((row) => {
      const submission = pct(row.on_time_submissions, row.allocated_submissions);
      const resolution = pct(row.on_time_resolutions, row.allocated_tickets);
      return {
        user_id: Number(row.user_id),
        average_efficiency: Number(((submission + resolution) / 2).toFixed(4))
      };
    }).sort((a, b) => b.average_efficiency - a.average_efficiency);
    const myRankRow = rankingRows.find((r) => r.user_id === targetUserId);
    const rankingScore = myRankRow ? myRankRow.average_efficiency : 0;

    return res.status(200).json({
      period: periodInput,
      period_key: period,
      range: bounds,
      level: 'L1',
      filter: getAnalyticsFilterResponse({ department, subDepartment, notebook }),
      metrics: {
        allocated_submissions: Number(m.allocated_submissions || 0),
        on_time_submissions: Number(m.on_time_submissions || 0),
        delayed_submissions: Number(m.delayed_submissions || 0),
        reworked_submissions: Number(m.reworked_submissions || 0),
        submission_efficiency: submissionEfficiency,
        allocated_tickets: Number(m.allocated_tickets || 0),
        on_time_resolutions: Number(m.on_time_resolutions || 0),
        delayed_resolutions: Number(m.delayed_resolutions || 0),
        reworked_resolutions: Number(m.reworked_resolutions || 0),
        resolution_efficiency: resolutionEfficiency,
        first_time_approval_rate: firstTimeApprovalRate,
        average_efficiency: averageEfficiency,
        ranking: rankingScore
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/l2', async (req, res, next) => {
  try {
    const periodInput = String(req.query.period || 'today').trim().toLowerCase();
    if (!PERIODS.has(periodInput)) return res.status(400).json({ message: 'Invalid period' });
    const period = normalizePeriod(periodInput);

    const bounds = periodBounds({
      period,
      startDate: req.query.start_date || req.query.from_date || req.query.custom_from,
      endDate: req.query.end_date || req.query.to_date || req.query.custom_to
    });
    if (!bounds) return res.status(400).json({ message: 'Valid start_date and end_date are required for custom period' });

    const targetUserId = parsePositiveInt(req.query.user_id) || parsePositiveInt(req.user?.id);
    const { department, subDepartment, notebook } = getAnalyticsFilters(req.query);

    const result = await client.query(
      `
      WITH base AS (
        SELECT
          ot.ticket_id,
          ot.status,
          ot.created_at,
          ot.l2_tat_due_at,
          ot.approval_l2_user_ids
        FROM ticketing_system.operator_tickets ot
        WHERE ot.created_at >= $1::timestamptz
          AND ot.created_at <= $2::timestamptz
          AND ($4::text IS NULL OR LOWER(TRIM(COALESCE(ot.management_field, ''))) = LOWER(TRIM($4::text)))
          AND ($5::text IS NULL OR LOWER(TRIM(COALESCE(ot.erp_product_code, ''))) = LOWER(TRIM($5::text)))
          AND ($6::text IS NULL OR LOWER(TRIM(COALESCE(ot.machine_name, ''))) = LOWER(TRIM($6::text)))
      ),
      actions AS (
        SELECT
          tl.ticket_id,
          MIN(tl.created_at) FILTER (WHERE UPPER(tl.action) LIKE '%APPROVED%' OR UPPER(tl.action) LIKE '%REJECTED%') AS first_approval_at
        FROM ticketing_system.ticket_logs tl
        GROUP BY tl.ticket_id
      ),
      j AS (
        SELECT b.*, a.first_approval_at
        FROM base b
        LEFT JOIN actions a ON a.ticket_id = b.ticket_id
      )
      SELECT
        COUNT(*) FILTER (
          WHERE ($3::int IS NULL OR $3::int = ANY(COALESCE(j.approval_l2_user_ids, ARRAY[]::int[])))
        )::int AS allocated_tickets,
        COUNT(*) FILTER (
          WHERE ($3::int IS NULL OR $3::int = ANY(COALESCE(j.approval_l2_user_ids, ARRAY[]::int[])))
            AND j.first_approval_at IS NOT NULL
            AND (j.l2_tat_due_at IS NULL OR j.first_approval_at <= j.l2_tat_due_at)
        )::int AS on_time_approvals,
        COUNT(*) FILTER (
          WHERE ($3::int IS NULL OR $3::int = ANY(COALESCE(j.approval_l2_user_ids, ARRAY[]::int[])))
            AND (
              (j.first_approval_at IS NOT NULL AND j.l2_tat_due_at IS NOT NULL AND j.first_approval_at > j.l2_tat_due_at)
              OR
              (j.first_approval_at IS NULL AND j.l2_tat_due_at IS NOT NULL AND NOW() > j.l2_tat_due_at)
            )
        )::int AS delayed_approvals
      FROM j
      `,
      [bounds.start, bounds.end, targetUserId, department, subDepartment, notebook]
    );

    const m = result.rows[0] || {};
    const approvalEfficiency = pct(m.on_time_approvals, m.allocated_tickets);
    return res.status(200).json({
      period: periodInput,
      period_key: period,
      range: bounds,
      level: 'L2',
      filter: getAnalyticsFilterResponse({ department, subDepartment, notebook }),
      metrics: {
        allocated_tickets: Number(m.allocated_tickets || 0),
        on_time_approvals: Number(m.on_time_approvals || 0),
        delayed_approvals: Number(m.delayed_approvals || 0),
        approval_efficiency: approvalEfficiency
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get(['/team-performance', '/team-performance-analysis', '/team-performance/analysis'], async (req, res, next) => {
  try {
    const periodInput = String(req.query.period || 'today').trim().toLowerCase();
    if (!PERIODS.has(periodInput)) return res.status(400).json({ message: 'Invalid period' });
    const period = normalizePeriod(periodInput);

    const bounds = periodBounds({
      period,
      startDate: req.query.start_date || req.query.from_date || req.query.custom_from,
      endDate: req.query.end_date || req.query.to_date || req.query.custom_to
    });
    if (!bounds) return res.status(400).json({ message: 'Valid start_date and end_date are required for custom period' });

    const { department, subDepartment, notebook } = getAnalyticsFilters(req.query);
    const queryParams = [bounds.start, bounds.end, department, subDepartment, notebook];

    const [l1Result, l2Result, memberResult] = await Promise.all([
      client.query(
        `
        WITH base AS (
          SELECT
            ot.ticket_id,
            ot.user_id,
            ot.status,
            ot.created_at,
            ot.l1_tat_due_at,
            ot.approval_l1_user_ids
          FROM ticketing_system.operator_tickets ot
          WHERE ot.created_at >= $1::timestamptz
            AND ot.created_at <= $2::timestamptz
            AND ($3::text IS NULL OR LOWER(TRIM(COALESCE(ot.management_field, ''))) = LOWER(TRIM($3::text)))
            AND ($4::text IS NULL OR LOWER(TRIM(COALESCE(ot.erp_product_code, ''))) = LOWER(TRIM($4::text)))
            AND ($5::text IS NULL OR LOWER(TRIM(COALESCE(ot.machine_name, ''))) = LOWER(TRIM($5::text)))
        ),
        actions AS (
          SELECT
            tl.ticket_id,
            MIN(tl.created_at) FILTER (WHERE UPPER(tl.action) IN ('SUBMITTED', 'RESUBMITTED')) AS first_submission_at,
            MIN(tl.created_at) FILTER (WHERE UPPER(tl.action) LIKE '%APPROVED%' OR UPPER(tl.action) LIKE '%REJECTED%') AS first_resolution_at,
            COUNT(*) FILTER (WHERE UPPER(tl.action) = 'RESUBMITTED') AS resubmitted_count,
            COUNT(*) FILTER (WHERE UPPER(tl.action) LIKE '%REJECTED%') AS rejected_count
          FROM ticketing_system.ticket_logs tl
          GROUP BY tl.ticket_id
        ),
        j AS (
          SELECT
            b.*,
            a.first_submission_at,
            a.first_resolution_at,
            COALESCE(a.resubmitted_count, 0) AS resubmitted_count,
            COALESCE(a.rejected_count, 0) AS rejected_count
          FROM base b
          LEFT JOIN actions a ON a.ticket_id = b.ticket_id
        )
        SELECT
          COUNT(*)::int AS allocated_submissions,
          COUNT(*) FILTER (
            WHERE j.first_submission_at IS NOT NULL
              AND (j.l1_tat_due_at IS NULL OR j.first_submission_at <= j.l1_tat_due_at)
          )::int AS on_time_submissions,
          COUNT(*) FILTER (
            WHERE (j.first_submission_at IS NOT NULL AND j.l1_tat_due_at IS NOT NULL AND j.first_submission_at > j.l1_tat_due_at)
               OR (j.first_submission_at IS NULL AND j.l1_tat_due_at IS NOT NULL AND NOW() > j.l1_tat_due_at)
          )::int AS delayed_submissions,
          COUNT(*) FILTER (
            WHERE j.resubmitted_count > 0 OR UPPER(COALESCE(j.status, '')) = 'REOPENED'
          )::int AS reworked_submissions,
          COUNT(*) FILTER (
            WHERE cardinality(COALESCE(j.approval_l1_user_ids, ARRAY[]::int[])) > 0
          )::int AS allocated_tickets,
          COUNT(*) FILTER (
            WHERE cardinality(COALESCE(j.approval_l1_user_ids, ARRAY[]::int[])) > 0
              AND j.first_resolution_at IS NOT NULL
              AND (j.l1_tat_due_at IS NULL OR j.first_resolution_at <= j.l1_tat_due_at)
          )::int AS on_time_resolutions,
          COUNT(*) FILTER (
            WHERE cardinality(COALESCE(j.approval_l1_user_ids, ARRAY[]::int[])) > 0
              AND (
                (j.first_resolution_at IS NOT NULL AND j.l1_tat_due_at IS NOT NULL AND j.first_resolution_at > j.l1_tat_due_at)
                OR (j.first_resolution_at IS NULL AND j.l1_tat_due_at IS NOT NULL AND NOW() > j.l1_tat_due_at)
              )
          )::int AS delayed_resolutions,
          COUNT(*) FILTER (
            WHERE cardinality(COALESCE(j.approval_l1_user_ids, ARRAY[]::int[])) > 0
              AND (j.rejected_count > 0 OR UPPER(COALESCE(j.status, '')) = 'REOPENED')
          )::int AS reworked_resolutions,
          COUNT(*) FILTER (
            WHERE cardinality(COALESCE(j.approval_l1_user_ids, ARRAY[]::int[])) > 0
              AND j.rejected_count = 0
              AND UPPER(COALESCE(j.status, '')) = 'CLOSED'
          )::int AS first_time_approved
        FROM j
        `,
        queryParams
      ),
      client.query(
        `
        WITH base AS (
          SELECT ot.ticket_id, ot.status, ot.created_at, ot.l2_tat_due_at, ot.approval_l2_user_ids
          FROM ticketing_system.operator_tickets ot
          WHERE ot.created_at >= $1::timestamptz
            AND ot.created_at <= $2::timestamptz
            AND ($3::text IS NULL OR LOWER(TRIM(COALESCE(ot.management_field, ''))) = LOWER(TRIM($3::text)))
            AND ($4::text IS NULL OR LOWER(TRIM(COALESCE(ot.erp_product_code, ''))) = LOWER(TRIM($4::text)))
            AND ($5::text IS NULL OR LOWER(TRIM(COALESCE(ot.machine_name, ''))) = LOWER(TRIM($5::text)))
        ),
        actions AS (
          SELECT
            tl.ticket_id,
            MIN(tl.created_at) FILTER (WHERE UPPER(tl.action) LIKE '%APPROVED%' OR UPPER(tl.action) LIKE '%REJECTED%') AS first_approval_at
          FROM ticketing_system.ticket_logs tl
          GROUP BY tl.ticket_id
        ),
        j AS (
          SELECT b.*, a.first_approval_at
          FROM base b
          LEFT JOIN actions a ON a.ticket_id = b.ticket_id
        )
        SELECT
          COUNT(*) FILTER (WHERE cardinality(COALESCE(j.approval_l2_user_ids, ARRAY[]::int[])) > 0)::int AS allocated_tickets,
          COUNT(*) FILTER (
            WHERE cardinality(COALESCE(j.approval_l2_user_ids, ARRAY[]::int[])) > 0
              AND j.first_approval_at IS NOT NULL
              AND (j.l2_tat_due_at IS NULL OR j.first_approval_at <= j.l2_tat_due_at)
          )::int AS on_time_approvals,
          COUNT(*) FILTER (
            WHERE cardinality(COALESCE(j.approval_l2_user_ids, ARRAY[]::int[])) > 0
              AND (
                (j.first_approval_at IS NOT NULL AND j.l2_tat_due_at IS NOT NULL AND j.first_approval_at > j.l2_tat_due_at)
                OR (j.first_approval_at IS NULL AND j.l2_tat_due_at IS NOT NULL AND NOW() > j.l2_tat_due_at)
              )
          )::int AS delayed_approvals
        FROM j
        `,
        queryParams
      ),
      client.query(
        `
        WITH actions AS (
          SELECT
            tl.ticket_id,
            MIN(tl.created_at) FILTER (WHERE UPPER(tl.action) IN ('SUBMITTED', 'RESUBMITTED')) AS first_submission_at,
            COUNT(*) FILTER (WHERE UPPER(tl.action) LIKE '%REJECTED%') AS rejected_count
          FROM ticketing_system.ticket_logs tl
          GROUP BY tl.ticket_id
        ),
        scoped_tickets AS (
          SELECT ot.*
          FROM ticketing_system.operator_tickets ot
          WHERE ot.created_at >= $1::timestamptz
            AND ot.created_at <= $2::timestamptz
            AND ($3::text IS NULL OR LOWER(TRIM(COALESCE(ot.management_field, ''))) = LOWER(TRIM($3::text)))
            AND ($4::text IS NULL OR LOWER(TRIM(COALESCE(ot.erp_product_code, ''))) = LOWER(TRIM($4::text)))
            AND ($5::text IS NULL OR LOWER(TRIM(COALESCE(ot.machine_name, ''))) = LOWER(TRIM($5::text)))
        )
        SELECT
          u.id AS user_id,
          COALESCE(NULLIF(TRIM(u.full_name), ''), 'User ' || u.id::text) AS name,
          COUNT(st.ticket_id) FILTER (
            WHERE st.user_id = u.id OR u.id = ANY(COALESCE(st.approval_l1_user_ids, ARRAY[]::int[]))
          )::int AS total_tasks,
          COUNT(st.ticket_id) FILTER (
            WHERE (st.user_id = u.id OR u.id = ANY(COALESCE(st.approval_l1_user_ids, ARRAY[]::int[])))
              AND (
                UPPER(COALESCE(st.status, '')) = 'CLOSED'
                OR (a.first_submission_at IS NOT NULL AND COALESCE(a.rejected_count, 0) = 0)
              )
          )::int AS completed,
          COUNT(st.ticket_id) FILTER (
            WHERE (st.user_id = u.id OR u.id = ANY(COALESCE(st.approval_l1_user_ids, ARRAY[]::int[])))
              AND UPPER(COALESCE(st.status, '')) NOT IN ('CLOSED', 'RESOLVED', 'APPROVED')
          )::int AS pending
        FROM users.user_details u
        LEFT JOIN scoped_tickets st
          ON st.user_id = u.id OR u.id = ANY(COALESCE(st.approval_l1_user_ids, ARRAY[]::int[]))
        LEFT JOIN actions a ON a.ticket_id = st.ticket_id
        WHERE UPPER(COALESCE(u.level, '')) = 'L1'
        GROUP BY u.id, u.full_name
        ORDER BY completed DESC, total_tasks DESC, name ASC
        LIMIT 25
        `,
        queryParams
      )
    ]);

    const l1 = l1Result.rows[0] || {};
    const l2 = l2Result.rows[0] || {};
    const submissionEfficiency = pct(l1.on_time_submissions, l1.allocated_submissions);
    const resolutionEfficiency = pct(l1.on_time_resolutions, l1.allocated_tickets);
    const firstTimeApprovalRate = pct(l1.first_time_approved, l1.allocated_tickets);
    const approvalEfficiency = pct(l2.on_time_approvals, l2.allocated_tickets);

    return res.status(200).json({
      period: periodInput,
      period_key: period,
      range: bounds,
      filter: getAnalyticsFilterResponse({ department, subDepartment, notebook }),
      l1: {
        title: 'L1 - Team Performance Analysis',
        submission_stats: {
          allocated_submissions: Number(l1.allocated_submissions || 0),
          on_time_submissions: Number(l1.on_time_submissions || 0),
          delayed_submissions: Number(l1.delayed_submissions || 0),
          reworked_submissions: Number(l1.reworked_submissions || 0),
          submission_efficiency: submissionEfficiency
        },
        ticketing_stats: {
          allocated_tickets: Number(l1.allocated_tickets || 0),
          on_time_resolutions: Number(l1.on_time_resolutions || 0),
          delayed_resolutions: Number(l1.delayed_resolutions || 0),
          reworked_resolutions: Number(l1.reworked_resolutions || 0),
          resolution_efficiency: resolutionEfficiency,
          first_time_approval_rate: firstTimeApprovalRate
        },
        metrics: {
          submission_efficiency: submissionEfficiency,
          resolution_efficiency: resolutionEfficiency,
          first_time_approval_rate: firstTimeApprovalRate,
          average_efficiency: Number(((submissionEfficiency + resolutionEfficiency) / 2).toFixed(4))
        }
      },
      l2: {
        title: 'L2 - Team Performance Analysis',
        approval_stats: {
          allocated_tickets: Number(l2.allocated_tickets || 0),
          on_time_approvals: Number(l2.on_time_approvals || 0),
          delayed_approvals: Number(l2.delayed_approvals || 0),
          approval_efficiency: approvalEfficiency
        },
        metrics: {
          approval_efficiency: approvalEfficiency
        }
      },
      team_members_performance: memberResult.rows.map((row, index) => ({
        rank: index + 1,
        user_id: Number(row.user_id),
        name: row.name,
        total_tasks: Number(row.total_tasks || 0),
        completed: Number(row.completed || 0),
        pending: Number(row.pending || 0),
        completion_rate: pct(row.completed, row.total_tasks)
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/ranking', async (req, res, next) => {
  try {
    const periodInput = String(req.query.period || 'today').trim().toLowerCase();
    if (!PERIODS.has(periodInput)) return res.status(400).json({ message: 'Invalid period' });
    const period = normalizePeriod(periodInput);

    const bounds = periodBounds({
      period,
      startDate: req.query.start_date || req.query.from_date || req.query.custom_from,
      endDate: req.query.end_date || req.query.to_date || req.query.custom_to
    });
    if (!bounds) return res.status(400).json({ message: 'Valid start_date and end_date are required for custom period' });
    const { department, subDepartment, notebook } = getAnalyticsFilters(req.query);

    const result = await client.query(
      `
      WITH base AS (
        SELECT
          u.id AS user_id,
          u.full_name,
          u.department AS user_department,
          MIN(NULLIF(TRIM(ot.management_field), '')) AS ticket_department,
          MIN(NULLIF(TRIM(ot.erp_product_code), '')) AS ticket_sub_department,
          COUNT(*) FILTER (WHERE ot.user_id = u.id)::int AS allocated_submissions,
          COUNT(*) FILTER (WHERE u.id = ANY(COALESCE(ot.approval_l1_user_ids, ARRAY[]::int[])))::int AS allocated_tickets
        FROM users.user_details u
        LEFT JOIN ticketing_system.operator_tickets ot
          ON ot.created_at >= $1::timestamptz
         AND ot.created_at <= $2::timestamptz
         AND ($3::text IS NULL OR LOWER(TRIM(COALESCE(ot.management_field, ''))) = LOWER(TRIM($3::text)))
         AND ($4::text IS NULL OR LOWER(TRIM(COALESCE(ot.erp_product_code, ''))) = LOWER(TRIM($4::text)))
         AND ($5::text IS NULL OR LOWER(TRIM(COALESCE(ot.machine_name, ''))) = LOWER(TRIM($5::text)))
        WHERE UPPER(COALESCE(u.level, '')) = 'L1'
        GROUP BY u.id, u.full_name, u.department
      ),
      actions AS (
        SELECT
          tl.ticket_id,
          MIN(tl.created_at) FILTER (WHERE UPPER(tl.action) IN ('SUBMITTED', 'RESUBMITTED')) AS first_submission_at,
          MIN(tl.created_at) FILTER (WHERE UPPER(tl.action) LIKE '%APPROVED%' OR UPPER(tl.action) LIKE '%REJECTED%') AS first_resolution_at
        FROM ticketing_system.ticket_logs tl
        GROUP BY tl.ticket_id
      ),
      sub AS (
        SELECT
          ot.user_id,
          COUNT(*) FILTER (WHERE a.first_submission_at IS NOT NULL AND (ot.l1_tat_due_at IS NULL OR a.first_submission_at <= ot.l1_tat_due_at))::int AS on_time_submissions
        FROM ticketing_system.operator_tickets ot
        LEFT JOIN actions a ON a.ticket_id = ot.ticket_id
        WHERE ot.created_at >= $1::timestamptz
          AND ot.created_at <= $2::timestamptz
          AND ($3::text IS NULL OR LOWER(TRIM(COALESCE(ot.management_field, ''))) = LOWER(TRIM($3::text)))
          AND ($4::text IS NULL OR LOWER(TRIM(COALESCE(ot.erp_product_code, ''))) = LOWER(TRIM($4::text)))
          AND ($5::text IS NULL OR LOWER(TRIM(COALESCE(ot.machine_name, ''))) = LOWER(TRIM($5::text)))
        GROUP BY ot.user_id
      ),
      reso AS (
        SELECT
          u.id AS user_id,
          COUNT(*) FILTER (WHERE a.first_resolution_at IS NOT NULL AND (ot.l1_tat_due_at IS NULL OR a.first_resolution_at <= ot.l1_tat_due_at))::int AS on_time_resolutions
        FROM users.user_details u
        JOIN ticketing_system.operator_tickets ot
          ON u.id = ANY(COALESCE(ot.approval_l1_user_ids, ARRAY[]::int[]))
        LEFT JOIN actions a ON a.ticket_id = ot.ticket_id
        WHERE ot.created_at >= $1::timestamptz
          AND ot.created_at <= $2::timestamptz
          AND ($3::text IS NULL OR LOWER(TRIM(COALESCE(ot.management_field, ''))) = LOWER(TRIM($3::text)))
          AND ($4::text IS NULL OR LOWER(TRIM(COALESCE(ot.erp_product_code, ''))) = LOWER(TRIM($4::text)))
          AND ($5::text IS NULL OR LOWER(TRIM(COALESCE(ot.machine_name, ''))) = LOWER(TRIM($5::text)))
          AND UPPER(COALESCE(u.level, '')) = 'L1'
        GROUP BY u.id
      )
      SELECT
        b.user_id,
        b.full_name,
        COALESCE(b.ticket_department, b.user_department) AS department,
        b.ticket_sub_department AS sub_department,
        b.allocated_submissions,
        COALESCE(s.on_time_submissions, 0)::int AS on_time_submissions,
        b.allocated_tickets,
        COALESCE(r.on_time_resolutions, 0)::int AS on_time_resolutions
      FROM base b
      LEFT JOIN sub s ON s.user_id = b.user_id
      LEFT JOIN reso r ON r.user_id = b.user_id
      ORDER BY b.full_name ASC
      `,
      [bounds.start, bounds.end, department, subDepartment, notebook]
    );

    const rankings = result.rows.map((row) => {
      const submissionEfficiency = pct(row.on_time_submissions, row.allocated_submissions);
      const resolutionEfficiency = pct(row.on_time_resolutions, row.allocated_tickets);
      const averageEfficiency = Number(((submissionEfficiency + resolutionEfficiency) / 2).toFixed(4));
      return {
        user_id: row.user_id,
        name: row.full_name,
        full_name: row.full_name,
        department: row.department,
        sub_department: row.sub_department,
        submission_efficiency: submissionEfficiency,
        resolution_efficiency: resolutionEfficiency,
        average_efficiency: averageEfficiency
      };
    }).sort((a, b) => b.average_efficiency - a.average_efficiency);

    return res.status(200).json({
      period: periodInput,
      period_key: period,
      range: bounds,
      filter: getAnalyticsFilterResponse({ department, subDepartment, notebook }),
      quadrant_axes: {
        x: 'submission_efficiency',
        y: 'resolution_efficiency'
      },
      ranking: rankings
    });
  } catch (error) {
    next(error);
  }
});

router.post('/snapshot', async (req, res, next) => {
  try {
    const period = String(req.body?.period || 'today').trim().toLowerCase();
    if (!PERIODS.has(period)) return res.status(400).json({ message: 'Invalid period' });

    const bounds = periodBounds({
      period,
      startDate: req.body?.start_date,
      endDate: req.body?.end_date
    });
    if (!bounds) return res.status(400).json({ message: 'Valid start_date and end_date are required for custom period' });

    const createdBy = parsePositiveInt(req.user?.id);
    const payload = {
      period,
      range: bounds,
      l1: req.body?.l1 || null,
      l2: req.body?.l2 || null,
      ranking: req.body?.ranking || []
    };

    const save = await client.query(
      `
      INSERT INTO ticketing_system.analysis_snapshots (period_key, start_at, end_at, payload, created_by_user_id)
      VALUES ($1, $2::timestamptz, $3::timestamptz, $4::jsonb, $5)
      RETURNING id, period_key, start_at, end_at, created_at
      `,
      [period, bounds.start, bounds.end, payload, createdBy]
    );

    const subscribers = await client.query(
      `
      SELECT user_id
      FROM ticketing_system.analysis_notification_subscriptions
      WHERE is_active = true
      `,
      []
    );

    for (const row of subscribers.rows) {
      await client.query(
        `
        INSERT INTO ticketing_system.analysis_notification_events
        (user_id, title, body, payload)
        VALUES ($1, $2, $3, $4::jsonb)
        `,
        [
          row.user_id,
          `Analysis updated (${period})`,
          `New analysis snapshot is available for ${period} range.`,
          {
            snapshot_id: save.rows[0].id,
            period,
            range: bounds
          }
        ]
      );
    }

    return res.status(201).json({
      message: 'Analysis snapshot saved',
      snapshot: save.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

router.get('/notifications', async (req, res, next) => {
  try {
    const userId = parsePositiveInt(req.user?.id);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    const rows = await client.query(
      `
      SELECT id, title, body, payload, is_read, created_at, read_at
      FROM ticketing_system.analysis_notification_events
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 12
      `,
      [userId]
    );

    return res.status(200).json({ notifications: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.patch('/notifications/:id/read', async (req, res, next) => {
  try {
    const userId = parsePositiveInt(req.user?.id);
    const id = parsePositiveInt(req.params.id);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    if (!id) return res.status(400).json({ message: 'Valid notification id is required' });

    const updated = await client.query(
      `
      UPDATE ticketing_system.analysis_notification_events
      SET is_read = true, read_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING id, is_read, read_at
      `,
      [id, userId]
    );
    if (!updated.rows.length) return res.status(404).json({ message: 'Notification not found' });
    return res.status(200).json({ success: true, notification: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/subscriptions', async (req, res, next) => {
  try {
    const userId = parsePositiveInt(req.user?.id);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    const rows = await client.query(
      `
      SELECT id, channel, target_level, is_active, created_at, updated_at
      FROM ticketing_system.analysis_notification_subscriptions
      WHERE user_id = $1
      ORDER BY id DESC
      `,
      [userId]
    );
    return res.status(200).json({ subscriptions: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/subscriptions', async (req, res, next) => {
  try {
    const userId = parsePositiveInt(req.user?.id);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    const channel = String(req.body?.channel || 'app_push').trim().toLowerCase();
    const targetLevel = String(req.body?.target_level || 'ALL').trim().toUpperCase();
    const isActive = req.body?.is_active === undefined ? true : Boolean(req.body.is_active);

    if (!['app_push'].includes(channel)) return res.status(400).json({ message: 'Unsupported channel' });
    if (!['L1', 'L2', 'L3', 'ALL'].includes(targetLevel)) return res.status(400).json({ message: 'target_level must be L1, L2, L3 or ALL' });

    const upsert = await client.query(
      `
      INSERT INTO ticketing_system.analysis_notification_subscriptions
      (user_id, channel, target_level, is_active, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (user_id, channel, target_level)
      DO UPDATE SET
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id, user_id, channel, target_level, is_active, created_at, updated_at
      `,
      [userId, channel, targetLevel, isActive]
    );

    return res.status(201).json({ success: true, subscription: upsert.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post('/dev/seed-sample-data', async (req, res, next) => {
  try {
    if (!isAdminUser(req)) {
      return res.status(403).json({ message: 'Only admin can seed test data' });
    }

    const requesterId = parsePositiveInt(req.user?.id);
    if (!requesterId) return res.status(401).json({ message: 'Authentication required' });

    const requestedCount = Number(req.body?.count);
    const sampleCount = Number.isInteger(requestedCount) && requestedCount > 0
      ? Math.min(requestedCount, 5000)
      : 120;
    const periodInput = String(req.body?.period || 'month').trim().toLowerCase();
    if (!PERIODS.has(periodInput)) return res.status(400).json({ message: 'Invalid period' });
    const period = normalizePeriod(periodInput);
    const bounds = periodBounds({
      period,
      startDate: req.body?.start_date || req.body?.from_date || req.body?.fromDate,
      endDate: req.body?.end_date || req.body?.to_date || req.body?.toDate
    });
    if (!bounds) return res.status(400).json({ message: 'Valid start_date and end_date are required for custom period' });

    const tatLevelMode = String(req.body?.tat_level_mode || 'mixed').trim().toUpperCase();
    const createNotifications = req.body?.create_notifications === undefined ? true : Boolean(req.body?.create_notifications);
    const l1UsersResult = await client.query(
      `
      SELECT
        id,
        COALESCE(NULLIF(TRIM(full_name), ''), 'User ' || id::text) AS display_name
      FROM users.user_details
      WHERE UPPER(COALESCE(level, '')) = 'L1'
      ORDER BY id ASC
      LIMIT 20
      `
    );
    const l1Users = l1UsersResult.rows.map((row) => ({
      id: Number(row.id),
      name: String(row.display_name || `User ${row.id}`)
    })).filter((u) => Number.isInteger(u.id) && u.id > 0);
    if (!l1Users.some((u) => u.id === requesterId)) {
      l1Users.unshift({
        id: requesterId,
        name: String(req.user?.full_name || req.user?.name || 'Test Admin')
      });
    }
    const l2UsersResult = await client.query(
      `
      SELECT
        id,
        COALESCE(NULLIF(TRIM(full_name), ''), 'User ' || id::text) AS display_name
      FROM users.user_details
      WHERE UPPER(COALESCE(level, '')) = 'L2'
      ORDER BY id ASC
      LIMIT 20
      `
    );
    const l2Users = l2UsersResult.rows.map((row) => ({
      id: Number(row.id),
      name: String(row.display_name || `User ${row.id}`)
    })).filter((u) => Number.isInteger(u.id) && u.id > 0);
    if (!l2Users.length) {
      l2Users.push({
        id: requesterId,
        name: String(req.user?.full_name || req.user?.name || 'Test Admin')
      });
    }

    const rangeStartMs = new Date(bounds.start).getTime();
    const rangeEndMs = new Date(bounds.end).getTime();
    const rangeSpanMs = Math.max(rangeEndMs - rangeStartMs, 1);
    const createdTicketIds = [];
    let notificationEventsCreated = 0;

    for (let i = 0; i < sampleCount; i += 1) {
      const createdAt = new Date(rangeStartMs + Math.floor((i / Math.max(sampleCount - 1, 1)) * rangeSpanMs));
      const dueL1 = new Date(createdAt.getTime() + 6 * 60 * 60 * 1000);
      const dueL2 = new Date(createdAt.getTime() + 12 * 60 * 60 * 1000);
      const ticketId = `TEST-${Date.now()}-${Math.floor(Math.random() * 1000000)}-${i + 1}`;
      const submissionDelayHours = (i % 5) + 1;
      const approvalDelayHours = (i % 7) + 2;
      const submitAt = new Date(createdAt.getTime() + submissionDelayHours * 60 * 60 * 1000);
      const approveAt = new Date(createdAt.getTime() + approvalDelayHours * 60 * 60 * 1000);
      const makeDelayed = i % 4 === 0;
      const reworkCount = i % 5 === 0 ? 2 : (i % 3 === 0 ? 1 : 0);
      const makeReopened = reworkCount > 0;
      const status = i % 4 === 0 ? 'OPEN' : 'CLOSED';
      const tatCurrentLevel = tatLevelMode === 'L1'
        ? 'L1'
        : tatLevelMode === 'L2'
          ? 'L2'
          : (i % 2 === 0 ? 'L1' : 'L2');
      const owner = l1Users[i % l1Users.length];
      const approverPrimary = l1Users[(i + 1) % l1Users.length];
      const approverSecondary = l1Users[(i + 2) % l1Users.length];
      const approvalL1Ids = Array.from(new Set([approverPrimary.id, approverSecondary.id]));
      const l2Primary = l2Users[i % l2Users.length];
      const l2Secondary = l2Users[(i + 1) % l2Users.length];
      const approvalL2Ids = Array.from(new Set([l2Primary.id, l2Secondary.id]));
      const createdByName = String(req.user?.full_name || req.user?.name || 'Test Admin');

      await client.query(
        `
        INSERT INTO ticketing_system.operator_tickets
        (ticket_id, user_id, user_name, machine_name, parameter_name, actual_value, threshold_value, severity, status, created_at, approval_l1_user_ids, approval_l2_user_ids, tat_current_level, l1_tat_due_at, l2_tat_due_at)
        VALUES
        ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10::timestamptz, $11::int[], $12::int[], $13, $14::timestamptz, $15::timestamptz)
        `,
        [
          ticketId,
          owner.id,
          owner.name,
          `MACHINE-${(i % 5) + 1}`,
          JSON.stringify({ count: (i % 3) + 1 }),
          JSON.stringify({ value: 10 + (i % 7) }),
          JSON.stringify({ max: 9 }),
          i % 2 === 0 ? 'Medium' : 'High',
          status,
          createdAt.toISOString(),
          approvalL1Ids,
          approvalL2Ids,
          tatCurrentLevel,
          new Date(dueL1.getTime() + (makeDelayed ? -2 : 2) * 60 * 60 * 1000).toISOString(),
          new Date(dueL2.getTime() + (makeDelayed ? -3 : 3) * 60 * 60 * 1000).toISOString()
        ]
      );

      await client.query(
        `
        INSERT INTO ticketing_system.ticket_logs (ticket_id, action, performed_by, role, created_at)
        VALUES ($1, 'SUBMITTED', $2, $3, $4::timestamptz)
        `,
        [ticketId, createdByName, String(req.user?.role || 'admin'), submitAt.toISOString()]
      );

      for (let r = 0; r < reworkCount; r += 1) {
        const retryAt = new Date(submitAt.getTime() + ((r + 1) * 30) * 60 * 1000);
        await client.query(
          `
          INSERT INTO ticketing_system.ticket_logs (ticket_id, action, performed_by, role, created_at)
          VALUES ($1, 'RESUBMITTED', $2, $3, $4::timestamptz)
          `,
          [ticketId, createdByName, String(req.user?.role || 'admin'), retryAt.toISOString()]
        );
      }

      await client.query(
        `
        INSERT INTO ticketing_system.ticket_logs (ticket_id, action, performed_by, role, created_at)
        VALUES ($1, $2, $3, $4, $5::timestamptz)
        `,
        [ticketId, reworkCount > 0 ? 'REJECTED' : 'APPROVED', createdByName, String(req.user?.role || 'admin'), approveAt.toISOString()]
      );
      if (reworkCount > 0) {
        const finalApproveAt = new Date(approveAt.getTime() + (reworkCount * 45 * 60 * 1000));
        await client.query(
          `
          INSERT INTO ticketing_system.ticket_logs (ticket_id, action, performed_by, role, created_at)
          VALUES ($1, 'APPROVED', $2, $3, $4::timestamptz)
          `,
          [ticketId, createdByName, String(req.user?.role || 'admin'), finalApproveAt.toISOString()]
        );
      }

      if (createNotifications) {
        const notifyUserId = approvalL1Ids[0] || owner.id;
        await client.query(
          `
          INSERT INTO ticketing_system.analysis_notification_events
          (user_id, title, body, payload)
          VALUES ($1, $2, $3, $4::jsonb)
          `,
          [
            notifyUserId,
            'New seeded ticket available',
            `Seeded ticket ${ticketId} created for analysis.`,
            {
              ticket_id: ticketId,
              level: tatCurrentLevel,
              created_at: createdAt.toISOString(),
              source: 'seed-sample-data'
            }
          ]
        );
        notificationEventsCreated += 1;
      }

      createdTicketIds.push(ticketId);
    }

    return res.status(201).json({
      message: 'Sample analysis test data created',
      seeded_by_user_id: requesterId,
      period: periodInput,
      period_key: period,
      range: bounds,
      tat_level_mode: tatLevelMode,
      notifications_created: notificationEventsCreated,
      created_ticket_count: createdTicketIds.length,
      ticket_ids: createdTicketIds
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

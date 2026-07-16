const express = require('express');
const router = express.Router();
const client = require('../connection');
const auth = require('../middleware/auth');
const { createNotification, ensureNotificationMetadataColumns } = require('../utils/notifications');

const MAX_LIMIT = 100;

const parsePositiveInt = (value, fallback = null) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const cleanText = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

const parseBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'read'].includes(normalized)) return true;
  if (['false', '0', 'no', 'unread'].includes(normalized)) return false;
  return fallback;
};

const isAdminUser = (req) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  const employeeId = String(req.user?.employee_id || '').trim().toUpperCase();
  return role === 'admin' || role === 'super admin' || role === 'superadmin' || employeeId === 'ADMIN001';
};

const resolveRequestedUserId = (req) => {
  const loggedInUserId = parsePositiveInt(req.user?.id);
  const requestedUserId = parsePositiveInt(req.query.user_id || req.body?.user_id, loggedInUserId);

  if (requestedUserId !== loggedInUserId && !isAdminUser(req)) {
    const error = new Error('Only admins can view or manage another user notifications');
    error.statusCode = 403;
    throw error;
  }

  return requestedUserId;
};

const normalizeCategoryFilter = (value) => {
  const text = cleanText(value);
  if (text === 'Ticket') return 'Tickets';
  if (text === 'Report') return 'Reports';
  if (text === 'Threshold') return 'Thresholds';
  return text;
};

router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    await ensureNotificationMetadataColumns();
    const userId = resolveRequestedUserId(req);
    const page = parsePositiveInt(req.query.page, 1);
    const requestedLimit = parsePositiveInt(req.query.limit, 20);
    const limit = Math.min(requestedLimit, MAX_LIMIT);
    const offset = (page - 1) * limit;
    const unreadOnly = parseBool(req.query.unread_only, false);

    const values = [userId];
    const ticketWhere = ['n.recipient_user_id = $1'];
    const analysisWhere = ['ane.user_id = $1'];

    if (unreadOnly) {
      ticketWhere.push("n.status = 'UNREAD'");
      analysisWhere.push('ane.is_read = false');
    }

    const type = cleanText(req.query.type);
    if (type && type.toLowerCase() !== 'all') {
      values.push(type);
      ticketWhere.push(`n.notification_type = $${values.length}`);
      analysisWhere.push(`$${values.length} IN ('ANALYSIS', 'ANALYSIS_DIGEST', 'ANALYTICS')`);
    }

    const category = normalizeCategoryFilter(req.query.category);
    if (category && category.toLowerCase() !== 'all') {
      values.push(category);
      ticketWhere.push(`n.category = $${values.length}`);
      analysisWhere.push(`$${values.length} IN ('ANALYSIS', 'Reports')`);
    }

    const priority = cleanText(req.query.priority);
    if (priority && priority.toLowerCase() !== 'all') {
      values.push(priority);
      ticketWhere.push(`n.priority = $${values.length}`);
      analysisWhere.push(`$${values.length} = 'Medium'`);
    }

    const countResult = await client.query(
      `
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT n.id
        FROM ticketing_system.notifications n
        WHERE ${ticketWhere.join(' AND ')}
        UNION ALL
        SELECT ane.id
        FROM ticketing_system.analysis_notification_events ane
        WHERE ${analysisWhere.join(' AND ')}
      ) all_notifications
      `,
      values
    );

    const unreadCountResult = await client.query(
      `
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT n.id
        FROM ticketing_system.notifications n
        WHERE n.recipient_user_id = $1 AND n.status = 'UNREAD'
        UNION ALL
        SELECT ane.id
        FROM ticketing_system.analysis_notification_events ane
        WHERE ane.user_id = $1 AND ane.is_read = false
      ) unread_notifications
      `,
      [userId]
    );

    values.push(limit, offset);
    const rows = await client.query(
      `
      SELECT *
      FROM (
        SELECT
          'ticket' AS source,
          n.id,
          n.notification_id,
          n.ticket_id,
          n.notification_type AS type,
          n.category,
          n.priority,
          n.status,
          (n.status = 'UNREAD') AS is_unread,
          n.recipient_user_id AS user_id,
          COALESCE(n.title, concat(n.category, ': ', n.notification_type)) AS title,
          COALESCE(n.body, concat(n.notification_type, ' update for ', COALESCE(n.ticket_id, 'this item'))) AS body,
          n.link_url,
          COALESCE(n.payload, '{}'::jsonb) || jsonb_build_object(
            'ticket_id', n.ticket_id,
            'notification_type', n.notification_type
          ) AS payload,
          n.sent_at AS created_at,
          n.read_at
        FROM ticketing_system.notifications n
        WHERE ${ticketWhere.join(' AND ')}

        UNION ALL

        SELECT
          'analysis' AS source,
          ane.id,
          concat('AN-', ane.id::text) AS notification_id,
          NULL::text AS ticket_id,
          'ANALYSIS' AS type,
          'Reports' AS category,
          'Medium' AS priority,
          CASE WHEN ane.is_read THEN 'READ' ELSE 'UNREAD' END AS status,
          (ane.is_read = false) AS is_unread,
          ane.user_id,
          ane.title,
          ane.body,
          NULL::text AS link_url,
          ane.payload,
          ane.created_at,
          ane.read_at
        FROM ticketing_system.analysis_notification_events ane
        WHERE ${analysisWhere.join(' AND ')}
      ) notifications
      ORDER BY created_at DESC, id DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
      `,
      values
    );

    return res.status(200).json({
      notifications: rows.rows,
      unread_count: unreadCountResult.rows[0]?.total || 0,
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

router.patch('/:source/:id/read', async (req, res, next) => {
  try {
    const userId = resolveRequestedUserId(req);
    const id = parsePositiveInt(req.params.id);
    const source = cleanText(req.params.source);
    if (!id || !['ticket', 'analysis'].includes(source)) {
      return res.status(400).json({ message: 'Valid notification source and id are required' });
    }

    const result = source === 'ticket'
      ? await client.query(
        `
        UPDATE ticketing_system.notifications
        SET status = 'READ', read_at = COALESCE(read_at, NOW())
        WHERE id = $1 AND recipient_user_id = $2
        RETURNING id, notification_id, ticket_id, notification_type AS type, category, priority,
                  title, body, link_url, payload, status, sent_at AS created_at, read_at
        `,
        [id, userId]
      )
      : await client.query(
        `
        UPDATE ticketing_system.analysis_notification_events
        SET is_read = true, read_at = COALESCE(read_at, NOW())
        WHERE id = $1 AND user_id = $2
        RETURNING id, concat('AN-', id::text) AS notification_id, title, body, payload,
                  CASE WHEN is_read THEN 'READ' ELSE 'UNREAD' END AS status, created_at, read_at
        `,
        [id, userId]
      );

    if (!result.rows.length) return res.status(404).json({ message: 'Notification not found' });
    return res.status(200).json({ success: true, notification: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post('/test', async (req, res, next) => {
  try {
    const userId = resolveRequestedUserId(req);
    const notification = await createNotification({
      recipientUserId: userId,
      ticketId: null,
      type: cleanText(req.body?.type) || 'TEST',
      category: cleanText(req.body?.category) || 'Tickets',
      priority: cleanText(req.body?.priority) || 'Medium',
      title: cleanText(req.body?.title) || 'Test notification',
      body: cleanText(req.body?.body) || 'This is a test app notification',
      linkUrl: cleanText(req.body?.link_url),
      payload: {
        source: 'manual_backend_test',
        ...(req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {})
      }
    });

    return res.status(201).json({
      success: true,
      notification
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    const userId = resolveRequestedUserId(req);

    const ticketResult = await client.query(
      `
      UPDATE ticketing_system.notifications
      SET status = 'READ', read_at = COALESCE(read_at, NOW())
      WHERE recipient_user_id = $1 AND status = 'UNREAD'
      RETURNING id
      `,
      [userId]
    );

    const analysisResult = await client.query(
      `
      UPDATE ticketing_system.analysis_notification_events
      SET is_read = true, read_at = COALESCE(read_at, NOW())
      WHERE user_id = $1 AND is_read = false
      RETURNING id
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      updated_count: ticketResult.rowCount + analysisResult.rowCount
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

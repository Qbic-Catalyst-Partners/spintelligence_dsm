const client = require('../connection');

const NOTIFICATION_CATEGORIES = new Set(['Tickets', 'Thresholds', 'Reports', 'System', 'Data Entry', 'OCR']);
const NOTIFICATION_PRIORITIES = new Set(['Critical', 'High', 'Medium', 'Low']);

const cleanText = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

const parsePositiveInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const toJson = (value) => JSON.stringify(value && typeof value === 'object' ? value : {});

const normalizeCategory = (value, fallback = 'System') => {
  const text = cleanText(value);
  if (text === 'Ticket') return 'Tickets';
  if (text === 'Report') return 'Reports';
  if (text === 'Threshold') return 'Thresholds';
  return NOTIFICATION_CATEGORIES.has(text) ? text : fallback;
};

const normalizePriority = (value, fallback = 'Medium') => {
  const text = cleanText(value);
  return NOTIFICATION_PRIORITIES.has(text) ? text : fallback;
};

let notificationMetadataColumnsReady = false;
let notificationMetadataColumnsPromise = null;

const runEnsureNotificationMetadataColumns = async () => {
  await client.query(`
    ALTER TABLE ticketing_system.notifications
      ADD COLUMN IF NOT EXISTS id BIGSERIAL
  `);

  await client.query(`
    DO $$
    DECLARE
      seq_name text;
    BEGIN
      SELECT pg_get_serial_sequence('ticketing_system.notifications', 'id') INTO seq_name;

      IF seq_name IS NULL THEN
        CREATE SEQUENCE IF NOT EXISTS ticketing_system.notifications_id_seq;
        ALTER TABLE ticketing_system.notifications
          ALTER COLUMN id SET DEFAULT nextval('ticketing_system.notifications_id_seq'::regclass);
        seq_name := 'ticketing_system.notifications_id_seq';
      END IF;

      WITH duplicates AS (
        SELECT ctid
        FROM (
          SELECT ctid, id, row_number() OVER (PARTITION BY id ORDER BY sent_at NULLS LAST, notification_id, ctid) AS rn
          FROM ticketing_system.notifications
        ) ranked
        WHERE id IS NULL OR rn > 1
      )
      UPDATE ticketing_system.notifications n
      SET id = nextval(seq_name::regclass)
      FROM duplicates d
      WHERE n.ctid = d.ctid;

      PERFORM setval(
        seq_name::regclass,
        GREATEST(
          COALESCE((SELECT MAX(id) FROM ticketing_system.notifications), 0),
          1
        ),
        true
      );

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'ticketing_system.notifications'::regclass
          AND contype = 'p'
      ) THEN
        ALTER TABLE ticketing_system.notifications
          ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
      END IF;
    END $$;
  `);

  await client.query(`
    ALTER TABLE ticketing_system.notifications
      ALTER COLUMN ticket_id DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS recipient_user_id integer NULL REFERENCES users.user_details(id),
      ADD COLUMN IF NOT EXISTS category varchar(50) NOT NULL DEFAULT 'Tickets',
      ADD COLUMN IF NOT EXISTS priority varchar(20) NOT NULL DEFAULT 'Medium',
      ADD COLUMN IF NOT EXISTS title text NULL,
      ADD COLUMN IF NOT EXISTS body text NULL,
      ADD COLUMN IF NOT EXISTS link_url text NULL,
      ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS read_at timestamptz NULL
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS notifications_recipient_status_idx
    ON ticketing_system.notifications (recipient_user_id, status, sent_at DESC)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS notifications_category_idx
    ON ticketing_system.notifications (category, notification_type)
  `);

  await client.query(`
    DELETE FROM ticketing_system.notifications n
    USING (
      SELECT ctid,
             ROW_NUMBER() OVER (
               PARTITION BY notification_id
               ORDER BY sent_at NULLS LAST, id NULLS LAST, ctid
             ) AS rn
      FROM ticketing_system.notifications
      WHERE notification_id IS NOT NULL
    ) d
    WHERE n.ctid = d.ctid
      AND d.rn > 1
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS notifications_notification_id_uq
    ON ticketing_system.notifications (notification_id)
  `);
};

const ensureNotificationMetadataColumns = async () => {
  if (notificationMetadataColumnsReady) return;

  if (!notificationMetadataColumnsPromise) {
    notificationMetadataColumnsPromise = runEnsureNotificationMetadataColumns()
      .then(() => {
        notificationMetadataColumnsReady = true;
      })
      .finally(() => {
        notificationMetadataColumnsPromise = null;
      });
  }

  return notificationMetadataColumnsPromise;
};

const buildNotificationId = (type, recipientUserId, ticketId = null) => {
  const safeTicket = cleanText(ticketId) ? String(ticketId).replace(/[^a-zA-Z0-9_-]/g, '') : 'GENERAL';
  const safeType = cleanText(type) ? String(type).replace(/[^a-zA-Z0-9_-]/g, '') : 'NOTICE';
  return `NT-${safeTicket}-${safeType}-${recipientUserId}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
};

const createNotification = async ({
  recipientUserId,
  ticketId,
  type,
  category = 'System',
  priority = 'Medium',
  title,
  body,
  linkUrl,
  payload = {},
  dedupeKey = null
}) => {
  const userId = parsePositiveInt(recipientUserId);
  const notificationType = cleanText(type);
  if (!userId || !notificationType) return null;

  await ensureNotificationMetadataColumns();

  const notificationId = cleanText(dedupeKey) || buildNotificationId(notificationType, userId, ticketId);
  const result = await client.query(
    `INSERT INTO ticketing_system.notifications
     (notification_id, ticket_id, notification_type, status, sent_at, recipient_user_id,
      category, priority, title, body, link_url, payload)
     VALUES ($1, $2, $3, 'UNREAD', NOW(), $4, $5, $6, $7, $8, $9, $10::jsonb)
     ON CONFLICT (notification_id) DO NOTHING
     RETURNING *`,
    [
      notificationId,
      cleanText(ticketId),
      notificationType,
      userId,
      normalizeCategory(category),
      normalizePriority(priority),
      cleanText(title) || notificationType,
      cleanText(body),
      cleanText(linkUrl),
      toJson(payload)
    ]
  );

  return result.rows[0] || null;
};

const createNotificationsForUsers = async (recipientUserIds = [], options = {}) => {
  const uniqueUserIds = Array.from(new Set(
    (Array.isArray(recipientUserIds) ? recipientUserIds : [])
      .map(parsePositiveInt)
      .filter(Boolean)
  ));

  const created = [];
  for (const userId of uniqueUserIds) {
    const notification = await createNotification({ ...options, recipientUserId: userId });
    if (notification) created.push(notification);
  }
  return created;
};

module.exports = {
  ensureNotificationMetadataColumns,
  createNotification,
  createNotificationsForUsers
};

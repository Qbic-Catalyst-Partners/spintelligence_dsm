INSERT INTO ticketing_system.notifications (
  notification_id,
  recipient_user_id,
  notification_type,
  category,
  priority,
  status,
  title,
  body,
  sent_at,
  payload
)
VALUES (
  'NT-GENERAL-TEST-7-20260604',
  7,
  'TEST',
  'Tickets',
  'Medium',
  'UNREAD',
  'Test notification',
  'This is a test app notification',
  NOW(),
  '{"source":"manual_backend_test"}'::jsonb
)
ON CONFLICT (notification_id)
DO UPDATE SET
  status = 'UNREAD',
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  category = EXCLUDED.category,
  priority = EXCLUDED.priority,
  payload = EXCLUDED.payload,
  sent_at = NOW();

SELECT id, notification_id, recipient_user_id, status, title
FROM ticketing_system.notifications
WHERE notification_id = 'NT-GENERAL-TEST-7-20260604';

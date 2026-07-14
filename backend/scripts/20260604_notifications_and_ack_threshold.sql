CREATE SCHEMA IF NOT EXISTS ticketing_system;

CREATE TABLE IF NOT EXISTS ticketing_system.notebook_acknowledgement_threshold (
  id BIGSERIAL PRIMARY KEY,
  screen_name TEXT NOT NULL,
  department TEXT NULL,
  sub_department TEXT NULL,
  acknowledge_within_hours INTEGER NOT NULL DEFAULT 24,
  is_active BOOLEAN NOT NULL DEFAULT true,
  approval_l2 TEXT NULL,
  approval_l2_name TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (screen_name, department, sub_department)
);

ALTER TABLE ticketing_system.notebook_acknowledgement_threshold
  ADD COLUMN IF NOT EXISTS acknowledge_within_hours INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS approval_l2 TEXT NULL,
  ADD COLUMN IF NOT EXISTS approval_l2_name TEXT NULL;

CREATE INDEX IF NOT EXISTS notebook_ack_threshold_lookup_idx
ON ticketing_system.notebook_acknowledgement_threshold
(is_active, lower(trim(screen_name)), lower(trim(COALESCE(department, ''))), lower(trim(COALESCE(sub_department, ''))));

ALTER TABLE ticketing_system.notifications
  ADD COLUMN IF NOT EXISTS id BIGSERIAL;

ALTER TABLE ticketing_system.notifications
  ALTER COLUMN ticket_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS recipient_user_id integer NULL REFERENCES users.user_details(id),
  ADD COLUMN IF NOT EXISTS category varchar(50) NOT NULL DEFAULT 'Tickets',
  ADD COLUMN IF NOT EXISTS priority varchar(20) NOT NULL DEFAULT 'Medium',
  ADD COLUMN IF NOT EXISTS title text NULL,
  ADD COLUMN IF NOT EXISTS body text NULL,
  ADD COLUMN IF NOT EXISTS link_url text NULL,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS read_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS notifications_recipient_status_idx
ON ticketing_system.notifications (recipient_user_id, status, sent_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_id_uq
ON ticketing_system.notifications (id);

CREATE INDEX IF NOT EXISTS notifications_category_idx
ON ticketing_system.notifications (category, notification_type);

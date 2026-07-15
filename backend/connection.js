const { AsyncLocalStorage } = require('async_hooks');
const { Pool } = require('pg');
require('dotenv').config();

const dbTarget = (process.env.DB_TARGET || '').trim().toLowerCase();
const databaseUrl = (
  dbTarget === 'supabase'
    ? process.env.DATABASE_URL_SUPABASE
    : dbTarget === 'local'
      ? process.env.DATABASE_URL_LOCAL
      : process.env.DATABASE_URL
) || '';

const normalizedDatabaseUrl = databaseUrl.trim();

const fallbackLocalConnectionString = (() => {
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT;
  const dbName = process.env.DB_NAME;

  if (!user || !host || !port || !dbName) return '';
  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password || '');
  const auth = password ? `${encodedUser}:${encodedPassword}` : encodedUser;
  return `postgresql://${auth}@${host}:${port}/${encodeURIComponent(dbName)}`;
})();

const effectiveDatabaseUrl = normalizedDatabaseUrl || fallbackLocalConnectionString;
const isSupabaseUrl = effectiveDatabaseUrl.includes('supabase.co');
const supabaseDatabaseUrl = (process.env.DATABASE_URL_SUPABASE || '').trim();
const supabaseMirrorEnabled =
  process.env.SUPABASE_MIRROR_ENABLED !== 'false' &&
  Boolean(supabaseDatabaseUrl) &&
  !isSupabaseUrl &&
  supabaseDatabaseUrl !== effectiveDatabaseUrl;
const DB_QUERY_RETRY_ATTEMPTS = Number(process.env.DB_QUERY_RETRY_ATTEMPTS || (isSupabaseUrl ? 2 : 0));
const DB_QUERY_RETRY_DELAY_MS = Number(process.env.DB_QUERY_RETRY_DELAY_MS || 500);

function getConnectionString() {
  const raw = effectiveDatabaseUrl;
  if (!raw) return undefined;

  // Supabase works with TLS, but pg+sslmode parsing can force strict
  // certificate checks on some environments. We remove sslmode here and
  // control TLS behavior explicitly via the `ssl` option below.
  if (!isSupabaseUrl) return raw;

  try {
    const parsed = new URL(raw);
    parsed.searchParams.delete('sslmode');
    return parsed.toString();
  } catch (_) {
    return raw;
  }
}

function getPoolConnectionString(raw, isSupabase) {
  if (!raw) return undefined;
  if (!isSupabase) return raw;

  try {
    const parsed = new URL(raw);
    parsed.searchParams.delete('sslmode');
    return parsed.toString();
  } catch (_) {
    return raw;
  }
}

function createUrlPool(raw, isSupabase, optionPrefix = 'DB') {
  return new Pool({
    connectionString: getPoolConnectionString(raw, isSupabase),
    ssl: isSupabase ? { rejectUnauthorized: false } : (process.env[`${optionPrefix}_SSL`] === 'true'),
    max: Number(process.env[`${optionPrefix}_POOL_MAX`] || (isSupabase ? 5 : 20)),
    min: Number(process.env[`${optionPrefix}_POOL_MIN`] || (isSupabase ? 0 : 2)),
    idleTimeoutMillis: Number(process.env[`${optionPrefix}_IDLE_TIMEOUT_MS`] || (isSupabase ? 10000 : 30000)),
    connectionTimeoutMillis: Number(process.env[`${optionPrefix}_CONNECT_TIMEOUT_MS`] || 10000),
    statement_timeout: Number(process.env[`${optionPrefix}_STATEMENT_TIMEOUT_MS`] || 30000),
    keepAlive: true,
    keepAliveInitialDelayMillis: Number(process.env[`${optionPrefix}_KEEPALIVE_INITIAL_DELAY_MS`] || 10000),
    maxUses: Number(process.env[`${optionPrefix}_POOL_MAX_USES`] || (isSupabase ? 750 : 0))
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientDbConnectionError(err) {
  const code = err?.code || err?.cause?.code;
  const message = `${err?.message || ''} ${err?.cause?.message || ''}`.toLowerCase();

  return [
    'ENOTFOUND',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EAI_AGAIN',
    '57P01',
    '57P02',
    '57P03',
    '08000',
    '08003',
    '08006'
  ].includes(code) ||
    message.includes('connection terminated') ||
    message.includes('connection timeout') ||
    message.includes('terminating connection');
}

function canRetryQuery(command) {
  return ['SELECT', 'SHOW', 'WITH'].includes(command);
}

async function queryWithRetry(text, params, command) {
  const maxAttempts = Math.max(1, DB_QUERY_RETRY_ATTEMPTS + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      const shouldRetry =
        attempt < maxAttempts &&
        canRetryQuery(command) &&
        isTransientDbConnectionError(err);

      if (!shouldRetry) throw err;

      const delay = DB_QUERY_RETRY_DELAY_MS * attempt;
      const code = err?.code || err?.cause?.code || err?.message || 'unknown';
      console.warn(`[DB Query] transient ${code}; retrying ${command} query (${attempt}/${maxAttempts - 1}) in ${delay}ms`);
      await sleep(delay);
    }
  }

  throw new Error('DB query retry loop exited unexpectedly');
}

const pool = new Pool(
  effectiveDatabaseUrl
    ? {
        connectionString: getConnectionString(),
        ssl: isSupabaseUrl ? { rejectUnauthorized: false } : (process.env.DB_SSL === 'true'),
        max: Number(process.env.DB_POOL_MAX || (isSupabaseUrl ? 5 : 20)),
        min: Number(process.env.DB_POOL_MIN || (isSupabaseUrl ? 0 : 2)),
        idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || (isSupabaseUrl ? 10000 : 30000)),
        connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
        statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 30000),
        keepAlive: true,
        keepAliveInitialDelayMillis: Number(process.env.DB_KEEPALIVE_INITIAL_DELAY_MS || 10000),
        maxUses: Number(process.env.DB_POOL_MAX_USES || (isSupabaseUrl ? 750 : 0))
      }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT),
        ssl: process.env.DB_SSL === 'true',
        max: Number(process.env.DB_POOL_MAX || 20),
        min: Number(process.env.DB_POOL_MIN || 2),
        idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
        connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
        statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 30000),
        keepAlive: true,
        keepAliveInitialDelayMillis: Number(process.env.DB_KEEPALIVE_INITIAL_DELAY_MS || 10000),
        maxUses: Number(process.env.DB_POOL_MAX_USES || 0)
      }
);

const supabaseMirrorPool = supabaseMirrorEnabled
  ? createUrlPool(supabaseDatabaseUrl, true, 'SUPABASE_MIRROR')
  : null;

const requestContext = new AsyncLocalStorage();

function getCommand(queryText) {
  if (typeof queryText !== 'string') return '';
  return queryText.trim().split(/\s+/)[0].toUpperCase();
}

function shouldMirrorQuery(command, text) {
  if (!supabaseMirrorPool) return false;
  if (command === 'WITH') return /\b(INSERT|UPDATE|DELETE|MERGE)\b/i.test(String(text || ''));
  return [
    'INSERT',
    'UPDATE',
    'DELETE',
    'UPSERT',
    'MERGE',
    'CREATE',
    'ALTER',
    'DROP',
    'TRUNCATE',
    'COMMENT',
    'GRANT',
    'REVOKE',
    'DO'
  ].includes(command);
}

async function mirrorQuery(text, params, ctx, command) {
  if (!supabaseMirrorPool) return;

  if (ctx?.mirrorTxClient) {
    try {
      await ctx.mirrorTxClient.query(text, params);
      if (command === 'COMMIT' || command === 'ROLLBACK') {
        ctx.mirrorTxClient.release();
        ctx.mirrorTxClient = null;
      }
    } catch (err) {
      if (command === 'COMMIT' || command === 'ROLLBACK') {
        ctx.mirrorTxClient?.release();
        ctx.mirrorTxClient = null;
      }
      throw err;
    }
    return;
  }

  if (command === 'BEGIN' && ctx) {
    ctx.mirrorTxClient = await supabaseMirrorPool.connect();
    await ctx.mirrorTxClient.query(text, params);
    return;
  }

  if (shouldMirrorQuery(command, text)) {
    await supabaseMirrorPool.query(text, params);
  }
}

const initPromise = (async () => {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS ticketing_system;
  `);

  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS users;
  `);

  await pool.query(`
    ALTER TABLE IF EXISTS users.user_details
      ADD COLUMN IF NOT EXISTS level varchar(5) NOT NULL DEFAULT 'L1';
  `);

  await pool.query(`
    UPDATE users.user_details
    SET level = 'L1'
    WHERE level IS NULL OR btrim(level) = '';
  `);

  await pool.query(`
    ALTER TABLE IF EXISTS users.user_details
      ADD COLUMN IF NOT EXISTS top_department varchar(50);
  `);

  await pool.query(`
    ALTER TABLE IF EXISTS users.user_details
      ADD COLUMN IF NOT EXISTS employee_type varchar(10);
  `);

  const mixingCreatedAtTables = [
    'mixing.cotton_hvi_data_entry',
    'mixing.fibre_data_entry',
    'mixing.afis_data_entry',
    'mixing.afis6_cotton_data_entry',
    'mixing.afis6_mmf_data_entry',
    'mixing.moisture_data_entry',
    'mixing.openness_inspection',
    'mixing.mixing_qc_header',
  ];
  for (const table of mixingCreatedAtTables) {
    await pool.query(`
      ALTER TABLE IF EXISTS ${table}
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);
  }

  await pool.query(`
    ALTER TABLE IF EXISTS mixing.afis6_cotton_data_entry
      ADD COLUMN IF NOT EXISTS sc_nep_count_g NUMERIC,
      ADD COLUMN IF NOT EXISTS crimp_percent NUMERIC;
  `);

  await pool.query(`
    ALTER TABLE IF EXISTS mixing.afis6_mmf_data_entry
      ADD COLUMN IF NOT EXISTS crimp_percent NUMERIC;
  `);

  await pool.query(`
    ALTER TABLE IF EXISTS blowroom.drop_test
      ADD COLUMN IF NOT EXISTS average_weight NUMERIC;
  `);

  await pool.query(`
    CREATE SEQUENCE IF NOT EXISTS ticketing_system.ticket_seq
      START WITH 1
      INCREMENT BY 1;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.operator_tickets (
      ticket_id text PRIMARY KEY,
      user_id integer NULL REFERENCES users.user_details(id),
      user_name varchar(255) NULL,
      machine_name varchar(255) NOT NULL,
      parameter_name jsonb NULL,
      actual_value jsonb NULL,
      threshold_value jsonb NULL,
      severity varchar(50) NOT NULL DEFAULT 'Medium',
      status varchar(50) NOT NULL DEFAULT 'Open',
      created_at timestamptz NOT NULL DEFAULT NOW(),
      management_field varchar(100) NULL,
      erp_product_code varchar(100) NULL,
      ticket_reason varchar(30) NULL,
      ticket_type varchar(50) NULL,
      violation_details jsonb NULL,
      approval_l1_user_id integer NULL REFERENCES users.user_details(id),
      approval_l2_user_id integer NULL REFERENCES users.user_details(id),
      approval_l3_user_id integer NULL,
      approval_l1_user_ids integer[] NULL,
      approval_l2_user_ids integer[] NULL,
      approval_l3_user_ids integer[] NULL,
      submission_frequency_config_id bigint NULL,
      tat_current_level text NULL,
      l1_tat_due_at timestamptz NULL,
      l2_tat_due_at timestamptz NULL,
      l3_tat_due_at timestamptz NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.notifications (
      id bigserial PRIMARY KEY,
      notification_id text NOT NULL UNIQUE,
      ticket_id text NOT NULL REFERENCES ticketing_system.operator_tickets(ticket_id) ON DELETE CASCADE,
      notification_type varchar(100) NOT NULL,
      status varchar(50) NOT NULL DEFAULT 'UNREAD',
      sent_at timestamptz NOT NULL DEFAULT NOW(),
      recipient_user_id integer NULL REFERENCES users.user_details(id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.ticket_logs (
      id bigserial PRIMARY KEY,
      ticket_id text NOT NULL REFERENCES ticketing_system.operator_tickets(ticket_id) ON DELETE CASCADE,
      action varchar(100) NOT NULL,
      performed_by varchar(255) NULL,
      role varchar(100) NULL,
      created_at timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.activity_logs (
      id bigserial PRIMARY KEY,
      user_id integer NULL REFERENCES users.user_details(id) ON DELETE SET NULL,
      user_name varchar(255) NULL,
      employee_id varchar(50) NULL,
      module varchar(100) NOT NULL,
      action varchar(100) NOT NULL,
      description text NULL,
      metadata jsonb NULL,
      ip_address varchar(100) NULL,
      user_agent text NULL,
      created_at timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.glossary_entries (
      id bigserial PRIMARY KEY,
      input_field varchar(150) NOT NULL,
      display_name varchar(200) NULL,
      description text NOT NULL,
      department varchar(100) NULL,
      sub_department varchar(100) NULL,
      input_screen varchar(150) NULL,
      example_value text NULL,
      unit varchar(50) NULL,
      is_active boolean NOT NULL DEFAULT true,
      created_by_user_id integer NULL REFERENCES users.user_details(id) ON DELETE SET NULL,
      updated_by_user_id integer NULL REFERENCES users.user_details(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.faq_entries (
      id bigserial PRIMARY KEY,
      question text NOT NULL,
      answer text NOT NULL,
      category varchar(100) NULL,
      display_order integer NOT NULL DEFAULT 0,
      is_active boolean NOT NULL DEFAULT true,
      created_by_user_id integer NULL REFERENCES users.user_details(id) ON DELETE SET NULL,
      updated_by_user_id integer NULL REFERENCES users.user_details(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.user_guide_entries (
      id bigserial PRIMARY KEY,
      title varchar(200) NOT NULL,
      slug varchar(220) NOT NULL UNIQUE,
      content text NOT NULL,
      section varchar(100) NULL,
      display_order integer NOT NULL DEFAULT 0,
      is_active boolean NOT NULL DEFAULT true,
      created_by_user_id integer NULL REFERENCES users.user_details(id) ON DELETE SET NULL,
      updated_by_user_id integer NULL REFERENCES users.user_details(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.analysis_snapshots (
      id bigserial PRIMARY KEY,
      period_key varchar(20) NOT NULL,
      start_at timestamptz NOT NULL,
      end_at timestamptz NOT NULL,
      payload jsonb NOT NULL,
      created_by_user_id integer NULL REFERENCES users.user_details(id),
      created_at timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.analysis_notification_subscriptions (
      id bigserial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users.user_details(id) ON DELETE CASCADE,
      channel varchar(20) NOT NULL DEFAULT 'app_push',
      target_level varchar(5) NOT NULL DEFAULT 'L1',
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, channel, target_level)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.analysis_notification_events (
      id bigserial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users.user_details(id) ON DELETE CASCADE,
      title varchar(200) NOT NULL,
      body text NOT NULL,
      payload jsonb NULL,
      is_read boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      read_at timestamptz NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.frontend_entry_registry (
      id bigserial PRIMARY KEY,
      entry_id text NOT NULL,
      module_name text,
      route_path text,
      method text,
      status text NOT NULL DEFAULT 'reserved',
      created_at timestamptz NOT NULL DEFAULT NOW(),
      committed_at timestamptz NULL,
      UNIQUE (entry_id)
    );
  `);

  await pool.query(`
    ALTER TABLE ticketing_system.frontend_entry_registry
      DROP CONSTRAINT IF EXISTS frontend_entry_registry_entry_id_key;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS frontend_entry_registry_route_entry_id_uq
    ON ticketing_system.frontend_entry_registry (COALESCE(route_path, ''), entry_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS frontend_entry_registry_module_idx
    ON ticketing_system.frontend_entry_registry (module_name, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS glossary_entries_filter_idx
    ON ticketing_system.glossary_entries (is_active, department, sub_department, input_screen, input_field);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS faq_entries_category_idx
    ON ticketing_system.faq_entries (is_active, category, display_order, id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS user_guide_entries_section_idx
    ON ticketing_system.user_guide_entries (is_active, section, display_order, id);
  `);

  await pool.query(`
    ALTER TABLE ticketing_system.operator_tickets
      ADD COLUMN IF NOT EXISTS user_id integer NULL REFERENCES users.user_details(id),
      ADD COLUMN IF NOT EXISTS user_name varchar(255) NULL,
      ADD COLUMN IF NOT EXISTS machine_name varchar(255),
      ADD COLUMN IF NOT EXISTS parameter_name jsonb NULL,
      ADD COLUMN IF NOT EXISTS actual_value jsonb NULL,
      ADD COLUMN IF NOT EXISTS threshold_value jsonb NULL,
      ADD COLUMN IF NOT EXISTS severity varchar(50) DEFAULT 'Medium',
      ADD COLUMN IF NOT EXISTS status varchar(50) DEFAULT 'Open',
      ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS management_field varchar(100),
      ADD COLUMN IF NOT EXISTS erp_product_code varchar(100),
      ADD COLUMN IF NOT EXISTS ticket_reason varchar(30),
      ADD COLUMN IF NOT EXISTS ticket_type varchar(50),
      ADD COLUMN IF NOT EXISTS violation_details jsonb,
      ADD COLUMN IF NOT EXISTS approval_l1_user_id integer REFERENCES users.user_details(id),
      ADD COLUMN IF NOT EXISTS approval_l2_user_id integer REFERENCES users.user_details(id),
      ADD COLUMN IF NOT EXISTS approval_l3_user_id integer,
      ADD COLUMN IF NOT EXISTS approval_l1_user_ids integer[],
      ADD COLUMN IF NOT EXISTS approval_l2_user_ids integer[],
      ADD COLUMN IF NOT EXISTS approval_l3_user_ids integer[],
      ADD COLUMN IF NOT EXISTS submission_frequency_config_id bigint NULL,
      ADD COLUMN IF NOT EXISTS tat_current_level text NULL,
      ADD COLUMN IF NOT EXISTS l1_tat_due_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS l2_tat_due_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS l3_tat_due_at timestamptz NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS operator_tickets_status_created_at_idx
    ON ticketing_system.operator_tickets (status, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS operator_tickets_submission_frequency_idx
    ON ticketing_system.operator_tickets (submission_frequency_config_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS notifications_ticket_id_idx
    ON ticketing_system.notifications (ticket_id);
  `);

  await pool.query(`
    ALTER TABLE ticketing_system.notifications
      ADD COLUMN IF NOT EXISTS id BIGSERIAL;
  `);

  await pool.query(`
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

  await pool.query(`
    ALTER TABLE ticketing_system.notifications
      ALTER COLUMN ticket_id DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS category varchar(50) NOT NULL DEFAULT 'Tickets',
      ADD COLUMN IF NOT EXISTS priority varchar(20) NOT NULL DEFAULT 'Medium',
      ADD COLUMN IF NOT EXISTS title text NULL,
      ADD COLUMN IF NOT EXISTS body text NULL,
      ADD COLUMN IF NOT EXISTS link_url text NULL,
      ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS read_at timestamptz NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS notifications_recipient_status_idx
    ON ticketing_system.notifications (recipient_user_id, status, sent_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS notifications_category_idx
    ON ticketing_system.notifications (category, notification_type);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.threshold_master (
      id bigserial PRIMARY KEY,
      management_field varchar(100),
      erp_product_code varchar(100),
      machine_name varchar(100) NOT NULL,
      parameter_name varchar(100),
      threshold_value numeric,
      department varchar(100),
      sub_department varchar(100),
      input_screen varchar(150),
      input_field varchar(100),
      condition_level varchar(30) NOT NULL DEFAULT 'More Than',
      plus_threshold numeric,
      minus_threshold numeric,
      actual_value varchar(100),
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE ticketing_system.threshold_master
      ADD COLUMN IF NOT EXISTS management_field varchar(100),
      ADD COLUMN IF NOT EXISTS erp_product_code varchar(100),
      ADD COLUMN IF NOT EXISTS machine_name varchar(100),
      ADD COLUMN IF NOT EXISTS parameter_name varchar(100),
      ADD COLUMN IF NOT EXISTS threshold_value numeric,
      ADD COLUMN IF NOT EXISTS department varchar(100),
      ADD COLUMN IF NOT EXISTS sub_department varchar(100),
      ADD COLUMN IF NOT EXISTS input_screen varchar(150),
      ADD COLUMN IF NOT EXISTS input_field varchar(100),
      ADD COLUMN IF NOT EXISTS condition_level varchar(30) DEFAULT 'More Than',
      ADD COLUMN IF NOT EXISTS plus_threshold numeric,
      ADD COLUMN IF NOT EXISTS minus_threshold numeric,
      ADD COLUMN IF NOT EXISTS actual_value varchar(100),
      ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS approval_l1_user_id integer REFERENCES users.user_details(id),
      ADD COLUMN IF NOT EXISTS approval_l2_user_id integer REFERENCES users.user_details(id),
      ADD COLUMN IF NOT EXISTS approval_l3_user_id integer,
      ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW();
  `);

  await pool.query(`
    UPDATE ticketing_system.threshold_master
    SET threshold_value = COALESCE(threshold_value, plus_threshold, minus_threshold),
        updated_at = COALESCE(updated_at, NOW())
    WHERE threshold_value IS NULL
      AND (plus_threshold IS NOT NULL OR minus_threshold IS NOT NULL);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.threshold_master_l1_approvers (
      id bigserial PRIMARY KEY,
      threshold_master_id bigint NOT NULL,
      approver_user_id integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE (threshold_master_id, approver_user_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.threshold_master_l2_approvers (
      id bigserial PRIMARY KEY,
      threshold_master_id bigint NOT NULL,
      approver_user_id integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE (threshold_master_id, approver_user_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.threshold_master_l3_approvers (
      id bigserial PRIMARY KEY,
      threshold_master_id bigint NOT NULL,
      approver_user_id integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE (threshold_master_id, approver_user_id)
    );
  `);

  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS mixing;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mixing.afis6_cotton_data_entry (
      id serial PRIMARY KEY,
      entry_id text,
      inspection_date date NOT NULL DEFAULT CURRENT_DATE,
      material_class varchar(255),
      comment varchar(255),
      total_nep_count_g numeric(12,3),
      total_nep_mean_size_um numeric(12,3),
      fiber_nep_count_g numeric(12,3),
      fiber_nep_mean_size_um numeric(12,3),
      scnep_count_g numeric(12,3),
      scnep_mean_size_um numeric(12,3),
      l_w_mm numeric(12,3),
      l_w_cv numeric(12,3),
      sfc_w_percent numeric(12,3),
      uql_w_mm numeric(12,3),
      l_n_mm numeric(12,3),
      l_n_cv_percent numeric(12,3),
      sfc_n_percent numeric(12,3),
      five_pct_l_n_mm numeric(12,3),
      fineness_mtex numeric(12,3),
      maturity_ratio_mat1 numeric(12,3),
      ifc_percent numeric(12,3),
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS afis6_cotton_data_entry_entry_id_uq
      ON mixing.afis6_cotton_data_entry (entry_id)
      WHERE entry_id IS NOT NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS afis6_cotton_data_entry_inspection_date_idx
      ON mixing.afis6_cotton_data_entry (inspection_date DESC);
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION mixing.set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query(`
    DROP TRIGGER IF EXISTS trg_afis6_cotton_updated_at ON mixing.afis6_cotton_data_entry;
  `);

  await pool.query(`
    CREATE TRIGGER trg_afis6_cotton_updated_at
      BEFORE UPDATE ON mixing.afis6_cotton_data_entry
      FOR EACH ROW
      EXECUTE FUNCTION mixing.set_updated_at();
  `);

  // Self-heal any bigserial sequence that has fallen behind the actual MAX(id)
  // in its table (e.g. from data imports/restores that insert explicit ids
  // without advancing the sequence). Left uncorrected, this causes spurious
  // "duplicate key"/"duplicate entry_id" errors on the very next insert.
  try {
    const sequences = await pool.query(`
      SELECT n.nspname AS schema, t.relname AS table_name, a.attname AS col,
             s.relname AS seq_name, ns.nspname AS seq_schema
      FROM pg_class s
      JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'a'
      JOIN pg_class t ON t.oid = d.refobjid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_namespace ns ON ns.oid = s.relnamespace
      WHERE s.relkind = 'S'
    `);

    let resyncedCount = 0;
    for (const row of sequences.rows) {
      try {
        const seqFull = `"${row.seq_schema}"."${row.seq_name}"`;
        const tableFull = `"${row.schema}"."${row.table_name}"`;
        const before = await pool.query(`SELECT last_value FROM ${seqFull}`);
        const beforeVal = Number(before.rows[0].last_value);
        const maxIdResult = await pool.query(`SELECT MAX("${row.col}") AS max_id FROM ${tableFull}`);
        const maxId = Number(maxIdResult.rows[0].max_id) || 0;
        if (maxId > beforeVal) {
          await pool.query(`SELECT setval('${seqFull}', $1, true)`, [maxId]);
          resyncedCount++;
        }
      } catch (_) {
        // Skip sequences/tables we can't introspect (e.g. permissions, exotic types)
      }
    }
    if (resyncedCount > 0) {
      console.log(`[DB Init] Resynced ${resyncedCount} sequence(s) that had fallen behind MAX(id)`);
    }
  } catch (err) {
    console.warn('[DB Init] Sequence resync sweep skipped:', err.message);
  }
})().catch(err => {
  console.error('[DB Init] Initialization warning (non-fatal):', err.message);
  // Don't throw - let queries attempt despite init failure
  // (tables may already exist in many cases)
});

async function releaseTxClient(ctx) {
  if (!ctx || !ctx.txClient) return;
  try {
    ctx.txClient.release();
  } finally {
    ctx.txClient = null;
  }
}

async function releaseMirrorTxClient(ctx) {
  if (!ctx || !ctx.mirrorTxClient) return;
  try {
    ctx.mirrorTxClient.release();
  } finally {
    ctx.mirrorTxClient = null;
  }
}

async function query(text, params) {
  // Wait for init with a timeout (don't let init block queries indefinitely)
  try {
    await Promise.race([
      initPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Init timeout')), 5000)
      )
    ]);
  } catch (err) {
    console.warn('[DB Query] Init timeout or error (continuing anyway):', err.message);
    // Continue - tables may already exist
  }
  
  const ctx = requestContext.getStore();
  const command = getCommand(text);

  // If this request has an active transaction client, keep all queries pinned.
  if (ctx?.txClient) {
    try {
      const result = await ctx.txClient.query(text, params);
      await mirrorQuery(text, params, ctx, command);
      if (command === 'COMMIT' || command === 'ROLLBACK') {
        await releaseTxClient(ctx);
      }
      return result;
    } catch (err) {
      if (command === 'COMMIT' || command === 'ROLLBACK') {
        await releaseTxClient(ctx);
      }
      throw err;
    }
  }

  // BEGIN inside request context should lease a dedicated client for that request.
  if (command === 'BEGIN' && ctx) {
    ctx.txClient = await pool.connect();
    const result = await ctx.txClient.query(text, params);
    await mirrorQuery(text, params, ctx, command);
    return result;
  }

  // Non-transactional queries use the pool directly.
  if (shouldMirrorQuery(command, text)) {
    const [result] = await Promise.all([
      pool.query(text, params),
      mirrorQuery(text, params, ctx, command)
    ]);
    return result;
  }

  const result = await queryWithRetry(text, params, command);
  return result;
}

function withRequestContext(req, res, next) {
  const ctx = { txClient: null, mirrorTxClient: null };

  requestContext.run(ctx, () => {
    let cleanedUp = false;

    const cleanup = async () => {
      if (cleanedUp) return;
      cleanedUp = true;
      await releaseTxClient(ctx);
      await releaseMirrorTxClient(ctx);
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);
    next();
  });
}

pool.on('error', (err) => {
  const message = err?.message || String(err);
  console.warn(`[PostgreSQL pool] idle client dropped and will be replaced: ${message}`);
});

if (supabaseMirrorPool) {
  supabaseMirrorPool.on('error', (err) => {
    const message = err?.message || String(err);
    console.warn(`[Supabase mirror pool] idle client dropped and will be replaced: ${message}`);
  });
}

pool.query('SELECT 1')
  .then(() => {
    const usingUrl = Boolean(effectiveDatabaseUrl);
    const mode = usingUrl ? 'DATABASE_URL' : 'DB_* env';
    const safeHost = usingUrl
      ? (() => {
          try { return new URL(getConnectionString()).hostname; } catch (_) { return 'unparsed-host'; }
        })()
      : process.env.DB_HOST;
    console.log(`PostgreSQL pool connected (${mode}, host=${safeHost})`);
  })
  .catch((err) => {
    console.error('DB connection failed', err);
    process.exit(1);
  });

if (supabaseMirrorPool) {
  supabaseMirrorPool.query('SELECT 1')
    .then(() => {
      let safeHost = 'unparsed-host';
      try { safeHost = new URL(getPoolConnectionString(supabaseDatabaseUrl, true)).hostname; } catch (_) {}
      console.log(`Supabase mirror pool connected (host=${safeHost})`);
    })
    .catch((err) => {
      console.error('Supabase mirror connection failed', err);
      process.exit(1);
    });
}

initPromise
  .then(() => console.log('DB initialization complete'))
  .catch((err) => {
    console.warn('[DB Init] Initialization encountered issues (non-fatal):', err.message);
    console.warn('[DB Init] Server will continue - tables may already exist or will be created on-demand');
  });

module.exports = {
  query,
  withRequestContext,
  pool,
  supabaseMirrorPool,
  initPromise
};

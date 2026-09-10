# Spintelligence DSM — Database Documentation

> **Scope**: This document covers the primary application database — a PostgreSQL database hosted on **Supabase**, accessed by the Node.js backend via `connection.js`. It is generated from a combination of static analysis (SQL embedded in `connection.js`, `scripts/*.sql`, route files) and a **live introspection** of `information_schema` / `pg_catalog` run on **2026-07-30**.
>
> A secondary, read-only **SQL Server** connection (`config/sqlserver.js`) is also used for pulling master/dropdown data (variety, prep, machine master) from an external ERP database (`VAAHINI_DHARANIDARA_ERP`) — see [SQL Server (ERP) Integration](#sql-server-erp-integration) below.

---

## 1. Overview

| | |
|---|---|
| Engine | PostgreSQL (Supabase-hosted) |
| Driver | [`pg`](https://node-postgres.com/) (`node-postgres`), pooled via `pg.Pool` |
| Schemas (application) | 16 — see [§2](#2-schema-map) |
| Schemas (Supabase-managed) | `auth`, `storage`, `realtime`, `vault`, `extensions` (not documented here — standard Supabase infra) |
| Total application tables | ~186 (218 total incl. Supabase-managed) |
| Migration style | **Idempotent bootstrap in code**, not a migration framework — see [§3](#3-schema-bootstrapmigration-strategy) |
| Secondary store | SQL Server (external ERP, read-only) |
| Mirroring | Optional dual-write to a second Supabase instance ("Supabase mirror") — see [§7](#7-dual-write--mirroring) |

### 1.1 Connecting

Connection target is selected by `DB_TARGET` in `.env`:

| `DB_TARGET` | Connection string used |
|---|---|
| `supabase` (default in `.env.example`) | `DATABASE_URL_SUPABASE` |
| `local` | `DATABASE_URL_LOCAL` |
| *(unset)* | `DATABASE_URL`, falling back to discrete `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_PORT`/`DB_NAME` |

`connection.js` auto-detects a Supabase host (`*.supabase.co`) and:
- strips `sslmode` from the connection string and instead sets `ssl: { rejectUnauthorized: false }` explicitly (avoids `pg`'s stricter `sslmode` cert verification tripping on Supabase's chain),
- uses smaller pool defaults tuned for Supabase's connection limits (`max: 5`, `min: 0`, `maxUses: 750` vs. `max: 20`, `min: 2`, unlimited for a plain Postgres host),
- retries transient connection errors (`ECONNRESET`, `57P01`/`57P02`/`57P03` admin-shutdown codes, etc.) automatically for read-only (`SELECT`/`SHOW`/`WITH`) queries, up to `DB_QUERY_RETRY_ATTEMPTS` (default 2 for Supabase, 0 otherwise).

### 1.2 Request-scoped transactions

`db.withRequestContext` (mounted as global middleware in `server.js`) opens an `AsyncLocalStorage` context per HTTP request. When a route issues a raw `BEGIN`, `connection.js` transparently leases a dedicated pooled client for the rest of that request and pins every subsequent `query()` call to it until `COMMIT`/`ROLLBACK`, then releases it back to the pool. Routes never manage `pg` clients directly — they just call `db.query('BEGIN')` / `db.query('COMMIT')` like any other statement.

---

## 2. Schema Map

| Schema | Tables | Purpose |
|---|---|---|
| `users` | 7 | Accounts, delegation of approval authority, dashboard personalization, OTP verification logs |
| `rbac` | 7 | Role-based access control: roles, departments, screens, and the many-to-many links between them |
| `ticketing_system` | 32 | The central cross-cutting engine: tickets, thresholds, approvals, notifications, activity/audit logs, notebook submission tracking, help content (glossary/FAQ/user guide), analytics snapshots |
| `process_parameters` | 4 | The shared "PP-000n" Process Parameter screens used by every department |
| `reports` | 1 | Scheduled report configuration |
| `trials` | 1 | Trial/experimental production runs |
| `public` | 1 | `hvi_records` — raw HVI (High Volume Instrument) cotton test results |
| `mixing`, `blowroom`, `carding`, `drawframe`, `simplex`, `autoconer`, `spinning`, `comber` | 12, 10, 19, 8, 11, 27, 18, 7 | One schema per spinning-mill production department — each holds that department's notebook/data-entry tables (QC headers, waste studies, inspection readings, checking/notebook screens, wheel-change logs, etc.) |
| `wrapping` | 6 | Shared "wrapping" percentage screens (A%, Stretch%, Comber Noil%) fed by multiple departments (Draw Frame, Simplex) into common tables |

This mirrors the department structure enforced at the application layer in `server.js`'s `DEPARTMENT_ROUTE_PREFIXES` (`/spinning`, `/mixing`, `/comber`, `/carding`, `/blowroom`, `/drawframe`, `/simplex`, `/autoconer`) and in `rbac.departments` / `rbac.screens`.

---

## 3. Schema Bootstrap/Migration Strategy

There is **no migration framework** (no Sequelize/Knex/Prisma migrations, no `db/migrate` folder). Instead:

- `connection.js` runs an **idempotent bootstrap block** (`initPromise`, wrapping `CREATE SCHEMA IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) on every server start. This is how the core `ticketing_system`/`users` schema keeps evolving — new columns/tables are added to this block and every deploy re-applies it safely.
- One-off structural changes are checked in as timestamped SQL files under `backend/scripts/` (e.g. `20260604_notifications_and_ack_threshold.sql`, `20260725_rename_frequency_and_occurrences_in_screen_submission_frequency.sql`) and run manually against the target database — they are **not** auto-executed by the app.
- `backend/docs/supabase_set_numeric_scale_4.sql` is a one-off DDL fix (widening numeric column scale) kept for reference/reruns.
- `backend/scripts/WIPE_KEEP_USERS_RBAC.sql` and `FULL_WIPE_KEEP_ADMIN001.sql` are destructive reset scripts for non-prod environments (wipe transactional data while preserving user/RBAC config, or reset to a single admin) — **never run against production without explicit sign-off**.
- Init failures are logged but treated as **non-fatal** (`.catch(err => console.error(...))`) — the app still starts and serves requests assuming most tables already exist, so an init hiccup doesn't take down the whole service.

If you need to add a column/table, the convention is: add an `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` statement to the `initPromise` block in `connection.js` (for durable schema) and/or drop a new timestamped `.sql` file in `backend/scripts/` (for a one-time backfill/rename).

---

## 4. Core Domain Models

### 4.1 Users & RBAC

- **`users.user_details`** is the single user/account table (not split by role). Key fields: `employee_id`, `email`, `phone`, `password_hash` (bcrypt), `role` (free-text label) + `role_id` (FK-like reference into `rbac.role_details`, not DB-enforced), `department`/`department_id`, `level` (`L1`–`L5`, default `L1` — drives ticket-approval routing), `top_department`, `employee_type`, `reports_to_user_id` (self-referential hierarchy for delegation/escalation).
- **`rbac.role_details`** / **`rbac.departments`** / **`rbac.screens`** are master lists; **`rbac.role_departments`** and **`rbac.role_screens`** are the many-to-many join tables that grant a role visibility into departments/screens. **`rbac.permissions`** + **`rbac.role_permissions`** exist for finer-grained action permissions but currently hold 0 rows — the department/screen visibility model (`role_departments`/`role_screens`) is what's actually driving access today, layered under the simpler `config/roles.json` (`canApprove`/`canReject` per role name) used by `middleware/RBACMiddleware.js`.
- **`users.delegations`** lets a user (`owner_user_id`) temporarily hand off approval authority to another (`delegate_user_id`) for a date range — read by the ticket/threshold approval routing so tickets still resolve while an approver is on leave.
- **`users.supervisor_assignments`** binds supervisors to the department/machines they approve for.
- **`users.dashboard_builder_configs`** / **`users.user_dashboard_pages`** store each user's custom dashboard widget layout (`dashboard.js` / "dashbuilder" routes).
- **`users.email_verification_logs`** / **`users.phone_verification_logs`** back the OTP flows (`routes/emailVerification.js`, `routes/phoneVerification.js`).

### 4.2 Ticketing & Threshold Engine (`ticketing_system`)

This is the heart of the application — every department's data-entry screens ultimately funnel violations into this schema. See `backend/docs/ticket-workflow.md` for the full end-to-end request/response walkthrough; summarized here:

1. **`threshold_master`** (+ its `_l1_approvers`/`_l2_approvers`/`_l3_approvers` child tables) defines, per `department`/`sub_department`/`input_screen`/`machine_name`/`input_field`, the acceptable value range (`plus_threshold`/`minus_threshold`/`condition_level`) and who approves a breach at each tier.
2. When a data-entry save (or an ERP-fed actual value) violates a threshold, `ticketing_system.operator_tickets` gets a new row: `ticket_reason` is one of `MISSING_VALUE` / `THRESHOLD_BREACH` / `BOTH`; `violation_details` (jsonb) records specifics; `status` starts `Open`.
3. Ticket lifecycle: `Open` → (`PUT /operator-tickets/submit/:id`) → `Pending Approval` → supervisor decision (`PATCH /api/supervisor-tickets/tickets/approve|reject`) → `Closed` or `Reopened`.
4. **TAT (turnaround time) escalation**: `l1_tat_due_at`/`l2_tat_due_at`/`l3_tat_due_at` + `tat_current_level` on `operator_tickets` are checked by a background worker (`startThresholdTicketWorker` in `server.js`, every `THRESHOLD_TICKET_WORKER_INTERVAL_MS`, default 15 min) that escalates unactioned tickets up the L1→L2→L3 chain.
5. **`ticket_logs`** is the immutable audit trail of every status transition/action on a ticket; **`ticket_approvals`** records individual approver decisions where multiple approvers exist at a tier (`approval_l1_user_ids`/`approval_l2_user_ids`/`approval_l3_user_ids` arrays on the ticket itself).
6. **`notifications`** fans out ticket events (and other categories — `category`/`priority`/`title`/`body`/`link_url`/`payload`) to `recipient_user_id`; surfaced via `routes/inAppNotifications.routes.js`.

Parallel to per-field thresholds, three other automatic ticket-generating mechanisms live in the same schema:

- **PP (Process Parameter) batch completion** — `pp_batch_config`, `pp_batch_sub_department_config`, `pp_notebook_batch_config`, `pp_approval_config` configure which "PP-000n" batches must be completed within a window; `runPpBatchCompletionCheck` (in `routes/submittedNotebooks.routes.js`, run by the same worker) raises tickets for incomplete batches.
- **Submission frequency** — `screen_submission_frequency` defines how often a screen must be filled in (`range`/`frequency`); `operatorTicketRoutes.runSubmissionFrequencyCheck` / `runSubmissionFrequencyTatCheck` detect misses and escalate.
- **Notebook acknowledgement** — `notebook_acknowledgement_threshold` + `submitted_notebooks` track that a submitted notebook was acknowledged within `acknowledge_within_hours`; `generateOverdueNotebookTickets` (worker in `server.js`, every `NOTEBOOK_ACK_WORKER_INTERVAL_MS`, default 15 min) raises/escalates tickets otherwise.
- **Wheel-change approvals** — `wheel_change_approval_config` configures the approval chain specifically for Spinning's wheel-change workflow (`spinning.wheel_change_v2` / `runWheelChangeApprovalTatCheck`).

Supporting/bookkeeping tables in the same schema: **`entry_id_sequences`** and **`frontend_entry_registry`** (see [§5](#5-entry-id-generation) below), **`mc_master`** (cached machine master pulled from the SQL Server ERP), **`activity_logs`** (generic audit log for every authenticated mutating request — see `server.js`'s global activity-logging middleware), **`glossary_entries`/`faq_entries`/`user_guide_entries`** (CMS-style help content, `routes/helpContent.routes.js`), **`analysis_snapshots`/`analysis_notification_subscriptions`/`analysis_notification_events`** (periodic analytics snapshots + push-style notification subscriptions for `routes/analysis.routes.js`).

### 4.3 Process Parameters (`process_parameters`)

The shared "PP-000n" screens (`mixing.qc`, `blowroom.header`, `carding.qc-header`, `drawframe.header`, `simplex.process_parameter`, `spinning.qc`, `autoconer.process`/`process_parameter`/`q2`/`q3`) write into:

- **`process_parameters.master`** — one row per PP entry id (`entry_id`), tracking overall `status` (`in_progress`, etc.) and review metadata.
- **`process_parameters.master_entries`** / **`parameter_entries`** — the actual per-department payload, stored as `data jsonb` keyed by `department`/`process_type`, linked back to `master` via `master_id`.
- **`process_parameters.entry_id_sequences`** — a dedicated numbering sequence, separate from the generic one in `ticketing_system`, because PP ids must be coordinated globally across all 10 department screens that share the PP-000n numbering (see the extensive comment block at the top of `server.js` explaining why the generic auto-entry-id middleware deliberately skips these routes).

### 4.4 Department Schemas

Each of `mixing`, `blowroom`, `carding`, `drawframe`, `simplex`, `autoconer`, `spinning`, `comber` holds that department's notebook/data-entry tables — typically one table per distinct input screen (e.g. `carding.card_thick_place`, `carding.nati_data_entry`, `spinning.cots_checking`, `autoconer.cone_density_notebook`), often paired with a `_header` table (e.g. `carding.carding_qc_header`, `blowroom.blowroom_header`) that groups multiple entries under one shift/machine/date context, and sometimes child "rows" tables for repeating line items (e.g. `carding.card_waste_study_type_rows`, `blowroom.br_waste_study_waste_rows`).

Almost every entry-level table has a unique, human-readable `entry_id` (e.g. `SW1-0002`, `ACD-0004`) minted by the entry-id system below rather than relying solely on the numeric primary key.

The **`wrapping`** schema is the one exception to "one schema per department" — screens shared across departments (A%, Stretch%, Comber Noil%) that Draw Frame *and* Simplex both submit into land in the same `wrapping.*` tables regardless of which department's route handled the request (see the long comments in `server.js`'s `ENTRY_ID_ROUTE_TABLES` map documenting several past bugs caused by this cross-department sharing going unmapped).

### 4.5 SQL Server (ERP) Integration

`config/sqlserver.js` opens a separate connection pool (via the `mssql` package) to an external SQL Server database (`VAAHINI_DHARANIDARA_ERP` by default, configurable via `MSSQL_*` env vars). It is used **read-only**, for pulling master/dropdown data the mill's ERP already owns (variety/prep master, machine master — see `utils/prepVariety.js`, `utils/variety.js`, `utils/employeeMaster.js`). `server.js`'s global error handler has a dedicated branch (`isDatabaseAccessDenied`) that turns a SQL Server permission error into a clear 403 telling an operator exactly which `GRANT SELECT` statement to hand their DBA.

---

## 5. Entry-ID Generation

Almost every department table's primary business key is a formatted string like `PP-0007`, `SW1-0002`, `ACD-0004` rather than the numeric PK. Two systems mint these, both centered in `server.js`:

- **`ticketing_system.frontend_entry_registry`** — a generic reservation ledger keyed by `route_path`. Global middleware in `server.js` intercepts every `POST` to a department route not in `PP_MANAGED_ROUTES`, computes the next id (`MAX` of the registry **and** the real target table via `ENTRY_ID_ROUTE_TABLES`/`ENTRY_ID_ROUTE_PREFIXES`), reserves it as `status='reserved'`, and flips it to `'committed'` on a successful response (or deletes it on failure) via a `res.on('finish')` hook. Retries up to 3 times on a reservation collision (`23505`) by minting a fresh id rather than failing the whole request.
- **`process_parameters.entry_id_sequences`** — the single globally-coordinated sequence for the 10 shared "PP-000n" screens, which manage their own id via `resolveOrCreateProcessParameterEntryId()`/`getCountNameConflict()` (see `utils/processParameterEntryId.js`) instead of the generic middleware above.

Multiple long comments in `server.js` (`ENTRY_ID_ROUTE_TABLES`) document real production incidents caused by a route missing from this map — e.g. an id computed only from the bookkeeping registry, silently drifting behind the real department table, and re-issuing an id that already existed (`"Duplicate entry_id"` / unique-constraint violations). Any new department screen **must** be added to `ENTRY_ID_ROUTE_TABLES` (and `ENTRY_ID_ROUTE_PREFIXES` if it uses a non-default prefix format) or its "next id" will silently be wrong.

---

## 6. Auditing & Observability

- **`ticketing_system.activity_logs`** — every authenticated `POST`/`PUT`/`PATCH`/`DELETE` (except `/activity-logs` itself) is logged here automatically by global middleware in `server.js`, capturing `user_id`/`user_name`/`employee_id`, `module` (derived from the first URL segment), `action` (`Created`/`Updated`/`Deleted`), a `metadata` jsonb blob (method, path, params, query, status code, notebook/sub-department context), IP, and user agent.
- **`ticketing_system.ticket_logs`** — narrower, ticket-specific action trail (who did what to which ticket).
- Postgres pool errors (`idle client dropped`) and Supabase mirror pool errors are logged but don't crash the process — `connection.js` treats a dropped idle connection as routine and lets `pg.Pool` replace it.

---

## 7. Dual-Write / Mirroring

If `DATABASE_URL_SUPABASE` is configured **and** the primary connection target is *not* already that same Supabase database, `connection.js` opens a second pool (`supabaseMirrorPool`) and mirrors every mutating statement (`INSERT`/`UPDATE`/`DELETE`/`UPSERT`/`MERGE`/`CREATE`/`ALTER`/`DROP`/`TRUNCATE`/`COMMENT`/`GRANT`/`REVOKE`/`DO`, and any `WITH ...` CTE containing one of those) to it as well, including mirroring `BEGIN`/`COMMIT`/`ROLLBACK` on a dedicated mirror transaction client. This is disabled by default when the primary *is* Supabase, and can be force-disabled via `SUPABASE_MIRROR_ENABLED=false`. Companion PowerShell scripts (`scripts/sync-supabase-to-postgres.ps1`, `scripts/sync-postgres-to-supabase.ps1`, exposed as `npm run sync:supabase:postgres` / `sync:postgres:supabase`) perform bulk one-off syncs in either direction.

---

## 8. Row-Count Snapshot (as of 2026-07-30 introspection)

Most transactional tables were empty or near-empty at introspection time (this is a pre-production/staging dataset). Notable non-trivial row counts:

| Table | Rows |
|---|---|
| `rbac.role_screens` | 471 |
| `rbac.role_departments` | 76 |
| `rbac.screens` | 63 |
| `rbac.role_details` | 16 |
| `rbac.departments` | 12 |
| `users.user_details` | 32 |

Full per-table row counts are included alongside each table definition in the [Appendix](#appendix-full-table-reference-generated).

---

## Appendix: Full Table Reference (generated)

The remainder of this document is **mechanically generated** from a live `information_schema`/`pg_catalog` introspection of the Supabase Postgres database (run 2026-07-30). Each entry lists every column with its type, nullability, default, and key role (`PK` = primary key, `UQ` = participates in a unique constraint, `FK→schema.table.column` = foreign key), plus any non-PK indexes. Regenerate by re-running the introspection query set described in this doc's source control history if the schema changes.


### Schema Index

**users** (7 tables): dashboard_builder_configs, delegations, email_verification_logs, phone_verification_logs, supervisor_assignments, user_dashboard_pages, user_details

**rbac** (7 tables): departments, permissions, role_departments, role_details, role_permissions, role_screens, screens

**ticketing_system** (32 tables): activity_logs, analysis_notification_events, analysis_notification_subscriptions, analysis_snapshots, entry_id_sequences, faq_entries, frontend_entry_registry, glossary_entries, mc_master, notebook_acknowledgement_threshold, notebook_custom_field_values, notebook_custom_fields, notifications, ocr_machine_records, operator_tickets, pp_approval_config, pp_batch_config, pp_batch_sub_department_config, pp_notebook_batch_config, pp_notebook_threshold, pp_threshold_master, pp_thresholds, screen_submission_frequency, submitted_notebooks, threshold_master, threshold_master_l1_approvers, threshold_master_l2_approvers, threshold_master_l3_approvers, ticket_approvals, ticket_logs, user_guide_entries, wheel_change_approval_config

**process_parameters** (4 tables): entry_id_sequences, master, master_entries, parameter_entries

**reports** (1 tables): report_schedules

**trials** (1 tables): trials

**public** (1 tables): hvi_records

**mixing** (12 tables): afis6_cotton_data_entry, afis6_mmf_data_entry, afis_data_entry, br_waste_study, cotton_hvi_data_entry, drop_test, fibre_data_entry, mixing_qc_blends, mixing_qc_header, moisture_data_entry, openness_entries, openness_inspection

**blowroom** (10 tables): between_lap_cv, blow_room_sync, blow_room_sync_entries, blowroom_header, br_waste_study, br_waste_study_type_rows, br_waste_study_waste_rows, br_waste_type_master, drop_test, within_lap_cv

**carding** (19 tables): card_change_control, card_change_control_lines, card_dfk_pressure_checking, card_thick_place, card_thick_place_header, card_thick_place_values, card_waste_study, card_waste_study_type_rows, card_waste_study_waste_rows, card_waste_type_master, carding_change_request, carding_qc_header, hanks, inspections, nati_data_entry, neps_details, nre, sample_weights, u_data_entry

**drawframe** (8 tables): cots_breaker_data, cots_data_entry, cots_finisher_data, drawframe_qc_header, u_data_entry, wheel_change, yarn_cv_percent, yarn_cv_yard_results

**simplex** (11 tables): simplex_inspection_details, simplex_inspections, simplex_notebook, simplex_process_parameter, smx_breaks_inspection_items, smx_breaks_study_header, smx_epi_parameters, smx_other_field_values, smx_user_fiber_parameters, u_data_entry, wheel_change

**autoconer** (27 tables): autoconer_process_parameter, autoconer_q2_inspection, autoconer_q3_inspection, autoconer_q4_inspection, cone_density, cone_density_notebook, cone_density_notebook_drums, cone_density_readings, cone_packing_audit, count_master, count_wise_cuts, drum_entries, drum_inspection, drum_readings, drum_wise, inspection_data_entry, inspection_data_entry_readings, inspections, lycra_checking_inspections, lycra_checking_readings, lycra_checking_summary, machine, parameter_entries, rewinding_readings, rewinding_study, rewinding_study_inspections, yarn_readings

**spinning** (18 tables): bottom_apron_checking, cots_checking, count_change_inspections, count_change_readings, lycra_centering, lycra_missing, ring_frame_checkers, ring_frame_inspections, ring_frame_rows, ring_frame_summary, rsm_and_lycrasensor_cheking_offline, rsm_and_lycrasensor_cheking_online, speed_checking, spinning_qc_header, type2_faults, wheel_change, wheel_change_inspection, wheel_change_v2

**comber** (7 tables): efficiency_data_entry, nati_data_entry, neps_details, nre_data_entry, ribbon_lap_cv_qc, ribbon_lap_samples, u_data_entry

**wrapping** (6 tables): a_percent, carding_notebook, comber_noil_percent, drawframe_notebook, simplex_notebook, stretch_percent

### Schema: `users`

#### `users.dashboard_builder_configs`  <sub>(2 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| user_id | integer | NOT NULL |  | PK |
| widgets | jsonb | NOT NULL | '[]'::jsonb |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |

#### `users.delegations`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('users.delegations_id_seq'::regc | PK |
| owner_user_id | integer | NOT NULL |  | FK→users.user_details.id |
| delegate_user_id | integer | NOT NULL |  | FK→users.user_details.id |
| from_date | date | NOT NULL |  |  |
| to_date | date | NOT NULL |  |  |
| no_of_days | integer | NOT NULL |  |  |
| created_by | integer |  |  | FK→users.user_details.id |
| created_at | timestamp with time zone | NOT NULL | now() |  |

#### `users.email_verification_logs`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| email | character varying(150) | NOT NULL |  |  |
| verification_id | character varying(255) | NOT NULL |  |  |
| is_verified | boolean |  |  |  |
| verified_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |

#### `users.phone_verification_logs`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| phone | character varying(150) | NOT NULL |  |  |
| verification_id | character varying(255) | NOT NULL |  |  |
| is_verified | boolean |  |  |  |
| verified_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |

#### `users.supervisor_assignments`  <sub>(1 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('users.supervisor_assignments_id |  |
| supervisor_user_id | integer | NOT NULL |  | UQ |
| employee_user_id | integer | NOT NULL |  | UQ |
| is_active | boolean | NOT NULL | true |  |
| assigned_at | timestamp with time zone | NOT NULL | now() |  |
| assigned_by | integer |  |  |  |
| supervisor_employee_id | character varying(50) |  |  |  |
| supervisor_name | character varying(150) |  |  |  |
| employee_employee_id | character varying(50) |  |  |  |
| employee_name | character varying(150) |  |  |  |
| remarks | character varying(255) |  |  |  |

<details><summary>Indexes (1)</summary>

- `supervisor_assignments_supervisor_employee_uq`: `CREATE UNIQUE INDEX supervisor_assignments_supervisor_employee_uq ON users.supervisor_assignments USING btree (supervisor_user_id, employee_user_id)`

</details>

#### `users.user_dashboard_pages`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('users.user_dashboard_pages_id_s |  |
| user_id | integer | NOT NULL |  | UQ |
| page_key | text | NOT NULL |  | UQ |
| page_title | text |  |  |  |
| widgets | jsonb | NOT NULL | '[]'::jsonb |  |
| is_active | boolean | NOT NULL | true |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (1)</summary>

- `user_dashboard_pages_user_id_page_key_key`: `CREATE UNIQUE INDEX user_dashboard_pages_user_id_page_key_key ON users.user_dashboard_pages USING btree (user_id, page_key)`

</details>

#### `users.user_details`  <sub>(32 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('users.user_details_id_seq'::reg | PK |
| full_name | character varying(150) | NOT NULL |  |  |
| first_name | character varying(100) | NOT NULL |  |  |
| last_name | character varying(100) |  |  |  |
| email | character varying(150) | NOT NULL |  |  |
| phone | character varying(10) | NOT NULL |  |  |
| password_hash | text | NOT NULL |  |  |
| employee_id | character varying(50) | NOT NULL |  |  |
| role | character varying(50) | NOT NULL |  |  |
| designation | character varying(100) |  |  |  |
| department | character varying(100) |  |  |  |
| dob | date |  |  |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |
| account_status | character varying(20) |  | 'Active'::character varying |  |
| role_id | bigint |  |  |  |
| department_id | bigint |  |  |  |
| level | character varying(2) |  | 'L1'::character varying |  |
| top_department | character varying(50) |  |  |  |
| employee_type | character varying(10) |  |  |  |
| reports_to_user_id | integer |  |  |  |

### Schema: `rbac`

#### `rbac.departments`  <sub>(12 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('rbac.departments_id_seq'::regcl |  |
| name | character varying(50) | NOT NULL |  |  |
| is_active | boolean | NOT NULL |  |  |
| created_at | timestamp with time zone | NOT NULL | CURRENT_TIMESTAMP |  |

#### `rbac.permissions`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('rbac.permissions_id_seq'::regcl |  |
| key | text | NOT NULL |  |  |
| name | text | NOT NULL |  |  |
| screen_name | text | NOT NULL |  |  |
| description | text |  |  |  |
| created_at | timestamp without time zone |  | now() |  |

#### `rbac.role_departments`  <sub>(76 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| role_id | bigint | NOT NULL |  |  |
| department_id | bigint | NOT NULL |  |  |

#### `rbac.role_details`  <sub>(16 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('rbac.role_details_id_seq'::regc |  |
| name | character varying(50) | NOT NULL |  |  |
| description | character varying(200) |  |  |  |
| status | boolean | NOT NULL |  |  |
| created_at | timestamp with time zone | NOT NULL | CURRENT_TIMESTAMP |  |
| updated_at | timestamp with time zone | NOT NULL | CURRENT_TIMESTAMP |  |

#### `rbac.role_permissions`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| role_id | integer | NOT NULL |  | PK |
| permission_id | integer | NOT NULL |  | PK |
| created_at | timestamp without time zone |  | now() |  |

#### `rbac.role_screens`  <sub>(471 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| role_id | bigint | NOT NULL |  |  |
| screen_id | bigint | NOT NULL |  |  |

#### `rbac.screens`  <sub>(63 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('rbac.screens_id_seq'::regclass) |  |
| name | character varying(50) | NOT NULL |  |  |
| is_active | boolean | NOT NULL |  |  |
| created_at | timestamp with time zone | NOT NULL | CURRENT_TIMESTAMP |  |
| department_id | bigint | NOT NULL |  |  |

### Schema: `ticketing_system`

#### `ticketing_system.activity_logs`  <sub>(4 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.activity_logs_ | PK |
| user_id | integer |  |  |  |
| user_name | character varying(255) |  |  |  |
| employee_id | character varying(50) |  |  |  |
| module | character varying(100) | NOT NULL |  |  |
| action | character varying(100) | NOT NULL |  |  |
| description | text |  |  |  |
| metadata | jsonb |  |  |  |
| ip_address | character varying(100) |  |  |  |
| user_agent | text |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

#### `ticketing_system.analysis_notification_events`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.analysis_notif | PK |
| user_id | integer | NOT NULL |  |  |
| title | character varying(200) | NOT NULL |  |  |
| body | text | NOT NULL |  |  |
| payload | jsonb |  |  |  |
| is_read | boolean | NOT NULL | false |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| read_at | timestamp with time zone |  |  |  |

#### `ticketing_system.analysis_notification_subscriptions`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.analysis_notif |  |
| user_id | integer | NOT NULL |  |  |
| channel | character varying(20) | NOT NULL | 'app_push'::character varying |  |
| target_level | character varying(5) | NOT NULL | 'L1'::character varying |  |
| is_active | boolean | NOT NULL | true |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |

#### `ticketing_system.analysis_snapshots`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.analysis_snaps | PK |
| period_key | character varying(20) | NOT NULL |  |  |
| start_at | timestamp with time zone | NOT NULL |  |  |
| end_at | timestamp with time zone | NOT NULL |  |  |
| payload | jsonb | NOT NULL |  |  |
| created_by_user_id | integer |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

#### `ticketing_system.entry_id_sequences`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| sequence_key | text | NOT NULL |  | PK |
| prefix | text | NOT NULL |  |  |
| next_number | bigint | NOT NULL | 1 |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |

#### `ticketing_system.faq_entries`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.faq_entries_id | PK |
| question | text | NOT NULL |  |  |
| answer | text | NOT NULL |  |  |
| category | character varying(100) |  |  |  |
| display_order | integer | NOT NULL | 0 |  |
| is_active | boolean | NOT NULL | true |  |
| created_by_user_id | integer |  |  |  |
| updated_by_user_id | integer |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (1)</summary>

- `faq_entries_category_idx`: `CREATE INDEX faq_entries_category_idx ON ticketing_system.faq_entries USING btree (is_active, category, display_order, id)`

</details>

#### `ticketing_system.frontend_entry_registry`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.frontend_entry |  |
| entry_id | text | NOT NULL |  |  |
| module_name | text |  |  |  |
| route_path | text |  |  |  |
| method | text |  |  |  |
| status | text | NOT NULL | 'reserved'::text |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| committed_at | timestamp with time zone |  |  |  |

<details><summary>Indexes (2)</summary>

- `frontend_entry_registry_module_idx`: `CREATE INDEX frontend_entry_registry_module_idx ON ticketing_system.frontend_entry_registry USING btree (module_name, created_at DESC)`
- `frontend_entry_registry_route_entry_id_uq`: `CREATE UNIQUE INDEX frontend_entry_registry_route_entry_id_uq ON ticketing_system.frontend_entry_registry USING btree (COALESCE(route_path, ''::text), entry_id)`

</details>

#### `ticketing_system.glossary_entries`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.glossary_entri | PK |
| input_field | character varying(150) | NOT NULL |  |  |
| display_name | character varying(200) |  |  |  |
| description | text | NOT NULL |  |  |
| department | character varying(100) |  |  |  |
| sub_department | character varying(100) |  |  |  |
| input_screen | character varying(150) |  |  |  |
| example_value | text |  |  |  |
| unit | character varying(50) |  |  |  |
| is_active | boolean | NOT NULL | true |  |
| created_by_user_id | integer |  |  |  |
| updated_by_user_id | integer |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |
| category | character varying(100) |  |  |  |

<details><summary>Indexes (1)</summary>

- `glossary_entries_filter_idx`: `CREATE INDEX glossary_entries_filter_idx ON ticketing_system.glossary_entries USING btree (is_active, department, sub_department, input_screen, input_field)`

</details>

#### `ticketing_system.mc_master`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| mccode | text | NOT NULL |  |  |
| mcname | text | NOT NULL |  |  |
| deptcode | text |  |  |  |
| deptname | text |  |  |  |
| make | text |  |  |  |
| machno | text |  |  |  |
| compcode | text |  |  |  |
| mcclose | text |  |  |  |
| source_db | text | NOT NULL |  |  |
| synced_at | timestamp with time zone | NOT NULL | now() |  |

#### `ticketing_system.notebook_acknowledgement_threshold`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.notebook_ackno | PK |
| screen_name | text | NOT NULL |  | UQ |
| department | text |  |  | UQ |
| sub_department | text |  |  | UQ |
| acknowledge_within_hours | integer | NOT NULL | 24 |  |
| is_active | boolean | NOT NULL | true |  |
| approval_l2 | text |  |  |  |
| approval_l2_name | text |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |
| approval_l3 | text |  |  |  |
| approval_l3_name | text |  |  |  |
| approval_l4 | text |  |  |  |
| approval_l4_name | text |  |  |  |
| approval_l5 | text |  |  |  |
| approval_l5_name | text |  |  |  |
| l3_tat_hours | integer |  |  |  |
| l4_tat_hours | integer |  |  |  |
| l5_tat_hours | integer |  |  |  |
| criticality | text | NOT NULL | 'High'::text |  |

<details><summary>Indexes (3)</summary>

- `notebook_ack_threshold_lookup_idx`: `CREATE INDEX notebook_ack_threshold_lookup_idx ON ticketing_system.notebook_acknowledgement_threshold USING btree (is_active, lower(TRIM(BOTH FROM screen_name)), lower(TRIM(BOTH FROM COALESCE(department, ''::text))), lower(TRIM(BOTH FROM COALESCE(sub_department, ''::text))))`
- `notebook_ack_threshold_screen_dept_subdept_uq`: `CREATE UNIQUE INDEX notebook_ack_threshold_screen_dept_subdept_uq ON ticketing_system.notebook_acknowledgement_threshold USING btree (screen_name, department, sub_department)`
- `notebook_acknowledgement_thre_screen_name_department_sub_de_key`: `CREATE UNIQUE INDEX notebook_acknowledgement_thre_screen_name_department_sub_de_key ON ticketing_system.notebook_acknowledgement_threshold USING btree (screen_name, department, sub_department)`

</details>

#### `ticketing_system.notebook_custom_field_values`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.notebook_custo | PK |
| custom_field_id | bigint | NOT NULL |  | UQ, FK→ticketing_system.notebook_custom_fields.id |
| entry_id | text | NOT NULL |  | UQ |
| value | text |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (2)</summary>

- `notebook_custom_field_values_custom_field_id_entry_id_key`: `CREATE UNIQUE INDEX notebook_custom_field_values_custom_field_id_entry_id_key ON ticketing_system.notebook_custom_field_values USING btree (custom_field_id, entry_id)`
- `notebook_custom_field_values_entry_idx`: `CREATE INDEX notebook_custom_field_values_entry_idx ON ticketing_system.notebook_custom_field_values USING btree (entry_id)`

</details>

#### `ticketing_system.notebook_custom_fields`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.notebook_custo | PK |
| department | text | NOT NULL |  |  |
| sub_department | text | NOT NULL |  |  |
| notebook | text | NOT NULL |  |  |
| field_label | text | NOT NULL |  |  |
| field_type | text | NOT NULL | 'text'::text |  |
| field_options | jsonb | NOT NULL | '[]'::jsonb |  |
| is_active | boolean | NOT NULL | true |  |
| created_by_user_id | integer |  |  |  |
| created_by_name | text |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |
| db_column_name | text |  |  |  |
| db_table_name | text |  |  |  |
| decimal_places | integer |  |  |  |

<details><summary>Indexes (1)</summary>

- `notebook_custom_fields_lookup_idx`: `CREATE INDEX notebook_custom_fields_lookup_idx ON ticketing_system.notebook_custom_fields USING btree (lower(TRIM(BOTH FROM department)), lower(TRIM(BOTH FROM sub_department)), lower(TRIM(BOTH FROM notebook)))`

</details>

#### `ticketing_system.notifications`  <sub>(2 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| notification_id | text | NOT NULL |  |  |
| ticket_id | character varying(20) |  |  |  |
| notification_type | character varying(30) | NOT NULL |  |  |
| status | character varying(10) | NOT NULL |  |  |
| sent_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |
| recipient_user_id | integer |  |  |  |
| category | character varying(50) | NOT NULL | 'Tickets'::character varying |  |
| priority | character varying(20) | NOT NULL | 'Medium'::character varying |  |
| title | text |  |  |  |
| body | text |  |  |  |
| link_url | text |  |  |  |
| payload | jsonb | NOT NULL | '{}'::jsonb |  |
| read_at | timestamp with time zone |  |  |  |
| id | bigint | NOT NULL | nextval('ticketing_system.notifications_ | PK |

<details><summary>Indexes (4)</summary>

- `notifications_category_idx`: `CREATE INDEX notifications_category_idx ON ticketing_system.notifications USING btree (category, notification_type)`
- `notifications_notification_id_uq`: `CREATE UNIQUE INDEX notifications_notification_id_uq ON ticketing_system.notifications USING btree (notification_id)`
- `notifications_recipient_status_idx`: `CREATE INDEX notifications_recipient_status_idx ON ticketing_system.notifications USING btree (recipient_user_id, status, sent_at DESC)`
- `notifications_ticket_id_idx`: `CREATE INDEX notifications_ticket_id_idx ON ticketing_system.notifications USING btree (ticket_id)`

</details>

#### `ticketing_system.ocr_machine_records`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.ocr_machine_re |  |
| filename | text |  |  |  |
| doc_type | text |  |  |  |
| ocr_json | jsonb |  |  |  |
| manual_json | jsonb |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

#### `ticketing_system.operator_tickets`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| ticket_id | text | NOT NULL |  |  |
| user_id | integer |  |  |  |
| user_name | character varying(50) |  |  |  |
| machine_name | character varying(100) |  |  |  |
| parameter_name | jsonb |  |  |  |
| idle_value | jsonb |  |  |  |
| threshold_value | jsonb |  |  |  |
| severity | character varying(20) |  |  |  |
| status | character varying(30) |  |  |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |
| management_field | character varying(100) |  |  |  |
| erp_product_code | character varying(100) |  |  |  |
| ticket_reason | character varying(30) |  |  |  |
| violation_details | jsonb |  |  |  |
| approval_l1_user_ids | int4[] |  |  |  |
| approval_l2_user_ids | int4[] |  |  |  |
| submission_frequency_config_id | bigint |  |  | FK→ticketing_system.screen_submission_frequency.id |
| tat_current_level | text |  |  |  |
| l1_tat_due_at | timestamp with time zone |  |  |  |
| l2_tat_due_at | timestamp with time zone |  |  |  |
| approval_l1_user_id | integer |  |  |  |
| approval_l2_user_id | integer |  |  |  |
| ticket_type | text |  |  |  |
| approval_l3_user_id | integer |  |  |  |
| approval_l3_user_ids | int4[] |  |  |  |
| l3_tat_due_at | timestamp with time zone |  |  |  |
| l1_tat_hours | integer |  |  |  |
| l2_tat_hours | integer |  |  |  |
| l3_tat_hours | integer |  |  |  |
| description | text |  |  |  |
| ticket_kind | character varying(50) |  |  |  |
| source | character varying(50) |  |  |  |
| actual_value | jsonb |  |  |  |
| approval_l4_user_ids | int4[] |  |  |  |
| approval_l5_user_ids | int4[] |  |  |  |
| l4_tat_due_at | timestamp with time zone |  |  |  |
| l5_tat_due_at | timestamp with time zone |  |  |  |

<details><summary>Indexes (4)</summary>

- `operator_tickets_ack_notebook_submission_uq`: `CREATE UNIQUE INDEX operator_tickets_ack_notebook_submission_uq ON ticketing_system.operator_tickets USING btree (((violation_details ->> 'notebook_submission_id'::text))) WHERE (((ticket_reason)::text = 'MISSING_VALUE'::text) AND ((violation_details ->> 'category'::text) = 'MISSED_FREQUENCY'::text) AND (COALESCE((violation_details ->> 'ticket_type'::text), ''::text) = ANY (ARRAY['SUBMISSION_ACKNOWLEDGEMENT'::text, 'NOTEBOOK_ACK_OVERDUE'::text])) AND (NULLIF((violation_details ->> 'notebook_submission_id'::text), ''::text) IS NOT NULL))`
- `operator_tickets_pp_notebook_incomplete_uq`: `CREATE UNIQUE INDEX operator_tickets_pp_notebook_incomplete_uq ON ticketing_system.operator_tickets USING btree (((violation_details ->> 'entry_id'::text)), ((violation_details ->> 'notebook'::text))) WHERE (((ticket_reason)::text = 'MISSING_VALUE'::text) AND ((violation_details ->> 'category'::text) = 'MISSED_FREQUENCY'::text) AND ((violation_details ->> 'ticket_type'::text) = 'PP_NOTEBOOK_INCOMPLETE'::text) AND (NULLIF((violation_details ->> 'entry_id'::text), ''::text) IS NOT NULL))`
- `operator_tickets_status_created_at_idx`: `CREATE INDEX operator_tickets_status_created_at_idx ON ticketing_system.operator_tickets USING btree (status, created_at DESC)`
- `operator_tickets_submission_frequency_idx`: `CREATE INDEX operator_tickets_submission_frequency_idx ON ticketing_system.operator_tickets USING btree (submission_frequency_config_id)`

</details>

#### `ticketing_system.pp_approval_config`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| config_key | text | NOT NULL | 'global'::text | PK |
| l4_user_id | integer |  |  |  |
| tat_hours | integer | NOT NULL | 24 |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |
| l4_user_ids | int4[] | NOT NULL | ARRAY[]::integer[] |  |

#### `ticketing_system.pp_batch_config`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| config_key | text | NOT NULL | 'global'::text | PK |
| completion_threshold_hours | integer | NOT NULL | 24 |  |
| l2_tat_hours | integer |  |  |  |
| approval_l1_user_ids | int4[] | NOT NULL | ARRAY[]::integer[] |  |
| approval_l2_user_ids | int4[] | NOT NULL | ARRAY[]::integer[] |  |
| is_active | boolean | NOT NULL | true |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |
| l3_tat_hours | integer |  |  |  |
| l4_tat_hours | integer |  |  |  |
| l5_tat_hours | integer |  |  |  |
| approval_l3_user_ids | int4[] | NOT NULL | ARRAY[]::integer[] |  |
| approval_l4_user_ids | int4[] | NOT NULL | ARRAY[]::integer[] |  |
| approval_l5_user_ids | int4[] | NOT NULL | ARRAY[]::integer[] |  |

#### `ticketing_system.pp_batch_sub_department_config`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| sub_department | text | NOT NULL |  | PK |
| completion_threshold_hours | integer | NOT NULL |  |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |

#### `ticketing_system.pp_notebook_batch_config`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| config_key | text | NOT NULL | 'global'::text | PK |
| completion_threshold_hours | integer | NOT NULL | 24 |  |
| l2_tat_hours | integer |  |  |  |
| is_active | boolean | NOT NULL | true |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |
| approval_l1_user_ids | int4[] | NOT NULL | ARRAY[]::integer[] |  |
| approval_l2_user_ids | int4[] | NOT NULL | ARRAY[]::integer[] |  |

#### `ticketing_system.pp_notebook_threshold`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.pp_notebook_th | PK |
| notebook_label | text | NOT NULL |  | UQ |
| completion_threshold_hours | integer | NOT NULL |  |  |
| approval_l1_user_ids | int4[] | NOT NULL | ARRAY[]::integer[] |  |
| approval_l2_user_ids | int4[] | NOT NULL | ARRAY[]::integer[] |  |
| is_active | boolean | NOT NULL | true |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |
| department | text |  |  |  |
| sub_department | text |  |  |  |
| severity | text | NOT NULL | 'High'::text |  |
| approval_l4_user_ids | int4[] | NOT NULL | ARRAY[]::integer[] |  |
| approve_within_hours | integer |  |  |  |

<details><summary>Indexes (1)</summary>

- `pp_notebook_threshold_notebook_label_key`: `CREATE UNIQUE INDEX pp_notebook_threshold_notebook_label_key ON ticketing_system.pp_notebook_threshold USING btree (notebook_label)`

</details>

#### `ticketing_system.pp_threshold_master`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.pp_threshold_m | PK |
| notebook_name | text | NOT NULL |  | UQ |
| completion_threshold_hours | integer | NOT NULL |  |  |
| approval_l1_user_ids | int4[] | NOT NULL | ARRAY[]::integer[] |  |
| approval_l1_names | text[] | NOT NULL | ARRAY[]::text[] |  |
| approval_l2_user_ids | int4[] | NOT NULL | ARRAY[]::integer[] |  |
| approval_l2_names | text[] | NOT NULL | ARRAY[]::text[] |  |
| is_active | boolean | NOT NULL | true |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (1)</summary>

- `pp_threshold_master_notebook_name_key`: `CREATE UNIQUE INDEX pp_threshold_master_notebook_name_key ON ticketing_system.pp_threshold_master USING btree (notebook_name)`

</details>

#### `ticketing_system.pp_thresholds`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.pp_thresholds_ | PK |
| notebook_name | text | NOT NULL |  |  |
| completion_threshold_hours | integer | NOT NULL |  |  |
| approval_l1 | text |  |  |  |
| approval_l1_name | text |  |  |  |
| approval_l2 | text |  |  |  |
| approval_l2_name | text |  |  |  |
| is_active | boolean | NOT NULL | true |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (1)</summary>

- `pp_thresholds_notebook_name_uq`: `CREATE UNIQUE INDEX pp_thresholds_notebook_name_uq ON ticketing_system.pp_thresholds USING btree (notebook_name)`

</details>

#### `ticketing_system.screen_submission_frequency`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.screen_submiss | PK |
| screen_name | text | NOT NULL |  | UQ |
| department | text |  |  | UQ |
| sub_department | text |  |  | UQ |
| range | integer | NOT NULL |  |  |
| frequency | integer |  |  |  |
| is_active | boolean | NOT NULL | true |  |
| approval_l1 | text |  |  |  |
| approval_l1_name | text |  |  |  |
| approval_l2 | text |  |  |  |
| approval_l2_name | text |  |  |  |
| created_at | timestamp without time zone | NOT NULL | now() |  |
| updated_at | timestamp without time zone | NOT NULL | now() |  |
| l1_tat_hours | integer |  |  |  |
| l2_tat_hours | integer |  |  |  |
| approval_l3 | text |  |  |  |
| approval_l3_name | text |  |  |  |
| l3_tat_hours | integer |  |  |  |
| l4_tat_hours | integer |  |  |  |
| l5_tat_hours | integer |  |  |  |
| tracked_l1_user_ids | int4[] | NOT NULL | ARRAY[]::integer[] |  |
| input_field | text |  |  |  |
| criticality | text |  |  |  |
| actual_value | numeric |  |  |  |
| value_mode | text |  |  |  |
| plus_threshold | numeric |  |  |  |
| minus_threshold | numeric |  |  |  |
| positive_tolerance_percent | numeric |  |  |  |
| negative_tolerance_percent | numeric |  |  |  |
| occurrences | integer |  |  |  |

<details><summary>Indexes (2)</summary>

- `screen_submission_frequency_screen_dept_subdept_uq`: `CREATE UNIQUE INDEX screen_submission_frequency_screen_dept_subdept_uq ON ticketing_system.screen_submission_frequency USING btree (screen_name, department, sub_department)`
- `screen_submission_frequency_screen_name_department_sub_depa_key`: `CREATE UNIQUE INDEX screen_submission_frequency_screen_name_department_sub_depa_key ON ticketing_system.screen_submission_frequency USING btree (screen_name, department, sub_department)`

</details>

#### `ticketing_system.submitted_notebooks`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.submitted_note |  |
| notebook_submission_id | text | NOT NULL |  |  |
| department | text |  |  |  |
| sub_department | text |  |  |  |
| notebook | text | NOT NULL |  |  |
| input_screen | text |  |  |  |
| entry_id | text |  |  |  |
| source_schema | text |  |  |  |
| source_table | text |  |  |  |
| source_record_id | text |  |  |  |
| submitted_by_user_id | integer |  |  |  |
| submitted_by_name | text |  |  |  |
| submitted_payload | jsonb | NOT NULL | '{}'::jsonb |  |
| l2_approver_user_ids | int4[] | NOT NULL | ARRAY[]::integer[] |  |
| status | text | NOT NULL | 'PENDING_ACK'::text |  |
| submitted_at | timestamp with time zone | NOT NULL | now() |  |
| ack_due_at | timestamp with time zone | NOT NULL | (now() + '24:00:00'::interval) |  |
| acknowledged_at | timestamp with time zone |  |  |  |
| acknowledged_by_user_id | integer |  |  |  |
| acknowledged_by_name | text |  |  |  |
| acknowledgement_note | text |  |  |  |
| overdue_ticket_id | text |  |  |  |
| overdue_ticket_created_at | timestamp with time zone |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |
| l3_approver_user_ids | int4[] | NOT NULL | ARRAY[]::integer[] |  |
| l2_approver_user_names | text[] | NOT NULL | ARRAY[]::text[] |  |
| l3_approver_user_names | text[] | NOT NULL | ARRAY[]::text[] |  |
| l4_approver_user_ids | int4[] | NOT NULL | ARRAY[]::integer[] |  |
| l5_approver_user_ids | int4[] | NOT NULL | ARRAY[]::integer[] |  |

<details><summary>Indexes (3)</summary>

- `submitted_notebooks_l2_status_due_idx`: `CREATE INDEX submitted_notebooks_l2_status_due_idx ON ticketing_system.submitted_notebooks USING btree (status, ack_due_at DESC)`
- `submitted_notebooks_submission_id_uq`: `CREATE UNIQUE INDEX submitted_notebooks_submission_id_uq ON ticketing_system.submitted_notebooks USING btree (notebook_submission_id)`
- `submitted_notebooks_submitted_at_idx`: `CREATE INDEX submitted_notebooks_submitted_at_idx ON ticketing_system.submitted_notebooks USING btree (submitted_at DESC)`

</details>

#### `ticketing_system.threshold_master`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.threshold_mast |  |
| management_field | character varying(100) | NOT NULL |  |  |
| erp_product_code | character varying(100) | NOT NULL |  |  |
| machine_name | character varying(100) | NOT NULL |  |  |
| parameter_name | character varying(100) | NOT NULL |  |  |
| is_active | boolean | NOT NULL | true |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |
| department | character varying(100) |  |  |  |
| sub_department | character varying(100) |  |  |  |
| input_screen | character varying(150) |  |  |  |
| input_field | character varying(100) |  |  |  |
| condition_level | character varying(30) |  | 'More Than'::character varying |  |
| idle_value | character varying(100) |  |  |  |
| plus_threshold | numeric |  |  |  |
| minus_threshold | numeric |  |  |  |
| threshold_value | numeric |  |  |  |
| approval_l2_user_id | integer |  |  |  |
| approval_l1_user_id | integer |  |  |  |
| approval_l3_user_id | integer |  |  |  |
| l1_tat_hours | integer |  |  |  |
| l2_tat_hours | integer |  |  |  |
| l3_tat_hours | integer |  |  |  |
| actual_value | character varying(100) |  |  |  |
| criticality | character varying(20) |  |  |  |

#### `ticketing_system.threshold_master_l1_approvers`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.threshold_mast |  |
| threshold_master_id | bigint | NOT NULL |  |  |
| approver_user_id | integer | NOT NULL |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (1)</summary>

- `threshold_master_l1_approvers_threshold_user_uq`: `CREATE UNIQUE INDEX threshold_master_l1_approvers_threshold_user_uq ON ticketing_system.threshold_master_l1_approvers USING btree (threshold_master_id, approver_user_id)`

</details>

#### `ticketing_system.threshold_master_l2_approvers`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.threshold_mast |  |
| threshold_master_id | bigint | NOT NULL |  |  |
| approver_user_id | integer | NOT NULL |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (1)</summary>

- `threshold_master_l2_approvers_threshold_user_uq`: `CREATE UNIQUE INDEX threshold_master_l2_approvers_threshold_user_uq ON ticketing_system.threshold_master_l2_approvers USING btree (threshold_master_id, approver_user_id)`

</details>

#### `ticketing_system.threshold_master_l3_approvers`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.threshold_mast | PK |
| threshold_master_id | bigint | NOT NULL |  | UQ |
| approver_user_id | integer | NOT NULL |  | UQ |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (2)</summary>

- `threshold_master_l3_approvers_threshold_master_id_approver__key`: `CREATE UNIQUE INDEX threshold_master_l3_approvers_threshold_master_id_approver__key ON ticketing_system.threshold_master_l3_approvers USING btree (threshold_master_id, approver_user_id)`
- `threshold_master_l3_approvers_threshold_user_uq`: `CREATE UNIQUE INDEX threshold_master_l3_approvers_threshold_user_uq ON ticketing_system.threshold_master_l3_approvers USING btree (threshold_master_id, approver_user_id)`

</details>

#### `ticketing_system.ticket_approvals`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.ticket_approva | PK |
| ticket_id | text | NOT NULL |  |  |
| level | text | NOT NULL |  |  |
| action_status | text | NOT NULL |  |  |
| performed_by | text |  |  |  |
| role | text |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (1)</summary>

- `ticket_approvals_ticket_id_idx`: `CREATE INDEX ticket_approvals_ticket_id_idx ON ticketing_system.ticket_approvals USING btree (ticket_id)`

</details>

#### `ticketing_system.ticket_logs`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('ticketing_system.ticket_logs_id |  |
| ticket_id | character varying(50) | NOT NULL |  |  |
| action | character varying(50) | NOT NULL |  |  |
| performed_by | character varying(100) | NOT NULL |  |  |
| role | character varying(50) |  |  |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |

#### `ticketing_system.user_guide_entries`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('ticketing_system.user_guide_ent | PK |
| title | character varying(200) | NOT NULL |  |  |
| slug | character varying(220) | NOT NULL |  | UQ |
| content | text | NOT NULL |  |  |
| section | character varying(100) |  |  |  |
| display_order | integer | NOT NULL | 0 |  |
| is_active | boolean | NOT NULL | true |  |
| created_by_user_id | integer |  |  |  |
| updated_by_user_id | integer |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (2)</summary>

- `user_guide_entries_section_idx`: `CREATE INDEX user_guide_entries_section_idx ON ticketing_system.user_guide_entries USING btree (is_active, section, display_order, id)`
- `user_guide_entries_slug_key`: `CREATE UNIQUE INDEX user_guide_entries_slug_key ON ticketing_system.user_guide_entries USING btree (slug)`

</details>

#### `ticketing_system.wheel_change_approval_config`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| config_key | text | NOT NULL | 'global'::text | PK |
| l4_user_id | integer |  |  |  |
| tat_hours | integer | NOT NULL | 24 |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |
| l4_user_ids | int4[] | NOT NULL | ARRAY[]::integer[] |  |
| is_active | boolean | NOT NULL | true |  |
| severity | text | NOT NULL | 'High'::text |  |

### Schema: `process_parameters`

#### `process_parameters.entry_id_sequences`  <sub>(1 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| sequence_key | text | NOT NULL |  | PK |
| last_number | bigint | NOT NULL | 0 |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |

#### `process_parameters.master`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('process_parameters.master_id_se | PK |
| entry_id | text | NOT NULL |  | UQ |
| created_by_user_id | integer |  |  |  |
| created_by_name | text |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |
| status | text | NOT NULL | 'in_progress'::text |  |
| reviewed_by | text |  |  |  |
| reviewed_at | timestamp with time zone |  |  |  |
| review_remarks | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `master_entry_id_key`: `CREATE UNIQUE INDEX master_entry_id_key ON process_parameters.master USING btree (entry_id)`

</details>

#### `process_parameters.master_entries`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('process_parameters.master_entri | PK |
| entry_id | text | NOT NULL |  | UQ |
| title | text | NOT NULL | 'Process Parameter Master'::text |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (1)</summary>

- `master_entries_entry_id_key`: `CREATE UNIQUE INDEX master_entries_entry_id_key ON process_parameters.master_entries USING btree (entry_id)`

</details>

#### `process_parameters.parameter_entries`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('process_parameters.parameter_en | PK |
| master_id | bigint | NOT NULL |  | FK→process_parameters.master_entries.id |
| entry_id | text | NOT NULL |  |  |
| department | text | NOT NULL |  |  |
| process_type | text | NOT NULL |  |  |
| data | jsonb | NOT NULL | '{}'::jsonb |  |
| is_blank | boolean | NOT NULL | true |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (2)</summary>

- `process_parameters_parameter_entries_entry_id_idx`: `CREATE INDEX process_parameters_parameter_entries_entry_id_idx ON process_parameters.parameter_entries USING btree (entry_id)`
- `process_parameters_parameter_entries_uq`: `CREATE UNIQUE INDEX process_parameters_parameter_entries_uq ON process_parameters.parameter_entries USING btree (master_id, department, process_type)`

</details>

### Schema: `reports`

#### `reports.report_schedules`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | text | NOT NULL |  | PK |
| schedule | jsonb | NOT NULL |  |  |
| mail_payload | jsonb | NOT NULL |  |  |
| active | boolean | NOT NULL | true |  |
| frequency | character varying(30) |  |  |  |
| last_auto_sent_key | text |  |  |  |
| last_sent_at | timestamp with time zone |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |

### Schema: `trials`

#### `trials.trials`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('trials.trials_id_seq'::regclass |  |
| date | date | NOT NULL |  |  |
| spinning_machine | character varying(255) | NOT NULL |  |  |
| autoconer_machine | character varying(255) |  |  |  |
| count_name | character varying(255) | NOT NULL |  |  |
| purpose | text |  |  |  |
| trial_id_name | character varying(255) |  |  |  |
| type | character varying(255) |  |  |  |
| nature | character varying(255) |  |  |  |
| unit_no | character varying(255) |  |  |  |
| raw_material | character varying(100) |  |  |  |
| mixing | character varying(100) |  |  |  |
| yarn_results | text |  |  |  |
| total_cuts | integer |  |  |  |
| neps_cuts | integer |  |  |  |
| shorts_cuts | integer |  |  |  |
| long_cuts | integer |  |  |  |
| thin_cuts | integer |  |  |  |
| cp | numeric(6,2) |  |  |  |
| cm | numeric(6,2) |  |  |  |
| ccp | numeric(6,2) |  |  |  |
| ccm | numeric(6,2) |  |  |  |
| jp | numeric(6,2) |  |  |  |
| a1 | numeric(6,2) |  |  |  |
| a2 | numeric(6,2) |  |  |  |
| a3 | numeric(6,2) |  |  |  |
| a4 | numeric(6,2) |  |  |  |
| b1 | numeric(6,2) |  |  |  |
| b2 | numeric(6,2) |  |  |  |
| b3 | numeric(6,2) |  |  |  |
| b4 | numeric(6,2) |  |  |  |
| c1 | numeric(6,2) |  |  |  |
| c2 | numeric(6,2) |  |  |  |
| c3 | numeric(6,2) |  |  |  |
| c4 | numeric(6,2) |  |  |  |
| d1 | numeric(6,2) |  |  |  |
| d2 | numeric(6,2) |  |  |  |
| d3 | numeric(6,2) |  |  |  |
| d4 | numeric(6,2) |  |  |  |
| e | numeric(6,2) |  |  |  |
| f | numeric(6,2) |  |  |  |
| g | numeric(6,2) |  |  |  |
| h1 | numeric(6,2) |  |  |  |
| h2 | numeric(6,2) |  |  |  |
| l1 | numeric(6,2) |  |  |  |
| l2 | numeric(6,2) |  |  |  |
| cvp | numeric(6,2) |  |  |  |
| user_id | character varying(255) |  |  |  |
| u_percent | numeric(6,2) |  |  |  |
| cvm | numeric(6,2) |  |  |  |
| cvm_cv_percent | numeric(6,2) |  |  |  |
| cvm_10mtr | numeric(6,2) |  |  |  |
| dr_1_5m | numeric(6,2) |  |  |  |
| thin_minus_50 | numeric(6,2) |  |  |  |
| thick_plus_50 | numeric(6,2) |  |  |  |
| neps_plus_200 | numeric(6,2) |  |  |  |
| total_regular | numeric(6,2) |  |  |  |
| thin_minus_40 | numeric(6,2) |  |  |  |
| thick_plus_35 | numeric(6,2) |  |  |  |
| neps_plus_140 | numeric(6,2) |  |  |  |
| total_hs | numeric(6,2) |  |  |  |
| thin_minus_30 | numeric(6,2) |  |  |  |
| yarn_count | numeric(6,2) |  |  |  |
| csp | numeric(8,2) |  |  |  |
| entry_time | time without time zone |  |  |  |
| mc_no | character varying(100) |  |  |  |
| product | character varying(100) |  |  |  |
| trial_type | character varying(100) |  |  |  |
| raw_material_mixing | character varying(255) |  |  |  |
| yarn_remarks | text |  |  |  |
| jm | numeric(6,2) |  |  |  |
| cvb | numeric(6,2) |  |  |  |
| fl_cut | numeric(6,2) |  |  |  |
| fd_cut | numeric(6,2) |  |  |  |
| df_drg_mc_no | character varying(100) |  |  |  |
| df_finish_u_percent | numeric(6,2) |  |  |  |
| df_cvim | numeric(6,2) |  |  |  |
| df_cvb | numeric(6,2) |  |  |  |
| smx_no | character varying(100) |  |  |  |
| spl_no | character varying(100) |  |  |  |
| roving_percent | numeric(6,2) |  |  |  |
| smx_cvim | numeric(6,2) |  |  |  |
| entry_id | text |  |  |  |
| test | text |  |  |  |
| spider | text |  | ''::text |  |
| moisture_mixing | numeric |  | 0 |  |
| blow_new_field | text |  | ''::text |  |

<details><summary>Indexes (1)</summary>

- `trials_trials_entry_id_uq`: `CREATE UNIQUE INDEX trials_trials_entry_id_uq ON trials.trials USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

### Schema: `public`

#### `public.hvi_records`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('hvi_records_id_seq'::regclass) |  |
| doc_type | text |  | 'hvi'::text |  |
| filename | text |  |  |  |
| ocr_json | jsonb |  |  |  |
| manual_json | jsonb |  |  |  |
| created_at | timestamp with time zone |  | now() |  |

### Schema: `mixing`

#### `mixing.afis_data_entry`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| inspection_date | date | NOT NULL |  |  |
| lot_no | character varying(50) | NOT NULL |  |  |
| variety | character varying(100) | NOT NULL |  |  |
| invoice_no | character varying(100) | NOT NULL |  |  |
| invoice_date | date | NOT NULL |  |  |
| uql | numeric(10,2) |  |  |  |
| l5 | numeric(10,2) |  |  |  |
| sfc_n | numeric(10,2) |  |  |  |
| ifc | numeric(10,2) |  |  |  |
| fibre_neps_gms | numeric(10,2) |  |  |  |
| sfc_w | numeric(10,2) |  |  |  |
| maturity | numeric(10,2) |  |  |  |
| fineness | numeric(10,2) |  |  |  |
| scn_gms | numeric(10,2) |  |  |  |
| entry_id | text |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| operator | text |  |  |  |
| lw | numeric |  |  |  |
| ln | numeric |  |  |  |
| total_nep_count | numeric |  |  |  |

<details><summary>Indexes (1)</summary>

- `afis_data_entry_entry_id_uq`: `CREATE UNIQUE INDEX afis_data_entry_entry_id_uq ON mixing.afis_data_entry USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `mixing.afis6_cotton_data_entry`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('mixing.afis6_cotton_data_entry_ | PK |
| entry_id | text |  |  |  |
| inspection_date | date | NOT NULL | CURRENT_DATE |  |
| lot_no | character varying(255) |  |  |  |
| variety | character varying(255) |  |  |  |
| invoice_date | date |  |  |  |
| mc_name | character varying(255) |  |  |  |
| blow_room | character varying(255) |  |  |  |
| carding | character varying(255) |  |  |  |
| breaker_drawing | character varying(255) |  |  |  |
| finisher_drawing | character varying(255) |  |  |  |
| comber | character varying(255) |  |  |  |
| scp_nep_count | numeric(12,3) |  |  |  |
| l_w_mm | numeric(12,3) |  |  |  |
| l_w_cv | numeric(12,3) |  |  |  |
| sfc_w_percent | numeric(12,3) |  |  |  |
| uql_w_mm | numeric(12,3) |  |  |  |
| l_n_mm | numeric(12,3) |  |  |  |
| l_n_cv_percent | numeric(12,3) |  |  |  |
| sfc_n_percent | numeric(12,3) |  |  |  |
| five_pct_l_n_mm | numeric(12,3) |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |
| sc_nep_count_g | numeric |  |  |  |
| crimp_percent | numeric |  |  |  |
| operator | text |  |  |  |

<details><summary>Indexes (2)</summary>

- `afis6_cotton_data_entry_entry_id_uq`: `CREATE UNIQUE INDEX afis6_cotton_data_entry_entry_id_uq ON mixing.afis6_cotton_data_entry USING btree (entry_id) WHERE (entry_id IS NOT NULL)`
- `afis6_cotton_data_entry_inspection_date_idx`: `CREATE INDEX afis6_cotton_data_entry_inspection_date_idx ON mixing.afis6_cotton_data_entry USING btree (inspection_date DESC)`

</details>

#### `mixing.afis6_mmf_data_entry`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('mixing.afis6_mmf_data_entry_id_ | PK |
| entry_id | text |  |  |  |
| inspection_date | date | NOT NULL | CURRENT_DATE |  |
| machine_name | character varying(255) |  |  |  |
| lot_no | character varying(255) |  |  |  |
| variety | character varying(255) |  |  |  |
| invoice_date | date |  |  |  |
| mc_name | character varying(255) |  |  |  |
| blow_room | character varying(255) |  |  |  |
| carding | character varying(255) |  |  |  |
| breaker_drawing | character varying(255) |  |  |  |
| finisher_drawing | character varying(255) |  |  |  |
| comber | character varying(255) |  |  |  |
| total_nep_count_g | numeric(12,3) |  |  |  |
| total_nep_mean_size_um | numeric(12,3) |  |  |  |
| fiber_nep_count_g | numeric(12,3) |  |  |  |
| fiber_nep_mean_size_um | numeric(12,3) |  |  |  |
| sc_nep_count_g | numeric(12,3) |  |  |  |
| sc_nep_mean_size_um | numeric(12,3) |  |  |  |
| l_w_mm | numeric(12,3) |  |  |  |
| l_w_cv | numeric(12,3) |  |  |  |
| sfc_w_percent | numeric(12,3) |  |  |  |
| uql_w_mm | numeric(12,3) |  |  |  |
| l_n_mm | numeric(12,3) |  |  |  |
| l_n_cv_percent | numeric(12,3) |  |  |  |
| sfc_n_percent | numeric(12,3) |  |  |  |
| five_pct_l_n_mm | numeric(12,3) |  |  |  |
| fitness_index | numeric(12,3) |  |  |  |
| maturity_ratio_mat1 | numeric(12,3) |  |  |  |
| ifc_percent | numeric(12,3) |  |  |  |
| fifty_pct_l_n_mm | numeric(12,3) |  |  |  |
| cut_length_n_mm | numeric(12,3) |  |  |  |
| fineness_den | numeric(12,3) |  |  |  |
| fineness_cv_percent | numeric(12,3) |  |  |  |
| long_fiber_gt_46_80_percent | numeric(12,3) |  |  |  |
| long_fiber_count_gt_46_80 | numeric(12,3) |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |
| crimp_percent | numeric |  |  |  |
| material_class | character varying(255) |  |  |  |
| comment | character varying(255) |  |  |  |
| operator | text |  |  |  |

<details><summary>Indexes (2)</summary>

- `afis6_mmf_data_entry_entry_id_uq`: `CREATE UNIQUE INDEX afis6_mmf_data_entry_entry_id_uq ON mixing.afis6_mmf_data_entry USING btree (entry_id) WHERE (entry_id IS NOT NULL)`
- `afis6_mmf_data_entry_inspection_date_idx`: `CREATE INDEX afis6_mmf_data_entry_inspection_date_idx ON mixing.afis6_mmf_data_entry USING btree (inspection_date DESC)`

</details>

#### `mixing.br_waste_study`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('mixing.br_waste_study_id_seq':: | PK |
| waste_study_id | character varying(50) | NOT NULL |  |  |
| date | date | NOT NULL |  |  |
| variety | character varying(100) | NOT NULL |  |  |
| study_type | character varying(50) |  |  |  |
| carding_production_kg | numeric(10,2) | NOT NULL |  |  |
| type_entries | numeric(10,2) | NOT NULL |  |  |
| flat_speed | numeric(8,2) |  |  |  |
| delivery_speed | numeric(8,2) |  |  |  |
| wing1_speed | numeric(8,2) |  |  |  |
| wing2_speed | numeric(8,2) |  |  |  |
| lickerin_speed_1 | numeric(8,2) |  |  |  |
| lickerin_speed_2 | numeric(8,2) |  |  |  |
| lickerin_speed_3 | numeric(8,2) |  |  |  |
| mc_no | character varying(100) |  |  |  |
| mc_production | numeric(10,2) |  |  |  |
| waste_type | character varying(100) | NOT NULL |  |  |
| waste_kg | numeric(10,2) | NOT NULL |  |  |
| waste_percent | numeric(6,2) |  |  |  |
| overall_percent | numeric(6,2) |  |  |  |
| remarks | text |  |  |  |

#### `mixing.cotton_hvi_data_entry`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| inspection_date | date | NOT NULL |  |  |
| lot_no | character varying(50) | NOT NULL |  |  |
| variety | character varying(100) | NOT NULL |  |  |
| invoice_no | character varying(100) | NOT NULL |  |  |
| invoice_date | date | NOT NULL |  |  |
| sci | numeric(10,2) |  |  |  |
| span_length | numeric(10,2) |  |  |  |
| mic | numeric(10,2) |  |  |  |
| gtex | numeric(10,2) |  |  |  |
| maturity | numeric(10,2) |  |  |  |
| ur | numeric(10,2) |  |  |  |
| sfi | numeric(10,2) |  |  |  |
| elongation | numeric(10,2) |  |  |  |
| yellow_b | numeric(10,2) |  |  |  |
| trcnt | numeric(10,2) |  |  |  |
| rd | numeric(10,2) |  |  |  |
| colour_grade | numeric(10,2) |  |  |  |
| trash_content_percentage | numeric |  |  |  |
| invisible_loss_percentage | numeric |  |  |  |
| trar | numeric |  |  |  |
| trid | numeric |  |  |  |
| entry_id | text |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| operator | text |  |  |  |
| moisture | numeric |  |  |  |
| strength | numeric |  |  |  |
| amt | numeric |  |  |  |
| cotton_hvi_1 | numeric(18,2) |  | 0 |  |

<details><summary>Indexes (1)</summary>

- `cotton_hvi_data_entry_entry_id_uq`: `CREATE UNIQUE INDEX cotton_hvi_data_entry_entry_id_uq ON mixing.cotton_hvi_data_entry USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `mixing.drop_test`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('mixing.drop_test_id_seq'::regcl | PK |
| drop_id | character varying(50) | NOT NULL |  |  |
| date | date | NOT NULL |  |  |
| variety | character varying(100) | NOT NULL |  |  |
| blend | character varying(100) |  |  |  |
| tuft_no | integer | NOT NULL |  |  |
| tuft_variety | character varying(100) |  |  |  |
| display_weight | numeric(8,3) | NOT NULL |  |  |
| actual_weight | numeric(8,3) | NOT NULL |  |  |
| difference | numeric(8,3) |  |  |  |
| ratio_percent | numeric(6,2) |  |  |  |

#### `mixing.fibre_data_entry`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| inspection_date | date | NOT NULL |  |  |
| lot_no | character varying(50) | NOT NULL |  |  |
| variety | character varying(100) | NOT NULL |  |  |
| invoice_no | character varying(100) | NOT NULL |  |  |
| invoice_date | date | NOT NULL |  |  |
| cut_length | numeric(10,2) |  |  |  |
| length_cv | numeric(10,2) |  |  |  |
| mean_denier | numeric(10,2) |  |  |  |
| cv_per_denier | numeric(10,2) |  |  |  |
| tenacity | numeric(10,2) |  |  |  |
| cv_per_tenacity | numeric(10,2) |  |  |  |
| elongation | numeric(10,2) |  |  |  |
| cv_per_elongation | numeric(10,2) |  |  |  |
| crimp | numeric(10,2) |  |  |  |
| whiteness_index | numeric(10,2) |  |  |  |
| spin_finish | numeric(10,2) |  |  |  |
| entry_id | text |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| operator | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `fibre_data_entry_entry_id_uq`: `CREATE UNIQUE INDEX fibre_data_entry_entry_id_uq ON mixing.fibre_data_entry USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `mixing.mixing_qc_blends`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| blend_id | integer | NOT NULL | nextval('mixing.mixing_qc_blends_blend_i |  |
| qc_id | integer | NOT NULL |  | FK→mixing.mixing_qc_header.qc_id |
| blend_no | integer | NOT NULL |  |  |
| percentage | numeric(5,2) | NOT NULL |  |  |
| lot_no | character varying(100) |  |  |  |
| cut_length | character varying(50) |  |  |  |
| tenacity | numeric(6,2) |  |  |  |
| elongation | numeric(6,2) |  |  |  |
| merge_no | character varying(100) |  |  |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |

#### `mixing.mixing_qc_header`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| qc_id | integer | NOT NULL | nextval('mixing.mixing_qc_header_qc_id_s | PK |
| param_id | character varying(10) |  | ('PP'::text \|\| lpad((nextval('mixing.p | UQ |
| process_parameter | character varying(100) |  | 'Mixing'::character varying |  |
| consignee_name | character varying(255) |  |  |  |
| count_name | character varying(255) |  |  |  |
| creation_date | date |  |  |  |
| status | character varying(20) |  | 'UNDONE'::character varying |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |
| entry_id | text |  |  |  |
| operator | text |  |  |  |

<details><summary>Indexes (2)</summary>

- `mixing_qc_header_entry_id_uq`: `CREATE UNIQUE INDEX mixing_qc_header_entry_id_uq ON mixing.mixing_qc_header USING btree (entry_id) WHERE (entry_id IS NOT NULL)`
- `mixing_qc_header_param_id_key`: `CREATE UNIQUE INDEX mixing_qc_header_param_id_key ON mixing.mixing_qc_header USING btree (param_id)`

</details>

#### `mixing.moisture_data_entry`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| inspection_date | date | NOT NULL |  |  |
| party_lot_no | character varying(50) | NOT NULL |  |  |
| variety | character varying(100) | NOT NULL |  |  |
| party_name | character varying(100) | NOT NULL |  |  |
| pr_no | character varying(100) | NOT NULL |  |  |
| value1 | numeric(10,2) |  |  |  |
| value2 | numeric(10,2) |  |  |  |
| value3 | numeric(10,2) |  |  |  |
| value4 | numeric(10,2) |  |  |  |
| value5 | numeric(10,2) |  |  |  |
| value6 | numeric(10,2) |  |  |  |
| value7 | numeric(10,2) |  |  |  |
| value8 | numeric(10,2) |  |  |  |
| value9 | numeric(10,2) |  |  |  |
| value10 | numeric(10,2) |  |  |  |
| average | numeric(10,2) |  |  |  |
| entry_id | text |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| operator | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `moisture_data_entry_entry_id_uq`: `CREATE UNIQUE INDEX moisture_data_entry_entry_id_uq ON mixing.moisture_data_entry USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `mixing.openness_entries`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('mixing.openness_entries_id_seq' | PK |
| inspection_id | integer |  |  | UQ, FK→mixing.openness_inspection.id |
| entry_no | integer | NOT NULL |  | UQ |
| stage_no | integer | NOT NULL |  |  |
| machine_name | character varying(100) |  |  |  |
| weight | numeric(10,2) |  |  |  |
| volume_1 | numeric(10,2) |  |  |  |
| volume_2 | numeric(10,2) |  |  |  |
| apparent_specific_volume | numeric(10,2) |  |  |  |
| actual_op_value | numeric(10,2) |  |  |  |
| beater_type | character varying(100) |  |  |  |
| beater_speed_rpm | numeric(10,2) |  |  |  |
| average_volume | numeric(12,3) |  |  |  |

<details><summary>Indexes (1)</summary>

- `openness_entries_inspection_id_entry_no_key`: `CREATE UNIQUE INDEX openness_entries_inspection_id_entry_no_key ON mixing.openness_entries USING btree (inspection_id, entry_no)`

</details>

#### `mixing.openness_inspection`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('mixing.openness_inspection_id_s | PK |
| inspection_date | date | NOT NULL |  |  |
| mixing | character varying(100) |  |  |  |
| actual_specific_volume_target | numeric(10,2) |  |  |  |
| no_of_entries | integer | NOT NULL |  |  |
| created_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |
| br_line_no | character varying(100) |  |  |  |
| operator | text |  |  |  |
| br_line | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `openness_inspection_entry_id_uq`: `CREATE UNIQUE INDEX openness_inspection_entry_id_uq ON mixing.openness_inspection USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

### Schema: `blowroom`

#### `blowroom.between_lap_cv`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('blowroom.between_lap_cv_id_seq' | PK |
| entry_id | character varying(20) |  |  | UQ |
| record_date | date |  |  |  |
| machine_name | character varying(100) |  |  |  |
| variety | character varying(100) |  |  |  |
| type | character varying(50) |  |  |  |
| lap_weight | numeric(10,2) |  |  |  |
| lap_length | numeric(10,2) |  |  |  |
| grams_per_meter | numeric(10,2) |  |  |  |
| samples | jsonb |  |  |  |
| average | numeric(10,2) |  |  |  |
| minimum | numeric(10,2) |  |  |  |
| maximum | numeric(10,2) |  |  |  |
| std_deviation | numeric(10,2) |  |  |  |
| cv_percent | numeric(10,2) |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (2)</summary>

- `between_lap_cv_entry_id_key`: `CREATE UNIQUE INDEX between_lap_cv_entry_id_key ON blowroom.between_lap_cv USING btree (entry_id)`
- `between_lap_cv_entry_id_uq`: `CREATE UNIQUE INDEX between_lap_cv_entry_id_uq ON blowroom.between_lap_cv USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `blowroom.blow_room_sync`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('blowroom.blow_room_sync_id_seq' |  |
| inspection_date | date | NOT NULL |  |  |
| line_no | character varying(50) | NOT NULL |  |  |
| variety | character varying(50) | NOT NULL |  |  |
| checked_by | character varying(50) | NOT NULL |  |  |
| beater | character varying(50) | NOT NULL |  |  |
| total_time | time without time zone | NOT NULL |  |  |
| number_of_entries | integer | NOT NULL |  |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |
| entry_id | character varying(80) |  |  |  |

<details><summary>Indexes (1)</summary>

- `blow_room_sync_entry_id_uq`: `CREATE UNIQUE INDEX blow_room_sync_entry_id_uq ON blowroom.blow_room_sync USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `blowroom.blow_room_sync_entries`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('blowroom.blow_room_sync_entries |  |
| sync_id | integer | NOT NULL |  |  |
| entry_no | integer | NOT NULL |  |  |
| value_a | numeric(10,2) |  |  |  |
| value_b | numeric(10,2) |  |  |  |
| value_c | numeric(10,2) |  |  |  |
| sync_percentage | numeric(10,2) |  |  |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |

#### `blowroom.blowroom_header`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| br_id | integer | NOT NULL | nextval('blowroom.blowroom_header_br_id_ |  |
| br_code | character varying(10) |  | ('PP'::text \|\| lpad((nextval('blowroom |  |
| count_name | character varying(255) |  |  |  |
| consignee_name | character varying(255) |  |  |  |
| creation_date | date |  |  |  |
| line_numbers | integer |  |  |  |
| rotary_beater_speed | numeric(10,2) |  |  |  |
| depth | numeric(10,2) |  |  |  |
| mpm_delivery_speed | numeric(10,2) |  |  |  |
| mpm_delivery_pascals | numeric(10,2) |  |  |  |
| condensor_speed | numeric(10,2) |  |  |  |
| rk_feed_roll_beater | numeric(10,2) |  |  |  |
| rk_beater_speed | numeric(10,2) |  |  |  |
| flexi_to_feed_roll_beater | numeric(10,2) |  |  |  |
| flexi_beater_speed | numeric(10,2) |  |  |  |
| scutcher_no | integer |  |  |  |
| rk_mo_speed | numeric(10,2) |  |  |  |
| kb_speed | numeric(10,2) |  |  |  |
| grid_bar | numeric(10,2) |  |  |  |
| lap_weight | numeric(10,2) |  |  |  |
| uniclean | numeric(10,2) |  |  |  |
| srs | numeric(10,2) |  |  |  |
| rk_flexi | numeric(10,2) |  |  |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |
| entry_id | character varying(80) |  |  |  |

<details><summary>Indexes (1)</summary>

- `blowroom_header_entry_id_uq`: `CREATE UNIQUE INDEX blowroom_header_entry_id_uq ON blowroom.blowroom_header USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `blowroom.br_waste_study`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('blowroom.br_waste_study_id_seq' | PK |
| entry_id | character varying(80) |  |  |  |
| waste_study_id | character varying(80) |  |  |  |
| date | date | NOT NULL |  |  |
| variety | character varying(120) |  |  |  |
| study_type | character varying(20) | NOT NULL |  |  |
| carding_production_kg | numeric(12,4) |  |  |  |
| type_entries | integer |  |  |  |
| waste_type | character varying(120) |  |  |  |
| waste_kg | numeric(12,4) |  |  |  |
| waste_percent | numeric(12,4) |  |  |  |
| overall_percent | numeric(12,4) |  |  |  |
| remarks | text |  |  |  |
| entry_type | character varying(120) |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| flat_speed | numeric(12,4) |  |  |  |
| delivery_speed | numeric(12,4) |  |  |  |
| wing1_speed | numeric(12,4) |  |  |  |
| wing2_speed | numeric(12,4) |  |  |  |
| lickerin_speed_1 | numeric(12,4) |  |  |  |
| lickerin_speed_2 | numeric(12,4) |  |  |  |
| lickerin_speed_3 | numeric(12,4) |  |  |  |

<details><summary>Indexes (2)</summary>

- `br_waste_study_entry_id_uq`: `CREATE UNIQUE INDEX br_waste_study_entry_id_uq ON blowroom.br_waste_study USING btree (entry_id) WHERE (entry_id IS NOT NULL)`
- `br_waste_study_waste_study_id_uq`: `CREATE UNIQUE INDEX br_waste_study_waste_study_id_uq ON blowroom.br_waste_study USING btree (waste_study_id) WHERE (waste_study_id IS NOT NULL)`

</details>

#### `blowroom.br_waste_study_type_rows`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('blowroom.br_waste_study_type_ro | PK |
| study_id | bigint | NOT NULL |  | FK→blowroom.br_waste_study.id |
| row_no | integer | NOT NULL |  |  |
| cylinder_speed | numeric(12,4) |  |  |  |
| lickerin_speed | numeric(12,4) |  |  |  |
| flat_speed | numeric(12,4) |  |  |  |
| doffer_speed | numeric(12,4) |  |  |  |
| delivery_speed | numeric(12,4) |  |  |  |
| wing_setting_1 | numeric(12,4) |  |  |  |
| wing_setting_2 | numeric(12,4) |  |  |  |
| mc_no | character varying(80) |  |  |  |
| mc_production | numeric(12,4) |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| lickerin_speed_1 | numeric(12,4) |  |  |  |
| lickerin_speed_2 | numeric(12,4) |  |  |  |
| lickerin_speed_3 | numeric(12,4) |  |  |  |

<details><summary>Indexes (1)</summary>

- `br_waste_study_type_rows_study_id_idx`: `CREATE INDEX br_waste_study_type_rows_study_id_idx ON blowroom.br_waste_study_type_rows USING btree (study_id)`

</details>

#### `blowroom.br_waste_study_waste_rows`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('blowroom.br_waste_study_waste_r | PK |
| study_id | bigint | NOT NULL |  | FK→blowroom.br_waste_study.id |
| row_no | integer | NOT NULL |  |  |
| waste_type | character varying(120) | NOT NULL |  | FK→blowroom.br_waste_type_master.waste_type |
| waste_kgs_value | numeric(12,4) |  |  |  |
| waste_kgs_percent | numeric(12,4) |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (1)</summary>

- `br_waste_study_waste_rows_study_id_idx`: `CREATE INDEX br_waste_study_waste_rows_study_id_idx ON blowroom.br_waste_study_waste_rows USING btree (study_id)`

</details>

#### `blowroom.br_waste_type_master`  <sub>(6 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('blowroom.br_waste_type_master_i | PK |
| waste_type | character varying(120) | NOT NULL |  |  |
| waste_type_key | character varying(120) | NOT NULL |  |  |
| sort_order | integer | NOT NULL |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (2)</summary>

- `br_waste_type_master_waste_type_key_uq`: `CREATE UNIQUE INDEX br_waste_type_master_waste_type_key_uq ON blowroom.br_waste_type_master USING btree (waste_type_key)`
- `br_waste_type_master_waste_type_uq`: `CREATE UNIQUE INDEX br_waste_type_master_waste_type_uq ON blowroom.br_waste_type_master USING btree (waste_type)`

</details>

#### `blowroom.drop_test`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('blowroom.drop_test_id_seq'::reg |  |
| drop_id | character varying(50) | NOT NULL |  |  |
| date | date | NOT NULL |  |  |
| variety | character varying(100) | NOT NULL |  |  |
| blend | character varying(100) |  |  |  |
| tuft_no | integer | NOT NULL |  |  |
| tuft_variety | character varying(100) |  |  |  |
| display_weight | numeric(8,3) | NOT NULL |  |  |
| actual_weight | numeric(8,3) | NOT NULL |  |  |
| difference | numeric(8,3) |  |  |  |
| ratio_percent | numeric(6,2) |  |  |  |
| entry_id | character varying(80) |  |  |  |
| average_weight | numeric |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (1)</summary>

- `drop_test_entry_id_uq`: `CREATE UNIQUE INDEX drop_test_entry_id_uq ON blowroom.drop_test USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `blowroom.within_lap_cv`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('blowroom.within_lap_cv_id_seq': | PK |
| entry_id | character varying(20) |  |  | UQ |
| record_date | date |  |  |  |
| machine_name | character varying(100) |  |  |  |
| variety | character varying(100) |  |  |  |
| type | character varying(50) |  |  |  |
| lap_weight | numeric(10,2) |  |  |  |
| lap_length | numeric(10,2) |  |  |  |
| grams_per_meter | numeric(10,2) |  |  |  |
| samples | jsonb |  |  |  |
| average | numeric(10,2) |  |  |  |
| minimum | numeric(10,2) |  |  |  |
| maximum | numeric(10,2) |  |  |  |
| std_deviation | numeric(10,2) |  |  |  |
| cv_percent | numeric(10,2) |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (2)</summary>

- `within_lap_cv_entry_id_key`: `CREATE UNIQUE INDEX within_lap_cv_entry_id_key ON blowroom.within_lap_cv USING btree (entry_id)`
- `within_lap_cv_entry_id_uq`: `CREATE UNIQUE INDEX within_lap_cv_entry_id_uq ON blowroom.within_lap_cv USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

### Schema: `carding`

#### `carding.card_change_control`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('carding.card_change_control_id_ | PK |
| type | text | NOT NULL |  |  |
| test_no | text |  |  |  |
| entry_date | date | NOT NULL |  |  |
| cdo_no | text |  |  |  |
| cdg_no_proposed | text |  |  |  |
| remarks | text |  |  |  |
| created_at | timestamp with time zone |  | now() |  |

<details><summary>Indexes (1)</summary>

- `idx_card_change_control_entry_date`: `CREATE INDEX idx_card_change_control_entry_date ON carding.card_change_control USING btree (entry_date DESC)`

</details>

#### `carding.card_change_control_lines`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('carding.card_change_control_lin | PK |
| card_change_id | bigint | NOT NULL |  | FK→carding.card_change_control.id |
| parameter_name | text | NOT NULL |  |  |
| existing_value | text |  |  |  |
| proposed_value | text |  |  |  |
| line_order | integer | NOT NULL | 0 |  |

<details><summary>Indexes (1)</summary>

- `idx_card_change_control_lines_parent`: `CREATE INDEX idx_card_change_control_lines_parent ON carding.card_change_control_lines USING btree (card_change_id, line_order)`

</details>

#### `carding.card_dfk_pressure_checking`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('carding.card_dfk_pressure_check | PK |
| inspection_type | character varying(100) |  |  |  |
| entry_date | date |  |  |  |
| machine_name | character varying(10) |  |  |  |
| dfk | text |  | 0 |  |
| ccd | text |  | 0 |  |
| icfd_1 | text |  | 0 |  |
| lt | text |  | 0 |  |
| cds | text |  | 0 |  |
| silver_draft | text |  | 0 |  |
| icfd_2 | text |  | 0 |  |
| idf_in | text |  | 0 |  |
| idf_out | text |  | 0 |  |
| al_on | text |  | 0 |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `card_dfk_pressure_checking_entry_id_idx`: `CREATE INDEX card_dfk_pressure_checking_entry_id_idx ON carding.card_dfk_pressure_checking USING btree (entry_id)`

</details>

#### `carding.card_thick_place`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('carding.card_thick_place_id_seq |  |
| entry_date | date | NOT NULL |  |  |
| entry_time | time without time zone | NOT NULL |  |  |
| machine | character varying(50) | NOT NULL |  |  |
| cv_value | numeric(6,3) | NOT NULL |  |  |
| unit | character varying(20) | NOT NULL |  |  |

#### `carding.card_thick_place_header`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('carding.card_thick_place_header | PK |
| entry_id | text |  |  |  |
| entry_code | text |  |  |  |
| entry_date | date | NOT NULL |  |  |
| entry_time | time without time zone |  |  |  |
| remarks | text |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (2)</summary>

- `card_thick_place_header_entry_code_uq`: `CREATE UNIQUE INDEX card_thick_place_header_entry_code_uq ON carding.card_thick_place_header USING btree (entry_code) WHERE (entry_code IS NOT NULL)`
- `card_thick_place_header_entry_id_uq`: `CREATE UNIQUE INDEX card_thick_place_header_entry_id_uq ON carding.card_thick_place_header USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `carding.card_thick_place_values`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('carding.card_thick_place_values | PK |
| header_id | bigint | NOT NULL |  | FK→carding.card_thick_place_header.id |
| machine | text | NOT NULL |  |  |
| cv_value | numeric(12,4) |  |  |  |
| cv_5m_value | numeric(12,4) |  |  |  |
| unit | text |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (1)</summary>

- `card_thick_place_values_header_id_idx`: `CREATE INDEX card_thick_place_values_header_id_idx ON carding.card_thick_place_values USING btree (header_id)`

</details>

#### `carding.card_waste_study`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('carding.card_waste_study_id_seq | PK |
| entry_id | text |  |  |  |
| waste_study_id | text |  |  |  |
| date | date |  |  |  |
| variety | text |  |  |  |
| study_type | text |  |  |  |
| carding_production_kg | numeric(12,4) |  |  |  |
| type_entries | numeric(12,4) |  |  |  |
| flat_speed | numeric(12,4) |  |  |  |
| delivery_speed | numeric(12,4) |  |  |  |
| wing1_speed | numeric(12,4) |  |  |  |
| wing2_speed | numeric(12,4) |  |  |  |
| lickerin_speed_1 | numeric(12,4) |  |  |  |
| lickerin_speed_2 | numeric(12,4) |  |  |  |
| lickerin_speed_3 | numeric(12,4) |  |  |  |
| mc_no | text |  |  |  |
| mc_production | numeric(12,4) |  |  |  |
| waste_type | text |  |  |  |
| waste_kg | numeric(12,4) |  |  |  |
| waste_percent | numeric(12,4) |  |  |  |
| overall_percent | numeric(12,4) |  |  |  |
| remarks | text |  |  |  |
| entry_type | text |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (2)</summary>

- `card_waste_study_entry_id_uq`: `CREATE UNIQUE INDEX card_waste_study_entry_id_uq ON carding.card_waste_study USING btree (entry_id) WHERE (entry_id IS NOT NULL)`
- `card_waste_study_waste_study_id_uq`: `CREATE UNIQUE INDEX card_waste_study_waste_study_id_uq ON carding.card_waste_study USING btree (waste_study_id) WHERE (waste_study_id IS NOT NULL)`

</details>

#### `carding.card_waste_study_type_rows`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('carding.card_waste_study_type_r | PK |
| study_id | bigint | NOT NULL |  | FK→carding.card_waste_study.id |
| row_no | integer | NOT NULL |  |  |
| cylinder_speed | numeric(12,4) |  |  |  |
| lickerin_speed | numeric(12,4) |  |  |  |
| flat_speed | numeric(12,4) |  |  |  |
| doffer_speed | numeric(12,4) |  |  |  |
| delivery_speed | numeric(12,4) |  |  |  |
| wing_setting_1 | numeric(12,4) |  |  |  |
| wing_setting_2 | numeric(12,4) |  |  |  |
| mc_no | text |  |  |  |
| mc_production | numeric(12,4) |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| lickerin_speed_1 | numeric(12,4) |  |  |  |
| lickerin_speed_2 | numeric(12,4) |  |  |  |
| lickerin_speed_3 | numeric(12,4) |  |  |  |

<details><summary>Indexes (1)</summary>

- `card_waste_study_type_rows_study_id_idx`: `CREATE INDEX card_waste_study_type_rows_study_id_idx ON carding.card_waste_study_type_rows USING btree (study_id)`

</details>

#### `carding.card_waste_study_waste_rows`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('carding.card_waste_study_waste_ | PK |
| study_id | bigint | NOT NULL |  | FK→carding.card_waste_study.id |
| row_no | integer | NOT NULL |  |  |
| waste_type | text | NOT NULL |  | FK→carding.card_waste_type_master.waste_type |
| waste_kgs_value | numeric(12,4) |  |  |  |
| waste_kgs_percent | numeric(12,4) |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (1)</summary>

- `card_waste_study_waste_rows_study_id_idx`: `CREATE INDEX card_waste_study_waste_rows_study_id_idx ON carding.card_waste_study_waste_rows USING btree (study_id)`

</details>

#### `carding.card_waste_type_master`  <sub>(9 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('carding.card_waste_type_master_ | PK |
| waste_type | text | NOT NULL |  |  |
| waste_type_key | text | NOT NULL |  |  |
| sort_order | integer | NOT NULL |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (2)</summary>

- `card_waste_type_master_waste_type_key_uq`: `CREATE UNIQUE INDEX card_waste_type_master_waste_type_key_uq ON carding.card_waste_type_master USING btree (waste_type_key)`
- `card_waste_type_master_waste_type_uq`: `CREATE UNIQUE INDEX card_waste_type_master_waste_type_uq ON carding.card_waste_type_master USING btree (waste_type)`

</details>

#### `carding.carding_change_request`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('carding.carding_change_request_ |  |
| type | text | NOT NULL |  |  |
| test_no | integer |  |  |  |
| entry_date | date | NOT NULL |  |  |
| cdo_no | text |  |  |  |
| cdg_no_proposed | text |  |  |  |
| remarks | text |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| mixing_existing | text |  |  |  |
| mixing_proposed | text |  |  |  |
| blend_percent_existing | text |  |  |  |
| blend_percent_proposed | text |  |  |  |
| del_hank_existing | numeric(10,3) |  |  |  |
| del_hank_proposed | numeric(10,3) |  |  |  |
| feed_weight_existing | numeric(10,3) |  |  |  |
| feed_weight_proposed | numeric(10,3) |  |  |  |
| speed_existing | numeric(10,2) |  |  |  |
| speed_proposed | numeric(10,2) |  |  |  |
| licker_in_speed_1_existing | numeric(10,2) |  |  |  |
| licker_in_speed_1_proposed | numeric(10,2) |  |  |  |
| cylinder_speed_existing | numeric(10,2) |  |  |  |
| cylinder_speed_proposed | numeric(10,2) |  |  |  |
| flats_speed_mm_min_existing | numeric(10,3) |  |  |  |
| flats_speed_mm_min_proposed | numeric(10,3) |  |  |  |
| feed_plate_to_licker_in_existing | numeric(10,3) |  |  |  |
| feed_plate_to_licker_in_proposed | numeric(10,3) |  |  |  |
| sfl_existing | numeric(10,3) |  |  |  |
| sfl_proposed | numeric(10,3) |  |  |  |
| sfd_existing | numeric(10,3) |  |  |  |
| sfd_proposed | numeric(10,3) |  |  |  |
| cylinder_to_flats_existing | numeric(10,3) |  |  |  |
| cylinder_to_flats_proposed | numeric(10,3) |  |  |  |
| cylinder_in_doffer_existing | numeric(10,3) |  |  |  |
| cylinder_in_doffer_proposed | numeric(10,3) |  |  |  |
| web_speed_draft_mw_v4_existing | numeric(10,3) |  |  |  |
| web_speed_draft_mw_v4_proposed | numeric(10,3) |  |  |  |
| lc_wing_setting_existing | numeric(10,3) |  |  |  |
| lc_wing_setting_proposed | numeric(10,3) |  |  |  |
| rr_rk_beater_speed_existing | numeric(10,2) |  |  |  |
| rr_rk_beater_speed_proposed | numeric(10,2) |  |  |  |
| entry_id | text |  |  |  |
| licker_in_speed_2_existing | numeric(10,2) |  |  |  |
| licker_in_speed_2_proposed | numeric(10,2) |  |  |  |
| operator | text |  |  |  |
| approval_status | text |  | 'pending'::text |  |
| review_remarks | text |  |  |  |
| reviewed_by | text |  |  |  |
| reviewed_at | timestamp with time zone |  |  |  |
| department | text |  |  |  |

<details><summary>Indexes (3)</summary>

- `carding_change_request_entry_id_uq`: `CREATE UNIQUE INDEX carding_change_request_entry_id_uq ON carding.carding_change_request USING btree (entry_id) WHERE (entry_id IS NOT NULL)`
- `idx_carding_change_request_entry_date`: `CREATE INDEX idx_carding_change_request_entry_date ON carding.carding_change_request USING btree (entry_date DESC)`
- `idx_carding_change_request_type`: `CREATE INDEX idx_carding_change_request_type ON carding.carding_change_request USING btree (type)`

</details>

#### `carding.carding_qc_header`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| qc_id | integer | NOT NULL | nextval('carding.carding_qc_header_qc_id | PK |
| qc_code | character varying(10) |  | ('PP'::text \|\| lpad((nextval('carding. | UQ |
| type | character varying(50) |  |  |  |
| count_name | character varying(255) |  |  |  |
| consignee_name | character varying(255) |  |  |  |
| creation_date | date |  |  |  |
| machine_no | integer |  |  |  |
| lickerin_speed | numeric(10,2) |  |  |  |
| cylinder_speed | numeric(10,2) |  |  |  |
| flats_speed | numeric(10,2) |  |  |  |
| delivery_speed | numeric(10,2) |  |  |  |
| draft_speed | numeric(10,2) |  |  |  |
| tension_draft | numeric(10,2) |  |  |  |
| delivery_hank | numeric(10,2) |  |  |  |
| setting | character varying(50) |  |  |  |
| feed_roll_to_lickerin | numeric(10,2) |  |  |  |
| lickerin_to_cylinder | numeric(10,2) |  |  |  |
| cylinder_to_flats | numeric(10,2) |  |  |  |
| cylinder_to_doffer | numeric(10,2) |  |  |  |
| sfl | numeric(10,2) |  |  |  |
| sfd | numeric(10,2) |  |  |  |
| lickerin | numeric(10,2) |  |  |  |
| cylinder | numeric(10,2) |  |  |  |
| doffer | numeric(10,2) |  |  |  |
| flats | numeric(10,2) |  |  |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (2)</summary>

- `carding_qc_header_entry_id_uq`: `CREATE UNIQUE INDEX carding_qc_header_entry_id_uq ON carding.carding_qc_header USING btree (entry_id) WHERE (entry_id IS NOT NULL)`
- `carding_qc_header_qc_code_key`: `CREATE UNIQUE INDEX carding_qc_header_qc_code_key ON carding.carding_qc_header USING btree (qc_code)`

</details>

#### `carding.hanks`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('carding.hanks_id_seq'::regclass |  |
| inspection_id | character varying(50) |  |  | FK→carding.inspections.id |
| entry_no | integer |  |  |  |
| value | numeric(10,3) |  |  |  |

#### `carding.inspections`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | character varying(50) | NOT NULL |  | PK |
| type_category | character varying(100) |  |  |  |
| inspection_type | character varying(50) |  |  |  |
| mc_name | character varying(50) |  |  |  |
| inspection_date | date |  |  |  |
| num_entries | integer |  |  |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |

#### `carding.nati_data_entry`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('carding.nati_data_entry_id_seq' | PK |
| type | character varying(50) | NOT NULL |  |  |
| entry_date | date |  |  |  |
| variety | character varying(100) |  |  |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |
| updated_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |
| entry_id | text |  |  |  |
| operator | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `nati_data_entry_entry_id_uq`: `CREATE UNIQUE INDEX nati_data_entry_entry_id_uq ON carding.nati_data_entry USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `carding.neps_details`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('carding.neps_details_id_seq'::r | PK |
| qc_id | integer | NOT NULL |  | FK→carding.nati_data_entry.id |
| mc_no | character varying(50) |  |  |  |
| ratio_size_1 | numeric(10,2) |  |  |  |
| ratio_size_07 | numeric(10,2) |  |  |  |
| ratio_size_05 | numeric(10,2) |  |  |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |

<details><summary>Indexes (1)</summary>

- `idx_neps_qc_id`: `CREATE INDEX idx_neps_qc_id ON carding.neps_details USING btree (qc_id)`

</details>

#### `carding.nre`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('carding.nre_id_seq'::regclass) | PK |
| entry_id | character varying(20) |  |  | UQ |
| machine_model | character varying(50) |  |  |  |
| mc_name | character varying(100) |  |  |  |
| cylinder_specs | character varying(255) |  |  |  |
| cylinder_tonnage_1 | numeric(10,2) |  |  |  |
| cylinder_tonnage_2 | numeric(10,2) |  |  |  |
| doffer_specs | character varying(255) |  |  |  |
| doffer_tonnage_1 | numeric(10,2) |  |  |  |
| doffer_tonnage_2 | numeric(10,2) |  |  |  |
| flat_specs | character varying(255) |  |  |  |
| flat_tonnage_1 | numeric(10,2) |  |  |  |
| flat_tonnage_2 | numeric(10,2) |  |  |  |
| lickerin_specs | character varying(255) |  |  |  |
| lickerin_tonnage_1 | numeric(10,2) |  |  |  |
| lickerin_tonnage_2 | numeric(10,2) |  |  |  |
| silver_hank | numeric(10,2) |  |  |  |
| delivery_mtr_min | numeric(10,2) |  |  |  |
| fibre_nep_gms_card_mat | numeric(10,2) |  |  |  |
| fibre_nep_gms_silver | numeric(10,2) |  |  |  |
| carding_nre_percent | numeric(10,2) |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (1)</summary>

- `nre_entry_id_key`: `CREATE UNIQUE INDEX nre_entry_id_key ON carding.nre USING btree (entry_id)`

</details>

#### `carding.sample_weights`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('carding.sample_weights_id_seq': |  |
| inspection_id | character varying(50) |  |  | FK→carding.inspections.id |
| entry_no | integer |  |  |  |
| value | numeric(10,3) |  |  |  |

#### `carding.u_data_entry`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('carding.u_data_entry_id_seq'::r |  |
| entry_type | character varying(50) | NOT NULL |  |  |
| entry_date | date | NOT NULL |  |  |
| shift | text |  |  |  |
| variety | character varying(100) |  |  |  |
| mc_no | character varying(50) |  |  |  |
| u_percent | numeric(10,2) |  |  |  |
| cvm | numeric(10,2) |  |  |  |
| cvm_1m | numeric(10,2) |  |  |  |
| cvm_3m | numeric(10,2) |  |  |  |
| remarks | text |  |  |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `u_data_entry_entry_id_uq`: `CREATE UNIQUE INDEX u_data_entry_entry_id_uq ON carding.u_data_entry USING btree (entry_id)`

</details>

### Schema: `drawframe`

#### `drawframe.cots_breaker_data`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('drawframe.cots_breaker_data_id_ |  |
| entry_id | integer |  |  | FK→drawframe.cots_data_entry.id |
| mc_name | character varying(50) |  |  |  |
| fan_waste | text |  |  |  |
| cot_change | text |  |  |  |
| stripper_w | text |  |  |  |
| thick_place | text |  |  |  |
| created_at | timestamp with time zone |  | now() |  |

#### `drawframe.cots_data_entry`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('drawframe.cots_data_entry_id_se | PK |
| main_type | character varying(100) |  | 'Draw Frame Cots Data Entry'::character  |  |
| sub_type | character varying(50) |  |  |  |
| entry_date | date |  |  |  |
| shift | character varying(20) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |
| operator | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `cots_data_entry_entry_id_uq`: `CREATE UNIQUE INDEX cots_data_entry_entry_id_uq ON drawframe.cots_data_entry USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `drawframe.cots_finisher_data`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('drawframe.cots_finisher_data_id |  |
| entry_id | integer |  |  | FK→drawframe.cots_data_entry.id |
| mc_name | character varying(50) |  |  |  |
| fan_waste | text |  |  |  |
| cot_change | text |  |  |  |
| stripper_w | text |  |  |  |
| thick_place | text |  |  |  |
| auto_level | text |  |  |  |
| silver_worn | text |  |  |  |
| main_tin | text |  |  |  |
| scanning | text |  |  |  |
| created_at | timestamp with time zone |  | now() |  |

#### `drawframe.drawframe_qc_header`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| ins_id | integer | NOT NULL | nextval('drawframe.drawframe_qc_header_i |  |
| ins_code | character varying(10) |  | ('PP'::text \|\| lpad((nextval('drawfram |  |
| type | character varying(100) |  |  |  |
| count_name | character varying(255) |  |  |  |
| consignee_name | character varying(255) |  |  |  |
| creation_date | date |  |  |  |
| make | character varying(150) |  |  |  |
| no_of_ends | integer |  |  |  |
| bottom_roll_setting | character varying(100) |  |  |  |
| breaker_draft | numeric(10,2) |  |  |  |
| total_draft | numeric(10,2) |  |  |  |
| hank | numeric(10,2) |  |  |  |
| web_tension_draft | numeric(10,2) |  |  |  |
| trumpet_size | numeric(10,2) |  |  |  |
| delivery_speed | numeric(10,2) |  |  |  |
| pressure_bar | character varying(100) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |
| entry_scope | text |  |  |  |
| insert_size | numeric |  |  |  |
| web_funnel_size | numeric |  |  |  |
| delivery_hank | numeric |  |  |  |
| scanning_rolls_size | character varying(255) |  |  |  |
| operator | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `drawframe_qc_header_entry_id_scope_uq`: `CREATE UNIQUE INDEX drawframe_qc_header_entry_id_scope_uq ON drawframe.drawframe_qc_header USING btree (entry_id, entry_scope) WHERE (entry_id IS NOT NULL)`

</details>

#### `drawframe.u_data_entry`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('drawframe.u_data_entry_id_seq': |  |
| entry_type | character varying(50) | NOT NULL |  |  |
| entry_date | date | NOT NULL |  |  |
| shift | character varying(20) |  |  |  |
| variety | character varying(100) |  |  |  |
| department | character varying(100) |  |  |  |
| mc_no | character varying(50) |  |  |  |
| u_percent | numeric(10,2) |  |  |  |
| cvm | numeric(10,2) |  |  |  |
| cvm_1m | numeric(10,2) |  |  |  |
| cvm_3m | numeric(10,2) |  |  |  |
| remarks | text |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |
| operator | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `drawframe_u_data_entry_entry_id_uq`: `CREATE UNIQUE INDEX drawframe_u_data_entry_entry_id_uq ON drawframe.u_data_entry USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `drawframe.wheel_change`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('drawframe.wheel_change_id_seq': | PK |
| entry_id | text |  |  |  |
| type | text | NOT NULL | 'Wheel Change'::text |  |
| line_type | text |  |  |  |
| wheel_change_type | text |  |  |  |
| parameters | jsonb | NOT NULL | '[]'::jsonb |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |
| wheel_change_type_label | text |  |  |  |
| rows | jsonb | NOT NULL | '{}'::jsonb |  |
| operator | text |  |  |  |
| remarks | text |  |  |  |
| approval_status | text |  | 'pending'::text |  |
| review_remarks | text |  |  |  |
| reviewed_by | text |  |  |  |
| reviewed_at | timestamp with time zone |  |  |  |
| machine_no | text |  |  |  |
| entry_date | date |  |  |  |
| submitted_by | text |  |  |  |

<details><summary>Indexes (4)</summary>

- `drawframe_wheel_change_entry_date_idx`: `CREATE INDEX drawframe_wheel_change_entry_date_idx ON drawframe.wheel_change USING btree (entry_date DESC, id DESC)`
- `drawframe_wheel_change_entry_id_uq`: `CREATE UNIQUE INDEX drawframe_wheel_change_entry_id_uq ON drawframe.wheel_change USING btree (entry_id) WHERE (entry_id IS NOT NULL)`
- `drawframe_wheel_change_machine_no_idx`: `CREATE INDEX drawframe_wheel_change_machine_no_idx ON drawframe.wheel_change USING btree (machine_no, created_at DESC)`
- `drawframe_wheel_change_machine_status_idx`: `CREATE INDEX drawframe_wheel_change_machine_status_idx ON drawframe.wheel_change USING btree (machine_no, approval_status, entry_date DESC, id DESC)`

</details>

#### `drawframe.yarn_cv_percent`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('drawframe.yarn_cv_percent_id_se | PK |
| type | character varying(100) |  |  |  |
| s_no | character varying(50) |  |  |  |
| entry_date | date |  |  |  |
| machine_number | character varying(20) |  |  |  |
| remarks | text |  |  |  |
| num_readings | integer |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |
| operator | text |  |  |  |
| readings | jsonb | NOT NULL | '{}'::jsonb |  |

<details><summary>Indexes (1)</summary>

- `yarn_cv_percent_entry_id_uq`: `CREATE UNIQUE INDEX yarn_cv_percent_entry_id_uq ON drawframe.yarn_cv_percent USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `drawframe.yarn_cv_yard_results`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('drawframe.yarn_cv_yard_results_ | PK |
| qc_id | integer |  |  | FK→drawframe.yarn_cv_percent.id |
| avg_1yd | numeric(10,4) |  |  |  |
| hank_1yd | numeric(10,4) |  |  |  |
| sd_1yd | numeric(10,4) |  |  |  |
| cv_1yd | numeric(10,4) |  |  |  |
| avg_half | numeric(10,4) |  |  |  |
| hank_half | numeric(10,4) |  |  |  |
| sd_half | numeric(10,4) |  |  |  |
| cv_half | numeric(10,4) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |

### Schema: `simplex`

#### `simplex.simplex_inspection_details`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('simplex.simplex_inspection_deta |  |
| inspection_id | bigint | NOT NULL |  |  |
| item_name | character varying(100) | NOT NULL |  |  |
| status_value | character varying(100) |  |  |  |
| remarks | text |  |  |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |

<details><summary>Indexes (1)</summary>

- `simplex_inspection_details_inspection_id_idx`: `CREATE INDEX simplex_inspection_details_inspection_id_idx ON simplex.simplex_inspection_details USING btree (inspection_id)`

</details>

#### `simplex.simplex_inspections`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('simplex.simplex_inspections_id_ |  |
| type | character varying(100) | NOT NULL |  |  |
| s_no | character varying(50) |  |  |  |
| entry_date | date | NOT NULL |  |  |
| machine_name | character varying(100) | NOT NULL |  |  |
| created_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `simplex_inspections_entry_id_uq`: `CREATE UNIQUE INDEX simplex_inspections_entry_id_uq ON simplex.simplex_inspections USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `simplex.simplex_notebook`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('simplex.simplex_notebook_id_seq | PK |
| entry_id | text |  |  |  |
| notebook_type | text |  |  |  |
| entry_date | date |  |  |  |
| sap_no | text |  |  |  |
| proposed_sap_no | text |  |  |  |
| parameter_rows | jsonb | NOT NULL | '[]'::jsonb |  |
| notes | jsonb | NOT NULL | '{}'::jsonb |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (2)</summary>

- `simplex_simplex_notebook_entry_date_idx`: `CREATE INDEX simplex_simplex_notebook_entry_date_idx ON simplex.simplex_notebook USING btree (entry_date DESC, id DESC)`
- `simplex_simplex_notebook_entry_id_uq`: `CREATE UNIQUE INDEX simplex_simplex_notebook_entry_id_uq ON simplex.simplex_notebook USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `simplex.simplex_process_parameter`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('simplex.simplex_process_paramet |  |
| ins_code | character varying(10) |  | ('PP'::text \|\| lpad((nextval('simplex. |  |
| type | character varying(50) |  | 'Process Parameter'::character varying |  |
| count_name | character varying(100) | NOT NULL |  |  |
| consignee_name | character varying(100) | NOT NULL |  |  |
| creation_date | date | NOT NULL |  |  |
| machine_no | character varying(50) |  |  |  |
| make | character varying(100) |  |  |  |
| delivery_hank | numeric(8,2) |  |  |  |
| tpi_tm | character varying(100) |  |  |  |
| speed | numeric(8,2) |  |  |  |
| bottom_roller_setting | character varying(100) |  |  |  |
| top_roller_setting | character varying(100) |  |  |  |
| break_draft | numeric(8,2) |  |  |  |
| total_draft | numeric(8,2) |  |  |  |
| creel_draft | numeric(8,2) |  |  |  |
| false_twist_grooves | character varying(100) |  |  |  |
| spacer | character varying(100) |  |  |  |
| top_arm_pressure | numeric(8,2) |  |  |  |
| back_pressure | character varying(100) |  |  |  |
| middle_pressure | character varying(100) |  |  |  |
| front_pressure | character varying(100) |  |  |  |
| coil_inch | numeric(8,2) |  |  |  |
| lifter_combination_wheel | character varying(100) |  |  |  |
| lifter_wheel | character varying(100) |  |  |  |
| tension_wheel | character varying(100) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `simplex_process_parameter_entry_id_uq`: `CREATE UNIQUE INDEX simplex_process_parameter_entry_id_uq ON simplex.simplex_process_parameter USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `simplex.smx_breaks_inspection_items`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('simplex.smx_breaks_inspection_i |  |
| study_id | integer | NOT NULL |  |  |
| item_name | character varying(100) |  |  |  |
| status_value | character varying(50) |  |  |  |
| remarks | text |  |  |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |
| length_range | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `idx_smx_breaks_items_study_id`: `CREATE INDEX idx_smx_breaks_items_study_id ON simplex.smx_breaks_inspection_items USING btree (study_id)`

</details>

#### `simplex.smx_breaks_study_header`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('simplex.smx_breaks_study_header |  |
| s_no | character varying(50) | NOT NULL |  |  |
| entry_date | date | NOT NULL |  |  |
| machine_name | character varying(100) | NOT NULL |  |  |
| operator_name | character varying(100) |  |  |  |
| shift | character(1) |  |  |  |
| remarks | text |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `smx_breaks_study_header_entry_id_uq`: `CREATE UNIQUE INDEX smx_breaks_study_header_entry_id_uq ON simplex.smx_breaks_study_header USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `simplex.smx_epi_parameters`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('simplex.smx_epi_parameters_id_s |  |
| study_id | integer | NOT NULL |  |  |
| yarn_a1 | numeric(10,2) |  |  |  |
| yarn_a2 | numeric(10,2) |  |  |  |
| yarn_a3 | numeric(10,2) |  |  |  |
| yarn_a4 | numeric(10,2) |  |  |  |
| yarn_b1 | numeric(10,2) |  |  |  |
| yarn_b2 | numeric(10,2) |  |  |  |
| yarn_b3 | numeric(10,2) |  |  |  |
| yarn_b4 | numeric(10,2) |  |  |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |

#### `simplex.smx_other_field_values`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('simplex.smx_other_field_values_ |  |
| study_id | integer | NOT NULL |  |  |
| time | time without time zone |  |  |  |
| break_count | integer |  |  |  |
| remarks | text |  |  |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |

#### `simplex.smx_user_fiber_parameters`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('simplex.smx_user_fiber_paramete |  |
| study_id | integer | NOT NULL |  |  |
| a1 | character varying(50) |  |  |  |
| a2 | character varying(50) |  |  |  |
| a3 | character varying(50) |  |  |  |
| a4 | character varying(50) |  |  |  |
| b1 | character varying(50) |  |  |  |
| b2 | character varying(50) |  |  |  |
| b3 | character varying(50) |  |  |  |
| b4 | character varying(50) |  |  |  |
| c1 | character varying(50) |  |  |  |
| c2 | character varying(50) |  |  |  |
| c3 | character varying(50) |  |  |  |
| c4 | character varying(50) |  |  |  |
| d1 | character varying(50) |  |  |  |
| d2 | character varying(50) |  |  |  |
| d3 | character varying(50) |  |  |  |
| d4 | character varying(50) |  |  |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |

#### `simplex.u_data_entry`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('simplex.u_data_entry_id_seq'::r |  |
| entry_type | character varying(50) | NOT NULL |  |  |
| entry_date | date | NOT NULL |  |  |
| shift | character varying(20) |  |  |  |
| variety | character varying(100) |  |  |  |
| department | character varying(100) |  |  |  |
| mc_no | character varying(50) |  |  |  |
| u_percent | numeric(10,2) |  |  |  |
| cvm | numeric(10,2) |  |  |  |
| cvm_1m | numeric(10,2) |  |  |  |
| cvm_3m | numeric(10,2) |  |  |  |
| remarks | text |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `simplex_u_data_entry_entry_id_uq`: `CREATE UNIQUE INDEX simplex_u_data_entry_entry_id_uq ON simplex.u_data_entry USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `simplex.wheel_change`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('simplex.wheel_change_id_seq'::r | PK |
| entry_id | text |  |  |  |
| type | text | NOT NULL | 'Wheel Change'::text |  |
| machine_no | text |  |  |  |
| wheel_change_type | text |  |  |  |
| wheel_change_type_label | text |  |  |  |
| entry_date | date |  |  |  |
| parameters | jsonb | NOT NULL | '[]'::jsonb |  |
| rows | jsonb | NOT NULL | '{}'::jsonb |  |
| operator | text |  |  |  |
| remarks | text |  |  |  |
| approval_status | text |  | 'pending'::text |  |
| review_remarks | text |  |  |  |
| reviewed_by | text |  |  |  |
| reviewed_at | timestamp with time zone |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |
| proposed_sap_no | text |  |  |  |

<details><summary>Indexes (3)</summary>

- `simplex_wheel_change_entry_date_idx`: `CREATE INDEX simplex_wheel_change_entry_date_idx ON simplex.wheel_change USING btree (entry_date DESC, id DESC)`
- `simplex_wheel_change_entry_id_uq`: `CREATE UNIQUE INDEX simplex_wheel_change_entry_id_uq ON simplex.wheel_change USING btree (entry_id) WHERE (entry_id IS NOT NULL)`
- `simplex_wheel_change_machine_no_idx`: `CREATE INDEX simplex_wheel_change_machine_no_idx ON simplex.wheel_change USING btree (machine_no, created_at DESC)`

</details>

### Schema: `autoconer`

#### `autoconer.autoconer_process_parameter`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.autoconer_process_par | PK |
| ins_code | character varying(15) |  | ('PP'::text \|\| lpad((nextval('autocone | UQ |
| type | character varying(50) |  | 'Process Parameter'::character varying |  |
| count_name | character varying(100) | NOT NULL |  |  |
| consignee_name | character varying(100) | NOT NULL |  |  |
| creation_date | date | NOT NULL |  |  |
| machine_no | character varying(50) |  |  |  |
| drum_no | character varying(50) |  |  |  |
| speed | numeric(6,2) |  |  |  |
| p_cone_identification | character varying(100) |  |  |  |
| cone_weight | numeric(6,2) |  |  |  |
| initial_winding_tension | numeric(6,2) |  |  |  |
| standard_winding_tension | numeric(6,2) |  |  |  |
| touch_winding_tension | numeric(6,2) |  |  |  |
| t_release_add_tension | numeric(6,2) |  |  |  |
| tension_release_end_yarn_layer | numeric(6,2) |  |  |  |
| tension_release_decrease_ratio | numeric(6,2) |  |  |  |
| tension_release_valid_yarn_layer | numeric(6,2) |  |  |  |
| splicing_setting | character varying(100) |  |  |  |
| water_on_off | character varying(50) |  |  |  |
| splicing_length_adjust_parameter | numeric(6,2) |  |  |  |
| splicing_nozzle | character varying(100) |  |  |  |
| cradle_pressure | numeric(6,2) |  |  |  |
| cone_density | numeric(6,2) |  |  |  |
| cone_cops | character varying(100) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |
| entry_pool | text | NOT NULL | 'process'::text |  |

<details><summary>Indexes (3)</summary>

- `autoconer_process_parameter_entry_id_uq`: `CREATE UNIQUE INDEX autoconer_process_parameter_entry_id_uq ON autoconer.autoconer_process_parameter USING btree (entry_id) WHERE (entry_id IS NOT NULL)`
- `autoconer_process_parameter_entry_pool_entry_id_uq`: `CREATE UNIQUE INDEX autoconer_process_parameter_entry_pool_entry_id_uq ON autoconer.autoconer_process_parameter USING btree (entry_pool, entry_id) WHERE (entry_id IS NOT NULL)`
- `autoconer_process_parameter_ins_code_key`: `CREATE UNIQUE INDEX autoconer_process_parameter_ins_code_key ON autoconer.autoconer_process_parameter USING btree (ins_code)`

</details>

#### `autoconer.autoconer_q2_inspection`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.autoconer_q2_inspecti | PK |
| ins_code | character varying(15) |  | ('PP'::text \|\| lpad((nextval('autocone | UQ |
| type | character varying(50) |  | 'Autoconer Q2'::character varying |  |
| count_name | character varying(100) | NOT NULL |  |  |
| consignee_name | character varying(100) | NOT NULL |  |  |
| creation_date | date | NOT NULL |  |  |
| n_value | numeric(6,2) |  |  |  |
| s_value | numeric(6,2) |  |  |  |
| l_value | numeric(6,2) |  |  |  |
| lh1 | numeric(6,2) |  |  |  |
| lh2 | numeric(6,2) |  |  |  |
| lh3 | numeric(6,2) |  |  |  |
| lh4 | numeric(6,2) |  |  |  |
| lh5 | numeric(6,2) |  |  |  |
| lh6 | numeric(6,2) |  |  |  |
| tht | numeric(6,2) |  |  |  |
| th1 | numeric(6,2) |  |  |  |
| th2 | numeric(6,2) |  |  |  |
| th3 | numeric(6,2) |  |  |  |
| th4 | numeric(6,2) |  |  |  |
| th5 | numeric(6,2) |  |  |  |
| th6 | numeric(6,2) |  |  |  |
| cp | numeric(6,2) |  |  |  |
| cm | numeric(6,2) |  |  |  |
| ccp | numeric(6,2) |  |  |  |
| ccm | numeric(6,2) |  |  |  |
| pc | numeric(6,2) |  |  |  |
| fault_distance | numeric(6,2) |  |  |  |
| no_of_faults | integer |  |  |  |
| jp | numeric(6,2) |  |  |  |
| jm | numeric(6,2) |  |  |  |
| up | numeric(6,2) |  |  |  |
| fl | numeric(6,2) |  |  |  |
| flh1 | numeric(6,2) |  |  |  |
| flh2 | numeric(6,2) |  |  |  |
| flh3 | numeric(6,2) |  |  |  |
| flh4 | numeric(6,2) |  |  |  |
| fd | numeric(6,2) |  |  |  |
| fdh1 | numeric(6,2) |  |  |  |
| fdh2 | numeric(6,2) |  |  |  |
| fdh3 | numeric(6,2) |  |  |  |
| fdh4 | numeric(6,2) |  |  |  |
| fdh5 | numeric(6,2) |  |  |  |
| reference_length | numeric(6,2) |  |  |  |
| measurement | numeric(6,2) |  |  |  |
| upper_alarm_limit | numeric(6,2) |  |  |  |
| lower_alarm_limit | numeric(6,2) |  |  |  |
| action | character varying(255) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (2)</summary>

- `autoconer_q2_inspection_entry_id_uq`: `CREATE UNIQUE INDEX autoconer_q2_inspection_entry_id_uq ON autoconer.autoconer_q2_inspection USING btree (entry_id) WHERE (entry_id IS NOT NULL)`
- `autoconer_q2_inspection_ins_code_key`: `CREATE UNIQUE INDEX autoconer_q2_inspection_ins_code_key ON autoconer.autoconer_q2_inspection USING btree (ins_code)`

</details>

#### `autoconer.autoconer_q3_inspection`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.autoconer_q3_inspecti | PK |
| ins_code | character varying(15) |  | ('PP'::text \|\| lpad((nextval('autocone | UQ |
| type | character varying(50) |  | 'PP-Autoconer Q3'::character varying |  |
| count_name | character varying(100) | NOT NULL |  |  |
| consignee_name | character varying(100) | NOT NULL |  |  |
| creation_date | date | NOT NULL |  |  |
| nsl1 | numeric(6,2) |  |  |  |
| nsl2 | numeric(6,2) |  |  |  |
| nsl3 | numeric(6,2) |  |  |  |
| nsl4 | numeric(6,2) |  |  |  |
| nsl5 | numeric(6,2) |  |  |  |
| nsl6 | numeric(6,2) |  |  |  |
| nsl7 | numeric(6,2) |  |  |  |
| t1 | numeric(6,2) |  |  |  |
| t2 | numeric(6,2) |  |  |  |
| t3 | numeric(6,2) |  |  |  |
| t4 | numeric(6,2) |  |  |  |
| t5 | numeric(6,2) |  |  |  |
| pf_sensing | numeric(6,2) |  |  |  |
| pf_no_of_periods | integer |  |  |  |
| oc | numeric(6,2) |  |  |  |
| cp | numeric(6,2) |  |  |  |
| cm | numeric(6,2) |  |  |  |
| ccp1 | numeric(6,2) |  |  |  |
| ccp2 | numeric(6,2) |  |  |  |
| ccm1 | numeric(6,2) |  |  |  |
| ccm2 | numeric(6,2) |  |  |  |
| jp1 | numeric(6,2) |  |  |  |
| jp2 | numeric(6,2) |  |  |  |
| jp3 | numeric(6,2) |  |  |  |
| jp4 | numeric(6,2) |  |  |  |
| jp5 | numeric(6,2) |  |  |  |
| jp6 | numeric(6,2) |  |  |  |
| jp7 | numeric(6,2) |  |  |  |
| jp_clearing | numeric(6,2) |  |  |  |
| jp_u_percent | numeric(6,2) |  |  |  |
| jp_jm | numeric(6,2) |  |  |  |
| fd1 | numeric(6,2) |  |  |  |
| fd2 | numeric(6,2) |  |  |  |
| fd3 | numeric(6,2) |  |  |  |
| fd4 | numeric(6,2) |  |  |  |
| fd5 | numeric(6,2) |  |  |  |
| fd6 | numeric(6,2) |  |  |  |
| reference_length | numeric(6,2) |  |  |  |
| suction | numeric(6,2) |  |  |  |
| measurement | numeric(6,2) |  |  |  |
| upper_limit | numeric(6,2) |  |  |  |
| lower_limit | numeric(6,2) |  |  |  |
| action | character varying(255) |  |  |  |
| suction_status | character varying(100) |  |  |  |
| blocking | character varying(100) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (2)</summary>

- `autoconer_q3_inspection_entry_id_uq`: `CREATE UNIQUE INDEX autoconer_q3_inspection_entry_id_uq ON autoconer.autoconer_q3_inspection USING btree (entry_id) WHERE (entry_id IS NOT NULL)`
- `autoconer_q3_inspection_ins_code_key`: `CREATE UNIQUE INDEX autoconer_q3_inspection_ins_code_key ON autoconer.autoconer_q3_inspection USING btree (ins_code)`

</details>

#### `autoconer.autoconer_q4_inspection`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.autoconer_q4_inspecti | PK |
| entry_id | text |  |  |  |
| count_name | character varying(100) | NOT NULL |  |  |
| consignee_name | character varying(100) | NOT NULL |  |  |
| creation_date | date | NOT NULL |  |  |
| nsl1 | numeric(6,2) |  |  |  |
| nsl2 | numeric(6,2) |  |  |  |
| nsl3 | numeric(6,2) |  |  |  |
| nsl4 | numeric(6,2) |  |  |  |
| nsl5 | numeric(6,2) |  |  |  |
| nsl6 | numeric(6,2) |  |  |  |
| nsl7 | numeric(6,2) |  |  |  |
| t1 | numeric(6,2) |  |  |  |
| t2 | numeric(6,2) |  |  |  |
| t3 | numeric(6,2) |  |  |  |
| t4 | numeric(6,2) |  |  |  |
| t5 | numeric(6,2) |  |  |  |
| pf_sensing | numeric(6,2) |  |  |  |
| pf_no_of_periods | integer |  |  |  |
| oc | numeric(6,2) |  |  |  |
| cp | numeric(6,2) |  |  |  |
| cm | numeric(6,2) |  |  |  |
| ccp1 | numeric(6,2) |  |  |  |
| ccp2 | numeric(6,2) |  |  |  |
| ccm1 | numeric(6,2) |  |  |  |
| ccm2 | numeric(6,2) |  |  |  |
| jp1 | numeric(6,2) |  |  |  |
| jp2 | numeric(6,2) |  |  |  |
| jp3 | numeric(6,2) |  |  |  |
| jp4 | numeric(6,2) |  |  |  |
| jp5 | numeric(6,2) |  |  |  |
| jp6 | numeric(6,2) |  |  |  |
| jp7 | numeric(6,2) |  |  |  |
| jp_clearing | numeric(6,2) |  |  |  |
| jp_u_percent | numeric(6,2) |  |  |  |
| jp_jm | numeric(6,2) |  |  |  |
| fd1 | numeric(6,2) |  |  |  |
| fd2 | numeric(6,2) |  |  |  |
| fd3 | numeric(6,2) |  |  |  |
| fd4 | numeric(6,2) |  |  |  |
| fd5 | numeric(6,2) |  |  |  |
| fd6 | numeric(6,2) |  |  |  |
| reference_length | numeric(6,2) |  |  |  |
| suction | numeric(6,2) |  |  |  |
| measurement | numeric(6,2) |  |  |  |
| upper_limit | numeric(6,2) |  |  |  |
| lower_limit | numeric(6,2) |  |  |  |
| action | character varying(255) |  |  |  |
| suction_status | character varying(255) |  |  |  |
| blocking | character varying(255) |  |  |  |
| x_status | character varying(10) |  | 'On'::character varying |  |
| dp_plus_30 | numeric(6,2) |  |  |  |
| sm_minus_30 | numeric(6,2) |  |  |  |
| cdp1 | numeric(6,2) |  |  |  |
| cdp2 | numeric(6,2) |  |  |  |
| cdm1 | numeric(6,2) |  |  |  |
| cdm2 | numeric(6,2) |  |  |  |
| nsl_max_event | numeric(6,2) |  |  |  |
| t_max_event | numeric(6,2) |  |  |  |
| fd_max_events | numeric(6,2) |  |  |  |
| fl_max_events | numeric(6,2) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

<details><summary>Indexes (1)</summary>

- `autoconer_q4_inspection_entry_id_uq`: `CREATE UNIQUE INDEX autoconer_q4_inspection_entry_id_uq ON autoconer.autoconer_q4_inspection USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `autoconer.cone_density`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.cone_density_id_seq': | PK |
| test_no | integer | NOT NULL |  |  |
| entry_date | date | NOT NULL |  |  |
| type | character varying(50) |  | 'Cone Density'::character varying |  |
| machine_name | character varying(50) |  |  |  |
| count_name | character varying(150) |  |  |  |
| cone_tip | character varying(50) |  |  |  |
| base_dia_e | numeric(10,2) |  |  |  |
| nose_dia_e | numeric(10,2) |  |  |  |
| drum_from | integer |  |  |  |
| drum_to | integer |  |  |  |
| weight | numeric(10,2) |  |  |  |
| no_of_cuts | integer |  |  |  |
| remarks | text |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `cone_density_entry_id_uq`: `CREATE UNIQUE INDEX cone_density_entry_id_uq ON autoconer.cone_density USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `autoconer.cone_density_notebook`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.cone_density_notebook | PK |
| entry_id | text | NOT NULL |  | UQ |
| entry_date | date | NOT NULL |  |  |
| type | text | NOT NULL | 'Cone Density'::text |  |
| count_name | text |  |  |  |
| auto_coner_no | text |  |  |  |
| drum_from | integer | NOT NULL |  |  |
| drum_to | integer | NOT NULL |  |  |
| cone_tip | text |  |  |  |
| remarks | text |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |
| cntcode | text |  |  |  |

<details><summary>Indexes (4)</summary>

- `autoconer_cone_density_notebook_entry_date_idx`: `CREATE INDEX autoconer_cone_density_notebook_entry_date_idx ON autoconer.cone_density_notebook USING btree (entry_date DESC, created_at DESC)`
- `autoconer_cone_density_notebook_entry_id_uq`: `CREATE UNIQUE INDEX autoconer_cone_density_notebook_entry_id_uq ON autoconer.cone_density_notebook USING btree (entry_id) WHERE (entry_id IS NOT NULL)`
- `cone_density_notebook_entry_id_key`: `CREATE UNIQUE INDEX cone_density_notebook_entry_id_key ON autoconer.cone_density_notebook USING btree (entry_id)`
- `cone_density_notebook_entry_id_uq`: `CREATE UNIQUE INDEX cone_density_notebook_entry_id_uq ON autoconer.cone_density_notebook USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `autoconer.cone_density_notebook_drums`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.cone_density_notebook | PK |
| notebook_id | integer | NOT NULL |  | UQ, FK→autoconer.cone_density_notebook.id |
| drum_no | integer | NOT NULL |  | UQ |
| base_dia_e_d1 | numeric |  |  |  |
| nose_dia_e_d2 | numeric |  |  |  |
| base_dia_i_d3 | numeric |  |  |  |
| nose_dia_i_d4 | numeric |  |  |  |
| slant_height_b1 | numeric |  |  |  |
| vertical_height_b2 | numeric |  |  |  |
| cone_weight_gms | numeric |  |  |  |
| volume_cm3 | numeric |  |  |  |
| density_gms_cm3 | numeric |  |  |  |
| gms_litre | numeric |  |  |  |
| winding_speed_m_min | numeric |  |  |  |
| cn_tension | numeric |  |  |  |
| tensioner_rpm | numeric |  |  |  |
| tensioner_force | numeric |  |  |  |
| n_cradle_pressure | numeric |  |  |  |
| remarks | text |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (2)</summary>

- `autoconer_cone_density_notebook_drums_notebook_drum_uq`: `CREATE UNIQUE INDEX autoconer_cone_density_notebook_drums_notebook_drum_uq ON autoconer.cone_density_notebook_drums USING btree (notebook_id, drum_no)`
- `cone_density_notebook_drums_notebook_id_drum_no_key`: `CREATE UNIQUE INDEX cone_density_notebook_drums_notebook_id_drum_no_key ON autoconer.cone_density_notebook_drums USING btree (notebook_id, drum_no)`

</details>

#### `autoconer.cone_density_readings`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.cone_density_readings |  |
| cone_density_id | integer |  |  |  |
| drum_no | integer |  |  |  |
| base_dia_e | numeric(10,2) |  |  |  |
| nose_dia_e | numeric(10,2) |  |  |  |
| base_dia | numeric(10,2) |  |  |  |
| nose_dia | numeric(10,2) |  |  |  |
| cone_weight | numeric(10,2) |  |  |  |
| cone_traverse | numeric(10,2) |  |  |  |
| density | numeric(10,3) |  |  |  |
| hardness | numeric(10,3) |  |  |  |

#### `autoconer.cone_packing_audit`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.cone_packing_audit_id |  |
| inspection_date | date |  |  |  |
| packed_date | date |  |  |  |
| count_name | character varying(150) |  |  |  |
| gross_weight_std | numeric(6,2) |  |  |  |
| gross_weight_actual | numeric(6,2) |  |  |  |
| box_colour | character varying(50) |  |  |  |
| cone_colour | character varying(50) |  |  |  |
| gum_tape_colour | character varying(50) |  |  |  |
| count_label | boolean |  |  |  |
| cone_damage | boolean |  |  |  |
| cover_missing | boolean |  |  |  |
| cone_hardness | boolean |  |  |  |
| stap_cone | boolean |  |  |  |
| disk | boolean |  |  |  |
| barcode | boolean |  |  |  |
| center_pad | character varying(50) |  |  |  |
| net_weight | numeric(10,2) |  |  |  |
| tare_weight | numeric(6,2) |  |  |  |
| strap_colour | character varying(50) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `cone_packing_audit_entry_id_uq`: `CREATE UNIQUE INDEX cone_packing_audit_entry_id_uq ON autoconer.cone_packing_audit USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `autoconer.count_master`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.count_master_id_seq': | PK |
| count_name | character varying(100) | NOT NULL |  |  |

#### `autoconer.count_wise_cuts`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.count_wise_cuts_id_se |  |
| inspection_type | character varying(100) | NOT NULL |  |  |
| entry_date | date | NOT NULL |  |  |
| machine_no | character varying(50) |  |  |  |
| count_name | text |  |  |  |
| drum_from | numeric(10,2) |  |  |  |
| drum_to | numeric(10,2) |  |  |  |
| cone_tip | character varying(50) |  |  |  |
| lot_no | character varying(50) |  |  |  |
| frame_no | character varying(50) |  |  |  |
| yf | numeric(10,2) |  |  |  |
| yj | numeric(10,2) |  |  |  |
| n | numeric(10,2) |  |  |  |
| s | numeric(10,2) |  |  |  |
| l | numeric(10,2) |  |  |  |
| t | numeric(10,2) |  |  |  |
| cp | numeric(10,2) |  |  |  |
| cm | numeric(10,2) |  |  |  |
| ccp | numeric(10,2) |  |  |  |
| ccm | numeric(10,2) |  |  |  |
| pc | numeric(10,2) |  |  |  |
| fd | numeric(10,2) |  |  |  |
| jp | numeric(10,2) |  |  |  |
| jm | numeric(10,2) |  |  |  |
| cvp | numeric(10,2) |  |  |  |
| a1 | numeric(10,2) |  |  |  |
| a2 | numeric(10,2) |  |  |  |
| a3 | numeric(10,2) |  |  |  |
| a4 | numeric(10,2) |  |  |  |
| b1 | numeric(10,2) |  |  |  |
| b2 | numeric(10,2) |  |  |  |
| b3 | numeric(10,2) |  |  |  |
| b4 | numeric(10,2) |  |  |  |
| c1 | numeric(10,2) |  |  |  |
| c2 | numeric(10,2) |  |  |  |
| c3 | numeric(10,2) |  |  |  |
| c4 | numeric(10,2) |  |  |  |
| d1 | numeric(10,2) |  |  |  |
| d2 | numeric(10,2) |  |  |  |
| d3 | numeric(10,2) |  |  |  |
| d4 | numeric(10,2) |  |  |  |
| e | numeric(10,2) |  |  |  |
| f | numeric(10,2) |  |  |  |
| g | numeric(10,2) |  |  |  |
| h1 | numeric(10,2) |  |  |  |
| h2 | numeric(10,2) |  |  |  |
| l1 | numeric(10,2) |  |  |  |
| l2 | numeric(10,2) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `count_wise_cuts_entry_id_uq`: `CREATE UNIQUE INDEX count_wise_cuts_entry_id_uq ON autoconer.count_wise_cuts USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `autoconer.drum_entries`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.drum_entries_id_seq': |  |
| audit_id | integer |  |  |  |
| drum_no | integer |  |  |  |
| gross_weight | numeric(6,2) |  |  |  |
| average | numeric(6,2) |  |  |  |

#### `autoconer.drum_inspection`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.drum_inspection_id_se |  |
| drum_wise_id | integer |  |  | FK→autoconer.drum_wise.id |
| drum_no | integer | NOT NULL |  |  |
| appearance_ok | boolean | NOT NULL |  |  |

#### `autoconer.drum_readings`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.drum_readings_id_seq' |  |
| inspection_id | integer |  |  | FK→autoconer.inspections.id |
| drum_no | integer | NOT NULL |  |  |
| reading_number | integer | NOT NULL |  |  |
| splice_strength | numeric(10,2) |  |  |  |
| parent_yarn | numeric(10,2) |  |  |  |
| percent_yarn | numeric(10,2) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |

#### `autoconer.drum_wise`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.drum_wise_id_seq'::re | PK |
| test_no | integer | NOT NULL |  |  |
| entry_date | date | NOT NULL |  |  |
| type | character varying(50) | NOT NULL |  |  |
| machine_id | integer |  |  | FK→autoconer.machine.id |
| count_id | integer |  |  | FK→autoconer.count_master.id |
| drum_from | integer | NOT NULL |  |  |
| drum_to | integer | NOT NULL |  |  |
| remarks | text |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| machine_code | text |  |  |  |
| count_name | text |  |  |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `drum_wise_entry_id_uq`: `CREATE UNIQUE INDEX drum_wise_entry_id_uq ON autoconer.drum_wise USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `autoconer.inspection_data_entry`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.inspection_data_entry | PK |
| entry_id | character varying(50) | NOT NULL |  | UQ |
| entry_date | date | NOT NULL |  |  |
| type | character varying(100) | NOT NULL | 'Rewinding Study'::character varying |  |
| count_name | character varying(255) | NOT NULL |  |  |
| actual_count | numeric(12,4) | NOT NULL |  |  |
| auto_coner_no | character varying(100) | NOT NULL |  |  |
| cone_tip | character varying(255) | NOT NULL |  |  |
| no_of_cuts | integer | NOT NULL | 0 |  |
| break_per_million_meter | numeric(14,4) | NOT NULL | 0 |  |
| remarks | text |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| remarks_optional | text |  |  |  |
| total_cones | integer |  |  |  |
| total_faults | integer |  |  |  |
| total_weight | numeric(14,4) |  |  |  |
| total_length_meters | numeric(14,4) |  |  |  |
| operator | text |  |  |  |

<details><summary>Indexes (2)</summary>

- `idx_inspection_data_entry_entry_date`: `CREATE INDEX idx_inspection_data_entry_entry_date ON autoconer.inspection_data_entry USING btree (entry_date DESC, created_at DESC)`
- `inspection_data_entry_entry_id_key`: `CREATE UNIQUE INDEX inspection_data_entry_entry_id_key ON autoconer.inspection_data_entry USING btree (entry_id)`

</details>

#### `autoconer.inspection_data_entry_readings`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.inspection_data_entry | PK |
| inspection_data_entry_id | integer | NOT NULL |  | FK→autoconer.inspection_data_entry.id |
| drum_no | integer |  |  |  |
| no_of_cones | integer |  |  |  |
| fault_name | character varying(255) |  |  |  |
| no_of_faults | integer |  |  |  |
| percent_fault | numeric(14,4) |  |  |  |
| weight | numeric(14,4) |  |  |  |
| length_meters | numeric(14,4) |  |  |  |

<details><summary>Indexes (1)</summary>

- `idx_inspection_data_entry_readings_parent`: `CREATE INDEX idx_inspection_data_entry_readings_parent ON autoconer.inspection_data_entry_readings USING btree (inspection_data_entry_id)`

</details>

#### `autoconer.inspections`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.inspections_id_seq':: | PK |
| type | character varying(100) | NOT NULL |  |  |
| test_no | integer | NOT NULL |  |  |
| inspection_date | date | NOT NULL |  |  |
| count_name | character varying(100) |  |  |  |
| auto_coner_no | character varying(50) |  |  |  |
| drum_from | integer |  |  |  |
| drum_to | integer |  |  |  |
| cone_tip | character varying(50) |  |  |  |
| csp_value | numeric(10,2) |  |  |  |
| average | numeric(10,4) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `autoconer_inspections_entry_id_uq`: `CREATE UNIQUE INDEX autoconer_inspections_entry_id_uq ON autoconer.inspections USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `autoconer.lycra_checking_inspections`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.lycra_checking_inspec | PK |
| inspection_type | character varying(100) | NOT NULL |  |  |
| test_no | integer |  |  |  |
| entry_date | date | NOT NULL |  |  |
| lycra_draft | numeric(10,3) |  |  |  |
| count_name | text |  |  |  |
| no_of_readings | integer |  |  |  |
| lycra_weight | numeric(10,4) |  |  |  |
| fabric_weight | numeric(10,4) |  |  |  |
| total_weight | numeric(10,4) |  |  |  |
| lycra_percent | numeric(10,2) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `lycra_checking_inspections_entry_id_uq`: `CREATE UNIQUE INDEX lycra_checking_inspections_entry_id_uq ON autoconer.lycra_checking_inspections USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `autoconer.lycra_checking_readings`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.lycra_checking_readin |  |
| inspection_id | integer |  |  |  |
| reading_no | integer |  |  |  |
| length_mm | numeric(10,2) |  |  |  |
| lycra_weight | numeric(10,4) |  |  |  |
| fabric_weight | numeric(10,4) |  |  |  |
| total_weight | numeric(10,4) |  |  |  |
| lycra_percent | numeric(10,2) |  |  |  |

#### `autoconer.lycra_checking_summary`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.lycra_checking_summar | PK |
| inspection_id | integer |  |  |  |
| avg_length | numeric(10,2) |  |  |  |
| lycra_weight | numeric(10,4) |  |  |  |
| fabric_weight | numeric(10,4) |  |  |  |
| total_weight | numeric(10,4) |  |  |  |
| lycra_percent | numeric(10,2) |  |  |  |

#### `autoconer.machine`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.machine_id_seq'::regc | PK |
| machine_code | character varying(20) | NOT NULL |  | UQ |
| description | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `machine_machine_code_key`: `CREATE UNIQUE INDEX machine_machine_code_key ON autoconer.machine USING btree (machine_code)`

</details>

#### `autoconer.parameter_entries`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.parameter_entries_id_ |  |
| inspection_type | character varying(100) | NOT NULL |  |  |
| entry_date | date | NOT NULL |  |  |
| count_name | character varying(150) |  |  |  |
| act_count | numeric(10,2) |  |  |  |
| strength | numeric(10,2) |  |  |  |
| count_cv | numeric(10,2) |  |  |  |
| strength_cv | numeric(10,2) |  |  |  |
| csp | numeric(10,2) |  |  |  |
| cone_color | character varying(100) |  |  |  |
| u | numeric(10,2) |  |  |  |
| cvm | numeric(10,2) |  |  |  |
| cv_1m | numeric(10,2) |  |  |  |
| cv_3m | numeric(10,2) |  |  |  |
| cv_10m | numeric(10,2) |  |  |  |
| br_1_5mm | numeric(10,2) |  |  |  |
| cvb | numeric(10,2) |  |  |  |
| thin_minus_50 | numeric(10,2) |  |  |  |
| thick_plus_50 | numeric(10,2) |  |  |  |
| neps_plus_200 | numeric(10,2) |  |  |  |
| total_1 | numeric(10,2) |  |  |  |
| thin_minus_40 | numeric(10,2) |  |  |  |
| thick_plus_35 | numeric(10,2) |  |  |  |
| thick_plus_70 | numeric(10,2) |  |  |  |
| neps_plus_140 | numeric(10,2) |  |  |  |
| total_2 | numeric(10,2) |  |  |  |
| thin_minus_30 | numeric(10,2) |  |  |  |
| neps_plus_400 | numeric(10,2) |  |  |  |
| inspection_phase | character varying(50) | NOT NULL | 'csp_entered'::character varying |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |
| payload | jsonb |  |  |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `parameter_entries_entry_id_uq`: `CREATE UNIQUE INDEX parameter_entries_entry_id_uq ON autoconer.parameter_entries USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `autoconer.rewinding_readings`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.rewinding_readings_id |  |
| rewinding_id | integer |  |  | FK→autoconer.rewinding_study.id |
| drum_no | integer |  |  |  |
| reading_number | integer |  |  |  |
| short_cut | character varying(10) |  |  |  |
| short_name | character varying(20) |  |  |  |
| fault_percent | numeric(5,2) |  |  |  |
| length_mm | numeric(10,2) |  |  |  |
| weight | numeric(10,2) |  |  |  |
| break_per_meter | numeric(10,4) |  |  |  |

#### `autoconer.rewinding_study`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.rewinding_study_id_se | PK |
| test_no | integer | NOT NULL |  |  |
| entry_date | date | NOT NULL |  |  |
| type | character varying(50) |  | 'Rewinding Study'::character varying |  |
| machine_name | character varying(50) |  |  |  |
| count_name | character varying(150) |  |  |  |
| cone_tip | character varying(100) |  |  |  |
| drum_from | integer |  |  |  |
| drum_to | integer |  |  |  |
| drum_no | integer |  |  |  |
| no_of_cones | integer |  |  |  |
| weight | numeric(10,2) |  |  |  |
| no_of_cuts | integer |  |  |  |
| break_per_lakh | numeric(10,2) |  |  |  |
| remarks | text |  |  |  |
| created_at | timestamp with time zone |  | now() |  |

#### `autoconer.rewinding_study_inspections`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('autoconer.rewinding_study_inspe | PK |
| rewinding_study_id | bigint | NOT NULL |  | FK→autoconer.rewinding_study.id |
| reading_number | integer | NOT NULL |  |  |
| short_cut | text |  |  |  |
| short_name | text |  |  |  |
| fault_percent | numeric(18,8) |  |  |  |
| length_mm | numeric(18,4) |  |  |  |
| weight | numeric(18,4) |  |  |  |
| break_per_meter | numeric(18,4) |  |  |  |
| percent_yarn | numeric(18,8) |  |  |  |
| appearance_ok | boolean |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (1)</summary>

- `rewinding_study_inspections_parent_idx`: `CREATE INDEX rewinding_study_inspections_parent_idx ON autoconer.rewinding_study_inspections USING btree (rewinding_study_id, reading_number)`

</details>

#### `autoconer.yarn_readings`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('autoconer.yarn_readings_id_seq' |  |
| audit_id | integer |  |  |  |
| reading_number | integer |  |  |  |
| percent_yarn | numeric(6,2) |  |  |  |

### Schema: `spinning`

#### `spinning.bottom_apron_checking`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| inspectiondate | date |  |  |  |
| machineno | integer | NOT NULL |  |  |
| lhs_textremarks | character varying(500) |  |  |  |
| lhs_audio | bytea |  |  |  |
| rhs_textremarks | character varying(500) |  |  |  |
| rhs_audio | bytea |  |  |  |
| createdat | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |
| lhs_spindle_count | integer |  |  |  |
| rhs_spindle_count | integer |  |  |  |
| type2 | text |  |  |  |
| lhs_values | jsonb |  |  |  |
| rhs_values | jsonb |  |  |  |

<details><summary>Indexes (1)</summary>

- `bottom_apron_checking_entry_id_uq`: `CREATE UNIQUE INDEX bottom_apron_checking_entry_id_uq ON spinning.bottom_apron_checking USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `spinning.cots_checking`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| inspectiondate | date |  |  |  |
| machineno | integer | NOT NULL |  |  |
| lhs_textremarks | character varying(500) |  |  |  |
| lhs_audio | bytea |  |  |  |
| rhs_textremarks | character varying(500) |  |  |  |
| rhs_audio | bytea |  |  |  |
| createdat | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |
| lhs_spindle_count | integer |  |  |  |
| rhs_spindle_count | integer |  |  |  |
| lhs_values | jsonb |  |  |  |
| rhs_values | jsonb |  |  |  |

<details><summary>Indexes (1)</summary>

- `cots_checking_entry_id_uq`: `CREATE UNIQUE INDEX cots_checking_entry_id_uq ON spinning.cots_checking USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `spinning.count_change_inspections`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('spinning.count_change_inspectio | PK |
| type | character varying(50) |  |  |  |
| entry_date | date |  |  |  |
| test_no | integer |  |  |  |
| rf_no | text |  |  |  |
| lycra_draft | numeric(5,2) |  |  |  |
| count_name_from | text |  |  |  |
| count_name_to | text |  |  |  |
| no_of_readings | integer |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `count_change_inspections_entry_id_uq`: `CREATE UNIQUE INDEX count_change_inspections_entry_id_uq ON spinning.count_change_inspections USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `spinning.count_change_readings`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('spinning.count_change_readings_ | PK |
| inspection_id | integer |  |  | FK→spinning.count_change_inspections.id |
| reading_no | integer |  |  |  |
| reading_value | numeric(10,2) |  |  |  |
| count | numeric(10,2) |  |  |  |
| cv_percent | numeric(10,2) |  |  |  |
| strength | numeric(10,2) |  |  |  |
| mean | numeric(10,2) |  |  |  |
| cv_percent_2 | numeric(10,2) |  |  |  |
| csp | numeric(10,2) |  |  |  |

#### `spinning.lycra_centering`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| inspectiondate | date |  |  |  |
| machineno | integer | NOT NULL |  |  |
| lhs_textremarks | character varying(500) |  |  |  |
| lhs_audio | bytea |  |  |  |
| rhs_textremarks | character varying(500) |  |  |  |
| rhs_audio | bytea |  |  |  |
| createdat | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |
| lhs_spindle_count | integer |  |  |  |
| rhs_spindle_count | integer |  |  |  |
| type2 | text |  |  |  |
| lhs_values | jsonb |  |  |  |
| rhs_values | jsonb |  |  |  |

<details><summary>Indexes (1)</summary>

- `lycra_centering_entry_id_uq`: `CREATE UNIQUE INDEX lycra_centering_entry_id_uq ON spinning.lycra_centering USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `spinning.lycra_missing`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| inspectiondate | date |  |  |  |
| machineno | integer | NOT NULL |  |  |
| lhs_value | numeric(10,2) | NOT NULL |  |  |
| rhs_value | numeric(10,2) | NOT NULL |  |  |
| lhs_textremarks | character varying(500) |  |  |  |
| lhs_audio | bytea |  |  |  |
| rhs_textremarks | character varying(500) |  |  |  |
| rhs_audio | bytea |  |  |  |
| createdat | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `lycra_missing_entry_id_uq`: `CREATE UNIQUE INDEX lycra_missing_entry_id_uq ON spinning.lycra_missing USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `spinning.ring_frame_checkers`  <sub>(10 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('spinning.ring_frame_checkers_id |  |
| checker_name | text | NOT NULL |  |  |
| is_active | boolean | NOT NULL | true |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (1)</summary>

- `ring_frame_checkers_checker_name_uq`: `CREATE UNIQUE INDEX ring_frame_checkers_checker_name_uq ON spinning.ring_frame_checkers USING btree (checker_name)`

</details>

#### `spinning.ring_frame_inspections`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('spinning.ring_frame_inspections | PK |
| inspection_type | character varying(100) | NOT NULL |  |  |
| entry_date | date |  |  |  |
| shift | character varying(20) |  |  |  |
| checker_name | character varying(100) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `ring_frame_inspections_entry_id_uq`: `CREATE UNIQUE INDEX ring_frame_inspections_entry_id_uq ON spinning.ring_frame_inspections USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `spinning.ring_frame_rows`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('spinning.ring_frame_rows_id_seq | PK |
| inspection_id | integer |  |  | FK→spinning.ring_frame_inspections.id |
| mc_no | integer | NOT NULL |  |  |
| lycra | character varying(100) |  |  |  |
| bobbin_color | character varying(50) |  |  |  |
| spindle_1 | character varying(20) |  |  |  |
| spindle_2 | character varying(20) |  |  |  |
| spindle_3 | character varying(20) |  |  |  |
| spindle_4 | character varying(20) |  |  |  |
| spindle_5 | character varying(20) |  |  |  |
| spindle_6 | character varying(20) |  |  |  |
| lycra_missing | character varying(20) |  |  |  |
| guide_roll_lapping | character varying(20) |  |  |  |
| others | character varying(20) |  |  |  |
| total | character varying(20) |  |  |  |
| bobbin_checked | boolean |  |  |  |

#### `spinning.ring_frame_summary`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('spinning.ring_frame_summary_id_ | PK |
| inspection_id | integer |  |  | UQ, FK→spinning.ring_frame_inspections.id |
| out_of_center | numeric(10,2) |  |  |  |
| lycra_missing | numeric(10,2) |  |  |  |
| fault_cops | numeric(10,2) |  |  |  |
| total_cops | numeric(10,2) |  |  |  |
| comments | text |  |  |  |
| out_of_center_ac | integer |  |  |  |
| out_of_center_rf | integer |  |  |  |
| lycra_missing_ac | integer |  |  |  |
| lycra_missing_rf | integer |  |  |  |
| fault_cops_ac | numeric |  |  |  |
| fault_cops_rf | numeric |  |  |  |
| total_cops_ac | numeric |  |  |  |
| total_cops_rf | numeric |  |  |  |

<details><summary>Indexes (1)</summary>

- `ring_frame_summary_inspection_id_key`: `CREATE UNIQUE INDEX ring_frame_summary_inspection_id_key ON spinning.ring_frame_summary USING btree (inspection_id)`

</details>

#### `spinning.rsm_and_lycrasensor_cheking_offline`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| inspectiondate | date |  |  |  |
| machineno | integer | NOT NULL |  |  |
| lhs_textremarks | character varying(500) |  |  |  |
| lhs_audio | bytea |  |  |  |
| rhs_textremarks | character varying(500) |  |  |  |
| rhs_audio | bytea |  |  |  |
| createdat | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |
| lhs_spindle_count | integer |  |  |  |
| rhs_spindle_count | integer |  |  |  |
| type2 | text |  |  |  |
| lhs_values | jsonb |  |  |  |
| rhs_values | jsonb |  |  |  |

<details><summary>Indexes (1)</summary>

- `rsm_and_lycrasensor_cheking_offline_entry_id_uq`: `CREATE UNIQUE INDEX rsm_and_lycrasensor_cheking_offline_entry_id_uq ON spinning.rsm_and_lycrasensor_cheking_offline USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `spinning.rsm_and_lycrasensor_cheking_online`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| inspectiondate | date |  |  |  |
| machineno | integer | NOT NULL |  |  |
| lhs_textremarks | character varying(500) |  |  |  |
| lhs_audio | bytea |  |  |  |
| rhs_textremarks | character varying(500) |  |  |  |
| rhs_audio | bytea |  |  |  |
| createdat | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |
| lhs_spindle_count | integer |  |  |  |
| rhs_spindle_count | integer |  |  |  |
| type2 | text |  |  |  |
| lhs_values | jsonb |  |  |  |
| rhs_values | jsonb |  |  |  |

<details><summary>Indexes (1)</summary>

- `rsm_and_lycrasensor_cheking_online_entry_id_uq`: `CREATE UNIQUE INDEX rsm_and_lycrasensor_cheking_online_entry_id_uq ON spinning.rsm_and_lycrasensor_cheking_online USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `spinning.speed_checking`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| inspectiondate | date |  |  |  |
| machineno | integer | NOT NULL |  |  |
| lhs_textremarks | character varying(500) |  |  |  |
| lhs_audio | bytea |  |  |  |
| rhs_textremarks | character varying(500) |  |  |  |
| rhs_audio | bytea |  |  |  |
| createdat | timestamp with time zone |  | now() |  |
| display_speed | numeric(10,2) |  |  |  |
| spindle_speed | numeric(10,2) |  |  |  |
| difference | numeric(10,2) |  |  |  |
| entry_id | text |  |  |  |
| lhs_spindle_count | integer |  |  |  |
| rhs_spindle_count | integer |  |  |  |
| lhs_values | jsonb |  |  |  |
| rhs_values | jsonb |  |  |  |

<details><summary>Indexes (1)</summary>

- `speed_checking_entry_id_uq`: `CREATE UNIQUE INDEX speed_checking_entry_id_uq ON spinning.speed_checking USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `spinning.spinning_qc_header`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| qc_id | integer | NOT NULL | nextval('spinning.spinning_qc_header_qc_ |  |
| param_id | character varying(10) |  | ('PP'::text \|\| lpad((nextval('spinning |  |
| count_name | character varying(255) |  |  |  |
| consignee_name | character varying(255) |  |  |  |
| creation_date | date |  |  |  |
| machine_no | integer |  |  |  |
| bottom_roll_setting | character varying(20) |  |  |  |
| top_roll_setting | character varying(20) |  |  |  |
| break_draft | numeric(10,2) |  |  |  |
| total_draft | numeric(10,2) |  |  |  |
| tpi_tm | character varying(20) |  |  |  |
| spacer | character varying(20) |  |  |  |
| traveller | character varying(20) |  |  |  |
| speed | integer |  |  |  |
| make | character varying(50) |  |  |  |
| denier | numeric(10,2) |  |  |  |
| merge_no | character varying(50) |  |  |  |
| lycra_draft | numeric(10,2) |  |  |  |
| lycra_percent | numeric(10,2) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |
| slub_party_code | text |  |  |  |
| slub_mtr | numeric |  |  |  |
| pause_min | numeric |  |  |  |
| pause_max | numeric |  |  |  |
| slub_min | numeric |  |  |  |
| slub_max | numeric |  |  |  |
| thickness_min | numeric |  |  |  |
| thickness_max | numeric |  |  |  |
| ramp | text |  |  |  |
| offset | character varying(3) |  |  |  |
| slub_partcy_code | text |  |  |  |
| approval_status | text | NOT NULL | 'pending'::text |  |
| reviewed_by | text |  |  |  |
| reviewed_at | timestamp with time zone |  |  |  |
| review_remarks | text |  |  |  |
| created_by_user_id | integer |  |  |  |

<details><summary>Indexes (1)</summary>

- `spinning_qc_header_entry_id_uq`: `CREATE UNIQUE INDEX spinning_qc_header_entry_id_uq ON spinning.spinning_qc_header USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `spinning.type2_faults`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('spinning.type2_faults_id_seq':: | PK |
| checking_type | text | NOT NULL |  |  |
| entry_id | text | NOT NULL |  |  |
| type2 | text | NOT NULL |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (1)</summary>

- `type2_faults_uq`: `CREATE UNIQUE INDEX type2_faults_uq ON spinning.type2_faults USING btree (checking_type, entry_id)`

</details>

#### `spinning.wheel_change`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('spinning.wheel_change_id_seq':: |  |
| ins_code | character varying(15) |  | ('WC'::text \|\| lpad((nextval('spinning |  |
| type | character varying(50) |  | 'Wheel Change'::character varying |  |
| wheel_change_type | character varying(100) |  |  |  |
| test_no | character varying(50) |  |  |  |
| date | date |  |  |  |
| fr_no | character varying(50) |  |  |  |
| count_from_existing | character varying(100) |  |  |  |
| count_from_proposed | character varying(100) |  |  |  |
| lycra_type_existing | character varying(100) |  |  |  |
| lycra_type_proposed | character varying(100) |  |  |  |
| lycra_draft_existing | numeric(6,2) |  |  |  |
| lycra_draft_proposed | numeric(6,2) |  |  |  |
| slub_code_existing | character varying(100) |  |  |  |
| slub_code_proposed | character varying(100) |  |  |  |
| ramp_existing | character varying(100) |  |  |  |
| ramp_proposed | character varying(100) |  |  |  |
| offset_on_off_existing | character varying(50) |  |  |  |
| offset_on_off_proposed | character varying(50) |  |  |  |
| cop_core_condition_existing | character varying(100) |  |  |  |
| cop_core_condition_proposed | character varying(100) |  |  |  |
| product_qty_existing | numeric(8,2) |  |  |  |
| product_qty_proposed | numeric(8,2) |  |  |  |
| roving_hank_existing | numeric(6,2) |  |  |  |
| roving_hank_proposed | numeric(6,2) |  |  |  |
| edw_existing | character varying(50) |  |  |  |
| edw_proposed | character varying(50) |  |  |  |
| bd_existing | numeric(6,2) |  |  |  |
| bd_proposed | numeric(6,2) |  |  |  |
| tpi_tm_existing | numeric(6,2) |  |  |  |
| tpi_tm_proposed | numeric(6,2) |  |  |  |
| travelers_no_existing | character varying(50) |  |  |  |
| travelers_no_proposed | character varying(50) |  |  |  |
| spacer_existing | character varying(100) |  |  |  |
| spacer_proposed | character varying(100) |  |  |  |
| cop_weight_existing | numeric(6,2) |  |  |  |
| cop_weight_proposed | numeric(6,2) |  |  |  |
| speed_initial_existing | numeric(6,2) |  |  |  |
| speed_initial_proposed | numeric(6,2) |  |  |  |
| speed_max_existing | numeric(6,2) |  |  |  |
| speed_max_proposed | numeric(6,2) |  |  |  |
| empties_colour_existing | character varying(100) |  |  |  |
| empties_colour_proposed | character varying(100) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |
| bdw_existing | character varying(100) |  |  |  |
| bdw_proposed | character varying(100) |  |  |  |
| dca_existing | character varying(100) |  |  |  |
| dca_proposed | character varying(100) |  |  |  |
| dcb_existing | numeric |  |  |  |
| dcb_proposed | numeric |  |  |  |
| dfc_existing | character varying(100) |  |  |  |
| dfc_proposed | character varying(100) |  |  |  |
| dc_existing | character varying(100) |  |  |  |
| dc_proposed | character varying(100) |  |  |  |
| tcw_existing | character varying(100) |  |  |  |
| tcw_proposed | character varying(100) |  |  |  |
| tw_existing | character varying(100) |  |  |  |
| tw_proposed | character varying(100) |  |  |  |
| total_draft_existing | numeric |  |  |  |
| total_draft_proposed | numeric |  |  |  |
| operator | text |  |  |  |
| remarks | text |  |  |  |
| approval_status | text |  | 'pending'::text |  |
| review_remarks | text |  |  |  |
| reviewed_by | text |  |  |  |
| reviewed_at | timestamp without time zone |  |  |  |
| consignee_name_existing | character varying(200) |  |  |  |
| consignee_name_proposed | character varying(200) |  |  |  |
| created_by_user_id | integer |  |  |  |
| consumed_pp_entry_id | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `wheel_change_entry_id_uq`: `CREATE UNIQUE INDEX wheel_change_entry_id_uq ON spinning.wheel_change USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `spinning.wheel_change_inspection`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('spinning.wheel_change_inspectio | PK |
| ins_code | character varying(15) |  | ('WC'::text \|\| lpad((nextval('spinning | UQ |
| type | character varying(50) |  | 'Wheel Change'::character varying |  |
| wheel_change_type | character varying(100) |  |  |  |
| test_no | character varying(50) |  |  |  |
| date | date |  |  |  |
| fm_no | character varying(50) |  |  |  |
| count_from_existing | character varying(100) |  |  |  |
| count_from_proposed | character varying(100) |  |  |  |
| lycra_type_existing | character varying(100) |  |  |  |
| lycra_type_proposed | character varying(100) |  |  |  |
| lycra_draft_existing | numeric(6,2) |  |  |  |
| lycra_draft_proposed | numeric(6,2) |  |  |  |
| slub_code_existing | character varying(100) |  |  |  |
| slub_code_proposed | character varying(100) |  |  |  |
| range_existing | character varying(100) |  |  |  |
| range_proposed | character varying(100) |  |  |  |
| offset_existing | character varying(50) |  |  |  |
| offset_proposed | character varying(50) |  |  |  |
| core_condition_existing | character varying(100) |  |  |  |
| core_condition_proposed | character varying(100) |  |  |  |
| production_existing | numeric(8,2) |  |  |  |
| production_proposed | numeric(8,2) |  |  |  |
| roving_hank_existing | numeric(6,2) |  |  |  |
| roving_hank_proposed | numeric(6,2) |  |  |  |
| eow_existing | character varying(50) |  |  |  |
| eow_proposed | character varying(50) |  |  |  |
| epi_existing | numeric(6,2) |  |  |  |
| epi_proposed | numeric(6,2) |  |  |  |
| dca_existing | character varying(50) |  |  |  |
| dca_proposed | character varying(50) |  |  |  |
| dcb_existing | numeric(6,2) |  |  |  |
| dcb_proposed | numeric(6,2) |  |  |  |
| dfc_existing | character varying(50) |  |  |  |
| dfc_proposed | character varying(50) |  |  |  |
| dc_existing | character varying(50) |  |  |  |
| dc_proposed | character varying(50) |  |  |  |
| tcw_existing | character varying(50) |  |  |  |
| tcw_proposed | character varying(50) |  |  |  |
| tw_existing | character varying(50) |  |  |  |
| tw_proposed | character varying(50) |  |  |  |
| tpm_existing | numeric(6,2) |  |  |  |
| tpm_proposed | numeric(6,2) |  |  |  |
| travelers_no_existing | character varying(50) |  |  |  |
| travelers_no_proposed | character varying(50) |  |  |  |
| spacer_existing | character varying(100) |  |  |  |
| spacer_proposed | character varying(100) |  |  |  |
| cop_weight_existing | numeric(6,2) |  |  |  |
| cop_weight_proposed | numeric(6,2) |  |  |  |
| speed_front_existing | numeric(6,2) |  |  |  |
| speed_front_proposed | numeric(6,2) |  |  |  |
| speed_rpm_existing | numeric(6,2) |  |  |  |
| speed_rpm_proposed | numeric(6,2) |  |  |  |
| empires_colour_existing | character varying(100) |  |  |  |
| empires_colour_proposed | character varying(100) |  |  |  |
| total_draft_existing | numeric(6,2) |  |  |  |
| total_draft_proposed | numeric(6,2) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |
| bdw_existing | character varying(100) |  |  |  |
| bdw_proposed | character varying(100) |  |  |  |
| bd_existing | numeric |  |  |  |
| bd_proposed | numeric |  |  |  |
| winding_e_existing | numeric |  |  |  |
| winding_e_proposed | numeric |  |  |  |
| winding_f_existing | numeric |  |  |  |
| winding_f_proposed | numeric |  |  |  |
| winding_length_existing | numeric |  |  |  |
| winding_length_proposed | numeric |  |  |  |
| operator | text |  |  |  |
| remarks | text |  |  |  |
| approval_status | text |  | 'pending'::text |  |
| review_remarks | text |  |  |  |
| reviewed_by | text |  |  |  |
| reviewed_at | timestamp without time zone |  |  |  |
| consignee_name_existing | character varying(200) |  |  |  |
| consignee_name_proposed | character varying(200) |  |  |  |
| created_by_user_id | integer |  |  |  |
| consumed_pp_entry_id | text |  |  |  |

<details><summary>Indexes (2)</summary>

- `wheel_change_inspection_entry_id_uq`: `CREATE UNIQUE INDEX wheel_change_inspection_entry_id_uq ON spinning.wheel_change_inspection USING btree (entry_id) WHERE (entry_id IS NOT NULL)`
- `wheel_change_inspection_ins_code_key`: `CREATE UNIQUE INDEX wheel_change_inspection_ins_code_key ON spinning.wheel_change_inspection USING btree (ins_code)`

</details>

#### `spinning.wheel_change_v2`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('spinning.wheel_change_v2_id_seq | PK |
| ins_code | character varying(15) |  | ('WC'::text \|\| lpad((nextval('spinning | UQ |
| type | character varying(50) |  | 'Wheel Change'::character varying |  |
| wheel_change_type | character varying(100) |  |  |  |
| test_no | character varying(50) |  |  |  |
| date | date |  |  |  |
| fm_no | character varying(50) |  |  |  |
| count_from_existing | character varying(100) |  |  |  |
| count_from_proposed | character varying(100) |  |  |  |
| lycra_type_existing | character varying(100) |  |  |  |
| lycra_type_proposed | character varying(100) |  |  |  |
| lycra_draft_existing | numeric(6,2) |  |  |  |
| lycra_draft_proposed | numeric(6,2) |  |  |  |
| slub_code_existing | character varying(100) |  |  |  |
| slub_code_proposed | character varying(100) |  |  |  |
| ramp_existing | character varying(100) |  |  |  |
| ramp_proposed | character varying(100) |  |  |  |
| offset_existing | character varying(50) |  |  |  |
| offset_proposed | character varying(50) |  |  |  |
| core_condition_existing | character varying(100) |  |  |  |
| core_condition_proposed | character varying(100) |  |  |  |
| production_existing | numeric(8,2) |  |  |  |
| production_proposed | numeric(8,2) |  |  |  |
| roving_hank_existing | numeric(6,2) |  |  |  |
| roving_hank_proposed | numeric(6,2) |  |  |  |
| back_roll_wheel_existing | character varying(100) |  |  |  |
| back_roll_wheel_proposed | character varying(100) |  |  |  |
| change_pinion_existing | character varying(100) |  |  |  |
| change_pinion_proposed | character varying(100) |  |  |  |
| edw_existing | character varying(50) |  |  |  |
| edw_proposed | character varying(50) |  |  |  |
| ed_existing | numeric(6,2) |  |  |  |
| ed_proposed | numeric(6,2) |  |  |  |
| b_existing | character varying(50) |  |  |  |
| b_proposed | character varying(50) |  |  |  |
| a_existing | numeric(6,2) |  |  |  |
| a_proposed | numeric(6,2) |  |  |  |
| d_existing | character varying(50) |  |  |  |
| d_proposed | character varying(50) |  |  |  |
| c_existing | numeric(6,2) |  |  |  |
| c_proposed | numeric(6,2) |  |  |  |
| tpi_tpm_existing | numeric(6,2) |  |  |  |
| tpi_tpm_proposed | numeric(6,2) |  |  |  |
| winding_kf_existing | numeric(6,2) |  |  |  |
| winding_kf_proposed | numeric(6,2) |  |  |  |
| ratchet_wheel_existing | character varying(100) |  |  |  |
| ratchet_wheel_proposed | character varying(100) |  |  |  |
| travelers_no_existing | character varying(50) |  |  |  |
| travelers_no_proposed | character varying(50) |  |  |  |
| spacer_existing | character varying(100) |  |  |  |
| spacer_proposed | character varying(100) |  |  |  |
| speed_spindle_existing | numeric(6,2) |  |  |  |
| speed_spindle_proposed | numeric(6,2) |  |  |  |
| speed_main_existing | numeric(6,2) |  |  |  |
| speed_main_proposed | numeric(6,2) |  |  |  |
| empires_colour_existing | character varying(100) |  |  |  |
| empires_colour_proposed | character varying(100) |  |  |  |
| total_draft_existing | numeric(6,2) |  |  |  |
| total_draft_proposed | numeric(6,2) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |
| operator | text |  |  |  |
| remarks | text |  |  |  |
| approval_status | text |  | 'pending'::text |  |
| review_remarks | text |  |  |  |
| reviewed_by | text |  |  |  |
| reviewed_at | timestamp without time zone |  |  |  |
| consignee_name_existing | character varying(200) |  |  |  |
| consignee_name_proposed | character varying(200) |  |  |  |
| created_by_user_id | integer |  |  |  |
| consumed_pp_entry_id | text |  |  |  |

<details><summary>Indexes (2)</summary>

- `wheel_change_v2_entry_id_uq`: `CREATE UNIQUE INDEX wheel_change_v2_entry_id_uq ON spinning.wheel_change_v2 USING btree (entry_id) WHERE (entry_id IS NOT NULL)`
- `wheel_change_v2_ins_code_key`: `CREATE UNIQUE INDEX wheel_change_v2_ins_code_key ON spinning.wheel_change_v2 USING btree (ins_code)`

</details>

### Schema: `comber`

#### `comber.efficiency_data_entry`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('comber.efficiency_data_entry_id | PK |
| entry_id | text |  |  |  |
| type | text | NOT NULL | 'Comber Efficiency'::text |  |
| mc_name | text |  |  |  |
| span_length_50_lap | numeric(10,2) |  |  |  |
| span_length_50_sliver | numeric(10,2) |  |  |  |
| combining_efficiency_formula | text |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (1)</summary>

- `comber_efficiency_data_entry_entry_id_uq`: `CREATE UNIQUE INDEX comber_efficiency_data_entry_entry_id_uq ON comber.efficiency_data_entry USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `comber.nati_data_entry`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('comber.nati_data_entry_id_seq': | PK |
| type | character varying(50) | NOT NULL |  |  |
| entry_date | date |  |  |  |
| variety | character varying(100) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |
| operator | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `comber_nati_data_entry_entry_id_uq`: `CREATE UNIQUE INDEX comber_nati_data_entry_entry_id_uq ON comber.nati_data_entry USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `comber.neps_details`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('comber.neps_details_id_seq'::re |  |
| qc_id | integer | NOT NULL |  |  |
| mc_no | character varying(50) |  |  |  |
| ratio_size_1 | numeric(10,2) |  |  |  |
| ratio_size_07 | numeric(10,2) |  |  |  |
| ratio_size_05 | numeric(10,2) |  |  |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |

<details><summary>Indexes (1)</summary>

- `idx_neps_qc_id`: `CREATE INDEX idx_neps_qc_id ON comber.neps_details USING btree (qc_id)`

</details>

#### `comber.nre_data_entry`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('comber.nre_data_entry_id_seq':: | PK |
| entry_id | text |  |  |  |
| type | text | NOT NULL | 'Comber NRE%'::text |  |
| silver_hank | numeric(10,2) |  |  |  |
| delivery_mtr_min | numeric(10,2) |  |  |  |
| comber_neps_min | numeric(10,2) |  |  |  |
| feed_mm_per_nep | numeric(10,2) |  |  |  |
| fiber_nep_in_comber_lap_gms | numeric(10,2) |  |  |  |
| fiber_nep_gms_in_silver | numeric(10,2) |  |  |  |
| comber_nre_percent | numeric(10,2) |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (1)</summary>

- `comber_nre_data_entry_entry_id_uq`: `CREATE UNIQUE INDEX comber_nre_data_entry_entry_id_uq ON comber.nre_data_entry USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `comber.ribbon_lap_cv_qc`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('comber.ribbon_lap_cv_qc_id_seq' | PK |
| entry_type | character varying(100) | NOT NULL |  |  |
| sample_count | integer | NOT NULL |  |  |
| record_date | date |  |  |  |
| machine_name | character varying(100) |  |  |  |
| variety | character varying(100) |  |  |  |
| type | character varying(100) |  |  |  |
| lap_weight | numeric(10,2) |  |  |  |
| average | numeric(10,4) |  |  |  |
| minimum | numeric(10,4) |  |  |  |
| maximum | numeric(10,4) |  |  |  |
| std_deviation | numeric(10,4) |  |  |  |
| cv_percent | numeric(10,4) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |
| lap_length | numeric(10,2) |  |  |  |
| grams_per_meter | numeric(10,2) |  |  |  |

<details><summary>Indexes (1)</summary>

- `ribbon_lap_cv_qc_entry_id_uq`: `CREATE UNIQUE INDEX ribbon_lap_cv_qc_entry_id_uq ON comber.ribbon_lap_cv_qc USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `comber.ribbon_lap_samples`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('comber.ribbon_lap_samples_id_se |  |
| qc_id | integer | NOT NULL |  |  |
| sample_no | integer | NOT NULL |  |  |
| sample_value | numeric(10,4) |  |  |  |
| created_at | timestamp without time zone |  | CURRENT_TIMESTAMP |  |

#### `comber.u_data_entry`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | integer | NOT NULL | nextval('comber.u_data_entry_id_seq'::re |  |
| entry_type | character varying(50) | NOT NULL |  |  |
| entry_date | date | NOT NULL |  |  |
| shift | character varying(20) |  |  |  |
| variety | character varying(100) |  |  |  |
| department | character varying(100) |  |  |  |
| mc_no | character varying(50) |  |  |  |
| u_percent | numeric(10,2) |  |  |  |
| cvm | numeric(10,2) |  |  |  |
| cvm_1m | numeric(10,2) |  |  |  |
| cvm_3m | numeric(10,2) |  |  |  |
| remarks | text |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| entry_id | text |  |  |  |

<details><summary>Indexes (1)</summary>

- `comber_u_data_entry_entry_id_uq`: `CREATE UNIQUE INDEX comber_u_data_entry_entry_id_uq ON comber.u_data_entry USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

### Schema: `wrapping`

#### `wrapping.a_percent`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('wrapping.a_percent_id_seq'::reg |  |
| entry_id | text |  |  |  |
| entry_type | text |  |  |  |
| schema_name | text |  |  |  |
| table_name | text |  |  |  |
| pdf_file | text |  |  |  |
| meta | jsonb | NOT NULL | '{}'::jsonb |  |
| sample_rows | jsonb | NOT NULL | '[]'::jsonb |  |
| summary_rows | jsonb | NOT NULL | '[]'::jsonb |  |
| rows | jsonb | NOT NULL | '[]'::jsonb |  |
| raw_ocr_rows | jsonb | NOT NULL | '[]'::jsonb |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (2)</summary>

- `wrapping_a_percent_created_at_idx`: `CREATE INDEX wrapping_a_percent_created_at_idx ON wrapping.a_percent USING btree (created_at DESC, id DESC)`
- `wrapping_a_percent_entry_id_uq`: `CREATE UNIQUE INDEX wrapping_a_percent_entry_id_uq ON wrapping.a_percent USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `wrapping.carding_notebook`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('wrapping.carding_notebook_id_se |  |
| entry_id | text |  |  |  |
| serial_no | integer |  |  |  |
| date_text | text |  |  |  |
| entry_date | date |  |  |  |
| source_id | text |  |  |  |
| mac_name | text |  |  |  |
| shift | text |  |  |  |
| std_hank | text |  |  |  |
| avg_hank | numeric(12,4) |  |  |  |
| sd | numeric(12,4) |  |  |  |
| cv | text |  |  |  |
| user_name | text |  |  |  |
| remark | text |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (2)</summary>

- `wrapping_carding_notebook_entry_date_idx`: `CREATE INDEX wrapping_carding_notebook_entry_date_idx ON wrapping.carding_notebook USING btree (entry_date DESC, id DESC)`
- `wrapping_carding_notebook_entry_id_uq`: `CREATE UNIQUE INDEX wrapping_carding_notebook_entry_id_uq ON wrapping.carding_notebook USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `wrapping.comber_noil_percent`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('wrapping.comber_noil_percent_id |  |
| entry_id | text |  |  |  |
| entry_type | text |  |  |  |
| schema_name | text |  |  |  |
| table_name | text |  |  |  |
| pdf_file | text |  |  |  |
| meta | jsonb | NOT NULL | '{}'::jsonb |  |
| sample_rows | jsonb | NOT NULL | '[]'::jsonb |  |
| summary_rows | jsonb | NOT NULL | '[]'::jsonb |  |
| rows | jsonb | NOT NULL | '[]'::jsonb |  |
| raw_ocr_rows | jsonb | NOT NULL | '[]'::jsonb |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (3)</summary>

- `wrapping_comber_noil_percent_created_at_idx`: `CREATE INDEX wrapping_comber_noil_percent_created_at_idx ON wrapping.comber_noil_percent USING btree (created_at DESC, id DESC)`
- `wrapping_comber_noil_percent_entry_id_idx`: `CREATE INDEX wrapping_comber_noil_percent_entry_id_idx ON wrapping.comber_noil_percent USING btree (entry_id) WHERE (entry_id IS NOT NULL)`
- `wrapping_comber_noil_percent_entry_id_uq`: `CREATE UNIQUE INDEX wrapping_comber_noil_percent_entry_id_uq ON wrapping.comber_noil_percent USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `wrapping.drawframe_notebook`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('wrapping.drawframe_notebook_id_ | PK |
| entry_id | text |  |  |  |
| date_text | text |  |  |  |
| entry_date | date |  |  |  |
| source_id | text |  |  |  |
| mac_name | text |  |  |  |
| shift | text |  |  |  |
| std_hank | text |  |  |  |
| avg_hank | numeric(12,3) |  |  |  |
| sd | numeric(12,3) |  |  |  |
| cv | text |  |  |  |
| user_name | text |  |  |  |
| remark | text |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (2)</summary>

- `wrapping_drawframe_notebook_entry_date_idx`: `CREATE INDEX wrapping_drawframe_notebook_entry_date_idx ON wrapping.drawframe_notebook USING btree (entry_date DESC, id DESC)`
- `wrapping_drawframe_notebook_entry_id_uq`: `CREATE UNIQUE INDEX wrapping_drawframe_notebook_entry_id_uq ON wrapping.drawframe_notebook USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `wrapping.simplex_notebook`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('wrapping.simplex_notebook_id_se | PK |
| entry_id | text |  |  |  |
| serial_no | integer |  |  |  |
| date_text | text |  |  |  |
| entry_date | date |  |  |  |
| source_id | text |  |  |  |
| mac_name | text |  |  |  |
| shift | text |  |  |  |
| std_hank | text |  |  |  |
| avg_hank | numeric(12,4) |  |  |  |
| sd | numeric(12,4) |  |  |  |
| cv | text |  |  |  |
| user_name | text |  |  |  |
| remark | text |  |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (2)</summary>

- `wrapping_simplex_notebook_entry_date_idx`: `CREATE INDEX wrapping_simplex_notebook_entry_date_idx ON wrapping.simplex_notebook USING btree (entry_date DESC, id DESC)`
- `wrapping_simplex_notebook_entry_id_uq`: `CREATE UNIQUE INDEX wrapping_simplex_notebook_entry_id_uq ON wrapping.simplex_notebook USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>

#### `wrapping.stretch_percent`  <sub>(0 rows)</sub>

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| id | bigint | NOT NULL | nextval('wrapping.stretch_percent_id_seq | PK |
| entry_id | text |  |  |  |
| entry_type | text |  |  |  |
| schema_name | text |  |  |  |
| table_name | text |  |  |  |
| pdf_file | text |  |  |  |
| meta | jsonb | NOT NULL | '{}'::jsonb |  |
| sample_rows | jsonb | NOT NULL | '[]'::jsonb |  |
| summary_rows | jsonb | NOT NULL | '[]'::jsonb |  |
| rows | jsonb | NOT NULL | '[]'::jsonb |  |
| raw_ocr_rows | jsonb | NOT NULL | '[]'::jsonb |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

<details><summary>Indexes (3)</summary>

- `wrapping_stretch_percent_created_at_idx`: `CREATE INDEX wrapping_stretch_percent_created_at_idx ON wrapping.stretch_percent USING btree (created_at DESC, id DESC)`
- `wrapping_stretch_percent_entry_id_idx`: `CREATE INDEX wrapping_stretch_percent_entry_id_idx ON wrapping.stretch_percent USING btree (entry_id) WHERE (entry_id IS NOT NULL)`
- `wrapping_stretch_percent_entry_id_uq`: `CREATE UNIQUE INDEX wrapping_stretch_percent_entry_id_uq ON wrapping.stretch_percent USING btree (entry_id) WHERE (entry_id IS NOT NULL)`

</details>


## Appendix B: Application-Facing Views

#### `autoconer.inspection_summary`

```sql
SELECT inspection_id AS id,
    round(avg(splice_strength), 2) AS avg_splice_strength,
    round(avg(parent_yarn), 2) AS avg_parent_yarn,
    round(avg(percent_yarn), 2) AS avg_percent_yarn,
    count(*) AS total_readings
   FROM autoconer.drum_readings
  GROUP BY inspection_id;
```

#### `autoconer.v_drum_summary`

```sql
SELECT drum_wise_id,
    drum_no,
    count(*) FILTER (WHERE (appearance_ok = true)) AS appearance_ok,
    count(*) FILTER (WHERE (appearance_ok = false)) AS appearance_not_ok
   FROM autoconer.drum_inspection
  GROUP BY drum_wise_id, drum_no;
```

#### `blowroom.sync_stats`

```sql
SELECT sync_id,
    round(avg(value_a), 4) AS value_a_avg,
    min(value_a) AS value_a_min,
    max(value_a) AS value_a_max,
    round((max(value_a) - min(value_a)), 4) AS value_a_range,
    round(avg(value_b), 4) AS value_b_avg,
    min(value_b) AS value_b_min,
    max(value_b) AS value_b_max,
    round((max(value_b) - min(value_b)), 4) AS value_b_range,
    round(avg(value_c), 4) AS value_c_avg,
    min(value_c) AS value_c_min,
    max(value_c) AS value_c_max,
    round((max(value_c) - min(value_c)), 4) AS value_c_range,
    round(avg(sync_percentage), 4) AS sync_percentage_avg,
    min(sync_percentage) AS sync_percentage_min,
    max(sync_percentage) AS sync_percentage_max,
    round((max(sync_percentage) - min(sync_percentage)), 4) AS sync_percentage_range
   FROM blowroom.blow_room_sync_entries
  GROUP BY sync_id;
```

#### `carding.hank_stats`

```sql
SELECT inspection_id,
    round(avg(value), 3) AS avg,
    round(max(value), 3) AS max,
    round(min(value), 3) AS min,
    round((max(value) - min(value)), 3) AS range,
    round(COALESCE(stddev_pop(value), (0)::numeric), 3) AS sd,
    round(COALESCE(
        CASE
            WHEN (avg(value) = (0)::numeric) THEN (0)::numeric
            ELSE ((stddev_pop(value) / avg(value)) * (100)::numeric)
        END, (0)::numeric), 3) AS cv
   FROM carding.hanks
  GROUP BY inspection_id;
```

#### `carding.sample_weight_stats`

```sql
SELECT inspection_id,
    round(avg(value), 3) AS avg,
    round(max(value), 3) AS max,
    round(min(value), 3) AS min,
    round((max(value) - min(value)), 3) AS range,
    round(COALESCE(stddev_pop(value), (0)::numeric), 3) AS sd,
    round(COALESCE(
        CASE
            WHEN (avg(value) = (0)::numeric) THEN (0)::numeric
            ELSE ((stddev_pop(value) / avg(value)) * (100)::numeric)
        END, (0)::numeric), 3) AS cv
   FROM carding.sample_weights
  GROUP BY inspection_id;
```

#### `mixing.mixing_qc_dashboard_entries`

```sql
SELECT h.qc_id,
    h.param_id,
    h.entry_id,
    h.consignee_name,
    h.count_name,
    h.creation_date,
    h.status,
    b.blend_no,
    b.percentage,
    b.lot_no,
    b.cut_length,
    b.tenacity,
    b.elongation,
    b.merge_no
   FROM (mixing.mixing_qc_header h
     LEFT JOIN mixing.mixing_qc_blends b ON ((b.qc_id = h.qc_id)));
```

#### `mixing.openness_dashboard_entries`

```sql
SELECT i.id AS inspection_id,
    i.inspection_date,
    i.br_line_no,
    i.actual_specific_volume_target,
    i.no_of_entries,
    i.entry_id,
    e.entry_no,
    e.stage_no,
    e.machine_name,
    e.weight,
    e.volume_1,
    e.volume_2,
    e.average_volume,
    e.apparent_specific_volume,
    e.actual_op_value,
    e.beater_type,
    e.beater_speed_rpm
   FROM (mixing.openness_inspection i
     JOIN mixing.openness_entries e ON ((e.inspection_id = i.id)));
```

#### `mixing.openness_overall_stats`

```sql
SELECT inspection_id,
    count(*) AS total_entries,
    round(avg(apparent_specific_volume), 3) AS avg_apparent_specific_volume,
    round(avg(actual_op_value), 3) AS avg_actual_op_value,
    round(max(actual_op_value), 3) AS max_actual_op_value,
    round(min(actual_op_value), 3) AS min_actual_op_value,
    round((max(actual_op_value) - min(actual_op_value)), 3) AS range_actual_op_value,
    round(COALESCE(stddev_pop(actual_op_value), (0)::numeric), 3) AS sd_actual_op_value,
    round(COALESCE(
        CASE
            WHEN (avg(actual_op_value) = (0)::numeric) THEN (0)::numeric
            ELSE ((stddev_pop(actual_op_value) / avg(actual_op_value)) * (100)::numeric)
        END, (0)::numeric), 3) AS cv_actual_op_value
   FROM mixing.openness_entries
  GROUP BY inspection_id;
```

#### `mixing.openness_stage_stats`

```sql
SELECT inspection_id,
    stage_no,
    count(*) AS total_entries,
    round(avg(apparent_specific_volume), 3) AS avg_apparent_specific_volume,
    round(avg(actual_op_value), 3) AS avg_actual_op_value,
    round(max(actual_op_value), 3) AS max_actual_op_value,
    round(min(actual_op_value), 3) AS min_actual_op_value,
    round((max(actual_op_value) - min(actual_op_value)), 3) AS range_actual_op_value,
    round(COALESCE(stddev_pop(actual_op_value), (0)::numeric), 3) AS sd_actual_op_value,
    round(COALESCE(
        CASE
            WHEN (avg(actual_op_value) = (0)::numeric) THEN (0)::numeric
            ELSE ((stddev_pop(actual_op_value) / avg(actual_op_value)) * (100)::numeric)
        END, (0)::numeric), 3) AS cv_actual_op_value
   FROM mixing.openness_entries
  GROUP BY inspection_id, stage_no;
```


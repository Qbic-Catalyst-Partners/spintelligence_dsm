# Spintelligence DSM — Backend Architecture Documentation

> **System**: Spintelligence DSM (Digital Shift Management) — a production/quality-management backend for a textile spinning mill, covering data entry for every production department (Mixing, Blow Room, Carding, Draw Frame, Simplex, Spinning, Autoconer, Comber), an automated threshold/ticketing escalation engine, RBAC, dashboards, analytics, OCR intake, and scheduled reporting.
>
> **Companion document**: [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md) — full schema reference for the Postgres database this backend runs against.
>
> Generated 2026-07-30 from static analysis of the codebase at `c:\Users\Sneha\Downloads\spintelligence_dsm\backend` (branch `sneha-2`).

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (CommonJS), Express 5 |
| Primary database | PostgreSQL (Supabase-hosted), via `pg` |
| Secondary database | Microsoft SQL Server (external ERP, read-only), via `mssql` |
| Auth | JSON Web Tokens (`jsonwebtoken`), bcrypt password hashing |
| File handling | `multer` (uploads), `xlsx` / `csv-parser` (bulk import), `json2csv` (export), `pdfkit` (PDF generation) |
| Email | `nodemailer` / Resend (configurable provider) |
| API docs | `swagger-jsdoc` + `swagger-ui-express`, served at `/api-docs` |
| OCR | Local Python subprocess (`ocr_service/run_ocr_pipeline.py`), spawned via `child_process.spawn` |
| Testing | Playwright (`@playwright/test`) |
| Process model | Single Node process; `server.js` is the entry point (`npm start` → `node server.js`) |

**Entry point**: `server.js` — see [§3](#3-request-pipeline-serverjs).
**Database connection**: `connection.js` (Postgres) — see [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md) for full detail.
**ERP connection**: `config/sqlserver.js` (SQL Server, read-only master data).

---

## 2. Directory Layout

```
backend/
├── server.js              # Express app, global middleware, route mounting, background workers
├── connection.js          # Postgres pool, schema bootstrap, request-scoped transactions, Supabase mirroring
├── swaggerConfig.js        # OpenAPI spec generation from JSDoc comments in routes/*.js
├── email.js               # Shared mailer (nodemailer/Resend)
├── config/
│   ├── roles.json          # Static seed permission map (canApprove/canReject per role name)
│   ├── sqlserver.js         # SQL Server (ERP) connection pool
│   └── sqlserverPrep.js     # ERP "prep variety" read helper
├── middleware/
│   ├── auth.js              # Global JWT gate (see §4.1)
│   ├── RBACMiddleware.js     # Permission-based authorize(permission) middleware factory
│   ├── adminOnly.js          # Separate JWT gate for the env-credential admin login
│   └── loginRequired.js
├── routes/                 # 33 route modules — see §5 for the full reference
├── utils/                  # Shared helpers: logging, notifications, entry-id generation,
│                            # ERP prep/variety/employee-master lookups
├── ocr_service/             # Python OCR pipeline invoked as a local subprocess by ocrMachine.routes.js
├── ocr-microservice/         # Separate, not-currently-wired-in Python OCR service (own README/afis/hvi/etc. modules)
├── docs/                    # This documentation + per-module API references (.docx) + ticket-workflow.md
├── scripts/                 # One-off SQL migrations, wipe/reset scripts, Supabase↔Postgres sync PowerShell scripts
├── tests/, test-results/, playwright-report/   # Playwright test suite and output
├── uploads/, backups/, database backups/       # Runtime file storage
└── frontend/, public/       # Static assets served for the OCR machine UI
```

---

## 3. Request Pipeline (`server.js`)

Express middleware executes in registration order. The pipeline is:

1. **Emergent/Kubernetes compatibility shim** — strips a leading `/api` prefix from every incoming URL, so the same route definitions work whether the frontend calls `/api/users` (behind an ingress that only forwards `/api/*`) or `/users` (local dev).
2. **Request logger** — logs `Origin`/`Method`/`URL` for every request.
3. **CORS** — origin allowlist read from `CORS_ORIGINS` env var on every request (so a restart, not a redeploy, is enough to pick up changes); supports exact matches and `*.suffix` wildcard subdomains; an empty allowlist means "allow everything" (dev convenience — **must** be set in production).
4. **`db.withRequestContext`** — opens the `AsyncLocalStorage` context used for request-scoped transaction pinning (see `DATABASE_SCHEMA.md` §1.2).
5. **`express.json({ limit: '10mb' })`** — body parsing.
6. **Global auto entry-ID middleware** — for `POST` requests to any of the 8 department route prefixes (`/spinning`, `/mixing`, `/comber`, `/carding`, `/blowroom`, `/drawframe`, `/simplex`, `/autoconer`) *not* in the `PP_MANAGED_ROUTES` allowlist, computes and reserves a human-readable `entry_id` before the route handler runs (see [§7](#7-entry-id-generation)).
7. **`/api-docs`** — Swagger UI, mounted here (before auth) so the docs page itself doesn't require a token.
8. **Public routers** (mounted **before** the JWT gate — no token required): `/auth` (login.js), `/admin` (admin.js), `/email-otp`, `/phone-verification`, `/ocr-machine` + `/ocr-json` (ocrMachine.routes.js).
9. **`app.use(auth)`** — from this point on, **every** route requires a valid Bearer JWT (see [§4.1](#41-jwt-auth-middlewareauthjs)).
10. **Global activity-logging middleware** — after a successful (`< 400`) `POST`/`PUT`/`PATCH`/`DELETE` (except on `/activity-logs` itself), writes a row to `ticketing_system.activity_logs` with the caller's identity, module, action, and request metadata.
11. **All remaining routers** — see [§5](#5-route-reference).
12. **Global error handler** — has a special branch (`isDatabaseAccessDenied`) that converts a SQL Server permission error into a clear 403 telling an operator the exact `GRANT SELECT` statement their DBA needs to run; otherwise returns `err.statusCode || 500`.
13. **`app.listen(PORT, '0.0.0.0')`** (default port 4000), followed by three background workers started at boot (see [§8](#8-background-workers)).

### URL-rewrite delegation pattern

Several mount points don't define a new router — they rewrite `req.url` and hand the request to an **already-mounted** router, letting one router serve multiple base paths expected by different frontend builds:

| Public path | Rewritten to / delegates into |
|---|---|
| `/wheel-change` | `spinning.js` router (frontend's shared `wheelChangeApprovals.js` hits this bare path instead of `/spinning/wheel-change`) |
| `/statistics-analytics` | `dashboard.js` router |
| `/glossary`, `/faqs`, `/user-guide` | `helpContent.routes.js` router |
| `/ocr-json` | `ocrMachine.routes.js` router (rewritten to `/api/ocr-json`) |

This, combined with deliberate alias mounts (e.g. `/reportSchedules` **and** `/reports` both mounting `reportSchedules.routes.js`; `/dashboard`, `/api/dashboard`, `/dashbuilder`, `/builder` all mounting `dashboard.js`), means the same business logic is frequently reachable under 2–10 different URL prefixes — a compatibility/versioning artifact for multiple frontend builds, not distinct functionality.

---

## 4. Authentication & Authorization

### 4.1 JWT auth middleware (`middleware/auth.js`)

Applied globally in `server.js` after the public routers. For every request:
- `OPTIONS` requests always pass through (CORS preflight).
- A hardcoded list of **public department paths** (`PUBLIC_DEPARTMENT_PATHS`, matched by regex) bypasses the JWT check entirely and gets a synthetic `req.user = { role: 'Public', employee_id: 'PUBLIC' }`. These are specific data-entry sub-screens meant to be reachable without login — e.g. several Draw Frame "wrapping" percentage screens (A%, Stretch%, Comber Noil%) and Autoconer master-data/dropdown endpoints.
- Otherwise, requires `Authorization: Bearer <token>`, verifies it with `jsonwebtoken` against `process.env.JWT_SECRET`, and attaches `req.user = { id, role_id, role, departments, employee_id, level }` from the token payload.
- Returns `401` with `code: 'TOKEN_EXPIRED'` on an expired token (distinguishable by the frontend for silent-refresh handling), or a generic `401` on any other verification failure.

### 4.2 Admin auth (`middleware/adminOnly.js` + `routes/admin.js`)

A **completely separate** admin login path, independent of the `users`/`rbac` schema:
- `POST /admin/login` validates `username`/`password` against `process.env.ADMIN_USERNAME` / `ADMIN_PASSWORD` (or a bcrypt hash, `ADMIN_PASSWORD_HASH`), and issues a JWT signed with `ADMIN_JWT_SECRET` (falling back to `JWT_SECRET`), payload `{ sub, username, role: 'admin', auth_type: 'admin' }`, 8h expiry.
- `middleware/adminOnly.js` verifies that token and rejects any token whose `auth_type !== 'admin'`.
- This is an env-credential "break-glass" login, not tied to any specific user account — treat `ADMIN_PASSWORD`/`ADMIN_JWT_SECRET` as high-value secrets.

### 4.3 RBAC model

Three layers, from coarsest to finest:

1. **`config/roles.json`** — a static seed permission map (`{ role_name: { canApprove, canReject } }`), read by `middleware/RBACMiddleware.js`'s `authorize(permission)` factory. Simple, coarse-grained, file-based.
2. **Live RBAC tables** (`rbac.role_details`, `rbac.departments`, `rbac.screens`, `rbac.role_departments`, `rbac.role_screens`) — the actual editable RBAC store, managed via `routes/roles.routes.js`, `department.routes.js`, `screens.routes.js`. A role is granted visibility into N departments and N screens; `GET /auth/accessible-screens/:roleId` (login.js) resolves this into the department→screens tree the frontend uses to build navigation. The Admin role gets a `CROSS JOIN` bypass (all active departments/screens) rather than an explicit link-table entry for every screen.
3. **Inline role-string checks** — a few files (`supervisorTickets.routes.js`, `supervisorAssignments.routes.js`) implement their own `isAdminUser(req)` check (`role === 'admin' | 'super admin' | 'superadmin'`) rather than going through `RBACMiddleware`, and `helpContent.routes.js` has its own local `requireEditor` middleware gating content writes. `rbac.permissions`/`rbac.role_permissions` exist in the schema for a more granular action-permission model but currently hold zero rows — not yet wired into any route's authorization check.

### 4.4 User & reporting hierarchy (`routes/user.routes.js`)

- **Levels**: every user has a `level` (`L1`–`L5`, default `L1`). `L1` = entry operator, `L2` = supervisor, `L3` = sub-manager, `L4` = Quality/Department Head, `L5` = Admin/MD (top-of-chain escalation target) — this L1–L5 convention (documented directly in `supervisorTickets.routes.js`) drives essentially all approval/escalation routing in the system.
- **Reporting chain**: every non-L5 user must have exactly one `reports_to_user_id`, pointing to a user exactly one level above (enforced by `validateReportingManager()` on create/update/bulk-upload). L5 users must have no manager.
- **`getManagerChain(userId)`** walks this chain upward (capped at 10 hops) and is the single source of truth `operatorTickets.routes.js` (`resolveTicketEscalationChain`) and `submittedNotebooks.routes.js` use to resolve L2–L5 escalation targets for a given ticket — the modern replacement for older, manually-configured `approval_lX_user_ids` arrays (which several tables still carry as a fallback/legacy path).
- Bulk user import (`POST /users/bulk-upload`, CSV/XLSX) resolves `reports_to_employee_id` row-by-row within one transaction, so a manager defined earlier in the same file can be referenced by later rows.

### 4.5 Delegation of approval authority

`routes/delegations.routes.js` lets a user (e.g., an L2/L3 going on leave) hand off approval authority to another user for a date range; `supervisorTickets.routes.js` and `operatorTickets.routes.js` both check `ensureDelegationsTable`-backed delegations before rejecting an approval action as unauthorized. `routes/supervisorAssignments.routes.js` is an older, still-active parallel mechanism (explicit supervisor↔employee binding, `users.supervisor_assignments`) that scopes ticket visibility for supervisors alongside the newer `reports_to_user_id` chain.

---

## 5. Route Reference

33 files under `routes/`. All sit behind the global JWT gate (§4.1) except where noted as "public."

### 5.1 Core infrastructure

| File | Mount(s) | Purpose |
|---|---|---|
| `login.js` | `/auth` (public) | Employee login (bcrypt + JWT), accessible-screens resolution, dev-stub forgot-password/OTP/reset-password flow |
| `user.routes.js` | `/users` | User CRUD, reporting-hierarchy validation, bulk CSV/XLSX import/export |
| `roles.routes.js` | `/roles` | RBAC role CRUD + department/screen link management |
| `department.routes.js` | `/departments` | RBAC department master data (with delete-guard: blocked if referenced by any user/role) |
| `screens.routes.js` | `/screens` | RBAC screen master data |
| `admin.js` | `/admin` (public) | Env-credential admin login (see §4.2) |

### 5.2 Ticketing system

| File | Mount(s) | Purpose |
|---|---|---|
| `operatorTickets.routes.js` (4,548 lines — largest file) | `/operator-tickets` | Threshold master CRUD (incl. CSV bulk import), submission-frequency config, automatic ticket generation (`POST /generate`) with escalation-chain resolution, ticket lifecycle CRUD, workflow guide |
| `supervisorTickets.routes.js` (1,446 lines) | `/api/supervisor-tickets`, `/supervisor-tickets` | L2-facing ticket review: approve/reject/acknowledge, supervisor↔employee assignment lookups |
| `ppThreshold.routes.js` | `/pp-threshold` | Completion-TAT threshold + L1/L2 approvers for the PP-batch acknowledgement flow |
| `delegations.routes.js` | `/delegations` | Delegation of approval authority (see §4.5) |
| `supervisorAssignments.routes.js` | `/supervisor-assignments` | Legacy supervisor↔employee binding (see §4.5) |

See [§6](#6-the-ticketing--threshold-engine) for the full ticket lifecycle and threshold model.

### 5.3 Process Parameters (PP batches)

| File | Mount(s) | Purpose |
|---|---|---|
| `processParameters.js` | `/process-parameters` | PP batch (`PP-####`) creation, per-department completion tracking, L4 approve/reject, approval-config, TAT escalation (`runPpApprovalTatCheck`) |
| `ppThreshold.routes.js` | `/pp-threshold` | (see above) |

See [§7](#7-entry-id-generation) for id minting and [§6.4](#64-process-parameter-pp-batches) for the batch lifecycle.

### 5.4 Notebook submission, reporting & analytics

| File | Mount(s) | Purpose |
|---|---|---|
| `submittedNotebooks.routes.js` (1,788 lines) | `/submitted-notebooks`, `/l2/submitted-notebooks` | Records every notebook submission, computes acknowledgement SLA, generates overdue-acknowledgement tickets and PP-batch-incomplete tickets |
| `reportSchedules.routes.js` (2,513 lines) | `/reportSchedules`, `/reports` | Ad-hoc "General Report" builder + scheduled email reports with a self-rescheduling worker |
| `dashboard.js` (2,073 lines) | `/dashboard`, `/api/dashboard`, `/api/dashboard-settings`, `/dashbuilder`, `/builder`, `/statistics-analytics` | User-customizable dashboard/widget builder, saved dashboard pages, statistics & analytics views |
| `analysis.routes.js` (1,296 lines) | `/analysis`, `/api/analysis`, `/ticket-analysis` | Ticket-centric performance analytics (on-time rate, TAT compliance) per L1/L2, ranking/leaderboard, snapshots |
| `activityLogs.routes.js` | `/activity-logs`, `/api/activity-logs` | Audit log query API (populated automatically by the global middleware in §3 step 10) |
| `inAppNotifications.routes.js` | `/in-app-notifications`, `/notifications` | Notification inbox (read side of `utils/notifications.js`); `DELETE /clear-all` bulk-deletes a user's ticket and analysis notifications |
| `helpContent.routes.js` | `/help`, `/glossary`, `/faqs`, `/user-guide` | Glossary/FAQ/User Guide CMS, writes gated by local `requireEditor` |

### 5.5 OCR integration

| File | Mount(s) | Purpose |
|---|---|---|
| `ocrMachine.routes.js` | `/ocr-machine` (public), `/ocr-json` (public) | Accepts scanned/photographed machine reports (HVI, AFIS, Fibre, APCT, Noils, Stretch), extracts fields via a **local Python subprocess** (`ocr_service/run_ocr_pipeline.py`, spawned directly — not an HTTP call to `ocr-microservice`), persists reviewed results |

Entirely public (mounted before the JWT gate) — intentional so OCR scanning hardware/kiosks can call in without a session, but this means file upload and result-save endpoints are unauthenticated. `backend/ocr-microservice` is a separate, standalone Python service in the repo that does not appear to be wired into this route file's active code path.

### 5.6 Department data-entry files ("screen" routers)

Twelve files share a common structural pattern: (1) dropdown/master-data endpoints (mostly ERP-sourced via `config/sqlserver.js`, frequently registered under many URL aliases), (2) per-notebook-type CRUD pairs, (3) — for Spinning, Simplex, Drawframe, and (via import) Carding — a Wheel Change approval sub-flow.

| File | Mount(s) | Screens covered |
|---|---|---|
| `carding.js` (3,933 lines, 113 routes) | `/carding`, `/api/carding` | Card Thick Place & CV, Between/Within Card, Nati, UQC, DFK Pressure Checking, QC Header, Change Control (own approval flow, shares wheel-change ticketing with spinning.js), Waste Study, NRE% |
| `spinning.js` (5,284 lines, 182 routes — largest department file) | `/spinning`, `/wheel-change` | Speed/Cots/Lycra Missing/Bottom Apron/Lycra Centering checking, RSM Lycra Online/Offline, Ring Frame, Count Change, QC (own approval flow), **Wheel Change Type 1/2/3** (central approval workflow — see §6.5) |
| `autoconer.js` (5,124 lines, 80 routes) | `/autoconer` | Lycra Checking, Count-wise Cuts, Drum-wise, Splice Strength, Inspection Data Entry, Rewinding Study, Cone Density (+ Notebook variant), Cone Packing Audit, Parameter Entries, process-parameter variants (`process`, `q2`, `q3`, `q4`) |
| `drawframe.js` (2,761 lines, 100 routes) | `/drawframe` | Yarn CV%, Cots Data Entry, UQC, Header (Breaker/Finisher `entry_scope`), Wheel Change (+ Type 1/2/3), Wrapping family (A%, Stretch%, Comber Noil%) |
| `mixing.js` (2,715 lines, 60 routes) | `/mixing` | Cotton HVI, Fibre, AFIS, AFIS-6 Cotton/MMF, Moisture, Openness, QC Header |
| `blowroom.js` (1,931 lines) | `/blowroom` | Sync, Drop Test, Waste Study, Header |
| `simplex.js` (2,377 lines) | `/simplex` | Wheel Change (own approval flow), Notebook, SMX Cots Change, Study, UQC, Process Parameter |
| `comber.js` (1,325 lines) | `/comber` | Lap CV, Nati, NRE%, Efficiency, UQC |
| `trials.js` | `/trials` | General trial/experimental run tracking + shared master-data dropdowns |
| `notebookCustomFields.routes.js` | `/notebook-custom-fields` | Admin-defined custom fields materialized as real columns on a notebook's own table (`NOTEBOOK_TABLE_MAP` registry of ~20 notebooks) |
| `uqcMasterData.js` | *(helper, not mounted)* | ERP master-data lookups for carding.js's UQC screen; not an independent router |

> **Route-count caveat**: the very high route counts on `spinning.js`/`carding.js`/`autoconer.js`/`drawframe.js` are dominated by dropdown/master-data endpoints registered under many near-duplicate URL aliases (compatibility with different frontend build versions), not by distinct business logic — see the alias-sprawl note in §3.

### 5.7 Auxiliary / verification

| File | Mount(s) | Purpose |
|---|---|---|
| `emailVerification.js` | `/email-otp` (public) | Real email OTP flow (crypto-random, SHA-256 hashed, 90s expiry, sent via `email.js`) |
| `emailVerificationLogs.js` | `/email-verification-logs` | Persistence for the above |
| `phoneVerification.js` | `/phone-verification` (public) | **Dev-only stub** — static OTP `"123456"`, no real SMS |
| `autoTicketHelper.js` | *(dead code — not required anywhere)* | Superseded standalone implementation of automatic ticket generation; logic now lives in `operatorTickets.routes.js`'s `POST /generate`. Candidate for removal. |

---

## 6. The Ticketing & Threshold Engine

This is the central cross-cutting subsystem — nearly every department's QC data entry ultimately feeds into it. Full request/response examples: [`docs/ticket-workflow.md`](./ticket-workflow.md).

### 6.1 Threshold configuration

`ticketing_system.threshold_master` defines, per `department`/`sub_department`/`input_screen`/`machine_name`/`input_field`, an acceptable value range (`plus_threshold`/`minus_threshold`/`condition_level` ∈ {More Than, Less Than, More and Less Than}) and which users approve a breach at each tier (`threshold_master_l1/l2/l3_approvers` child tables, or inline `approval_lX_user_ids` arrays).

### 6.2 Automatic ticket generation

`POST /operator-tickets/generate` (and the manual single-ticket `POST /operator-tickets`) is the entry point department screens call after a QC save:
1. Resolve applicable thresholds from `threshold_master` (or accept inline thresholds in the request).
2. Resolve the escalation chain via `resolveTicketEscalationChain()` — primarily the submitting L1 user's real `getManagerChain()`, falling back to threshold-master-configured approver lists where the reporting chain doesn't reach.
3. Evaluate breaches (`analyzeViolations`/`evaluateBreach`), derive `severity` and `ticket_reason` (`MISSING_VALUE` / `THRESHOLD_BREACH` / `BOTH`).
4. Insert into `ticketing_system.operator_tickets` with a generated `ticket_id` (`TK-####`, from `nextval('ticketing_system.ticket_seq')`).
5. Fan out in-app notifications to all resolved approvers.

### 6.3 Ticket lifecycle

```
Open ──(operator submits, PUT /submit/:id)──▶ Pending Approval
                                                     │
                          ┌──────────────────────────┴───────────────────────┐
                          ▼                                                  ▼
        PATCH /supervisor-tickets/tickets/approve              PATCH .../tickets/reject
                          │                                                  │
                          ▼                                                  ▼
                       Closed                                           Reopened
```
Every transition is written to `ticketing_system.ticket_logs` (immutable audit trail). Unactioned tickets escalate L1→L2→L3 via `l1_tat_due_at`/`l2_tat_due_at`/`l3_tat_due_at` + `tat_current_level`, checked by the background TAT worker (§8).

### 6.4 Other automatic ticket sources (same engine, same table)

- **PP batch completion** — `runPpBatchCompletionCheck()` (submittedNotebooks.routes.js) opens one ticket per missing department notebook for an incomplete PP-####  batch.
- **Submission frequency** — `runSubmissionFrequencyCheck()` / `runSubmissionFrequencyTatCheck()` (operatorTickets.routes.js) detect and escalate missed required-submission-count violations per screen.
- **Notebook acknowledgement** — `generateOverdueNotebookTickets()` (submittedNotebooks.routes.js) raises/escalates tickets when a submitted notebook isn't acknowledged within its configured SLA. Acknowledgement authority is **L4/L5** (`canApproveSubmission()`); the resolved L4 approver id(s) are written into the legacy `l2_approver_user_ids` column to avoid a schema migration. Viewing the submitted-notebooks list is open to the whole L1–L5 hierarchy (`hasHierarchyLevel()`), while acknowledging remains L4/L5-only — enforced on both the frontend (`isSubmittedNotebookViewerUser` vs. `isSubmittedNotebookApproverUser` in `frontend/src/utils/accessControl.js`) and backend so a direct API call can't bypass the UI gate.
- **Wheel-change approval** — `createWheelChangeApprovalTicket()`/`runWheelChangeApprovalTatCheck()` (spinning.js, reused by carding.js) — see §6.5. Frontend classifies these as `ticket_kind: 'wheel_change'` (`TICKET_KIND.WHEEL_CHANGE` in `frontend/src/utils/ticketTransformer.js`), recognized via an explicit `ticket_type`/`ticket_kind` stamp of `WHEEL_CHANGE_APPROVAL` so older rows lacking `ticket_kind` are still classified correctly.

### 6.5 Process Parameter (PP) batches and Wheel Change

A single PP entry id (`PP-####`) is shared across up to ~11 department screens (Mixing, Blowroom, Carding, Drawframe Breaker/Finisher, Simplex, Spinning, Autoconer × 3). Lifecycle:

```
in_progress ──(all departments submitted)──▶ pending_approval
                                                     │
                              ┌──────────────────────┴─────────────────┐
                              ▼ (L4 approves)                          ▼ (L4 rejects)
                            active ◀──────────(Wheel Change rejected)── in_progress
                              │ (Wheel Change saved against this batch)
                              ▼
                           inactive
```
An `active` PP batch is the precondition for exactly one downstream Wheel Change (`spinning.js`'s `GET /wheel-change/pp-approval-status` gatekeeps this). Wheel Change itself carries its own L1→L2(→L3→L5) approval chain, configured per-department via `GET|POST /wheel-change/approval-config`.

---

## 7. Entry-ID Generation

Nearly every department table's business key is a formatted string (`SW1-0002`, `ACD-0004`, `PP-0007`, `TK-0001`) rather than the numeric primary key. **Three independent schemes coexist**:

1. **Generic per-route registry** (`ticketing_system.frontend_entry_registry`) — the global middleware in `server.js` (pipeline step 6) intercepts `POST`s to department routes, computes the next id as `MAX(registry reservations, real target table's MAX(entry_id))` using the `ENTRY_ID_ROUTE_TABLES`/`ENTRY_ID_ROUTE_PREFIXES` maps in `server.js`, reserves it (`status='reserved'`), and commits or deletes the reservation based on the response outcome. Retries up to 3× on a reservation collision by minting a fresh id rather than failing the request.
   - **Operational note**: `server.js` contains extensive comments documenting real production incidents where a route was missing from `ENTRY_ID_ROUTE_TABLES` — the id was computed only from the (driftable) registry, silently reissuing an id already committed in the real table and failing saves with "Duplicate entry_id." **Any new department screen must be added to this map** (and to `ENTRY_ID_ROUTE_PREFIXES` if it uses a non-default prefix format).
2. **PP batch sequence** (`process_parameters.entry_id_sequences`, via `utils/processParameterEntryId.js`'s `resolveOrCreateProcessParameterEntryId()`/`getCountNameConflict()`) — the single globally-coordinated sequence for the 10 shared PP-000n screens, deliberately bypassed by the generic middleware above (`PP_MANAGED_ROUTES` allowlist in `server.js`).
3. **Ticket sequence** (`ticketing_system.ticket_seq`) — a plain Postgres sequence, formatted inline as `TK-####` at insert time.

A few department files (e.g. `carding.js`'s `SCREEN_ID_PREFIXES`) also synthesize their own display ids (`#CT-0001`) purely in application code for screens whose table only has a numeric PK.

---

## 8. Background Workers

Three timer-based workers are started at the bottom of `server.js` (not inside any route file):

| Worker | Interval (default) | First run | What it does |
|---|---|---|---|
| `startReportScheduleWorker()` (in `reportSchedules.routes.js`) | Self-rescheduling `setTimeout` (frequency-aware: Single Time / Daily / Weekly / Monthly), gated by `REPORT_SCHEDULE_WORKER_ENABLED` | — | Sends scheduled report emails; deletes `Single Time` schedules after they fire |
| `startSubmittedNotebookAckWorker()` | `NOTEBOOK_ACK_WORKER_INTERVAL_MS` (15 min) | 5s after boot | Runs `generateOverdueNotebookTickets()` — overdue notebook-acknowledgement tickets + escalation |
| `startThresholdTicketWorker()` | `THRESHOLD_TICKET_WORKER_INTERVAL_MS` (15 min) | 8s after boot | Runs, in order: `runPpBatchCompletionCheck()` (PP batch incomplete tickets), `runSubmissionFrequencyCheck()` (missed-submission tickets), `runSubmissionFrequencyTatCheck()` (submission-frequency TAT escalation), `runPpApprovalTatCheck()` (PP approval → L5 escalation), `runWheelChangeApprovalTatCheck()` (wheel-change approval → L5 escalation) |

Each worker step is individually try/caught and logged (`console.warn`) so one failing check doesn't block the others in the same tick.

---

## 9. External Integrations

| System | Purpose | Access pattern |
|---|---|---|
| **SQL Server ERP** (`VAAHINI_DHARANIDARA_ERP`, `config/sqlserver.js`) | Master/dropdown data the mill's ERP already owns — variety, prep, machine master, employee master | Read-only; connection lazily created (`getPool()`), pooled via `mssql`; `server.js`'s error handler gives a clear 403 + exact `GRANT SELECT` statement on a permission error |
| **Supabase mirror** (optional second Postgres instance) | Redundant dual-write for disaster-recovery/migration purposes | Only active when `DATABASE_URL_SUPABASE` differs from the primary target; mirrors every mutating statement including transactions; force-disable via `SUPABASE_MIRROR_ENABLED=false`. Manual bulk sync: `npm run sync:supabase:postgres` / `sync:postgres:supabase` |
| **OCR pipeline** (`ocr_service/run_ocr_pipeline.py`) | Extracts structured fields from scanned machine reports | Spawned as a local child process from `ocrMachine.routes.js`, governed by `OCR_LOCAL_TIMEOUT_MS`/`OCR_STREAM_TIMEOUT_MS`/`OCR_PYTHON_PATH` |
| **Email** (`email.js`) | OTP delivery, scheduled report delivery | Provider selectable via `REPORT_EMAIL_PROVIDER` (nodemailer or Resend/`RESEND_API_KEY`) |

---

## 10. Configuration Reference (environment variables)

Grouped by concern (see `.env.example` for the authoritative list):

**Server**: `PORT` (default 4000), `SERVER_URL`, `CORS_ORIGINS` (comma-separated allowlist; supports `*.suffix` wildcards; empty = permissive).

**Primary database (Postgres)**: `DB_TARGET` (`supabase` | `local` | unset), `DATABASE_URL`, `DATABASE_URL_LOCAL`, `DATABASE_URL_SUPABASE`, or discrete `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_PORT`/`DB_NAME`/`DB_SSL`; pool tuning: `DB_POOL_MAX`/`DB_POOL_MIN`/`DB_IDLE_TIMEOUT_MS`/`DB_CONNECT_TIMEOUT_MS`/`DB_STATEMENT_TIMEOUT_MS`/`DB_POOL_MAX_USES`; retry tuning: `DB_QUERY_RETRY_ATTEMPTS`/`DB_QUERY_RETRY_DELAY_MS`. Mirror: `SUPABASE_MIRROR_ENABLED`, `SUPABASE_MIRROR_*` (same pool-tuning suffixes).

**Secondary database (SQL Server)**: `MSSQL_HOST`/`MSSQL_PORT`/`MSSQL_USER`/`MSSQL_PASSWORD`/`MSSQL_DATABASE`/`MSSQL_PREP_DATABASE`, `MSSQL_ENCRYPT`, `MSSQL_TRUST_SERVER_CERT`, `MSSQL_POOL_MAX`/`MSSQL_POOL_IDLE_MS`, `MSSQL_CONNECT_TIMEOUT_MS`/`MSSQL_REQUEST_TIMEOUT_MS`.

**Auth**: `JWT_SECRET`, `JWT_EXPIRES_IN`, `ADMIN_USERNAME`/`ADMIN_PASSWORD`/`ADMIN_PASSWORD_HASH`/`ADMIN_JWT_SECRET`, `OTP_SECRET`.

**OCR**: `OCR_PYTHON_PATH`, `OCR_UPSTREAM_TIMEOUT_MS`, `OCR_LOCAL_TIMEOUT_MS`, `OCR_STREAM_TIMEOUT_MS`.

**Reporting/email**: `REPORT_SCHEDULE_WORKER_ENABLED`, `REPORT_SCHEDULE_INTERVAL_MS`, `REPORT_SCHEDULE_TIMEZONE`, `REPORT_EMAIL_PROVIDER`, `RESEND_API_KEY`, `REPORT_SENDER_NAME`, `REPORT_FROM_EMAIL`.

**Workers**: `NOTEBOOK_ACK_WORKER_INTERVAL_MS`, `THRESHOLD_TICKET_WORKER_INTERVAL_MS`.

**Misc**: `HOSTINGER_API_KEY`, `HOSTINGER_VM_ID` (deployment host, referenced but not detailed in code sampled here).

⚠️ `.env` is present in the working tree and contains live credentials (DB, SQL Server, admin password). It is excluded from this documentation's content by design — never commit or paste its contents.

---

## 11. Related Documentation

- [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md) — full database schema reference (this backend's companion doc)
- [`ticket-workflow.md`](./ticket-workflow.md) — step-by-step ticket workflow with request/response payload examples
- `docs/api/*.docx` — per-module API documentation (one file per route module: Login, User, Roles, Screens, Department, Operator Tickets, Supervisor Tickets, Dashboard, Analysis, Activity Logs, Help Content, In-App Notifications, Report Schedules, Submitted Notebooks, Supervisor Assignments, OCR Machine, Trials, Auto Ticket Helper, and all 8 department files)
- Swagger/OpenAPI UI — `GET /api-docs` on a running instance (generated from JSDoc annotations in `routes/*.js` via `swaggerConfig.js`)

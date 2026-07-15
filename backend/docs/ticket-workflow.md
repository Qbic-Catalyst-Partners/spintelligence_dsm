# Ticket Workflow (End-to-End)

## 1) Setup DB Columns in `operator_tickets`
```sql
ALTER TABLE ticketing_system.operator_tickets
  ADD COLUMN IF NOT EXISTS management_field varchar(100),
  ADD COLUMN IF NOT EXISTS erp_product_code varchar(100),
  ADD COLUMN IF NOT EXISTS ticket_reason varchar(30), -- MISSING_VALUE / THRESHOLD_BREACH / BOTH
  ADD COLUMN IF NOT EXISTS violation_details jsonb;
```

## 2) Create/Alter Threshold Master Table (UI-Aligned)
```sql
CREATE TABLE IF NOT EXISTS ticketing_system.threshold_master (
  id bigserial PRIMARY KEY,
  department varchar(100) NOT NULL,
  sub_department varchar(100) NOT NULL,
  input_screen varchar(150) NOT NULL,
  machine_name varchar(100) NOT NULL,
  input_field varchar(100) NOT NULL,
  condition_level varchar(30) NOT NULL DEFAULT 'More Than', -- More Than / Less Than / More and Less Than
  plus_threshold numeric,
  minus_threshold numeric,
  actual_value varchar(100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (department, sub_department, input_screen, machine_name, input_field)
);
```

If table already exists in old shape:
```sql
ALTER TABLE ticketing_system.threshold_master
  ADD COLUMN IF NOT EXISTS department varchar(100),
  ADD COLUMN IF NOT EXISTS sub_department varchar(100),
  ADD COLUMN IF NOT EXISTS input_screen varchar(150),
  ADD COLUMN IF NOT EXISTS input_field varchar(100),
  ADD COLUMN IF NOT EXISTS condition_level varchar(30) DEFAULT 'More Than',
  ADD COLUMN IF NOT EXISTS plus_threshold numeric,
  ADD COLUMN IF NOT EXISTS minus_threshold numeric,
  ADD COLUMN IF NOT EXISTS actual_value varchar(100);
```

Multi-select approvers:
```sql
CREATE TABLE IF NOT EXISTS ticketing_system.threshold_master_l1_approvers (
  id bigserial PRIMARY KEY,
  threshold_master_id bigint NOT NULL REFERENCES ticketing_system.threshold_master(id) ON DELETE CASCADE,
  approver_user_id integer NOT NULL REFERENCES users.user_details(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (threshold_master_id, approver_user_id)
);

CREATE TABLE IF NOT EXISTS ticketing_system.threshold_master_l2_approvers (
  id bigserial PRIMARY KEY,
  threshold_master_id bigint NOT NULL REFERENCES ticketing_system.threshold_master(id) ON DELETE CASCADE,
  approver_user_id integer NOT NULL REFERENCES users.user_details(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (threshold_master_id, approver_user_id)
);
```

## 3) Load/Update Thresholds (Admin/ERP)
`POST /operator-tickets/thresholds/list`
```json
{
  "department": "Quality Control",
  "sub_department": "Mixing",
  "input_screen": "Cotton HVI Data Entry",
  "machine_name": "Ringframe R-8",
  "input_field": "SCI",
  "condition_level": "More Than",
  "plus_threshold": 5,
  "minus_threshold": 5,
  "actual_value": 135,
  "approval_l1_user_ids": [11, 14],
  "approval_l2_user_ids": [21, 25],
  "is_active": true
}
```

### Bulk Load/Update Thresholds
`POST /operator-tickets/thresholds/bulk`
```json
{
  "thresholds": [
    {
      "department": "Quality Control",
      "sub_department": "Mixing",
      "input_screen": "Cotton HVI Data Entry",
      "machine_name": "Ringframe R-8",
      "input_field": "SCI",
      "condition_level": "More Than",
      "plus_threshold": 5,
      "minus_threshold": 5,
      "actual_value": 135,
      "approval_l1_user_ids": [11, 14],
      "approval_l2_user_ids": [21, 25],
      "is_active": true
    }
  ]
}
```

### CSV Upload Thresholds
`POST /operator-tickets/thresholds/upload-csv` with `multipart/form-data`
- file field name: `file`
- supported headers:
`department,sub_department,input_screen,machine_name,input_field,condition_level,plus_threshold,minus_threshold,actual_value,approval_l1_user_ids,approval_l2_user_ids,is_active`

Sample CSV:
```csv
department,sub_department,input_screen,machine_name,input_field,condition_level,plus_threshold,minus_threshold,actual_value,is_active
Quality Control,Mixing,Cotton HVI Data Entry,Ringframe R-8,SCI,More Than,5,5,135,"11,14","21,25",true
Quality Control,Mixing,Cotton HVI Data Entry,Ringframe R-8,UHM,Less Than,2,2,30,"11,14","21,25",true
Quality Control,Mixing,Cotton HVI Data Entry,Ringframe R-8,Moisture,More and Less Than,5,5,135,"11,14","21,25",true
```

## 4) Generate Ticket from ERP Actual Values
### Single
`POST /operator-tickets`
```json
{
  "user_id": 12,
  "machine_name": "Ringframe R-8",
  "parameter_name": ["Temperature", "Speed"],
  "actual_value": { "Temperature": null, "Speed": 1200 },
  "severity": "High",
  "department": "Quality Control",
  "sub_department": "Mixing",
  "input_screen": "Cotton HVI Data Entry"
}
```

### Bulk
`POST /operator-tickets/generate`
```json
{
  "tickets": [
    {
      "user_id": 12,
      "machine_name": "Ringframe R-8",
      "parameter_name": ["Temperature", "Speed"],
      "actual_value": { "Temperature": null, "Speed": 1200 },
      "severity": "High",
      "department": "Quality Control",
      "sub_department": "Mixing",
      "input_screen": "Cotton HVI Data Entry"
    }
  ]
}
```

Notes:
- Ticket is created only if violation exists.
- `ticket_reason` is auto-set to `MISSING_VALUE`, `THRESHOLD_BREACH`, or `BOTH`.
- `violation_details` stores missing fields and threshold breach details.

## 5) Assign Ticket to User (if needed)
`PUT /operator-tickets/{ticket_id}/assign`
```json
{
  "user_id": 15
}
```

## 6) Submit for Supervisor Review
`PUT /operator-tickets/submit/{ticket_id}`

Status moves:
- `Open` -> `Pending Approval`

## 7) Supervisor Decision
### Approve
`PATCH /api/supervisor-tickets/tickets/approve?ticketId={ticket_id}`
- Status becomes `Closed`

### Reject
`PATCH /api/supervisor-tickets/tickets/reject?ticketId={ticket_id}`
- Status becomes `Reopened`

## 8) Workflow Guide Endpoint
Use this to fetch workflow steps from API:
- `GET /operator-tickets/workflow/guide`

## 9) PP Notebook Batch-Completion Worker

A PP (Process Parameter) batch is one shared `entry_id` (e.g. `PP-0042`) that
gets filled in piecemeal across up to 10 different department screens as the
batch moves through the mill. The unit being checked is **the batch**, not any
one screen: the clock starts the moment *any* department first creates that
entry_id, and the batch is "late" if it isn't fully filled in across all
required screens within a configurable number of hours from that moment.

Earlier drafts of this worker checked "has screen X gone quiet" per screen,
independently. That was wrong — a screen can go quiet forever if its batches
just aren't being created, and it says nothing about whether an *in-flight*
batch is stuck. The model below replaces that entirely.

**Roles**: there is no L3 here. **L1** is whoever is responsible for actually
completing the batch (filling in all 10 screens) within `completion_threshold_hours`.
**L2** is whoever reviews/approves once L1 has missed that deadline — the
ticket only ever exists because L1 is already late, so it's raised "in L1's
name" (L1 stays attributed on the ticket and gets notified) and goes straight
to L2 for approval that the batch has since been completed. Both `approval_l1_user_ids`
and `approval_l2_user_ids` are multi-select arrays of user ids.

**What it does**
- Reads the single global config row in `ticketing_system.pp_notebook_batch_config`
  (`config_key = 'global'`). If `is_active = false`, the worker no-ops.
- Groups `ticketing_system.submitted_notebooks` by `entry_id` and computes, per
  entry_id, `MIN(submitted_at)` (when the batch was first touched, by whichever
  department got there first) and the distinct set of screens that have logged
  a submission for it. Only entry_ids from the last 30 days are considered (see
  `PP_BATCH_LOOKBACK_DAYS` in `submittedNotebooks.routes.js`) — older incomplete
  batches either already have a ticket or predate this feature.
- For each entry_id where `now - first_created_at > completion_threshold_hours`
  and at least one of the 10 required screens (`PP_REQUIRED_NOTEBOOKS`) hasn't
  logged a submission yet, and no ticket already exists for that entry_id, it
  opens **one** ticket for the whole batch listing everything still missing:
  `ticket_reason = 'MISSING_VALUE'`, `violation_details.category = 'MISSED_FREQUENCY'`,
  `violation_details.ticket_type = 'PP_BATCH_INCOMPLETE'`,
  `violation_details.entry_id = <the entry_id>`, `violation_details.missing_screens = [...]`.
  It's created directly `status = 'In Progress'`, `tat_current_level = 'L2'` —
  there's no separate L1 TAT wait, since the ticket's existence already means
  L1's window has passed. `approval_l1_user_ids` and `approval_l2_user_ids` are
  both set on the ticket, and both groups get notified (L1: "you missed this,
  it's escalated"; L2: "please review"). A partial unique index on
  `violation_details->>'entry_id'` (scoped to this ticket_type) guarantees only
  one such ticket ever exists per entry_id, even under concurrent worker runs.
- Immediately after, it calls `runPpNotebookBatchTatCheck()`, which expires
  (`status = 'No Due'`, `tat_current_level = 'EXPIRED_L2'`) any ticket L2
  hasn't acted on within `l2_tat_hours` of the ticket's `created_at`. If
  `l2_tat_hours` isn't set, tickets just stay open at L2 until manually closed.

**The 10 required screens** (hardcoded in `PP_REQUIRED_NOTEBOOKS`, `submittedNotebooks.routes.js`):
Spinning QC Header, Carding QC Header, Blowroom Header, Drawframe QC Header,
Drawframe Finisher Drawing Inspection, Mixing QC Header, Simplex Process
Parameter, Autoconer Process Parameter, Autoconer Q2 Inspection, Autoconer Q3
Inspection — these are exactly the `notebook` values `recordPpNotebookSubmission()`
logs from each department screen's route (spinning.js, carding.js, blowroom.js,
drawframe.js, mixing.js, simplex.js, autoconer.js), fire-and-forget right after
each screen's own INSERT succeeds, into `ticketing_system.submitted_notebooks`
with `status = 'LOGGED'` — deliberately not the default `'PENDING_ACK'`, so
these rows stay invisible to the unrelated `generateOverdueNotebookTickets`
acknowledgement worker.

**Autoconer Q2/Q3 exception**: a given Autoconer machine is either Q2-type or
Q3-type, never both, so a real batch will only ever get a genuine submission
for one of the two. `recordPpNotebookSubmission()` handles this with a
companion auto-log (`AUTOCONER_Q2_Q3_COMPANION` in `submittedNotebooks.routes.js`):
the moment Q2 is submitted for an entry_id, Q3 is automatically logged too
(`submitted_payload = { value: 0, auto_submitted: true }`), and vice versa —
using the exact `notebook_submission_id` the real screen would use, so if a
genuine submission for the other one ever does arrive later, it just updates
that same row instead of creating a duplicate. Net effect: completing either
Q2 or Q3 satisfies both slots in `PP_REQUIRED_NOTEBOOKS` — no special-casing
needed in the missing-screens calculation itself.

**Tables**
- Reads: `ticketing_system.submitted_notebooks`, `ticketing_system.pp_notebook_batch_config`.
- Writes: `ticketing_system.operator_tickets`, `ticketing_system.ticket_logs`,
  `ticketing_system.notifications` (via `createNotificationsForUsers`).

**Interval / env var**
- Runs every `PP_NOTEBOOK_TAT_WORKER_INTERVAL_MS` (default `900000` = 15 minutes),
  started from `server.js` the same way as `startSubmittedNotebookAckWorker`.
  Hour-granularity thresholds don't need tighter polling than that.

**Configuring the global threshold**
`POST /submitted-notebooks/pp-batch-config`
```json
{
  "completion_threshold_hours": 24,
  "l2_tat_hours": 12,
  "approval_l1_user_ids": [11, 14],
  "approval_l2_user_ids": [21, 25],
  "is_active": true
}
```
`GET /submitted-notebooks/pp-batch-config` returns the current (single) row.
There is only ever one config — it's global by design, not per-screen or
per-department, since the batch spans departments. `approval_l1_user_ids` /
`approval_l2_user_ids` are plain arrays of `users.user_details.id` — multi-select,
not a single approver. If either is left empty, ticket creation falls back to
the default users at that `level` (same fallback `getApproverIdsByLevel` uses
elsewhere in this file).

**Sub-department / notebook overview (read-only)**

`GET /submitted-notebooks/pp-batch-config` also returns a `sub_departments`
array alongside `config`, for the admin threshold page to show what's actually
being tracked and how recently each one was touched:

```json
{
  "config": { "...": "..." },
  "sub_departments": [
    { "sub_department": "Mixing", "notebooks": [
      { "notebook": "Mixing QC Header", "label": "Mixing QC Header",
        "last_saved_entry": { "entry_id": "PP-0042", "submitted_at": "...", "submitted_by_name": "..." } }
    ] },
    { "sub_department": "Drawframe", "notebooks": [
      { "notebook": "Drawframe QC Header", "label": "PP-Breaker", "last_saved_entry": { "...": "..." } },
      { "notebook": "Drawframe Finisher Drawing Inspection", "label": "PP-Finisher", "last_saved_entry": null }
    ] },
    { "sub_department": "Autoconer", "notebooks": [
      { "notebook": "Autoconer Process Parameter", "label": "Autoconer Process Parameter", "last_saved_entry": { "...": "..." } },
      { "notebook": "Autoconer Q2 Inspection", "label": "Autoconer Q2 Inspection", "last_saved_entry": { "...": "..." } },
      { "notebook": "Autoconer Q3 Inspection", "label": "Autoconer Q3 Inspection", "last_saved_entry": { "...": "..." } }
    ] }
  ]
}
```

All 7 sub-departments (Mixing, Carding, Blowroom, Drawframe, Simplex, Spinning,
Autoconer — `PP_SUB_DEPARTMENTS` in `submittedNotebooks.routes.js`) are always
present; only Drawframe (2 notebooks) and Autoconer (3 notebooks) have more
than one entry in their `notebooks` array — everyone else has exactly one.
`label` is a display-only name (`PP-Breaker` / `PP-Finisher` for Drawframe);
the `notebook` value is the real, unchanged identifier already used everywhere
else (`PP_REQUIRED_NOTEBOOKS`, `recordPpNotebookSubmission`, the completeness
check) — renaming that string would silently break matching against every
submission already logged under the old name, so it's intentionally left alone.
`last_saved_entry` is simply the newest row in `submitted_notebooks` for that
notebook (`null` if nothing has ever been logged) — it's independent of any
one batch/entry_id and purely for at-a-glance monitoring; it has no effect on
ticket creation or escalation.

**Manually triggering for testing**
- Full check (creates tickets for overdue batches, then escalates): `POST /submitted-notebooks/pp-batch-completion-check`

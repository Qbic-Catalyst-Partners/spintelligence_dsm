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

const express = require('express');
const router = express.Router();
const client = require('../connection');
const auth = require('../middleware/auth');
const { createNotificationsForUsers, ensureNotificationMetadataColumns } = require('../utils/notifications');
const { getManagerChain } = require('./user.routes');

const MAX_LIMIT = 100;
const ACK_DEADLINE_HOURS = 24;

const parsePositiveInt = (value, fallback = null) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const cleanText = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

const toJson = (value, fallback = null) => JSON.stringify(value === undefined ? fallback : value);

// operator_tickets' approval_lX_user_ids / lX_tat_due_at columns are also
// migrated by operatorTickets.routes.js and supervisorTickets.routes.js -
// this file references them (l2/l3/l4/l5_tat_due_at, approval_l1-l5_user_ids)
// without ever having run its own copy of that migration, relying entirely
// on one of those other files' routes having already been hit first. That's
// fragile even for the pre-existing L1-L3 columns; ensure them here too so
// this file's own endpoints (PP batch completion check in particular) work
// standalone.
let ticketApprovalColumnsEnsured = false;
const ensureTicketApprovalColumnsForBatchCheck = async () => {
  if (ticketApprovalColumnsEnsured) return;
  await client.query(`
    ALTER TABLE ticketing_system.operator_tickets
      ADD COLUMN IF NOT EXISTS approval_l1_user_ids integer[] NULL,
      ADD COLUMN IF NOT EXISTS approval_l2_user_ids integer[] NULL,
      ADD COLUMN IF NOT EXISTS approval_l3_user_ids integer[] NULL,
      ADD COLUMN IF NOT EXISTS approval_l4_user_ids integer[] NULL,
      ADD COLUMN IF NOT EXISTS approval_l5_user_ids integer[] NULL,
      ADD COLUMN IF NOT EXISTS tat_current_level text NULL,
      ADD COLUMN IF NOT EXISTS l1_tat_due_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS l2_tat_due_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS l3_tat_due_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS l4_tat_due_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS l5_tat_due_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS ticket_type varchar(50) NULL
  `);
  // PP_BATCH_INCOMPLETE used to file one ticket per PP id; a leftover unique
  // index from that model (entry_id alone) now conflicts with the current
  // one-ticket-per-missing-notebook design (see runPpBatchCompletionCheck),
  // which needs several open tickets sharing the same entry_id at once.
  await client.query(`DROP INDEX IF EXISTS ticketing_system.operator_tickets_pp_batch_entry_id_uq`);
  ticketApprovalColumnsEnsured = true;
};

const parseTatHours = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const getUserDisplayName = async (userId) => {
  if (!userId) return null;
  const result = await client.query(
    `SELECT full_name FROM users.user_details WHERE id = $1`,
    [userId]
  );
  return result.rows[0]?.full_name || null;
};

const toArray = (value) => {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (_) {
        return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
      }
    }
    return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [value];
};

const getApproverIdsByLevel = async (providedValues = [], { level = 'L2', useDefault = true } = {}) => {
  const normalizedLevel = String(level || 'L2').trim().toUpperCase();
  const values = toArray(providedValues);
  const numericIds = values
    .map((item) => typeof item === 'object' && item !== null ? item.id ?? item.user_id ?? item.value : item)
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  const employeeCodes = values
    .map((item) => typeof item === 'object' && item !== null ? item.employee_id ?? item.employeeId ?? item.code ?? item.value : item)
    .map((item) => String(item || '').trim())
    .filter((item) => item && !Number.isInteger(Number(item)));

  let resolvedCodeIds = [];
  if (employeeCodes.length) {
    const result = await client.query(
      `SELECT id
       FROM users.user_details
       WHERE UPPER(TRIM(employee_id)) = ANY($1::text[])
       ORDER BY id`,
      [employeeCodes.map((code) => code.toUpperCase())]
    );
    resolvedCodeIds = result.rows.map((row) => Number(row.id));
  }

  const explicit = Array.from(new Set([...numericIds, ...resolvedCodeIds]));
  if (explicit.length) return explicit;
  if (!useDefault) return [];

  const result = await client.query(
    `SELECT id
     FROM users.user_details
     WHERE UPPER(COALESCE(level, '')) = $1
     ORDER BY id ASC
     LIMIT 20`
    ,
    [normalizedLevel]
  );
  const levelDefaults = result.rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
  if (levelDefaults.length) return levelDefaults;

  if (normalizedLevel === 'L2') {
    const sup001 = await client.query(
      `SELECT id
       FROM users.user_details
       WHERE UPPER(TRIM(employee_id)) = 'SUP001'
       LIMIT 1`
    );
    if (sup001.rows[0]?.id) return [Number(sup001.rows[0].id)];
  }

  return [];
};

const getL2ApproverIds = (providedValues = [], options = {}) =>
  getApproverIdsByLevel(providedValues, { ...options, level: 'L2' });

const getL3ApproverIds = (providedValues = [], options = {}) =>
  getApproverIdsByLevel(providedValues, { ...options, level: 'L3' });

const getL1ApproverIds = (providedValues = [], options = {}) =>
  getApproverIdsByLevel(providedValues, { ...options, level: 'L1' });

const getL4ApproverIds = (providedValues = [], options = {}) =>
  getApproverIdsByLevel(providedValues, { ...options, level: 'L4' });

const getL5ApproverIds = (providedValues = [], options = {}) =>
  getApproverIdsByLevel(providedValues, { ...options, level: 'L5' });

// Employee-Hierarchy-and-Workflow-System_V2.pdf: the Acknowledgement
// Threshold (and, per the same principle, every other threshold's
// escalation) is "automatically assigned to the reporting L2 manager of each
// L1 user - no manual selection required". Resolves the submitting user's
// real reports_to_user_id chain (see getManagerChain in user.routes.js)
// into per-level approver-id arrays; falls back to the old
// department-default lookup only for a level the chain doesn't reach (e.g.
// the submitter hasn't been assigned a manager yet, or their chain doesn't
// go all the way to L5).
const resolveEscalationChainForSubmitter = async (submitterUserId) => {
  const chain = submitterUserId ? await getManagerChain(submitterUserId) : [];
  const byLevel = new Map(chain.map((manager) => [manager.level, manager.id]));

  const [l2Default, l3Default, l4Default, l5Default] = await Promise.all([
    byLevel.has('L2') ? null : getL2ApproverIds([], { useDefault: true }),
    byLevel.has('L3') ? null : getL3ApproverIds([], { useDefault: true }),
    byLevel.has('L4') ? null : getL4ApproverIds([], { useDefault: true }),
    byLevel.has('L5') ? null : getL5ApproverIds([], { useDefault: true }),
  ]);

  return {
    l2: byLevel.has('L2') ? [byLevel.get('L2')] : l2Default,
    l3: byLevel.has('L3') ? [byLevel.get('L3')] : l3Default,
    l4: byLevel.has('L4') ? [byLevel.get('L4')] : l4Default,
    l5: byLevel.has('L5') ? [byLevel.get('L5')] : l5Default,
  };
};

// Same idea as resolveEscalationChainForSubmitter, but for tickets that
// aren't tied to one specific submitter - PP Batch Incomplete tickets are
// filed against whichever L1 user(s) are configured as responsible for a
// department (there's no "the person who should have submitted" on record,
// only candidates), so this unions each of their real manager chains
// per level instead of resolving just one person's chain. Falls back to the
// department-default lookup for any level none of the candidates reach.
const resolveUnionEscalationChain = async (l1UserIds = [], fallback = {}) => {
  const uniqueIds = Array.from(new Set((l1UserIds || []).filter(Boolean)));
  const chains = await Promise.all(uniqueIds.map((id) => getManagerChain(id)));

  const byLevel = { L2: new Set(), L3: new Set(), L4: new Set(), L5: new Set() };
  chains.forEach((chain) => {
    chain.forEach((manager) => {
      if (byLevel[manager.level]) byLevel[manager.level].add(manager.id);
    });
  });

  const [l2Default, l3Default, l4Default, l5Default] = await Promise.all([
    byLevel.L2.size ? null : (fallback.l2 && fallback.l2.length ? fallback.l2 : getL2ApproverIds([], { useDefault: true })),
    byLevel.L3.size ? null : (fallback.l3 && fallback.l3.length ? fallback.l3 : getL3ApproverIds([], { useDefault: true })),
    byLevel.L4.size ? null : (fallback.l4 && fallback.l4.length ? fallback.l4 : getL4ApproverIds([], { useDefault: true })),
    byLevel.L5.size ? null : (fallback.l5 && fallback.l5.length ? fallback.l5 : getL5ApproverIds([], { useDefault: true })),
  ]);

  return {
    l2: byLevel.L2.size ? Array.from(byLevel.L2) : l2Default,
    l3: byLevel.L3.size ? Array.from(byLevel.L3) : l3Default,
    l4: byLevel.L4.size ? Array.from(byLevel.L4) : l4Default,
    l5: byLevel.L5.size ? Array.from(byLevel.L5) : l5Default,
  };
};

// The 7 sub-departments / 10 notebooks tracked by PP Batch Completion, and the
// underlying table each notebook's submissions actually land in. entry_id here
// is the shared "PP-000N" id stamped across every department's PP screen —
// a batch is "complete" once all 10 of these have a row for the same entry_id.
const PP_BATCH_NOTEBOOKS = [
  { sub_department: 'Mixing', notebook: 'Mixing QC Header', label: 'Mixing Process Parameter', schema: 'mixing', table: 'mixing_qc_header', hasOperator: true },
  { sub_department: 'Carding', notebook: 'Carding QC Header', label: 'Carding Process Parameter', schema: 'carding', table: 'carding_qc_header', hasOperator: false },
  { sub_department: 'Blowroom', notebook: 'Blowroom Header', label: 'Blowroom Process Parameter', schema: 'blowroom', table: 'blowroom_header', hasOperator: false },
  // Breaker and Finisher both save into this same table (POST /drawframe/header,
  // told apart by entry_scope) - drawframe.finisher_drawing_inspection is a dead
  // table with no frontend caller (its API functions in apis/draw-frame.js are
  // never imported anywhere), so checking it here always read as "never
  // submitted" even when Finisher genuinely was. Both rows need their own
  // entry_scope filter, or either one alone would satisfy both labels.
  { sub_department: 'Drawframe', notebook: 'Drawframe QC Header', label: 'Drawframe Process Parameter (Breaker)', schema: 'drawframe', table: 'drawframe_qc_header', hasOperator: true, extraWhere: "AND entry_scope = 'breaker'" },
  { sub_department: 'Drawframe', notebook: 'Drawframe QC Header', label: 'Drawframe Process Parameter (Finisher)', schema: 'drawframe', table: 'drawframe_qc_header', hasOperator: false, extraWhere: "AND entry_scope = 'finisher'" },
  { sub_department: 'Simplex', notebook: 'Simplex Process Parameter', label: 'Simplex Process Parameter', schema: 'simplex', table: 'simplex_process_parameter', hasOperator: false },
  { sub_department: 'Spinning', notebook: 'Spinning QC Header', label: 'Spinning Process Parameter', schema: 'spinning', table: 'spinning_qc_header', hasOperator: false },
  { sub_department: 'Autoconer', notebook: 'Autoconer Process Parameter', label: 'Autoconer Process Parameter', schema: 'autoconer', table: 'autoconer_process_parameter', hasOperator: false },
  { sub_department: 'Autoconer', notebook: 'Autoconer Q2 Inspection', label: 'Autoconer Process Parameter (Q2)', schema: 'autoconer', table: 'autoconer_q2_inspection', hasOperator: false },
  { sub_department: 'Autoconer', notebook: 'Autoconer Q3 Inspection', label: 'Autoconer Process Parameter (Q3)', schema: 'autoconer', table: 'autoconer_q3_inspection', hasOperator: false },
  { sub_department: 'Autoconer', notebook: 'Autoconer Q4 Inspection', label: 'Autoconer Process Parameter (Q4)', schema: 'autoconer', table: 'autoconer_q4_inspection', hasOperator: false }
];

const ensurePpBatchConfigTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.pp_batch_config (
      config_key TEXT PRIMARY KEY DEFAULT 'global',
      completion_threshold_hours INTEGER NOT NULL DEFAULT 24,
      l2_tat_hours INTEGER NULL,
      approval_l1_user_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      approval_l2_user_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      is_active BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // L3/L4/L5 escalation tiers - a PP_BATCH_INCOMPLETE ticket escalates
  // L2 -> L3 -> L4 -> L5 as each tier's TAT elapses (see
  // escalatePpBatchTickets below), mirroring the existing L2 step.
  await client.query(`
    ALTER TABLE ticketing_system.pp_batch_config
      ADD COLUMN IF NOT EXISTS l3_tat_hours INTEGER NULL,
      ADD COLUMN IF NOT EXISTS l4_tat_hours INTEGER NULL,
      ADD COLUMN IF NOT EXISTS l5_tat_hours INTEGER NULL,
      ADD COLUMN IF NOT EXISTS approval_l3_user_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      ADD COLUMN IF NOT EXISTS approval_l4_user_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      ADD COLUMN IF NOT EXISTS approval_l5_user_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[]
  `);
};

// Per-PDF spec: PP Threshold config is "Multiple Sub-Department Rows: each
// participating sub-department is listed as a separate row... each with its
// own individual TAT", timed from the first department's submission - not
// one global TAT shared by every department. This table holds that per-row
// override; pp_batch_config.completion_threshold_hours remains the fallback
// for any sub-department without its own row.
const ensurePpBatchSubDepartmentConfigTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.pp_batch_sub_department_config (
      sub_department TEXT PRIMARY KEY,
      completion_threshold_hours INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

const getPpBatchSubDepartmentThresholds = async () => {
  await ensurePpBatchSubDepartmentConfigTable();
  const result = await client.query(
    `SELECT sub_department, completion_threshold_hours, updated_at
     FROM ticketing_system.pp_batch_sub_department_config`
  );
  const bySubDepartment = new Map();
  for (const row of result.rows) {
    bySubDepartment.set(row.sub_department, Number(row.completion_threshold_hours));
  }
  return bySubDepartment;
};

const PP_BATCH_LABEL_TO_SUB_DEPARTMENT = PP_BATCH_NOTEBOOKS.reduce((map, notebookConfig) => {
  map[notebookConfig.label] = notebookConfig.sub_department;
  return map;
}, {});

// Finest-grained PP Threshold config: per-notebook TAT plus the specific L1
// user(s) responsible and L2 escalation approver(s) for that notebook -
// overrides the per-sub-department TAT and the global candidate pool when
// set for a given notebook. Falls back to sub-department, then global, when
// a notebook has no row (or is inactive).
const ensurePpNotebookThresholdTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.pp_notebook_threshold (
      id BIGSERIAL PRIMARY KEY,
      notebook_label TEXT UNIQUE NOT NULL,
      completion_threshold_hours INTEGER NOT NULL,
      approval_l1_user_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      approval_l2_user_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Combined PP Threshold + PP Approval config per notebook: department/
  // sub_department are informational (filters on the config screen),
  // severity tags the raised ticket, and approval_l4_user_ids/
  // approve_within_hours drive the PP Approval ticket (createPpApprovalTicket
  // in processParameters.js) when this notebook's department is the one that
  // completes a shared PP entry_id last.
  await client.query(`
    ALTER TABLE ticketing_system.pp_notebook_threshold
      ADD COLUMN IF NOT EXISTS department TEXT NULL,
      ADD COLUMN IF NOT EXISTS sub_department TEXT NULL,
      ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'High',
      ADD COLUMN IF NOT EXISTS approval_l4_user_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      ADD COLUMN IF NOT EXISTS approve_within_hours INTEGER NULL
  `);
  // Notebook labels were renamed to "X Process Parameter" style - carry any
  // already-configured rows (saved under the old labels) over to the new
  // ones so they don't silently become invisible/orphaned.
  const LEGACY_LABEL_RENAMES = {
    'Mixing QC Header': 'Mixing Process Parameter',
    'Carding QC Header': 'Carding Process Parameter',
    'Blowroom Header': 'Blowroom Process Parameter',
    'PP-Breaker': 'Drawframe Process Parameter (Breaker)',
    'PP-Finisher': 'Drawframe Process Parameter (Finisher)',
    'Spinning QC Header': 'Spinning Process Parameter',
    'Autoconer Q2 Inspection': 'Autoconer Process Parameter (Q2)',
    'Autoconer Q3 Inspection': 'Autoconer Process Parameter (Q3)',
    'Autoconer Q4 Inspection': 'Autoconer Process Parameter (Q4)',
  };
  for (const [oldLabel, newLabel] of Object.entries(LEGACY_LABEL_RENAMES)) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `UPDATE ticketing_system.pp_notebook_threshold SET notebook_label = $2, updated_at = NOW()
       WHERE notebook_label = $1
         AND NOT EXISTS (SELECT 1 FROM ticketing_system.pp_notebook_threshold WHERE notebook_label = $2)`,
      [oldLabel, newLabel]
    );
  }
};

const getPpNotebookThresholds = async () => {
  await ensurePpNotebookThresholdTable();
  const result = await client.query(
    `SELECT * FROM ticketing_system.pp_notebook_threshold WHERE is_active = true`
  );
  const byLabel = new Map();
  for (const row of result.rows) {
    byLabel.set(row.notebook_label, row);
  }
  return byLabel;
};

const getPpBatchConfig = async () => {
  await ensurePpBatchConfigTable();
  const result = await client.query(
    `SELECT * FROM ticketing_system.pp_batch_config WHERE config_key = 'global'`
  );
  return result.rows[0] || {
    config_key: 'global',
    completion_threshold_hours: 24,
    l2_tat_hours: null,
    l3_tat_hours: null,
    l4_tat_hours: null,
    l5_tat_hours: null,
    approval_l1_user_ids: [],
    approval_l2_user_ids: [],
    approval_l3_user_ids: [],
    approval_l4_user_ids: [],
    approval_l5_user_ids: [],
    is_active: true,
    updated_at: null
  };
};

const getPpBatchSubDepartments = async () => {
  const bySubDepartment = new Map();

  for (const notebookConfig of PP_BATCH_NOTEBOOKS) {
    const operatorColumn = notebookConfig.hasOperator ? 'operator' : 'NULL';
    const result = await client.query(
      `SELECT entry_id, created_at, ${operatorColumn} AS submitted_by_name
       FROM ${notebookConfig.schema}.${notebookConfig.table}
       WHERE entry_id IS NOT NULL AND TRIM(entry_id) <> ''
       ORDER BY created_at DESC
       LIMIT 1`
    );
    const lastRow = result.rows[0] || null;

    if (!bySubDepartment.has(notebookConfig.sub_department)) {
      bySubDepartment.set(notebookConfig.sub_department, []);
    }
    bySubDepartment.get(notebookConfig.sub_department).push({
      notebook: notebookConfig.notebook,
      label: notebookConfig.label,
      last_saved_entry: lastRow
        ? {
            entry_id: lastRow.entry_id,
            submitted_at: lastRow.created_at,
            submitted_by_name: lastRow.submitted_by_name || null
          }
        : null
    });
  }

  const order = ['Mixing', 'Carding', 'Blowroom', 'Drawframe', 'Simplex', 'Spinning', 'Autoconer'];
  return order.map((subDepartment) => ({
    sub_department: subDepartment,
    notebooks: bySubDepartment.get(subDepartment) || []
  }));
};

// Scans all 10 PP notebook tables for entry_ids whose batch is overdue (first
// submission older than completion_threshold_hours with at least one missing
// screen) and files a PP_BATCH_INCOMPLETE ticket for each, then expires any
// already-open PP_BATCH_INCOMPLETE ticket whose L2 TAT has elapsed.
const runPpBatchCompletionCheck = async () => {
  await ensureTicketApprovalColumnsForBatchCheck();
  const config = await getPpBatchConfig();

  if (config.is_active === false) {
    return { created: [], expired: [] };
  }

  const defaultCompletionThresholdHours = Number(config.completion_threshold_hours) > 0
    ? Number(config.completion_threshold_hours)
    : 24;
  const subDepartmentThresholds = await getPpBatchSubDepartmentThresholds();
  const notebookThresholds = await getPpNotebookThresholds();
  const getCompletionThresholdHoursForLabel = (label) => {
    const notebookRow = notebookThresholds.get(label);
    if (Number(notebookRow?.completion_threshold_hours) > 0) return Number(notebookRow.completion_threshold_hours);
    const subDepartment = PP_BATCH_LABEL_TO_SUB_DEPARTMENT[label];
    const perSubDepartmentHours = subDepartmentThresholds.get(subDepartment);
    return Number(perSubDepartmentHours) > 0 ? Number(perSubDepartmentHours) : defaultCompletionThresholdHours;
  };

  const unionSelects = PP_BATCH_NOTEBOOKS.map(
    (notebookConfig) =>
      `SELECT entry_id, created_at, '${notebookConfig.label.replace(/'/g, "''")}' AS notebook_label
       FROM ${notebookConfig.schema}.${notebookConfig.table}
       WHERE entry_id IS NOT NULL AND TRIM(entry_id) <> '' ${notebookConfig.extraWhere || ''}`
  ).join('\nUNION ALL\n');

  const grouped = await client.query(`
    SELECT entry_id,
           MIN(created_at) AS first_created_at,
           ARRAY_AGG(DISTINCT notebook_label) AS completed_screens
    FROM (${unionSelects}) all_pp_entries
    GROUP BY entry_id
  `);

  const allLabels = PP_BATCH_NOTEBOOKS.map((notebookConfig) => notebookConfig.label);
  const created = [];

  // Base pool of L1 users considered responsible for a missing screen -
  // there's no per-department L1 assignment stored yet (that needs the PP
  // Threshold config screen from the PDF's Phase 5), so every missing
  // screen for now shares this same candidate pool. Once that config screen
  // exists, this should be looked up per notebookConfig instead.
  const configuredL1UserIds = (Array.isArray(config.approval_l1_user_ids) && config.approval_l1_user_ids.length)
    ? config.approval_l1_user_ids
    : await getL1ApproverIds([], { useDefault: true });

  for (const row of grouped.rows) {
    const completedScreens = Array.isArray(row.completed_screens) ? row.completed_screens : [];
    const missingScreens = allLabels.filter((label) => !completedScreens.includes(label));
    if (!missingScreens.length) continue;

    const firstCreatedAt = new Date(row.first_created_at);
    const hoursElapsed = (Date.now() - firstCreatedAt.getTime()) / (1000 * 60 * 60);

    // PDF Step 3 (Process Parameter Threshold): "For each department whose L1
    // user has not submitted within the TAT, the system raises an individual
    // ticket on that specific L1 user. Tickets are raised per user, not per
    // PP ID." - one ticket per missing department/notebook for this entry_id,
    // each governed by that sub-department's own configured TAT.
    for (const missingLabel of missingScreens) {
      const completionThresholdHours = getCompletionThresholdHoursForLabel(missingLabel);
      if (hoursElapsed < completionThresholdHours) continue;

      // Guards against ever raising a second open ticket for the same
      // (entry_id, missing_screen) pair - this is the actual duplicate
      // prevention the "only one ticket per PP ID/department" request needs.
      const existing = await client.query(
        `SELECT ticket_id
         FROM ticketing_system.operator_tickets
         WHERE (violation_details->>'ticket_type') = 'PP_BATCH_INCOMPLETE'
           AND (violation_details->>'entry_id') = $1
           AND (violation_details->>'missing_screen') = $2
           AND status <> 'Closed'
         LIMIT 1`,
        [row.entry_id, missingLabel]
      );
      if (existing.rows[0]?.ticket_id) continue;

      const notebookRow = notebookThresholds.get(missingLabel);
      const approvalL1UserIds = (Array.isArray(notebookRow?.approval_l1_user_ids) && notebookRow.approval_l1_user_ids.length)
        ? notebookRow.approval_l1_user_ids
        : configuredL1UserIds;

      const violationDetails = {
        category: 'MISSED_FREQUENCY',
        ticket_type: 'PP_BATCH_INCOMPLETE',
        entry_id: row.entry_id,
        first_created_at: row.first_created_at,
        completion_threshold_hours: completionThresholdHours,
        completed_screens: completedScreens,
        missing_screens: missingScreens,
        missing_screen: missingLabel,
        message: `Process Parameter ${row.entry_id} was not completed within ${completionThresholdHours} hour(s). Missing: ${missingLabel}.`
      };

      const ticketSeverity = notebookRow?.severity || 'High';

      // PP Entry Threshold (per the ticket-type spec table) is a flat, L1-only
      // ticket - raised on L1 and resolved by L1 fixing/resubmitting the
      // missing entry, with no L2/L3/L4/L5 escalation chain and no visibility
      // to any other level's dashboard. The separate PP Approval ticket (see
      // createPpApprovalTicket in processParameters.js) is what actually goes
      // to L4, and only fires once every department's entry is in.
      const ticket = await client.query(
        `INSERT INTO ticketing_system.operator_tickets
         (ticket_id, machine_name, parameter_name, actual_value, threshold_value,
          severity, status, created_at, ticket_reason, ticket_type, ticket_kind,
          violation_details, approval_l1_user_ids, tat_current_level)
         VALUES (
           'TK-' || LPAD(nextval('"ticketing_system"."ticket_seq"')::text, 4, '0'),
           $1, $2::jsonb, $3::jsonb, $4::jsonb,
           $7, 'In Progress', NOW(), 'MISSING_VALUE', 'PP_BATCH_INCOMPLETE', 'pp_batch',
           $5::jsonb, $6::int[], 'L1'
         )
         RETURNING *`,
        [
          row.entry_id,
          toJson([missingLabel], []),
          toJson(completedScreens, []),
          toJson({ completion_threshold_hours: completionThresholdHours }, {}),
          toJson(violationDetails, {}),
          approvalL1UserIds,
          ticketSeverity
        ]
      );

      const inserted = ticket.rows[0];
      created.push(inserted);

      await createNotificationsForUsers(approvalL1UserIds, {
        ticketId: inserted.ticket_id,
        type: 'PP_BATCH_INCOMPLETE',
        category: 'Tickets',
        priority: 'High',
        title: (user) => `Hi ${user.full_name || 'there'} (L1), PP entry ${row.entry_id} needs your action`,
        body: (user) =>
          `${user.full_name || 'You'} (L1) - ${missingLabel} for PP entry ${row.entry_id} was not submitted within ${completionThresholdHours} hour(s). Please fix and resubmit it.`,
        linkUrl: `/supervisor-tickets/${inserted.ticket_id}`,
        payload: { ticket_id: inserted.ticket_id, entry_id: row.entry_id }
      });
    }
  }

  return { created, expired: [] };
};

const ensureSubmittedNotebookTables = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.submitted_notebooks (
      id bigserial PRIMARY KEY,
      notebook_submission_id text NOT NULL UNIQUE,
      department text NULL,
      sub_department text NULL,
      notebook text NOT NULL,
      input_screen text NULL,
      entry_id text NULL,
      source_schema text NULL,
      source_table text NULL,
      source_record_id text NULL,
      submitted_by_user_id integer NULL REFERENCES users.user_details(id) ON DELETE SET NULL,
      submitted_by_name text NULL,
      submitted_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      l2_approver_user_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[],
      l3_approver_user_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[],
      status text NOT NULL DEFAULT 'PENDING_ACK',
      submitted_at timestamptz NOT NULL DEFAULT NOW(),
      ack_due_at timestamptz NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
      acknowledged_at timestamptz NULL,
      acknowledged_by_user_id integer NULL REFERENCES users.user_details(id) ON DELETE SET NULL,
      acknowledged_by_name text NULL,
      acknowledgement_note text NULL,
      overdue_ticket_id text NULL REFERENCES ticketing_system.operator_tickets(ticket_id) ON DELETE SET NULL,
      overdue_ticket_created_at timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    ALTER TABLE ticketing_system.submitted_notebooks
      ADD COLUMN IF NOT EXISTS id bigserial,
      ADD COLUMN IF NOT EXISTS notebook_submission_id text,
      ADD COLUMN IF NOT EXISTS department text NULL,
      ADD COLUMN IF NOT EXISTS sub_department text NULL,
      ADD COLUMN IF NOT EXISTS notebook text,
      ADD COLUMN IF NOT EXISTS input_screen text NULL,
      ADD COLUMN IF NOT EXISTS entry_id text NULL,
      ADD COLUMN IF NOT EXISTS source_schema text NULL,
      ADD COLUMN IF NOT EXISTS source_table text NULL,
      ADD COLUMN IF NOT EXISTS source_record_id text NULL,
      ADD COLUMN IF NOT EXISTS submitted_by_user_id integer NULL REFERENCES users.user_details(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS submitted_by_name text NULL,
      ADD COLUMN IF NOT EXISTS submitted_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS l2_approver_user_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[],
      ADD COLUMN IF NOT EXISTS l3_approver_user_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[],
      ADD COLUMN IF NOT EXISTS l4_approver_user_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[],
      ADD COLUMN IF NOT EXISTS l5_approver_user_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[],
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING_ACK',
      ADD COLUMN IF NOT EXISTS submitted_at timestamptz NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS ack_due_at timestamptz NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
      ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS acknowledged_by_user_id integer NULL REFERENCES users.user_details(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS acknowledged_by_name text NULL,
      ADD COLUMN IF NOT EXISTS acknowledgement_note text NULL,
      ADD COLUMN IF NOT EXISTS overdue_ticket_id text NULL REFERENCES ticketing_system.operator_tickets(ticket_id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS overdue_ticket_created_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT NOW()
  `);

  await client.query(`
    DELETE FROM ticketing_system.submitted_notebooks s
    USING (
      SELECT ctid,
             ROW_NUMBER() OVER (
               PARTITION BY notebook_submission_id
               ORDER BY submitted_at DESC NULLS LAST, id DESC NULLS LAST, ctid
             ) AS rn
      FROM ticketing_system.submitted_notebooks
      WHERE notebook_submission_id IS NOT NULL
    ) d
    WHERE s.ctid = d.ctid
      AND d.rn > 1
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS submitted_notebooks_submission_id_uq
    ON ticketing_system.submitted_notebooks (notebook_submission_id)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS submitted_notebooks_l2_status_due_idx
    ON ticketing_system.submitted_notebooks (status, ack_due_at DESC)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS submitted_notebooks_submitted_at_idx
    ON ticketing_system.submitted_notebooks (submitted_at DESC)
  `);
};

const ensureScreenFrequencyTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.screen_submission_frequency (
      id BIGSERIAL PRIMARY KEY,
      screen_name TEXT NOT NULL,
      department TEXT NULL,
      sub_department TEXT NULL,
      frequency INTEGER NOT NULL,
      occurrences INTEGER NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      approval_l1 TEXT NULL,
      approval_l1_name TEXT NULL,
      approval_l2 TEXT NULL,
      approval_l2_name TEXT NULL,
      approval_l3 TEXT NULL,
      approval_l3_name TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (screen_name, department, sub_department)
    )
  `);
  await client.query(`
    ALTER TABLE ticketing_system.screen_submission_frequency
      ADD COLUMN IF NOT EXISTS occurrences INTEGER NULL,
      ADD COLUMN IF NOT EXISTS approval_l1 TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l1_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l2 TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l2_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l3 TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l3_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS l1_tat_hours INTEGER NULL,
      ADD COLUMN IF NOT EXISTS l2_tat_hours INTEGER NULL,
      ADD COLUMN IF NOT EXISTS l3_tat_hours INTEGER NULL
  `);
  await client.query(`
    DELETE FROM ticketing_system.screen_submission_frequency f
    USING (
      SELECT ctid,
             ROW_NUMBER() OVER (
               PARTITION BY screen_name, department, sub_department
               ORDER BY updated_at DESC NULLS LAST, id DESC NULLS LAST, ctid
             ) AS rn
      FROM ticketing_system.screen_submission_frequency
    ) d
    WHERE f.ctid = d.ctid
      AND d.rn > 1
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS screen_submission_frequency_screen_dept_subdept_uq
    ON ticketing_system.screen_submission_frequency (screen_name, department, sub_department)
  `);
};

const ensureAcknowledgementThresholdTable = async () => {
  await client.query(`
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
    )
  `);

  await client.query(`
    ALTER TABLE ticketing_system.notebook_acknowledgement_threshold
      ADD COLUMN IF NOT EXISTS acknowledge_within_hours INTEGER NOT NULL DEFAULT 24,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS approval_l2 TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l2_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l3 TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l3_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l4 TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l4_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l5 TEXT NULL,
      ADD COLUMN IF NOT EXISTS approval_l5_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS l3_tat_hours INTEGER NULL,
      ADD COLUMN IF NOT EXISTS l4_tat_hours INTEGER NULL,
      ADD COLUMN IF NOT EXISTS l5_tat_hours INTEGER NULL,
      ADD COLUMN IF NOT EXISTS criticality TEXT NOT NULL DEFAULT 'High'
  `);
  await client.query(`
    DELETE FROM ticketing_system.notebook_acknowledgement_threshold t
    USING (
      SELECT ctid,
             ROW_NUMBER() OVER (
               PARTITION BY screen_name, department, sub_department
               ORDER BY updated_at DESC NULLS LAST, id DESC NULLS LAST, ctid
             ) AS rn
      FROM ticketing_system.notebook_acknowledgement_threshold
    ) d
    WHERE t.ctid = d.ctid
      AND d.rn > 1
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS notebook_ack_threshold_screen_dept_subdept_uq
    ON ticketing_system.notebook_acknowledgement_threshold (screen_name, department, sub_department)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS notebook_ack_threshold_lookup_idx
    ON ticketing_system.notebook_acknowledgement_threshold
    (is_active, lower(trim(screen_name)), lower(trim(COALESCE(department, ''))), lower(trim(COALESCE(sub_department, ''))))
  `);
};

const getSubmissionFrequencyConfigForNotebook = async (submission) => {
  await ensureScreenFrequencyTable();
  const result = await client.query(
    `SELECT id, screen_name, department, sub_department, frequency, occurrences,
            approval_l2, approval_l2_name, approval_l3, approval_l3_name, l1_tat_hours, l2_tat_hours, l3_tat_hours
     FROM ticketing_system.screen_submission_frequency
     WHERE is_active = true
       AND LOWER(TRIM(screen_name)) = LOWER(TRIM($1))
       AND ($2::text IS NULL OR LOWER(TRIM(COALESCE(department, ''))) = LOWER(TRIM($2::text)) OR department IS NULL)
       AND ($3::text IS NULL OR LOWER(TRIM(COALESCE(sub_department, ''))) = LOWER(TRIM($3::text)) OR sub_department IS NULL)
     ORDER BY
       CASE WHEN LOWER(TRIM(COALESCE(department, ''))) = LOWER(TRIM(COALESCE($2::text, ''))) THEN 0 ELSE 1 END,
       CASE WHEN LOWER(TRIM(COALESCE(sub_department, ''))) = LOWER(TRIM(COALESCE($3::text, ''))) THEN 0 ELSE 1 END,
       id DESC
     LIMIT 1`,
    [
      submission.input_screen || submission.notebook,
      submission.department || null,
      submission.sub_department || null
    ]
  );
  return result.rows[0] || null;
};

const getSubmissionFrequencyConfigForThreshold = async ({ screenName, department, subDepartment }) => {
  await ensureScreenFrequencyTable();
  const result = await client.query(
    `SELECT id, screen_name, department, sub_department, frequency, occurrences,
            approval_l2, approval_l2_name, approval_l3, approval_l3_name, l1_tat_hours, l2_tat_hours, l3_tat_hours
     FROM ticketing_system.screen_submission_frequency
     WHERE is_active = true
       AND (
         regexp_replace(LOWER(TRIM(screen_name)), '[^a-z0-9]+', '', 'g') = regexp_replace(LOWER(TRIM($1)), '[^a-z0-9]+', '', 'g')
         OR (
           $3::text IS NOT NULL
           AND regexp_replace(LOWER(TRIM(COALESCE(sub_department, ''))), '[^a-z0-9]+', '', 'g') = regexp_replace(LOWER(TRIM($3::text)), '[^a-z0-9]+', '', 'g')
         )
       )
       AND (
         $2::text IS NULL
         OR LOWER(TRIM(COALESCE(department, ''))) = LOWER(TRIM($2::text))
         OR department IS NULL
         OR (
           $3::text IS NOT NULL
           AND regexp_replace(LOWER(TRIM(COALESCE(sub_department, ''))), '[^a-z0-9]+', '', 'g') = regexp_replace(LOWER(TRIM($3::text)), '[^a-z0-9]+', '', 'g')
         )
       )
     ORDER BY
       CASE WHEN LOWER(TRIM(screen_name)) = LOWER(TRIM($1)) THEN 0 ELSE 1 END,
       CASE WHEN LOWER(TRIM(COALESCE(department, ''))) = LOWER(TRIM(COALESCE($2::text, ''))) THEN 0 ELSE 1 END,
       CASE WHEN regexp_replace(LOWER(TRIM(COALESCE(sub_department, ''))), '[^a-z0-9]+', '', 'g') = regexp_replace(LOWER(TRIM(COALESCE($3::text, ''))), '[^a-z0-9]+', '', 'g') THEN 0 ELSE 1 END,
       id DESC
     LIMIT 1`,
    [screenName, department || null, subDepartment || null]
  );
  return result.rows[0] || null;
};

const getAcknowledgementThresholdForNotebook = async (submission) => {
  await ensureAcknowledgementThresholdTable();
  const result = await client.query(
    `SELECT id, screen_name, department, sub_department, acknowledge_within_hours,
            approval_l2, approval_l2_name, approval_l3, approval_l3_name,
            approval_l4, approval_l4_name, approval_l5, approval_l5_name,
            l3_tat_hours, l4_tat_hours, l5_tat_hours, criticality
     FROM ticketing_system.notebook_acknowledgement_threshold
     WHERE is_active = true
       AND LOWER(TRIM(screen_name)) = LOWER(TRIM($1))
       AND ($2::text IS NULL OR LOWER(TRIM(COALESCE(department, ''))) = LOWER(TRIM($2::text)) OR department IS NULL)
       AND ($3::text IS NULL OR LOWER(TRIM(COALESCE(sub_department, ''))) = LOWER(TRIM($3::text)) OR sub_department IS NULL)
     ORDER BY
       CASE WHEN LOWER(TRIM(COALESCE(department, ''))) = LOWER(TRIM(COALESCE($2::text, ''))) THEN 0 ELSE 1 END,
       CASE WHEN LOWER(TRIM(COALESCE(sub_department, ''))) = LOWER(TRIM(COALESCE($3::text, ''))) THEN 0 ELSE 1 END,
       id DESC
     LIMIT 1`,
    [
      submission.input_screen || submission.notebook,
      submission.department || null,
      submission.sub_department || null
    ]
  );
  return result.rows[0] || null;
};

const resolveAcknowledgementDeadlineHours = async (submission) => {
  const acknowledgementThreshold = await getAcknowledgementThresholdForNotebook(submission);
  if (Number(acknowledgementThreshold?.acknowledge_within_hours) > 0) {
    return {
      acknowledgementThreshold,
      frequencyConfig: null,
      hours: Number(acknowledgementThreshold.acknowledge_within_hours)
    };
  }

  const frequencyConfig = await getSubmissionFrequencyConfigForNotebook(submission);
  const hours = Number(frequencyConfig?.l2_tat_hours) > 0
    ? Number(frequencyConfig.l2_tat_hours)
    : ACK_DEADLINE_HOURS;
  return { acknowledgementThreshold: null, frequencyConfig, hours };
};

const buildSubmissionId = ({ notebook, entryId, sourceTable, sourceRecordId }) => {
  const parts = [
    notebook,
    entryId || sourceRecordId || Date.now(),
    sourceTable || 'notebook'
  ].map((part) => String(part || '').trim().replace(/\s+/g, '-'));
  return `NB-${parts.filter(Boolean).join('-')}`.slice(0, 240);
};

// In-process counterpart to POST / for callers (e.g. department routes right
// after they insert their own header row) that need to log a submission
// against ticketing_system's completion tracking without an HTTP round trip.
const recordPpNotebookSubmission = async ({
  notebook,
  department,
  subDepartment,
  entryId,
  sourceSchema,
  sourceTable,
  sourceRecordId,
  submittedByUserId,
  submittedByName,
  submittedPayload
}) => {
  await ensureSubmittedNotebookTables();
  const notebookSubmissionId = buildSubmissionId({ notebook, entryId, sourceTable, sourceRecordId });

  const result = await client.query(
    `INSERT INTO ticketing_system.submitted_notebooks
     (notebook_submission_id, department, sub_department, notebook, input_screen, entry_id,
      source_schema, source_table, source_record_id, submitted_by_user_id, submitted_by_name,
      submitted_payload, submitted_at, ack_due_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb, NOW(), NOW() + INTERVAL '24 hours')
     ON CONFLICT (notebook_submission_id)
     DO UPDATE SET
       submitted_payload = EXCLUDED.submitted_payload,
       updated_at = NOW()
     RETURNING *`,
    [
      notebookSubmissionId,
      department || null,
      subDepartment || null,
      notebook,
      notebook,
      entryId || null,
      sourceSchema || null,
      sourceTable || null,
      sourceRecordId || null,
      submittedByUserId || null,
      submittedByName || null,
      toJson(submittedPayload, {})
    ]
  );

  return result.rows[0];
};

const isAdminRequester = (req) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  const employeeId = String(req.user?.employee_id || '').trim().toUpperCase();
  return role === 'admin' || role === 'super admin' || role === 'superadmin' || employeeId === 'ADMIN001';
};

const getRequesterLevel = (req) => String(req.user?.level || '').trim().toUpperCase();

const hasHierarchyLevel = (req) => ['L1', 'L2', 'L3', 'L4', 'L5'].includes(getRequesterLevel(req));

// Approval itself is restricted to L4/L5 - viewing (canViewSubmission /
// GET list's canViewAll below) is open to the whole L1-L5 hierarchy.
const canApproveSubmission = (req) => isAdminRequester(req) || ['L4', 'L5'].includes(getRequesterLevel(req));

const canViewSubmission = (req, row) => {
  if (isAdminRequester(req)) return true;
  if (hasHierarchyLevel(req)) return true;
  const requesterId = parsePositiveInt(req.user?.id);
  if (!requesterId) return false;
  if (row.submitted_by_user_id === requesterId) return true;
  return (
    (Array.isArray(row.l2_approver_user_ids) && row.l2_approver_user_ids.includes(requesterId)) ||
    (Array.isArray(row.l3_approver_user_ids) && row.l3_approver_user_ids.includes(requesterId))
  );
};

const getAssignedL2Users = async (ids = []) => {
  const userIds = Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );
  if (!userIds.length) return [];

  const result = await client.query(
    `SELECT id, employee_id, full_name, level, role
     FROM users.user_details
     WHERE id = ANY($1::int[])
     ORDER BY id`,
    [userIds]
  );
  return result.rows;
};

const createOverdueTicketForSubmission = async () => {
  return null;
};

const generateOverdueNotebookTickets = async () => {
  await ensureSubmittedNotebookTables();
  await ensureNotificationMetadataColumns();
  await ensureTicketApprovalColumnsForBatchCheck();

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS operator_tickets_ack_notebook_submission_uq
    ON ticketing_system.operator_tickets ((violation_details->>'notebook_submission_id'))
    WHERE ticket_reason = 'MISSING_VALUE'
      AND (violation_details->>'category') = 'MISSED_FREQUENCY'
      AND COALESCE(violation_details->>'ticket_type', '') IN ('SUBMISSION_ACKNOWLEDGEMENT', 'NOTEBOOK_ACK_OVERDUE')
      AND NULLIF(violation_details->>'notebook_submission_id', '') IS NOT NULL
  `);

  const due = await client.query(
    `SELECT *
     FROM ticketing_system.submitted_notebooks
     WHERE status = 'PENDING_ACK'
       AND ack_due_at <= NOW()
       AND overdue_ticket_id IS NULL
     ORDER BY ack_due_at ASC, id ASC
     LIMIT 100`
  );

  const created = [];
  for (const submission of due.rows) {
    const existingTicket = await client.query(
      `SELECT ticket_id
       FROM ticketing_system.operator_tickets
       WHERE ticket_reason = 'MISSING_VALUE'
         AND (violation_details->>'category') = 'MISSED_FREQUENCY'
         AND COALESCE(violation_details->>'ticket_type', '') IN ('SUBMISSION_ACKNOWLEDGEMENT', 'NOTEBOOK_ACK_OVERDUE')
         AND (
           violation_details->>'notebook_submission_id' = $1
           OR violation_details->>'submitted_notebook_id' = $2
         )
       ORDER BY created_at DESC
       LIMIT 1`,
      [submission.notebook_submission_id, String(submission.id)]
    );

    if (existingTicket.rows[0]?.ticket_id) {
      await client.query(
        `UPDATE ticketing_system.submitted_notebooks
         SET overdue_ticket_id = $1,
             overdue_ticket_created_at = COALESCE(overdue_ticket_created_at, NOW()),
             updated_at = NOW()
         WHERE id = $2
           AND overdue_ticket_id IS NULL`,
        [existingTicket.rows[0].ticket_id, submission.id]
      );
      continue;
    }

    const acknowledgementThreshold = await getAcknowledgementThresholdForNotebook(submission);

    // Acknowledgement Threshold is a flat, L4-only ticket - raised once L1
    // submits and resolved by L4 acknowledging it (L2/L3 have no approval
    // role per the current hierarchy design), with no further escalation and
    // no visibility to any other level's dashboard. The screen's
    // manually-picked L4 approver takes priority when configured; the
    // submitter's real L4 manager is the fallback, and the submission's own
    // approver columns (still the legacy l2_approver_user_ids column, now
    // populated with the resolved L4 id(s) - see POST /) / department
    // default are the last resort.
    const resolvedChain = await resolveEscalationChainForSubmitter(submission.submitted_by_user_id);
    const manualL4Ids = acknowledgementThreshold?.approval_l4
      ? String(acknowledgementThreshold.approval_l4)
          .split(',')
          .map((value) => parseInt(value.trim(), 10))
          .filter((value) => Number.isInteger(value) && value > 0)
      : [];
    const l2ApproverIds = manualL4Ids.length
      ? manualL4Ids
      : resolvedChain.l4.length
        ? resolvedChain.l4
        : (Array.isArray(submission.l2_approver_user_ids) && submission.l2_approver_user_ids.length)
          ? submission.l2_approver_user_ids
          : await getL4ApproverIds([], { useDefault: true });
    const violationDetails = {
      category: 'MISSED_FREQUENCY',
      ticket_type: 'NOTEBOOK_ACK_OVERDUE',
      action_type: 'ACKNOWLEDGE_ONLY',
      submitted_notebook_id: submission.id,
      notebook_submission_id: submission.notebook_submission_id,
      ack_due_at: submission.ack_due_at,
      message: 'Submitted notebook was not acknowledged within the configured time.'
    };

    const ticket = await client.query(
      `INSERT INTO ticketing_system.operator_tickets
       (ticket_id, user_id, user_name, machine_name, parameter_name, actual_value, threshold_value,
        severity, status, created_at, management_field, erp_product_code, ticket_reason, ticket_type,
        violation_details, approval_l4_user_ids, tat_current_level)
       VALUES (
         'TK-' || LPAD(nextval('"ticketing_system"."ticket_seq"')::text, 4, '0'),
         $1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb,
         $11, 'In Progress', NOW(), $7, $8, 'MISSING_VALUE', 'REVIEW',
         $9::jsonb, $10::int[], 'L4'
       )
       RETURNING *`,
      [
        submission.submitted_by_user_id,
        submission.submitted_by_name,
        submission.input_screen || submission.notebook,
        toJson(['Acknowledgement overdue'], []),
        toJson(submission.submitted_payload || {}, {}),
        toJson({ acknowledge_by: submission.ack_due_at }, {}),
        submission.department,
        submission.sub_department,
        toJson(violationDetails, {}),
        l2ApproverIds,
        acknowledgementThreshold?.criticality || 'High'
      ]
    );

    const inserted = ticket.rows[0];
    await client.query(
      `UPDATE ticketing_system.submitted_notebooks
       SET overdue_ticket_id = $1,
           overdue_ticket_created_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [inserted.ticket_id, submission.id]
    );

    await client.query(
      `INSERT INTO ticketing_system.ticket_logs
       (ticket_id, action, performed_by, role, created_at)
       VALUES ($1, 'ACK_REVIEW_CREATED', 'System', 'System', NOW())`,
      [inserted.ticket_id]
    );

    const ackNotebookName = submission.input_screen || submission.notebook;
    if (l2ApproverIds.length) {
      await createNotificationsForUsers(l2ApproverIds, {
        ticketId: inserted.ticket_id,
        type: 'NOTEBOOK_ACK_OVERDUE',
        category: 'Tickets',
        priority: 'High',
        title: (user) => `Hi ${user.full_name || 'there'} (L4), ${ackNotebookName} needs your acknowledgement`,
        body: (user) =>
          `${user.full_name || 'You'} (L4) - ${ackNotebookName} was due for acknowledgement by ${new Date(submission.ack_due_at).toLocaleString()} and is now overdue. Please acknowledge it.`,
        linkUrl: `/supervisor-tickets/${inserted.ticket_id}`,
        payload: {
          ticket_id: inserted.ticket_id,
          submitted_notebook_id: submission.id,
          notebook_submission_id: submission.notebook_submission_id,
          action_type: 'ACKNOWLEDGE_ONLY',
          level: 'L4'
        }
      });
    }

    created.push(inserted);
  }

  // Acknowledgement Threshold is a flat, L4-only ticket - it does not
  // escalate further.
  return { created, escalated: [] };
};

router.use(auth);

router.post('/acknowledgement-thresholds', async (req, res, next) => {
  try {
    await ensureAcknowledgementThresholdTable();
    const screenName = cleanText(req.body?.screen_name || req.body?.notebook || req.body?.input_screen);
    const department = cleanText(req.body?.department);
    const subDepartment = cleanText(req.body?.sub_department || req.body?.subDepartment);
    const acknowledgeWithinHours = parseTatHours(
      req.body?.acknowledge_within_hours ?? req.body?.l2_tat_hours ?? req.body?.tat_hours
    );

    if (!screenName || !acknowledgeWithinHours) {
      return res.status(400).json({
        message: 'screen_name and acknowledge_within_hours are required'
      });
    }

    // The Acknowledgement Threshold screen configures Department/Sub
    // Department/Notebook/Criticality/L2/Approved-Within on its own now, so
    // it no longer requires a Submission Threshold row to already exist -
    // that link is still surfaced (if one happens to exist) purely for
    // reference on the response.
    const submissionThreshold = await getSubmissionFrequencyConfigForThreshold({
      screenName,
      department,
      subDepartment
    });

    const criticality = cleanText(req.body?.criticality) || 'High';

    const result = await client.query(
      `INSERT INTO ticketing_system.notebook_acknowledgement_threshold
       (screen_name, department, sub_department, acknowledge_within_hours, is_active,
        approval_l2, approval_l2_name, approval_l3, approval_l3_name,
        approval_l4, approval_l4_name, approval_l5, approval_l5_name,
        l3_tat_hours, l4_tat_hours, l5_tat_hours, criticality, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
       ON CONFLICT (screen_name, department, sub_department)
       DO UPDATE SET
         acknowledge_within_hours = EXCLUDED.acknowledge_within_hours,
         is_active = EXCLUDED.is_active,
         approval_l2 = EXCLUDED.approval_l2,
         approval_l2_name = EXCLUDED.approval_l2_name,
         approval_l3 = EXCLUDED.approval_l3,
         approval_l3_name = EXCLUDED.approval_l3_name,
         approval_l4 = EXCLUDED.approval_l4,
         approval_l4_name = EXCLUDED.approval_l4_name,
         approval_l5 = EXCLUDED.approval_l5,
         approval_l5_name = EXCLUDED.approval_l5_name,
         l3_tat_hours = EXCLUDED.l3_tat_hours,
         l4_tat_hours = EXCLUDED.l4_tat_hours,
         l5_tat_hours = EXCLUDED.l5_tat_hours,
         criticality = EXCLUDED.criticality,
         updated_at = NOW()
       RETURNING *`,
      [
        screenName,
        department,
        subDepartment,
        acknowledgeWithinHours,
        req.body?.is_active !== undefined ? Boolean(req.body.is_active) : true,
        cleanText(req.body?.approval_l2),
        cleanText(req.body?.approval_l2_name),
        cleanText(req.body?.approval_l3),
        cleanText(req.body?.approval_l3_name),
        cleanText(req.body?.approval_l4),
        cleanText(req.body?.approval_l4_name),
        cleanText(req.body?.approval_l5),
        cleanText(req.body?.approval_l5_name),
        parseTatHours(req.body?.l3_tat_hours) || null,
        parseTatHours(req.body?.l4_tat_hours) || null,
        parseTatHours(req.body?.l5_tat_hours) || null,
        criticality
      ]
    );

    return res.status(200).json({
      message: 'Acknowledgement threshold saved successfully',
      submission_threshold: submissionThreshold,
      acknowledgement_threshold: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

router.get('/acknowledgement-thresholds', async (req, res, next) => {
  try {
    await ensureAcknowledgementThresholdTable();
    const result = await client.query(
      `SELECT id, screen_name, department, sub_department, acknowledge_within_hours,
              is_active, approval_l2, approval_l2_name, approval_l3, approval_l3_name,
              approval_l4, approval_l4_name, approval_l5, approval_l5_name,
              l3_tat_hours, l4_tat_hours, l5_tat_hours, criticality, created_at, updated_at
       FROM ticketing_system.notebook_acknowledgement_threshold
       ORDER BY screen_name, department NULLS FIRST, sub_department NULLS FIRST`
    );

    return res.status(200).json({
      acknowledgement_thresholds: result.rows,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// Mirrors PATCH /submission-frequency/:id in operatorTickets.routes.js — same
// COALESCE-every-column pattern, so omitted fields in the request keep their
// existing stored value instead of being wiped to null.
router.patch('/acknowledgement-thresholds/:id', async (req, res, next) => {
  try {
    await ensureAcknowledgementThresholdTable();

    const { id } = req.params;
    const {
      screen_name,
      department,
      sub_department,
      acknowledge_within_hours,
      is_active,
      approval_l2,
      approval_l2_name,
      approval_l3,
      approval_l3_name,
      approval_l4,
      approval_l4_name,
      approval_l5,
      approval_l5_name,
      l3_tat_hours,
      l4_tat_hours,
      l5_tat_hours,
      criticality
    } = req.body || {};

    const normalizedAcknowledgeWithinHours =
      acknowledge_within_hours === undefined ? undefined : parseTatHours(acknowledge_within_hours);
    if (acknowledge_within_hours !== undefined && !normalizedAcknowledgeWithinHours) {
      return res.status(400).json({ message: 'acknowledge_within_hours must be a positive integer' });
    }

    const normalizedL3TatHours = l3_tat_hours === undefined ? undefined : parseTatHours(l3_tat_hours);
    const normalizedL4TatHours = l4_tat_hours === undefined ? undefined : parseTatHours(l4_tat_hours);
    const normalizedL5TatHours = l5_tat_hours === undefined ? undefined : parseTatHours(l5_tat_hours);

    const result = await client.query(
      `UPDATE ticketing_system.notebook_acknowledgement_threshold
       SET screen_name = COALESCE($1, screen_name),
           department = COALESCE($2, department),
           sub_department = COALESCE($3, sub_department),
           acknowledge_within_hours = COALESCE($4, acknowledge_within_hours),
           is_active = COALESCE($5, is_active),
           approval_l2 = COALESCE($6, approval_l2),
           approval_l2_name = COALESCE($7, approval_l2_name),
           approval_l3 = COALESCE($8, approval_l3),
           approval_l3_name = COALESCE($9, approval_l3_name),
           approval_l4 = COALESCE($10, approval_l4),
           approval_l4_name = COALESCE($11, approval_l4_name),
           approval_l5 = COALESCE($12, approval_l5),
           approval_l5_name = COALESCE($13, approval_l5_name),
           l3_tat_hours = COALESCE($14, l3_tat_hours),
           l4_tat_hours = COALESCE($15, l4_tat_hours),
           l5_tat_hours = COALESCE($16, l5_tat_hours),
           criticality = COALESCE($17, criticality),
           updated_at = NOW()
       WHERE id = $18
       RETURNING *`,
      [
        cleanText(screen_name),
        cleanText(department),
        cleanText(sub_department),
        normalizedAcknowledgeWithinHours,
        is_active,
        cleanText(approval_l2),
        cleanText(approval_l2_name),
        cleanText(approval_l3),
        cleanText(approval_l3_name),
        cleanText(approval_l4),
        cleanText(approval_l4_name),
        cleanText(approval_l5),
        cleanText(approval_l5_name),
        normalizedL3TatHours,
        normalizedL4TatHours,
        normalizedL5TatHours,
        cleanText(criticality),
        id
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Acknowledgement threshold not found' });
    }

    res.status(200).json({
      message: 'Acknowledgement threshold updated successfully',
      acknowledgement_threshold: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/acknowledgement-thresholds/:id/status', async (req, res, next) => {
  try {
    await ensureAcknowledgementThresholdTable();

    const { id } = req.params;
    const { is_active } = req.body || {};

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ message: 'is_active must be boolean' });
    }

    const result = await client.query(
      `UPDATE ticketing_system.notebook_acknowledgement_threshold
       SET is_active = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [is_active, id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Acknowledgement threshold not found' });
    }

    res.status(200).json({
      message: `Acknowledgement threshold ${is_active ? 'activated' : 'deactivated'} successfully`,
      acknowledgement_threshold: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/acknowledgement-thresholds/:id', async (req, res, next) => {
  try {
    await ensureAcknowledgementThresholdTable();

    const { id } = req.params;

    const result = await client.query(
      `DELETE FROM ticketing_system.notebook_acknowledgement_threshold
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Acknowledgement threshold not found' });
    }

    res.status(200).json({
      message: 'Acknowledgement threshold deleted successfully'
    });
  } catch (err) {
    next(err);
  }
});

router.get('/pp-batch-config', async (req, res, next) => {
  try {
    const config = await getPpBatchConfig();
    const subDepartments = await getPpBatchSubDepartments();
    const subDepartmentThresholds = await getPpBatchSubDepartmentThresholds();
    const subDepartmentNames = [...new Set(PP_BATCH_NOTEBOOKS.map((notebookConfig) => notebookConfig.sub_department))];
    const subDepartmentTat = subDepartmentNames.map((subDepartment) => ({
      sub_department: subDepartment,
      completion_threshold_hours:
        subDepartmentThresholds.get(subDepartment) ?? config.completion_threshold_hours
    }));
    return res.status(200).json({ config, sub_departments: subDepartments, sub_department_tat: subDepartmentTat });
  } catch (error) {
    next(error);
  }
});

// Per-PDF spec: each participating sub-department has its own TAT row,
// separate from the global fallback in POST /pp-batch-config.
router.post('/pp-batch-config/sub-department-tat', async (req, res, next) => {
  try {
    await ensurePpBatchSubDepartmentConfigTable();

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [req.body];
    const saved = [];

    for (const row of rows) {
      const subDepartment = cleanText(row?.sub_department);
      const completionThresholdHours = parseTatHours(row?.completion_threshold_hours);
      if (!subDepartment || !completionThresholdHours) {
        return res.status(400).json({
          message: 'sub_department and a positive completion_threshold_hours are required for each row'
        });
      }

      // eslint-disable-next-line no-await-in-loop
      const result = await client.query(
        `INSERT INTO ticketing_system.pp_batch_sub_department_config
         (sub_department, completion_threshold_hours, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (sub_department)
         DO UPDATE SET completion_threshold_hours = EXCLUDED.completion_threshold_hours, updated_at = NOW()
         RETURNING *`,
        [subDepartment, completionThresholdHours]
      );
      saved.push(result.rows[0]);
    }

    return res.status(200).json({ message: 'Sub-department TAT saved successfully', rows: saved });
  } catch (error) {
    next(error);
  }
});

// Per-PDF spec (finest grain): one row per PP notebook, each with its own
// TAT, responsible L1 user(s), and L2 escalation approver(s) - overrides the
// sub-department and global config for that specific notebook.
router.get('/pp-notebook-threshold', async (req, res, next) => {
  try {
    await ensurePpNotebookThresholdTable();
    const result = await client.query(
      `SELECT * FROM ticketing_system.pp_notebook_threshold ORDER BY notebook_label`
    );
    return res.status(200).json({ rows: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/pp-notebook-threshold', async (req, res, next) => {
  try {
    await ensurePpNotebookThresholdTable();

    const notebookLabel = cleanText(req.body?.notebook_label);
    if (!notebookLabel) {
      return res.status(400).json({ message: 'notebook_label is required' });
    }
    const isValidLabel = PP_BATCH_NOTEBOOKS.some((notebookConfig) => notebookConfig.label === notebookLabel);
    if (!isValidLabel) {
      return res.status(400).json({ message: 'notebook_label is not a recognized PP notebook' });
    }

    const completionThresholdHours = parseTatHours(req.body?.completion_threshold_hours);
    if (!completionThresholdHours) {
      return res.status(400).json({ message: 'completion_threshold_hours must be a positive integer' });
    }

    const toUserIdArray = (value) =>
      toArray(value).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    const approvalL1UserIds = toUserIdArray(req.body?.approval_l1_user_ids);
    const approvalL2UserIds = toUserIdArray(req.body?.approval_l2_user_ids);
    const approvalL4UserIds = toUserIdArray(req.body?.approval_l4_user_ids);
    const isActive = req.body?.is_active === undefined ? true : Boolean(req.body.is_active);
    const department = cleanText(req.body?.department);
    const subDepartment = cleanText(req.body?.sub_department);
    const severity = cleanText(req.body?.severity) || 'High';
    const approveWithinHours = parseTatHours(req.body?.approve_within_hours, null);

    const result = await client.query(
      `INSERT INTO ticketing_system.pp_notebook_threshold
       (notebook_label, completion_threshold_hours, approval_l1_user_ids, approval_l2_user_ids, is_active,
        department, sub_department, severity, approval_l4_user_ids, approve_within_hours, updated_at)
       VALUES ($1, $2, $3::int[], $4::int[], $5, $6, $7, $8, $9::int[], $10, NOW())
       ON CONFLICT (notebook_label)
       DO UPDATE SET
         completion_threshold_hours = EXCLUDED.completion_threshold_hours,
         approval_l1_user_ids = EXCLUDED.approval_l1_user_ids,
         approval_l2_user_ids = EXCLUDED.approval_l2_user_ids,
         is_active = EXCLUDED.is_active,
         department = EXCLUDED.department,
         sub_department = EXCLUDED.sub_department,
         severity = EXCLUDED.severity,
         approval_l4_user_ids = EXCLUDED.approval_l4_user_ids,
         approve_within_hours = EXCLUDED.approve_within_hours,
         updated_at = NOW()
       RETURNING *`,
      [
        notebookLabel, completionThresholdHours, approvalL1UserIds, approvalL2UserIds, isActive,
        department, subDepartment, severity, approvalL4UserIds, approveWithinHours
      ]
    );

    return res.status(200).json({ message: 'PP notebook threshold saved successfully', row: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete('/pp-notebook-threshold/:id', async (req, res, next) => {
  try {
    await ensurePpNotebookThresholdTable();
    const result = await client.query(
      `DELETE FROM ticketing_system.pp_notebook_threshold WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ message: 'PP notebook threshold not found' });
    }
    return res.status(200).json({ message: 'PP notebook threshold deleted successfully' });
  } catch (error) {
    next(error);
  }
});

router.patch('/pp-notebook-threshold/:id/status', async (req, res, next) => {
  try {
    await ensurePpNotebookThresholdTable();
    const isActive = req.body?.is_active === undefined ? true : Boolean(req.body.is_active);
    const result = await client.query(
      `UPDATE ticketing_system.pp_notebook_threshold SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [isActive, req.params.id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ message: 'PP notebook threshold not found' });
    }
    return res.status(200).json({ message: 'PP notebook threshold status updated successfully', row: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post('/pp-batch-config', async (req, res, next) => {
  try {
    await ensurePpBatchConfigTable();

    const completionThresholdHours = parseTatHours(req.body?.completion_threshold_hours);
    if (!completionThresholdHours) {
      return res.status(400).json({ message: 'completion_threshold_hours must be a positive integer' });
    }

    const l2TatHours = parseTatHours(req.body?.l2_tat_hours, null);
    const l3TatHours = parseTatHours(req.body?.l3_tat_hours, null);
    const l4TatHours = parseTatHours(req.body?.l4_tat_hours, null);
    const l5TatHours = parseTatHours(req.body?.l5_tat_hours, null);
    const toUserIdArray = (value) =>
      toArray(value).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    const approvalL1UserIds = toUserIdArray(req.body?.approval_l1_user_ids);
    const approvalL2UserIds = toUserIdArray(req.body?.approval_l2_user_ids);
    const approvalL3UserIds = toUserIdArray(req.body?.approval_l3_user_ids);
    const approvalL4UserIds = toUserIdArray(req.body?.approval_l4_user_ids);
    const approvalL5UserIds = toUserIdArray(req.body?.approval_l5_user_ids);
    const isActive = req.body?.is_active === undefined ? true : Boolean(req.body.is_active);

    const result = await client.query(
      `INSERT INTO ticketing_system.pp_batch_config
       (config_key, completion_threshold_hours, l2_tat_hours, l3_tat_hours, l4_tat_hours, l5_tat_hours,
        approval_l1_user_ids, approval_l2_user_ids, approval_l3_user_ids, approval_l4_user_ids, approval_l5_user_ids,
        is_active, updated_at)
       VALUES ('global', $1, $2, $3, $4, $5, $6::int[], $7::int[], $8::int[], $9::int[], $10::int[], $11, NOW())
       ON CONFLICT (config_key)
       DO UPDATE SET
         completion_threshold_hours = EXCLUDED.completion_threshold_hours,
         l2_tat_hours = EXCLUDED.l2_tat_hours,
         l3_tat_hours = EXCLUDED.l3_tat_hours,
         l4_tat_hours = EXCLUDED.l4_tat_hours,
         l5_tat_hours = EXCLUDED.l5_tat_hours,
         approval_l1_user_ids = EXCLUDED.approval_l1_user_ids,
         approval_l2_user_ids = EXCLUDED.approval_l2_user_ids,
         approval_l3_user_ids = EXCLUDED.approval_l3_user_ids,
         approval_l4_user_ids = EXCLUDED.approval_l4_user_ids,
         approval_l5_user_ids = EXCLUDED.approval_l5_user_ids,
         is_active = EXCLUDED.is_active,
         updated_at = NOW()
       RETURNING *`,
      [
        completionThresholdHours, l2TatHours, l3TatHours, l4TatHours, l5TatHours,
        approvalL1UserIds, approvalL2UserIds, approvalL3UserIds, approvalL4UserIds, approvalL5UserIds,
        isActive
      ]
    );

    return res.status(200).json({ message: 'PP batch config saved successfully', config: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post('/pp-batch-completion-check', async (req, res, next) => {
  try {
    const { created, expired } = await runPpBatchCompletionCheck();
    return res.status(200).json({
      success: true,
      created_count: created.length,
      expired_count: expired.length,
      tickets: created,
      expired_tickets: expired
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    await ensureSubmittedNotebookTables();
    await ensureAcknowledgementThresholdTable();
    const notebook = cleanText(req.body?.notebook || req.body?.title || req.body?.input_screen);
    if (!notebook) return res.status(400).json({ message: 'notebook is required' });

    const submittedByUserId = parsePositiveInt(req.body?.submitted_by_user_id) || parsePositiveInt(req.user?.id);
    const submittedByName = cleanText(req.body?.submitted_by_name) || await getUserDisplayName(submittedByUserId) || cleanText(req.user?.employee_id);

    const entryId = cleanText(req.body?.entry_id);
    const sourceTable = cleanText(req.body?.source_table);
    const sourceRecordId = cleanText(req.body?.source_record_id || req.body?.record_id);
    const notebookSubmissionId = cleanText(req.body?.notebook_submission_id) || buildSubmissionId({
      notebook,
      entryId,
      sourceTable,
      sourceRecordId
    });

    const submittedAt = cleanText(req.body?.submitted_at);
    let ackDueAt = cleanText(req.body?.ack_due_at);
    const payload = req.body?.submitted_payload || req.body?.fields || req.body?.payload || {};

    // Always resolve the per-screen Submission Threshold config (previously only fetched to
    // compute ack_due_at, and only when the caller hadn't already supplied one) — its
    // approval_l4/approval_l3 columns are the actual "Checked by" assignment configured on the
    // Submission Threshold page, and were never being read into l2_approver_user_ids at all, so
    // every submission's approver stayed an empty array unless the caller happened to pass one
    // explicitly in the request body.
    const { hours: acknowledgementHours, acknowledgementThreshold } = await resolveAcknowledgementDeadlineHours({
      input_screen: cleanText(req.body?.input_screen) || notebook,
      notebook,
      department: cleanText(req.body?.department),
      sub_department: cleanText(req.body?.sub_department || req.body?.subDepartment)
    });

    if (!ackDueAt) {
      const baseSubmittedAt = submittedAt ? new Date(submittedAt) : new Date();
      if (!Number.isNaN(baseSubmittedAt.getTime())) {
        ackDueAt = new Date(baseSubmittedAt.getTime() + acknowledgementHours * 60 * 60 * 1000).toISOString();
      }
    }

    // Notebook approval moved from L2 to L4 - resolved ids still land in the
    // legacy l2_approver_user_ids column (kept as-is to avoid a schema/data
    // migration), just populated with the L4 approver's id(s) now instead.
    // approval_l2_* body/config keys are kept as a fallback for any caller
    // or already-saved threshold row that hasn't been updated to L4 yet.
    const l2ApproverUserIds = await getL4ApproverIds(
      req.body?.l4_approver_user_ids ||
      req.body?.approval_l4_user_ids ||
      req.body?.l4_approver_employee_ids ||
      req.body?.approval_l4_employee_ids ||
      req.body?.l4_approver_employee_id ||
      req.body?.approval_l4_employee_id ||
      req.body?.assigned_l4 ||
      req.body?.l2_approver_user_ids ||
      req.body?.approval_l2_user_ids ||
      req.body?.assigned_l2 ||
      (acknowledgementThreshold?.approval_l4
        ? acknowledgementThreshold.approval_l4.split(',').map((value) => value.trim()).filter(Boolean)
        : acknowledgementThreshold?.approval_l2
          ? acknowledgementThreshold.approval_l2.split(',').map((value) => value.trim()).filter(Boolean)
          : []) ||
      [],
      { useDefault: false }
    );
    const l3ApproverUserIds = await getL3ApproverIds(
      req.body?.l3_approver_user_ids ||
      req.body?.approval_l3_user_ids ||
      req.body?.l3_approver_employee_ids ||
      req.body?.approval_l3_employee_ids ||
      req.body?.l3_approver_employee_id ||
      req.body?.approval_l3_employee_id ||
      req.body?.assigned_l3 ||
      (acknowledgementThreshold?.approval_l3 ? acknowledgementThreshold.approval_l3.split(',').map((value) => value.trim()).filter(Boolean) : []) ||
      [],
      { useDefault: false }
    );

    const result = await client.query(
      `INSERT INTO ticketing_system.submitted_notebooks
       (notebook_submission_id, department, sub_department, notebook, input_screen, entry_id,
        source_schema, source_table, source_record_id, submitted_by_user_id, submitted_by_name,
        submitted_payload, l2_approver_user_ids, l3_approver_user_ids, submitted_at, ack_due_at)
       VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::int[],$14::int[],
         COALESCE($15::timestamptz, NOW()),
         COALESCE($16::timestamptz, COALESCE($15::timestamptz, NOW()) + INTERVAL '24 hours')
       )
       ON CONFLICT (notebook_submission_id)
       DO UPDATE SET
         submitted_payload = EXCLUDED.submitted_payload,
         l2_approver_user_ids = EXCLUDED.l2_approver_user_ids,
         l3_approver_user_ids = EXCLUDED.l3_approver_user_ids,
         updated_at = NOW()
       RETURNING *`,
      [
        notebookSubmissionId,
        cleanText(req.body?.department),
        cleanText(req.body?.sub_department || req.body?.subDepartment),
        notebook,
        cleanText(req.body?.input_screen) || notebook,
        entryId,
        cleanText(req.body?.source_schema),
        sourceTable,
        sourceRecordId,
        submittedByUserId,
        submittedByName,
        toJson(payload, {}),
        l2ApproverUserIds,
        l3ApproverUserIds,
        submittedAt,
        ackDueAt
      ]
    );

    return res.status(201).json({ success: true, submitted_notebook: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    await ensureSubmittedNotebookTables();
    const requesterId = parsePositiveInt(req.user?.id);
    const page = parsePositiveInt(req.query.page, 1);
    const requestedLimit = parsePositiveInt(req.query.limit, 20);
    const limit = Math.min(requestedLimit, MAX_LIMIT);
    const offset = (page - 1) * limit;
    const status = cleanText(req.query.status);
    const department = cleanText(req.query.department);
    const subDepartment = cleanText(req.query.sub_department || req.query.subDepartment);

    const where = [];
    const params = [];
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    if (department) {
      params.push(department);
      where.push(`LOWER(TRIM(COALESCE(department, ''))) = LOWER(TRIM($${params.length}))`);
    }
    if (subDepartment) {
      params.push(subDepartment);
      where.push(`LOWER(TRIM(COALESCE(sub_department, ''))) = LOWER(TRIM($${params.length}))`);
    }

    // The submitted-notebooks list is visible to the whole L1-L5 hierarchy,
    // not just admin - only accounts without a recognized level stay scoped
    // to notebooks they submitted or are specifically assigned to approve.
    const canViewAll = isAdminRequester(req) || hasHierarchyLevel(req);
    if (!canViewAll) {
      params.push(requesterId);
      where.push(`($${params.length} = ANY(COALESCE(l2_approver_user_ids, ARRAY[]::int[])) OR $${params.length} = ANY(COALESCE(l3_approver_user_ids, ARRAY[]::int[])) OR submitted_by_user_id = $${params.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await client.query(
      `SELECT COUNT(*)::int AS total FROM ticketing_system.submitted_notebooks ${whereSql}`,
      params
    );

    params.push(limit, offset);
    const rows = await client.query(
      `SELECT id, notebook_submission_id, department, sub_department, notebook, input_screen, entry_id,
              submitted_by_user_id, submitted_by_name, l2_approver_user_ids, l3_approver_user_ids, status,
              submitted_at, ack_due_at, acknowledged_at, acknowledged_by_name, acknowledgement_note,
              overdue_ticket_id, overdue_ticket_created_at, created_at, updated_at
       FROM ticketing_system.submitted_notebooks
       ${whereSql}
       ORDER BY submitted_at DESC, id DESC
       LIMIT $${params.length - 1}
       OFFSET $${params.length}`,
      params
    );
    const assignedById = new Map();
    const allApproverIds = Array.from(new Set(rows.rows.flatMap((row) => [
      ...(row.l2_approver_user_ids || []),
      ...(row.l3_approver_user_ids || [])
    ])));
    if (allApproverIds.length) {
      const assignedUsers = await getAssignedL2Users(allApproverIds);
      for (const user of assignedUsers) assignedById.set(Number(user.id), user);
    }
    const submittedNotebooks = rows.rows.map((row) => ({
      ...row,
      assigned_l2_users: (row.l2_approver_user_ids || [])
        .map((id) => assignedById.get(Number(id)))
        .filter(Boolean),
      assigned_l3_users: (row.l3_approver_user_ids || [])
        .map((id) => assignedById.get(Number(id)))
        .filter(Boolean)
    }));

    return res.status(200).json({
      submitted_notebooks: submittedNotebooks,
      data: submittedNotebooks,
      pagination: {
        page,
        limit,
        total: count.rows[0]?.total || 0
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/generate-overdue-tickets', async (req, res, next) => {
  try {
    const { created, escalated } = await generateOverdueNotebookTickets();
    return res.status(200).json({
      success: true,
      created_count: created.length,
      escalated_count: escalated.length,
      tickets: created
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    await ensureSubmittedNotebookTables();
    const value = cleanText(req.params.id);
    const result = await client.query(
      `SELECT *
       FROM ticketing_system.submitted_notebooks
       WHERE id::text = $1 OR notebook_submission_id = $1`,
      [value]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Submitted notebook not found' });
    const row = result.rows[0];
    if (!canViewSubmission(req, row)) return res.status(403).json({ message: 'You are not authorized to view this submitted notebook' });
    return res.status(200).json({
      submitted_notebook: {
        ...row,
        assigned_l2_users: await getAssignedL2Users(row.l2_approver_user_ids),
        assigned_l3_users: await getAssignedL2Users(row.l3_approver_user_ids)
      }
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/acknowledge', async (req, res, next) => {
  try {
    await ensureSubmittedNotebookTables();
    const value = cleanText(req.params.id);
    const current = await client.query(
      `SELECT *
       FROM ticketing_system.submitted_notebooks
       WHERE id::text = $1 OR notebook_submission_id = $1`,
      [value]
    );
    if (!current.rows.length) return res.status(404).json({ message: 'Submitted notebook not found' });
    const row = current.rows[0];
    if (!canViewSubmission(req, row)) return res.status(403).json({ message: 'You are not authorized to acknowledge this submitted notebook' });
    // Viewing is open to the whole L1-L5 hierarchy above, but only L4/L5
    // (or admin) may actually approve - mirrors the frontend's Acknowledge
    // gate so a direct API call can't bypass it.
    if (!canApproveSubmission(req)) return res.status(403).json({ message: 'Only L4 and L5 have access to approve.' });

    const requesterId = parsePositiveInt(req.user?.id);
    const requesterName = await getUserDisplayName(requesterId) || cleanText(req.user?.employee_id) || 'L4 User';
    const updated = await client.query(
      `UPDATE ticketing_system.submitted_notebooks
       SET status = 'ACKNOWLEDGED',
           acknowledged_at = NOW(),
           acknowledged_by_user_id = $2,
           acknowledged_by_name = $3,
           acknowledgement_note = $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [row.id, requesterId, requesterName, cleanText(req.body?.note || req.body?.acknowledgement_note)]
    );

    if (row.overdue_ticket_id) {
      await client.query(
        `UPDATE ticketing_system.operator_tickets
         SET status = 'Closed',
             tat_current_level = COALESCE(tat_current_level, 'L4')
         WHERE ticket_id = $1
           AND status <> 'Closed'`,
        [row.overdue_ticket_id]
      );
      await client.query(
        `INSERT INTO ticketing_system.ticket_logs
         (ticket_id, action, performed_by, role, created_at)
         VALUES ($1, 'ACKNOWLEDGED', $2, $3, NOW())`,
        [row.overdue_ticket_id, requesterName, req.user?.role || 'L4']
      );
    }

    return res.status(200).json({ success: true, submitted_notebook: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = {
  router,
  ensureSubmittedNotebookTables,
  ensureAcknowledgementThresholdTable,
  generateOverdueNotebookTickets,
  recordPpNotebookSubmission,
  runPpBatchCompletionCheck,
  ensurePpBatchSubDepartmentConfigTable,
  getPpBatchSubDepartmentThresholds,
  ensurePpNotebookThresholdTable,
  getPpNotebookThresholds
};

const express = require('express');
const router = express.Router();
const client = require('../connection');
const { generateTicketId } = require('../utils/ticketId');
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

// Per-PDF spec: PP Threshold config is "Multiple Sub-Department Rows: each
// participating sub-department is listed as a separate row... each with its
// own individual TAT", timed from the first department's submission - not
// one global TAT shared by every department. This table holds that per-row
// override; pp_batch_config.completion_threshold_hours remains the fallback
// for any sub-department without its own row.
const getPpBatchSubDepartmentThresholds = async () => {
  const result = await client.query(
    `SELECT sub_department, completion_threshold_hours, updated_at
     FROM ticketing_system.pp_batch_sub_department_config`
  );
  const bySubDepartment = new Map();
  for (const row of result.rows) {
    bySubDepartment.set(row.sub_department, {
      hours: Number(row.completion_threshold_hours),
      // No created_at column on this table - updated_at is the closest thing to "when this
      // threshold took its current form" (set once at creation, moved forward by any later
      // edit), used the same way as the other thresholds' created_at anchor below.
      anchoredAt: row.updated_at,
    });
  }
  return bySubDepartment;
};

const PP_BATCH_LABEL_TO_SUB_DEPARTMENT = PP_BATCH_NOTEBOOKS.reduce((map, notebookConfig) => {
  map[notebookConfig.label] = notebookConfig.sub_department;
  return map;
}, {});

// Live completed/missing screen breakdown for a single PP entry_id, straight
// from each department's own table - used to refresh a PP_BATCH_INCOMPLETE
// ticket's violation_details on submit, since the snapshot taken when the
// ticket was first raised (generatePpNotebookBatchIncompleteTickets below)
// never otherwise updates even after the operator fixes and saves the
// missing department's entry.
const getPpBatchCompletionForEntryId = async (entryId) => {
  const allLabels = PP_BATCH_NOTEBOOKS.map((notebookConfig) => notebookConfig.label);
  if (!entryId) return { completedScreens: [], missingScreens: allLabels };

  const unionSelects = PP_BATCH_NOTEBOOKS.map(
    (notebookConfig, index) =>
      `SELECT '${notebookConfig.label.replace(/'/g, "''")}' AS notebook_label
       FROM ${notebookConfig.schema}.${notebookConfig.table}
       WHERE entry_id = $1 ${notebookConfig.extraWhere || ''}`
  ).join('\nUNION ALL\n');

  const result = await client.query(
    `SELECT DISTINCT notebook_label FROM (${unionSelects}) all_pp_entries`,
    [entryId]
  );
  const completedScreens = result.rows.map((row) => row.notebook_label);
  const missingScreens = allLabels.filter((label) => !completedScreens.includes(label));
  return { completedScreens, missingScreens };
};

// PP notebook settings: shared timing plus per-notebook responsibility.
// When a notebook row exists, it overrides the broader fallback config.
const getPpNotebookThresholds = async () => {
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

const normalizeDepartmentKey = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, '');

// Real hierarchy assignment for L1 (there's no manager-chain concept below
// L1 - they're the leaf level, unlike L2+ which resolve via getManagerChain).
// users.user_details.department already carries each L1 user's real
// department (e.g. "Mixing", "Draw Frame") which lines up with
// PP_BATCH_NOTEBOOKS' sub_department (e.g. "Mixing", "Drawframe" - hence the
// space-insensitive match). Replaces the old behavior of handing every
// missing screen the same blind "first 20 L1 users system-wide" pool.
const getL1UserIdsByDepartment = async () => {
  const result = await client.query(
    `SELECT id, department FROM users.user_details WHERE UPPER(COALESCE(level, '')) = 'L1'`
  );
  const byDepartment = new Map();
  for (const row of result.rows) {
    const key = normalizeDepartmentKey(row.department);
    if (!key) continue;
    if (!byDepartment.has(key)) byDepartment.set(key, []);
    byDepartment.get(key).push(Number(row.id));
  }
  return byDepartment;
};

// Scans all 10 PP notebook tables for entry_ids whose batch is overdue (first
// submission older than at least one missing screen's completion_threshold_hours)
// and files one consolidated PP_BATCH_INCOMPLETE ticket per entry_id (PP ID)
// naming every overdue screen, then expires any already-open
// PP_BATCH_INCOMPLETE ticket whose L2 TAT has elapsed.
// Backstops this function's own check-then-insert dedup (SELECT for an
// existing open ticket, then INSERT, with nothing stopping two
// near-simultaneous calls from both passing that check) - same reasoning as
// the PP Approval/Wheel Change Approval unique indexes.
const ensurePpBatchTicketUniqueIndex = async () => {
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS operator_tickets_pp_batch_open_uq
    ON ticketing_system.operator_tickets ((violation_details->>'entry_id'))
    WHERE ticket_type = 'PP_BATCH_INCOMPLETE' AND status <> 'Closed'
  `);
};

const runPpBatchCompletionCheck = async () => {
  await ensurePpBatchTicketUniqueIndex();
  const config = await getPpBatchConfig();

  if (config.is_active === false) {
    return { created: [], expired: [] };
  }

  const defaultCompletionThresholdHours = Number(config.completion_threshold_hours) > 0
    ? Number(config.completion_threshold_hours)
    : 24;
  const subDepartmentThresholds = await getPpBatchSubDepartmentThresholds();
  const notebookThresholds = await getPpNotebookThresholds();
  // Returns both the hours to use AND when the config that supplied them actually took effect,
  // so a PP entry that started before that specific notebook/sub-department threshold existed
  // isn't instantly judged against it - same reasoning as the Submission/Acknowledgement
  // Threshold fixes. The global default (defaultCompletionThresholdHours) has no creation
  // moment worth anchoring to - it's the always-there baseline, not a threshold someone just
  // set up - so anchoredAt is null (no floor) whenever nothing more specific is configured.
  const getCompletionThresholdForLabel = (label) => {
    const notebookRow = notebookThresholds.get(label);
    if (Number(notebookRow?.completion_threshold_hours) > 0) {
      return { hours: Number(notebookRow.completion_threshold_hours), anchoredAt: notebookRow.created_at };
    }
    const subDepartment = PP_BATCH_LABEL_TO_SUB_DEPARTMENT[label];
    const perSubDepartment = subDepartmentThresholds.get(subDepartment);
    if (Number(perSubDepartment?.hours) > 0) {
      return { hours: Number(perSubDepartment.hours), anchoredAt: perSubDepartment.anchoredAt };
    }
    return { hours: defaultCompletionThresholdHours, anchoredAt: null };
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

  // Only ever assign to users actually configured in PP Thresholds - no
  // blind "any 20 L1 users system-wide" fallback. If a screen's department
  // has nobody assigned yet (e.g. no L1 user is on record for "Blowroom"),
  // that screen simply contributes no approver until someone configures it,
  // rather than notifying everyone.
  const configuredL1UserIds = Array.isArray(config.approval_l1_user_ids) ? config.approval_l1_user_ids : [];
  const l1UserIdsByDepartment = await getL1UserIdsByDepartment();

  for (const row of grouped.rows) {
    const completedScreens = Array.isArray(row.completed_screens) ? row.completed_screens : [];
    const missingScreens = allLabels.filter((label) => !completedScreens.includes(label));
    if (!missingScreens.length) continue;

    const firstCreatedAt = new Date(row.first_created_at);
    const hoursElapsed = (Date.now() - firstCreatedAt.getTime()) / (1000 * 60 * 60);

    // One ticket per PP ID (entry_id), not per missing department - collect
    // every missing screen whose own sub-department/notebook TAT has already
    // elapsed and file a single consolidated ticket naming all of them. A
    // screen is only counted overdue if its threshold's own anchoredAt (when
    // that specific config was created/last edited) is on/before this PP
    // entry's first_created_at - a PP entry that started before a
    // notebook/sub-department threshold existed was never subject to it.
    const overdueScreens = missingScreens.filter((label) => {
      const { hours, anchoredAt } = getCompletionThresholdForLabel(label);
      if (anchoredAt && firstCreatedAt < new Date(anchoredAt)) return false;
      return hoursElapsed >= hours;
    });
    if (!overdueScreens.length) continue;

    // Guards against ever raising a second open ticket for the same
    // entry_id - only one open PP_BATCH_INCOMPLETE ticket per PP ID at a time.
    const existing = await client.query(
      `SELECT ticket_id
       FROM ticketing_system.operator_tickets
       WHERE (violation_details->>'ticket_type') = 'PP_BATCH_INCOMPLETE'
         AND (violation_details->>'entry_id') = $1
         AND status <> 'Closed'
       LIMIT 1`,
      [row.entry_id]
    );
    if (existing.rows[0]?.ticket_id) continue;

    // Union the L1 approvers responsible for each overdue screen - manually
    // configured approvers on the notebook's own threshold row win first,
    // then whoever's real department (users.user_details.department) matches
    // that screen's sub-department, and only the generic pool if neither
    // resolves anyone (e.g. no L1 user is on record for that department yet).
    const approvalL1UserIdsSet = new Set();
    const severityRank = { High: 3, Medium: 2, Low: 1 };
    let ticketSeverity = 'High';
    for (const label of overdueScreens) {
      const notebookRow = notebookThresholds.get(label);
      const subDepartment = PP_BATCH_LABEL_TO_SUB_DEPARTMENT[label];
      const departmentIds = l1UserIdsByDepartment.get(normalizeDepartmentKey(subDepartment)) || [];
      const ids = (Array.isArray(notebookRow?.approval_l1_user_ids) && notebookRow.approval_l1_user_ids.length)
        ? notebookRow.approval_l1_user_ids
        : departmentIds.length
          ? departmentIds
          : configuredL1UserIds;
      ids.forEach((id) => approvalL1UserIdsSet.add(id));
      if ((severityRank[notebookRow?.severity] || 0) > (severityRank[ticketSeverity] || 0)) {
        ticketSeverity = notebookRow.severity;
      }
    }
    const approvalL1UserIds = approvalL1UserIdsSet.size ? Array.from(approvalL1UserIdsSet) : configuredL1UserIds;

    const screenThresholds = Object.fromEntries(
      overdueScreens.map((label) => [label, getCompletionThresholdForLabel(label).hours])
    );

    const violationDetails = {
      category: 'MISSED_FREQUENCY',
      ticket_type: 'PP_BATCH_INCOMPLETE',
      entry_id: row.entry_id,
      first_created_at: row.first_created_at,
      completed_screens: completedScreens,
      missing_screens: missingScreens,
      overdue_screens: overdueScreens,
      screen_thresholds: screenThresholds,
      message: `Process Parameter ${row.entry_id} was not completed within threshold. Missing: ${overdueScreens.join(', ')}.`
    };

    // PP Entry Threshold is raised on L1 first (they fix/resubmit the missing
    // entry), but - same as every other threshold type - escalates to
    // L2/L3/L4/L5 via runPpBatchTatCheck below if L1 doesn't act within
    // pp_batch_config.l2_tat_hours. The separate PP Approval ticket (see
    // createPpApprovalTicket in processParameters.js) is a different ticket
    // that only fires once every department's entry is in.
    const l2TatHours = Number(config.l2_tat_hours) > 0 ? Number(config.l2_tat_hours) : null;
    const l1TatDueAt = l2TatHours ? new Date(Date.now() + l2TatHours * 60 * 60 * 1000).toISOString() : null;

    const ticketId = await generateTicketId(client);
    let inserted;
    try {
      const ticket = await client.query(
        `INSERT INTO ticketing_system.operator_tickets
         (ticket_id, machine_name, parameter_name, actual_value, threshold_value,
          severity, status, created_at, ticket_reason, ticket_type, ticket_kind,
          violation_details, approval_l1_user_ids, tat_current_level, l1_tat_due_at)
         VALUES (
           $1,
           $2, $3::jsonb, $4::jsonb, $5::jsonb,
           $8, 'Open', NOW(), 'MISSING_VALUE', 'PP_BATCH_INCOMPLETE', 'pp_batch',
           $6::jsonb, $7::int[], 'L1', $9
         )
         RETURNING *`,
        [
          ticketId,
          row.entry_id,
          toJson(overdueScreens, []),
          toJson(completedScreens, []),
          toJson({ screen_thresholds: screenThresholds }, {}),
          toJson(violationDetails, {}),
          approvalL1UserIds,
          ticketSeverity,
          l1TatDueAt
        ]
      );
      inserted = ticket.rows[0];
    } catch (error) {
      // 23505 = operator_tickets_pp_batch_open_uq - another run already
      // raised this entry_id's ticket first.
      if (error?.code !== '23505') throw error;
      continue; // eslint-disable-line no-continue
    }
    created.push(inserted);

    await createNotificationsForUsers(approvalL1UserIds, {
      ticketId: inserted.ticket_id,
      type: 'PP_BATCH_INCOMPLETE',
      category: 'Tickets',
      priority: 'High',
      title: (user) => `Hi ${user.full_name || 'there'} (L1), PP entry ${row.entry_id} needs your action`,
      body: (user) =>
        `${user.full_name || 'You'} (L1) - PP entry ${row.entry_id} is missing: ${overdueScreens.join(', ')}. Please fix and resubmit.`,
      linkUrl: `/supervisor-tickets/${inserted.ticket_id}`,
      payload: { ticket_id: inserted.ticket_id, entry_id: row.entry_id }
    });
  }

  return { created, expired: [] };
};

// PP Entry Threshold escalation: an open PP_BATCH_INCOMPLETE ticket goes
// straight from L1 to L4 once L1's TAT elapses without action - PP
// Thresholds only ever configures L1 and L4 approvers (no L2/L3 row exists
// anywhere in pp_notebook_threshold), matching PP Approval, Wheel Change
// Approval, and Acknowledgement, which are all L4-only too. This previously
// walked a generic L1->L2->L3->L4->L5 tier ladder (copied from Submission
// Frequency's real multi-level chain) that had nothing real to resolve at
// L2/L3, so a PP ticket auto-escalating on TAT timeout (as opposed to a
// manual L1 submit, which already went straight to L4) still ended up
// sitting at L2 - the same target level as every other ticket type, but
// wrong for PP specifically.
// L1's escalation deadline is governed by Ticket Resolution SLA's L1 row
// (the same config that drives the "Overdue" badge everywhere else), not a
// separate pp_batch_config.l2_tat_hours field - that field was never
// actually set through any settings screen, so l1_tat_due_at came out null
// on every ticket and this check never found anything to escalate. Ticket
// Resolution SLA is already actively configured (checked live via
// created_at + resolution_hours, same as isTicketOverdueBySla on the
// frontend), so it's the one real source of truth for this timing.
const runPpBatchTatCheck = async () => {
  const notebookThresholds = await getPpNotebookThresholds();

  const dueTickets = await client.query(
    `SELECT ot.* FROM ticketing_system.operator_tickets ot
     JOIN ticketing_system.ticket_resolution_sla sla
       ON sla.level = 'L1' AND sla.is_active = true
     WHERE ot.ticket_type = 'PP_BATCH_INCOMPLETE'
       AND ot.tat_current_level = 'L1'
       AND ot.status <> 'Closed'
       AND ot.created_at + (sla.resolution_hours || ' hours')::interval <= NOW()`
  );

  const escalated = [];
  for (const ticket of dueTickets.rows) {
    const overdueScreens = Array.isArray(ticket.violation_details?.overdue_screens) && ticket.violation_details.overdue_screens.length
      ? ticket.violation_details.overdue_screens
      : Array.isArray(ticket.parameter_name) ? ticket.parameter_name : [];
    const l4Set = new Set();
    for (const label of overdueScreens) {
      const notebookRow = notebookThresholds.get(label);
      (Array.isArray(notebookRow?.approval_l4_user_ids) ? notebookRow.approval_l4_user_ids : [])
        .forEach((id) => l4Set.add(Number(id)));
    }
    const nextApproverIds = Array.from(l4Set).filter((id) => Number.isInteger(id) && id > 0);

    // eslint-disable-next-line no-await-in-loop
    const result = await client.query(
      `UPDATE ticketing_system.operator_tickets
       SET tat_current_level = 'L4',
           approval_l4_user_ids = $1
       WHERE ticket_id = $2
       RETURNING *`,
      [nextApproverIds, ticket.ticket_id]
    );
    if (result.rows[0]) escalated.push(result.rows[0]);

    const entryId = ticket?.violation_details?.entry_id || '';
    if (nextApproverIds.length) {
      // eslint-disable-next-line no-await-in-loop
      await createNotificationsForUsers(nextApproverIds, {
        ticketId: ticket.ticket_id,
        type: 'PP_BATCH_INCOMPLETE',
        category: 'Tickets',
        priority: 'High',
        title: (user) => `Hi ${user.full_name || 'there'} (L4), PP entry needs your action`,
        body: (user) =>
          `${user.full_name || 'You'} (L4) - this PP entry was not actioned at L1 in time and has escalated to L4.`,
        linkUrl: `/supervisor-tickets/${ticket.ticket_id}`,
        payload: { ticket_id: ticket.ticket_id, entry_id: entryId }
      });
    }
  }

  return escalated;
};

const getAcknowledgementThresholdSelectColumns = async () => {
  const result = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'ticketing_system'
      AND table_name = 'notebook_acknowledgement_threshold'
  `);
  const columns = new Set(result.rows.map((row) => row.column_name));
  const selected = [
    'id',
    'screen_name',
    'department',
    'sub_department',
    'acknowledge_within_hours',
    'is_active',
    'approval_l4',
    'approval_l4_name',
    'l4_tat_hours',
    'criticality',
    'created_at',
    'updated_at'
  ];

  if (!columns.has('criticality')) {
    selected[selected.indexOf('criticality')] = `'High'::text AS criticality`;
  }
  if (!columns.has('approval_l4')) {
    selected[selected.indexOf('approval_l4')] = `NULL::text AS approval_l4`;
  }
  if (!columns.has('approval_l4_name')) {
    selected[selected.indexOf('approval_l4_name')] = `NULL::text AS approval_l4_name`;
  }
  if (!columns.has('l4_tat_hours')) {
    selected[selected.indexOf('l4_tat_hours')] = `NULL::integer AS l4_tat_hours`;
  }

  return selected.join(', ');
};

const getSubmissionFrequencyConfigForNotebook = async (submission) => {
  const result = await client.query(
    `SELECT id, screen_name, department, sub_department, "range", frequency,
            approval_l1, criticality
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
  const result = await client.query(
    `SELECT id, screen_name, department, sub_department, "range", frequency,
            approval_l1, criticality
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
  const result = await client.query(
    `SELECT id, screen_name, department, sub_department, acknowledge_within_hours,
            approval_l4, approval_l4_name, l4_tat_hours, criticality, created_at
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
  const notebookSubmissionId = buildSubmissionId({ notebook, entryId, sourceTable, sourceRecordId });

  // ack_due_at was always a flat 24 hours regardless of what's actually
  // configured on the Acknowledgement Threshold screen for this notebook
  // (e.g. Cotton HVI Data Entry's own acknowledge_within_hours row) - look
  // it up the same way generateOverdueNotebookTickets does, so a notebook
  // configured for a shorter/longer window is honored from the moment the
  // submission is recorded, not just when checking it later.
  const acknowledgementThreshold = await getAcknowledgementThresholdForNotebook({
    input_screen: notebook,
    notebook,
    department,
    sub_department: subDepartment
  });
  const ackWithinHours = Number(acknowledgementThreshold?.acknowledge_within_hours) > 0
    ? Number(acknowledgementThreshold.acknowledge_within_hours)
    : 24;

  const result = await client.query(
    `INSERT INTO ticketing_system.submitted_notebooks
     (notebook_submission_id, department, sub_department, notebook, input_screen, entry_id,
      source_schema, source_table, source_record_id, submitted_by_user_id, submitted_by_name,
      submitted_payload, submitted_at, ack_due_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb, NOW(), NOW() + ($13 || ' hours')::interval)
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
      toJson(submittedPayload, {}),
      ackWithinHours
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

// Approval itself is restricted to L4/L5 (mirrors frontend
// isSubmittedNotebookApproverUser in utils/accessControl.js).
const canApproveSubmission = (req) => isAdminRequester(req) || ['L4', 'L5'].includes(getRequesterLevel(req));

// L5/admin see every submitted notebook. L4 is scoped to only the notebooks
// they were actually assigned to acknowledge (l4_approver_user_ids contains
// their own id) - not every submission system-wide, so one L4 user (e.g.
// Sneha) never sees notebooks assigned to a different L4 user. Everyone
// below L4 is scoped by getVisibleSubmitterIds below, based on the real
// users.user_details reports_to_user_id org chart - NOT the
// l2_approver_user_ids/l3_approver_user_ids columns on submitted_notebooks
// rows. Those columns are populated per-notebook-type from the manually-
// configured Acknowledgement Threshold (see the POST '/' handler's
// "Notebook approval moved from L2 to L4" comment) - they hold whichever
// L4 approver was configured for that specific notebook type, and are an
// empty array for any notebook type with no threshold configured (which is
// most of them - only Mixing's 8 screens have one at the time of writing).
// They tell you nothing about a submitter's actual L2/L3 manager, so they
// can't be used to scope L2/L3 visibility.
const canViewAllSubmissions = (req) => isAdminRequester(req) || getRequesterLevel(req) === 'L5';
const isL4Requester = (req) => getRequesterLevel(req) === 'L4';

const getDirectReportIds = async (managerId) => {
  if (!managerId) return [];
  const result = await client.query(
    `SELECT id FROM users.user_details WHERE reports_to_user_id = $1`,
    [managerId]
  );
  return result.rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
};

// submitted_by_user_id values a non-L4/L5/admin requester may see:
// L1 (or no recognized level) - just their own submissions.
// L2 - their own, plus their direct L1 reports'.
// L3 - their own, plus their direct L2 reports', plus those L2s' L1 reports'.
const getVisibleSubmitterIds = async (req) => {
  const requesterId = parsePositiveInt(req.user?.id);
  if (!requesterId) return [];
  const level = getRequesterLevel(req);

  if (level === 'L3') {
    const mappedL2Ids = await getDirectReportIds(requesterId);
    const mappedL1Ids = (await Promise.all(mappedL2Ids.map(getDirectReportIds))).flat();
    return [requesterId, ...mappedL2Ids, ...mappedL1Ids];
  }

  if (level === 'L2') {
    const mappedL1Ids = await getDirectReportIds(requesterId);
    return [requesterId, ...mappedL1Ids];
  }

  return [requesterId];
};

const canViewSubmission = async (req, row) => {
  if (canViewAllSubmissions(req)) return true;
  if (isL4Requester(req)) {
    const requesterId = parsePositiveInt(req.user?.id);
    return Array.isArray(row.l4_approver_user_ids) && row.l4_approver_user_ids.map(Number).includes(requesterId);
  }
  const visibleIds = await getVisibleSubmitterIds(req);
  return visibleIds.includes(row.submitted_by_user_id);
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
  await ensureNotificationMetadataColumns();

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
    // eslint-disable-next-line no-await-in-loop
    try {
      await processOverdueNotebookSubmission(submission, created);
    } catch (error) {
      // 23505 = unique_violation on operator_tickets_ack_notebook_submission_uq -
      // two overlapping runs of this same check-then-insert (e.g. two backend
      // instances briefly running at once) both passed the "does a ticket
      // already exist?" check before either committed its INSERT; the DB
      // constraint is what actually stopped the duplicate. Log and move on to
      // the rest of the batch instead of letting one collision here abort
      // every other still-due notebook in this run - they'll just be picked
      // up again, deduped by the existingTicket check above, next cycle.
      if (error?.code === '23505') {
        console.warn(`[notebook-ack] overdue ticket for submission ${submission.id} already exists (raced with another run) - skipping`);
        continue; // eslint-disable-line no-continue
      }
      throw error;
    }
  }

  // Acknowledgement Threshold is a flat, L4-only ticket - it does not
  // escalate further.
  return { created, escalated: [] };
};

const processOverdueNotebookSubmission = async (submission, created) => {
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
      return;
    }

    const acknowledgementThreshold = await getAcknowledgementThresholdForNotebook(submission);
    // Every submission gets a submitted_notebooks row with a default 24-hour
    // ack_due_at regardless of whether this screen has Acknowledgement
    // configured at all (that default only exists so recordPpNotebookSubmission
    // has something to write - see its own comment). Without requiring an
    // actual active threshold row here, the chain fallback below would still
    // find SOME L4 via the submitter's real reporting hierarchy for almost
    // any notebook, and a ticket got raised anyway - "random" Acknowledgement
    // tickets for screens nobody ever configured Acknowledgement for. An
    // active, matching notebook_acknowledgement_threshold row is now a hard
    // requirement for a ticket to exist at all, not just for who receives it.
    if (!acknowledgementThreshold) return;

    // A submission made BEFORE this threshold was created/activated was never actually subject
    // to it - ack_due_at on that row is a flat 24h default computed at submission time (see
    // recordPpNotebookSubmission), unrelated to whatever threshold happens to exist now. Without
    // this check, creating a brand new Acknowledgement Threshold for a screen would instantly
    // sweep in every already-overdue pre-existing submission on that screen (potentially weeks of
    // backlog) as soon as the next worker cycle runs, rather than only judging submissions made
    // once the threshold actually existed - same reasoning as the Submission Threshold fix.
    if (new Date(submission.submitted_at) < new Date(acknowledgementThreshold.created_at)) return;

    // Acknowledgement Threshold is L4-only: once the notebook is submitted,
    // the L4 timer starts, and if it is not acknowledged by the due time we
    // create exactly one review ticket for the resolved L4 approver.
    const resolvedChain = await resolveEscalationChainForSubmitter(submission.submitted_by_user_id);
    const manualL4Ids = acknowledgementThreshold?.approval_l4
      ? String(acknowledgementThreshold.approval_l4)
          .split(',')
          .map((value) => parseInt(value.trim(), 10))
          .filter((value) => Number.isInteger(value) && value > 0)
      : [];
    const l4ApproverIds = manualL4Ids.length ? manualL4Ids : resolvedChain.l4;
    // Threshold exists and is active, but no manual L4 was set on it and none
    // resolves from the submitter's real reporting chain either - nobody is
    // actually assigned to receive this, so no ticket should be raised
    // blindly notifying every L4 user system-wide.
    if (!l4ApproverIds.length) return;
    const violationDetails = {
      category: 'MISSED_FREQUENCY',
      ticket_type: 'NOTEBOOK_ACK_OVERDUE',
      action_type: 'ACKNOWLEDGE_ONLY',
      submitted_notebook_id: submission.id,
      notebook_submission_id: submission.notebook_submission_id,
      entry_id: submission.entry_id || null,
      ack_due_at: submission.ack_due_at,
      message: 'Submitted notebook was not acknowledged within the configured time.'
    };

    const ticketId = await generateTicketId(client);
    const ticket = await client.query(
      `INSERT INTO ticketing_system.operator_tickets
       (ticket_id, user_id, user_name, machine_name, parameter_name, actual_value, threshold_value,
        severity, status, created_at, management_field, erp_product_code, ticket_reason, ticket_type,
        violation_details, approval_l4_user_ids, tat_current_level)
       VALUES (
         $1,
         $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb,
         $12, 'Open', NOW(), $8, $9, 'MISSING_VALUE', 'REVIEW',
         $10::jsonb, $11::int[], 'L4'
       )
       RETURNING *`,
      [
        ticketId,
        submission.submitted_by_user_id,
        submission.submitted_by_name,
        submission.input_screen || submission.notebook,
        toJson(['Acknowledgement overdue'], []),
        toJson(submission.submitted_payload || {}, {}),
        toJson({ acknowledge_by: submission.ack_due_at }, {}),
        submission.department,
        submission.sub_department,
        toJson(violationDetails, {}),
        l4ApproverIds,
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
    if (l4ApproverIds.length) {
      await createNotificationsForUsers(l4ApproverIds, {
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
};

router.use(auth);

router.post('/acknowledgement-thresholds', async (req, res, next) => {
  try {
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
    // Department/Notebook/Criticality/L4/Approved-Within on its own now, so
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
        approval_l4, approval_l4_name, l4_tat_hours, criticality, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (screen_name, department, sub_department)
       DO UPDATE SET
         acknowledge_within_hours = EXCLUDED.acknowledge_within_hours,
         is_active = EXCLUDED.is_active,
         approval_l4 = EXCLUDED.approval_l4,
         approval_l4_name = EXCLUDED.approval_l4_name,
         l4_tat_hours = EXCLUDED.l4_tat_hours,
         criticality = EXCLUDED.criticality,
         updated_at = NOW()
       RETURNING *`,
      [
        screenName,
        department,
        subDepartment,
        acknowledgeWithinHours,
        req.body?.is_active !== undefined ? Boolean(req.body.is_active) : true,
        cleanText(req.body?.approval_l4),
        cleanText(req.body?.approval_l4_name),
        parseTatHours(req.body?.l4_tat_hours) || null,
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
    const selectColumns = await getAcknowledgementThresholdSelectColumns();
    const result = await client.query(
      `SELECT ${selectColumns}
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

    const { id } = req.params;
    const {
      screen_name,
      department,
      sub_department,
      acknowledge_within_hours,
      is_active,
      approval_l4,
      approval_l4_name,
      l4_tat_hours,
      criticality
    } = req.body || {};

    const normalizedAcknowledgeWithinHours =
      acknowledge_within_hours === undefined ? undefined : parseTatHours(acknowledge_within_hours);
    if (acknowledge_within_hours !== undefined && !normalizedAcknowledgeWithinHours) {
      return res.status(400).json({ message: 'acknowledge_within_hours must be a positive integer' });
    }

    const normalizedL4TatHours = l4_tat_hours === undefined ? undefined : parseTatHours(l4_tat_hours);

    const result = await client.query(
      `UPDATE ticketing_system.notebook_acknowledgement_threshold
       SET screen_name = COALESCE($1, screen_name),
           department = COALESCE($2, department),
           sub_department = COALESCE($3, sub_department),
           acknowledge_within_hours = COALESCE($4, acknowledge_within_hours),
           is_active = COALESCE($5, is_active),
           approval_l4 = COALESCE($6, approval_l4),
           approval_l4_name = COALESCE($7, approval_l4_name),
           l4_tat_hours = COALESCE($8, l4_tat_hours),
           criticality = COALESCE($9, criticality),
           updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        cleanText(screen_name),
        cleanText(department),
        cleanText(sub_department),
        normalizedAcknowledgeWithinHours,
        is_active,
        cleanText(approval_l4),
        cleanText(approval_l4_name),
        normalizedL4TatHours,
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

    // Deleting the threshold that raised a ticket shouldn't leave that
    // ticket open forever with nothing behind it anymore - matches
    // processOverdueNotebookSubmission's own "no active threshold, no
    // ticket" rule. Tickets don't carry this config's id, only the screen
    // name (machine_name) they were raised for, so match on that.
    const deletedScreenName = result.rows[0]?.screen_name;
    if (deletedScreenName) {
      await client.query(
        `UPDATE ticketing_system.operator_tickets
         SET status = 'Closed'
         WHERE (violation_details->>'ticket_type') = 'NOTEBOOK_ACK_OVERDUE'
           AND status <> 'Closed'
           AND LOWER(TRIM(machine_name)) = LOWER(TRIM($1))`,
        [deletedScreenName]
      );
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
// Notebook-level PP configuration: shared timing plus the responsible L1
// and approval users for that notebook.
router.get('/pp-notebook-threshold', async (req, res, next) => {
  try {
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
    const result = await client.query(
      `DELETE FROM ticketing_system.pp_notebook_threshold WHERE id = $1 RETURNING id, notebook_label`,
      [req.params.id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ message: 'PP notebook threshold not found' });
    }
    // Same reasoning as the Acknowledgement/Submission threshold deletes -
    // don't leave a PP_APPROVAL ticket open forever referencing a notebook
    // config that no longer exists. This only closes the reminder ticket
    // itself; the PP id's own review still happens through the real PP
    // Approvals queue regardless of whether a ticket exists for it.
    const deletedNotebookLabel = result.rows[0]?.notebook_label;
    if (deletedNotebookLabel) {
      await client.query(
        `UPDATE ticketing_system.operator_tickets
         SET status = 'Closed'
         WHERE ticket_type = 'PP_APPROVAL'
           AND status <> 'Closed'
           AND (violation_details->>'notebook_label') = $1`,
        [deletedNotebookLabel]
      );
    }
    return res.status(200).json({ message: 'PP notebook threshold deleted successfully' });
  } catch (error) {
    next(error);
  }
});

router.patch('/pp-notebook-threshold/:id/status', async (req, res, next) => {
  try {
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
    const escalated = await runPpBatchTatCheck();
    return res.status(200).json({
      success: true,
      created_count: created.length,
      expired_count: expired.length,
      escalated_count: escalated.length,
      tickets: created,
      expired_tickets: expired,
      escalated_tickets: escalated
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
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
    // Resolve the acknowledgement deadline from the saved L4 threshold row.
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

    // Acknowledgement approvals are L4-only now.
    const l4ApproverUserIds = await getL4ApproverIds(
      req.body?.l4_approver_user_ids ||
      req.body?.approval_l4_user_ids ||
      req.body?.l4_approver_employee_ids ||
      req.body?.approval_l4_employee_ids ||
      req.body?.l4_approver_employee_id ||
      req.body?.approval_l4_employee_id ||
      req.body?.assigned_l4 ||
      (acknowledgementThreshold?.approval_l4
        ? acknowledgementThreshold.approval_l4.split(',').map((value) => value.trim()).filter(Boolean)
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
      [],
      { useDefault: false }
    );

    const result = await client.query(
      `INSERT INTO ticketing_system.submitted_notebooks
       (notebook_submission_id, department, sub_department, notebook, input_screen, entry_id,
        source_schema, source_table, source_record_id, submitted_by_user_id, submitted_by_name,
        submitted_payload, l4_approver_user_ids, l3_approver_user_ids, submitted_at, ack_due_at)
       VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::int[],$14::int[],
         COALESCE($15::timestamptz, NOW()),
         COALESCE($16::timestamptz, COALESCE($15::timestamptz, NOW()) + INTERVAL '24 hours')
       )
       ON CONFLICT (notebook_submission_id)
       DO UPDATE SET
         submitted_payload = EXCLUDED.submitted_payload,
         l4_approver_user_ids = EXCLUDED.l4_approver_user_ids,
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
        l4ApproverUserIds,
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

// --- Server-side list enrichment/filtering -------------------------------
// Ported from the frontend's own SubmittedNotebooksPage.jsx enrichment
// functions (getNotebookOperatorName/getNotebookSupervisorName/
// isNotebookPendingAcknowledgement) so pagination + the Notebook Type/
// Operator/Supervisor filters can all be resolved and counted server-side
// instead of requiring every matching row to be fetched into the browser
// first. department/sub_department/notebook are trusted directly off the
// row (always populated at submission time - see the INSERT above) rather
// than replicating the frontend's screen-name-inference fallback, which only
// ever matters for legacy rows missing those columns entirely.
const normalizeLookupText = (value) =>
  String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const normalizeNameListText = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return value === undefined || value === null || value === '' ? [] : [String(value).trim()];
};

const getUserDisplayNameText = (user) => String(user?.full_name || '').trim();

const resolveUserNameText = (users, value) => {
  const normalizedValue = normalizeLookupText(value);
  if (!normalizedValue) return '';

  const matchedUser = users.find((userItem) => {
    const candidateValues = [userItem?.id, userItem?.employee_id, userItem?.full_name];
    return candidateValues.some((candidate) => normalizeLookupText(candidate) === normalizedValue);
  });

  return getUserDisplayNameText(matchedUser) || String(value ?? '').trim();
};

const resolveDisplayValuesText = (users, candidates) => {
  for (const candidate of candidates) {
    const labels = normalizeNameListText(candidate)
      .map((value) => resolveUserNameText(users, value))
      .filter(Boolean);
    if (labels.length) return labels;
  }
  return [];
};

const getUsersDisplayNamesText = (userList) =>
  (Array.isArray(userList) ? userList : []).map((user) => getUserDisplayNameText(user)).filter(Boolean);

const isNotebookPendingAcknowledgementRow = (row) => {
  if (row?.acknowledged_at || row?.acknowledged_by_name) return false;
  const status = normalizeLookupText(row?.status);
  if (!status) return true;
  return !['acknowledged', 'ack', 'completed', 'closed', 'approved'].includes(status);
};

const getNotebookOperatorNameText = (row, users) => {
  const names = resolveDisplayValuesText(users, [
    ...normalizeNameListText(row?.submitted_by_name),
  ]);
  if (names.length) return names[0];

  const ids = resolveDisplayValuesText(users, [...normalizeNameListText(row?.submitted_by_user_id)]);
  if (ids.length) return ids[0];

  return String(row?.submitted_by_name || '').trim() || '--';
};

const getNotebookSupervisorNameText = (row) => {
  const acknowledgedByName = String(row?.acknowledged_by_name || '').trim();
  if (acknowledgedByName) return acknowledgedByName;

  const assignedL5Names = getUsersDisplayNamesText(row?.assigned_l5_users);
  if (assignedL5Names.length) return assignedL5Names.join(', ');

  const assignedL4Names = getUsersDisplayNamesText(row?.assigned_l4_users);
  if (assignedL4Names.length) return assignedL4Names.join(', ');

  const assignedL3Names = getUsersDisplayNamesText(row?.assigned_l3_users);
  if (assignedL3Names.length) return assignedL3Names.join(', ');

  const assignedL2Names = getUsersDisplayNamesText(row?.assigned_l2_users);
  if (assignedL2Names.length) return assignedL2Names.join(', ');

  return '--';
};

const getNotebookTitleText = (row) =>
  row?.notebook || row?.input_screen || 'Cotton HVI';

const getNotebookCreatedAt = (row) =>
  row?.submitted_at || row?.created_at || row?.ack_due_at || null;

// Builds { departments, sub_departments, notebook_types, operators, supervisors }
// the same cascading way the frontend's filterOptions useMemo did: each list is
// scoped by every filter to its left, not by itself, so picking a department
// narrows Sub Department/Notebook Type/Operator/Supervisor without also
// narrowing the Department list itself.
const buildSubmittedNotebookFilterOptions = (enrichedRows, filters) => {
  const uniqueValues = (values) =>
    Array.from(new Set(values.filter((value) => value && value !== '--'))).sort((left, right) =>
      left.localeCompare(right)
    );

  const byDepartment = enrichedRows.filter(
    (item) => !filters.department || item.department === filters.department
  );
  const bySubDepartment = byDepartment.filter(
    (item) => !filters.subDepartment || item.subDepartment === filters.subDepartment
  );
  const byNotebookType = bySubDepartment.filter(
    (item) => !filters.notebookType || item.title === filters.notebookType
  );
  const byOperator = byNotebookType.filter(
    (item) => !filters.operator || item.operator === filters.operator
  );
  const bySupervisor = byOperator.filter(
    (item) => !filters.supervisor || item.supervisor === filters.supervisor
  );

  return {
    departments: uniqueValues(enrichedRows.map((item) => item.department)),
    sub_departments: uniqueValues(byDepartment.map((item) => item.subDepartment)),
    notebook_types: uniqueValues(bySubDepartment.map((item) => item.title)),
    operators: uniqueValues(byNotebookType.map((item) => item.operator)),
    supervisors: uniqueValues(byOperator.map((item) => item.supervisor)),
    entry_ids: uniqueValues(bySupervisor.map((item) => item.entry_id)),
  };
};

router.get('/', async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const requestedLimit = parsePositiveInt(req.query.limit, 20);
    const limit = Math.min(requestedLimit, MAX_LIMIT);

    const tab = cleanText(req.query.tab) === 'closed' ? 'closed' : 'pending';
    const filters = {
      department: cleanText(req.query.department) || '',
      subDepartment: cleanText(req.query.sub_department || req.query.subDepartment) || '',
      notebookType: cleanText(req.query.notebook_type || req.query.notebookType) || '',
      operator: cleanText(req.query.operator) || '',
      supervisor: cleanText(req.query.supervisor) || '',
      entryId: cleanText(req.query.entry_id || req.query.entryId) || '',
    };
    const dateFrom = cleanText(req.query.date_from || req.query.dateFrom);
    const dateTo = cleanText(req.query.date_to || req.query.dateTo);

    // The submitted-notebooks list is restricted to L5/admin (mirrors frontend
    // isSubmittedNotebookViewerUser) seeing everything; L4 only sees notebooks
    // they were actually assigned to (l4_approver_user_ids contains their own
    // id) - not every L4's notebooks; everyone else stays scoped to their own
    // submissions plus their real org-chart reports (see getVisibleSubmitterIds
    // - based on reports_to_user_id, not the per-notebook-type l2/l3_approver_
    // user_ids columns). Mirrors canViewSubmission below, used by GET /:id.
    const canViewAll = canViewAllSubmissions(req);
    const where = [];
    const params = [];
    if (canViewAll) {
      // no restriction - full visibility
    } else if (isL4Requester(req)) {
      const requesterId = parsePositiveInt(req.user?.id);
      params.push(requesterId);
      where.push(`$${params.length} = ANY(l4_approver_user_ids)`);
    } else {
      const visibleSubmitterIds = await getVisibleSubmitterIds(req);
      params.push(visibleSubmitterIds);
      where.push(`submitted_by_user_id = ANY($${params.length}::int[])`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Department/Sub Department/Notebook Type/Operator/Supervisor/date-range and the
    // Pending-vs-Closed tab are all resolved and filtered here in JS (mirroring the
    // frontend's own enrichment/filtering it used to do after fetching everything into
    // the browser) rather than in SQL, since Operator/Supervisor require cross-
    // referencing the users list and an L2-L5 approval priority chain, not a plain
    // column match. Only the hierarchy-access scope stays a SQL WHERE, since that one's
    // a straightforward column/array check.
    const rowsResult = await client.query(
      `SELECT id, notebook_submission_id, department, sub_department, notebook, input_screen, entry_id,
              submitted_by_user_id, submitted_by_name, l2_approver_user_ids, l3_approver_user_ids,
              l4_approver_user_ids, l5_approver_user_ids, status,
              submitted_at, ack_due_at, acknowledged_at, acknowledged_by_name, acknowledgement_note,
              overdue_ticket_id, overdue_ticket_created_at, created_at, updated_at
       FROM ticketing_system.submitted_notebooks
       ${whereSql}
       ORDER BY submitted_at DESC, id DESC`,
      params
    );

    const assignedById = new Map();
    const allApproverIds = Array.from(new Set(rowsResult.rows.flatMap((row) => [
      ...(row.l2_approver_user_ids || []),
      ...(row.l3_approver_user_ids || []),
      ...(row.l4_approver_user_ids || []),
      ...(row.l5_approver_user_ids || []),
    ])));
    if (allApproverIds.length) {
      const assignedUsers = await getAssignedL2Users(allApproverIds);
      for (const user of assignedUsers) assignedById.set(Number(user.id), user);
    }

    // Operator-name resolution needs the full users list (submitted_by_user_id/name can
    // point at anyone, not just an approver) - same cross-reference the frontend did
    // against its own separately-fetched users list.
    const allUsersResult = await client.query(`SELECT id, employee_id, full_name FROM users.user_details`);
    const allUsers = allUsersResult.rows;

    // requiresAcknowledgement only gates whether an overdue ticket gets raised
    // (see generateOverdueNotebookTickets, which skips that when no
    // threshold/L4 resolves) - it must NOT also gate which tab a submission
    // shows under, or notebooks from screens with no configured threshold
    // silently fall into "Closed" while still unacknowledged. isPending
    // reflects acknowledgement state alone; requiresAcknowledgement is kept
    // on the row for the frontend to use for ticket-related UI.

    const activeThresholdsResult = await client.query(
      `SELECT screen_name FROM ticketing_system.notebook_acknowledgement_threshold WHERE is_active = true`
    );
    const acknowledgeableScreenNames = new Set(
      activeThresholdsResult.rows.map((row) => normalizeLookupText(row.screen_name)).filter(Boolean)
    );

    const enriched = rowsResult.rows.map((row) => {
      const withAssignments = {
        ...row,
        assigned_l2_users: (row.l2_approver_user_ids || []).map((id) => assignedById.get(Number(id))).filter(Boolean),
        assigned_l3_users: (row.l3_approver_user_ids || []).map((id) => assignedById.get(Number(id))).filter(Boolean),
        assigned_l4_users: (row.l4_approver_user_ids || []).map((id) => assignedById.get(Number(id))).filter(Boolean),
        assigned_l5_users: (row.l5_approver_user_ids || []).map((id) => assignedById.get(Number(id))).filter(Boolean),
      };
      const requiresAcknowledgement = acknowledgeableScreenNames.has(
        normalizeLookupText(row.input_screen || row.notebook)
      );

      return {
        ...withAssignments,
        department: String(row.department || '').trim(),
        subDepartment: String(row.sub_department || '').trim(),
        title: getNotebookTitleText(row),
        operator: getNotebookOperatorNameText(row, allUsers),
        supervisor: getNotebookSupervisorNameText(withAssignments),
        createdAt: getNotebookCreatedAt(row),
        requiresAcknowledgement,
        isPending: isNotebookPendingAcknowledgementRow(row),
      };
    });

    const tabFiltered = enriched.filter((item) => (tab === 'closed' ? !item.isPending : item.isPending));
    const filterOptions = buildSubmittedNotebookFilterOptions(tabFiltered, filters);

    const dateFromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const dateToTime = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

    const finalFiltered = tabFiltered.filter((item) => {
      if (filters.department && item.department !== filters.department) return false;
      if (filters.subDepartment && item.subDepartment !== filters.subDepartment) return false;
      if (filters.notebookType && item.title !== filters.notebookType) return false;
      if (filters.operator && item.operator !== filters.operator) return false;
      if (filters.supervisor && item.supervisor !== filters.supervisor) return false;
      if (filters.entryId && item.entry_id !== filters.entryId) return false;
      const createdAtTime = item.createdAt ? new Date(item.createdAt).getTime() : 0;
      if (dateFromTime !== null && createdAtTime < dateFromTime) return false;
      if (dateToTime !== null && createdAtTime > dateToTime) return false;
      return true;
    });

    const total = finalFiltered.length;
    const offset = (page - 1) * limit;
    const pageRows = finalFiltered.slice(offset, offset + limit);

    return res.status(200).json({
      submitted_notebooks: pageRows,
      data: pageRows,
      pagination: { page, limit, total },
      filter_options: filterOptions,
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
    const value = cleanText(req.params.id);
    const result = await client.query(
      `SELECT *
       FROM ticketing_system.submitted_notebooks
       WHERE id::text = $1 OR notebook_submission_id = $1`,
      [value]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Submitted notebook not found' });
    const row = result.rows[0];
    if (!(await canViewSubmission(req, row))) return res.status(403).json({ message: 'You are not authorized to view this submitted notebook' });
    // Same "does this screen even have acknowledgement configured" gate as
    // GET / (the list endpoint) - without it, this single-record fetch (used
    // by the ?openNotebookId= deep link) still fell back to the raw
    // PENDING_ACK-by-default status and treated every notebook as pending.
    const acknowledgementThreshold = await getAcknowledgementThresholdForNotebook(row);
    return res.status(200).json({
      submitted_notebook: {
        ...row,
        assigned_l2_users: await getAssignedL2Users(row.l2_approver_user_ids),
        assigned_l3_users: await getAssignedL2Users(row.l3_approver_user_ids),
        requiresAcknowledgement: Boolean(acknowledgementThreshold)
      }
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/acknowledge', async (req, res, next) => {
  try {
    const value = cleanText(req.params.id);
    const current = await client.query(
      `SELECT *
       FROM ticketing_system.submitted_notebooks
       WHERE id::text = $1 OR notebook_submission_id = $1`,
      [value]
    );
    if (!current.rows.length) return res.status(404).json({ message: 'Submitted notebook not found' });
    const row = current.rows[0];
    if (!(await canViewSubmission(req, row))) return res.status(403).json({ message: 'You are not authorized to acknowledge this submitted notebook' });
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
  generateOverdueNotebookTickets,
  recordPpNotebookSubmission,
  runPpBatchCompletionCheck,
  runPpBatchTatCheck,
  getPpBatchSubDepartmentThresholds,
  getPpNotebookThresholds,
  getPpBatchCompletionForEntryId
};

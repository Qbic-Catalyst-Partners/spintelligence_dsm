const client = require('../connection');

const META_KEYS = new Set([
  'department', 'sub_department', 'management_field', 'erp_product_code', 'input_screen',
  'machine_name', 'machine', 'machineno', 'machine_no', 'user_name', 'user_id',
  'inspection_date', 'entry_date', 'date', 'created_at', 'updated_at', 'status',
  'entries', 'readings', 'summary', 'blends', 'items', 'results'
]);

const normalize = (v) => String(v || '').toLowerCase().replace(/\s+/g, '_');

const extractNumericMap = (body = {}) => {
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (META_KEYS.has(k)) continue;
    if (typeof v === 'number' || v === null) out[k] = v;
  }
  return out;
};

const evaluateBreach = (actualRaw, rule) => {
  const actual = Number(actualRaw);
  const mode = String(rule?.condition_level || 'More Than').toLowerCase();
  const plus = Number(rule?.plus_threshold);
  const minus = Number(rule?.minus_threshold);
  const base = Number(rule?.actual_value);

  if (!Number.isFinite(actual)) return null;
  if (mode === 'more than') return Number.isFinite(plus) ? actual > plus : null;
  if (mode === 'less than') return Number.isFinite(minus) ? actual < minus : null;
  if (mode === 'more and less than') {
    if (!Number.isFinite(base) || !Number.isFinite(plus) || !Number.isFinite(minus)) return null;
    const min = base - minus;
    const max = base + plus;
    return actual <= min || actual >= max;
  }
  return null;
};

const findByNormalizedKey = (obj, key) => {
  const target = normalize(key);
  const real = Object.keys(obj).find((k) => normalize(k) === target);
  return real ? obj[real] : undefined;
};

async function tryAutoGenerateTicket({ screenName, reqBody }) {
  const department = reqBody.department || reqBody.management_field;
  const subDepartment = reqBody.sub_department || reqBody.erp_product_code;
  const machineName = reqBody.machine_name || reqBody.machine || reqBody.machineno || reqBody.machine_no || screenName;
  const userName = reqBody.user_name || 'ERP System';
  if (!screenName || !department || !subDepartment || !machineName) return null;

  const actualMap = extractNumericMap(reqBody);
  const parameterNames = Object.keys(actualMap);
  if (!parameterNames.length) return null;

  const rulesResult = await client.query(
    `SELECT input_field, condition_level, plus_threshold, minus_threshold, actual_value,
            approval_l1_user_id, approval_l2_user_id, approval_l3_user_id
     FROM ticketing_system.threshold_master
     WHERE department = $1
       AND sub_department = $2
       AND input_screen = $3
       AND machine_name = $4
       AND is_active = true`,
    [department, subDepartment, screenName, machineName]
  );
  if (!rulesResult.rows.length) return null;

  const ruleMap = {};
  for (const row of rulesResult.rows) {
    ruleMap[row.input_field] = row;
  }

  const missing = [];
  const breaches = [];

  for (const field of parameterNames) {
    const actual = findByNormalizedKey(actualMap, field);
    const rule = findByNormalizedKey(ruleMap, field);
    if (!rule) continue;
    if (actual === null || actual === undefined || (typeof actual === 'string' && actual.trim() === '')) {
      missing.push(field);
      continue;
    }
    if (evaluateBreach(actual, rule)) {
      breaches.push({
        field,
        actual_value: Number(actual),
        condition_level: rule.condition_level,
        plus_threshold: rule.plus_threshold,
        minus_threshold: rule.minus_threshold,
        baseline_actual_value: rule.actual_value
      });
    }
  }

  let reason = null;
  if (missing.length && breaches.length) reason = 'BOTH';
  else if (missing.length) reason = 'MISSING_VALUE';
  else if (breaches.length) reason = 'THRESHOLD_BREACH';
  if (!reason) return null;

  const severity = missing.length ? 'High' : (breaches.length >= 3 ? 'High' : 'Medium');
  const thresholdPayload = {};
  for (const row of rulesResult.rows) {
    thresholdPayload[row.input_field] = {
      condition_level: row.condition_level,
      plus_threshold: row.plus_threshold,
      minus_threshold: row.minus_threshold,
      actual_value: row.actual_value
    };
  }

  const approvalL1UserIds = Array.from(
    new Set(
      rulesResult.rows
        .map((row) => Number(row.approval_l1_user_id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );
  const approvalL2UserIds = Array.from(
    new Set(
      rulesResult.rows
        .map((row) => Number(row.approval_l2_user_id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );
  const approvalL3UserIds = Array.from(
    new Set(
      rulesResult.rows
        .map((row) => Number(row.approval_l3_user_id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );

  const insert = await client.query(
    `INSERT INTO ticketing_system.operator_tickets
     (ticket_id, user_name, machine_name, parameter_name, actual_value, threshold_value, severity, status, created_at, management_field, erp_product_code, ticket_reason, violation_details, approval_l1_user_id, approval_l2_user_id, approval_l3_user_id, approval_l1_user_ids, approval_l2_user_ids, approval_l3_user_ids)
     VALUES ('TK-' || LPAD(nextval('"ticketing_system"."ticket_seq"')::text, 4, '0'), $1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, 'Open', CURRENT_TIMESTAMP, $7, $8, $9, $10::jsonb, $11, $12, $13, $14::int[], $15::int[], $16::int[])
     RETURNING ticket_id, severity, status`,
    [
      userName,
      machineName,
      JSON.stringify(parameterNames),
      JSON.stringify(actualMap),
      JSON.stringify(thresholdPayload),
      severity,
      department,
      subDepartment,
      reason,
      JSON.stringify({ missing_fields: missing, threshold_breaches: breaches }),
      approvalL1UserIds[0] || null,
      approvalL2UserIds[0] || null,
      approvalL3UserIds[0] || null,
      approvalL1UserIds,
      approvalL2UserIds,
      approvalL3UserIds
    ]
  );
  return insert.rows[0];
}

module.exports = { tryAutoGenerateTicket };

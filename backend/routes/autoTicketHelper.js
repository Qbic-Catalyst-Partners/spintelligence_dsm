const client = require('../connection');

const normalize = (v) => String(v || '').toLowerCase().replace(/\s+/g, '_');

const findByNormalizedKey = (obj, key) => {
  const target = normalize(key);
  const real = Object.keys(obj || {}).find((k) => normalize(k) === target);
  return real ? obj[real] : undefined;
};

// All three modes are offsets from typical_value (the configured baseline),
// not from the submitted value itself - plus_value/minus_value are how far
// above/below typical_value is still acceptable.
const evaluateBreach = (actualRaw, rule) => {
  const actual = Number(actualRaw);
  const typical = Number(rule?.typical_value);
  const plus = Number(rule?.plus_value);
  const minus = Number(rule?.minus_value);
  if (!Number.isFinite(actual) || !Number.isFinite(typical)) return null;

  const mode = String(rule?.comparison_mode || 'more_and_less_than').toLowerCase();
  if (mode === 'more_than') return Number.isFinite(plus) ? actual > typical + plus : null;
  if (mode === 'less_than') return Number.isFinite(minus) ? actual < typical - minus : null;
  if (mode === 'more_and_less_than') {
    if (!Number.isFinite(plus) || !Number.isFinite(minus)) return null;
    return actual > typical + plus || actual < typical - minus;
  }
  return null;
};

// Evaluates a just-submitted notebook entry against
// ticketing_system.value_threshold_rules (the table the Value Threshold
// settings screen actually writes to - this used to query the unrelated,
// never-configured `threshold_master` table and was never called from any
// route, so no Value Threshold ticket was ever auto-generated for any
// notebook submission) and files one ticket per entry if any configured
// field is missing or out of range.
//
// department/subDepartment/notebook must match the threshold rule's own
// (department, sub_department, notebook) exactly - these come from the
// calling route's own constants, not guessed from the request body, since
// most notebook submit payloads don't carry those labels at all.
async function tryAutoGenerateTicket({
  department,
  subDepartment,
  notebook,
  machineName,
  entryId,
  userId,
  userName,
  values,
}) {
  if (!department || !subDepartment || !notebook) return null;
  if (!values || typeof values !== 'object') return null;

  const rulesResult = await client.query(
    `SELECT field, comparison_mode, typical_value, value_mode, plus_value, minus_value,
            criticality, l1_user_id, approval_l1_user_ids
     FROM ticketing_system.value_threshold_rules
     WHERE department = $1 AND sub_department = $2 AND notebook = $3 AND is_active = true`,
    [department, subDepartment, notebook]
  );
  if (!rulesResult.rows.length) return null;

  const missing = [];
  const breaches = [];
  const severityRank = { High: 3, Medium: 2, Low: 1 };
  let ticketSeverity = 'Medium';
  const approverIdsSet = new Set();

  for (const rule of rulesResult.rows) {
    const actual = findByNormalizedKey(values, rule.field);
    if (actual === null || actual === undefined || String(actual).trim() === '') {
      missing.push(rule.field);
      continue;
    }

    const breached = evaluateBreach(actual, rule);
    if (breached) {
      breaches.push({
        field: rule.field,
        actual_value: Number(actual),
        comparison_mode: rule.comparison_mode,
        typical_value: Number(rule.typical_value),
        plus_value: rule.plus_value === null ? null : Number(rule.plus_value),
        minus_value: rule.minus_value === null ? null : Number(rule.minus_value),
      });
    }

    if (breached !== null) {
      const ids = Array.isArray(rule.approval_l1_user_ids) && rule.approval_l1_user_ids.length
        ? rule.approval_l1_user_ids
        : rule.l1_user_id
          ? [rule.l1_user_id]
          : [];
      ids.forEach((id) => approverIdsSet.add(id));
      if ((severityRank[rule.criticality] || 0) > (severityRank[ticketSeverity] || 0)) {
        ticketSeverity = rule.criticality;
      }
    }
  }

  if (!missing.length && !breaches.length) return null;

  const reason = missing.length && breaches.length ? 'BOTH' : missing.length ? 'MISSING_VALUE' : 'THRESHOLD_BREACH';
  const approverIds = Array.from(approverIdsSet);

  // parameter_name is what the ticket detail page renders as the alert's
  // subject - it must only list the field(s) that actually caused this
  // ticket (missing or breached), not every key on the submitted form.
  const relevantParamNames = Array.from(new Set([...missing, ...breaches.map((b) => b.field)]));

  const violationDetails = {
    category: 'VALUE_THRESHOLD',
    ticket_type: 'VALUE_THRESHOLD',
    entry_id: entryId || null,
    missing_fields: missing,
    threshold_breaches: breaches,
    message: breaches.length
      ? `${notebook} entry ${entryId || ''} breached threshold on: ${breaches.map((b) => b.field).join(', ')}.`
      : `${notebook} entry ${entryId || ''} is missing: ${missing.join(', ')}.`,
  };

  const insert = await client.query(
    `INSERT INTO ticketing_system.operator_tickets
     (ticket_id, user_id, user_name, machine_name, parameter_name, actual_value, threshold_value,
      severity, status, created_at, management_field, erp_product_code, ticket_reason, ticket_type,
      ticket_kind, violation_details, approval_l1_user_ids)
     VALUES ('TK-' || LPAD(nextval('"ticketing_system"."ticket_seq"')::text, 4, '0'),
       $1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, 'Open', NOW(), $8, $9, $10, 'VALUE_THRESHOLD',
       'value_threshold', $11::jsonb, $12::int[])
     RETURNING ticket_id, severity, status`,
    [
      userId || null,
      userName || 'System',
      machineName || notebook,
      JSON.stringify(relevantParamNames),
      JSON.stringify(values),
      JSON.stringify(Object.fromEntries(rulesResult.rows.map((r) => [r.field, { typical_value: r.typical_value, plus_value: r.plus_value, minus_value: r.minus_value, comparison_mode: r.comparison_mode }]))),
      ticketSeverity,
      department,
      subDepartment,
      reason,
      JSON.stringify(violationDetails),
      approverIds,
    ]
  );

  return insert.rows[0];
}

module.exports = { tryAutoGenerateTicket, evaluateBreach, findByNormalizedKey };

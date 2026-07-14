const normalizeVarietyName = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const EXCLUDED_VARIETIES = new Set(['BUNNY', 'MCU5']);

const dedupeVarieties = (rows = [], { nameKey = 'variety_name', codeKey = 'var_code' } = {}) => {
  const unique = new Map();
  for (const row of rows) {
    const variety_name = normalizeVarietyName(row?.[nameKey]);
    const var_code = String(row?.[codeKey] || '').trim();
    if (!variety_name) continue;
    const key = variety_name.toUpperCase();
    if (EXCLUDED_VARIETIES.has(key)) continue;
    if (!unique.has(key)) unique.set(key, { [codeKey]: var_code, [nameKey]: variety_name });
  }
  return Array.from(unique.values());
};

module.exports = {
  normalizeVarietyName,
  dedupeVarieties
};

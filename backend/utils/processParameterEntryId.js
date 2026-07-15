const db = require('../connection');

const SEQUENCE_KEY = 'global';
const SEQUENCE_TABLE = 'process_parameters.entry_id_sequences';

const normalizeProcessParameterEntryId = (value) => {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return '';
  const match = text.match(/^(?:#?PP-?)?(\d+)$/i);
  if (!match) return text;
  return `PP-${String(Number(match[1]) || 0).padStart(4, '0')}`;
};

const formatProcessParameterEntryId = (value) =>
  `PP-${String(Number(value) || 0).padStart(4, '0')}`;

const ensureProcessParameterSequence = async () => {
  await db.query('CREATE SCHEMA IF NOT EXISTS process_parameters');
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${SEQUENCE_TABLE} (
      sequence_key TEXT PRIMARY KEY,
      last_number BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    INSERT INTO ${SEQUENCE_TABLE} (sequence_key, last_number)
    VALUES ($1, 0)
    ON CONFLICT (sequence_key) DO NOTHING
  `, [SEQUENCE_KEY]);
};

const createProcessParameterEntryId = async () => {
  await ensureProcessParameterSequence();
  const result = await db.query(
    `
      INSERT INTO ${SEQUENCE_TABLE} (sequence_key, last_number, updated_at)
      VALUES ($1, 1, NOW())
      ON CONFLICT (sequence_key)
      DO UPDATE SET
        last_number = ${SEQUENCE_TABLE}.last_number + 1,
        updated_at = NOW()
      RETURNING last_number
    `,
    [SEQUENCE_KEY]
  );

  return formatProcessParameterEntryId(result.rows[0]?.last_number || 1);
};

const peekNextProcessParameterEntryId = async () => {
  await ensureProcessParameterSequence();
  const result = await db.query(
    `SELECT last_number
       FROM ${SEQUENCE_TABLE}
      WHERE sequence_key = $1`,
    [SEQUENCE_KEY]
  );

  // pg returns BIGINT columns as strings; "5" + 1 is string concatenation
  // ("51"), not arithmetic (6) - must cast to Number before adding.
  return formatProcessParameterEntryId((Number(result.rows[0]?.last_number) || 0) + 1);
};

const resetProcessParameterEntryIdSequence = async () => {
  await ensureProcessParameterSequence();
  await db.query(
    `UPDATE ${SEQUENCE_TABLE}
       SET last_number = 0,
           updated_at = NOW()
     WHERE sequence_key = $1`,
    [SEQUENCE_KEY]
  );
};

// Used by "create" endpoints. A brand-new PP id is generated the first time a
// process-parameter batch is created. Every subsequent department screen the
// user fills in for that same batch carries the already-issued id forward as
// req.body.entry_id, and should reuse it rather than minting a new one — that
// is how one global PP id ends up shared across all 10 screens. A supplied
// value is only honored if it's a real, previously-issued id (its numeric
// part falls within the sequence already handed out, or is exactly the
// not-yet-reserved "next" id). A blank/missing value mints a fresh id, but a
// non-blank value that doesn't resolve to a real id is rejected outright
// (InvalidProcessParameterEntryIdError) instead of silently being swapped
// for a different, freshly-minted id.
class InvalidProcessParameterEntryIdError extends Error {
  constructor(providedValue) {
    super('Invalid or unrecognized Process Parameter ID');
    this.name = 'InvalidProcessParameterEntryIdError';
    this.providedValue = providedValue;
  }
}

const resolveOrCreateProcessParameterEntryId = async (providedValue, options = {}) => {
  // When the caller explicitly says "this is a new PP, not a continuation of
  // an existing batch" (e.g. the frontend's "New PP" action), always mint a
  // fresh id instead of trusting a stale/cached entry_id it might still be
  // carrying in state.
  if (options.forceNew) {
    return createProcessParameterEntryId();
  }

  const normalized = normalizeProcessParameterEntryId(providedValue);
  if (!normalized) {
    return createProcessParameterEntryId();
  }

  const match = normalized.match(/^PP-(\d+)$/);
  if (match) {
    const numericValue = Number(match[1]);
    await ensureProcessParameterSequence();
    const result = await db.query(
      `SELECT last_number FROM ${SEQUENCE_TABLE} WHERE sequence_key = $1`,
      [SEQUENCE_KEY]
    );
    // Same string-vs-number pitfall as peekNextProcessParameterEntryId above:
    // last_number comes back from pg as a string, so it must be cast to a
    // Number before arithmetic/strict comparisons against numericValue.
    const lastNumber = Number(result.rows[0]?.last_number) || 0;
    if (numericValue >= 1 && numericValue <= lastNumber) {
      return normalized;
    }
    // Allow the not-yet-reserved "next" id (as previewed by GET /next-id,
    // which only peeks and never advances the sequence) to be claimed on
    // first submission, advancing the sequence to match.
    if (numericValue === lastNumber + 1) {
      await advanceProcessParameterEntryIdSequence(numericValue);
      return normalized;
    }
  }

  throw new InvalidProcessParameterEntryIdError(providedValue);
};

const advanceProcessParameterEntryIdSequence = async (minimumLastNumber) => {
  await ensureProcessParameterSequence();
  await db.query(
    `UPDATE ${SEQUENCE_TABLE}
       SET last_number = GREATEST(last_number, $2),
           updated_at = NOW()
     WHERE sequence_key = $1`,
    [SEQUENCE_KEY, minimumLastNumber]
  );
};

// Every department's header table for a given PP id (entry_id). A PP id is
// shared across all of these sub-departments, and once any of them has
// recorded a count_name for that PP id, every other sub-department must use
// the same count_name (consignee_name is free to differ per sub-department).
const COUNT_NAME_HEADER_TABLES = [
  'carding.carding_qc_header',
  'blowroom.blowroom_header',
  'drawframe.drawframe_qc_header',
  'spinning.spinning_qc_header',
  'simplex.simplex_process_parameter',
  'mixing.mixing_qc_header',
  'autoconer.autoconer_process_parameter',
];

// Returns the count_name already recorded for this PP id across any
// sub-department header table, or null if the PP id has no count_name yet.
const getExistingCountNameForEntryId = async (entry_id) => {
  if (!entry_id) return null;
  const unionQuery = COUNT_NAME_HEADER_TABLES.map(
    (table) => `SELECT count_name FROM ${table} WHERE entry_id = $1 AND count_name IS NOT NULL`
  ).join(' UNION ALL ');
  const result = await db.query(`${unionQuery} LIMIT 1`, [entry_id]);
  return result.rows[0]?.count_name ?? null;
};

// Returns the conflicting count_name already recorded for this PP id if
// count_name doesn't match it, or null if there's no conflict. Call before
// inserting a new header row so the mismatch is caught prior to any write.
const getCountNameConflict = async (entry_id, count_name) => {
  const existing = await getExistingCountNameForEntryId(entry_id);
  if (existing && count_name && existing !== count_name) {
    return existing;
  }
  return null;
};

module.exports = {
  createProcessParameterEntryId,
  resolveOrCreateProcessParameterEntryId,
  peekNextProcessParameterEntryId,
  normalizeProcessParameterEntryId,
  formatProcessParameterEntryId,
  resetProcessParameterEntryIdSequence,
  advanceProcessParameterEntryIdSequence,
  getExistingCountNameForEntryId,
  getCountNameConflict,
  InvalidProcessParameterEntryIdError,
};

const db = require('../connection');
const { advanceProcessParameterEntryIdSequence } = require('../utils/processParameterEntryId');

const TABLES = [
  { table: 'autoconer.autoconer_process_parameter', pk: 'id' },
  { table: 'carding.carding_qc_header', pk: 'qc_id' },
  { table: 'spinning.spinning_qc_header', pk: 'qc_id' },
  { table: 'simplex.simplex_process_parameter', pk: 'id' },
  { table: 'blowroom.blowroom_header', pk: 'br_id' },
  { table: 'mixing.mixing_qc_header', pk: 'qc_id' },
  { table: 'drawframe.drawframe_qc_header', pk: 'ins_id' },
  { table: 'drawframe.finisher_drawing_inspection', pk: 'id' },
  { table: 'autoconer.autoconer_q2_inspection', pk: 'id' },
  { table: 'autoconer.autoconer_q3_inspection', pk: 'id' },
];

async function main() {
  await db.query('BEGIN');
  try {
    const existingTables = [];
    for (const entry of TABLES) {
      const check = await db.query(`SELECT to_regclass($1) AS relation`, [entry.table]);
      if (check.rows[0]?.relation) existingTables.push(entry);
    }

    if (!existingTables.length) {
      console.log('None of the process-parameter tables exist on this database; nothing to backfill.');
      await db.query('COMMIT');
      return;
    }

    const unionSql = existingTables
      .map(
        (entry, index) =>
          `SELECT '${entry.table}'::text AS table_name, '${entry.pk}'::text AS pk_column, ${entry.pk}::bigint AS pk_value
             FROM ${entry.table}
            WHERE entry_id IS NULL OR BTRIM(entry_id) = ''`
      )
      .join('\n    UNION ALL\n    ');

    const pending = await db.query(`
      WITH pending_rows AS (
        ${unionSql}
      ),
      ordered AS (
        SELECT
          table_name,
          pk_column,
          pk_value,
          ROW_NUMBER() OVER (ORDER BY table_name, pk_value) AS rn
        FROM pending_rows
      )
      SELECT * FROM ordered ORDER BY rn
    `);

    let maxAssigned = 0;
    for (const row of pending.rows) {
      const entryId = `PP-${String(row.rn).padStart(4, '0')}`;
      await db.query(
        `UPDATE ${row.table_name} SET entry_id = $1 WHERE ${row.pk_column} = $2`,
        [entryId, row.pk_value]
      );
      maxAssigned = row.rn;
    }

    if (maxAssigned > 0) {
      await advanceProcessParameterEntryIdSequence(maxAssigned);
    }

    await db.query('COMMIT');
    console.log(`Backfilled ${pending.rowCount} process-parameter row(s) with sequential PP-#### ids across ${existingTables.length} table(s).`);
    console.log(`Global process-parameter sequence advanced to at least ${maxAssigned}.`);
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to backfill process-parameter entry ids:', error);
    process.exitCode = 1;
  });

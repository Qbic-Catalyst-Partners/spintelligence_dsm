// One-time migration: DrawFrameHeaderEntry.jsx used to submit Finisher Drawing
// entries to POST /drawframe/header, which only inserts the Breaker column set.
// Those rows ended up in drawframe.drawframe_qc_header with entry_scope='finisher'
// instead of drawframe.finisher_drawing_inspection, and any finisher-only fields
// (break_draft, insert_size, web_funnel_size, delivery_hank, scanning_rolls_size)
// were never captured at all. This moves the surviving fields over and removes
// the misplaced rows from drawframe_qc_header.
const db = require('../connection');

async function main() {
  await db.query('BEGIN');
  try {
    const misplaced = await db.query(`
      SELECT *
      FROM drawframe.drawframe_qc_header
      WHERE LOWER(entry_scope) = 'finisher'
    `);

    console.log(`Found ${misplaced.rowCount} misplaced finisher row(s) in drawframe_qc_header.`);

    let migrated = 0;
    for (const row of misplaced.rows) {
      await db.query(
        `INSERT INTO drawframe.finisher_drawing_inspection (
           entry_id, count_name, consignee_name, creation_date,
           make, no_of_ends, bottom_roll_setting,
           total_draft, web_tension_draft,
           trumpet_size, delivery_speed, pressure_bar
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (entry_id) DO NOTHING`,
        [
          row.entry_id,
          row.count_name,
          row.consignee_name,
          row.creation_date,
          row.make,
          row.no_of_ends,
          row.bottom_roll_setting,
          row.total_draft,
          row.web_tension_draft,
          row.trumpet_size,
          row.delivery_speed,
          row.pressure_bar,
        ]
      );
      migrated += 1;
    }

    await db.query(`
      DELETE FROM drawframe.drawframe_qc_header
      WHERE LOWER(entry_scope) = 'finisher'
    `);

    await db.query('COMMIT');
    console.log(`Migrated ${migrated} row(s) to finisher_drawing_inspection and removed them from drawframe_qc_header.`);
    console.log(
      'Note: break_draft, insert_size, web_funnel_size, delivery_hank and scanning_rolls_size were never ' +
        'captured for these rows (the old code path did not store them) and are NULL on the migrated records.'
    );
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Migration failed, rolled back:', err);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
}

main();

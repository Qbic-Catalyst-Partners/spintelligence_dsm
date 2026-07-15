const db = require('../connection');

async function main() {
  await db.query('BEGIN');
  try {
    await db.query(
      `DELETE FROM ticketing_system.frontend_entry_registry
       WHERE route_path IN ($1, $2)
         AND entry_id IS NOT NULL`,
      ['/autoconer/q2', '/autoconer/q3']
    );

    await db.query('DELETE FROM autoconer.autoconer_q2_inspection');
    await db.query('DELETE FROM autoconer.autoconer_q3_inspection');

    await db.query('COMMIT');
    console.log('Autoconer Q2/Q3 data reset successfully.');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

main().catch((error) => {
  console.error('Failed to reset Autoconer PP data:', error);
  process.exitCode = 1;
});

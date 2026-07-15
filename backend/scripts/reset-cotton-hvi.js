const db = require('../connection');

async function main() {
  await db.query('BEGIN');
  try {
    await db.query(
      `DELETE FROM ticketing_system.frontend_entry_registry
       WHERE route_path = $1`,
      ['/mixing/cotton-hvi']
    );

    await db.query('DELETE FROM mixing.cotton_hvi_data_entry');

    await db.query('COMMIT');
    console.log('Cotton HVI data and entry registry reset successfully.');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

main().catch((error) => {
  console.error('Failed to reset Cotton HVI data:', error);
  process.exitCode = 1;
});

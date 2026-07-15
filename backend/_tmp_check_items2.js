const client = require('./connection');
(async () => {
  const withRange = await client.query(`SELECT COUNT(*) FROM simplex.smx_breaks_inspection_items WHERE length_range IS NOT NULL`);
  console.log('rows with length_range set:', withRange.rows[0].count);
  const total = await client.query(`SELECT COUNT(*) FROM simplex.smx_breaks_inspection_items`);
  console.log('total rows:', total.rows[0].count);
  const studies = await client.query(`SELECT id, entry_id FROM simplex.smx_breaks_study_header ORDER BY id`);
  console.log('studies:', studies.rows);
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});

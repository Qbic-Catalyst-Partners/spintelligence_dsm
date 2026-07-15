const client = require('./connection');
(async () => {
  const cols = await client.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='simplex' AND table_name='smx_breaks_inspection_items'
    ORDER BY ordinal_position
  `);
  console.log('smx_breaks_inspection_items:', cols.rows);
  const cols2 = await client.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='simplex' AND table_name='smx_other_field_values'
    ORDER BY ordinal_position
  `);
  console.log('smx_other_field_values:', cols2.rows);
  const sample = await client.query(`SELECT * FROM simplex.smx_breaks_inspection_items LIMIT 5`);
  console.log('sample items:', sample.rows);
  const sample2 = await client.query(`SELECT * FROM simplex.smx_other_field_values ORDER BY id DESC LIMIT 3`);
  console.log('sample other_field_values:', sample2.rows);
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});

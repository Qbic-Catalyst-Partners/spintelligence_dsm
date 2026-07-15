require('dotenv').config();
const { Pool } = require('pg');

function makePool(url) {
  const isSupabase = url.includes('supabase.co');
  let connectionString = url;
  if (isSupabase) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.delete('sslmode');
      connectionString = parsed.toString();
    } catch (_) {}
  }
  return new Pool({
    connectionString,
    ssl: isSupabase ? { rejectUnauthorized: false } : false,
    max: 3,
  });
}

async function run() {
  const targets = [
    ['LOCAL', process.env.DATABASE_URL_LOCAL],
    ['SUPABASE', process.env.DATABASE_URL_SUPABASE],
  ];

  for (const [label, url] of targets) {
    console.log(`\n=== ${label} ===`);
    if (!url) continue;
    const pool = makePool(url);
    const res = await pool.query(
      `SELECT ins_id, entry_id, entry_scope, type, count_name, consignee_name, creation_date, created_at
       FROM drawframe.drawframe_qc_header
       ORDER BY ins_id ASC`
    );
    if (!res.rows.length) {
      console.log('  (no rows)');
    } else {
      res.rows.forEach((row) => console.log(' ', JSON.stringify(row)));
    }
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

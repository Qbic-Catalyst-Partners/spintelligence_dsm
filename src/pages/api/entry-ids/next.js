import pool from "@/lib/db";
import { buildEntryIdScope, formatEntryId } from "@/utils/entryIds";

const ensureEntryIdTable = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS entry_id_sequences (
      scope TEXT PRIMARY KEY,
      prefix TEXT NOT NULL,
      next_value INTEGER NOT NULL DEFAULT 1,
      width INTEGER NOT NULL DEFAULT 3,
      leading_hash BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const {
    department = "",
    typeName = "",
    prefix = "ENT",
    width = 3,
    leadingHash = false,
  } = req.body || {};
  const scope = buildEntryIdScope(department, typeName);

  if (!scope || !prefix) {
    return res.status(400).json({ message: "department, typeName, and prefix are required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureEntryIdTable(client);

    const result = await client.query(
      `
        INSERT INTO entry_id_sequences (scope, prefix, next_value, width, leading_hash)
        VALUES ($1, $2, 2, $3, $4)
        ON CONFLICT (scope)
        DO UPDATE SET
          prefix = EXCLUDED.prefix,
          width = EXCLUDED.width,
          leading_hash = EXCLUDED.leading_hash,
          next_value = entry_id_sequences.next_value + 1,
          updated_at = NOW()
        RETURNING next_value - 1 AS sequence, prefix, width, leading_hash
      `,
      [scope, prefix, Number(width) || 3, Boolean(leadingHash)]
    );

    await client.query("COMMIT");

    const row = result.rows[0];
    return res.status(200).json({
      entryId: formatEntryId({
        prefix: row.prefix,
        sequence: row.sequence,
        width: row.width,
        leadingHash: row.leading_hash,
      }),
      sequence: row.sequence,
      scope,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({
      message: "Unable to generate database entry ID",
      error: error.message,
    });
  } finally {
    client.release();
  }
}

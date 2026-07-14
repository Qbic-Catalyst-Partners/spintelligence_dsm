const express = require('express');
const router = express.Router();
const client = require('../connection');

const toArray = (value) => {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value;
  return [value];
};

const toIntArray = (value) =>
  toArray(value)
    .map((item) => Number(item))
    .filter((id) => Number.isInteger(id) && id > 0);

const toTextArray = (value) =>
  toArray(value)
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);

const ensurePpThresholdTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.pp_threshold_master (
      id bigserial PRIMARY KEY,
      notebook_name text NOT NULL UNIQUE,
      completion_threshold_hours integer NOT NULL,
      approval_l1_user_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[],
      approval_l1_names text[] NOT NULL DEFAULT ARRAY[]::text[],
      approval_l2_user_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[],
      approval_l2_names text[] NOT NULL DEFAULT ARRAY[]::text[],
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
};

router.get('/', async (req, res, next) => {
  try {
    await ensurePpThresholdTable();
    const result = await client.query(
      `SELECT * FROM ticketing_system.pp_threshold_master ORDER BY notebook_name ASC`
    );
    return res.status(200).json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    await ensurePpThresholdTable();

    const notebookName = String(req.body?.notebook_name || req.body?.notebookName || '').trim();
    if (!notebookName) {
      return res.status(400).json({ message: 'notebook_name is required' });
    }

    const hours = Number(req.body?.completion_threshold_hours ?? req.body?.completionThresholdHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      return res.status(400).json({ message: 'completion_threshold_hours must be a positive number' });
    }

    const approvalL1UserIds = toIntArray(req.body?.approval_l1_user_ids);
    const approvalL1Names = toTextArray(req.body?.approval_l1_names);
    const approvalL2UserIds = toIntArray(req.body?.approval_l2_user_ids);
    const approvalL2Names = toTextArray(req.body?.approval_l2_names);
    const isActive = req.body?.is_active === undefined ? true : Boolean(req.body.is_active);

    const result = await client.query(
      `INSERT INTO ticketing_system.pp_threshold_master
       (notebook_name, completion_threshold_hours, approval_l1_user_ids, approval_l1_names,
        approval_l2_user_ids, approval_l2_names, is_active, updated_at)
       VALUES ($1, $2, $3::int[], $4::text[], $5::int[], $6::text[], $7, NOW())
       ON CONFLICT (notebook_name) DO UPDATE SET
         completion_threshold_hours = EXCLUDED.completion_threshold_hours,
         approval_l1_user_ids = EXCLUDED.approval_l1_user_ids,
         approval_l1_names = EXCLUDED.approval_l1_names,
         approval_l2_user_ids = EXCLUDED.approval_l2_user_ids,
         approval_l2_names = EXCLUDED.approval_l2_names,
         is_active = EXCLUDED.is_active,
         updated_at = NOW()
       RETURNING *`,
      [notebookName, hours, approvalL1UserIds, approvalL1Names, approvalL2UserIds, approvalL2Names, isActive]
    );

    return res.status(200).json({ message: 'PP threshold saved successfully', data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

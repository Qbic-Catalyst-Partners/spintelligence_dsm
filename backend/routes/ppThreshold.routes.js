const express = require('express');
const client = require('../connection');

const router = express.Router();

const ensurePpThresholdTable = async () => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticketing_system.pp_thresholds (
      id BIGSERIAL PRIMARY KEY,
      notebook_name TEXT NOT NULL,
      completion_threshold_hours INTEGER NOT NULL,
      approval_l1 TEXT NULL,
      approval_l1_name TEXT NULL,
      approval_l2 TEXT NULL,
      approval_l2_name TEXT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS pp_thresholds_notebook_name_uq
    ON ticketing_system.pp_thresholds (notebook_name)
  `);
};

const cleanText = (value) => {
  const text = String(value ?? '').trim();
  return text ? text : null;
};

const parseHours = (value) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.round(num * 100) / 100 : null;
};

const getActivePpThresholdsMap = async () => {
  await ensurePpThresholdTable();
  const result = await client.query(
    `SELECT * FROM ticketing_system.pp_thresholds WHERE is_active = true`
  );
  const map = new Map();
  for (const row of result.rows) {
    map.set(row.notebook_name, row);
  }
  return map;
};

router.get('/', async (req, res, next) => {
  try {
    await ensurePpThresholdTable();
    const result = await client.query(
      `SELECT * FROM ticketing_system.pp_thresholds ORDER BY notebook_name ASC`
    );
    return res.status(200).json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    await ensurePpThresholdTable();

    const notebookName = cleanText(req.body?.notebook_name);
    if (!notebookName) {
      return res.status(400).json({ message: 'notebook_name is required' });
    }

    const completionThresholdHours = parseHours(req.body?.completion_threshold_hours);
    if (!completionThresholdHours) {
      return res.status(400).json({ message: 'completion_threshold_hours must be a positive number' });
    }

    const approvalL1 = cleanText(req.body?.approval_l1);
    const approvalL1Name = cleanText(req.body?.approval_l1_name);
    const approvalL2 = cleanText(req.body?.approval_l2);
    const approvalL2Name = cleanText(req.body?.approval_l2_name);
    const isActive = req.body?.is_active === undefined ? true : Boolean(req.body.is_active);
    const id = req.body?.id ?? req.body?.threshold_id ?? null;

    let result;
    if (id) {
      result = await client.query(
        `UPDATE ticketing_system.pp_thresholds
         SET notebook_name = $1,
             completion_threshold_hours = $2,
             approval_l1 = $3,
             approval_l1_name = $4,
             approval_l2 = $5,
             approval_l2_name = $6,
             is_active = $7,
             updated_at = NOW()
         WHERE id = $8
         RETURNING *`,
        [notebookName, completionThresholdHours, approvalL1, approvalL1Name, approvalL2, approvalL2Name, isActive, id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'PP threshold not found' });
      }
    } else {
      result = await client.query(
        `INSERT INTO ticketing_system.pp_thresholds
           (notebook_name, completion_threshold_hours, approval_l1, approval_l1_name, approval_l2, approval_l2_name, is_active, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (notebook_name)
         DO UPDATE SET
           completion_threshold_hours = EXCLUDED.completion_threshold_hours,
           approval_l1 = EXCLUDED.approval_l1,
           approval_l1_name = EXCLUDED.approval_l1_name,
           approval_l2 = EXCLUDED.approval_l2,
           approval_l2_name = EXCLUDED.approval_l2_name,
           is_active = EXCLUDED.is_active,
           updated_at = NOW()
         RETURNING *`,
        [notebookName, completionThresholdHours, approvalL1, approvalL1Name, approvalL2, approvalL2Name, isActive]
      );
    }

    return res.status(200).json({ message: 'PP threshold saved successfully', data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.ensurePpThresholdTable = ensurePpThresholdTable;
module.exports.getActivePpThresholdsMap = getActivePpThresholdsMap;

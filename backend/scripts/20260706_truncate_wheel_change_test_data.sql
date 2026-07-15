-- One-off cleanup: clear all wheel-change test data across Spinning, Drawframe,
-- and Carding so QA can retest submission/approval flows from a clean slate.
-- RESTART IDENTITY resets id sequences back to 1; CASCADE also clears
-- carding.card_change_control_lines via its FK to card_change_control.

TRUNCATE TABLE
  spinning.wheel_change_inspection,
  spinning.wheel_change_v2,
  spinning.wheel_change,
  spinning.wheel_change_type4,
  drawframe.wheel_change,
  carding.card_change_control
RESTART IDENTITY CASCADE;

-- Resets Individual Card Waste Study: drops existing study/master tables and
-- recreates them locked to the fixed waste-type list below.
CREATE SCHEMA IF NOT EXISTS carding;

DROP TABLE IF EXISTS carding.card_waste_study_waste_rows CASCADE;
DROP TABLE IF EXISTS carding.card_waste_study_type_rows CASCADE;
DROP TABLE IF EXISTS carding.card_waste_study CASCADE;
DROP TABLE IF EXISTS carding.card_waste_type_master CASCADE;

CREATE TABLE carding.card_waste_type_master (
  id BIGSERIAL PRIMARY KEY,
  waste_type TEXT NOT NULL,
  waste_type_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX card_waste_type_master_waste_type_key_uq
  ON carding.card_waste_type_master (waste_type_key);
CREATE UNIQUE INDEX card_waste_type_master_waste_type_uq
  ON carding.card_waste_type_master (waste_type);

INSERT INTO carding.card_waste_type_master (waste_type, waste_type_key, sort_order) VALUES
  ('Luckerin waste', 'luckerin waste', 1),
  ('Flat waste', 'flat waste', 2),
  ('Fan waste', 'fan waste', 3),
  ('Micro dust SFL top', 'micro dust sfl top', 4),
  ('Micro dust SFL bottom', 'micro dust sfl bottom', 5),
  ('Micro dust SFD top', 'micro dust sfd top', 6),
  ('Micro dust SFD bottom', 'micro dust sfd bottom', 7),
  ('Sliver waste', 'sliver waste', 8),
  ('Lap waste', 'lap waste', 9);

CREATE TABLE carding.card_waste_study (
  id BIGSERIAL PRIMARY KEY,
  entry_id TEXT,
  waste_study_id TEXT,
  date DATE,
  variety TEXT,
  study_type TEXT,
  carding_production_kg NUMERIC(12,4),
  type_entries NUMERIC(12,4),
  flat_speed NUMERIC(12,4),
  delivery_speed NUMERIC(12,4),
  wing1_speed NUMERIC(12,4),
  wing2_speed NUMERIC(12,4),
  lickerin_speed_1 NUMERIC(12,4),
  lickerin_speed_2 NUMERIC(12,4),
  lickerin_speed_3 NUMERIC(12,4),
  mc_no TEXT,
  mc_production NUMERIC(12,4),
  waste_type TEXT,
  waste_kg NUMERIC(12,4),
  waste_percent NUMERIC(12,4),
  overall_percent NUMERIC(12,4),
  remarks TEXT,
  entry_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX card_waste_study_waste_study_id_uq
  ON carding.card_waste_study (waste_study_id) WHERE waste_study_id IS NOT NULL;
CREATE UNIQUE INDEX card_waste_study_entry_id_uq
  ON carding.card_waste_study (entry_id) WHERE entry_id IS NOT NULL;

CREATE TABLE carding.card_waste_study_type_rows (
  id BIGSERIAL PRIMARY KEY,
  study_id BIGINT NOT NULL REFERENCES carding.card_waste_study(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  cylinder_speed NUMERIC(12,4),
  lickerin_speed NUMERIC(12,4),
  flat_speed NUMERIC(12,4),
  doffer_speed NUMERIC(12,4),
  delivery_speed NUMERIC(12,4),
  wing_setting_1 NUMERIC(12,4),
  wing_setting_2 NUMERIC(12,4),
  mc_no TEXT,
  mc_production NUMERIC(12,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX card_waste_study_type_rows_study_id_idx ON carding.card_waste_study_type_rows (study_id);

CREATE TABLE carding.card_waste_study_waste_rows (
  id BIGSERIAL PRIMARY KEY,
  study_id BIGINT NOT NULL REFERENCES carding.card_waste_study(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  waste_type TEXT NOT NULL REFERENCES carding.card_waste_type_master(waste_type),
  waste_kgs_value NUMERIC(12,4),
  waste_kgs_percent NUMERIC(12,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX card_waste_study_waste_rows_study_id_idx ON carding.card_waste_study_waste_rows (study_id);

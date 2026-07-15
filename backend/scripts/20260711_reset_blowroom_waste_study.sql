-- Resets Blow Room Waste Study: drops existing study/master tables and
-- recreates them locked to the fixed waste-type list below.
CREATE SCHEMA IF NOT EXISTS blowroom;

DROP TABLE IF EXISTS blowroom.br_waste_study_waste_rows CASCADE;
DROP TABLE IF EXISTS blowroom.br_waste_study_type_rows CASCADE;
DROP TABLE IF EXISTS blowroom.br_waste_study CASCADE;
DROP TABLE IF EXISTS blowroom.br_waste_type_master CASCADE;

CREATE TABLE blowroom.br_waste_type_master (
  id BIGSERIAL PRIMARY KEY,
  waste_type VARCHAR(120) NOT NULL,
  waste_type_key VARCHAR(120) NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX br_waste_type_master_waste_type_key_uq
  ON blowroom.br_waste_type_master (waste_type_key);
CREATE UNIQUE INDEX br_waste_type_master_waste_type_uq
  ON blowroom.br_waste_type_master (waste_type);

INSERT INTO blowroom.br_waste_type_master (waste_type, waste_type_key, sort_order) VALUES
  ('Dropping waste in MO', 'dropping waste in mo', 1),
  ('Dropping waste in RK', 'dropping waste in rk', 2),
  ('Dropping waste in flexi clean', 'dropping waste in flexi clean', 3),
  ('Dropping waste in KB', 'dropping waste in kb', 4),
  ('Dropping waste in Vario clean', 'dropping waste in vario clean', 5),
  ('Dropping waste in GBR', 'dropping waste in gbr', 6);

CREATE TABLE blowroom.br_waste_study (
  id BIGSERIAL PRIMARY KEY,
  entry_id VARCHAR(80),
  waste_study_id VARCHAR(80),
  date DATE NOT NULL,
  variety VARCHAR(120),
  study_type VARCHAR(20) NOT NULL CHECK (study_type IN ('Type 1', 'Type 2', 'Type 3')),
  carding_production_kg NUMERIC(12,4),
  type_entries INTEGER,
  waste_type VARCHAR(120),
  waste_kg NUMERIC(12,4),
  waste_percent NUMERIC(12,4),
  overall_percent NUMERIC(12,4),
  remarks TEXT,
  entry_type VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX br_waste_study_waste_study_id_uq
  ON blowroom.br_waste_study (waste_study_id) WHERE waste_study_id IS NOT NULL;
CREATE UNIQUE INDEX br_waste_study_entry_id_uq
  ON blowroom.br_waste_study (entry_id) WHERE entry_id IS NOT NULL;

CREATE TABLE blowroom.br_waste_study_type_rows (
  id BIGSERIAL PRIMARY KEY,
  study_id BIGINT NOT NULL REFERENCES blowroom.br_waste_study(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  cylinder_speed NUMERIC(12,4),
  lickerin_speed NUMERIC(12,4),
  flat_speed NUMERIC(12,4),
  doffer_speed NUMERIC(12,4),
  delivery_speed NUMERIC(12,4),
  wing_setting_1 NUMERIC(12,4),
  wing_setting_2 NUMERIC(12,4),
  mc_no VARCHAR(80),
  mc_production NUMERIC(12,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX br_waste_study_type_rows_study_id_idx ON blowroom.br_waste_study_type_rows (study_id);

CREATE TABLE blowroom.br_waste_study_waste_rows (
  id BIGSERIAL PRIMARY KEY,
  study_id BIGINT NOT NULL REFERENCES blowroom.br_waste_study(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  waste_type VARCHAR(120) NOT NULL REFERENCES blowroom.br_waste_type_master(waste_type),
  waste_kgs_value NUMERIC(12,4),
  waste_kgs_percent NUMERIC(12,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX br_waste_study_waste_rows_study_id_idx ON blowroom.br_waste_study_waste_rows (study_id);

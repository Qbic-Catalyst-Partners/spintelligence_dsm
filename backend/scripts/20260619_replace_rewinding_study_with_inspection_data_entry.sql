-- Replace the legacy rewinding study tables with the new inspection data entry tables.
-- Run this against both local Postgres and Supabase.

DROP TABLE IF EXISTS autoconer.rewinding_readings CASCADE;
DROP TABLE IF EXISTS autoconer.rewinding_study CASCADE;

CREATE TABLE autoconer.inspection_data_entry (
  id SERIAL PRIMARY KEY,
  entry_id VARCHAR(50) NOT NULL UNIQUE,
  entry_date DATE NOT NULL,
  type VARCHAR(100) NOT NULL DEFAULT 'Rewinding Study',
  count_name VARCHAR(255) NOT NULL,
  actual_count NUMERIC(12, 4) NOT NULL,
  auto_coner_no VARCHAR(100) NOT NULL,
  cone_tip VARCHAR(255) NOT NULL,
  no_of_cuts INTEGER NOT NULL DEFAULT 0,
  break_per_million_meter NUMERIC(14, 4) NOT NULL DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE autoconer.inspection_data_entry_readings (
  id SERIAL PRIMARY KEY,
  inspection_data_entry_id INTEGER NOT NULL REFERENCES autoconer.inspection_data_entry(id) ON DELETE CASCADE,
  drum_no INTEGER,
  no_of_cones INTEGER,
  fault_name VARCHAR(255),
  no_of_faults INTEGER,
  percent_fault NUMERIC(14, 4),
  weight NUMERIC(14, 4),
  length_meters NUMERIC(14, 4)
);

CREATE INDEX idx_inspection_data_entry_entry_date
  ON autoconer.inspection_data_entry (entry_date DESC, created_at DESC);

CREATE INDEX idx_inspection_data_entry_readings_parent
  ON autoconer.inspection_data_entry_readings (inspection_data_entry_id);

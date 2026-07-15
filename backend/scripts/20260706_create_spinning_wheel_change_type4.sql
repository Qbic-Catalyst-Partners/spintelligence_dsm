-- Dedicated Type 4 wheel change table (own wheel_change_type, mixed text/numeric
-- columns) so Type 4 free-text submissions stop landing in Type 1's numeric table.
-- Mirrors the schema created lazily by ensureSpinningEntryIdColumns() in
-- routes/spinning.js - kept here so it can be applied directly to whichever
-- database (local Postgres or Supabase) isn't currently the app's DB_TARGET,
-- since the app only auto-mirrors schema changes onto the *other* database.

CREATE SCHEMA IF NOT EXISTS spinning;

CREATE TABLE IF NOT EXISTS spinning.wheel_change_type4 (
    id                        BIGSERIAL PRIMARY KEY,
    type                      VARCHAR(100),
    wheel_change_type         VARCHAR(100),
    test_no                   VARCHAR(100),
    date                      DATE,
    fm_no                     VARCHAR(100),
    lycra_type_existing       VARCHAR(100),
    lycra_type_proposed       VARCHAR(100),
    lycra_draft_existing      NUMERIC,
    lycra_draft_proposed      NUMERIC,
    slub_code_existing        VARCHAR(100),
    slub_code_proposed        VARCHAR(100),
    range_existing            VARCHAR(100),
    range_proposed            VARCHAR(100),
    offset_existing           VARCHAR(100),
    offset_proposed           VARCHAR(100),
    core_condition_existing   VARCHAR(100),
    core_condition_proposed   VARCHAR(100),
    production_existing       NUMERIC,
    production_proposed       NUMERIC,
    roving_hank_existing      NUMERIC,
    roving_hank_proposed      NUMERIC,
    eow_existing              VARCHAR(100),
    eow_proposed              VARCHAR(100),
    epi_existing              NUMERIC,
    epi_proposed              NUMERIC,
    dca_existing              VARCHAR(100),
    dca_proposed              VARCHAR(100),
    dcb_existing              NUMERIC,
    dcb_proposed              NUMERIC,
    dfc_existing              VARCHAR(100),
    dfc_proposed              VARCHAR(100),
    dc_existing               VARCHAR(100),
    dc_proposed               VARCHAR(100),
    tcw_existing              VARCHAR(100),
    tcw_proposed              VARCHAR(100),
    tw_existing               VARCHAR(100),
    tw_proposed               VARCHAR(100),
    tpm_existing              NUMERIC,
    tpm_proposed              NUMERIC,
    travelers_no_existing     VARCHAR(100),
    travelers_no_proposed     VARCHAR(100),
    spacer_existing           VARCHAR(100),
    spacer_proposed           VARCHAR(100),
    cop_weight_existing       NUMERIC,
    cop_weight_proposed       NUMERIC,
    speed_front_existing      NUMERIC,
    speed_front_proposed      NUMERIC,
    speed_rpm_existing        NUMERIC,
    speed_rpm_proposed        NUMERIC,
    empires_colour_existing   VARCHAR(100),
    empires_colour_proposed   VARCHAR(100),
    total_draft_existing      NUMERIC,
    total_draft_proposed      NUMERIC,
    bdw_existing              VARCHAR(100),
    bdw_proposed              VARCHAR(100),
    bd_existing               NUMERIC,
    bd_proposed               NUMERIC,
    winding_e_existing        NUMERIC,
    winding_e_proposed        NUMERIC,
    winding_f_existing        NUMERIC,
    winding_f_proposed        NUMERIC,
    winding_length_existing   NUMERIC,
    winding_length_proposed   NUMERIC,
    created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE spinning.wheel_change_type4
    ADD COLUMN IF NOT EXISTS entry_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS wheel_change_type4_entry_id_uq
    ON spinning.wheel_change_type4 (entry_id)
    WHERE entry_id IS NOT NULL;

-- Approval workflow columns shared with the type1-3 wheel change tables.
-- Default 'approved' keeps pre-existing rows visible; new submissions from
-- the API explicitly set 'pending' until an L2 reviewer approves them.
ALTER TABLE spinning.wheel_change_type4
    ADD COLUMN IF NOT EXISTS operator TEXT,
    ADD COLUMN IF NOT EXISTS remarks TEXT,
    ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved';

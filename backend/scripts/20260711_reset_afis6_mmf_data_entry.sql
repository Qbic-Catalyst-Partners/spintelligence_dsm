-- Resets AFIS-6 MMF Data Entry table to match the new payload shape:
-- drops material_class/comment and renames long_fiber_..._gt_46_80 -> _gt_45_60;
-- adds lot_no, variety, invoice_date, mc_name, blow_room, carding,
-- breaker_drawing, finisher_drawing, comber, fiber_nep_count_g,
-- fiber_nep_mean_size_um, sc_nep_count_g, sc_nep_mean_size_um, l_w_mm, l_w_cv,
-- sfc_w_percent, uql_w_mm, l_n_mm, fitness_index, maturity_ratio_mat1,
-- ifc_percent, fifty_pct_l_n_mm.
CREATE SCHEMA IF NOT EXISTS mixing;

DROP TABLE IF EXISTS mixing.afis6_mmf_data_entry CASCADE;

CREATE TABLE mixing.afis6_mmf_data_entry (
    id                          SERIAL PRIMARY KEY,
    entry_id                    TEXT,
    inspection_date             DATE NOT NULL DEFAULT CURRENT_DATE,
    machine_name                VARCHAR(255),
    lot_no                      VARCHAR(255),
    variety                     VARCHAR(255),
    invoice_date                DATE,
    mc_name                     VARCHAR(255),
    blow_room                   VARCHAR(255),
    carding                     VARCHAR(255),
    breaker_drawing             VARCHAR(255),
    finisher_drawing            VARCHAR(255),
    comber                      VARCHAR(255),
    total_nep_count_g           NUMERIC(12,3),
    total_nep_mean_size_um      NUMERIC(12,3),
    fiber_nep_count_g           NUMERIC(12,3),
    fiber_nep_mean_size_um      NUMERIC(12,3),
    sc_nep_count_g              NUMERIC(12,3),
    sc_nep_mean_size_um         NUMERIC(12,3),
    l_w_mm                      NUMERIC(12,3),
    l_w_cv                      NUMERIC(12,3),
    sfc_w_percent               NUMERIC(12,3),
    uql_w_mm                    NUMERIC(12,3),
    l_n_mm                      NUMERIC(12,3),
    l_n_cv_percent              NUMERIC(12,3),
    sfc_n_percent               NUMERIC(12,3),
    five_pct_l_n_mm             NUMERIC(12,3),
    fitness_index               NUMERIC(12,3),
    maturity_ratio_mat1         NUMERIC(12,3),
    ifc_percent                 NUMERIC(12,3),
    fifty_pct_l_n_mm            NUMERIC(12,3),
    cut_length_n_mm             NUMERIC(12,3),
    fineness_den                NUMERIC(12,3),
    fineness_cv_percent         NUMERIC(12,3),
    long_fiber_gt_45_60_percent NUMERIC(12,3),
    long_fiber_count_gt_45_60   NUMERIC(12,3),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX afis6_mmf_data_entry_entry_id_uq
    ON mixing.afis6_mmf_data_entry (entry_id)
    WHERE entry_id IS NOT NULL;

CREATE INDEX afis6_mmf_data_entry_inspection_date_idx
    ON mixing.afis6_mmf_data_entry (inspection_date DESC);

CREATE OR REPLACE FUNCTION mixing.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_afis6_mmf_updated_at ON mixing.afis6_mmf_data_entry;
CREATE TRIGGER trg_afis6_mmf_updated_at
    BEFORE UPDATE ON mixing.afis6_mmf_data_entry
    FOR EACH ROW
    EXECUTE FUNCTION mixing.set_updated_at();

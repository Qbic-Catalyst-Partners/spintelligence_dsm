CREATE SCHEMA IF NOT EXISTS mixing;

CREATE TABLE IF NOT EXISTS mixing.afis6_cotton_data_entry (
    id                  SERIAL PRIMARY KEY,
    entry_id            TEXT,
    inspection_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    lot_no              VARCHAR(255),
    variety             VARCHAR(255),
    invoice_date        DATE,
    mc_name             VARCHAR(255),
    blow_room           VARCHAR(255),
    carding             VARCHAR(255),
    breaker_drawing     VARCHAR(255),
    finisher_drawing    VARCHAR(255),
    comber              VARCHAR(255),
    scp_nep_count       NUMERIC(12,3),
    l_w_mm              NUMERIC(12,3),
    l_w_cv              NUMERIC(12,3),
    sfc_w_percent       NUMERIC(12,3),
    uql_w_mm            NUMERIC(12,3),
    l_n_mm              NUMERIC(12,3),
    l_n_cv_percent      NUMERIC(12,3),
    sfc_n_percent       NUMERIC(12,3),
    five_pct_l_n_mm     NUMERIC(12,3),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS afis6_cotton_data_entry_entry_id_uq
    ON mixing.afis6_cotton_data_entry (entry_id)
    WHERE entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS afis6_cotton_data_entry_inspection_date_idx
    ON mixing.afis6_cotton_data_entry (inspection_date DESC);

CREATE OR REPLACE FUNCTION mixing.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_afis6_cotton_updated_at ON mixing.afis6_cotton_data_entry;
CREATE TRIGGER trg_afis6_cotton_updated_at
    BEFORE UPDATE ON mixing.afis6_cotton_data_entry
    FOR EACH ROW
    EXECUTE FUNCTION mixing.set_updated_at();

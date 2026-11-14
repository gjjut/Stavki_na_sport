-- =============================================================================
-- VALUEX — Хранилище коммерческого маркетплейса прогнозов и ИИ-Автопилота 24/7
-- СУБД: PostgreSQL 15+ (с поддержкой транзакционных блокировок FOR UPDATE)
-- =============================================================================

CREATE TABLE IF NOT EXISTS valuex_app_storage (
    store_key  VARCHAR(64) PRIMARY KEY,
    payload    JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_valuex_storage_updated
    ON valuex_app_storage (updated_at DESC);

-- =============================================================================
-- ПЛАТФОРМА ПРОДАЖИ СПОРТИВНЫХ ПРОГНОЗОВ (TIPSTER PLATFORM)
-- СУБД: PostgreSQL 15+
-- ШАГ 1: Полная схема базы данных (Users, Predictions, Transactions, Stats, Affiliates)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 0. ПЕРЕЧИСЛЕНИЯ (ENUM TYPES)
-- =============================================================================

CREATE TYPE user_role AS ENUM ('USER', 'PARTNER', 'MODERATOR', 'ADMIN');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'BLOCKED');

CREATE TYPE sport_type AS ENUM ('FOOTBALL', 'HOCKEY', 'TENNIS', 'ESPORTS', 'BASKETBALL', 'MMA');
CREATE TYPE match_lifecycle_status AS ENUM ('UPCOMING', 'LIVE', 'FINISHED', 'POSTPONED', 'CANCELLED');
CREATE TYPE prediction_result_status AS ENUM ('PENDING', 'WIN', 'LOSS', 'PUSH', 'CASHOUT');
CREATE TYPE prediction_access_tier AS ENUM ('FREE', 'PAID_SINGLE', 'VIP_ONLY');

CREATE TYPE tariff_period_type AS ENUM ('FREE_TG', 'SINGLE', 'DAYS_7', 'DAYS_30', 'LIFETIME');
CREATE TYPE subscription_status AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');
CREATE TYPE subscription_source AS ENUM ('YOOKASSA', 'INTERNAL_BALANCE', 'PROMO_ADMIN', 'REFERRAL_BONUS');

CREATE TYPE transaction_type AS ENUM (
    'SINGLE_PREDICTION',
    'SUBSCRIPTION_INITIAL',
    'SUBSCRIPTION_RENEWAL',
    'BALANCE_TOPUP',
    'REFUND'
);
CREATE TYPE payment_status AS ENUM ('PENDING', 'WAITING_FOR_CAPTURE', 'SUCCEEDED', 'CANCELED', 'REFUNDED');
CREATE TYPE receipt_status AS ENUM ('NOT_REQUIRED', 'PENDING', 'REGISTERED', 'SENT', 'FAILED');

CREATE TYPE stats_period_key AS ENUM ('WEEK', 'MONTH', 'ALL_TIME');
CREATE TYPE commission_status AS ENUM ('HELD', 'AVAILABLE', 'PAID_OUT', 'REVERSED');
CREATE TYPE payout_status AS ENUM ('REQUESTED', 'PROCESSING', 'COMPLETED', 'REJECTED');


-- =============================================================================
-- 1. ПОЛЬЗОВАТЕЛИ, ТАРИФЫ И ПОДПИСКИ (CRM + ДОСТУПЫ)
-- =============================================================================

CREATE TABLE users (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                   VARCHAR(255) UNIQUE NOT NULL,
    password_hash           VARCHAR(255), -- NULL, если вход через Telegram OAuth
    display_name            VARCHAR(100),
    city                    VARCHAR(100), -- Для ленты Social Proof ("Иван из Москвы...")
    role                    user_role NOT NULL DEFAULT 'USER',
    status                  user_status NOT NULL DEFAULT 'ACTIVE',
    blocked_reason          TEXT,
    blocked_at              TIMESTAMPTZ,

    -- Внутренний депозит и персональный калькулятор банка (UX-фича для пересчета % в рубли юзера)
    balance_rub             NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (balance_rub >= 0),
    reference_bankroll_rub  NUMERIC(12, 2) NOT NULL DEFAULT 50000.00 CHECK (reference_bankroll_rub > 0),

    -- Интеграция с Telegram-ботом и закрытым VIP-каналом
    telegram_user_id        BIGINT UNIQUE,
    telegram_username       VARCHAR(64),
    telegram_linked_at      TIMESTAMPTZ,
    telegram_in_vip_channel BOOLEAN NOT NULL DEFAULT FALSE,
    tg_notifications_on     BOOLEAN NOT NULL DEFAULT TRUE,

    -- Согласие на обезличенное отображение выигрышей в Social Proof
    social_proof_opt_in     BOOLEAN NOT NULL DEFAULT TRUE,

    -- Атрибуция трафика и реферальной программы
    referred_by_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    referral_link_id        UUID, -- FK добавляется после создания referral_links
    utm_source              VARCHAR(100),
    utm_medium              VARCHAR(100),
    utm_campaign            VARCHAR(100),

    admin_notes             TEXT,
    last_active_at          TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role_status ON users(role, status);
CREATE INDEX idx_users_referred_by ON users(referred_by_user_id) WHERE referred_by_user_id IS NOT NULL;
CREATE INDEX idx_users_telegram_id ON users(telegram_user_id) WHERE telegram_user_id IS NOT NULL;


-- Тарифная сетка (включая сравнение Бесплатно Telegram vs VIP Сайт)
CREATE TABLE tariff_plans (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                    VARCHAR(32) UNIQUE NOT NULL, -- 'FREE_TG', 'VIP_7D', 'VIP_30D', 'VIP_LIFETIME'
    name                    VARCHAR(100) NOT NULL,
    period_type             tariff_period_type NOT NULL,
    duration_days           INT CHECK (duration_days IS NULL OR duration_days > 0), -- NULL = Навсегда (LIFETIME)
    price_rub               NUMERIC(10, 2) NOT NULL CHECK (price_rub >= 0),
    old_price_rub           NUMERIC(10, 2) CHECK (old_price_rub IS NULL OR old_price_rub >= price_rub),
    is_recurring_supported  BOOLEAN NOT NULL DEFAULT FALSE,
    includes_vip_telegram   BOOLEAN NOT NULL DEFAULT TRUE,
    value_betting_edge_note VARCHAR(160), -- Для таблицы сравнения: "Обход маржи за счет +EV валуев по ранней линии"
    features_json           JSONB NOT NULL DEFAULT '[]'::jsonb,
    sort_order              SMALLINT NOT NULL DEFAULT 0,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Активные и архивные подписки пользователей (вкл. рекурренты ЮKassa и промо-выдачи из CRM)
CREATE TABLE user_subscriptions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id                     UUID NOT NULL REFERENCES tariff_plans(id),
    status                      subscription_status NOT NULL DEFAULT 'ACTIVE',
    source                      subscription_source NOT NULL DEFAULT 'YOOKASSA',

    starts_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at                  TIMESTAMPTZ, -- NULL только для тарифа VIP Навсегда (LIFETIME)

    -- Данные для рекуррентного автопродления ЮKassa
    auto_renew                  BOOLEAN NOT NULL DEFAULT FALSE,
    yookassa_payment_method_id  VARCHAR(128),
    next_billing_at             TIMESTAMPTZ,
    billing_retry_count         SMALLINT NOT NULL DEFAULT 0,
    cancelled_at                TIMESTAMPTZ,

    -- Аудит ручной выдачи промо-доступа администратором
    granted_by_admin_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    promo_reason                TEXT,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subs_user_active ON user_subscriptions(user_id, status, expires_at);
CREATE INDEX idx_subs_next_billing ON user_subscriptions(next_billing_at)
    WHERE status = 'ACTIVE' AND auto_renew = TRUE;


-- =============================================================================
-- 2. ПРОГНОЗЫ, ЖЕСТКАЯ ФИКСАЦИЯ КОЭФФИЦИЕНТОВ И TELEGRAM-ПУШИ
-- =============================================================================

CREATE TABLE predictions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                    VARCHAR(160) UNIQUE NOT NULL,

    -- Публичные метаданные матча (доступны всем для фильтрации и FOMO-таймера)
    sport                   sport_type NOT NULL,
    league_name             VARCHAR(120) NOT NULL, -- Напр.: "КХЛ", "АПЛ", "ATP 1000", "CS2 Major"
    home_team               VARCHAR(120) NOT NULL,
    away_team               VARCHAR(120) NOT NULL,
    match_starts_at         TIMESTAMPTZ NOT NULL,  -- Основа для обратного отсчета (FOMO)
    match_status            match_lifecycle_status NOT NULL DEFAULT 'UPCOMING', -- Ожидает / В игре / Завершен

    -- Закрытая аналитика ("Запретный плод": скрыта на API до покупки или завершения матча)
    market_code             VARCHAR(64) NOT NULL,  -- 'TOTAL_OVER', 'HANDICAP_1', '1X2_HOME' и т.д.
    selection_title         VARCHAR(160) NOT NULL, -- Напр.: "Фора 1 (-1.5)" или "Тотал Больше 5.5"
    fixed_odds              NUMERIC(6, 3) NOT NULL CHECK (fixed_odds > 1.000 AND fixed_odds <= 100.000),
    min_acceptable_odds     NUMERIC(6, 3) CHECK (min_acceptable_odds IS NULL OR min_acceptable_odds > 1.000),
    bookmaker_source        VARCHAR(64) NOT NULL DEFAULT 'Pinnacle / ЦУПИС',
    analysis_teaser         VARCHAR(320),          -- Публичный тизер над размытием (почему ставка валуйная)
    analysis_full           TEXT NOT NULL,         -- Полный разбор для купивших / VIP

    -- Система банк-менеджмента (Флэт / % от банка; НИКАКИХ рублей в учете прогнозов)
    stake_percent           NUMERIC(4, 2) NOT NULL CHECK (stake_percent >= 0.25 AND stake_percent <= 10.00),
    stake_units             NUMERIC(5, 2) NOT NULL CHECK (stake_units > 0), -- Стандарт: 1.00 Unit = 1.00% банка

    -- Монетизация конкретного прогноза
    access_tier             prediction_access_tier NOT NULL DEFAULT 'PAID_SINGLE',
    single_price_rub        NUMERIC(10, 2) CHECK (single_price_rub IS NULL OR single_price_rub >= 0),
    reveal_after_finish     BOOLEAN NOT NULL DEFAULT TRUE, -- Прозрачность: открывать исход после расчета

    -- Расчет исхода и верифицируемая прибыль
    result_status           prediction_result_status NOT NULL DEFAULT 'PENDING',
    final_score             VARCHAR(40),
    cashout_multiplier      NUMERIC(6, 3) CHECK (cashout_multiplier IS NULL OR cashout_multiplier >= 0),
    profit_units            NUMERIC(8, 3), -- Авторасчет триггером при закрытии прогноза
    profit_percent          NUMERIC(8, 3), -- Авторасчет триггером при закрытии прогноза

    -- Криптографическая защита от "рисованной" статистики и заднего числа
    verification_hash       CHAR(64),      -- SHA-256 от (match_starts_at | selection_title | fixed_odds | stake_units)
    odds_locked_at          TIMESTAMPTZ,   -- Момент жесткой фиксации коэффициента при публикации
    published_at            TIMESTAMPTZ,
    settled_at              TIMESTAMPTZ,

    created_by_admin_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_cashout_requires_multiplier CHECK (
        result_status <> 'CASHOUT' OR cashout_multiplier IS NOT NULL
    )
);

CREATE INDEX idx_predictions_feed ON predictions(sport, match_status, match_starts_at DESC)
    WHERE published_at IS NOT NULL;
CREATE INDEX idx_predictions_settled_stats ON predictions(settled_at DESC, sport, result_status)
    WHERE result_status <> 'PENDING';


-- Разовые покупки отдельных прогнозов (защита от двойного списания через UNIQUE)
CREATE TABLE user_prediction_purchases (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prediction_id       UUID NOT NULL REFERENCES predictions(id) ON DELETE RESTRICT,
    transaction_id      UUID, -- FK добавляется после создания transactions
    price_paid_rub      NUMERIC(10, 2) NOT NULL CHECK (price_paid_rub >= 0),
    unlocked_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, prediction_id)
);

CREATE INDEX idx_pred_purchases_user ON user_prediction_purchases(user_id);


-- Журнал отправки прогнозов в VIP Telegram-канал и в личку подписчикам
CREATE TABLE telegram_dispatches (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_id           UUID NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
    dispatch_type           VARCHAR(32) NOT NULL, -- 'NEW_PICK_VIP_CHANNEL', 'NEW_PICK_DM', 'SETTLEMENT_UPDATE'
    vip_channel_message_id  BIGINT,
    recipients_total        INT NOT NULL DEFAULT 0,
    recipients_delivered    INT NOT NULL DEFAULT 0,
    error_log               TEXT,
    dispatched_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- ТРИГГЕРЫ ЧЕСТНОСТИ БЕТТИНГА: ФИКСАЦИЯ КОЭФФИЦИЕНТА И РАСЧЕТ ROI/PROFIT
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_predictions_integrity_and_settlement()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. При первой публикации жестко фиксируем коэффициент и генерируем SHA-256 слепок
    IF NEW.published_at IS NOT NULL AND OLD.odds_locked_at IS NULL THEN
        NEW.odds_locked_at := NOW();
        NEW.verification_hash := encode(
            digest(
                NEW.match_starts_at::TEXT || '|' ||
                NEW.selection_title || '|' ||
                NEW.fixed_odds::TEXT || '|' ||
                NEW.stake_units::TEXT,
                'sha256'
            ),
            'hex'
        );
    END IF;

    -- 2. Запрет изменения зафиксированного коэффициента, исхода и суммы ставки после публикации
    IF OLD.odds_locked_at IS NOT NULL THEN
        IF NEW.fixed_odds <> OLD.fixed_odds
           OR NEW.selection_title <> OLD.selection_title
           OR NEW.stake_units <> OLD.stake_units
           OR NEW.stake_percent <> OLD.stake_percent THEN
            RAISE EXCEPTION 'Odds and pick parameters are hard-locked after publication (Anti-Fraud Lock)';
        END IF;
    END IF;

    -- 3. Автоматический математический расчет прибыли в Юнитах и % от банка
    IF NEW.result_status = 'PENDING' THEN
        NEW.profit_units := NULL;
        NEW.profit_percent := NULL;
        NEW.settled_at := NULL;
    ELSIF NEW.result_status = 'WIN' THEN
        NEW.profit_units := ROUND(NEW.stake_units * (NEW.fixed_odds - 1.000), 3);
        NEW.profit_percent := ROUND(NEW.stake_percent * (NEW.fixed_odds - 1.000), 3);
        NEW.settled_at := COALESCE(NEW.settled_at, NOW());
    ELSIF NEW.result_status = 'LOSS' THEN
        NEW.profit_units := -NEW.stake_units;
        NEW.profit_percent := -NEW.stake_percent;
        NEW.settled_at := COALESCE(NEW.settled_at, NOW());
    ELSIF NEW.result_status = 'PUSH' THEN
        NEW.profit_units := 0.000;
        NEW.profit_percent := 0.000;
        NEW.settled_at := COALESCE(NEW.settled_at, NOW());
    ELSIF NEW.result_status = 'CASHOUT' THEN
        NEW.profit_units := ROUND(NEW.stake_units * (NEW.cashout_multiplier - 1.000), 3);
        NEW.profit_percent := ROUND(NEW.stake_percent * (NEW.cashout_multiplier - 1.000), 3);
        NEW.settled_at := COALESCE(NEW.settled_at, NOW());
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_predictions_integrity
BEFORE INSERT OR UPDATE ON predictions
FOR EACH ROW EXECUTE FUNCTION fn_predictions_integrity_and_settlement();


-- =============================================================================
-- 3. ФИНАНСЫ, ТРАНЗАКЦИИ, ЮKASSA И ЧЕКИ (54-ФЗ)
-- =============================================================================

CREATE TABLE transactions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    tx_type                     transaction_type NOT NULL,

    -- Связь с объектом покупки (ровно один или пополнение баланса)
    prediction_id               UUID REFERENCES predictions(id) ON DELETE SET NULL,
    plan_id                     UUID REFERENCES tariff_plans(id) ON DELETE SET NULL,
    subscription_id             UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,

    amount_rub                  NUMERIC(12, 2) NOT NULL CHECK (amount_rub > 0),
    currency                    CHAR(3) NOT NULL DEFAULT 'RUB',
    status                      payment_status NOT NULL DEFAULT 'PENDING',

    -- Интеграция с ЮKassa API
    idempotence_key             UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    yookassa_payment_id         VARCHAR(64) UNIQUE,
    payment_method_type         VARCHAR(32), -- 'bank_card', 'sbp', 'yoo_money', 'internal_balance'
    saved_payment_method_id     VARCHAR(128), -- Токен автоплатежа, если юзер согласился на рекуррент
    confirmation_url            TEXT,

    -- Онлайн-касса и отправка чеков (54-ФЗ через ЮKassa Чеки)
    receipt_email               VARCHAR(255) NOT NULL,
    receipt_status              receipt_status NOT NULL DEFAULT 'PENDING',
    yookassa_receipt_id         VARCHAR(64),

    failure_reason              VARCHAR(255),
    metadata_json               JSONB NOT NULL DEFAULT '{}'::jsonb,
    paid_at                     TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_user_created ON transactions(user_id, created_at DESC);
CREATE INDEX idx_transactions_status ON transactions(status);

ALTER TABLE user_prediction_purchases
    ADD CONSTRAINT fk_pred_purchase_tx
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;


-- Журнал входящих Webhooks от ЮKassa (гарантия идемпотентной обработки Exactly-Once)
CREATE TABLE payment_webhook_events (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider                VARCHAR(32) NOT NULL DEFAULT 'YOOKASSA',
    event_type              VARCHAR(64) NOT NULL, -- 'payment.succeeded', 'payment.canceled', 'refund.succeeded'
    yookassa_object_id      VARCHAR(64) NOT NULL,
    sender_ip               INET,
    raw_payload             JSONB NOT NULL,
    processed_successfully  BOOLEAN NOT NULL DEFAULT FALSE,
    processing_error        TEXT,
    received_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at            TIMESTAMPTZ,
    UNIQUE (provider, event_type, yookassa_object_id)
);


-- =============================================================================
-- 4. ВЕРИФИЦИРОВАННАЯ СТАТИСТИКА, EQUITY CURVE И SOCIAL PROOF
-- =============================================================================

-- Предрассчитанные витрины статистики для мгновенной отдачи на Главном экране (< 5 мс)
CREATE TABLE statistics_snapshots (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_key              stats_period_key NOT NULL, -- 'WEEK', 'MONTH', 'ALL_TIME'
    sport                   sport_type,                -- NULL = Общая статистика по всем видам спорта

    settled_bets_count      INT NOT NULL DEFAULT 0,
    wins_count              INT NOT NULL DEFAULT 0,
    losses_count            INT NOT NULL DEFAULT 0,
    pushes_count            INT NOT NULL DEFAULT 0,
    cashouts_count          INT NOT NULL DEFAULT 0,

    win_rate_pct            NUMERIC(5, 2) NOT NULL DEFAULT 0.00,  -- Процент захода (без учета Push)
    avg_odds                NUMERIC(6, 3) NOT NULL DEFAULT 0.000, -- Средний зафиксированный кэф
    turnover_units          NUMERIC(10, 3) NOT NULL DEFAULT 0.000,-- Оборот проставленных юнитов
    net_profit_units        NUMERIC(10, 3) NOT NULL DEFAULT 0.000,-- Чистая прибыль в юнитах
    yield_pct               NUMERIC(6, 2) NOT NULL DEFAULT 0.00,  -- Yield = (net_profit_units / turnover_units) * 100
    roi_bankroll_pct        NUMERIC(7, 2) NOT NULL DEFAULT 0.00,  -- Прирост к стартовому банку в %

    current_win_streak      INT NOT NULL DEFAULT 0,               -- Текущая серия побед (триггер доверия)
    best_win_streak         INT NOT NULL DEFAULT 0,
    max_drawdown_pct        NUMERIC(6, 2) NOT NULL DEFAULT 0.00,  -- Макс. просадка (честная метрика риска)

    recalculated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE NULLS NOT DISTINCT (period_key, sport)
);


-- Временной ряд для графика роста банка (Equity Curve по дням и месяцам)
CREATE TABLE equity_curve_points (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    point_date                  DATE NOT NULL,
    month_bucket                CHAR(7) NOT NULL, -- Формат 'YYYY-MM' для быстрой агрегации по месяцам
    sport                       sport_type,       -- NULL = Весь портфель
    settled_bets_count          INT NOT NULL DEFAULT 0,
    period_profit_units         NUMERIC(8, 3) NOT NULL DEFAULT 0.000,
    cumulative_profit_units     NUMERIC(10, 3) NOT NULL DEFAULT 0.000,
    bankroll_index_pct          NUMERIC(8, 2) NOT NULL DEFAULT 100.00, -- Старт с 100.00% банка
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE NULLS NOT DISTINCT (point_date, sport)
);

CREATE INDEX idx_equity_curve_month ON equity_curve_points(month_bucket, point_date);


-- События для Live-ленты социального доказательства (уведомления в углу экрана)
CREATE TABLE social_proof_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
    prediction_id       UUID REFERENCES predictions(id) ON DELETE CASCADE,
    display_name        VARCHAR(64) NOT NULL,  -- Напр.: "Иван"
    city                VARCHAR(64) NOT NULL,  -- Напр.: "Москва"
    sport               sport_type NOT NULL,
    event_type          VARCHAR(32) NOT NULL DEFAULT 'BET_WIN', -- 'BET_WIN', 'VIP_PURCHASE'
    won_amount_rub      NUMERIC(10, 2),        -- Рассчитано из reference_bankroll_rub купившего юзера
    is_visible          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_social_proof_recent ON social_proof_events(created_at DESC) WHERE is_visible = TRUE;


-- =============================================================================
-- 5. ПАРТНЕРСКАЯ ПРОГРАММА (РЕФЕРАЛЫ / REVSHARE ДЛЯ ВЕБМАСТЕРОВ)
-- =============================================================================

CREATE TABLE affiliate_partners (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revshare_percent        NUMERIC(5, 2) NOT NULL DEFAULT 30.00 CHECK (revshare_percent >= 0 AND revshare_percent <= 80.00),
    earn_on_renewals        BOOLEAN NOT NULL DEFAULT TRUE, -- Начислять ли % с рекуррентных автопродлений
    hold_days               SMALLINT NOT NULL DEFAULT 7 CHECK (hold_days >= 0),

    held_balance_rub        NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (held_balance_rub >= 0),
    available_balance_rub   NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (available_balance_rub >= 0),
    total_earned_rub        NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_earned_rub >= 0),
    total_withdrawn_rub     NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_withdrawn_rub >= 0),

    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Реферальные ссылки вебмастеров с поддержкой SubID для арбитража трафика
CREATE TABLE referral_links (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id              UUID NOT NULL REFERENCES affiliate_partners(id) ON DELETE CASCADE,
    code                    VARCHAR(40) UNIQUE NOT NULL, -- Напр.: 'khl_king' -> site.ru/?ref=khl_king
    campaign_label          VARCHAR(100),                -- Пометка источника (TG-канал, YouTube, Дорвей)
    clicks_count            INT NOT NULL DEFAULT 0,
    registrations_count     INT NOT NULL DEFAULT 0,
    paying_users_count      INT NOT NULL DEFAULT 0,
    gross_revenue_rub       NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users
    ADD CONSTRAINT fk_users_referral_link
    FOREIGN KEY (referral_link_id) REFERENCES referral_links(id) ON DELETE SET NULL;


-- Начисления реферальных комиссий с каждой оплаты приведенного клиента
CREATE TABLE affiliate_commissions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id              UUID NOT NULL REFERENCES affiliate_partners(id) ON DELETE RESTRICT,
    referral_link_id        UUID REFERENCES referral_links(id) ON DELETE SET NULL,
    referred_user_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    transaction_id          UUID UNIQUE NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,

    payment_amount_rub      NUMERIC(12, 2) NOT NULL,
    commission_percent      NUMERIC(5, 2) NOT NULL,
    commission_amount_rub   NUMERIC(12, 2) NOT NULL,
    status                  commission_status NOT NULL DEFAULT 'HELD',
    hold_until              TIMESTAMPTZ NOT NULL, -- Защита от возвратов/чарджбэков
    released_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aff_commissions_partner_status ON affiliate_commissions(partner_id, status, hold_until);


-- Заявки вебмастеров на вывод партнерского вознаграждения
CREATE TABLE affiliate_payouts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id              UUID NOT NULL REFERENCES affiliate_partners(id) ON DELETE RESTRICT,
    amount_rub              NUMERIC(12, 2) NOT NULL CHECK (amount_rub > 0),
    payout_method           VARCHAR(32) NOT NULL, -- 'SBP', 'CARD', 'USDT_TRC20'
    payout_requisites       VARCHAR(255) NOT NULL,
    status                  payout_status NOT NULL DEFAULT 'REQUESTED',
    processed_by_admin_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    rejection_reason        TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at            TIMESTAMPTZ
);

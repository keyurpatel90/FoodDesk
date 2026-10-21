-- ============================================================================
-- FOODDESK SUBSCRIPTIONS + RAZORPAY BILLING  (safe to run more than once)
-- Run in: Supabase Dashboard -> SQL Editor.
--
-- What this does
--   * adds subscription columns to `organizations` (creates the table only if it does not exist)
--   * creates `subscriptions` (history) and `payments` (Razorpay receipts)
--   * activate_organization_subscription(): the ONLY way a plan gets activated. Locks the org row,
--     is idempotent per Razorpay payment id, and can only be called with the service-role key.
--   * blocks signed-in users from editing subscription columns directly
--   * enables RLS on the billing tables (no client access; the API routes use the service role)
--
-- NOTE: keep tier prices / limits below in sync with lib/subscription-data.ts.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Enums -------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE subscription_tier_type AS ENUM ('starter', 'professional', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE subscription_status_type AS ENUM ('active', 'trial', 'inactive', 'past_due', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE payment_status_type AS ENUM ('captured', 'failed', 'refunded', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. organizations -------------------------------------------------------------
-- Only created if you do not already have one (multi-tenant setups normally do).
CREATE TABLE IF NOT EXISTS organizations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS updated_at                TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS subscription_tier         subscription_tier_type   NOT NULL DEFAULT 'professional',
    ADD COLUMN IF NOT EXISTS subscription_status       subscription_status_type NOT NULL DEFAULT 'trial',
    ADD COLUMN IF NOT EXISTS trial_ends_at             TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
    ADD COLUMN IF NOT EXISTS subscription_start_date   TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS subscription_end_date     TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
    ADD COLUMN IF NOT EXISTS max_tables_limit          INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN IF NOT EXISTS max_staff_limit           INTEGER NOT NULL DEFAULT 15,
    ADD COLUMN IF NOT EXISTS razorpay_customer_id      TEXT,
    ADD COLUMN IF NOT EXISTS razorpay_subscription_id  TEXT,
    ADD COLUMN IF NOT EXISTS auto_renew                BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS features_enabled          JSONB NOT NULL DEFAULT '{
        "kds_audio_alerts": true, "whatsapp_invoices": true, "loyalty_program": true,
        "advanced_analytics": true, "multi_outlet": false, "white_label": false, "multi_station_kds": false
    }'::jsonb;

-- Defaults for NEW restaurants: a 14-day Professional trial (works even if an earlier version of this
-- migration already created the columns with different defaults).
ALTER TABLE organizations
    ALTER COLUMN subscription_tier     SET DEFAULT 'professional',
    ALTER COLUMN subscription_status   SET DEFAULT 'trial',
    ALTER COLUMN trial_ends_at         SET DEFAULT (NOW() + INTERVAL '14 days'),
    ALTER COLUMN subscription_end_date SET DEFAULT (NOW() + INTERVAL '14 days'),
    ALTER COLUMN max_tables_limit      SET DEFAULT 30,
    ALTER COLUMN max_staff_limit       SET DEFAULT 15,
    ALTER COLUMN auto_renew            SET DEFAULT FALSE,
    ALTER COLUMN features_enabled      SET DEFAULT '{
        "kds_audio_alerts": true, "whatsapp_invoices": true, "loyalty_program": true,
        "advanced_analytics": true, "multi_outlet": false, "white_label": false, "multi_station_kds": false
    }'::jsonb;

-- 3. subscriptions (history) ---------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tier                     subscription_tier_type   NOT NULL,
    status                   subscription_status_type NOT NULL DEFAULT 'active',
    amount                   NUMERIC(10, 2) NOT NULL,           -- plan list price, e.g. 799.00
    currency                 VARCHAR(10) NOT NULL DEFAULT 'INR',
    billing_cycle            VARCHAR(20) NOT NULL DEFAULT 'monthly',
    current_period_start     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    razorpay_subscription_id TEXT,
    razorpay_plan_id         TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions (organization_id, created_at DESC);

-- 4. payments (Razorpay receipts) ----------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    subscription_id     UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    razorpay_order_id   TEXT NOT NULL,
    razorpay_payment_id TEXT UNIQUE NOT NULL,
    razorpay_signature  TEXT,                                   -- NULL when activated by the webhook
    amount              NUMERIC(10, 2) NOT NULL,                -- what was actually charged
    currency            VARCHAR(10) NOT NULL DEFAULT 'INR',
    status              payment_status_type NOT NULL DEFAULT 'captured',
    payment_method      TEXT DEFAULT 'razorpay',
    receipt_number      TEXT NOT NULL,
    invoice_pdf_url     TEXT,
    meta                JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_org ON payments (organization_id, created_at DESC);

CREATE SEQUENCE IF NOT EXISTS payment_receipt_seq START 1001;

-- Billing tables are private: only the server (service role, which bypasses RLS) reads or writes them.
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments      ENABLE ROW LEVEL SECURITY;

-- 5. Read-only helpers (safe to use inside RLS policies) -----------------------
CREATE OR REPLACE FUNCTION is_org_subscription_active(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((
        SELECT CASE subscription_status
                 WHEN 'active' THEN subscription_end_date > NOW()
                 WHEN 'trial'  THEN COALESCE(trial_ends_at, subscription_end_date) > NOW()
                 ELSE FALSE
               END
        FROM organizations WHERE id = p_org_id
    ), FALSE);
$$;

CREATE OR REPLACE FUNCTION has_org_feature(p_org_id UUID, p_feature_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT is_org_subscription_active(p_org_id)
       AND COALESCE((SELECT (features_enabled ->> p_feature_key)::BOOLEAN FROM organizations WHERE id = p_org_id), FALSE);
$$;

-- 6. Plan limits (keep in sync with lib/subscription-data.ts) ------------------
CREATE OR REPLACE FUNCTION tier_plan_details(p_tier subscription_tier_type)
RETURNS TABLE (price NUMERIC, max_tables INT, max_staff INT, features JSONB)
LANGUAGE sql IMMUTABLE AS $$
    SELECT t.price, t.max_tables, t.max_staff, t.features FROM (VALUES
        ('starter'::subscription_tier_type,      300::NUMERIC,   10,   5, '{"kds_audio_alerts":false,"whatsapp_invoices":false,"loyalty_program":false,"advanced_analytics":false,"multi_outlet":false,"white_label":false,"multi_station_kds":false}'::jsonb),
        ('professional'::subscription_tier_type, 799::NUMERIC,   30,  15, '{"kds_audio_alerts":true,"whatsapp_invoices":true,"loyalty_program":true,"advanced_analytics":true,"multi_outlet":false,"white_label":false,"multi_station_kds":false}'::jsonb),
        ('enterprise'::subscription_tier_type,   1199::NUMERIC, 9999, 9999, '{"kds_audio_alerts":true,"whatsapp_invoices":true,"loyalty_program":true,"advanced_analytics":true,"multi_outlet":true,"white_label":true,"multi_station_kds":true}'::jsonb)
    ) AS t(tier, price, max_tables, max_staff, features)
    WHERE t.tier = p_tier;
$$;

-- 7. Activation (the only write path for a paid plan) --------------------------
-- The previous version had a different argument list. Drop it so PostgREST never sees two overloads
-- (that is what causes "PGRST203: could not choose the best candidate function").
DROP FUNCTION IF EXISTS activate_organization_subscription(UUID, subscription_tier_type, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS activate_organization_subscription(UUID, subscription_tier_type, NUMERIC, TEXT, TEXT, TEXT, TEXT, INT);

CREATE OR REPLACE FUNCTION activate_organization_subscription(
    p_org_id              UUID,
    p_tier                subscription_tier_type,
    p_amount              NUMERIC,          -- amount actually charged, in rupees
    p_razorpay_order_id   TEXT,
    p_razorpay_payment_id TEXT,
    p_razorpay_signature  TEXT,
    p_payment_method      TEXT,
    p_period_days         INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_org      organizations%ROWTYPE;
    v_existing payments%ROWTYPE;
    v_plan     RECORD;
    v_stack    BOOLEAN;
    v_start    TIMESTAMPTZ;
    v_end      TIMESTAMPTZ;
    v_sub_id   UUID;
BEGIN
    -- Serialise concurrent activations (browser verify + webhook) for the same restaurant.
    SELECT * INTO v_org FROM organizations WHERE id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'organization % not found', p_org_id USING ERRCODE = 'P0002';
    END IF;

    -- Idempotent: the same Razorpay payment never extends the plan twice.
    SELECT * INTO v_existing FROM payments WHERE razorpay_payment_id = p_razorpay_payment_id;
    IF FOUND THEN
        IF v_existing.organization_id <> p_org_id THEN
            RAISE EXCEPTION 'payment % belongs to another organization', p_razorpay_payment_id USING ERRCODE = '42501';
        END IF;
        RETURN jsonb_build_object(
            'success', true, 'already_processed', true, 'organization_id', p_org_id,
            'tier', v_org.subscription_tier, 'status', v_org.subscription_status,
            'expires_at', v_org.subscription_end_date
        );
    END IF;

    SELECT * INTO v_plan FROM tier_plan_details(p_tier);

    -- Renewing the SAME plan while it is still running adds time on top of the current end date.
    -- Anything else (first purchase, expired, trial, upgrade) starts today.
    v_stack := v_org.subscription_status = 'active'
           AND v_org.subscription_tier = p_tier
           AND v_org.subscription_end_date IS NOT NULL
           AND v_org.subscription_end_date > NOW();
    v_start := CASE WHEN v_stack THEN v_org.subscription_end_date ELSE NOW() END;
    v_end   := v_start + make_interval(days => p_period_days);

    UPDATE organizations
       SET subscription_tier       = p_tier,
           subscription_status     = 'active',
           subscription_start_date = CASE WHEN v_stack THEN COALESCE(v_org.subscription_start_date, NOW()) ELSE NOW() END,
           subscription_end_date   = v_end,
           max_tables_limit        = v_plan.max_tables,
           max_staff_limit         = v_plan.max_staff,
           features_enabled        = v_plan.features,
           updated_at              = NOW()
     WHERE id = p_org_id;

    IF NOT v_stack THEN
        UPDATE subscriptions SET status = 'inactive', updated_at = NOW()
         WHERE organization_id = p_org_id AND status = 'active';
    END IF;

    INSERT INTO subscriptions (organization_id, tier, status, amount, current_period_start, current_period_end)
    VALUES (p_org_id, p_tier, 'active', v_plan.price, v_start, v_end)
    RETURNING id INTO v_sub_id;

    INSERT INTO payments (
        organization_id, subscription_id, razorpay_order_id, razorpay_payment_id, razorpay_signature,
        amount, status, payment_method, receipt_number
    ) VALUES (
        p_org_id, v_sub_id, p_razorpay_order_id, p_razorpay_payment_id, p_razorpay_signature,
        p_amount, 'captured', COALESCE(p_payment_method, 'razorpay'),
        'RCP-' || to_char(NOW(), 'YYYY') || '-' || lpad(nextval('payment_receipt_seq')::TEXT, 6, '0')
    );

    RETURN jsonb_build_object(
        'success', true, 'already_processed', false, 'organization_id', p_org_id,
        'tier', p_tier, 'subscription_id', v_sub_id, 'status', 'active', 'expires_at', v_end
    );
END;
$$;

-- SECURITY: without this, ANY logged-in user could call the function from the browser with the anon key
-- and grant their own restaurant a free Enterprise plan. Only the server (service role) may call it.
REVOKE ALL ON FUNCTION activate_organization_subscription(UUID, subscription_tier_type, NUMERIC, TEXT, TEXT, TEXT, TEXT, INT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION activate_organization_subscription(UUID, subscription_tier_type, NUMERIC, TEXT, TEXT, TEXT, TEXT, INT)
    TO service_role;

-- 8. Stop restaurants editing their own subscription columns ---------------------------------
-- If your RLS lets a restaurant admin UPDATE their organizations row, they could otherwise set
-- subscription_status = 'active' themselves. Updates made through the service role or the function
-- above (which run as the table owner) are still allowed.
CREATE OR REPLACE FUNCTION protect_org_subscription_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF current_user IN ('anon', 'authenticated') AND (
           NEW.subscription_tier       IS DISTINCT FROM OLD.subscription_tier
        OR NEW.subscription_status     IS DISTINCT FROM OLD.subscription_status
        OR NEW.trial_ends_at           IS DISTINCT FROM OLD.trial_ends_at
        OR NEW.subscription_start_date IS DISTINCT FROM OLD.subscription_start_date
        OR NEW.subscription_end_date   IS DISTINCT FROM OLD.subscription_end_date
        OR NEW.max_tables_limit        IS DISTINCT FROM OLD.max_tables_limit
        OR NEW.max_staff_limit         IS DISTINCT FROM OLD.max_staff_limit
        OR NEW.features_enabled        IS DISTINCT FROM OLD.features_enabled
        OR NEW.razorpay_customer_id    IS DISTINCT FROM OLD.razorpay_customer_id
        OR NEW.razorpay_subscription_id IS DISTINCT FROM OLD.razorpay_subscription_id
        OR NEW.auto_renew              IS DISTINCT FROM OLD.auto_renew
    ) THEN
        RAISE EXCEPTION 'Subscription fields can only be changed by the billing system' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_org_subscription ON organizations;
CREATE TRIGGER trg_protect_org_subscription
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION protect_org_subscription_columns();

-- 9. Enforce the subscription in the database (example; adapt table / column names) -------------
-- ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY orders_require_active_subscription ON orders
--     FOR INSERT WITH CHECK (is_org_subscription_active(organization_id));

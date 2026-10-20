-- ============================================================================
-- FOODDESK MULTI-TENANT SUBSCRIPTION & RAZORPAY BILLING SCHEMA
-- Migration: 20261019_subscriptions_and_payments.sql
-- Description: Adds organizations subscription tracking, payments table, 
--              tier-based feature gating, and database-level RLS enforcement.
-- ============================================================================

-- 1. Ensure pgcrypto extension is enabled for UUIDs & hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Subscription Tiers & Status Enums
DO $$ BEGIN
    CREATE TYPE subscription_tier_type AS ENUM ('starter', 'professional', 'enterprise');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE subscription_status_type AS ENUM ('active', 'trial', 'inactive', 'past_due', 'canceled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status_type AS ENUM ('captured', 'failed', 'refunded', 'pending');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Upgrade / Add columns to `organizations` table
ALTER TABLE IF EXISTS organizations 
ADD COLUMN IF NOT EXISTS subscription_tier subscription_tier_type DEFAULT 'starter',
ADD COLUMN IF NOT EXISTS subscription_status subscription_status_type DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
ADD COLUMN IF NOT EXISTS max_tables_limit INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS max_staff_limit INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS razorpay_customer_id TEXT,
ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS features_enabled JSONB DEFAULT '{
    "kds_audio_alerts": false,
    "whatsapp_invoices": false,
    "loyalty_program": false,
    "advanced_analytics": false,
    "multi_outlet": false,
    "white_label": false,
    "multi_station_kds": false
}'::jsonb;

-- If organizations table did not exist, create it cleanly
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    subscription_tier subscription_tier_type NOT NULL DEFAULT 'starter',
    subscription_status subscription_status_type NOT NULL DEFAULT 'trial',
    trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
    subscription_start_date TIMESTAMPTZ DEFAULT NOW(),
    subscription_end_date TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    max_tables_limit INTEGER NOT NULL DEFAULT 10,
    max_staff_limit INTEGER NOT NULL DEFAULT 5,
    razorpay_customer_id TEXT,
    razorpay_subscription_id TEXT,
    auto_renew BOOLEAN DEFAULT TRUE,
    features_enabled JSONB NOT NULL DEFAULT '{
        "kds_audio_alerts": false,
        "whatsapp_invoices": false,
        "loyalty_program": false,
        "advanced_analytics": false,
        "multi_outlet": false,
        "white_label": false,
        "multi_station_kds": false
    }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Subscriptions History Table
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tier subscription_tier_type NOT NULL,
    status subscription_status_type NOT NULL DEFAULT 'active',
    amount NUMERIC(10, 2) NOT NULL, -- e.g. 300.00, 799.00, 1199.00
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly',
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    razorpay_subscription_id TEXT,
    razorpay_plan_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Payments & Razorpay Transaction Receipts Table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    razorpay_order_id TEXT NOT NULL,
    razorpay_payment_id TEXT UNIQUE NOT NULL,
    razorpay_signature TEXT,
    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    status payment_status_type NOT NULL DEFAULT 'captured',
    payment_method TEXT DEFAULT 'upi', -- upi, card, netbanking, wallet
    receipt_number TEXT NOT NULL,
    invoice_pdf_url TEXT,
    meta JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Helper Function: Check if Organization Subscription is Active
CREATE OR REPLACE FUNCTION is_org_subscription_active(p_org_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_status subscription_status_type;
    v_end TIMESTAMPTZ;
BEGIN
    SELECT subscription_status, subscription_end_date 
    INTO v_status, v_end
    FROM organizations
    WHERE id = p_org_id;

    IF v_status IS NULL THEN
        RETURN FALSE;
    END IF;

    IF v_status = 'active' OR v_status = 'trial' THEN
        IF v_end IS NOT NULL AND v_end < NOW() THEN
            -- Expired
            UPDATE organizations SET subscription_status = 'inactive' WHERE id = p_org_id;
            RETURN FALSE;
        END IF;
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Helper Function: Check Feature Access at Database Level
CREATE OR REPLACE FUNCTION has_org_feature(p_org_id UUID, p_feature_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_active BOOLEAN;
    v_has_feature BOOLEAN;
BEGIN
    v_active := is_org_subscription_active(p_org_id);
    IF NOT v_active THEN
        RETURN FALSE;
    END IF;

    SELECT (features_enabled->>p_feature_key)::BOOLEAN
    INTO v_has_feature
    FROM organizations
    WHERE id = p_org_id;

    RETURN COALESCE(v_has_feature, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Stored Procedure: Activate Tier After Verified Razorpay Payment
CREATE OR REPLACE FUNCTION activate_organization_subscription(
    p_org_id UUID,
    p_tier subscription_tier_type,
    p_amount NUMERIC,
    p_razorpay_order_id TEXT,
    p_razorpay_payment_id TEXT,
    p_razorpay_signature TEXT,
    p_payment_method TEXT,
    p_receipt_number TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_sub_id UUID;
    v_max_tables INT;
    v_max_staff INT;
    v_features JSONB;
BEGIN
    -- Set limits & features according to the subscribed tier
    IF p_tier = 'starter' THEN
        v_max_tables := 10;
        v_max_staff := 5;
        v_features := '{
            "kds_audio_alerts": false,
            "whatsapp_invoices": false,
            "loyalty_program": false,
            "advanced_analytics": false,
            "multi_outlet": false,
            "white_label": false,
            "multi_station_kds": false
        }'::jsonb;
    ELSIF p_tier = 'professional' THEN
        v_max_tables := 30;
        v_max_staff := 15;
        v_features := '{
            "kds_audio_alerts": true,
            "whatsapp_invoices": true,
            "loyalty_program": true,
            "advanced_analytics": true,
            "multi_outlet": false,
            "white_label": false,
            "multi_station_kds": false
        }'::jsonb;
    ELSE -- enterprise
        v_max_tables := 9999;
        v_max_staff := 9999;
        v_features := '{
            "kds_audio_alerts": true,
            "whatsapp_invoices": true,
            "loyalty_program": true,
            "advanced_analytics": true,
            "multi_outlet": true,
            "white_label": true,
            "multi_station_kds": true
        }'::jsonb;
    END IF;

    -- Update Organization Table
    UPDATE organizations
    SET subscription_tier = p_tier,
        subscription_status = 'active',
        subscription_start_date = NOW(),
        subscription_end_date = NOW() + INTERVAL '30 days',
        max_tables_limit = v_max_tables,
        max_staff_limit = v_max_staff,
        features_enabled = v_features,
        updated_at = NOW()
    WHERE id = p_org_id;

    -- Insert into Subscriptions Table
    INSERT INTO subscriptions (
        organization_id, tier, status, amount, current_period_start, current_period_end
    ) VALUES (
        p_org_id, p_tier, 'active', p_amount, NOW(), NOW() + INTERVAL '30 days'
    ) RETURNING id INTO v_sub_id;

    -- Insert into Payments Table
    INSERT INTO payments (
        organization_id, subscription_id, razorpay_order_id, razorpay_payment_id,
        razorpay_signature, amount, status, payment_method, receipt_number
    ) VALUES (
        p_org_id, v_sub_id, p_razorpay_order_id, p_razorpay_payment_id,
        p_razorpay_signature, p_amount, 'captured', p_payment_method, p_receipt_number
    );

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', p_org_id,
        'tier', p_tier,
        'subscription_id', v_sub_id,
        'status', 'active',
        'expires_at', (NOW() + INTERVAL '30 days')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Row-Level Security (RLS) Enforcement Examples
-- Example: Restrict order creation if organization subscription is inactive
-- ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY orders_subscription_active_policy ON orders
--     FOR INSERT
--     WITH CHECK (is_org_subscription_active(organization_id));

-- CREATE POLICY orders_select_policy ON orders
--     FOR SELECT
--     USING (is_org_subscription_active(organization_id) OR auth.jwt() ->> 'role' = 'org_admin');

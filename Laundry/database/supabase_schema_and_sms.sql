-- ============================================================================
-- AQUART LAUNDRY - SUPABASE POSTGRESQL SCHEMA & REALTIME CLOUD SYNC
-- Run this in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- Safe to run multiple times (uses IF NOT EXISTS).
-- ============================================================================

-- 1. Orders Table (already used by AquartCloudSync)
CREATE TABLE IF NOT EXISTS public.laundry_orders (
    id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL DEFAULT 'Customer',
    customer_phone TEXT NOT NULL DEFAULT '',
    customer_address TEXT DEFAULT '',
    service_id TEXT DEFAULT '',
    service_name TEXT DEFAULT 'Wash - Dry - Fold',
    weight NUMERIC(6, 2) DEFAULT 5.00,
    add_ons JSONB DEFAULT '[]'::jsonb,
    subtotal NUMERIC(10, 2) DEFAULT 0.00,
    add_on_total NUMERIC(10, 2) DEFAULT 0.00,
    delivery_fee NUMERIC(10, 2) DEFAULT 0.00,
    total_amount NUMERIC(10, 2) DEFAULT 0.00,
    payment_status TEXT DEFAULT 'unpaid',
    payment_method TEXT DEFAULT 'cash',
    payment_ref_number TEXT DEFAULT '',
    payment_proof_image TEXT DEFAULT NULL,
    status TEXT DEFAULT 'reserved',
    drop_off_date TEXT DEFAULT '',
    drop_off_slot TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    is_delivery BOOLEAN DEFAULT FALSE,
    is_online_reservation BOOLEAN DEFAULT FALSE,
    history JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Outgoing SMS & Notification Logs Table
CREATE TABLE IF NOT EXISTS public.laundry_notifications (
    id TEXT PRIMARY KEY,
    order_id TEXT DEFAULT '',
    customer_phone TEXT NOT NULL,
    customer_name TEXT DEFAULT 'Customer',
    status TEXT DEFAULT 'reserved',
    message TEXT NOT NULL,
    type TEXT DEFAULT 'sms',
    sms_status TEXT DEFAULT 'pending', -- pending | sent | failed | skipped | local
    sms_error TEXT DEFAULT NULL,
    provider_message_id TEXT DEFAULT NULL,
    sent_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_phone_created
    ON public.laundry_notifications (customer_phone, created_at DESC);

-- 3. Inventory & Supplies Table
CREATE TABLE IF NOT EXISTS public.laundry_inventory (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'other',
    stock NUMERIC(10, 2) DEFAULT 0,
    min_stock NUMERIC(10, 2) DEFAULT 5,
    max_stock NUMERIC(10, 2) DEFAULT 100,
    unit TEXT DEFAULT 'units',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Customers CRM Table
CREATE TABLE IF NOT EXISTS public.laundry_customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT DEFAULT '',
    total_orders INTEGER DEFAULT 0,
    total_spent NUMERIC(10, 2) DEFAULT 0.00,
    last_visit TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Customer Feedbacks Table
CREATE TABLE IF NOT EXISTS public.laundry_feedbacks (
    id TEXT PRIMARY KEY,
    order_id TEXT DEFAULT '',
    customer_name TEXT DEFAULT 'Customer',
    service_name TEXT DEFAULT 'Laundry Service',
    rating INTEGER DEFAULT 5,
    comment TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Customer Inquiries / Assistance Desk Table
CREATE TABLE IF NOT EXISTS public.laundry_inquiries (
    id TEXT PRIMARY KEY,
    name TEXT DEFAULT 'Anonymous',
    contact TEXT DEFAULT 'N/A',
    subject TEXT DEFAULT 'General Inquiry',
    message TEXT NOT NULL,
    is_anonymous BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR ANON CLIENT SYNC
-- ============================================================================
ALTER TABLE public.laundry_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_inquiries ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'laundry_orders',
        'laundry_notifications',
        'laundry_inventory',
        'laundry_customers',
        'laundry_feedbacks',
        'laundry_inquiries'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow anon all %s" ON public.%I', tbl, tbl);
        EXECUTE format('CREATE POLICY "Allow anon all %s" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', tbl, tbl);
    END LOOP;
END $$;


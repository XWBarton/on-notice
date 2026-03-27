CREATE TABLE IF NOT EXISTS kofi_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kofi_transaction_id TEXT UNIQUE NOT NULL,
  from_name TEXT,
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL,
  type TEXT NOT NULL, -- 'Donation' | 'Subscription'
  is_subscription_payment BOOLEAN NOT NULL DEFAULT false,
  is_first_subscription_payment BOOLEAN NOT NULL DEFAULT false,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

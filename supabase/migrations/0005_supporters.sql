CREATE TABLE IF NOT EXISTS supporters (
  id SERIAL PRIMARY KEY,
  total_monthly_aud NUMERIC(10, 2) NOT NULL DEFAULT 0,
  supporter_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed with a single row we'll always upsert into
INSERT INTO supporters (id, total_monthly_aud, supporter_count)
VALUES (1, 0, 0)
ON CONFLICT (id) DO NOTHING;

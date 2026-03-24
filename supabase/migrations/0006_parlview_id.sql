ALTER TABLE sitting_days ADD COLUMN IF NOT EXISTS parlview_id TEXT;
ALTER TABLE sitting_days ADD COLUMN IF NOT EXISTS audio_url TEXT;
ALTER TABLE sitting_days ADD COLUMN IF NOT EXISTS audio_duration_sec INTEGER;

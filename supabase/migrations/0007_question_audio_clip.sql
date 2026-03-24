-- Per-question audio clip URL (individual Q&A segment uploaded to R2)
ALTER TABLE questions ADD COLUMN IF NOT EXISTS audio_clip_url TEXT;

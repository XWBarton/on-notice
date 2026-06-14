-- WA debates: grievances, ministerial statements, and member statements.
-- One row per Hansard section. Audio (when available from the video gallery)
-- and the speaker-by-speaker transcript are denormalised onto the row so the
-- web app needs no joins to render a debate card.
CREATE TABLE IF NOT EXISTS debates (
  id                 BIGSERIAL PRIMARY KEY,
  sitting_day_id     BIGINT REFERENCES sitting_days(id),
  hansard_section    INT,
  proceeding_type    TEXT,            -- 'grievance' | 'ministerial_statement' | 'member_statement'
  sequence           INT DEFAULT 0,   -- order within the sitting day
  title              TEXT,
  ai_summary         TEXT,
  transcript_json    JSONB,           -- [{ speaker, member_id, party_short, party_colour, text }]
  audio_clip_url     TEXT,
  audio_duration_sec INT,
  gallery_chapter    INT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT debates_sitting_day_section_unique UNIQUE (sitting_day_id, hansard_section)
);

CREATE INDEX IF NOT EXISTS idx_debates_sitting_day ON debates(sitting_day_id);

-- On Notice — Initial Schema
-- Run: supabase db push

CREATE TABLE IF NOT EXISTS parliaments (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  jurisdiction  TEXT NOT NULL,
  chamber       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parties (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  short_name    TEXT NOT NULL,
  colour_hex    TEXT,
  jurisdiction  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id            TEXT PRIMARY KEY,
  parliament_id TEXT REFERENCES parliaments(id),
  name_display  TEXT NOT NULL,
  name_last     TEXT NOT NULL,
  name_first    TEXT,
  party_id      TEXT REFERENCES parties(id),
  electorate    TEXT,
  role          TEXT,
  is_active     BOOLEAN DEFAULT true,
  scraped_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sitting_days (
  id               BIGSERIAL PRIMARY KEY,
  parliament_id    TEXT REFERENCES parliaments(id),
  sitting_date     DATE NOT NULL,
  hansard_url      TEXT,
  audio_source_url TEXT,
  pipeline_status  TEXT DEFAULT 'pending',
  pipeline_error   TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(parliament_id, sitting_date)
);

CREATE TABLE IF NOT EXISTS bills (
  id              BIGSERIAL PRIMARY KEY,
  parliament_id   TEXT REFERENCES parliaments(id),
  sitting_day_id  BIGINT REFERENCES sitting_days(id),
  bill_number     TEXT,
  short_title     TEXT NOT NULL,
  long_title      TEXT,
  introduced_by   TEXT REFERENCES members(id),
  introduced_date DATE,
  bill_stage      TEXT,
  ai_summary      TEXT,
  source_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(parliament_id, bill_number)
);

CREATE TABLE IF NOT EXISTS divisions (
  id              BIGSERIAL PRIMARY KEY,
  sitting_day_id  BIGINT REFERENCES sitting_days(id),
  division_number INT,
  subject         TEXT NOT NULL,
  result          TEXT,
  ayes_count      INT,
  noes_count      INT,
  occurred_at     TIMESTAMPTZ,
  hansard_ref     TEXT,
  bill_id         BIGINT REFERENCES bills(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS division_votes (
  id          BIGSERIAL PRIMARY KEY,
  division_id BIGINT REFERENCES divisions(id),
  member_id   TEXT REFERENCES members(id),
  vote        TEXT NOT NULL CHECK (vote IN ('aye', 'no', 'abstain', 'absent')),
  UNIQUE(division_id, member_id)
);

CREATE TABLE IF NOT EXISTS questions (
  id               BIGSERIAL PRIMARY KEY,
  sitting_day_id   BIGINT REFERENCES sitting_days(id),
  question_number  INT,
  asker_id         TEXT REFERENCES members(id),
  minister_id      TEXT REFERENCES members(id),
  subject          TEXT,
  question_text    TEXT,
  answer_text      TEXT,
  is_dorothy_dixer BOOLEAN DEFAULT false,
  ai_summary       TEXT,
  audio_start_sec  FLOAT,
  audio_end_sec    FLOAT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS episodes (
  id                   BIGSERIAL PRIMARY KEY,
  sitting_day_id       BIGINT REFERENCES sitting_days(id) UNIQUE,
  title                TEXT NOT NULL,
  description          TEXT,
  duration_sec         INT,
  audio_url            TEXT,
  audio_raw_url        TEXT,
  transcript_url       TEXT,
  question_count       INT,
  dorothy_dixer_count  INT,
  published_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_digests (
  id                 BIGSERIAL PRIMARY KEY,
  sitting_day_id     BIGINT REFERENCES sitting_days(id) UNIQUE,
  ai_summary         TEXT,
  lede               TEXT,
  bills_summary      TEXT,
  divisions_summary  TEXT,
  generated_at       TIMESTAMPTZ
);

-- Seed reference parliaments
INSERT INTO parliaments (id, name, jurisdiction, chamber) VALUES
  ('fed_hor', 'House of Representatives', 'federal', 'lower'),
  ('fed_sen', 'Senate', 'federal', 'upper'),
  ('wa_la', 'Legislative Assembly', 'wa', 'lower'),
  ('wa_lc', 'Legislative Council', 'wa', 'upper')
ON CONFLICT (id) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sitting_days_date ON sitting_days(sitting_date DESC);
CREATE INDEX IF NOT EXISTS idx_questions_sitting ON questions(sitting_day_id);
CREATE INDEX IF NOT EXISTS idx_questions_dixer ON questions(is_dorothy_dixer);
CREATE INDEX IF NOT EXISTS idx_division_votes_member ON division_votes(member_id);
CREATE INDEX IF NOT EXISTS idx_division_votes_division ON division_votes(division_id);
CREATE INDEX IF NOT EXISTS idx_members_party ON members(party_id);
CREATE INDEX IF NOT EXISTS idx_members_name_last ON members(name_last);
CREATE INDEX IF NOT EXISTS idx_bills_sitting ON bills(sitting_day_id);
CREATE INDEX IF NOT EXISTS idx_divisions_sitting ON divisions(sitting_day_id);

-- Add source_note to questions to flag when transcript was derived from ParlView captions
-- rather than official Hansard (e.g. when OpenAustralia hasn't indexed the question yet).
ALTER TABLE questions ADD COLUMN IF NOT EXISTS source_note TEXT;

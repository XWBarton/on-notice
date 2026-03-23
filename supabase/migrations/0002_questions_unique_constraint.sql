-- Add unique constraint on (sitting_day_id, question_number) to support upsert on re-runs
ALTER TABLE questions
  ADD CONSTRAINT questions_sitting_day_id_question_number_key
  UNIQUE (sitting_day_id, question_number);

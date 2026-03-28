-- Add unique constraint so WA pipeline can upsert questions without duplicates
ALTER TABLE questions
  ADD CONSTRAINT questions_sitting_day_question_number_unique
  UNIQUE (sitting_day_id, question_number);

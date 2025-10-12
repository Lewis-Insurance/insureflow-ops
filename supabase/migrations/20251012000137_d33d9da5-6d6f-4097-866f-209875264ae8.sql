-- Make question_canonical nullable to allow non-Q&A knowledge entries
ALTER TABLE kb_entries 
ALTER COLUMN question_canonical DROP NOT NULL;
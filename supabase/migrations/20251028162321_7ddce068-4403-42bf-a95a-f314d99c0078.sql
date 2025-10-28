-- Add column to store which pages were analyzed
ALTER TABLE document_analysis 
ADD COLUMN IF NOT EXISTS pages_analyzed TEXT;

COMMENT ON COLUMN document_analysis.pages_analyzed IS 'Pages that were analyzed, e.g., "1-10" or "3, 5, 7-12"';
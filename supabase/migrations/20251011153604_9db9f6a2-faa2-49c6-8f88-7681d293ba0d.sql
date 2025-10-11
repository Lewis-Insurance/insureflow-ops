-- Add missing columns for AI functionality
ALTER TABLE knowledge_base 
ADD COLUMN IF NOT EXISTS embedding vector(1536),
ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Create vector index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding 
ON knowledge_base 
USING ivfflat (embedding vector_cosine_ops);

-- Ensure pgvector extension is enabled
CREATE EXTENSION IF NOT EXISTS vector;
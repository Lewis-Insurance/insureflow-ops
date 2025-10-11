-- Create knowledge_gaps table to track unanswered questions
CREATE TABLE IF NOT EXISTS public.knowledge_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  frequency INTEGER DEFAULT 1,
  answered BOOLEAN DEFAULT false,
  context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_asked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.knowledge_gaps ENABLE ROW LEVEL SECURITY;

-- Allow staff to view and manage knowledge gaps
CREATE POLICY "Staff can view knowledge gaps"
ON public.knowledge_gaps
FOR SELECT
TO authenticated
USING (is_staff());

CREATE POLICY "Staff can insert knowledge gaps"
ON public.knowledge_gaps
FOR INSERT
TO authenticated
WITH CHECK (is_staff());

CREATE POLICY "Staff can update knowledge gaps"
ON public.knowledge_gaps
FOR UPDATE
TO authenticated
USING (is_staff())
WITH CHECK (is_staff());

-- Create index for faster queries
CREATE INDEX idx_knowledge_gaps_frequency ON public.knowledge_gaps(frequency DESC);
CREATE INDEX idx_knowledge_gaps_answered ON public.knowledge_gaps(answered);
CREATE INDEX idx_knowledge_gaps_created_at ON public.knowledge_gaps(created_at DESC);

-- Function to increment frequency or insert new gap
CREATE OR REPLACE FUNCTION public.log_knowledge_gap(p_question TEXT, p_context TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_gap_id UUID;
  v_similar_question TEXT;
BEGIN
  -- Check if similar question exists (case-insensitive)
  SELECT id, question INTO v_gap_id, v_similar_question
  FROM public.knowledge_gaps
  WHERE LOWER(question) = LOWER(p_question)
    AND answered = false
  LIMIT 1;
  
  IF v_gap_id IS NOT NULL THEN
    -- Update existing gap
    UPDATE public.knowledge_gaps
    SET frequency = frequency + 1,
        last_asked_at = NOW(),
        updated_at = NOW(),
        context = COALESCE(p_context, context)
    WHERE id = v_gap_id;
  ELSE
    -- Insert new gap
    INSERT INTO public.knowledge_gaps (question, context)
    VALUES (p_question, p_context)
    RETURNING id INTO v_gap_id;
  END IF;
  
  RETURN v_gap_id;
END;
$$;
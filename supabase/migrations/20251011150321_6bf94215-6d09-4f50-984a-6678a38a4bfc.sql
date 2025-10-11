-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create knowledge base table
CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  source TEXT,
  embedding vector(768),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding ON public.knowledge_base 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create indexes for filtering
CREATE INDEX IF NOT EXISTS idx_knowledge_account ON public.knowledge_base(account_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON public.knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_tags ON public.knowledge_base USING GIN(tags);

-- Enable RLS
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view knowledge in their account"
ON public.knowledge_base
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = knowledge_base.account_id 
    AND m.user_id = auth.uid()
  )
);

CREATE POLICY "Staff can manage knowledge"
ON public.knowledge_base
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = knowledge_base.account_id 
    AND m.user_id = auth.uid()
    AND m.role IN ('owner', 'staff')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = knowledge_base.account_id 
    AND m.user_id = auth.uid()
    AND m.role IN ('owner', 'staff')
  )
);

-- Create function for semantic search
CREATE OR REPLACE FUNCTION search_knowledge(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  filter_category text DEFAULT NULL,
  filter_account_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  category text,
  tags text[],
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.title,
    kb.content,
    kb.category,
    kb.tags,
    1 - (kb.embedding <=> query_embedding) as similarity
  FROM public.knowledge_base kb
  WHERE 
    (filter_account_id IS NULL OR kb.account_id = filter_account_id)
    AND (filter_category IS NULL OR kb.category = filter_category)
    AND kb.embedding IS NOT NULL
    AND 1 - (kb.embedding <=> query_embedding) > match_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create trigger for updated_at
CREATE TRIGGER update_knowledge_timestamp
BEFORE UPDATE ON public.knowledge_base
FOR EACH ROW
EXECUTE FUNCTION update_queue_updated_at();

-- Create conversation history table for AI chat
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on conversation tables
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

-- RLS for conversations
CREATE POLICY "Users can view their own conversations"
ON public.ai_conversations
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create conversations"
ON public.ai_conversations
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own conversations"
ON public.ai_conversations
FOR UPDATE
USING (user_id = auth.uid());

-- RLS for messages
CREATE POLICY "Users can view messages in their conversations"
ON public.ai_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = ai_messages.conversation_id 
    AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert messages in their conversations"
ON public.ai_messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = ai_messages.conversation_id 
    AND c.user_id = auth.uid()
  )
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_conversations_user ON public.ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.ai_messages(created_at DESC);
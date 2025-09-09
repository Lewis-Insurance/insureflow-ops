-- Update notes table to reference customers
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS title TEXT;

-- Update tasks table to reference customers  
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES auth.users(id);
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS due_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 3;

-- Set default title for existing tasks without title
UPDATE public.tasks SET title = 'Untitled Task' WHERE title IS NULL;
ALTER TABLE public.tasks ALTER COLUMN title SET NOT NULL;
ALTER TABLE public.tasks ALTER COLUMN title SET DEFAULT 'Untitled Task';

-- Create function for updating search vector
CREATE OR REPLACE FUNCTION public.customers_tsvector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.email, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.phone, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.address->>'city', '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for search vector updates
CREATE TRIGGER customers_search_vector_trigger
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_tsvector_update();

-- Enable RLS on all new tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
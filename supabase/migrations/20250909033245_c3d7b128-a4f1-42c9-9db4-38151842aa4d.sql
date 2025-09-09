-- Create enums for the customer management system
CREATE TYPE note_type AS ENUM ('general', 'call', 'email', 'meeting', 'system');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'blocked', 'done', 'cancelled');
CREATE TYPE opportunity_stage AS ENUM ('new', 'qualified', 'proposal', 'negotiation', 'won', 'lost');

-- Create customers table (separate from accounts)
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address JSONB,
  status TEXT DEFAULT 'active',
  type TEXT DEFAULT 'individual',
  notes_summary TEXT,
  search_vector TSVECTOR,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create tags table for reusable labels
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(account_id, LOWER(name))
);

-- Create customer_tags junction table
CREATE TABLE public.customer_tags (
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (customer_id, tag_id)
);

-- Update notes table to reference customers
ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_account_id_fkey;
ALTER TABLE public.notes ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE public.notes ADD COLUMN type note_type DEFAULT 'general';
ALTER TABLE public.notes ADD COLUMN title TEXT;
ALTER TABLE public.notes ALTER COLUMN body TYPE TEXT;

-- Update tasks table to reference customers  
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_account_id_fkey;
ALTER TABLE public.tasks ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD COLUMN assignee_id UUID REFERENCES auth.users(id);
ALTER TABLE public.tasks ADD COLUMN title TEXT NOT NULL DEFAULT 'Untitled Task';
ALTER TABLE public.tasks ADD COLUMN details TEXT;
ALTER TABLE public.tasks ADD COLUMN due_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.tasks ADD COLUMN status task_status DEFAULT 'todo';
ALTER TABLE public.tasks ADD COLUMN priority INTEGER DEFAULT 3;

-- Create opportunities table
CREATE TABLE public.opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stage opportunity_stage DEFAULT 'new',
  expected_value NUMERIC(10,2),
  close_date DATE,
  source TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_customers_account_id ON public.customers(account_id);
CREATE INDEX idx_customers_search_vector ON public.customers USING GIN(search_vector);
CREATE INDEX idx_customers_email ON public.customers(email);
CREATE INDEX idx_customers_phone ON public.customers(phone);
CREATE INDEX idx_tags_account_id ON public.tags(account_id);
CREATE INDEX idx_customer_tags_customer_id ON public.customer_tags(customer_id);
CREATE INDEX idx_customer_tags_tag_id ON public.customer_tags(tag_id);
CREATE INDEX idx_opportunities_customer_id ON public.opportunities(customer_id);
CREATE INDEX idx_opportunities_account_id ON public.opportunities(account_id);

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

-- Create is_member function for RLS
CREATE OR REPLACE FUNCTION public.is_member(account_id UUID, roles TEXT[] DEFAULT ARRAY['owner', 'staff', 'viewer'])
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.account_memberships am
    WHERE am.account_id = is_member.account_id
    AND am.user_id = auth.uid()
    AND am.role = ANY(roles)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Enable RLS on all tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for customers
CREATE POLICY "Members can view customers" ON public.customers
  FOR SELECT USING (public.is_member(account_id));

CREATE POLICY "Owners and staff can manage customers" ON public.customers
  FOR ALL USING (public.is_member(account_id, ARRAY['owner', 'staff']));

-- Create RLS policies for tags
CREATE POLICY "Members can view tags" ON public.tags
  FOR SELECT USING (public.is_member(account_id));

CREATE POLICY "Owners and staff can manage tags" ON public.tags
  FOR ALL USING (public.is_member(account_id, ARRAY['owner', 'staff']));

-- Create RLS policies for customer_tags
CREATE POLICY "Members can view customer tags" ON public.customer_tags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.customers c 
      WHERE c.id = customer_tags.customer_id 
      AND public.is_member(c.account_id)
    )
  );

CREATE POLICY "Owners and staff can manage customer tags" ON public.customer_tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.customers c 
      WHERE c.id = customer_tags.customer_id 
      AND public.is_member(c.account_id, ARRAY['owner', 'staff'])
    )
  );

-- Create RLS policies for opportunities
CREATE POLICY "Members can view opportunities" ON public.opportunities
  FOR SELECT USING (public.is_member(account_id));

CREATE POLICY "Owners and staff can manage opportunities" ON public.opportunities
  FOR ALL USING (public.is_member(account_id, ARRAY['owner', 'staff']));

-- Update existing notes and tasks RLS policies to work with customers
DROP POLICY IF EXISTS "Users can manage their own notes" ON public.notes;
DROP POLICY IF EXISTS "Users can manage their own tasks" ON public.tasks;

CREATE POLICY "Members can view notes" ON public.notes
  FOR SELECT USING (
    CASE 
      WHEN customer_id IS NOT NULL THEN
        EXISTS (
          SELECT 1 FROM public.customers c 
          WHERE c.id = notes.customer_id 
          AND public.is_member(c.account_id)
        )
      ELSE account_id IS NOT NULL AND public.is_member(account_id)
    END
  );

CREATE POLICY "Owners and staff can manage notes" ON public.notes
  FOR ALL USING (
    CASE 
      WHEN customer_id IS NOT NULL THEN
        EXISTS (
          SELECT 1 FROM public.customers c 
          WHERE c.id = notes.customer_id 
          AND public.is_member(c.account_id, ARRAY['owner', 'staff'])
        )
      ELSE account_id IS NOT NULL AND public.is_member(account_id, ARRAY['owner', 'staff'])
    END
  );

CREATE POLICY "Members can view tasks" ON public.tasks
  FOR SELECT USING (
    CASE 
      WHEN customer_id IS NOT NULL THEN
        EXISTS (
          SELECT 1 FROM public.customers c 
          WHERE c.id = tasks.customer_id 
          AND public.is_member(c.account_id)
        )
      ELSE account_id IS NOT NULL AND public.is_member(account_id)
    END
  );

CREATE POLICY "Owners and staff can manage tasks" ON public.tasks
  FOR ALL USING (
    CASE 
      WHEN customer_id IS NOT NULL THEN
        EXISTS (
          SELECT 1 FROM public.customers c 
          WHERE c.id = tasks.customer_id 
          AND public.is_member(c.account_id, ARRAY['owner', 'staff'])
        )
      ELSE account_id IS NOT NULL AND public.is_member(account_id, ARRAY['owner', 'staff'])
    END
  );

-- Create RPC for customer search
CREATE OR REPLACE FUNCTION public.customers_search(
  q TEXT DEFAULT '',
  account_id UUID DEFAULT NULL,
  limit_count INTEGER DEFAULT 25,
  offset_count INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  phone TEXT,
  address JSONB,
  status TEXT,
  type TEXT,
  notes_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  tags JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.email,
    c.phone,
    c.address,
    c.status,
    c.type,
    c.notes_summary,
    c.created_at,
    c.updated_at,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'name', t.name,
            'color', t.color
          )
        )
        FROM public.customer_tags ct
        JOIN public.tags t ON t.id = ct.tag_id
        WHERE ct.customer_id = c.id
      ), 
      '[]'::jsonb
    ) as tags
  FROM public.customers c
  WHERE 
    (customers_search.account_id IS NULL OR c.account_id = customers_search.account_id)
    AND (
      q = '' OR 
      c.search_vector @@ plainto_tsquery('english', q) OR
      c.name ILIKE '%' || q || '%' OR
      c.email ILIKE '%' || q || '%' OR
      c.phone ILIKE '%' || q || '%'
    )
    AND public.is_member(c.account_id)
  ORDER BY 
    CASE WHEN q != '' THEN ts_rank(c.search_vector, plainto_tsquery('english', q)) END DESC NULLS LAST,
    c.updated_at DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create RPC for adding tags to customers
CREATE OR REPLACE FUNCTION public.add_tag_to_customer(
  account_id UUID,
  customer_id UUID,
  tag_name TEXT,
  tag_color TEXT DEFAULT '#3b82f6'
)
RETURNS JSONB AS $$
DECLARE
  tag_id UUID;
  existing_tag_id UUID;
BEGIN
  -- Check if user has permission
  IF NOT public.is_member(account_id, ARRAY['owner', 'staff']) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Check if customer belongs to account
  IF NOT EXISTS (
    SELECT 1 FROM public.customers c 
    WHERE c.id = customer_id AND c.account_id = add_tag_to_customer.account_id
  ) THEN
    RAISE EXCEPTION 'Customer not found or access denied';
  END IF;

  -- Get or create tag
  SELECT id INTO existing_tag_id 
  FROM public.tags t 
  WHERE t.account_id = add_tag_to_customer.account_id 
  AND LOWER(t.name) = LOWER(tag_name);

  IF existing_tag_id IS NULL THEN
    INSERT INTO public.tags (account_id, name, color)
    VALUES (add_tag_to_customer.account_id, tag_name, tag_color)
    RETURNING id INTO tag_id;
  ELSE
    tag_id := existing_tag_id;
  END IF;

  -- Link tag to customer (ignore if already linked)
  INSERT INTO public.customer_tags (customer_id, tag_id)
  VALUES (customer_id, tag_id)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'tag_id', tag_id,
    'tag_name', tag_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create RPC for seeding default tags
CREATE OR REPLACE FUNCTION public.seed_default_tags(account_id UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB := '[]'::jsonb;
BEGIN
  -- Check if user has permission
  IF NOT public.is_member(account_id, ARRAY['owner', 'staff']) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Insert default tags
  INSERT INTO public.tags (account_id, name, color) VALUES
    (account_id, 'Lead', '#ef4444'),
    (account_id, 'Active', '#22c55e'),
    (account_id, 'High Value', '#f59e0b')
  ON CONFLICT (account_id, LOWER(name)) DO NOTHING;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'color', t.color
    )
  ) INTO result
  FROM public.tags t
  WHERE t.account_id = seed_default_tags.account_id;

  RETURN jsonb_build_object('success', true, 'tags', result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
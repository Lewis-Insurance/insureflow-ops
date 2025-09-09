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
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create unique constraint for tags (account_id, name case-insensitive)
CREATE UNIQUE INDEX tags_account_name_unique 
ON public.tags (account_id, LOWER(name));

-- Create customer_tags junction table
CREATE TABLE public.customer_tags (
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (customer_id, tag_id)
);

-- Create opportunities table
CREATE TABLE public.opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stage TEXT DEFAULT 'new',
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
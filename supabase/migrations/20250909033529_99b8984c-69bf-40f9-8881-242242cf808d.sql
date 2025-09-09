-- Create RLS policies for customers using existing is_member function
CREATE POLICY "Members can view customers" ON public.customers
  FOR SELECT USING (public.is_account_member(account_id));

CREATE POLICY "Staff can manage customers" ON public.customers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.account_id = customers.account_id
      AND am.user_id = auth.uid()
      AND am.role IN ('owner', 'staff')
    )
  );

-- Create RLS policies for tags
CREATE POLICY "Members can view tags" ON public.tags
  FOR SELECT USING (public.is_account_member(account_id));

CREATE POLICY "Staff can manage tags" ON public.tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.account_id = tags.account_id
      AND am.user_id = auth.uid()
      AND am.role IN ('owner', 'staff')
    )
  );

-- Create RLS policies for customer_tags
CREATE POLICY "Members can view customer tags" ON public.customer_tags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.customers c 
      WHERE c.id = customer_tags.customer_id 
      AND public.is_account_member(c.account_id)
    )
  );

CREATE POLICY "Staff can manage customer tags" ON public.customer_tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.customers c 
      JOIN public.account_memberships am ON am.account_id = c.account_id
      WHERE c.id = customer_tags.customer_id 
      AND am.user_id = auth.uid()
      AND am.role IN ('owner', 'staff')
    )
  );

-- Create RLS policies for opportunities
CREATE POLICY "Members can view opportunities" ON public.opportunities
  FOR SELECT USING (public.is_account_member(account_id));

CREATE POLICY "Staff can manage opportunities" ON public.opportunities
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.account_id = opportunities.account_id
      AND am.user_id = auth.uid()
      AND am.role IN ('owner', 'staff')
    )
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
    AND public.is_account_member(c.account_id)
  ORDER BY 
    CASE WHEN q != '' THEN ts_rank(c.search_vector, plainto_tsquery('english', q)) END DESC NULLS LAST,
    c.updated_at DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
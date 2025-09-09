-- Create RPC for adding tags to customers
CREATE OR REPLACE FUNCTION public.add_tag_to_customer(
  p_account_id UUID,
  p_customer_id UUID,
  p_tag_name TEXT,
  p_tag_color TEXT DEFAULT '#3b82f6'
)
RETURNS JSONB AS $$
DECLARE
  tag_id UUID;
  existing_tag_id UUID;
BEGIN
  -- Check if user has permission (using existing function)
  IF NOT public.is_account_member(p_account_id) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Check if customer belongs to account
  IF NOT EXISTS (
    SELECT 1 FROM public.customers c 
    WHERE c.id = p_customer_id AND c.account_id = p_account_id
  ) THEN
    RAISE EXCEPTION 'Customer not found or access denied';
  END IF;

  -- Get or create tag
  SELECT id INTO existing_tag_id 
  FROM public.tags t 
  WHERE t.account_id = p_account_id 
  AND LOWER(t.name) = LOWER(p_tag_name);

  IF existing_tag_id IS NULL THEN
    INSERT INTO public.tags (account_id, name, color)
    VALUES (p_account_id, p_tag_name, p_tag_color)
    RETURNING id INTO tag_id;
  ELSE
    tag_id := existing_tag_id;
  END IF;

  -- Link tag to customer (ignore if already linked)
  INSERT INTO public.customer_tags (customer_id, tag_id)
  VALUES (p_customer_id, tag_id)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'tag_id', tag_id,
    'tag_name', p_tag_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create RPC for seeding default tags
CREATE OR REPLACE FUNCTION public.seed_default_tags(p_account_id UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB := '[]'::jsonb;
BEGIN
  -- Check if user has permission
  IF NOT public.is_account_member(p_account_id) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Insert default tags
  INSERT INTO public.tags (account_id, name, color) VALUES
    (p_account_id, 'Lead', '#ef4444'),
    (p_account_id, 'Active', '#22c55e'),
    (p_account_id, 'High Value', '#f59e0b')
  ON CONFLICT DO NOTHING;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'color', t.color
    )
  ) INTO result
  FROM public.tags t
  WHERE t.account_id = p_account_id;

  RETURN jsonb_build_object('success', true, 'tags', result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
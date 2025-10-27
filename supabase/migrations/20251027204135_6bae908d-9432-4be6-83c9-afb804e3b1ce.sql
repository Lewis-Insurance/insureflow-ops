-- Update existing leads to set account_id based on created_by or assigned_to user's account membership
UPDATE public.leads l
SET account_id = (
  SELECT am.account_id
  FROM public.account_memberships am
  WHERE am.user_id = COALESCE(l.created_by, l.assigned_to)
  LIMIT 1
)
WHERE l.account_id IS NULL
  AND (l.created_by IS NOT NULL OR l.assigned_to IS NOT NULL);
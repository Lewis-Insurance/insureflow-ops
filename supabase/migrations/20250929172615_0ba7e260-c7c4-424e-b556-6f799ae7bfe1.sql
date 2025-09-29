-- Fix Blue Oak Manufacturing account type
UPDATE accounts 
SET 
  type = 'commercial_business'::account_type_v2,
  account_type = 'business'::account_type_new
WHERE name = 'Blue Oak Manufacturing, LLC' 
  AND id = '22222222-2222-4222-8222-222222222222';

-- Verify the account types are set correctly
-- This ensures accounts with entries in commercial_business_accounts are typed as business
UPDATE accounts a
SET 
  type = 'commercial_business'::account_type_v2,
  account_type = 'business'::account_type_new
WHERE EXISTS (
  SELECT 1 FROM commercial_business_accounts cba 
  WHERE cba.account_id = a.id
)
AND (a.type != 'commercial_business'::account_type_v2 OR a.account_type != 'business'::account_type_new);

-- Verify household accounts are typed correctly
UPDATE accounts a
SET 
  type = 'household'::account_type_v2,
  account_type = 'individual'::account_type_new
WHERE EXISTS (
  SELECT 1 FROM household_accounts ha 
  WHERE ha.account_id = a.id
)
AND NOT EXISTS (
  SELECT 1 FROM commercial_business_accounts cba 
  WHERE cba.account_id = a.id
)
AND (a.type != 'household'::account_type_v2 OR a.account_type != 'individual'::account_type_new);
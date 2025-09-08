-- Fix the inconsistent account type data for Blue Oak Manufacturing
-- Update account_type to match the type field for business accounts
UPDATE accounts 
SET account_type = 'business' 
WHERE type = 'commercial_business' AND account_type = 'individual';

-- Also fix household accounts if needed
UPDATE accounts 
SET account_type = 'household' 
WHERE type = 'household' AND account_type = 'individual';
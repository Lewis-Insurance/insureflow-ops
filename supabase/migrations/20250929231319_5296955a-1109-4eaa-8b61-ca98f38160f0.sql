-- Add policy_term column to policies table
ALTER TABLE policies 
ADD COLUMN policy_term text CHECK (policy_term IN ('semiannual', 'annual'));
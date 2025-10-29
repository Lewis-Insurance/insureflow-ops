
-- Fix workspaces table to reference accounts instead of customers
ALTER TABLE workspaces 
DROP CONSTRAINT IF EXISTS workspaces_customer_id_fkey;

ALTER TABLE workspaces 
RENAME COLUMN customer_id TO account_id;

ALTER TABLE workspaces 
ADD CONSTRAINT workspaces_account_id_fkey 
FOREIGN KEY (account_id) REFERENCES accounts(id);
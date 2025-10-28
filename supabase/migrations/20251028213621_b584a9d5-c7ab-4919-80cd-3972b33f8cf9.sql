-- Add customer_id and policy_id columns to workspaces table
ALTER TABLE workspaces
ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
ADD COLUMN policy_id UUID REFERENCES policies(id) ON DELETE SET NULL;

-- Add indexes for better query performance
CREATE INDEX idx_workspaces_customer_id ON workspaces(customer_id);
CREATE INDEX idx_workspaces_policy_id ON workspaces(policy_id);
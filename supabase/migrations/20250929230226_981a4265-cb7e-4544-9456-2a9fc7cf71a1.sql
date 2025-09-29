-- Enable RLS on carriers table
ALTER TABLE carriers ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read carriers
CREATE POLICY "Carriers are readable by authenticated users"
ON carriers
FOR SELECT
TO authenticated
USING (true);

-- Allow staff to manage carriers
CREATE POLICY "Staff can manage carriers"
ON carriers
FOR ALL
TO authenticated
USING (is_staff())
WITH CHECK (is_staff());
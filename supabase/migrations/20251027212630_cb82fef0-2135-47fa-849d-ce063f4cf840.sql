-- Add underwriting and marketing contact fields to carriers table
ALTER TABLE carriers 
ADD COLUMN IF NOT EXISTS underwriting_contact_name TEXT,
ADD COLUMN IF NOT EXISTS underwriting_contact_phone TEXT,
ADD COLUMN IF NOT EXISTS marketing_contact_name TEXT,
ADD COLUMN IF NOT EXISTS marketing_contact_phone TEXT;

-- Migrate existing contact data to underwriting contact fields
UPDATE carriers 
SET underwriting_contact_name = contact_name,
    underwriting_contact_phone = contact_phone
WHERE contact_name IS NOT NULL OR contact_phone IS NOT NULL;

-- Optional: Drop old contact fields if no longer needed
-- ALTER TABLE carriers DROP COLUMN IF EXISTS contact_name;
-- ALTER TABLE carriers DROP COLUMN IF EXISTS contact_phone;
-- ALTER TABLE carriers DROP COLUMN IF EXISTS contact_email;
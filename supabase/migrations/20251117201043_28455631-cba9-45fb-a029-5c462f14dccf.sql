-- Add new columns to ao_renewals table
ALTER TABLE ao_renewals 
ADD COLUMN losses_3yr INTEGER DEFAULT 0,
ADD COLUMN oldest_in_household INTEGER;

-- Add comments for clarity
COMMENT ON COLUMN ao_renewals.losses_3yr IS 'Number of losses in the last 3 years';
COMMENT ON COLUMN ao_renewals.oldest_in_household IS 'Age of the oldest person in the household';
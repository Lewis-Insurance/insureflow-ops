-- Add carrier and expiration date fields to all insurance tables

ALTER TABLE lead_home_insurance 
ADD COLUMN IF NOT EXISTS current_carrier TEXT,
ADD COLUMN IF NOT EXISTS expiration_date DATE;

ALTER TABLE lead_auto_insurance 
ADD COLUMN IF NOT EXISTS current_carrier TEXT,
ADD COLUMN IF NOT EXISTS expiration_date DATE;

ALTER TABLE lead_commercial_insurance 
ADD COLUMN IF NOT EXISTS current_carrier TEXT,
ADD COLUMN IF NOT EXISTS expiration_date DATE;

ALTER TABLE lead_life_insurance 
ADD COLUMN IF NOT EXISTS current_carrier TEXT,
ADD COLUMN IF NOT EXISTS expiration_date DATE;

ALTER TABLE lead_umbrella_insurance 
ADD COLUMN IF NOT EXISTS current_carrier TEXT,
ADD COLUMN IF NOT EXISTS expiration_date DATE;

ALTER TABLE lead_renters_insurance 
ADD COLUMN IF NOT EXISTS current_carrier TEXT,
ADD COLUMN IF NOT EXISTS expiration_date DATE;
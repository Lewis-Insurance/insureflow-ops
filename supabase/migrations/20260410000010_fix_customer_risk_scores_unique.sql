-- Migration: Fix customer_risk_scores unique constraint
-- Description: Add unique constraint on account_id for upsert to work
-- Date: 2025-12-29

-- First, delete any duplicate account_ids (keep most recent)
DELETE FROM public.customer_risk_scores a
USING public.customer_risk_scores b
WHERE a.account_id = b.account_id
  AND a.created_at < b.created_at;

-- Add unique constraint on account_id
ALTER TABLE public.customer_risk_scores
  DROP CONSTRAINT IF EXISTS customer_risk_scores_account_id_key;

ALTER TABLE public.customer_risk_scores
  ADD CONSTRAINT customer_risk_scores_account_id_key UNIQUE (account_id);

-- Add index to improve query performance
CREATE INDEX IF NOT EXISTS idx_customer_risk_scores_account_expires
  ON public.customer_risk_scores(account_id, expires_at DESC);

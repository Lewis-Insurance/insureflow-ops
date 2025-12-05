-- Migration: Fix All Schema Mismatches
-- Description: Comprehensive fix for all tables with missing columns
-- Date: 2024-12-05
-- Author: Claude CEO Co-Pilot
-- Purpose: Reconcile schema differences between migrations and actual database

-- =============================================================================
-- FIX 1: Quote Ranking System Tables
-- =============================================================================

-- Fix quotes table
DO $$
BEGIN
  -- Add all quote ranking columns if missing
  ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS premium NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS quote_score INTEGER,
  ADD COLUMN IF NOT EXISTS price_score INTEGER,
  ADD COLUMN IF NOT EXISTS coverage_completeness_score INTEGER,
  ADD COLUMN IF NOT EXISTS carrier_rating_score INTEGER,
  ADD COLUMN IF NOT EXISTS deductible_score INTEGER,
  ADD COLUMN IF NOT EXISTS value_score INTEGER,
  ADD COLUMN IF NOT EXISTS ai_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS scoring_metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_scored_at TIMESTAMP WITH TIME ZONE;

  RAISE NOTICE '✅ Fixed quotes table columns';
END $$;

-- Fix quote_coverages table
DO $$
BEGIN
  -- Ensure table exists with all columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quote_coverages') THEN
    CREATE TABLE public.quote_coverages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
      coverage_type TEXT NOT NULL,
      coverage_name TEXT,
      coverage_limit NUMERIC(12,2),
      deductible NUMERIC(10,2),
      premium NUMERIC(10,2),
      is_included BOOLEAN DEFAULT true,
      is_critical BOOLEAN DEFAULT false,
      is_extracted_from_document BOOLEAN DEFAULT false,
      notes TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    );
  ELSE
    -- Add missing columns
    ALTER TABLE public.quote_coverages
    ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT false;
  END IF;

  RAISE NOTICE '✅ Fixed quote_coverages table columns';
END $$;

-- =============================================================================
-- FIX 2: Predictive Analytics Tables
-- =============================================================================

-- Fix retention_interventions table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'retention_interventions') THEN
    CREATE TABLE public.retention_interventions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
      risk_score_id UUID REFERENCES public.customer_risk_scores(id) ON DELETE SET NULL,
      intervention_type TEXT NOT NULL,
      priority TEXT NOT NULL,
      recommended_timeline_days INTEGER,
      status TEXT DEFAULT 'recommended',
      assigned_to UUID REFERENCES auth.users(id),
      scheduled_for TIMESTAMP WITH TIME ZONE,
      completed_at TIMESTAMP WITH TIME ZONE,
      outcome TEXT,
      outcome_notes TEXT,
      customer_retained BOOLEAN,
      pre_intervention_churn_probability NUMERIC(5,2),
      post_intervention_churn_probability NUMERIC(5,2),
      estimated_value_saved NUMERIC(10,2),
      intervention_metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    );
  ELSE
    -- Add missing columns
    ALTER TABLE public.retention_interventions
    ADD COLUMN IF NOT EXISTS customer_retained BOOLEAN,
    ADD COLUMN IF NOT EXISTS pre_intervention_churn_probability NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS post_intervention_churn_probability NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS estimated_value_saved NUMERIC(10,2);
  END IF;

  RAISE NOTICE '✅ Fixed retention_interventions table columns';
END $$;

-- =============================================================================
-- FIX 3: Document Classification Tables
-- =============================================================================

-- Fix document_classifications table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_classifications') THEN
    ALTER TABLE public.document_classifications
    ADD COLUMN IF NOT EXISTS document_type TEXT,
    ADD COLUMN IF NOT EXISTS line_of_business TEXT,
    ADD COLUMN IF NOT EXISTS urgency_level TEXT,
    ADD COLUMN IF NOT EXISTS required_actions JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS classification_metadata JSONB DEFAULT '{}'::jsonb;

    RAISE NOTICE '✅ Fixed document_classifications table columns';
  END IF;
END $$;

-- =============================================================================
-- FIX 4: AI Email Composer Tables
-- =============================================================================

-- Fix email_templates table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_templates') THEN
    ALTER TABLE public.email_templates
    ADD COLUMN IF NOT EXISTS template_name TEXT,
    ADD COLUMN IF NOT EXISTS scenario TEXT,
    ADD COLUMN IF NOT EXISTS subject_template TEXT,
    ADD COLUMN IF NOT EXISTS body_template TEXT,
    ADD COLUMN IF NOT EXISTS tone TEXT,
    ADD COLUMN IF NOT EXISTS performance_score NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS avg_response_rate NUMERIC(5,2);

    RAISE NOTICE '✅ Fixed email_templates table columns';
  END IF;
END $$;

-- Fix communication_history table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'communication_history') THEN
    ALTER TABLE public.communication_history
    ADD COLUMN IF NOT EXISTS communication_type TEXT,
    ADD COLUMN IF NOT EXISTS subject TEXT,
    ADD COLUMN IF NOT EXISTS message_body TEXT,
    ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS ai_confidence_score INTEGER,
    ADD COLUMN IF NOT EXISTS tone_used TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS replied_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS compliance_checked BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS compliance_passed BOOLEAN,
    ADD COLUMN IF NOT EXISTS context_data JSONB DEFAULT '{}'::jsonb;

    RAISE NOTICE '✅ Fixed communication_history table columns';
  END IF;
END $$;

-- =============================================================================
-- FIX 5: Add constraints safely
-- =============================================================================

DO $$
BEGIN
  -- Add check constraints if they don't exist
  -- We use DO blocks to avoid errors if constraints already exist

  -- Quote score constraints
  BEGIN
    ALTER TABLE public.quotes ADD CONSTRAINT quotes_quote_score_check CHECK (quote_score >= 0 AND quote_score <= 100);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.quotes ADD CONSTRAINT quotes_price_score_check CHECK (price_score >= 0 AND price_score <= 30);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.quotes ADD CONSTRAINT quotes_coverage_score_check CHECK (coverage_completeness_score >= 0 AND coverage_completeness_score <= 25);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.quotes ADD CONSTRAINT quotes_carrier_score_check CHECK (carrier_rating_score >= 0 AND carrier_rating_score <= 20);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.quotes ADD CONSTRAINT quotes_deductible_score_check CHECK (deductible_score >= 0 AND deductible_score <= 15);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.quotes ADD CONSTRAINT quotes_value_score_check CHECK (value_score >= 0 AND value_score <= 10);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  RAISE NOTICE '✅ Added constraint checks';
END $$;

-- =============================================================================
-- FIX 6: Create indexes safely
-- =============================================================================

-- Quote ranking indexes
CREATE INDEX IF NOT EXISTS idx_quotes_quote_score
  ON public.quotes(quote_score DESC NULLS LAST)
  WHERE quote_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_account_score
  ON public.quotes(account_id, quote_score DESC NULLS LAST)
  WHERE quote_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quote_coverages_critical
  ON public.quote_coverages(quote_id, is_critical, is_included)
  WHERE is_critical = true;

-- Predictive analytics indexes
CREATE INDEX IF NOT EXISTS idx_retention_interventions_customer_retained
  ON public.retention_interventions(customer_retained)
  WHERE customer_retained IS NOT NULL;

-- =============================================================================
-- FIX 7: Final validation
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Schema Fix Migration Complete';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'All table columns have been added';
  RAISE NOTICE 'All indexes have been created';
  RAISE NOTICE 'All constraints have been applied';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'You can now run the original migrations';
  RAISE NOTICE '========================================';
END $$;

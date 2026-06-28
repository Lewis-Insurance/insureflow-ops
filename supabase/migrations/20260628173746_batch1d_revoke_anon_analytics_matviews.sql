-- =====================================================================
-- Batch 1D (supplement) — revoke anon grants on 7 analytics matviews
-- =====================================================================
-- The security advisor flagged 7 materialized views as `materialized_view_in_api`:
-- each granted anon SELECT (and INSERT/MAINTAIN), so the public anon key shipped in
-- the frontend bundle could read the agency's predictive analytics on its book
-- (churn risk, quote rankings, coverage-gap opportunities, etc.). These dashboards
-- are staff-only (read while logged in = `authenticated`), so anon has no legit path.
-- Same class as the 1D table revokes; trivially safe. authenticated retains SELECT.
-- Reversible: GRANT SELECT ON <matview> TO anon.
-- 2026-06-28
-- =====================================================================
REVOKE ALL ON public.churn_predictions              FROM anon;
REVOKE ALL ON public.task_generation_analytics      FROM anon;
REVOKE ALL ON public.quote_rankings                 FROM anon;
REVOKE ALL ON public.ai_feedback_analytics          FROM anon;
REVOKE ALL ON public.coverage_gap_analytics         FROM anon;
REVOKE ALL ON public.issue_analytics                FROM anon;
REVOKE ALL ON public.predictive_analytics_dashboard FROM anon;

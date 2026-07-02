-- Batch 5A (tier 3, F1) — generate_review_queue is SECURITY INVOKER, writes the now
-- is_staff()-only review_queue_items, and was EXECUTE-able by anon/authenticated though
-- it is only ever meant to be driven by service-role jobs (no client/edge caller exists).
-- Lock it to service_role so a future non-staff caller can't hit the is_staff() wall.
-- DOWN: GRANT EXECUTE ON FUNCTION public.generate_review_queue(uuid) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_review_queue(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.generate_review_queue(uuid) TO service_role;

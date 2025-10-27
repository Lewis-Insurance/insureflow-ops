-- Grant SELECT permissions on analytics views to authenticated users
GRANT SELECT ON public.ao_quotes_analytics TO authenticated;
GRANT SELECT ON public.ao_quotes_comparison TO authenticated;
GRANT SELECT ON public.ao_quotes_denial_analysis TO authenticated;
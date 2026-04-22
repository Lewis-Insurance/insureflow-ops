-- Add Bass Underwriting to ao_moved_carriers so it appears in the
-- "moved to carrier" dropdown on the AO Renewals page.
INSERT INTO public.ao_moved_carriers (name, display_order, is_active)
VALUES ('Bass Underwriting', 4, true)
ON CONFLICT (name) DO NOTHING;

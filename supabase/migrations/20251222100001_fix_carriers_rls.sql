-- Fix carriers RLS to allow authenticated users to manage carriers

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Staff can manage carriers" ON public.carriers;
DROP POLICY IF EXISTS "Staff can access carriers" ON public.carriers;
DROP POLICY IF EXISTS "carriers_authenticated_read" ON public.carriers;
DROP POLICY IF EXISTS "Carriers are readable by authenticated users" ON public.carriers;

-- Create simple policies that allow all authenticated users to manage carriers
CREATE POLICY "authenticated_read_carriers" ON public.carriers
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "authenticated_insert_carriers" ON public.carriers
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "authenticated_update_carriers" ON public.carriers
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_delete_carriers" ON public.carriers
    FOR DELETE
    TO authenticated
    USING (true);


-- Fix documents RLS to allow authenticated users to delete documents

-- Drop existing restrictive delete policies
DROP POLICY IF EXISTS "Documents delete by staff or owner/staff" ON public.documents;
DROP POLICY IF EXISTS "Staff can delete documents" ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can delete their documents" ON public.documents;
DROP POLICY IF EXISTS "documents_delete" ON public.documents;
DROP POLICY IF EXISTS "staff_only_documents_delete" ON public.documents;

-- Create a permissive delete policy for authenticated users
-- Users can delete documents they uploaded or documents for accounts they have access to
CREATE POLICY "authenticated_delete_documents" ON public.documents
    FOR DELETE
    TO authenticated
    USING (
        -- User uploaded the document
        uploaded_by = auth.uid()
        OR
        -- User has access to the account (staff/admin logic)
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND (p.role IN ('admin', 'owner', 'staff', 'agent') OR p.role IS NULL)
        )
    );

-- Also ensure update policy exists
DROP POLICY IF EXISTS "Documents update by staff or owner/staff" ON public.documents;
DROP POLICY IF EXISTS "Staff can update documents" ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can update their documents" ON public.documents;

CREATE POLICY "authenticated_update_documents" ON public.documents
    FOR UPDATE
    TO authenticated
    USING (
        uploaded_by = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND (p.role IN ('admin', 'owner', 'staff', 'agent') OR p.role IS NULL)
        )
    )
    WITH CHECK (
        uploaded_by = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND (p.role IN ('admin', 'owner', 'staff', 'agent') OR p.role IS NULL)
        )
    );


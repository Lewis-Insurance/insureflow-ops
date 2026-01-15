-- ============================================
-- Migration: Fix Task Assignment + Add Dedupe System
-- Issues addressed: #1, #2, #10 from Management System Bug Fixes
-- ============================================

-- ============================================
-- PART 1: Add default_assignee_user_id to task_templates
-- ============================================
ALTER TABLE public.task_templates
ADD COLUMN IF NOT EXISTS default_assignee_user_id UUID REFERENCES public.profiles(id);

COMMENT ON COLUMN public.task_templates.default_assignee_user_id IS
  'Explicit user assignment (takes priority over role-based assignment)';

-- ============================================
-- PART 2: Add scope column for dedupe granularity
-- ============================================
ALTER TABLE public.task_templates
ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'account';

ALTER TABLE public.task_templates
ADD CONSTRAINT task_templates_scope_check
CHECK (scope IN ('account', 'policy', 'renewal'));

COMMENT ON COLUMN public.task_templates.scope IS
  'Dedupe scope: account (one per customer), policy (one per policy), renewal (one per renewal cycle)';

-- ============================================
-- PART 3: Add dedupe_key to tasks with UNIQUE constraint
-- ============================================
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

ALTER TABLE public.tasks
ADD CONSTRAINT tasks_dedupe_key_unique UNIQUE (dedupe_key);

COMMENT ON COLUMN public.tasks.dedupe_key IS
  'Idempotency key to prevent duplicate task creation. Format: entity_id:template_id:scope';

-- ============================================
-- PART 4: Update generate_tasks_from_templates function
-- ============================================
CREATE OR REPLACE FUNCTION public.generate_tasks_from_templates(
  p_trigger_event task_trigger_event,
  p_account_id UUID,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_creator_id UUID DEFAULT NULL,
  p_effective_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template RECORD;
  v_task_id UUID;
  v_generated_count INTEGER := 0;
  v_skipped_count INTEGER := 0;
  v_result JSONB := '[]'::jsonb;
  v_due_date TIMESTAMP WITH TIME ZONE;
  v_assignee_id UUID;
  v_dedupe_key TEXT;
BEGIN
  -- Loop through active templates for this trigger event
  FOR v_template IN
    SELECT * FROM public.task_templates
    WHERE trigger_event = p_trigger_event
      AND is_active = true
    ORDER BY task_order ASC
  LOOP
    -- ============================================
    -- Determine assignee with precedence chain
    -- ============================================
    v_assignee_id := NULL;

    -- 1. Explicit user assignment (highest priority)
    IF v_template.default_assignee_user_id IS NOT NULL THEN
      v_assignee_id := v_template.default_assignee_user_id;
    -- 2. Role-based lookup
    ELSIF v_template.default_assignee_role IS NOT NULL THEN
      SELECT id INTO v_assignee_id
      FROM public.profiles
      WHERE role = v_template.default_assignee_role
        AND is_staff = true
      LIMIT 1;
    END IF;

    -- 3. Creator fallback (if no template assignment)
    IF v_assignee_id IS NULL AND p_creator_id IS NOT NULL THEN
      v_assignee_id := p_creator_id;
    END IF;

    -- ============================================
    -- Generate dedupe key based on scope
    -- ============================================
    v_dedupe_key := NULL;

    CASE COALESCE(v_template.scope, 'account')
      WHEN 'account' THEN
        -- One task per account (e.g., welcome call)
        v_dedupe_key := p_account_id || ':' || v_template.id || ':account';
      WHEN 'policy' THEN
        -- One task per policy
        IF p_entity_id IS NOT NULL THEN
          v_dedupe_key := p_entity_id || ':' || v_template.id || ':policy';
        ELSE
          v_dedupe_key := p_account_id || ':' || v_template.id || ':policy';
        END IF;
      WHEN 'renewal' THEN
        -- One task per renewal cycle
        IF p_entity_id IS NOT NULL AND p_effective_date IS NOT NULL THEN
          v_dedupe_key := p_entity_id || ':' || v_template.id || ':' || p_effective_date::text;
        ELSIF p_entity_id IS NOT NULL THEN
          v_dedupe_key := p_entity_id || ':' || v_template.id || ':renewal';
        ELSE
          v_dedupe_key := p_account_id || ':' || v_template.id || ':renewal';
        END IF;
    END CASE;

    -- Calculate due date based on estimated duration
    v_due_date := NULL;
    IF v_template.estimated_duration_hours IS NOT NULL THEN
      v_due_date := now() + (v_template.estimated_duration_hours || ' hours')::interval;
    END IF;

    -- ============================================
    -- Create task with dedupe protection
    -- ============================================
    BEGIN
      INSERT INTO public.tasks (
        account_id,
        title,
        description,
        category,
        priority,
        status,
        due_at,
        assignee_id,
        created_by,
        dedupe_key,
        metadata
      ) VALUES (
        p_account_id,
        v_template.name,
        v_template.description,
        v_template.category,
        v_template.priority,
        'pending',
        v_due_date,
        v_assignee_id,
        p_creator_id,
        v_dedupe_key,
        jsonb_build_object(
          'template_id', v_template.id,
          'trigger_event', p_trigger_event::text,
          'auto_generated', true
        )
      )
      ON CONFLICT ON CONSTRAINT tasks_dedupe_key_unique DO NOTHING
      RETURNING id INTO v_task_id;

      -- Only log and count if task was actually created (not a duplicate)
      IF v_task_id IS NOT NULL THEN
        -- Log the task generation
        INSERT INTO public.task_generation_log (
          template_id,
          task_id,
          trigger_event,
          entity_type,
          entity_id,
          metadata
        ) VALUES (
          v_template.id,
          v_task_id,
          p_trigger_event,
          p_entity_type,
          p_entity_id,
          jsonb_build_object('generated_at', now(), 'assignee_id', v_assignee_id)
        );

        v_generated_count := v_generated_count + 1;

        -- Add to result
        v_result := v_result || jsonb_build_object(
          'task_id', v_task_id,
          'template_id', v_template.id,
          'template_name', v_template.name,
          'assignee_id', v_assignee_id,
          'dedupe_key', v_dedupe_key
        );
      ELSE
        v_skipped_count := v_skipped_count + 1;
      END IF;
    EXCEPTION WHEN unique_violation THEN
      -- Duplicate key, skip this task
      v_skipped_count := v_skipped_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'generated_count', v_generated_count,
    'skipped_duplicates', v_skipped_count,
    'tasks', v_result
  );
END;
$$;

-- ============================================
-- PART 5: Update RLS policies for tasks
-- Staff should NOT see all tasks - only their assigned/created ones
-- Unassigned tasks visible only to admins
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "tasks_select_policy" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert_policy" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update_policy" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete_policy" ON public.tasks;

-- New SELECT policy: users see tasks assigned to them, created by them, or unassigned (admins only)
CREATE POLICY "tasks_select_policy" ON public.tasks
  FOR SELECT
  TO authenticated
  USING (
    -- User is assigned to this task
    assignee_id = auth.uid()
    -- User created this task
    OR created_by = auth.uid()
    -- User has account access (for customer portal)
    OR user_has_account_access(account_id)
    -- Unassigned tasks: only visible to admins
    OR (
      assignee_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
      )
    )
  );

-- INSERT: Anyone authenticated can create tasks
CREATE POLICY "tasks_insert_policy" ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: Can update if assigned, created, or admin
CREATE POLICY "tasks_update_policy" ON public.tasks
  FOR UPDATE
  TO authenticated
  USING (
    assignee_id = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  )
  WITH CHECK (
    assignee_id = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );

-- DELETE: Only creator or admin
CREATE POLICY "tasks_delete_policy" ON public.tasks
  FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );

-- ============================================
-- PART 6: Add index for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON public.tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_task_templates_default_assignee ON public.task_templates(default_assignee_user_id);

-- ============================================
-- ROLLBACK SCRIPT (save separately)
-- ============================================
/*
-- To rollback this migration:
ALTER TABLE public.task_templates DROP COLUMN IF EXISTS default_assignee_user_id;
ALTER TABLE public.task_templates DROP COLUMN IF EXISTS scope;
ALTER TABLE public.task_templates DROP CONSTRAINT IF EXISTS task_templates_scope_check;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_dedupe_key_unique;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS dedupe_key;
DROP INDEX IF EXISTS idx_tasks_assignee_id;
DROP INDEX IF EXISTS idx_tasks_created_by;
DROP INDEX IF EXISTS idx_task_templates_default_assignee;

-- Restore original RLS (from 20251225000002_phase2_database_stability.sql)
DROP POLICY IF EXISTS "tasks_select_policy" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert_policy" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update_policy" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete_policy" ON public.tasks;

CREATE POLICY "tasks_select_policy" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
    OR assignee_id = auth.uid()
    OR created_by = auth.uid()
  );

CREATE POLICY "tasks_insert_policy" ON public.tasks
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "tasks_update_policy" ON public.tasks
  FOR UPDATE TO authenticated
  USING (is_staff_or_admin() OR assignee_id = auth.uid() OR created_by = auth.uid())
  WITH CHECK (is_staff_or_admin() OR assignee_id = auth.uid() OR created_by = auth.uid());

CREATE POLICY "tasks_delete_policy" ON public.tasks
  FOR DELETE TO authenticated
  USING (is_staff_or_admin() OR created_by = auth.uid());

-- Restore original function (from 20250930202923_*.sql)
-- (copy the original function from that migration)
*/

-- Preventative notes maintenance.
--
-- Root cause of stranded notes: the account-merge engine (_do_account_merge) reparents child
-- rows by DISCOVERING foreign-key constraints to accounts(id). customer_notes.customer_id had
-- NO such FK, so every merge silently left notes behind on the loser account. The fix is to add
-- the missing FK: the merge then auto-carries notes with no change to the merge function.

-- 1. Add the missing FK so future merges reparent customer_notes automatically.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.conrelid = 'public.customer_notes'::regclass AND c.contype = 'f' AND a.attname = 'customer_id'
  ) THEN
    ALTER TABLE public.customer_notes
      ADD CONSTRAINT customer_notes_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.accounts(id);
  END IF;
END $$;

-- 2. Safety-net reconciler: repoint any note sitting on a merged account to the final live
--    survivor (follows merge chains). Idempotent; can be run anytime as maintenance.
CREATE OR REPLACE FUNCTION public.reconcile_notes_to_survivors()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total int := 0; v_n int;
BEGIN
  LOOP
    UPDATE public.customer_notes cn
    SET customer_id = la.merged_into_id, updated_at = now()
    FROM public.accounts la
    WHERE cn.customer_id = la.id
      AND la.merged_into_id IS NOT NULL
      AND cn.deleted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    EXIT WHEN v_n = 0;   -- converged (also unwinds any merge chain)
  END LOOP;
  RETURN v_total;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_notes_to_survivors() FROM anon, public;

-- 3. Re-fold any standard renewal_notes / legacy notes not already unified (idempotent:
--    original id preserved, ON CONFLICT DO NOTHING). Catches rows created since unification.
INSERT INTO public.customer_notes (id, customer_id, note_text, created_by, policy_id, source, created_at, updated_at)
SELECT n.id, n.account_id, n.body, n.author_id, n.policy_id, 'legacy_notes', n.created_at, coalesce(n.created_at, now())
FROM public.notes n
WHERE n.deleted_at IS NULL AND n.account_id IS NOT NULL AND coalesce(btrim(n.body), '') <> ''
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.customer_notes (id, customer_id, note_text, created_by, renewal_id, source, created_at, updated_at)
SELECT rn.id, r.account_id, rn.content, rn.created_by, rn.renewal_id, 'legacy_renewal_notes',
       rn.created_at, coalesce(rn.updated_at, rn.created_at, now())
FROM public.renewal_notes rn
JOIN public.renewals r ON r.id = rn.renewal_id
WHERE r.account_id IS NOT NULL AND coalesce(btrim(rn.content), '') <> ''
ON CONFLICT (id) DO NOTHING;

-- 4. Reconcile once now.
SELECT public.reconcile_notes_to_survivors();

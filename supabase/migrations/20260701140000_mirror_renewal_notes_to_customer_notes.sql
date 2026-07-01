-- Keep notes in sync no matter who writes them.
--
-- The standard-renewal workflow still writes SYSTEM notes (e.g. "Renewal completed: ...",
-- "Status changed to ...") into the legacy renewal_notes table, which the unified NotesPanel
-- does not read. Rather than chase every writer in the app, mirror at the database level: any
-- insert into renewal_notes is copied into the canonical customer_notes (account-scoped, tagged
-- with the renewal). This guarantees renewal notes always appear on the customer + renewal +
-- policy surfaces, forever, regardless of which code path created them.
--
-- AO renewals (ao_renewal_notes) are intentionally NOT mirrored - separate module.

CREATE OR REPLACE FUNCTION public.mirror_renewal_note_to_customer_notes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_account uuid;
BEGIN
  IF coalesce(btrim(NEW.content), '') = '' THEN
    RETURN NEW;
  END IF;
  SELECT account_id INTO v_account FROM public.renewals WHERE id = NEW.renewal_id;
  IF v_account IS NULL THEN
    RETURN NEW;  -- renewal not resolvable to an account; nothing to mirror onto
  END IF;
  INSERT INTO public.customer_notes (id, customer_id, note_text, created_by, renewal_id, source, created_at, updated_at)
  VALUES (NEW.id, v_account, NEW.content, NEW.created_by, NEW.renewal_id, 'renewal_system',
          coalesce(NEW.created_at, now()), coalesce(NEW.updated_at, NEW.created_at, now()))
  ON CONFLICT (id) DO NOTHING;   -- id shared with renewal_notes -> idempotent vs the backfill
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mirror_renewal_note ON public.renewal_notes;
CREATE TRIGGER trg_mirror_renewal_note
AFTER INSERT ON public.renewal_notes
FOR EACH ROW EXECUTE FUNCTION public.mirror_renewal_note_to_customer_notes();

-- Add follow_up_task_id to ao_renewals so each renewal tracks its linked dashboard task.
ALTER TABLE ao_renewals
  ADD COLUMN IF NOT EXISTS follow_up_task_id uuid REFERENCES tasks(id);

CREATE INDEX IF NOT EXISTS idx_ao_renewals_follow_up_task_id
  ON ao_renewals(follow_up_task_id)
  WHERE follow_up_task_id IS NOT NULL;

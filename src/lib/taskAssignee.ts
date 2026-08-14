/** Staff display name for a task row; unclaimed only when assignee_id is null. */
export function taskAssigneeLabel(
  assigneeName?: string | null,
  assignee?: { full_name?: string | null } | null,
  assigneeId?: string | null,
): string {
  const name = assigneeName ?? assignee?.full_name;
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  return assigneeId ? 'Assigned' : 'Unclaimed';
}

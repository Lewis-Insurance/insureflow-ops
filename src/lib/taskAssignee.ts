/** Staff display name for a task row; blank or missing means unclaimed. */
export function taskAssigneeLabel(
  assigneeName?: string | null,
  assignee?: { full_name?: string | null } | null,
): string {
  const name = assigneeName ?? assignee?.full_name;
  const trimmed = name?.trim();
  return trimmed ? trimmed : 'Unclaimed';
}

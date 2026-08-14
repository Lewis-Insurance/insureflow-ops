import { describe, it, expect } from 'vitest';
import { taskAssigneeLabel } from '@/lib/taskAssignee';

describe('taskAssigneeLabel', () => {
  it('returns Unclaimed when assignee_name is null', () => {
    expect(taskAssigneeLabel(null)).toBe('Unclaimed');
  });

  it('returns Unclaimed when assignee_name is empty or whitespace', () => {
    expect(taskAssigneeLabel('')).toBe('Unclaimed');
    expect(taskAssigneeLabel('   ')).toBe('Unclaimed');
  });

  it('returns the trimmed name when present', () => {
    expect(taskAssigneeLabel('Alex Producer')).toBe('Alex Producer');
    expect(taskAssigneeLabel('  Jordan Lee  ')).toBe('Jordan Lee');
  });

  it('falls back to assignee.full_name when assignee_name is missing', () => {
    expect(taskAssigneeLabel(null, { full_name: 'Sam Agent' })).toBe('Sam Agent');
    expect(taskAssigneeLabel(null, { full_name: '  ' })).toBe('Unclaimed');
  });
});

import { describe, it, expect } from 'vitest';
import { taskAssigneeLabel } from '@/lib/taskAssignee';

describe('taskAssigneeLabel', () => {
  it('returns Unclaimed when assignee_id is null', () => {
    expect(taskAssigneeLabel(null, null, null)).toBe('Unclaimed');
  });

  it('returns Unclaimed when assignee_id is null and name is blank', () => {
    expect(taskAssigneeLabel('', null, null)).toBe('Unclaimed');
    expect(taskAssigneeLabel('   ', null, null)).toBe('Unclaimed');
  });

  it('returns Assigned when assignee_id is set but name is blank', () => {
    expect(taskAssigneeLabel('', null, 'user-1')).toBe('Assigned');
    expect(taskAssigneeLabel('   ', null, 'user-1')).toBe('Assigned');
  });

  it('returns the trimmed name when present', () => {
    expect(taskAssigneeLabel('Alex Producer', null, 'user-alex')).toBe('Alex Producer');
    expect(taskAssigneeLabel('  Jordan Lee  ', null, 'user-jordan')).toBe('Jordan Lee');
  });

  it('falls back to assignee.full_name when assignee_name is missing', () => {
    expect(taskAssigneeLabel(null, { full_name: 'Sam Agent' }, 'user-sam')).toBe('Sam Agent');
    expect(taskAssigneeLabel(null, { full_name: '  ' }, 'user-sam')).toBe('Assigned');
    expect(taskAssigneeLabel(null, { full_name: '  ' }, null)).toBe('Unclaimed');
  });
});

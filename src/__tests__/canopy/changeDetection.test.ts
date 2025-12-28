// ============================================================================
// CANOPY CHANGE DETECTION TESTS
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase
const mockSupabaseResponse = {
  data: [],
  error: null,
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve(mockSupabaseResponse)),
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(mockSupabaseResponse)),
          })),
          gte: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve(mockSupabaseResponse)),
          })),
        })),
        gte: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve(mockSupabaseResponse)),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve(mockSupabaseResponse)),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve(mockSupabaseResponse)),
      })),
    })),
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: {}, error: null })),
    },
  },
}));

// Types for change detection
interface PolicyChange {
  id: string;
  pull_id: string;
  change_type: 'added' | 'removed' | 'modified';
  field_category: string;
  field_name: string;
  old_value: any;
  new_value: any;
  detected_at: string;
  acknowledged: boolean;
}

describe('Change Detection Logic', () => {
  describe('Change Type Classification', () => {
    const classifyChange = (oldValue: any, newValue: any): string => {
      if (oldValue === null && newValue !== null) return 'added';
      if (oldValue !== null && newValue === null) return 'removed';
      if (oldValue !== newValue) return 'modified';
      return 'unchanged';
    };

    it('should classify new value as added', () => {
      expect(classifyChange(null, 'new value')).toBe('added');
    });

    it('should classify removed value as removed', () => {
      expect(classifyChange('old value', null)).toBe('removed');
    });

    it('should classify changed value as modified', () => {
      expect(classifyChange('old value', 'new value')).toBe('modified');
    });

    it('should classify same value as unchanged', () => {
      expect(classifyChange('same', 'same')).toBe('unchanged');
    });
  });

  describe('Change Category Grouping', () => {
    const groupChangesByCategory = (changes: PolicyChange[]): Record<string, PolicyChange[]> => {
      return changes.reduce((acc, change) => {
        const category = change.field_category;
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(change);
        return acc;
      }, {} as Record<string, PolicyChange[]>);
    };

    it('should group changes by category', () => {
      const changes: PolicyChange[] = [
        {
          id: '1',
          pull_id: 'pull-1',
          change_type: 'modified',
          field_category: 'policy',
          field_name: 'premium',
          old_value: 1000,
          new_value: 1100,
          detected_at: '2025-01-01',
          acknowledged: false,
        },
        {
          id: '2',
          pull_id: 'pull-1',
          change_type: 'added',
          field_category: 'vehicle',
          field_name: 'vin',
          old_value: null,
          new_value: '1HGBH41JXMN109186',
          detected_at: '2025-01-01',
          acknowledged: false,
        },
        {
          id: '3',
          pull_id: 'pull-1',
          change_type: 'modified',
          field_category: 'policy',
          field_name: 'effective_date',
          old_value: '2025-01-01',
          new_value: '2025-02-01',
          detected_at: '2025-01-01',
          acknowledged: false,
        },
      ];

      const grouped = groupChangesByCategory(changes);

      expect(Object.keys(grouped)).toHaveLength(2);
      expect(grouped['policy']).toHaveLength(2);
      expect(grouped['vehicle']).toHaveLength(1);
    });

    it('should handle empty changes array', () => {
      const grouped = groupChangesByCategory([]);
      expect(Object.keys(grouped)).toHaveLength(0);
    });
  });

  describe('Change Count Summary', () => {
    const getChangeSummary = (changes: PolicyChange[]) => {
      return {
        total: changes.length,
        added: changes.filter((c) => c.change_type === 'added').length,
        removed: changes.filter((c) => c.change_type === 'removed').length,
        modified: changes.filter((c) => c.change_type === 'modified').length,
        unacknowledged: changes.filter((c) => !c.acknowledged).length,
      };
    };

    it('should count changes by type', () => {
      const changes: PolicyChange[] = [
        { id: '1', pull_id: 'p1', change_type: 'added', field_category: 'vehicle', field_name: 'vin', old_value: null, new_value: 'ABC', detected_at: '', acknowledged: false },
        { id: '2', pull_id: 'p1', change_type: 'modified', field_category: 'policy', field_name: 'premium', old_value: 100, new_value: 200, detected_at: '', acknowledged: false },
        { id: '3', pull_id: 'p1', change_type: 'modified', field_category: 'policy', field_name: 'deductible', old_value: 500, new_value: 1000, detected_at: '', acknowledged: true },
        { id: '4', pull_id: 'p1', change_type: 'removed', field_category: 'driver', field_name: 'name', old_value: 'John', new_value: null, detected_at: '', acknowledged: false },
      ];

      const summary = getChangeSummary(changes);

      expect(summary.total).toBe(4);
      expect(summary.added).toBe(1);
      expect(summary.modified).toBe(2);
      expect(summary.removed).toBe(1);
      expect(summary.unacknowledged).toBe(3);
    });

    it('should handle all acknowledged changes', () => {
      const changes: PolicyChange[] = [
        { id: '1', pull_id: 'p1', change_type: 'modified', field_category: 'policy', field_name: 'premium', old_value: 100, new_value: 200, detected_at: '', acknowledged: true },
      ];

      const summary = getChangeSummary(changes);
      expect(summary.unacknowledged).toBe(0);
    });
  });

  describe('Change Priority Scoring', () => {
    const getChangePriority = (change: PolicyChange): 'high' | 'medium' | 'low' => {
      // High priority: coverage changes, premium increases > 10%, vehicle/driver removals
      const highPriorityFields = ['coverage', 'limit', 'deductible'];
      const highPriorityCategories = ['coverage'];

      if (highPriorityCategories.includes(change.field_category)) {
        return 'high';
      }

      if (highPriorityFields.some((f) => change.field_name.toLowerCase().includes(f))) {
        return 'high';
      }

      if (change.change_type === 'removed' && ['vehicle', 'driver', 'property'].includes(change.field_category)) {
        return 'high';
      }

      // Medium priority: premium changes, new items
      if (change.field_name === 'premium') {
        return 'medium';
      }

      if (change.change_type === 'added') {
        return 'medium';
      }

      // Low priority: everything else
      return 'low';
    };

    it('should mark coverage changes as high priority', () => {
      const change: PolicyChange = {
        id: '1',
        pull_id: 'p1',
        change_type: 'modified',
        field_category: 'coverage',
        field_name: 'liability_limit',
        old_value: 100000,
        new_value: 300000,
        detected_at: '',
        acknowledged: false,
      };

      expect(getChangePriority(change)).toBe('high');
    });

    it('should mark vehicle removal as high priority', () => {
      const change: PolicyChange = {
        id: '1',
        pull_id: 'p1',
        change_type: 'removed',
        field_category: 'vehicle',
        field_name: 'vin',
        old_value: '1HGBH41JXMN109186',
        new_value: null,
        detected_at: '',
        acknowledged: false,
      };

      expect(getChangePriority(change)).toBe('high');
    });

    it('should mark premium changes as medium priority', () => {
      const change: PolicyChange = {
        id: '1',
        pull_id: 'p1',
        change_type: 'modified',
        field_category: 'policy',
        field_name: 'premium',
        old_value: 1000,
        new_value: 1050,
        detected_at: '',
        acknowledged: false,
      };

      expect(getChangePriority(change)).toBe('medium');
    });

    it('should mark new items as medium priority', () => {
      const change: PolicyChange = {
        id: '1',
        pull_id: 'p1',
        change_type: 'added',
        field_category: 'vehicle',
        field_name: 'vin',
        old_value: null,
        new_value: '1HGBH41JXMN109186',
        detected_at: '',
        acknowledged: false,
      };

      expect(getChangePriority(change)).toBe('medium');
    });

    it('should mark address changes as low priority', () => {
      const change: PolicyChange = {
        id: '1',
        pull_id: 'p1',
        change_type: 'modified',
        field_category: 'insured',
        field_name: 'address',
        old_value: '123 Main St',
        new_value: '456 Oak Ave',
        detected_at: '',
        acknowledged: false,
      };

      expect(getChangePriority(change)).toBe('low');
    });
  });

  describe('Change Filtering', () => {
    const filterChanges = (
      changes: PolicyChange[],
      options: {
        category?: string;
        changeType?: string;
        acknowledged?: boolean;
      }
    ): PolicyChange[] => {
      return changes.filter((change) => {
        if (options.category && change.field_category !== options.category) {
          return false;
        }
        if (options.changeType && change.change_type !== options.changeType) {
          return false;
        }
        if (options.acknowledged !== undefined && change.acknowledged !== options.acknowledged) {
          return false;
        }
        return true;
      });
    };

    const testChanges: PolicyChange[] = [
      { id: '1', pull_id: 'p1', change_type: 'added', field_category: 'vehicle', field_name: 'vin', old_value: null, new_value: 'ABC', detected_at: '', acknowledged: false },
      { id: '2', pull_id: 'p1', change_type: 'modified', field_category: 'policy', field_name: 'premium', old_value: 100, new_value: 200, detected_at: '', acknowledged: false },
      { id: '3', pull_id: 'p1', change_type: 'modified', field_category: 'vehicle', field_name: 'mileage', old_value: 10000, new_value: 15000, detected_at: '', acknowledged: true },
      { id: '4', pull_id: 'p1', change_type: 'removed', field_category: 'driver', field_name: 'name', old_value: 'John', new_value: null, detected_at: '', acknowledged: false },
    ];

    it('should filter by category', () => {
      const filtered = filterChanges(testChanges, { category: 'vehicle' });
      expect(filtered).toHaveLength(2);
      filtered.forEach((c) => expect(c.field_category).toBe('vehicle'));
    });

    it('should filter by change type', () => {
      const filtered = filterChanges(testChanges, { changeType: 'modified' });
      expect(filtered).toHaveLength(2);
      filtered.forEach((c) => expect(c.change_type).toBe('modified'));
    });

    it('should filter by acknowledged status', () => {
      const unacknowledged = filterChanges(testChanges, { acknowledged: false });
      expect(unacknowledged).toHaveLength(3);

      const acknowledged = filterChanges(testChanges, { acknowledged: true });
      expect(acknowledged).toHaveLength(1);
    });

    it('should combine multiple filters', () => {
      const filtered = filterChanges(testChanges, {
        category: 'vehicle',
        acknowledged: false,
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('1');
    });
  });
});

describe('Value Comparison Utilities', () => {
  const formatChangeValue = (value: any): string => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'number') {
      return value.toLocaleString();
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    return String(value);
  };

  it('should format null as N/A', () => {
    expect(formatChangeValue(null)).toBe('N/A');
    expect(formatChangeValue(undefined)).toBe('N/A');
  });

  it('should format numbers with locale', () => {
    expect(formatChangeValue(1000)).toBe('1,000');
    expect(formatChangeValue(1234567)).toBe('1,234,567');
  });

  it('should format booleans as Yes/No', () => {
    expect(formatChangeValue(true)).toBe('Yes');
    expect(formatChangeValue(false)).toBe('No');
  });

  it('should convert other types to string', () => {
    expect(formatChangeValue('test')).toBe('test');
  });
});

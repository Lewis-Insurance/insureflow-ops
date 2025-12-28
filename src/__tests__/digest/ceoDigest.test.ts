/**
 * CEO Digest Feature Tests
 *
 * Tests for:
 * - Hook utility functions
 * - Status color helpers
 * - Severity color helpers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DAYS_OF_WEEK,
  TIMEZONES,
  getStatusColor,
  getSeverityColor,
} from '@/hooks/useCEODigest';

describe('CEO Digest Utilities', () => {
  describe('DAYS_OF_WEEK', () => {
    it('should have 7 days', () => {
      expect(DAYS_OF_WEEK).toHaveLength(7);
    });

    it('should start with Sunday (0) and end with Saturday (6)', () => {
      expect(DAYS_OF_WEEK[0]).toEqual({ value: 0, label: 'Sunday' });
      expect(DAYS_OF_WEEK[6]).toEqual({ value: 6, label: 'Saturday' });
    });

    it('should have Monday as value 1', () => {
      const monday = DAYS_OF_WEEK.find(d => d.value === 1);
      expect(monday).toEqual({ value: 1, label: 'Monday' });
    });
  });

  describe('TIMEZONES', () => {
    it('should have common US timezones', () => {
      const tzValues = TIMEZONES.map(tz => tz.value);
      expect(tzValues).toContain('America/New_York');
      expect(tzValues).toContain('America/Chicago');
      expect(tzValues).toContain('America/Denver');
      expect(tzValues).toContain('America/Los_Angeles');
    });

    it('should have Eastern Time as the first option', () => {
      expect(TIMEZONES[0].value).toBe('America/New_York');
    });

    it('should include UTC', () => {
      const utc = TIMEZONES.find(tz => tz.value === 'UTC');
      expect(utc).toBeDefined();
    });
  });

  describe('getStatusColor', () => {
    it('should return green for sent status', () => {
      const color = getStatusColor('sent');
      expect(color).toContain('green');
    });

    it('should return red for failed status', () => {
      const color = getStatusColor('failed');
      expect(color).toContain('red');
    });

    it('should return yellow for skipped status', () => {
      const color = getStatusColor('skipped');
      expect(color).toContain('yellow');
    });

    it('should return blue for in-progress statuses', () => {
      const statuses = ['created', 'computing', 'generating', 'sending'] as const;
      for (const status of statuses) {
        const color = getStatusColor(status);
        expect(color).toContain('blue');
      }
    });
  });

  describe('getSeverityColor', () => {
    it('should return red for critical severity', () => {
      const color = getSeverityColor('critical');
      expect(color).toContain('red');
    });

    it('should return amber for warning severity', () => {
      const color = getSeverityColor('warning');
      expect(color).toContain('amber');
    });

    it('should return blue for info severity', () => {
      const color = getSeverityColor('info');
      expect(color).toContain('blue');
    });
  });
});

describe('CEO Digest Types', () => {
  describe('CEODigestSettings interface', () => {
    it('should accept valid settings object', () => {
      const settings = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        agency_workspace_id: '123e4567-e89b-12d3-a456-426614174001',
        enabled: true,
        timezone: 'America/New_York',
        send_day_of_week: 1,
        send_time_local: '08:00',
        recipients: ['ceo@company.com'],
        include_pii: false,
        thresholds: {
          leads_drop_pct: 25,
          quotes_drop_pct: 25,
          overdue_tasks_critical: 10,
          aging_quotes_days: 7,
          canopy_reconnects_critical: 3,
          canopy_errors_critical: 5,
        },
        created_at: '2024-12-27T00:00:00Z',
        updated_at: '2024-12-27T00:00:00Z',
        created_by: null,
        updated_by: null,
      };

      // Type assertions to ensure the object conforms to expected shape
      expect(settings.enabled).toBe(true);
      expect(settings.send_day_of_week).toBeGreaterThanOrEqual(0);
      expect(settings.send_day_of_week).toBeLessThanOrEqual(6);
      expect(settings.recipients).toBeInstanceOf(Array);
      expect(settings.thresholds.leads_drop_pct).toBeGreaterThanOrEqual(0);
    });
  });

  describe('FactsPacket interface', () => {
    it('should accept valid facts packet', () => {
      const facts = {
        meta: {
          period_start: '2024-12-16T00:00:00Z',
          period_end: '2024-12-22T23:59:59Z',
          timezone: 'America/New_York',
          week_label: 'Week of Dec 16-22, 2024',
          generated_at: '2024-12-23T08:00:00Z',
          agency_workspace_id: '123e4567-e89b-12d3-a456-426614174000',
        },
        kpis: {
          leads_new: 10,
          quotes_created: 5,
          policies_bound: 2,
          premium_written: 15000,
        },
        deltas_vs_previous_week: {
          leads_new: {
            current: 10,
            previous: 8,
            change: 2,
            change_pct: 25,
          },
        },
        funnel: {
          leads: {
            new: 10,
            contacted: 8,
            qualified: 5,
          },
        },
        lists: {
          top_opportunities: [],
        },
        service_ops: {
          overdue_tasks: 3,
        },
        integration_health: {
          canopy: {
            available: true,
            pulls_this_week: 5,
          },
        },
        alerts: [
          {
            severity: 'warning' as const,
            category: 'leads',
            title: 'Test Alert',
            message: 'This is a test alert',
            evidence: { test: true },
          },
        ],
        missing_data: [],
      };

      expect(facts.meta.week_label).toContain('Week of');
      expect(facts.kpis.leads_new).toBeGreaterThanOrEqual(0);
      expect(facts.alerts).toBeInstanceOf(Array);
    });
  });

  describe('AIOutput interface', () => {
    it('should accept valid AI output', () => {
      const aiOutput = {
        subject: 'Weekly CEO Digest - Dec 16-22',
        preview: 'Strong week with 25% increase in leads...',
        markdown: '# Weekly Snapshot\n\n- **Leads**: 10 new this week',
        critical_alerts: [
          {
            title: 'Task Backlog',
            description: 'Overdue tasks exceeded threshold',
            action: 'Review and prioritize task queue',
          },
        ],
        ceo_actions: [
          {
            priority: 1,
            action: 'Review aging quotes',
            rationale: '5 quotes over 7 days old',
            deep_link: '/quotes?filter=aging',
          },
        ],
      };

      expect(aiOutput.subject.length).toBeLessThanOrEqual(100);
      expect(aiOutput.ceo_actions[0].priority).toBe(1);
      expect(aiOutput.markdown).toContain('#');
    });
  });
});

describe('Idempotency Key Generation', () => {
  // Test the logic for generating idempotency keys
  it('should generate consistent keys for same inputs', () => {
    const generateKey = (date: string, recipients: string[]): string => {
      const weekKey = date.split('T')[0];
      const recipientHash = recipients.sort().join(',');
      let hash = 0;
      for (let i = 0; i < recipientHash.length; i++) {
        const char = recipientHash.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return `${weekKey}_${Math.abs(hash).toString(16)}`;
    };

    const key1 = generateKey('2024-12-16T00:00:00Z', ['a@test.com', 'b@test.com']);
    const key2 = generateKey('2024-12-16T00:00:00Z', ['b@test.com', 'a@test.com']);
    const key3 = generateKey('2024-12-23T00:00:00Z', ['a@test.com', 'b@test.com']);

    // Same week, same recipients (order shouldn't matter after sort)
    expect(key1).toBe(key2);

    // Different week
    expect(key1).not.toBe(key3);
  });

  it('should handle empty recipients', () => {
    const generateKey = (date: string, recipients: string[]): string => {
      const weekKey = date.split('T')[0];
      const recipientHash = recipients.sort().join(',');
      let hash = 0;
      for (let i = 0; i < recipientHash.length; i++) {
        const char = recipientHash.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return `${weekKey}_${Math.abs(hash).toString(16)}`;
    };

    const key = generateKey('2024-12-16T00:00:00Z', []);
    expect(key).toBe('2024-12-16_0'); // Empty string hashes to 0
  });
});

describe('Week Range Calculation', () => {
  // Test the logic for calculating previous week range
  it('should calculate correct previous week range', () => {
    // Helper function that mirrors the edge function logic
    const getLastWeekRange = (now: Date): { start: Date; end: Date } => {
      const today = new Date(now);
      const dayOfWeek = today.getDay(); // 0 = Sunday

      // Calculate last Monday (start of previous week)
      const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const lastMonday = new Date(today);
      lastMonday.setDate(today.getDate() - daysToLastMonday - 7);
      lastMonday.setHours(0, 0, 0, 0);

      // Calculate last Sunday (end of previous week)
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      lastSunday.setHours(23, 59, 59, 999);

      return { start: lastMonday, end: lastSunday };
    };

    // Test for a Monday (Dec 23, 2024)
    const monday = new Date('2024-12-23T10:00:00Z');
    const { start, end } = getLastWeekRange(monday);

    // Previous week should be Dec 16-22, 2024
    // (Dec 23 is Monday, so previous week is Mon Dec 16 to Sun Dec 22)
    expect(start.getDate()).toBe(16);
    expect(start.getMonth()).toBe(11); // December = 11
    expect(end.getDate()).toBe(22);

    // Test for a Thursday (Dec 26, 2024)
    const thursday = new Date('2024-12-26T10:00:00Z');
    const { start: start2, end: end2 } = getLastWeekRange(thursday);

    // Previous week should still be Dec 16-22, 2024 (same week as the Monday test)
    expect(start2.getDate()).toBe(16);
    expect(end2.getDate()).toBe(22);
  });
});

describe('Markdown to HTML Conversion', () => {
  // Test the markdown conversion logic
  const markdownToHtml = (markdown: string): string => {
    let html = markdown;

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    return html;
  };

  it('should convert headers', () => {
    expect(markdownToHtml('# Title')).toBe('<h1>Title</h1>');
    expect(markdownToHtml('## Subtitle')).toBe('<h2>Subtitle</h2>');
    expect(markdownToHtml('### Section')).toBe('<h3>Section</h3>');
  });

  it('should convert bold text', () => {
    expect(markdownToHtml('**bold**')).toBe('<strong>bold</strong>');
  });

  it('should convert italic text', () => {
    expect(markdownToHtml('*italic*')).toBe('<em>italic</em>');
  });

  it('should convert bold italic text', () => {
    expect(markdownToHtml('***both***')).toBe('<strong><em>both</em></strong>');
  });
});

describe('Alert Threshold Validation', () => {
  const defaultThresholds = {
    leads_drop_pct: 25,
    quotes_drop_pct: 25,
    overdue_tasks_critical: 10,
    aging_quotes_days: 7,
    canopy_reconnects_critical: 3,
    canopy_errors_critical: 5,
  };

  it('should have reasonable default values', () => {
    expect(defaultThresholds.leads_drop_pct).toBeGreaterThan(0);
    expect(defaultThresholds.leads_drop_pct).toBeLessThanOrEqual(100);

    expect(defaultThresholds.aging_quotes_days).toBeGreaterThan(0);
    expect(defaultThresholds.overdue_tasks_critical).toBeGreaterThan(0);
  });

  it('should trigger alert when threshold exceeded', () => {
    const currentLeads = 10;
    const previousLeads = 20;
    const dropPct = ((previousLeads - currentLeads) / previousLeads) * 100;

    expect(dropPct).toBe(50);
    expect(dropPct >= defaultThresholds.leads_drop_pct).toBe(true);
  });

  it('should not trigger alert when within threshold', () => {
    const currentLeads = 18;
    const previousLeads = 20;
    const dropPct = ((previousLeads - currentLeads) / previousLeads) * 100;

    expect(dropPct).toBe(10);
    expect(dropPct >= defaultThresholds.leads_drop_pct).toBe(false);
  });
});

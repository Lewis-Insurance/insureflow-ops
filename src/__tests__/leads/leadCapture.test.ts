// ============================================
// Lead Capture Tests
// Tests for lead creation and validation
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Lead validation schema (matches LeadCaptureForm)
const leadSchema = z.object({
  first_name: z.string().trim().min(2, 'First name must be at least 2 characters').max(100),
  last_name: z.string().trim().min(2, 'Last name must be at least 2 characters').max(100),
  email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().trim().min(10, 'Phone must be at least 10 digits').optional().or(z.literal('')),
  company_name: z.string().trim().max(200).optional(),
  insurance_types: z.array(z.string()).min(1, 'Select at least one insurance type'),
}).refine(data => data.email || data.phone, {
  message: 'Either email or phone is required',
  path: ['email'],
});

describe('Lead Capture', () => {
  describe('Lead Validation Schema', () => {
    it('should validate a complete lead with all fields', () => {
      const validLead = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john.doe@example.com',
        phone: '5551234567',
        company_name: 'Acme Corp',
        insurance_types: ['auto', 'home'],
      };

      const result = leadSchema.safeParse(validLead);
      expect(result.success).toBe(true);
    });

    it('should validate lead with only email (no phone)', () => {
      const leadWithEmail = {
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@example.com',
        phone: '',
        insurance_types: ['commercial'],
      };

      const result = leadSchema.safeParse(leadWithEmail);
      expect(result.success).toBe(true);
    });

    it('should validate lead with only phone (no email)', () => {
      const leadWithPhone = {
        first_name: 'Bob',
        last_name: 'Wilson',
        email: '',
        phone: '5559876543',
        insurance_types: ['life'],
      };

      const result = leadSchema.safeParse(leadWithPhone);
      expect(result.success).toBe(true);
    });

    it('should reject lead without email or phone', () => {
      const invalidLead = {
        first_name: 'Test',
        last_name: 'User',
        email: '',
        phone: '',
        insurance_types: ['auto'],
      };

      const result = leadSchema.safeParse(invalidLead);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Either email or phone is required');
      }
    });

    it('should reject lead with first name too short', () => {
      const invalidLead = {
        first_name: 'J',
        last_name: 'Doe',
        email: 'j@example.com',
        insurance_types: ['auto'],
      };

      const result = leadSchema.safeParse(invalidLead);
      expect(result.success).toBe(false);
    });

    it('should reject lead with invalid email format', () => {
      const invalidLead = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'not-an-email',
        insurance_types: ['auto'],
      };

      const result = leadSchema.safeParse(invalidLead);
      expect(result.success).toBe(false);
    });

    it('should reject lead without insurance types', () => {
      const invalidLead = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        insurance_types: [],
      };

      const result = leadSchema.safeParse(invalidLead);
      expect(result.success).toBe(false);
    });

    it('should trim whitespace from string fields', () => {
      const leadWithWhitespace = {
        first_name: '  John  ',
        last_name: '  Doe  ',
        email: '  john@example.com  ',
        insurance_types: ['auto'],
      };

      const result = leadSchema.safeParse(leadWithWhitespace);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.first_name).toBe('John');
        expect(result.data.last_name).toBe('Doe');
      }
    });
  });

  describe('Lead Score Calculation', () => {
    // Simple lead score calculation logic
    function calculateLeadScore(lead: {
      email?: string;
      phone?: string;
      insurance_types: string[];
      decision_timeframe?: string;
    }): number {
      let score = 0;

      // Base score for having contact info
      if (lead.email) score += 20;
      if (lead.phone) score += 20;

      // Score based on insurance types
      score += lead.insurance_types.length * 10;

      // Score based on decision timeframe
      const timeframeScores: Record<string, number> = {
        'immediate': 30,
        '1_3_months': 20,
        '3_6_months': 10,
        '6_12_months': 5,
        'just_shopping': 0,
      };
      if (lead.decision_timeframe) {
        score += timeframeScores[lead.decision_timeframe] || 0;
      }

      return Math.min(score, 100);
    }

    it('should calculate high score for hot lead', () => {
      const hotLead = {
        email: 'john@example.com',
        phone: '5551234567',
        insurance_types: ['auto', 'home', 'umbrella'],
        decision_timeframe: 'immediate',
      };

      const score = calculateLeadScore(hotLead);
      expect(score).toBeGreaterThanOrEqual(80);
    });

    it('should calculate low score for cold lead', () => {
      const coldLead = {
        email: 'jane@example.com',
        insurance_types: ['auto'],
        decision_timeframe: 'just_shopping',
      };

      const score = calculateLeadScore(coldLead);
      expect(score).toBeLessThan(50);
    });

    it('should cap score at 100', () => {
      const superLead = {
        email: 'vip@example.com',
        phone: '5551234567',
        insurance_types: ['auto', 'home', 'life', 'commercial', 'umbrella', 'health'],
        decision_timeframe: 'immediate',
      };

      const score = calculateLeadScore(superLead);
      expect(score).toBe(100);
    });
  });

  describe('Insurance Type Validation', () => {
    const VALID_INSURANCE_TYPES = ['auto', 'home', 'life', 'commercial', 'health', 'umbrella'];

    function validateInsuranceTypes(types: string[]): { valid: boolean; invalid: string[] } {
      const invalid = types.filter(t => !VALID_INSURANCE_TYPES.includes(t));
      return { valid: invalid.length === 0, invalid };
    }

    it('should accept valid insurance types', () => {
      const result = validateInsuranceTypes(['auto', 'home']);
      expect(result.valid).toBe(true);
      expect(result.invalid).toHaveLength(0);
    });

    it('should reject invalid insurance types', () => {
      const result = validateInsuranceTypes(['auto', 'invalid_type', 'home']);
      expect(result.valid).toBe(false);
      expect(result.invalid).toContain('invalid_type');
    });

    it('should handle all valid types', () => {
      const result = validateInsuranceTypes(VALID_INSURANCE_TYPES);
      expect(result.valid).toBe(true);
    });
  });
});

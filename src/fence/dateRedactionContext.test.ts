import { describe, expect, it } from 'vitest';
import {
  redactPII,
  shouldRedactDate,
  isRedactionPlaceholder,
  nullifyRedactedTokens,
} from '../../supabase/functions/_shared/floorSafety.ts';

// These tests lock in the context-aware date redaction that ships in the
// deployed extract-*-policy edge functions (functions/_shared/floorSafety.ts).
// The rule: only dates of birth are regulated PII; policy-lifecycle dates must
// reach the extraction models. A matched date is judged by the nearest label.
// See shouldRedactDate for the DOB-vs-policy label ladder and the year gate.

describe('context-aware date redaction (floorSafety)', () => {
  describe('policy-lifecycle dates survive', () => {
    it('keeps a labeled policy effective date instead of masking it as a DOB', () => {
      const { redacted } = redactPII('Policy Effective Date: 03/29/2026');

      // The date itself must reach the model, and must NOT be swapped for a
      // DOB token.
      expect(redacted).toContain('03/29/2026');
      expect(redacted).not.toContain('[REDACTED_DOB]');
    });

    it('keeps an old retro/inception date that carries a strong policy label', () => {
      // Claims-made retro dates legitimately reach back decades, so the strict
      // strong-label path must keep even a DOB-plausible year (1998).
      const { redacted } = redactPII('Retroactive Date: 03/01/1998');

      expect(redacted).toContain('03/01/1998');
      expect(redacted).not.toContain('[REDACTED_DOB]');
    });

    it('shouldRedactDate returns false for a strong policy label adjacent to the date', () => {
      const source = 'Policy Period Effective Date 03/29/2026';
      const offset = source.indexOf('03/29/2026');
      expect(shouldRedactDate(source, offset, '03/29/2026')).toBe(false);
    });
  });

  describe('dates of birth are redacted', () => {
    it('redacts an explicitly DOB-labeled date', () => {
      const { redacted } = redactPII('DOB: 05/14/1980');

      expect(redacted).not.toContain('05/14/1980');
    });

    it('redacts a DOB on a driver row even when weak policy vocab (LIC EXP) sits nearby', () => {
      // Driver schedules put "LIC EXP" columns right next to DOB columns. The
      // person's birth date (04/12/1978) must still be redacted while the
      // license-expiration date (05/01/2027) - a modern, policy-context date -
      // is kept.
      const { redacted } = redactPII('JOHN SMITH 04/12/1978 LIC EXP 05/01/2027');

      expect(redacted).not.toContain('04/12/1978');
      expect(redacted).toContain('[REDACTED_DOB]');
      expect(redacted).toContain('05/01/2027');
    });

    it('redacts an unlabeled date as the safe default', () => {
      // No recognizable policy label anywhere -> stays redacted.
      const { redacted } = redactPII('Some floating value 07/08/1975 with no label context');

      expect(redacted).not.toContain('07/08/1975');
      expect(redacted).toContain('[REDACTED_DOB]');
    });

    it('shouldRedactDate returns true when DOB vocabulary is the nearest label', () => {
      const source = 'DOB 04/12/1978';
      const offset = source.indexOf('04/12/1978');
      expect(shouldRedactDate(source, offset, '04/12/1978')).toBe(true);
    });
  });

  describe('nullifyRedactedTokens cleans echoed placeholders out of model output', () => {
    it('nulls a value that is only a redaction token', () => {
      expect(nullifyRedactedTokens('[REDACTED_DOB]')).toBeNull();
    });

    it('nulls a value that is only redaction tokens plus joiner words', () => {
      expect(nullifyRedactedTokens('[REDACTED_DOB] to [REDACTED_DOB]')).toBeNull();
    });

    it('leaves a normal string untouched', () => {
      expect(nullifyRedactedTokens('Acme Corp')).toBe('Acme Corp');
    });

    it('leaves a string that mixes a token with real content untouched', () => {
      const value = 'Policy [REDACTED_POLICY_NUMBER] is active';
      expect(nullifyRedactedTokens(value)).toBe(value);
    });

    it('recurses into objects and arrays, nulling only placeholder-only strings', () => {
      const input = {
        insured_name: 'Acme Corp',
        date_of_birth: '[REDACTED_DOB]',
        drivers: [
          { name: 'Jane Doe', dob: '[REDACTED_DOB]' },
          { name: '[REDACTED_DOB]', dob: '[REDACTED_DOB]' },
        ],
        effective_date: '03/29/2026',
      };

      expect(nullifyRedactedTokens(input)).toEqual({
        insured_name: 'Acme Corp',
        date_of_birth: null,
        drivers: [
          { name: 'Jane Doe', dob: null },
          { name: null, dob: null },
        ],
        effective_date: '03/29/2026',
      });
    });

    it('isRedactionPlaceholder mirrors the null decision', () => {
      expect(isRedactionPlaceholder('[REDACTED_DOB]')).toBe(true);
      expect(isRedactionPlaceholder('[REDACTED_SSN] and [REDACTED_DOB]')).toBe(true);
      expect(isRedactionPlaceholder('Acme Corp')).toBe(false);
      expect(isRedactionPlaceholder('Policy [REDACTED_POLICY_NUMBER] active')).toBe(false);
    });
  });
});

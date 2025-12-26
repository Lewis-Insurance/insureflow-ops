/**
 * Environment Validation Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateEnv, getEnv, isProduction, isDevelopment } from '@/lib/validateEnv';

describe('validateEnv', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('validateEnv', () => {
    it('should return true when required env vars are set', () => {
      const result = validateEnv();
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should return missing vars when env vars are not set', () => {
      vi.stubEnv('VITE_SUPABASE_URL', '');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

      const result = validateEnv();
      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
    });
  });

  describe('getEnv', () => {
    it('should return environment variable value', () => {
      expect(getEnv('VITE_SUPABASE_URL')).toBe('https://test.supabase.co');
    });

    it('should return fallback when env var is not set', () => {
      expect(getEnv('NON_EXISTENT_VAR', 'fallback')).toBe('fallback');
    });

    it('should throw when env var is not set and no fallback provided', () => {
      expect(() => getEnv('NON_EXISTENT_VAR')).toThrow('Environment variable NON_EXISTENT_VAR is not set');
    });
  });

  describe('environment checks', () => {
    it('isProduction should return boolean', () => {
      expect(typeof isProduction()).toBe('boolean');
    });

    it('isDevelopment should return boolean', () => {
      expect(typeof isDevelopment()).toBe('boolean');
    });
  });
});

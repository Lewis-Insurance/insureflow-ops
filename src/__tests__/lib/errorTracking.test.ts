/**
 * Error Tracking Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  captureException,
  captureMessage,
  addBreadcrumb,
  setUser,
  handleBoundaryError,
} from '@/lib/errorTracking';

describe('errorTracking', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('captureException', () => {
    it('should not throw when capturing an error', () => {
      const error = new Error('Test error');
      expect(() => captureException(error)).not.toThrow();
    });

    it('should handle error with context', () => {
      const error = new Error('Test error');
      expect(() =>
        captureException(error, { extra: { key: 'value' } })
      ).not.toThrow();
    });
  });

  describe('captureMessage', () => {
    it('should not throw when capturing a message', () => {
      expect(() => captureMessage('Test message')).not.toThrow();
    });

    it('should accept severity level', () => {
      expect(() => captureMessage('Test warning', 'warning')).not.toThrow();
      expect(() => captureMessage('Test error', 'error')).not.toThrow();
      expect(() => captureMessage('Test info', 'info')).not.toThrow();
    });
  });

  describe('addBreadcrumb', () => {
    it('should not throw when adding a breadcrumb', () => {
      expect(() =>
        addBreadcrumb({
          category: 'test',
          message: 'Test breadcrumb',
          level: 'info',
        })
      ).not.toThrow();
    });

    it('should accept data in breadcrumb', () => {
      expect(() =>
        addBreadcrumb({
          category: 'test',
          message: 'Test breadcrumb',
          level: 'info',
          data: { key: 'value' },
        })
      ).not.toThrow();
    });
  });

  describe('user management', () => {
    it('should set user without throwing', () => {
      expect(() =>
        setUser({ id: 'user-123', email: 'test@example.com' })
      ).not.toThrow();
    });
  });

  describe('handleBoundaryError', () => {
    it('should handle error boundary errors', () => {
      const error = new Error('Component error');
      const errorInfo = { componentStack: 'at Component' } as React.ErrorInfo;

      expect(() => handleBoundaryError(error, errorInfo, 'component')).not.toThrow();
    });

    it('should handle different boundary levels', () => {
      const error = new Error('Test error');
      const errorInfo = { componentStack: '' } as React.ErrorInfo;

      expect(() => handleBoundaryError(error, errorInfo, 'app')).not.toThrow();
      expect(() => handleBoundaryError(error, errorInfo, 'page')).not.toThrow();
      expect(() => handleBoundaryError(error, errorInfo, 'component')).not.toThrow();
    });
  });
});

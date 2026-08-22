import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { collectionPortalUrl } from '@/hooks/useDocumentCollection';

describe('collectionPortalUrl', () => {
  const originalOrigin = window.location.origin;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://lewisinsurance.ai' },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: { origin: originalOrigin },
      writable: true,
      configurable: true,
    });
  });

  it('builds the correct portal collect path', () => {
    expect(collectionPortalUrl('abc123token')).toBe(
      'https://lewisinsurance.ai/portal/collect/abc123token',
    );
  });
});

describe('document collection link clipboard', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.assign(navigator, {
      clipboard: { writeText },
    });
  });

  it('writes portal URL to clipboard when copying', async () => {
    const url = collectionPortalUrl('test-token-xyz');
    await navigator.clipboard.writeText(url);
    expect(writeText).toHaveBeenCalledWith(
      'https://lewisinsurance.ai/portal/collect/test-token-xyz',
    );
  });
});

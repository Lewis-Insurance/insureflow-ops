import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

describe('portal callback route', () => {
  it('registers the lazy callback page before the NotFound catch-all', () => {
    expect(source).toContain('const PortalCallbackPage = lazyWithRetry');
    expect(source).toContain('path="/portal/callback"');
    expect(source.indexOf('path="/portal/callback"')).toBeLessThan(
      source.indexOf('<Route path="*" element={<NotFound />} />'),
    );
    expect(source).toMatch(/path="\/portal\/callback"[\s\S]*?<ErrorBoundary level="page" resetOnPropsChange>[\s\S]*?<PortalCallbackPage \/>/);
  });
});

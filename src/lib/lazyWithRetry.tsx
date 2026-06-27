import { lazy, type ComponentType } from 'react';

/**
 * Drop-in replacement for React.lazy that recovers from stale-chunk failures.
 *
 * After a new deployment, Vite emits JS chunks with new content-hashed
 * filenames. A browser tab still running the previous build references the OLD
 * chunk URLs; navigating to a route whose chunk hasn't loaded yet triggers a
 * failed dynamic import ("Failed to fetch dynamically imported module" /
 * ChunkLoadError), which the route error boundary renders as "Page Error".
 *
 * This wrapper catches that failure and forces a single full-page reload so the
 * browser fetches the current index.html and the new chunk URLs. A
 * sessionStorage flag ensures we only auto-reload ONCE per incident, so a
 * genuine code error surfaces to the error boundary instead of looping.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    const FLAG = 'chunk-reload-attempted';
    try {
      const component = await importer();
      // Loaded cleanly — clear the flag so a future deploy can retry again.
      window.sessionStorage.removeItem(FLAG);
      return component;
    } catch (error) {
      const alreadyReloaded = window.sessionStorage.getItem(FLAG) === 'true';
      if (!alreadyReloaded) {
        window.sessionStorage.setItem(FLAG, 'true');
        // Reload to pick up the freshly deployed build.
        window.location.reload();
        // Keep Suspense pending while the reload happens.
        return new Promise<{ default: T }>(() => {});
      }
      // Already retried once and still failing → real error. Let it bubble.
      throw error;
    }
  });
}

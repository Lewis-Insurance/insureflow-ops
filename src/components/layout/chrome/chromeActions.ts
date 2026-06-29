import { useEffect } from 'react';

/**
 * A tiny chrome -> page action bus. The global chrome (header + command palette)
 * can run a context-aware action on the page it is currently showing WITHOUT
 * importing or mutating that page directly: it emits a typed window event, and
 * the relevant page opts in with useChromeAction to open its own modal/flow.
 *
 * emitChromeAction returns false when no page is listening for that action, so
 * the caller can fall back (e.g. navigate, or open the palette).
 */
export type ChromeActionType =
  | 'log-contact'
  | 'compose-email'
  | 'new-customer'
  | 'new-policy'
  | 'new-lead';

export interface ChromeActionDetail {
  entity?: string;
  id?: string;
  name?: string;
}

const EVENT_PREFIX = 'cc-action:';
// Count of live listeners per action type, so emit knows if anyone will handle it.
const listenerCounts: Partial<Record<ChromeActionType, number>> = {};

/** Page-side: handle a chrome action while mounted. `handler` should be stable. */
export function useChromeAction(
  type: ChromeActionType,
  handler: (detail: ChromeActionDetail) => void,
): void {
  useEffect(() => {
    listenerCounts[type] = (listenerCounts[type] ?? 0) + 1;
    const onEvent = (e: Event) => handler((e as CustomEvent<ChromeActionDetail>).detail ?? {});
    window.addEventListener(EVENT_PREFIX + type, onEvent);
    return () => {
      listenerCounts[type] = Math.max(0, (listenerCounts[type] ?? 1) - 1);
      window.removeEventListener(EVENT_PREFIX + type, onEvent);
    };
  }, [type, handler]);
}

/** True when a mounted page is listening for `type`. */
export function isChromeActionHandled(type: ChromeActionType): boolean {
  return (listenerCounts[type] ?? 0) > 0;
}

/** Chrome-side: run the action on the current page. Returns false if unhandled. */
export function emitChromeAction(type: ChromeActionType, detail: ChromeActionDetail = {}): boolean {
  if (!isChromeActionHandled(type)) return false;
  window.dispatchEvent(new CustomEvent<ChromeActionDetail>(EVENT_PREFIX + type, { detail }));
  return true;
}

import { useLocation } from 'react-router-dom';
import { PanelLeft, Search } from 'lucide-react';
import { useChrome } from './ChromeContext';
import { destForPath } from './navConfig';

/**
 * STUB (replaced by the header specialist). Toggle + title + palette trigger.
 */
export function AppHeader() {
  const { toggleRail, setPaletteOpen } = useChrome();
  const { pathname } = useLocation();
  const { dest, group } = destForPath(pathname);
  return (
    <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-cc-border-subtle bg-cc-bg px-4">
      <button
        type="button"
        onClick={toggleRail}
        aria-label="Toggle sidebar"
        className="flex h-9 w-9 items-center justify-center rounded-cc-md text-cc-text-muted hover:bg-cc-surface-raised hover:text-cc-text-primary"
      >
        <PanelLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0">
        {group && (
          <div className="text-label font-medium uppercase tracking-label text-cc-text-muted">{group.label}</div>
        )}
        <div className="truncate text-base font-semibold text-cc-text-primary">{dest?.label ?? 'InsureFlow'}</div>
      </div>
      <span className="flex-1" />
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="flex h-9 items-center gap-2 rounded-cc-md border border-cc-border-interactive bg-cc-surface px-3 text-sm text-cc-text-muted hover:bg-cc-surface-raised"
      >
        <Search className="h-4 w-4" />
        Search
        <span className="cc-num rounded-cc-sm bg-cc-surface-overlay px-1.5 py-0.5 text-xs">K</span>
      </button>
    </header>
  );
}

import { Link, useLocation } from 'react-router-dom';
import { RAIL_GROUPS, SYSTEM_ADMIN } from './navConfig';
import { cn } from '@/lib/utils';

/**
 * STUB (replaced by the rail specialist). A functional grouped nav so every route
 * stays reachable until the full direction-B rail lands.
 */
export function AppRail() {
  const { pathname } = useLocation();
  const isActive = (to: string) => pathname === to || pathname.startsWith(to + '/');
  return (
    <nav
      aria-label="Primary"
      className="flex w-[272px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-cc-border-subtle bg-cc-bg p-2"
    >
      {RAIL_GROUPS.map((g) => (
        <div key={g.key} className="mb-2">
          <div className="px-2 pb-1 pt-2 text-label font-medium uppercase tracking-label text-cc-text-muted">
            {g.label}
          </div>
          {g.items.map((it) => (
            <Link
              key={it.to + it.label}
              to={it.to}
              aria-current={isActive(it.to) ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-cc-md px-2 py-1.5 text-sm',
                isActive(it.to)
                  ? 'bg-cc-surface-overlay text-cc-text-primary'
                  : 'text-cc-text-secondary hover:bg-cc-surface-raised',
              )}
            >
              <it.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{it.label}</span>
            </Link>
          ))}
        </div>
      ))}
      <Link
        to={SYSTEM_ADMIN.to}
        className="flex items-center gap-2.5 rounded-cc-md px-2 py-1.5 text-sm text-cc-text-secondary hover:bg-cc-surface-raised"
      >
        <SYSTEM_ADMIN.icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{SYSTEM_ADMIN.label}</span>
      </Link>
    </nav>
  );
}

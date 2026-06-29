import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Zap, RefreshCw, CheckSquare, TrendingUp,
  ChevronsUpDown, ChevronDown, ChevronRight,
  Shield, MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { RAIL_GROUPS, SYSTEM_ADMIN, type NavGroupDef, type NavDest } from './navConfig';
import { useChrome } from './ChromeContext';
import { useNeedsMeToday, type NeedsMeToday } from '@/hooks/useNeedsMeToday';
import { useAuth } from '@/hooks/useAuth';
import { AccentSpine } from '@/components/cc';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ helpers */

function getInitials(name: string | null | undefined): string {
  if (!name) return 'U';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

/** Match the active destination the same way navConfig.destForPath does. */
function isActivePath(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(to + '/');
}

/** The three live "Needs me today" rows, derived from the hook counts. */
interface TodayRow {
  label: string;
  icon: LucideIcon;
  count: number;
  to: string;
}

function todayRows(counts: NeedsMeToday): TodayRow[] {
  return [
    { label: 'Renewals due', icon: RefreshCw, count: counts.renewals_due, to: '/renewals' },
    { label: 'Overdue tasks', icon: CheckSquare, count: counts.overdue_tasks, to: '/tasks' },
    { label: 'New leads', icon: TrendingUp, count: counts.new_leads, to: '/leads' },
  ];
}

/* ------------------------------------------------------ shared row fragments */

/** A single Needs-me-today row (used in the full panel and the collapsed flyout). */
function NeedsRow({ row, onNavigate }: { row: TodayRow; onNavigate: (to: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(row.to)}
      className="flex w-full items-center gap-2.5 rounded-cc-sm px-2.5 py-1.5 text-left transition-colors duration-fast hover:bg-cc-surface-raised"
    >
      <row.icon className="h-[17px] w-[17px] shrink-0 text-cc-text-muted" strokeWidth={1.5} />
      <span className="flex-1 truncate text-xs text-cc-text-secondary">{row.label}</span>
      <span className="cc-num text-sm font-semibold text-cc-text-primary">{row.count}</span>
    </button>
  );
}

/** A single inactive nav item (plain link, neutral NEW dot). */
function NavItemLink({ item, onClick }: { item: NavDest; onClick?: () => void }) {
  return (
    <Link
      to={item.to}
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-cc-md px-2 py-1.5 transition-colors duration-fast hover:bg-cc-surface-raised"
    >
      <item.icon className="h-[18px] w-[18px] shrink-0 text-cc-text-muted" strokeWidth={1.5} />
      <span className="flex-1 truncate text-sm text-cc-text-secondary">{item.label}</span>
      {item.isNew && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-cc-text-primary/40"
          aria-label="new"
        />
      )}
    </Link>
  );
}

/** The active nav item, wrapped in the one and only AccentSpine in the rail. */
function NavItemActive({ item, onClick }: { item: NavDest; onClick?: () => void }) {
  return (
    <Link to={item.to} onClick={onClick} aria-current="page">
      <AccentSpine active className="flex items-center gap-2.5 px-2 py-1.5">
        <item.icon className="h-[18px] w-[18px] shrink-0 text-cc-text-primary" strokeWidth={1.75} />
        <span className="flex-1 truncate text-sm font-semibold text-cc-text-primary">
          {item.label}
        </span>
      </AccentSpine>
    </Link>
  );
}

/* ------------------------------------------------------------- FULL rail (272) */

function NavSection({
  group,
  pathname,
}: {
  group: NavGroupDef;
  pathname: string;
}) {
  const { expandedSections, toggleSection } = useChrome();
  const expanded = expandedSections[group.key] ?? group.defaultOpen;
  const hasNew = group.items.some((i) => i.isNew);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => toggleSection(group.key)}
        aria-expanded={false}
        className="flex w-full items-center gap-2 rounded-cc-sm px-2 py-2 text-left transition-colors duration-fast hover:bg-cc-surface"
      >
        <span className="text-label font-bold uppercase tracking-label text-cc-text-muted">
          {group.label}
        </span>
        <span className="cc-num rounded-cc-sm bg-cc-surface-raised px-1.5 py-0.5 text-[10px] font-semibold text-cc-text-faint">
          {group.items.length}
        </span>
        {hasNew && (
          <span className="h-1.5 w-1.5 rounded-full bg-cc-text-primary/40" aria-label="new" />
        )}
        <span className="flex-1" />
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-cc-text-muted" strokeWidth={1.5} />
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-2 pb-1.5 pt-2">
        <span className="text-label font-bold uppercase tracking-label text-cc-text-muted">
          {group.label}
        </span>
        <span className="h-px flex-1 bg-cc-border-subtle" />
        <button
          type="button"
          onClick={() => toggleSection(group.key)}
          aria-expanded={true}
          aria-label={`Collapse ${group.label}`}
          className="-m-1 rounded-cc-sm p-1 transition-colors duration-fast hover:bg-cc-surface-raised"
        >
          <ChevronDown className="h-[17px] w-[17px] text-cc-text-muted" strokeWidth={1.5} />
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        {group.items.map((item) =>
          isActivePath(pathname, item.to) ? (
            <NavItemActive key={item.to + item.label} item={item} />
          ) : (
            <NavItemLink key={item.to + item.label} item={item} />
          ),
        )}
      </div>
    </div>
  );
}

function RailFull() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { counts } = useNeedsMeToday();
  const { profile, signOut } = useAuth();

  const rows = todayRows(counts);
  const name = profile?.full_name || 'User';
  const role = profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : 'Staff';

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-[272px] shrink-0 flex-col border-r border-cc-border-subtle bg-cc-bg transition-[width] duration-base ease-glide"
    >
      {/* a) Identity block */}
      <div className="flex items-center gap-2.5 px-3 pb-2.5 pt-3.5">
        <div className="flex shrink-0 items-center rounded-cc-sm bg-white px-2 py-1.5">
          <img src="/lewis-logo.png" alt="Lewis Insurance" className="h-[19px] w-auto" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-cc-text-primary">Lewis Insurance</div>
          <div className="truncate text-xs text-cc-text-muted">Lake City, FL</div>
        </div>
        <button
          type="button"
          aria-label="Switch office"
          className="-m-1 shrink-0 rounded-cc-sm p-1 text-cc-text-muted transition-colors duration-fast hover:bg-cc-surface-raised"
        >
          <ChevronsUpDown className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </button>
      </div>

      {/* b) Needs me today panel */}
      <div className="mx-2.5 mb-1.5 mt-0.5 rounded-cc-lg border border-cc-border-subtle bg-cc-surface px-1 pb-1.5 pt-2">
        <div className="flex items-center gap-2 px-2.5 pb-1.5">
          <Zap className="h-4 w-4 shrink-0 text-cc-text-muted" strokeWidth={1.5} />
          <span className="text-label font-bold uppercase tracking-label text-cc-text-muted">
            Needs me today
          </span>
          <span className="flex-1" />
          <span className="cc-num text-[10px] font-medium text-cc-text-faint">
            {format(new Date(), 'MMM d')}
          </span>
        </div>
        <div className="flex flex-col">
          {rows.map((row) => (
            <NeedsRow key={row.label} row={row} onNavigate={navigate} />
          ))}
        </div>
      </div>

      {/* c) Navigation */}
      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-1 pt-0.5">
        {RAIL_GROUPS.map((group) => (
          <NavSection key={group.key} group={group} pathname={pathname} />
        ))}
      </div>

      {/* d) Footer */}
      <div className="border-t border-cc-border-subtle px-2 pb-2 pt-1.5">
        <Link
          to={SYSTEM_ADMIN.to}
          aria-current={isActivePath(pathname, SYSTEM_ADMIN.to) ? 'page' : undefined}
          className={cn(
            'flex items-center gap-2.5 rounded-cc-md px-2 py-1.5 transition-colors duration-fast hover:bg-cc-surface-raised',
            isActivePath(pathname, SYSTEM_ADMIN.to) && 'bg-cc-surface-raised',
          )}
        >
          <Shield
            className={cn(
              'h-[18px] w-[18px] shrink-0',
              isActivePath(pathname, SYSTEM_ADMIN.to) ? 'text-cc-text-primary' : 'text-cc-text-muted',
            )}
            strokeWidth={1.5}
          />
          <span
            className={cn(
              'flex-1 truncate text-sm',
              isActivePath(pathname, SYSTEM_ADMIN.to)
                ? 'font-semibold text-cc-text-primary'
                : 'text-cc-text-secondary',
            )}
          >
            {SYSTEM_ADMIN.label}
          </span>
        </Link>

        <div className="mt-0.5 flex items-center gap-2.5 px-1 py-1.5">
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-cc-border-subtle bg-cc-surface-overlay text-xs font-semibold text-cc-text-primary">
            {getInitials(name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-cc-text-primary">{name}</div>
            <div className="truncate text-xs text-cc-text-muted">{role} · Lake City</div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="User menu"
                className="-m-1 shrink-0 rounded-cc-sm p-1 text-cc-text-muted transition-colors duration-fast hover:bg-cc-surface-raised"
              >
                <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.5} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-48">
              <DropdownMenuItem asChild>
                <Link to="/profile">Profile Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}

/* -------------------------------------------------------- COLLAPSED rail (72) */

/** A right-side flyout panel anchored to an icon button; opens on hover/focus.
 * The flyout children carry their own group/Today label, which doubles as the
 * accessible name (so it is referenced rather than duplicated as aria-label). */
function Flyout({ open, children }: { open: boolean; children: ReactNode }) {
  if (!open) return null;
  return (
    <div
      role="menu"
      className="absolute left-[84px] top-0 z-30 w-56 rounded-cc-lg border border-cc-border-subtle bg-cc-surface-raised p-2 shadow-lift"
    >
      {children}
    </div>
  );
}

/** Wraps an icon button + its flyout, sharing hover/focus open state. */
function FlyoutHost({
  children,
  flyout,
}: {
  children: (open: boolean) => ReactNode;
  flyout: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      {children(open)}
      <Flyout open={open}>{flyout(() => setOpen(false))}</Flyout>
    </div>
  );
}

function CollapsedGroup({ group, pathname }: { group: NavGroupDef; pathname: string }) {
  const activeItem = group.items.find((i) => isActivePath(pathname, i.to));
  const isGroupActive = Boolean(activeItem);
  const Icon = (activeItem ?? group.items[0]).icon;

  return (
    <FlyoutHost
      flyout={(close) => (
        <div className="flex flex-col gap-0.5">
          <div className="px-2 pb-1.5 pt-1 text-label font-bold uppercase tracking-label text-cc-text-muted">
            {group.label}
          </div>
          {group.items.map((item) =>
            isActivePath(pathname, item.to) ? (
              <Link key={item.to + item.label} to={item.to} onClick={close} aria-current="page">
                <AccentSpine active className="flex items-center gap-2.5 px-2 py-1.5">
                  <item.icon
                    className="h-[18px] w-[18px] shrink-0 text-cc-text-primary"
                    strokeWidth={1.75}
                  />
                  <span className="flex-1 truncate text-xs font-semibold text-cc-text-primary">
                    {item.label}
                  </span>
                </AccentSpine>
              </Link>
            ) : (
              <Link
                key={item.to + item.label}
                to={item.to}
                onClick={close}
                className="flex items-center gap-2.5 rounded-cc-md px-2 py-1.5 transition-colors duration-fast hover:bg-cc-surface-overlay"
              >
                <item.icon
                  className="h-[18px] w-[18px] shrink-0 text-cc-text-muted"
                  strokeWidth={1.5}
                />
                <span className="flex-1 truncate text-xs text-cc-text-secondary">{item.label}</span>
                {item.isNew && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-cc-text-primary/40"
                    aria-label="new"
                  />
                )}
              </Link>
            ),
          )}
        </div>
      )}
    >
      {() => (
        <button
          type="button"
          aria-label={group.label}
          className={cn(
            'relative flex h-11 w-11 items-center justify-center rounded-cc-lg transition-colors duration-fast',
            isGroupActive ? 'bg-cc-surface-overlay' : 'hover:bg-cc-surface-raised',
          )}
        >
          {isGroupActive && (
            <span className="absolute left-[-14px] top-2 bottom-2 w-0.5 rounded-full bg-cc-accent" />
          )}
          <Icon
            className={cn(
              'h-[21px] w-[21px]',
              isGroupActive ? 'text-cc-text-primary' : 'text-cc-text-muted',
            )}
            strokeWidth={isGroupActive ? 1.75 : 1.5}
          />
        </button>
      )}
    </FlyoutHost>
  );
}

function RailCollapsed() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { counts, total } = useNeedsMeToday();
  const { profile } = useAuth();
  const rows = todayRows(counts);
  const adminActive = isActivePath(pathname, SYSTEM_ADMIN.to);

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-[72px] shrink-0 flex-col items-center gap-1 border-r border-cc-border-subtle bg-cc-bg py-3 transition-[width] duration-base ease-glide"
    >
      {/* mini logo chip */}
      <div className="mb-1 flex h-[30px] w-[42px] items-center justify-center rounded-cc-sm bg-white">
        <img src="/lewis-logo.png" alt="Lewis Insurance" className="h-3 w-auto" />
      </div>

      {/* Today icon + flyout */}
      <FlyoutHost
        flyout={(close) => (
          <div className="flex flex-col">
            <div className="px-2.5 pb-1.5 pt-1 text-label font-bold uppercase tracking-label text-cc-text-muted">
              Needs me today
            </div>
            {rows.map((row) => (
              <NeedsRow
                key={row.label}
                row={row}
                onNavigate={(to) => {
                  close();
                  navigate(to);
                }}
              />
            ))}
          </div>
        )}
      >
        {() => (
          <button
            type="button"
            aria-label={`Needs me today, ${total} open items`}
            className="relative flex h-11 w-11 items-center justify-center rounded-cc-lg transition-colors duration-fast hover:bg-cc-surface-raised"
          >
            <Zap className="h-[21px] w-[21px] text-cc-text-muted" strokeWidth={1.5} />
            <span className="cc-num absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-cc-border-subtle bg-cc-surface-overlay px-1 text-[9.5px] font-semibold text-cc-text-primary">
              {total}
            </span>
          </button>
        )}
      </FlyoutHost>

      {/* group icon buttons */}
      <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto py-1">
        {RAIL_GROUPS.map((group) => (
          <CollapsedGroup key={group.key} group={group} pathname={pathname} />
        ))}
      </div>

      {/* Admin */}
      <FlyoutHost
        flyout={(close) => (
          <Link
            to={SYSTEM_ADMIN.to}
            onClick={close}
            className="flex items-center gap-2.5 rounded-cc-md px-2 py-1.5 transition-colors duration-fast hover:bg-cc-surface-overlay"
          >
            <Shield className="h-[18px] w-[18px] shrink-0 text-cc-text-muted" strokeWidth={1.5} />
            <span className="flex-1 truncate text-xs text-cc-text-secondary">
              {SYSTEM_ADMIN.label}
            </span>
          </Link>
        )}
      >
        {() => (
          <Link
            to={SYSTEM_ADMIN.to}
            aria-label={SYSTEM_ADMIN.label}
            aria-current={adminActive ? 'page' : undefined}
            className={cn(
              'relative flex h-11 w-11 items-center justify-center rounded-cc-lg transition-colors duration-fast',
              adminActive ? 'bg-cc-surface-overlay' : 'hover:bg-cc-surface-raised',
            )}
          >
            {adminActive && (
              <span className="absolute left-[-14px] top-2 bottom-2 w-0.5 rounded-full bg-cc-accent" />
            )}
            <Shield
              className={cn(
                'h-[21px] w-[21px]',
                adminActive ? 'text-cc-text-primary' : 'text-cc-text-muted',
              )}
              strokeWidth={adminActive ? 1.75 : 1.5}
            />
          </Link>
        )}
      </FlyoutHost>

      {/* footer avatar */}
      <span className="mt-1 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-cc-border-subtle bg-cc-surface-overlay text-xs font-semibold text-cc-text-primary">
        {getInitials(profile?.full_name)}
      </span>
    </nav>
  );
}

/* --------------------------------------------------------------------- export */

export function AppRail() {
  const { railCollapsed } = useChrome();
  return railCollapsed ? <RailCollapsed /> : <RailFull />;
}

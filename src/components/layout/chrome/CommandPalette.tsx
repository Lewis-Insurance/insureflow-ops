import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  CornerDownLeft,
  History as HistoryIcon,
  UserPlus,
  Scale,
  PhoneCall,
  Mail,
  Users,
  FileText,
  Building2,
  Contact,
  type LucideIcon,
} from 'lucide-react';
import { useChrome } from './ChromeContext';
import { ALL_DESTINATIONS } from './navConfig';
import { useActiveRecord } from './useActiveRecord';
import { emitChromeAction } from './chromeActions';
import { useGlobalSearch, type SearchResult } from '@/hooks/useGlobalSearch';
import { AccentSpine } from '@/components/cc';

/**
 * Cmd-K command palette (chrome handoff README section 5). One keystroke to jump
 * anywhere or run a context-aware action. The global Cmd/Ctrl+K listener lives in
 * ChromeContext and toggles `paletteOpen`; this component only consumes that state.
 *
 * Calm Command rules honored: dark only; the ONLY lime is the selected-row spine
 * (via AccentSpine active), the lime search icon + caret while focused, and the
 * input focus ring (painted globally by index.css :focus-visible). All colors and
 * radii come from cc tokens, no hardcoded hex. Tabular numerals are inherited from
 * the .cc-num convention; no numbers render here. Copy uses no em or en dashes.
 *
 * A11y: role="dialog" aria-modal, the input is a combobox controlling a listbox,
 * aria-activedescendant points at the selected option, focus is trapped, Esc
 * closes, and focus is restored to the previously focused element on close.
 */

const RECENT_KEY = 'cc-palette-recent';
const RECENT_MAX = 5;

interface RecentDest {
  label: string;
  to: string;
}

interface PaletteRow {
  /** stable id for aria-activedescendant + scroll-into-view */
  id: string;
  label: string;
  /** optional second line (e.g. a policy carrier/line, an account city/state) */
  subtitle?: string;
  icon: ComponentType<{ className?: string }>;
  run: () => void;
}

// Live record search (global_search_v1) returns these entity types. Accounts,
// contacts and businesses all resolve to the customer record; policies to the
// policy record (mirrors the existing GlobalSearch navigation mapping).
const RECORD_ICONS: Record<SearchResult['entity_type'], ComponentType<{ className?: string }>> = {
  account: Users,
  contact: Contact,
  business: Building2,
  policy: FileText,
};

function recordPath(r: SearchResult): string {
  return r.entity_type === 'policy' ? `/policies/${r.id}` : `/customers/${r.id}`;
}

// Keep the palette compact; the RPC returns up to 50, we surface the closest few.
const RECORD_LIMIT = 8;

interface PaletteSection {
  key: string;
  label: string;
  rows: PaletteRow[];
}

function readRecent(): RecentDest[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (d): d is RecentDest =>
          !!d &&
          typeof (d as RecentDest).label === 'string' &&
          typeof (d as RecentDest).to === 'string',
      )
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function pushRecent(dest: RecentDest): void {
  try {
    const next = [dest, ...readRecent().filter((d) => d.to !== dest.to)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function matches(label: string, query: string): boolean {
  return label.toLowerCase().includes(query.trim().toLowerCase());
}

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen } = useChrome();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);

  const baseId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setPaletteOpen(false), [setPaletteOpen]);

  const active = useActiveRecord();

  // Live record search across customers, policies, businesses and contacts.
  const {
    results: recordResults,
    loading: recordsLoading,
    search: runRecordSearch,
    clearResults: clearRecords,
  } = useGlobalSearch();

  // Context-aware actions. Record actions (Log contact / Compose email) appear
  // only on a record and target it via the chrome action bus; if the page is not
  // listening they fall back to opening the record. Nothing is fabricated.
  const actionDefs = useMemo<{ label: string; icon: LucideIcon; run: () => void }[]>(() => {
    const list: { label: string; icon: LucideIcon; run: () => void }[] = [];
    if (active) {
      const seg = active.entity === 'customer' ? 'customers' : active.entity === 'policy' ? 'policies' : 'leads';
      const recordPath = `/${seg}/${active.id}`;
      list.push({
        label: 'Log contact',
        icon: PhoneCall,
        run: () => {
          if (!emitChromeAction('log-contact', active)) navigate(recordPath);
          close();
        },
      });
      list.push({
        label: 'Compose email',
        icon: Mail,
        run: () => {
          if (!emitChromeAction('compose-email', active)) navigate(recordPath);
          close();
        },
      });
    }
    list.push({
      label: 'New customer',
      icon: UserPlus,
      run: () => {
        if (!emitChromeAction('new-customer')) navigate('/customers');
        close();
      },
    });
    list.push({
      label: 'Start quote comparison',
      icon: Scale,
      run: () => {
        navigate('/comparison');
        close();
      },
    });
    list.push({
      label: 'Add Policy',
      icon: FileText,
      run: () => {
        navigate('/policies/new');
        close();
      },
    });
    return list;
  }, [active, navigate, close]);

  const recent = useMemo<RecentDest[]>(() => (paletteOpen ? readRecent() : []), [paletteOpen]);

  // Build the visible sections (and their flat row order) from the current query.
  const sections = useMemo<PaletteSection[]>(() => {
    const q = query.trim();
    const out: PaletteSection[] = [];

    const goto = (to: string, label: string) => {
      pushRecent({ label, to });
      navigate(to);
      close();
    };

    // Records first: when the user types a name/number they almost always want
    // to jump to the record, not a page or an action.
    if (q.length >= 2 && recordResults.length) {
      const recordRows: PaletteRow[] = recordResults.slice(0, RECORD_LIMIT).map((r, i) => ({
        id: `${baseId}-record-${i}`,
        label: r.label,
        subtitle: r.subtitle,
        icon: RECORD_ICONS[r.entity_type] ?? Users,
        run: () => goto(recordPath(r), r.label),
      }));
      out.push({ key: 'records', label: 'Customers and policies', rows: recordRows });
    }

    const actionRows: PaletteRow[] = actionDefs
      .filter((a) => matches(a.label, q))
      .map((a, i) => ({
        id: `${baseId}-action-${i}`,
        label: a.label,
        icon: a.icon,
        run: a.run,
      }));
    if (actionRows.length) out.push({ key: 'actions', label: 'Actions', rows: actionRows });

    const jumpRows: PaletteRow[] = ALL_DESTINATIONS.filter((d) => matches(d.label, q)).map(
      (d, i) => ({
        id: `${baseId}-jump-${i}`,
        label: d.label,
        icon: d.icon,
        run: () => goto(d.to, d.label),
      }),
    );
    if (jumpRows.length) out.push({ key: 'jump', label: 'Jump to', rows: jumpRows });

    // Recent is hidden while a query is typed (and when empty).
    if (!q && recent.length) {
      const recentRows: PaletteRow[] = recent.map((r, i) => ({
        id: `${baseId}-recent-${i}`,
        label: r.label,
        icon: HistoryIcon,
        run: () => goto(r.to, r.label),
      }));
      out.push({ key: 'recent', label: 'Recent', rows: recentRows });
    }

    return out;
  }, [query, recordResults, actionDefs, recent, baseId, navigate, close]);

  // Flatten for a single selection index spanning every visible row.
  const flatRows = useMemo<PaletteRow[]>(() => sections.flatMap((s) => s.rows), [sections]);

  // Reset query + selection whenever the palette opens, and capture/restore focus.
  useEffect(() => {
    if (!paletteOpen) return;
    restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    setQuery('');
    setSelected(0);
    // Focus the input after mount.
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      // Restore focus to whatever was focused before opening.
      restoreFocusRef.current?.focus?.();
    };
  }, [paletteOpen]);

  // Debounced live record search. Fires on 2+ chars; clears below that and on
  // close so stale rows never linger. The 180ms wait keeps typing responsive
  // without a request per keystroke.
  useEffect(() => {
    if (!paletteOpen) return;
    const q = query.trim();
    if (q.length < 2) {
      clearRecords();
      return;
    }
    const t = window.setTimeout(() => runRecordSearch(q), 180);
    return () => window.clearTimeout(t);
  }, [query, paletteOpen, runRecordSearch, clearRecords]);

  // Keep the selection in range as results change.
  useEffect(() => {
    setSelected((s) => {
      if (flatRows.length === 0) return 0;
      return Math.min(s, flatRows.length - 1);
    });
  }, [flatRows.length]);

  // Scroll the selected row into view as it moves.
  useLayoutEffect(() => {
    if (!paletteOpen) return;
    const row = flatRows[selected];
    if (!row) return;
    const el = listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(row.id)}`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected, flatRows, paletteOpen]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (flatRows.length) setSelected((s) => (s + 1) % flatRows.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (flatRows.length) setSelected((s) => (s - 1 + flatRows.length) % flatRows.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        flatRows[selected]?.run();
      }
    },
    [flatRows, selected, close],
  );

  // Focus trap: keep Tab/Shift+Tab inside the panel. There is effectively one
  // focusable control (the input), so we simply hold focus there.
  const onPanelKeyDownCapture = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      inputRef.current?.focus();
    }
  }, []);

  if (!paletteOpen) return null;

  const activeRow = flatRows[selected];
  const listboxId = `${baseId}-listbox`;

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        // Clicking the scrim (but not the panel) closes.
        if (e.target === e.currentTarget) close();
      }}
      className="fixed inset-0 z-modal flex justify-center bg-[var(--cc-scrim)] px-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDownCapture={onPanelKeyDownCapture}
        className="mx-auto mt-[12vh] flex h-fit max-h-[70vh] w-full max-w-[480px] flex-col overflow-hidden rounded-cc-xl border border-cc-border-strong bg-cc-surface-raised shadow-lift"
      >
        {/* Input row */}
        <div className="flex items-center gap-3 border-b border-cc-border-subtle px-4 py-3">
          <Search
            aria-hidden="true"
            className={
              inputFocused
                ? 'h-[18px] w-[18px] shrink-0 text-cc-accent'
                : 'h-[18px] w-[18px] shrink-0 text-cc-text-muted'
            }
          />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-activedescendant={activeRow?.id}
            aria-autocomplete="list"
            aria-label="Search customers, policies, or run a command"
            value={query}
            placeholder="Search customers, policies, or run a command"
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            spellCheck={false}
            autoComplete="off"
            // No focus:outline-none: the global :focus-visible rule (index.css)
            // paints the required lime focus ring on the input.
            className="min-w-0 flex-1 bg-transparent text-sm text-cc-text-primary caret-cc-accent placeholder:text-cc-text-muted"
          />
          <kbd className="shrink-0 rounded-cc-sm bg-cc-surface-overlay px-1.5 py-0.5 text-label font-medium text-cc-text-faint">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
          {flatRows.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-cc-text-muted">
              {query.trim().length >= 2 && recordsLoading ? 'Searching' : 'No results'}
            </div>
          ) : (
            <div role="listbox" id={listboxId} aria-label="Command palette results">
              {sections.map((section) => (
                <div key={section.key} className="mb-1 last:mb-0">
                  <div
                    className="px-2 pb-1 pt-2 text-label font-medium uppercase tracking-label text-cc-text-muted"
                    aria-hidden="true"
                  >
                    {section.label}
                  </div>
                  {section.rows.map((row) => {
                    const flatIndex = flatRows.indexOf(row);
                    const isSelected = flatIndex === selected;
                    const Icon = row.icon;
                    return (
                      <AccentSpine
                        key={row.id}
                        id={row.id}
                        role="option"
                        active={isSelected}
                        aria-selected={isSelected}
                        onMouseMove={() => setSelected(flatIndex)}
                        onClick={row.run}
                        className={
                          isSelected
                            ? 'flex cursor-pointer items-center gap-3 border-transparent !bg-cc-surface-overlay px-3 py-2 text-cc-text-primary'
                            : 'flex cursor-pointer items-center gap-3 border-transparent !bg-transparent px-3 py-2 text-cc-text-secondary hover:!bg-cc-surface-overlay'
                        }
                      >
                        <Icon
                          aria-hidden="true"
                          className={
                            isSelected
                              ? 'h-[18px] w-[18px] shrink-0 text-cc-text-primary'
                              : 'h-[18px] w-[18px] shrink-0 text-cc-text-muted'
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="cc-num block truncate text-sm">{row.label}</span>
                          {row.subtitle && (
                            <span className="block truncate text-xs text-cc-text-muted">{row.subtitle}</span>
                          )}
                        </span>
                        {isSelected && (
                          <CornerDownLeft
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0 text-cc-text-muted"
                          />
                        )}
                      </AccentSpine>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

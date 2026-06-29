import { createContext, useContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { RAIL_GROUPS } from './navConfig';

/**
 * Shared state for the global chrome (rail + header + command palette).
 * railCollapsed and expandedSections persist to localStorage. The provider also
 * registers the global Cmd/Ctrl+K listener that opens the command palette.
 */
interface ChromeState {
  railCollapsed: boolean;
  toggleRail: () => void;
  expandedSections: Record<string, boolean>;
  toggleSection: (key: string) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
}

const ChromeCtx = createContext<ChromeState | null>(null);

const RAIL_KEY = 'cc-rail-collapsed';
const SECTIONS_KEY = 'cc-rail-sections';

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function readSections(): Record<string, boolean> {
  const base: Record<string, boolean> = {};
  for (const g of RAIL_GROUPS) base[g.key] = g.defaultOpen;
  try {
    const raw = localStorage.getItem(SECTIONS_KEY);
    if (raw) Object.assign(base, JSON.parse(raw) as Record<string, boolean>);
  } catch {
    /* ignore */
  }
  return base;
}

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [railCollapsed, setRailCollapsed] = useState(() => readBool(RAIL_KEY, false));
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => readSections());
  const [paletteOpen, setPaletteOpen] = useState(false);

  const toggleRail = useCallback(() => {
    setRailCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(RAIL_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const toggleSection = useCallback((key: string) => {
    setExpandedSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Global Cmd/Ctrl+K opens the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value = useMemo<ChromeState>(
    () => ({ railCollapsed, toggleRail, expandedSections, toggleSection, paletteOpen, setPaletteOpen }),
    [railCollapsed, toggleRail, expandedSections, toggleSection, paletteOpen],
  );

  return <ChromeCtx.Provider value={value}>{children}</ChromeCtx.Provider>;
}

export function useChrome(): ChromeState {
  const ctx = useContext(ChromeCtx);
  if (!ctx) throw new Error('useChrome must be used within ChromeProvider');
  return ctx;
}

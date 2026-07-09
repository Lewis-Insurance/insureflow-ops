import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';

// A per-user, browser-local list of the customers this user most recently
// opened, newest first. It powers the "Recently opened" group pinned to the top
// of the Customers list so the person you just worked stays one click away when
// you come back to the page. Browser-local by design (no server round-trip); it
// remembers on this device only. Keyed by user id so a shared browser never
// mixes two people's recents.

export interface RecentCustomer {
  id: string;
  name: string;
  type?: string; // account type value (household / commercial_business)
  status?: string;
  email?: string;
  city?: string;
  state?: string;
  policies_count?: number;
  next_expiration_at?: string | null;
  openedAt: string; // ISO timestamp of the most recent open
}

const MAX_ITEMS = 8;
const keyFor = (userId?: string | null) => `customers_recent_v1:${userId ?? 'anon'}`;

function read(storageKey: string): RecentCustomer[] {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useRecentCustomers() {
  const { user } = useAuth();
  const storageKey = keyFor(user?.id);
  const [recent, setRecent] = useState<RecentCustomer[]>([]);

  // Load (and reload when the signed-in user changes).
  useEffect(() => {
    setRecent(read(storageKey));
  }, [storageKey]);

  const recordOpen = useCallback(
    (c: Omit<RecentCustomer, 'openedAt'>) => {
      if (!c?.id) return;
      setRecent((prev) => {
        const prior = prev.find((r) => r.id === c.id);
        // Merge with any prior snapshot so a thinner open (e.g. via Cmd-K, which
        // knows the name but not the policy count) never wipes richer fields
        // captured when the row was opened from the full list.
        const merged: RecentCustomer = {
          id: c.id,
          name: c.name ?? prior?.name ?? '',
          type: c.type ?? prior?.type,
          status: c.status ?? prior?.status,
          email: c.email ?? prior?.email,
          city: c.city ?? prior?.city,
          state: c.state ?? prior?.state,
          policies_count: c.policies_count ?? prior?.policies_count,
          next_expiration_at: c.next_expiration_at ?? prior?.next_expiration_at,
          openedAt: new Date().toISOString(),
        };
        const next = [merged, ...prev.filter((r) => r.id !== c.id)].slice(0, MAX_ITEMS);
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Ignore quota / private-mode failures; the in-memory list still updates.
        }
        return next;
      });
    },
    [storageKey],
  );

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setRecent([]);
  }, [storageKey]);

  return { recent, recordOpen, clear };
}

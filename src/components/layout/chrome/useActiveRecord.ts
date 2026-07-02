import { useLocation } from 'react-router-dom';

/**
 * Derives the record the chrome is currently showing from the route, so the
 * header and command palette can offer context-aware actions ("Log contact for
 * {record}") that target it. Chrome-only: it reads the URL, never the page.
 */
export type RecordEntity = 'customer' | 'policy' | 'lead';

export interface ActiveRecord {
  entity: RecordEntity;
  id: string;
}

const ENTITY_BY_SEGMENT: Record<string, RecordEntity> = {
  customers: 'customer',
  policies: 'policy',
  leads: 'lead',
};

export function useActiveRecord(): ActiveRecord | null {
  const { pathname } = useLocation();
  // /customers/<uuid>, /policies/<uuid>, /leads/<uuid> (any trailing segment ok)
  const m = pathname.match(/^\/(customers|policies|leads)\/([0-9a-fA-F-]{36})(?:\/|$)/);
  if (!m) return null;
  const entity = ENTITY_BY_SEGMENT[m[1]];
  if (!entity) return null;
  return { entity, id: m[2] };
}

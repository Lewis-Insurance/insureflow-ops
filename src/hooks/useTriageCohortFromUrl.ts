import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Parse scope=mine from the URL; returns undefined for any other value. */
export function parseScopeFromUrl(value: string | null): 'mine' | undefined {
  return value === 'mine' ? 'mine' : undefined;
}

/** Parse a cohort query param against an allowlist; fall back to defaultCohort. */
export function parseCohortFromUrl<T extends string>(
  value: string | null,
  validCohorts: readonly T[],
  defaultCohort: T,
): T {
  if (value && (validCohorts as readonly string[]).includes(value)) {
    return value as T;
  }
  return defaultCohort;
}

/**
 * Read `?cohort=` from the URL on mount and expose local cohort state.
 * setCohort updates state only; URL sync is not required.
 */
export function useTriageCohortFromUrl<T extends string>(
  validCohorts: readonly T[],
  defaultCohort: T = 'all' as T,
): [T, (c: T) => void] {
  const [searchParams] = useSearchParams();
  const [cohort, setCohort] = useState<T>(() =>
    parseCohortFromUrl(searchParams.get('cohort'), validCohorts, defaultCohort),
  );
  return [cohort, setCohort];
}

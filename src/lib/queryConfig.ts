/**
 * React Query Configuration
 *
 * Centralized cache time configuration for consistent data freshness
 */

/**
 * Cache time tiers for different data types
 */
export const CACHE_TIMES = {
  /** 30 seconds - for frequently changing data like real-time updates */
  realtime: 30 * 1000,

  /** 2 minutes - for moderately dynamic data like lists */
  short: 2 * 60 * 1000,

  /** 5 minutes - standard cache time for most data */
  standard: 5 * 60 * 1000,

  /** 15 minutes - for less frequently updated data */
  medium: 15 * 60 * 1000,

  /** 30 minutes - for rarely changing reference data */
  long: 30 * 60 * 1000,

  /** 1 hour - for static configuration data */
  static: 60 * 60 * 1000,
} as const;

/**
 * Garbage collection times (when cached data is removed from memory)
 */
export const GC_TIMES = {
  /** 5 minutes after becoming stale */
  short: 5 * 60 * 1000,

  /** 30 minutes after becoming stale */
  standard: 30 * 60 * 1000,

  /** 1 hour after becoming stale */
  long: 60 * 60 * 1000,
} as const;

/**
 * Common query options presets
 */
export const QUERY_OPTIONS = {
  /** Real-time data - refresh often, short cache */
  realtime: {
    staleTime: CACHE_TIMES.realtime,
    gcTime: GC_TIMES.short,
    refetchOnWindowFocus: true,
  },

  /** Standard data - balanced caching */
  standard: {
    staleTime: CACHE_TIMES.standard,
    gcTime: GC_TIMES.standard,
    refetchOnWindowFocus: false,
  },

  /** Reference data - rarely changes */
  reference: {
    staleTime: CACHE_TIMES.long,
    gcTime: GC_TIMES.long,
    refetchOnWindowFocus: false,
  },

  /** Static data - configuration, dropdowns, etc */
  static: {
    staleTime: CACHE_TIMES.static,
    gcTime: GC_TIMES.long,
    refetchOnWindowFocus: false,
  },
} as const;

export type CacheTimeKey = keyof typeof CACHE_TIMES;
export type QueryOptionsKey = keyof typeof QUERY_OPTIONS;

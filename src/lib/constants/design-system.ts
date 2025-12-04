/**
 * Design System Constants
 *
 * Centralized color schemes, status variants, and design tokens
 * for consistent UI across the application.
 */

import { type BadgeProps } from '@/components/ui/badge';

// =============================================================================
// Lead Score Colors
// =============================================================================

export const LEAD_SCORE_COLORS = {
  EXCELLENT: {
    min: 80,
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-300',
    badge: 'default' as const,
    label: 'Excellent',
    icon: '🌟',
  },
  GOOD: {
    min: 60,
    max: 79,
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-300',
    badge: 'secondary' as const,
    label: 'Good',
    icon: '👍',
  },
  FAIR: {
    min: 40,
    max: 59,
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-300',
    badge: 'outline' as const,
    label: 'Fair',
    icon: '⚠️',
  },
  POOR: {
    min: 0,
    max: 39,
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-300',
    badge: 'destructive' as const,
    label: 'Poor',
    icon: '❌',
  },
} as const;

/**
 * Get lead score tier based on score value
 */
export function getLeadScoreTier(score: number) {
  if (score >= LEAD_SCORE_COLORS.EXCELLENT.min) return LEAD_SCORE_COLORS.EXCELLENT;
  if (score >= LEAD_SCORE_COLORS.GOOD.min) return LEAD_SCORE_COLORS.GOOD;
  if (score >= LEAD_SCORE_COLORS.FAIR.min) return LEAD_SCORE_COLORS.FAIR;
  return LEAD_SCORE_COLORS.POOR;
}

// =============================================================================
// Status Colors & Variants
// =============================================================================

export const STATUS_VARIANTS = {
  // General statuses
  ACTIVE: {
    badge: 'default' as const,
    bg: 'bg-green-100',
    text: 'text-green-800',
    label: 'Active',
  },
  INACTIVE: {
    badge: 'secondary' as const,
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    label: 'Inactive',
  },
  PENDING: {
    badge: 'outline' as const,
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    label: 'Pending',
  },
  COMPLETED: {
    badge: 'default' as const,
    bg: 'bg-green-100',
    text: 'text-green-800',
    label: 'Completed',
  },
  CANCELLED: {
    badge: 'destructive' as const,
    bg: 'bg-red-100',
    text: 'text-red-800',
    label: 'Cancelled',
  },
  EXPIRED: {
    badge: 'secondary' as const,
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    label: 'Expired',
  },
} as const;

// Quote-specific statuses
export const QUOTE_STATUS_VARIANTS = {
  OPEN: {
    badge: 'default' as const,
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    label: 'Open',
  },
  WON: {
    badge: 'default' as const,
    bg: 'bg-green-100',
    text: 'text-green-800',
    label: 'Won',
  },
  LOST: {
    badge: 'destructive' as const,
    bg: 'bg-red-100',
    text: 'text-red-800',
    label: 'Lost',
  },
  EXPIRED: {
    badge: 'secondary' as const,
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    label: 'Expired',
  },
} as const;

// Task/Issue priority variants
export const PRIORITY_VARIANTS = {
  URGENT: {
    badge: 'destructive' as const,
    bg: 'bg-red-100',
    text: 'text-red-800',
    icon: '🔴',
    label: 'Urgent',
  },
  HIGH: {
    badge: 'default' as const,
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    icon: '🟠',
    label: 'High',
  },
  MEDIUM: {
    badge: 'secondary' as const,
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    icon: '🟡',
    label: 'Medium',
  },
  LOW: {
    badge: 'outline' as const,
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    icon: '🔵',
    label: 'Low',
  },
} as const;

// Severity variants (for issues, risks)
export const SEVERITY_VARIANTS = {
  CRITICAL: {
    badge: 'destructive' as const,
    bg: 'bg-red-100',
    text: 'text-red-800',
    icon: '🚨',
    label: 'Critical',
  },
  HIGH: {
    badge: 'default' as const,
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    icon: '⚠️',
    label: 'High',
  },
  MEDIUM: {
    badge: 'secondary' as const,
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    icon: '⚡',
    label: 'Medium',
  },
  LOW: {
    badge: 'outline' as const,
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    icon: 'ℹ️',
    label: 'Low',
  },
} as const;

// Risk level variants (for churn, renewals)
export const RISK_LEVEL_VARIANTS = {
  CRITICAL: {
    badge: 'destructive' as const,
    bg: 'bg-red-100',
    text: 'text-red-800',
    icon: '🔥',
    label: 'Critical Risk',
  },
  HIGH: {
    badge: 'default' as const,
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    icon: '⚠️',
    label: 'High Risk',
  },
  MEDIUM: {
    badge: 'secondary' as const,
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    icon: '⚡',
    label: 'Medium Risk',
  },
  LOW: {
    badge: 'outline' as const,
    bg: 'bg-green-100',
    text: 'text-green-800',
    icon: '✅',
    label: 'Low Risk',
  },
  VERY_LOW: {
    badge: 'outline' as const,
    bg: 'bg-green-50',
    text: 'text-green-600',
    icon: '🟢',
    label: 'Very Low Risk',
  },
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get badge variant for a status string
 */
export function getStatusBadgeVariant(status: string): BadgeProps['variant'] {
  const statusUpper = status.toUpperCase();

  // Check quote statuses first
  if (statusUpper in QUOTE_STATUS_VARIANTS) {
    return QUOTE_STATUS_VARIANTS[statusUpper as keyof typeof QUOTE_STATUS_VARIANTS].badge;
  }

  // Check general statuses
  if (statusUpper in STATUS_VARIANTS) {
    return STATUS_VARIANTS[statusUpper as keyof typeof STATUS_VARIANTS].badge;
  }

  // Default
  return 'outline';
}

/**
 * Get priority badge variant
 */
export function getPriorityBadgeVariant(priority: string): BadgeProps['variant'] {
  const priorityUpper = priority.toUpperCase();

  if (priorityUpper in PRIORITY_VARIANTS) {
    return PRIORITY_VARIANTS[priorityUpper as keyof typeof PRIORITY_VARIANTS].badge;
  }

  return 'outline';
}

/**
 * Get severity badge variant
 */
export function getSeverityBadgeVariant(severity: string): BadgeProps['variant'] {
  const severityUpper = severity.toUpperCase();

  if (severityUpper in SEVERITY_VARIANTS) {
    return SEVERITY_VARIANTS[severityUpper as keyof typeof SEVERITY_VARIANTS].badge;
  }

  return 'outline';
}

/**
 * Get risk level badge variant
 */
export function getRiskLevelBadgeVariant(riskLevel: string): BadgeProps['variant'] {
  const riskUpper = riskLevel.toUpperCase().replace(/_/g, '_');

  if (riskUpper in RISK_LEVEL_VARIANTS) {
    return RISK_LEVEL_VARIANTS[riskUpper as keyof typeof RISK_LEVEL_VARIANTS].badge;
  }

  return 'outline';
}

// =============================================================================
// Alert Types
// =============================================================================

export const ALERT_TYPES = {
  SUCCESS: {
    variant: 'default' as const,
    icon: '✅',
    title: 'Success',
  },
  ERROR: {
    variant: 'destructive' as const,
    icon: '❌',
    title: 'Error',
  },
  WARNING: {
    variant: 'default' as const,
    icon: '⚠️',
    title: 'Warning',
  },
  INFO: {
    variant: 'default' as const,
    icon: 'ℹ️',
    title: 'Info',
  },
} as const;

// =============================================================================
// Typography Scale
// =============================================================================

export const TYPOGRAPHY = {
  // Headings
  H1: 'text-4xl font-bold tracking-tight',
  H2: 'text-3xl font-bold tracking-tight',
  H3: 'text-2xl font-semibold tracking-tight',
  H4: 'text-xl font-semibold',
  H5: 'text-lg font-semibold',
  H6: 'text-base font-semibold',

  // Body text
  BODY_LARGE: 'text-base',
  BODY: 'text-sm',
  BODY_SMALL: 'text-xs',

  // Special
  CAPTION: 'text-xs text-muted-foreground',
  LABEL: 'text-sm font-medium',
  CODE: 'font-mono text-sm',
} as const;

// =============================================================================
// Spacing Scale
// =============================================================================

export const SPACING = {
  XS: '0.5rem',   // 8px
  SM: '0.75rem',  // 12px
  MD: '1rem',     // 16px
  LG: '1.5rem',   // 24px
  XL: '2rem',     // 32px
  XXL: '3rem',    // 48px
} as const;

// =============================================================================
// Border Radius
// =============================================================================

export const RADIUS = {
  SM: '0.25rem',  // 4px
  MD: '0.5rem',   // 8px
  LG: '0.75rem',  // 12px
  FULL: '9999px', // Full rounded
} as const;

// =============================================================================
// Animation Durations
// =============================================================================

export const DURATION = {
  FAST: '150ms',
  NORMAL: '300ms',
  SLOW: '500ms',
} as const;

// =============================================================================
// Breakpoints (matches Tailwind defaults)
// =============================================================================

export const BREAKPOINTS = {
  SM: '640px',
  MD: '768px',
  LG: '1024px',
  XL: '1280px',
  XXL: '1536px',
} as const;

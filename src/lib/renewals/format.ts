/** Shared display formatters for the renewals surfaces (tabular figures via .cc-num at call sites). */

import { extractLocalDate, parseLocalDate } from '@/lib/date/localDate';

export function formatMoney(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '--';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatShortDate(d: string | null | undefined): string {
  if (!d) return '--';
  // Date-only strings must parse as local dates: new Date('YYYY-MM-DD') is UTC
  // midnight and displays the PREVIOUS day in US timezones.
  return parseLocalDate(extractLocalDate(d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Shared display formatters for the renewals surfaces (tabular figures via .cc-num at call sites). */

export function formatMoney(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '--';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatShortDate(d: string | null | undefined): string {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

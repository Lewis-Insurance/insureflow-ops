/**
 * Display status values (derived from DB status + cancelled_at)
 * These are for UI display only - never stored in DB
 */
export type PolicyDisplayStatus = 'active' | 'scheduled_cancellation' | 'cancelled' | 'expired' | 'pending';

/**
 * DB status values (what's actually stored in the policies table)
 */
export type PolicyDBStatus = 'active' | 'cancelled' | 'expired' | 'pending';

/**
 * Policy with cancellation fields
 */
export interface PolicyWithCancellation {
  status: string | null;
  cancelled_at?: string | Date | null;
  expiration_date?: string | Date | null;
}

/**
 * Derive the display status from policy data
 *
 * This function determines what status to show in the UI based on:
 * - The stored status
 * - The cancelled_at date (if set)
 * - The expiration_date (optional)
 *
 * IMPORTANT: The returned 'scheduled_cancellation' value should NEVER be stored in DB.
 * It's a derived UI-only state.
 *
 * @param policy - Policy object with status and optional cancelled_at
 * @returns The display status to show in UI
 *
 * @example
 * // Active policy
 * getPolicyDisplayStatus({ status: 'active' }) // => 'active'
 *
 * // Scheduled for future cancellation (still active)
 * getPolicyDisplayStatus({
 *   status: 'active',
 *   cancelled_at: '2026-03-01' // future date
 * }) // => 'scheduled_cancellation'
 *
 * // Already cancelled
 * getPolicyDisplayStatus({
 *   status: 'cancelled',
 *   cancelled_at: '2026-01-01' // past date
 * }) // => 'cancelled'
 */
export function getPolicyDisplayStatus(policy: PolicyWithCancellation): PolicyDisplayStatus {
  if (!policy.status) {
    return 'pending';
  }

  // Check for scheduled cancellation
  if (policy.cancelled_at) {
    const cancelDate = new Date(policy.cancelled_at);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    if (cancelDate > today) {
      // Future cancellation date - policy is still active but scheduled
      return 'scheduled_cancellation';
    } else {
      // Past or today - policy is cancelled
      return 'cancelled';
    }
  }

  // No cancellation scheduled - return stored status
  return policy.status as PolicyDisplayStatus;
}

/**
 * Get the display label for a policy status
 */
export function getPolicyStatusLabel(status: PolicyDisplayStatus): string {
  const labels: Record<PolicyDisplayStatus, string> = {
    active: 'Active',
    scheduled_cancellation: 'Scheduled Cancellation',
    cancelled: 'Cancelled',
    expired: 'Expired',
    pending: 'Pending',
  };
  return labels[status] || status;
}

/**
 * Get the badge variant/color for a policy status
 */
export function getPolicyStatusVariant(status: PolicyDisplayStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'active':
      return 'default';
    case 'scheduled_cancellation':
      return 'secondary';
    case 'cancelled':
    case 'expired':
      return 'destructive';
    case 'pending':
    default:
      return 'outline';
  }
}

/**
 * Check if a policy is effectively active (not cancelled, not expired)
 * Includes policies scheduled for future cancellation
 */
export function isPolicyActive(policy: PolicyWithCancellation): boolean {
  const displayStatus = getPolicyDisplayStatus(policy);
  return displayStatus === 'active' || displayStatus === 'scheduled_cancellation';
}

/**
 * Format the cancellation message for display
 */
export function formatCancellationMessage(policy: PolicyWithCancellation): string | null {
  if (!policy.cancelled_at) return null;

  const cancelDate = new Date(policy.cancelled_at);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (cancelDate > today) {
    // Future cancellation
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    return `Scheduled to cancel on ${cancelDate.toLocaleDateString('en-US', options)}`;
  } else {
    // Already cancelled
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    return `Cancelled on ${cancelDate.toLocaleDateString('en-US', options)}`;
  }
}

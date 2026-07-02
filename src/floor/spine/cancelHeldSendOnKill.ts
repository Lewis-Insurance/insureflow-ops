/** Approval statuses that must flip to killed when the work request is killed during hold. */
export const KILLABLE_SEND_APPROVAL_STATUSES = ['approved', 'held'] as const;

export type KillableSendApprovalStatus = (typeof KILLABLE_SEND_APPROVAL_STATUSES)[number];

export function isKillableSendApprovalStatus(status: string): status is KillableSendApprovalStatus {
  return (KILLABLE_SEND_APPROVAL_STATUSES as readonly string[]).includes(status);
}

/** Returns true when a held send should be cancelled (no provider release). */
export function shouldSkipReleaseForApprovalStatus(status: string): boolean {
  return status === 'killed';
}

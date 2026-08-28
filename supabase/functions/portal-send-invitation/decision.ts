export type PortalInviteDecision =
  | 'create_new'
  | 'expand_pending'
  | 'expand_active'
  | 'reject_disabled'
  | 'reject_foreign'
  | 'reject_home_missing';

export interface PortalUserCandidate {
  id: string;
  account_id: string;
  email: string;
  portal_status: string;
}

export interface InvitationCandidate {
  id: string;
  account_id: string;
  email: string;
  portal_user_id: string | null;
  scope_account_ids: string[] | null;
  status: string | null;
}

interface DecisionInput {
  email: string;
  homeAccountId: string;
  homeIncluded: boolean;
  requestMalformed?: boolean;
  hasForeignAccount: boolean;
  portalLookupFailed: boolean;
  invitationLookupFailed: boolean;
  portalUsers: PortalUserCandidate[];
  invitations: InvitationCandidate[];
}

export interface PortalInviteResolution {
  decision: PortalInviteDecision;
  portalUser?: PortalUserCandidate;
  invitation?: InvitationCandidate;
}

const normalized = (email: string) => email.trim().toLowerCase();
const reject = (): PortalInviteResolution => ({ decision: 'reject_foreign' });

export function decidePortalInvitation(input: DecisionInput): PortalInviteResolution {
  if (!input.homeIncluded || input.requestMalformed) return { decision: 'reject_home_missing' };
  if (input.hasForeignAccount || input.portalLookupFailed || input.invitationLookupFailed) {
    return reject();
  }

  const email = normalized(input.email);
  const users = input.portalUsers.filter((candidate) => normalized(candidate.email) === email);
  const invitations = input.invitations.filter((candidate) => normalized(candidate.email) === email);
  if (users.length > 1) return reject();

  const portalUser = users[0];
  if (!portalUser) {
    return invitations.length === 0 ? { decision: 'create_new' } : reject();
  }
  if (!portalUser.id || !portalUser.account_id) return reject();
  if (portalUser.portal_status === 'disabled') return { decision: 'reject_disabled', portalUser };
  if (portalUser.portal_status === 'active') return { decision: 'expand_active', portalUser };
  if (portalUser.portal_status !== 'invited') return reject();

  const linked = invitations.filter((candidate) => candidate.portal_user_id === portalUser.id);
  if (linked.length > 1) return reject();
  if (linked.length === 1) {
    return { decision: 'expand_pending', portalUser, invitation: linked[0] };
  }

  const legacy = invitations.filter(
    (candidate) =>
      candidate.portal_user_id === null &&
      candidate.account_id === portalUser.account_id &&
      ['pending', 'sent'].includes(candidate.status ?? ''),
  );
  if (legacy.length === 1 && invitations.length === 1) {
    return { decision: 'expand_pending', portalUser, invitation: legacy[0] };
  }
  if (invitations.length > 0) return reject();
  return { decision: 'expand_pending', portalUser };
}

import { describe, expect, it } from 'vitest';
import { decidePortalInvitation } from '../../../supabase/functions/portal-send-invitation/decision';

const user = { id: 'cpu-1', account_id: 'home-1', email: 'Portal.User@Example.Test', portal_status: 'invited' };
const invitation = {
  id: 'invite-1', account_id: 'home-1', email: 'portal.user@example.test', portal_user_id: 'cpu-1',
  scope_account_ids: ['home-1'], status: 'sent',
};
const valid = {
  email: ' portal.user@example.test ', homeAccountId: 'home-1', homeIncluded: true,
  hasForeignAccount: false, portalLookupFailed: false, invitationLookupFailed: false,
  portalUsers: [] as typeof user[], invitations: [] as typeof invitation[],
};

describe('decidePortalInvitation', () => {
  it('creates only when normalized email has no CPU or invitation candidates', () => {
    expect(decidePortalInvitation(valid).decision).toBe('create_new');
    expect(decidePortalInvitation({ ...valid, invitations: [invitation] }).decision).toBe('reject_foreign');
  });

  it('normalizes email and resolves one linked pending invitation by portal user id', () => {
    expect(decidePortalInvitation({ ...valid, portalUsers: [user], invitations: [invitation] })).toEqual({
      decision: 'expand_pending', portalUser: user, invitation,
    });
  });

  it('uses only an unlinked pending legacy invitation on the original CPU home', () => {
    const legacy = { ...invitation, portal_user_id: null };
    expect(decidePortalInvitation({ ...valid, portalUsers: [user], invitations: [legacy] }).invitation).toBe(legacy);
    expect(decidePortalInvitation({
      ...valid, portalUsers: [user], invitations: [{ ...legacy, account_id: 'other-home' }],
    }).decision).toBe('reject_foreign');
  });

  it('fails closed on duplicate CPU or invitation candidates and lookup errors', () => {
    expect(decidePortalInvitation({ ...valid, portalUsers: [user, { ...user, id: 'cpu-2' }] }).decision).toBe('reject_foreign');
    expect(decidePortalInvitation({
      ...valid, portalUsers: [user], invitations: [invitation, { ...invitation, id: 'invite-2' }],
    }).decision).toBe('reject_foreign');
    expect(decidePortalInvitation({ ...valid, portalLookupFailed: true }).decision).toBe('reject_foreign');
    expect(decidePortalInvitation({ ...valid, invitationLookupFailed: true }).decision).toBe('reject_foreign');
  });

  it.each([['active', 'expand_active'], ['disabled', 'reject_disabled'], ['unknown', 'reject_foreign']])(
    'maps CPU status %s to %s',
    (portal_status, decision) => {
      expect(decidePortalInvitation({ ...valid, portalUsers: [{ ...user, portal_status }] }).decision).toBe(decision);
    },
  );

  it('rejects foreign, missing-home, and malformed scope before resolution', () => {
    expect(decidePortalInvitation({ ...valid, hasForeignAccount: true }).decision).toBe('reject_foreign');
    expect(decidePortalInvitation({ ...valid, homeIncluded: false }).decision).toBe('reject_home_missing');
    expect(decidePortalInvitation({ ...valid, requestMalformed: true }).decision).toBe('reject_home_missing');
  });
});

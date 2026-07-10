/**
 * Auto-Owners personal-auto renewals are worked end to end in the dedicated AO
 * Renewals migration queue (/ao-renewals) through January 30, 2027. Because every
 * active policy also auto-syncs into the general renewals book, those same
 * policies would otherwise appear a second time on /renewals. Until the migration
 * ends we hide Auto-Owners personal-auto renewals from /renewals; from February
 * 2027 onward they flow back into the normal worklist automatically.
 *
 * The rule is attribute-based (not a fixed list of ids) so renewals that sync in
 * later are hidden too, and it self-expires on the cutover date with no code
 * change or scheduled job.
 */
import { humanizeAccountType, humanizeCarrier } from '@/lib/format';
import { normalizePolicyType } from '@/lib/policyTypes';

/**
 * Auto-Owners personal-auto renewals reappear on /renewals from this instant on.
 * Midnight Eastern on Feb 1, 2027 (the day after the Jan 30, 2027 migration
 * deadline). Before it, matching renewals are hidden; on or after it the rule is
 * inert and nothing is hidden.
 */
export const AO_PERSONAL_AUTO_SHOW_FROM = new Date('2027-02-01T05:00:00Z');

/** Minimal shape needed to classify a renewal; the Renewal type structurally satisfies it. */
type RenewalLike = {
  carrier?: string | null;
  policy_type?: string | null;
  account?: { type?: string | null } | null;
};

/**
 * True when the renewal is an Auto-Owners personal auto policy: carrier
 * Auto-Owners (not the Southern-Owners subsidiary), the personal auto line (not
 * commercial auto), on a Personal (individual / household) account.
 */
export function isAutoOwnersPersonalAuto(r: RenewalLike): boolean {
  return (
    humanizeCarrier(r.carrier) === 'Auto-Owners' &&
    normalizePolicyType(r.policy_type) === 'auto' &&
    humanizeAccountType(r.account?.type) === 'Personal'
  );
}

/**
 * True when the renewal should be hidden from the general /renewals surface
 * because it belongs to the active Auto-Owners personal-auto migration window.
 */
export function isHiddenByAoMigration(r: RenewalLike, now: Date = new Date()): boolean {
  return now < AO_PERSONAL_AUTO_SHOW_FROM && isAutoOwnersPersonalAuto(r);
}

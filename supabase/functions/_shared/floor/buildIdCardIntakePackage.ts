import { assertInForceForTier3Send } from './coverageDiff.ts';
import { pickInForceAutoPolicy } from './pickInForceAutoPolicy.ts';
import {
  ID_CARD_PLAY_ID,
  ID_CARD_PLAY_VERSION,
  resolveIdCardIntakePackage,
  type ResolvedIdCardIntakePackage,
} from './plays/idCardIssueInbound.ts';
import {
  resolveIdCardAssetForPolicy,
  type ResolveIdCardAssetDb,
} from './resolveIdCardAsset.ts';
import type { PolicyInForceRow } from './types.ts';

export interface BuildIdCardIntakePackageDb extends ResolveIdCardAssetDb {
  loadAccount(accountId: string, agencyWorkspaceId: string): Promise<{ id: string; name: string | null } | null>;
  loadPoliciesInForce(accountId: string, agencyWorkspaceId: string): Promise<PolicyInForceRow[]>;
}

export interface BuildIdCardIntakePackageArgs {
  agencyWorkspaceId: string;
  accountId: string;
  allowlistRaw: string | undefined | null;
  preferredPolicyId?: string | null;
  playId?: string;
  playVersion?: string;
}

export type BuildIdCardIntakePackageResult =
  | { ok: true; tier3: true; package: ResolvedIdCardIntakePackage['row'] }
  | { ok: true; tier3: false; reason: 'allowlist_empty' }
  | { ok: false; error: 'account_not_found' | 'no_in_force_auto_policy' | 'asset_unavailable'; message: string };

export async function buildIdCardIntakePackage(
  args: BuildIdCardIntakePackageArgs,
  db: BuildIdCardIntakePackageDb,
): Promise<BuildIdCardIntakePackageResult> {
  const account = await db.loadAccount(args.accountId, args.agencyWorkspaceId);
  if (!account) {
    return { ok: false, error: 'account_not_found', message: 'Account not found in workspace.' };
  }

  const policies = await db.loadPoliciesInForce(args.accountId, args.agencyWorkspaceId);
  const policy = pickInForceAutoPolicy(policies, args.preferredPolicyId);
  if (!policy) {
    return {
      ok: false,
      error: 'no_in_force_auto_policy',
      message: 'No in-force auto policy found for this account.',
    };
  }

  try {
    assertInForceForTier3Send(policy.in_force, policy.policy_id);
  } catch (error) {
    return {
      ok: false,
      error: 'no_in_force_auto_policy',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  let asset;
  try {
    asset = await resolveIdCardAssetForPolicy(
      {
        accountId: args.accountId,
        policyId: policy.policy_id,
        policyNumber: policy.policy_number,
        carrier: policy.carrier ?? null,
        effectiveDate: policy.effective_date ?? null,
        expirationDate: policy.expiration_date ?? null,
      },
      db,
    );
  } catch (error) {
    return {
      ok: false,
      error: 'asset_unavailable',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const resolved = resolveIdCardIntakePackage({
    playId: args.playId ?? ID_CARD_PLAY_ID,
    playVersion: args.playVersion ?? ID_CARD_PLAY_VERSION,
    clientAccountId: args.accountId,
    accountName: account.name?.trim() || 'Insured',
    policyNumber: policy.policy_number,
    idCardUrl: asset.signedUrl,
    documentRef: {
      label: asset.label,
      signedUrl: asset.signedUrl,
    },
    allowlistRaw: args.allowlistRaw,
  });

  if (!resolved) {
    return { ok: true, tier3: false, reason: 'allowlist_empty' };
  }

  return { ok: true, tier3: true, package: resolved.row };
}

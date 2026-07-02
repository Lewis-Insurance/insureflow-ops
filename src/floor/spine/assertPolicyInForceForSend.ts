import { FloorAuthorizationError } from './types.ts';

export interface PolicyInForceDb {
  findPolicyInForceByNumber(policyNumber: string): Promise<{ in_force: boolean } | null>;
}

/** Blocks Tier-3 ID card sends when policy is not in force. */
export async function assertPolicyInForceForSend(
  db: PolicyInForceDb,
  policyNumber: string,
): Promise<void> {
  const row = await db.findPolicyInForceByNumber(policyNumber);
  if (!row?.in_force) {
    throw new FloorAuthorizationError(
      `R7: policy ${policyNumber} is not in force; client send blocked`,
    );
  }
}

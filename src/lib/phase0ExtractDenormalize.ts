import type { ExtractSnapshotV1 } from '@/lib/extractSnapshot';

export interface DenormalizedExtractColumns {
  policy_number: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  insured_name: string | null;
}

/**
 * Map ExtractSnapshotV1 scalar fields to document_analysis top-level columns.
 * Used by AO Today rail and list views without parsing analysis_result JSON.
 */
export function denormalizeExtractSnapshotColumns(
  snapshot: ExtractSnapshotV1,
): DenormalizedExtractColumns {
  return {
    policy_number: snapshot.policy_number,
    effective_date: snapshot.effective_date,
    expiration_date: snapshot.expiration_date,
    insured_name: snapshot.insured_name,
  };
}

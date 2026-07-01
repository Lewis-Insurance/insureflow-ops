import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import type { BuildIdCardIntakePackageDb } from './buildIdCardIntakePackage.ts';
import {
  PORTAL_DOCUMENTS_BUCKET,
  type IdCardDocumentCandidate,
  type ResolveIdCardAssetDb,
} from './resolveIdCardAsset.ts';
import type { PolicyInForceRow, PortalIdCardRow } from './types.ts';

function mapPortalIdCardRow(row: Record<string, unknown>): PortalIdCardRow {
  return {
    id: row.id as string,
    account_id: row.account_id as string,
    policy_id: row.policy_id as string,
    card_image_path: (row.card_image_path as string | null) ?? null,
    card_pdf_path: (row.card_pdf_path as string | null) ?? null,
    card_data: (row.card_data as Record<string, unknown>) ?? {},
    data_as_of: row.data_as_of as string,
    source_document_id: (row.source_document_id as string | null) ?? null,
    is_active: row.is_active !== false,
  };
}

function mapPolicyRow(row: Record<string, unknown>): PolicyInForceRow {
  return {
    policy_id: row.policy_id as string,
    account_id: (row.account_id as string | null) ?? null,
    policy_number: row.policy_number as string,
    line_of_business: (row.line_of_business as string | null) ?? null,
    carrier: (row.carrier as string | null) ?? null,
    effective_date: (row.effective_date as string | null) ?? null,
    expiration_date: (row.expiration_date as string | null) ?? null,
    in_force: row.in_force === true,
    premium: (row.premium as number | null) ?? null,
    cgl_details: (row.cgl_details as Record<string, unknown> | null) ?? null,
    bap_details: (row.bap_details as Record<string, unknown> | null) ?? null,
    evaluated_at: row.evaluated_at as string,
  };
}

export function createSupabaseIdCardAssetDb(supabase: SupabaseClient): ResolveIdCardAssetDb {
  return {
    async findActivePortalIdCard(accountId, policyId) {
      const { data, error } = await supabase
        .from('portal_id_cards')
        .select('*')
        .eq('account_id', accountId)
        .eq('policy_id', policyId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapPortalIdCardRow(data as Record<string, unknown>) : null;
    },

    async findIdCardDocument(accountId, policyId) {
      const { data, error } = await supabase
        .from('documents')
        .select('id, storage_bucket, storage_path, file_path, mime_type, name')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .or(`policy_id.eq.${policyId},policy_id.is.null`)
        .or('document_type.ilike.%id_card%,name.ilike.%id%card%')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? (data as IdCardDocumentCandidate) : null;
    },

    async insertPortalIdCard(row) {
      const { data, error } = await supabase
        .from('portal_id_cards')
        .insert(row)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return mapPortalIdCardRow(data as Record<string, unknown>);
    },

    async copyToPortalDocuments(sourceBucket, sourcePath, destPath) {
      const { data: blob, error: downloadError } = await supabase.storage
        .from(sourceBucket)
        .download(sourcePath);
      if (downloadError || !blob) {
        throw new Error(downloadError?.message ?? `Failed to download ${sourceBucket}/${sourcePath}`);
      }

      const bytes = new Uint8Array(await blob.arrayBuffer());
      const { error: uploadError } = await supabase.storage
        .from(PORTAL_DOCUMENTS_BUCKET)
        .upload(destPath, bytes, {
          contentType: blob.type || 'application/pdf',
          upsert: true,
        });
      if (uploadError) throw new Error(uploadError.message);
    },

    async createSignedUrl(path, expiresInSeconds) {
      const { data, error } = await supabase.storage
        .from(PORTAL_DOCUMENTS_BUCKET)
        .createSignedUrl(path, expiresInSeconds);
      if (error || !data?.signedUrl) {
        throw new Error(error?.message ?? 'Failed to create signed URL');
      }
      return data.signedUrl;
    },
  };
}

export function createSupabaseBuildIdCardIntakePackageDb(
  supabase: SupabaseClient,
): BuildIdCardIntakePackageDb {
  const assetDb = createSupabaseIdCardAssetDb(supabase);

  return {
    ...assetDb,

    async loadAccount(accountId, agencyWorkspaceId) {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name')
        .eq('id', accountId)
        .eq('agency_workspace_id', agencyWorkspaceId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { id: data.id as string, name: (data.name as string | null) ?? null } : null;
    },

    async loadPoliciesInForce(accountId, agencyWorkspaceId) {
      const { data, error } = await supabase
        .from('policy_in_force_status')
        .select('*')
        .eq('account_id', accountId)
        .eq('agency_workspace_id', agencyWorkspaceId);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => mapPolicyRow(row as Record<string, unknown>));
    },
  };
}

/** Dev default Play 4 owner — Landen on dev Supabase. Override with FLOOR_PLAY4_OWNER_ID. */
export function resolvePlay4OwnerId(): string {
  const fromEnv = Deno.env.get('FLOOR_PLAY4_OWNER_ID')?.trim();
  if (fromEnv) return fromEnv;
  return '1cbb5371-087f-463a-9d9a-363e14fefd9e';
}

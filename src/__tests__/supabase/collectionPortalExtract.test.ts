import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const documentCollectionPath = resolve(
  import.meta.dirname,
  '../../../supabase/functions/document-collection/index.ts',
);
const phase0ExtractPath = resolve(
  import.meta.dirname,
  '../../../supabase/functions/_shared/phase0Extract.ts',
);
const applyWritebackMigrationPath = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260821150000_apply_extract_writeback_proposal.sql',
);
const persistLinkMigrationPath = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260821140000_persist_extract_account_link.sql',
);

const documentCollectionSource = readFileSync(documentCollectionPath, 'utf8');
const phase0ExtractSource = readFileSync(phase0ExtractPath, 'utf8');
const applyWritebackSql = readFileSync(applyWritebackMigrationPath, 'utf8');
const persistLinkSql = readFileSync(persistLinkMigrationPath, 'utf8');

describe('collection portal extract pipeline', () => {
  it('uses shared runPhase0DocumentExtract for collection uploads', () => {
    expect(documentCollectionSource).toMatch(
      /import\s*\{[^}]*runPhase0DocumentExtract[^}]*\}\s*from\s*['"]\.\.\/_shared\/phase0Extract\.ts['"]/,
    );
    expect(documentCollectionSource).toMatch(/await runPhase0DocumentExtract\(supabase,/);
  });

  it('does not call persist_extract_account_link from collection path', () => {
    expect(documentCollectionSource).not.toMatch(/persist_extract_account_link/);
    expect(persistLinkSql).toMatch(/if not public\.is_staff\(\) then/i);
  });

  it('does not auto-apply write-back from collection path', () => {
    expect(documentCollectionSource).not.toMatch(/apply_extract_writeback_proposal/);
    expect(documentCollectionSource).not.toMatch(/extract_writeback_proposals/);
    expect(applyWritebackSql).toMatch(/if not public\.is_staff\(\) then/i);
    expect(applyWritebackSql).toMatch(
      /revoke all on function public\.apply_extract_writeback_proposal\(uuid\) from anon, public/i,
    );
  });

  it('fixes documents insert to use storage_path and mime_type', () => {
    expect(documentCollectionSource).toMatch(/\.from\('documents'\)[\s\S]*storage_path:\s*filePath/);
    expect(documentCollectionSource).toMatch(/\.from\('documents'\)[\s\S]*mime_type,/);
    expect(documentCollectionSource).toMatch(/\.from\('documents'\)[\s\S]*file_size:\s*fileSizeBytes/);
    expect(documentCollectionSource).toMatch(/\.from\('documents'\)[\s\S]*storage_bucket:\s*'documents'/);
    expect(documentCollectionSource).not.toMatch(/content_type:\s*mime_type/);
  });

  it('throws when document insert fails instead of continuing with null document_id', () => {
    expect(documentCollectionSource).toMatch(
      /Failed to create document record/,
    );
    expect(documentCollectionSource).toMatch(/if \(docError \|\| !document\?\.id\)/);
  });

  it('sets collection_uploads to extracted on success and failed on error', () => {
    expect(documentCollectionSource).toMatch(/processing_status:\s*'extracted'/);
    expect(documentCollectionSource).toMatch(/processing_status:\s*'failed'/);
    expect(documentCollectionSource).toMatch(/processing_error:\s*message/);
  });

  it('pre-sets account_id on Phase 0 extract params from packet', () => {
    expect(documentCollectionSource).toMatch(/accountId,/);
    expect(documentCollectionSource).toMatch(/accountId: requirement\.workspaces\.account_id/);
  });

  it('exposes staff-gated process_collection_upload action', () => {
    expect(documentCollectionSource).toMatch(/action:\s*'process_collection_upload'/);
    expect(documentCollectionSource).toMatch(/case 'process_collection_upload':/);
    expect(documentCollectionSource).toMatch(/Authentication required/);
    expect(documentCollectionSource).toMatch(/analysis_id: result\.analysisId/);
  });

  it('denormalizes snapshot columns in phase0Extract shared module', () => {
    expect(phase0ExtractSource).toMatch(/denormalizeExtractSnapshotColumns/);
    expect(phase0ExtractSource).toMatch(/policy_number: denormalized\.policy_number/);
    expect(phase0ExtractSource).toMatch(/effective_date: denormalized\.effective_date/);
    expect(phase0ExtractSource).toMatch(/expiration_date: denormalized\.expiration_date/);
    expect(phase0ExtractSource).toMatch(/insured_name: denormalized\.insured_name/);
  });
});

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
const sharedProposalPath = resolve(
  import.meta.dirname,
  '../../../supabase/functions/_shared/extractWritebackProposal.ts',
);
const sharedProposalSource = readFileSync(sharedProposalPath, 'utf8');

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
    expect(documentCollectionSource).not.toMatch(/\.update\(\{ status: 'rejected' \}\)/);
    expect(applyWritebackSql).toMatch(/if not public\.is_staff\(\) then/i);
    expect(applyWritebackSql).toMatch(
      /revoke all on function public\.apply_extract_writeback_proposal\(uuid\) from anon, public/i,
    );
  });

  it('ensures pending write-back proposals server-side after Phase 0 success', () => {
    expect(documentCollectionSource).toMatch(
      /import\s*\{[^}]*ensureExtractWritebackProposals[^}]*\}\s*from\s*['"]\.\.\/_shared\/extractWritebackProposal\.ts['"]/,
    );
    expect(documentCollectionSource).toMatch(/await ensureExtractWritebackProposals\(supabase,/);
    expect(documentCollectionSource).toMatch(/snapshot: result\.analysisResult/);

    // Shared module only writes status 'pending' via upsert-ignore, never apply, never supersede.
    expect(sharedProposalSource).toMatch(/status: 'pending' as const/);
    expect(sharedProposalSource).toMatch(/ignoreDuplicates: true/);
    expect(sharedProposalSource).not.toMatch(/apply_extract_writeback_proposal/);
    expect(sharedProposalSource).not.toMatch(/status: 'rejected'/);
  });

  it('calls ensure after runPhase0DocumentExtract and before processing_status extracted', () => {
    const triggerFn = documentCollectionSource.match(
      /async function triggerCollectionExtract\([\s\S]*?\n\}/,
    )?.[0];
    expect(triggerFn).toBeTruthy();
    expect(triggerFn).toMatch(
      /await runPhase0DocumentExtract\([\s\S]*?await ensureExtractWritebackProposals\([\s\S]*?processing_status:\s*'extracted'/,
    );
    // Failure isolation: the ensure call is wrapped and logs ids/counts only.
    expect(triggerFn).toMatch(/try \{\s*const ensured = await ensureExtractWritebackProposals/);
    expect(triggerFn).toMatch(/Proposal ensure failed/);
    const ensureLog = triggerFn?.match(/Proposals ensured[\s\S]*?\}\);/)?.[0] ?? '';
    expect(ensureLog).not.toMatch(/filename|snapshot|account_name/);
  });

  it('writes token_id into the document_uploaded audit row', () => {
    const portalUploadFn = documentCollectionSource.match(
      /async function portalUpload\([\s\S]*?\n\}/,
    )?.[0];
    expect(portalUploadFn).toBeTruthy();
    expect(portalUploadFn).toMatch(
      /action:\s*'document_uploaded'[\s\S]*?new_value:\s*\{[^}]*token_id:\s*tokenValidation\.token_id/,
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

  it('requires is_staff for process_collection_upload', () => {
    expect(documentCollectionSource).toMatch(/assertStaffAccess/);
    expect(documentCollectionSource).toMatch(/caller\.rpc\('is_staff'\)/);
    expect(documentCollectionSource).toMatch(/Staff access required/);
    expect(documentCollectionSource).toMatch(/status:\s*403/);
  });

  it('schedules portal extract via waitUntil or await, not a dangling promise', () => {
    expect(documentCollectionSource).toMatch(/scheduleBackgroundWork/);
    expect(documentCollectionSource).toMatch(/EdgeRuntime\.waitUntil/);
    expect(documentCollectionSource).toMatch(
      /await scheduleBackgroundWork\(\s*triggerCollectionExtract/,
    );
    expect(documentCollectionSource).not.toMatch(
      /triggerCollectionExtract\([\s\S]*?\)\.catch\(/,
    );
  });

  it('denormalizes snapshot columns in phase0Extract shared module', () => {
    expect(phase0ExtractSource).toMatch(/denormalizeExtractSnapshotColumns/);
    expect(phase0ExtractSource).toMatch(/policy_number: denormalized\.policy_number/);
    expect(phase0ExtractSource).toMatch(/effective_date: denormalized\.effective_date/);
    expect(phase0ExtractSource).toMatch(/expiration_date: denormalized\.expiration_date/);
    expect(phase0ExtractSource).toMatch(/insured_name: denormalized\.insured_name/);
  });

  it('always mints a portal token on create_packet without recipient gate', () => {
    const createPacketFn = documentCollectionSource.match(
      /async function createPacket\([\s\S]*?\n\}/,
    )?.[0];
    expect(createPacketFn).toBeTruthy();
    expect(createPacketFn).toMatch(/generate_collection_token/);
    expect(createPacketFn).not.toMatch(/if\s*\(\s*recipient_email\s*\|\|\s*recipient_name\s*\)/);
    expect(createPacketFn).toMatch(/PUBLIC_SITE_URL.*lewisinsurance\.ai/s);
  });

  it('sendReminder returns logged semantics, not sent', () => {
    const sendReminderFn = documentCollectionSource.match(
      /async function sendReminder\([\s\S]*?\n\}/,
    )?.[0];
    expect(sendReminderFn).toBeTruthy();
    expect(sendReminderFn).toMatch(/logged:\s*true/);
    expect(sendReminderFn).toMatch(/logged:\s*false/);
    expect(sendReminderFn).not.toMatch(/sent:\s*true/);
  });
});

import { describe, it, expect } from 'vitest';
import {
  buildPhase0ExtractParams,
  collectionUploadStatusOnExtractFailure,
  collectionUploadStatusOnExtractSuccess,
  collectionUploadStatusOnExtractStart,
} from '@/lib/collectionExtract';

describe('collectionExtract helpers', () => {
  it('passes account_id through to Phase 0 extract params', () => {
    const accountId = 'acct-1111-2222-3333-444455556666';
    const params = buildPhase0ExtractParams({
      documentId: 'doc-aaaa-bbbb-cccc-dddddddddddd',
      uploadId: 'upload-eeee-ffff-0000-111111111111',
      accountId,
      filename: 'loss-run.pdf',
      createdBy: null,
    });

    expect(params.accountId).toBe(accountId);
    expect(params.documentId).toBe('doc-aaaa-bbbb-cccc-dddddddddddd');
    expect(params.fileName).toBe('loss-run.pdf');
    expect(params.createdBy).toBeNull();
  });

  it('maps successful extract to extracted status', () => {
    expect(collectionUploadStatusOnExtractSuccess()).toEqual({
      processing_status: 'extracted',
    });
  });

  it('maps failed extract to failed status with error message', () => {
    expect(collectionUploadStatusOnExtractFailure('Azure OCR failed')).toEqual({
      processing_status: 'failed',
      processing_error: 'Azure OCR failed',
    });
  });

  it('maps extract start to processing status', () => {
    expect(collectionUploadStatusOnExtractStart()).toEqual({
      processing_status: 'processing',
    });
  });

  it('does not mark failed extract as extracted', () => {
    const failed = collectionUploadStatusOnExtractFailure('timeout');
    const success = collectionUploadStatusOnExtractSuccess();
    expect(failed.processing_status).not.toBe(success.processing_status);
    expect(failed.processing_status).toBe('failed');
  });
});

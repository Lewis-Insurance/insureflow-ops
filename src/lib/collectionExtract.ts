export type CollectionUploadProcessingStatus =
  | 'pending'
  | 'processing'
  | 'extracted'
  | 'failed';

export interface CollectionExtractParams {
  documentId: string;
  uploadId: string;
  accountId: string;
  filename: string;
  createdBy: string | null;
}

export interface Phase0ExtractParams {
  documentId: string;
  fileName: string;
  accountId: string;
  createdBy: string | null;
}

export function buildPhase0ExtractParams(
  input: CollectionExtractParams,
): Phase0ExtractParams {
  return {
    documentId: input.documentId,
    fileName: input.filename,
    accountId: input.accountId,
    createdBy: input.createdBy,
  };
}

export function collectionUploadStatusOnExtractSuccess(): {
  processing_status: 'extracted';
} {
  return { processing_status: 'extracted' };
}

export function collectionUploadStatusOnExtractFailure(errorMessage: string): {
  processing_status: 'failed';
  processing_error: string;
} {
  return {
    processing_status: 'failed',
    processing_error: errorMessage,
  };
}

export function collectionUploadStatusOnExtractStart(): {
  processing_status: 'processing';
} {
  return { processing_status: 'processing' };
}

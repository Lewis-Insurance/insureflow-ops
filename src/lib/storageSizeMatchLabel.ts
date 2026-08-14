export type StorageSizeMatchStatus =
  | 'download_failed'
  | 'db_size_missing'
  | 'mismatch'
  | 'match';

export type StorageSizeMatchTone = 'destructive' | 'warning' | 'success';

export interface StorageSizeMatchResult {
  status: StorageSizeMatchStatus;
  label: string;
  tone: StorageSizeMatchTone;
}

function isDbSizeMissing(dbSize: number | null | undefined): boolean {
  return dbSize == null || dbSize === 0;
}

export function storageSizeMatchLabel(
  dbSize: number | null | undefined,
  storageSize: number | null | undefined,
  options?: { downloadFailed?: boolean },
): StorageSizeMatchResult {
  if (options?.downloadFailed || storageSize == null) {
    return {
      status: 'download_failed',
      label: 'Could not read file from storage',
      tone: 'destructive',
    };
  }

  if (isDbSizeMissing(dbSize) && storageSize > 0) {
    return {
      status: 'db_size_missing',
      label: 'Size missing in the record',
      tone: 'warning',
    };
  }

  if (!isDbSizeMissing(dbSize) && dbSize !== storageSize) {
    return {
      status: 'mismatch',
      label: 'Size mismatch',
      tone: 'warning',
    };
  }

  return {
    status: 'match',
    label: 'Match: sizes agree',
    tone: 'success',
  };
}

import { describe, it, expect } from 'vitest';
import { storageSizeMatchLabel } from '@/lib/storageSizeMatchLabel';

describe('storageSizeMatchLabel', () => {
  it('returns download_failed when downloadFailed is true', () => {
    const result = storageSizeMatchLabel(1024, 1024, { downloadFailed: true });
    expect(result).toEqual({
      status: 'download_failed',
      label: 'Could not read file from storage',
      tone: 'destructive',
    });
  });

  it('returns download_failed when storage size is null or undefined', () => {
    expect(storageSizeMatchLabel(1024, null)).toEqual({
      status: 'download_failed',
      label: 'Could not read file from storage',
      tone: 'destructive',
    });
    expect(storageSizeMatchLabel(1024, undefined)).toEqual({
      status: 'download_failed',
      label: 'Could not read file from storage',
      tone: 'destructive',
    });
  });

  it('returns db_size_missing when DB size is null or 0 and storage has content', () => {
    expect(storageSizeMatchLabel(null, 2048)).toEqual({
      status: 'db_size_missing',
      label: 'Size missing in the record',
      tone: 'warning',
    });
    expect(storageSizeMatchLabel(0, 4096)).toEqual({
      status: 'db_size_missing',
      label: 'Size missing in the record',
      tone: 'warning',
    });
    expect(storageSizeMatchLabel(undefined, 512)).toEqual({
      status: 'db_size_missing',
      label: 'Size missing in the record',
      tone: 'warning',
    });
  });

  it('returns mismatch when both sizes are present and differ', () => {
    expect(storageSizeMatchLabel(1000, 2000)).toEqual({
      status: 'mismatch',
      label: 'Size mismatch',
      tone: 'warning',
    });
    expect(storageSizeMatchLabel(1000, 0)).toEqual({
      status: 'mismatch',
      label: 'Size mismatch',
      tone: 'warning',
    });
  });

  it('returns match when sizes agree', () => {
    expect(storageSizeMatchLabel(1024, 1024)).toEqual({
      status: 'match',
      label: 'Match: sizes agree',
      tone: 'success',
    });
    expect(storageSizeMatchLabel(null, 0)).toEqual({
      status: 'match',
      label: 'Match: sizes agree',
      tone: 'success',
    });
    expect(storageSizeMatchLabel(0, 0)).toEqual({
      status: 'match',
      label: 'Match: sizes agree',
      tone: 'success',
    });
    expect(storageSizeMatchLabel(undefined, 0)).toEqual({
      status: 'match',
      label: 'Match: sizes agree',
      tone: 'success',
    });
  });
});

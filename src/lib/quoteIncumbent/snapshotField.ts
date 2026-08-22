import type {
  ComparisonCategory,
  FieldType,
  NormalizedValue,
  SnapshotField,
} from '@/types/coverage-comparison';
import { getDisplayValue, normalizeValue } from '@/services/comparison/normalization';

export function makeSnapshotField(
  fieldName: string,
  rawValue: string | null,
  fieldType: FieldType,
  category: ComparisonCategory,
): SnapshotField {
  const normalizedValue: NormalizedValue =
    rawValue === null || rawValue.trim() === ''
      ? { type: 'not_found' }
      : normalizeValue(rawValue, fieldType);

  const displayValue =
    rawValue === null || rawValue.trim() === ''
      ? 'Not found'
      : getDisplayValue(normalizedValue);

  return {
    fieldName,
    fieldType,
    category,
    rawValue,
    normalizedValue,
    displayValue,
    status: rawValue ? 'AUTO_APPLIED' : 'NOT_FOUND',
    confidenceRaw: rawValue ? 1 : 0,
    confidenceCalibrated: rawValue ? 1 : 0,
    validations: [],
    evidenceIds: [],
    primaryEvidenceId: null,
    isConflict: false,
    isEndorsementOverride: false,
  };
}

export function makeBooleanSnapshotField(
  fieldName: string,
  value: boolean | null | undefined,
  category: ComparisonCategory,
  labels?: { true: string; false: string },
): SnapshotField {
  if (value === null || value === undefined) {
    return makeSnapshotField(fieldName, null, 'boolean', category);
  }
  const raw = value ? labels?.true ?? 'yes' : labels?.false ?? 'no';
  return makeSnapshotField(fieldName, raw, 'boolean', category);
}

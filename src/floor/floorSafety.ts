export interface FloorSafetyResult {
  ok: boolean;
  reason?: string;
}

const SSN_PATTERN = /\b(?:\d{3}-\d{2}-\d{4}|\d{9})\b/;
const DOB_OR_DLN_LABEL_PATTERN = /\b(?:date\s+of\s+birth|dob|driver'?s?\s+license|dln)\b/i;
const RAW_UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const SIGNED_STORAGE_URL_PATTERN = /(?:storage\/v1\/object\/(?:sign|public)|supabase\.co\/storage)/i;

export function validateFloorMessageForModel(message: string): FloorSafetyResult {
  if (SSN_PATTERN.test(message) || DOB_OR_DLN_LABEL_PATTERN.test(message)) {
    return {
      ok: false,
      reason:
        'Blocked before model: SSN, DOB, and driver-license data cannot be pasted into agent chat. Use the secure client field/document flow instead.',
    };
  }

  if (SIGNED_STORAGE_URL_PATTERN.test(message) || RAW_UUID_PATTERN.test(message)) {
    return {
      ok: false,
      reason:
        'Blocked before model: raw database refs, UUIDs, storage paths, and signed-document URLs must be handled as opaque context refs.',
    };
  }

  return { ok: true };
}

export function containsUnsafeFloorPayload(value: string): boolean {
  return (
    SSN_PATTERN.test(value) ||
    DOB_OR_DLN_LABEL_PATTERN.test(value) ||
    RAW_UUID_PATTERN.test(value) ||
    SIGNED_STORAGE_URL_PATTERN.test(value)
  );
}

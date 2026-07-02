export const FLOOR_FEEDBACK_VERBS = [
  'approve',
  'edit',
  'kill',
  'release',
  'send_success',
  'send_failure',
  'card_created',
] as const;

export type FloorFeedbackVerb = (typeof FLOOR_FEEDBACK_VERBS)[number];

export function isFloorFeedbackVerb(value: string): value is FloorFeedbackVerb {
  return (FLOOR_FEEDBACK_VERBS as readonly string[]).includes(value);
}

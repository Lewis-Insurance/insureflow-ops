export const AI_RESULTS_SMS_DISABLED_REASON =
  'AI-result to SMS is disabled until the Floor approval gate mints and verifies an exact-artifact action token.';

export function isAiResultsSmsActionEnabled(): false {
  return false;
}

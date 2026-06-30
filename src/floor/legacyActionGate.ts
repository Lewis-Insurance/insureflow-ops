export const AI_RESULTS_CLIENT_SEND_DISABLED_REASON =
  'AI-result client sends are disabled until the Floor approval gate can mint and verify an exact-artifact action token.';

export const AI_RESULTS_SMS_DISABLED_REASON = AI_RESULTS_CLIENT_SEND_DISABLED_REASON;

export const AI_RESULTS_EMAIL_DISABLED_REASON = AI_RESULTS_CLIENT_SEND_DISABLED_REASON;

export function isAiResultsSmsActionEnabled(): false {
  return false;
}

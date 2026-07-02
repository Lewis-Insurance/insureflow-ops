const KELLI_DEV_OWNER_ID = 'e321fae3-f28b-4170-8316-9460cb9eb2fc';
const LETITIA_DEV_OWNER_ID = 'd20dd72e-5dc6-4004-8729-842ea9c16b88';

/** Dev default gap-roundout owner — Kelli Lee on dev Supabase. Override with FLOOR_GAP_ROUNTOUT_OWNER_ID. */
export function resolveGapRoundoutOwnerId(): string {
  return Deno.env.get('FLOOR_GAP_ROUNTOUT_OWNER_ID')?.trim() || KELLI_DEV_OWNER_ID;
}

/** Dev default open-item nudge owner — Kelli on personal-lines quotes. Override with FLOOR_OPEN_ITEM_NUDGE_OWNER_ID. */
export function resolveOpenItemNudgeOwnerId(): string {
  return Deno.env.get('FLOOR_OPEN_ITEM_NUDGE_OWNER_ID')?.trim() || KELLI_DEV_OWNER_ID;
}

/** Dev default non-pay watch owner — Letitia Lewis on dev. Override with FLOOR_NONPAY_WATCH_OWNER_ID. */
export function resolveNonpayWatchOwnerId(): string {
  return Deno.env.get('FLOOR_NONPAY_WATCH_OWNER_ID')?.trim() || LETITIA_DEV_OWNER_ID;
}

const KELLI_DEV_OWNER_ID = 'e321fae3-f28b-4170-8316-9460cb9eb2fc';

/** Dev default gap-roundout owner — Kelli Lee on dev Supabase. Override with FLOOR_GAP_ROUNTOUT_OWNER_ID. */
export function resolveGapRoundoutOwnerId(): string {
  return Deno.env.get('FLOOR_GAP_ROUNTOUT_OWNER_ID')?.trim() || KELLI_DEV_OWNER_ID;
}

/** Dev default open-item nudge owner — Kelli on personal-lines quotes. Override with FLOOR_OPEN_ITEM_NUDGE_OWNER_ID. */
export function resolveOpenItemNudgeOwnerId(): string {
  return Deno.env.get('FLOOR_OPEN_ITEM_NUDGE_OWNER_ID')?.trim() || KELLI_DEV_OWNER_ID;
}

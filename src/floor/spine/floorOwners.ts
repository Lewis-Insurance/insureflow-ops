const KELLI_DEV_OWNER_ID = 'e321fae3-f28b-4170-8316-9460cb9eb2fc';

function readEnv(name: string): string | undefined {
  const fromDeno = typeof Deno !== 'undefined' ? Deno.env.get(name)?.trim() : undefined;
  const fromNode = typeof process !== 'undefined' ? process.env[name]?.trim() : undefined;
  return fromDeno || fromNode || undefined;
}

/** Dev default gap-roundout owner — Kelli Lee on dev Supabase. Override with FLOOR_GAP_ROUNTOUT_OWNER_ID. */
export function resolveGapRoundoutOwnerId(): string {
  return readEnv('FLOOR_GAP_ROUNTOUT_OWNER_ID') ?? KELLI_DEV_OWNER_ID;
}

/** Dev default open-item nudge owner — Kelli on personal-lines quotes. Override with FLOOR_OPEN_ITEM_NUDGE_OWNER_ID. */
export function resolveOpenItemNudgeOwnerId(): string {
  return readEnv('FLOOR_OPEN_ITEM_NUDGE_OWNER_ID') ?? KELLI_DEV_OWNER_ID;
}

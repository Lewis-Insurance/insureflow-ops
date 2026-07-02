/** Dev default gap-roundout owner — Kelli Lee on dev Supabase. Override with FLOOR_GAP_ROUNTOUT_OWNER_ID. */
export function resolveGapRoundoutOwnerId(): string {
  const fromEnv =
    typeof Deno !== 'undefined'
      ? Deno.env.get('FLOOR_GAP_ROUNTOUT_OWNER_ID')?.trim()
      : process.env.FLOOR_GAP_ROUNTOUT_OWNER_ID?.trim();
  if (fromEnv) return fromEnv;
  return 'e321fae3-f28b-4170-8316-9460cb9eb2fc';
}

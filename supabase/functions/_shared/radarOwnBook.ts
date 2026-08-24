import { normalizeEntity } from "./radarIngest.ts";

export type RadarOwnBookRow = {
  policy_number: string | null;
  carrier: string | null;
  normalized_employer_name: string | null;
  fein: string | null;
};

export type RadarOwnBookKeys = {
  policies: Set<string>;
  entities: Set<string>;
};

export function radarOwnBookKeys(rows: unknown): RadarOwnBookKeys {
  if (!Array.isArray(rows)) throw new Error("Radar own-book RPC returned an invalid payload");

  const policies = new Set<string>();
  const entities = new Set<string>();
  for (const value of rows) {
    if (!value || typeof value !== "object") throw new Error("Radar own-book RPC returned an invalid row");
    const row = value as Partial<RadarOwnBookRow>;
    const policyKey = `${normalizeEntity(row.policy_number)}:${normalizeEntity(row.carrier)}`;
    if (policyKey !== ":") policies.add(policyKey);
    if (row.fein) {
      entities.add(`${normalizeEntity(row.normalized_employer_name)}:${String(row.fein).replace(/\D/g, "")}`);
    }
  }
  return { policies, entities };
}

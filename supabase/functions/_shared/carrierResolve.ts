/**
 * Carrier-name cleaning + canonical resolution.
 *
 * The extraction models emit the carrier name exactly as printed on the
 * document, which frequently includes an AM Best rating suffix and/or a
 * descriptive parenthetical, e.g.
 *
 *   "Security National Insurance Company (a member of AmTrust Financial Group) A- (Excellent) XV"
 *
 * The canonical `resolve_carrier(p_raw)` Postgres RPC does exact -> alias ->
 * normalized matching against the agency `carriers` table, but it only matches
 * a clean company name. So we clean the raw string BEFORE resolving.
 *
 * `resolveCarrier` uses the SERVICE ROLE supabase client passed in by the
 * caller (the extractors), so the `authenticated`-granted RPC is reachable.
 * It NEVER throws: any failure returns null and the caller falls back to the
 * cleaned (or raw) name. This keeps carrier resolution off the critical path.
 */

/**
 * Strip rating suffixes and descriptor parentheticals from a raw carrier name.
 * Returns the cleaned company name, or null when the input is empty.
 *
 * Proven cases (must hold):
 *   "Security National Insurance Company (a member of AmTrust Financial Group) A- (Excellent) XV"
 *     -> "Security National Insurance Company"
 *   "Security National Insurance Company" -> unchanged
 */
export function cleanCarrierName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  // Strip a trailing AM Best rating, e.g. "A- (Excellent) XV", "A+ (Superior) XV".
  s = s.replace(
    /\s+[A-F][+-]{0,2}\s*\((?:Superior|Excellent|Good|Fair|Marginal|Weak|Poor)\)\s*[IVXL]+\s*$/i,
    '',
  );
  // Strip a trailing descriptor parenthetical, e.g. "(a member of AmTrust Financial Group)".
  s = s.replace(
    /\s*\((?:a\s+)?(?:member|part|subsidiary|division|unit)\s+of[^)]*\)\s*$/i,
    '',
  );
  // Strip any remaining single trailing parenthetical.
  s = s.replace(/\s*\([^)]*\)\s*$/, '');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s || null;
}

export interface CarrierResolution {
  carrier_id: string;
  carrier_name: string;
  naic: string | null;
  match_type: string;
}

/**
 * Clean `raw`, then resolve it to a canonical carrier via `resolve_carrier`.
 * Returns null when the name is empty, the RPC errors, or nothing matches.
 * Guaranteed not to throw.
 */
export async function resolveCarrier(
  supabase: any,
  raw: string | null | undefined,
): Promise<CarrierResolution | null> {
  const cleaned = cleanCarrierName(raw);
  if (!cleaned) return null;
  try {
    const { data, error } = await supabase.rpc('resolve_carrier', { p_raw: cleaned });
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const m = data[0];
    if (!m || !m.carrier_id) return null;
    return {
      carrier_id: m.carrier_id,
      // carriers.name has stray leading spaces in the data - trim.
      carrier_name: (m.carrier_name || '').trim(),
      naic: m.naic ?? null,
      match_type: m.match_type,
    };
  } catch (_e) {
    // Resolution must never break extraction.
    return null;
  }
}

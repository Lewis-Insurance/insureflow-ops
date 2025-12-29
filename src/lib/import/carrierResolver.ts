import { supabase } from '@/integrations/supabase/client';

/**
 * Carrier name mapping from common variations to canonical names
 */
const CARRIER_NAME_ALIASES: Record<string, string[]> = {
  'Progressive': ['Progressive', 'PROGRESSIVE', 'progressive'],
  'Auto-Owners': ['Auto-Owners', 'Auto Owners', 'AutoOwners', 'AUTO-OWNERS', 'auto-owners'],
  'American Integrity': ['American Integrity', 'AIUS', 'American Integrity Insurance'],
  'Universal Property': ['Universal', 'Universal Property', 'UPCIC', 'Universal Property & Casualty'],
  'Heritage': ['Heritage', 'Heritage Insurance', 'Heritage Property'],
  'GEICO': ['GEICO', 'Geico', 'geico', 'Government Employees Insurance'],
  'Coterie': ['Coterie', 'COTERIE', 'coterie'],
  'Attune': ['Attune', 'ATTUNE', 'attune'],
  'Nationwide': ['Nationwide', 'NATIONWIDE', 'nationwide'],
  'State Farm': ['State Farm', 'StateFarm', 'STATE FARM'],
  'Allstate': ['Allstate', 'ALLSTATE', 'All State'],
  'Liberty Mutual': ['Liberty Mutual', 'Liberty', 'LIBERTY MUTUAL'],
  'Travelers': ['Travelers', 'TRAVELERS', 'The Travelers'],
  'Hartford': ['Hartford', 'The Hartford', 'HARTFORD'],
  'Chubb': ['Chubb', 'CHUBB', 'ACE Chubb'],
  'Citizens': ['Citizens', 'Citizens Property', 'CPIC'],
  'Safeco': ['Safeco', 'SAFECO'],
  'Mercury': ['Mercury', 'Mercury Insurance'],
  'Kemper': ['Kemper', 'KEMPER', 'Kemper Insurance'],
  'Foremost': ['Foremost', 'FOREMOST', 'Foremost Insurance'],
};

/**
 * Build a reverse lookup map from aliases to canonical names
 */
function buildAliasMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(CARRIER_NAME_ALIASES)) {
    for (const alias of aliases) {
      map.set(alias.toLowerCase(), canonical);
    }
  }
  return map;
}

const aliasMap = buildAliasMap();

/**
 * Carrier cache to avoid repeated database lookups
 */
interface CarrierRecord {
  id: string;
  name: string;
}

let carrierCache: Map<string, CarrierRecord> | null = null;

/**
 * Load all carriers into cache
 */
async function loadCarrierCache(): Promise<Map<string, CarrierRecord>> {
  if (carrierCache) return carrierCache;

  const { data, error } = await supabase
    .from('carriers')
    .select('id, name');

  if (error) {
    console.error('Failed to load carriers:', error);
    carrierCache = new Map();
    return carrierCache;
  }

  carrierCache = new Map();
  for (const carrier of data || []) {
    // Store by lowercase name for case-insensitive lookup
    carrierCache.set(carrier.name.toLowerCase(), carrier);
  }

  return carrierCache;
}

/**
 * Clear the carrier cache (call after creating new carriers)
 */
export function clearCarrierCache(): void {
  carrierCache = null;
}

/**
 * Normalize carrier name using alias map
 */
export function normalizeCarrierName(name: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  const canonical = aliasMap.get(trimmed.toLowerCase());
  return canonical || trimmed;
}

/**
 * Find carrier by name (case-insensitive)
 */
export async function findCarrierByName(name: string): Promise<CarrierRecord | null> {
  const cache = await loadCarrierCache();
  const normalized = normalizeCarrierName(name);

  // Try exact match first (case-insensitive)
  const carrier = cache.get(normalized.toLowerCase());
  if (carrier) return carrier;

  // Try original name
  const originalMatch = cache.get(name.toLowerCase());
  if (originalMatch) return originalMatch;

  return null;
}

/**
 * Create a new carrier
 */
export async function createCarrier(name: string): Promise<CarrierRecord | null> {
  const normalized = normalizeCarrierName(name);

  const { data, error } = await supabase
    .from('carriers')
    .insert({ name: normalized })
    .select('id, name')
    .single();

  if (error) {
    console.error('Failed to create carrier:', error);
    return null;
  }

  // Clear cache so it picks up the new carrier
  clearCarrierCache();

  return data;
}

/**
 * Get or create carrier by name
 * Returns the carrier ID
 */
export async function getOrCreateCarrier(name: string): Promise<string | null> {
  if (!name) return null;

  // First try to find existing
  const existing = await findCarrierByName(name);
  if (existing) return existing.id;

  // Create new carrier
  const created = await createCarrier(name);
  return created?.id || null;
}

/**
 * Batch resolve carriers
 * Takes an array of carrier names and returns a map of name -> carrier_id
 */
export async function resolveCarriers(
  carrierNames: string[]
): Promise<{ resolved: Map<string, string>; created: string[]; failed: string[] }> {
  const uniqueNames = [...new Set(carrierNames.filter(Boolean))];
  const resolved = new Map<string, string>();
  const created: string[] = [];
  const failed: string[] = [];

  // Load cache once
  await loadCarrierCache();

  for (const name of uniqueNames) {
    try {
      let carrier = await findCarrierByName(name);

      if (!carrier) {
        // Create new carrier
        carrier = await createCarrier(name);
        if (carrier) {
          created.push(name);
        }
      }

      if (carrier) {
        // Store mapping for both original and normalized name
        resolved.set(name, carrier.id);
        const normalized = normalizeCarrierName(name);
        if (normalized !== name) {
          resolved.set(normalized, carrier.id);
        }
      } else {
        failed.push(name);
      }
    } catch (err) {
      console.error(`Failed to resolve carrier "${name}":`, err);
      failed.push(name);
    }
  }

  return { resolved, created, failed };
}

/**
 * Get all known carrier aliases for display/documentation
 */
export function getKnownCarrierAliases(): Record<string, string[]> {
  return { ...CARRIER_NAME_ALIASES };
}

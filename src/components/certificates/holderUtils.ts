// Shared, component-free helpers for the certificate generator holder + operations
// fields. Kept out of the component files so react-refresh (Fast Refresh) sees
// those files export only components.

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { ACORD25_FIELD_MAP } from '@/lib/acord/acord25/fieldMap';

/** The holder slice held in the generator state. */
export interface SelectedHolder {
  id: string;
  name: string;
  addressBlock: string;
}

/** Compose a multi-line US address block from split fields; empty pieces dropped. */
export function composeAddressBlock(parts: {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}): string {
  const lines: string[] = [];
  if (parts.address_line1?.trim()) lines.push(parts.address_line1.trim());
  if (parts.address_line2?.trim()) lines.push(parts.address_line2.trim());
  const cityState = [parts.city?.trim(), parts.state?.trim()]
    .filter((s): s is string => !!s && s.length > 0)
    .join(', ');
  const tail = [cityState, parts.zip_code?.trim()]
    .filter((s): s is string => !!s && s.length > 0)
    .join(' ');
  if (tail.length > 0) lines.push(tail);
  return lines.join('\n');
}

/**
 * Fetch a full additional_insureds row by id. The table is not in the generated
 * Supabase types (drift), so the .from() target is cast, matching
 * useAdditionalInsureds.ts. RLS (is_staff() + workspace membership) applies.
 */
export async function fetchHolderById(id: string): Promise<SelectedHolder | null> {
  const { data, error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('additional_insureds' as any)
    .select('id, name, address_line1, address_line2, city, state, zip_code')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logger.warn('holder lookup by id failed', { id, error });
    return null;
  }
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    name: string;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
  };
  return {
    id: row.id,
    name: row.name,
    addressBlock: composeAddressBlock(row),
  };
}

/**
 * Soft character limit for the printed Description of operations box, from the
 * single fieldMap source (05). Falls back defensively if the entry is absent.
 */
export const OPERATIONS_SOFT_CHAR_LIMIT: number =
  ACORD25_FIELD_MAP.descriptionOfOperations?.softCharLimit ?? 640;

/**
 * Compose the printed text exactly as buildAcord25FieldValues does (Section 4.6):
 * remarks are joined under the description separated by a blank line; a lone
 * description prints alone. The counter measures this composed string.
 */
export function composePrintedOperations(
  descriptionOfOperations: string,
  remarks: string,
): string {
  const doo = (descriptionOfOperations ?? '').trim();
  const rem = (remarks ?? '').trim();
  return rem.length > 0 ? `${doo}\n\n${rem}` : doo;
}

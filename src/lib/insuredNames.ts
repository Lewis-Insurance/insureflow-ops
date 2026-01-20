/**
 * Helper library for formatting and parsing named insured information
 * Supports individuals, trusts, and estates
 */

export type EntityType = 'trust' | 'estate' | null;

export interface InsuredNameParts {
  personName: string | null;
  entityType: EntityType;
  entityName: string | null;
  trusteeName: string | null;
}

/**
 * Format insured name parts for display
 *
 * @example
 * // Individual only
 * formatInsuredDisplay({ personName: "Brian Lewis", entityType: null, entityName: null, trusteeName: null })
 * // → "Brian Lewis"
 *
 * // Trust only
 * formatInsuredDisplay({ personName: null, entityType: "trust", entityName: "The Smith Trust", trusteeName: "John Smith, Trustee" })
 * // → "The Smith Trust, John Smith, Trustee"
 *
 * // Person AND Trust
 * formatInsuredDisplay({ personName: "Brian Lewis", entityType: "trust", entityName: "The Lewis Living Trust", trusteeName: null })
 * // → "Brian Lewis AND The Lewis Living Trust"
 */
export function formatInsuredDisplay(parts: InsuredNameParts): string {
  const segments: string[] = [];

  // Add person name if present
  if (parts.personName) {
    segments.push(parts.personName);
  }

  // Add entity if present
  if (parts.entityName) {
    let entityDisplay = parts.entityName;
    if (parts.trusteeName) {
      entityDisplay += `, ${parts.trusteeName}`;
    }
    segments.push(entityDisplay);
  }

  return segments.join(' AND ') || 'Unknown';
}

/**
 * Detect if a raw insured name string contains a trust or estate
 *
 * @example
 * detectEntityFromName("The Smith Family Trust")
 * // → { personName: null, entityType: "trust", entityName: "The Smith Family Trust", trusteeName: null }
 *
 * detectEntityFromName("Estate of John Smith")
 * // → { personName: null, entityType: "estate", entityName: "Estate of John Smith", trusteeName: null }
 *
 * detectEntityFromName("Brian Lewis")
 * // → { personName: "Brian Lewis", entityType: null, entityName: null, trusteeName: null }
 */
export function detectEntityFromName(raw: string): InsuredNameParts {
  const trimmed = raw.trim();

  // Trust patterns - common trust naming conventions
  const trustPatterns = [
    /^the\s+.+\s+(living|family|revocable|irrevocable)\s+trust/i,
    /\s+trust\s*(dated|dtd|u\/a\/d|u\/a|$)/i,
    /\s+(living|family|revocable|irrevocable)\s+trust$/i,
    /^.+\s+trust$/i, // Ends with "trust"
  ];

  // Estate patterns
  const estatePatterns = [
    /^(the\s+)?estate\s+of\s+/i,
  ];

  // Check for trust patterns
  for (const pattern of trustPatterns) {
    if (pattern.test(trimmed)) {
      return {
        personName: null,
        entityType: 'trust',
        entityName: trimmed,
        trusteeName: null,
      };
    }
  }

  // Check for estate patterns
  for (const pattern of estatePatterns) {
    if (pattern.test(trimmed)) {
      return {
        personName: null,
        entityType: 'estate',
        entityName: trimmed,
        trusteeName: null,
      };
    }
  }

  // Default to individual
  return {
    personName: trimmed,
    entityType: null,
    entityName: null,
    trusteeName: null,
  };
}

/**
 * Parse a compound insured name that may contain both person and entity
 * Handles patterns like "Brian Lewis AND The Brian Lewis Living Trust"
 *
 * @example
 * parseCompoundInsuredName("Brian Lewis AND The Brian Lewis Living Trust")
 * // → { personName: "Brian Lewis", entityType: "trust", entityName: "The Brian Lewis Living Trust", trusteeName: null }
 */
export function parseCompoundInsuredName(raw: string): InsuredNameParts {
  const trimmed = raw.trim();

  // Check for "AND" separator (case insensitive)
  const andParts = trimmed.split(/\s+AND\s+/i);

  if (andParts.length === 2) {
    const firstPart = detectEntityFromName(andParts[0]);
    const secondPart = detectEntityFromName(andParts[1]);

    // Person first, then entity
    if (firstPart.personName && secondPart.entityType) {
      return {
        personName: firstPart.personName,
        entityType: secondPart.entityType,
        entityName: secondPart.entityName,
        trusteeName: null,
      };
    }

    // Entity first, then person (less common but possible)
    if (firstPart.entityType && secondPart.personName) {
      return {
        personName: secondPart.personName,
        entityType: firstPart.entityType,
        entityName: firstPart.entityName,
        trusteeName: null,
      };
    }
  }

  // No AND separator or both parts same type - use simple detection
  return detectEntityFromName(trimmed);
}

/**
 * Check if an account has any trust/estate entity
 */
export function hasEntity(
  primaryEntityType: EntityType,
  primaryEntityName: string | null,
  secondaryEntityType?: EntityType,
  secondaryEntityName?: string | null
): boolean {
  return !!(
    (primaryEntityType && primaryEntityName) ||
    (secondaryEntityType && secondaryEntityName)
  );
}

/**
 * Get a label for the entity type
 */
export function getEntityTypeLabel(entityType: EntityType): string {
  switch (entityType) {
    case 'trust':
      return 'Trust';
    case 'estate':
      return 'Estate';
    default:
      return 'Individual';
  }
}

/**
 * SQL Input Sanitization Utilities
 *
 * Provides functions to safely sanitize user input before using in database queries
 * to prevent SQL injection attacks.
 */

/**
 * Sanitizes a string for use in SQL ILIKE queries by escaping special characters
 * that have special meaning in PostgreSQL pattern matching.
 *
 * @param input - The user-provided search string
 * @returns Sanitized string safe for use in ILIKE patterns
 *
 * @example
 * const userInput = "test%_input"; // Malicious input with wildcards
 * const safe = sanitizeForILike(userInput); // "test\\%\\_input"
 * query.ilike('column', `%${safe}%`); // Safe to use
 */
export function sanitizeForILike(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    // Escape backslashes first (must be first to avoid double-escaping)
    .replace(/\\/g, '\\\\')
    // Escape percent signs (% is wildcard for "any characters")
    .replace(/%/g, '\\%')
    // Escape underscores (_ is wildcard for "any single character")
    .replace(/_/g, '\\_')
    // Limit length to prevent DoS attacks
    .slice(0, 200);
}

/**
 * Sanitizes multiple fields for OR conditions in ILIKE queries
 *
 * @param searchTerm - The search term to sanitize
 * @param fields - Array of field names to search
 * @returns Sanitized OR condition string for Supabase
 *
 * @example
 * const condition = sanitizeMultiFieldSearch("john", ["first_name", "last_name", "email"]);
 * // Returns: "first_name.ilike.%john%,last_name.ilike.%john%,email.ilike.%john%"
 * query.or(condition);
 */
export function sanitizeMultiFieldSearch(searchTerm: string, fields: string[]): string {
  const likeEscaped = sanitizeForILike(searchTerm);
  // Double-quote the pattern for the PostgREST .or() grammar so commas and
  // parentheses in user input ("Smith, John") stay literal instead of breaking
  // the filter string into malformed conditions (a silent 400 -> empty results).
  // Inside a quoted value, backslash escapes itself and the double quote.
  const quoted = likeEscaped.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return fields.map(field => `${field}.ilike."%${quoted}%"`).join(',');
}

/**
 * Validates that a string doesn't contain SQL injection patterns
 * Returns true if the string appears safe, false if suspicious
 *
 * @param input - String to validate
 * @returns boolean indicating if input appears safe
 */
export function isSafeSQLInput(input: string): boolean {
  if (!input || typeof input !== 'string') {
    return true;
  }

  // Check for common SQL injection patterns
  const suspiciousPatterns = [
    /--/,           // SQL comments
    /;/,            // Statement terminator
    /\/\*/,         // Block comments
    /\bOR\b.*=.*=/i, // OR 1=1 type attacks
    /\bUNION\b/i,   // UNION attacks
    /\bDROP\b/i,    // DROP commands
    /\bDELETE\b/i,  // DELETE commands
    /\bINSERT\b/i,  // INSERT commands
    /\bUPDATE\b/i,  // UPDATE commands
    /\bEXEC\b/i,    // EXEC commands
    /\bSELECT\b.*\bFROM\b/i, // SELECT...FROM patterns
  ];

  return !suspiciousPatterns.some(pattern => pattern.test(input));
}

import { z } from 'zod';
import { COIPDFDataSchema } from '@/lib/pdfGenerator';

/**
 * Validate COI data before generation
 */
export const validateCOIData = (data: unknown): string[] => {
  const errors: string[] = [];

  try {
    // First validate against the schema
    COIPDFDataSchema.parse(data);

    // Additional business logic validation
    const coiData = data as z.infer<typeof COIPDFDataSchema>;

    // Validate dates
    const effectiveDate = new Date(coiData.effective_date);
    const expirationDate = new Date(coiData.expiration_date);

    if (isNaN(effectiveDate.getTime())) {
      errors.push('Invalid effective date');
    }

    if (isNaN(expirationDate.getTime())) {
      errors.push('Invalid expiration date');
    }

    if (effectiveDate >= expirationDate) {
      errors.push('Expiration date must be after effective date');
    }

    if (expirationDate < new Date()) {
      errors.push('Certificate has already expired');
    }

    // Validate coverage - at least one coverage type should be present
    const hasCoverage = Object.values(coiData.coverage_details || {}).some(
      value => value && (
        typeof value === 'object' 
          ? Object.values(value).some(v => v) 
          : Boolean(value)
      )
    );

    if (!hasCoverage) {
      errors.push('At least one coverage type is required');
    }

    // Validate certificate holder name length
    if (coiData.certificate_holder_name.length > 200) {
      errors.push('Certificate holder name must be less than 200 characters');
    }

    // Validate certificate number format (basic check)
    if (!/^[A-Z0-9-]+$/i.test(coiData.certificate_number)) {
      errors.push('Certificate number can only contain letters, numbers, and hyphens');
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      errors.push(...error.errors.map(e => `${e.path.join('.')}: ${e.message}`));
    } else {
      errors.push('Validation failed: ' + (error as Error).message);
    }
  }

  return errors;
};

/**
 * Sanitize email input
 */
export const sanitizeEmail = (email: string): string => {
  return email.trim().toLowerCase();
};

/**
 * Validate email format
 */
export const validateEmail = (email: string): boolean => {
  const emailSchema = z.string().email();
  return emailSchema.safeParse(email).success;
};

/**
 * Sanitize and validate recipient email
 */
export const validateRecipientEmail = (email: string): { valid: boolean; sanitized: string; error?: string } => {
  const sanitized = sanitizeEmail(email);
  
  if (!sanitized) {
    return { valid: false, sanitized: '', error: 'Email is required' };
  }

  if (!validateEmail(sanitized)) {
    return { valid: false, sanitized, error: 'Invalid email format' };
  }

  if (sanitized.length > 254) {
    return { valid: false, sanitized, error: 'Email must be less than 254 characters' };
  }

  return { valid: true, sanitized };
};
